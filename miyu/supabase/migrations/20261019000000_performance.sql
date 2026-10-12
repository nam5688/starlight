-- ME:U(미유) 성능 보강 — 하루 AI 비용 합계를 DB에서 계산하는 함수와, 재확인 점검용 부분 색인.
-- 앞의 마이그레이션 8개를 실행한 뒤, SQL Editor에서 이 파일을 한 번 실행한다. 기존 데이터는 바뀌지 않는다 (함수와 색인만 더한다).
--
-- Supabase는 한 번에 돌려주는 행 수를 기본 1,000개로 제한한다. 사용 기록을 모두 가져와 코드에서 더하면 기록이 많아졌을 때
-- 합계가 조용히 모자라지므로, 합계는 DB에서 계산한다 (새 구매 중단 판단에 쓰인다).

create or replace function public.ai_cost_since(p_since timestamptz)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(est_cost_krw), 0) from public.ai_usage where created_at >= p_since
$$;

revoke all on function public.ai_cost_since(timestamptz) from public, anon, authenticated;
grant execute on function public.ai_cost_since(timestamptz) to service_role;

-- 결제 재확인 점검: 오래 대기 중인 주문과 최근 결제 완료 주문을 빠르게 찾는다
create index if not exists orders_pending_created_idx on public.orders (created_at) where status = 'pending';
create index if not exists orders_paid_approved_idx on public.orders (approved_at desc) where status = 'paid';
