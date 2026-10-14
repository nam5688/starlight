// 실행: npm test — 생성 용량 · 비용 한도: 새 판매는 멈추되 이미 결제한 고객은 계속 처리, 시간 초과는 완성으로 저장하지 않음
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { ASSESSMENT_DAILY_LIMIT, REPORT_RETRY_COOLDOWN_MS } from "../commerce/report.ts";
import { EMPTY_BASIC_INFO } from "../profile/basic-info.ts";
import { createAiReportGenerator } from "../report/ai/generator.ts";
import { createMockModel } from "../report/ai/mock-model.ts";
import { ModelCallError, type TextModel } from "../report/ai/model.ts";
import { devReportGenerator } from "../report/generate-dev-report.ts";
import type { AiUsageSample, ReportGenerator } from "../report/generator.ts";
import { manseryeokEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { costSummary, estimateCostKrw, NO_LIMITS, saleGate, seoulDayStart, type CapacityConfig } from "./capacity-service.ts";
import { confirmPayment, startCheckout } from "./order-service.ts";
import type { AiUsageInput, MiyuRepository, OrderRecord } from "./ports.ts";
import { claimReport, completeReport, queueReport, runReport } from "./report-service.ts";
import { createFakeToss } from "./testing/fake-toss.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const INFO = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true, gender: "female" as const, knownMbti: "INFJ" };
const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, 4])));
const cfg = (over: Partial<CapacityConfig> = {}): CapacityConfig => ({ ...NO_LIMITS, ...over });
const userId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function world() {
  let t = new Date("2026-10-12T03:00:00Z").getTime();
  const now = () => new Date(t);
  const advance = (ms: number) => void (t += ms);
  const mem = createMemoryRepository(now);
  const toss = createFakeToss(now);
  let seq = 0;
  /** 결제가 끝난 주문 하나와 대기 중인 리포트를 만든다 */
  async function paidOrder(): Promise<OrderRecord> {
    const user = userId(++seq);
    const saved = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: user, channel: "web", info: INFO, answers, today: now() });
    if (!saved.ok) throw new Error(saved.message);
    const started = await startCheckout({ repo: mem.repo, now }, { userId: user, assessmentId: saved.assessment.id });
    if (started.kind !== "order") throw new Error("order");
    const paid = await confirmPayment({ repo: mem.repo, gateway: toss.gateway }, { userId: user, orderNumber: started.order.orderNumber, paymentKey: `pk_${seq}`, amount: started.order.amount });
    if (paid.kind !== "paid") throw new Error(paid.kind);
    await queueReport({ repo: mem.repo }, paid.order);
    return paid.order;
  }
  return { mem, toss, now, advance, paidOrder, repo: mem.repo as MiyuRepository };
}

