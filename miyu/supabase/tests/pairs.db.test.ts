// DB 검증(리포트 궁합, 마이그레이션 24번): 쌍 표의 접근 정책 · 한 번에 한 명만 연결 · 본인 · 기간 · 연결 해제 · 동의 철회 · 탈퇴(검사 결과가 지워져도 탈퇴가 막히지 않음) · 쌍마다 결제 완료 주문 하나 · 두 사람의 열람을 실제 Postgres에서 확인한다.
// 실행 전 local-stack.sh start 필요(마이그레이션 1~26번이 모두 적용돼 있어야 한다). 실행: npm run test:db
// 이 시험은 개발용 임시 DB에서만 돈다. 실제 Supabase · 실제 결제에서는 아직 확인하지 않았다.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ASSESSMENT_MODULES } from "../../lib/assessment/modules/index.ts";
import { PAIR_COMPAT, pairProductId } from "../../lib/config/product.ts";
import { createSupabasePairRepository } from "../../lib/integrations/supabase/pairs.ts";
import { createSupabaseRepository } from "../../lib/integrations/supabase/repository.ts";
import { EMPTY_BASIC_INFO } from "../../lib/profile/basic-info.ts";
import { createAiReportGenerator } from "../../lib/report/ai/generator.ts";
import { createMockModel } from "../../lib/report/ai/mock-model.ts";
import { manseryeokEngine as sajuEngine } from "../../lib/saju/manseryeok-engine.ts";
import { submitAssessment } from "../../lib/services/assessment-service.ts";
import { withdrawMember } from "../../lib/services/member-service.ts";
import { applyPayment, confirmPayment } from "../../lib/services/order-service.ts";
import { createPairInvite, getPairView, joinPairInvite, startPairCheckout, unlinkPair, withdrawPairConsent, type PairDeps } from "../../lib/services/pair-service.ts";
import type { PaymentGateway } from "../../lib/services/ports.ts";
import { ensureReport } from "../../lib/services/report-service.ts";

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
const pairs = createSupabasePairRepository(admin);

