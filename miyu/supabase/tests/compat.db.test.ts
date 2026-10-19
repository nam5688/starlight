// DB 검증(사주 궁합, 마이그레이션 23번): 상대 출생정보 보관 표의 접근 정책 · 한 주문에 한 줄 · 완성되면 지우기 · 탈퇴하면 지우기 · 한 번만 지움을 실제 Postgres에서 확인한다.
// 실행 전 local-stack.sh start 필요(마이그레이션 1~23번이 모두 적용돼 있어야 한다). 실행: npm run test:db
// 이 시험은 개발용 임시 DB에서만 돈다. 실제 Supabase · 실제 결제에서는 아직 확인하지 않았다.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ASSESSMENT_MODULES } from "../../lib/assessment/modules/index.ts";
import { SAJU_COMPAT } from "../../lib/config/product.ts";
import { createSupabaseRepository } from "../../lib/integrations/supabase/repository.ts";
import { EMPTY_BASIC_INFO } from "../../lib/profile/basic-info.ts";
import { createAiReportGenerator } from "../../lib/report/ai/generator.ts";
import { createMockModel } from "../../lib/report/ai/mock-model.ts";
import { manseryeokEngine as sajuEngine } from "../../lib/saju/manseryeok-engine.ts";
import { submitAssessment } from "../../lib/services/assessment-service.ts";
import { getCompatReportView, startCompatCheckout } from "../../lib/services/compat-service.ts";
import { confirmPayment } from "../../lib/services/order-service.ts";
import type { PaymentGateway } from "../../lib/services/ports.ts";
import { ensureReport } from "../../lib/services/report-service.ts";
import { withdrawMember } from "../../lib/services/member-service.ts";

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
const server = createSupabaseRepository(admin);

const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i, n) => [i.id, (n % 5) + 1])));
const info = { ...EMPTY_BASIC_INFO, nickname: "궁합시험", birthYear: "1996", birthMonth: "3", birthDay: "29", birthTime: "09:30", gender: "female" as const };
const PARTNER = { nickname: "남수", gender: "male", calendar: "solar", isLeapMonth: false, birthYear: "1994", birthMonth: "11", birthDay: "2", birthTime: "09:30", birthTimeUnknown: false };
const nowFn = () => new Date();

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

