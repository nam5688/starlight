// DB 검증: 접근 정책(RLS), 쓰기 차단, 상태 규칙 트리거, 실제 DB 위에서의 서비스 흐름.
// 실행 전 local-stack.sh start 필요. 실행: npm run test:db
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ASSESSMENT_MODULES } from "../../lib/assessment/modules/index.ts";
import { createSupabaseRepository } from "../../lib/integrations/supabase/repository.ts";
import { EMPTY_BASIC_INFO } from "../../lib/profile/basic-info.ts";
import { devReportGenerator } from "../../lib/report/generate-dev-report.ts";
import { manseryeokEngine as sajuEngine } from "../../lib/saju/manseryeok-engine.ts";
import { submitAssessment } from "../../lib/services/assessment-service.ts";
import { agreeToTerms, getMemberStatus, setMarketingConsent } from "../../lib/services/member-service.ts";
import { confirmPayment, startCheckout } from "../../lib/services/order-service.ts";
import { reconcileOrder } from "../../lib/services/reconcile-service.ts";
import { createFakeToss } from "../../lib/services/testing/fake-toss.ts";
import { queueReport, runReport } from "../../lib/services/report-service.ts";
import type { PaymentGateway } from "../../lib/services/ports.ts";
import { ensureReport, getResultView } from "../../lib/services/report-service.ts";
import { kakaoOAuthOptions } from "../../server/kakao-options.ts";
import { deleteContext, getContextView, saveContext } from "../../lib/services/context-service.ts";

const URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
const JWT_SECRET = process.env.JWT_SECRET ?? "local-test-jwt-secret-at-least-32-characters";

function sign(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...payload })}`;
  return `${body}.${createHmac("sha256", JWT_SECRET).update(body).digest("base64url")}`;
}

const ANON_KEY = sign({ role: "anon" });
const SERVICE_KEY = sign({ role: "service_role" });
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(URL, SERVICE_KEY, noSession);
const anon = createClient(URL, ANON_KEY, noSession);

async function makeUser(): Promise<{ id: string; client: SupabaseClient }> {
  const email = `u-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, ANON_KEY, noSession);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, client };
}

const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i, n) => [i.id, (n % 5) + 1])));
const info = { ...EMPTY_BASIC_INFO, nickname: "테스트", birthYear: "1990", birthMonth: "1", birthDay: "15", birthTime: "09:30" };

const gateway: PaymentGateway = {
  provider: "tosspayments",
  async confirm({ paymentKey, orderId, amount }) {
    return { ok: true, payment: { paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: new Date().toISOString(), mId: "test-mid" } };
  },
  async getPayment() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
  async getPaymentByOrderId() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
};

let A: { id: string; client: SupabaseClient };
let B: { id: string; client: SupabaseClient };
let assessmentId: string;
let orderId: string;

before(async () => {
  A = await makeUser();
  B = await makeUser();
});
after(async () => {
  await A?.client.auth.signOut();
  await B?.client.auth.signOut();
});

test("가입하면 프로필과 결제용 구매자 키가 자동으로 생긴다", async () => {
  const { data } = await A.client.from("profiles").select("id, payment_customer_key").single();
  assert.equal(data?.id, A.id);
  assert.match(data?.payment_customer_key, /^[0-9a-f-]{36}$/);
});

test("서비스 흐름이 실제 DB에서 동작한다: 저장 → 주문 → 승인 → 리포트", async () => {
  const repo = createSupabaseRepository(admin);
  const saved = await submitAssessment({ repo, saju: sajuEngine }, { userId: A.id, channel: "web", info, answers, today: new Date() });
  assert.ok(saved.ok);
  if (!saved.ok) return;
  assessmentId = saved.assessment.id;
  assert.equal(saved.assessment.birthTime, "09:30");

  const started = await startCheckout({ repo, now: () => new Date() }, { userId: A.id, assessmentId });
  assert.equal(started.kind, "order");
  if (started.kind !== "order") return;
  orderId = started.order.id;

  // 다시 누르면 이전 대기 주문은 취소되고 새 주문이 생긴다 (대기 주문은 하나만)
  const again = await startCheckout({ repo, now: () => new Date() }, { userId: A.id, assessmentId });
  if (again.kind !== "order") throw new Error();
  orderId = again.order.id;

  const paid = await confirmPayment({ repo, gateway }, { userId: A.id, orderNumber: again.order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: again.order.amount });
  assert.equal(paid.kind, "paid");
  if (paid.kind !== "paid") return;

  const report = await ensureReport({ repo, generator: devReportGenerator, now: () => new Date() }, paid.order);
  assert.equal(report?.status, "ready");
  const again2 = await ensureReport({ repo, generator: devReportGenerator, now: () => new Date() }, paid.order);
  assert.equal(again2?.readyAt, report?.readyAt, "다시 생성하지 않는다");
});

