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
-- 16번: 질문 묶음 장부 · 부분 환불 반영 함수 · 무료 질문 예약 함수와 열
wd16 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'question_packs') as packs,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'apply_cash_refund') as refund_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_chat_question') as reserve_fn,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chat_questions' and column_name = 'reserved_until') as reserved_col,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cash_ledger' and column_name = 'pack_order_id') as pack_col
),
-- 17번: 맛보기 리포트 표(한 계정당 1번) · 예약 · 저장 · 풀기 함수
wd17 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'taste_reports') as tbl,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_taste_report') as reserve_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'save_taste_report') as save_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'release_taste_report') as release_fn,
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%taste_reports%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as withdraw_fn
),
-- 18번: 초대 링크 · 초대 할인 표와 함수, 탈퇴 함수의 초대 링크 삭제
wd18 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'invites') as invites,
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'invite_discounts') as discounts,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'invite_discount_status') as status_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'claim_invite_discount') as claim_fn,
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%public.invites%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as withdraw_fn
),
-- 19~22번: 혜택 시스템(포인트 · 질문권 · 쿠폰 · 0원 혜택 주문 · 추천 · 비용 · 탈퇴 정리)
wd19 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'benefit_settings') as settings,
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'point_lots') as lots,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'grant_points') as grant_fn
),
wd20 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'coupons') as coupons,
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'benefit_order_grants') as grants,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'grant_benefit_order') as grant_fn
),
wd21 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'referral_signups') as signups,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'register_referral_signup') as register_fn,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'claim_referral_discount') as claim_fn
),
wd22 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'benefit_expenses') as expenses,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_usage' and column_name = 'request_key') as request_key,
    coalesce((select bool_or(pg_get_functiondef(p.oid) like '%forfeit_member_benefits%')
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'withdraw_member_data'), false) as withdraw_fn
),
wd23 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'compat_requests') as requests,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'scrub_compat_request') as scrub_fn,
    exists (select 1 from pg_trigger where tgname = 'profiles_compat_withdraw' and not tgisinternal) as withdraw_trigger,
    coalesce((select has_table_privilege('service_role', 'public.compat_requests', 'insert') from information_schema.tables where table_schema = 'public' and table_name = 'compat_requests'), false) as service_grant
),
wd24 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'pairs') as pairs,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'pair_join') as join_fn,
    exists (select 1 from pg_trigger where tgname = 'profiles_pairs_withdraw' and not tgisinternal) as withdraw_trigger,
    exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'orders_one_paid_pair') as one_paid,
    coalesce((select has_table_privilege('service_role', 'public.pairs', 'insert') from information_schema.tables where table_schema = 'public' and table_name = 'pairs'), false) as service_grant
),
wd25 as (
  select
    exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'reviews') as reviews,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'review_admin_apply') as admin_fn,
    exists (select 1 from pg_trigger where tgname = 'profiles_reviews_withdraw' and not tgisinternal) as withdraw_trigger,
    exists (select 1 from pg_constraint where conname = 'funnel_events_name_check' and pg_get_constraintdef(oid) like '%review_section_view%') as funnel_names,
    coalesce((select has_table_privilege('service_role', 'public.reviews', 'insert') from information_schema.tables where table_schema = 'public' and table_name = 'reviews'), false) as service_grant
),
wd26 as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pairs' and column_name = 'relationship') as relationship_col
),
wd27 as (
  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'my_hidden_at') as hidden_col,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_assessment_my_hidden') as hide_fn,
    coalesce(has_function_privilege('service_role', 'public.set_assessment_my_hidden(uuid, uuid, boolean)', 'execute'), false) as service_grant
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
         '함수 admin_credit_question (결제사 확인 뒤 운영자가 주문에 적힌 만큼 질문을 넣는 함수)'
  from wd15
  union all
  select 16, '20261026000000_question_packs.sql',
         case when wd16.packs and wd16.refund_fn and wd16.reserve_fn and wd16.reserved_col and wd16.pack_col then '적용됨'
              when wd16.packs or wd16.refund_fn or wd16.reserve_fn or wd16.reserved_col or wd16.pack_col then '일부만' else '아직 안 함' end,
         '표 question_packs (묶음별 사용 · 환불 장부) / 함수 apply_cash_refund (부분 환불 반영) · reserve_chat_question (무료 질문 한도를 DB에서 보장) / 열 chat_questions.reserved_until: ' || wd16.reserved_col::text
  from wd16
  union all
  select 17, '20261027000000_taste_reports.sql',
         case when wd17.tbl and wd17.reserve_fn and wd17.save_fn and wd17.release_fn and wd17.withdraw_fn then '적용됨'
              when wd17.tbl or wd17.reserve_fn or wd17.save_fn or wd17.release_fn or wd17.withdraw_fn then '일부만' else '아직 안 함' end,
         '표 taste_reports (맛보기 리포트 · 회원 한 명당 한 줄) / 함수 reserve_taste_report · save_taste_report · release_taste_report / 탈퇴 함수에 맛보기 리포트 삭제 포함: ' || wd17.withdraw_fn::text
  from wd17
  union all
  select 18, '20261028000000_invites.sql',
         case when wd18.invites and wd18.discounts and wd18.status_fn and wd18.claim_fn and wd18.withdraw_fn then '적용됨'
              when wd18.invites or wd18.discounts or wd18.status_fn or wd18.claim_fn or wd18.withdraw_fn then '일부만' else '아직 안 함' end,
         '표 invites (초대 링크) · invite_discounts (초대 할인 기록) / 함수 invite_discount_status · claim_invite_discount / 탈퇴 함수에 초대 링크 삭제 포함: ' || wd18.withdraw_fn::text
  from wd18
  union all
  select 19, '20261029000000_benefits_core.sql',
         case when wd19.settings and wd19.lots and wd19.grant_fn then '적용됨'
              when wd19.settings or wd19.lots or wd19.grant_fn then '일부만' else '아직 안 함' end,
         '표 benefit_settings (혜택 설정 · 모두 꺼진 채로 시작) · point_lots (포인트 묶음) / 함수 grant_points · 질문권 장부 함수'
  from wd19
  union all
  select 20, '20261030000000_coupons_free_orders.sql',
         case when wd20.coupons and wd20.grants and wd20.grant_fn then '적용됨'
              when wd20.coupons or wd20.grants or wd20.grant_fn then '일부만' else '아직 안 함' end,
         '표 coupons · benefit_order_grants / 함수 grant_benefit_order (0원 혜택 주문, 서버가 승인한 혜택만)'
  from wd20
  union all
  select 21, '20261031000000_referrals.sql',
         case when wd21.signups and wd21.register_fn and wd21.claim_fn then '적용됨'
              when wd21.signups or wd21.register_fn or wd21.claim_fn then '일부만' else '아직 안 함' end,
         '표 referral_signups (추천 가입) / 함수 register_referral_signup · claim_referral_discount'
  from wd21
  union all
  select 22, '20261101000000_benefit_finance_ai.sql',
         case when wd22.expenses and wd22.request_key and wd22.withdraw_fn then '적용됨'
              when wd22.expenses or wd22.request_key or wd22.withdraw_fn then '일부만' else '아직 안 함' end,
         '표 benefit_expenses (비용 입력) / 열 ai_usage.request_key (질문 한 번의 AI 원가) / 탈퇴 함수에 혜택 정리 포함: ' || wd22.withdraw_fn::text
  from wd22
  union all
  select 23, '20261102000000_compat_requests.sql',
         case when wd23.requests and wd23.scrub_fn and wd23.withdraw_trigger and wd23.service_grant then '적용됨'
              when wd23.requests or wd23.scrub_fn or wd23.withdraw_trigger or wd23.service_grant then '일부만' else '아직 안 함' end,
         '표 compat_requests (사주 궁합 상대 입력 · 리포트 완성 · 환불 · 탈퇴 때 지움) / 함수 scrub_compat_request / 탈퇴 시 지우는 트리거: ' || wd23.withdraw_trigger::text || ' / 서버 권한: ' || wd23.service_grant::text
  from wd23
  union all
  select 24, '20261103000000_pair_reports.sql',
         case when wd24.pairs and wd24.join_fn and wd24.withdraw_trigger and wd24.one_paid and wd24.service_grant then '적용됨'
              when wd24.pairs or wd24.join_fn or wd24.withdraw_trigger or wd24.one_paid or wd24.service_grant then '일부만' else '아직 안 함' end,
         '표 pairs (리포트 궁합 쌍 · 동의 · 해제 · 철회) / 함수 pair_join · pair_withdraw_consent · pair_unlink / 탈퇴 시 쌍을 끊는 트리거: ' || wd24.withdraw_trigger::text || ' / 쌍마다 결제 완료 주문 하나(고유 조건): ' || wd24.one_paid::text || ' / 서버 권한: ' || wd24.service_grant::text
  from wd24
  union all
  select 25, '20261104000000_reviews.sql',
         case when wd25.reviews and wd25.admin_fn and wd25.withdraw_trigger and wd25.funnel_names and wd25.service_grant then '적용됨'
              when wd25.reviews or wd25.admin_fn or wd25.withdraw_trigger or wd25.funnel_names or wd25.service_grant then '일부만' else '아직 안 함' end,
         '표 reviews (이용 후기 · 보상 한 번 · 삭제는 묘비) · review_admin_log · review_reports / 함수 review_admin_apply · submit_review_report / 탈퇴 시 후기를 지우는 트리거: ' || wd25.withdraw_trigger::text || ' / 방문 단계 이름에 후기 이벤트 포함: ' || wd25.funnel_names::text || ' / 서버 권한: ' || wd25.service_grant::text
  from wd25
  union all
  select 26, '20261105000000_pair_relationship.sql',
         case when wd26.relationship_col then '적용됨' else '아직 안 함' end,
         '표 pairs의 사이(relationship) 열 — 리포트 궁합 새 초대에만 필요하다. 이 열이 없으면 새 초대 만들기만 준비 중으로 멈추고 기존 쌍 · 개인 리포트 · 무료 궁합 · 사주 궁합은 그대로 동작한다: ' || wd26.relationship_col::text
  from wd26
  union all
  select 27, '20261106000000_my_report_hide.sql',
         case when wd27.hidden_col and wd27.hide_fn and wd27.service_grant then '적용됨'
              when wd27.hidden_col or wd27.hide_fn or wd27.service_grant then '일부만' else '아직 안 함' end,
         '열 assessments.my_hidden_at (MY 목록에서 숨긴 시각) / 함수 set_assessment_my_hidden (본인 것만 숨기기 · 다시 보이게 하기) / 서버 권한: ' || wd27.service_grant::text || ' — 이 열이 없으면 MY의 숨기기 버튼만 보이지 않고 나머지는 그대로 동작한다'
  from wd27
) r
order by "번호";
