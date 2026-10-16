// 실행: npm test — 유료 질문(질문 3개 묶음 결제): 서버가 금액을 정하고, 질문을 받을 수 있을 때만 주문을 만들며, 결제 승인이 확인된 뒤에만 3개가 들어가고, 리포트는 만들지 않고, 환불하면 회수한다
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { hasSupportContact, SUPPORT_CONTACT, SUPPORT_CONTACT_PENDING, supportContactLine } from "../config/business.ts";
import { MIYU_CASH, QUESTION_PACK_PRICE_KRW, QUESTION_PACK_SIZE, QUESTION_PACK_UNITS, isCashProduct, parseCashProductId, questionPackSalesOpen } from "../config/product.ts";
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
  const deps: AskDeps & { nonce: (room: string) => string; saleGate?: Parameters<typeof startQuestionPayment>[0]["saleGate"]; liveSalesOpen?: boolean } = {
    repo: mem.repo,
    liveSalesOpen: true, // 이 파일의 시험은 실결제 모드의 매출 계산도 본다 — 판매를 막는 규칙은 아래 별도 시험에서 확인한다
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

test("결제 시작: 무료 질문을 다 쓴 방에서 서버가 금액(질문 3개 2,500원)을 정해 주문을 만들고, 상품 번호에 방 이름이 앞에 붙는다", async () => {
  const w = await world({ room: "love" });
  await w.spendFree(2);
  const r = await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" });
  assert.equal(r.kind, "order");
  if (r.kind !== "order") return;
  assert.equal(r.order.amount, QUESTION_PACK_PRICE_KRW);
  assert.equal(r.order.amount, 2500);
  assert.equal(r.quote.units, QUESTION_PACK_UNITS);
  assert.equal(r.quote.questions, QUESTION_PACK_SIZE);
  const parsed = parseCashProductId(r.order.productId);
  assert.equal(parsed?.cash, 9, "질문 3개 = 9단위");
  assert.equal(parsed?.bonus, 0);
  assert.equal(questionRoomOf(r.order.productId), "love", "결제 뒤 이 방으로 돌아온다");
  assert.equal(r.order.status, "pending");
  assert.equal(r.order.userId, USER);
  // 질문 글은 주문 · 어떤 기록에도 남지 않는다
  assert.ok(!JSON.stringify([...w.mem.orders.values(), w.mem.opsEvents]).includes("연락이 뜸한"));
});

test("중복 결제 막기: 결제 시작을 동시에 여러 번 눌러도 결제할 수 있는 대기 주문은 하나뿐이고 모두 같은 주문으로 간다 — 이미 결제를 시작한 주문 · 다른 결과의 주문은 건드리지 않는다", async () => {
  const w = await world({ room: "love" });
  await w.spendFree(2);
  const results = await Promise.all(Array.from({ length: 4 }, () => startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" })));
  const orders = results.map((r) => (r.kind === "order" ? r.order : null));
  assert.ok(orders.every((o) => o !== null), JSON.stringify(results.map((r) => r.kind)));
  const pending = [...w.mem.orders.values()].filter((o) => o.status === "pending");
  assert.equal(pending.length, 1, "결제할 수 있는 대기 주문은 하나");
  assert.equal(new Set(orders.map((o) => o!.orderNumber)).size, 1, "네 요청 모두 같은 주문으로 간다");
  assert.equal(orders[0]!.orderNumber, pending[0]!.orderNumber);
  // 대기가 아닌 주문(이미 결제 완료)은 새 요청이 건드리지 않는다
  const paid = await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: pending[0]!.orderNumber, paymentKey: "pk_dup_1", amount: pending[0]!.amount });
  assert.equal(paid.kind, "paid");
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 3);
  // 같은 결제 승인 요청을 여러 번 동시에 보내도 질문 3개는 한 번만 들어간다
  await Promise.all(Array.from({ length: 4 }, () => confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: pending[0]!.orderNumber, paymentKey: "pk_dup_1", amount: pending[0]!.amount })));
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 3);
  assert.equal(w.toss.byKey.size, 1, "결제사 승인 기록도 한 건");
});

