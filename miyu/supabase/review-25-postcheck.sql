-- ME:U(미유) DB 변경 25번(후기) — 적용 뒤 확인 (읽기 전용: 아무것도 만들거나 바꾸거나 지우지 않는다)
--
-- 사용: 25번(supabase/apply-25-reviews.sql)을 실행한 직후, 같은 테스트 전용 프로젝트의 SQL Editor에서 이 파일을 붙여넣고 Run. "판정"이 모두 "OK"여야 한다.
-- 앱이 후기 화면을 열 수 있는지(PostgREST가 새 표를 알아보는지)는 이 파일이 아니라 앱 화면 · API 목록으로 따로 확인한다 — 마지막 "참고" 줄의 안내를 본다.

with
r as (
  select * from (values
    (1, '표 reviews · review_admin_log · review_reports 생성',
      case when to_regclass('public.reviews') is not null and to_regclass('public.review_admin_log') is not null and to_regclass('public.review_reports') is not null then 'OK' else '이상' end, ''),
    (2, '세 표 모두 행 단위 접근 제한(RLS) 켜짐',
      case when (select count(*) from pg_class where oid in (to_regclass('public.reviews'), to_regclass('public.review_admin_log'), to_regclass('public.review_reports')) and relrowsecurity) = 3 then 'OK' else '이상' end, ''),
    (3, '정책: reviews는 본인 조회 정책 하나, 나머지 두 표는 정책 없음(서버만)',
      case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'reviews') = 1
            and (select count(*) from pg_policies where schemaname = 'public' and tablename in ('review_admin_log', 'review_reports')) = 0 then 'OK' else '이상' end,
      (select coalesce(string_agg(tablename || ':' || policyname, ' / '), '없음') from pg_policies where schemaname = 'public' and tablename in ('reviews', 'review_admin_log', 'review_reports'))),
    (4, '권한: anon은 세 표에 아무 권한도 없다',
      case when not (has_table_privilege('anon', 'public.reviews', 'select') or has_table_privilege('anon', 'public.review_admin_log', 'select') or has_table_privilege('anon', 'public.review_reports', 'select')
                  or has_table_privilege('anon', 'public.reviews', 'insert')) then 'OK' else '이상' end, ''),
    (5, '권한: authenticated는 reviews를 조회만(쓰기 없음), 나머지 두 표는 권한 없음',
      case when has_table_privilege('authenticated', 'public.reviews', 'select') and not has_table_privilege('authenticated', 'public.reviews', 'insert') and not has_table_privilege('authenticated', 'public.reviews', 'update') and not has_table_privilege('authenticated', 'public.reviews', 'delete')
            and not has_table_privilege('authenticated', 'public.review_admin_log', 'select') and not has_table_privilege('authenticated', 'public.review_reports', 'select') then 'OK' else '이상' end, ''),
    (6, '권한: service_role은 reviews 읽기 · 쓰기 · 지우기, 이력은 읽기 · 쌓기, 신고는 읽기 · 쌓기 · 갱신',
      case when has_table_privilege('service_role', 'public.reviews', 'select') and has_table_privilege('service_role', 'public.reviews', 'insert') and has_table_privilege('service_role', 'public.reviews', 'update') and has_table_privilege('service_role', 'public.reviews', 'delete')
            and has_table_privilege('service_role', 'public.review_admin_log', 'insert') and has_table_privilege('service_role', 'public.review_reports', 'update') then 'OK' else '이상' end, ''),
    (7, '함수 submit_review_report · review_admin_apply: service_role만 실행(anon · authenticated · public 불가)',
      case when has_function_privilege('service_role', 'public.submit_review_report(uuid,text,text)', 'execute') and has_function_privilege('service_role', 'public.review_admin_apply(uuid,text,text,text,uuid)', 'execute')
            and not has_function_privilege('anon', 'public.submit_review_report(uuid,text,text)', 'execute') and not has_function_privilege('authenticated', 'public.submit_review_report(uuid,text,text)', 'execute')
            and not has_function_privilege('anon', 'public.review_admin_apply(uuid,text,text,text,uuid)', 'execute') and not has_function_privilege('authenticated', 'public.review_admin_apply(uuid,text,text,text,uuid)', 'execute') then 'OK' else '이상' end, ''),
    (8, '탈퇴 트리거 profiles_reviews_withdraw (프로필 withdrawn_at 갱신 뒤) 있음 · 함수는 외부 실행 불가',
      case when exists (select 1 from pg_trigger where tgname = 'profiles_reviews_withdraw' and not tgisinternal) and not has_function_privilege('authenticated', 'public.reviews_on_withdraw()', 'execute') and not has_function_privilege('anon', 'public.reviews_on_withdraw()', 'execute') then 'OK' else '이상' end, ''),
    (9, '방문 단계 이름 검사가 7개 나열형으로 바뀜(결제 이벤트 같은 이름은 계속 거절)',
      case when (select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('public.funnel_events') and conname = 'funnel_events_name_check') like '%review_section_view%'
            and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('public.funnel_events') and conname = 'funnel_events_name_check') like '%review_all_click%'
            and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('public.funnel_events') and conname = 'funnel_events_name_check') not like '%payment%' then 'OK' else '이상' end,
      coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('public.funnel_events') and conname = 'funnel_events_name_check'), '제약 없음')),
    (10, '아무 후기도 만들어지지 않았다(적용만으로는 아무것도 생기지 않는다)',
      case when (select count(*) from public.reviews) = 0 and (select count(*) from public.review_admin_log) = 0 and (select count(*) from public.review_reports) = 0 then 'OK' else '이상' end,
      'reviews ' || (select count(*) from public.reviews) || ' · 이력 ' || (select count(*) from public.review_admin_log) || ' · 신고 ' || (select count(*) from public.review_reports)),
    (11, '기존 데이터가 그대로다(프로필 · 방문 단계 행 수 — 적용 전에 저장해 둔 값과 비교)', '참고',
      'profiles ' || (select count(*) from public.profiles) || ' · funnel_events ' || (select count(*) from public.funnel_events)),
    (12, '앱 쪽 확인(이 파일로는 알 수 없다)', '참고',
      '앱이 /my/reviews에서 "후기 준비 중"이 사라졌는지 확인한다. 그래도 남으면 PostgREST 스키마 캐시를 다시 읽게 한다: SQL Editor에서  notify pgrst, ''reload schema'';  (읽기 전용이 아니므로 이 파일에는 넣지 않았다)')
  ) as v(no, item, verdict, detail)
)
select no as "번호", item as "항목", verdict as "판정", detail as "내용" from r
union all
select 99, '종합', case when exists (select 1 from r where verdict = '이상') then '이상 — 결과를 그대로 알려 달라(임의로 다시 실행하지 않는다)' else 'OK — 25번이 적용됐다' end, '이상 ' || (select count(*) from r where verdict = '이상') || '개'
order by 1;
