// 실행: npm test — 미유캐시 충전: 서버가 금액 · 보너스를 정하고, 결제 승인이 확인된 뒤에만 지갑에 들어가며, 리포트는 만들지 않고, 환불하면 회수한다
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { MIYU_CASH, isCashProduct, parseCashProductId } from "../config/product.ts";
import { EMPTY_BASIC_INFO } from "../profile/basic-info.ts";
import { manseryeokEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { CASH_KIND_LABEL, getCashView, startCashCharge } from "./cash-service.ts";
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

async function world() {
  const t = new Date("2026-10-15T03:00:00Z").getTime();
  const now = () => new Date(t);
  const mem = createMemoryRepository(now);
  const toss = createFakeToss(now);
  const saved = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: USER, channel: "web", info: INFO, answers, today: now() });
  if (!saved.ok) throw new Error(saved.message);
  const assessment = saved.assessment;
  let n = 0;
  const deps = { repo: mem.repo, now, nonce: () => `NONCE${String(++n).padStart(5, "0")}` };
  async function charge(cash: number, env: "test" | "live" = "test") {
    const r = await startCashCharge(deps, { userId: USER, assessmentId: assessment.id, cash, paymentEnv: env });
    if (r.kind !== "order") throw new Error(r.kind);
    const paid = await confirmPayment({ repo: mem.repo, gateway: toss.gateway }, { userId: USER, orderNumber: r.order.orderNumber, paymentKey: `pk_cash_${++n}`, amount: r.order.amount });
    if (paid.kind !== "paid") throw new Error(paid.kind);
    return { ...r, order: paid.order };
  }
  return { mem, toss, now, assessment, deps, charge };
}

test("충전 시작: 서버가 견적으로 금액 · 보너스를 정해 주문을 만들고, 번호에 충전량이 적힌다", async () => {
  const w = await world();
  const r = await startCashCharge(w.deps, { userId: USER, assessmentId: w.assessment.id, cash: 100 });
  assert.equal(r.kind, "order");
  if (r.kind !== "order") return;
  assert.equal(r.order.amount, 100 * MIYU_CASH.krwPerCash, "10,000원");
  assert.equal(r.quote.bonus, 15, "100개 이상은 15% 보너스");
  assert.deepEqual(parseCashProductId(r.order.productId), { cash: 100, bonus: 15, nonce: "NONCE00001" });
  assert.equal(r.order.status, "pending");
  assert.equal(r.order.userId, USER);
  // 브라우저가 금액을 보내지 않는다 — 서비스 입력에는 개수만 있고 금액은 서버가 계산한 값이다
});

test("충전 시작: 10의 배수가 아니거나 범위 밖이거나 숫자가 아니면 주문을 만들지 않고, 다른 회원의 검사로는 시작할 수 없다", async () => {
  const w = await world();
  for (const bad of [0, 5, 15, 9, 510, 1000, -10, 10.5, "100", null, undefined, NaN, Infinity]) {
    const r = await startCashCharge(w.deps, { userId: USER, assessmentId: w.assessment.id, cash: bad });
    assert.equal(r.kind, "invalid-amount", String(bad));
  }
  assert.equal(w.mem.orders.size, 0);
  assert.equal((await startCashCharge(w.deps, { userId: OTHER, assessmentId: w.assessment.id, cash: 10 })).kind, "not-found");
  for (const ok of [10, 30, 50, 500]) assert.equal((await startCashCharge(w.deps, { userId: USER, assessmentId: w.assessment.id, cash: ok })).kind, "order", String(ok));
});

test("충전 시작: 다시 누르면 이전 충전 대기 주문은 대체되고, 개인 통합 리포트의 대기 주문은 건드리지 않는다", async () => {
  const w = await world();
  const report = await startCheckout({ repo: w.mem.repo, now: w.now }, { userId: USER, assessmentId: w.assessment.id });
  if (report.kind !== "order") throw new Error();
  const a = await startCashCharge(w.deps, { userId: USER, assessmentId: w.assessment.id, cash: 30 });
  const b = await startCashCharge(w.deps, { userId: USER, assessmentId: w.assessment.id, cash: 50 });
  if (a.kind !== "order" || b.kind !== "order") throw new Error();
  assert.equal(w.mem.orders.get(a.order.id)?.status, "canceled");
  assert.equal(w.mem.orders.get(a.order.id)?.failureCode, "SUPERSEDED");
  assert.equal(w.mem.orders.get(b.order.id)?.status, "pending");
  assert.equal(w.mem.orders.get(report.order.id)?.status, "pending", "리포트 대기 주문은 그대로");
});

test("충전 시작: 지금은 새 구매를 받지 않으면(AI 용량 · 하루 예산) 주문을 만들지 않고, 확인이 실패하면 막지 않는다", async () => {
  const w = await world();
  const closed = await startCashCharge({ ...w.deps, gate: async () => ({ open: false, reason: "budget", queued: 0, generating: 0, todayCostKrw: 0, budgetUsedPct: 100 }) }, { userId: USER, assessmentId: w.assessment.id, cash: 10 });
  assert.equal(closed.kind, "sales-closed");
  assert.equal(w.mem.orders.size, 0);
  const broken = await startCashCharge({ ...w.deps, gate: async () => { throw new Error("확인 실패"); } }, { userId: USER, assessmentId: w.assessment.id, cash: 10 });
  assert.equal(broken.kind, "order");
});

