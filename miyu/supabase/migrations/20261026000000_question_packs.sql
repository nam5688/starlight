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
