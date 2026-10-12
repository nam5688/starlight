// 실행: npm test — 사업 지표: 실결제만 매출, 테스트 · 중복은 따로, 환불은 빼기, 출처별 비교, 개인정보 없음
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { EMPTY_BASIC_INFO } from "../profile/basic-info.ts";
import { manseryeokEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { getMetrics, sourceLabel } from "./metrics-service.ts";
import { confirmPayment, startCheckout } from "./order-service.ts";
import type { FunnelEventInput, PaymentEnv } from "./ports.ts";
import { queueReport } from "./report-service.ts";
import { createFakeToss } from "./testing/fake-toss.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const INFO = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true };
const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, 4])));
const user = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ev = (anonId: string, name: FunnelEventInput["name"], src: string | null = null, referrerHost: string | null = null): FunnelEventInput => ({ anonId, name, path: "/", src, medium: src ? "cpc" : null, campaign: null, referrerHost });

async function world() {
  let t = new Date("2026-10-12T03:00:00Z").getTime();
  const now = () => new Date(t);
  const advance = (ms: number) => void (t += ms);
  const mem = createMemoryRepository(now);
  const toss = createFakeToss(now);
  let n = 0;
  async function order(opts: { env: PaymentEnv; source?: string | null; pay?: boolean; userN?: number; sameAssessmentOf?: string }) {
    const u = user(opts.userN ?? ++n);
    const saved = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: u, channel: "web", info: INFO, answers, today: now() });
    if (!saved.ok) throw new Error(saved.message);
    const started = await startCheckout({ repo: mem.repo, now }, { userId: u, assessmentId: saved.assessment.id, paymentEnv: opts.env, acquisition: opts.source ? { source: opts.source, medium: "cpc", campaign: null } : null });
    if (started.kind !== "order") throw new Error("order");
    if (opts.pay === false) return { order: started.order, report: null };
    const paid = await confirmPayment({ repo: mem.repo, gateway: toss.gateway }, { userId: u, orderNumber: started.order.orderNumber, paymentKey: `pk_${++n}`, amount: started.order.amount });
    if (paid.kind !== "paid") throw new Error(paid.kind);
    const report = await queueReport({ repo: mem.repo }, paid.order);
    return { order: paid.order, report };
  }
  return { mem, toss, now, advance, order };
}

test("실결제만 매출에 넣고, 테스트 결제는 따로 세며, 환불은 순매출에서 뺀다", async () => {
  const w = await world();
  await w.order({ env: "live" });
  await w.order({ env: "live" });
  const refunded = await w.order({ env: "live" });
  await w.order({ env: "test" });
  await w.order({ env: "test-docs" });
  await w.order({ env: "live", pay: false });
  // 하나를 환불로 바꾼다 (결제사에서 취소된 것을 재확인이 맞춘 상태)
  await w.mem.repo.updateOrder(refunded.order.id, ["paid"], { status: "refunded" });

  const m = await getMetrics(w.mem.repo, w.now(), 30);
  assert.equal(m.revenue.paidCount, 2);
  assert.equal(m.revenue.refundedCount, 1);
  assert.equal(m.revenue.grossKrw, 3 * 9900, "승인된 실결제 3건");
  assert.equal(m.revenue.refundedKrw, 9900);
  assert.equal(m.revenue.netKrw, 2 * 9900, "환불을 뺀 순매출");
  assert.equal(m.revenue.testPaidCount, 2, "테스트 결제는 매출에 넣지 않고 따로 센다");
  const step = (k: string) => m.funnel.find((f) => f.key === k)?.count;
  assert.equal(step("checkout"), 4, "실결제 주문 생성 수 (테스트 제외, 결제 미완료 포함)");
  assert.equal(step("paid"), 3);
});

test("광고 · 채널별: 방문은 첫 방문 출처, 결제는 결제 시작 때 적은 출처로 묶고, 미리보기 대비 결제 비율을 보여 준다", async () => {
  const w = await world();
  for (const e of [
    ev("anon-aaaa-1", "visit", "naver"), ev("anon-aaaa-1", "analyze_start", "naver"), ev("anon-aaaa-1", "preview_view", "naver"),
    ev("anon-aaaa-2", "visit", "naver"), ev("anon-aaaa-2", "preview_view", "naver"),
    ev("anon-bbbb-3", "visit", "instagram"), ev("anon-bbbb-3", "analyze_start", "instagram"),
    ev("anon-cccc-4", "visit", null, "blog.example.com"),
    ev("anon-dddd-5", "visit"),
  ]) await w.mem.repo.addFunnelEvent(e);
  await w.order({ env: "live", source: "naver" });
  await w.order({ env: "live", source: "instagram", pay: false });

  const m = await getMetrics(w.mem.repo, w.now(), 7);
  const by = Object.fromEntries(m.sources.map((s) => [s.label, s]));
  assert.equal(by["naver / cpc"].visits, 2);
  assert.equal(by["naver / cpc"].previews, 2);
  assert.equal(by["naver / cpc"].paid, 1);
  assert.equal(by["naver / cpc"].conversionPct, 50, "미리보기를 본 2명 중 1명이 결제");
  assert.equal(by["instagram / cpc"].checkouts, 1);
  assert.equal(by["instagram / cpc"].paid, 0);
  assert.equal(by["blog.example.com (추천)"].visits, 1);
  assert.equal(by["직접 · 알 수 없음"].visits, 1);
  assert.equal(m.funnel.find((f) => f.key === "visit")?.count, 5);
  assert.equal(m.hasVisitData, true);
  assert.equal(sourceLabel({ src: null, medium: null }), "직접 · 알 수 없음");
});

