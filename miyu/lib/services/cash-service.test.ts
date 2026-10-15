// 실행: npm test — 유료 질문(질문 한 개당 결제): 서버가 금액을 정하고, 질문을 받을 수 있을 때만 주문을 만들며, 결제 승인이 확인된 뒤에만 한 개가 들어가고, 리포트는 만들지 않고, 환불하면 회수한다
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { MIYU_CASH, QUESTION_PRICE_KRW, isCashProduct, parseCashProductId } from "../config/product.ts";
import { createQuestionNonce, questionRoomOf } from "../commerce/cash.ts";
import { EMPTY_BASIC_INFO } from "../profile/basic-info.ts";
import { CRISIS_REPLY } from "../report/chat/question.ts";
import type { ChatContext } from "../report/chat/types.ts";
import { manseryeokEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { CASH_KIND_LABEL, getCashView, startQuestionPayment } from "./cash-service.ts";
import { ASK_MESSAGES, type AskDeps } from "./chat-service.ts";
import { getMetrics } from "./metrics-service.ts";
import { getMyPage } from "./my-service.ts";
import { confirmPayment, startCheckout } from "./order-service.ts";
import { claimReport, ensureReport, queueReport } from "./report-service.ts";
import { devReportGenerator } from "../report/generate-dev-report.ts";
import { createFakeToss } from "./testing/fake-toss.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const INFO = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true, gender: "female" as const };
const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, 4])));
const CONTEXT: ChatContext = { room: { label: "연애", mode: "연애박사 미유", focus: "연애 · 관계" }, intake: null, topic: { title: "가까운 관계", headline: "확인이 되면 마음이 편해져요", summary: ["확인이 있으면 편해져요."], detail: [] }, overview: { headline: "확인을 중요하게 여겨요", tendency: null, strength: null, caution: null, flow: null }, followUp: false, taste: false };

type WorldOpts = { tier?: "paid" | "free"; room?: string };

async function world(opts: WorldOpts = {}) {
  const t = new Date("2026-10-15T03:00:00Z").getTime();
  const now = () => new Date(t);
  const mem = createMemoryRepository(now);
  const toss = createFakeToss(now);
  const saved = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: USER, channel: "web", info: INFO, answers, today: now() });
  if (!saved.ok) throw new Error(saved.message);
  const assessment = saved.assessment;
  let n = 0;
  const room = opts.room ?? "love";
  const roomKey = room === "daily" ? "daily:2026-10-15" : room;
  const tier = opts.tier ?? "free";
  const answerer = { provider: "t", model: "t", answer: async () => ({ paragraphs: ["답이에요."] }) };
  const deps: AskDeps & { nonce: (room: string) => string; saleGate?: Parameters<typeof startQuestionPayment>[0]["saleGate"] } = {
    repo: mem.repo,
    answerer,
    now,
    config: { extraQuestions: 0 },
    nonce: (r) => createQuestionNonce(r, (b) => b.fill(++n % 200)),
    loadAsk: async () => ({ context: CONTEXT, referenceDate: "2026-10-15", tier, room, roomKey }),
  };
  /** 이 방의 무료 질문을 count번 쓴 상태로 만든다 */
  const spendFree = async (count: number, userId = USER) => {
    for (let i = 0; i < count; i++) await mem.repo.addChatQuestion({ userId, assessmentId: assessment.id, roomKey });
  };
  const input = (question: unknown = "요즘 연락이 뜸한 사람이 있어요", userId = USER) => ({ userId, assessmentId: assessment.id, roomKey, question });
  /** 무료 질문을 다 쓴 방에서 결제 주문을 만들고 승인까지 마친다 */
  async function pay(env: "test" | "live" = "test") {
    await spendFree(tier === "free" ? 2 : 3);
    const r = await startQuestionPayment(deps, { ...input(), paymentEnv: env });
    if (r.kind !== "order") throw new Error(r.kind);
    const paid = await confirmPayment({ repo: mem.repo, gateway: toss.gateway }, { userId: USER, orderNumber: r.order.orderNumber, paymentKey: `pk_q_${++n}`, amount: r.order.amount });
    if (paid.kind !== "paid") throw new Error(paid.kind);
    return { ...r, order: paid.order };
  }
  return { mem, toss, now, assessment, deps, input, spendFree, pay };
}

