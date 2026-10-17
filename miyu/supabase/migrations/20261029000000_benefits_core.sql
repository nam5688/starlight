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
