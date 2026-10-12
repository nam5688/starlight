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
