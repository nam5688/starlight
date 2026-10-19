// 실행: npm test — 리포트 궁합(유료 2): 초대 · 동의 · 연결 · 결제는 쌍마다 한 번 · 두 사람이 같은 글을 읽는 권한 · 해제 · 철회 · 환불 · 탈퇴 · 저장된 글의 개인정보 · 사주 궁합과의 일치.
// 메모리 저장소 + 가짜 결제사 + 모의 AI. 실제 AI · 결제사를 부르지 않는다. 판매 스위치는 시험에서만 켠다(실제 값은 꺼져 있다).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import type { GatewayPayment } from "../commerce/order.ts";
import { PAIR_COMPAT, isPairProduct, pairProductId } from "../config/product.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "../profile/basic-info.ts";
import { createAiReportGenerator } from "../report/ai/generator.ts";
import { createMockModel } from "../report/ai/mock-model.ts";
import { isPairReport } from "../report/compat/types.ts";
import { devReportGenerator } from "../report/generate-dev-report.ts";
import { cardOf } from "../compat/simple.ts";
import { compatOf } from "../saju/interpret/compat.ts";
import { manseryeokEngine as sajuEngine } from "../saju/manseryeok-engine.ts";
import type { SajuOk } from "../saju/engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { getMetrics } from "./metrics-service.ts";
import { applyPayment, confirmPayment } from "./order-service.ts";
import { PAIR_MAX_OPEN_INVITES, canReadPairReport, createPairInvite, getPairView, joinPairInvite, listMyPairs, paidPairOrder, pairInputFor, peekPairInvite, startPairCheckout, unlinkPair, withdrawPairConsent, type PairDeps } from "./pair-service.ts";
import type { PaymentGateway } from "./ports.ts";
import { claimReport, ensureReport } from "./report-service.ts";
import { createMemoryPairs } from "./testing/memory-pairs.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const T0 = new Date("2026-10-17T00:00:00Z");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const INFO_A: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "슬기", birthYear: "1996", birthMonth: "3", birthDay: "29", birthTime: "09:30", gender: "female", knownMbti: "INFJ", regionProvince: "서울특별시", regionDistrict: "마포구" };
const INFO_B: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "남수", birthYear: "1994", birthMonth: "11", birthDay: "2", birthTime: "09:30", gender: "male", knownMbti: "ESTP", regionProvince: "서울특별시", regionDistrict: "강남구" };
const answersAll = (v: number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, v])));

function done(orderId: string, amount: number, paymentKey: string): GatewayPayment {
  return { paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: "2026-10-17T10:00:00+09:00", mId: "fake" };
}
const gatewayOk = (): PaymentGateway => ({
  provider: "tosspayments",
  async confirm(i) {
    return { ok: true, payment: done(i.orderId, i.amount, i.paymentKey) };
  },
  async getPayment() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
  async getPaymentByOrderId() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
});

async function setup(over: Partial<PairDeps> = {}) {
  const clock = { now: T0 };
  const mem = createMemoryRepository(() => clock.now);
  const mp = createMemoryPairs(mem, () => clock.now);
  const save = async (userId: string, info: BasicInfo, v: number) => {
    const r = await submitAssessment({ repo: mem.repo, saju: sajuEngine }, { userId, channel: "web", info, answers: answersAll(v), today: T0 });
    assert.ok(r.ok);
    return r.ok ? r.assessment : (null as never);
  };
  const a = await save(A, INFO_A, 4);
  const b = await save(B, INFO_B, 2);
  let n = 0;
  const deps: PairDeps = { repo: mem.repo, pairs: mp.repo, now: () => clock.now, saleOpen: true, generatorReady: true, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, newToken: () => `tok${String(n).padStart(2, "0")}${"x".repeat(19)}`, ...over };
  const generator = createAiReportGenerator({ model: createMockModel(), now: () => T0, sleep: async () => {} });
  const gen = () => ({ repo: mem.repo, pairs: mp.repo, generator, now: () => clock.now });
  /** A가 초대하고 B가 연결한 쌍 */
  async function linked() {
    const inv = await createPairInvite(deps, { userId: A, assessmentId: a.id, consent: true, relationship: "lover", myGender: "female" });
    assert.equal(inv.kind, "created");
    if (inv.kind !== "created") throw new Error("초대 실패");
    const joined = await joinPairInvite(deps, { token: inv.pair.token, userId: B, consent: true, myGender: "male" });
    assert.equal(joined.kind, "joined");
    return inv.pair;
  }
  /** user가 결제(가짜 결제사)해 결제 완료 주문을 만든다 */
  async function buy(pairId: string, userId: string, paymentEnv?: "live" | "test") {
    const r = await startPairCheckout(deps, { userId, pairId, ...(paymentEnv ? { paymentEnv } : {}) });
    if (r.kind !== "order") throw new Error(`주문 실패: ${r.kind}`);
    const paid = await confirmPayment({ repo: mem.repo, gateway: gatewayOk() }, { userId, orderNumber: r.order.orderNumber, paymentKey: `pk_${r.order.orderNumber}`, amount: r.order.amount });
    if (paid.kind !== "paid") throw new Error("결제 실패");
    return paid.order;
  }
  return { clock, mem, mp, deps, a, b, generator, gen, linked, buy, save };
}

