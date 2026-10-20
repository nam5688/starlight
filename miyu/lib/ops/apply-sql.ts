// DB 변경(마이그레이션) 여러 개를 SQL Editor에서 한 번에 실행할 수 있는 한 파일로 묶는다.
// - 마이그레이션 파일은 한 글자도 고치지 않고 그대로 이어 붙인다 (이미 적용한 파일을 고치지 않는 규칙).
// - 시작할 때 조건을 확인한다: 앞 번호(1~3)가 적용돼 있고, 묶은 번호(4~10)가 하나도 적용돼 있지 않아야 한다. 아니면 아무것도 바꾸지 않고 멈춘다.
// - 전체를 하나의 트랜잭션으로 감싸서, 중간에 오류가 나면 이 파일이 한 일이 모두 취소된다 (일부만 적용되지 않는다).
// - 마지막에 읽기 전용 확인 조회를 붙여 4~10번이 "적용됨"인지 바로 보여 준다.
// 이 함수는 문자열만 다룬다 (파일을 읽고 쓰는 것은 scripts/render-apply-sql.ts).

export type MigrationFile = { name: string; sql: string };

/** 묶은 파일의 시작 조건: 이미 적용돼 있으면 안 되는 대표 항목(번호별). check-migrations.sql과 같은 기준이다 */
const ALREADY_APPLIED_CHECKS = [
  { no: 4, label: "주문의 payment_env 열", sql: "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_env')" },
  { no: 5, label: "표 personal_contexts", sql: "to_regclass('public.personal_contexts') is not null" },
  { no: 6, label: "표 ops_events", sql: "to_regclass('public.ops_events') is not null" },
  {
    no: 6,
    label: "결제 기록 출처에 reconcile 허용",
    sql: "coalesce((select pg_get_constraintdef(c.oid) like '%reconcile%' from pg_constraint c where c.conrelid = to_regclass('public.payment_events') and c.conname = 'payment_events_source_check'), false)",
  },
  { no: 7, label: "표 ai_usage", sql: "to_regclass('public.ai_usage') is not null" },
  { no: 8, label: "표 funnel_events", sql: "to_regclass('public.funnel_events') is not null" },
  { no: 8, label: "표 report_feedback", sql: "to_regclass('public.report_feedback') is not null" },
  { no: 8, label: "주문의 acq_source 열", sql: "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'acq_source')" },
  { no: 9, label: "함수 ai_cost_since", sql: "exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'ai_cost_since')" },
  { no: 10, label: "프로필의 withdrawn_at 열", sql: "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'withdrawn_at')" },
  { no: 10, label: "검사의 withdrawn_at 열", sql: "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'withdrawn_at')" },
  { no: 10, label: "함수 withdraw_member_data", sql: "exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'withdraw_member_data')" },
] as const;

/** 앞 번호(1~2번)가 만드는 표 — 있어야 4~10번이 이어서 실행된다 */
const REQUIRED_TABLES = ["profiles", "assessments", "user_regions", "orders", "payment_events", "reports", "user_consents"] as const;

function preconditionBlock(range: string): string {
  const checks = ALREADY_APPLIED_CHECKS.map((c) => `  if ${c.sql} then present := present || '${c.no}번 (${c.label})'::text; end if;`).join("\n");
  return `do $check$
declare
  missing text[] := '{}';
  present text[] := '{}';
  t text;
begin
  -- 1) 앞 번호(1~2번)가 만드는 표가 있어야 한다
  foreach t in array array[${REQUIRED_TABLES.map((x) => `'${x}'`).join(", ")}] loop
    if to_regclass('public.' || t) is null then missing := missing || t; end if;
  end loop;
  if cardinality(missing) > 0 then
    raise exception '시작 조건 불충족 — 1~2번에서 만드는 표가 없습니다: %. 아무것도 바꾸지 않았습니다. 이 파일을 실행하지 말고, 먼저 check-migrations.sql 결과를 알려 주세요.', array_to_string(missing, ', ');
  end if;

  -- 2) ${range}번이 하나라도 이미 적용돼 있으면 멈춘다 (일부만 적용된 상태에서 다시 실행하지 않기 위해)
${checks}
  if cardinality(present) > 0 then
    raise exception '시작 조건 불충족 — ${range}번 중 이미 적용된 것이 있습니다: %. 아무것도 바꾸지 않았습니다. 이 파일을 다시 실행하지 말고, check-migrations.sql 결과 표를 그대로 알려 주세요.', array_to_string(present, ' / ');
  end if;
end
$check$;`;
}

/**
 * @param migrations 묶을 마이그레이션(번호 순서). 파일 이름은 앞 14자리가 버전이고 번호는 목록 순서로 4부터 센다 — 호출하는 쪽이 4~10번만 넘긴다.
 * @param checkSql 마지막에 붙일 읽기 전용 확인 조회 (supabase/check-migrations.sql)
 */