test("결제 시작: 무료 질문이 남아 있거나 결제해 둔 질문이 하나라도 남아 있으면 새로 결제받지 않는다 (묶음에서 쓰고 남은 질문은 최대 2개)", async () => {
  const w = await world({ room: "love" });
  assert.deepEqual(await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" }), { kind: "ask" }, "무료 질문이 남았다");
  await w.spendFree(1);
  assert.deepEqual(await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" }), { kind: "ask" }, "아직 한 번 남았다");
  assert.equal(w.mem.orders.size, 0);
  const paid = await w.pay();
  assert.equal(paid.order.status, "paid");
  // 결제해 둔 질문이 3개 있다 — 새 주문을 만들지 않는다
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 3);
  assert.deepEqual(await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" }), { kind: "ask" });
  // 하나를 쓰고 2개가 남아도, 또 하나를 쓰고 1개가 남아도 새로 결제받지 않는다
  await w.mem.repo.spendCash({ userId: USER, amount: MIYU_CASH.perQuestion, ref: "ask-keep-1" });
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 2);
  assert.deepEqual(await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" }), { kind: "ask" });
  await w.mem.repo.spendCash({ userId: USER, amount: MIYU_CASH.perQuestion, ref: "ask-keep-2" });
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 1);
  assert.deepEqual(await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" }), { kind: "ask" });
  assert.equal(w.mem.orders.size, 1);
  // 마지막 한 개까지 쓰면 그제서야 새 묶음을 결제받는다 (낱개 결제는 없다 — 주문은 언제나 3개 묶음)
  await w.mem.repo.spendCash({ userId: USER, amount: MIYU_CASH.perQuestion, ref: "ask-keep-3" });
  const next = await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" });
  assert.equal(next.kind, "order");
  if (next.kind === "order") {
    assert.equal(next.order.amount, 2500);
    assert.equal(parseCashProductId(next.order.productId)?.cash, 9);
  }
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

test("질문 없이 구매 시작(운영자 2026-10-16): 무료 질문이 남아 있어도 살 수 있고(입력창 위의 작은 구매 버튼), 다시 눌러도 대기 주문은 하나이며, 결제가 확인되면 질문 3개가 들어가고 그다음 요청은 새로 결제받지 않는다 — 질문 글이 없다", async () => {
  const w = await world({ room: "love" });
  const buy = () => startQuestionPayment(w.deps, { userId: USER, assessmentId: w.assessment.id, roomKey: "love", paymentEnv: "test" });
  // 무료 질문이 2개 남아 있어도 구매는 시작된다 (질문 글 없이)
  const first = await buy();
  assert.equal(first.kind, "order");
  if (first.kind !== "order") return;
  assert.equal(first.order.amount, 2500);
  assert.equal(parseCashProductId(first.order.productId)?.cash, 9, "질문 3개 = 9단위");
  assert.equal(questionRoomOf(first.order.productId), "love", "결제 뒤 이 방으로 돌아온다");
  // 두 번 눌러도 대기 주문은 하나, 같은 주문으로 간다
  const second = await buy();
  assert.equal(second.kind, "order");
  const pending = [...w.mem.orders.values()].filter((o) => o.status === "pending");
  assert.equal(pending.length, 1);
  if (second.kind === "order") assert.equal(second.order.orderNumber, pending[0]!.orderNumber);
  // 결제 승인이 확인되면 질문 3개가 한 번만 들어간다
  const paid = await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: pending[0]!.orderNumber, paymentKey: "pk_early_1", amount: pending[0]!.amount });
  assert.equal(paid.kind, "paid");
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 3);
  // 결제해 둔 질문이 남아 있으면 새로 사지 않는다 (쓰지 않은 질문은 최대 2개 남는다는 규칙은 그대로)
  assert.deepEqual(await buy(), { kind: "ask" });
  // 무료 질문을 다 쓴 뒤에도(입력칸 자리의 큰 구매 버튼) 같은 방식이다
  const used = await world({ room: "love" });
  await used.spendFree(2);
  assert.equal((await startQuestionPayment(used.deps, { userId: USER, assessmentId: used.assessment.id, roomKey: "love", paymentEnv: "test" })).kind, "order");
  // 질문 글 · 개인 정보는 주문에 없다
  assert.ok(!JSON.stringify([...w.mem.orders.values(), w.mem.opsEvents]).includes("연락이 뜸한"));
});

test("질문 없이 구매 시작 거절: 남의 결과 · 연결된 AI 없음 · 잠긴 방 · 심층 리포트로만 열리는 방 · 하루 예산 · 지금은 새 구매를 받지 않음 — 결제하지 않는다", async () => {
  const w = await world({ room: "love" });
  const mine = { userId: USER, assessmentId: w.assessment.id, roomKey: "love", paymentEnv: "test" as const };
  assert.deepEqual(await startQuestionPayment(w.deps, { ...mine, userId: OTHER }), { kind: "refused", result: { ok: false, reason: "not-found", message: ASK_MESSAGES["not-found"] } });
  assert.deepEqual(await startQuestionPayment({ ...w.deps, answerer: null }, mine), { kind: "refused", result: { ok: false, reason: "closed", message: ASK_MESSAGES.closed } });
  const locked = await world({ tier: "free", room: "career" });
  assert.deepEqual(await startQuestionPayment(locked.deps, { ...mine, assessmentId: locked.assessment.id, roomKey: "career" }), { kind: "refused", result: { ok: false, reason: "room-locked", message: ASK_MESSAGES["room-locked"] } });
  const main = await world({ tier: "free", room: "main" });
  const deepOnly = await startQuestionPayment(main.deps, { ...mine, assessmentId: main.assessment.id, roomKey: "main" });
  assert.ok(deepOnly.kind === "refused" && !deepOnly.result.ok && deepOnly.result.reason === "deep-only");
  // 하루 AI 예산이 찼으면 새 구매도 멈춘다
  await w.mem.repo.addAiUsage({ reportId: null, provider: "t", model: "t", promptVersion: "t", inputTokens: 1, outputTokens: 1, estCostKrw: 10, latencyMs: 1, outcome: "ok", errorCode: null });
  const budget = await startQuestionPayment({ ...w.deps, capacity: { dailyBudgetKrw: 5 } as AskDeps["capacity"] }, mine);
  assert.ok(budget.kind === "refused" && !budget.result.ok && budget.result.reason === "budget");
  const closed = await startQuestionPayment({ ...w.deps, saleGate: async () => ({ open: false, reason: "budget", queued: 0, generating: 0, todayCostKrw: 0, budgetUsedPct: 100 }) }, mine);
  assert.equal(closed.kind, "sales-closed");
  for (const x of [w, locked, main]) assert.equal(x.mem.orders.size, 0, "어느 경우에도 주문이 없다");
});

test("결제 시작: 무료 리포트의 무료 질문 글자 수는 300자, 결제한 질문은 500자까지 받는다", async () => {
  const w = await world({ tier: "free", room: "love" });
  // 무료 질문이 남았을 때는 300자 한도 — 300자를 넘으면 거절
  const tooLongFree = await startQuestionPayment(w.deps, { ...w.input("가".repeat(301)), paymentEnv: "test" });
  assert.ok(tooLongFree.kind === "refused" && !tooLongFree.result.ok && tooLongFree.result.reason === "too-long-free");
  await w.spendFree(2);
  const ok500 = await startQuestionPayment(w.deps, { ...w.input("가".repeat(500)), paymentEnv: "test" });
  assert.equal(ok500.kind, "order", "무료 질문을 다 쓴 뒤의 결제한 질문은 500자까지");
  const over500 = await startQuestionPayment(w.deps, { ...w.input("가".repeat(501)), paymentEnv: "test" });
  assert.ok(over500.kind === "refused" && !over500.result.ok && over500.result.reason === "too-long", "500자를 넘으면 결제하지 않는다");
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

test("결제 승인이 확인되기 전에는 장부가 비어 있고, 승인되면 질문 3개(9단위)가 한 번만 들어간다", async () => {
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
  assert.equal(view.balance, QUESTION_PACK_UNITS, "두 번 들어가지 않는다");
  assert.equal(view.questions, 3);
  assert.deepEqual(view.ledger.map((l) => [l.kind, l.amount, l.label]), [["charge", 9, CASH_KIND_LABEL.charge]]);
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

test("질문 결제 주문은 MY의 리포트 목록에 끼지 않고 결제내역에만 '유료 질문 3개'로 남는다", async () => {
  const w = await world();
  await w.pay();
  const page = await getMyPage(w.mem.repo, USER);
  assert.equal(page.cards.length, 1, "검사 결과 카드는 그대로 하나");
  assert.equal(page.cards[0].entitlement, "free", "질문 결제는 리포트 구매가 아니다");
  assert.deepEqual(page.cards[0].received, []);
  assert.equal(page.orders[0].productName, `${MIYU_CASH.name} ${QUESTION_PACK_SIZE}개`);
  assert.equal(page.orders[0].amount, 2500);
  assert.equal(isCashProduct(w.mem.orders.values().next().value!.productId), true);
});

test("결제가 취소(환불)되면 넣어 준 질문을 회수하고, 이미 쓴 질문은 모자란 몫으로 남긴다", async () => {
  const w = await world();
  const paid = await w.pay();
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 9);
  // 안 쓴 채 환불 — 9단위(질문 3개)를 모두 회수한다
  await w.mem.repo.updateOrder(paid.order.id, ["paid"], { status: "refunded" });
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0);
  // 묶음 장부가 있는 주문(DB 16번 이후)의 전액 취소는 "묶음 환불 회수(refund_claw)"로 남는다
  assert.equal(w.mem.ledger.find((l) => l.kind === "refund_claw")?.shortfall, 0);

  // 묶음에서 하나를 쓰고 환불 — 남은 질문 2개(6단위)만 회수하고, 이미 쓴 하나(3단위)는 회수하지 못한 몫으로 남는다 (음수가 되지 않는다)
  const second = await w.pay();
  await w.mem.repo.spendCash({ userId: USER, amount: MIYU_CASH.perQuestion, ref: "ask-used-1" });
  await w.mem.repo.updateOrder(second.order.id, ["paid"], { status: "refunded" });
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0);
  const claws = w.mem.ledger.filter((l) => l.kind === "refund_claw");
  assert.equal(claws.length, 2);
  assert.equal(Math.abs(claws[1].amount), 6, "쓰지 않은 질문 2개를 회수한다");
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
  // 결제해 둔 질문 3개를 다 쓰고 한 번 더 — 질문이 하나라도 남아 있으면 새로 결제받지 않으므로 다 쓴 뒤에 새 묶음을 결제한다
  for (let i = 0; i < QUESTION_PACK_SIZE; i++) await w.mem.repo.spendCash({ userId: USER, amount: MIYU_CASH.perQuestion, ref: `ask-m-1-${i}` });
  await w.mem.repo.addChatQuestion({ userId: USER, assessmentId: w.assessment.id, roomKey: "love" });
  const test = await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "test" });
  if (test.kind !== "order") throw new Error(test.kind);
  await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: test.order.orderNumber, paymentKey: "pk_q_t", amount: test.order.amount });
  for (let i = 0; i < QUESTION_PACK_SIZE; i++) await w.mem.repo.spendCash({ userId: USER, amount: MIYU_CASH.perQuestion, ref: `ask-m-2-${i}` });
  const refund = await startQuestionPayment(w.deps, { ...w.input(), paymentEnv: "live" });
  if (refund.kind !== "order") throw new Error(refund.kind);
  const done = await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: refund.order.orderNumber, paymentKey: "pk_q_r", amount: refund.order.amount });
  if (done.kind !== "paid") throw new Error(done.kind);
  await w.mem.repo.updateOrder(done.order.id, ["paid"], { status: "refunded" });
  const m = await getMetrics(w.mem.repo, w.now(), 30);
  assert.equal(m.revenue.cash.paidCount, 1);
  assert.equal(m.revenue.cash.refundedCount, 1);
  assert.equal(m.revenue.cash.netKrw, QUESTION_PACK_PRICE_KRW);
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