test("판매 스위치가 꺼져 있으면(실제 기본값) 초대 · 연결 · 결제를 시작하지 않는다 — 돈이 빠지지 않는다", async () => {
  assert.equal(PAIR_COMPAT.saleOpen, false);
  const s = await setup({ saleOpen: undefined });
  assert.equal((await createPairInvite(s.deps, { userId: A, assessmentId: s.a.id, consent: true, relationship: "lover", myGender: "female" })).kind, "not-open");
  const open = await setup();
  const pair = await open.linked();
  const closed: PairDeps = { ...open.deps, saleOpen: false };
  assert.equal((await startPairCheckout(closed, { userId: A, pairId: pair.id })).kind, "not-open");
  assert.equal((await joinPairInvite(closed, { token: pair.token, userId: C, consent: true, myGender: "male" })).kind, "not-open");
  // 이미 만들어진 쌍의 열람은 스위치와 관계없이 된다
  assert.equal((await getPairView(closed, { pairId: pair.id, userId: A })).kind, "ok");
});

test("AI가 연결되지 않았으면(개발용 생성기) 스위치가 켜져 있어도 시작하지 않는다", async () => {
  const s = await setup({ generatorReady: false });
  assert.equal((await createPairInvite(s.deps, { userId: A, assessmentId: s.a.id, consent: true, relationship: "lover", myGender: "female" })).kind, "ai-not-connected");
  assert.equal(devReportGenerator.generatePair, undefined);
});

test("초대: 동의가 없으면 만들지 않고, 남의 검사 결과로는 만들지 못하고, 열린 초대 수에 한도가 있다", async () => {
  const s = await setup();
  assert.equal((await createPairInvite(s.deps, { userId: A, assessmentId: s.a.id, consent: false, relationship: "lover", myGender: "female" })).kind, "no-consent");
  assert.equal((await createPairInvite(s.deps, { userId: B, assessmentId: s.a.id, consent: true, relationship: "lover", myGender: "male" })).kind, "not-found");
  for (let i = 0; i < PAIR_MAX_OPEN_INVITES; i++) assert.equal((await createPairInvite(s.deps, { userId: A, assessmentId: s.a.id, consent: true, relationship: "lover", myGender: "female" })).kind, "created");
  assert.equal((await createPairInvite(s.deps, { userId: A, assessmentId: s.a.id, consent: true, relationship: "lover", myGender: "female" })).kind, "too-many");
});

test("링크를 연 사람에게는 초대한 사람의 닉네임 말고 아무것도 보이지 않는다", async () => {
  const s = await setup();
  const inv = await createPairInvite(s.deps, { userId: A, assessmentId: s.a.id, consent: true, relationship: "lover", myGender: "female" });
  assert.equal(inv.kind, "created");
  if (inv.kind !== "created") return;
  const peek = await peekPairInvite(s.deps, { token: inv.pair.token, userId: B });
  assert.equal(peek.kind, "open");
  const text = JSON.stringify(peek);
  for (const secret of ["1996", "0329", "INFJ", "마포", A, s.a.id]) assert.ok(!text.includes(secret), `초대 화면에 ${secret}이 보이면 안 된다`);
  assert.ok(text.includes("슬기"));
  assert.equal((await peekPairInvite(s.deps, { token: inv.pair.token, userId: A })).kind, "mine");
  assert.equal((await peekPairInvite(s.deps, { token: "short", userId: B })).kind, "not-found");
});

