-- ME:U(미유) DB 변경 4~10번 — SQL Editor에서 한 번에 실행하는 통합 파일
--
-- 이 파일은 supabase/migrations의 4~10번 파일을 한 글자도 고치지 않고 이어 붙인 것이다.
-- (scripts/render-apply-sql.ts가 만든다 — 직접 고치지 않는다. 내용이 바뀌면 서버 테스트가 알려 준다.)
--
-- 사용: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용을 모두 붙여넣고 Run (한 번만).
--
-- 안전장치
--  1) 시작할 때 조건을 확인한다: 1~2번이 만드는 표가 있고, 4~10번이 하나도 적용돼 있지 않아야 한다.
--     아니면 아무것도 바꾸지 않고 "시작 조건 불충족" 오류로 멈춘다. (이미 한 번 실행한 뒤 다시 실행해도 여기서 멈춘다 — 문제가 아니다.)
--  2) 전체가 하나의 트랜잭션(begin ... commit)이다. 중간에 오류가 나면 이 파일이 한 일이 모두 취소되어 일부만 적용되지 않는다.
--  3) 기존 회원 · 검사 · 주문 · 결제 · 리포트 데이터를 지우거나 고치지 않는다. 다만 4번이 주문에 payment_env 열을 새로 만들고
--     기존 주문은 모두 'test'로 채운다 (실결제 전환 전의 주문이므로).
--  4) 마지막 결과 표(읽기 전용 확인 조회)에서 4~10번이 모두 "적용됨"이면 끝이다.
--
-- Supabase가 "위험한 작업이 포함되어 있다"는 확인 창을 보여 주면: 6번의 "제약 조건 교체"(허용값을 넓히는 변경)와
-- 10번 함수 안의 "탈퇴 시 삭제" 문장 때문이다. 이 파일은 기존 데이터를 지우지 않으므로 실행해도 된다.

begin;

do $check$
declare
  missing text[] := '{}';
  present text[] := '{}';
  t text;
begin
  -- 1) 앞 번호(1~2번)가 만드는 표가 있어야 한다
  foreach t in array array['profiles', 'assessments', 'user_regions', 'orders', 'payment_events', 'reports', 'user_consents'] loop
    if to_regclass('public.' || t) is null then missing := missing || t; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception '시작 조건 불충족 — 1~2번에서 만드는 표가 없습니다: %. 아무것도 바꾸지 않았습니다. 이 파일을 실행하지 말고, 먼저 check-migrations.sql 결과를 알려 주세요.', array_to_string(missing, ', ');
  end if;

  -- 2) 4~10번이 하나라도 이미 적용돼 있으면 멈춘다 (일부만 적용된 상태에서 다시 실행하지 않기 위해)
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_env') then present := present || '4번 (주문의 payment_env 열)'::text; end if;
  if to_regclass('public.personal_contexts') is not null then present := present || '5번 (표 personal_contexts)'::text; end if;
  if to_regclass('public.ops_events') is not null then present := present || '6번 (표 ops_events)'::text; end if;
  if coalesce((select pg_get_constraintdef(c.oid) like '%reconcile%' from pg_constraint c where c.conrelid = to_regclass('public.payment_events') and c.conname = 'payment_events_source_check'), false) then present := present || '6번 (결제 기록 출처에 reconcile 허용)'::text; end if;
  if to_regclass('public.ai_usage') is not null then present := present || '7번 (표 ai_usage)'::text; end if;
  if to_regclass('public.funnel_events') is not null then present := present || '8번 (표 funnel_events)'::text; end if;
  if to_regclass('public.report_feedback') is not null then present := present || '8번 (표 report_feedback)'::text; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'acq_source') then present := present || '8번 (주문의 acq_source 열)'::text; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'ai_cost_since') then present := present || '9번 (함수 ai_cost_since)'::text; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'withdrawn_at') then present := present || '10번 (프로필의 withdrawn_at 열)'::text; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'withdrawn_at') then present := present || '10번 (검사의 withdrawn_at 열)'::text; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'withdraw_member_data') then present := present || '10번 (함수 withdraw_member_data)'::text; end if;
  if cardinality(present) > 0 then
    raise exception '시작 조건 불충족 — 4~10번 중 이미 적용된 것이 있습니다: %. 아무것도 바꾸지 않았습니다. 이 파일을 다시 실행하지 말고, check-migrations.sql 결과 표를 그대로 알려 주세요.', array_to_string(present, ' / ');
  end if;
end
$check$;