test("결제 뒤 되돌아오는 길: 묶음을 결제한 방에서 질문하면 답을 받고 하나가 쓰이며, 답을 받지 못하면 쓰이지 않고, 3개를 다 쓴 뒤에야 새로 결제해야 한다", async () => {
  const { askFreeQuestion } = await import("./chat-service.ts");
  const w = await world({ room: "love" });
  await w.pay();
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 3);
  const hard = { provider: "t", model: "t", answer: async () => Promise.reject(Object.assign(new Error("fail"), { name: "ChatAnswerError" })) };
  await assert.rejects(askFreeQuestion({ ...w.deps, answerer: hard }, w.input("결제하고 보낸 질문")), /fail/);
  assert.equal((await getCashView(w.mem.repo, USER)).balance, QUESTION_PACK_UNITS, "답을 받지 못하면(예상 못 한 오류도) 되돌린다 — 추가 결제 없이 다시 물을 수 있다");
  const r = await askFreeQuestion(w.deps, w.input("결제하고 보낸 질문"));
  assert.ok(r.ok && r.kind === "answer" && r.cash?.balance === 6, "하나를 쓰고 2개가 남는다");
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 2);
  // 남은 질문은 결제 없이 이어서 쓴다
  const second = await askFreeQuestion(w.deps, w.input("두 번째 질문이에요"));
  assert.ok(second.ok && second.kind === "answer" && second.cash?.balance === 3);
  const third = await askFreeQuestion(w.deps, w.input("세 번째 질문이에요"));
  assert.ok(third.ok && third.kind === "answer" && third.cash?.balance === 0);
  assert.equal(w.mem.orders.size, 1, "질문 3개를 쓰는 동안 새 결제는 없다");
  // 3개를 다 쓰고 나면 새로 결제해야 한다
  const again = await askFreeQuestion(w.deps, w.input("또 물어볼게요"));
  assert.deepEqual(again, { ok: false, reason: "need-payment", message: ASK_MESSAGES["need-payment"] });
});

