-- ME:U(미유) 기존 주문 대조 — 읽기만 한다 (주문 · 결제 · 리포트 상태를 바꾸지 않는다).
--
-- 사용: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용을 붙여넣고 Run → 결과를 확인한다.
--       특정 주문의 결제 처리 기록을 더 보고 싶으면 check-payment-detail.sql을 쓴다.
-- 이 파일의 결과를 바꿔서 "결제 완료"로 맞추지 않는다. 결제사(토스) 기록과 다르면 먼저 원인을 확인한다.
--
-- 결제 키(paymentKey)는 앞 12자만 보여 준다. 채팅에 결과를 붙여넣을 때는 주문번호 · 상태 · 판정 열만 보내면 충분하다.

-- ─────────────────────────────────────────────
-- 최근 주문 30건 한눈에 (최신순)
-- ─────────────────────────────────────────────
select
  o.order_number                                   as "주문번호",
  o.payment_env                                    as "결제 환경",       -- test-docs: 토스 문서 예제 공용 키 / test: 내 테스트 키 / live: 실결제
  o.status                                         as "주문 상태",       -- pending 결제 전·확인 중 / paid 결제 완료 / failed·canceled 결제 안 됨 / refunded 환불
  o.amount                                         as "금액",
  to_char(o.created_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI')  as "주문 시각(KST)",
  to_char(o.approved_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as "승인 시각(KST)",
  case when o.payment_key is null then '-' else left(o.payment_key, 12) || '…' end as "결제 키(앞)",
  coalesce(o.method, '-')                          as "결제 수단",
  coalesce(ev.n, 0)                                as "결제 기록 수",
  coalesce(ev.last_status, '-')                    as "마지막 결제 기록",
  coalesce(ev.has_done, false)                     as "승인 완료 기록",
  coalesce(r.status, '없음')                       as "리포트 상태",
  case
    when o.status = 'paid' and not coalesce(ev.has_done, false)                  then '확인 필요: 결제 완료인데 승인 기록이 없음'
    when o.status = 'paid' and r.id is null                                       then '확인 필요: 결제 완료인데 리포트가 없음'
    when o.status = 'paid' and r.status = 'failed'                                then '확인 필요: 리포트 생성 실패 (다시 만들기 필요)'
    when o.status = 'paid' and r.status in ('queued', 'generating')
         and r.updated_at < now() - interval '30 minutes'                         then '확인 필요: 리포트가 30분 넘게 만들어지는 중'
    when o.status = 'paid'                                                        then '정상 (결제 완료 · 승인 기록 있음 · 리포트 있음)'
    when o.status <> 'paid' and r.id is not null                                  then '이상: 결제 완료가 아닌데 리포트가 있음'
    when o.status = 'pending' and o.created_at < now() - interval '1 hour'        then '미완료: 1시간 넘게 결제 확인 안 됨 (결제사 기록 대조 필요)'
    when o.status = 'pending'                                                     then '진행 중이거나 결제 확인 중'
    when o.status = 'refunded'                                                    then '환불됨'
    else '결제 안 됨 (' || o.status || ')'
  end                                              as "판정"
from public.orders o
left join lateral (
  select count(*) as n,
         (array_agg(e.status order by e.created_at desc, e.id desc))[1] as last_status,
         bool_or(e.status = 'DONE') as has_done
  from public.payment_events e
  where e.order_id = o.id
) ev on true
left join public.reports r on r.order_id = o.id
order by o.created_at desc
limit 30;