test("접근 정책: 본인 결과만 조회된다", async () => {
  const mine = await getResultView(createSupabaseRepository(A.client), { userId: A.id, assessmentId });
  assert.equal(mine?.report?.status, "ready");

  // B는 A의 결과 주소를 알아도 조회되지 않는다
  assert.equal(await getResultView(createSupabaseRepository(B.client), { userId: B.id, assessmentId }), null);
  const direct = await B.client.from("assessments").select().eq("id", assessmentId);
  assert.deepEqual(direct.data, []);
  const reports = await B.client.from("reports").select().eq("assessment_id", assessmentId);
  assert.deepEqual(reports.data, []);

  const anonymous = await anon.from("assessments").select();
  assert.ok(anonymous.error || anonymous.data?.length === 0);
});

test("접근 정책: 로그인한 사용자도 직접 쓰기는 거부된다", async () => {
  const insert = await A.client.from("assessments").insert({ user_id: A.id, nickname: "x" });
  assert.ok(insert.error, "검사 결과 직접 저장 거부");
  const update = await A.client.from("orders").update({ status: "refunded" }).eq("id", orderId).select();
  assert.ok(update.error || update.data?.length === 0, "주문 상태 직접 변경 거부");
  const events = await A.client.from("payment_events").select();
  assert.ok(events.error || events.data?.length === 0, "결제 기록 조회 거부");
  const { data: order } = await admin.from("orders").select("status").eq("id", orderId).single();
  assert.equal(order?.status, "paid");
});

test("트리거: 허용되지 않는 주문 상태 변경과 금액 변경을 막는다", async () => {
  const back = await admin.from("orders").update({ status: "pending" }).eq("id", orderId);
  assert.match(back.error?.message ?? "", /invalid order status change/);
  const amount = await admin.from("orders").update({ amount: 1 }).eq("id", orderId);
  assert.match(amount.error?.message ?? "", /immutable/);
});

test("고유 조건: 같은 검사에 결제 완료 주문은 하나만", async () => {
  const { data: other } = await admin
    .from("orders")
    .insert({ order_number: `MEU-TEST-${Date.now()}`, user_id: A.id, assessment_id: assessmentId, product_id: "personal-integrated-report", amount: 9900 })
    .select()
    .single();
  const dup = await admin.from("orders").update({ status: "paid" }).eq("id", other.id);
  assert.equal(dup.error?.code, "23505");
});

test("트리거: 완성된 리포트는 바꿀 수 없다", async () => {
  const change = await admin.from("reports").update({ content: { tampered: true } }).eq("order_id", orderId);
  assert.match(change.error?.message ?? "", /immutable/);
});

test("가입 동의: 서버가 기록하고, 본인 기록만 보이며, 고치거나 직접 쓸 수 없다", async () => {
  const repo = createSupabaseRepository(admin);
  assert.deepEqual(await getMemberStatus(repo, A.id), { needsConsent: true, isNew: true, marketing: false });

  const refused = await agreeToTerms(repo, A.id, { age_14: true, terms: true });
  assert.equal(refused.ok, false, "필수 항목이 빠지면 기록하지 않는다");
  assert.ok((await getMemberStatus(repo, A.id)).isNew);

  assert.deepEqual(await agreeToTerms(repo, A.id, { age_14: true, terms: true, privacy: true }), { ok: true });
  await setMarketingConsent(repo, A.id, true);
  assert.deepEqual(await getMemberStatus(createSupabaseRepository(A.client), A.id), { needsConsent: false, isNew: false, marketing: true });

  const others = await B.client.from("user_consents").select().eq("user_id", A.id);
  assert.deepEqual(others.data, [], "다른 회원의 동의 기록은 보이지 않는다");
  assert.equal((await getMemberStatus(createSupabaseRepository(B.client), B.id)).needsConsent, true);

  const forged = await B.client.from("user_consents").insert({ user_id: B.id, consent_type: "terms", version: "x", agreed: true });
  assert.ok(forged.error, "브라우저에서 직접 동의 기록을 만들 수 없다");

  const edit = await admin.from("user_consents").update({ agreed: false }).eq("user_id", A.id);
  assert.match(edit.error?.message ?? "", /append-only|permission denied/, "서버도 동의 기록을 고칠 수 없다");
});

