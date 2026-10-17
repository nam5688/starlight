// 실행: npm test — 이용 후기(리뷰) 서비스를 메모리 저장소로 확인한다.
// 확인하는 운영 요구(운영자 2026-10-17): ① 실제 이용 권한 검증(구매 전 · 환불 · 남의 주문 · 리포트 미완성은 쓸 수 없음) ② 구매 또는 적격 무료 체험 건당 보상 질문권 1회, 긍정 · 부정 동일
// ③ 중복 작성 · 보상 중복 지급 방지(수정 · 삭제 · 비공개 · 재작성 · 동시 제출) ④ 공개 후기는 공개 동의한 것만, 대가 표시를 숨기지 않음 ⑤ 개인정보 가리기 ⑥ 후기가 없으면 메인에 아무것도 없음
// ⑦ 보상 스위치가 꺼져 있으면 지급 없음 · 지급 실패는 후기 저장을 막지 않음 ⑧ 탈퇴하면 후기가 지워짐.
// 이 시험은 규칙이 서비스 코드에서 지켜지는지 보는 것이다. SQL 자체는 supabase/tests/reviews.db.test.ts가 실제 Postgres로 확인하고, 실제 Supabase · 실제 결제에서는 아직 확인하지 않았다.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { compatProductId } from "../config/product.ts";
import type { BenefitRepository } from "./benefit-ports.ts";
import { startCheckout } from "./order-service.ts";
import type { AssessmentRecord, MiyuRepository, OrderRecord } from "./ports.ts";
import type { ReviewRepository } from "./review-ports.ts";
import { createReview, deleteReview, editReview, getMyReviewsView, homeReviews, listReviewSubjects, NO_PAIR_REVIEW_ELIGIBILITY, publicReviewsPage, reportReview, retryReviewRewards, setReviewVisibility, type PairReviewEligibility, type ReviewDeps, type ReviewSubject } from "./review-service.ts";
import { createMemoryBenefits } from "./testing/memory-benefits.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";
import { createMemoryReviews } from "./testing/memory-reviews.ts";

const BASE = { channel: "web", nickname: "서윤", calendar: "solar", isLeapMonth: false, birthYear: 1994, birthMonth: 11, birthDay: 7, birthTime: "08:40", knownMbti: null, answers: {}, contentVersion: "t", source: "sample", summary: {}, saju: { status: "not-connected" } } as unknown as Omit<AssessmentRecord, "id" | "createdAt" | "userId">;
const GOOD = "풀이가 평소 내 모습과 이어져서 한참 생각해 볼 수 있었어요.";
const BAD = "기대와 달라서 아쉬웠어요. 내용이 조금 막연하게 느껴졌어요.";
const DAY = 86_400_000;

async function setup(opts: { rewardOn?: boolean } = {}) {
  let t = new Date("2026-10-20T03:00:00Z").getTime();
  const nowFn = () => new Date(t);
  const mem = createMemoryRepository(nowFn);
  const ben = createMemoryBenefits(mem, nowFn);
  const rev = createMemoryReviews(mem, nowFn);
  const repo = mem.repo as MiyuRepository;
  let failGrant = false;
  const benefits: BenefitRepository = { ...ben.repo, grantCredit: async (i) => (failGrant ? Promise.reject(new Error("db down")) : ben.repo.grantCredit(i)) };
  let pair: PairReviewEligibility = NO_PAIR_REVIEW_ELIGIBILITY;
  const deps = (): ReviewDeps => ({ repo, reviews: rev.repo, benefits, pair, now: nowFn });
  if (opts.rewardOn) await ben.repo.setSetting({ key: "feature.review_reward", value: true, reason: "시험", by: null });
  let n = 0;
  const user = async (name: string) => {
    const userId = `${name.padEnd(8, "0")}-0000-4000-8000-000000000000`;
    const assessmentId = (await repo.insertAssessment({ ...BASE, userId })).id;
    return { userId, assessmentId };
  };
  const readyReport = async (u: { userId: string; assessmentId: string }, orderId: string, status: "ready" | "queued" = "ready") => repo.insertReport({ userId: u.userId, orderId, assessmentId: u.assessmentId, status, attempts: 1 });
  /** 개인 심층 리포트 구매(결제 완료 + 리포트 완성) */
  const buy = async (u: { userId: string; assessmentId: string }, o: { report?: "ready" | "queued" | "none"; pay?: boolean } = {}): Promise<OrderRecord> => {
    const started = await startCheckout({ repo, now: nowFn }, { userId: u.userId, assessmentId: u.assessmentId, again: true });
    assert.equal(started.kind, "order");
    if (started.kind !== "order") throw new Error("order");
    let order = started.order;
    if (o.pay !== false) order = (await repo.updateOrder(order.id, ["pending"], { status: "paid", paymentKey: `pk-${order.id}`, approvedAt: new Date(t).toISOString() }))!;
    if (o.report !== "none") await readyReport(u, order.id, o.report === "queued" ? "queued" : "ready");
    return order;
  };
  const buyCompat = async (u: { userId: string; assessmentId: string }): Promise<OrderRecord> => {
    const inserted = await repo.insertOrder({ orderNumber: `MEU-20261020-CMP${String(++n).padStart(7, "0")}`, userId: u.userId, assessmentId: u.assessmentId, productId: compatProductId(randomUUID()), amount: 4900, paymentEnv: "test" });
    assert.ok(inserted.ok);
    if (!inserted.ok) throw new Error("order");
    const order = (await repo.updateOrder(inserted.value.id, ["pending"], { status: "paid", paymentKey: `pk-${n}`, approvedAt: new Date(t).toISOString() }))!;
    await readyReport(u, order.id);
    return order;
  };
  const answerChat = (u: { userId: string; assessmentId: string }) => mem.chatQuestions.push({ userId: u.userId, assessmentId: u.assessmentId, roomKey: "love", createdAt: new Date(t).toISOString() });
  const credits = (userId: string) => ben.repo.getCreditBalance(userId);
  const input = (u: { userId: string }, ref: string, o: Partial<{ kind: string; rating: number; body: string; publicConsent: boolean }> = {}) => ({ userId: u.userId, kind: o.kind ?? "personal", ref, rating: o.rating ?? 5, body: o.body ?? GOOD, publicConsent: o.publicConsent ?? true });
  return { mem, ben, rev, repo, benefits, deps, user, buy, buyCompat, answerChat, credits, input, tick: (ms: number) => (t += ms), setFailGrant: (v: boolean) => (failGrant = v), setPair: (p: PairReviewEligibility) => (pair = p), now: nowFn };
}

