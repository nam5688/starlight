-- ME:U(미유) 운영 기록 — 결제 재확인 결과, 오류 식별번호, 알림 이력을 남긴다.
-- 앞의 마이그레이션 5개를 실행한 뒤, SQL Editor에서 이 파일을 한 번 실행한다. 기존 데이터는 바뀌지 않는다.
--
-- - 서버만 쓰고 읽는다 (브라우저 권한으로는 보이지 않는다)
-- - 지우거나 고치지 않고 쌓는다
-- - 고객 이름 · 생년월일 · 답변 · 분석 내용 · 키 · 토큰은 담지 않는다 (서버 코드가 가려서 저장하고, 여기서도 길이를 제한한다)

create table public.ops_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- 예: reconcile.paid · reconcile.abandoned · reconcile.anomaly · confirm.save_failed · server.error · report.failed · alert.sent
  kind text not null check (char_length(kind) between 1 and 60),
  severity text not null default 'info' check (severity in ('info', 'warn', 'error')),
  order_number text check (order_number is null or char_length(order_number) <= 64),
  -- 오류 식별번호 (고객 화면에 보여 주는 번호와 같다)
  error_id text check (error_id is null or char_length(error_id) <= 64),
  -- 같은 문제의 알림을 반복해서 보내지 않기 위한 값
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 120),
  message text not null check (char_length(message) <= 500),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 4000)
);

create index ops_events_created_idx on public.ops_events (created_at desc);
create index ops_events_order_idx on public.ops_events (order_number) where order_number is not null;
create index ops_events_error_idx on public.ops_events (error_id) where error_id is not null;
create index ops_events_dedupe_idx on public.ops_events (dedupe_key, created_at desc) where dedupe_key is not null;

create or replace function public.ops_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ops events are append-only';
end;
$$;

create trigger ops_events_no_update before update on public.ops_events
  for each row execute function public.ops_events_guard();

alter table public.ops_events enable row level security;
-- 정책을 두지 않는다 = 로그인한 사용자 · 비로그인 모두 접근할 수 없다 (서버 비밀키만 접근)

revoke all on public.ops_events from anon, authenticated;
grant select, insert on public.ops_events to service_role;
grant usage, select on sequence public.ops_events_id_seq to service_role;

-- 결제 기록의 출처에 재확인(reconcile) · 관리자(admin)를 추가한다 (허용값을 넓히는 변경 — 기존 기록은 그대로)
alter table public.payment_events drop constraint if exists payment_events_source_check;
alter table public.payment_events
  add constraint payment_events_source_check
  check (source in ('confirm', 'webhook', 'fail_redirect', 'checkout', 'reconcile', 'admin'));
