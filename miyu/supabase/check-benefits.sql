-- ME:U(미유) 혜택(포인트 · 질문권 · 쿠폰 · 0원 혜택 주문 · 추천) 장부 점검 — 읽기만 한다 (아무것도 바꾸지 않는다). DB 변경 19~22번을 실행한 뒤에 쓴다.
--
-- 사용: Supabase 대시보드 → SQL Editor → New query에 붙여넣고 Run. 표가 여러 개 나온다. 모든 표가 "비어 있거나 0"이어야 정상인 부분은 이름 앞에 [이상 징후]가 붙어 있다.
-- 개인 정보는 없다(회원번호 앞 8자리 · 숫자 · 상태뿐). 이 파일로 장부를 고치지 않는다 — 어긋난 곳이 보이면 주문번호 · 회원번호 앞 8자리를 적어 개발자에게 알려 주세요.

-- 1) 지금 켜진 혜택 스위치 (모두 false로 시작하고, 운영자가 켠 것만 true)
select key as "설정", value as "값" from public.benefit_settings where key like 'feature.%' order by key;

-- 2) [이상 징후] 포인트 묶음의 남은 양이 내역 합계와 다른 묶음 (0줄이어야 한다)
select left(l.user_id::text, 8) as "회원(앞 8자)", l.id as "묶음", l.amount as "지급", l.remaining as "남은 양", coalesce(sum(g.amount), 0) as "내역 합계"
from public.point_lots l
left join public.point_ledger g on g.lot_id = l.id
group by l.id
having l.remaining <> coalesce(sum(g.amount), 0)
limit 50;

-- 3) [이상 징후] 질문권 묶음의 남은 양이 내역 합계와 다른 묶음 (0줄이어야 한다)
select left(l.user_id::text, 8) as "회원(앞 8자)", l.id as "묶음", l.quantity as "지급", l.remaining as "남은 양", coalesce(sum(g.qty), 0) as "내역 합계"
from public.credit_lots l
left join public.credit_ledger g on g.lot_id = l.id
group by l.id
having l.remaining <> coalesce(sum(g.qty), 0)
limit 50;

-- 4) 회수하지 못한 몫(환불 · 부정 회수 때 이미 쓴 몫) — 포인트와 질문권. 0이 아니어도 오류는 아니고 "이미 써서 회수하지 못한 양"의 기록이다
select 'point' as "종류", coalesce(sum(shortfall), 0) as "회수하지 못한 양" from public.point_ledger
union all
select 'credit', coalesce(sum(shortfall), 0) from public.credit_ledger;

-- 5) 혜택 0원 주문 최근 30건 — 종류(쿠폰 · 포인트 · 운영자 지급) · 풀렸는지
select to_char(g.created_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as "시각(KST)", o.order_number as "주문번호", g.kind as "종류", g.ref as "쿠폰 · 가격",
       g.point_spent as "쓴 포인트", o.status as "주문 상태", g.released_at is not null as "풀림(환불 · 취소)", g.release_mode as "방식"
from public.benefit_order_grants g
join public.orders o on o.id = g.order_id
order by g.created_at desc
limit 30;

-- 6) [이상 징후] 0원인데 혜택 주문이 아닌 주문 · 혜택 주문인데 금액이 있는 주문 (0줄이어야 한다)
select order_number as "주문번호", amount as "금액", coalesce(provider, 'tosspayments') as "방식", status as "상태"
from public.orders
where (amount = 0 and coalesce(provider, 'tosspayments') <> 'benefit') or (provider = 'benefit' and amount <> 0)
limit 50;

-- 7) [이상 징후] 혜택 주문인데 근거 기록(benefit_order_grants)이 없는 주문 (0줄이어야 한다)
select o.order_number as "주문번호", o.status as "상태"
from public.orders o
left join public.benefit_order_grants g on g.order_id = o.id
where o.provider = 'benefit' and g.order_id is null
limit 50;

-- 8) 최근 7일 혜택 지급 · 회수가 막힌 기록(결제는 그대로 끝났고 혜택만 실패한 경우) — 정기 점검이 다시 시도한다. 계속 쌓이면 개발자에게 알려 주세요
select to_char(created_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as "시각(KST)", kind as "종류", ref as "대상", left(message, 80) as "메시지"
from public.benefit_failures
where created_at > now() - interval '7 days'
order by created_at desc
limit 30;

-- 9) 추천 가입 현황 — 상태별 수. review(관리자 확인 대기)가 오래 쌓이면 /admin/benefits의 추천 탭에서 처리해 주세요
select status as "상태", count(*) as "수" from public.referral_signups group by status order by status;

-- 10) [이상 징후] 확정된 추천 가입인데 추천 가입 포인트가 없는 건 (0줄이어야 한다 — 포인트 지급 기능이 꺼져 있던 때의 확정은 제외하려면 설정 이력과 함께 본다)
select left(s.invitee_user_id::text, 8) as "친구(앞 8자)", left(s.inviter_user_id::text, 8) as "추천인(앞 8자)", to_char(s.decided_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as "확정(KST)"
from public.referral_signups s
left join public.point_lots l on l.source_kind = 'referral_signup' and l.source_ref = s.invitee_user_id::text
where s.status = 'confirmed' and l.id is null
limit 50;

-- 11) 추천 첫 구매 상태별 수 (held = 추천 가입이 검토 중이라 질문권 보류)
select status as "상태", count(*) as "수" from public.referral_first_purchases group by status order by status;

-- 12) 최근 설정 변경 이력 20건 (언제 · 무엇을 · 왜 · 누가 — 사유는 필수)
select to_char(changed_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as "시각(KST)", key as "설정", old_value as "이전", new_value as "새 값", reason as "사유", left(coalesce(changed_by::text, ''), 8) as "바꾼 사람(앞 8자)"
from public.benefit_settings_history
order by changed_at desc
limit 20;
