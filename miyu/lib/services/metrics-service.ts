// 사업 지표 집계 — 방문부터 재구매까지의 단계, 광고 · 채널별 비교, 매출 · AI 비용 · 만족도.
//
// 원칙
// - 결제 · 구매 권한의 진실은 orders · reports(서버가 승인을 확인한 기록)다. 방문 이벤트(funnel_events)는 화면에서 보낸 참고 기록이라
//   광고 차단 · 쿠키 거부로 빠질 수 있다. 두 가지를 섞어 숫자 하나로 만들지 않고, 출처를 단계마다 표시한다.
// - 매출은 실결제(live)만 센다. 테스트 결제 · 중복(운영자 확인) 건은 따로 보여 주고 매출에 넣지 않는다. 환불된 주문은 빼서 순매출을 본다.
// - 이름 · 생년월일 · 응답 · 고민 · 리포트 내용은 이 집계에 들어오지 않는다 (익명 방문 번호와 주문 · 리포트의 상태 · 금액뿐).
// - 순이익은 결제 수수료 · 세금을 빼지 않은 단순 계산이다 (AI 비용만 뺀다).

import type { FunnelEventRecord, MetricsOrder, MiyuRepository } from "./ports.ts";
import { seoulDayStart } from "./capacity-service.ts";

export type FunnelStep = { key: string; label: string; count: number; basis: "방문 기록" | "서버 기록"; note?: string };
export type SourceRow = {
  label: string;
  visits: number;
  analyzeStarts: number;
  previews: number;
  checkouts: number;
  paid: number;
  netRevenueKrw: number;
  /** 미리보기를 본 방문자 중 결제한 비율 (미리보기 기록이 없으면 null) */
  conversionPct: number | null;
};