export function buildApplySql(opts: { migrations: MigrationFile[]; checkSql: string; firstNo: number }): string {
  const { migrations, checkSql, firstNo } = opts;
  const lastNo = firstNo + migrations.length - 1;
  const range = `${firstNo}~${lastNo}`;
  const body = migrations
    .map((m, i) => `-- ═════════════════════════════════════════════════════════════════
-- ${firstNo + i}번: ${m.name}   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
${m.sql.trimEnd()}
`)
    .join("\n");
  return `-- ME:U(미유) DB 변경 ${range}번 — SQL Editor에서 한 번에 실행하는 통합 파일
--
-- 이 파일은 supabase/migrations의 ${range}번 파일을 한 글자도 고치지 않고 이어 붙인 것이다.
-- (scripts/render-apply-sql.ts가 만든다 — 직접 고치지 않는다. 내용이 바뀌면 서버 테스트가 알려 준다.)
--
-- 사용: Supabase 대시보드 → SQL Editor → New query → 이 파일 내용을 모두 붙여넣고 Run (한 번만).
--
-- 안전장치
--  1) 시작할 때 조건을 확인한다: 1~2번이 만드는 표가 있고, ${range}번이 하나도 적용돼 있지 않아야 한다.
--     아니면 아무것도 바꾸지 않고 "시작 조건 불충족" 오류로 멈춘다. (이미 한 번 실행한 뒤 다시 실행해도 여기서 멈춘다 — 문제가 아니다.)
--  2) 전체가 하나의 트랜잭션(begin ... commit)이다. 중간에 오류가 나면 이 파일이 한 일이 모두 취소되어 일부만 적용되지 않는다.
--  3) 기존 회원 · 검사 · 주문 · 결제 · 리포트 데이터를 지우거나 고치지 않는다. 다만 4번이 주문에 payment_env 열을 새로 만들고
--     기존 주문은 모두 'test'로 채운다 (실결제 전환 전의 주문이므로).
--  4) 마지막 결과 표(읽기 전용 확인 조회)에서 ${range}번이 모두 "적용됨"이면 끝이다.
--
-- Supabase가 "위험한 작업이 포함되어 있다"는 확인 창을 보여 주면: 6번의 "제약 조건 교체"(허용값을 넓히는 변경)와
-- 10번 함수 안의 "탈퇴 시 삭제" 문장 때문이다. 이 파일은 기존 데이터를 지우지 않으므로 실행해도 된다.

begin;

${preconditionBlock(range)}

${body}
commit;

-- ═════════════════════════════════════════════════════════════════
-- 확인: 모든 번호의 적용 여부 (읽기 전용 — 아무것도 바꾸지 않는다)
-- ═════════════════════════════════════════════════════════════════
${checkSql.trimEnd()}
`;
}

/**
 * **스테이징(아무것도 만들지 않은 새 Supabase 프로젝트) 전용** — 마이그레이션 전체(1번부터)를 SQL Editor에서 한 번에 실행하는 한 파일로 묶는다.
 * 운영 DB(이미 표가 있는 프로젝트)에 실수로 실행되지 않도록 시작할 때 앱의 대표 표(profiles · orders · assessments)가 하나라도 있으면 아무것도 바꾸지 않고 멈춘다.
 * 운영 DB에는 이 파일을 쓰지 않는다 — 운영 적용은 별도 승인이며 docs/db-rollout-19-25.md의 번호별 절차를 따른다.
 */
export function buildStagingApplySql(opts: { migrations: MigrationFile[]; checkSql: string }): string {
  const { migrations, checkSql } = opts;
  const body = migrations
    .map((m, i) => `-- ═════════════════════════════════════════════════════════════════
-- ${i + 1}번: ${m.name}   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
${m.sql.trimEnd()}
`)
    .join("\n");
  return `-- ME:U(미유) 스테이징 전용 — DB 변경 1~${migrations.length}번을 SQL Editor에서 한 번에 실행하는 통합 파일
--
-- ⚠ 이 파일은 **아무것도 만들지 않은 새 Supabase 프로젝트(스테이징)에만** 쓴다. 운영 프로젝트에서는 실행하지 않는다.
--   (운영 DB 적용은 별도 승인이며 docs/db-rollout-19-25.md의 번호별 절차를 따른다.)
--
-- 이 파일은 supabase/migrations의 1~${migrations.length}번 파일을 한 글자도 고치지 않고 이어 붙인 것이다.
-- (scripts/render-apply-sql.ts --staging 이 만든다 — 직접 고치지 않는다. 내용이 바뀌면 서버 테스트가 알려 준다.)
--
-- 사용: 새 Supabase 프로젝트 → SQL Editor → New query → 이 파일 내용을 모두 붙여넣고 Run (한 번만).
--
-- 안전장치
--  1) 시작할 때 조건을 확인한다: 이 프로젝트에 앱의 표(profiles · orders · assessments)가 하나도 없어야 하고, Supabase Auth(auth.users)는 있어야 한다.
--     이미 표가 있으면(= 운영 프로젝트이거나 한 번 실행한 프로젝트) 아무것도 바꾸지 않고 "시작 조건 불충족" 오류로 멈춘다.
--  2) 전체가 하나의 트랜잭션(begin ... commit)이다. 중간에 오류가 나면 이 파일이 한 일이 모두 취소된다.
--  3) 어떤 기존 데이터도 지우거나 고치지 않는다(새 프로젝트라 지울 데이터가 없다).
--  4) 마지막 결과 표(읽기 전용 확인 조회)에서 1~${migrations.length}번이 모두 "적용됨"이면 끝이다.
--
-- Supabase가 "위험한 작업이 포함되어 있다"는 확인 창을 보여 주면: 제약 조건 교체와 함수 안의 "탈퇴 시 삭제" 문장 때문이다. 새 프로젝트라 실행해도 된다.

begin;

do $check$
declare
  present text[] := '{}';
  t text;
begin
  if to_regclass('auth.users') is null then
    raise exception '시작 조건 불충족 — Supabase Auth(auth.users)가 없습니다. Supabase 프로젝트의 SQL Editor에서 실행했는지 확인하세요. 아무것도 바꾸지 않았습니다.';
  end if;
  foreach t in array array['profiles', 'orders', 'assessments'] loop
    if to_regclass('public.' || t) is not null then present := present || t; end if;
  end loop;
  if cardinality(present) > 0 then
    raise exception '시작 조건 불충족 — 이 프로젝트에는 이미 앱의 표가 있습니다: %. 이 파일은 비어 있는 새 스테이징 프로젝트 전용입니다(운영 프로젝트에서 실행하면 안 됩니다). 아무것도 바꾸지 않았습니다.', present;
  end if;
end
$check$;

${body}
commit;

-- ═════════════════════════════════════════════════════════════════
-- 확인: 모든 번호의 적용 여부 (읽기 전용 — 아무것도 바꾸지 않는다)
-- ═════════════════════════════════════════════════════════════════
${checkSql.trimEnd()}
`;
}