test("AI 비용 · 한 건당 이익: 실결제 주문의 리포트에 쓴 호출만 더하고, 단가가 없으면 비용을 계산하지 않는다", async () => {
  const w = await world();
  const live = await w.order({ env: "live" });
  const test = await w.order({ env: "test" });
  const usage = (reportId: string | undefined, cost: number | null) => ({ reportId: reportId ?? null, provider: "x", model: "m", promptVersion: "p", inputTokens: 1, outputTokens: 1, estCostKrw: cost, latencyMs: 1, outcome: "ok" as const, errorCode: null });
  await w.mem.repo.addAiUsage(usage(live.report?.id, 700));
  await w.mem.repo.addAiUsage(usage(live.report?.id, 300)); // 같은 리포트의 재시도 호출도 비용이다
  await w.mem.repo.addAiUsage(usage(test.report?.id, 5000)); // 테스트 결제의 호출은 실결제 경제성에 넣지 않는다

  const m = await getMetrics(w.mem.repo, w.now(), 30);
  assert.equal(m.economics.aiCostKrw, 1000);
  assert.equal(m.economics.avgAiCostPerPaidKrw, 1000);
  assert.equal(m.economics.avgNetRevenuePerPaidKrw, 9900);
  assert.equal(m.economics.profitPerPaidKrw, 8900);

  const w2 = await world();
  await w2.order({ env: "live" });
  const m2 = await getMetrics(w2.mem.repo, w2.now(), 30);
  assert.equal(m2.economics.pricingConfigured, false);
  assert.equal(m2.economics.profitPerPaidKrw, null, "단가를 모르면 이익을 계산하지 않는다");
});

test("만족도 · 재방문 · 재구매, 그리고 중복 결제 의심 건수", async () => {
  const w = await world();
  const a = await w.order({ env: "live", userN: 1 });
  const b = await w.order({ env: "live", userN: 2 });
  // 같은 회원이 다른 검사로 한 번 더 구매
  await w.order({ env: "live", userN: 1 });
  for (const [r, rating] of [[a.report, 5], [b.report, 3]] as const) {
    if (!r) throw new Error();
    await w.mem.repo.updateReport(r.id, ["queued"], { status: "generating", attempts: 1 }, 0);
    await w.mem.repo.updateReport(r.id, ["generating"], { status: "ready", content: null, readyAt: w.now().toISOString() });
    await w.mem.repo.upsertFeedback({ reportId: r.id, userId: r.userId, rating });
  }
  await w.mem.repo.addFunnelEvent(ev("anon-ret-0001", "visit"));
  w.advance(26 * 3600_000);
  await w.mem.repo.addFunnelEvent(ev("anon-ret-0001", "visit"));
  await w.mem.repo.addFunnelEvent(ev("anon-one-0002", "visit"));
  await w.mem.repo.addOpsEvent({ kind: "reconcile.anomaly", severity: "error", message: "결제 확인이 필요합니다 (DUPLICATE_PAYMENT)" });
  await w.mem.repo.addOpsEvent({ kind: "reconcile.anomaly", severity: "warn", message: "결제 확인이 필요합니다 (PAYMENT_MISMATCH)" });

  const m = await getMetrics(w.mem.repo, w.now(), 30);
  assert.deepEqual(m.satisfaction, { count: 2, average: 4, goodPct: 50 });
  assert.equal(m.repeat.returningVisitors, 1);
  assert.equal(m.repeat.repeatBuyers, 1);
  assert.equal(m.revenue.duplicateSuspects, 1);
});

test("지표에는 개인정보가 없다: 이름 · 생년월일 · 응답 · 고민 · 리포트 내용이 결과에 포함되지 않는다", async () => {
  const w = await world();
  await w.order({ env: "live" });
  await w.mem.repo.addFunnelEvent(ev("anon-zzzz-0009", "visit", "naver"));
  const text = JSON.stringify(await getMetrics(w.mem.repo, w.now(), 30));
  for (const word of ["지민", "1995", "birthYear", "answers", "nickname", "content"]) assert.ok(!text.includes(word), word);
});

test("방문 기록이 없으면(측정 연결 전) 그 사실을 알리고, 서버 기록 단계는 그대로 계산된다", async () => {
  const w = await world();
  await w.order({ env: "live" });
  const m = await getMetrics(w.mem.repo, w.now(), 7);
  assert.equal(m.hasVisitData, false);
  assert.equal(m.funnel.find((f) => f.key === "visit")?.count, 0);
  assert.equal(m.funnel.find((f) => f.key === "paid")?.count, 1);
});
