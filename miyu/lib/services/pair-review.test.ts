// 실행: npm test — 리포트 궁합 후기의 이용 건: 결제한 사람의 한 건만, 상대 · 철회한 결제자 · 환불 · 만드는 중은 쓸 수 없고, 후기와 보상(질문권)은 구매 한 건에 한 번이다.
// 메모리 저장소 + 가짜 결제사 + 모의 AI. 실제 AI · 결제사 · DB를 부르지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import type { GatewayPayment } from "../commerce/order.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "../profile/basic-info.ts";
import { createAiReportGenerator } from "../report/ai/generator.ts";
import { createMockModel } from "../report/ai/mock-model.ts";
import { manseryeokEngine as sajuEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { applyPayment, confirmPayment } from "./order-service.ts";
import { createPairReviewEligibility } from "./pair-review.ts";
import { createPairInvite, joinPairInvite, startPairCheckout, withdrawPairConsent, type PairDeps } from "./pair-service.ts";
import type { PaymentGateway } from "./ports.ts";
import { createReview, listReviewSubjects, type ReviewDeps } from "./review-service.ts";
import { ensureReport } from "./report-service.ts";
import { createMemoryBenefits } from "./testing/memory-benefits.ts";
import { createMemoryPairs } from "./testing/memory-pairs.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";
import { createMemoryReviews } from "./testing/memory-reviews.ts";

const T0 = new Date("2026-10-20T00:00:00Z");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const INFO_A: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "슬기", birthYear: "1996", birthMonth: "3", birthDay: "29", birthTime: "09:30", gender: "female", knownMbti: "INFJ" };
const INFO_B: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "남수", birthYear: "1994", birthMonth: "11", birthDay: "2", birthTime: "09:30", gender: "male", knownMbti: "ESTP" };
const answersAll = (v: number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, v])));
const GOOD = "두 사람이 서로 다른 속도로 움직이는 장면이 읽혀서 이야기를 나눠 볼 수 있었어요.";

const done = (orderId: string, amount: number, paymentKey: string): GatewayPayment => ({ paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: "2026-10-20T10:00:00+09:00", mId: "fake" });
const gateway: PaymentGateway = {
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
};

async function setup() {
  const clock = { now: T0 };
  const mem = createMemoryRepository(() => clock.now);
  const mp = createMemoryPairs(mem, () => clock.now);
  const ben = createMemoryBenefits(mem, () => clock.now);
  const rev = createMemoryReviews(mem, () => clock.now);
  await ben.repo.setSetting({ key: "feature.review_reward", value: true, reason: "시험", by: null });
  const save = async (userId: string, info: BasicInfo, v: number) => {
    const r = await submitAssessment({ repo: mem.repo, saju: sajuEngine }, { userId, channel: "web", info, answers: answersAll(v), today: T0 });
    assert.ok(r.ok);
    return r.ok ? r.assessment : (null as never);
  };
  const a = await save(A, INFO_A, 4);
  await save(B, INFO_B, 2);
  let n = 0;
  const pairDeps: PairDeps = { repo: mem.repo, pairs: mp.repo, now: () => clock.now, saleOpen: true, generatorReady: true, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, newToken: () => `rev${String(n).padStart(2, "0")}${"x".repeat(19)}` };
  const generator = createAiReportGenerator({ model: createMockModel(), now: () => T0, sleep: async () => {} });
  const reviewDeps = (): ReviewDeps => ({ repo: mem.repo, reviews: rev.repo, benefits: ben.repo, pair: createPairReviewEligibility({ repo: mem.repo, pairs: mp.repo, benefits: ben.repo }), now: () => clock.now });
  const inv = await createPairInvite(pairDeps, { userId: A, assessmentId: a.id, consent: true, relationship: "lover", myGender: "female" });
  assert.equal(inv.kind, "created");
  if (inv.kind !== "created") throw new Error("invite");
  assert.equal((await joinPairInvite(pairDeps, { token: inv.pair.token, userId: B, consent: true, myGender: "male" })).kind, "joined");
  const buy = async (userId: string) => {
    const r = await startPairCheckout(pairDeps, { userId, pairId: inv.pair.id });
    if (r.kind !== "order") throw new Error(`order ${r.kind}`);
    const paid = await confirmPayment({ repo: mem.repo, gateway }, { userId, orderNumber: r.order.orderNumber, paymentKey: `pk_${r.order.orderNumber}`, amount: r.order.amount });
    if (paid.kind !== "paid") throw new Error("pay");
    return paid.order;
  };
  const gen = async (order: Awaited<ReturnType<typeof buy>>) => ensureReport({ repo: mem.repo, pairs: mp.repo, generator, now: () => clock.now }, order);
  return { clock, mem, mp, ben, rev, pairDeps, reviewDeps, pair: inv.pair, buy, gen };
}