/**
 * **DB 변경 25번(후기)만** 적용하는 파일 — 테스트 전용 Supabase 프로젝트처럼 19~22번(혜택)이 없는 DB에도 쓸 수 있다.
 * 25번은 후기 표 3개 · 함수 · 탈퇴 트리거 · funnel_events 이름 검사만 더하고 19~22번의 표를 직접 쓰지 않는다(보상 지급은 서버가 혜택 설정이 켜졌을 때만 한다).
 * 마이그레이션 내용은 한 글자도 고치지 않고 이어 붙이고, 시작 조건 확인 · 끝 확인(아니면 전체 취소) · 하나의 트랜잭션 · 마지막 읽기 전용 확인 조회를 더한다.
 * 이 함수는 문자열만 다룬다(파일을 읽고 쓰는 것은 scripts/render-apply-sql.ts --reviews).
 */
export function buildReviewsApplySql(opts: { migration: MigrationFile; postSql: string }): string {
  const { migration, postSql } = opts;
  const NAMES = "'visit', 'analyze_start', 'analyze_complete', 'preview_view', 'report_view', 'review_section_view', 'review_all_click'";
  return `-- ME:U(미유) DB 변경 25번(후기) 단독 적용 파일 — SQL Editor에서 한 번 실행한다
--
-- 이 파일은 supabase/migrations/${migration.name}을 한 글자도 고치지 않고 가운데에 붙인 것이다.
-- (scripts/render-apply-sql.ts --reviews 가 만든다 — 직접 고치지 않는다. 내용이 바뀌면 서버 테스트가 알려 준다.)
--
-- ⚠️ 테스트 전용 프로젝트(wdvrwwajakjdfrajgxcm)에 적용하기 위한 파일이다. 운영 DB에는 운영자가 따로 승인하기 전에는 실행하지 않는다.
--
-- 사용 순서
--  1) supabase/review-25-precheck.sql을 먼저 실행해 "종합"이 OK인지 확인한다(읽기 전용).
--  2) 이 파일을 SQL Editor에 모두 붙여넣고 Run (한 번만).
--  3) supabase/review-25-postcheck.sql을 실행해 "종합"이 OK인지 확인한다(읽기 전용). 이 파일 끝의 확인 조회와 같은 것이다.
--
-- 안전장치
--  - 시작 조건: 필요한 표 · 열 · 역할이 있고, 25번이 만드는 것이 하나도 없으며, funnel_events의 기존 이름이 새 허용 목록 안에 있어야 한다.
--    아니면 아무것도 바꾸지 않고 "시작 조건 불충족"으로 멈춘다(이미 한 번 실행한 뒤 다시 실행해도 여기서 멈춘다 — 문제가 아니다).
--  - 전체가 하나의 트랜잭션이다. 끝 확인(표 · 권한 · 정책 · 함수 · 트리거 · 이름 검사)이 하나라도 어긋나면 이 파일이 한 일이 모두 취소된다.
--  - 기존 회원 · 검사 · 주문 · 결제 · 리포트 · 방문 단계 데이터는 지우거나 고치지 않는다. 바뀌는 기존 항목은 funnel_events의 이름 검사 하나뿐이다(허용 이름 5개 → 7개).
--  - 이 파일을 적용하는 것만으로는 아무 후기도 만들어지지 않고 질문권이 지급되지 않는다(보상은 혜택 설정 feature.review_reward가 꺼져 있는 동안 지급하지 않는다).
--
-- Supabase가 "위험한 작업이 포함되어 있다"는 확인 창을 보여 주면: funnel_events의 제약 조건 교체(허용값을 넓히는 변경) 때문이다. 기존 데이터를 지우지 않으므로 실행해도 된다.

begin;

do $check$
declare
  problems text[] := '{}';
  bad_names text;
begin
  if to_regclass('public.profiles') is null then problems := problems || '표 profiles(1~3번)'::text; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'withdrawn_at') then problems := problems || '프로필의 withdrawn_at 열(10번)'::text; end if;
  if to_regclass('public.funnel_events') is null then problems := problems || '표 funnel_events(8번)'::text; end if;
  if to_regclass('auth.users') is null then problems := problems || '표 auth.users(Supabase Auth)'::text; end if;
  if (select count(*) from pg_roles where rolname in ('service_role', 'authenticated', 'anon')) <> 3 then problems := problems || '역할 service_role · authenticated · anon'::text; end if;
  if cardinality(problems) > 0 then
    raise exception '시작 조건 불충족 — 필요한 것이 없습니다: %. 아무것도 바꾸지 않았습니다. 이 파일을 실행하지 말고 review-25-precheck.sql 결과를 알려 주세요.', array_to_string(problems, ' / ');
  end if;

  if to_regclass('public.reviews') is not null then problems := problems || '표 reviews'::text; end if;
  if to_regclass('public.review_admin_log') is not null then problems := problems || '표 review_admin_log'::text; end if;
  if to_regclass('public.review_reports') is not null then problems := problems || '표 review_reports'::text; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('submit_review_report', 'review_admin_apply', 'reviews_on_withdraw', 'reviews_touch')) then problems := problems || '후기 함수'::text; end if;
  if exists (select 1 from pg_trigger where tgname = 'profiles_reviews_withdraw' and not tgisinternal) then problems := problems || '트리거 profiles_reviews_withdraw'::text; end if;
  if cardinality(problems) > 0 then
    raise exception '시작 조건 불충족 — 25번이 만드는 것이 이미 있습니다: %. 아무것도 바꾸지 않았습니다. 이 파일을 다시 실행하지 말고 review-25-precheck.sql 결과를 알려 주세요.', array_to_string(problems, ' / ');
  end if;

  select string_agg(distinct name, ', ' order by name) into bad_names from public.funnel_events where name not in (${NAMES});
  if bad_names is not null then
    raise exception '시작 조건 불충족 — funnel_events에 새 허용 목록 밖의 이름이 있습니다: %. 25번의 이름 검사를 바꿀 수 없어 아무것도 바꾸지 않았습니다. 결과를 알려 주세요.', bad_names;
  end if;
end
$check$;

-- ═════════════════════════════════════════════════════════════════
-- 25번: ${migration.name}   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
${migration.sql.trimEnd()}

-- ═════════════════════════════════════════════════════════════════
-- 끝 확인 — 하나라도 어긋나면 위의 모든 변경이 취소된다
-- ═════════════════════════════════════════════════════════════════
do $verify$
declare
  def text;
begin
  if to_regclass('public.reviews') is null or to_regclass('public.review_admin_log') is null or to_regclass('public.review_reports') is null then raise exception '끝 확인 실패 — 후기 표가 없습니다'; end if;
  if (select count(*) from pg_class where oid in (to_regclass('public.reviews'), to_regclass('public.review_admin_log'), to_regclass('public.review_reports')) and relrowsecurity) <> 3 then raise exception '끝 확인 실패 — 행 단위 접근 제한(RLS)이 모두 켜지지 않았습니다'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'reviews') <> 1 or (select count(*) from pg_policies where schemaname = 'public' and tablename in ('review_admin_log', 'review_reports')) <> 0 then raise exception '끝 확인 실패 — 정책이 예상과 다릅니다'; end if;
  if has_table_privilege('anon', 'public.reviews', 'select') or has_table_privilege('anon', 'public.review_admin_log', 'select') or has_table_privilege('anon', 'public.review_reports', 'select') then raise exception '끝 확인 실패 — anon이 후기 표를 읽을 수 있습니다'; end if;
  if not has_table_privilege('authenticated', 'public.reviews', 'select') or has_table_privilege('authenticated', 'public.reviews', 'insert') or has_table_privilege('authenticated', 'public.reviews', 'update') or has_table_privilege('authenticated', 'public.reviews', 'delete') or has_table_privilege('authenticated', 'public.review_admin_log', 'select') or has_table_privilege('authenticated', 'public.review_reports', 'select') then raise exception '끝 확인 실패 — authenticated 권한이 예상과 다릅니다'; end if;
  if not (has_table_privilege('service_role', 'public.reviews', 'insert') and has_table_privilege('service_role', 'public.review_admin_log', 'insert') and has_table_privilege('service_role', 'public.review_reports', 'update')) then raise exception '끝 확인 실패 — service_role 권한이 부족합니다'; end if;
  if not (has_function_privilege('service_role', 'public.submit_review_report(uuid,text,text)', 'execute') and has_function_privilege('service_role', 'public.review_admin_apply(uuid,text,text,text,uuid)', 'execute'))
     or has_function_privilege('anon', 'public.submit_review_report(uuid,text,text)', 'execute') or has_function_privilege('authenticated', 'public.submit_review_report(uuid,text,text)', 'execute')
     or has_function_privilege('anon', 'public.review_admin_apply(uuid,text,text,text,uuid)', 'execute') or has_function_privilege('authenticated', 'public.review_admin_apply(uuid,text,text,text,uuid)', 'execute') then
    raise exception '끝 확인 실패 — 함수 실행 권한이 예상과 다릅니다';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'profiles_reviews_withdraw' and not tgisinternal) then raise exception '끝 확인 실패 — 탈퇴 트리거가 없습니다'; end if;
  select pg_get_constraintdef(oid) into def from pg_constraint where conrelid = to_regclass('public.funnel_events') and conname = 'funnel_events_name_check';
  if def is null or def not like '%review_section_view%' or def not like '%review_all_click%' then raise exception '끝 확인 실패 — 방문 단계 이름 검사가 바뀌지 않았습니다'; end if;
  if (select count(*) from public.reviews) <> 0 then raise exception '끝 확인 실패 — 후기가 만들어졌습니다'; end if;
end
$verify$;

commit;

-- ═════════════════════════════════════════════════════════════════
-- 확인: 25번 적용 결과 (읽기 전용 — supabase/review-25-postcheck.sql과 같다. 아무것도 바꾸지 않는다)
-- ═════════════════════════════════════════════════════════════════
${postSql.trimEnd()}
`;
}