test("결제 시작: 무료 질문을 다 쓴 방에서 서버가 금액(300원)을 정해 주문을 만들고, 상품 번호에 방 이름이 앞에 붙는다", async () => {
  const w = await world({ room: "love" });
  await w.spendFree(2);
  const r = await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" });
  assert.equal(r.kind, "order");
  if (r.kind !== "order") return;
  assert.equal(r.order.amount, QUESTION_PRICE_KRW);
  assert.equal(r.order.amount, 300);
  assert.equal(r.quote.units, MIYU_CASH.perQuestion);
  const parsed = parseCashProductId(r.order.productId);
  assert.equal(parsed?.cash, 3);
  assert.equal(parsed?.bonus, 0);
  assert.equal(questionRoomOf(r.order.productId), "love", "결제 뒤 이 방으로 돌아온다");
  assert.equal(r.order.status, "pending");
  assert.equal(r.order.userId, USER);
  // 질문 글은 주문 · 어떤 기록에도 남지 않는다
  assert.ok(!JSON.stringify([...w.mem.orders.values(), w.mem.opsEvents]).includes("연락이 뜸한"));
});

test("결제 시작: 무료 질문이 남아 있거나 결제해 둔 질문이 있으면 새로 결제받지 않는다 (보관은 질문 한 개까지)", async () => {
  const w = await world({ room: "love" });
  assert.deepEqual(await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" }), { kind: "ask" }, "무료 질문이 남았다");
  await w.spendFree(1);
  assert.deepEqual(await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" }), { kind: "ask" }, "아직 한 번 남았다");
  assert.equal(w.mem.orders.size, 0);
  const paid = await w.pay();
  assert.equal(paid.order.status, "paid");
  // 결제해 둔 질문이 아직 있다 — 새 주문을 만들지 않는다
  assert.deepEqual(await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" }), { kind: "ask" });
  assert.equal(w.mem.orders.size, 1);
});

test("결제 시작: 질문을 받을 수 없으면 결제하지 않는다 — 위기 표현은 안내로 끝나고, 빈 글 · 너무 긴 글 · 심층 리포트로만 열리는 방 · 남의 결과도 주문이 없다", async () => {
  const w = await world({ room: "love" });
  await w.spendFree(2);
  assert.deepEqual(await startQuestionPayment(w.deps, { ...w.input("자살하고 싶다는 생각이 들어요"), paymentEnv: "test" }), { kind: "refused", result: { ok: true, kind: "safety", paragraphs: CRISIS_REPLY } });
  for (const bad of ["  ", "가".repeat(1001)]) {
    const r = await startQuestionPayment(w.deps, { ...w.input(bad), paymentEnv: "test" });
    assert.equal(r.kind, "refused", String(bad.length));
  }
  assert.equal((await startQuestionPayment(w.deps, { ...w.input(undefined, OTHER), paymentEnv: "test" })).kind, "refused");
  const locked = await world({ tier: "free", room: "career" });
  assert.deepEqual(await startQuestionPayment(locked.deps, { ...locked.input(), paymentEnv: "test" }), { kind: "refused", result: { ok: false, reason: "room-locked", message: ASK_MESSAGES["room-locked"] } });
  const main = await world({ tier: "free", room: "main" });
  const deepOnly = await startQuestionPayment(main.deps, { ...main.input(), paymentEnv: "test" });
  assert.ok(deepOnly.kind === "refused" && !deepOnly.result.ok && deepOnly.result.reason === "deep-only");
  for (const x of [w, locked, main]) assert.equal(x.mem.orders.size, 0);
  // 연결된 AI가 없으면(준비 중) 결제도 받지 않는다
  assert.deepEqual(await startQuestionPayment({ ...w.deps, answerer: null }, { ...w.input(), paymentEnv: "test" }), { kind: "refused", result: { ok: false, reason: "closed", message: ASK_MESSAGES.closed } });
  assert.equal(w.mem.orders.size, 0);
});

test("결제 시작: 무료 리포트의 무료 질문 글자 수는 500자, 유료 질문은 1,000자까지 받는다", async () => {
  const w = await world({ tier: "free", room: "love" });
  // 무료 질문이 남았을 때는 500자 한도 — 500자를 넘으면 거절
  const tooLongFree = await startQuestionPayment(w.deps, { ...w.input("가".repeat(501)), paymentEnv: "test" });
  assert.ok(tooLongFree.kind === "refused" && !tooLongFree.result.ok && tooLongFree.result.reason === "too-long-free");
  await w.spendFree(2);
  const ok1000 = await startQuestionPayment(w.deps, { ...w.input("가".repeat(1000)), paymentEnv: "test" });
  assert.equal(ok1000.kind, "order", "무료 질문을 다 쓴 뒤의 유료 질문은 1,000자까지");
});

test("결제 시작: 다시 누르면 이전 질문 결제 대기 주문은 대체되고, 개인 통합 리포트의 대기 주문은 건드리지 않는다", async () => {
  const w = await world();
  await w.spendFree(2);
  const report = await startCheckout({ repo: w.mem.repo, now: w.now }, { userId: USER, assessmentId: w.assessment.id });
  if (report.kind !== "order") throw new Error();
  const a = await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" });
  const b = await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" });
  if (a.kind !== "order" || b.kind !== "order") throw new Error();
  assert.notEqual(a.order.productId, b.order.productId, "주문마다 임의 번호가 다르다");
  assert.equal(w.mem.orders.get(a.order.id)?.status, "canceled");
  assert.equal(w.mem.orders.get(a.order.id)?.failureCode, "SUPERSEDED");
  assert.equal(w.mem.orders.get(b.order.id)?.status, "pending");
  assert.equal(w.mem.orders.get(report.order.id)?.status, "pending", "리포트 대기 주문은 그대로");
});

test("결제 시작: 지금은 새 구매를 받지 않으면(AI 용량 · 하루 예산) 주문을 만들지 않고, 확인이 실패하면 막지 않는다", async () => {
  const w = await world();
  await w.spendFree(2);
  const closed = await startQuestionPayment({ ...w.deps, saleGate: async () => ({ open: false, reason: "budget", queued: 0, generating: 0, todayCostKrw: 0, budgetUsedPct: 100 }) }, { ...w.input(), paymentEnv: "test" });
  assert.equal(closed.kind, "sales-closed");
  assert.equal(w.mem.orders.size, 0);
  const broken = await startQuestionPayment({ ...w.deps, saleGate: async () => { throw new Error("확인 실패"); } }, { ...w.input(), paymentEnv: "test" });
  assert.equal(broken.kind, "order");
});

test("결제 승인이 확인되기 전에는 장부가 비어 있고, 승인되면 질문 한 개(3단위)가 한 번만 들어간다", async () => {
  const w = await world();
  await w.spendFree(2);
  const started = await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" });
  if (started.kind !== "order") throw new Error();
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0, "주문만 만들었다고 질문이 생기지 않는다");

  const first = await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_q_x", amount: started.order.amount });
  assert.equal(first.kind, "paid");
  const again = await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_q_x", amount: started.order.amount });
  assert.equal(again.kind, "paid", "같은 요청을 다시 보내도");
  const view = await getCashView(w.mem.repo, USER);
  assert.equal(view.balance, MIYU_CASH.perQuestion, "두 번 들어가지 않는다");
  assert.equal(view.questions, 1);
  assert.deepEqual(view.ledger.map((l) => [l.kind, l.amount, l.label]), [["charge", 3, CASH_KIND_LABEL.charge]]);
});

test("금액이 다르면 승인하지 않아 장부에 아무것도 들어가지 않는다", async () => {
  const w = await world();
  await w.spendFree(2);
  const started = await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" });
  if (started.kind !== "order") throw new Error();
  const r = await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_q_low", amount: 100 });
  assert.equal(r.kind, "rejected");
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0);
});

test("질문 결제 주문은 리포트를 만들지 않는다 (대기열 · 생성 · 다시 만들기 어디서도)", async () => {
  const w = await world();
  const paid = await w.pay();
  assert.equal(await queueReport({ repo: w.mem.repo }, paid.order), null);
  assert.equal(await ensureReport({ repo: w.mem.repo, generator: devReportGenerator, now: w.now }, paid.order), null);
  assert.deepEqual(await claimReport({ repo: w.mem.repo, generator: devReportGenerator, now: w.now }, paid.order, { retryFailed: true, ignoreCooldown: true }), { report: null, claimed: false });
  assert.equal(w.mem.reports.size, 0);
});

test("질문 결제 주문은 MY의 리포트 목록에 끼지 않고 결제내역에만 '유료 질문 1개'로 남는다", async () => {
  const w = await world();
  await w.pay();
  const page = await getMyPage(w.mem.repo, USER);
  assert.equal(page.cards.length, 1, "검사 결과 카드는 그대로 하나");
  assert.equal(page.cards[0].entitlement, "free", "질문 결제는 리포트 구매가 아니다");
  assert.deepEqual(page.cards[0].received, []);
  assert.equal(page.orders[0].productName, `${MIYU_CASH.name} 1개`);
  assert.equal(isCashProduct(w.mem.orders.values().next().value!.productId), true);
});

test("결제가 취소(환불)되면 넣어 준 질문을 회수하고, 이미 쓴 질문은 모자란 몫으로 남긴다", async () => {
  const w = await world();
  const paid = await w.pay();
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 3);
  // 안 쓴 채 환불 — 3단위를 모두 회수한다
  await w.mem.repo.updateOrder(paid.order.id, ["paid"], { status: "refunded" });
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0);
  assert.equal(w.mem.ledger.find((l) => l.kind === "clawback")?.shortfall, 0);

  // 질문에 쓴 뒤 환불 — 이미 쓴 만큼은 회수하지 못하고 모자란 몫으로 남는다 (음수가 되지 않는다)
  const second = await w.pay();
  await w.mem.repo.spendCash({ userId: USER, amount: MIYU_CASH.perQuestion, ref: "ask-used-1" });
  await w.mem.repo.updateOrder(second.order.id, ["paid"], { status: "refunded" });
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0);
  const claws = w.mem.ledger.filter((l) => l.kind === "clawback");
  assert.equal(claws.length, 2);
  assert.equal(Math.abs(claws[1].amount), 0, "회수할 질문이 없다");
  assert.equal(claws[1].shortfall, 3, "이미 쓴 질문은 회수하지 못한 몫으로 기록 — 운영자가 확인한다");
});