-- ═════════════════════════════════════════════════════════════════
-- 4번: 20261014000000_payment_env.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 4번째 마이그레이션 — 주문마다 결제 환경을 남긴다
-- 앞의 세 파일을 실행한 뒤 SQL Editor에서 실행한다. 여러 번 실행하면 "already exists" 오류가 나며, 그 경우 그대로 두면 된다.
--
-- payment_env
--   test      : 내 상점의 테스트 키로 진행한 테스트 결제 (실제 돈이 나가지 않음)
--   test-docs : 토스페이먼츠 문서 예제용 공용 테스트 키로 진행한 테스트 결제 — 내 상점 관리자에는 내역이 보이지 않는다
--   live      : 실결제
-- 기존 주문은 모두 실결제 전환 전에 만든 것이므로 test로 채운다. 기존 주문의 다른 값은 바꾸지 않는다.

alter table public.orders
  add column payment_env text not null default 'test'
  check (payment_env in ('test', 'test-docs', 'live'));

-- 주문을 만든 뒤에는 결제 환경을 바꿀 수 없다
create or replace function public.orders_env_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payment_env <> old.payment_env then
    raise exception 'order payment_env is immutable';
  end if;
  return new;
end;
$$;

create trigger orders_env_guard before update on public.orders
  for each row execute function public.orders_env_guard();

-- ═════════════════════════════════════════════════════════════════
-- 5번: 20261015000000_personal_context.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 나를 더 반영하기 (선택 입력)
-- 앞의 마이그레이션 4개를 실행한 뒤, SQL Editor에서 이 파일을 한 번 실행한다. 기존 데이터는 바뀌지 않는다.
--
-- - 검사 결과 하나에 하나: 지금 고민 · 반복되는 상황 · 이전 풀이에서 맞았던/달랐던 점 · 대화 일부
-- - 리포트를 만들 때 해석의 초점과 예시를 고르는 데만 쓴다 (사주 계산은 바뀌지 않는다)
-- - 고객이 직접 보고 · 고치고 · 지울 수 있다 (지우면 행이 삭제된다)
-- - 브라우저는 본인 것 조회만, 쓰기 · 지우기는 서버가 소유자를 확인한 뒤에

create table public.personal_contexts (
  assessment_id uuid primary key references public.assessments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null check (topic in ('love', 'marriage', 'relationship', 'work', 'money', 'self', 'other')),
  question text not null default '' check (char_length(question) <= 300),
  situation text not null default '' check (char_length(situation) <= 300),
  matched text not null default '' check (char_length(matched) <= 300),
  differed text not null default '' check (char_length(differed) <= 300),
  excerpt text not null default '' check (char_length(excerpt) <= 1500),
  -- 리포트 해석에 쓰는 데 동의한 시각 (선택 항목 동의)
  agreed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index personal_contexts_user_idx on public.personal_contexts (user_id);

create trigger personal_contexts_updated_at before update on public.personal_contexts
  for each row execute function public.set_updated_at();

-- 검사 결과의 주인과 같은 회원만 (서버 코드 실수로 다른 회원의 결과에 붙지 않게)
create or replace function public.personal_contexts_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.user_id
  ) then
    raise exception 'personal context owner mismatch';
  end if;
  return new;
end;
$$;

create trigger personal_contexts_owner before insert or update on public.personal_contexts
  for each row execute function public.personal_contexts_owner_check();

alter table public.personal_contexts enable row level security;

create policy "본인 반영 정보 조회" on public.personal_contexts
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.personal_contexts from anon, authenticated;
revoke select on public.personal_contexts from anon;

-- 필요한 권한은 직접 준다: 브라우저는 조회, 서버는 조회 · 저장 · 수정 · 삭제
grant select on public.personal_contexts to authenticated;
grant select, insert, update, delete on public.personal_contexts to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 6번: 20261016000000_ops_events.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
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

-- ═════════════════════════════════════════════════════════════════
-- 7번: 20261017000000_ai_usage.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) AI 사용 기록 — 리포트를 만들 때 부른 AI 호출의 횟수 · 토큰 · 예상 비용 · 결과를 쌓는다.
-- 앞의 마이그레이션 6개를 실행한 뒤, SQL Editor에서 이 파일을 한 번 실행한다. 기존 데이터는 바뀌지 않는다.
--
-- - 서버만 쓰고 읽는다 (브라우저 권한으로는 보이지 않는다)
-- - 지우거나 고치지 않고 쌓는다
-- - 요청 · 응답 내용 (이름 · 생년월일 · 답변 · 고민 · 리포트 문장)은 담지 않는다. 호출의 크기와 결과만 남긴다
-- - report_id에는 외래 키를 걸지 않는다 (쌓기만 하는 표라서 리포트가 지워져도 기록은 남는다)