test("연결: 동의 · 본인 아님 · 내 검사 결과 · 한 번만 · 기간", async () => {
  const s = await setup();
  const inv = await createPairInvite(s.deps, { userId: A, assessmentId: s.a.id, consent: true, relationship: "lover", myGender: "female" });
  assert.equal(inv.kind, "created");
  if (inv.kind !== "created") return;
  const token = inv.pair.token;
  assert.equal((await joinPairInvite(s.deps, { token, userId: B, consent: false, myGender: "male" })).kind, "no-consent");
  assert.equal((await joinPairInvite(s.deps, { token, userId: A, consent: true, myGender: "female" })).kind, "self");
  assert.equal((await joinPairInvite(s.deps, { token, userId: B, consent: true, assessmentId: s.a.id, myGender: "male" })).kind, "bad-assessment", "남의 검사 결과로는 연결하지 못한다");
  assert.equal((await joinPairInvite(s.deps, { token, userId: C, consent: true, myGender: "male" })).kind, "no-assessment");
  assert.equal((await joinPairInvite(s.deps, { token, userId: B, consent: true, myGender: "male" })).kind, "joined");
  assert.equal((await joinPairInvite(s.deps, { token, userId: B, consent: true, myGender: "male" })).kind, "joined", "같은 사람이 다시 눌러도 같은 결과");
  const c = await s.save(C, { ...INFO_B, nickname: "도윤" }, 3);
  assert.equal((await joinPairInvite(s.deps, { token, userId: C, consent: true, assessmentId: c.id, myGender: "male" })).kind, "taken");
  const pair = s.mp.all()[0];
  assert.equal(pair.status, "linked");
  assert.equal(pair.bAssessmentId, s.b.id, "상대가 따로 고르지 않으면 가장 최근 검사 결과로 연결한다");
  assert.equal(pair.bConsentVersion, PAIR_COMPAT.consentVersion);
});

test("연결: 유효 기간이 지나면 들어올 수 없다", async () => {
  const s = await setup();
  const inv = await createPairInvite(s.deps, { userId: A, assessmentId: s.a.id, consent: true, relationship: "lover", myGender: "female" });
  assert.equal(inv.kind, "created");
  if (inv.kind !== "created") return;
  s.clock.now = new Date(T0.getTime() + (PAIR_COMPAT.inviteDays + 1) * 86_400_000);
  assert.equal((await joinPairInvite(s.deps, { token: inv.pair.token, userId: B, consent: true, myGender: "male" })).kind, "expired");
  assert.equal((await peekPairInvite(s.deps, { token: inv.pair.token, userId: B })).kind, "expired");
});

test("결제는 연결된 쌍에서만 시작되고, 주문은 결제한 사람의 검사 결과에 묶이며 개인 통합 리포트 주문과 섞이지 않는다", async () => {
  const s = await setup();
  const inv = await createPairInvite(s.deps, { userId: A, assessmentId: s.a.id, consent: true, relationship: "lover", myGender: "female" });
  assert.equal(inv.kind, "created");
  if (inv.kind !== "created") return;
  assert.equal((await startPairCheckout(s.deps, { userId: A, pairId: inv.pair.id })).kind, "not-linked", "상대가 들어오기 전에는 결제할 수 없다");
  await joinPairInvite(s.deps, { token: inv.pair.token, userId: B, consent: true, myGender: "male" });
  assert.equal((await startPairCheckout(s.deps, { userId: C, pairId: inv.pair.id })).kind, "not-found", "쌍의 구성원이 아니면 없는 쌍이다");
  const r = await startPairCheckout(s.deps, { userId: B, pairId: inv.pair.id });
  assert.equal(r.kind, "order");
  if (r.kind !== "order") return;
  assert.equal(r.order.productId, pairProductId(inv.pair.id));
  assert.ok(isPairProduct(r.order.productId));
  assert.equal(r.order.amount, PAIR_COMPAT.priceKrw);
  assert.equal(r.order.assessmentId, s.b.id);
  assert.equal(r.order.userId, B);
  // 상대(A)는 B가 결제하는 동안 기다린다
  assert.equal((await startPairCheckout(s.deps, { userId: A, pairId: inv.pair.id })).kind, "busy");
  const view = await getPairView(s.deps, { pairId: inv.pair.id, userId: A });
  assert.ok(view.kind === "ok" && view.purchase.state === "other-pending" && !view.can.pay);
  // B가 다시 눌러도 대기 주문은 하나
  const again = await startPairCheckout(s.deps, { userId: B, pairId: inv.pair.id });
  assert.equal(again.kind, "order");
  const pending = (await s.mem.repo.listOrdersForAssessment(s.b.id)).filter((o) => o.status === "pending");
  assert.equal(pending.length, 1);
});