// ───── ① 실제 이용 권한 ─────

test("이용 자격: 결제 완료 + 리포트 완성인 본인 주문에만 후기를 쓸 수 있다 — 구매 전 · 결제 대기 · 환불 · 남의 주문 · 만드는 중 · 없는 번호 · 다른 종류는 거절한다", async () => {
  const s = await setup({ rewardOn: true });
  const me = await s.user("alpha");
  const other = await s.user("beta");

  // 구매 전(주문 없음) · 존재하지 않는 번호 · 형식이 잘못된 번호
  assert.equal((await createReview(s.deps(), s.input(me, randomUUID()))).kind, "not-eligible");
  assert.equal((await createReview(s.deps(), s.input(me, "not-a-uuid"))).kind, "not-eligible");
  assert.equal((await createReview(s.deps(), { ...s.input(me, randomUUID()), kind: "nonsense" })).kind, "not-eligible");

  // 결제 대기 주문
  const pending = await s.buy(me, { pay: false, report: "none" });
  assert.equal((await createReview(s.deps(), s.input(me, pending.id))).kind, "not-eligible");
  await s.repo.updateOrder(pending.id, ["pending"], { status: "canceled", failureCode: "T" });

  // 결제는 됐지만 리포트가 아직 만들어지는 중
  const generating = await s.buy(me, { report: "queued" });
  assert.equal((await createReview(s.deps(), s.input(me, generating.id))).kind, "not-eligible");

  // 정상 구매 — 본인은 쓸 수 있고, 다른 사람의 주문 번호로는 쓸 수 없다
  const ok = await s.buy(await s.user("gamma"));
  assert.equal((await createReview(s.deps(), s.input(other, ok.id))).kind, "not-eligible", "남의 주문");
  const mine = await s.buy(other);
  // 사주 궁합 주문을 개인 리포트 후기로 쓸 수 없다(종류가 맞아야 한다)
  const compat = await s.buyCompat(other);
  assert.equal((await createReview(s.deps(), s.input(other, compat.id, { kind: "personal" }))).kind, "not-eligible");
  assert.equal((await createReview(s.deps(), s.input(other, mine.id, { kind: "saju_compat" }))).kind, "not-eligible");
  assert.equal((await createReview(s.deps(), s.input(other, mine.id))).kind, "created");
  assert.equal((await createReview(s.deps(), s.input(other, compat.id, { kind: "saju_compat" }))).kind, "created");

  // 환불된 주문은 자격이 없다
  const refunder = await s.user("refunder");
  const refundMe = await s.buy(refunder);
  await s.repo.updateOrder(refundMe.id, ["paid"], { status: "refunded" });
  assert.equal((await createReview(s.deps(), s.input(refunder, refundMe.id))).kind, "not-eligible");
  assert.equal((await s.rev.repo.listUserReviews(me.userId)).length, 0, "거절된 시도는 아무것도 저장하지 않는다");
  assert.equal(await s.credits(me.userId), 0);
});

test("채팅 후기: 답을 받은 AI 질문이 있는 본인의 검사 결과에만, 결과 번호당 한 번 — 구매가 없으면 무료 체험으로 표시된다", async () => {
  const s = await setup({ rewardOn: true });
  const u = await s.user("chatter");
  const stranger = await s.user("stranger");
  // 질문이 없으면 쓸 수 없다
  assert.equal((await createReview(s.deps(), s.input(u, u.assessmentId, { kind: "chat" }))).kind, "not-eligible");
  s.answerChat(u);
  // 남의 결과 번호는 쓸 수 없다
  assert.equal((await createReview(s.deps(), s.input(stranger, u.assessmentId, { kind: "chat" }))).kind, "not-eligible");
  const r = await createReview(s.deps(), s.input(u, u.assessmentId, { kind: "chat" }));
  assert.equal(r.kind, "created");
  if (r.kind !== "created") return;
  assert.equal(r.review.freeTrial, true, "심층 리포트를 사지 않은 결과의 채팅은 무료 체험");
  assert.equal(r.review.disclosure, "reward");
  assert.equal(r.reward, "granted");
  // 같은 결과로 또 질문해도 후기는 한 번(결과 번호당)
  s.answerChat(u);
  assert.equal((await createReview(s.deps(), s.input(u, u.assessmentId, { kind: "chat", body: `${GOOD} 두 번째` }))).kind, "exists");
  // 구매한 결과의 채팅은 무료 체험이 아니다
  const buyer = await s.user("buyer");
  await s.buy(buyer);
  s.answerChat(buyer);
  const b = await createReview(s.deps(), s.input(buyer, buyer.assessmentId, { kind: "chat" }));
  assert.ok(b.kind === "created" && b.review.freeTrial === false);
});

