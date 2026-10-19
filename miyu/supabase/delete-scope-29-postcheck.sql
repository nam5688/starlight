-- ME:U(미유) DB 변경 29번(기록 삭제 범위 확대) — 적용 뒤 확인 (읽기 전용: 아무것도 만들거나 바꾸거나 지우지 않는다)
--
-- 사용: 29번(supabase/migrations/20261108000000_record_delete_scope.sql)을 실행한 직후 같은 프로젝트의 SQL Editor에서 이 파일을 붙여넣고 Run. "종합"이 OK여야 한다.
-- 29번을 적용하는 것만으로는 어떤 데이터도 지워지거나 바뀌지 않는다 — 번호 9~12의 숫자가 delete-scope-29-precheck.sql에서 적어 둔 숫자와 같은지 비교한다.
-- 앱이 새 삭제 범위를 쓰는지(MY 확인창 문구가 "채팅방과 나눈 대화, 저장한 채팅 요약도 삭제"로 바뀌는지)는 이 파일이 아니라 화면으로 따로 확인한다 — 앱은 최대 20초 뒤에 새 함수를 알아본다.
-- 확인창에서 실제로 "삭제하기"를 눌러 보는 것은 가상 계정의 가상 기록으로만 한다(실제 사용자 기록을 삭제하지 않는다).

with
r as (
  select * from (values
    (1, '열 assessments.record_purged_at 생성 · 모든 행이 비어 있다(적용만으로는 어떤 기록도 삭제 완료로 바뀌지 않는다)',
      case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'record_purged_at')
            and (select count(*) from public.assessments where record_purged_at is not null) = 0 then 'OK' else '이상' end, ''),
    (2, '함수 delete_assessment_record_v2(uuid, uuid): 서버 역할만 실행(anon · authenticated · public 불가)',
      case when has_function_privilege('service_role', 'public.delete_assessment_record_v2(uuid,uuid)', 'execute')
            and not has_function_privilege('anon', 'public.delete_assessment_record_v2(uuid,uuid)', 'execute')
            and not has_function_privilege('authenticated', 'public.delete_assessment_record_v2(uuid,uuid)', 'execute')
            and not exists (select 1 from pg_proc where oid = 'public.delete_assessment_record_v2(uuid,uuid)'::regprocedure and coalesce(proacl::text, '') ~ '(^\{|,)=') then 'OK' else '이상' end, ''),
    (3, '트리거 함수 block_write_on_purged_record(): 아무도 직접 실행하지 못한다(트리거로만 동작)',
      case when not has_function_privilege('anon', 'public.block_write_on_purged_record()', 'execute') and not has_function_privilege('authenticated', 'public.block_write_on_purged_record()', 'execute')
            and not exists (select 1 from pg_proc where oid = 'public.block_write_on_purged_record()'::regprocedure and coalesce(proacl::text, '') ~ '(^\{|,)=') then 'OK' else '이상' end, ''),
    (4, '대화 쓰기 차단 장치 4개가 켜져 있다 — talk_rooms(넣기 · 고치기) · chat_summaries · talk_transcripts · chat_questions(넣기)',
      case when (select count(*) from pg_trigger where tgname in ('talk_rooms_block_purged', 'chat_summaries_block_purged', 'talk_transcripts_block_purged', 'chat_questions_block_purged') and tgenabled = 'O') = 4 then 'OK' else '이상' end,
      (select coalesce(string_agg(tgname || ':' || tgenabled::text, ' / ' order by tgname), '없음') from pg_trigger where tgname like '%block_purged')),
    (5, '28번 함수 delete_assessment_record는 그대로다(실행 권한: 서버만, 브라우저 불가)',
      case when has_function_privilege('service_role', 'public.delete_assessment_record(uuid,uuid,jsonb)', 'execute') and not has_function_privilege('anon', 'public.delete_assessment_record(uuid,uuid,jsonb)', 'execute') and not has_function_privilege('authenticated', 'public.delete_assessment_record(uuid,uuid,jsonb)', 'execute') then 'OK' else '이상' end, ''),
    (6, '새 함수가 응답한다 — 빈 인자는 아무것도 건드리지 않고 not_found를 돌려준다(앱이 함수가 있는지 확인하는 방식과 같다)',
      case when public.delete_assessment_record_v2(null, null) = 'not_found' then 'OK' else '이상' end, ''),
    (7, '표 권한은 바뀌지 않았다 — 29번은 새 표를 만들지 않는다. 회원(authenticated)은 talk_rooms 등을 직접 쓸 수 없다',
      case when not has_table_privilege('authenticated', 'public.talk_rooms', 'insert') and not has_table_privilege('authenticated', 'public.chat_summaries', 'insert') and not has_table_privilege('authenticated', 'public.talk_transcripts', 'insert') and not has_table_privilege('anon', 'public.chat_questions', 'select') then 'OK' else '이상' end, ''),
    (8, '회원이 삭제 완료 표시 열을 직접 바꿀 수 없다(분석 결과 표의 쓰기 권한)',
      case when not has_column_privilege('authenticated', 'public.assessments', 'record_purged_at', 'update') and not has_column_privilege('anon', 'public.assessments', 'record_purged_at', 'update') then 'OK' else '이상' end, ''),
    (9, '대화 내용이 들어 있는 표의 행 수 — 적용 전 숫자와 같아야 한다', '참고',
      'talk_rooms ' || (select count(*) from public.talk_rooms) || ' · chat_summaries ' || (select count(*) from public.chat_summaries) || ' · talk_transcripts ' || (select count(*) from public.talk_transcripts)),
    (10, '사용 이력 표의 행 수 — 적용 전 숫자와 같아야 한다', '참고',
      'chat_questions ' || (select count(*) from public.chat_questions) || ' · cash_ledger ' || (select count(*) from public.cash_ledger)),
    (11, '주문 · 리포트 · 맛보기 행 수 — 적용 전 숫자와 같아야 한다', '참고',
      'orders ' || (select count(*) from public.orders) || ' · reports ' || (select count(*) from public.reports) || ' · taste_reports ' || (select count(*) from public.taste_reports)),
    (12, '분석 결과 · 회원 행 수 — 적용 전 숫자와 같아야 한다', '참고',
      'assessments ' || (select count(*) from public.assessments) || ' · profiles ' || (select count(*) from public.profiles)),
    (13, '앱 쪽 확인(이 파일로는 알 수 없다)', '참고',
      'MY의 "기록 삭제" 확인창 문구가 새 범위로 바뀌었는지는 화면으로 본다. 새 함수가 PostgREST에 보이지 않으면 SQL Editor에서  notify pgrst, ''reload schema'';  (읽기 전용이 아니므로 이 파일에는 넣지 않았다)')
  ) as v(no, item, verdict, detail)
)
select no as "번호", item as "항목", verdict as "판정", detail as "내용" from r
union all
select 99, '종합', case when exists (select 1 from r where verdict not in ('OK', '참고')) then '이상 — 결과를 그대로 알려 달라(임의로 다시 실행하지 않는다)' else 'OK — 29번이 적용됐다' end, '이상 ' || (select count(*) from r where verdict not in ('OK', '참고')) || '개'
order by 1;
