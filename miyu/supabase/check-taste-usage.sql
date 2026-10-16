-- ME:U(미유) 맛보기 리포트 실제 생성 확인 — 호출 기록 · 비용 · 저장된 건수 확인 (읽기만 한다 — 아무것도 만들거나 바꾸거나 지우지 않는다).
--
-- 사용: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용을 붙여넣고 Run. 맛보기 리포트를 실제 AI로 받아 본 뒤에 실행한다.
-- 결과는 표 하나로 나온다(SQL Editor는 쿼리가 여러 개면 마지막 결과만 보여 주므로 하나로 합쳤다).
-- 글 · 질문 · 응답 · 이름은 이 표에 없다 (모델 이름 · 토큰 수 · 비용 어림 · 결과만 있다).
--
-- 읽는 법
--  - "1 호출 하나씩": 맛보기 호출을 시간 순서로. 한 번 받기에 호출이 2번이면 처음 글이 검사에 걸려 한 번 고쳐 쓴 것이다(재시도).
--    outcome = ok 검사 통과 · invalid 응답은 왔지만 검사 실패 · error 호출 실패 · timeout 시간 초과.
--  - "2 합계": 호출 수 · 토큰 · 비용 어림. 비용은 "토큰 수 × 가격표"로 센 어림(부가세 · 여유율 제외)이다. 실제 청구는 Anthropic 콘솔 사용량으로 확인한다.
--  - "3 저장된 맛보기": 실제로 저장되어 회원이 받은 것(=계정당 1번으로 센 것) 수. 실패한 시도는 받은 것으로 세지 않으므로 여기 들어가지 않는다.
--  - "4 한 건당 총 생성비": (실제 AI 호출의 비용 어림 전체, 실패 · 재시도 포함) ÷ (저장된 맛보기 수). 맛보기 한 건의 비용일 뿐이며
--    **심층 리포트나 채팅 질문 한 번의 원가가 아니다** — 그 둘은 따로 재야 한다. 아직 저장된 것이 없으면 계산하지 않는다.
--  - 모의(mock-local) 호출은 제외한다.

select * from (
  select '1 호출 하나씩' as "구분",
         to_char(created_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI:SS') || ' / ' || model || ' / ' || prompt_version || ' / ' || outcome || ' / ' || coalesce(error_code, '-') as "항목",
         1::bigint as "수",
         coalesce(input_tokens, 0)::bigint as "입력_토큰",
         coalesce(output_tokens, 0)::bigint as "출력_토큰",
         round(coalesce(est_cost_krw, 0)::numeric, 2) as "비용_어림_원"
  from public.ai_usage
  where prompt_version like 'taste-%' and provider <> 'mock-local'

  union all

  select '2 합계', '맛보기 호출 전체 (청구되지 않는 오류 제외)',
         count(*) filter (where error_code is null or error_code not in ('RATE_LIMITED', 'AUTH', 'BILLING', 'INVALID_REQUEST', 'BUDGET_EXCEEDED'))::bigint,
         coalesce(sum(input_tokens), 0)::bigint,
         coalesce(sum(output_tokens), 0)::bigint,
         round(coalesce(sum(est_cost_krw), 0)::numeric, 2)
  from public.ai_usage
  where prompt_version like 'taste-%' and provider <> 'mock-local'

  union all

  select '2 합계', '  그중 검사에 걸리거나(invalid) 실패한(error · timeout) 호출',
         count(*)::bigint,
         coalesce(sum(input_tokens), 0)::bigint,
         coalesce(sum(output_tokens), 0)::bigint,
         round(coalesce(sum(est_cost_krw), 0)::numeric, 2)
  from public.ai_usage
  where prompt_version like 'taste-%' and provider <> 'mock-local' and outcome <> 'ok'

  union all

  select '2 합계', '  비용을 모르는 호출 (시간 초과 등, 비용 어림이 비어 있다)',
         count(*)::bigint, 0::bigint, 0::bigint, 0::numeric
  from public.ai_usage
  where prompt_version like 'taste-%' and provider <> 'mock-local' and est_cost_krw is null

  union all

  select '3 저장된 맛보기',
         coalesce(generator, '(모델 기록 없음)') || ' / ' || coalesce(generator_version, '-') || ' / ' || status,
         count(*)::bigint, 0::bigint, 0::bigint, 0::numeric
  from public.taste_reports
  group by generator, generator_version, status

  union all

  select '4 한 건당 총 생성비',
         '실제 AI 호출 비용 어림 ÷ 저장된 실제 AI 맛보기 수 (실패 · 재시도 포함, 심층 리포트 원가 아님)',
         (select count(*) from public.taste_reports where status = 'ready' and generator like 'anthropic:%')::bigint,
         0::bigint, 0::bigint,
         case
           when (select count(*) from public.taste_reports where status = 'ready' and generator like 'anthropic:%') = 0 then null
           else round(
             ((select coalesce(sum(est_cost_krw), 0) from public.ai_usage where prompt_version like 'taste-%' and provider = 'anthropic')
              / (select count(*) from public.taste_reports where status = 'ready' and generator like 'anthropic:%'))::numeric, 2)
         end
) t
order by "구분", "항목";