test("리포트 궁합 후기: 기본 구현은 항상 자격 없음이고, 연결된 구현이 본인 이용 건을 돌려줄 때만 쓸 수 있다", async () => {
  const s = await setup({ rewardOn: true });
  const u = await s.user("pairuser");
  const ref = randomUUID();
  assert.equal((await createReview(s.deps(), s.input(u, ref, { kind: "pair_compat" }))).kind, "not-eligible");
  assert.deepEqual(await listReviewSubjects(s.deps(), u.userId), []);
  const subject: ReviewSubject = { kind: "pair_compat", subjectRef: ref, title: "리포트 궁합", at: "2026-10-19T00:00:00Z", freeTrial: false, rewardEligible: true };
  s.setPair({ list: async (id) => (id === u.userId ? [subject] : []), find: async (id, r) => (id === u.userId && r === ref ? subject : null) });
  assert.equal((await listReviewSubjects(s.deps(), u.userId)).length, 1);
  const other = await s.user("pairother");
  assert.equal((await createReview(s.deps(), s.input(other, ref, { kind: "pair_compat" }))).kind, "not-eligible", "남의 이용 건");
  const r = await createReview(s.deps(), s.input(u, ref, { kind: "pair_compat" }));
  assert.equal(r.kind, "created");
  assert.equal(await s.credits(u.userId), 1);
});

// ───── ② 보상 한 번 · 긍정 부정 동일 ─────

test("보상: 후기를 쓰면 질문권 1개가 한 번 들어오고, 수정 · 비공개 전환 · 삭제 · 다시 쓰기에서 다시 주지도 되찾지도 않는다", async () => {
  const s = await setup({ rewardOn: true });
  const u = await s.user("rewardee");
  const order = await s.buy(u);
  assert.equal(await s.credits(u.userId), 0);
  const created = await createReview(s.deps(), s.input(u, order.id));
  assert.equal(created.kind, "created");
  if (created.kind !== "created") return;
  assert.equal(created.reward, "granted");
  assert.equal(created.review.rewardCredits, 1);
  assert.equal(created.review.disclosure, "reward");
  assert.equal(await s.credits(u.userId), 1);
  const lot = (await s.benefits.listCreditLots(u.userId))[0];
  assert.equal(lot.kind, "review", "질문권 종류는 후기 보상");
  assert.equal(lot.sourceRef, `review:${created.review.id}`);
  assert.ok(lot.expiresAt, "보상 질문권은 지급일부터 1년(혜택 설정)");

  // 수정 · 비공개 전환 → 질문권 변화 없음
  assert.equal((await editReview(s.deps(), { userId: u.userId, id: created.review.id, rating: 2, body: BAD, publicConsent: true })).kind, "updated");
  assert.equal((await setReviewVisibility(s.deps(), { userId: u.userId, id: created.review.id, publicConsent: false })).kind, "updated");
  assert.equal(await s.credits(u.userId), 1);
  // 질문권을 쓴 뒤에 지워도 되찾지 않고(잔액이 음수가 되지 않는다), 다시 써도 다시 받지 않는다
  await s.benefits.spendCredit({ userId: u.userId, ref: "ask-1" });
  assert.equal(await s.credits(u.userId), 0);
  assert.equal((await deleteReview(s.deps(), { userId: u.userId, id: created.review.id })).kind, "deleted");
  assert.equal(await s.credits(u.userId), 0);
  const again = await createReview(s.deps(), s.input(u, order.id, { body: `${GOOD} 다시 썼어요.` }));
  assert.equal(again.kind, "revived");
  if (again.kind !== "revived") return;
  assert.equal(again.review.id, created.review.id, "같은 후기 자리를 다시 쓴다(고유 키)");
  assert.equal(again.review.rewardState, "granted");
  assert.equal(await s.credits(u.userId), 0, "다시 써도 보상은 또 받지 못한다");
  const lots = await s.benefits.listCreditLots(u.userId);
  assert.equal(lots.length, 1, "질문권 묶음은 처음 한 번뿐이다");
});

test("긍정 · 부정 · 공개 동의 여부와 관계없이 보상은 같다(최소 글자 수만 본다)", async () => {
  const s = await setup({ rewardOn: true });
  const a = await s.user("praise");
  const b = await s.user("critic");
  const c = await s.user("private");
  const oa = await s.buy(a);
  const ob = await s.buy(b);
  const oc = await s.buy(c);
  const ra = await createReview(s.deps(), s.input(a, oa.id, { rating: 5, body: GOOD, publicConsent: true }));
  const rb = await createReview(s.deps(), s.input(b, ob.id, { rating: 1, body: BAD, publicConsent: true }));
  const rc = await createReview(s.deps(), s.input(c, oc.id, { rating: 3, body: GOOD, publicConsent: false }));
  for (const [r, u] of [[ra, a], [rb, b], [rc, c]] as const) {
    assert.equal(r.kind, "created");
    assert.equal(await s.credits(u.userId), 1);
  }
  assert.equal(rc.kind === "created" && rc.review.status, "private");
  assert.equal(rc.kind === "created" && rc.review.disclosure, "reward", "공개하지 않아도 보상을 받았다는 사실은 기록된다");
});