test("장부 표가 없는 DB(13번 변경 전)에서는 결제한 질문이 0으로 보이고 화면이 깨지지 않는다", async () => {
  const w = await world();
  const broken = { ...w.mem.repo, getCashBalance: async () => { throw Object.assign(new Error("relation does not exist"), { code: "42P01" }); } };
  assert.deepEqual(await getCashView(broken, USER), { ready: false, balance: 0, questions: 0, ledger: [] });
});

test("사업 지표: 질문 결제는 리포트 매출 · 한 건당 계산에 섞지 않고 따로 센다 (테스트 결제는 어디에도 넣지 않는다)", async () => {
  const w = await world();
  await w.pay("live");
  // 결제해 둔 질문을 쓰고 한 번 더 — 보관은 한 개까지라 쓴 뒤에 새로 결제한다
  await w.mem.repo.spendCash({ userId: USER, amount: MIYU_CASH.perQuestion, ref: "ask-m-1" });
  await w.mem.repo.addChatQuestion({ userId: USER, assessmentId: w.assessment.id, roomKey: "love" });
  const test = await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" });
  if (test.kind !== "order") throw new Error(test.kind);
  await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: test.order.orderNumber, paymentKey: "pk_q_t", amount: test.order.amount });
  await w.mem.repo.spendCash({ userId: USER, amount: MIYU_CASH.perQuestion, ref: "ask-m-2" });
  const refund = await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "live" });
  if (refund.kind !== "order") throw new Error(refund.kind);
  const done = await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: refund.order.orderNumber, paymentKey: "pk_q_r", amount: refund.order.amount });
  if (done.kind !== "paid") throw new Error(done.kind);
  await w.mem.repo.updateOrder(done.order.id, ["paid"], { status: "refunded" });
  const m = await getMetrics(w.mem.repo, w.now(), 30);
  assert.equal(m.revenue.cash.paidCount, 1);
  assert.equal(m.revenue.cash.refundedCount, 1);
  assert.equal(m.revenue.cash.netKrw, QUESTION_PRICE_KRW);
  assert.equal(m.revenue.paidCount, 0, "리포트 주문은 없다");
  assert.equal(m.revenue.netKrw, 0);
  assert.equal(m.revenue.testPaidCount, 1);
  assert.equal(m.funnel.find((f) => f.key === "checkout")?.count, 0, "질문 결제는 '결제 시작' 단계에 넣지 않는다");
});