create table public.ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  report_id uuid,
  provider text not null check (char_length(provider) between 1 and 60),
  model text not null check (char_length(model) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 100),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  -- 예상 비용 (원). 토큰 단가를 설정하기 전에는 비어 있다
  est_cost_krw numeric(14, 4) check (est_cost_krw is null or est_cost_krw >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  -- ok: 형식 검사 통과 · invalid: 응답은 왔지만 형식 검사 실패 · timeout: 시간 초과 · error: 그 밖의 호출 오류
  outcome text not null check (outcome in ('ok', 'invalid', 'timeout', 'error')),
  error_code text check (error_code is null or char_length(error_code) <= 60)
);

create index ai_usage_created_idx on public.ai_usage (created_at desc);
create index ai_usage_report_idx on public.ai_usage (report_id) where report_id is not null;

create or replace function public.ai_usage_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ai usage records are append-only';
end;
$$;

create trigger ai_usage_no_update before update on public.ai_usage
  for each row execute function public.ai_usage_guard();

alter table public.ai_usage enable row level security;
-- 정책을 두지 않는다 = 로그인한 사용자 · 비로그인은 접근할 수 없다 (서버 비밀키만 접근)

revoke all on public.ai_usage from anon, authenticated;
grant select, insert on public.ai_usage to service_role;
grant usage, select on sequence public.ai_usage_id_seq to service_role;

-- 용량 점검(생성 중 · 대기 중 리포트 수)과 하루 검사 수 제한에 쓰는 색인
create index if not exists reports_status_updated_idx on public.reports (status, updated_at);
create index if not exists assessments_user_created_idx on public.assessments (user_id, created_at desc);

-- ═════════════════════════════════════════════════════════════════
-- 8번: 20261018000000_funnel_feedback.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
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

-- ═════════════════════════════════════════════════════════════════
-- 9번: 20261019000000_performance.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 성능 보강 — 하루 AI 비용 합계를 DB에서 계산하는 함수와, 재확인 점검용 부분 색인.
-- 앞의 마이그레이션 8개를 실행한 뒤, SQL Editor에서 이 파일을 한 번 실행한다. 기존 데이터는 바뀌지 않는다 (함수와 색인만 더한다).
--
-- Supabase는 한 번에 돌려주는 행 수를 기본 1,000개로 제한한다. 사용 기록을 모두 가져와 코드에서 더하면 기록이 많아졌을 때
-- 합계가 조용히 모자라지므로, 합계는 DB에서 계산한다 (새 구매 중단 판단에 쓰인다).

create or replace function public.ai_cost_since(p_since timestamptz)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(est_cost_krw), 0) from public.ai_usage where created_at >= p_since
$$;

revoke all on function public.ai_cost_since(timestamptz) from public, anon, authenticated;
grant execute on function public.ai_cost_since(timestamptz) to service_role;

-- 결제 재확인 점검: 오래 대기 중인 주문과 최근 결제 완료 주문을 빠르게 찾는다
create index if not exists orders_pending_created_idx on public.orders (created_at) where status = 'pending';
create index if not exists orders_paid_approved_idx on public.orders (approved_at desc) where status = 'paid';

-- ═════════════════════════════════════════════════════════════════
-- 10번: 20261020000000_account_withdrawal.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 10번째 마이그레이션 — 회원 탈퇴 (개인정보 삭제 + 거래 기록 분리 보관)
-- 앞의 파일들을 실행한 뒤 SQL Editor에서 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표와 함수를 "더하기만" 한다. 기존 검사 · 회원 · 주문 · 결제 기록은 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
-- 데이터는 회원이 직접 탈퇴를 확정했을 때에만, 아래 함수가 그 회원의 것에 한해 처리한다.
--
-- 탈퇴 시 처리 (정책 확정 전 초안 — docs/withdrawal-policy.md):
--   삭제: 검사 결과(기본 정보 · 응답 · 사주 계산 결과) · 구매한 리포트 내용 · 나를 더 반영하기 입력 · 만족도 · 거주 지역 · 닉네임
--   보관: 주문 · 결제 기록(주문번호 · 금액 · 결제 시각 · 결제 승인 / 취소 기록), 가입 동의 기록. 이름 · 생년월일 · 응답 등은 남기지 않는다.
--         주문이 가리키는 검사 행은 지우지 않고 내용을 비운 빈 껍데기로 남긴다 (주문이 검사를 참조하는 관계를 유지하기 위해).
--   로그인 연결(카카오 식별 정보)은 서버가 Supabase Auth의 "탈퇴 처리"로 따로 지운다 (이 함수는 DB 표만 다룬다).