/** 끝나지 않는 생성기 (AI가 멈춘 상황) */
function hangingGenerator(onSignal?: (s: AbortSignal | undefined) => void): ReportGenerator {
  return {
    name: "hang",
    version: "1",
    generate: (_input, ctx) =>
      new Promise((_, reject) => {
        onSignal?.(ctx?.signal);
        ctx?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  };
}

test("동시 생성 한도: 가득 차면 결제한 고객의 리포트는 취소되지 않고 대기열에서 순서를 기다린다", async () => {
  const w = await world();
  const orders = [await w.paidOrder(), await w.paidOrder(), await w.paidOrder()];
  const deps = { repo: w.repo, generator: devReportGenerator, now: w.now, capacity: cfg({ maxConcurrent: 2 }) };

  const a = await claimReport(deps, orders[0]);
  const b = await claimReport(deps, orders[1]);
  const c = await claimReport(deps, orders[2]);
  assert.deepEqual([a.claimed, b.claimed, c.claimed], [true, true, false]);
  assert.equal(c.waiting, "capacity");
  assert.equal(c.report?.status, "queued", "대기 중으로 남는다 (실패 · 취소가 아님)");

  // 하나가 끝나면 자리가 난다
  assert.ok(a.report);
  await completeReport(deps, orders[0], a.report);
  const again = await claimReport(deps, orders[2]);
  assert.equal(again.claimed, true);
});

test("동시 생성 한도: 한도가 없으면(개발용 생성기) 제한하지 않는다", async () => {
  const w = await world();
  const orders = [await w.paidOrder(), await w.paidOrder(), await w.paidOrder()];
  const deps = { repo: w.repo, generator: devReportGenerator, now: w.now, capacity: cfg() };
  for (const o of orders) assert.equal((await claimReport(deps, o)).claimed, true);
});

test("새 구매 중단(시작 기준): 대기 + 생성 중이 한도에 차면 결제를 시작하지 않고, 진행 중인 주문과 이미 결제한 고객은 건드리지 않는다", async () => {
  const w = await world();
  const limit = cfg({ saleQueueLimit: 3 });
  const gate = (stage: "start" | "confirm") => saleGate(w.repo, limit, w.now(), stage);
  await w.paidOrder();
  await w.paidOrder();
  assert.equal((await gate("start")).open, true, "2건 대기: 열림");
  const third = await w.paidOrder();
  const closed = await gate("start");
  assert.equal(closed.open, false);
  assert.equal(closed.reason, "queue");

  // 새 구매자: 결제를 시작하지 못하고, 주문이 만들어지지 않는다
  const newcomer = userId(99);
  const saved = await submitAssessment({ repo: w.repo, saju: manseryeokEngine }, { userId: newcomer, channel: "web", info: INFO, answers, today: w.now() });
  if (!saved.ok) throw new Error();
  const before = (await w.repo.listOrdersForUser(newcomer)).length;
  const r = await startCheckout({ repo: w.repo, now: w.now, gate }, { userId: newcomer, assessmentId: saved.assessment.id });
  assert.equal(r.kind, "sales-closed");
  assert.equal(r.kind === "sales-closed" && r.reason, "queue");
  assert.equal((await w.repo.listOrdersForUser(newcomer)).length, before, "주문을 만들지 않는다");

  // 이미 결제한 고객: 판매 중단과 상관없이 리포트를 계속 만든다
  const done = await runReport({ repo: w.repo, generator: devReportGenerator, now: w.now, capacity: cfg() }, third);
  assert.equal(done?.status, "ready");
});

test("승인 직전 확인(승인 기준)은 시작 기준보다 넉넉하다: 결제창까지 간 고객이 한도 변동으로 막히지 않고, 그래도 가득 차면 승인을 요청하지 않아 카드에서 돈이 빠지지 않는다", async () => {
  const w = await world();
  const limit = cfg({ saleQueueLimit: 2 });
  const gate = (stage: "start" | "confirm") => saleGate(w.repo, limit, w.now(), stage);
  // 고객 A가 결제창까지 감 (결제 시작은 열려 있을 때)
  const user = userId(50);
  const saved = await submitAssessment({ repo: w.repo, saju: manseryeokEngine }, { userId: user, channel: "web", info: INFO, answers, today: w.now() });
  if (!saved.ok) throw new Error();
  const started = await startCheckout({ repo: w.repo, now: w.now, gate }, { userId: user, assessmentId: saved.assessment.id });
  if (started.kind !== "order") throw new Error("order");

  // 그 사이 다른 고객의 대기가 3건으로 늘어남: 시작 기준(2)은 넘었지만 승인 기준(4)은 아님 → 승인된다
  for (let i = 0; i < 3; i++) await w.paidOrder();
  assert.equal((await gate("start")).open, false);
  assert.equal((await gate("confirm")).open, true);
  const ok = await confirmPayment({ repo: w.repo, gateway: w.toss.gateway, gate }, { userId: user, orderNumber: started.order.orderNumber, paymentKey: "pk_A", amount: started.order.amount });
  assert.equal(ok.kind, "paid", "결제창까지 간 고객은 막지 않는다");

  // 대기가 승인 기준(4건)까지 차면 승인을 요청하지 않는다
  const user2 = userId(51);
  const saved2 = await submitAssessment({ repo: w.repo, saju: manseryeokEngine }, { userId: user2, channel: "web", info: INFO, answers, today: w.now() });
  if (!saved2.ok) throw new Error();
  const started2 = await startCheckout({ repo: w.repo, now: w.now }, { userId: user2, assessmentId: saved2.assessment.id }); // 게이트 없이 주문만
  if (started2.kind !== "order") throw new Error();
  await w.paidOrder();
  const calls = w.toss.calls.confirm;
  const r = await confirmPayment({ repo: w.repo, gateway: w.toss.gateway, gate }, { userId: user2, orderNumber: started2.order.orderNumber, paymentKey: "pk_B", amount: started2.order.amount });
  assert.equal(r.kind, "rejected");
  assert.equal(r.kind === "rejected" && r.code, "SALES_PAUSED");
  assert.equal(w.toss.calls.confirm, calls, "결제사에 승인을 요청하지 않았다 — 청구되지 않는다");
  assert.equal((await w.repo.getOrderByNumber(started2.order.orderNumber))?.status, "pending");
  assert.ok((await w.repo.listPaymentEvents(started2.order.id)).some((e) => e.status === "SALES_PAUSED"));
});

test("하루 예산: 사용한 비용 + 대기 중인 건의 예상 비용이 예산에 닿으면 새 구매를 멈추고, 날짜가 바뀌면(한국 기준) 다시 열린다", async () => {
  const w = await world();
  const limit = cfg({ dailyBudgetKrw: 1000, estCostKrwPerReport: 100 });
  const usage = (cost: number): AiUsageInput => ({ reportId: null, provider: "x", model: "m", promptVersion: "p", inputTokens: 1, outputTokens: 1, estCostKrw: cost, latencyMs: 1, outcome: "ok", errorCode: null });
  await w.repo.addAiUsage(usage(500));
  assert.equal((await saleGate(w.repo, limit, w.now(), "start")).open, true);
  await w.paidOrder();
  await w.paidOrder();
  await w.paidOrder(); // 500 + 대기 3건 × 100 = 800 → 아직 열림
  const g = await saleGate(w.repo, limit, w.now(), "start");
  assert.equal(g.open, true);
  assert.equal(g.budgetUsedPct, 80);
  await w.repo.addAiUsage(usage(250)); // 750 + 300 = 1050 ≥ 1000 → 닫힘 (시작 기준)
  const closed = await saleGate(w.repo, limit, w.now(), "start");
  assert.equal(closed.open, false);
  assert.equal(closed.reason, "budget");
  assert.equal((await saleGate(w.repo, limit, w.now(), "confirm")).open, true, "승인 기준은 예산의 120%");

  // 한국 날짜가 바뀌면 오늘 비용이 0부터 다시 시작한다
  w.advance(24 * 3600_000);
  const reopened = await saleGate(w.repo, cfg({ dailyBudgetKrw: 1000, estCostKrwPerReport: 0 }), w.now(), "start");
  assert.equal(reopened.todayCostKrw, 0);
  assert.equal(reopened.open, true);
  assert.equal(seoulDayStart(new Date("2026-10-12T14:59:00Z")), "2026-10-11T15:00:00.000Z", "한국 날짜 00:00 = UTC 전날 15:00");
  assert.equal(seoulDayStart(new Date("2026-10-12T15:00:00Z")), "2026-10-12T15:00:00.000Z");
});

test("시간 초과: 완성으로 저장하지 않고 실패로 남기며, 생성기에 중단 신호를 보낸다 (결제 상태는 그대로)", async () => {
  const w = await world();
  const order = await w.paidOrder();
  let signal: AbortSignal | undefined;
  const deps = { repo: w.repo, generator: hangingGenerator((s) => (signal = s)), now: w.now, timeoutMs: 20 };
  const claim = await claimReport(deps, order);
  assert.ok(claim.report && claim.claimed);
  const result = await completeReport(deps, order, claim.report);
  assert.equal(result?.status, "failed");
  assert.match(result?.lastError ?? "", /초과/);
  assert.equal(result?.content, null, "내용이 없는 상태로 완성 처리하지 않는다");
  assert.equal(signal?.aborted, true, "남은 AI 호출을 멈추도록 중단 신호를 켰다");
  assert.equal((await w.repo.getOrderByNumber(order.orderNumber))?.status, "paid", "결제 상태는 그대로");
});

test("다시 만들기 간격: 마지막 시도 직후에는 다시 가져가지 못하고(연타 방지), 간격이 지나면 가능하다", async () => {
  const w = await world();
  const order = await w.paidOrder();
  const failing: ReportGenerator = { name: "f", version: "1", generate: async () => Promise.reject(new Error("AI 오류")) };
  const deps = { repo: w.repo, generator: failing, now: w.now };
  const first = await claimReport(deps, order);
  assert.ok(first.report);
  await completeReport(deps, order, first.report);
  const quick = await claimReport(deps, order, { retryFailed: true });
  assert.equal(quick.claimed, false);
  assert.equal(quick.waiting, "cooldown");
  w.advance(REPORT_RETRY_COOLDOWN_MS + 1000);
  assert.equal((await claimReport(deps, order, { retryFailed: true })).claimed, true);
});

test("AI 사용 기록: 호출마다 토큰 · 결과 · 예상 비용을 쌓고, 실패한 호출도 남기며, 리포트 내용은 담지 않는다", async () => {
  const w = await world();
  const order = await w.paidOrder();
  let calls = 0;
  const flaky: TextModel = {
    provider: "fake",
    model: "fake-1",
    async complete(req) {
      calls++;
      if (calls === 1) throw new ModelCallError("과부하", { retryable: true, code: "HTTP_503" });
      const inner = createMockModel();
      const res = await inner.complete(req);
      return { ...res, usage: { inputTokens: 20_000, outputTokens: 5_000 } };
    },
  };
  const config = cfg({ priceInputKrwPerMTok: 4000, priceOutputKrwPerMTok: 20000 });
  const generator = createAiReportGenerator({ model: flaky, now: w.now, sleep: async () => {} });
  const deps = { repo: w.repo, generator, now: w.now, capacity: config };
  const result = await runReport(deps, order);
  assert.equal(result?.status, "ready");

  const rows = w.mem.aiUsage;
  assert.equal(rows.length, 2, "실패 1회 + 성공 1회");
  assert.deepEqual(rows.map((r) => r.outcome), ["error", "ok"]);
  assert.equal(rows[0].errorCode, "HTTP_503");
  assert.equal(rows[1].inputTokens, 20_000);
  assert.equal(rows[1].estCostKrw, 180, "20,000 × 4,000/100만 + 5,000 × 20,000/100만 = 80 + 100");
  assert.equal(rows[0].estCostKrw, null, "토큰이 없는 실패 호출은 비용을 계산하지 않는다");
  assert.ok(rows.every((r) => r.reportId === result?.id));
  assert.ok(!JSON.stringify(rows).includes("서윤") && !JSON.stringify(rows).includes("지민"), "고객 정보 · 리포트 문장은 기록하지 않는다");

  const summary = await costSummary(w.repo, config, w.now());
  assert.equal(summary.callsToday, 2);
  assert.equal(summary.failedCallsToday, 1);
  assert.equal(summary.todayKrw, 180);
  assert.equal(summary.reportsWeek, 1);
  assert.equal(summary.avgPerReportKrw, 180);
});

test("호출 한 번의 제한 시간: 모델이 응답하지 않으면 시간 초과로 기록하고 실패로 끝낸다 (무한 대기 없음)", async () => {
  const w = await world();
  const samples: AiUsageSample[] = [];
  const stuck: TextModel = {
    provider: "fake",
    model: "stuck",
    complete: (req) => new Promise((_, reject) => req.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
  };
  const generator = createAiReportGenerator({ model: stuck, now: w.now, sleep: async () => {}, callTimeoutMs: 30, maxRetries: 0 });
  const order = await w.paidOrder();
  const assessment = await w.repo.getAssessment(order.assessmentId);
  if (!assessment) throw new Error();
  await assert.rejects(
    generator.generate(
      { nickname: "서윤", knownMbti: null, birthText: "", summary: assessment.summary, saju: assessment.saju, gender: null, context: null },
      { onUsage: (u) => samples.push(u) },
    ),
    /시간이 초과/,
  );
  assert.equal(samples.length, 1);
  assert.equal(samples[0].outcome, "timeout");
  assert.equal(samples[0].errorCode, "TIMEOUT");
});

test("토큰 단가가 설정되지 않으면 비용을 계산하지 않고 호출 수만 기록한다", () => {
  assert.equal(estimateCostKrw(cfg(), { inputTokens: 1000, outputTokens: 1000 }), null);
  assert.equal(estimateCostKrw(cfg({ priceInputKrwPerMTok: 1000, priceOutputKrwPerMTok: 2000 }), { inputTokens: null, outputTokens: null }), null);
  assert.equal(estimateCostKrw(cfg({ priceInputKrwPerMTok: 1000, priceOutputKrwPerMTok: 2000 }), { inputTokens: 500_000, outputTokens: 250_000 }), 1000);
});

test("무료 생성 남용 방지: 하루에 저장할 수 있는 검사 수를 넘으면 막고, 24시간이 지나면 다시 저장할 수 있다", async () => {
  const w = await world();
  const user = userId(70);
  const save = () => submitAssessment({ repo: w.repo, saju: manseryeokEngine }, { userId: user, channel: "web", info: INFO, answers, today: w.now() });
  for (let i = 0; i < ASSESSMENT_DAILY_LIMIT; i++) assert.equal((await save()).ok, true);
  const blocked = await save();
  assert.equal(blocked.ok, false);
  assert.match(blocked.ok ? "" : blocked.message, /하루에 저장할 수 있는 검사/);
  // 다른 회원에게는 영향이 없다
  assert.equal((await submitAssessment({ repo: w.repo, saju: manseryeokEngine }, { userId: userId(71), channel: "web", info: INFO, answers, today: w.now() })).ok, true);
  w.advance(24 * 3600_000 + 60_000);
  assert.equal((await save()).ok, true);
});
