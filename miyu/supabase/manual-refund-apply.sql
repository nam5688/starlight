-- ME:U(미유) 질문 묶음 "계좌 송금 환불" 반영 — 결제사(토스)에서 취소할 수 없어 고객에게 계좌로 직접 송금한 환불을 장부에 반영하고 기록한다.
--
-- ※ 이 파일은 데이터를 바꾼다. 반드시 순서대로: ① manual-refund-check.sql로 송금할 금액 확인 → ② 은행에서 고객에게 송금 → ③ 이 파일 실행 → ④ manual-refund-check.sql을 다시 실행해 반영 확인.
-- 하는 일 (모두 한 번에, 중간에 실패하면 아무것도 바뀌지 않는다):
--   · 그 주문 묶음의 "환불한 질문"을 늘리고, 지갑에 남은 질문을 그만큼 회수한다 — 토스 부분 취소를 반영할 때와 같은 DB 함수(apply_cash_refund)를 쓰므로 계산이 같다
--   · 운영 기록(ops_events, 종류 admin.manual_refund)에 주문번호 · 환불 질문 수 · 송금액 · 메모를 남긴다 — 계좌번호 · 이름은 남기지 않는다(메모에 숫자가 9자리 이상 이어지면 거부한다 — 날짜 2026-10-17은 괜찮다)
-- 하지 않는 것: 주문 상태를 바꾸지 않는다(결제 완료 그대로 — 토스 기록도 그대로라 결제 재확인이 이상으로 보지 않는다). 그래서 사업 지표의 매출에는 송금 환불이 빠지지 않는다 — 운영 기록의 송금액을 직접 빼서 본다.
--
-- 사용: 아래 ▼ ▲ 사이의 세 값만 바꾼다 (따옴표 · 세미콜론은 그대로).
--       Supabase 대시보드 → SQL Editor → New query → 이 파일 내용(경로가 아니라 내용)을 붙여넣고 Run.
--       "Success. No rows returned"가 나오면 반영된 것이다. 빨간 오류가 나오면 아무것도 바뀌지 않은 것이니 오류 문장을 알려 주세요.
-- 같은 파일을 같은 값으로 두 번 실행하면 한 번 더 환불한 것으로 반영되려 하므로(질문 수가 모자라면 거부) 실행한 뒤에는 값을 지우고 check 파일로 확인한다.
-- 한 주문은 한 가지 방법으로만 환불한다 — 토스에서 취소했거나 취소할 것이면 이 파일로 반영하지 않는다.

do $$
declare
  -- ▼▼▼ 여기 세 값만 바꾸세요 ▼▼▼
  p_order_number text := '여기에_주문번호';
  p_questions    int  := 1;                                  -- 이번에 새로 환불해 준 질문 개수 (check 파일의 "송금할 금액" 표에서 보낸 금액에 해당하는 개수)
  p_memo         text := '송금 완료 · 문의 접수 메모만 적기'; -- 계좌번호 · 이름 · 연락처는 적지 않는다
  -- ▲▲▲ 여기까지 ▲▲▲
  v_order public.orders%rowtype;
  v_pack public.question_packs%rowtype;
  v_target_k int;
  v_cumulative int;
  v_send int;
  v_result jsonb;
  v_run text;
begin
  if p_questions is null or p_questions < 1 then
    raise exception '환불해 준 질문 개수는 1 이상이어야 합니다';
  end if;
  if p_memo is null or char_length(btrim(p_memo)) = 0 or char_length(p_memo) > 200 then
    raise exception '메모는 1~200자로 적어 주세요 (송금일 · 문의 접수번호 같은 것)';
  end if;
  -- 숫자(와 하이픈 · 공백)가 이어진 덩어리마다 숫자가 9개 이상이면 계좌번호 · 전화번호로 보고 거부한다 (날짜 2026-10-17은 숫자 8개라 통과)
  for v_run in select m[1] from regexp_matches(p_memo, '([0-9][0-9 -]*[0-9])', 'g') as m loop
    if char_length(regexp_replace(v_run, '[^0-9]', '', 'g')) >= 9 then
      raise exception '메모에 숫자가 길게 이어져 있습니다 — 계좌번호 · 전화번호는 적지 마세요 (미유 기록에 남기지 않습니다)';
    end if;
  end loop;

  select * into v_order from public.orders where order_number = p_order_number;
  if not found then
    raise exception '주문번호 % 를 찾지 못했습니다', p_order_number;
  end if;
  if v_order.status <> 'paid' then
    raise exception '결제 완료 주문이 아닙니다 (상태 %) — 이미 환불됨이면 반영할 질문이 없습니다', v_order.status;
  end if;
  if v_order.product_id !~ '^cash-charge:[0-9]{1,6}:[0-9]{1,6}:[A-Za-z0-9]{6,32}$' then
    raise exception '질문 묶음 주문이 아닙니다';
  end if;

  select * into v_pack from public.question_packs where order_id = v_order.id for update;
  if not found then
    raise exception '묶음 장부가 없는 주문입니다 (DB 변경 16번 이전에 결제한 주문) — 이 절차로 처리하지 마세요';
  end if;

  v_target_k := v_pack.refunded_questions + p_questions;
  if v_target_k > v_pack.questions then
    raise exception '환불할 수 있는 질문은 % 개까지 남았는데 % 개를 환불하려 합니다', v_pack.questions - v_pack.refunded_questions, p_questions;
  end if;

  -- 이번에 송금했어야 하는 금액 = 누적 환불표 − 이미 환불한 누적액 (토스 부분 취소와 같은 계산)
  v_cumulative := public.question_refund_total(v_pack.price_krw, v_pack.questions, v_target_k);
  v_send := v_cumulative - v_pack.refunded_krw;

  v_result := public.apply_cash_refund(v_order.id, v_cumulative);
  if v_result ->> 'status' <> 'applied' then
    raise exception '장부에 반영하지 못했습니다 (결과: %) — 아무것도 바뀌지 않았습니다', v_result::text;
  end if;

  insert into public.ops_events (kind, severity, order_number, message, detail)
  values (
    'admin.manual_refund',
    'warn',
    v_order.order_number,
    left('계좌 송금 환불을 장부에 반영했습니다 · ' || btrim(p_memo), 500),
    jsonb_build_object(
      'questions', p_questions,
      'refundedQuestionsTotal', v_target_k,
      'sentKrw', v_send,
      'cumulativeKrw', v_cumulative,
      'clawed', (v_result ->> 'clawed')::int,
      'shortfall', (v_result ->> 'shortfall')::int
    )
  );

  raise notice '반영 완료: 질문 % 개 · 송금액 %원 · 지갑에서 회수 % 개 · 이미 써서 회수하지 못한 질문 % 개', p_questions, v_send, v_result ->> 'clawed', v_result ->> 'shortfall';
end;
$$;
