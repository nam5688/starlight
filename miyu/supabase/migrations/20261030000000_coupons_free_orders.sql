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
