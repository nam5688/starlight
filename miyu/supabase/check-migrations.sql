-- ME:U(미유) DB 변경 적용 여부 확인 — 읽기만 한다 (아무것도 만들거나 바꾸거나 지우지 않는다).
--
-- 사용: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용을 붙여넣고 Run.
-- 결과 표의 "상태"가 "아직 안 함"인 번호만, 번호 순서대로 실행하면 된다 (supabase/migrations 폴더의 같은 번호 파일).
-- "적용됨"인 파일은 다시 실행하지 않는다.
--
-- 주의: 이 확인은 각 파일이 만드는 대표 항목(표 · 열 · 함수 · 권한)이 있는지 본다. 파일을 중간까지만 실행한 경우처럼
--       애매한 상태는 "일부만"으로 표시한다 — 그럴 때는 임의로 다시 실행하지 말고 이 결과 표를 그대로 알려 달라.

with
t as (
  select
    to_regclass('public.profiles')            is not null as profiles,
    to_regclass('public.assessments')         is not null as assessments,
    to_regclass('public.user_regions')        is not null as user_regions,
    to_regclass('public.orders')              is not null as orders,
    to_regclass('public.payment_events')      is not null as payment_events,
    to_regclass('public.reports')             is not null as reports,
    to_regclass('public.user_consents')       is not null as user_consents,
    to_regclass('public.personal_contexts')   is not null as personal_contexts,
    to_regclass('public.ops_events')          is not null as ops_events,
    to_regclass('public.ai_usage')            is not null as ai_usage,
    to_regclass('public.funnel_events')       is not null as funnel_events,
    to_regclass('public.report_feedback')     is not null as report_feedback,
    to_regclass('public.concern_records')     is not null as concern_records,
    to_regclass('public.talk_rooms')          is not null as talk_rooms,
    to_regclass('public.chat_questions')      is not null as chat_questions,
    to_regclass('public.cash_wallets')        is not null as cash_wallets,
    to_regclass('public.cash_ledger')         is not null as cash_ledger,
    to_regclass('public.chat_summaries')      is not null as chat_summaries
),
wd as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'    and column_name = 'withdrawn_at') as profile_col,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'withdrawn_at') as assessment_col,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'withdraw_member_data') as fn
),
-- 11번: 탈퇴 함수가 고민 기록 삭제를 포함하도록 갱신됐는가
wd11 as (
  select coalesce((select bool_or(pg_get_functiondef(p.oid) like '%concern_records%')
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as fn_updated
),
-- 12번: 탈퇴 함수가 대화 삭제를 포함하도록 갱신됐는가
wd12 as (
  select coalesce((select bool_or(pg_get_functiondef(p.oid) like '%talk_rooms%')
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as fn_updated
),
-- 14번: 방 요약 위치 열 · 탈퇴 함수가 채팅 요약 삭제를 포함하도록 갱신됐는가
wd14 as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'talk_rooms' and column_name = 'saved_upto') as saved_col,
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%chat_summaries%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as fn_updated
),
-- 13번: 캐시 함수 · 충전 트리거 · 탈퇴 함수가 캐시 잔액 확인을 포함하도록 갱신됐는가
wd13 as (
  select
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%cash_wallets%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as fn_updated,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'spend_cash') as spend_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'restore_cash_spend') as restore_fn,
    exists (select 1 from pg_trigger g where g.tgname = 'orders_cash_change' and not g.tgisinternal) as trigger_ok
),
-- 15번: 운영자 수동 질문 반영 함수
wd15 as (
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_credit_question') as fn
),
col as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_env')  as payment_env,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'acq_source')   as acq_source
),
fn as (
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'ai_cost_since') as ai_cost_since
),
-- 3번: 프로필이 빠진 회원이 없고, 서버가 프로필을 만들 수 있는 권한이 있는가 (profiles 표가 있을 때만 센다)
missing_profiles as (
  select case
    when to_regclass('public.profiles') is null then null
    else (xpath('/row/c/text()', query_to_xml('select count(*) as c from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)', false, true, '')))[1]::text::int
  end as n
),
grants as (
  select case
    when to_regclass('public.profiles') is null then null
    else has_table_privilege('service_role', 'public.profiles', 'insert')
  end as profiles_insert
),
-- 6번: 결제 기록 출처에 reconcile이 허용되는가
src as (
  select coalesce((select pg_get_constraintdef(c.oid) like '%reconcile%'
                   from pg_constraint c
                   where c.conrelid = to_regclass('public.payment_events') and c.conname = 'payment_events_source_check'), false) as reconcile_ok
)
select * from (
  select 1 as "번호", '20261011000000_init.sql' as "파일",
         case when t.profiles and t.assessments and t.user_regions and t.orders and t.payment_events and t.reports then '적용됨'
              when t.profiles or t.assessments or t.user_regions or t.orders or t.payment_events or t.reports then '일부만' else '아직 안 함' end as "상태",
         '표 6개: profiles, assessments, user_regions, orders, payment_events, reports' as "확인한 것"
  from t
  union all
  select 2, '20261012000000_consents.sql',
         case when t.user_consents then '적용됨' else '아직 안 함' end,
         '표 user_consents'
  from t
  union all
  select 3, '20261013000000_profile_backfill.sql',
         case when mp.n is null then '아직 안 함 (1번 먼저)'
              when mp.n = 0 and g.profiles_insert then '적용됨'
              when mp.n = 0 and not g.profiles_insert then '아직 안 함'
              else '아직 안 함' end,
         '프로필 없는 회원 ' || coalesce(mp.n::text, '-') || '명 / 서버의 프로필 생성 권한 ' || coalesce(g.profiles_insert::text, '-')
  from missing_profiles mp, grants g
  union all
  select 4, '20261014000000_payment_env.sql',
         case when col.payment_env then '적용됨' else '아직 안 함' end,
         '주문의 payment_env 열'
  from col
  union all
  select 5, '20261015000000_personal_context.sql',
         case when t.personal_contexts then '적용됨' else '아직 안 함' end,
         '표 personal_contexts'
  from t
  union all
  select 6, '20261016000000_ops_events.sql',
         case when t.ops_events and src.reconcile_ok then '적용됨'
              when t.ops_events or src.reconcile_ok then '일부만' else '아직 안 함' end,
         '표 ops_events / 결제 기록 출처에 reconcile 허용: ' || src.reconcile_ok::text
  from t, src
  union all
  select 7, '20261017000000_ai_usage.sql',
         case when t.ai_usage then '적용됨' else '아직 안 함' end,
         '표 ai_usage'
  from t
  union all
  select 8, '20261018000000_funnel_feedback.sql',
         case when t.funnel_events and t.report_feedback and col.acq_source then '적용됨'
              when t.funnel_events or t.report_feedback or col.acq_source then '일부만' else '아직 안 함' end,
         '표 funnel_events, report_feedback / 주문의 acq_source 열'
  from t, col
  union all
  select 9, '20261019000000_performance.sql',
         case when fn.ai_cost_since then '적용됨' else '아직 안 함' end,
         '함수 ai_cost_since'
  from fn
  union all
  select 10, '20261020000000_account_withdrawal.sql',
         case when wd.profile_col and wd.assessment_col and wd.fn then '적용됨'
              when wd.profile_col or wd.assessment_col or wd.fn then '일부만' else '아직 안 함' end,
         '프로필 · 검사의 withdrawn_at 열 / 함수 withdraw_member_data'
  from wd
  union all
  select 11, '20261021000000_concern_records.sql',
         case when t.concern_records and wd11.fn_updated then '적용됨'
              when t.concern_records or wd11.fn_updated then '일부만' else '아직 안 함' end,
         '표 concern_records / 탈퇴 함수에 고민 기록 삭제 포함: ' || wd11.fn_updated::text
  from t, wd11
  union all
  select 12, '20261022000000_talk_rooms.sql',
         case when t.talk_rooms and t.chat_questions and wd12.fn_updated then '적용됨'
              when t.talk_rooms or t.chat_questions or wd12.fn_updated then '일부만' else '아직 안 함' end,
         '표 talk_rooms, chat_questions / 탈퇴 함수에 대화 삭제 포함: ' || wd12.fn_updated::text
  from t, wd12
  union all
  select 13, '20261023000000_miyu_cash.sql',
         case when t.cash_wallets and t.cash_ledger and wd13.spend_fn and wd13.restore_fn and wd13.trigger_ok and wd13.fn_updated then '적용됨'
              when t.cash_wallets or t.cash_ledger or wd13.spend_fn or wd13.restore_fn or wd13.trigger_ok or wd13.fn_updated then '일부만' else '아직 안 함' end,
         '표 cash_wallets, cash_ledger / 함수 spend_cash, restore_cash_spend / 주문 결제 완료 때 충전하는 트리거 / 탈퇴 함수에 캐시 잔액 확인 포함: ' || wd13.fn_updated::text
  from t, wd13
  union all
  select 14, '20261024000000_chat_summaries.sql',
         case when t.chat_summaries and wd14.saved_col and wd14.fn_updated then '적용됨'
              when t.chat_summaries or wd14.saved_col or wd14.fn_updated then '일부만' else '아직 안 함' end,
         '표 chat_summaries / 열 talk_rooms.saved_upto: ' || wd14.saved_col::text || ' / 탈퇴 함수에 채팅 요약 삭제 포함: ' || wd14.fn_updated::text
  from t, wd14
  union all
  select 15, '20261025000000_admin_credit_question.sql',
         case when wd15.fn then '적용됨' else '아직 안 함' end,
         '함수 admin_credit_question (결제사 확인 뒤 운영자가 질문 1개를 넣는 함수)'
  from wd15
) r
order by "번호";
