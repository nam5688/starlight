-- ME:U(미유) 미유캐시 점검 — 읽기만 한다 (아무것도 만들거나 바꾸거나 지우지 않는다).
--
-- 사용: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용을 붙여넣고 Run. 충전 시험 뒤 · 정기 점검 때 실행한다.
-- 결과는 표 하나로 나온다 (SQL Editor는 쿼리가 여러 개면 마지막 결과만 보여 주므로 하나로 합쳤다).
-- 개인을 알 수 있는 값은 회원번호 앞 8자리뿐이다. 질문 내용은 어디에도 없다.
--
-- 구분 1: 전체 합계 — 충전 · 보너스 · 사용 · 되돌림 · 회수 개수와 건수
-- 구분 2: 이상 징후 — "지갑 잔액 ≠ 내역의 합계"인 회원 · 결제 완료인데 충전 내역이 없는 캐시 주문 · 결제 취소로 회수하지 못한 캐시가 남은 건
--         (아무 줄도 없으면 이상 없음. 줄이 있으면 번호를 그대로 알려 주세요 — 직접 고치지 마세요)

select * from (
  select '1 합계' as "구분",
         kind as "항목",
         count(*)::bigint as "건수",
         coalesce(sum(amount), 0)::bigint as "캐시_합계"
  from public.cash_ledger
  group by kind

  union all

  select '1 합계', '지갑 잔액 합계 (모든 회원)', count(*)::bigint, coalesce(sum(balance), 0)::bigint
  from public.cash_wallets

  union all

  select '2 이상 징후',
         '잔액이 내역의 합계와 다름 · 회원 ' || left(w.user_id::text, 8) || ' (지갑 ' || w.balance || ' / 내역 ' || coalesce(l.total, 0) || ')',
         1::bigint, (w.balance - coalesce(l.total, 0))::bigint
  from public.cash_wallets w
  left join (select user_id, sum(amount) as total from public.cash_ledger group by user_id) l on l.user_id = w.user_id
  where w.balance <> coalesce(l.total, 0)

  union all

  select '2 이상 징후',
         '결제 완료인데 충전 내역이 없음 · 주문 ' || o.order_number,
         1::bigint, 0::bigint
  from public.orders o
  where o.product_id like 'cash-charge:%' and o.status in ('paid', 'refunded')
    and not exists (select 1 from public.cash_ledger g where g.order_id = o.id and g.kind = 'charge')

  union all

  select '2 이상 징후',
         '결제 취소 때 이미 써서 회수하지 못한 캐시 · 주문 ' || o.order_number,
         1::bigint, g.shortfall::bigint
  from public.cash_ledger g
  join public.orders o on o.id = g.order_id
  where g.kind = 'clawback' and g.shortfall > 0
) t
order by "구분", "항목";
