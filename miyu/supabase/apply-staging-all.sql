-- ME:U(미유) 스테이징 전용 — DB 변경 1~25번을 SQL Editor에서 한 번에 실행하는 통합 파일
--
-- ⚠ 이 파일은 **아무것도 만들지 않은 새 Supabase 프로젝트(스테이징)에만** 쓴다. 운영 프로젝트에서는 실행하지 않는다.
--   (운영 DB 적용은 별도 승인이며 docs/db-rollout-19-25.md의 번호별 절차를 따른다.)
--
-- 이 파일은 supabase/migrations의 1~25번 파일을 한 글자도 고치지 않고 이어 붙인 것이다.
-- (scripts/render-apply-sql.ts --staging 이 만든다 — 직접 고치지 않는다. 내용이 바뀌면 서버 테스트가 알려 준다.)
--
-- 사용: 새 Supabase 프로젝트 → SQL Editor → New query → 이 파일 내용을 모두 붙여넣고 Run (한 번만).
--
-- 안전장치
--  1) 시작할 때 조건을 확인한다: 이 프로젝트에 앱의 표(profiles · orders · assessments)가 하나도 없어야 하고, Supabase Auth(auth.users)는 있어야 한다.
--     이미 표가 있으면(= 운영 프로젝트이거나 한 번 실행한 프로젝트) 아무것도 바꾸지 않고 "시작 조건 불충족" 오류로 멈춘다.
--  2) 전체가 하나의 트랜잭션(begin ... commit)이다. 중간에 오류가 나면 이 파일이 한 일이 모두 취소된다.
--  3) 어떤 기존 데이터도 지우거나 고치지 않는다(새 프로젝트라 지울 데이터가 없다).
--  4) 마지막 결과 표(읽기 전용 확인 조회)에서 1~25번이 모두 "적용됨"이면 끝이다.
--
-- Supabase가 "위험한 작업이 포함되어 있다"는 확인 창을 보여 주면: 제약 조건 교체와 함수 안의 "탈퇴 시 삭제" 문장 때문이다. 새 프로젝트라 실행해도 된다.

begin;

do $check$
declare
  present text[] := '{}';
  t text;
begin
  if to_regclass('auth.users') is null then
    raise exception '시작 조건 불충족 — Supabase Auth(auth.users)가 없습니다. Supabase 프로젝트의 SQL Editor에서 실행했는지 확인하세요. 아무것도 바꾸지 않았습니다.';
  end if;
  foreach t in array array['profiles', 'orders', 'assessments'] loop
    if to_regclass('public.' || t) is not null then present := present || t; end if;
  end loop;
  if cardinality(present) > 0 then
    raise exception '시작 조건 불충족 — 이 프로젝트에는 이미 앱의 표가 있습니다: %. 이 파일은 비어 있는 새 스테이징 프로젝트 전용입니다(운영 프로젝트에서 실행하면 안 됩니다). 아무것도 바꾸지 않았습니다.', present;
  end if;
end
$check$;

-- ═════════════════════════════════════════════════════════════════
-- 1번: 20261011000000_init.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 초기 DB 구성
-- Supabase 대시보드 > SQL Editor에 붙여넣어 한 번 실행한다 (또는 Supabase CLI `supabase db push`).
--
-- 원칙
-- - 모든 데이터는 내부 회원번호(auth.users.id)로 연결한다. 카카오 이메일은 없을 수 있다.
-- - 브라우저(anon / authenticated)는 본인 행 "조회"만 가능하다. 쓰기는 서버(비밀키)에서만 한다.
-- - 결제 상태(orders)와 리포트 생성 상태(reports)를 따로 관리한다.
-- - 완성된 리포트는 바꿀 수 없다 (같은 버전을 다시 보여주기 위해).

-- ─────────────────────────────────────────────
-- 공통: updated_at 자동 갱신
-- ─────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────
-- 회원 프로필 (가입 시 자동 생성)
-- ─────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text check (nickname is null or char_length(nickname) between 1 and 12),
  -- 결제사에 넘기는 구매자 식별값. 회원번호와 별도의 무작위 값
  payment_customer_key uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────
-- 검사 결과 (입력값 + 서버 채점 결과, 저장 후 수정하지 않음)
-- ─────────────────────────────────────────────
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  channel text not null default 'web' check (channel in ('web')),
  nickname text not null check (char_length(nickname) between 1 and 12),
  birth_calendar text not null check (birth_calendar in ('solar', 'lunar')),
  birth_is_leap_month boolean not null default false,
  birth_year smallint not null check (birth_year between 1900 and 2100),
  birth_month smallint not null check (birth_month between 1 and 12),
  birth_day smallint not null check (birth_day between 1 and 31),
  birth_time time, -- null이면 출생시간 모름 (임의 시간을 넣지 않는다)
  known_mbti text check (known_mbti is null or known_mbti ~ '^[EI][SN][TF][JP]$'),
  answers jsonb not null,
  content_version text not null,
  source text not null check (source in ('dev-scoring', 'live')),
  summary jsonb not null,
  saju jsonb not null,
  created_at timestamptz not null default now()
);

create index assessments_user_created_idx on public.assessments (user_id, created_at desc);

-- ─────────────────────────────────────────────
-- 거주·활동 지역 (성향 분석과 분리, 향후 장소 추천용)
-- ─────────────────────────────────────────────
create table public.user_regions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  province text not null,
  district text check (district is null or char_length(district) <= 20),
  updated_at timestamptz not null default now()
);

create trigger user_regions_updated_at before update on public.user_regions
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- 주문 (결제 상태)
-- ─────────────────────────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique check (order_number ~ '^[A-Za-z0-9_=-]{6,64}$'),
  user_id uuid not null references auth.users (id) on delete restrict,
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  product_id text not null,
  amount integer not null check (amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  provider text not null default 'tosspayments',
  payment_key text unique,
  method text,
  approved_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_assessment_idx on public.orders (assessment_id);
-- 같은 검사·상품에 결제 완료는 하나, 대기 중 주문도 하나만
create unique index orders_one_paid on public.orders (assessment_id, product_id) where status = 'paid';
create unique index orders_one_pending on public.orders (assessment_id, product_id) where status = 'pending';

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- 상태 변경 규칙 (lib/commerce/order.ts의 ORDER_TRANSITIONS와 같다)
create or replace function public.orders_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.amount <> old.amount or new.user_id <> old.user_id
     or new.assessment_id <> old.assessment_id or new.order_number <> old.order_number then
    raise exception 'order identity fields are immutable';
  end if;
  if new.status <> old.status and not (
       (old.status = 'pending' and new.status in ('paid', 'failed', 'canceled'))
    or (old.status in ('failed', 'canceled') and new.status = 'paid')
    or (old.status = 'paid' and new.status = 'refunded')
  ) then
    raise exception 'invalid order status change: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;

create trigger orders_guard before update on public.orders
  for each row execute function public.orders_guard();

-- 결제 처리 기록 (카드 번호 등 결제수단 상세는 저장하지 않는다)
create table public.payment_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete restrict,
  source text not null check (source in ('confirm', 'webhook', 'fail_redirect', 'checkout')),
  status text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index payment_events_order_idx on public.payment_events (order_id, created_at);

-- ─────────────────────────────────────────────
-- 리포트 (생성 상태 + 완성본)
-- ─────────────────────────────────────────────
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  order_id uuid not null unique references public.orders (id) on delete restrict,
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  status text not null default 'queued' check (status in ('queued', 'generating', 'ready', 'failed')),
  content jsonb,
  generator text,
  generator_version text,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  check (status <> 'ready' or (content is not null and ready_at is not null))
);

create index reports_user_idx on public.reports (user_id);

create trigger reports_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

-- 완성된 리포트는 바꿀 수 없다
create or replace function public.reports_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'ready' then
    raise exception 'ready report is immutable';
  end if;
  return new;
end;
$$;

create trigger reports_guard before update on public.reports
  for each row execute function public.reports_guard();

-- ─────────────────────────────────────────────
-- 접근 정책 (RLS)
-- 로그인한 사용자는 본인 행만 조회. 쓰기 정책은 두지 않는다 (= 거부).
-- 서버는 비밀키(service_role)로 쓰고, 소유자 확인은 서버 코드에서 한다.
-- ─────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.assessments enable row level security;
alter table public.user_regions enable row level security;
alter table public.orders enable row level security;
alter table public.payment_events enable row level security;
alter table public.reports enable row level security;

create policy "본인 프로필 조회" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "본인 검사 결과 조회" on public.assessments
  for select to authenticated using (user_id = (select auth.uid()));

create policy "본인 지역 조회" on public.user_regions
  for select to authenticated using (user_id = (select auth.uid()));

create policy "본인 주문 조회" on public.orders
  for select to authenticated using (user_id = (select auth.uid()));

create policy "본인 리포트 조회" on public.reports
  for select to authenticated using (user_id = (select auth.uid()));

-- payment_events: 정책 없음 → 서버만 접근

-- 정책이 없더라도 쓰기 권한 자체를 거둬 둔다
revoke insert, update, delete on public.profiles, public.assessments, public.user_regions,
  public.orders, public.payment_events, public.reports from anon, authenticated;
revoke select on public.payment_events from anon, authenticated;
revoke select on public.profiles, public.assessments, public.user_regions, public.orders, public.reports from anon;

-- 필요한 권한은 직접 준다. 프로젝트의 기본 권한 설정(새 테이블 자동 공개 여부)과 관계없이 같은 결과가 되게 한다.
-- 브라우저(authenticated): 조회만 — 실제로 보이는 행은 위 접근 정책이 본인 것으로 제한한다
grant usage on schema public to authenticated, service_role;
grant select on public.profiles, public.assessments, public.user_regions, public.orders, public.reports to authenticated;
-- 서버(service_role, 비밀키): 서비스가 쓰는 동작만
grant select, update on public.profiles to service_role;
grant select, insert, update on public.user_regions, public.orders, public.reports to service_role;
grant select, insert on public.assessments, public.payment_events to service_role;
grant usage, select on sequence public.payment_events_id_seq to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 2번: 20261012000000_consents.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 가입 동의 기록
-- 첫 번째 마이그레이션(20261011000000_init.sql)을 실행한 뒤, SQL Editor에서 이 파일도 한 번 실행한다.
--
-- - 동의·철회 기록은 지우지 않고 쌓는다 (항목별 최신 기록이 현재 상태)
-- - 약관 버전을 함께 남겨, 약관이 바뀌면 다시 동의를 받는다
-- - 브라우저는 본인 기록 조회만, 기록은 서버만 쓴다

create table public.user_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_type text not null check (consent_type in ('age_14', 'terms', 'privacy', 'marketing')),
  version text not null check (char_length(version) between 1 and 40),
  agreed boolean not null,
  created_at timestamptz not null default now()
);

create index user_consents_user_idx on public.user_consents (user_id, consent_type, created_at desc);

-- 기록은 고치거나 지울 수 없다 (회원 삭제 시에만 함께 삭제)
create or replace function public.user_consents_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'consent records are append-only';
end;
$$;

create trigger user_consents_no_update before update on public.user_consents
  for each row execute function public.user_consents_guard();

alter table public.user_consents enable row level security;

create policy "본인 동의 기록 조회" on public.user_consents
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.user_consents from anon, authenticated;
revoke select on public.user_consents from anon;

-- 필요한 권한은 직접 준다 (프로젝트 기본 권한 설정과 관계없이): 브라우저는 조회, 서버는 조회 · 추가만
grant select on public.user_consents to authenticated;
grant select, insert on public.user_consents to service_role;
grant usage, select on sequence public.user_consents_id_seq to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 3번: 20261013000000_profile_backfill.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 3번째 마이그레이션 — 프로필 누락 보완
-- 앞의 두 파일(20261011000000_init.sql, 20261012000000_consents.sql)을 실행한 뒤 SQL Editor에서 실행한다.
--
-- 배경: 테이블을 만들기 전에 카카오로 가입한 회원은 가입 트리거가 없어서 profiles 행이 없다.
--       그러면 결제 화면에서 구매자 키를 찾지 못한다.
--
-- - 여러 번 실행해도 안전하다: 이미 있는 프로필은 그대로 두고, 없는 회원만 채운다.
-- - 회원 · 검사 · 주문 · 결제 기록은 바꾸거나 지우지 않는다.

insert into public.profiles (id)
select u.id
from auth.users u
on conflict (id) do nothing;

-- 앞으로는 서버가 빠진 프로필을 로그인 · 결제 때 스스로 만든다 (서버 비밀키 권한에 추가만 한다)
grant insert on public.profiles to service_role;

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

-- ═════════════════════════════════════════════════════════════════
-- 11번: 20261021000000_concern_records.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 11번째 마이그레이션 — 고민 기록 (내 고민 자세히 알려주기 → 새 리포트 발급 시 "그때의 고민" 저장본)
-- 앞의 파일들(1~10번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표와 함수를 "더하기만" 한다. 기존 검사 · 회원 · 주문 · 결제 · 리포트 데이터는 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
-- (탈퇴 함수는 같은 이름으로 다시 정의해 "고민 기록 삭제"를 더한다 — 함수 내용만 바뀌고 데이터는 건드리지 않는다.)
--
-- 고민 기록이 하는 일
--  - 고객이 적어 둔 현재 고민(personal_contexts)은 언제든 고칠 수 있다. 새 리포트를 발급하는 순간, 그때의 고민을 이 표에 한 건 복사해 둔다.
--  - 기록은 만든 뒤 고치지 않는다. 그래서 이후에 고민을 고쳐도 이미 발급한 리포트가 근거로 삼은 고민(내용 · 작성 시점)은 그대로 남는다.
--  - 고객이 직접 "내용 지우기"를 할 수 있다 — 글만 비우고 기록 자리 · 주제 · 작성 시점 · 지운 시각은 남는다 (이것만 허용한다).
--  - 새 리포트(별도 주문 · 별도 리포트)는 상품 번호 'concern-report:<기록 번호>'로 이 기록에 묶는다. 같은 기록에는 결제 완료 · 결제 대기 주문이 하나뿐이다
--    (기존 주문 고유 조건: 검사 결과 + 상품 번호). 그래서 같은 고민으로 두 번 눌러도 한 건만 발급된다.
--  - 브라우저는 본인 것 조회만, 쓰기는 서버가 소유자를 확인한 뒤에.

create table public.concern_records (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null check (topic in ('love', 'marriage', 'relationship', 'work', 'money', 'self', 'other')),
  question text not null default '' check (char_length(question) <= 300),
  situation text not null default '' check (char_length(situation) <= 300),
  matched text not null default '' check (char_length(matched) <= 300),
  differed text not null default '' check (char_length(differed) <= 300),
  excerpt text not null default '' check (char_length(excerpt) <= 1500),
  -- 이 고민을 마지막으로 쓰거나 고친 시점 (현재 고민의 수정 시각) / 리포트 해석에 쓰는 데 동의한 시각
  written_at timestamptz not null,
  agreed_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- 고객이 내용을 지운 시각 (지우지 않았으면 비어 있다)
  scrubbed_at timestamptz,
  check (scrubbed_at is null or (question = '' and situation = '' and matched = '' and differed = '' and excerpt = ''))
);

create index concern_records_assessment_idx on public.concern_records (assessment_id, created_at desc);
create index concern_records_user_idx on public.concern_records (user_id, created_at desc);

-- 같은 검사 결과의 같은 작성 시점(저장본)에는 (내용을 지운 기록을 빼고) 기록이 하나 — 동시에 두 번 눌러도 기록이 하나만 생긴다
create unique index concern_records_one_version on public.concern_records (assessment_id, written_at) where scrubbed_at is null;

-- 검사 결과의 주인과 같은 회원만 (서버 코드 실수로 다른 회원의 결과에 붙지 않게)
create or replace function public.concern_records_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.user_id
  ) then
    raise exception 'concern record owner mismatch';
  end if;
  return new;
end;
$$;

create trigger concern_records_owner before insert on public.concern_records
  for each row execute function public.concern_records_owner_check();

-- 기록은 고치지 않는다 — 허용하는 변경은 "내용 지우기"(글을 모두 비우고 지운 시각을 적기) 하나뿐이다
create or replace function public.concern_records_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.assessment_id is distinct from old.assessment_id
     or new.user_id is distinct from old.user_id
     or new.topic is distinct from old.topic
     or new.written_at is distinct from old.written_at
     or new.agreed_at is distinct from old.agreed_at
     or new.created_at is distinct from old.created_at then
    raise exception 'concern record is immutable';
  end if;
  if old.scrubbed_at is not null then
    -- 이미 지운 기록은 더 바뀌지 않는다
    if new.scrubbed_at is distinct from old.scrubbed_at
       or new.question <> '' or new.situation <> '' or new.matched <> '' or new.differed <> '' or new.excerpt <> '' then
      raise exception 'scrubbed concern record is immutable';
    end if;
    return new;
  end if;
  if new.scrubbed_at is null then
    -- 지우는 것이 아니면 글도 바꿀 수 없다
    if new.question is distinct from old.question
       or new.situation is distinct from old.situation
       or new.matched is distinct from old.matched
       or new.differed is distinct from old.differed
       or new.excerpt is distinct from old.excerpt then
      raise exception 'concern record is immutable';
    end if;
  end if;
  return new;
end;
$$;

create trigger concern_records_guard before update on public.concern_records
  for each row execute function public.concern_records_guard();

alter table public.concern_records enable row level security;

create policy "본인 고민 기록 조회" on public.concern_records
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.concern_records from anon, authenticated;
revoke select on public.concern_records from anon;

-- 필요한 권한은 직접 준다: 브라우저는 조회, 서버는 조회 · 저장 · 내용 지우기(수정). 삭제는 탈퇴 함수만 한다
grant select on public.concern_records to authenticated;
grant select, insert, update on public.concern_records to service_role;

-- ─────────────────────────────────────────────
-- 회원 탈퇴 함수 갱신 — 고민 기록(고객이 적은 내용)도 함께 삭제한다. 나머지는 10번 파일과 같다.
-- 주문 · 결제 기록은 그대로 남는다 (고민 기록이 없어져도 주문은 상품 번호만 가진다).
-- ─────────────────────────────────────────────
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
  v_concerns int := 0;
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

  -- 고민 기록(고객이 적은 내용) 삭제
  delete from public.concern_records where user_id = p_user_id;
  get diagnostics v_concerns = row_count;

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
    'concern_records', v_concerns,
    'feedback', v_feedback,
    'regions', v_regions
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 12번: 20261022000000_talk_rooms.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 12번째 마이그레이션 — 대화(상담방) 저장 · 자유 질문 횟수
-- 앞의 파일들(1~11번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표와 함수를 "더하기만" 한다. 기존 검사 · 회원 · 주문 · 결제 · 리포트 · 고민 데이터는 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
-- (탈퇴 함수는 같은 이름으로 다시 정의해 "대화 삭제"를 더한다 — 함수 내용만 바뀌고 데이터는 건드리지 않는다.)
--
-- 하는 일
--  - talk_rooms: 로그인한 회원의 채팅방(상담 모드)마다 "눌렀던 행동 목록과 자유 질문 · 미유의 답"을 한 줄로 저장한다. 그래서 폰을 바꾸거나 다른 브라우저로 들어와도 대화가 이어진다.
--    리포트의 글(풀이)은 저장하지 않는다 — 풀이는 저장된 리포트에서 다시 만든다. 회원은 방마다 "새로 시작하기"로 지울 수 있고, 탈퇴하면 함께 삭제된다.
--  - chat_questions: 자유 질문을 한 번 보낼 때마다 "누가 · 언제 · 어느 방"만 한 줄 남긴다(질문 내용은 담지 않는다). 하루 질문 횟수 한도를 세는 데만 쓴다.
--  - 브라우저는 본인 대화 조회만, 쓰기는 서버가 소유자를 확인한 뒤에. 질문 횟수 표는 브라우저가 읽을 수 없다.
--  - 보관 기간은 초안이다: 회원이 지우거나 탈퇴할 때까지(오늘의 한 장 방은 저장 때 지난 날짜를 함께 지운다). 확정 전에는 docs/withdrawal-policy.md의 결정 항목으로 둔다.

create table public.talk_rooms (
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  -- 방 이름. 오늘의 한 장 방은 날짜별로 나눠 daily:YYYY-MM-DD 로 저장한다
  room_key text not null check (room_key ~ '^[a-z]{3,12}(:[0-9]{4}-[0-9]{2}-[0-9]{2})?$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 눌렀던 행동 목록 + 자유 질문 · 답 (최대 200개). 리포트 글은 담지 않는다
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) <= 200 and pg_column_size(actions) <= 262144),
  version int not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (assessment_id, room_key)
);

create index talk_rooms_user_idx on public.talk_rooms (user_id, updated_at desc);

-- 검사 결과의 주인과 같은 회원만 (서버 코드 실수로 다른 회원의 결과에 붙지 않게)
create or replace function public.talk_rooms_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.user_id
  ) then
    raise exception 'talk room owner mismatch';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger talk_rooms_owner before insert or update on public.talk_rooms
  for each row execute function public.talk_rooms_owner_check();

alter table public.talk_rooms enable row level security;

create policy "본인 대화 조회" on public.talk_rooms
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.talk_rooms from anon, authenticated;
revoke select on public.talk_rooms from anon;
grant select on public.talk_rooms to authenticated;
grant select, insert, update, delete on public.talk_rooms to service_role;

-- 자유 질문 횟수 — 질문 내용은 담지 않는다
create table public.chat_questions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  room_key text not null check (room_key ~ '^[a-z]{3,12}(:[0-9]{4}-[0-9]{2}-[0-9]{2})?$'),
  created_at timestamptz not null default now()
);

create index chat_questions_user_idx on public.chat_questions (user_id, created_at desc);

alter table public.chat_questions enable row level security;
revoke all on public.chat_questions from anon, authenticated;
grant select, insert, delete on public.chat_questions to service_role;
grant usage, select on sequence public.chat_questions_id_seq to service_role;