test("한 사람이 결제하면 두 사람이 같은 글을 읽고, 이미 결제된 쌍은 다시 결제할 수 없다", async () => {
  const s = await setup();
  const pair = await s.linked();
  const order = await s.buy(pair.id, B);
  assert.equal((await startPairCheckout(s.deps, { userId: A, pairId: pair.id })).kind, "already-paid");
  assert.equal((await startPairCheckout(s.deps, { userId: B, pairId: pair.id })).kind, "already-paid");
  const before = await getPairView(s.deps, { pairId: pair.id, userId: A });
  assert.ok(before.kind === "ok" && before.purchase.state === "paid" && before.purchase.buyer === "other" && before.report.state === "generating");
  const report = await ensureReport(s.gen(), order);
  assert.equal(report?.status, "ready");
  assert.ok(report?.content && isPairReport(report.content));
  const va = await getPairView(s.deps, { pairId: pair.id, userId: A });
  const vb = await getPairView(s.deps, { pairId: pair.id, userId: B });
  assert.ok(va.kind === "ok" && va.report.state === "ready" && va.youAre === "A님" && va.otherNickname === "남수");
  assert.ok(vb.kind === "ok" && vb.report.state === "ready" && vb.youAre === "B님" && vb.otherNickname === "슬기");
  if (va.kind === "ok" && vb.kind === "ok" && va.report.state === "ready" && vb.report.state === "ready") assert.deepEqual(va.report.report, vb.report.report, "두 사람이 같은 글을 본다");
  // 구성원이 아닌 사람에게는 없는 쌍이다
  assert.equal((await getPairView(s.deps, { pairId: pair.id, userId: C })).kind, "not-found");
  assert.equal(await paidPairOrder(s.deps, { pairId: pair.id, userId: C }), null);
  assert.equal((await paidPairOrder(s.deps, { pairId: pair.id, userId: A }))?.id, order.id, "상대도 같은 주문으로 만들기를 이어받는다");
  // 개인 통합 리포트 화면 · 목록에는 나타나지 않는다
  assert.equal((await s.mem.repo.listOrdersForAssessment(s.a.id)).length, 0);
  const mine = await listMyPairs(s.deps, A);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].report, "ready");
});

test("저장된 글에는 이름 · 생년월일 · MBTI 글자 · 점수 · 응답 원문이 없고, 상대의 원래 답 · 개인 리포트는 두 사람 어디에도 없다", async () => {
  const s = await setup();
  const pair = await s.linked();
  const order = await s.buy(pair.id, A);
  const report = await ensureReport(s.gen(), order);
  assert.ok(report?.content && isPairReport(report.content));
  const text = JSON.stringify(report?.content);
  for (const secret of ["슬기", "남수", "1996", "1994", "INFJ", "ESTP", "마포", "강남", A, B, s.a.id, s.b.id]) assert.ok(!text.includes(secret), `저장된 글에 ${secret}이 있으면 안 된다`);
  assert.ok(!("names" in (report!.content as object)), "이름 칸이 없다");
});

test("리포트 궁합의 위쪽 요약은 사주 궁합 · 간단 궁합과 같은 엔진 결과다(어긋나지 않는다)", async () => {
  const s = await setup();
  const pair = await s.linked();
  const order = await s.buy(pair.id, A);
  const report = await ensureReport(s.gen(), order);
  assert.ok(report?.content && isPairReport(report.content));
  if (!report?.content || !isPairReport(report.content)) return;
  const expected = cardOf(compatOf(s.a.saju as SajuOk, s.b.saju as SajuOk), { a: "A님", b: "B님" });
  assert.equal(report.content.summary.typeName, expected.typeName);
  assert.equal(report.content.summary.score, expected.score);
  assert.equal(report.content.summary.core, expected.core);
  assert.equal(report.content.ruleVersion, compatOf(s.a.saju as SajuOk, s.b.saju as SajuOk).version);
});