test("결제 승인이 확인되기 전에는 지갑이 비어 있고, 승인되면 충전 캐시 + 보너스가 한 번만 들어간다", async () => {
  const w = await world();
  const started = await startCashCharge(w.deps, { userId: USER, assessmentId: w.assessment.id, cash: 100 });
  if (started.kind !== "order") throw new Error();
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0, "주문만 만들었다고 지갑에 들어가지 않는다");

  const first = await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_cash_x", amount: started.order.amount });
  assert.equal(first.kind, "paid");
  const again = await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_cash_x", amount: started.order.amount });
  assert.equal(again.kind, "paid", "같은 요청을 다시 보내도");
  const view = await getCashView(w.mem.repo, USER);
  assert.equal(view.balance, 115, "100 + 보너스 15 — 두 번 들어가지 않는다");
  assert.equal(view.questions, Math.floor(115 / MIYU_CASH.perQuestion));
  assert.deepEqual(view.ledger.map((l) => [l.kind, l.amount, l.label]).sort(), [["bonus", 15, CASH_KIND_LABEL.bonus], ["charge", 100, CASH_KIND_LABEL.charge]]);
});

test("금액이 다르면 승인하지 않아 지갑에 아무것도 들어가지 않는다", async () => {
  const w = await world();
  const started = await startCashCharge(w.deps, { userId: USER, assessmentId: w.assessment.id, cash: 100 });
  if (started.kind !== "order") throw new Error();
  const r = await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_cash_low", amount: 1000 });
  assert.equal(r.kind, "rejected");
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0);
});

test("충전 주문은 리포트를 만들지 않는다 (대기열 · 생성 · 다시 만들기 어디서도)", async () => {
  const w = await world();
  const paid = await w.charge(50);
  assert.equal(await queueReport({ repo: w.mem.repo }, paid.order), null);
  assert.equal(await ensureReport({ repo: w.mem.repo, generator: devReportGenerator, now: w.now }, paid.order), null);
  assert.deepEqual(await claimReport({ repo: w.mem.repo, generator: devReportGenerator, now: w.now }, paid.order, { retryFailed: true, ignoreCooldown: true }), { report: null, claimed: false });
  assert.equal(w.mem.reports.size, 0);
});

test("충전 주문은 MY의 리포트 목록에 끼지 않고 결제내역에만 '미유캐시 N개 충전'으로 남는다", async () => {
  const w = await world();
  await w.charge(30);
  const page = await getMyPage(w.mem.repo, USER);
  assert.equal(page.cards.length, 1, "검사 결과 카드는 그대로 하나");
  assert.equal(page.cards[0].entitlement, "free", "충전은 리포트 구매가 아니다");
  assert.deepEqual(page.cards[0].received, []);
  assert.equal(page.orders[0].productName, `${MIYU_CASH.name} 30개 충전`);
  assert.equal(isCashProduct(w.mem.orders.values().next().value!.productId), true);
});

test("결제가 취소(환불)되면 넣어 준 캐시(보너스 포함)를 회수하고, 이미 쓴 만큼은 모자란 몫으로 남긴다", async () => {
  const w = await world();
  const paid = await w.charge(100);
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 115);
  // 질문에 30캐시(10번) 사용 → 잔액 85
  for (let i = 0; i < 10; i++) await w.mem.repo.spendCash({ userId: USER, amount: MIYU_CASH.perQuestion, ref: `ask-${i}` });
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 85);

  await w.mem.repo.updateOrder(paid.order.id, ["paid"], { status: "refunded" });
  const view = await getCashView(w.mem.repo, USER);
  assert.equal(view.balance, 0, "남아 있던 85만 회수한다 — 음수가 되지 않는다");
  const claw = w.mem.ledger.find((l) => l.kind === "clawback");
  assert.equal(claw?.amount, -85);
  assert.equal(claw?.shortfall, 30, "이미 쓴 30은 회수하지 못한 몫으로 기록 — 운영자가 확인한다");
});

test("지갑 표가 없는 DB(13번 변경 전)에서는 잔액 0으로 보이고 화면이 깨지지 않는다", async () => {
  const w = await world();
  const broken = { ...w.mem.repo, getCashBalance: async () => { throw Object.assign(new Error("relation does not exist"), { code: "42P01" }); } };
  assert.deepEqual(await getCashView(broken, USER), { ready: false, balance: 0, questions: 0, ledger: [] });
});

test("사업 지표: 충전은 리포트 매출 · 한 건당 계산에 섞지 않고 따로 센다 (테스트 결제는 어디에도 넣지 않는다)", async () => {
  const w = await world();
  await w.charge(100, "live");
  await w.charge(50, "test");
  const refund = await w.charge(30, "live");
  await w.mem.repo.updateOrder(refund.order.id, ["paid"], { status: "refunded" });
  const m = await getMetrics(w.mem.repo, w.now(), 30);
  assert.equal(m.revenue.cash.paidCount, 1);
  assert.equal(m.revenue.cash.refundedCount, 1);
  assert.equal(m.revenue.cash.netKrw, 10_000);
  assert.equal(m.revenue.paidCount, 0, "리포트 주문은 없다");
  assert.equal(m.revenue.netKrw, 0);
  assert.equal(m.revenue.testPaidCount, 1);
  assert.equal(m.funnel.find((f) => f.key === "checkout")?.count, 0, "충전은 '결제 시작' 단계에 넣지 않는다");
});

test("지갑 표가 없는 DB에서는 충전 주문을 만들지 않는다 (결제가 승인돼도 캐시를 넣을 수 없어 돈만 빠지는 일을 막는다)", async () => {
  const w = await world();
  const noWallet = { ...w.mem.repo, getCashBalance: async () => { throw Object.assign(new Error("relation does not exist"), { code: "42P01" }); } };
  const r = await startCashCharge({ ...w.deps, repo: noWallet }, { userId: USER, assessmentId: w.assessment.id, cash: 100 });
  assert.equal(r.kind, "unavailable");
  assert.equal(w.mem.orders.size, 0);
  assert.equal((await getCashView(w.mem.repo, USER)).ready, true);
});