-- ─────────────────────────────────────────────
-- 회원 탈퇴 함수 갱신 — 대화(채팅방 저장)와 질문 횟수 기록도 함께 삭제한다. 나머지는 11번 파일과 같다.
-- ─────────────────────────────────────────────
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
  v_concerns int := 0;
  v_feedback int := 0;
  v_regions int := 0;
  v_talks int := 0;
  v_questions int := 0;
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

  -- 고민 기록(고객이 적은 내용) 삭제
  delete from public.concern_records where user_id = p_user_id;
  get diagnostics v_concerns = row_count;

  -- 대화(채팅방에 저장한 눌렀던 행동 · 자유 질문 · 미유의 답)와 질문 횟수 기록 삭제
  delete from public.talk_rooms where user_id = p_user_id;
  get diagnostics v_talks = row_count;
  delete from public.chat_questions where user_id = p_user_id;
  get diagnostics v_questions = row_count;

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
    'concern_records', v_concerns,
    'feedback', v_feedback,
    'regions', v_regions,
    'talk_rooms', v_talks,
    'chat_questions', v_questions
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 13번: 20261023000000_miyu_cash.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 13번째 마이그레이션 — 미유캐시(선불 충전 포인트): 지갑 · 거래 내역 · 충전 · 차감 · 되돌림
-- 앞의 파일들(1~12번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표와 함수를 "더하기만" 한다. 기존 검사 · 회원 · 주문 · 결제 · 리포트 · 고민 · 대화 데이터는 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
-- (탈퇴 함수는 같은 이름으로 다시 정의해 "남은 캐시가 있으면 막기"를 더한다 — 함수 내용만 바뀌고 데이터는 건드리지 않는다.)
--
-- 하는 일
--  - cash_wallets: 회원마다 지갑 한 줄(잔액). 잔액은 0 아래로 내려가지 않는다.
--  - cash_ledger: 캐시가 오르내린 내역(충전 · 보너스 · 질문에 사용 · 사용 되돌림 · 결제 취소 회수). 쌓기만 하고 고치거나 지우지 않는다.
--    "지갑 잔액 = 내역의 합계"여야 하며 supabase/check-cash.sql이 읽기 전용으로 확인한다.
--  - 충전: 미유캐시 충전 주문(상품 번호 cash-charge:<충전>:<보너스>:<임의번호>)이 "결제 완료"로 바뀌는 바로 그 처리 안에서(트리거) 지갑에 넣는다.
--    그래서 결제 승인과 충전이 따로 놀지 않고, 같은 승인을 여러 번 반영해도 한 번만 들어간다(주문 · 종류별 고유 조건).
--  - 결제 취소: 결제 완료 → 환불됨으로 바뀔 때 그 주문으로 넣은 캐시를 회수한다. 이미 쓴 만큼은 회수하지 못하고 부족분(shortfall)을 내역에 남긴다(주문 상태 변경은 막지 않는다).
--  - 질문 차감: spend_cash(회원, 개수, 참조번호) — 잔액이 모자라면 아무것도 바꾸지 않고 null. 같은 참조번호로 두 번 차감할 수 없다.
--  - 되돌림: restore_cash_spend(회원, 참조번호) — 답을 받지 못한 질문의 차감을 한 번만 되돌린다.
--  - 브라우저는 본인 지갑 · 내역 조회만. 쓰기는 위 함수(서버 비밀키)와 트리거로만 한다.

create table public.cash_wallets (
  user_id uuid primary key references auth.users (id) on delete restrict,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cash_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  -- charge 충전 · bonus 보너스 · spend 질문에 사용 · spend_restore 사용 되돌림 · clawback 결제 취소로 회수
  kind text not null check (kind in ('charge', 'bonus', 'spend', 'spend_restore', 'clawback')),
  amount integer not null,
  order_id uuid references public.orders (id) on delete restrict,
  -- 질문 한 번을 가리키는 참조번호 (차감과 되돌림이 같은 번호를 쓴다). 질문 내용은 담지 않는다
  ref text check (ref is null or ref ~ '^[A-Za-z0-9_:.=-]{6,80}$'),
  -- 결제 취소 때 이미 써서 회수하지 못한 캐시
  shortfall integer not null default 0 check (shortfall >= 0),
  created_at timestamptz not null default now(),
  check (
    (kind in ('charge', 'bonus', 'spend_restore') and amount > 0)
    or (kind = 'spend' and amount < 0)
    or (kind = 'clawback' and amount <= 0)
  ),
  check (
    (kind in ('charge', 'bonus', 'clawback') and order_id is not null)
    or (kind in ('spend', 'spend_restore') and ref is not null)
  )
);

-- 같은 주문의 같은 종류는 한 번만 (같은 결제 승인을 여러 번 반영해도 한 번만 충전 · 회수)
create unique index cash_ledger_order_kind on public.cash_ledger (order_id, kind) where order_id is not null;
-- 같은 질문의 차감 · 되돌림도 한 번만
create unique index cash_ledger_ref_kind on public.cash_ledger (ref, kind) where ref is not null;
create index cash_ledger_user_idx on public.cash_ledger (user_id, created_at desc);

-- 내역은 쌓기만 한다
create or replace function public.cash_ledger_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'cash ledger is append-only';
end;
$$;

create trigger cash_ledger_no_change before update or delete on public.cash_ledger
  for each row execute function public.cash_ledger_append_only();

alter table public.cash_wallets enable row level security;
alter table public.cash_ledger enable row level security;

create policy "본인 지갑 조회" on public.cash_wallets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "본인 캐시 내역 조회" on public.cash_ledger
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.cash_wallets, public.cash_ledger from anon, authenticated;
grant select on public.cash_wallets, public.cash_ledger to authenticated;
-- 서버(비밀키)도 표를 직접 고치지 못하고 읽기만 한다. 쓰기는 아래 함수 · 트리거로만
revoke all on public.cash_wallets, public.cash_ledger from service_role;
grant select on public.cash_wallets, public.cash_ledger to service_role;

-- ─────────────────────────────────────────────
-- 충전 · 결제 취소 회수: 주문 상태가 바뀔 때 같은 처리 안에서
-- 상품 번호 형식이 맞지 않으면 건너뛴다 — 결제 완료 처리를 막지 않기 위해서이며, 건너뛴 주문은 check-cash.sql이 찾는다.
-- ─────────────────────────────────────────────
create or replace function public.cash_on_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parts text[];
  v_cash int;
  v_bonus int;
  v_credited int;
  v_balance int;
  v_take int;
begin
  if new.product_id !~ '^cash-charge:[0-9]{1,6}:[0-9]{1,6}:[A-Za-z0-9]{6,32}$' then
    return new;
  end if;
  v_parts := string_to_array(new.product_id, ':');
  v_cash := v_parts[2]::int;
  v_bonus := v_parts[3]::int;

  if new.status = 'paid' and old.status is distinct from 'paid' then
    insert into public.cash_wallets (user_id, balance) values (new.user_id, 0) on conflict (user_id) do nothing;

    if v_cash > 0 then
      insert into public.cash_ledger (user_id, kind, amount, order_id) values (new.user_id, 'charge', v_cash, new.id) on conflict do nothing;
      if found then
        update public.cash_wallets set balance = balance + v_cash, updated_at = now() where user_id = new.user_id;
      end if;
    end if;
    if v_bonus > 0 then
      insert into public.cash_ledger (user_id, kind, amount, order_id) values (new.user_id, 'bonus', v_bonus, new.id) on conflict do nothing;
      if found then
        update public.cash_wallets set balance = balance + v_bonus, updated_at = now() where user_id = new.user_id;
      end if;
    end if;

  elsif new.status = 'refunded' and old.status = 'paid' then
    select coalesce(sum(amount), 0) into v_credited
      from public.cash_ledger where order_id = new.id and kind in ('charge', 'bonus');
    if v_credited > 0 then
      select balance into v_balance from public.cash_wallets where user_id = new.user_id for update;
      v_take := least(coalesce(v_balance, 0), v_credited);
      insert into public.cash_ledger (user_id, kind, amount, order_id, shortfall)
        values (new.user_id, 'clawback', -v_take, new.id, v_credited - v_take)
        on conflict do nothing;
      if found and v_take > 0 then
        update public.cash_wallets set balance = balance - v_take, updated_at = now() where user_id = new.user_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_cash_change after update of status on public.orders
  for each row when (old.status is distinct from new.status)
  execute function public.cash_on_order_change();

-- ─────────────────────────────────────────────
-- 질문 차감 · 되돌림 (서버만 부른다)
-- ─────────────────────────────────────────────
create or replace function public.spend_cash(p_user_id uuid, p_amount int, p_ref text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance int;
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'cash_invalid_amount';
  end if;
  update public.cash_wallets
     set balance = balance - p_amount, updated_at = now()
   where user_id = p_user_id and balance >= p_amount
  returning balance into v_balance;
  if not found then
    return null; -- 잔액이 모자라거나 지갑이 없다. 아무것도 바꾸지 않는다
  end if;
  insert into public.cash_ledger (user_id, kind, amount, ref) values (p_user_id, 'spend', -p_amount, p_ref);
  return v_balance;
end;
$$;

create or replace function public.restore_cash_spend(p_user_id uuid, p_ref text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount int;
  v_balance int;
begin
  select -amount into v_amount from public.cash_ledger where user_id = p_user_id and ref = p_ref and kind = 'spend';
  if v_amount is null then
    return null; -- 되돌릴 차감이 없다
  end if;
  insert into public.cash_ledger (user_id, kind, amount, ref) values (p_user_id, 'spend_restore', v_amount, p_ref) on conflict do nothing;
  if not found then
    return null; -- 이미 되돌렸다
  end if;
  update public.cash_wallets set balance = balance + v_amount, updated_at = now() where user_id = p_user_id returning balance into v_balance;
  return v_balance;
end;
$$;

revoke all on function public.spend_cash(uuid, int, text) from public, anon, authenticated;
revoke all on function public.restore_cash_spend(uuid, text) from public, anon, authenticated;
grant execute on function public.spend_cash(uuid, int, text) to service_role;
grant execute on function public.restore_cash_spend(uuid, text) to service_role;

-- ─────────────────────────────────────────────
-- 회원 탈퇴 함수 갱신 — 남은 미유캐시가 있으면 처리하지 않는다. 나머지는 12번 파일과 같다.
-- 지갑 · 내역은 주문 · 결제 기록처럼 거래 기록이라 지우지 않고 남긴다.
-- ─────────────────────────────────────────────
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
  v_concerns int := 0;
  v_feedback int := 0;
  v_regions int := 0;
  v_talks int := 0;
  v_questions int := 0;
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
  -- 남은 미유캐시가 있으면 처리하지 않는다 (다 쓰거나 환불 문의를 마친 뒤에 다시 — 정책 확정 전 초안, docs/cash-policy.md)
  if exists (select 1 from public.cash_wallets where user_id = p_user_id and balance > 0) then
    raise exception 'withdraw_blocked_cash_balance';
  end if;

  delete from public.report_feedback where user_id = p_user_id;
  get diagnostics v_feedback = row_count;

  delete from public.personal_contexts where user_id = p_user_id;
  get diagnostics v_contexts = row_count;

  -- 고민 기록(고객이 적은 내용) 삭제
  delete from public.concern_records where user_id = p_user_id;
  get diagnostics v_concerns = row_count;

  -- 대화(채팅방에 저장한 눌렀던 행동 · 자유 질문 · 미유의 답)와 질문 횟수 기록 삭제
  delete from public.talk_rooms where user_id = p_user_id;
  get diagnostics v_talks = row_count;
  delete from public.chat_questions where user_id = p_user_id;
  get diagnostics v_questions = row_count;

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
    'concern_records', v_concerns,
    'feedback', v_feedback,
    'regions', v_regions,
    'talk_rooms', v_talks,
    'chat_questions', v_questions
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 14번: 20261024000000_chat_summaries.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 14번째 마이그레이션 — 채팅 요약 저장
-- 앞의 파일들(1~13번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표 · 열 · 함수를 "더하기만" 한다. 기존 검사 · 회원 · 주문 · 결제 · 리포트 · 고민 · 대화 · 미유캐시 데이터는 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
-- (탈퇴 함수는 같은 이름으로 다시 정의해 "채팅 요약 삭제"를 더한다 — 함수 내용만 바뀌고 데이터는 건드리지 않는다.)
--
-- 하는 일
--  - chat_summaries: 채팅방에서 [저장하기]를 누르거나 대화를 끝낼 때 "그때까지 나눈 질문과 답"을 짧게 요약한 줄을 남긴다.
--    visible = true  → 회원이 직접 저장한 요약. MY의 "저장한 채팅 요약 보기"에서 본인만 볼 수 있다.
--    visible = false → 저장하지 않고 끝낸 대화의 참고 기록. 회원 화면에는 보이지 않고(브라우저는 읽을 수 없다), 다음 질문에서 AI가 이전 이야기를 참고하는 데만 쓴다.
--                      회원은 MY에서 "이전 대화 기록 모두 지우기"로 지울 수 있고, 탈퇴하면 함께 삭제된다. 보관 기간 · 방식은 초안이다 — docs/withdrawal-policy.md의 결정 항목.
--    요약에는 리포트 글을 옮겨 담지 않는다: 읽은 풀이의 이름표 · 먼저 묻는 질문에 고른 답 · 내 경험 답장 · 직접 적은 질문과 답의 앞부분만 담는다.
--  - talk_rooms.saved_upto: 이 방의 행동 목록에서 어디까지 요약했는지. 다음 저장은 여기부터 새로 요약한다(저장마다 "이전 저장 이후의 대화"를 담는다). 방을 끝내면(방 줄이 지워지면) 처음부터 다시 센다.
--  - 브라우저는 본인이 저장한(visible) 요약 조회만, 쓰기 · 지우기는 서버가 소유자를 확인한 뒤에.

alter table public.talk_rooms
  add column if not exists saved_upto int not null default 0 check (saved_upto >= 0 and saved_upto <= 200);

create table public.chat_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  -- 방 이름(오늘의 한 장 방도 날짜 없이 daily 로 묶는다)
  room text not null check (room ~ '^[a-z]{3,12}$'),
  visible boolean not null,
  -- { read: [읽은 풀이 이름표...], qa: [{ q, a }...] } — 짧게 줄인 글만. 크기를 제한한다
  items jsonb not null check (jsonb_typeof(items) = 'object' and pg_column_size(items) <= 32768),
  created_at timestamptz not null default now()
);

create index chat_summaries_user_idx on public.chat_summaries (user_id, visible, created_at desc);
create index chat_summaries_room_idx on public.chat_summaries (assessment_id, room, created_at desc);

-- 검사 결과의 주인과 같은 회원만 (서버 코드 실수로 다른 회원의 결과에 붙지 않게)
create or replace function public.chat_summaries_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.user_id
  ) then
    raise exception 'chat summary owner mismatch';
  end if;
  return new;
end;
$$;

create trigger chat_summaries_owner before insert on public.chat_summaries
  for each row execute function public.chat_summaries_owner_check();

alter table public.chat_summaries enable row level security;

-- 회원이 직접 저장한 요약만 본인이 읽는다. 저장하지 않고 끝낸 참고 기록(visible = false)은 브라우저가 읽을 수 없다
create policy "본인이 저장한 채팅 요약 조회" on public.chat_summaries
  for select to authenticated using (user_id = (select auth.uid()) and visible);

revoke all on public.chat_summaries from anon, authenticated;
grant select on public.chat_summaries to authenticated;
-- 요약은 만든 뒤 고치지 않는다 (insert · select · delete만)
grant select, insert, delete on public.chat_summaries to service_role;

-- ─────────────────────────────────────────────
-- 회원 탈퇴 함수 갱신 — 채팅 요약(저장한 것 · 참고 기록 모두)도 함께 삭제한다. 나머지는 13번 파일과 같다.
-- ─────────────────────────────────────────────
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
  v_concerns int := 0;
  v_feedback int := 0;
  v_regions int := 0;
  v_talks int := 0;
  v_questions int := 0;
  v_summaries int := 0;
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
  -- 남은 미유캐시가 있으면 처리하지 않는다 (다 쓰거나 환불 문의를 마친 뒤에 다시 — 정책 확정 전 초안, docs/cash-policy.md)
  if exists (select 1 from public.cash_wallets where user_id = p_user_id and balance > 0) then
    raise exception 'withdraw_blocked_cash_balance';
  end if;

  delete from public.report_feedback where user_id = p_user_id;
  get diagnostics v_feedback = row_count;

  delete from public.personal_contexts where user_id = p_user_id;
  get diagnostics v_contexts = row_count;

  -- 고민 기록(고객이 적은 내용) 삭제
  delete from public.concern_records where user_id = p_user_id;
  get diagnostics v_concerns = row_count;

  -- 대화(채팅방에 저장한 눌렀던 행동 · 자유 질문 · 미유의 답)와 질문 횟수 기록 삭제
  delete from public.talk_rooms where user_id = p_user_id;
  get diagnostics v_talks = row_count;
  delete from public.chat_questions where user_id = p_user_id;
  get diagnostics v_questions = row_count;

  -- 채팅 요약(직접 저장한 것 · 저장하지 않고 끝낸 대화의 참고 기록) 삭제
  delete from public.chat_summaries where user_id = p_user_id;
  get diagnostics v_summaries = row_count;

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
    'concern_records', v_concerns,
    'feedback', v_feedback,
    'regions', v_regions,
    'talk_rooms', v_talks,
    'chat_questions', v_questions,
    'chat_summaries', v_summaries
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 15번: 20261025000000_admin_credit_question.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 15번째 마이그레이션 — 운영자 수동 질문 반영: 결제는 확인됐는데 질문이 장부에 들어가지 않은 주문에 질문을 넣는 함수
-- 앞의 파일들(1~14번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 함수 하나를 "더하기만" 한다. 표 · 기존 데이터 · 기존 함수 · 트리거는 바꾸지 않고, 실행하는 것만으로는 어떤 회원의 질문도 늘어나지 않는다.
--
-- 왜 필요한가
--  - 질문 결제(상품 번호 cash-charge:3:0:…)가 "결제 완료"로 바뀌면 13번 트리거(orders_cash_change)가 같은 처리 안에서 장부에 질문을 넣는다.
--    그런데도 장부에 안 들어간 주문이 생기면(예: 트리거가 건너뛴 형식 오류) 운영자가 결제사 기록을 확인한 뒤 같은 일을 한 번 더 할 수 있어야 한다.
--  - supabase/check-cash.sql이 "결제 완료인데 장부 충전 내역이 없는 주문"을 찾아 준다.
--
-- 이 함수가 하는 일 / 하지 않는 일
--  - 하는 일: 주문이 "결제 완료"이고 질문 결제 주문이면, 트리거가 했을 일(충전 내역 + 지갑 잔액)을 그대로 한다. 주문 한 건당 한 번만(13번의 고유 조건 · 주문 행 잠금).
--  - 하지 않는 일: 주문 상태를 바꾸지 않는다(손으로 "결제 완료"로 바꾸는 일은 없다 — 결제 상태의 기준은 결제사 기록뿐이며 미유 서버가 결제사 조회로만 맞춘다).
--    결제 완료가 아닌 주문 · 질문 결제가 아닌 주문 · 이미 충전된 주문에는 아무것도 하지 않는다.
--  - 결제 확인(결제사 대조)은 이 함수가 아니라 미유 서버가 호출하기 전에 한다. 이 함수는 DB에 기록된 주문 상태만 본다.
--  - 이 함수로 넣은 질문도 같은 "충전" 내역이라 이후 결제가 취소(환불됨)되면 13번 트리거가 회수한다.
--  - 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다.

create or replace function public.admin_credit_question(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_parts text[];
  v_cash int;
  v_bonus int;
  v_credited boolean := false;
begin
  -- 주문 행을 잠가서 같은 주문의 결제 완료 처리(트리거)나 다른 반영과 동시에 돌지 않게 한다
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_order.product_id !~ '^cash-charge:[0-9]{1,6}:[0-9]{1,6}:[A-Za-z0-9]{6,32}$' then
    return 'not_cash';
  end if;
  if v_order.status <> 'paid' then
    return 'not_paid';
  end if;

  v_parts := string_to_array(v_order.product_id, ':');
  v_cash := v_parts[2]::int;
  v_bonus := v_parts[3]::int;

  insert into public.cash_wallets (user_id, balance) values (v_order.user_id, 0) on conflict (user_id) do nothing;

  if v_cash > 0 then
    insert into public.cash_ledger (user_id, kind, amount, order_id) values (v_order.user_id, 'charge', v_cash, v_order.id) on conflict do nothing;
    if found then
      update public.cash_wallets set balance = balance + v_cash, updated_at = now() where user_id = v_order.user_id;
      v_credited := true;
    end if;
  end if;
  if v_bonus > 0 then
    insert into public.cash_ledger (user_id, kind, amount, order_id) values (v_order.user_id, 'bonus', v_bonus, v_order.id) on conflict do nothing;
    if found then
      update public.cash_wallets set balance = balance + v_bonus, updated_at = now() where user_id = v_order.user_id;
      v_credited := true;
    end if;
  end if;

  return case when v_credited then 'credited' else 'already' end;
end;
$$;

revoke all on function public.admin_credit_question(uuid) from public, anon, authenticated;
grant execute on function public.admin_credit_question(uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 16번: 20261026000000_question_packs.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 16번째 마이그레이션 — 질문 묶음(주문)별 장부 · 부분 취소 반영 · 환불 중 동시 사용 안전 · 무료 질문 한도의 DB 보장
-- 앞의 파일들(1~15번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표 · 열 · 함수를 "더하기"하고, 13번의 장부 검사 조건(check)과 고유 조건 하나를 "넓혀서" 다시 만든다.
-- 기존 검사 · 회원 · 주문 · 결제 · 리포트 · 고민 · 대화 · 지갑 · 내역 데이터는 지우거나 바꾸지 않는다(이 파일을 실행하는 것만으로 누구의 질문도 늘거나 줄지 않는다).
-- 이 파일을 적용하기 전에 결제한 주문은 아래 "묶음 장부"에 없다 — 그 주문은 예전 방식(지갑 합계 기준)으로 계속 동작한다.
--
-- 왜 필요한가 (운영자 점검 2026-10-15)
--  1) 토스에서 일부만 취소(PARTIAL_CANCELED)해도 남은 질문이 장부에서 빠지지 않아, 환불받고도 질문을 계속 쓸 수 있었다.
--  2) 환불액을 질문 하나마다 올림하면 1개씩 세 번 환불할 때 834 × 3 = 2,502원이 된다 → 주문별 "누적" 환불액으로 계산한다.
--  3) 지갑 하나에 여러 묶음이 섞여 있으면 한 묶음을 환불할 때 다른 묶음의 질문까지 회수될 수 있었다.
--  4) 서버가 여러 대일 때 같은 방에 동시에 질문하면 무료 질문이 한도를 넘어 나갈 수 있었다.
--
-- 하는 일
--  - question_packs: 질문 3개 묶음 결제 주문 한 건마다 한 줄 — 산 질문 수 · 쓴 수 · 환불한 수 · 누적 환불액(원). 결제가 승인되는 같은 처리 안에서(트리거) 만든다.
--    남은 질문 = max(0, 산 수 − 쓴 수 − 환불한 수). 누적 환불액은 결제액을 넘을 수 없고(check), 전부 환불하면 정확히 결제액이 된다.
--  - 환불액 계산(question_refund_total): 누적 환불 질문 수 k에 대해 올림(결제액 × k ÷ 묶음 질문 수). 2,500원 · 3개면 834 → 1,667 → 2,500이고 한 번에 낸 금액들의 합은 언제나 결제액과 같다.
--  - apply_cash_refund(주문, 토스의 누적 취소액): 누적 취소액에 맞는 질문 수를 찾아 남은 질문을 회수한다. 같은 금액을 여러 번 반영해도 한 번만. 금액이 질문 수와 맞지 않으면 아무것도 바꾸지 않고 알린다.
--    이미 쓴 질문까지 환불해 버린 경우(동시에 쓴 경우 포함)는 회수하지 못한 몫(shortfall)으로 남긴다 — 질문이 마이너스가 되지 않는다.
--  - spend_cash · restore_cash_spend: 같은 지갑 잠금 순서로 묶음 장부를 함께 갱신한다(가장 먼저 산 묶음부터 쓴다). 환불과 동시에 써도 서로 어긋나지 않는다.
--  - 전액 취소(주문이 환불됨으로 바뀜): 묶음 장부가 있는 주문은 같은 함수로 그 묶음의 남은 질문만 회수한다(다른 묶음은 건드리지 않는다).
--  - reserve_chat_question 등: 무료 질문 한도를 DB에서 한 번에 확인 · 예약한다(같은 회원 · 같은 방은 순서대로). 답을 받지 못하면 풀고, 오래된 예약(10분)은 세지 않는다.
--
-- 하지 않는 일
--  - 환불을 실행하지 않는다(토스 관리자에서 운영자가 한다). 주문 상태를 손으로 바꾸지 않는다. 질문 · 환불 사유의 내용은 담지 않는다.
--  - 유효기간 · 환불 신청 접수 · 탈퇴 흐름은 정책 확정 뒤 별도 파일로 더한다 (docs/question-pack-policy-proposal.md).

-- ─────────────────────────────────────────────
-- 0) 질문 한 개의 장부 단위 — MIYU_CASH.perQuestion(3)과 같은 값이다(바꾸려면 새 마이그레이션 + db.test.ts가 두 값을 비교한다)
-- ─────────────────────────────────────────────
create or replace function public.question_units()
returns integer
language sql
immutable
as $$ select 3 $$;

-- 누적 환불 질문 수 k → 누적 환불액(원). 올림. 한 번에 나눠 환불해도 마지막 합은 항상 결제액
create or replace function public.question_refund_total(p_price integer, p_questions integer, p_k integer)
returns integer
language sql
immutable
as $$ select ((p_price::bigint * p_k + p_questions - 1) / p_questions)::integer $$;

-- ─────────────────────────────────────────────
-- 1) 내역 표 넓히기: 종류 refund_claw(부분 · 전액 환불로 회수) · 질문이 속한 묶음(pack_order_id) · 되돌림 0 허용
--    (내역은 쌓기만 한다 — 이 파일은 조건만 넓히고 기존 줄을 바꾸지 않는다)
-- ─────────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.cash_ledger'::regclass and contype = 'c' loop
    execute format('alter table public.cash_ledger drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.cash_ledger add column if not exists pack_order_id uuid references public.orders (id) on delete restrict;

alter table public.cash_ledger
  add constraint cash_ledger_kind_values check (kind in ('charge', 'bonus', 'spend', 'spend_restore', 'clawback', 'refund_claw')),
  add constraint cash_ledger_shortfall_nonneg check (shortfall >= 0),
  add constraint cash_ledger_ref_format check (ref is null or ref ~ '^[A-Za-z0-9_:.=-]{6,80}$'),
  add constraint cash_ledger_amount_by_kind check (
    (kind in ('charge', 'bonus') and amount > 0)
    or (kind = 'spend_restore' and amount >= 0)
    or (kind = 'spend' and amount < 0)
    or (kind in ('clawback', 'refund_claw') and amount <= 0)
  ),
  add constraint cash_ledger_refs_by_kind check (
    (kind in ('charge', 'bonus', 'clawback') and order_id is not null)
    or (kind in ('spend', 'spend_restore') and ref is not null)
    or (kind = 'refund_claw' and order_id is not null and ref is not null)
  );

-- 같은 주문의 같은 종류는 한 번만 — 단 부분 환불은 한 주문에 여러 번 들어올 수 있어 refund_claw는 참조번호(refund:<주문>:<누적 질문 수>)로 한 번씩만
drop index if exists public.cash_ledger_order_kind;
create unique index cash_ledger_order_kind on public.cash_ledger (order_id, kind) where order_id is not null and kind <> 'refund_claw';

-- ─────────────────────────────────────────────
-- 2) 묶음(주문)별 장부
-- ─────────────────────────────────────────────
create table public.question_packs (
  order_id uuid primary key references public.orders (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  questions integer not null check (questions > 0),
  price_krw integer not null check (price_krw > 0),
  -- 이 묶음에서 쓴 질문 수 (답을 받지 못해 되돌린 것은 뺀다)
  used integer not null default 0 check (used >= 0 and used <= questions),
  -- 환불로 정산한 질문 수와 누적 환불액(원)
  refunded_questions integer not null default 0 check (refunded_questions >= 0 and refunded_questions <= questions),
  refunded_krw integer not null default 0 check (refunded_krw >= 0 and refunded_krw <= price_krw),
  purchased_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index question_packs_user_idx on public.question_packs (user_id, purchased_at);

alter table public.question_packs enable row level security;
create policy "본인 질문 묶음 조회" on public.question_packs
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.question_packs from anon, authenticated, service_role;
grant select on public.question_packs to authenticated, service_role;

-- 묶음 장부 만들기: 질문 결제 주문(보너스 없음 · 질문 단위의 배수)에만. 이미 있으면 그대로 둔다.
create or replace function public.ensure_question_pack(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders%rowtype;
  v_parts text[];
  v_cash int;
  v_bonus int;
  v_units int := public.question_units();
begin
  select * into v_o from public.orders where id = p_order_id;
  if not found or v_o.product_id !~ '^cash-charge:[0-9]{1,6}:[0-9]{1,6}:[A-Za-z0-9]{6,32}$' then
    return;
  end if;
  v_parts := string_to_array(v_o.product_id, ':');
  v_cash := v_parts[2]::int;
  v_bonus := v_parts[3]::int;
  if v_bonus = 0 and v_cash > 0 and v_cash % v_units = 0 and v_o.amount > 0 then
    insert into public.question_packs (order_id, user_id, questions, price_krw, purchased_at)
      values (v_o.id, v_o.user_id, v_cash / v_units, v_o.amount, coalesce(v_o.approved_at, now()))
      on conflict (order_id) do nothing;
  end if;
end;
$$;

-- ─────────────────────────────────────────────
-- 3) 환불 반영 (서버만 부른다) — 누적 취소액 → 회수할 질문 수
--    돌려주는 값: {status: applied | already | no_pack | invalid_amount | amount_mismatch, ...}
-- ─────────────────────────────────────────────
create or replace function public.apply_cash_refund(p_order_id uuid, p_canceled_total integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_pack public.question_packs%rowtype;
  v_units int := public.question_units();
  v_balance int;
  v_k int;
  v_i int;
  v_delta int;
  v_remaining int;
  v_take int;
  v_ref text;
  v_allowed int[] := '{}';
begin
  select user_id into v_user from public.question_packs where order_id = p_order_id;
  if not found then
    return jsonb_build_object('status', 'no_pack');
  end if;

  -- 지갑 행을 먼저 잠근다 — 질문 사용(spend_cash)과 같은 순서라 환불과 사용이 동시에 와도 한 줄로 이어서 처리된다
  select balance into v_balance from public.cash_wallets where user_id = v_user for update;
  select * into v_pack from public.question_packs where order_id = p_order_id for update;

  for v_i in 1..v_pack.questions loop
    v_allowed := v_allowed || public.question_refund_total(v_pack.price_krw, v_pack.questions, v_i);
  end loop;

  if p_canceled_total is null or p_canceled_total <= 0 or p_canceled_total > v_pack.price_krw then
    return jsonb_build_object('status', 'invalid_amount', 'allowed', to_jsonb(v_allowed));
  end if;

  v_k := null;
  for v_i in 1..v_pack.questions loop
    if public.question_refund_total(v_pack.price_krw, v_pack.questions, v_i) = p_canceled_total then
      v_k := v_i;
      exit;
    end if;
  end loop;
  if v_k is null then
    -- 이미 결제사에서 취소된 금액이 질문 수에 맞지 않는다 — 장부는 바꾸지 않고 운영자가 확인하게 알린다
    return jsonb_build_object('status', 'amount_mismatch', 'allowed', to_jsonb(v_allowed), 'refunded_krw', v_pack.refunded_krw);
  end if;

  if v_k <= v_pack.refunded_questions then
    return jsonb_build_object('status', 'already', 'questions', v_pack.refunded_questions, 'refunded_krw', v_pack.refunded_krw);
  end if;

  v_delta := v_k - v_pack.refunded_questions;
  v_remaining := greatest(0, v_pack.questions - v_pack.used - v_pack.refunded_questions);
  -- 남은 질문이 지갑에 실제로 있는 만큼만 회수한다 (회수할 수 없는 몫은 shortfall로 남긴다)
  v_take := least(v_delta, v_remaining, coalesce(v_balance, 0) / v_units);
  v_ref := 'refund:' || p_order_id::text || ':' || v_k::text;

  update public.question_packs
     set refunded_questions = v_k, refunded_krw = p_canceled_total, updated_at = now()
   where order_id = p_order_id;

  insert into public.cash_ledger (user_id, kind, amount, order_id, ref, shortfall)
    values (v_user, 'refund_claw', -(v_take * v_units), p_order_id, v_ref, (v_delta - v_take) * v_units);

  if v_take > 0 then
    update public.cash_wallets set balance = balance - v_take * v_units, updated_at = now() where user_id = v_user;
  end if;

  return jsonb_build_object(
    'status', 'applied',
    'questions', v_k,
    'refunded_krw', p_canceled_total,
    'clawed', v_take,
    'shortfall', v_delta - v_take
  );
end;
$$;

-- ─────────────────────────────────────────────
-- 4) 충전 · 전액 취소 트리거 갱신 (13번 함수를 같은 이름으로 다시 정의 — 예전 주문 처리는 그대로)
-- ─────────────────────────────────────────────
create or replace function public.cash_on_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parts text[];
  v_cash int;
  v_bonus int;
  v_credited int;
  v_balance int;
  v_take int;
begin
  if new.product_id !~ '^cash-charge:[0-9]{1,6}:[0-9]{1,6}:[A-Za-z0-9]{6,32}$' then
    return new;
  end if;
  v_parts := string_to_array(new.product_id, ':');
  v_cash := v_parts[2]::int;
  v_bonus := v_parts[3]::int;

  if new.status = 'paid' and old.status is distinct from 'paid' then
    insert into public.cash_wallets (user_id, balance) values (new.user_id, 0) on conflict (user_id) do nothing;

    if v_cash > 0 then
      insert into public.cash_ledger (user_id, kind, amount, order_id) values (new.user_id, 'charge', v_cash, new.id) on conflict do nothing;
      if found then
        update public.cash_wallets set balance = balance + v_cash, updated_at = now() where user_id = new.user_id;
        perform public.ensure_question_pack(new.id);
      end if;
    end if;
    if v_bonus > 0 then
      insert into public.cash_ledger (user_id, kind, amount, order_id) values (new.user_id, 'bonus', v_bonus, new.id) on conflict do nothing;
      if found then
        update public.cash_wallets set balance = balance + v_bonus, updated_at = now() where user_id = new.user_id;
      end if;
    end if;

  elsif new.status = 'refunded' and old.status = 'paid' then
    if exists (select 1 from public.question_packs where order_id = new.id) then
      -- 묶음 장부가 있는 주문: 전액 취소 = 결제액 전체를 누적 환불로 반영한다 (이 묶음의 남은 질문만 회수, 다른 묶음은 그대로)
      begin
        perform public.apply_cash_refund(new.id, new.amount);
      exception when others then
        -- 주문 상태(결제사 기록)를 막지 않는다. 반영하지 못했으면 check-cash.sql이 "환불됨인데 회수 내역 없음"으로 찾는다
        raise warning 'apply_cash_refund failed for order %: %', new.id, sqlerrm;
      end;
    else
      -- 묶음 장부가 없는 예전 주문: 13번과 같은 방식(지갑 잔액 한도 안에서 회수)
      select coalesce(sum(amount), 0) into v_credited
        from public.cash_ledger where order_id = new.id and kind in ('charge', 'bonus');
      if v_credited > 0 then
        select balance into v_balance from public.cash_wallets where user_id = new.user_id for update;
        v_take := least(coalesce(v_balance, 0), v_credited);
        insert into public.cash_ledger (user_id, kind, amount, order_id, shortfall)
          values (new.user_id, 'clawback', -v_take, new.id, v_credited - v_take)
          on conflict do nothing;
        if found and v_take > 0 then
          update public.cash_wallets set balance = balance - v_take, updated_at = now() where user_id = new.user_id;
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────
-- 5) 질문 사용 · 되돌림 (13번 함수를 같은 이름으로 다시 정의) — 묶음 장부를 함께 갱신
--    잠금 순서: 지갑 행 → 묶음 행. 환불(apply_cash_refund) · 충전도 같은 순서다.
-- ─────────────────────────────────────────────
create or replace function public.spend_cash(p_user_id uuid, p_amount int, p_ref text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance int;
  v_pack uuid := null;
  v_units int := public.question_units();
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'cash_invalid_amount';
  end if;
  update public.cash_wallets
     set balance = balance - p_amount, updated_at = now()
   where user_id = p_user_id and balance >= p_amount
  returning balance into v_balance;
  if not found then
    return null; -- 잔액이 모자라거나 지갑이 없다. 아무것도 바꾸지 않는다
  end if;

  -- 질문 한 개를 쓰는 것이면 가장 먼저 산 묶음 중 남은 질문이 있는 묶음에서 쓴다 (묶음 장부가 없는 예전 질문은 지갑에서만 빠진다)
  if p_amount = v_units then
    select order_id into v_pack from public.question_packs
     where user_id = p_user_id and questions - used - refunded_questions > 0
     order by purchased_at, order_id
     limit 1
     for update;
    if found then
      update public.question_packs set used = used + 1, updated_at = now() where order_id = v_pack;
    else
      v_pack := null;
    end if;
  end if;

  insert into public.cash_ledger (user_id, kind, amount, ref, pack_order_id) values (p_user_id, 'spend', -p_amount, p_ref, v_pack);
  return v_balance;
end;
$$;

create or replace function public.restore_cash_spend(p_user_id uuid, p_ref text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount int;
  v_pack uuid;
  v_rec public.question_packs%rowtype;
  v_before int;
  v_after int;
  v_add int;
  v_balance int;
begin
  select -amount, pack_order_id into v_amount, v_pack
    from public.cash_ledger where user_id = p_user_id and ref = p_ref and kind = 'spend';
  if v_amount is null then
    return null; -- 되돌릴 차감이 없다
  end if;

  perform 1 from public.cash_wallets where user_id = p_user_id for update;

  if v_pack is null then
    v_add := v_amount;
  else
    select * into v_rec from public.question_packs where order_id = v_pack for update;
    v_before := greatest(0, v_rec.questions - v_rec.used - v_rec.refunded_questions);
    v_after := greatest(0, v_rec.questions - greatest(v_rec.used - 1, 0) - v_rec.refunded_questions);
    -- 그 사이 이 묶음이 환불로 정산됐다면 되돌린 질문은 이미 환불에 포함된 것이라 지갑에 다시 넣지 않는다
    v_add := (v_after - v_before) * v_amount;
  end if;

  insert into public.cash_ledger (user_id, kind, amount, ref, pack_order_id) values (p_user_id, 'spend_restore', v_add, p_ref, v_pack) on conflict do nothing;
  if not found then
    return null; -- 이미 되돌렸다
  end if;
  if v_pack is not null then
    update public.question_packs set used = greatest(used - 1, 0), updated_at = now() where order_id = v_pack;
  end if;
  update public.cash_wallets set balance = balance + v_add, updated_at = now() where user_id = p_user_id returning balance into v_balance;
  return v_balance;
end;
$$;

-- ─────────────────────────────────────────────
-- 6) 운영자 수동 질문 반영(15번)도 묶음 장부를 같이 만든다 — 나머지 동작은 15번과 같다
-- ─────────────────────────────────────────────
create or replace function public.admin_credit_question(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_parts text[];
  v_cash int;
  v_bonus int;
  v_credited boolean := false;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_order.product_id !~ '^cash-charge:[0-9]{1,6}:[0-9]{1,6}:[A-Za-z0-9]{6,32}$' then
    return 'not_cash';
  end if;
  if v_order.status <> 'paid' then
    return 'not_paid';
  end if;

  v_parts := string_to_array(v_order.product_id, ':');
  v_cash := v_parts[2]::int;
  v_bonus := v_parts[3]::int;

  insert into public.cash_wallets (user_id, balance) values (v_order.user_id, 0) on conflict (user_id) do nothing;

  if v_cash > 0 then
    insert into public.cash_ledger (user_id, kind, amount, order_id) values (v_order.user_id, 'charge', v_cash, v_order.id) on conflict do nothing;
    if found then
      update public.cash_wallets set balance = balance + v_cash, updated_at = now() where user_id = v_order.user_id;
      perform public.ensure_question_pack(v_order.id);
      v_credited := true;
    end if;
  end if;
  if v_bonus > 0 then
    insert into public.cash_ledger (user_id, kind, amount, order_id) values (v_order.user_id, 'bonus', v_bonus, v_order.id) on conflict do nothing;
    if found then
      update public.cash_wallets set balance = balance + v_bonus, updated_at = now() where user_id = v_order.user_id;
      v_credited := true;
    end if;
  end if;

  return case when v_credited then 'credited' else 'already' end;
end;
$$;

-- ─────────────────────────────────────────────
-- 7) 무료 질문 한도를 DB에서 보장 — 같은 회원 · 같은 방은 한 줄로 확인하고 예약한다
--    예약(reserved)은 10분 안에만 세고, 답이 오면 확정(done), 답을 받지 못하면 풀어 준다.
-- ─────────────────────────────────────────────
alter table public.chat_questions add column if not exists state text not null default 'done' check (state in ('done', 'reserved'));
alter table public.chat_questions add column if not exists reserved_until timestamptz;
alter table public.chat_questions add constraint chat_questions_reserved_until check (state <> 'reserved' or reserved_until is not null);

create or replace function public.count_chat_questions_in_room(p_user_id uuid, p_room_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.chat_questions
   where user_id = p_user_id and room_key = p_room_key and (state = 'done' or reserved_until > now())
$$;

create or replace function public.reserve_chat_question(p_user_id uuid, p_assessment_id uuid, p_room_key text, p_max integer)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used int;
  v_id bigint;
begin
  if p_user_id is null or p_assessment_id is null or p_room_key is null or p_max is null or p_max < 0 then
    raise exception 'chat_invalid_input';
  end if;
  -- 같은 회원 · 같은 방의 확인 · 예약은 한 번에 하나씩 (여러 서버에서 동시에 와도)
  perform pg_advisory_xact_lock(hashtextextended('chatq:' || p_user_id::text || ':' || p_room_key, 0));
  delete from public.chat_questions where user_id = p_user_id and state = 'reserved' and reserved_until <= now();
  select count(*) into v_used from public.chat_questions
   where user_id = p_user_id and room_key = p_room_key and (state = 'done' or reserved_until > now());
  if v_used >= p_max then
    return null;
  end if;
  insert into public.chat_questions (user_id, assessment_id, room_key, state, reserved_until)
    values (p_user_id, p_assessment_id, p_room_key, 'reserved', now() + interval '10 minutes')
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.confirm_chat_question(p_id bigint, p_user_id uuid, p_assessment_id uuid, p_room_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.chat_questions where id = p_id and user_id = p_user_id and state = 'done') then
    return;
  end if;
  update public.chat_questions set state = 'done', reserved_until = null where id = p_id and user_id = p_user_id and state = 'reserved';
  if not found then
    -- 예약이 만료돼 지워졌더라도(답이 10분 넘게 걸림) 답을 받은 질문은 센다
    insert into public.chat_questions (user_id, assessment_id, room_key, state) values (p_user_id, p_assessment_id, p_room_key, 'done');
  end if;
end;
$$;

create or replace function public.release_chat_question(p_id bigint, p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.chat_questions where id = p_id and user_id = p_user_id and state = 'reserved'
$$;

-- ─────────────────────────────────────────────
-- 8) 권한: 서버(비밀키)만 함수를 부른다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다.
-- ─────────────────────────────────────────────
revoke all on function public.question_units() from public, anon, authenticated;
revoke all on function public.question_refund_total(integer, integer, integer) from public, anon, authenticated;
revoke all on function public.ensure_question_pack(uuid) from public, anon, authenticated;
revoke all on function public.apply_cash_refund(uuid, integer) from public, anon, authenticated;
revoke all on function public.spend_cash(uuid, int, text) from public, anon, authenticated;
revoke all on function public.restore_cash_spend(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_credit_question(uuid) from public, anon, authenticated;
revoke all on function public.count_chat_questions_in_room(uuid, text) from public, anon, authenticated;
revoke all on function public.reserve_chat_question(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.confirm_chat_question(bigint, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.release_chat_question(bigint, uuid) from public, anon, authenticated;

grant execute on function public.question_units() to service_role;
grant execute on function public.question_refund_total(integer, integer, integer) to service_role;
grant execute on function public.apply_cash_refund(uuid, integer) to service_role;
grant execute on function public.spend_cash(uuid, int, text) to service_role;
grant execute on function public.restore_cash_spend(uuid, text) to service_role;
grant execute on function public.admin_credit_question(uuid) to service_role;
grant execute on function public.count_chat_questions_in_room(uuid, text) to service_role;
grant execute on function public.reserve_chat_question(uuid, uuid, text, integer) to service_role;
grant execute on function public.confirm_chat_question(bigint, uuid, uuid, text) to service_role;
grant execute on function public.release_chat_question(bigint, uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 17번: 20261027000000_taste_reports.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 17번째 마이그레이션 — 맛보기 리포트(무료 · 로그인한 회원만 · 한 계정당 1번)
-- 앞의 파일들(1~16번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표와 함수를 "더하기만" 한다. 기존 검사 · 회원 · 주문 · 결제 · 리포트 · 대화 · 질문 장부 데이터는 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
-- 탈퇴 함수(withdraw_member_data)는 맛보기 리포트를 함께 지우도록 아래에서 갱신한다(주문이 있는 검사는 지워지지 않고 비워지기만 하므로 연쇄 삭제만으로는 부족하다).
--
-- 하는 일
--  - taste_reports: 무료 분석을 마친 회원이 [맛보기 리포트 받기]를 누르면 AI가 사주 · 응답을 엮어 쓴 짧은 글(나는 이런 사람 · 연애 · 일 · 마음)을 한 번만 만들어 저장한다.
--    회원 한 명당 한 줄(user_id가 기본 키)이라 "한 계정당 1번"을 DB가 지킨다. 저장된 글은 검사(형식 · 금지 표현 · 쉬운 말)를 통과한 것뿐이다.
--    status = 'pending' → 작성 중(예약, 5분 안에서만 유효 — 서버가 죽어 남은 예약은 영원히 잠기지 않는다) · 'ready' → 완성.
--  - reserve_taste_report / save_taste_report / release_taste_report: 예약 → 저장(또는 실패하면 풀기). 같은 회원의 동시 요청은 한 번에 하나씩 처리한다.
--  - 브라우저는 본인 줄 조회만, 쓰기는 서버가 소유자를 확인한 뒤에(서버 비밀키 함수로만).
--
-- 하지 않는 일
--  - 질문 · 사용자가 적은 글은 담지 않는다. 담는 것은 AI가 쓴 맛보기 글(JSON)과 어떤 모델 · 지시문 버전으로 썼는지뿐이다.
--  - 이미 결제한 리포트와는 상관없다. 이 표는 무료 맛보기 전용이다.

create table public.taste_reports (
  -- 한 계정당 1번: 회원 한 명이 한 줄만 가진다
  user_id uuid primary key references auth.users (id) on delete cascade,
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  status text not null check (status in ('pending', 'ready')),
  -- { version, headline, sections: [{ id, title, body }] } — 검사를 통과한 글만. 크기를 제한한다
  content jsonb check (content is null or (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 32768)),
  generator text,
  generator_version text,
  -- 작성 중(pending)일 때만: 이 시각까지 예약이 유효하다
  reserved_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint taste_reports_ready_has_content check (status <> 'ready' or content is not null)
);

create index taste_reports_assessment_idx on public.taste_reports (assessment_id);

-- 검사 결과의 주인과 같은 회원만 (서버 코드 실수로 다른 회원의 결과에 붙지 않게)
create or replace function public.taste_reports_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.user_id
  ) then
    raise exception 'taste report owner mismatch';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger taste_reports_owner before insert or update on public.taste_reports
  for each row execute function public.taste_reports_owner_check();

alter table public.taste_reports enable row level security;

create policy "본인 맛보기 리포트 조회" on public.taste_reports
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.taste_reports from anon, authenticated;
grant select on public.taste_reports to authenticated;
grant select, insert, update, delete on public.taste_reports to service_role;

-- ─────────────────────────────────────────────
-- 예약 → 저장 / 풀기. 서버(비밀키)만 부른다.
-- ─────────────────────────────────────────────

-- 결과: { state: 'reserved' } 새로 쓸 수 있다 · { state: 'busy' } 다른 요청이 쓰는 중 · { state: 'ready', assessmentId, content, generator, generatorVersion, createdAt } 이미 받았다
create or replace function public.reserve_taste_report(p_user_id uuid, p_assessment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.taste_reports%rowtype;
begin
  if p_user_id is null or p_assessment_id is null then
    raise exception 'taste_invalid_input';
  end if;
  -- 같은 회원의 확인 · 예약은 한 번에 하나씩 (여러 서버에서 동시에 와도)
  perform pg_advisory_xact_lock(hashtextextended('taste:' || p_user_id::text, 0));
  select * into r from public.taste_reports where user_id = p_user_id;
  if found then
    if r.status = 'ready' then
      return jsonb_build_object(
        'state', 'ready',
        'assessmentId', r.assessment_id,
        'content', r.content,
        'generator', r.generator,
        'generatorVersion', r.generator_version,
        'createdAt', r.created_at
      );
    end if;
    if r.reserved_until is not null and r.reserved_until > now() then
      return jsonb_build_object('state', 'busy');
    end if;
    -- 오래된 예약(서버가 죽었거나 답이 오지 않음)은 이어받는다
    update public.taste_reports
       set assessment_id = p_assessment_id, reserved_until = now() + interval '5 minutes'
     where user_id = p_user_id;
    return jsonb_build_object('state', 'reserved');
  end if;
  insert into public.taste_reports (user_id, assessment_id, status, reserved_until)
    values (p_user_id, p_assessment_id, 'pending', now() + interval '5 minutes');
  return jsonb_build_object('state', 'reserved');
end;
$$;

create or replace function public.save_taste_report(p_user_id uuid, p_assessment_id uuid, p_content jsonb, p_generator text, p_generator_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.taste_reports
     set status = 'ready', content = p_content, generator = p_generator, generator_version = p_generator_version, reserved_until = null
   where user_id = p_user_id and assessment_id = p_assessment_id and status = 'pending';
  if not found then
    -- 예약이 만료돼 다른 요청이 이어받았거나 지워졌다 — 저장하지 않는다
    raise exception 'taste_not_reserved';
  end if;
end;
$$;

-- 글을 만들지 못했을 때: 예약을 풀어 다시 받을 수 있게 한다(받은 것으로 세지 않는다). 이미 완성된 줄은 건드리지 않는다
create or replace function public.release_taste_report(p_user_id uuid, p_assessment_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.taste_reports where user_id = p_user_id and assessment_id = p_assessment_id and status = 'pending'
$$;

revoke all on function public.reserve_taste_report(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_taste_report(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.release_taste_report(uuid, uuid) from public, anon, authenticated;

grant execute on function public.reserve_taste_report(uuid, uuid) to service_role;
grant execute on function public.save_taste_report(uuid, uuid, jsonb, text, text) to service_role;
grant execute on function public.release_taste_report(uuid, uuid) to service_role;

-- ─────────────────────────────────────────────
-- 회원 탈퇴 함수 갱신: 맛보기 리포트(AI가 쓴 글)도 지운다.
-- 주문이 있는 검사는 탈퇴 때 지워지지 않고 내용만 비워지므로(주문 · 결제 기록 보존), 외래 키 연쇄 삭제만으로는 글이 남을 수 있다.
-- 아래 함수는 14번(20261024000000_chat_summaries.sql)의 탈퇴 함수에 "맛보기 리포트 삭제" 한 단계와 결과의 taste_reports 개수만 더한 것이다.
-- ─────────────────────────────────────────────

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
  v_concerns int := 0;
  v_feedback int := 0;
  v_regions int := 0;
  v_talks int := 0;
  v_questions int := 0;
  v_summaries int := 0;
  v_tastes int := 0;
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
  -- 남은 미유캐시가 있으면 처리하지 않는다 (다 쓰거나 환불 문의를 마친 뒤에 다시 — 정책 확정 전 초안, docs/cash-policy.md)
  if exists (select 1 from public.cash_wallets where user_id = p_user_id and balance > 0) then
    raise exception 'withdraw_blocked_cash_balance';
  end if;

  delete from public.report_feedback where user_id = p_user_id;
  get diagnostics v_feedback = row_count;

  delete from public.personal_contexts where user_id = p_user_id;
  get diagnostics v_contexts = row_count;

  -- 고민 기록(고객이 적은 내용) 삭제
  delete from public.concern_records where user_id = p_user_id;
  get diagnostics v_concerns = row_count;

  -- 대화(채팅방에 저장한 눌렀던 행동 · 자유 질문 · 미유의 답)와 질문 횟수 기록 삭제
  delete from public.talk_rooms where user_id = p_user_id;
  get diagnostics v_talks = row_count;
  delete from public.chat_questions where user_id = p_user_id;
  get diagnostics v_questions = row_count;

  -- 채팅 요약(직접 저장한 것 · 저장하지 않고 끝낸 대화의 참고 기록) 삭제
  delete from public.chat_summaries where user_id = p_user_id;
  get diagnostics v_summaries = row_count;

  -- 맛보기 리포트(AI가 쓴 글) 삭제 — 주문이 있는 검사는 지워지지 않고 비워지기만 하므로 여기서 직접 지운다
  delete from public.taste_reports where user_id = p_user_id;
  get diagnostics v_tastes = row_count;

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
    'concern_records', v_concerns,
    'feedback', v_feedback,
    'regions', v_regions,
    'talk_rooms', v_talks,
    'chat_questions', v_questions,
    'chat_summaries', v_summaries,
    'taste_reports', v_tastes
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 18번: 20261028000000_invites.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 18번째 마이그레이션 — 초대 링크와 초대 할인(심층 리포트 9,900원 → 5,900원)
-- 앞의 파일들(1~17번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- 이 파일은 표와 함수를 "더하기만" 한다(탈퇴 함수에는 초대 링크 삭제 한 단계를 더한다). 기존 검사 · 회원 · 주문 · 결제 · 리포트 · 대화 · 질문 장부 데이터는 이 파일을 실행하는 것만으로는 바뀌거나 지워지지 않는다.
--
-- 운영자 결정(2026-10-16):
--  - 심층 리포트를 구매한 회원이 초대 링크를 만든다. 링크로 들어온 사람이 심층 리포트를 처음 살 때 5,900원(정가 9,900원).
--  - "계정당 3번" = 초대한 사람 한 명당 3명까지(한도 값은 앱이 정해 함수에 넘긴다). 초대받은 사람은 첫 구매 1회.
--  - 궁합(심층 궁합)은 별도 유료이며 이 파일의 범위가 아니다.
--
-- 하는 일
--  - invites: 초대 링크. 검사 결과(심층 리포트를 산 결과)마다 하나. 링크에는 이름 · 생년월일이 없고 무작위 토큰뿐이다. 서버만 쓰고 본인(초대한 사람)만 읽는다.
--  - invite_discounts: 초대 할인을 받은 기록. 초대받은 회원 한 명당 한 줄(그 사람은 평생 한 번만) — 주문 기록처럼 탈퇴 뒤에도 남는다(회원번호 · 주문번호뿐, 개인정보 없음).
--  - invite_discount_status: 지금 이 사람이 이 링크로 할인을 받을 수 있는지 읽기만 한다(화면의 가격 표시용).
--  - claim_invite_discount: 이미 만든 주문(5,900원)에 할인을 확정한다. 초대한 사람별 잠금 안에서 한도 · 첫 구매 · 본인 링크 · 초대한 사람의 구매 상태를 확인하므로 동시에 눌러도 한도를 넘지 않는다.
--    확정하지 못하면 아무것도 바꾸지 않고 이유만 돌려준다(앱이 그 주문을 취소하고 정가 주문을 만든다).
--
-- 한도에 세는 것: 결제 완료 주문 + 결제 대기 1시간 이내 주문. 환불된 주문 · 취소된 주문은 세지 않는다(단, 환불받은 사람이 다시 할인받지는 못한다 — 첫 구매 1회).
-- 결제 대기가 1시간을 넘긴 할인 주문은 같은 초대한 사람의 다음 확인 때 취소한다(그 주문으로 나중에 결제돼 한도를 넘는 일을 막는다).

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  -- 링크에 들어가는 무작위 토큰(24자) — 이름 · 생년월일 · 회원번호가 아니다
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24}$'),
  inviter_user_id uuid not null references auth.users (id) on delete cascade,
  -- 심층 리포트를 산 결과 하나에 링크 하나
  assessment_id uuid not null unique references public.assessments (id) on delete cascade,
  -- 만든 때의 초대한 사람의 등급: deep = 심층 리포트 구매자(할인 대상 링크) · free = 무료 리포트(나중에 궁합용, 할인 없음)
  inviter_tier text not null check (inviter_tier in ('deep', 'free')),
  created_at timestamptz not null default now()
);

create index invites_inviter_idx on public.invites (inviter_user_id);

-- 초대한 사람 = 그 검사 결과의 주인 (서버 코드 실수로 남의 결과에 붙지 않게)
create or replace function public.invites_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.assessments a where a.id = new.assessment_id and a.user_id = new.inviter_user_id
  ) then
    raise exception 'invite owner mismatch';
  end if;
  return new;
end;
$$;

create trigger invites_owner before insert on public.invites
  for each row execute function public.invites_owner_check();

alter table public.invites enable row level security;

create policy "본인 초대 링크 조회" on public.invites
  for select to authenticated using (inviter_user_id = (select auth.uid()));

revoke all on public.invites from anon, authenticated;
grant select on public.invites to authenticated;
grant select, insert, update, delete on public.invites to service_role;

-- 초대 할인을 받은 기록 — 초대받은 회원 한 명당 한 줄(평생 한 번). 주문과 같은 성격의 기록이라 링크가 지워져도 남는다
create table public.invite_discounts (
  invitee_user_id uuid primary key references auth.users (id) on delete cascade,
  invite_id uuid references public.invites (id) on delete set null,
  inviter_user_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invite_discounts_not_self check (invitee_user_id <> inviter_user_id)
);

create index invite_discounts_inviter_idx on public.invite_discounts (inviter_user_id);

alter table public.invite_discounts enable row level security;
-- 브라우저에는 어떤 접근도 주지 않는다(정책 없음) — 서버만 읽고 쓴다
revoke all on public.invite_discounts from anon, authenticated;
grant select, insert, update, delete on public.invite_discounts to service_role;

-- ─────────────────────────────────────────────
-- 상태 확인(읽기만) · 확정. 서버(비밀키)만 부른다.
-- ─────────────────────────────────────────────

-- 이 사람이 이 링크로 할인을 받을 수 있는가. 결과: { ok: true, remaining } 또는 { ok: false, reason }
--  reason: invalid(없는 링크) · not-deep(할인 대상 링크가 아님) · self(본인 링크) · inviter-not-paid(초대한 사람의 구매가 지금은 확인되지 않음)
--          · already-used(이미 초대 할인을 받았다) · not-first(이미 심층 리포트를 샀다) · cap(초대한 사람의 한도가 찼다)
create or replace function public.invite_discount_status(p_token text, p_invitee uuid, p_cap integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  own public.invite_discounts%rowtype;
  own_status text;
  used integer;
begin
  select * into inv from public.invites where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if inv.inviter_tier <> 'deep' then return jsonb_build_object('ok', false, 'reason', 'not-deep'); end if;
  if inv.inviter_user_id = p_invitee then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if not exists (
    select 1 from public.orders o
     where o.user_id = inv.inviter_user_id and o.status = 'paid'
       and (o.product_id = 'personal-integrated-report' or o.product_id like 'personal-integrated-report:r%')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'inviter-not-paid');
  end if;

  select * into own from public.invite_discounts where invitee_user_id = p_invitee;
  if found then
    select o.status into own_status from public.orders o where o.id = own.order_id;
    if own_status in ('paid', 'refunded') then return jsonb_build_object('ok', false, 'reason', 'already-used'); end if;
  elsif exists (
    select 1 from public.orders o
     where o.user_id = p_invitee and o.status in ('paid', 'refunded')
       and (o.product_id = 'personal-integrated-report' or o.product_id like 'personal-integrated-report:r%')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not-first');
  end if;

  select count(*) into used
    from public.invite_discounts d join public.orders o on o.id = d.order_id
   where d.inviter_user_id = inv.inviter_user_id and d.invitee_user_id <> p_invitee
     and (o.status = 'paid' or (o.status = 'pending' and o.created_at > now() - interval '1 hour'));
  if used >= p_cap then return jsonb_build_object('ok', false, 'reason', 'cap'); end if;
  return jsonb_build_object('ok', true, 'remaining', p_cap - used);
end;
$$;

-- 이미 만든 결제 대기 주문(5,900원)에 할인을 확정한다. 결과는 invite_discount_status와 같은 모양(+ 이유 order-mismatch).
create or replace function public.claim_invite_discount(p_token text, p_invitee uuid, p_order uuid, p_cap integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites%rowtype;
  ord public.orders%rowtype;
  own public.invite_discounts%rowtype;
  own_status text;
  used integer;
begin
  select * into inv from public.invites where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  -- 초대한 사람별로 한 번에 하나씩 (여러 서버에서 동시에 와도 한도를 넘지 않는다)
  perform pg_advisory_xact_lock(hashtextextended('invite:' || inv.inviter_user_id::text, 0));
  -- 잠금을 잡은 뒤 다시 읽는다(그 사이에 링크가 바뀌었을 수 있다)
  select * into inv from public.invites where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if inv.inviter_tier <> 'deep' then return jsonb_build_object('ok', false, 'reason', 'not-deep'); end if;
  if inv.inviter_user_id = p_invitee then return jsonb_build_object('ok', false, 'reason', 'self'); end if;

  select * into ord from public.orders where id = p_order;
  -- 주문은 이 사람의 결제 대기 주문이고 심층 리포트의 첫 구매 상품이어야 한다
  if not found or ord.user_id <> p_invitee or ord.status <> 'pending' or ord.product_id <> 'personal-integrated-report' then
    return jsonb_build_object('ok', false, 'reason', 'order-mismatch');
  end if;

  if not exists (
    select 1 from public.orders o
     where o.user_id = inv.inviter_user_id and o.status = 'paid'
       and (o.product_id = 'personal-integrated-report' or o.product_id like 'personal-integrated-report:r%')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'inviter-not-paid');
  end if;

  select * into own from public.invite_discounts where invitee_user_id = p_invitee;
  if found then
    select o.status into own_status from public.orders o where o.id = own.order_id;
    if own_status in ('paid', 'refunded') then return jsonb_build_object('ok', false, 'reason', 'already-used'); end if;
  elsif exists (
    select 1 from public.orders o
     where o.user_id = p_invitee and o.status in ('paid', 'refunded')
       and (o.product_id = 'personal-integrated-report' or o.product_id like 'personal-integrated-report:r%')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not-first');
  end if;

  -- 결제 대기가 1시간을 넘긴 이 초대한 사람의 할인 주문은 취소한다(나중에 결제돼 한도를 넘지 않게). 이 사람 자신의 이전 주문은 아래에서 따로 정리한다
  update public.orders o
     set status = 'canceled', failure_code = 'DISCOUNT_STALE', failure_message = '초대 할인 결제 대기 시간이 지나 취소됨'
   where o.status = 'pending' and o.created_at <= now() - interval '1 hour'
     and o.id in (select d.order_id from public.invite_discounts d where d.inviter_user_id = inv.inviter_user_id and d.invitee_user_id <> p_invitee);

  select count(*) into used
    from public.invite_discounts d join public.orders o on o.id = d.order_id
   where d.inviter_user_id = inv.inviter_user_id and d.invitee_user_id <> p_invitee
     and (o.status = 'paid' or (o.status = 'pending' and o.created_at > now() - interval '1 hour'));
  if used >= p_cap then return jsonb_build_object('ok', false, 'reason', 'cap'); end if;

  if own.invitee_user_id is not null then
    -- 이 사람의 이전 할인 주문이 결제 대기로 남아 있으면 취소한다(두 주문 모두 5,900원으로 결제되는 일을 막는다)
    if own.order_id <> p_order then
      update public.orders set status = 'canceled', failure_code = 'DISCOUNT_REPLACED', failure_message = '새 초대 할인 주문으로 대체됨'
       where id = own.order_id and status = 'pending';
    end if;
    update public.invite_discounts
       set invite_id = inv.id, inviter_user_id = inv.inviter_user_id, order_id = p_order, updated_at = now()
     where invitee_user_id = p_invitee;
  else
    insert into public.invite_discounts (invitee_user_id, invite_id, inviter_user_id, order_id)
      values (p_invitee, inv.id, inv.inviter_user_id, p_order);
  end if;
  return jsonb_build_object('ok', true, 'remaining', p_cap - used - 1);
end;
$$;

revoke all on function public.invite_discount_status(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_invite_discount(text, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.invite_discount_status(text, uuid, integer) to service_role;
grant execute on function public.claim_invite_discount(text, uuid, uuid, integer) to service_role;

-- ─────────────────────────────────────────────
-- 회원 탈퇴 함수 갱신: 초대 링크를 지운다(링크가 더는 열리지 않는다).
-- 초대 할인 기록(invite_discounts)은 주문 기록과 같은 성격(회원번호 · 주문번호뿐)이라 남긴다.
-- 아래 함수는 17번(20261027000000_taste_reports.sql)의 탈퇴 함수에 "초대 링크 삭제" 한 단계와 결과의 invites 개수만 더한 것이다.
-- ─────────────────────────────────────────────

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
  v_concerns int := 0;
  v_feedback int := 0;
  v_regions int := 0;
  v_talks int := 0;
  v_questions int := 0;
  v_summaries int := 0;
  v_tastes int := 0;
  v_invites int := 0;
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
  -- 남은 미유캐시가 있으면 처리하지 않는다 (다 쓰거나 환불 문의를 마친 뒤에 다시 — 정책 확정 전 초안, docs/cash-policy.md)
  if exists (select 1 from public.cash_wallets where user_id = p_user_id and balance > 0) then
    raise exception 'withdraw_blocked_cash_balance';
  end if;

  delete from public.report_feedback where user_id = p_user_id;
  get diagnostics v_feedback = row_count;

  delete from public.personal_contexts where user_id = p_user_id;
  get diagnostics v_contexts = row_count;

  -- 고민 기록(고객이 적은 내용) 삭제
  delete from public.concern_records where user_id = p_user_id;
  get diagnostics v_concerns = row_count;

  -- 대화(채팅방에 저장한 눌렀던 행동 · 자유 질문 · 미유의 답)와 질문 횟수 기록 삭제
  delete from public.talk_rooms where user_id = p_user_id;
  get diagnostics v_talks = row_count;
  delete from public.chat_questions where user_id = p_user_id;
  get diagnostics v_questions = row_count;

  -- 채팅 요약(직접 저장한 것 · 저장하지 않고 끝낸 대화의 참고 기록) 삭제
  delete from public.chat_summaries where user_id = p_user_id;
  get diagnostics v_summaries = row_count;

  -- 맛보기 리포트(AI가 쓴 글) 삭제 — 주문이 있는 검사는 지워지지 않고 비워지기만 하므로 여기서 직접 지운다
  delete from public.taste_reports where user_id = p_user_id;
  get diagnostics v_tastes = row_count;

  -- 초대 링크 삭제 — 링크가 더는 열리지 않는다(초대 할인 기록은 주문 기록처럼 남는다)
  delete from public.invites where inviter_user_id = p_user_id;
  get diagnostics v_invites = row_count;

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
    'concern_records', v_concerns,
    'feedback', v_feedback,
    'regions', v_regions,
    'talk_rooms', v_talks,
    'chat_questions', v_questions,
    'chat_summaries', v_summaries,
    'taste_reports', v_tastes,
    'invites', v_invites
  );
end;
$$;

-- 서버(비밀키)만 부를 수 있다. 브라우저(로그인 회원 · 비로그인)는 부를 수 없다
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_member_data(uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 19번: 20261029000000_benefits_core.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 19번째 마이그레이션 — 통합 혜택 시스템의 중심: 관리자 설정(변경 이력) · 미유 포인트(로트 · 장부) · 무상 질문권(로트 · 장부) · 구매 적립.
-- 앞의 파일들(1~18번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- ⚠️ 이 파일은 개발 · 테스트 환경에서만 적용해 확인했다. 운영 DB에는 아직 적용하지 않았고, 운영자가 별도로 승인한 뒤에 적용한다.
--
-- 이 파일은 표와 함수를 "더하기만" 한다(기존 표 · 함수 · 데이터는 바뀌지 않는다). 새 혜택은 **모두 꺼진 채로** 시작한다(benefit_settings의 feature.* = false) —
-- 이 파일을 적용하는 것만으로는 포인트도 질문권도 지급되지 않는다. 운영자가 관리자 화면에서 켠 뒤에만 지급된다.
--
-- 운영자 결정(2026-10-17, D14 + 6가지 운영 정책):
--  - 포인트: 무상 보상형. 현금 충전 · 환급 · 양도 없음. 지급일로부터 1년(설정 point.expire_days, 지급마다 만료일을 박아 둔다).
--  - 회수: 환불 · 부정 지급이면 **미사용분만** 회수한다. 이미 쓴 몫은 음수 잔액을 만들지 않고 shortfall(회수 불가 이력)로 남기며 다른 보상에서 자동으로 상계하지 않는다.
--  - 질문권: 기본 무료(기존 chat_questions) · 프로모션/리뷰/추천 등 보상(여기 credit_lots) · 유료(기존 cash_*) 장부를 나눈다. 보상 질문권은 지급일로부터 1년.
--  - 구매 적립: 누적 유효 현금 결제액 구간별 적립률(설정 earn.tiers). 등급 도달 "다음 구매부터"(그 주문 이전의 누적액으로 구간을 찾는다), 소급 없음, 환불 시 회수.
--
-- 거래 장부(point_ledger · credit_ledger)는 쌓기만 한다(고치거나 지우는 것을 트리거가 막는다). 잔액은 거래의 합과 같아야 하며 supabase/check-benefits.sql이 대조한다.
-- 지급 · 차감 · 회수는 서버 비밀키(service_role)로만 부르는 함수로 하고, 회원 단위 잠금 안에서 처리하며 모든 작업에 멱등 키(benefit_ops)를 둔다.
-- 보상 처리 오류가 결제를 막지 않게 한다: 주문 트리거는 오류를 benefit_failures에 남기고 결제 확정은 그대로 진행한다(정기 점검이 다시 처리한다).

-- ─────────────────────────────────────────────
-- 1. 설정과 변경 이력
-- ─────────────────────────────────────────────

create table public.benefit_settings (
  key text primary key check (key ~ '^[a-z0-9_.]{3,60}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.benefit_settings_history (
  id bigint generated always as identity primary key,
  key text not null,
  old_value jsonb,
  new_value jsonb not null,
  changed_by uuid,
  reason text not null check (char_length(reason) between 1 and 200),
  changed_at timestamptz not null default now()
);

create index benefit_settings_history_key_idx on public.benefit_settings_history (key, changed_at desc);

-- 지급 · 정산 도중의 오류 기록 (결제를 막지 않고 남겨 두었다가 정기 점검이 다시 처리한다). 내용은 오류 문구 앞부분뿐이다
create table public.benefit_failures (
  id bigint generated always as identity primary key,
  kind text not null,
  ref text,
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- 같은 작업을 두 번 처리하지 않게 하는 멱등 키 (포인트 지급 · 교환 · 회수, 질문권 지급 · 사용 …)
create table public.benefit_ops (
  op_key text primary key check (char_length(op_key) between 3 and 200),
  user_id uuid not null,
  kind text not null,
  created_at timestamptz not null default now()
);

create index benefit_ops_user_idx on public.benefit_ops (user_id, created_at desc);

-- 설정 기본값. 모든 혜택은 꺼진 채로 시작한다(운영자가 켠다). 값은 설계 가설이며 관리자가 바꾸고 이력이 남는다
insert into public.benefit_settings (key, value) values
  ('feature.points_earn', 'false'),
  ('feature.points_spend', 'false'),
  ('feature.coupons', 'false'),
  ('feature.referral', 'false'),
  ('feature.referral_signup_points', 'false'),
  ('feature.referral_purchase_credits', 'false'),
  ('feature.review_reward', 'false'),
  -- 누적 유효 현금 결제액 구간별 적립률. 10~30만원 구간은 운영자 미정이라 기본 3%를 유지하고 설정에서 바꾼다
  ('earn.tiers', '[{"fromKrw":0,"rate":0.03},{"fromKrw":100000,"rate":0.03},{"fromKrw":300000,"rate":0.05},{"fromKrw":700000,"rate":0.07},{"fromKrw":1000000,"rate":0.10}]'),
  -- 포인트 교환가(상품별로 명시 저장 — 코드가 계산하지 않는다. 9,900원 × 약 1.2배 → 11,900P)
  ('point.prices', '{"personal-integrated-report":11900}'),
  ('point.expire_days', '365'),
  ('point.restore_grace_days', '7'),
  ('credit.expire_days', '365'),
  ('referral.invitee_price', '6900'),
  ('referral.signup_points', '500'),
  ('referral.hold_hours', '72'),
  ('referral.inviter_credits', '1'),
  ('referral.invitee_credits', '1'),
  ('referral.new_member_hours', '48'),
  ('referral.max_confirmed_per_inviter_per_day', '20'),
  ('referral.risk.burst_per_hour', '10'),
  ('referral.risk.min_visit_seconds', '10'),
  ('referral.risk.young_inviter_minutes', '60'),
  ('review.reward_credits', '1'),
  ('review.min_body_chars', '20'),
  -- 탈퇴한 회원의 혜택 장부 보관 일수. 법률 검토로 정할 때까지 비워 둔다(null = 정리하지 않음)
  ('benefit.withdrawn_ledger_retention_days', 'null');

-- 설정 변경은 이 함수로만 한다(이력이 자동으로 남는다). 이유는 필수
create or replace function public.set_benefit_setting(p_key text, p_value jsonb, p_reason text, p_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
begin
  if p_value is null then raise exception 'setting value required'; end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 then raise exception 'reason required'; end if;
  select value into v_old from public.benefit_settings where key = p_key for update;
  if found and v_old = p_value then
    return jsonb_build_object('status', 'unchanged');
  end if;
  insert into public.benefit_settings (key, value, updated_at, updated_by) values (p_key, p_value, now(), p_by)
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = p_by;
  insert into public.benefit_settings_history (key, old_value, new_value, changed_by, reason)
    values (p_key, v_old, p_value, p_by, left(btrim(p_reason), 200));
  return jsonb_build_object('status', 'changed');
end;
$$;

create or replace function public.benefit_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.benefit_settings where key = p_key;
$$;

create or replace function public.benefit_flag(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value = 'true'::jsonb from public.benefit_settings where key = p_key), false);
$$;

create or replace function public.benefit_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::numeric::integer from public.benefit_settings where key = p_key and jsonb_typeof(value) = 'number'), p_default);
$$;

-- 이력 · 오류 기록은 쌓기만 한다
create or replace function public.benefit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('miyu.benefit_maintenance', true), '') = 'on' then
    return coalesce(old, new);
  end if;
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger benefit_settings_history_no_change before update or delete on public.benefit_settings_history
  for each row execute function public.benefit_append_only();

-- 멱등 키 한 줄을 잡는다 (이미 있으면 false — 같은 작업을 이미 처리했다)
create or replace function public.benefit_claim_op(p_key text, p_user uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.benefit_ops (op_key, user_id, kind) values (p_key, p_user, p_kind) on conflict (op_key) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- 회원 단위 잠금 (여러 서버에서 동시에 와도 한 번에 하나씩)
create or replace function public.benefit_lock(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('benefit:' || p_user::text, 0));
end;
$$;

alter table public.benefit_settings enable row level security;
alter table public.benefit_settings_history enable row level security;
alter table public.benefit_failures enable row level security;
alter table public.benefit_ops enable row level security;
revoke all on public.benefit_settings, public.benefit_settings_history, public.benefit_failures, public.benefit_ops from anon, authenticated;
grant select, insert, update, delete on public.benefit_settings, public.benefit_failures, public.benefit_ops to service_role;
grant select, insert on public.benefit_settings_history to service_role;
grant usage, select on sequence public.benefit_settings_history_id_seq, public.benefit_failures_id_seq to service_role;

-- ─────────────────────────────────────────────
-- 2. 미유 포인트 — 지급 한 번 = 로트 하나. 사용은 만료가 빠른 로트부터(FIFO)
-- ─────────────────────────────────────────────

create table public.point_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  amount integer not null check (amount > 0),
  remaining integer not null check (remaining >= 0 and remaining <= amount),
  expires_at timestamptz,
  source_kind text not null check (source_kind in ('purchase', 'referral_signup', 'admin', 'event', 'coupon', 'restore')),
  source_ref text,
  -- 환불 · 부정 지급으로 회수된 로트 (회수된 로트로는 사용을 되돌려도 다시 살아나지 않는다)
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index point_lots_user_idx on public.point_lots (user_id, expires_at nulls last, created_at);
create index point_lots_source_idx on public.point_lots (source_kind, source_ref);

create table public.point_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  kind text not null check (kind in ('earn', 'spend', 'spend_restore', 'expire', 'clawback', 'forfeit', 'adjust')),
  -- 부호 있는 변화량 (지급 +, 사용 −). 회수 불가 기록처럼 잔액이 변하지 않는 줄은 0
  amount integer not null,
  lot_id uuid references public.point_lots (id) on delete restrict,
  op_key text not null references public.benefit_ops (op_key) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  -- 회수하려 했지만 이미 써서 되찾지 못한 포인트 (회수 불가 이력 — 다른 보상에서 자동으로 상계하지 않는다)
  shortfall integer not null default 0 check (shortfall >= 0),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index point_ledger_user_idx on public.point_ledger (user_id, id desc);
create index point_ledger_lot_idx on public.point_ledger (lot_id);
create index point_ledger_op_idx on public.point_ledger (op_key);

create trigger point_ledger_no_change before update or delete on public.point_ledger
  for each row execute function public.benefit_append_only();

alter table public.point_lots enable row level security;
alter table public.point_ledger enable row level security;
create policy "본인 포인트 로트 조회" on public.point_lots for select to authenticated using (user_id = (select auth.uid()));
create policy "본인 포인트 내역 조회" on public.point_ledger for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.point_lots, public.point_ledger from anon, authenticated;
grant select on public.point_lots, public.point_ledger to authenticated;
grant select, insert, update, delete on public.point_lots to service_role;
grant select, insert, update, delete on public.point_ledger to service_role;
grant usage, select on sequence public.point_ledger_id_seq to service_role;

-- 지금 쓸 수 있는 포인트 (만료되지 않은 로트의 남은 양)
create or replace function public.point_balance(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(remaining), 0)::integer from public.point_lots
   where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now());
$$;

-- 포인트 지급. 같은 p_op_key로 두 번 불러도 한 번만 지급한다. p_expires_at이 null이면 만료 없음
create or replace function public.grant_points(
  p_user uuid, p_amount integer, p_source_kind text, p_source_ref text, p_op_key text,
  p_expires_at timestamptz, p_order uuid default null, p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot uuid;
begin
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('status', 'invalid'); end if;
  perform public.benefit_lock(p_user);
  if not public.benefit_claim_op(p_op_key, p_user, 'point-grant') then
    return jsonb_build_object('status', 'duplicate');
  end if;
  insert into public.point_lots (user_id, amount, remaining, expires_at, source_kind, source_ref)
    values (p_user, p_amount, p_amount, p_expires_at, p_source_kind, p_source_ref) returning id into v_lot;
  insert into public.point_ledger (user_id, kind, amount, lot_id, op_key, order_id, meta)
    values (p_user, 'earn', p_amount, v_lot, p_op_key, p_order, coalesce(p_meta, '{}'::jsonb));
  return jsonb_build_object('status', 'granted', 'lot', v_lot, 'amount', p_amount);
end;
$$;

-- 포인트 사용(상품 교환). 잔액이 모자라면 아무것도 바꾸지 않는다. 같은 참조번호(p_ref)로 두 번 쓸 수 없다
-- 결과: spent(balance) · already · insufficient(balance) · invalid
create or replace function public.spend_points(p_user uuid, p_amount integer, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'point-spend:' || p_ref;
  v_need integer := p_amount;
  v_take integer;
  v_bal integer;
  lot record;
begin
  if p_amount is null or p_amount <= 0 or p_ref is null or char_length(p_ref) = 0 then return jsonb_build_object('status', 'invalid'); end if;
  perform public.benefit_lock(p_user);
  if exists (select 1 from public.benefit_ops where op_key = v_key) then
    return jsonb_build_object('status', 'already', 'balance', public.point_balance(p_user));
  end if;
  v_bal := public.point_balance(p_user);
  if v_bal < p_amount then return jsonb_build_object('status', 'insufficient', 'balance', v_bal); end if;
  perform public.benefit_claim_op(v_key, p_user, 'point-spend');
  for lot in
    select id, remaining from public.point_lots
     where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now())
     order by expires_at nulls last, created_at, id
     for update
  loop
    exit when v_need <= 0;
    v_take := least(lot.remaining, v_need);
    update public.point_lots set remaining = remaining - v_take where id = lot.id;
    insert into public.point_ledger (user_id, kind, amount, lot_id, op_key) values (p_user, 'spend', -v_take, lot.id, v_key);
    v_need := v_need - v_take;
  end loop;
  return jsonb_build_object('status', 'spent', 'balance', v_bal - p_amount);
end;
$$;

-- 포인트 사용 되돌림(생성 실패 · 취소). 같은 참조번호의 사용을 한 번만 되돌린다. 그사이 만료된 로트는 새 로트(유예 일수)로 돌려준다
create or replace function public.restore_points_spend(p_user uuid, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'point-spend:' || p_ref;
  v_rkey text := 'point-restore:' || p_ref;
  v_exp timestamptz;
  v_revoked timestamptz;
  v_new uuid;
  v_grace integer := public.benefit_int('point.restore_grace_days', 7);
  r record;
begin
  perform public.benefit_lock(p_user);
  if not exists (select 1 from public.benefit_ops where op_key = v_key and user_id = p_user) then
    return jsonb_build_object('status', 'nothing');
  end if;
  if not public.benefit_claim_op(v_rkey, p_user, 'point-restore') then
    return jsonb_build_object('status', 'already', 'balance', public.point_balance(p_user));
  end if;
  for r in select lot_id, -amount as qty from public.point_ledger where op_key = v_key and kind = 'spend' loop
    select expires_at, revoked_at into v_exp, v_revoked from public.point_lots where id = r.lot_id;
    if v_revoked is not null then
      -- 그사이 환불 · 부정 지급으로 회수된 로트: 되살리지 않고 회수 불가 이력만 남긴다
      insert into public.point_ledger (user_id, kind, amount, lot_id, op_key, shortfall, meta)
        values (p_user, 'spend_restore', 0, r.lot_id, v_rkey, r.qty, jsonb_build_object('skipped', 'revoked'));
    elsif v_exp is null or v_exp > now() then
      update public.point_lots set remaining = remaining + r.qty where id = r.lot_id;
      insert into public.point_ledger (user_id, kind, amount, lot_id, op_key) values (p_user, 'spend_restore', r.qty, r.lot_id, v_rkey);
    else
      insert into public.point_lots (user_id, amount, remaining, expires_at, source_kind, source_ref)
        values (p_user, r.qty, r.qty, now() + make_interval(days => v_grace), 'restore', p_ref) returning id into v_new;
      insert into public.point_ledger (user_id, kind, amount, lot_id, op_key) values (p_user, 'spend_restore', r.qty, v_new, v_rkey);
    end if;
  end loop;
  return jsonb_build_object('status', 'restored', 'balance', public.point_balance(p_user));
end;
$$;

-- 환불 · 부정 지급으로 근원(예: 구매 적립 = 주문)이 취소될 때 그 근원에서 나온 포인트의 **미사용분만** 회수한다.
-- 이미 쓴 몫은 되찾지 않고(잔액을 음수로 만들지 않는다) shortfall(회수 불가 이력)로 남긴다. 같은 근원은 한 번만 처리한다
create or replace function public.clawback_points_by_source(p_source_kind text, p_source_ref text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot public.point_lots%rowtype;
  v_key text := 'point-clawback:' || p_source_kind || ':' || p_source_ref;
  v_revoked integer;
  v_spent integer;
begin
  select * into v_lot from public.point_lots where source_kind = p_source_kind and source_ref = p_source_ref order by created_at limit 1;
  if not found then return jsonb_build_object('status', 'nothing'); end if;
  perform public.benefit_lock(v_lot.user_id);
  if not public.benefit_claim_op(v_key, v_lot.user_id, 'point-clawback') then
    return jsonb_build_object('status', 'already');
  end if;
  select * into v_lot from public.point_lots where id = v_lot.id for update;
  v_revoked := v_lot.remaining;
  select coalesce(-sum(amount), 0)::integer into v_spent from public.point_ledger where lot_id = v_lot.id and kind in ('spend', 'spend_restore');
  update public.point_lots set remaining = 0, revoked_at = now() where id = v_lot.id;
  insert into public.point_ledger (user_id, kind, amount, lot_id, op_key, shortfall, meta)
    values (v_lot.user_id, 'clawback', -v_revoked, v_lot.id, v_key, greatest(v_spent, 0), jsonb_build_object('reason', left(coalesce(p_reason, ''), 100)));
  return jsonb_build_object('status', 'clawed', 'revoked', v_revoked, 'shortfall', greatest(v_spent, 0));
end;
$$;

-- 만료된 로트를 소멸시킨다(정기 점검). 소멸한 로트 수를 돌려준다
create or replace function public.expire_points()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  r record;
  v_rem integer;
begin
  for r in select id, user_id from public.point_lots where remaining > 0 and expires_at is not null and expires_at <= now() order by id loop
    perform public.benefit_lock(r.user_id);
    select remaining into v_rem from public.point_lots where id = r.id for update;
    if v_rem > 0 and public.benefit_claim_op('point-expire:' || r.id::text, r.user_id, 'point-expire') then
      update public.point_lots set remaining = 0 where id = r.id;
      insert into public.point_ledger (user_id, kind, amount, lot_id, op_key) values (r.user_id, 'expire', -v_rem, r.id, 'point-expire:' || r.id::text);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ─────────────────────────────────────────────
-- 3. 무상 질문권(프로모션 · 리뷰 · 추천 · 이벤트) — 기본 무료(chat_questions) · 유료(cash_*)와 장부를 나눈다
-- ─────────────────────────────────────────────

create table public.credit_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  kind text not null check (kind in ('promo', 'review', 'referral_inviter', 'referral_invitee', 'event', 'admin')),
  quantity integer not null check (quantity > 0),
  remaining integer not null check (remaining >= 0 and remaining <= quantity),
  expires_at timestamptz,
  source_ref text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index credit_lots_user_idx on public.credit_lots (user_id, expires_at nulls last, created_at);
create index credit_lots_source_idx on public.credit_lots (source_ref);

create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  kind text not null check (kind in ('grant', 'spend', 'restore', 'expire', 'revoke', 'forfeit')),
  qty integer not null,
  lot_id uuid not null references public.credit_lots (id) on delete restrict,
  op_key text not null references public.benefit_ops (op_key) on delete restrict,
  shortfall integer not null default 0 check (shortfall >= 0),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index credit_ledger_user_idx on public.credit_ledger (user_id, id desc);
create index credit_ledger_lot_idx on public.credit_ledger (lot_id);

create trigger credit_ledger_no_change before update or delete on public.credit_ledger
  for each row execute function public.benefit_append_only();

alter table public.credit_lots enable row level security;
alter table public.credit_ledger enable row level security;
create policy "본인 질문권 로트 조회" on public.credit_lots for select to authenticated using (user_id = (select auth.uid()));
create policy "본인 질문권 내역 조회" on public.credit_ledger for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.credit_lots, public.credit_ledger from anon, authenticated;
grant select on public.credit_lots, public.credit_ledger to authenticated;
grant select, insert, update, delete on public.credit_lots to service_role;
grant select, insert, update, delete on public.credit_ledger to service_role;
grant usage, select on sequence public.credit_ledger_id_seq to service_role;

create or replace function public.credit_balance(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(remaining), 0)::integer from public.credit_lots
   where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now());
$$;

-- 질문권 지급. 같은 p_op_key로 두 번 불러도 한 번만 지급한다. 기존 질문권이 남아 있어도 추가로 지급한다(보상은 합산된다)
create or replace function public.grant_credit(
  p_user uuid, p_kind text, p_qty integer, p_source_ref text, p_op_key text, p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot uuid;
begin
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('status', 'invalid'); end if;
  perform public.benefit_lock(p_user);
  if not public.benefit_claim_op(p_op_key, p_user, 'credit-grant') then
    return jsonb_build_object('status', 'duplicate');
  end if;
  insert into public.credit_lots (user_id, kind, quantity, remaining, expires_at, source_ref)
    values (p_user, p_kind, p_qty, p_qty, p_expires_at, p_source_ref) returning id into v_lot;
  insert into public.credit_ledger (user_id, kind, qty, lot_id, op_key) values (p_user, 'grant', p_qty, v_lot, p_op_key);
  return jsonb_build_object('status', 'granted', 'lot', v_lot, 'qty', p_qty);
end;
$$;

-- 질문권 1개 사용: 만료가 가장 빠른 로트부터. 같은 참조번호로 두 번 쓸 수 없다. 결과: spent(kind, balance) · already · none(쓸 질문권 없음)
create or replace function public.spend_credit(p_user uuid, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'credit-spend:' || p_ref;
  v_lot public.credit_lots%rowtype;
begin
  if p_ref is null or char_length(p_ref) = 0 then return jsonb_build_object('status', 'invalid'); end if;
  perform public.benefit_lock(p_user);
  if exists (select 1 from public.benefit_ops where op_key = v_key) then
    return jsonb_build_object('status', 'already', 'balance', public.credit_balance(p_user));
  end if;
  select * into v_lot from public.credit_lots
   where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now())
   order by expires_at nulls last, created_at, id limit 1 for update;
  if not found then return jsonb_build_object('status', 'none', 'balance', 0); end if;
  perform public.benefit_claim_op(v_key, p_user, 'credit-spend');
  update public.credit_lots set remaining = remaining - 1 where id = v_lot.id;
  insert into public.credit_ledger (user_id, kind, qty, lot_id, op_key) values (p_user, 'spend', -1, v_lot.id, v_key);
  return jsonb_build_object('status', 'spent', 'kind', v_lot.kind, 'balance', public.credit_balance(p_user));
end;
$$;


-- 질문권 사용 되돌림(답을 받지 못함). 같은 참조번호의 사용을 한 번만 되돌린다.
-- 그사이 환불 · 부정 지급으로 회수된 로트는 되살리지 않고(회수 불가 이력만 남긴다), 만료된 로트는 새 로트(유예 일수)로 돌려준다
create or replace function public.restore_credit_spend(p_user uuid, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'credit-spend:' || p_ref;
  v_rkey text := 'credit-restore:' || p_ref;
  r record;
  v_lot public.credit_lots%rowtype;
  v_new uuid;
  v_grace integer := public.benefit_int('point.restore_grace_days', 7);
begin
  perform public.benefit_lock(p_user);
  if not exists (select 1 from public.benefit_ops where op_key = v_key and user_id = p_user) then
    return jsonb_build_object('status', 'nothing');
  end if;
  if not public.benefit_claim_op(v_rkey, p_user, 'credit-restore') then
    return jsonb_build_object('status', 'already', 'balance', public.credit_balance(p_user));
  end if;
  for r in select lot_id, -qty as n from public.credit_ledger where op_key = v_key and kind = 'spend' loop
    select * into v_lot from public.credit_lots where id = r.lot_id for update;
    if v_lot.revoked_at is not null then
      insert into public.credit_ledger (user_id, kind, qty, lot_id, op_key, shortfall, meta)
        values (p_user, 'restore', 0, v_lot.id, v_rkey, r.n, jsonb_build_object('skipped', 'revoked'));
    elsif v_lot.expires_at is null or v_lot.expires_at > now() then
      update public.credit_lots set remaining = remaining + r.n where id = v_lot.id;
      insert into public.credit_ledger (user_id, kind, qty, lot_id, op_key) values (p_user, 'restore', r.n, v_lot.id, v_rkey);
    else
      insert into public.credit_lots (user_id, kind, quantity, remaining, expires_at, source_ref)
        values (p_user, v_lot.kind, r.n, r.n, now() + make_interval(days => v_grace), 'restore:' || p_ref) returning id into v_new;
      insert into public.credit_ledger (user_id, kind, qty, lot_id, op_key) values (p_user, 'restore', r.n, v_new, v_rkey);
    end if;
  end loop;
  return jsonb_build_object('status', 'restored', 'balance', public.credit_balance(p_user));
end;
$$;

-- 근원(예: 친구 첫 구매 주문)이 환불 · 취소될 때 그 근원에서 나온 질문권의 **미사용분만** 회수한다.
-- 이미 쓴 몫은 음수 없이 shortfall(회수 불가 이력)로 남기고 다른 보상에서 자동으로 상계하지 않는다. 로트마다 한 번만 처리한다
create or replace function public.revoke_credits_by_source(p_source_ref text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_rem integer;
  v_spent integer;
  v_revoked integer := 0;
  v_short integer := 0;
  v_lots integer := 0;
begin
  for r in select id, user_id from public.credit_lots where source_ref = p_source_ref order by created_at, id loop
    perform public.benefit_lock(r.user_id);
    if public.benefit_claim_op('credit-revoke:' || r.id::text, r.user_id, 'credit-revoke') then
      select remaining into v_rem from public.credit_lots where id = r.id for update;
      select coalesce(-sum(qty), 0)::integer into v_spent from public.credit_ledger where lot_id = r.id and kind in ('spend', 'restore');
      update public.credit_lots set remaining = 0, revoked_at = now() where id = r.id;
      insert into public.credit_ledger (user_id, kind, qty, lot_id, op_key, shortfall, meta)
        values (r.user_id, 'revoke', -v_rem, r.id, 'credit-revoke:' || r.id::text, greatest(v_spent, 0), jsonb_build_object('reason', left(coalesce(p_reason, ''), 100)));
      v_revoked := v_revoked + v_rem;
      v_short := v_short + greatest(v_spent, 0);
      v_lots := v_lots + 1;
    end if;
  end loop;
  return jsonb_build_object('status', case when v_lots = 0 then 'nothing' else 'revoked' end, 'revoked', v_revoked, 'shortfall', v_short, 'lots', v_lots);
end;
$$;

-- 만료된 질문권 로트를 소멸시킨다(정기 점검)
create or replace function public.expire_credits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  r record;
  v_rem integer;
begin
  for r in select id, user_id from public.credit_lots where remaining > 0 and expires_at is not null and expires_at <= now() order by id loop
    perform public.benefit_lock(r.user_id);
    select remaining into v_rem from public.credit_lots where id = r.id for update;
    if v_rem > 0 and public.benefit_claim_op('credit-expire:' || r.id::text, r.user_id, 'credit-expire') then
      update public.credit_lots set remaining = 0 where id = r.id;
      insert into public.credit_ledger (user_id, kind, qty, lot_id, op_key) values (r.user_id, 'expire', -v_rem, r.id, 'credit-expire:' || r.id::text);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ─────────────────────────────────────────────
-- 4. 구매 적립 — 주문이 결제 완료로 바뀔 때 같은 트랜잭션에서 (오류가 나도 결제는 막지 않는다)
-- ─────────────────────────────────────────────

-- 이 주문에 적립할 포인트를 계산해 지급한다.
-- 규칙: 결제사를 거친 현금 주문(provider tosspayments)만 · 그 주문 **이전의** 누적 유효 현금 결제액으로 구간을 찾는다(등급 도달 다음 구매부터 · 소급 없음) ·
--  환불된 주문은 누적에서 빠지고 질문 묶음의 부분 환불액은 누적에서 뺀다 · 포인트 교환(혜택) 주문은 누적에도 적립에도 들어가지 않는다.
-- 적립이 꺼져 있으면 "건너뜀" 기록을 남겨(나중에 켜도 소급하지 않는다) 정기 점검이 다시 시도하지 않게 한다.
create or replace function public.earn_purchase_points(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
  v_key text;
  v_cum bigint;
  v_rate numeric;
  v_amt integer;
  v_days integer;
  v_at timestamptz;
begin
  select * into o from public.orders where id = p_order;
  if not found or o.status <> 'paid' or o.provider <> 'tosspayments' or o.amount <= 0 then
    return jsonb_build_object('status', 'skip');
  end if;
  v_key := 'earn:' || o.id::text;
  perform public.benefit_lock(o.user_id);
  if exists (select 1 from public.benefit_ops where op_key = v_key) then
    return jsonb_build_object('status', 'already');
  end if;
  if not public.benefit_flag('feature.points_earn') then
    perform public.benefit_claim_op(v_key, o.user_id, 'earn-skipped');
    return jsonb_build_object('status', 'off');
  end if;
  v_at := coalesce(o.approved_at, o.created_at);
  select coalesce(sum(x.amount), 0) into v_cum
    from public.orders x
   where x.user_id = o.user_id and x.status = 'paid' and x.provider = 'tosspayments' and x.id <> o.id
     and (coalesce(x.approved_at, x.created_at), x.id) < (v_at, o.id);
  v_cum := v_cum - coalesce((
    select sum(qp.refunded_krw) from public.question_packs qp join public.orders x on x.id = qp.order_id
     where x.user_id = o.user_id and x.status = 'paid' and x.provider = 'tosspayments' and x.id <> o.id
       and (coalesce(x.approved_at, x.created_at), x.id) < (v_at, o.id)
  ), 0);
  select (t ->> 'rate')::numeric into v_rate
    from jsonb_array_elements(coalesce(public.benefit_setting('earn.tiers'), '[]'::jsonb)) t
   where (t ->> 'fromKrw')::bigint <= greatest(v_cum, 0)
   order by (t ->> 'fromKrw')::bigint desc limit 1;
  if v_rate is null or v_rate <= 0 then
    perform public.benefit_claim_op(v_key, o.user_id, 'earn-skipped');
    return jsonb_build_object('status', 'zero');
  end if;
  v_amt := floor(o.amount::numeric * v_rate)::integer;
  if v_amt <= 0 then
    perform public.benefit_claim_op(v_key, o.user_id, 'earn-skipped');
    return jsonb_build_object('status', 'zero');
  end if;
  v_days := public.benefit_int('point.expire_days', 0);
  -- 지급할 때의 적립률 · 누적액을 거래에 박아 둔다(나중에 설정이 바뀌어도 과거 거래는 바뀌지 않는다)
  return public.grant_points(
    o.user_id, v_amt, 'purchase', o.id::text, v_key,
    case when v_days > 0 then now() + make_interval(days => v_days) else null end,
    o.id, jsonb_build_object('rate', v_rate, 'cumulativeBeforeKrw', greatest(v_cum, 0), 'orderAmountKrw', o.amount)
  );
end;
$$;

-- 질문 묶음의 부분 환불에 맞춰 그 주문에서 적립한 포인트의 미사용분을 환불 비율만큼 회수한다.
-- 같은 누적 환불액은 한 번만 처리한다(멱등 키에 누적 환불액을 넣는다). 이미 쓴 몫은 shortfall로 남긴다
create or replace function public.reconcile_partial_refund_earn()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  r record;
  v_lot public.point_lots%rowtype;
  v_target integer;
  v_clawed integer;
  v_take integer;
  v_key text;
begin
  for r in
    select qp.order_id, qp.refunded_krw, qp.price_krw from public.question_packs qp
      join public.orders o on o.id = qp.order_id
     where qp.refunded_krw > 0 and o.status = 'paid' and o.provider = 'tosspayments'
  loop
    select * into v_lot from public.point_lots where source_kind = 'purchase' and source_ref = r.order_id::text;
    continue when not found;
    v_key := 'point-clawback-partial:' || r.order_id::text || ':' || r.refunded_krw::text;
    perform public.benefit_lock(v_lot.user_id);
    continue when exists (select 1 from public.benefit_ops where op_key = v_key);
    select * into v_lot from public.point_lots where id = v_lot.id for update;
    v_target := floor(v_lot.amount::numeric * r.refunded_krw / r.price_krw)::integer;
    select coalesce(-sum(amount), 0)::integer into v_clawed from public.point_ledger where lot_id = v_lot.id and kind = 'clawback';
    continue when v_target <= v_clawed;
    perform public.benefit_claim_op(v_key, v_lot.user_id, 'point-clawback-partial');
    v_take := least(v_target - v_clawed, v_lot.remaining);
    update public.point_lots set remaining = remaining - v_take where id = v_lot.id;
    insert into public.point_ledger (user_id, kind, amount, lot_id, op_key, order_id, shortfall, meta)
      values (v_lot.user_id, 'clawback', -v_take, v_lot.id, v_key, r.order_id, (v_target - v_clawed) - v_take, jsonb_build_object('reason', 'partial-refund', 'refundedKrw', r.refunded_krw));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 주문 상태가 바뀔 때: 결제 완료 → 적립, 환불 → 그 주문의 적립 회수(미사용분만). 오류가 나도 결제 확정은 그대로 진행한다
create or replace function public.orders_benefit_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.status = 'paid' and old.status is distinct from 'paid' then
      perform public.earn_purchase_points(new.id);
    elsif new.status = 'refunded' and old.status = 'paid' then
      perform public.clawback_points_by_source('purchase', new.id::text, 'order-refunded');
    end if;
  exception when others then
    insert into public.benefit_failures (kind, ref, message) values ('orders_trigger_points', new.id::text, left(sqlerrm, 300));
  end;
  return new;
end;
$$;

create trigger orders_benefit_paid after update of status on public.orders
  for each row execute function public.orders_benefit_paid();

-- 정기 점검: 만료 소멸 + 트리거가 실패해 놓친 적립을 최근 3일 안에서 다시 처리 + 질문 묶음 부분 환불 적립 조정. 처리 건수를 돌려준다
create or replace function public.reconcile_points_credits()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pts integer;
  v_cr integer;
  v_earn integer := 0;
  v_partial integer;
  r record;
begin
  v_pts := public.expire_points();
  v_cr := public.expire_credits();
  for r in
    select o.id from public.orders o
     where o.status = 'paid' and o.provider = 'tosspayments' and o.amount > 0
       and coalesce(o.approved_at, o.created_at) > now() - interval '3 days'
       and not exists (select 1 from public.benefit_ops b where b.op_key = 'earn:' || o.id::text)
  loop
    begin
      perform public.earn_purchase_points(r.id);
      v_earn := v_earn + 1;
    exception when others then
      insert into public.benefit_failures (kind, ref, message) values ('reconcile_earn', r.id::text, left(sqlerrm, 300));
    end;
  end loop;
  v_partial := public.reconcile_partial_refund_earn();
  return jsonb_build_object('expiredPointLots', v_pts, 'expiredCreditLots', v_cr, 'earnedBackfill', v_earn, 'partialRefundAdjusted', v_partial);
end;
$$;

-- ─────────────────────────────────────────────
-- 5. 실행 권한 — 서버 비밀키(service_role)만
-- ─────────────────────────────────────────────

revoke all on function public.set_benefit_setting(text, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.benefit_setting(text) from public, anon, authenticated;
revoke all on function public.benefit_flag(text) from public, anon, authenticated;
revoke all on function public.benefit_int(text, integer) from public, anon, authenticated;
revoke all on function public.benefit_claim_op(text, uuid, text) from public, anon, authenticated;
revoke all on function public.benefit_lock(uuid) from public, anon, authenticated;
revoke all on function public.point_balance(uuid) from public, anon, authenticated;
revoke all on function public.grant_points(uuid, integer, text, text, text, timestamptz, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.spend_points(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.restore_points_spend(uuid, text) from public, anon, authenticated;
revoke all on function public.clawback_points_by_source(text, text, text) from public, anon, authenticated;
revoke all on function public.expire_points() from public, anon, authenticated;
revoke all on function public.credit_balance(uuid) from public, anon, authenticated;
revoke all on function public.grant_credit(uuid, text, integer, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.spend_credit(uuid, text) from public, anon, authenticated;
revoke all on function public.restore_credit_spend(uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_credits_by_source(text, text) from public, anon, authenticated;
revoke all on function public.expire_credits() from public, anon, authenticated;
revoke all on function public.earn_purchase_points(uuid) from public, anon, authenticated;
revoke all on function public.reconcile_partial_refund_earn() from public, anon, authenticated;
revoke all on function public.orders_benefit_paid() from public, anon, authenticated;
revoke all on function public.reconcile_points_credits() from public, anon, authenticated;
grant execute on function public.set_benefit_setting(text, jsonb, text, uuid) to service_role;
grant execute on function public.benefit_setting(text) to service_role;
grant execute on function public.benefit_flag(text) to service_role;
grant execute on function public.benefit_int(text, integer) to service_role;
grant execute on function public.point_balance(uuid) to service_role;
grant execute on function public.grant_points(uuid, integer, text, text, text, timestamptz, uuid, jsonb) to service_role;
grant execute on function public.spend_points(uuid, integer, text) to service_role;
grant execute on function public.restore_points_spend(uuid, text) to service_role;
grant execute on function public.clawback_points_by_source(text, text, text) to service_role;
grant execute on function public.expire_points() to service_role;
grant execute on function public.credit_balance(uuid) to service_role;
grant execute on function public.grant_credit(uuid, text, integer, text, text, timestamptz) to service_role;
grant execute on function public.spend_credit(uuid, text) to service_role;
grant execute on function public.restore_credit_spend(uuid, text) to service_role;
grant execute on function public.revoke_credits_by_source(text, text) to service_role;
grant execute on function public.expire_credits() to service_role;
grant execute on function public.earn_purchase_points(uuid) to service_role;
grant execute on function public.reconcile_partial_refund_earn() to service_role;
grant execute on function public.reconcile_points_credits() to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 20번: 20261030000000_coupons_free_orders.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 20번째 마이그레이션 — 쿠폰 · 0원 혜택 주문(결제사를 거치지 않는 정상 무료 제공 경로) · 혜택 주문 회수.
-- 앞의 파일들(1~19번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다.
--
-- ⚠️ 개발 · 테스트 환경에서만 적용해 확인했다. 운영 DB에는 아직 적용하지 않았고, 운영자가 별도로 승인한 뒤에 적용한다.
--
-- 기존 파일(1~19번)은 고치지 않는다. 이 파일은 표 · 열 · 함수 · 트리거를 더하고, **orders의 금액 제한 한 가지만 완화한다**(운영자 승인 2026-10-17: 개발 · 테스트 환경에서 승인, 운영 적용은 별도).
--
-- 0원 주문의 안전 장치 (금액 제한을 `amount >= 0`으로만 바꾸지 않는다):
--  1. 제약: amount = 0 은 provider = 'benefit'일 때만, provider = 'benefit'이면 amount = 0 · payment_key 없음. 결제사 주문(tosspayments)은 계속 amount > 0 이다.
--  2. 생성 경로: 0원 · 혜택 주문은 **grant_benefit_order 함수 안에서만** 만들 수 있다(함수가 그 주문번호를 이 트랜잭션에 표시하고, 삽입 트리거가 표시와 맞는지 확인한다). 앱 코드의 일반 insert나 브라우저가 보낸 금액 0은 거부된다.
--  3. 근거: 함수는 쿠폰(검증 · 한도 · 중복) 또는 포인트(잔액 · 차감)를 **먼저 확정**한 뒤 그 근거를 가리키는 주문을 만든다. 근거 없이 0원 주문이 생기지 않는다.
--  4. 구분: 상태는 기존 paid를 쓰되(리포트 · 권한 경로를 그대로 쓰기 위해) provider = 'benefit'과 benefit_order_grants 기록으로 일반 결제 완료와 구분한다 — 매출 · 결제 수 · 결제 대조에는 넣지 않는다.
--  5. 회수: release_benefit_order가 생성 실패(포인트 · 쿠폰 복원) 또는 부정 이용(복원 없음)을 처리한다. 이미 만든 리포트는 지우지 않는다.
--  6. provider · 주문 번호 · 금액은 만든 뒤 바꿀 수 없다.

-- ─────────────────────────────────────────────
-- 1. orders 확장 (정가 · 할인 기록 열 + 0원 제약)
-- ─────────────────────────────────────────────

-- 가격이 어떻게 정해졌는지 주문에 남긴다(손익 분석: 정가 · 초대 · 쿠폰 · 포인트 비중). 기존 주문에는 비어 있다
alter table public.orders add column if not exists list_amount integer check (list_amount is null or list_amount >= 0);
alter table public.orders add column if not exists discount_krw integer check (discount_krw is null or discount_krw >= 0);
alter table public.orders add column if not exists discount_kind text check (discount_kind is null or discount_kind in ('referral', 'coupon', 'points', 'admin'));
alter table public.orders add column if not exists discount_ref text check (discount_ref is null or char_length(discount_ref) <= 80);

alter table public.orders drop constraint orders_amount_check;
alter table public.orders add constraint orders_amount_check check (amount > 0 or (amount = 0 and provider = 'benefit'));
alter table public.orders add constraint orders_benefit_shape check (provider <> 'benefit' or (amount = 0 and payment_key is null));

-- 0원 · 혜택 주문은 grant_benefit_order만 만들 수 있다
create or replace function public.orders_zero_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provider = 'benefit' or new.amount = 0 then
    if coalesce(current_setting('miyu.benefit_grant', true), '') <> new.order_number then
      raise exception 'zero-amount or benefit orders are created only by grant_benefit_order';
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_zero_guard before insert on public.orders
  for each row execute function public.orders_zero_guard();

create or replace function public.orders_provider_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provider <> old.provider then raise exception 'order provider is immutable'; end if;
  return new;
end;
$$;

create trigger orders_provider_immutable before update on public.orders
  for each row execute function public.orders_provider_immutable();

-- ─────────────────────────────────────────────
-- 2. 쿠폰
-- ─────────────────────────────────────────────

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{4,32}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 300),
  -- amount: value = 할인 원 · percent: value = 1~100 · free-product / free-report-entitlement: 최종 0원(value 0) · credit: value = 질문권 수
  type text not null check (type in ('amount', 'percent', 'free-product', 'free-report-entitlement', 'credit')),
  value integer not null check (value >= 0),
  -- 비어 있으면 개인 심층 리포트 계열(personal-integrated-report, :r2 …)
  product_ids text[] not null default '{}',
  -- 특정 회원 전용(null이면 코드를 아는 누구나)
  target_user_id uuid references auth.users (id) on delete cascade,
  per_user_limit integer not null default 1 check (per_user_limit >= 1),
  issue_limit integer check (issue_limit is null or issue_limit >= 1),
  starts_at timestamptz,
  ends_at timestamptz,
  -- 쿠폰의 쓰임: promo(일반) · trial(체험단) · cs(고객 응대 보상) · event
  purpose text not null default 'promo' check (purpose in ('promo', 'trial', 'cs', 'event')),
  -- 체험단 후기 보상을 줄 대상으로 표시(기본 아님)
  review_reward_eligible boolean not null default false,
  -- 친구 추천 가격(6,900원)과 함께 쓸 수 있는가 — 기본은 자동 중복 적용 없음. 고객이 둘 중 하나를 고른다
  stackable_with_referral boolean not null default false,
  credit_expire_days integer check (credit_expire_days is null or credit_expire_days >= 1),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'revoked')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_percent_range check (type <> 'percent' or value between 1 and 100),
  constraint coupons_credit_qty check (type <> 'credit' or value >= 1),
  constraint coupons_free_zero check (type not in ('free-product', 'free-report-entitlement') or value = 0),
  constraint coupons_amount_positive check (type <> 'amount' or value >= 1)
);

create trigger coupons_updated_at before update on public.coupons
  for each row execute function public.set_updated_at();

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  -- reserved: 결제 대기 주문에 자리 잡음 · used: 사용 확정 · released: 풀림(결제 실패 · 취소 · 생성 실패) · revoked: 부정 이용으로 회수
  status text not null check (status in ('reserved', 'used', 'released', 'revoked')),
  idempotency_key text not null unique check (char_length(idempotency_key) between 3 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id, status);
create index coupon_redemptions_user_idx on public.coupon_redemptions (user_id, created_at desc);
-- 한 주문에는 쿠폰 하나만 (예약 또는 사용 중인 것)
create unique index coupon_redemptions_one_active_per_order on public.coupon_redemptions (order_id)
  where order_id is not null and status in ('reserved', 'used');

create trigger coupon_redemptions_updated_at before update on public.coupon_redemptions
  for each row execute function public.set_updated_at();

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
create policy "본인 쿠폰 사용 내역 조회" on public.coupon_redemptions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.coupons, public.coupon_redemptions from anon, authenticated;
grant select on public.coupon_redemptions to authenticated;
grant select, insert, update, delete on public.coupons, public.coupon_redemptions to service_role;

-- 쿠폰을 쓸 수 있는가(읽기만). 결과: { ok: true, couponId, type, value, purpose, stackableWithReferral, creditExpireDays } 또는 { ok: false, reason }
--  reason: feature-off · not-found · inactive · not-started · ended · product(이 상품에 쓸 수 없음) · user(다른 회원 전용) · user-limit(내 사용 한도) · sold-out(전체 한도)
create or replace function public.coupon_check(p_code text, p_user uuid, p_product text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.coupons%rowtype;
  v_mine integer;
  v_all integer;
begin
  if not public.benefit_flag('feature.coupons') then return jsonb_build_object('ok', false, 'reason', 'feature-off'); end if;
  select * into c from public.coupons where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  if c.status <> 'active' then return jsonb_build_object('ok', false, 'reason', 'inactive'); end if;
  if c.starts_at is not null and c.starts_at > now() then return jsonb_build_object('ok', false, 'reason', 'not-started'); end if;
  if c.ends_at is not null and c.ends_at <= now() then return jsonb_build_object('ok', false, 'reason', 'ended'); end if;
  if c.target_user_id is not null and c.target_user_id <> p_user then return jsonb_build_object('ok', false, 'reason', 'user'); end if;
  if c.type <> 'credit' then
    if cardinality(c.product_ids) = 0 then
      if p_product <> 'personal-integrated-report' and p_product !~ '^personal-integrated-report:r[0-9]+$' then
        return jsonb_build_object('ok', false, 'reason', 'product');
      end if;
    elsif not (p_product = any (c.product_ids)) then
      return jsonb_build_object('ok', false, 'reason', 'product');
    end if;
  end if;
  select count(*) into v_mine from public.coupon_redemptions where coupon_id = c.id and user_id = p_user and status in ('reserved', 'used');
  if v_mine >= c.per_user_limit then return jsonb_build_object('ok', false, 'reason', 'user-limit'); end if;
  if c.issue_limit is not null then
    select count(*) into v_all from public.coupon_redemptions where coupon_id = c.id and status in ('reserved', 'used');
    if v_all >= c.issue_limit then return jsonb_build_object('ok', false, 'reason', 'sold-out'); end if;
  end if;
  return jsonb_build_object('ok', true, 'couponId', c.id, 'type', c.type, 'value', c.value, 'purpose', c.purpose,
    'stackableWithReferral', c.stackable_with_referral, 'creditExpireDays', c.credit_expire_days, 'name', c.name);
end;
$$;

-- 이미 만든 결제 대기 주문(정액 · 정률 할인가)에 쿠폰 자리를 잡는다. 쿠폰 행을 잠근 안에서 다시 확인하므로 동시에 눌러도 전체 한도 · 내 한도를 넘지 않는다.
-- 확정하지 못하면 아무것도 바꾸지 않고 이유를 돌려준다(서비스가 그 주문을 취소하고 정가 주문으로 이어 간다). 같은 p_key로 다시 부르면 처음 결과를 돌려준다
create or replace function public.reserve_coupon(p_code text, p_user uuid, p_order uuid, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.coupons%rowtype;
  ord public.orders%rowtype;
  v_chk jsonb;
  v_id uuid;
  v_existing public.coupon_redemptions%rowtype;
begin
  select * into v_existing from public.coupon_redemptions where idempotency_key = p_key;
  if found then
    return jsonb_build_object('ok', true, 'redemptionId', v_existing.id, 'duplicate', true);
  end if;
  select * into c from public.coupons where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  -- 쿠폰별로 한 번에 하나씩(한도 확인 · 자리 잡기)
  perform pg_advisory_xact_lock(hashtextextended('coupon:' || c.id::text, 0));
  select * into ord from public.orders where id = p_order;
  if not found or ord.user_id <> p_user or ord.status <> 'pending' or ord.provider <> 'tosspayments' then
    return jsonb_build_object('ok', false, 'reason', 'order-mismatch');
  end if;
  v_chk := public.coupon_check(p_code, p_user, ord.product_id);
  if not (v_chk ->> 'ok')::boolean then return v_chk; end if;
  if c.type not in ('amount', 'percent') then return jsonb_build_object('ok', false, 'reason', 'type'); end if;
  insert into public.coupon_redemptions (coupon_id, user_id, order_id, status, idempotency_key)
    values (c.id, p_user, p_order, 'reserved', p_key) returning id into v_id;
  return jsonb_build_object('ok', true, 'redemptionId', v_id);
end;
$$;

-- 질문권 쿠폰을 쓴다(주문 없이): 사용 기록과 질문권 지급이 한 트랜잭션이다. 같은 p_key로 두 번 불러도 한 번만 지급한다
create or replace function public.redeem_credit_coupon(p_code text, p_user uuid, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.coupons%rowtype;
  v_chk jsonb;
  v_id uuid;
  v_days integer;
  v_existing public.coupon_redemptions%rowtype;
  v_grant jsonb;
begin
  select * into v_existing from public.coupon_redemptions where idempotency_key = p_key;
  if found then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  select * into c from public.coupons where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  perform pg_advisory_xact_lock(hashtextextended('coupon:' || c.id::text, 0));
  perform public.benefit_lock(p_user);
  v_chk := public.coupon_check(p_code, p_user, 'credit');
  if not (v_chk ->> 'ok')::boolean then return v_chk; end if;
  if c.type <> 'credit' then return jsonb_build_object('ok', false, 'reason', 'type'); end if;
  insert into public.coupon_redemptions (coupon_id, user_id, status, idempotency_key) values (c.id, p_user, 'used', p_key) returning id into v_id;
  v_days := coalesce(c.credit_expire_days, public.benefit_int('credit.expire_days', 0));
  v_grant := public.grant_credit(p_user, case when c.purpose = 'trial' then 'event' when c.purpose = 'cs' then 'admin' else 'promo' end,
    c.value, 'coupon:' || v_id::text, 'coupon-credit:' || v_id::text, case when v_days > 0 then now() + make_interval(days => v_days) else null end);
  return jsonb_build_object('ok', true, 'redemptionId', v_id, 'qty', c.value, 'grant', v_grant);
end;
$$;

-- 주문 상태가 바뀔 때 쿠폰 상태를 맞춘다: 결제 완료 → 사용 확정 · 실패 · 취소 → 풀림(한도 자리 반환). 환불은 쿠폰을 되살리지 않는다(결제금액만 환불)
create or replace function public.orders_coupon_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.status = 'paid' and old.status is distinct from 'paid' then
      update public.coupon_redemptions set status = 'used' where order_id = new.id and status = 'reserved';
    elsif new.status in ('failed', 'canceled') and old.status = 'pending' then
      update public.coupon_redemptions set status = 'released' where order_id = new.id and status = 'reserved';
    end if;
  exception when others then
    insert into public.benefit_failures (kind, ref, message) values ('orders_trigger_coupon', new.id::text, left(sqlerrm, 300));
  end;
  return new;
end;
$$;

create trigger orders_coupon_state after update of status on public.orders
  for each row execute function public.orders_coupon_state();

-- ─────────────────────────────────────────────
-- 3. 0원 혜택 주문
-- ─────────────────────────────────────────────

create table public.benefit_order_grants (
  order_id uuid primary key references public.orders (id) on delete restrict,
  -- coupon(100% 쿠폰 · 무료 이용권) · points(포인트 전액 교환) · admin(운영자 직접 지급 — 체험단 · 고객 응대)
  kind text not null check (kind in ('coupon', 'points', 'admin')),
  ref text,
  point_spent integer not null default 0 check (point_spent >= 0),
  coupon_redemption_id uuid references public.coupon_redemptions (id) on delete restrict,
  review_reward_eligible boolean not null default false,
  granted_by uuid,
  reason text check (reason is null or char_length(reason) <= 200),
  released_at timestamptz,
  release_mode text check (release_mode is null or release_mode in ('restore', 'revoke')),
  release_reason text check (release_reason is null or char_length(release_reason) <= 200),
  created_at timestamptz not null default now()
);

alter table public.benefit_order_grants enable row level security;
revoke all on public.benefit_order_grants from anon, authenticated;
grant select, insert, update on public.benefit_order_grants to service_role;

-- 혜택으로 개인 심층 리포트 한 건을 준다(PG 없음). 반드시 서버(service_role)만 부른다.
--  p_kind: coupon(p_coupon_code) · points(p_point_price = 서버가 정한 교환가) · admin(p_granted_by 필수 · 사유)
--  p_list_price: 정가(원) — 주문에 정가 · 할인액으로 남긴다
-- 결과: { ok: true, orderId, orderNumber } 또는 { ok: false, reason }
--  reason: assessment · product · already-granted · feature-off · coupon:<쿠폰 이유> · not-free(쿠폰이 100% 할인이 아님) · insufficient(포인트 부족) · price(교환가 없음 · 일치하지 않음) · admin
-- 한 트랜잭션: 쿠폰 · 포인트를 먼저 확정한 뒤 그 근거를 가리키는 주문을 만든다. 근거가 없으면 주문도 없다(예외가 나면 모두 취소된다)
create or replace function public.grant_benefit_order(
  p_user uuid, p_assessment uuid, p_product text, p_kind text,
  p_coupon_code text, p_point_price integer, p_list_price integer,
  p_order_number text, p_payment_env text default 'test',
  p_granted_by uuid default null, p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assessments%rowtype;
  c public.coupons%rowtype;
  v_chk jsonb;
  v_price jsonb;
  v_order uuid;
  v_red uuid;
  v_spend jsonb;
  v_final integer;
  v_pkey text;
  v_disc_kind text;
  v_disc_ref text;
  v_review boolean := false;
begin
  if p_user is null or p_order_number is null or p_list_price is null or p_list_price <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  perform public.benefit_lock(p_user);
  select * into a from public.assessments where id = p_assessment and user_id = p_user and withdrawn_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'assessment'); end if;
  if p_product <> 'personal-integrated-report' and p_product !~ '^personal-integrated-report:r[0-9]+$' then
    return jsonb_build_object('ok', false, 'reason', 'product');
  end if;
  if exists (select 1 from public.orders where assessment_id = p_assessment and product_id = p_product and status = 'paid') then
    return jsonb_build_object('ok', false, 'reason', 'already-granted');
  end if;

  -- 1) 근거를 확인한다(주문을 만들기 전에, 부작용 없이)
  if p_kind = 'coupon' then
    select * into c from public.coupons where code = upper(btrim(coalesce(p_coupon_code, '')));
    if not found then return jsonb_build_object('ok', false, 'reason', 'coupon:not-found'); end if;
    perform pg_advisory_xact_lock(hashtextextended('coupon:' || c.id::text, 0));
    v_chk := public.coupon_check(p_coupon_code, p_user, p_product);
    if not (v_chk ->> 'ok')::boolean then return jsonb_build_object('ok', false, 'reason', 'coupon:' || (v_chk ->> 'reason')); end if;
    -- 최종 금액이 0원인 쿠폰만 이 경로로 온다(정액 · 정률 할인은 결제 주문 경로 — reserve_coupon)
    v_final := case
      when c.type in ('free-product', 'free-report-entitlement') then 0
      when c.type = 'percent' then greatest(0, p_list_price - floor(p_list_price::numeric * c.value / 100)::integer)
      when c.type = 'amount' then greatest(0, p_list_price - c.value)
      else null end;
    if v_final is distinct from 0 then return jsonb_build_object('ok', false, 'reason', 'not-free'); end if;
    v_disc_kind := 'coupon';
    v_disc_ref := c.code;
    v_review := c.review_reward_eligible;
  elsif p_kind = 'points' then
    if not public.benefit_flag('feature.points_spend') then return jsonb_build_object('ok', false, 'reason', 'feature-off'); end if;
    v_price := public.benefit_setting('point.prices');
    -- 교환가는 서버가 정한 설정값과 같아야 한다(브라우저가 보낸 값 · 코드가 계산한 값을 믿지 않는다). 다시 받기(:r2 …)는 같은 상품의 교환가를 쓴다
    v_pkey := case when p_product ~ ':r[0-9]+$' then 'personal-integrated-report' else p_product end;
    if p_point_price is null or p_point_price <= 0 or v_price is null or (v_price ->> v_pkey) is null
       or (v_price ->> v_pkey)::integer <> p_point_price then
      return jsonb_build_object('ok', false, 'reason', 'price');
    end if;
    if public.point_balance(p_user) < p_point_price then return jsonb_build_object('ok', false, 'reason', 'insufficient'); end if;
    v_disc_kind := 'points';
    v_disc_ref := 'P' || p_point_price::text;
  elsif p_kind = 'admin' then
    if p_granted_by is null or p_reason is null or char_length(btrim(p_reason)) = 0 then return jsonb_build_object('ok', false, 'reason', 'admin'); end if;
    v_disc_kind := 'admin';
    v_disc_ref := 'admin';
  else
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- 2) 이 사람의 같은 상품 결제 대기 주문은 정리한다(같은 결과 · 상품에 대기 주문은 하나만)
  update public.orders set status = 'canceled', failure_code = 'SUPERSEDED', failure_message = '혜택 주문으로 대체됨'
   where assessment_id = p_assessment and product_id = p_product and user_id = p_user and status = 'pending';

  -- 3) 주문(0원 · 혜택) — 이 트랜잭션에서만 허용하도록 주문번호를 표시한다
  perform set_config('miyu.benefit_grant', p_order_number, true);
  insert into public.orders (order_number, user_id, assessment_id, product_id, amount, status, provider, approved_at, payment_env,
                             list_amount, discount_krw, discount_kind, discount_ref)
    values (p_order_number, p_user, p_assessment, p_product, 0, 'paid', 'benefit', now(), coalesce(p_payment_env, 'test'),
            p_list_price, p_list_price, v_disc_kind, v_disc_ref)
    returning id into v_order;

  -- 4) 근거를 확정한다
  if p_kind = 'coupon' then
    insert into public.coupon_redemptions (coupon_id, user_id, order_id, status, idempotency_key)
      values (c.id, p_user, v_order, 'used', 'benefit-order:' || v_order::text) returning id into v_red;
  elsif p_kind = 'points' then
    v_spend := public.spend_points(p_user, p_point_price, p_order_number);
    if v_spend ->> 'status' <> 'spent' then raise exception 'point spend failed: %', v_spend ->> 'status'; end if;
  end if;

  insert into public.benefit_order_grants (order_id, kind, ref, point_spent, coupon_redemption_id, review_reward_eligible, granted_by, reason)
    values (v_order, p_kind, v_disc_ref, case when p_kind = 'points' then p_point_price else 0 end, v_red, v_review, p_granted_by, left(p_reason, 200));
  return jsonb_build_object('ok', true, 'orderId', v_order, 'orderNumber', p_order_number);
end;
$$;

-- 혜택 주문 회수. p_mode: restore(리포트를 만들지 못함 — 쓴 포인트 · 쿠폰을 돌려준다) · revoke(부정 이용 — 돌려주지 않는다).
-- 주문은 환불됨(refunded)으로 바뀌어 구매 권한이 끝난다. 이미 만든 리포트는 지우지 않는다. 한 주문은 한 번만 회수한다
create or replace function public.release_benefit_order(p_order uuid, p_mode text, p_reason text, p_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
  g public.benefit_order_grants%rowtype;
  v_restore jsonb;
begin
  if p_mode not in ('restore', 'revoke') then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  select * into o from public.orders where id = p_order;
  if not found or o.provider <> 'benefit' then return jsonb_build_object('ok', false, 'reason', 'not-benefit'); end if;
  perform public.benefit_lock(o.user_id);
  select * into g from public.benefit_order_grants where order_id = p_order for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-benefit'); end if;
  if g.released_at is not null then return jsonb_build_object('ok', true, 'already', true); end if;
  if o.status <> 'paid' then return jsonb_build_object('ok', false, 'reason', 'not-paid'); end if;

  update public.orders set status = 'refunded', failure_code = 'BENEFIT_RELEASED', failure_message = left(coalesce(p_reason, ''), 200) where id = p_order;
  if p_mode = 'restore' then
    if g.kind = 'points' then
      v_restore := public.restore_points_spend(o.user_id, o.order_number);
    elsif g.kind = 'coupon' and g.coupon_redemption_id is not null then
      update public.coupon_redemptions set status = 'released' where id = g.coupon_redemption_id;
    end if;
  elsif g.kind = 'coupon' and g.coupon_redemption_id is not null then
    update public.coupon_redemptions set status = 'revoked' where id = g.coupon_redemption_id;
  end if;
  update public.benefit_order_grants set released_at = now(), release_mode = p_mode, release_reason = left(p_reason, 200) where order_id = p_order;
  return jsonb_build_object('ok', true, 'mode', p_mode, 'restore', v_restore);
end;
$$;

revoke all on function public.coupon_check(text, uuid, text) from public, anon, authenticated;
revoke all on function public.reserve_coupon(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.redeem_credit_coupon(text, uuid, text) from public, anon, authenticated;
revoke all on function public.orders_coupon_state() from public, anon, authenticated;
revoke all on function public.grant_benefit_order(uuid, uuid, text, text, text, integer, integer, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.release_benefit_order(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.coupon_check(text, uuid, text) to service_role;
grant execute on function public.reserve_coupon(text, uuid, uuid, text) to service_role;
grant execute on function public.redeem_credit_coupon(text, uuid, text) to service_role;
grant execute on function public.grant_benefit_order(uuid, uuid, text, text, text, integer, integer, text, text, uuid, text) to service_role;
grant execute on function public.release_benefit_order(uuid, text, text, uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 21번: 20261031000000_referrals.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 21번째 마이그레이션 — 친구 추천(새 정책): 추천 링크 · 추천 가입 검증 후 500P · 친구 첫 구매 6,900원 · 첫 구매 시 양쪽 질문권.
-- 앞의 파일들(1~20번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다.
--
-- ⚠️ 개발 · 테스트 환경에서만 적용해 확인했다. 운영 DB에는 아직 적용하지 않았고, 운영자가 별도로 승인한 뒤에 적용한다.
--
-- 기존 초대 링크 · 초대 할인(18번: 5,900원 · 한 명당 3명)은 **고치지 않는다.** 새 추천은 별도 표 · 함수로 더하고, 앱이 설정 feature.referral이 켜져 있을 때만 새 경로를 쓴다
-- (꺼져 있으면 기존 초대 할인 그대로 동작한다). 이미 받은 초대 할인 기록 · 주문 · 질문권 · 권한은 그대로다.
--
-- 운영자 결정(2026-10-17, D14 + 6가지 정책):
--  - 추천 링크: 가입 회원 누구나, 초대 인원 제한 없음.
--  - 추천 가입 보상 500P는 **가입 즉시 확정하지 않는다.** 확정 조건: 계정 확인 → 무료 분석 1회 정상 완료 → (보류 시간 지남 · 중복 · 부정 가입 검사 통과) → 추천인 500P 지급.
--    위험 신호가 있거나 한도(추천인별 하루 확정 수)를 넘으면 지급하지 않고 관리자 확인 대기(review)로 올린다. 무료 분석을 끝낸 가짜 계정까지 막는다는 뜻은 아니며 중복 · 패턴 · 한도 · 이상 징후는 별도로 지켜본다.
--  - 친구 첫 구매: 추천으로 가입한 회원이 개인 심층 리포트를 처음 살 때 6,900원(정가 9,900원). 첫 구매 1회(환불해도 다시 할인받지 못한다).
--  - 첫 구매 보상: 정상 결제가 확인되면 추천인 · 구매자 각각 질문권 1개(주문당 한 번). 환불되면 미사용분만 회수하고 이미 쓴 몫은 shortfall로 남긴다.
--  - 모든 보상은 설정(feature.referral_signup_points · feature.referral_purchase_credits)으로 관리자가 중지할 수 있다.

create table public.referral_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24}$'),
  created_at timestamptz not null default now(),
  deactivated_at timestamptz
);

-- 링크 방문 측정(익명 방문 번호만 — 회원번호 · 이름 · 생년월일 없음). 90일 뒤 정리한다
create table public.referral_visits (
  id bigint generated always as identity primary key,
  token text not null,
  anon_id text not null check (char_length(anon_id) between 8 and 64),
  created_at timestamptz not null default now()
);

create index referral_visits_token_idx on public.referral_visits (token, created_at desc);
create index referral_visits_anon_idx on public.referral_visits (anon_id, token);

-- 신규 회원 한 명의 추천인은 한 명(평생 한 줄)
create table public.referral_signups (
  invitee_user_id uuid primary key references auth.users (id) on delete cascade,
  inviter_user_id uuid not null references auth.users (id) on delete restrict,
  link_token text not null,
  anon_id text check (anon_id is null or char_length(anon_id) between 8 and 64),
  -- pending: 검증 대기 · review: 위험 신호 · 한도 초과로 관리자 확인 대기 · confirmed: 500P 지급 확정 · rejected: 지급하지 않기로 함 · revoked: 확정 뒤 부정이 확인되어 회수
  status text not null default 'pending' check (status in ('pending', 'review', 'confirmed', 'rejected', 'revoked')),
  risk jsonb not null default '[]'::jsonb,
  signed_up_at timestamptz not null default now(),
  hold_until timestamptz not null,
  decided_at timestamptz,
  decided_by uuid,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 200),
  constraint referral_signups_not_self check (invitee_user_id <> inviter_user_id)
);

create index referral_signups_inviter_idx on public.referral_signups (inviter_user_id, status);
create index referral_signups_status_idx on public.referral_signups (status, hold_until);

-- 추천받은 친구의 첫 심층 리포트 구매 추적(첫 구매 1회)
create table public.referral_first_purchases (
  invitee_user_id uuid primary key references public.referral_signups (invitee_user_id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete restrict,
  -- pending: 결제 전 · confirmed: 결제 확인 · held: 추천 가입이 관리자 확인 대기라 질문권 보류 · void: 결제 실패 · 취소(다시 할인 가능) · revoked: 환불됨 · 보상 대상 아님(다시 할인받지 못한다)
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'held', 'void', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger referral_first_purchases_updated_at before update on public.referral_first_purchases
  for each row execute function public.set_updated_at();

alter table public.referral_links enable row level security;
alter table public.referral_visits enable row level security;
alter table public.referral_signups enable row level security;
alter table public.referral_first_purchases enable row level security;
-- 추천인은 자기 링크만 읽는다. 다른 표는 서버만 쓰고 읽는다(다른 사람의 이름 · 결과는 보이지 않는다)
create policy "본인 추천 링크 조회" on public.referral_links for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.referral_links, public.referral_visits, public.referral_signups, public.referral_first_purchases from anon, authenticated;
grant select on public.referral_links to authenticated;
grant select, insert, update, delete on public.referral_links, public.referral_visits, public.referral_signups, public.referral_first_purchases to service_role;
grant usage, select on sequence public.referral_visits_id_seq to service_role;

-- 이 회원의 추천 링크(없으면 만든다). 같은 회원은 언제나 같은 링크를 받는다
create or replace function public.ensure_referral_link(p_user uuid, p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  perform public.benefit_lock(p_user);
  insert into public.referral_links (user_id, token) values (p_user, p_token) on conflict (user_id) do nothing;
  select token into v_token from public.referral_links where user_id = p_user;
  return v_token;
end;
$$;

create or replace function public.log_referral_visit(p_token text, p_anon text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_anon is null or char_length(p_anon) < 8 then return; end if;
  if exists (select 1 from public.referral_links where token = p_token and deactivated_at is null) then
    insert into public.referral_visits (token, anon_id) values (p_token, left(p_anon, 64));
  end if;
end;
$$;

-- 새 회원이 추천 링크로 가입했음을 기록한다(가입을 마친 직후 서버가 부른다). 보상은 여기서 주지 않는다 — evaluate_referral_signup이 조건을 확인한 뒤 확정한다.
-- 결과: { ok: true, status, risk } · { ok: true, already: true } · { ok: false, reason }
--  reason: feature-off · invalid(없는 링크 · 중지된 링크) · self(본인 링크) · no-profile · not-new(가입한 지 오래됐거나 이미 구매함 — 신규 회원만 추천 가입으로 센다)
create or replace function public.register_referral_signup(p_token text, p_invitee uuid, p_anon text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.referral_links%rowtype;
  v_prof timestamptz;
  v_inviter_prof timestamptz;
  v_risk jsonb := '[]'::jsonb;
  v_first timestamptz;
  v_burst integer;
  v_existing public.referral_signups%rowtype;
begin
  if not public.benefit_flag('feature.referral') then return jsonb_build_object('ok', false, 'reason', 'feature-off'); end if;
  select * into l from public.referral_links where token = p_token and deactivated_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if l.user_id = p_invitee then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  perform public.benefit_lock(l.user_id);
  select * into v_existing from public.referral_signups where invitee_user_id = p_invitee;
  if found then return jsonb_build_object('ok', true, 'already', true, 'status', v_existing.status); end if;
  select created_at into v_prof from public.profiles where id = p_invitee;
  if v_prof is null then return jsonb_build_object('ok', false, 'reason', 'no-profile'); end if;
  if now() - v_prof > make_interval(hours => public.benefit_int('referral.new_member_hours', 48))
     or exists (select 1 from public.orders o where o.user_id = p_invitee and o.status in ('paid', 'refunded')) then
    return jsonb_build_object('ok', false, 'reason', 'not-new');
  end if;

  -- 위험 신호(제안 기준 · 설정으로 바꾼다). 신호가 있어도 가입은 기록하고 지급만 관리자 확인으로 올린다
  if p_anon is not null and char_length(p_anon) >= 8 then
    if exists (select 1 from public.referral_signups s where s.inviter_user_id = l.user_id and s.anon_id = left(p_anon, 64)) then
      v_risk := v_risk || '"same_device_repeat"'::jsonb;
    end if;
    select min(created_at) into v_first from public.referral_visits where token = p_token and anon_id = left(p_anon, 64);
    if v_first is not null and now() - v_first < make_interval(secs => public.benefit_int('referral.risk.min_visit_seconds', 10)) then
      v_risk := v_risk || '"too_fast"'::jsonb;
    end if;
  end if;
  select count(*) into v_burst from public.referral_signups where link_token = p_token and signed_up_at > now() - interval '1 hour';
  if v_burst >= public.benefit_int('referral.risk.burst_per_hour', 10) then v_risk := v_risk || '"burst"'::jsonb; end if;
  select created_at into v_inviter_prof from public.profiles where id = l.user_id;
  if v_inviter_prof is not null and now() - v_inviter_prof < make_interval(mins => public.benefit_int('referral.risk.young_inviter_minutes', 60)) then
    v_risk := v_risk || '"young_inviter"'::jsonb;
  end if;

  insert into public.referral_signups (invitee_user_id, inviter_user_id, link_token, anon_id, status, risk, hold_until)
    values (p_invitee, l.user_id, p_token, left(p_anon, 64), case when jsonb_array_length(v_risk) = 0 then 'pending' else 'review' end, v_risk,
            now() + make_interval(hours => public.benefit_int('referral.hold_hours', 72)));
  return jsonb_build_object('ok', true, 'status', case when jsonb_array_length(v_risk) = 0 then 'pending' else 'review' end, 'risk', v_risk);
end;
$$;

-- 추천인에게 줄 500P의 확정 조건을 확인하고 충족하면 지급한다(주기적으로 · 무료 분석을 마친 직후에 부른다).
-- 결과 status: not-found · decided(이미 확정 · 거절 · 회수) · feature-off · not-confirmed(계정 확인 전) · no-analysis(무료 분석 전) · holding(보류 시간) · review(관리자 확인 대기) · confirmed
create or replace function public.evaluate_referral_signup(p_invitee uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.referral_signups%rowtype;
  v_points integer;
  v_days integer;
  v_grant jsonb;
  v_today integer;
  v_cap integer;
begin
  select * into s from public.referral_signups where invitee_user_id = p_invitee;
  if not found then return jsonb_build_object('status', 'not-found'); end if;
  perform public.benefit_lock(s.inviter_user_id);
  select * into s from public.referral_signups where invitee_user_id = p_invitee for update;
  if s.status in ('confirmed', 'rejected', 'revoked') then return jsonb_build_object('status', 'decided', 'to', s.status); end if;
  if not public.benefit_flag('feature.referral_signup_points') then return jsonb_build_object('status', 'feature-off'); end if;
  -- 1) 계정 확인(이메일 확인 또는 소셜 로그인)
  if not exists (
    select 1 from auth.users u where u.id = p_invitee
       and (u.email_confirmed_at is not null or exists (select 1 from auth.identities i where i.user_id = u.id and i.provider <> 'email'))
  ) then
    return jsonb_build_object('status', 'not-confirmed');
  end if;
  -- 2) 무료 분석 1회 정상 완료(저장된 분석 결과)
  if not exists (select 1 from public.assessments a where a.user_id = p_invitee and a.withdrawn_at is null) then
    return jsonb_build_object('status', 'no-analysis');
  end if;
  -- 3) 보류 시간
  if now() < s.hold_until then return jsonb_build_object('status', 'holding', 'until', s.hold_until); end if;
  -- 4) 위험 신호가 있으면 관리자 확인으로
  if s.status = 'review' or jsonb_array_length(s.risk) > 0 then
    if s.status <> 'review' then update public.referral_signups set status = 'review' where invitee_user_id = p_invitee; end if;
    return jsonb_build_object('status', 'review');
  end if;
  -- 5) 추천인별 하루 확정 한도(지급 한도)
  v_cap := public.benefit_int('referral.max_confirmed_per_inviter_per_day', 20);
  select count(*) into v_today from public.referral_signups x
   where x.inviter_user_id = s.inviter_user_id and x.status = 'confirmed' and x.decided_at > now() - interval '1 day';
  if v_today >= v_cap then
    update public.referral_signups set status = 'review', risk = risk || '"daily_cap"'::jsonb where invitee_user_id = p_invitee;
    return jsonb_build_object('status', 'review');
  end if;

  v_points := public.benefit_int('referral.signup_points', 500);
  v_days := public.benefit_int('point.expire_days', 0);
  v_grant := public.grant_points(s.inviter_user_id, v_points, 'referral_signup', p_invitee::text, 'referral-signup:' || p_invitee::text,
    case when v_days > 0 then now() + make_interval(days => v_days) else null end, null, jsonb_build_object('inviteeConfirmedAt', now()));
  update public.referral_signups set status = 'confirmed', decided_at = now() where invitee_user_id = p_invitee;
  return jsonb_build_object('status', 'confirmed', 'points', v_points, 'grant', v_grant);
end;
$$;

-- 관리자 결정: confirm(위험 신호를 확인하고 지급 확정) · reject(지급하지 않음). 사유 필수.
-- confirm은 계정 확인 · 무료 분석 완료는 여전히 요구한다(빈 가입에는 지급하지 않는다). 보류 시간 · 위험 신호만 관리자가 건너뛴다. 결제 보상이 보류돼 있었다면 함께 처리한다
create or replace function public.admin_decide_referral_signup(p_invitee uuid, p_decision text, p_reason text, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.referral_signups%rowtype;
  v_points integer;
  v_days integer;
  v_grant jsonb;
  v_held public.referral_first_purchases%rowtype;
begin
  if p_reason is null or char_length(btrim(p_reason)) = 0 then return jsonb_build_object('ok', false, 'reason', 'reason'); end if;
  if p_decision not in ('confirm', 'reject') then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  select * into s from public.referral_signups where invitee_user_id = p_invitee;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;
  perform public.benefit_lock(s.inviter_user_id);
  select * into s from public.referral_signups where invitee_user_id = p_invitee for update;
  if s.status not in ('pending', 'review') then return jsonb_build_object('ok', false, 'reason', 'decided'); end if;
  if p_decision = 'reject' then
    update public.referral_signups set status = 'rejected', decided_at = now(), decided_by = p_admin, decision_reason = left(p_reason, 200) where invitee_user_id = p_invitee;
    -- 보류돼 있던 첫 구매 질문권도 주지 않는다
    update public.referral_first_purchases set status = 'revoked' where invitee_user_id = p_invitee and status = 'held';
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;
  if not public.benefit_flag('feature.referral_signup_points') then return jsonb_build_object('ok', false, 'reason', 'feature-off'); end if;
  if not exists (
    select 1 from auth.users u where u.id = p_invitee
       and (u.email_confirmed_at is not null or exists (select 1 from auth.identities i where i.user_id = u.id and i.provider <> 'email'))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not-confirmed');
  end if;
  if not exists (select 1 from public.assessments a where a.user_id = p_invitee and a.withdrawn_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'no-analysis');
  end if;
  v_points := public.benefit_int('referral.signup_points', 500);
  v_days := public.benefit_int('point.expire_days', 0);
  v_grant := public.grant_points(s.inviter_user_id, v_points, 'referral_signup', p_invitee::text, 'referral-signup:' || p_invitee::text,
    case when v_days > 0 then now() + make_interval(days => v_days) else null end, null, jsonb_build_object('adminDecided', true));
  update public.referral_signups set status = 'confirmed', decided_at = now(), decided_by = p_admin, decision_reason = left(p_reason, 200) where invitee_user_id = p_invitee;
  -- 보류돼 있던 첫 구매 질문권을 이어서 처리한다
  select * into v_held from public.referral_first_purchases where invitee_user_id = p_invitee and status = 'held';
  if found then
    update public.referral_first_purchases set status = 'pending' where invitee_user_id = p_invitee;
    perform public.confirm_referral_purchase(v_held.order_id);
  end if;
  return jsonb_build_object('ok', true, 'status', 'confirmed', 'points', v_points, 'grant', v_grant);
end;
$$;

-- 확정된 추천 가입을 부정으로 확인해 회수한다(미사용 포인트만 · 이미 쓴 몫은 회수 불가 이력). 사유 필수
create or replace function public.revoke_referral_signup(p_invitee uuid, p_reason text, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.referral_signups%rowtype;
  v_claw jsonb;
begin
  if p_reason is null or char_length(btrim(p_reason)) = 0 then return jsonb_build_object('ok', false, 'reason', 'reason'); end if;
  select * into s from public.referral_signups where invitee_user_id = p_invitee;
  if not found or s.status <> 'confirmed' then return jsonb_build_object('ok', false, 'reason', 'not-confirmed'); end if;
  v_claw := public.clawback_points_by_source('referral_signup', p_invitee::text, left(p_reason, 100));
  update public.referral_signups set status = 'revoked', decided_at = now(), decided_by = p_admin, decision_reason = left(p_reason, 200) where invitee_user_id = p_invitee;
  return jsonb_build_object('ok', true, 'clawback', v_claw);
end;
$$;

-- 이 사람이 추천 가격(6,900원)을 받을 수 있는가(읽기만).
-- 결과: { ok: true, price, inviterUserId } 또는 { ok: false, reason } — feature-off · no-signup(추천으로 가입한 기록 없음) · signup-rejected · not-first(이미 심층 리포트를 샀다) · used(이미 추천 가격으로 구매했다)
create or replace function public.referral_discount_status(p_invitee uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.referral_signups%rowtype;
  fp public.referral_first_purchases%rowtype;
  v_ostatus text;
begin
  if not public.benefit_flag('feature.referral') then return jsonb_build_object('ok', false, 'reason', 'feature-off'); end if;
  select * into s from public.referral_signups where invitee_user_id = p_invitee;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no-signup'); end if;
  if s.status in ('rejected', 'revoked') then return jsonb_build_object('ok', false, 'reason', 'signup-rejected'); end if;
  select * into fp from public.referral_first_purchases where invitee_user_id = p_invitee;
  if found then
    if fp.status in ('confirmed', 'held', 'revoked') then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
    if fp.status = 'pending' then
      select status into v_ostatus from public.orders where id = fp.order_id;
      if v_ostatus = 'paid' then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
    end if;
  elsif exists (
    select 1 from public.orders o
     where o.user_id = p_invitee and o.status in ('paid', 'refunded')
       and (o.product_id = 'personal-integrated-report' or o.product_id like 'personal-integrated-report:r%')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not-first');
  end if;
  return jsonb_build_object('ok', true, 'price', public.benefit_int('referral.invitee_price', 6900), 'inviterUserId', s.inviter_user_id);
end;
$$;

-- 이미 만든 결제 대기 주문(6,900원)에 추천 가격을 확정한다. 주문 금액이 설정 가격과 같고 이 사람의 심층 리포트 첫 구매 상품이어야 한다.
-- 확정하지 못하면 아무것도 바꾸지 않고 이유를 돌려준다(서비스가 그 주문을 취소하고 고객이 정가를 확인하게 한다). 결과는 referral_discount_status와 같은 모양(+ order-mismatch)
create or replace function public.claim_referral_discount(p_invitee uuid, p_order uuid, p_list_price integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status jsonb;
  ord public.orders%rowtype;
  fp public.referral_first_purchases%rowtype;
begin
  perform public.benefit_lock(p_invitee);
  v_status := public.referral_discount_status(p_invitee);
  if not (v_status ->> 'ok')::boolean then return v_status; end if;
  select * into ord from public.orders where id = p_order;
  if not found or ord.user_id <> p_invitee or ord.status <> 'pending' or ord.provider <> 'tosspayments'
     or ord.product_id <> 'personal-integrated-report' or ord.amount <> (v_status ->> 'price')::integer then
    return jsonb_build_object('ok', false, 'reason', 'order-mismatch');
  end if;
  select * into fp from public.referral_first_purchases where invitee_user_id = p_invitee for update;
  if found then
    -- 이전 할인 주문이 결제 대기로 남아 있으면 취소한다(두 주문 모두 추천 가격으로 결제되는 일을 막는다)
    if fp.order_id <> p_order then
      update public.orders set status = 'canceled', failure_code = 'DISCOUNT_REPLACED', failure_message = '새 추천 가격 주문으로 대체됨'
       where id = fp.order_id and status = 'pending';
    end if;
    update public.referral_first_purchases set order_id = p_order, status = 'pending' where invitee_user_id = p_invitee;
  else
    insert into public.referral_first_purchases (invitee_user_id, order_id) values (p_invitee, p_order);
  end if;
  update public.orders set list_amount = p_list_price, discount_krw = greatest(p_list_price - ord.amount, 0), discount_kind = 'referral', discount_ref = 'referral'
   where id = p_order;
  return v_status;
end;
$$;

-- 친구 첫 구매가 결제 완료로 확인됐을 때: 추천인 · 구매자에게 질문권을 준다(주문당 각각 한 번). 주문이 paid로 바뀌는 트랜잭션에서 부른다
-- 결과 status: nothing · void-signup(추천 가입이 거절 · 회수됨) · off(보상이 꺼져 있음 — 켜도 소급하지 않는다) · held(관리자 확인 대기 중이라 보류) · confirmed
create or replace function public.confirm_referral_purchase(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fp public.referral_first_purchases%rowtype;
  s public.referral_signups%rowtype;
  v_days integer;
  v_exp timestamptz;
  v_src text := 'referral-buy:' || p_order::text;
begin
  select * into fp from public.referral_first_purchases where order_id = p_order for update;
  if not found or fp.status <> 'pending' then return jsonb_build_object('status', 'nothing'); end if;
  select * into s from public.referral_signups where invitee_user_id = fp.invitee_user_id;
  if not found or s.status in ('rejected', 'revoked') then
    update public.referral_first_purchases set status = 'revoked' where invitee_user_id = fp.invitee_user_id;
    return jsonb_build_object('status', 'void-signup');
  end if;
  if not public.benefit_flag('feature.referral_purchase_credits') then
    update public.referral_first_purchases set status = 'confirmed' where invitee_user_id = fp.invitee_user_id;
    perform public.benefit_claim_op('referral-buy-skipped:' || p_order::text, fp.invitee_user_id, 'referral-buy-skipped');
    return jsonb_build_object('status', 'off');
  end if;
  if s.status = 'review' then
    update public.referral_first_purchases set status = 'held' where invitee_user_id = fp.invitee_user_id;
    return jsonb_build_object('status', 'held');
  end if;
  v_days := public.benefit_int('credit.expire_days', 0);
  v_exp := case when v_days > 0 then now() + make_interval(days => v_days) else null end;
  perform public.grant_credit(s.inviter_user_id, 'referral_inviter', public.benefit_int('referral.inviter_credits', 1), v_src, v_src || ':inviter', v_exp);
  perform public.grant_credit(fp.invitee_user_id, 'referral_invitee', public.benefit_int('referral.invitee_credits', 1), v_src, v_src || ':invitee', v_exp);
  update public.referral_first_purchases set status = 'confirmed' where invitee_user_id = fp.invitee_user_id;
  return jsonb_build_object('status', 'confirmed');
end;
$$;

-- 주문 상태가 바뀔 때: 결제 완료 → 첫 구매 보상 · 환불 → 미사용 질문권 회수 · 결제 실패 · 취소 → 추천 가격을 다시 쓸 수 있게 풀기. 오류가 나도 결제 확정은 그대로 진행한다
create or replace function public.orders_referral_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.status = 'paid' and old.status is distinct from 'paid' then
      perform public.confirm_referral_purchase(new.id);
    elsif new.status = 'refunded' and old.status = 'paid' then
      if exists (select 1 from public.referral_first_purchases where order_id = new.id and status in ('confirmed', 'held')) then
        perform public.revoke_credits_by_source('referral-buy:' || new.id::text, 'order-refunded');
        update public.referral_first_purchases set status = 'revoked' where order_id = new.id;
      end if;
    elsif new.status in ('failed', 'canceled') and old.status = 'pending' then
      update public.referral_first_purchases set status = 'void' where order_id = new.id and status = 'pending';
    end if;
  exception when others then
    insert into public.benefit_failures (kind, ref, message) values ('orders_trigger_referral', new.id::text, left(sqlerrm, 300));
  end;
  return new;
end;
$$;

create trigger orders_referral_state after update of status on public.orders
  for each row execute function public.orders_referral_state();

-- 정기 점검: 보류 시간이 지난 추천 가입 확인 + 트리거가 놓친 첫 구매 보상 처리 + 오래된 방문 기록 정리
create or replace function public.reconcile_referrals()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_eval integer := 0;
  v_confirmed integer := 0;
  v_buy integer := 0;
  v_res jsonb;
  v_visits integer;
begin
  for r in select invitee_user_id from public.referral_signups where status in ('pending', 'review') and hold_until <= now() order by hold_until loop
    begin
      v_res := public.evaluate_referral_signup(r.invitee_user_id);
      v_eval := v_eval + 1;
      if v_res ->> 'status' = 'confirmed' then v_confirmed := v_confirmed + 1; end if;
    exception when others then
      insert into public.benefit_failures (kind, ref, message) values ('reconcile_referral_signup', r.invitee_user_id::text, left(sqlerrm, 300));
    end;
  end loop;
  for r in
    select fp.order_id from public.referral_first_purchases fp join public.orders o on o.id = fp.order_id
     where fp.status = 'pending' and o.status = 'paid'
  loop
    begin
      perform public.confirm_referral_purchase(r.order_id);
      v_buy := v_buy + 1;
    exception when others then
      insert into public.benefit_failures (kind, ref, message) values ('reconcile_referral_purchase', r.order_id::text, left(sqlerrm, 300));
    end;
  end loop;
  perform set_config('miyu.benefit_maintenance', 'on', true);
  delete from public.referral_visits where created_at < now() - interval '90 days';
  get diagnostics v_visits = row_count;
  return jsonb_build_object('evaluated', v_eval, 'confirmedSignups', v_confirmed, 'purchaseRewards', v_buy, 'visitsPurged', v_visits);
end;
$$;

revoke all on function public.ensure_referral_link(uuid, text) from public, anon, authenticated;
revoke all on function public.log_referral_visit(text, text) from public, anon, authenticated;
revoke all on function public.register_referral_signup(text, uuid, text) from public, anon, authenticated;
revoke all on function public.evaluate_referral_signup(uuid) from public, anon, authenticated;
revoke all on function public.admin_decide_referral_signup(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.revoke_referral_signup(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.referral_discount_status(uuid) from public, anon, authenticated;
revoke all on function public.claim_referral_discount(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.confirm_referral_purchase(uuid) from public, anon, authenticated;
revoke all on function public.orders_referral_state() from public, anon, authenticated;
revoke all on function public.reconcile_referrals() from public, anon, authenticated;
grant execute on function public.ensure_referral_link(uuid, text) to service_role;
grant execute on function public.log_referral_visit(text, text) to service_role;
grant execute on function public.register_referral_signup(text, uuid, text) to service_role;
grant execute on function public.evaluate_referral_signup(uuid) to service_role;
grant execute on function public.admin_decide_referral_signup(uuid, text, text, uuid) to service_role;
grant execute on function public.revoke_referral_signup(uuid, text, uuid) to service_role;
grant execute on function public.referral_discount_status(uuid) to service_role;
grant execute on function public.claim_referral_discount(uuid, uuid, integer) to service_role;
grant execute on function public.confirm_referral_purchase(uuid) to service_role;
grant execute on function public.reconcile_referrals() to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 22번: 20261101000000_benefit_finance_ai.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 22번째 마이그레이션 — 혜택 시스템의 마무리: 원가 측정(ai_usage 열) · 비용 입력(광고비 · 고정비) · 탈퇴 시 혜택 정리.
-- 앞의 파일들(1~21번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다.
--
-- ⚠️ 개발 · 테스트 환경에서만 적용해 확인했다. 운영 DB에는 아직 적용하지 않았고, 운영자가 별도로 승인한 뒤에 적용한다.
--
-- 더하기만 한다(열 추가 · 표 추가 · 탈퇴 함수 갱신). 기존 데이터는 바뀌거나 지워지지 않는다.
--
-- 1) ai_usage에 질문 한 번의 원가를 읽을 수 있는 열을 더한다: 어느 기능의 호출인지(purpose) · 어떤 질문권으로 물었는지(credit_source) · 방(room_key) ·
--    한 질문(요청)의 첫 호출 + 재작성 호출을 묶는 번호(request_key). 이 열이 비어 있는 예전 기록은 "분류 안 됨"으로 센다. 질문 · 답 내용은 담지 않는다.
--    질문 1회당 평균 · 95백분위 · 재시도 원가를 임의의 값(예: 30원)으로 정하지 않고 이 기록에서 직접 계산한다.
-- 2) benefit_expenses: 광고비 · 고정비 입력(관리자가 직접 입력). 수익 화면의 손익 계산에 쓴다. 금액과 메모뿐이며 개인정보는 없다.
-- 3) 탈퇴(withdraw_member_data) 갱신 — 운영자 결정 2026-10-17(⑷): 남은 무상 혜택의 이용을 종료한다(잔액 때문에 탈퇴를 막지 않는다). 개인 분석 · 응답은 삭제하고,
--    혜택 장부(금액 · 주문번호 · 회원번호뿐)는 거래 · 정산 기록이라 분리해 남기되 추천 링크 · 방문 기록 · 위험 신호 세부는 지운다. 장부를 얼마나 오래 보관할지는 법률 검토로 정하며,
--    그때까지는 정리하지 않는다(설정 benefit.withdrawn_ledger_retention_days가 null — purge_withdrawn_benefit_ledgers가 정해진 일수가 지난 탈퇴 회원의 장부를 지운다).
--    질문 3개 묶음(유료)의 남은 질문이 있으면 탈퇴를 막는 기존 동작은 바꾸지 않는다(별도 정책안 결정 대기 — 무상 혜택과 유료는 다르다).

alter table public.ai_usage add column if not exists purpose text check (purpose is null or purpose in ('report', 'chat', 'taste', 'compat', 'other'));
alter table public.ai_usage add column if not exists credit_source text check (credit_source is null or credit_source in ('free', 'reward', 'paid'));
alter table public.ai_usage add column if not exists room_key text check (room_key is null or char_length(room_key) <= 40);
alter table public.ai_usage add column if not exists request_key text check (request_key is null or char_length(request_key) <= 80);

create index if not exists ai_usage_request_idx on public.ai_usage (request_key) where request_key is not null;
create index if not exists ai_usage_purpose_idx on public.ai_usage (purpose, created_at desc);

create table public.benefit_expenses (
  id bigint generated always as identity primary key,
  month date not null check (month = date_trunc('month', month)::date),
  kind text not null check (kind in ('ad', 'fixed', 'other')),
  amount_krw integer not null check (amount_krw >= 0),
  memo text check (memo is null or char_length(memo) <= 120),
  entered_by uuid,
  created_at timestamptz not null default now()
);

create index benefit_expenses_month_idx on public.benefit_expenses (month desc, kind);

alter table public.benefit_expenses enable row level security;
revoke all on public.benefit_expenses from anon, authenticated;
grant select, insert, update, delete on public.benefit_expenses to service_role;
grant usage, select on sequence public.benefit_expenses_id_seq to service_role;

-- 탈퇴 회원의 혜택 장부 정리(법률 검토로 보관 일수를 정한 뒤 설정으로 켠다). 정해진 일수가 지난 탈퇴 회원의 포인트 · 질문권 장부를 지운다. 지운 줄 수를 돌려준다
create or replace function public.purge_withdrawn_benefit_ledgers()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := public.benefit_int('benefit.withdrawn_ledger_retention_days', 0);
  v_pl integer := 0;
  v_cl integer := 0;
  v_pr integer := 0;
  v_cr integer := 0;
  v_ops integer := 0;
  v_users uuid[];
begin
  if v_days <= 0 then return jsonb_build_object('status', 'off'); end if;
  select array_agg(id) into v_users from public.profiles where withdrawn_at is not null and withdrawn_at < now() - make_interval(days => v_days);
  if v_users is null then return jsonb_build_object('status', 'none'); end if;
  perform set_config('miyu.benefit_maintenance', 'on', true);
  delete from public.point_ledger where user_id = any (v_users);
  get diagnostics v_pl = row_count;
  delete from public.credit_ledger where user_id = any (v_users);
  get diagnostics v_cl = row_count;
  delete from public.point_lots where user_id = any (v_users);
  get diagnostics v_pr = row_count;
  delete from public.credit_lots where user_id = any (v_users);
  get diagnostics v_cr = row_count;
  delete from public.benefit_ops where user_id = any (v_users);
  get diagnostics v_ops = row_count;
  return jsonb_build_object('status', 'purged', 'pointLedger', v_pl, 'creditLedger', v_cl, 'pointLots', v_pr, 'creditLots', v_cr, 'ops', v_ops);
end;
$$;

-- 탈퇴 시 혜택 정리: 남은 포인트 · 질문권은 소멸 처리(장부에 남긴다), 추천 링크 · 방문 기록 · 위험 신호 세부는 지운다
create or replace function public.forfeit_member_benefits(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_pts integer := 0;
  v_cr integer := 0;
  v_links integer := 0;
  v_signups integer := 0;
begin
  perform public.benefit_lock(p_user);
  for r in select id, remaining from public.point_lots where user_id = p_user and remaining > 0 loop
    if public.benefit_claim_op('point-forfeit:' || r.id::text, p_user, 'point-forfeit') then
      update public.point_lots set remaining = 0 where id = r.id;
      insert into public.point_ledger (user_id, kind, amount, lot_id, op_key) values (p_user, 'forfeit', -r.remaining, r.id, 'point-forfeit:' || r.id::text);
      v_pts := v_pts + r.remaining;
    end if;
  end loop;
  for r in select id, remaining from public.credit_lots where user_id = p_user and remaining > 0 loop
    if public.benefit_claim_op('credit-forfeit:' || r.id::text, p_user, 'credit-forfeit') then
      update public.credit_lots set remaining = 0 where id = r.id;
      insert into public.credit_ledger (user_id, kind, qty, lot_id, op_key) values (p_user, 'forfeit', -r.remaining, r.id, 'credit-forfeit:' || r.id::text);
      v_cr := v_cr + r.remaining;
    end if;
  end loop;
  -- 쿠폰: 결제 대기 주문에 잡아 둔 자리는 놓는다(사용한 기록은 주문처럼 남는다)
  update public.coupon_redemptions set status = 'released' where user_id = p_user and status = 'reserved';
  -- 추천: 링크 · 방문 기록 · 위험 신호 세부(익명 방문 번호)는 지운다. 추천 가입 기록은 상태와 회원번호 · 시각만 남기고 방문 번호 · 위험 신호는 비운다
  delete from public.referral_links where user_id = p_user;
  get diagnostics v_links = row_count;
  update public.referral_signups set anon_id = null, risk = '[]'::jsonb where invitee_user_id = p_user or inviter_user_id = p_user;
  get diagnostics v_signups = row_count;
  return jsonb_build_object('forfeitedPoints', v_pts, 'forfeitedCredits', v_cr, 'referralLinks', v_links, 'referralSignupsScrubbed', v_signups);
end;
$$;

-- 탈퇴 함수 갱신: 21번까지의 탈퇴 함수(20261028000000_invites.sql)에 "혜택 정리" 한 단계와 결과의 benefits 항목만 더한 것이다
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
  v_concerns int := 0;
  v_feedback int := 0;
  v_regions int := 0;
  v_talks int := 0;
  v_questions int := 0;
  v_summaries int := 0;
  v_tastes int := 0;
  v_invites int := 0;
  v_benefits jsonb;
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
  -- 결제해 두고 쓰지 않은 질문(유료 장부)이 남아 있으면 처리하지 않는다 (정책 확정 전 임시 — 무상 혜택은 탈퇴를 막지 않는다)
  if exists (select 1 from public.cash_wallets where user_id = p_user_id and balance > 0) then
    raise exception 'withdraw_blocked_cash_balance';
  end if;

  delete from public.report_feedback where user_id = p_user_id;
  get diagnostics v_feedback = row_count;

  delete from public.personal_contexts where user_id = p_user_id;
  get diagnostics v_contexts = row_count;

  delete from public.concern_records where user_id = p_user_id;
  get diagnostics v_concerns = row_count;

  delete from public.talk_rooms where user_id = p_user_id;
  get diagnostics v_talks = row_count;
  delete from public.chat_questions where user_id = p_user_id;
  get diagnostics v_questions = row_count;

  delete from public.chat_summaries where user_id = p_user_id;
  get diagnostics v_summaries = row_count;

  delete from public.taste_reports where user_id = p_user_id;
  get diagnostics v_tastes = row_count;

  delete from public.invites where inviter_user_id = p_user_id;
  get diagnostics v_invites = row_count;

  -- 남은 무상 혜택(포인트 · 질문권)은 소멸 처리하고 추천 링크 · 방문 기록 · 위험 신호 세부를 지운다
  v_benefits := public.forfeit_member_benefits(p_user_id);

  delete from public.reports where user_id = p_user_id;
  get diagnostics v_reports = row_count;

  delete from public.user_regions where user_id = p_user_id;
  get diagnostics v_regions = row_count;

  delete from public.assessments a
   where a.user_id = p_user_id
     and not exists (select 1 from public.orders o where o.assessment_id = a.id);
  get diagnostics v_deleted_assessments = row_count;

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
    'concern_records', v_concerns,
    'feedback', v_feedback,
    'regions', v_regions,
    'talk_rooms', v_talks,
    'chat_questions', v_questions,
    'chat_summaries', v_summaries,
    'taste_reports', v_tastes,
    'invites', v_invites,
    'benefits', v_benefits
  );
end;
$$;

revoke all on function public.purge_withdrawn_benefit_ledgers() from public, anon, authenticated;
revoke all on function public.forfeit_member_benefits(uuid) from public, anon, authenticated;
revoke all on function public.withdraw_member_data(uuid) from public, anon, authenticated;
grant execute on function public.purge_withdrawn_benefit_ledgers() to service_role;
grant execute on function public.forfeit_member_benefits(uuid) to service_role;
grant execute on function public.withdraw_member_data(uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 23번: 20261102000000_compat_requests.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- 사주 궁합(유료) 요청 — 구매한 사람이 입력한 "상대 출생정보"를 리포트가 만들어지는 동안에만 따로 보관한다. 마이그레이션 23번.
-- 규칙: 더하기만 한다(기존 표 · 함수 · 마이그레이션은 바꾸지 않는다). 서버(service_role)만 읽고 쓴다 — 브라우저는 이 표를 볼 수 없다(RLS 켜고 정책을 만들지 않는다).
-- 주문(orders)은 상품 번호 `saju-compat:<요청 번호>`로 만들어지고, 같은 번호로 이 표의 한 줄이 생긴다. 리포트(reports)는 기존 표를 그대로 쓴다(content에 완성된 글만 담는다 — 상대 생년월일은 글에 없다).
-- 리포트가 완성되면 상대 출생정보를 지운다(scrub_compat_request). 탈퇴하면 지운다(프로필의 탈퇴 표시 트리거). 법정 보관이 필요한 것은 주문 · 결제 기록이고 상대 출생정보는 아니다 — 보관 근거 · 기간은 법률 검토 대상이다.

create table public.compat_requests (
  id uuid primary key,
  order_id uuid not null unique references public.orders (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  -- 상대 입력(이름 · 달력 · 생년월일 · 출생시간 · 성별(선택)) — 비워 두면 지운 것이다
  partner jsonb not null check (jsonb_typeof(partner) = 'object' and pg_column_size(partner) <= 1024),
  -- 지운 시각(리포트 완성 · 탈퇴). 지우기 전에는 null
  scrubbed_at timestamptz,
  created_at timestamptz not null default now(),
  check (scrubbed_at is null or partner = '{}'::jsonb)
);

create index compat_requests_user_idx on public.compat_requests (user_id, created_at desc);

alter table public.compat_requests enable row level security;
-- 정책 없음: anon · authenticated는 읽을 수 없고, service_role만 쓴다.
grant select, insert, update, delete on public.compat_requests to service_role;

-- 리포트가 완성되면 서버가 부른다 — 상대 출생정보를 비운다(이미 비웠으면 아무것도 하지 않는다)
create or replace function public.scrub_compat_request(p_order uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.compat_requests set partner = '{}'::jsonb, scrubbed_at = now() where order_id = p_order and scrubbed_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- 탈퇴하면 이 회원이 넣은 상대 출생정보를 모두 지운다 — 탈퇴 함수를 다시 바꾸지 않고 프로필의 탈퇴 표시에 반응한다
create or replace function public.compat_requests_on_withdraw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    update public.compat_requests set partner = '{}'::jsonb, scrubbed_at = coalesce(scrubbed_at, now()) where user_id = new.id and scrubbed_at is null;
  end if;
  return new;
end;
$$;

create trigger profiles_compat_withdraw after update of withdrawn_at on public.profiles
  for each row execute function public.compat_requests_on_withdraw();

revoke all on function public.scrub_compat_request(uuid) from public, anon, authenticated;
revoke all on function public.compat_requests_on_withdraw() from public, anon, authenticated;
grant execute on function public.scrub_compat_request(uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 24번: 20261103000000_pair_reports.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- 리포트 궁합(유료 2) — 두 사람이 각자 분석을 마치고 서로 궁합 생성에 동의한 쌍. 마이그레이션 24번.
-- 규칙: 더하기만 한다(기존 표 · 함수 · 마이그레이션은 바꾸지 않는다). 서버(service_role)만 읽고 쓴다 — 브라우저는 이 표를 볼 수 없다(RLS 켜고 정책을 만들지 않는다).
-- 이 표에는 이름 · 생년월일 · 응답이 없다. 회원번호 · 검사 결과 번호 · 동의 시각 · 동의한 문구의 버전 · 상태뿐이다.
-- 원본(각자의 검사 결과)은 assessments에 그대로 있고 이 표는 "누구와 누가 어느 결과로 연결됐는가"만 안다 — 완성된 궁합 글은 reports에 따로 저장된다(결제 상태와 생성 상태도 따로).
-- 구분(운영자 2026-10-17 D7):
--   · 연결 해제(unlink)  = 더 이상 이 쌍으로 새로 만들지 않는다. 이미 완성된 글의 열람은 그대로다.
--   · 동의 철회(withdraw) = 그 사람의 자료를 새 궁합 생성에 더 쓰지 않는다(철회 시각을 남기고 연결도 끊는다). 완성된 글은 지우지 않는다.
--   · 탈퇴 = 아래 트리거가 그 사람의 쌍을 끊고 철회로 기록한다(결과 글의 처리는 서비스 규칙, docs/report-compat-v1.md).
-- 결제는 쌍마다 한 번이다: 상품 번호 `report-compat:<쌍 번호>`의 결제 완료 주문은 하나만 생긴다(아래 고유 조건).

create table public.pairs (
  id uuid primary key,
  -- 초대 링크의 무작위 토큰(이름 · 생년월일 · 회원번호 없음)
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24,64}$'),
  a_user_id uuid not null references auth.users (id) on delete restrict,
  -- 검사 결과 번호는 외래 키로 묶지 않는다: 회원 탈퇴가 주문이 없는 검사 결과를 지우는데(withdraw_member_data) 그때 이 표가 탈퇴를 막으면 안 된다.
  -- 지워진 검사 결과는 서비스가 "쓸 수 없는 결과"로 읽는다(새 생성을 막고, 이미 완성된 글의 열람은 결제한 사람의 주문 · 리포트로 이어진다).
  a_assessment_id uuid not null,
  a_consent_at timestamptz not null,
  a_consent_version text not null check (char_length(a_consent_version) between 1 and 40),
  a_withdrawn_at timestamptz,
  b_user_id uuid references auth.users (id) on delete restrict,
  b_assessment_id uuid,
  b_consent_at timestamptz,
  b_consent_version text check (b_consent_version is null or char_length(b_consent_version) between 1 and 40),
  b_withdrawn_at timestamptz,
  -- invited: 상대가 아직 들어오지 않음 · linked: 두 사람이 모두 동의해 연결됨 · unlinked: 끊김(해제 · 철회 · 탈퇴)
  status text not null default 'invited' check (status in ('invited', 'linked', 'unlinked')),
  unlinked_at timestamptz,
  unlinked_by uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((b_user_id is null) = (b_assessment_id is null)),
  check (b_user_id is null or b_user_id <> a_user_id),
  check (b_user_id is null or (b_consent_at is not null and b_consent_version is not null)),
  check (status <> 'linked' or b_user_id is not null),
  check ((status = 'unlinked') = (unlinked_at is not null))
);

create index pairs_a_user_idx on public.pairs (a_user_id, created_at desc);
create index pairs_b_user_idx on public.pairs (b_user_id, created_at desc) where b_user_id is not null;

alter table public.pairs enable row level security;
-- 정책 없음: anon · authenticated는 읽을 수 없고, service_role만 쓴다.
grant select, insert, update, delete on public.pairs to service_role;

-- 쌍마다 결제 완료 주문은 하나 — 한 사람이 결제하면 상대는 다시 결제할 수 없다(동시에 둘이 결제를 마쳐도 두 번째는 이 조건이 막고, 서버가 중복 결제로 운영자에게 알린다)
create unique index orders_one_paid_pair on public.orders (product_id) where status = 'paid' and product_id like 'report-compat:%';

-- 상대가 초대 링크로 들어와 동의하고 연결한다 — 한 번에 하나만 성공한다(행을 잠그고 확인한다)
create or replace function public.pair_join(p_token text, p_user uuid, p_assessment uuid, p_consent_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.pairs%rowtype;
  v_owner uuid;
  v_withdrawn timestamptz;
begin
  select * into v from public.pairs where token = p_token for update;
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if v.status = 'unlinked' then
    return jsonb_build_object('status', 'closed');
  end if;
  if v.b_user_id is not null then
    -- 이미 이 사람이 들어와 있으면 같은 결과(다시 눌러도 한 번만)
    if v.b_user_id = p_user then
      return jsonb_build_object('status', 'joined', 'pair', v.id);
    end if;
    return jsonb_build_object('status', 'taken');
  end if;
  if v.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if v.a_user_id = p_user then
    return jsonb_build_object('status', 'self');
  end if;
  if v.a_withdrawn_at is not null then
    return jsonb_build_object('status', 'closed');
  end if;
  select user_id, withdrawn_at into v_owner, v_withdrawn from public.assessments where id = p_assessment;
  if v_owner is null or v_owner <> p_user or v_withdrawn is not null then
    return jsonb_build_object('status', 'bad-assessment');
  end if;
  update public.pairs
     set b_user_id = p_user, b_assessment_id = p_assessment, b_consent_at = now(), b_consent_version = p_consent_version, status = 'linked'
   where id = v.id;
  return jsonb_build_object('status', 'joined', 'pair', v.id);
end;
$$;

-- 동의 철회: 철회 시각을 남기고 연결을 끊는다(이미 철회했으면 같은 결과)
create or replace function public.pair_withdraw_consent(p_pair uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.pairs%rowtype;
begin
  select * into v from public.pairs where id = p_pair for update;
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if p_user is distinct from v.a_user_id and p_user is distinct from v.b_user_id then
    return jsonb_build_object('status', 'not-member');
  end if;
  update public.pairs
     set a_withdrawn_at = case when a_user_id = p_user then coalesce(a_withdrawn_at, now()) else a_withdrawn_at end,
         b_withdrawn_at = case when b_user_id = p_user then coalesce(b_withdrawn_at, now()) else b_withdrawn_at end,
         status = 'unlinked',
         unlinked_at = coalesce(unlinked_at, now()),
         unlinked_by = coalesce(unlinked_by, p_user)
   where id = v.id;
  return jsonb_build_object('status', 'withdrawn');
end;
$$;

-- 연결 해제: 더 이상 이 쌍으로 새로 만들지 않는다(동의 철회는 아니다 — 철회 시각은 남기지 않는다)
create or replace function public.pair_unlink(p_pair uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.pairs%rowtype;
begin
  select * into v from public.pairs where id = p_pair for update;
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if p_user is distinct from v.a_user_id and p_user is distinct from v.b_user_id then
    return jsonb_build_object('status', 'not-member');
  end if;
  update public.pairs
     set status = 'unlinked', unlinked_at = coalesce(unlinked_at, now()), unlinked_by = coalesce(unlinked_by, p_user)
   where id = v.id;
  return jsonb_build_object('status', 'unlinked');
end;
$$;

-- 탈퇴하면 이 회원의 쌍을 끊고 철회로 기록한다. 상대가 들어오지 않은 초대는 지운다 — 탈퇴 함수를 다시 바꾸지 않고 프로필의 탈퇴 표시에 반응한다
create or replace function public.pairs_on_withdraw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    delete from public.pairs where a_user_id = new.id and b_user_id is null;
    update public.pairs
       set a_withdrawn_at = case when a_user_id = new.id then coalesce(a_withdrawn_at, now()) else a_withdrawn_at end,
           b_withdrawn_at = case when b_user_id = new.id then coalesce(b_withdrawn_at, now()) else b_withdrawn_at end,
           status = 'unlinked',
           unlinked_at = coalesce(unlinked_at, now()),
           unlinked_by = coalesce(unlinked_by, new.id)
     where (a_user_id = new.id or b_user_id = new.id) and status <> 'unlinked';
    update public.pairs
       set a_withdrawn_at = case when a_user_id = new.id then coalesce(a_withdrawn_at, now()) else a_withdrawn_at end,
           b_withdrawn_at = case when b_user_id = new.id then coalesce(b_withdrawn_at, now()) else b_withdrawn_at end
     where (a_user_id = new.id or b_user_id = new.id) and status = 'unlinked';
  end if;
  return new;
end;
$$;

create trigger profiles_pairs_withdraw after update of withdrawn_at on public.profiles
  for each row execute function public.pairs_on_withdraw();

revoke all on function public.pair_join(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.pair_withdraw_consent(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pair_unlink(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pairs_on_withdraw() from public, anon, authenticated;
grant execute on function public.pair_join(text, uuid, uuid, text) to service_role;
grant execute on function public.pair_withdraw_consent(uuid, uuid) to service_role;
grant execute on function public.pair_unlink(uuid, uuid) to service_role;

-- ═════════════════════════════════════════════════════════════════
-- 25번: 20261104000000_reviews.sql   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
-- ME:U(미유) 25번째 마이그레이션 — 이용 후기(리뷰): 후기 표 · 운영자 조치 이력 · 신고 · 운영자 조치 함수 · 방문 단계 이름 확장 · 탈퇴하면 지우기.
-- 앞의 파일들(1~24번)을 실행한 뒤 SQL Editor에서 이 파일을 한 번 실행한다. 이미 적용했는지는 supabase/check-migrations.sql로 확인한다.
--
-- ⚠️ 이 파일은 개발 · 테스트 환경에서만 적용해 확인했다. 운영 DB에는 아직 적용하지 않았고, 운영자가 별도로 승인한 뒤에 적용한다.
--
-- 규칙: 더하기만 한다(기존 표 · 함수 · 데이터는 바뀌지 않는다 — 단 funnel_events의 이름 검사만 허용 이름 둘을 더한 목록으로 바꾼다). 이 파일을 적용하는 것만으로는
-- 아무것도 새로 보이거나 지급되지 않는다 — 후기가 없으면 메인에 아무것도 그리지 않고, 질문권 보상은 혜택 설정 feature.review_reward가 꺼져 있는 동안 지급하지 않는다.
--
-- 보상(질문권) 지급은 이 파일의 함수가 아니라 19번의 grant_credit을 서버가 멱등 키 'review:<후기 번호>'로 한 번만 불러서 한다.
-- 후기 한 건 = (회원, 종류, 이용 건) 하나(고유 조건). 삭제는 행을 남기고 글만 지우는 "묘비"라서, 지운 뒤 다시 써도 같은 이용 건에는 보상이 한 번뿐이다.
-- 후기 글은 어떤 운영 기록 · 알림에도 넣지 않는다. 운영자 조치 이력(review_admin_log)에는 누가 · 언제 · 무엇을 · 사유 분류만 있고 글은 복사하지 않는다.
-- 대가(질문권 보상 · 무료 체험) 표시의 정확한 법정 문구와 후기 보관 기간 · 약관 문구는 법률 검토 대상이며 이 파일에서 정하지 않는다.

-- ─────────────────────────────────────────────
-- 1. 후기
-- ─────────────────────────────────────────────

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 개인 심층 리포트 · 사주 궁합 · 리포트 궁합 · 미유 채팅
  kind text not null check (kind in ('personal', 'saju_compat', 'pair_compat', 'chat')),
  -- 구매 건이면 주문 번호(orders.id), 채팅이면 검사 결과 번호(assessments.id). 서버가 본인 이용 건인지 확인한 뒤에만 넣는다(여러 표를 가리켜서 외래 키는 두지 않는다)
  subject_ref uuid not null,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 600),
  -- 공개에 동의했는가. 공개 후기 = status published + public_consent 둘 다
  public_consent boolean not null default false,
  -- published 공개 · private 나만 보기 · hidden 운영자가 숨김 · deleted 삭제(묘비)
  status text not null default 'private' check (status in ('published', 'private', 'hidden', 'deleted')),
  -- 쓸 때의 대가 표시 — reward 질문권 보상 대상 · free_trial 보상 없이 무료로 제공받은 이용 · none. free_trial은 무료로 제공받은 이용이면 보상 여부와 관계없이 true
  disclosure text not null default 'none' check (disclosure in ('reward', 'free_trial', 'none')),
  free_trial boolean not null default false,
  -- 보상: off 꺼져 있음/0개 · ineligible 보상 대상이 아닌 무료 체험 · pending 지급을 시작함 · granted 지급 확정 · failed 지급 실패(다시 시도 가능)
  reward_state text not null default 'off' check (reward_state in ('off', 'ineligible', 'pending', 'granted', 'failed')),
  reward_credits integer not null default 0 check (reward_credits between 0 and 10),
  reward_op_key text,
  rewarded_at timestamptz,
  -- 공개에 동의한 시각(동의하지 않으면 null)과 마지막으로 저장할 때 보인 공개 전 안내의 판
  consented_at timestamptz,
  consent_notice_version text check (consent_notice_version is null or char_length(consent_notice_version) <= 20),
  -- 운영자가 고른(메인 우선 노출) 후기
  featured boolean not null default false,
  featured_at timestamptz,
  -- 운영자가 숨기거나 지운 사유 분류(글 내용이 아니다)
  hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 40),
  hidden_at timestamptz,
  deleted_by text check (deleted_by is null or deleted_by in ('user', 'admin')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 같은 이용 건에 후기는 하나(중복 작성 · 보상 중복 지급 방지의 바탕)
  unique (user_id, kind, subject_ref),
  -- 공개 중이면 공개 동의가 있다
  check (status <> 'published' or public_consent),
  check (not public_consent or consented_at is not null),
  -- 삭제(묘비)는 글이 비어 있고 공개 동의 · 선정이 없다
  check (status <> 'deleted' or (body = '' and not public_consent and not featured and deleted_by is not null)),
  -- 보상 기록의 앞뒤가 맞아야 한다
  check (reward_state = 'granted' or reward_credits = 0),
  check (reward_state <> 'granted' or (reward_credits >= 1 and rewarded_at is not null)),
  check (reward_state in ('off', 'ineligible') or reward_op_key is not null)
);

create index reviews_user_idx on public.reviews (user_id, created_at desc);
create index reviews_status_idx on public.reviews (status, created_at desc);
create index reviews_public_idx on public.reviews (created_at desc) where status = 'published' and public_consent;
create index reviews_featured_idx on public.reviews (featured_at desc) where featured and status = 'published' and public_consent;
create index reviews_reward_retry_idx on public.reviews (created_at) where reward_state in ('pending', 'failed');

create or replace function public.reviews_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger reviews_touch_updated before update on public.reviews
  for each row execute function public.reviews_touch();

alter table public.reviews enable row level security;
-- 본인 후기만 조회한다. 공개 후기는 서버가 공개 조건(published + 동의)으로 걸러 읽고 작성자를 알 수 있는 값은 내보내지 않는다
create policy "본인 후기 조회" on public.reviews for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to authenticated;
grant select, insert, update, delete on public.reviews to service_role;

-- ─────────────────────────────────────────────
-- 2. 운영자 조치 이력 — 숨김 · 숨김 해제 · 삭제 · 메인 선정 · 선정 해제 · 신고 기각. 글은 복사하지 않는다
-- ─────────────────────────────────────────────

create table public.review_admin_log (
  id bigint generated always as identity primary key,
  review_id uuid not null references public.reviews (id) on delete cascade,
  admin_id uuid not null,
  action text not null check (action in ('hide', 'unhide', 'delete', 'feature', 'unfeature', 'dismiss_reports')),
  reason_code text not null,
  memo text check (memo is null or char_length(memo) <= 120),
  created_at timestamptz not null default now(),
  -- 사유 분류는 조치에 맞는 것만 — "부정적인 내용"이라는 분류는 없다. 기타는 메모가 꼭 있어야 한다
  check (
    (action in ('hide', 'delete') and reason_code in ('privacy', 'abuse', 'fake_or_ad', 'report', 'other'))
    or (action = 'unhide' and reason_code in ('wrongly_hidden', 'resolved', 'other'))
    or (action = 'feature' and reason_code in ('specific', 'helpful', 'balance', 'other'))
    or (action = 'unfeature' and reason_code in ('replaced', 'criteria', 'other'))
    or (action = 'dismiss_reports' and reason_code in ('no_violation', 'other'))
  ),
  check (reason_code <> 'other' or (memo is not null and char_length(btrim(memo)) >= 2))
);

create index review_admin_log_review_idx on public.review_admin_log (review_id, id desc);
create index review_admin_log_recent_idx on public.review_admin_log (id desc);

alter table public.review_admin_log enable row level security;
-- 정책 없음: 서버(service_role)만 읽고 쌓는다
revoke all on public.review_admin_log from anon, authenticated;
grant select, insert on public.review_admin_log to service_role;
grant usage, select on sequence public.review_admin_log_id_seq to service_role;

-- ─────────────────────────────────────────────
-- 3. 신고 — 공개 후기에 대해서만. 같은 방문자(익명 번호)는 같은 후기를 한 번만 신고한다. 신고자의 이름 · 연락처는 받지 않는다
-- ─────────────────────────────────────────────

create table public.review_reports (
  id bigint generated always as identity primary key,
  review_id uuid not null references public.reviews (id) on delete cascade,
  reporter_key text not null check (char_length(reporter_key) between 8 and 64),
  reason text not null check (reason in ('privacy', 'abuse', 'fake_or_ad', 'other')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_action text check (handled_action is null or handled_action in ('hide', 'delete', 'dismiss_reports')),
  unique (review_id, reporter_key)
);

create index review_reports_open_idx on public.review_reports (review_id) where handled_at is null;

alter table public.review_reports enable row level security;
revoke all on public.review_reports from anon, authenticated;
grant select, insert, update on public.review_reports to service_role;
grant usage, select on sequence public.review_reports_id_seq to service_role;

-- 신고 접수. 공개 중인 후기에만 받는다. 결과: reported · duplicate(같은 방문자가 이미 신고함) · not-public
create or replace function public.submit_review_report(p_review uuid, p_reporter text, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reviews%rowtype;
  n integer;
begin
  select * into r from public.reviews where id = p_review;
  if not found or r.status <> 'published' or not r.public_consent then return 'not-public'; end if;
  insert into public.review_reports (review_id, reporter_key, reason) values (p_review, p_reporter, p_reason)
    on conflict (review_id, reporter_key) do nothing;
  get diagnostics n = row_count;
  return case when n = 1 then 'reported' else 'duplicate' end;
end;
$$;

-- ─────────────────────────────────────────────
-- 4. 운영자 조치 — 상태 변경과 이력 기록을 한 번에(이력만 남거나 조치만 남지 않는다)
-- ─────────────────────────────────────────────

-- p_action: hide · unhide · delete · feature · unfeature · dismiss_reports. 사유 분류가 조치에 맞지 않으면 이력 검사에 걸려 전체가 취소된다(23514).
-- 결과: { ok: true } 또는 { ok: false, reason: 'not-found' | 'invalid-state' }
--  - hide: 공개 중 · 나만 보기 → hidden (숨김 중에는 회원이 고쳐도 다시 공개되지 않는다)
--  - unhide: hidden → 공개 동의가 있으면 published, 없으면 private
--  - delete: 글을 지우고 묘비로(deleted_by admin — 회원이 다시 쓸 수 없다)
--  - feature · unfeature: 메인 우선 노출 지정 · 해제(공개 중인 후기만 지정할 수 있다)
--  - dismiss_reports: 후기는 그대로 두고 열린 신고만 닫는다
-- 숨김 · 삭제 · 신고 기각은 그 후기의 열린 신고를 처리됨으로 닫는다. 이 함수는 운영 기록(ops_events)을 남기지 않는다 — 서버가 후기 번호만 남긴다.
create or replace function public.review_admin_apply(p_review uuid, p_action text, p_reason text, p_memo text, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reviews%rowtype;
  v_memo text := nullif(btrim(coalesce(p_memo, '')), '');
begin
  select * into r from public.reviews where id = p_review for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not-found'); end if;

  if p_action = 'hide' then
    if r.status not in ('published', 'private') then return jsonb_build_object('ok', false, 'reason', 'invalid-state'); end if;
    update public.reviews set status = 'hidden', hidden_reason = p_reason, hidden_at = now() where id = r.id;
  elsif p_action = 'unhide' then
    if r.status <> 'hidden' then return jsonb_build_object('ok', false, 'reason', 'invalid-state'); end if;
    update public.reviews set status = case when public_consent then 'published' else 'private' end, hidden_reason = null, hidden_at = null where id = r.id;
  elsif p_action = 'delete' then
    if r.status = 'deleted' then return jsonb_build_object('ok', false, 'reason', 'invalid-state'); end if;
    update public.reviews
       set status = 'deleted', body = '', public_consent = false, consented_at = null, featured = false, featured_at = null,
           deleted_by = 'admin', deleted_at = now(), hidden_reason = p_reason, hidden_at = coalesce(hidden_at, now())
     where id = r.id;
  elsif p_action = 'feature' then
    if r.status <> 'published' or not r.public_consent or r.featured then return jsonb_build_object('ok', false, 'reason', 'invalid-state'); end if;
    update public.reviews set featured = true, featured_at = now() where id = r.id;
  elsif p_action = 'unfeature' then
    if not r.featured then return jsonb_build_object('ok', false, 'reason', 'invalid-state'); end if;
    update public.reviews set featured = false, featured_at = null where id = r.id;
  elsif p_action = 'dismiss_reports' then
    if not exists (select 1 from public.review_reports where review_id = r.id and handled_at is null) then
      return jsonb_build_object('ok', false, 'reason', 'invalid-state');
    end if;
  else
    return jsonb_build_object('ok', false, 'reason', 'invalid-state');
  end if;

  insert into public.review_admin_log (review_id, admin_id, action, reason_code, memo) values (r.id, p_admin, p_action, p_reason, v_memo);
  if p_action in ('hide', 'delete', 'dismiss_reports') then
    update public.review_reports set handled_at = now(), handled_action = p_action where review_id = r.id and handled_at is null;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_review_report(uuid, text, text) from public, anon, authenticated;
revoke all on function public.review_admin_apply(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_review_report(uuid, text, text) to service_role;
grant execute on function public.review_admin_apply(uuid, text, text, text, uuid) to service_role;

-- ─────────────────────────────────────────────
-- 5. 탈퇴하면 이 회원의 후기를 지운다(묘비 · 이력 · 신고 포함) — 탈퇴 함수를 다시 바꾸지 않고 프로필의 탈퇴 표시에 반응한다
-- ─────────────────────────────────────────────

create or replace function public.reviews_on_withdraw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.withdrawn_at is not null and old.withdrawn_at is null then
    delete from public.reviews where user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_reviews_withdraw after update of withdrawn_at on public.profiles
  for each row execute function public.reviews_on_withdraw();

revoke all on function public.reviews_on_withdraw() from public, anon, authenticated;

-- ─────────────────────────────────────────────
-- 6. 방문 단계 이름 확장 — 메인 후기 영역이 화면에 보임(review_section_view) · 전체 후기 클릭(review_all_click)
-- ─────────────────────────────────────────────
-- 허용하는 단계 이름을 하나씩 나열한 검사를 유지한다(결제 이벤트 같은 이름은 받지 않는다). 8번의 다섯 이름 + 새 이름 둘. 서버 코드(FUNNEL_EVENT_NAMES)와 같은 목록이다.
alter table public.funnel_events drop constraint if exists funnel_events_name_check;
alter table public.funnel_events add constraint funnel_events_name_check
  check (name in ('visit', 'analyze_start', 'analyze_complete', 'preview_view', 'report_view', 'review_section_view', 'review_all_click'));

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
    to_regclass('public.report_feedback')     is not null as report_feedback,
    to_regclass('public.concern_records')     is not null as concern_records,
    to_regclass('public.talk_rooms')          is not null as talk_rooms,
    to_regclass('public.chat_questions')      is not null as chat_questions,
    to_regclass('public.cash_wallets')        is not null as cash_wallets,
    to_regclass('public.cash_ledger')         is not null as cash_ledger,
    to_regclass('public.chat_summaries')      is not null as chat_summaries
),
wd as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'    and column_name = 'withdrawn_at') as profile_col,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'withdrawn_at') as assessment_col,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'withdraw_member_data') as fn
),
-- 11번: 탈퇴 함수가 고민 기록 삭제를 포함하도록 갱신됐는가
wd11 as (
  select coalesce((select bool_or(pg_get_functiondef(p.oid) like '%concern_records%')
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as fn_updated
),
-- 12번: 탈퇴 함수가 대화 삭제를 포함하도록 갱신됐는가
wd12 as (
  select coalesce((select bool_or(pg_get_functiondef(p.oid) like '%talk_rooms%')
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as fn_updated
),
-- 14번: 방 요약 위치 열 · 탈퇴 함수가 채팅 요약 삭제를 포함하도록 갱신됐는가
wd14 as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'talk_rooms' and column_name = 'saved_upto') as saved_col,
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%chat_summaries%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as fn_updated
),
-- 13번: 캐시 함수 · 충전 트리거 · 탈퇴 함수가 캐시 잔액 확인을 포함하도록 갱신됐는가
wd13 as (
  select
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%cash_wallets%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as fn_updated,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'spend_cash') as spend_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'restore_cash_spend') as restore_fn,
    exists (select 1 from pg_trigger g where g.tgname = 'orders_cash_change' and not g.tgisinternal) as trigger_ok
),
-- 15번: 운영자 수동 질문 반영 함수
wd15 as (
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_credit_question') as fn
),
-- 16번: 질문 묶음 장부 · 부분 환불 반영 함수 · 무료 질문 예약 함수와 열
wd16 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'question_packs') as packs,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'apply_cash_refund') as refund_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_chat_question') as reserve_fn,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chat_questions' and column_name = 'reserved_until') as reserved_col,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cash_ledger' and column_name = 'pack_order_id') as pack_col
),
-- 17번: 맛보기 리포트 표(한 계정당 1번) · 예약 · 저장 · 풀기 함수
wd17 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'taste_reports') as tbl,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_taste_report') as reserve_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'save_taste_report') as save_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'release_taste_report') as release_fn,
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%taste_reports%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as withdraw_fn
),
-- 18번: 초대 링크 · 초대 할인 표와 함수, 탈퇴 함수의 초대 링크 삭제
wd18 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'invites') as invites,
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'invite_discounts') as discounts,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'invite_discount_status') as status_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'claim_invite_discount') as claim_fn,
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%public.invites%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as withdraw_fn
),
-- 19~22번: 혜택 시스템(포인트 · 질문권 · 쿠폰 · 0원 혜택 주문 · 추천 · 비용 · 탈퇴 정리)
wd19 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'benefit_settings') as settings,
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'point_lots') as lots,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'grant_points') as grant_fn
),
wd20 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'coupons') as coupons,
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'benefit_order_grants') as grants,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'grant_benefit_order') as grant_fn
),
wd21 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'referral_signups') as signups,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'register_referral_signup') as register_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'claim_referral_discount') as claim_fn
),
wd22 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'benefit_expenses') as expenses,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_usage' and column_name = 'request_key') as request_key,
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%forfeit_member_benefits%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as withdraw_fn
),
wd23 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'compat_requests') as requests,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'scrub_compat_request') as scrub_fn,
    exists (select 1 from pg_trigger where tgname = 'profiles_compat_withdraw' and not tgisinternal) as withdraw_trigger,
    coalesce((select has_table_privilege('service_role', 'public.compat_requests', 'insert') from information_schema.tables where table_schema = 'public' and table_name = 'compat_requests'), false) as service_grant
),
wd24 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'pairs') as pairs,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'pair_join') as join_fn,
    exists (select 1 from pg_trigger where tgname = 'profiles_pairs_withdraw' and not tgisinternal) as withdraw_trigger,
    exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'orders_one_paid_pair') as one_paid,
    coalesce((select has_table_privilege('service_role', 'public.pairs', 'insert') from information_schema.tables where table_schema = 'public' and table_name = 'pairs'), false) as service_grant
),
wd25 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'reviews') as reviews,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'review_admin_apply') as admin_fn,
    exists (select 1 from pg_trigger where tgname = 'profiles_reviews_withdraw' and not tgisinternal) as withdraw_trigger,
    exists (select 1 from pg_constraint where conname = 'funnel_events_name_check' and pg_get_constraintdef(oid) like '%review_section_view%') as funnel_names,
    coalesce((select has_table_privilege('service_role', 'public.reviews', 'insert') from information_schema.tables where table_schema = 'public' and table_name = 'reviews'), false) as service_grant
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
  union all
  select 11, '20261021000000_concern_records.sql',
         case when t.concern_records and wd11.fn_updated then '적용됨'
              when t.concern_records or wd11.fn_updated then '일부만' else '아직 안 함' end,
         '표 concern_records / 탈퇴 함수에 고민 기록 삭제 포함: ' || wd11.fn_updated::text
  from t, wd11
  union all
  select 12, '20261022000000_talk_rooms.sql',
         case when t.talk_rooms and t.chat_questions and wd12.fn_updated then '적용됨'
              when t.talk_rooms or t.chat_questions or wd12.fn_updated then '일부만' else '아직 안 함' end,
         '표 talk_rooms, chat_questions / 탈퇴 함수에 대화 삭제 포함: ' || wd12.fn_updated::text
  from t, wd12
  union all
  select 13, '20261023000000_miyu_cash.sql',
         case when t.cash_wallets and t.cash_ledger and wd13.spend_fn and wd13.restore_fn and wd13.trigger_ok and wd13.fn_updated then '적용됨'
              when t.cash_wallets or t.cash_ledger or wd13.spend_fn or wd13.restore_fn or wd13.trigger_ok or wd13.fn_updated then '일부만' else '아직 안 함' end,
         '표 cash_wallets, cash_ledger / 함수 spend_cash, restore_cash_spend / 주문 결제 완료 때 충전하는 트리거 / 탈퇴 함수에 캐시 잔액 확인 포함: ' || wd13.fn_updated::text
  from t, wd13
  union all
  select 14, '20261024000000_chat_summaries.sql',
         case when t.chat_summaries and wd14.saved_col and wd14.fn_updated then '적용됨'
              when t.chat_summaries or wd14.saved_col or wd14.fn_updated then '일부만' else '아직 안 함' end,
         '표 chat_summaries / 열 talk_rooms.saved_upto: ' || wd14.saved_col::text || ' / 탈퇴 함수에 채팅 요약 삭제 포함: ' || wd14.fn_updated::text
  from t, wd14
  union all
  select 15, '20261025000000_admin_credit_question.sql',
         case when wd15.fn then '적용됨' else '아직 안 함' end,
         '함수 admin_credit_question (결제사 확인 뒤 운영자가 주문에 적힌 만큼 질문을 넣는 함수)'
  from wd15
  union all
  select 16, '20261026000000_question_packs.sql',
         case when wd16.packs and wd16.refund_fn and wd16.reserve_fn and wd16.reserved_col and wd16.pack_col then '적용됨'
              when wd16.packs or wd16.refund_fn or wd16.reserve_fn or wd16.reserved_col or wd16.pack_col then '일부만' else '아직 안 함' end,
         '표 question_packs (묶음별 사용 · 환불 장부) / 함수 apply_cash_refund (부분 환불 반영) · reserve_chat_question (무료 질문 한도를 DB에서 보장) / 열 chat_questions.reserved_until: ' || wd16.reserved_col::text
  from wd16
  union all
  select 17, '20261027000000_taste_reports.sql',
         case when wd17.tbl and wd17.reserve_fn and wd17.save_fn and wd17.release_fn and wd17.withdraw_fn then '적용됨'
              when wd17.tbl or wd17.reserve_fn or wd17.save_fn or wd17.release_fn or wd17.withdraw_fn then '일부만' else '아직 안 함' end,
         '표 taste_reports (맛보기 리포트 · 회원 한 명당 한 줄) / 함수 reserve_taste_report · save_taste_report · release_taste_report / 탈퇴 함수에 맛보기 리포트 삭제 포함: ' || wd17.withdraw_fn::text
  from wd17
  union all
  select 18, '20261028000000_invites.sql',
         case when wd18.invites and wd18.discounts and wd18.status_fn and wd18.claim_fn and wd18.withdraw_fn then '적용됨'
              when wd18.invites or wd18.discounts or wd18.status_fn or wd18.claim_fn or wd18.withdraw_fn then '일부만' else '아직 안 함' end,
         '표 invites (초대 링크) · invite_discounts (초대 할인 기록) / 함수 invite_discount_status · claim_invite_discount / 탈퇴 함수에 초대 링크 삭제 포함: ' || wd18.withdraw_fn::text
  from wd18
  union all
  select 19, '20261029000000_benefits_core.sql',
         case when wd19.settings and wd19.lots and wd19.grant_fn then '적용됨'
              when wd19.settings or wd19.lots or wd19.grant_fn then '일부만' else '아직 안 함' end,
         '표 benefit_settings (혜택 설정 · 모두 꺼진 채로 시작) · point_lots (포인트 묶음) / 함수 grant_points · 질문권 장부 함수'
  from wd19
  union all
  select 20, '20261030000000_coupons_free_orders.sql',
         case when wd20.coupons and wd20.grants and wd20.grant_fn then '적용됨'
              when wd20.coupons or wd20.grants or wd20.grant_fn then '일부만' else '아직 안 함' end,
         '표 coupons · benefit_order_grants / 함수 grant_benefit_order (0원 혜택 주문, 서버가 승인한 혜택만)'
  from wd20
  union all
  select 21, '20261031000000_referrals.sql',
         case when wd21.signups and wd21.register_fn and wd21.claim_fn then '적용됨'
              when wd21.signups or wd21.register_fn or wd21.claim_fn then '일부만' else '아직 안 함' end,
         '표 referral_signups (추천 가입) / 함수 register_referral_signup · claim_referral_discount'
  from wd21
  union all
  select 22, '20261101000000_benefit_finance_ai.sql',
         case when wd22.expenses and wd22.request_key and wd22.withdraw_fn then '적용됨'
              when wd22.expenses or wd22.request_key or wd22.withdraw_fn then '일부만' else '아직 안 함' end,
         '표 benefit_expenses (비용 입력) / 열 ai_usage.request_key (질문 한 번의 AI 원가) / 탈퇴 함수에 혜택 정리 포함: ' || wd22.withdraw_fn::text
  from wd22
  union all
  select 23, '20261102000000_compat_requests.sql',
         case when wd23.requests and wd23.scrub_fn and wd23.withdraw_trigger and wd23.service_grant then '적용됨'
              when wd23.requests or wd23.scrub_fn or wd23.withdraw_trigger or wd23.service_grant then '일부만' else '아직 안 함' end,
         '표 compat_requests (사주 궁합 상대 입력 · 리포트 완성 · 환불 · 탈퇴 때 지움) / 함수 scrub_compat_request / 탈퇴 시 지우는 트리거: ' || wd23.withdraw_trigger::text || ' / 서버 권한: ' || wd23.service_grant::text
  from wd23
  union all
  select 24, '20261103000000_pair_reports.sql',
         case when wd24.pairs and wd24.join_fn and wd24.withdraw_trigger and wd24.one_paid and wd24.service_grant then '적용됨'
              when wd24.pairs or wd24.join_fn or wd24.withdraw_trigger or wd24.one_paid or wd24.service_grant then '일부만' else '아직 안 함' end,
         '표 pairs (리포트 궁합 쌍 · 동의 · 해제 · 철회) / 함수 pair_join · pair_withdraw_consent · pair_unlink / 탈퇴 시 쌍을 끊는 트리거: ' || wd24.withdraw_trigger::text || ' / 쌍마다 결제 완료 주문 하나(고유 조건): ' || wd24.one_paid::text || ' / 서버 권한: ' || wd24.service_grant::text
  from wd24
  union all
  select 25, '20261104000000_reviews.sql',
         case when wd25.reviews and wd25.admin_fn and wd25.withdraw_trigger and wd25.funnel_names and wd25.service_grant then '적용됨'
              when wd25.reviews or wd25.admin_fn or wd25.withdraw_trigger or wd25.funnel_names or wd25.service_grant then '일부만' else '아직 안 함' end,
         '표 reviews (이용 후기 · 보상 한 번 · 삭제는 묘비) · review_admin_log · review_reports / 함수 review_admin_apply · submit_review_report / 탈퇴 시 후기를 지우는 트리거: ' || wd25.withdraw_trigger::text || ' / 방문 단계 이름에 후기 이벤트 포함: ' || wd25.funnel_names::text || ' / 서버 권한: ' || wd25.service_grant::text
  from wd25
) r
order by "번호";