test("동시에 여러 번 제출해도(8번) 후기는 하나, 질문권은 한 번만 들어온다", async () => {
  const s = await setup({ rewardOn: true });
  const u = await s.user("racer");
  const order = await s.buy(u);
  const results = await Promise.all(Array.from({ length: 8 }, () => createReview(s.deps(), s.input(u, order.id))));
  assert.equal(results.filter((r) => r.kind === "created").length, 1);
  assert.equal(results.filter((r) => r.kind === "exists").length, 7);
  assert.equal(await s.credits(u.userId), 1);
  assert.equal((await s.benefits.listCreditLots(u.userId)).length, 1);
  assert.equal((await s.rev.repo.listUserReviews(u.userId)).length, 1);
});

test("중복 작성은 거절한다 — 같은 이용 건에는 후기가 하나(두 번째는 보상도 없다)", async () => {
  const s = await setup({ rewardOn: true });
  const u = await s.user("dup");
  const order = await s.buy(u);
  assert.equal((await createReview(s.deps(), s.input(u, order.id))).kind, "created");
  const second = await createReview(s.deps(), s.input(u, order.id, { body: `${GOOD} 한 번 더` }));
  assert.equal(second.kind, "exists");
  assert.equal(await s.credits(u.userId), 1);
  // 같은 사람이 재결제(다시 받기)한 다음 리포트는 별개의 이용 건이다
  const order2 = await s.buy(u);
  assert.notEqual(order2.id, order.id);
  assert.equal((await createReview(s.deps(), s.input(u, order2.id))).kind, "created");
  assert.equal(await s.credits(u.userId), 2, "구매 건당 한 번");
});

// ───── 보상 스위치 · 지급 실패 ─────

test("보상 스위치가 꺼져 있으면(기본) 후기만 저장하고 질문권을 주지 않으며, 대가 표시도 붙지 않는다 — 나중에 켜도 소급하지 않는다", async () => {
  const s = await setup();
  const u = await s.user("offuser");
  const order = await s.buy(u);
  const r = await createReview(s.deps(), s.input(u, order.id));
  assert.ok(r.kind === "created");
  if (r.kind !== "created") return;
  assert.equal(r.reward, "off");
  assert.equal(r.review.disclosure, "none");
  assert.equal(await s.credits(u.userId), 0);
  await s.ben.repo.setSetting({ key: "feature.review_reward", value: true, reason: "켬", by: null });
  assert.deepEqual(await retryReviewRewards(s.deps(), { userId: u.userId }), { tried: 0, granted: 0 });
  await editReview(s.deps(), { userId: u.userId, id: r.review.id, rating: 5, body: GOOD, publicConsent: true });
  assert.equal(await s.credits(u.userId), 0, "스위치를 켜기 전에 쓴 후기에 소급 지급하지 않는다(대가 표시와 어긋나지 않게)");
  assert.equal((await s.rev.repo.getReview(r.review.id))?.rewardState, "off");
});

test("보상 개수 설정이 0이면 지급하지 않는다", async () => {
  const s = await setup({ rewardOn: true });
  await s.ben.repo.setSetting({ key: "review.reward_credits", value: 0, reason: "시험", by: null });
  const u = await s.user("zero");
  const order = await s.buy(u);
  const r = await createReview(s.deps(), s.input(u, order.id));
  assert.ok(r.kind === "created" && r.reward === "off");
  assert.equal(await s.credits(u.userId), 0);
});

test("지급이 실패해도 후기는 저장되고, 나중에 맞추면 질문권이 한 번만 들어온다", async () => {
  const s = await setup({ rewardOn: true });
  const u = await s.user("flaky");
  const order = await s.buy(u);
  s.setFailGrant(true);
  const r = await createReview(s.deps(), s.input(u, order.id));
  assert.ok(r.kind === "created");
  if (r.kind !== "created") return;
  assert.equal(r.reward, "failed", "후기는 저장됐다");
  assert.equal(r.review.disclosure, "reward");
  assert.equal(await s.credits(u.userId), 0);
  s.setFailGrant(false);
  // MY를 열면 내 후기의 지급을 맞춘다
  const view = await getMyReviewsView(s.deps(), u.userId);
  assert.equal(view.written[0].review.rewardState, "granted");
  assert.equal(await s.credits(u.userId), 1);
  // 다시 맞춰도 한 번뿐
  assert.deepEqual(await retryReviewRewards(s.deps(), { userId: u.userId }), { tried: 0, granted: 0 });
  await getMyReviewsView(s.deps(), u.userId);
  assert.equal(await s.credits(u.userId), 1);
});