alter table public.profiles    add column if not exists withdrawn_at timestamptz;
alter table public.assessments add column if not exists withdrawn_at timestamptz;

create or replace function public.withdraw_member_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reports int := 0;
  v_deleted_assessments int := 0;
  v_scrubbed_assessments int := 0;
  v_contexts int := 0;
  v_feedback int := 0;
  v_regions int := 0;
begin
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'withdraw_not_found';
  end if;

  -- 진행 중인 결제 · 리포트 생성이 있으면 처리하지 않는다 (결제 확인이나 생성이 끝난 뒤에 다시)
  if exists (select 1 from public.orders where user_id = p_user_id and status = 'pending' and created_at > now() - interval '1 hour') then
    raise exception 'withdraw_blocked_pending_order';
  end if;
  if exists (select 1 from public.reports where user_id = p_user_id and status in ('queued', 'generating')) then
    raise exception 'withdraw_blocked_report_in_progress';
  end if;

  delete from public.report_feedback where user_id = p_user_id;
  get diagnostics v_feedback = row_count;

  delete from public.personal_contexts where user_id = p_user_id;
  get diagnostics v_contexts = row_count;

  -- 리포트 내용 삭제 (주문은 남는다). 완성 리포트는 수정할 수 없지만 삭제는 회원 탈퇴 때만 이 함수로 한다
  delete from public.reports where user_id = p_user_id;
  get diagnostics v_reports = row_count;

  delete from public.user_regions where user_id = p_user_id;
  get diagnostics v_regions = row_count;

  -- 주문이 없는 검사는 통째로 삭제
  delete from public.assessments a
   where a.user_id = p_user_id
     and not exists (select 1 from public.orders o where o.assessment_id = a.id);
  get diagnostics v_deleted_assessments = row_count;

  -- 주문이 가리키는 검사는 내용을 비운다 (생년월일 · 응답 · 닉네임 · MBTI · 계산 결과 모두). 날짜 자리는 형식 검사를 맞추기 위한 빈 값(1900-01-01)이다
  update public.assessments
     set nickname = '탈퇴',
         birth_calendar = 'solar',
         birth_is_leap_month = false,
         birth_year = 1900, birth_month = 1, birth_day = 1,
         birth_time = null,
         known_mbti = null,
         answers = '{}'::jsonb,
         summary = '{}'::jsonb,
         saju = '{}'::jsonb,
         content_version = 'withdrawn',
         withdrawn_at = coalesce(withdrawn_at, now())
   where user_id = p_user_id and withdrawn_at is null;
  get diagnostics v_scrubbed_assessments = row_count;

  update public.profiles
     set nickname = null,
         withdrawn_at = coalesce(withdrawn_at, now())
   where id = p_user_id;

  return jsonb_build_object(
    'reports', v_reports,
    'assessments_deleted', v_deleted_assessments,
    'assessments_emptied', v_scrubbed_assessments,
    'personal_contexts', v_contexts,
    'feedback', v_feedback,
    'regions', v_regions
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;

commit;

-- ═════════════════════════════════════════════════════════════════
-- 확인: 모든 번호의 적용 여부 (읽기 전용 — 아무것도 바꾸지 않는다)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) DB 변경 적용 여부 확인 — 읽기만 한다 (아무것도 만들거나 바꾸거나 지우지 않는다).
--
-- 사용: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용을 붙여넣고 Run.
-- 결과 표의 "상태"가 "아직 안 함"인 번호만, 번호 순서대로 실행하면 된다 (supabase/migrations 폴더의 같은 번호 파일).
-- "적용됨"인 파일은 다시 실행하지 않는다.
--
-- 주의: 이 확인은 각 파일이 만드는 대표 항목(표 · 열 · 함수 · 권한)이 있는지 본다. 파일을 중간까지만 실행한 경우처럼
--       애매한 상태는 "일부만"으로 표시한다 — 그럴 때는 임의로 다시 실행하지 말고 이 결과 표를 그대로 알려 달라.