test("실결제 모드에서 이용 기준(환불 · 유효기간)이 확정되지 않았거나 고객 문의 채널이 없으면 질문 결제를 시작하지 않고 주문도 만들지 않는다 — 테스트 결제는 그대로 열려 있다", async () => {
  const w = await world({ room: "love" });
  await w.spendFree(2);
  const live = { ...w.input(), paymentEnv: "live" as const };
  // 기본값(정책 미확정 · 문의 채널 없음)이면 막힌다 — 코드에 정해진 값 그대로
  const blocked = await startQuestionPayment({ ...w.deps, liveSalesOpen: undefined }, live);
  assert.equal(blocked.kind, "policy-pending");
  assert.equal(w.mem.orders.size, 0, "주문을 만들지 않았다 (돈이 빠지지 않는다)");
  // 정책이 확정돼도 문의 채널이 없으면 막힌다
  assert.equal(questionPackSalesOpen(true, false), false);
  assert.equal(questionPackSalesOpen(false, true), false);
  assert.equal(questionPackSalesOpen(true, true), true);
  // 테스트 결제는 막지 않는다
  const test = await startQuestionPayment({ ...w.deps, liveSalesOpen: undefined }, { ...w.input(), paymentEnv: "test" });
  assert.equal(test.kind, "order");
  // 판매를 열면(운영자 확정 + 문의 채널 입력 뒤) 실결제 주문이 만들어진다
  const open = await startQuestionPayment({ ...w.deps, liveSalesOpen: true }, live);
  assert.equal(open.kind, "order");
});