test("프로필 누락 보완: 테이블보다 먼저 가입한 회원도 로그인 · 결제 때 프로필이 채워지고, 다른 데이터는 그대로다", async () => {
  const C = await makeUser();
  // 가입 트리거가 없던 시절을 흉내 낸다: 프로필만 지운다 (서버 비밀키에는 삭제 권한이 없으므로 DB 관리자로)
  execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres", "-qc", `delete from public.profiles where id = '${C.id}'`]);
  const repo = createSupabaseRepository(admin);
  assert.equal(await repo.getProfile(C.id), null);
  const restored = await repo.ensureProfile(C.id);
  assert.equal(restored.userId, C.id);
  assert.match(restored.paymentCustomerKey, /^[0-9a-f-]{36}$/);
  // 다시 불러도 같은 프로필 (구매자 키가 바뀌지 않는다)
  assert.equal((await repo.ensureProfile(C.id)).paymentCustomerKey, restored.paymentCustomerKey);
  // 다른 회원(A)의 프로필 · 주문은 바뀌지 않는다
  const { data: aOrder } = await admin.from("orders").select("status").eq("id", orderId).single();
  assert.equal(aOrder?.status, "paid");
  await C.client.auth.signOut();
});

test("나를 더 반영하기: 서버가 소유자를 확인해 저장 · 삭제하고, 본인만 보며, 다른 회원 결과에는 붙지 않는다", async () => {
  const server = createSupabaseRepository(admin);
  const saved = await saveContext(server, { userId: A.id, assessmentId, raw: { topic: "work", question: "이직해도 될까요", excerpt: "연락처 010-1111-2222" }, agreed: true, now: () => new Date() });
  assert.equal(saved.kind, "saved");
  if (saved.kind !== "saved") return;
  assert.equal(saved.context.excerpt, "연락처 [연락처 가림]");

  const mine = await getContextView(createSupabaseRepository(A.client), { userId: A.id, assessmentId });
  assert.equal(mine?.context?.question, "이직해도 될까요");
  assert.equal(mine?.reportStatus, "ready");
  const others = await B.client.from("personal_contexts").select().eq("assessment_id", assessmentId);
  assert.deepEqual(others.data, [], "다른 회원에게는 보이지 않는다");
  const anonymous = await anon.from("personal_contexts").select();
  assert.ok(anonymous.error || anonymous.data?.length === 0);

  const direct = await A.client.from("personal_contexts").update({ question: "x" }).eq("assessment_id", assessmentId).select();
  assert.ok(direct.error || direct.data?.length === 0, "브라우저에서 직접 고칠 수 없다");
  const forged = await admin.from("personal_contexts").upsert({ assessment_id: assessmentId, user_id: B.id, topic: "love", agreed_at: new Date().toISOString() });
  assert.match(forged.error?.message ?? "", /owner mismatch/, "서버 코드 실수로도 다른 회원의 결과에 붙지 않는다");
  const tooLong = await admin.from("personal_contexts").update({ excerpt: "가".repeat(1501) }).eq("assessment_id", assessmentId);
  assert.ok(tooLong.error, "글자 수 제한은 DB에서도 지킨다");

  const edited = await saveContext(server, { userId: A.id, assessmentId, raw: { topic: "marriage" }, agreed: true, now: () => new Date() });
  assert.ok(edited.kind === "saved" && edited.context.question === "" && edited.context.topic === "marriage");
  assert.equal(await deleteContext(server, { userId: B.id, assessmentId }), false);
  assert.equal(await deleteContext(server, { userId: A.id, assessmentId }), true);
  assert.equal(await server.getContext(assessmentId), null);
});

