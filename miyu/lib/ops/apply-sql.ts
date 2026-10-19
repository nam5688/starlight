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
