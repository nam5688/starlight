// 실행: npm test — 설정 점검 화면의 판정 규칙
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSteps, checkEnv, CONSENT_TABLES, currentStep, INIT_TABLES, isTossDocsKey, tableStateOf, type SetupFacts } from "./setup-checks.ts";

const reader = (values: Record<string, string>) => (name: string) => values[name] ?? "";

test("환경변수 점검 결과에는 값이 들어가지 않는다", () => {
  const secret = "sb_secret_abcdefghijklmnop";
  const checks = checkEnv(reader({ SUPABASE_SECRET_KEY: secret, NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co" }));
  assert.ok(!JSON.stringify(checks).includes(secret));
  assert.equal(checks.find((c) => c.name === "SUPABASE_SECRET_KEY")?.state, "set");
  assert.equal(checks.find((c) => c.name === "NEXT_PUBLIC_SUPABASE_URL")?.state, "set");
  assert.equal(checks.find((c) => c.name === "TOSS_SECRET_KEY")?.state, "empty");
});

test("공개 키 칸에 비밀키를 넣으면 알려준다", () => {
  const checks = checkEnv(
    reader({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_x",
      NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gsk_x",
      NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co/rest/v1/",
    }),
  );
  for (const name of ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_TOSS_CLIENT_KEY", "NEXT_PUBLIC_SUPABASE_URL"]) {
    assert.equal(checks.find((c) => c.name === name)?.state, "check", name);
  }
});

const empty: SetupFacts = {
  env: [],
  supabaseReady: false,
  connection: null,
  tables: {},
  kakaoEnabled: null,
  completedLogins: null,
  savedAssessments: null,
  paymentReady: false,
  paymentReason: "결제 키 설정 전",
  paidOrders: null,
  readyReports: null,
};
const allTables = Object.fromEntries([...INIT_TABLES, ...CONSENT_TABLES].map((t) => [t, "ok" as const]));

test("테이블 상태: 없음 · 권한 없음 · 조회 실패를 구분한다 (오류가 없을 때만 있음)", () => {
  assert.equal(tableStateOf(null), "ok");
  assert.equal(tableStateOf({ code: "PGRST205", status: 404 }), "missing");
  assert.equal(tableStateOf({ code: "42P01" }), "missing");
  assert.equal(tableStateOf({ code: "42501", status: 403 }), "no-access");
  assert.equal(tableStateOf({ code: "PGRST000", status: 503 }), "error");
});

test("권한 없는 테이블이 있으면 DB 단계를 완료로 보지 않고 이유를 알려준다", () => {
  const steps = buildSteps({ ...empty, supabaseReady: true, connection: "ok", tables: { ...allTables, orders: "no-access" } });
  const now = currentStep(steps);
  assert.equal(now?.id, "database");
  assert.match(now?.detail ?? "", /orders/);
});

test("토스 문서 예제용 공용 키는 쓸 수 있지만, 상점 관리자에 결제내역이 안 보인다고 알려준다", () => {
  assert.equal(isTossDocsKey("test_gck_docs_abc"), true);
  assert.equal(isTossDocsKey("test_gsk_docs_abc"), true);
  assert.equal(isTossDocsKey("test_gck_abc"), false);
  const field = checkEnv(reader({ NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gck_docs_abc" })).find((c) => c.name === "NEXT_PUBLIC_TOSS_CLIENT_KEY");
  assert.equal(field?.state, "set");
  assert.match(field?.hint ?? "", /결제내역이 보이지 않습니다/);
  assert.ok(!JSON.stringify(field).includes("test_gck_docs_abc"));
});

test("아무것도 안 했으면 Supabase 입력이 지금 할 일이다", () => {
  const steps = buildSteps(empty);
  assert.equal(currentStep(steps)?.id, "supabase-env");
  assert.ok(steps.slice(1).every((s) => s.state === "blocked"));
});

test("값은 들어갔지만 실제 연결이 안 되면 1단계에 머물고 이유를 알려준다", () => {
  for (const [connection, word] of [["unreachable", "주소"], ["bad-publishable", "공개용 키"], ["bad-secret", "비밀키"]] as const) {
    const steps = buildSteps({ ...empty, supabaseReady: true, connection });
    const now = currentStep(steps);
    assert.equal(now?.id, "supabase-env");
    assert.match(now?.detail ?? "", new RegExp(word));
    assert.equal(steps.find((s) => s.id === "database")?.state, "blocked");
  }
  // 결제 키가 들어 있어도 연결이 깨졌으면 뒤 단계는 "할 차례"로 보이지 않는다
  const broken = buildSteps({ ...empty, supabaseReady: true, connection: "bad-secret", kakaoEnabled: true, paymentReady: true, paymentReason: null });
  assert.deepEqual(broken.filter((s) => s.state !== "blocked").map((s) => s.id), ["supabase-env"]);
});

test("동의 테이블만 없으면 2번 SQL 실행을 안내한다", () => {
  const steps = buildSteps({ ...empty, supabaseReady: true, connection: "ok", tables: { ...allTables, user_consents: "missing" } });
  const now = currentStep(steps);
  assert.equal(now?.id, "database");
  assert.match(now?.detail ?? "", /20261012000000_consents\.sql/);
});

test("로그인·저장을 확인한 뒤에야 결제 단계로 넘어간다", () => {
  const ready = { ...empty, supabaseReady: true, connection: "ok" as const, tables: allTables, kakaoEnabled: true, completedLogins: 0, savedAssessments: 0 };
  assert.equal(currentStep(buildSteps(ready))?.id, "url-config");
  assert.equal(buildSteps(ready).find((s) => s.id === "toss-keys")?.state, "blocked");

  const saved = { ...ready, completedLogins: 1, savedAssessments: 1 };
  assert.equal(currentStep(buildSteps(saved))?.id, "toss-keys");

  const paid = { ...saved, paymentReady: true, paymentReason: null, paidOrders: 1, readyReports: 1 };
  assert.equal(currentStep(buildSteps(paid)), null);
});
