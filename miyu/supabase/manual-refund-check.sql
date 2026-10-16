-- ME:U(미유) 질문 묶음 "계좌 송금 환불" 확인 — 읽기만 한다 (아무것도 만들거나 바꾸거나 지우지 않는다).
--
-- 언제 쓰나: 결제사(토스)에서 취소할 수 없는 질문 묶음(예: 카드 결제 후 1년이 지나 취소가 실패)을 고객에게 계좌로 직접 송금해 환불할 때.
--            송금 전에 한 번(얼마를 보낼지 확인), 반영한 뒤에 한 번(반영됐는지 확인) 실행한다. 절차 전체는 docs/runbook.md의 "계좌 송금 환불".
-- 사용: 아래 '여기에_주문번호' 부분만 MEU-로 시작하는 주문번호로 바꾼 뒤(따옴표는 그대로 둔다),
--       Supabase 대시보드 → SQL Editor → New query → 이 파일 내용(경로가 아니라 내용)을 붙여넣고 Run.
--       주문번호는 /admin의 "최근 주문" 또는 MY → 결제내역에서 찾는다.
-- 결과는 표 하나로 나온다 (SQL Editor는 쿼리가 여러 개면 마지막 결과만 보여 주므로 하나로 합쳤다).
-- 개인을 알 수 있는 값은 회원번호 앞 8자리뿐이다. 계좌번호 · 이름은 어디에도 없고, 이 파일로 적지도 않는다.

with target as (
  select o.id, o.order_number, o.status, o.amount, o.method, o.payment_key, o.approved_at, o.user_id, p.questions, p.used, p.refunded_questions, p.refunded_krw,
         greatest(0, p.questions - p.used - p.refunded_questions) as remaining
  from public.orders o
  left join public.question_packs p on p.order_id = o.id
  where o.order_number = '여기에_주문번호'
),
steps as (
  -- "이번에 송금할 금액" = 누적 환불표 − 이미 환불한 누적액 (834 → 1,667 → 2,500에서 매번 올림하지 않고 합계가 정확히 결제액이 되게 한다)
  select t.id, g.k as add_questions,
         public.question_refund_total(t.amount, t.questions, t.refunded_questions + g.k) as cumulative_krw,
         public.question_refund_total(t.amount, t.questions, t.refunded_questions + g.k) - t.refunded_krw as send_krw
  from target t
  cross join lateral generate_series(1, greatest(0, t.questions - t.refunded_questions)) as g(k)
  where t.questions is not null
)
select * from (
  select 1 as "순서", '주문' as "구분", '주문번호 · 상태 · 결제액' as "항목",
         coalesce(t.order_number || ' · ' || t.status || ' · ' || t.amount || '원', '이 주문번호를 찾지 못했습니다 — 번호를 다시 확인하세요') as "값"
  from (select 1) x left join target t on true

  union all
  select 2, '주문', '결제수단 · 결제 시각(KST) · 회원 ' ,
         coalesce(t.method, '(기록 없음)') || ' · ' || coalesce(to_char(t.approved_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'), '-') || ' · ' || left(t.user_id::text, 8)
  from target t

  union all
  select 3, '묶음', '질문 수 · 쓴 질문 · 이미 환불한 질문 · 지금 남은 질문',
         case when t.questions is null then '묶음 장부가 없습니다 (질문 묶음 주문이 아니거나 DB 변경 16번 이전에 결제한 주문) — 이 절차로 처리할 수 없습니다. 번호를 알려 주세요'
              else t.questions || ' · ' || t.used || ' · ' || t.refunded_questions || ' · ' || t.remaining end
  from target t

  union all
  select 4, '묶음', '이미 환불한 누적액(원)', coalesce(t.refunded_krw::text, '-') from target t

  union all
  -- 환불해 줄 질문 수마다 보낼 금액. 남은 질문을 쓴 뒤에 환불하면 쓴 질문은 회수하지 못한 몫으로 남으므로, 송금 직전에 이 표를 다시 확인한다
  select 5, '송금할 금액', '이번에 질문 ' || s.add_questions || '개를 환불하려면 보낼 금액 (환불 뒤 누적 ' || s.cumulative_krw || '원)', s.send_krw || '원'
  from steps s

  union all
  select 6, '지갑', '이 회원의 질문 장부 잔액(질문 수)', coalesce((select (w.balance / 3)::text || '개 (장부 단위 ' || w.balance || ')' from public.cash_wallets w join target t on t.user_id = w.user_id), '지갑 없음')

  union all
  -- 이 주문의 지난 송금 환불 기록 (운영 기록 admin.manual_refund — 계좌번호 · 이름은 남기지 않는다)
  select 7, '지난 송금 환불 기록', to_char(e.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') || ' · 질문 ' || coalesce(e.detail ->> 'questions', '?') || '개 · ' || coalesce(e.detail ->> 'sentKrw', '?') || '원', e.message
  from public.ops_events e
  where e.kind = 'admin.manual_refund' and e.order_number = (select order_number from target)

  union all
  select 8, '주의', '같은 주문을 토스 취소와 계좌 송금으로 두 번 환불하지 않는다',
         '토스에서 이미 일부 취소했다면(누적 환불액이 0이 아니면) 남은 금액만 계산한 값입니다. 송금한 뒤에는 같은 질문 수로 manual-refund-apply.sql을 실행해 장부에 반영하세요.'
) r
order by "순서", "항목", "값";