test("생성에 쓰는 입력: 연결된 두 사람의 사주 · 응답 요약뿐이고, 연결이 끊기거나 동의가 철회되면 만들지 않는다", async () => {
  const s = await setup();
  const pair = await s.linked();
  const order = await s.buy(pair.id, A);
  const input = await pairInputFor(s.mem.repo, s.mp.repo, order);
  assert.deepEqual(Object.keys(input.a).sort(), ["knownMbti", "saju", "summary"]);
  assert.equal(input.b.knownMbti, "ESTP");
  await unlinkPair(s.deps, { userId: B, pairId: pair.id });
  await assert.rejects(() => pairInputFor(s.mem.repo, s.mp.repo, order), /연결이 끊겨/);
  const failed = await ensureReport(s.gen(), order);
  assert.equal(failed?.status, "failed", "연결이 끊긴 쌍은 새로 만들지 않는다");
  const view = await getPairView(s.deps, { pairId: pair.id, userId: A });
  assert.ok(view.kind === "ok" && view.report.state === "blocked" && view.report.why === "unfinished", "결제는 됐는데 만들어지기 전에 끊기면 운영자가 환불을 확인하는 상태로 막는다");
});

test("생성기가 리포트 궁합을 만들 수 없거나(개발용) 쌍 저장소가 없으면 실패로 남고 같은 주문으로 다시 만들 수 있다", async () => {
  const s = await setup();
  const pair = await s.linked();
  const order = await s.buy(pair.id, A);
  const broken = await ensureReport({ repo: s.mem.repo, pairs: s.mp.repo, generator: devReportGenerator, now: () => s.clock.now }, order);
  assert.equal(broken?.status, "failed");
  assert.match(broken?.lastError ?? "", /리포트 궁합/);
  const noPairs = await ensureReport({ repo: s.mem.repo, generator: s.generator, now: () => s.clock.now }, order);
  assert.equal(noPairs?.status, "failed");
  const ok = await ensureReport(s.gen(), order);
  assert.equal(ok?.status, "ready");
  // 이미 완성된 글은 다시 가져가 만들지 않는다
  const claim = await claimReport(s.gen(), order, { retryFailed: true, ignoreCooldown: true });
  assert.equal(claim.claimed, false);
});

test("연결 해제: 완성된 글은 두 사람 모두 계속 읽고, 새 결제 · 새 생성은 막힌다", async () => {
  const s = await setup();
  const pair = await s.linked();
  const order = await s.buy(pair.id, A);
  await ensureReport(s.gen(), order);
  const r = await unlinkPair(s.deps, { userId: B, pairId: pair.id });
  assert.deepEqual(r, { kind: "done", paidNotGenerated: false, afterReport: true });
  for (const u of [A, B]) {
    const v = await getPairView(s.deps, { pairId: pair.id, userId: u });
    assert.ok(v.kind === "ok" && v.report.state === "ready" && v.status === "unlinked" && !v.can.pay, `${u}는 끊긴 뒤에도 읽는다`);
  }
  assert.equal((await startPairCheckout(s.deps, { userId: A, pairId: pair.id })).kind, "not-linked");
  const pairRec = s.mp.all()[0];
  assert.equal(pairRec.aWithdrawnAt, null);
  assert.equal(pairRec.bWithdrawnAt, null, "해제는 동의 철회가 아니다");
  assert.equal(pairRec.unlinkedBy, B);
});

test("동의 철회: 철회한 사람의 열람만 끝나고 상대는 계속 읽으며, 철회한 자료는 새 생성에 쓰이지 않는다", async () => {
  const s = await setup();
  const pair = await s.linked();
  const order = await s.buy(pair.id, A);
  await ensureReport(s.gen(), order);
  const r = await withdrawPairConsent(s.deps, { userId: A, pairId: pair.id });
  assert.deepEqual(r, { kind: "done", paidNotGenerated: false, afterReport: true });
  const va = await getPairView(s.deps, { pairId: pair.id, userId: A });
  const vb = await getPairView(s.deps, { pairId: pair.id, userId: B });
  assert.ok(va.kind === "ok" && va.report.state === "blocked" && va.report.why === "withdrawn" && va.consent.meWithdrawn);
  assert.ok(vb.kind === "ok" && vb.report.state === "ready" && vb.consent.otherWithdrawn);
  await assert.rejects(() => pairInputFor(s.mem.repo, s.mp.repo, order), /연결이 끊겨|철회/);
  // 다시 철회해도 같은 결과(철회 시각은 처음 값을 지키지 않아도 오류가 나지 않는다)
  assert.equal((await withdrawPairConsent(s.deps, { userId: A, pairId: pair.id })).kind, "done");
  assert.equal((await withdrawPairConsent(s.deps, { userId: C, pairId: pair.id })).kind, "not-found");
});

