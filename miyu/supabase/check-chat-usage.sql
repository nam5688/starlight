-- ME:U(미유) 자유 질문 실제 AI 시험 — 호출 수 · 비용 · 질문 횟수 확인 (읽기만 한다 — 아무것도 만들거나 바꾸거나 지우지 않는다).
--
-- 사용: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용을 붙여넣고 Run. 시험 중간중간 · 끝난 뒤에 실행한다.
-- 결과는 표 하나로 나온다(SQL Editor는 쿼리가 여러 개면 마지막 결과만 보여 주므로 하나로 합쳤다).
-- 질문 · 답 내용은 이 표에 없다 (횟수와 토큰 수와 비용 어림만 있다).
-- 비용은 "토큰 수 × 가격표"로 센 어림(환율 1,600원 가정, 부가세 · 여유율 제외)이다. 실제 청구는 Anthropic 콘솔의 사용량으로 확인한다.
-- 구분 1: 호출 결과별(ok 정상 · invalid 검사 실패 · error 호출 실패 · timeout 시간 초과)
-- 구분 2: 합계 — 청구되지 않는 오류(RATE_LIMITED · AUTH · BILLING · INVALID_REQUEST · BUDGET_EXCEEDED)는 호출 수에서 뺀다
-- 구분 3: 질문 횟수 — 회원(번호 앞 8자리) · 방별로 센 질문 수

select * from (
  select '1 호출 결과별' as "구분",
         provider || ' / ' || outcome || ' / ' || coalesce(error_code, '-') as "항목",
         count(*)::bigint as "수",
         coalesce(sum(input_tokens), 0)::bigint as "입력_토큰",
         coalesce(sum(output_tokens), 0)::bigint as "출력_토큰",
         round(coalesce(sum(est_cost_krw), 0)::numeric, 1) as "비용_어림_원"
  from public.ai_usage
  where prompt_version like 'chat-%'
  group by provider, outcome, coalesce(error_code, '-')

  union all

  select '2 합계', '청구될 수 있는 호출 (비용 어림 · 여유율 1.1 포함)',
         count(*) filter (where error_code is null or error_code not in ('RATE_LIMITED', 'AUTH', 'BILLING', 'INVALID_REQUEST', 'BUDGET_EXCEEDED'))::bigint,
         coalesce(sum(input_tokens), 0)::bigint,
         coalesce(sum(output_tokens), 0)::bigint,
         round((coalesce(sum(est_cost_krw), 0) * 1.1)::numeric, 1)
  from public.ai_usage
  where prompt_version like 'chat-%' and provider = 'anthropic'

  union all

  select '2 합계', '승인 범위 밖이라 막은 호출',
         count(*)::bigint, 0::bigint, 0::bigint, 0::numeric
  from public.ai_usage
  where prompt_version like 'chat-%' and provider = 'anthropic' and error_code = 'BUDGET_EXCEEDED'

  union all

  select '2 합계', '비용을 모르는 호출 (시간 초과 등, 최악 비용으로 셈)',
         count(*)::bigint, 0::bigint, 0::bigint, 0::numeric
  from public.ai_usage
  where prompt_version like 'chat-%' and provider = 'anthropic' and est_cost_krw is null
    and (error_code is null or error_code not in ('RATE_LIMITED', 'AUTH', 'BILLING', 'INVALID_REQUEST', 'BUDGET_EXCEEDED'))

  union all

  select '3 질문 횟수',
         '회원 ' || left(user_id::text, 8) || ' / 방 ' || room_key,
         count(*)::bigint, 0::bigint, 0::bigint, 0::numeric
  from public.chat_questions
  group by user_id, room_key
) t
order by "구분", "항목";
