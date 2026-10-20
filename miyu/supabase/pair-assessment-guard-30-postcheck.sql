-- ME:U(미유) DB 변경 30번(리포트 궁합 쌍 × 기록 삭제 동시성 장치) — 적용 뒤 확인 (읽기 전용: 아무것도 만들거나 바꾸거나 지우지 않는다)
--
-- 사용: 30번(supabase/migrations/20261109000000_pair_assessment_guard.sql)을 실행한 직후 같은 프로젝트의 SQL Editor에서 이 파일을 붙여넣고 Run. "종합"이 OK여야 한다.
-- 30번은 어떤 데이터도 바꾸지 않는다 — 번호 5 · 6의 숫자가 pair-assessment-guard-30-precheck.sql에서 적어 둔 숫자와 같은지 비교한다.
-- 동시 요청 시험(삭제와 쌍 만들기가 겹칠 때)은 이 조회로 하지 않는다 — 로컬 DB에서 supabase/tests/pair-purge.db.test.ts가 양쪽 순서를 확인했다(외부 DB에서는 실행하지 않았다).

with
r as (
  select * from (values
    (1, '장치 pairs_block_deleted_record가 쌍 표에 켜져 있다 — 넣기 · 결과 번호 바꾸기(a_assessment_id · b_assessment_id)',
      case when exists (select 1 from pg_trigger t where t.tgname = 'pairs_block_deleted_record' and t.tgrelid = 'public.pairs'::regclass and t.tgenabled = 'O' and not t.tgisinternal) then 'OK' else '이상' end, ''),
    (2, '트리거 함수 pairs_block_deleted_record(): 아무도 직접 실행하지 못한다(트리거로만 동작)',
      case when not has_function_privilege('anon', 'public.pairs_block_deleted_record()', 'execute') and not has_function_privilege('authenticated', 'public.pairs_block_deleted_record()', 'execute')
            and not exists (select 1 from pg_proc where oid = 'public.pairs_block_deleted_record()'::regprocedure and coalesce(proacl::text, '') ~ '(^\{|,)=') then 'OK' else '이상' end, ''),
    (3, '함수 pair_join(text, uuid, uuid, text): 서버 역할만 실행(anon · authenticated · public 불가) — 24번과 같다',
      case when has_function_privilege('service_role', 'public.pair_join(text,uuid,uuid,text)', 'execute')
            and not has_function_privilege('anon', 'public.pair_join(text,uuid,uuid,text)', 'execute')
            and not has_function_privilege('authenticated', 'public.pair_join(text,uuid,uuid,text)', 'execute')
            and not exists (select 1 from pg_proc where oid = 'public.pair_join(text,uuid,uuid,text)'::regprocedure and coalesce(proacl::text, '') ~ '(^\{|,)=') then 'OK' else '이상' end, ''),
    (4, '함수 pair_join이 삭제한 결과를 거절하는 새 정의다(본문에 record_purged_at · record_deleted_at 확인이 있다)',
      case when pg_get_functiondef('public.pair_join(text,uuid,uuid,text)'::regprocedure) ~ 'record_purged_at'
            and pg_get_functiondef('public.pair_join(text,uuid,uuid,text)'::regprocedure) ~ 'record_deleted_at'
            and pg_get_functiondef('public.pair_join(text,uuid,uuid,text)'::regprocedure) ~* 'for share' then 'OK' else '이상' end, ''),
    (5, '쌍 · 분석 결과 행 수(적용 전과 같아야 한다)', '참고',
      'pairs ' || (select count(*) from public.pairs) || ' · assessments ' || (select count(*) from public.assessments)),
    (6, '삭제 완료 · 삭제 표시 기록 수(적용 전과 같아야 한다)', '참고',
      '삭제 완료 ' || (select count(*) from public.assessments where record_purged_at is not null) || ' · 삭제 표시 ' || (select count(*) from public.assessments where record_deleted_at is not null)),
    (7, '29번 함수 delete_assessment_record_v2는 그대로다(서버만 실행, 브라우저 불가)',
      case when has_function_privilege('service_role', 'public.delete_assessment_record_v2(uuid,uuid)', 'execute') and not has_function_privilege('anon', 'public.delete_assessment_record_v2(uuid,uuid)', 'execute') and not has_function_privilege('authenticated', 'public.delete_assessment_record_v2(uuid,uuid)', 'execute') then 'OK' else '이상' end, ''),
    (8, '쌍 표는 여전히 브라우저가 읽을 수 없다(24번과 같다 — 행 단위 보안(RLS) 켬 · 정책 없음. Supabase는 새 표에 브라우저 역할의 기본 권한이 붙지만 정책이 없으면 한 줄도 보이지 않는다)',
      case when (select relrowsecurity from pg_class where oid = 'public.pairs'::regclass) and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pairs') then 'OK' else '이상' end, '')
  ) as v(no, item, verdict, detail)
)
select no as "번호", item as "항목", verdict as "판정", detail as "내용" from r
union all
select 99, '종합', case when exists (select 1 from r where verdict not in ('OK', '참고')) then '이상 — 결과를 그대로 알려 달라' else 'OK — 30번이 적용됐다' end, '이상 ' || (select count(*) from r where verdict not in ('OK', '참고')) || '개'
order by 1;
