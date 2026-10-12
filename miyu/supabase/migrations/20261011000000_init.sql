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