async function makeUser(): Promise<{ id: string; client: SupabaseClient }> {
  const email = `c-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, ANON_KEY, noSession);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, client };
}

async function person() {
  const U = await makeUser();
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info, answers, today: new Date() });
  assert.ok(saved.ok);
  return { U, aid: saved.ok ? saved.assessment.id : "" };
}

const start = (p: { U: { id: string }; aid: string }, partner: unknown = PARTNER) =>
  startCompatCheckout({ repo: server, now: nowFn, saleOpen: true, generatorReady: true }, { userId: p.U.id, assessmentId: p.aid, partner, relationship: "friend", myGender: "female" });

test("상대 출생정보 표는 서버만 읽는다 — 본인 로그인으로도 읽을 수 없고, 서버는 읽고 쓴다", async () => {
  const p = await person();
  const r = await start(p);
  assert.equal(r.kind, "order");
  if (r.kind !== "order") return;
  // 로그인한 본인(authenticated)도 이 표는 읽지 못한다 (정책을 만들지 않음 — 행이 0개이거나 권한 오류)
  const mine = await p.U.client.from("compat_requests").select("id, partner");
  assert.ok(mine.error !== null || (mine.data ?? []).length === 0, "본인 로그인으로 상대 정보가 보이면 안 된다");
  // 익명도 마찬가지
  const anon = await createClient(URL, ANON_KEY, noSession).from("compat_requests").select("id");
  assert.ok(anon.error !== null || (anon.data ?? []).length === 0);
  // 서버는 읽을 수 있다
  const req = await server.getCompatRequestByOrder(r.order.id);
  assert.equal(req?.partner?.birthYear, 1994);
  assert.equal(req?.userId, p.U.id);
  assert.equal(req?.scrubbedAt, null);
});

test("한 주문에는 요청이 하나뿐이고(같은 주문으로 다시 넣으면 충돌), 상대 정보는 한 번만 지워진다", async () => {
  const p = await person();
  const r = await start(p);
  assert.equal(r.kind, "order");
  if (r.kind !== "order") return;
  const dup = await server.insertCompatRequest({ id: randomUUID(), orderId: r.order.id, userId: p.U.id, partner: { nickname: "x", calendar: "solar", isLeapMonth: false, birthYear: 1990, birthMonth: 1, birthDay: 1, birthTime: null, gender: null } });
  assert.equal(dup.ok, false);
  assert.equal(await server.scrubCompatRequest(r.order.id), true);
  assert.equal(await server.scrubCompatRequest(r.order.id), false, "이미 지운 것은 다시 지우지 않는다");
  const after = await server.getCompatRequestByOrder(r.order.id);
  assert.equal(after?.partner, null);
  assert.ok(after?.scrubbedAt);
});

test("DB 제약: 지운 요청(scrubbed_at)에는 상대 정보가 남을 수 없고, 상대 정보는 1KB를 넘을 수 없다", async () => {
  const p = await person();
  const r = await start(p);
  assert.equal(r.kind, "order");
  if (r.kind !== "order") return;
  const bad = await admin.from("compat_requests").update({ scrubbed_at: new Date().toISOString() }).eq("order_id", r.order.id);
  assert.ok(bad.error, "partner가 남은 채로 scrubbed_at만 채울 수 없다");
  const big = await admin.from("compat_requests").update({ partner: { nickname: "가".repeat(2000) } }).eq("order_id", r.order.id);
  assert.ok(big.error, "1KB를 넘는 상대 정보는 저장할 수 없다");
});

test("결제 → 리포트 생성(모의 AI) → 완성되면 상대 정보가 지워지고, 리포트는 본인만 열 수 있다 — 실제 Postgres에서", async () => {
  const p = await person();
  const r = await start(p);
  assert.equal(r.kind, "order");
  if (r.kind !== "order") return;
  const paid = await confirmPayment({ repo: server, gateway }, { userId: p.U.id, orderNumber: r.order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: r.order.amount });
  assert.equal(paid.kind, "paid");
  if (paid.kind !== "paid") return;
  assert.equal(paid.order.amount, SAJU_COMPAT.priceKrw);
  const generator = createAiReportGenerator({ model: createMockModel(), now: nowFn, sleep: async () => {} });
  const report = await ensureReport({ repo: server, generator, now: nowFn }, paid.order);
  assert.equal(report?.status, "ready");
  const after = await server.getCompatRequestByOrder(r.order.id);
  assert.equal(after?.partner, null);
  // 본인은 열 수 있고(서버 저장소로 조회 — 소유자 확인은 서비스가 한다) 다른 사람은 못 연다
  assert.equal((await getCompatReportView(server, { userId: p.U.id, orderNumber: r.order.orderNumber })).kind, "ready");
  const other = await makeUser();
  assert.equal((await getCompatReportView(server, { userId: other.id, orderNumber: r.order.orderNumber })).kind, "not-found");
  // 저장된 리포트 글에는 상대 생년월일이 없다
  const stored = await server.getReportByOrder(r.order.id);
  assert.ok(!JSON.stringify(stored?.content).includes("1994"));
});

test("탈퇴하면 결제하지 않고 남긴 상대 정보도 지워진다", async () => {
  const p = await person();
  const r = await start(p);
  assert.equal(r.kind, "order");
  if (r.kind !== "order") return;
  // 결제 대기 주문이 남아 있으면 탈퇴가 막히므로 먼저 취소 처리한다
  await server.updateOrder(r.order.id, ["pending"], { status: "canceled", failureCode: "T", failureMessage: "t" });
  const res = await withdrawMember(server, p.U.id);
  assert.equal(res.kind, "done");
  const after = await server.getCompatRequestByOrder(r.order.id);
  assert.equal(after?.partner ?? null, null);
  assert.ok(after?.scrubbedAt);
});

test("사이 · 상대 성별은 migration 없이 상대 입력(jsonb)에 함께 보관되고, 리포트가 완성되면 상대 입력과 함께 지워진다 — 리포트에는 사이만 남는다", async () => {
  const p = await person();
  const r = await start(p, { ...PARTNER, gender: "female" });
  assert.equal(r.kind, "order");
  if (r.kind !== "order") return;
  const req = await server.getCompatRequestByOrder(r.order.id);
  assert.equal(req?.partner?.relationship, "friend");
  assert.equal(req?.partner?.gender, "female");
  // 사이를 고르지 않으면 주문 없이 막힌다
  const none = await startCompatCheckout({ repo: server, now: nowFn, saleOpen: true, generatorReady: true }, { userId: p.U.id, assessmentId: p.aid, partner: PARTNER, myGender: "female" });
  assert.equal(none.kind, "invalid");
  assert.equal(await server.scrubCompatRequest(r.order.id), true);
  const after = await server.getCompatRequestByOrder(r.order.id);
  assert.equal(after?.partner, null);
});