test("리포트 궁합 후기: 결제한 사람만, 리포트가 완성된 뒤에만 쓸 수 있고 상대는 쓸 수 없다", async () => {
  const s = await setup();
  const order = await s.buy(B);
  // 결제는 됐지만 아직 만드는 중 — 쓸 수 없다
  assert.equal((await listReviewSubjects(s.reviewDeps(), B)).filter((x) => x.kind === "pair_compat").length, 0);
  assert.equal((await createReview(s.reviewDeps(), { userId: B, kind: "pair_compat", ref: order.id, rating: 5, body: GOOD, publicConsent: true })).kind, "not-eligible");
  assert.equal((await s.gen(order))?.status, "ready");
  const mine = (await listReviewSubjects(s.reviewDeps(), B)).filter((x) => x.kind === "pair_compat");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].subjectRef, order.id);
  assert.equal(mine[0].rewardEligible, true);
  // 같은 글을 읽는 상대(A)는 결제하지 않았으므로 후기 · 보상 대상이 아니다
  assert.equal((await listReviewSubjects(s.reviewDeps(), A)).filter((x) => x.kind === "pair_compat").length, 0);
  assert.equal((await createReview(s.reviewDeps(), { userId: A, kind: "pair_compat", ref: order.id, rating: 5, body: GOOD, publicConsent: true })).kind, "not-eligible");
  // 결제한 사람은 쓸 수 있고 질문권 한 개가 한 번만 들어간다
  const r = await createReview(s.reviewDeps(), { userId: B, kind: "pair_compat", ref: order.id, rating: 4, body: GOOD, publicConsent: true });
  assert.equal(r.kind, "created");
  assert.equal(await s.ben.repo.getCreditBalance(B), 1);
  assert.equal((await createReview(s.reviewDeps(), { userId: B, kind: "pair_compat", ref: order.id, rating: 4, body: GOOD, publicConsent: true })).kind === "created", false, "같은 이용 건에는 후기가 하나");
  assert.equal(await s.ben.repo.getCreditBalance(B), 1, "보상 중복 없음");
});

test("리포트 궁합 후기: 동의를 철회한 결제자 · 환불된 주문 · 남의 주문 번호는 쓸 수 없다", async () => {
  const s = await setup();
  const order = await s.buy(A);
  await s.gen(order);
  // 남이 쓴 주문 번호로는 쓸 수 없다
  assert.equal((await createReview(s.reviewDeps(), { userId: B, kind: "pair_compat", ref: order.id, rating: 5, body: GOOD, publicConsent: true })).kind, "not-eligible");
  // 결제자가 동의를 철회하면 글을 더 읽을 수 없으므로 후기를 쓸 수 없다
  assert.equal((await withdrawPairConsent(s.pairDeps, { userId: A, pairId: s.pair.id })).kind, "done");
  assert.equal((await listReviewSubjects(s.reviewDeps(), A)).filter((x) => x.kind === "pair_compat").length, 0);
  assert.equal((await createReview(s.reviewDeps(), { userId: A, kind: "pair_compat", ref: order.id, rating: 5, body: GOOD, publicConsent: true })).kind, "not-eligible");
});

test("리포트 궁합 후기: 환불되면 쓸 수 없다", async () => {
  const s = await setup();
  const order = await s.buy(B);
  await s.gen(order);
  const canceled: GatewayPayment = { ...done(order.orderNumber, order.amount, order.paymentKey!), status: "CANCELED", balanceAmount: 0 };
  assert.equal((await applyPayment(s.mem.repo, order, canceled, "reconcile")).kind, "updated");
  assert.equal((await listReviewSubjects(s.reviewDeps(), B)).filter((x) => x.kind === "pair_compat").length, 0);
  assert.equal((await createReview(s.reviewDeps(), { userId: B, kind: "pair_compat", ref: order.id, rating: 5, body: GOOD, publicConsent: true })).kind, "not-eligible");
});