test("확정 기록을 남기기 전에 멈췄어도(질문권은 이미 들어간 상태) 다시 맞출 때 같은 키라 중복 지급되지 않는다", async () => {
  const s = await setup({ rewardOn: true });
  const u = await s.user("halfway");
  const order = await s.buy(u);
  // 지급 확정 기록만 실패하는 저장소
  const flakyReviews: ReviewRepository = { ...s.rev.repo, settleReward: async () => Promise.reject(new Error("settle failed")) };
  const r = await createReview({ ...s.deps(), reviews: flakyReviews }, s.input(u, order.id));
  assert.ok(r.kind === "created");
  assert.equal(await s.credits(u.userId), 1, "질문권은 들어갔다");
  assert.equal((await s.rev.repo.listUserReviews(u.userId))[0].rewardState, "pending");
  const retry = await retryReviewRewards(s.deps(), { userId: u.userId });
  assert.deepEqual(retry, { tried: 1, granted: 1 });
  assert.equal(await s.credits(u.userId), 1, "같은 키라 한 번 더 들어가지 않는다");
  assert.equal((await s.rev.repo.listUserReviews(u.userId))[0].rewardState, "granted");
});

test("무료 체험(혜택으로 받은 0원 주문)은 후기를 쓸 수 있고 '무료 체험 제공'으로 표시되며, 쿠폰의 후기 보상 허용이 있을 때만 질문권이 나온다", async () => {
  const s = await setup({ rewardOn: true });
  await s.ben.repo.setSetting({ key: "feature.coupons", value: true, reason: "시험", by: null });
  const eligible = await s.ben.repo.createCoupon({ code: "TRIAL-OK", name: "체험단", description: null, type: "free-report-entitlement", value: 0, productIds: [], targetUserId: null, perUserLimit: 1, issueLimit: null, startsAt: null, endsAt: null, purpose: "trial", reviewRewardEligible: true, stackableWithReferral: false, creditExpireDays: null, status: "active", createdBy: null });
  assert.ok(eligible.ok);
  const plain = await s.ben.repo.createCoupon({ code: "TRIAL-NO", name: "체험", description: null, type: "free-report-entitlement", value: 0, productIds: [], targetUserId: null, perUserLimit: 1, issueLimit: null, startsAt: null, endsAt: null, purpose: "trial", reviewRewardEligible: false, stackableWithReferral: false, creditExpireDays: null, status: "active", createdBy: null });
  assert.ok(plain.ok);

  const give = async (name: string, code: string) => {
    const u = await s.user(name);
    const g = await s.ben.repo.grantBenefitOrder({ userId: u.userId, assessmentId: u.assessmentId, productId: "personal-integrated-report", kind: "coupon", couponCode: code, listPriceKrw: 9900, orderNumber: `MEU-20261020-${name.toUpperCase().padEnd(10, "X").slice(0, 10)}`, paymentEnv: "test" });
    assert.ok(g.ok, JSON.stringify(g));
    if (!g.ok) throw new Error("grant");
    await readyOf(u, g.orderId);
    return { u, orderId: g.orderId };
  };
  const readyOf = (u: { userId: string; assessmentId: string }, orderId: string) => s.repo.insertReport({ userId: u.userId, orderId, assessmentId: u.assessmentId, status: "ready", attempts: 1 });

  const a = await give("trialok", "TRIAL-OK");
  const ra = await createReview(s.deps(), s.input(a.u, a.orderId));
  assert.ok(ra.kind === "created");
  if (ra.kind !== "created") return;
  assert.equal(ra.review.freeTrial, true);
  assert.equal(ra.review.disclosure, "reward", "보상 대상인 무료 체험은 두 표시 모두");
  assert.equal(await s.credits(a.u.userId), 1);

  const b = await give("trialno", "TRIAL-NO");
  const rb = await createReview(s.deps(), s.input(b.u, b.orderId));
  assert.ok(rb.kind === "created");
  if (rb.kind !== "created") return;
  assert.equal(rb.reward, "ineligible");
  assert.equal(rb.review.freeTrial, true);
  assert.equal(rb.review.disclosure, "free_trial");
  assert.equal(await s.credits(b.u.userId), 0);
});

// ───── 입력 · 개인정보 ─────

test("글이 최소 글자 수에 못 미치면 저장하지 않고(보상도 없다) 수정할 때도 같은 기준이다", async () => {
  const s = await setup({ rewardOn: true });
  const u = await s.user("terse");
  const order = await s.buy(u);
  const shortOne = await createReview(s.deps(), s.input(u, order.id, { body: "좋아요" }));
  assert.equal(shortOne.kind, "invalid");
  assert.equal((await s.rev.repo.listUserReviews(u.userId)).length, 0);
  assert.equal(await s.credits(u.userId), 0);
  assert.equal((await createReview(s.deps(), { ...s.input(u, order.id), rating: 9 })).kind, "invalid");
  const ok = await createReview(s.deps(), s.input(u, order.id));
  assert.ok(ok.kind === "created");
  if (ok.kind !== "created") return;
  const edit = await editReview(s.deps(), { userId: u.userId, id: ok.review.id, rating: 5, body: "", publicConsent: true });
  assert.equal(edit.kind, "invalid", "보상을 받은 뒤 글을 비우는 것을 막는다");
  assert.equal((await s.rev.repo.getReview(ok.review.id))?.body, GOOD);
  // 관리자가 최소 글자 수 설정을 바꾸면 그 기준을 따른다
  await s.ben.repo.setSetting({ key: "review.min_body_chars", value: 40, reason: "시험", by: null });
  const u2 = await s.user("terse2");
  const o2 = await s.buy(u2);
  assert.equal((await createReview(s.deps(), s.input(u2, o2.id, { body: "스무 자는 넘지만 마흔 자에는 못 미치는 글이에요." }))).kind, "invalid");
});