export type Metrics = {
  days: number;
  since: string;
  funnel: FunnelStep[];
  sources: SourceRow[];
  revenue: {
    grossKrw: number;
    refundedKrw: number;
    netKrw: number;
    paidCount: number;
    refundedCount: number;
    /** 테스트 결제 — 매출에서 제외 */
    testPaidCount: number;
    /** 같은 주문에 두 번째 승인 등 운영자 확인이 필요한 중복 결제 의심 */
    duplicateSuspects: number;
  };
  economics: {
    aiCostKrw: number;
    /** 실결제 리포트 한 건당 평균 AI 비용 (단가가 설정되지 않았으면 null) */
    avgAiCostPerPaidKrw: number | null;
    avgNetRevenuePerPaidKrw: number | null;
    /** 결제 수수료 · 세금 제외, AI 비용만 뺀 한 건당 이익 */
    profitPerPaidKrw: number | null;
    pricingConfigured: boolean;
  };
  satisfaction: { count: number; average: number | null; goodPct: number | null };
  repeat: { returningVisitors: number; repeatBuyers: number };
  /** 방문 기록이 하나도 없으면 안내 (측정 연결 전 · 마이그레이션 전) */
  hasVisitData: boolean;
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const distinct = <T,>(list: T[]) => new Set(list).size;

/** 광고 · 채널 이름: UTM 출처 → 없으면 추천 도메인 → 없으면 직접 */
export function sourceLabel(x: { src: string | null; medium: string | null; referrerHost?: string | null }): string {
  if (x.src) return x.medium ? `${x.src} / ${x.medium}` : x.src;
  if (x.referrerHost) return `${x.referrerHost} (추천)`;
  return "직접 · 알 수 없음";
}

// 주문에는 추천 사이트가 source=도메인 · medium=referral로 적혀 있다 — 방문 기록의 이름("도메인 (추천)")과 맞춘다
const orderSource = (o: MetricsOrder) =>
  o.acquisition?.medium === "referral" && o.acquisition.source ? `${o.acquisition.source} (추천)` : sourceLabel({ src: o.acquisition?.source ?? null, medium: o.acquisition?.medium ?? null });

export async function getMetrics(repo: MiyuRepository, now: Date, days: number): Promise<Metrics> {
  const since = new Date(now.getTime() - days * 24 * 3600_000).toISOString();
  const [events, orders, reports, usage, feedback, savedCount, anomalies] = await Promise.all([
    repo.listFunnelEventsSince(since, 50_000),
    repo.listOrdersForMetrics(since, 20_000),
    repo.listReportsForMetrics(since, 20_000),
    repo.listAiUsageSince(since, 50_000),
    repo.listFeedbackSince(since, 20_000),
    repo.countAssessmentsAllSince(since),
    repo.listOpsEvents({ kinds: ["reconcile.anomaly"], since, limit: 500 }),
  ]);

  // ── 방문 단계 (익명 방문 번호 기준 · 고유 방문자 수)
  const by = (name: FunnelEventRecord["name"]) => events.filter((e) => e.name === name);
  const uniq = (name: FunnelEventRecord["name"]) => distinct(by(name).map((e) => e.anonId));

  const isLive = (o: MetricsOrder) => o.paymentEnv === "live";
  const approved = (o: MetricsOrder) => o.status === "paid" || o.status === "refunded";
  const liveOrders = orders.filter(isLive);
  const livePaid = liveOrders.filter((o) => o.status === "paid");
  const liveRefunded = liveOrders.filter((o) => o.status === "refunded");
  const readyReports = reports.filter((r) => r.status === "ready");
  const liveOrderIds = new Set(liveOrders.map((o) => o.id));

  const funnel: FunnelStep[] = [
    { key: "visit", label: "유입 (방문)", count: uniq("visit"), basis: "방문 기록" },
    { key: "analyze_start", label: "검사 시작", count: uniq("analyze_start"), basis: "방문 기록" },
    { key: "analyze_complete", label: "검사 완료 · 무료 결과 확인", count: uniq("analyze_complete"), basis: "방문 기록" },
    { key: "saved", label: "로그인 · 결과 저장", count: savedCount, basis: "서버 기록", note: "저장된 검사 결과 수" },
    { key: "preview_view", label: "유료 맛보기(무료 결과 화면) 조회", count: uniq("preview_view"), basis: "방문 기록" },
    { key: "checkout", label: "결제 시작", count: liveOrders.length, basis: "서버 기록", note: "실결제 주문 생성 수 (테스트 결제 제외)" },
    { key: "paid", label: "결제 승인 (서버가 확인)", count: liveOrders.filter(approved).length, basis: "서버 기록", note: "환불된 건 포함, 환불은 아래 매출에서 뺌" },
    { key: "report_ready", label: "리포트 완성", count: readyReports.filter((r) => liveOrderIds.has(r.orderId)).length, basis: "서버 기록" },
    { key: "report_view", label: "리포트 열람", count: uniq("report_view"), basis: "방문 기록" },
  ];

  // ── 매출 (실결제만)
  const sum = (list: MetricsOrder[]) => list.reduce((n, o) => n + o.amount, 0);
  const grossKrw = sum(liveOrders.filter(approved));
  const refundedKrw = sum(liveRefunded);
  const netKrw = grossKrw - refundedKrw;
  const testPaidCount = orders.filter((o) => !isLive(o) && approved(o)).length;
  const duplicateSuspects = anomalies.filter((e) => /DUPLICATE/.test(e.message) || /DUPLICATE/.test(JSON.stringify(e.detail))).length;

  // ── AI 비용 (실결제 주문의 리포트에 쓴 호출만)
  const reportOrder = new Map(reports.map((r) => [r.id, r.orderId]));
  const pricingConfigured = usage.some((u) => u.estCostKrw !== null);
  const aiCostKrw = Math.round(usage.filter((u) => u.reportId && liveOrderIds.has(reportOrder.get(u.reportId) ?? "")).reduce((n, u) => n + (u.estCostKrw ?? 0), 0) * 100) / 100;
  const paidCount = livePaid.length;
  const avgNet = paidCount > 0 ? Math.round(netKrw / paidCount) : null;
  const avgCost = pricingConfigured && paidCount > 0 ? Math.round((aiCostKrw / paidCount) * 100) / 100 : null;

  // ── 광고 · 채널별 (방문은 첫 방문 출처, 결제는 결제를 시작할 때 적어 둔 출처)
  const rows = new Map<string, SourceRow>();
  const row = (label: string) => {
    let r = rows.get(label);
    if (!r) rows.set(label, (r = { label, visits: 0, analyzeStarts: 0, previews: 0, checkouts: 0, paid: 0, netRevenueKrw: 0, conversionPct: null }));
    return r;
  };
  const anonLabel = new Map<string, string>();
  for (const e of [...events].reverse()) if (!anonLabel.has(e.anonId)) anonLabel.set(e.anonId, sourceLabel(e));
  const seen = { visit: new Set<string>(), start: new Set<string>(), preview: new Set<string>() };
  for (const e of events) {
    const label = anonLabel.get(e.anonId) ?? "직접 · 알 수 없음";
    if (e.name === "visit" && !seen.visit.has(e.anonId)) {
      seen.visit.add(e.anonId);
      row(label).visits++;
    }
    if (e.name === "analyze_start" && !seen.start.has(e.anonId)) {
      seen.start.add(e.anonId);
      row(label).analyzeStarts++;
    }
    if (e.name === "preview_view" && !seen.preview.has(e.anonId)) {
      seen.preview.add(e.anonId);
      row(label).previews++;
    }
  }
  for (const o of liveOrders) {
    const r = row(orderSource(o));
    r.checkouts++;
    if (o.status === "paid") {
      r.paid++;
      r.netRevenueKrw += o.amount;
    }
  }
  const sources = [...rows.values()]
    .map((r) => ({ ...r, conversionPct: pct(r.paid, r.previews) }))
    .sort((a, b) => b.visits + b.checkouts - (a.visits + a.checkouts));

  // ── 재방문 · 재구매
  const daysByAnon = new Map<string, Set<string>>();
  for (const e of events) {
    const day = seoulDayStart(new Date(e.createdAt));
    (daysByAnon.get(e.anonId) ?? daysByAnon.set(e.anonId, new Set()).get(e.anonId)!).add(day);
  }
  const returningVisitors = [...daysByAnon.values()].filter((d) => d.size >= 2).length;
  const ordersByUser = new Map<string, Set<string>>();
  for (const o of livePaid) (ordersByUser.get(o.userId) ?? ordersByUser.set(o.userId, new Set()).get(o.userId)!).add(o.assessmentId);
  const repeatBuyers = [...ordersByUser.values()].filter((a) => a.size >= 2).length;

  const good = feedback.filter((f) => f.rating >= 4).length;
  return {
    days,
    since,
    funnel,
    sources,
    revenue: { grossKrw, refundedKrw, netKrw, paidCount, refundedCount: liveRefunded.length, testPaidCount, duplicateSuspects },
    economics: {
      aiCostKrw,
      avgAiCostPerPaidKrw: avgCost,
      avgNetRevenuePerPaidKrw: avgNet,
      profitPerPaidKrw: avgNet !== null && avgCost !== null ? Math.round((avgNet - avgCost) * 100) / 100 : null,
      pricingConfigured,
    },
    satisfaction: { count: feedback.length, average: feedback.length ? Math.round((feedback.reduce((n, f) => n + f.rating, 0) / feedback.length) * 10) / 10 : null, goodPct: pct(good, feedback.length) },
    repeat: { returningVisitors, repeatBuyers },
    hasVisitData: events.length > 0,
  };
}
