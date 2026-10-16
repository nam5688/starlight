-- ME:U(미유) 초대 링크 · 초대 할인(5,900원) 확인 — 읽기만 한다 (아무것도 바꾸지 않는다). DB 변경 18번(20261028000000_invites.sql)을 실행한 뒤에 쓴다.
--
-- 사용: Supabase 대시보드 → SQL Editor → New query에 붙여넣고 Run. 두 표가 나온다.
--  1) 초대 할인을 받은 주문 최근 30건 — 초대한 사람 · 받은 사람은 회원번호 앞 8자리만 보인다(닉네임 · 생년월일 · 응답은 없다)
--  2) 초대한 사람별 현재 쓴 자리 — 한 명당 3명까지(결제 완료 + 결제 대기 1시간 이내)
-- 고객이 "초대 가격이 안 됐어요"라고 문의하면 1번에서 그 주문번호가 5,900원으로 있는지, 없다면 2번에서 초대한 사람의 자리가 찼는지(used 3) 본다.
-- 주문 금액은 주문을 만들 때 정해져 바꿀 수 없다. 이미 정가로 결제한 주문을 이 파일로 고치지 않는다(환불은 토스 관리자에서 취소 → 미유가 "환불됨"으로 맞춘다).

select
  to_char(d.created_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as "시각(KST)",
  o.order_number as "주문번호",
  o.amount as "금액",
  o.status as "주문 상태",
  left(d.inviter_user_id::text, 8) as "초대한 사람(앞 8자)",
  left(d.invitee_user_id::text, 8) as "받은 사람(앞 8자)",
  (d.invite_id is not null) as "링크 살아 있음"
from public.invite_discounts d
join public.orders o on o.id = d.order_id
order by d.created_at desc
limit 30;

select
  left(d.inviter_user_id::text, 8) as "초대한 사람(앞 8자)",
  count(*) filter (where o.status = 'paid' or (o.status = 'pending' and o.created_at > now() - interval '1 hour')) as "쓴 자리(한도 3)",
  count(*) filter (where o.status = 'paid') as "결제 완료",
  count(*) filter (where o.status = 'pending' and o.created_at > now() - interval '1 hour') as "결제 대기(1시간 이내)",
  count(*) filter (where o.status = 'refunded') as "환불됨(자리 돌려받음)"
from public.invite_discounts d
join public.orders o on o.id = d.order_id
group by d.inviter_user_id
order by 2 desc, 1;