with
t as (
  select
    to_regclass('public.profiles')            is not null as profiles,
    to_regclass('public.assessments')         is not null as assessments,
    to_regclass('public.user_regions')        is not null as user_regions,
    to_regclass('public.orders')              is not null as orders,
    to_regclass('public.payment_events')      is not null as payment_events,
    to_regclass('public.reports')             is not null as reports,
    to_regclass('public.user_consents')       is not null as user_consents,
    to_regclass('public.personal_contexts')   is not null as personal_contexts,
    to_regclass('public.ops_events')          is not null as ops_events,
    to_regclass('public.ai_usage')            is not null as ai_usage,
    to_regclass('public.funnel_events')       is not null as funnel_events,
    to_regclass('public.report_feedback')     is not null as report_feedback
),
wd as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'    and column_name = 'withdrawn_at') as profile_col,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'withdrawn_at') as assessment_col,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'withdraw_member_data') as fn
),
col as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_env')  as payment_env,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'acq_source')   as acq_source
),
fn as (
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'ai_cost_since') as ai_cost_since
),
-- 3번: 프로필이 빠진 회원이 없고, 서버가 프로필을 만들 수 있는 권한이 있는가 (profiles 표가 있을 때만 센다)
missing_profiles as (
  select case
    when to_regclass('public.profiles') is null then null
    else (xpath('/row/c/text()', query_to_xml('select count(*) as c from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)', false, true, '')))[1]::text::int
  end as n
),
grants as (
  select case
    when to_regclass('public.profiles') is null then null
    else has_table_privilege('service_role', 'public.profiles', 'insert')
  end as profiles_insert
),
-- 6번: 결제 기록 출처에 reconcile이 허용되는가
src as (
  select coalesce((select pg_get_constraintdef(c.oid) like '%reconcile%'
                   from pg_constraint c
                   where c.conrelid = to_regclass('public.payment_events') and c.conname = 'payment_events_source_check'), false) as reconcile_ok
)
select * from (
  select 1 as "번호", '20261011000000_init.sql' as "파일",
         case when t.profiles and t.assessments and t.user_regions and t.orders and t.payment_events and t.reports then '적용됨'
              when t.profiles or t.assessments or t.user_regions or t.orders or t.payment_events or t.reports then '일부만' else '아직 안 함' end as "상태",
         '표 6개: profiles, assessments, user_regions, orders, payment_events, reports' as "확인한 것"
  from t
  union all
  select 2, '20261012000000_consents.sql',
         case when t.user_consents then '적용됨' else '아직 안 함' end,
         '표 user_consents'
  from t
  union all
  select 3, '20261013000000_profile_backfill.sql',
         case when mp.n is null then '아직 안 함 (1번 먼저)'
              when mp.n = 0 and g.profiles_insert then '적용됨'
              when mp.n = 0 and not g.profiles_insert then '아직 안 함'
              else '아직 안 함' end,
         '프로필 없는 회원 ' || coalesce(mp.n::text, '-') || '명 / 서버의 프로필 생성 권한 ' || coalesce(g.profiles_insert::text, '-')
  from missing_profiles mp, grants g
  union all
  select 4, '20261014000000_payment_env.sql',
         case when col.payment_env then '적용됨' else '아직 안 함' end,
         '주문의 payment_env 열'
  from col
  union all
  select 5, '20261015000000_personal_context.sql',
         case when t.personal_contexts then '적용됨' else '아직 안 함' end,
         '표 personal_contexts'
  from t
  union all
  select 6, '20261016000000_ops_events.sql',
         case when t.ops_events and src.reconcile_ok then '적용됨'
              when t.ops_events or src.reconcile_ok then '일부만' else '아직 안 함' end,
         '표 ops_events / 결제 기록 출처에 reconcile 허용: ' || src.reconcile_ok::text
  from t, src
  union all
  select 7, '20261017000000_ai_usage.sql',
         case when t.ai_usage then '적용됨' else '아직 안 함' end,
         '표 ai_usage'
  from t
  union all
  select 8, '20261018000000_funnel_feedback.sql',
         case when t.funnel_events and t.report_feedback and col.acq_source then '적용됨'
              when t.funnel_events or t.report_feedback or col.acq_source then '일부만' else '아직 안 함' end,
         '표 funnel_events, report_feedback / 주문의 acq_source 열'
  from t, col
  union all
  select 9, '20261019000000_performance.sql',
         case when fn.ai_cost_since then '적용됨' else '아직 안 함' end,
         '함수 ai_cost_since'
  from fn
  union all
  select 10, '20261020000000_account_withdrawal.sql',
         case when wd.profile_col and wd.assessment_col and wd.fn then '적용됨'
              when wd.profile_col or wd.assessment_col or wd.fn then '일부만' else '아직 안 함' end,
         '프로필 · 검사의 withdrawn_at 열 / 함수 withdraw_member_data'
  from wd
) r
order by "번호";
