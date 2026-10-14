-- ME:U(미유) 자유 질문 실제 AI 시험 — 호출 수 · 비용 · 질문 횟수 확인 (읽기만 한다 — 아무것도 만들거나 바꾸거나 지우지 않는다).
--
-- 사용: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용을 붙여넣고 Run. 시험 중간중간 · 끝난 뒤에 실행한다.
-- 질문 · 답 내용은 이 표들에 없다 (횟수와 토큰 수와 비용 어림만 있다).
-- 비용은 "토큰 수 × 가격표"로 센 어림(est_cost_krw, 환율 1,600원 가정, 부가세 · 여유율 제외)이다. 실제 청구는 Anthropic 콘솔의 사용량으로 확인한다.

-- 1) 호출 기록 요약 — 결과별(ok 정상 · invalid 검사 실패 · error 호출 실패 · timeout 시간 초과)
select
  provider,
  outcome,
  coalesce(error_code, '-') as 오류_종류,
  count(*)                  as 호출_수,
  coalesce(sum(input_tokens), 0)  as 입력_토큰,
  coalesce(sum(output_tokens), 0) as 출력_토큰,
  round(coalesce(sum(est_cost_krw), 0)::numeric, 1) as 비용_어림_원
from public.ai_usage
where prompt_version like 'chat-%'
group by provider, outcome, coalesce(error_code, '-')
order by provider, outcome, 오류_종류;

-- 2) 합계 — 청구되지 않는 오류(RATE_LIMITED · AUTH · BILLING · INVALID_REQUEST · BUDGET_EXCEEDED)는 호출 수에서 뺀다
select
  count(*) filter (where error_code is null or error_code not in ('RATE_LIMITED', 'AUTH', 'BILLING', 'INVALID_REQUEST', 'BUDGET_EXCEEDED')) as 청구될_수_있는_호출_수,
  count(*) filter (where error_code = 'BUDGET_EXCEEDED') as 승인_범위_밖이라_막은_수,
  round(coalesce(sum(est_cost_krw), 0)::numeric, 1)      as 비용_어림_합계_원,
  round((coalesce(sum(est_cost_krw), 0) * 1.1)::numeric, 1) as 여유율_포함_원,
  count(*) filter (where est_cost_krw is null and (error_code is null or error_code not in ('RATE_LIMITED', 'AUTH', 'BILLING', 'INVALID_REQUEST', 'BUDGET_EXCEEDED'))) as 비용을_모르는_호출_수
from public.ai_usage
where prompt_version like 'chat-%' and provider = 'anthropic';

-- 3) 질문 횟수 — 누가(번호 앞 8자리만) · 어느 방 · 몇 번 (질문 내용 없음)
select
  left(user_id::text, 8) as 회원_앞8자리,
  room_key               as 방,
  count(*)               as 센_질문_수,
  min(created_at)        as 처음,
  max(created_at)        as 마지막
from public.chat_questions
group by user_id, room_key
order by max(created_at) desc
limit 50;
