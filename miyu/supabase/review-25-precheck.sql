-- ME:U(미유) DB 변경 25번(후기) — 적용 전 확인 (읽기 전용: 아무것도 만들거나 바꾸거나 지우지 않는다)
--
-- 사용: 테스트 전용 Supabase 프로젝트(wdvrwwajakjdfrajgxcm)의 SQL Editor에서 이 파일을 붙여넣고 Run. 결과 표의 "판정"이 모두 "OK"여야 25번을 적용할 수 있다.
--       "막힘"이 하나라도 있으면 25번을 적용하지 말고 이 결과 표를 그대로 알려 달라. "참고"는 정보일 뿐 막지 않는다.
-- 25번은 19~22번(혜택)에 의존하지 않는다 — 후기 표 · 함수 · 탈퇴 트리거 · 방문 단계 이름 검사만 더한다. 혜택(19번)이 없으면 후기 보상(질문권)은 꺼진 것으로 동작한다.

with
fv as (
  select string_agg(distinct name, ', ' order by name) as bad_names, count(*) as bad_rows
  from public.funnel_events
  where name not in ('visit', 'analyze_start', 'analyze_complete', 'preview_view', 'report_view', 'review_section_view', 'review_all_click')
),
rows_ as (
  select * from (values
    -- 필요한 것(있어야 한다)
    (1, '필요: 표 profiles', case when to_regclass('public.profiles') is not null then 'OK' else '막힘' end, '1~3번이 만든다'),
    (2, '필요: 프로필의 withdrawn_at 열', case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'withdrawn_at') then 'OK' else '막힘' end, '10번이 만든다 — 25번의 탈퇴 트리거가 이 열에 반응한다'),
    (3, '필요: 표 funnel_events', case when to_regclass('public.funnel_events') is not null then 'OK' else '막힘' end, '8번이 만든다 — 25번이 이름 검사를 바꾼다'),
    (4, '필요: Supabase Auth 표(auth.users)', case when to_regclass('auth.users') is not null then 'OK' else '막힘' end, '후기 표가 참조한다'),
    (5, '필요: 역할 service_role · authenticated · anon', case when (select count(*) from pg_roles where rolname in ('service_role', 'authenticated', 'anon')) = 3 then 'OK' else '막힘' end, '권한을 주고 거두는 대상'),
    (6, '필요: gen_random_uuid() 사용 가능', case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname = 'gen_random_uuid' and n.nspname in ('pg_catalog', 'public', 'extensions')) then 'OK' else '막힘' end, '후기 번호 기본값'),
    -- 아직 적용돼 있지 않아야 하는 것
    (10, '새로 만들 표 reviews 가 아직 없음', case when to_regclass('public.reviews') is null then 'OK' else '막힘' end, '있으면 25번을 다시 실행하지 않는다 — 결과를 알려 달라'),
    (11, '새로 만들 표 review_admin_log 가 아직 없음', case when to_regclass('public.review_admin_log') is null then 'OK' else '막힘' end, ''),
    (12, '새로 만들 표 review_reports 가 아직 없음', case when to_regclass('public.review_reports') is null then 'OK' else '막힘' end, ''),
    (13, '새로 만들 함수 submit_review_report · review_admin_apply · reviews_on_withdraw 가 아직 없음',
      case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('submit_review_report', 'review_admin_apply', 'reviews_on_withdraw', 'reviews_touch')) then 'OK' else '막힘' end, ''),
    (14, '새로 만들 트리거 profiles_reviews_withdraw 가 아직 없음', case when not exists (select 1 from pg_trigger where tgname = 'profiles_reviews_withdraw' and not tgisinternal) then 'OK' else '막힘' end, ''),
    -- 기존 제약과 부딪히지 않는지
    (20, '기존 제약: funnel_events의 이름이 새 허용 목록(7개) 안에 있음', case when (select bad_rows from fv) = 0 then 'OK' else '막힘' end,
      coalesce('목록 밖 이름 ' || (select bad_names from fv) || ' — 25번의 제약 교체가 실패한다(전체 취소)', '모든 행이 목록 안(현재 ' || (select count(*) from public.funnel_events) || '행)')),
    (21, '참고: funnel_events_name_check 현재 정의', case when exists (select 1 from pg_constraint where conrelid = to_regclass('public.funnel_events') and conname = 'funnel_events_name_check') then 'OK' else '참고' end,
      coalesce((select pg_get_constraintdef(oid) from pg_constraint where conrelid = to_regclass('public.funnel_events') and conname = 'funnel_events_name_check'), '이 이름의 제약이 없다 — 25번이 새로 만든다')),
    -- 참고(막지 않는다)
    (30, '참고: 19번(혜택 설정 표 benefit_settings)', case when to_regclass('public.benefit_settings') is not null then '참고' else '참고' end,
      case when to_regclass('public.benefit_settings') is not null then '있음 — 후기 보상은 혜택 설정(feature.review_reward)이 켜져야 지급' else '없음 — 후기 보상은 꺼진 것으로 동작하고 후기 작성 · 수정 · 삭제는 그대로 된다' end),
    (31, '참고: 23 · 24 · 26 · 28번 적용 여부', '참고',
      'compat_requests ' || (to_regclass('public.compat_requests') is not null)::text || ' · pairs ' || (to_regclass('public.pairs') is not null)::text
        || ' · pairs.relationship ' || exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pairs' and column_name = 'relationship')::text
        || ' · assessments.record_deleted_at ' || exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'record_deleted_at')::text),
    (32, '참고: profiles 행 수 · 아직 탈퇴 표시가 없는 회원', '참고', (select count(*) from public.profiles)::text || '명 · 탈퇴 표시 없음 ' || (select count(*) from public.profiles where withdrawn_at is null)::text || '명 (25번은 기존 회원 데이터를 바꾸지 않는다)')
  ) as v(no, item, verdict, detail)
)
select no as "번호", item as "항목", verdict as "판정", detail as "내용" from rows_
union all
select 99, '종합', case when exists (select 1 from rows_ where verdict = '막힘') then '막힘 — 25번을 적용하지 않는다' else 'OK — 25번을 적용할 수 있다' end, '막힘 ' || (select count(*) from rows_ where verdict = '막힘') || '개'
order by 1;