/**
 * DB 변경 29번(기록 삭제 범위 확대) + 30번(쌍 × 삭제 동시성 장치)을 **하나의 트랜잭션**으로 적용하는 단독 파일(테스트 전용 프로젝트용).
 * 두 파일을 한 글자도 고치지 않고 이어 붙이고, 시작 조건 · 이미 적용 거절 · 끝 확인(구조 · 행 · 권한 · 트리거 · 함수가 예상과 다르면 전체 취소)을 더한다.
 * 고객 기록 삭제 함수(delete_assessment_record_v2)는 부르지 않는다 — 존재 · 권한 · 정의만 카탈로그에서 읽는다.
 * 이 함수는 문자열만 다룬다(파일을 읽고 쓰는 것은 scripts/render-apply-sql.ts --29-30).
 */
export function buildScope2930ApplySql(opts: { migrations: [MigrationFile, MigrationFile]; checkSql: string }): string {
  const [m29, m30] = opts.migrations;
  // 행 수 · 내용 불변을 확인하는 사용자 자료 표(있는 것만) — 방문 · AI 사용 · 운영 기록처럼 사용자와 상관없이 계속 쌓이는 표는 겹치는 활동 때문에 거짓으로 실패하므로 넣지 않는다
  const ROW_TABLES = ["profiles", "assessments", "orders", "payment_events", "reports", "report_feedback", "taste_reports", "talk_rooms", "chat_summaries", "talk_transcripts", "chat_questions", "cash_ledger", "cash_wallets", "question_packs", "personal_contexts", "concern_records", "pairs", "user_consents", "compat_requests", "user_regions", "reviews"];
  const NEW_FUNCTIONS = ["public.delete_assessment_record_v2(uuid,uuid)", "public.block_write_on_purged_record()", "public.pairs_block_deleted_record()"];
  const NEW_TRIGGERS = [
    ["talk_rooms_block_purged", "talk_rooms"],
    ["chat_summaries_block_purged", "chat_summaries"],
    ["talk_transcripts_block_purged", "talk_transcripts"],
    ["chat_questions_block_purged", "chat_questions"],
    ["pairs_block_deleted_record", "pairs"],
  ];
  const list = (xs: string[]) => xs.map((x) => `'${x}'`).join(", ");
  // 함수 키는 '이름(인자 타입, 인자 타입)' 모양(oidvectortypes) — 호출용 서명(공백 없음)과 표기가 달라 키 쪽에 ", "를 넣어 맞춘다
  const keyOf = (sig: string) => sig.replace(/,/g, ", ");
  const allowedAdded = [
    `('column', 'assessments.record_purged_at')`,
    ...NEW_FUNCTIONS.flatMap((f) => [`('function-acl', '${keyOf(f)}')`, `('function-def', '${keyOf(f)}')`]),
    `('function-def', '${keyOf("public.pair_join(text,uuid,uuid,text)")}')`,
    ...NEW_TRIGGERS.map(([t]) => `('trigger', '${t}')`),
  ].join(",\n      ");
  const section = (no: number, m: MigrationFile) => `-- ═════════════════════════════════════════════════════════════════
-- ${no}번: ${m.name}   (아래는 supabase/migrations 파일 내용 그대로)
-- ═════════════════════════════════════════════════════════════════
${m.sql.trimEnd()}
`;
  return `-- ME:U(미유) DB 변경 29번 + 30번 단독 적용 파일 — SQL Editor에서 한 번 실행한다 (하나의 트랜잭션)
--
-- 이 파일은 supabase/migrations/${m29.name} (29번)과 supabase/migrations/${m30.name} (30번)을 한 글자도 고치지 않고 이어 붙인 것이다.
-- (scripts/render-apply-sql.ts --29-30 이 만든다 — 직접 고치지 않는다. 내용이 바뀌면 서버 테스트가 알려 준다.)
--
-- ⚠️ 테스트 전용 프로젝트(wdvrwwajakjdfrajgxcm)에 적용하기 위한 파일이다. 운영 DB에는 운영자가 따로 승인하기 전에는 실행하지 않는다.
--
-- 왜 하나로 묶었나: 29번만 먼저 적용한 상태에서는 "리포트 궁합 쌍이 만들어지는 순간과 기록 삭제가 겹치면 원자료가 빈 분석을 쌍이 가리킬 수 있는" 틈이 있다(docs/pair-assessment-guard-v1.md).
--   두 번호를 틈 없이 같은 순간에 적용해 그 틈이 열린 채로 남지 않게 한다. 두 번호를 따로 적용해도 되지만(각자의 사전 · 사후 확인 파일이 있다) 이 파일이 권장 방법이다.
--
-- 사용 순서
--  1) (읽기 전용) supabase/delete-scope-29-precheck.sql 과 supabase/pair-assessment-guard-30-precheck.sql 은 이 파일을 쓰기 전의 개별 사전 확인이다.
--     29번 사전 확인은 "종합 OK"여야 하고, 30번 사전 확인은 29번 적용 전에는 "이상(선행 29번 없음)"으로 나오는 것이 정상이다(이 파일이 둘을 함께 적용한다).
--  2) 이 파일을 SQL Editor에 모두 붙여넣고 Run (한 번만).
--  3) 끝에 나오는 결과 표(check-migrations.sql)에서 29 · 30번이 "적용됨"인지 본다. 그 뒤 pair-assessment-guard-30-postcheck.sql로 30번 사후 확인을 해도 된다.
--
-- 안전장치
--  - 시작 조건: 28번(기록 삭제)과 24번(리포트 궁합)이 적용돼 있고, 29 · 30번이 만드는 것이 하나도 없어야 하며, 필요한 역할이 있어야 한다.
--    아니면 아무것도 바꾸지 않고 "시작 조건 불충족"으로 멈춘다(이미 한 번 실행한 뒤 다시 실행해도 여기서 멈춘다 — 문제가 아니다).
--  - 전체가 하나의 트랜잭션이다. 끝 확인이 하나라도 어긋나면 이 파일이 한 일이 모두 취소된다:
--      · 구조: 새로 생긴 것은 열 assessments.record_purged_at · 함수 3개 · 트리거 5개 · pair_join의 새 정의뿐이어야 한다(다른 열 · 제약 · 인덱스 · 정책 · 함수 · 트리거 · 표 권한이 하나라도 달라지면 취소).
--      · 권한: 새 함수 셋은 서버(service_role)만 실행할 수 있고(트리거 함수 둘은 아무도 직접 실행 못 함) 브라우저 역할(anon · authenticated · public)은 실행할 수 없다. pair_join의 권한은 그대로다.
--      · 데이터: 사용자 자료 표(${ROW_TABLES.length}개 중 있는 것)의 행 수와 행 내용이 적용 전과 같아야 한다. 29 · 30번은 어떤 행도 만들거나 고치거나 지우지 않는다.
--        (적용하는 동안 다른 사용자의 활동이 겹쳐 행이 바뀌면 안전하게 전체 취소되고 "다시 실행"이라고 알린다.)
--  - 고객 기록 삭제 함수(delete_assessment_record_v2)는 이 파일이 호출하지 않는다 — 만들기만 하고, 확인은 카탈로그(존재 · 권한 · 정의)만 읽는다. 어떤 기록도 지우지 않는다.
--  - 락 대기는 15초, 한 문장은 180초에서 멈춘다(오래 기다리며 다른 요청을 막지 않는다). 시간 초과도 전체 취소다.
--
-- Supabase가 "위험한 작업이 포함되어 있다"는 확인 창을 보여 주면: 함수 안의 삭제 문장(29번의 기록 삭제 함수)과 열 추가 때문이다.
--   이 파일은 함수를 만들기만 하고 부르지 않으며 기존 데이터를 지우지 않으므로 실행해도 된다.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '180s';

do $check$
declare
  problems text[] := '{}';
  t text;
begin
  -- 1) 앞 번호가 만드는 것이 있어야 한다
  if to_regclass('auth.users') is null then problems := problems || '표 auth.users(Supabase Auth)'::text; end if;
  if (select count(*) from pg_roles where rolname in ('service_role', 'authenticated', 'anon')) <> 3 then problems := problems || '역할 service_role · authenticated · anon'::text; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'record_deleted_at') then problems := problems || '열 assessments.record_deleted_at(28번)'::text; end if;
  if to_regprocedure('public.delete_assessment_record(uuid,uuid,jsonb)') is null then problems := problems || '함수 delete_assessment_record(28번)'::text; end if;
  if to_regclass('public.talk_transcripts') is null then problems := problems || '표 talk_transcripts(28번)'::text; end if;
  if to_regclass('public.pairs') is null or to_regprocedure('public.pair_join(text,uuid,uuid,text)') is null then problems := problems || '표 pairs · 함수 pair_join(24번 리포트 궁합)'::text; end if;
  foreach t in array array['talk_rooms', 'chat_summaries', 'chat_questions', 'personal_contexts', 'concern_records', 'taste_reports', 'reports', 'orders', 'cash_ledger'] loop
    if to_regclass('public.' || t) is null then problems := problems || ('표 ' || t)::text; end if;
  end loop;
  if cardinality(problems) > 0 then
    raise exception '시작 조건 불충족 — 필요한 것이 없습니다: %. 아무것도 바꾸지 않았습니다. 이 파일을 실행하지 말고 check-migrations.sql 결과를 알려 주세요.', array_to_string(problems, ' / ');
  end if;

  -- 2) 29 · 30번이 만드는 것이 하나라도 이미 있으면 멈춘다(일부만 적용된 상태에서 다시 실행하지 않기 위해)
  problems := '{}';
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assessments' and column_name = 'record_purged_at') then problems := problems || '열 assessments.record_purged_at(29번)'::text; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('delete_assessment_record_v2', 'block_write_on_purged_record', 'pairs_block_deleted_record')) then problems := problems || '함수(29 · 30번)'::text; end if;
  if exists (select 1 from pg_trigger where tgname in (${list(NEW_TRIGGERS.map(([t]) => t))}) and not tgisinternal) then problems := problems || '트리거(29 · 30번)'::text; end if;
  if cardinality(problems) > 0 then
    raise exception '시작 조건 불충족 — 29 · 30번이 만드는 것이 이미 있습니다: %. 아무것도 바꾸지 않았습니다. 이 파일을 다시 실행하지 말고 check-migrations.sql 결과 표를 그대로 알려 주세요.', array_to_string(problems, ' / ');
  end if;
end
$check$;

-- 적용 전 상태를 임시로 저장한다 (이 트랜잭션이 끝나면 사라진다 — 영구 표 · 뷰를 만들지 않는다)
create temp view _a2930_state as
  select 'column'::text as kind, c.table_name::text || '.' || c.column_name::text as key, c.data_type::text || ':' || c.is_nullable::text || ':' || coalesce(c.column_default::text, '') as val
    from information_schema.columns c where c.table_schema = 'public'
  union all
  select 'constraint', conrelid::regclass::text || '.' || conname::text, pg_get_constraintdef(oid) from pg_constraint where connamespace = 'public'::regnamespace
  union all
  select 'index', schemaname::text || '.' || indexname::text, indexdef from pg_indexes where schemaname = 'public'
  union all
  select 'table-acl', c.relname::text, coalesce(c.relacl::text, '-') || ':rls=' || c.relrowsecurity::text from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'S', 'v')
  union all
  select 'policy', tablename::text || '.' || policyname::text, coalesce(cmd::text, '') || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') from pg_policies where schemaname = 'public'
  union all
  select 'function-acl', 'public.' || p.proname::text || '(' || oidvectortypes(p.proargtypes) || ')', coalesce(p.proacl::text, '-') from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all
  select 'function-def', 'public.' || p.proname::text || '(' || oidvectortypes(p.proargtypes) || ')', md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  union all
  select 'trigger', t.tgname::text, c.relname::text || ':' || t.tgenabled::text || ':' || md5(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
  union all
  select 'rows', n.name, (xpath('/row/c/text()', query_to_xml(format('select count(*)::text || '':'' || md5(coalesce(string_agg(md5((to_jsonb(x) - ''record_purged_at'')::text), '''' order by md5((to_jsonb(x) - ''record_purged_at'')::text)), '''')) as c from public.%I x', n.name), false, true, '')))[1]::text
    from unnest(array[${list(ROW_TABLES)}]) as n(name) where to_regclass('public.' || n.name) is not null;

create temp table _a2930_before on commit drop as select * from _a2930_state;

${section(29, m29)}
${section(30, m30)}
-- ═════════════════════════════════════════════════════════════════
-- 끝 확인 — 하나라도 어긋나면 위의 모든 변경이 취소된다 (고객 삭제 함수는 부르지 않는다: 카탈로그만 읽는다)
-- ═════════════════════════════════════════════════════════════════
create temp table _a2930_after on commit drop as select * from _a2930_state;

do $verify$
declare
  diff text;
  rows_diff text;
  def text;
  acl text;
  fn text;
begin
  -- 1) 구조 · 권한 · 행의 변화가 정확히 예상한 것뿐인가 (표 · 열 · 제약 · 인덱스 · 정책 · 표 권한 · 함수 권한과 정의 · 트리거 · 사용자 자료 행 수와 내용)
  create temp table _a2930_allowed (side text, kind text, key text) on commit drop;
  insert into _a2930_allowed
    select 'added', k.kind, k.key from (values
      ${allowedAdded}
    ) as k(kind, key);
  insert into _a2930_allowed values ('removed', 'function-def', '${keyOf("public.pair_join(text,uuid,uuid,text)")}');

  create temp table _a2930_changes (side text, kind text, key text) on commit drop;
  insert into _a2930_changes
    select 'added', kind, key from (select kind, key, val from _a2930_after except select kind, key, val from _a2930_before) a
    union all
    select 'removed', kind, key from (select kind, key, val from _a2930_before except select kind, key, val from _a2930_after) r;

  select string_agg(side || ' ' || kind || ' ' || key, ' / ' order by kind, key) into rows_diff from _a2930_changes where kind = 'rows';
  if rows_diff is not null then
    raise exception '끝 확인 실패 — 사용자 자료의 행 수 또는 내용이 적용 전과 달라졌습니다: %. 29 · 30번은 행을 바꾸지 않으므로 이 사이에 다른 사용자의 활동이 겹쳤을 수 있습니다. 전체 취소했습니다 — 다시 실행해 주세요. 반복되면 결과를 그대로 알려 주세요.', rows_diff;
  end if;
  select string_agg(c.side || ' ' || c.kind || ' ' || c.key, ' / ' order by c.kind, c.key) into diff
    from _a2930_changes c where not exists (select 1 from _a2930_allowed a where a.side = c.side and a.kind = c.kind and a.key = c.key);
  if diff is not null then
    raise exception '끝 확인 실패 — 예상하지 못한 변화가 있습니다: %. 전체 취소했습니다. 결과를 그대로 알려 주세요.', diff;
  end if;
  select string_agg(a.side || ' ' || a.kind || ' ' || a.key, ' / ' order by a.kind, a.key) into diff
    from _a2930_allowed a where not exists (select 1 from _a2930_changes c where a.side = c.side and a.kind = c.kind and a.key = c.key);
  if diff is not null then
    raise exception '끝 확인 실패 — 만들어져야 할 것이 없습니다: %. 전체 취소했습니다. 결과를 그대로 알려 주세요.', diff;
  end if;

  -- 2) 29번: 삭제 완료 표시는 모든 행이 비어 있다(적용만으로는 어떤 기록도 삭제 완료로 바뀌지 않는다)
  if exists (select 1 from public.assessments where record_purged_at is not null) then
    raise exception '끝 확인 실패 — 삭제 완료로 표시된 기록이 있습니다. 전체 취소했습니다.';
  end if;

  -- 3) 새 함수 셋의 권한: 서버(service_role)만, 브라우저 역할 · public 불가 (트리거 함수 둘은 service_role도 직접 실행할 이유가 없지만 기존 방식과 같은 권한이면 된다 — 브라우저 역할만 막는다)
  foreach fn in array array[${list(NEW_FUNCTIONS)}] loop
    if has_function_privilege('anon', fn, 'execute') or has_function_privilege('authenticated', fn, 'execute') then
      raise exception '끝 확인 실패 — 브라우저 역할이 % 를 실행할 수 있습니다. 전체 취소했습니다.', fn;
    end if;
    select coalesce(p.proacl::text, '') into acl from pg_proc p where p.oid = fn::regprocedure;
    if acl ~ '(^\\{|,)=' then
      raise exception '끝 확인 실패 — % 에 public 실행 권한이 남아 있습니다 (%). 전체 취소했습니다.', fn, acl;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.delete_assessment_record_v2(uuid,uuid)', 'execute') then
    raise exception '끝 확인 실패 — 서버 역할이 delete_assessment_record_v2를 실행할 수 없습니다. 전체 취소했습니다.';
  end if;
  -- pair_join: 서버만 (24번과 같다)
  select coalesce(p.proacl::text, '') into acl from pg_proc p where p.oid = 'public.pair_join(text,uuid,uuid,text)'::regprocedure;
  if not has_function_privilege('service_role', 'public.pair_join(text,uuid,uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.pair_join(text,uuid,uuid,text)', 'execute') or has_function_privilege('authenticated', 'public.pair_join(text,uuid,uuid,text)', 'execute') or acl ~ '(^\\{|,)=' then
    raise exception '끝 확인 실패 — pair_join의 실행 권한이 예상과 다릅니다 (%). 전체 취소했습니다.', acl;
  end if;
  -- 28번 삭제 함수의 권한은 그대로: 서버만
  if not has_function_privilege('service_role', 'public.delete_assessment_record(uuid,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.delete_assessment_record(uuid,uuid,jsonb)', 'execute') or has_function_privilege('authenticated', 'public.delete_assessment_record(uuid,uuid,jsonb)', 'execute') then
    raise exception '끝 확인 실패 — 28번 삭제 함수의 권한이 달라졌습니다. 전체 취소했습니다.';
  end if;

  -- 4) 트리거 5개가 올바른 표에 켜져 있다(enabled = O)
${NEW_TRIGGERS.map(([t, table]) => `  if not exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid where g.tgname = '${t}' and c.relname = '${table}' and c.relnamespace = 'public'::regnamespace and g.tgenabled = 'O' and not g.tgisinternal) then raise exception '끝 확인 실패 — 트리거 ${t}가 표 ${table}에 켜져 있지 않습니다. 전체 취소했습니다.'; end if;`).join("\n")}

  -- 5) pair_join의 새 정의: 삭제한 결과를 거절하고 결과 행을 공유 잠금으로 읽는다
  select pg_get_functiondef('public.pair_join(text,uuid,uuid,text)'::regprocedure) into def;
  if def !~ 'record_purged_at' or def !~ 'record_deleted_at' or def !~* 'for share' then
    raise exception '끝 확인 실패 — pair_join이 새 정의가 아닙니다. 전체 취소했습니다.';
  end if;
end
$verify$;

drop view _a2930_state;

commit;

-- ═════════════════════════════════════════════════════════════════
-- 확인: 적용 이력 (읽기 전용 — supabase/check-migrations.sql과 같다. 아무것도 바꾸지 않는다. 29 · 30번이 "적용됨"이면 끝이다)
-- ═════════════════════════════════════════════════════════════════
${opts.checkSql.trimEnd()}
`;
}