test("연락처 · 이메일 · 주민번호 · 카드번호는 저장 전에 가려지고, 저장된 글에는 남지 않는다", async () => {
  const s = await setup();
  const u = await s.user("pii");
  const order = await s.buy(u);
  const body = `${GOOD} 문의는 010-2345-6789, mail@example.com, 900101-1234567, 1234-5678-9012-3456 로 주세요.`;
  const r = await createReview(s.deps(), s.input(u, order.id, { body }));
  assert.ok(r.kind === "created");
  if (r.kind !== "created") return;
  assert.ok(r.redactions >= 4, String(r.redactions));
  const stored = (await s.rev.repo.getReview(r.review.id))!.body;
  assert.ok(!/010-2345|example\.com|900101|1234-5678/.test(stored), stored);
  const page = await publicReviewsPage(s.rev.repo, { group: null, page: 1 });
  assert.ok(!/010-2345|example\.com|900101/.test(JSON.stringify(page)));
});

// ───── 수정 · 삭제 · 비공개 · 소유자 ─────

test("내 후기만 고치고 지우고 공개를 바꾼다 — 남의 후기 번호로는 아무것도 바뀌지 않는다", async () => {
  const s = await setup({ rewardOn: true });
  const me = await s.user("owner");
  const thief = await s.user("thief");
  const order = await s.buy(me);
  const r = await createReview(s.deps(), s.input(me, order.id));
  assert.ok(r.kind === "created");
  if (r.kind !== "created") return;
  const id = r.review.id;
  assert.equal((await editReview(s.deps(), { userId: thief.userId, id, rating: 1, body: BAD, publicConsent: false })).kind, "not-found");
  assert.equal((await setReviewVisibility(s.deps(), { userId: thief.userId, id, publicConsent: false })).kind, "not-found");
  assert.equal((await deleteReview(s.deps(), { userId: thief.userId, id })).kind, "not-found");
  assert.equal((await editReview(s.deps(), { userId: me.userId, id: "bad", rating: 1, body: BAD, publicConsent: false })).kind, "not-found");
  const still = (await s.rev.repo.getReview(id))!;
  assert.equal(still.body, GOOD);
  assert.equal(still.status, "published");
  // 본인은 된다
  assert.equal((await editReview(s.deps(), { userId: me.userId, id, rating: 4, body: BAD, publicConsent: true })).kind, "updated");
  assert.equal((await s.rev.repo.getReview(id))?.body, BAD);
  // 삭제는 묘비 — 글이 지워지고 공개에서 빠진다. 지운 후기는 고칠 수 없다(다시 쓰기는 새로 작성)
  assert.equal((await deleteReview(s.deps(), { userId: me.userId, id })).kind, "deleted");
  const tomb = (await s.rev.repo.getReview(id))!;
  assert.deepEqual([tomb.status, tomb.body, tomb.publicConsent, tomb.deletedBy], ["deleted", "", false, "user"]);
  assert.equal((await editReview(s.deps(), { userId: me.userId, id, rating: 4, body: GOOD, publicConsent: true })).kind, "not-found");
  assert.equal((await deleteReview(s.deps(), { userId: me.userId, id })).kind, "not-found", "이미 지운 것은 다시 지울 수 없다");
});

test("공개 · 비공개 전환: 나만 보기로 바꾸면 공개 후기에서 빠지고, 다시 공개하면 돌아온다 — 대가 표시는 그대로", async () => {
  const s = await setup({ rewardOn: true });
  const u = await s.user("toggler");
  const order = await s.buy(u);
  const r = await createReview(s.deps(), s.input(u, order.id));
  assert.ok(r.kind === "created");
  if (r.kind !== "created") return;
  assert.equal((await publicReviewsPage(s.rev.repo, { group: null, page: 1 })).total, 1);
  assert.equal((await setReviewVisibility(s.deps(), { userId: u.userId, id: r.review.id, publicConsent: false })).kind, "updated");
  const hidden = (await s.rev.repo.getReview(r.review.id))!;
  assert.deepEqual([hidden.status, hidden.publicConsent, hidden.consentedAt], ["private", false, null]);
  assert.equal((await publicReviewsPage(s.rev.repo, { group: null, page: 1 })).total, 0);
  assert.equal((await setReviewVisibility(s.deps(), { userId: u.userId, id: r.review.id, publicConsent: true })).kind, "updated");
  const back = (await s.rev.repo.getReview(r.review.id))!;
  assert.deepEqual([back.status, back.publicConsent, back.disclosure], ["published", true, "reward"]);
  assert.ok(back.consentedAt && back.consentNoticeVersion, "공개에 동의한 시각과 그때의 안내 판이 남는다");
  assert.equal((await publicReviewsPage(s.rev.repo, { group: null, page: 1 })).total, 1);
});

// ───── 공개 조회 · 메인 ─────