test("카카오 로그인: 실제 Supabase Auth를 거쳐 카카오로 가는 요청에 이메일 동의가 없다 (KOE205 회귀 방지)", async () => {
  const kakaoScope = async (options: Record<string, unknown>) => {
    const c = createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, flowType: "pkce" } });
    const { data, error } = await c.auth.signInWithOAuth({ provider: "kakao", options: { skipBrowserRedirect: true, redirectTo: "http://127.0.0.1:4321/auth/callback", ...options } });
    if (error) throw error;
    const res = await fetch(data.url!, { redirect: "manual" });
    return new globalThis.URL(res.headers.get("location")!).searchParams.get("scope") ?? "";
  };
  // 미유가 쓰는 방식: 닉네임 · 프로필 사진만
  assert.equal(await kakaoScope(kakaoOAuthOptions("http://127.0.0.1:4321", "/my")), "profile_nickname profile_image");
  // 기본값과 scopes 방식은 account_email이 남는다 (그래서 쓰지 않는다)
  assert.match(await kakaoScope({}), /account_email/);
  assert.match(await kakaoScope({ scopes: "profile_nickname profile_image" }), /account_email/);
});


test("운영 기록(ops_events): 서버만 쓰고 읽으며, 로그인 사용자 · 비로그인은 접근할 수 없고, 고치거나 지울 수 없다", async () => {
  const repo = createSupabaseRepository(admin);
  const key = `t-${randomUUID()}`;
  const errorId = "ERR-TESTAB23";
  await repo.addOpsEvent({ kind: "test.event", severity: "warn", orderNumber: "MEU-TEST-OPS", errorId, dedupeKey: key, message: "테스트 기록", detail: { a: 1 } });
  assert.equal(await repo.hasOpsEventSince(key, new Date(Date.now() - 60_000).toISOString()), true);
  assert.equal(await repo.hasOpsEventSince(key, new Date(Date.now() + 60_000).toISOString()), false);
  const byError = await repo.listOpsEvents({ errorId, limit: 5 });
  assert.equal(byError[0]?.message, "테스트 기록");
  assert.equal(byError[0]?.severity, "warn");
  assert.equal((await repo.listOpsEvents({ orderNumber: "MEU-TEST-OPS", limit: 5 })).length >= 1, true);

  for (const client of [A.client, anon]) {
    const read = await client.from("ops_events").select();
    assert.ok(read.error || read.data?.length === 0, "읽기 거부");
    const write = await client.from("ops_events").insert({ kind: "x", message: "x" });
    assert.ok(write.error, "쓰기 거부");
  }
  const update = await admin.from("ops_events").update({ message: "바꿈" }).eq("dedupe_key", key);
  assert.ok(update.error, "고치기 거부");
  const del = await admin.from("ops_events").delete().eq("dedupe_key", key);
  assert.ok(del.error, "지우기 거부");
  assert.equal((await repo.listOpsEvents({ errorId, limit: 5 }))[0]?.message, "테스트 기록");
});

test("결제 기록의 출처: 재확인(reconcile) · 관리자(admin)는 허용되고 알 수 없는 출처는 거부된다", async () => {
  const repo = createSupabaseRepository(admin);
  await repo.addPaymentEvent({ orderId, source: "reconcile", status: "DONE", detail: {} });
  await repo.addPaymentEvent({ orderId, source: "admin", status: "DONE", detail: {} });
  const bad = await admin.from("payment_events").insert({ order_id: orderId, source: "bogus", status: "DONE", detail: {} });
  assert.ok(bad.error, "알 수 없는 출처 거부");
});

async function newPendingOrder(userId: string) {
  const repo = createSupabaseRepository(admin);
  const saved = await submitAssessment({ repo, saju: sajuEngine }, { userId, channel: "web", info, answers, today: new Date() });
  if (!saved.ok) throw new Error("save");
  const started = await startCheckout({ repo, now: () => new Date() }, { userId, assessmentId: saved.assessment.id });
  if (started.kind !== "order") throw new Error("order");
  return { repo, order: started.order, assessmentId: saved.assessment.id };
}

