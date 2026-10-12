-- ME:U(미유) 측정 — 방문 단계 기록(funnel_events), 구매 후 만족도(report_feedback), 주문의 유입 출처.
-- 앞의 마이그레이션 7개를 실행한 뒤, SQL Editor에서 이 파일을 한 번 실행한다. 기존 데이터는 바뀌지 않는다 (열을 더하고 표를 만들기만 한다).
--
-- 개인정보 원칙
-- - funnel_events에는 이름 · 생년월일 · 응답 · 고민 · 리포트 내용이 없다. 익명 방문 번호(쿠키), 화면 경로, 유입 출처(UTM · 리퍼러 도메인)만 담는다.
-- - 결제 · 구매 권한의 기준은 orders · reports(서버가 승인을 확인한 기록)이며, 이 표의 이벤트는 사용하지 않는다.
-- - 서버만 쓰고 읽는다. 브라우저 권한으로는 보이지 않는다. 쌓기만 하고 고치거나 지우지 않는다.

create table public.funnel_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- 쿠키에 담은 익명 방문 번호 (회원 번호가 아니다)
  anon_id text not null check (char_length(anon_id) between 8 and 64),
  -- 화면에서 보내는 단계만 허용한다 (결제 시작 · 승인 · 리포트 완성은 orders · reports에서 센다)
  name text not null check (name in ('visit', 'analyze_start', 'analyze_complete', 'preview_view', 'report_view')),
  path text check (path is null or char_length(path) <= 120),
  -- 처음 들어온 출처 (광고 · 채널 비교용)
  src text check (src is null or char_length(src) <= 60),
  medium text check (medium is null or char_length(medium) <= 60),
  campaign text check (campaign is null or char_length(campaign) <= 80),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 120)
);

create index funnel_events_created_idx on public.funnel_events (created_at desc);
create index funnel_events_name_created_idx on public.funnel_events (name, created_at desc);
create index funnel_events_anon_idx on public.funnel_events (anon_id, created_at desc);

create or replace function public.funnel_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'funnel events are append-only';
end;
$$;

create trigger funnel_events_no_update before update on public.funnel_events
  for each row execute function public.funnel_events_guard();

alter table public.funnel_events enable row level security;
revoke all on public.funnel_events from anon, authenticated;
grant select, insert on public.funnel_events to service_role;
grant usage, select on sequence public.funnel_events_id_seq to service_role;

-- 구매 후 만족도 — 리포트 하나에 한 사람이 하나 (다시 누르면 고친다)
create table public.report_feedback (
  id bigint generated always as identity primary key,
  report_id uuid not null unique references public.reports (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index report_feedback_created_idx on public.report_feedback (created_at desc);

create or replace function public.report_feedback_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.report_id <> old.report_id or new.user_id <> old.user_id then
    raise exception 'feedback identity fields are immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger report_feedback_guard_update before update on public.report_feedback
  for each row execute function public.report_feedback_guard();

-- 리포트의 주인만 남길 수 있다 (서버가 확인한 뒤 기록하고, DB도 한 번 더 확인한다)
create or replace function public.report_feedback_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.reports r where r.id = new.report_id and r.user_id = new.user_id and r.status = 'ready') then
    raise exception 'feedback only for the owner of a ready report';
  end if;
  return new;
end;
$$;

create trigger report_feedback_owner before insert on public.report_feedback
  for each row execute function public.report_feedback_owner_check();

alter table public.report_feedback enable row level security;
create policy report_feedback_select_own on public.report_feedback for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.report_feedback from anon, authenticated;
grant select on public.report_feedback to authenticated;
grant select, insert, update on public.report_feedback to service_role;
grant usage, select on sequence public.report_feedback_id_seq to service_role;

-- 주문의 유입 출처 (결제를 시작한 시점에 서버가 쿠키의 첫 방문 출처를 적는다). 매출을 광고 · 채널별로 나눠 볼 때 쓴다
alter table public.orders add column if not exists acq_source text check (acq_source is null or char_length(acq_source) <= 60);
alter table public.orders add column if not exists acq_medium text check (acq_medium is null or char_length(acq_medium) <= 60);
alter table public.orders add column if not exists acq_campaign text check (acq_campaign is null or char_length(acq_campaign) <= 80);

-- 지표 집계(기간별 주문 · 리포트)에 쓰는 색인
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists reports_ready_idx on public.reports (ready_at desc) where status = 'ready';
