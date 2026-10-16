-- ME:U(미유) 유료 질문(결제해 둔 질문 장부) 점검 — 읽기만 한다 (아무것도 만들거나 바꾸거나 지우지 않는다).
--
-- 사용: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용을 붙여넣고 Run. 질문 결제 시험 뒤 · 정기 점검 때 실행한다.
-- 결과는 표 하나로 나온다 (SQL Editor는 쿼리가 여러 개면 마지막 결과만 보여 주므로 하나로 합쳤다).
-- 개인을 알 수 있는 값은 회원번호 앞 8자리뿐이다. 질문 내용은 어디에도 없다.
--
-- 구분 1: 전체 합계 — 충전 · 보너스 · 사용 · 되돌림 · 회수 개수와 건수
-- 구분 2: 이상 징후 — "지갑 잔액 ≠ 내역의 합계"인 회원 · 결제 완료인데 충전 내역이 없는 캐시 주문 · 결제 취소로 회수하지 못한 캐시가 남은 건
--         · (16번 이후) 묶음 장부와 내역이 맞지 않는 묶음 · 환불됨인데 환불 반영(회수 내역)이 없는 묶음 · 이미 쓴 질문까지 환불된 묶음
--         (아무 줄도 없으면 이상 없음. 줄이 있으면 번호를 그대로 알려 주세요 — 직접 고치지 마세요.
--          "결제 완료인데 충전 내역이 없음"은 관리자 화면(/admin)에서 그 주문을 찾아 [결제사 확인 후 질문 넣기]로 처리한다 — 결제사 기록을 다시 확인한 뒤에만 넣고, 주문마다 한 번만 들어간다)

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
         '결제 완료인데 충전 내역이 없음 · 주문 ' || o.order_number
           || case when o.status = 'paid' then ' → 관리자 화면에서 이 주문을 찾아 [결제사 확인 후 질문 넣기] (15번 DB 변경 필요)' else ' (환불된 주문이라 넣지 않음)' end,
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

  union all

  -- 16번 이후: 묶음 한 줄의 누적 환불액 · 쓴 수 · 환불 수가 내역과 맞는지 (읽기만 — 16번 전에는 question_packs 표가 없어 이 조회는 오류가 난다. 그때는 아래 구분 2의 위쪽 줄만 보면 된다)
  select '2 이상 징후',
         '묶음 장부와 내역이 다름 · 주문 ' || o.order_number
           || ' (쓴 ' || p.used || ' / 내역의 사용 ' || coalesce(u.spent, 0)
           || ', 환불 질문 ' || p.refunded_questions || ' / 내역의 환불 회수 ' || coalesce(r.clawed, 0) || ' + 모자란 몫 ' || coalesce(r.short, 0) || ')',
         1::bigint, 0::bigint
  from public.question_packs p
  join public.orders o on o.id = p.order_id
  left join (select pack_order_id, count(*) filter (where kind = 'spend') - count(*) filter (where kind = 'spend_restore' and amount > 0) as spent
             from public.cash_ledger where pack_order_id is not null group by pack_order_id) u on u.pack_order_id = p.order_id
  left join (select order_id, (-sum(amount) / 3) as clawed, (sum(shortfall) / 3) as short
             from public.cash_ledger where kind = 'refund_claw' group by order_id) r on r.order_id = p.order_id
  where p.refunded_questions <> coalesce(r.clawed, 0) + coalesce(r.short, 0)

  union all

  select '2 이상 징후',
         '결제사에서 환불됐는데 묶음 환불 반영이 없음 · 주문 ' || o.order_number,
         1::bigint, 0::bigint
  from public.question_packs p
  join public.orders o on o.id = p.order_id
  where o.status = 'refunded' and p.refunded_krw < p.price_krw

  union all

  select '2 이상 징후',
         '환불을 받은 질문 중 이미 쓴 질문이 있음(운영자 확인) · 주문 ' || o.order_number || ' (' || (p.used + p.refunded_questions - p.questions) || '개)',
         1::bigint, (p.used + p.refunded_questions - p.questions)::bigint
  from public.question_packs p
  join public.orders o on o.id = p.order_id
  where p.used + p.refunded_questions > p.questions
) t
order by "구분", "항목";