test("실제 DB 동시성: 같은 승인 요청이 6번 동시에 와도 결제 완료 1건 · 결제사 기록 1건 · 리포트 1건, 생성기는 한 번만 실행", async () => {
  const toss = createFakeToss();
  const { repo, order } = await newPendingOrder(B.id);
  const input = { userId: B.id, orderNumber: order.orderNumber, paymentKey: `pk-race-${randomUUID()}`, amount: order.amount };
  const results = await Promise.all(Array.from({ length: 6 }, () => confirmPayment({ repo, gateway: toss.gateway }, input)));
  assert.ok(results.every((r) => r.kind === "paid"), JSON.stringify(results.map((r) => (r.kind === "rejected" ? `${r.code}:${r.message}` : r.kind))));
  assert.equal(toss.byKey.size, 1);
  const rows = await admin.from("orders").select("id, status").eq("order_number", order.orderNumber);
  assert.equal(rows.data?.length, 1);
  assert.equal(rows.data?.[0]?.status, "paid");

  const paid = (await repo.getOrderByNumber(order.orderNumber))!;
  let generated = 0;
  const generator = { ...devReportGenerator, async generate(i: Parameters<typeof devReportGenerator.generate>[0]) { generated++; return devReportGenerator.generate(i); } };
  await Promise.all(Array.from({ length: 6 }, () => queueReport({ repo }, paid)));
  await Promise.all(Array.from({ length: 6 }, () => runReport({ repo, generator, now: () => new Date() }, paid)));
  assert.equal(generated, 1, "같은 리포트를 여러 번 생성하지 않는다");
  const reports = await admin.from("reports").select("id, status").eq("order_id", paid.id);
  assert.equal(reports.data?.length, 1);
  assert.equal(reports.data?.[0]?.status, "ready");
});

test("실제 DB: 승인은 됐는데 응답이 끊긴 주문을 재확인이 주문번호로 찾아 결제 완료로 맞추고, 반복해도 변하지 않는다", async () => {
  const toss = createFakeToss();
  const { repo, order } = await newPendingOrder(B.id);
  toss.state.confirmMode = "approve-then-lost";
  const lostKey = `pk-lost-${randomUUID()}`;
  const first = await confirmPayment({ repo, gateway: toss.gateway }, { userId: B.id, orderNumber: order.orderNumber, paymentKey: lostKey, amount: order.amount });
  assert.equal(first.kind, "checking");
  assert.equal((await repo.getOrderByNumber(order.orderNumber))?.status, "pending", "응답을 못 받았다고 실패로 바꾸지 않는다");

  // 결제 요청 시각을 5분 전으로 (결제 진행 중일 수 있는 시간이 지난 뒤의 재확인)
  await admin.from("orders").update({ created_at: new Date(Date.now() - 5 * 60_000).toISOString() }).eq("order_number", order.orderNumber);
  const queued: string[] = [];
  const deps = { repo, gateway: toss.gateway, now: () => new Date(), onPaid: async (o: { orderNumber: string }) => void queued.push(o.orderNumber) };
  const r = await reconcileOrder(deps, (await repo.getOrderByNumber(order.orderNumber))!);
  assert.equal(r.kind, "paid");
  assert.equal((await repo.getOrderByNumber(order.orderNumber))?.paymentKey, lostKey);
  for (let i = 0; i < 3; i++) assert.equal((await reconcileOrder(deps, (await repo.getOrderByNumber(order.orderNumber))!)).kind, "ok");
  assert.deepEqual(queued, [order.orderNumber], "리포트 준비는 한 번만");
  const events = await repo.listPaymentEvents((await repo.getOrderByNumber(order.orderNumber))!.id);
  assert.ok(events.some((e) => e.source === "reconcile" && e.status === "DONE"));
});

test("실제 DB: 결제사에서 취소된 결제를 재확인이 환불됨으로 맞추고, 같은 검사에 결제 완료 주문이 둘이 되지 않는다", async () => {
  const toss = createFakeToss();
  const { repo, order } = await newPendingOrder(B.id);
  const cancelKey = `pk-cancel-${randomUUID()}`;
  const input = { userId: B.id, orderNumber: order.orderNumber, paymentKey: cancelKey, amount: order.amount };
  assert.equal((await confirmPayment({ repo, gateway: toss.gateway }, input)).kind, "paid");
  toss.cancel(cancelKey);
  const deps = { repo, gateway: toss.gateway, now: () => new Date() };
  assert.equal((await reconcileOrder(deps, (await repo.getOrderByNumber(order.orderNumber))!)).kind, "refunded");
  assert.equal((await repo.getOrderByNumber(order.orderNumber))?.status, "refunded");
  const view = await getResultView(repo, { userId: B.id, assessmentId: order.assessmentId });
  assert.equal(view?.paidOrder, null, "환불된 주문은 열람 권한이 없다");
  assert.equal(view?.refunded, true);
});