const answers = (v: number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, v])));
const nowFn = () => new Date();
const deps: PairDeps = { repo: server, pairs, now: nowFn, saleOpen: true, generatorReady: true };

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
  const email = `p-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, ANON_KEY, noSession);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, client };
}

async function person(nickname = "쌍시험", v = 4, birthYear = "1996") {
  const U = await makeUser();
  const info = { ...EMPTY_BASIC_INFO, nickname, birthYear, birthMonth: "3", birthDay: "29", birthTime: "09:30", gender: "female" as const };
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info, answers: answers(v), today: new Date() });
  assert.ok(saved.ok);
  return { U, aid: saved.ok ? saved.assessment.id : "" };
}

async function linked() {
  const a = await person("슬기", 4, "1996");
  const b = await person("남수", 2, "1994");
  const inv = await createPairInvite(deps, { userId: a.U.id, assessmentId: a.aid, consent: true, relationship: "friend", myGender: "female" });
  assert.equal(inv.kind, "created");
  if (inv.kind !== "created") throw new Error("초대 실패");
  const joined = await joinPairInvite(deps, { token: inv.pair.token, userId: b.U.id, consent: true, myGender: "female" });
  assert.equal(joined.kind, "joined");
  return { a, b, pair: inv.pair };
}

async function buy(pairId: string, userId: string) {
  const r = await startPairCheckout(deps, { userId, pairId });
  if (r.kind !== "order") throw new Error(`주문 실패: ${r.kind}`);
  const paid = await confirmPayment({ repo: server, gateway }, { userId, orderNumber: r.order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: r.order.amount });
  if (paid.kind !== "paid") throw new Error("결제 실패");
  return paid.order;
}

const generator = () => createAiReportGenerator({ model: createMockModel(), now: nowFn, sleep: async () => {} });

test("쌍 표 · 함수는 서버만 쓴다 — 로그인한 본인 · 익명은 표를 읽지 못하고 함수를 부르지 못한다", async () => {
  const { a, pair } = await linked();
  const mine = await a.U.client.from("pairs").select("id");
  assert.ok(mine.error !== null || (mine.data ?? []).length === 0, "본인 로그인으로도 쌍이 보이면 안 된다");
  const anon = await createClient(URL, ANON_KEY, noSession).from("pairs").select("id");
  assert.ok(anon.error !== null || (anon.data ?? []).length === 0);
  const rpc = await a.U.client.rpc("pair_join", { p_token: pair.token, p_user: a.U.id, p_assessment: a.aid, p_consent_version: "x" });
  assert.ok(rpc.error, "로그인한 본인이 연결 함수를 직접 부를 수 없다");
  const rpc2 = await a.U.client.rpc("pair_withdraw_consent", { p_pair: pair.id, p_user: a.U.id });
  assert.ok(rpc2.error);
  assert.equal((await pairs.getPair(pair.id))?.status, "linked", "서버는 읽는다");
});

test("같은 초대에 동시에 여러 명이 들어와도 한 명만 연결된다", async () => {
  const a = await person("슬기");
  const inv = await createPairInvite(deps, { userId: a.U.id, assessmentId: a.aid, consent: true, relationship: "friend", myGender: "female" });
  assert.equal(inv.kind, "created");
  if (inv.kind !== "created") return;
  const others = await Promise.all(Array.from({ length: 6 }, (_, i) => person(`동시${i}`, 3)));
  const results = await Promise.all(others.map((o) => joinPairInvite(deps, { token: inv.pair.token, userId: o.U.id, consent: true, myGender: "female" })));
  assert.equal(results.filter((r) => r.kind === "joined").length, 1);
  assert.equal(results.filter((r) => r.kind === "taken").length, 5);
  const rec = await pairs.getPair(inv.pair.id);
  assert.equal(rec?.status, "linked");
  assert.ok(rec?.bUserId && others.some((o) => o.U.id === rec.bUserId));
});

test("연결 보호: 본인 · 만료 · 남의 검사 결과 · 끊긴 초대", async () => {
  const a = await person("슬기");
  const b = await person("남수");
  const inv = await createPairInvite(deps, { userId: a.U.id, assessmentId: a.aid, consent: true, relationship: "friend", myGender: "female" });
  assert.equal(inv.kind, "created");
  if (inv.kind !== "created") return;
  assert.equal((await joinPairInvite(deps, { token: inv.pair.token, userId: a.U.id, consent: true, myGender: "female" })).kind, "self");
  assert.equal((await joinPairInvite(deps, { token: inv.pair.token, userId: b.U.id, consent: true, assessmentId: a.aid, myGender: "female" })).kind, "bad-assessment");
  await admin.from("pairs").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", inv.pair.id);
  assert.equal((await joinPairInvite(deps, { token: inv.pair.token, userId: b.U.id, consent: true, myGender: "female" })).kind, "expired");
  await admin.from("pairs").update({ expires_at: new Date(Date.now() + 86_400_000).toISOString() }).eq("id", inv.pair.id);
  assert.equal((await unlinkPair(deps, { userId: a.U.id, pairId: inv.pair.id })).kind, "done");
  assert.equal((await joinPairInvite(deps, { token: inv.pair.token, userId: b.U.id, consent: true, myGender: "female" })).kind, "closed");
});

test("DB 제약: 연결됨은 상대가 있어야 하고, 본인과 연결할 수 없고, 끊김은 시각이 있어야 한다", async () => {
  const a = await person("슬기");
  const id = randomUUID();
  const base = { id, token: `t${randomUUID().replace(/-/g, "")}`, a_user_id: a.U.id, a_assessment_id: a.aid, a_consent_at: new Date().toISOString(), a_consent_version: "v1", expires_at: new Date(Date.now() + 86_400_000).toISOString() };
  assert.ok((await admin.from("pairs").insert({ ...base, status: "linked" })).error, "상대 없이 연결됨 불가");
  assert.ok((await admin.from("pairs").insert({ ...base, token: `t${randomUUID().replace(/-/g, "")}`, id: randomUUID(), status: "unlinked" })).error, "끊김은 시각이 필요하다");
  assert.ok((await admin.from("pairs").insert({ ...base, token: `t${randomUUID().replace(/-/g, "")}`, id: randomUUID(), b_user_id: a.U.id, b_assessment_id: a.aid, b_consent_at: new Date().toISOString(), b_consent_version: "v1" })).error, "본인과는 연결할 수 없다");
  assert.ok((await admin.from("pairs").insert({ ...base, token: "short" })).error, "토큰 모양");
});

test("연결 해제 · 동의 철회는 서로 다르다 — 해제는 철회 시각을 남기지 않고, 철회는 남긴다. 구성원이 아니면 바꿀 수 없다", async () => {
  const { a, b, pair } = await linked();
  const out = await person("외부");
  assert.equal((await unlinkPair(deps, { userId: out.U.id, pairId: pair.id })).kind, "not-found");
  assert.equal((await unlinkPair(deps, { userId: b.U.id, pairId: pair.id })).kind, "done");
  let rec = await pairs.getPair(pair.id);
  assert.equal(rec?.status, "unlinked");
  assert.equal(rec?.aWithdrawnAt, null);
  assert.equal(rec?.bWithdrawnAt, null);
  assert.equal(rec?.unlinkedBy, b.U.id);
  assert.equal((await withdrawPairConsent(deps, { userId: a.U.id, pairId: pair.id })).kind, "done");
  rec = await pairs.getPair(pair.id);
  assert.ok(rec?.aWithdrawnAt);
  assert.equal(rec?.bWithdrawnAt, null);
  assert.equal(rec?.unlinkedBy, b.U.id, "처음 끊은 사람이 그대로 남는다");
});

test("쌍마다 결제 완료 주문은 하나 — 한 사람이 결제하면 상대의 두 번째 결제는 DB가 막는다", async () => {
  const { a, b, pair } = await linked();
  const first = await buy(pair.id, a.U.id);
  assert.equal(first.productId, pairProductId(pair.id));
  assert.equal(first.amount, PAIR_COMPAT.priceKrw);
  assert.equal((await startPairCheckout(deps, { userId: b.U.id, pairId: pair.id })).kind, "already-paid");
  // 서비스를 거치지 않은 동시 결제(상대가 먼저 결제창을 열어 두었던 경우)도 DB 고유 조건이 두 번째 승인을 막는다
  const second = await server.insertOrder({ orderNumber: `ORD-${randomUUID().slice(0, 12)}`, userId: b.U.id, assessmentId: b.aid, productId: pairProductId(pair.id), amount: PAIR_COMPAT.priceKrw, paymentEnv: "test", acquisition: null });
  assert.ok(second.ok);
  if (!second.ok) return;
  const r = await confirmPayment({ repo: server, gateway }, { userId: b.U.id, orderNumber: second.value.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: second.value.amount }).catch((e) => ({ kind: "error" as const, e }));
  assert.notEqual(r.kind, "paid", "같은 쌍의 두 번째 결제 완료는 만들어지지 않는다");
  const { data } = await admin.from("orders").select("id").eq("product_id", pairProductId(pair.id)).eq("status", "paid");
  assert.equal((data ?? []).length, 1);
});

test("결제 → 리포트 생성(모의 AI) → 두 사람이 같은 글을 읽고, 철회 · 환불에 따라 열람이 갈린다 — 실제 Postgres에서", async () => {
  const { a, b, pair } = await linked();
  const order = await buy(pair.id, b.U.id);
  const report = await ensureReport({ repo: server, pairs, generator: generator(), now: nowFn }, order);
  assert.equal(report?.status, "ready");
  const va = await getPairView(deps, { pairId: pair.id, userId: a.U.id });
  const vb = await getPairView(deps, { pairId: pair.id, userId: b.U.id });
  assert.ok(va.kind === "ok" && va.report.state === "ready" && va.youAre === "A님");
  assert.ok(vb.kind === "ok" && vb.report.state === "ready" && vb.youAre === "B님");
  const stored = JSON.stringify((await server.getReportByOrder(order.id))?.content);
  for (const secret of ["슬기", "남수", "1996", "1994", a.U.id, b.U.id]) assert.ok(!stored.includes(secret), `저장된 글에 ${secret}이 있으면 안 된다`);
  // A가 동의를 철회하면 A만 막힌다
  assert.equal((await withdrawPairConsent(deps, { userId: a.U.id, pairId: pair.id })).kind, "done");
  const va2 = await getPairView(deps, { pairId: pair.id, userId: a.U.id });
  const vb2 = await getPairView(deps, { pairId: pair.id, userId: b.U.id });
  assert.ok(va2.kind === "ok" && va2.report.state === "blocked" && va2.report.why === "withdrawn");
  assert.ok(vb2.kind === "ok" && vb2.report.state === "ready");
  // 환불되면 B도 막힌다
  const canceled = { paymentKey: order.paymentKey!, orderId: order.orderNumber, status: "CANCELED" as const, totalAmount: order.amount, balanceAmount: 0, method: "카드", approvedAt: new Date().toISOString(), mId: "test-mid" };
  assert.equal((await applyPayment(server, order, canceled, "reconcile")).kind, "updated");
  const vb3 = await getPairView(deps, { pairId: pair.id, userId: b.U.id });
  assert.ok(vb3.kind === "ok" && vb3.report.state === "blocked" && vb3.report.why === "refunded");
});

test("탈퇴: 주문이 없는 검사 결과가 지워져도 탈퇴가 막히지 않고, 쌍은 끊겨 철회로 남으며, 상대가 결제한 글은 계속 읽는다", async () => {
  const { a, b, pair } = await linked();
  const order = await buy(pair.id, b.U.id);
  await ensureReport({ repo: server, pairs, generator: generator(), now: nowFn }, order);
  // A는 주문이 없어 검사 결과가 통째로 지워진다 — 이 표가 외래 키로 막으면 탈퇴가 실패한다
  assert.equal((await withdrawMember(server, a.U.id)).kind, "done");
  assert.equal(await server.getAssessment(a.aid), null, "주문이 없는 검사 결과는 지워진다");
  const rec = await pairs.getPair(pair.id);
  assert.equal(rec?.status, "unlinked");
  assert.ok(rec?.aWithdrawnAt, "탈퇴는 철회로 기록된다");
  assert.equal(rec?.bWithdrawnAt, null);
  const vb = await getPairView(deps, { pairId: pair.id, userId: b.U.id });
  assert.ok(vb.kind === "ok" && vb.report.state === "ready" && vb.otherNickname === null, "상대는 이미 완성된 글을 계속 읽고 탈퇴한 사람의 이름은 보이지 않는다");
});

test("탈퇴: 상대가 들어오지 않은 초대는 지워지고, 결제하지 않은 연결 쌍은 끊긴다", async () => {
  const lone = await person("혼자");
  const inv = await createPairInvite(deps, { userId: lone.U.id, assessmentId: lone.aid, consent: true, relationship: "friend", myGender: "female" });
  assert.equal(inv.kind, "created");
  const { a, pair } = await linked();
  assert.equal((await withdrawMember(server, lone.U.id)).kind, "done");
  if (inv.kind === "created") assert.equal(await pairs.getPair(inv.pair.id), null);
  assert.equal((await withdrawMember(server, a.U.id)).kind, "done");
  assert.equal((await pairs.getPair(pair.id))?.status, "unlinked");
});

// ── DB 변경 26번: pairs.relationship(무슨 사이인가요?) ─────────────────────────────────────────────

test("26번: 사이는 정해진 여섯 값만 들어가고, 비어 있는 예전 쌍(null)도 그대로 읽히며, 연결해도 사이는 바뀌지 않는다", async () => {
  const base = (token: string) => ({ id: randomUUID(), token, a_user_id: "", a_assessment_id: randomUUID(), a_consent_at: new Date().toISOString(), a_consent_version: "v1", expires_at: new Date(Date.now() + 86_400_000).toISOString() });
  const owner = await person("슬기", 4, "1996"); // 직접 넣는 행의 주인(열린 초대 수 한도에 걸리지 않게 서비스 흐름과 다른 사람으로)
  const row = (relationship?: string) => ({ ...base(randomUUID().replace(/-/g, "").slice(0, 24)), a_user_id: owner.U.id, ...(relationship === undefined ? {} : { relationship }) });
  // 정해진 여섯 값은 들어가고, 그 밖의 값은 DB가 거부한다
  for (const rel of ["lover", "engaged", "some", "married", "friend", "other"]) {
    const ok = await admin.from("pairs").insert(row(rel)).select().single();
    assert.equal(ok.error, null, rel);
    assert.equal(ok.data?.relationship, rel);
  }
  for (const bad of ["boyfriend", "LOVER", "연인", ""]) {
    const r = await admin.from("pairs").insert(row(bad));
    assert.ok(r.error, `${bad}는 거부돼야 한다`);
    assert.equal(r.error?.code, "23514");
  }
  // 사이를 넣지 않은 예전 모양의 쌍도 만들어지고 null로 읽힌다(특정 관계로 채워지지 않는다)
  const legacy = await admin.from("pairs").insert(row()).select().single();
  assert.equal(legacy.error, null);
  assert.equal(legacy.data?.relationship, null);
  assert.equal((await pairs.getPair(legacy.data!.id))?.relationship, null);
  const a = await person("슬기", 4, "1996");
  // 서비스로 만든 쌍: 사이가 저장되고, 연결(pair_join 함수)해도 그대로이며, 두 사람의 쌍 화면에 같은 사이가 보인다
  const b = await person("남수", 2, "1994");
  const inv = await createPairInvite(deps, { userId: a.U.id, assessmentId: a.aid, consent: true, relationship: "married", myGender: "female" });
  if (inv.kind !== "created") throw new Error("초대 실패");
  assert.equal(inv.pair.relationship, "married");
  assert.equal((await joinPairInvite(deps, { token: inv.pair.token, userId: b.U.id, consent: true, myGender: "female" })).kind, "joined");
  assert.equal((await pairs.getPair(inv.pair.id))?.relationship, "married");
  for (const u of [a, b]) {
    const v = await getPairView(deps, { pairId: inv.pair.id, userId: u.U.id });
    assert.ok(v.kind === "ok" && v.relationship === "married");
  }
  // 로그인한 본인은 이 표를 읽지 못한다(정책 없음 — 사이 열도 마찬가지)
  const mine = await a.U.client.from("pairs").select("relationship");
  assert.ok(mine.error !== null || (mine.data ?? []).length === 0);
});

test("26번: 사이를 알려 준 쌍은 결제 → 생성(모의 AI) → 두 사람이 같은 글(같은 사이)을 읽는다 · 사이를 고르지 않거나 분석 때와 다른 성별이면 DB에 쌍이 생기지 않는다", async () => {
  const a = await person("슬기", 4, "1996");
  const b = await person("남수", 2, "1994");
  const before = (await pairs.listPairsForUser(a.U.id)).length;
  assert.equal((await createPairInvite(deps, { userId: a.U.id, assessmentId: a.aid, consent: true, relationship: "", myGender: "female" })).kind, "invalid");
  assert.equal((await createPairInvite(deps, { userId: a.U.id, assessmentId: a.aid, consent: true, relationship: "some", myGender: "male" })).kind, "invalid", "분석 때 여자로 입력했으면 남자로 덮어쓰지 않는다");
  assert.equal((await pairs.listPairsForUser(a.U.id)).length, before);
  const inv = await createPairInvite(deps, { userId: a.U.id, assessmentId: a.aid, consent: true, relationship: "some", myGender: "female" });
  if (inv.kind !== "created") throw new Error("초대 실패");
  assert.equal((await joinPairInvite(deps, { token: inv.pair.token, userId: b.U.id, consent: true, myGender: "male" })).kind, "invalid", "분석 때 여자로 입력한 사람이 남자를 고르면 연결되지 않는다");
  assert.equal((await pairs.getPair(inv.pair.id))?.status, "invited");
  assert.equal((await joinPairInvite(deps, { token: inv.pair.token, userId: b.U.id, consent: true, myGender: "female" })).kind, "joined");
  const order = await buy(inv.pair.id, b.U.id);
  const report = await ensureReport({ repo: server, pairs, generator: generator(), now: nowFn }, order);
  assert.equal(report?.status, "ready");
  const va = await getPairView(deps, { pairId: inv.pair.id, userId: a.U.id });
  const vb = await getPairView(deps, { pairId: inv.pair.id, userId: b.U.id });
  assert.ok(va.kind === "ok" && vb.kind === "ok" && va.report.state === "ready" && vb.report.state === "ready");
  if (va.kind === "ok" && vb.kind === "ok" && va.report.state === "ready" && vb.report.state === "ready") {
    assert.equal(va.report.report.relationship, "some");
    assert.deepEqual(va.report.report, vb.report.report);
  }
});