test("공개 후기는 공개 중이고 공개에 동의한 것만 — 비공개 · 운영자 숨김 · 삭제는 보이지 않고, 작성자를 알 수 있는 값이 없다", async () => {
  const s = await setup({ rewardOn: true });
  const make = async (name: string, o: Partial<{ publicConsent: boolean; rating: number; kind: string }> = {}) => {
    const u = await s.user(name);
    const order = o.kind === "saju_compat" ? await s.buyCompat(u) : await s.buy(u);
    const r = await createReview(s.deps(), { ...s.input(u, order.id, { publicConsent: o.publicConsent ?? true, rating: o.rating ?? 5, kind: o.kind }), kind: o.kind ?? "personal" });
    assert.ok(r.kind === "created", `${name} ${r.kind}`);
    return { u, review: r.kind === "created" ? r.review : null! };
  };
  const pub = await make("public1");
  await make("private1", { publicConsent: false });
  const hid = await make("hidden1");
  const del = await make("deleted1");
  const compat = await make("compat1", { kind: "saju_compat", rating: 2 });
  await s.rev.repo.adminApply({ reviewId: hid.review.id, action: "hide", reasonCode: "privacy", memo: null, adminId: "admin" });
  await deleteReview(s.deps(), { userId: del.u.userId, id: del.review.id });
  const all = await publicReviewsPage(s.rev.repo, { group: null, page: 1 });
  assert.deepEqual(all.reviews.map((x) => x.id).sort(), [pub.review.id, compat.review.id].sort());
  assert.equal(all.total, 2);
  const keys = new Set(all.reviews.flatMap((x) => Object.keys(x)));
  assert.ok(![...keys].some((k) => /user|nick|name|assessment|order|subject/i.test(k)), [...keys].join(","));
  // 종류별 필터: 개인 · 궁합 · 채팅
  assert.equal((await publicReviewsPage(s.rev.repo, { group: "personal", page: 1 })).total, 1);
  assert.equal((await publicReviewsPage(s.rev.repo, { group: "compat", page: 1 })).total, 1);
  assert.equal((await publicReviewsPage(s.rev.repo, { group: "chat", page: 1 })).total, 0);
  // 쪽 번호가 잘못돼도 첫 쪽
  assert.equal((await publicReviewsPage(s.rev.repo, { group: null, page: -3 })).page, 1);
});

test("메인: 공개 후기가 없으면 아무것도 보이지 않는다(가짜로 채우지 않는다) — 비공개 후기만 있어도 마찬가지", async () => {
  const s = await setup({ rewardOn: true });
  assert.deepEqual(await homeReviews(s.rev.repo), { reviews: [], total: 0 });
  const u = await s.user("quiet");
  const order = await s.buy(u);
  await createReview(s.deps(), s.input(u, order.id, { publicConsent: false }));
  assert.deepEqual(await homeReviews(s.rev.repo), { reviews: [], total: 0 }, "나만 보기 후기는 메인에 나오지 않는다");
  const v = await s.user("voice");
  const o2 = await s.buy(v);
  await createReview(s.deps(), s.input(v, o2.id));
  const home = await homeReviews(s.rev.repo);
  assert.equal(home.reviews.length, 1);
  assert.equal(home.total, 1);
});

test("메인은 최대 6개 — 선정한 후기가 먼저, 종류가 섞이고, 별점이 낮은 후기도 같은 기준으로 보인다", async () => {
  const s = await setup({ rewardOn: true });
  const ids: string[] = [];
  for (let i = 0; i < 8; i++) {
    const u = await s.user(`many${i}`);
    const order = await s.buy(u);
    const r = await createReview(s.deps(), s.input(u, order.id, { rating: i % 5 + 1 }));
    assert.ok(r.kind === "created");
    if (r.kind === "created") ids.push(r.review.id);
    s.tick(1000);
  }
  const cu = await s.user("compatman");
  const co = await s.buyCompat(cu);
  const cr = await createReview(s.deps(), s.input(cu, co.id, { kind: "saju_compat", rating: 1, body: BAD }));
  assert.ok(cr.kind === "created");
  const old = await s.rev.repo.adminApply({ reviewId: ids[0], action: "feature", reasonCode: "specific", memo: null, adminId: "admin" });
  assert.ok(old.ok);
  const home = await homeReviews(s.rev.repo);
  assert.equal(home.reviews.length, 6);
  assert.equal(home.total, 9);
  assert.equal(home.reviews[0].id, ids[0], "선정한 후기가 먼저");
  assert.ok(home.reviews.some((r) => r.kind === "saju_compat" && r.rating === 1), "다른 종류(낮은 별점 포함)도 섞여 보인다");
});

// ───── 신고 ─────

test("신고: 공개 중인 후기에만, 같은 방문자는 한 번만", async () => {
  const s = await setup({ rewardOn: true });
  const u = await s.user("reported");
  const order = await s.buy(u);
  const r = await createReview(s.deps(), s.input(u, order.id));
  assert.ok(r.kind === "created");
  if (r.kind !== "created") return;
  assert.equal(await reportReview(s.rev.repo, { reviewId: r.review.id, reporterKey: "visitor-aaaa-1111", reason: "privacy" }), "reported");
  assert.equal(await reportReview(s.rev.repo, { reviewId: r.review.id, reporterKey: "visitor-aaaa-1111", reason: "abuse" }), "duplicate");
  assert.equal(await reportReview(s.rev.repo, { reviewId: r.review.id, reporterKey: "visitor-bbbb-2222", reason: "other" }), "reported");
  assert.equal(await reportReview(s.rev.repo, { reviewId: "nope", reporterKey: "visitor-aaaa-1111", reason: "privacy" }), "invalid");
  assert.equal(await reportReview(s.rev.repo, { reviewId: r.review.id, reporterKey: "visitor-aaaa-1111", reason: "negative" }), "invalid");
  await setReviewVisibility(s.deps(), { userId: u.userId, id: r.review.id, publicConsent: false });
  assert.equal(await reportReview(s.rev.repo, { reviewId: r.review.id, reporterKey: "visitor-cccc-3333", reason: "privacy" }), "not-public");
});