test("AI 사용 기록(ai_usage): 서버만 쓰고 읽으며, 접근 정책 · 쌓기만 가능 · 비용 합계와 생성 수 집계가 실제 DB에서 동작한다", async () => {
  const repo = createSupabaseRepository(admin);
  const reportId = randomUUID();
  const t0 = new Date(Date.now() - 1000).toISOString();
  await repo.addAiUsage({ reportId, provider: "fake", model: "m", promptVersion: "p", inputTokens: 100, outputTokens: 200, estCostKrw: 12.3456, latencyMs: 800, outcome: "ok", errorCode: null });
  await repo.addAiUsage({ reportId, provider: "fake", model: "m", promptVersion: "p", inputTokens: null, outputTokens: null, estCostKrw: null, latencyMs: 30, outcome: "timeout", errorCode: "TIMEOUT" });
  const rows = (await repo.listAiUsageSince(t0, 50)).filter((r) => r.reportId === reportId);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.outcome === "ok")?.estCostKrw, 12.3456);
  assert.equal(rows.find((r) => r.outcome === "timeout")?.inputTokens, null);

  for (const client of [A.client, anon]) {
    const read = await client.from("ai_usage").select();
    assert.ok(read.error || read.data?.length === 0, "읽기 거부");
    const write = await client.from("ai_usage").insert({ provider: "x", model: "x", prompt_version: "x", latency_ms: 1, outcome: "ok" });
    assert.ok(write.error, "쓰기 거부");
  }
  assert.ok((await admin.from("ai_usage").update({ outcome: "error" }).eq("report_id", reportId)).error, "고치기 거부");
  assert.ok((await admin.from("ai_usage").delete().eq("report_id", reportId)).error, "지우기 거부");
  const bad = await admin.from("ai_usage").insert({ provider: "x", model: "x", prompt_version: "x", latency_ms: 1, outcome: "weird" });
  assert.ok(bad.error, "알 수 없는 결과 값 거부");
});

test("실제 DB: 생성 중 · 대기 중 리포트 수 집계와 하루 검사 수 집계 (멈춘 생성은 제외)", async () => {
  const repo = createSupabaseRepository(admin);
  const { order } = await newPendingOrder(B.id);
  const input = { userId: B.id, orderNumber: order.orderNumber, paymentKey: `pk-cap-${randomUUID()}`, amount: order.amount };
  const paidResult = await confirmPayment({ repo, gateway: createFakeToss().gateway }, input);
  if (paidResult.kind !== "paid") throw new Error(paidResult.kind);
  const staleBefore = () => new Date(Date.now() - 5 * 60_000).toISOString();

  const q0 = await repo.countQueuedReports();
  const g0 = await repo.countActiveGenerations(staleBefore());
  const report = await queueReport({ repo }, paidResult.order);
  assert.ok(report);
  assert.equal(await repo.countQueuedReports(), q0 + 1);
  const claimed = await repo.updateReport(report.id, ["queued"], { status: "generating", attempts: 1 }, 0);
  assert.ok(claimed);
  assert.equal(await repo.countQueuedReports(), q0);
  assert.equal(await repo.countActiveGenerations(staleBefore()), g0 + 1);
  // 기준 시각보다 오래 멈춘 생성은 세지 않는다 (기준을 미래로 두면 지금 생성 중인 것도 "멈춘 것")
  assert.equal(await repo.countActiveGenerations(new Date(Date.now() + 60_000).toISOString()), 0);
  await repo.updateReport(report.id, ["generating"], { status: "failed", lastError: "테스트 정리" }); // 생성 중으로 남겨 두지 않는다
  assert.ok((await repo.countAssessmentsSince(B.id, new Date(Date.now() - 24 * 3600_000).toISOString())) >= 1);
  assert.equal(await repo.countAssessmentsSince(B.id, new Date(Date.now() + 60_000).toISOString()), 0);
});
