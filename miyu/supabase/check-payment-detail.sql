-- ME:U(미유) 주문 하나의 결제 처리 기록 — 읽기만 한다 (아무것도 바꾸지 않는다).
--
-- 사용: 아래 '여기에_주문번호' 부분만 MEU-로 시작하는 주문번호로 바꾼 뒤(따옴표는 그대로 둔다),
--       Supabase 대시보드 → SQL Editor → New query에 붙여넣고 Run.
--       주문번호는 미유 MY → 결제내역에서, 또는 check-payments.sql 결과의 첫 열에서 찾는다.
-- 토스 문서 예제 키(공용 상점)로 결제했다면 내 상점 관리자에는 내역이 보이지 않는 것이 정상이다.

select
  to_char(e.created_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI:SS') as "시각(KST)",
  e.source  as "출처",     -- checkout 결제 시작 / confirm 승인 요청 / webhook 결제사 알림 / fail_redirect 결제창에서 돌아옴 / reconcile 결제사 기록과 대조 / admin 운영자
  e.status  as "상태",
  e.detail ->> 'method' as "결제 수단",
  e.detail ->> 'mId'    as "상점 ID"  -- 토스 문서 예제 키는 공용 상점이라 내 상점 관리자에 내역이 보이지 않는다
from public.payment_events e
join public.orders o on o.id = e.order_id
where o.order_number = '여기에_주문번호'
order by e.created_at, e.id;