test("고객 문의 채널: 운영자가 알려 준 카카오 채널 '미유톡'만 들어 있고(이메일 · 응대 시간은 지어내지 않고 비워 둔다), 이메일이나 채널(이름 + 링크) 중 하나가 있어야 정해진 것으로 본다", () => {
  assert.equal(SUPPORT_CONTACT.channelUrl, "http://pf.kakao.com/_xjxnqmX/chat", "운영자가 알려 준 주소 그대로");
  assert.match(SUPPORT_CONTACT.channelName ?? "", /미유톡/);
  assert.equal(SUPPORT_CONTACT.email, null, "이메일은 정해지지 않았다");
  assert.equal(SUPPORT_CONTACT.hours, null, "응대 시간은 운영자가 알려 주기 전까지 적지 않는다");
  assert.equal(hasSupportContact(), true);
  assert.match(supportContactLine() ?? "", /미유톡/);
  assert.equal(hasSupportContact({ email: " ", channelName: null, channelUrl: null, hours: null }), false);
  assert.equal(hasSupportContact({ email: null, channelName: "카카오 채널", channelUrl: null, hours: null }), false, "이름만 있고 링크가 없으면 정해진 것이 아니다");
  assert.equal(hasSupportContact({ email: "help@example.test", channelName: null, channelUrl: null, hours: null }), true);
  assert.equal(supportContactLine({ email: "help@example.test", channelName: "채널", channelUrl: "https://example.test/c", hours: "평일 10~18시" }), "이메일 help@example.test · 채널 https://example.test/c · 응대 시간 평일 10~18시");
  assert.equal(supportContactLine({ email: null, channelName: null, channelUrl: null, hours: null }), null);
  assert.ok(SUPPORT_CONTACT_PENDING.includes("정하는 중"));
  // 문의 채널이 있어도 이용 기준이 확정되기 전에는 실결제 판매가 열리지 않는다
  assert.equal(MIYU_CASH.policyDecided, false);
  assert.equal(questionPackSalesOpen(MIYU_CASH.policyDecided, hasSupportContact()), false);
});