// ───── MY ─────

test("MY: 쓴 후기와 아직 쓰지 않은 적격 건을 나누어 보여 주고, 지운 후기는 '다시 쓰기'로 돌려놓는다(보상은 다시 없다)", async () => {
  const s = await setup({ rewardOn: true });
  const u = await s.user("myview");
  const o1 = await s.buy(u);
  const o2 = await s.buy(u);
  s.answerChat(u);
  let view = await getMyReviewsView(s.deps(), u.userId);
  assert.equal(view.ready, true);
  assert.deepEqual(view.reward, { on: true, credits: 1 });
  assert.equal(view.written.length, 0);
  assert.equal(view.unwritten.length, 3);
  assert.ok(view.unwritten.every((x) => x.rewardOffered && !x.rewrite));
  const w = await createReview(s.deps(), s.input(u, o1.id));
  assert.ok(w.kind === "created");
  if (w.kind !== "created") return;
  view = await getMyReviewsView(s.deps(), u.userId);
  assert.equal(view.written.length, 1);
  assert.equal(view.written[0].title, "심층 리포트");
  assert.equal(view.unwritten.length, 2);
  assert.ok(!view.unwritten.some((x) => x.subject.subjectRef === o1.id));
  await deleteReview(s.deps(), { userId: u.userId, id: w.review.id });
  view = await getMyReviewsView(s.deps(), u.userId);
  assert.equal(view.written.length, 0, "지운 후기는 목록에 글이 남지 않는다");
  const again = view.unwritten.find((x) => x.subject.subjectRef === o1.id);
  assert.ok(again && again.rewrite && !again.rewardOffered);
  assert.ok(view.unwritten.some((x) => x.subject.subjectRef === o2.id && !x.rewrite));
  // 다른 사람의 목록에는 나오지 않는다
  const other = await s.user("nobody");
  const empty = await getMyReviewsView(s.deps(), other.userId);
  assert.deepEqual([empty.written.length, empty.unwritten.length], [0, 0]);
});

// ───── 탈퇴 · 준비 중 ─────

test("탈퇴하면 그 회원의 후기가 지워지고 공개 후기에서도 사라진다 — 이미 받은 질문권 기록은 혜택 쪽 정책을 따른다", async () => {
  const s = await setup({ rewardOn: true });
  const leaver = await s.user("leaver1");
  const stayer = await s.user("stayer1");
  const o1 = await s.buy(leaver);
  const o2 = await s.buy(stayer);
  const r1 = await createReview(s.deps(), s.input(leaver, o1.id));
  await createReview(s.deps(), s.input(stayer, o2.id));
  assert.ok(r1.kind === "created");
  if (r1.kind !== "created") return;
  await s.repo.ensureProfile(leaver.userId);
  const res = await s.repo.withdrawMemberData(leaver.userId);
  assert.equal(res.ok, true);
  assert.equal(await s.rev.repo.getReview(r1.review.id), null);
  assert.equal((await s.rev.repo.listUserReviews(leaver.userId)).length, 0);
  const page = await publicReviewsPage(s.rev.repo, { group: null, page: 1 });
  assert.equal(page.total, 1, "남은 회원의 후기는 그대로");
});

test("후기 표가 아직 없는 DB(25번 전): 조회는 빈 값, 쓰기는 '준비 중' — 홈과 기존 화면은 깨지지 않는다", async () => {
  const s = await setup({ rewardOn: true });
  const notReady = Object.assign(new Error("후기 표 · 함수가 없습니다"), { code: "42P01" });
  const broken = new Proxy({} as ReviewRepository, { get: () => () => Promise.reject(notReady) });
  const u = await s.user("legacy");
  const order = await s.buy(u);
  const deps = { ...s.deps(), reviews: broken };
  assert.equal((await createReview(deps, s.input(u, order.id))).kind, "not-ready");
  assert.deepEqual(await homeReviews(broken), { reviews: [], total: 0 });
  assert.deepEqual(await publicReviewsPage(broken, { group: null, page: 1 }), { reviews: [], total: 0, page: 1, pages: 1, group: null });
  const view = await getMyReviewsView(deps, u.userId);
  assert.equal(view.ready, false);
  assert.equal(await reportReview(broken, { reviewId: randomUUID(), reporterKey: "visitor-aaaa-1111", reason: "privacy" }), "not-ready");
  assert.equal((await editReview(deps, { userId: u.userId, id: randomUUID(), rating: 5, body: GOOD, publicConsent: true })).kind, "not-ready");
});

test("혜택 표가 없는 DB(19번 전)에서도 후기는 쓸 수 있고 보상만 꺼진 것으로 본다", async () => {
  const s = await setup({ rewardOn: true });
  const notReady = Object.assign(new Error("혜택 표가 없습니다"), { code: "42P01" });
  const broken = new Proxy({} as BenefitRepository, { get: () => () => Promise.reject(notReady) });
  const u = await s.user("nobenefit");
  const order = await s.buy(u);
  const r = await createReview({ ...s.deps(), benefits: broken }, s.input(u, order.id));
  assert.ok(r.kind === "created" && r.reward === "off");
});

test("시험이 시계에 기대지 않는다 — 같은 입력은 같은 결과", async () => {
  const s = await setup({ rewardOn: true });
  const before = s.now().getTime();
  s.tick(DAY);
  assert.equal(s.now().getTime(), before + DAY);
});