test("환불되면 두 사람 모두 열람이 막히고, 같은 쌍은 다시 결제할 수 없다", async () => {
  const s = await setup();
  const pair = await s.linked();
  const order = await s.buy(pair.id, B);
  await ensureReport(s.gen(), order);
  const canceled: GatewayPayment = { ...done(order.orderNumber, order.amount, order.paymentKey!), status: "CANCELED", balanceAmount: 0 };
  assert.equal((await applyPayment(s.mem.repo, order, canceled, "reconcile")).kind, "updated");
  for (const u of [A, B]) {
    const v = await getPairView(s.deps, { pairId: pair.id, userId: u });
    assert.ok(v.kind === "ok" && v.report.state === "blocked" && v.report.why === "refunded" && v.purchase.state === "refunded", `${u}는 환불 뒤 열람이 막힌다`);
  }
  assert.equal((await startPairCheckout(s.deps, { userId: A, pairId: pair.id })).kind, "refunded");
});

test("canReadPairReport: 구성원 · 주문 상태 · 철회를 구분한다", async () => {
  const s = await setup();
  const pair = await s.linked();
  const order = await s.buy(pair.id, A);
  const rec = s.mp.all()[0];
  assert.equal(canReadPairReport(rec, C, order), "not-member");
  assert.equal(canReadPairReport(rec, A, null), "no-order");
  assert.equal(canReadPairReport(rec, B, order), "ok");
  assert.equal(canReadPairReport({ ...rec, bWithdrawnAt: "2026-10-18T00:00:00Z" }, B, order), "withdrawn");
  assert.equal(canReadPairReport({ ...rec, aWithdrawnAt: "2026-10-18T00:00:00Z" }, B, order), "ok");
  assert.equal(canReadPairReport(rec, A, { ...order, status: "refunded" }), "refunded");
  assert.equal(canReadPairReport(rec, A, { ...order, status: "pending" }), "no-order");
});

test("탈퇴: 상대가 들어오지 않은 초대는 지우고, 연결된 쌍은 끊고 철회로 기록하며 상대는 이미 완성된 글을 계속 읽는다", async () => {
  const s = await setup();
  const lone = await createPairInvite(s.deps, { userId: B, assessmentId: s.b.id, consent: true, relationship: "lover", myGender: "male" });
  assert.equal(lone.kind, "created");
  const pair = await s.linked();
  const order = await s.buy(pair.id, B);
  await ensureReport(s.gen(), order);
  s.mp.onMemberWithdrawn(A);
  s.mp.onMemberWithdrawn(B);
  if (lone.kind === "created") assert.ok(!s.mp.all().some((p) => p.id === lone.pair.id), "상대가 들어오지 않은 초대는 탈퇴하면 지워진다");
  const rec = s.mp.all().find((p) => p.id === pair.id)!;
  assert.equal(rec.status, "unlinked");
  assert.ok(rec.aWithdrawnAt && rec.bWithdrawnAt);
});

test("탈퇴 시 결제하지 않은 쌍의 상대 쪽: A만 탈퇴하면 B는 쌍을 볼 수 있지만 결제할 수 없다", async () => {
  const s = await setup();
  const pair = await s.linked();
  s.mp.onMemberWithdrawn(A);
  const v = await getPairView(s.deps, { pairId: pair.id, userId: B });
  assert.ok(v.kind === "ok" && v.status === "unlinked" && v.consent.otherWithdrawn && !v.can.pay);
  assert.equal((await startPairCheckout(s.deps, { userId: B, pairId: pair.id })).kind, "not-linked");
});

test("관리자 지표에서 리포트 궁합(실결제)은 개인 리포트 매출 · 사주 궁합과 따로 센다", async () => {
  const s = await setup();
  const pair = await s.linked();
  const order = await s.buy(pair.id, A, "live");
  await ensureReport(s.gen(), order);
  const m = await getMetrics(s.mem.repo, s.clock.now, 30);
  assert.equal(m.revenue.pair.paidCount, 1);
  assert.equal(m.revenue.pair.netKrw, PAIR_COMPAT.priceKrw);
  assert.equal(m.revenue.compat.paidCount, 0);
  assert.equal(m.revenue.paidCount, 0, "개인 리포트 매출에 섞이지 않는다");
});
