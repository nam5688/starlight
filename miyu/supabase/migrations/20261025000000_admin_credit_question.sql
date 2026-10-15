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