test("장부 표가 없는 DB에서는 질문 결제 주문을 만들지 않는다 (결제가 승인돼도 질문을 넣을 수 없어 돈만 빠지는 일을 막는다)", async () => {
  const w = await world();
  await w.spendFree(2);
  const noWallet = { ...w.mem.repo, getCashBalance: async () => { throw Object.assign(new Error("relation does not exist"), { code: "42P01" }); } };
  const r = await startQuestionPayment({ ...w.deps, repo: noWallet }, { ...w.input(), paymentEnv: "test" });
  assert.equal(r.kind, "unavailable");
  assert.equal(w.mem.orders.size, 0);
  assert.equal((await getCashView(w.mem.repo, USER)).ready, true);
});

test("결제 뒤 되돌아오는 길: 결제해 둔 질문이 있는 방에서 질문하면 답을 받고 한 개가 쓰이며, 답을 받지 못하면 같은 결제로 다시 물을 수 있다", async () => {
  const { askFreeQuestion } = await import("./chat-service.ts");
  const w = await world({ room: "love" });
  await w.pay();
  const hard = { provider: "t", model: "t", answer: async () => Promise.reject(Object.assign(new Error("fail"), { name: "ChatAnswerError" })) };
  await assert.rejects(askFreeQuestion({ ...w.deps, answerer: hard }, w.input("결제하고 보낸 질문")), /fail/);
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 3, "답을 받지 못하면(예상 못 한 오류도) 되돌린다 — 추가 결제 없이 다시 물을 수 있다");
  const r = await askFreeQuestion(w.deps, w.input("결제하고 보낸 질문"));
  assert.ok(r.ok && r.kind === "answer" && r.cash?.balance === 0);
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0);
  // 한 번 쓰고 나면 새로 결제해야 한다
  const again = await askFreeQuestion(w.deps, w.input("또 물어볼게요"));
  assert.deepEqual(again, { ok: false, reason: "need-payment", message: ASK_MESSAGES["need-payment"] });
});
