// 혜택 관리자 서비스 — 설정 · 추천 대기열과 손익분기 경고 · 포인트 · 질문권 장부 합계 · 질문 한 번의 AI 원가(평균 · p95 · 재시도) · 정가 vs 추천 비교.
// 계산은 순수 함수(lib/commerce/profit.ts)와 저장소 집계로만 하고, 이 파일은 그것을 관리자 화면에 맞게 묶는다. 이름 · 생년월일 · 응답은 다루지 않는다.
//
// 지키는 것
// - 손익은 관리회계 추정이다. 세금 감면(75%)은 확정되지 않아 0%가 기본이며 여기서 정하지 않는다(관리자 손익 화면의 입력).
// - 가정값(전환율 · 광고비)은 실제 측정값이 충분할 때만 측정값으로 바꾸고, 바꿨는지를 화면에 밝힌다. 측정값이 모자라면 경고를 "자료 부족"으로 두고 흑자 · 적자를 단정하지 않는다.
// - 혜택 표가 없는 DB(19~22번 전)에서는 모든 숫자를 비우고 ready: false로 돌려 화면이 "준비 중"으로 보인다.

import { DEFAULT_ASSUMPTIONS, annualAfterTax, compareAcquisition, costPerIssuedPointKrw, type AcquisitionRow, type AnnualResult, type Assumptions } from "../commerce/profit.ts";
import type { BenefitSettings } from "../commerce/benefits.ts";
import { loadBenefitSettings, type BenefitDeps } from "./benefit-service.ts";
import type { AiQuestionCostRow, ExpenseRecord, LedgerTotals, ReferralSignupRecord, ReferralSignupStatus } from "./benefit-ports.ts";

// ── 질문 한 번의 AI 원가 ─────────────────────────

export type CostStats = { count: number; avgKrw: number; p50Krw: number; p95Krw: number; maxKrw: number };

/** 질문 한 번 = request_key 하나. 호출이 여러 번(재시도 · 고쳐 쓰기)이면 합쳐 한 번의 원가로 센다. request_key가 없는 행은 각각 한 번으로 센다 */
export type AiQuestionCostSummary = {
  questions: number;
  /** 검사에 걸리거나 실패해 두 번 이상 호출한 질문 수 */
  retried: number;
  /** 첫 호출을 뺀 나머지 호출의 비용 합(재시도 · 고쳐 쓰기에 든 돈) */
  retryCostKrw: number;
  retryShare: number;
  overall: CostStats;
  byCreditSource: Record<string, CostStats>;
  /** 원가 추정이 비어 있는 호출(가격표에 없는 모델 등)이 있으면 그 수 — 평균이 낮게 나올 수 있다 */
  unpricedCalls: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function statsOf(values: number[]): CostStats {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return { count: sorted.length, avgKrw: sorted.length ? r2(sum / sorted.length) : 0, p50Krw: r2(percentile(sorted, 0.5)), p95Krw: r2(percentile(sorted, 0.95)), maxKrw: r2(sorted[sorted.length - 1] ?? 0) };
}

export function summarizeAiQuestionCosts(rows: AiQuestionCostRow[]): AiQuestionCostSummary {
  const groups = new Map<string, AiQuestionCostRow[]>();
  rows.forEach((row, i) => {
    const key = row.requestKey ?? `__single_${i}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  });
  const totals: number[] = [];
  const bySource = new Map<string, number[]>();
  let retried = 0;
  let retryCost = 0;
  let totalCost = 0;
  for (const list of groups.values()) {
    const ordered = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const costs = ordered.map((r) => r.estCostKrw ?? 0);
    const sum = costs.reduce((s, v) => s + v, 0);
    totals.push(sum);
    totalCost += sum;
    if (ordered.length > 1) {
      retried += 1;
      retryCost += costs.slice(1).reduce((s, v) => s + v, 0);
    }
    const source = ordered.find((r) => r.creditSource)?.creditSource ?? "unknown";
    bySource.set(source, [...(bySource.get(source) ?? []), sum]);
  }
  return {
    questions: totals.length,
    retried,
    retryCostKrw: r2(retryCost),
    retryShare: totalCost > 0 ? r2(retryCost / totalCost) : 0,
    overall: statsOf(totals),
    byCreditSource: Object.fromEntries([...bySource.entries()].map(([k, v]) => [k, statsOf(v)])),
    unpricedCalls: rows.filter((r) => r.estCostKrw === null).length,
  };
}

// ── 추천 퍼널과 손익분기 경고 ────────────────────

export type ReferralFunnel = { links: number; visits: number; signups: number; confirmed: number; review: number; firstPurchasesConfirmed: number; firstPurchasesRevoked: number };

export type ReferralHealth = {
  funnel: ReferralFunnel;
  /** 확정된 가입 → 첫 구매 확정 비율. 확정 가입이 minSignups보다 적으면 null(자료 부족) */
  conversion: number | null;
  breakEvenConversion: number | null;
  status: "no-data" | "insufficient" | "below-breakeven" | "ok";
  /** 관리자에게 보이는 한 줄 — 흑자 · 적자를 단정하지 않는다 */
  message: string;
  /** 비용 구분: 가입 포인트(500P) 비용과 무료 AI 원가를 따로 센다 */
  cost: { signupPointKrw: number; freeAiKrw: number; perConfirmedSignupKrw: number };
  minSignups: number;
};

export const REFERRAL_MIN_SIGNUPS_FOR_JUDGEMENT = 30;

export function referralHealth(a: Assumptions, funnel: ReferralFunnel, minSignups = REFERRAL_MIN_SIGNUPS_FOR_JUDGEMENT): ReferralHealth {
  const cmp = compareAcquisition(a, Math.max(1, funnel.confirmed), 0.05, 0.05);
  const perSignup = cmp.referral.signupPointKrw / Math.max(1, funnel.confirmed) + cmp.referral.freeCostKrw / Math.max(1, funnel.confirmed);
  const cost = {
    signupPointKrw: r2(funnel.confirmed * (cmp.referral.signupPointKrw / Math.max(1, funnel.confirmed))),
    freeAiKrw: r2(funnel.confirmed * (cmp.referral.freeCostKrw / Math.max(1, funnel.confirmed))),
    perConfirmedSignupKrw: r2(perSignup),
  };
  const base = { funnel, breakEvenConversion: cmp.breakEvenConvReferral, cost, minSignups };
  if (funnel.signups === 0) return { ...base, conversion: null, status: "no-data", message: "추천으로 가입한 회원이 아직 없어요." };
  if (funnel.confirmed < minSignups) {
    return { ...base, conversion: null, status: "insufficient", message: `확정된 가입이 ${funnel.confirmed}명이라 첫 구매 전환을 판단하기엔 적어요(${minSignups}명 이상부터 비교). 손익분기 전환율(가정 기준)은 ${pct(cmp.breakEvenConvReferral)}예요.` };
  }
  const conversion = funnel.firstPurchasesConfirmed / funnel.confirmed;
  if (cmp.breakEvenConvReferral !== null && conversion < cmp.breakEvenConvReferral) {
    return { ...base, conversion, status: "below-breakeven", message: `추천 가입 → 첫 구매 전환 ${pct(conversion)}가 손익분기 ${pct(cmp.breakEvenConvReferral)}보다 낮아요. 가입 보상 · 무료 이용 원가가 구매로 회수되지 않고 있을 수 있어요(가정값 기준 · 확정된 가입 ${funnel.confirmed}명).` };
  }
  return { ...base, conversion, status: "ok", message: `전환 ${pct(conversion)}가 손익분기 ${pct(cmp.breakEvenConvReferral)} 이상이에요(가정값 기준이며 환불 · 보상 회수는 다시 반영해야 해요).` };
}

const pct = (v: number | null) => (v === null ? "계산 불가" : `${Math.round(v * 1000) / 10}%`);

// ── 가정값 맞추기 ───────────────────────────────

/** 설정(초대 가격 · 가입 포인트 · 포인트 교환가)과 측정한 질문 원가를 가정값에 반영한다. 측정값이 `minSamples`건보다 적으면 바꾸지 않는다 */
export function assumptionsFromSettings(settings: BenefitSettings, measured?: { aiQuestionAvgKrw: number; samples: number }, minSamples = 30): { assumptions: Assumptions; usedMeasuredQuestionCost: boolean } {
  const reportPrice = settings.pointPrices["personal-integrated-report"];
  const useMeasured = !!measured && measured.samples >= minSamples && measured.aiQuestionAvgKrw > 0;
  return {
    usedMeasuredQuestionCost: useMeasured,
    assumptions: {
      ...DEFAULT_ASSUMPTIONS,
      invitePriceKrw: settings.referral.inviteePrice,
      signupRewardPoints: settings.referral.signupPoints,
      reportPointPrice: reportPrice ?? DEFAULT_ASSUMPTIONS.reportPointPrice,
      aiQuestionCostKrw: useMeasured ? measured!.aiQuestionAvgKrw : DEFAULT_ASSUMPTIONS.aiQuestionCostKrw,
    },
  };
}

// ── 관리자 개요 ─────────────────────────────────

export type BenefitAdminOverview = {
  ready: boolean;
  settings: BenefitSettings;
  sinceDays: number;
  totals: LedgerTotals | null;
  referral: ReferralHealth | null;
  referralQueue: (ReferralSignupRecord & { inviteeShort: string; inviterShort: string })[];
  aiQuestion: AiQuestionCostSummary | null;
  assumptions: { usedMeasuredQuestionCost: boolean; aiQuestionCostKrw: number; signupRewardPoints: number; invitePriceKrw: number };
  comparison: { equalConversion: { list: AcquisitionRow; referral: AcquisitionRow }; referralConversion: { list: AcquisitionRow; referral: AcquisitionRow }; breakEvenConvReferral: number | null; basisNote: string };
  /** 지급 · 환불 · 차감 중 막힌 기록(benefit_failures) 최근 건 */
  failures: { id: number; kind: string; ref: string | null; message: string; createdAt: string }[];
};

const short = (id: string) => id.slice(0, 8);

export async function getBenefitAdminOverview(deps: BenefitDeps, input: { sinceDays: number }): Promise<BenefitAdminOverview> {
  const { benefits, now } = deps;
  const { ready, settings } = await loadBenefitSettings(benefits);
  const sinceDays = Math.min(365, Math.max(1, Math.floor(input.sinceDays)));
  const since = new Date(now().getTime() - sinceDays * 86_400_000).toISOString();
  const { assumptions } = assumptionsFromSettings(settings);
  const empty = (a: Assumptions, usedMeasured: boolean): BenefitAdminOverview => ({
    ready,
    settings,
    sinceDays,
    totals: null,
    referral: null,
    referralQueue: [],
    aiQuestion: null,
    assumptions: { usedMeasuredQuestionCost: usedMeasured, aiQuestionCostKrw: a.aiQuestionCostKrw, signupRewardPoints: a.signupRewardPoints, invitePriceKrw: a.invitePriceKrw },
    comparison: comparisonOf(a, null),
    failures: [],
  });
  if (!ready) return empty(assumptions, false);

  const [totals, funnel, queue, costRows, failures] = await Promise.all([
    benefits.ledgerTotals(since),
    benefits.referralFunnelCounts(since),
    benefits.listReferralSignups({ status: "review", limit: 50 }),
    benefits.listAiQuestionCosts(since, 5000),
    benefits.listFailures(20),
  ]);
  const aiQuestion = summarizeAiQuestionCosts(costRows);
  const { assumptions: a, usedMeasuredQuestionCost } = assumptionsFromSettings(settings, { aiQuestionAvgKrw: aiQuestion.overall.avgKrw, samples: aiQuestion.questions });
  const health = referralHealth(a, funnel);
  return {
    ready,
    settings,
    sinceDays,
    totals,
    referral: health,
    referralQueue: queue.map((q) => ({ ...q, inviteeShort: short(q.inviteeUserId), inviterShort: short(q.inviterUserId) })),
    aiQuestion,
    assumptions: { usedMeasuredQuestionCost, aiQuestionCostKrw: a.aiQuestionCostKrw, signupRewardPoints: a.signupRewardPoints, invitePriceKrw: a.invitePriceKrw },
    comparison: comparisonOf(a, health.conversion),
    failures,
  };
}

/**
 * 정가 구매 vs 추천 구매를 같은 가입자 수 · 같은 무료 이용 원가 · 같은 광고비 기준으로 나란히 본다.
 * 첫 줄은 두 유입의 전환율이 같다고 둔 비교(가격 · 보상 구조만의 차이), 둘째 줄은 추천 전환율에 실제 측정값(있으면)을 넣은 비교다.
 */
function comparisonOf(a: Assumptions, measuredReferralConv: number | null): BenefitAdminOverview["comparison"] {
  const base = a.freeToPaidRate;
  const equal = compareAcquisition(a, 1000, base, base);
  const measured = compareAcquisition(a, 1000, base, measuredReferralConv ?? a.referralSignupToBuyRate);
  return {
    equalConversion: { list: equal.list, referral: equal.referral },
    referralConversion: { list: measured.list, referral: measured.referral },
    breakEvenConvReferral: equal.breakEvenConvReferral,
    basisNote: `가입자 1,000명 기준 · 무료 이용 원가는 두 유입이 같이 지고, 광고비(구매자당 ${a.adCostPerBuyerKrw.toLocaleString("ko-KR")}원 가정)는 정가 유입에만, 가입 포인트 ${a.signupRewardPoints}P와 질문권 비용은 추천 유입에만 든다. 전환율 ${pct(base)}는 가정이며 ${measuredReferralConv === null ? "추천 전환율도 가정(" + pct(a.referralSignupToBuyRate) + ")이다" : "둘째 줄의 추천 전환율은 실제 측정값(" + pct(measuredReferralConv) + ")이다"}.`,
  };
}

// ── 추천 대기열 처리 · 설정 일시 중지 ─────────────

export const PAUSABLE_FEATURES = [
  { key: "feature.points_earn", label: "구매 적립 포인트" },
  { key: "feature.referral_signup_points", label: "추천 가입 보상(500P)" },
  { key: "feature.referral_purchase_credits", label: "추천 구매 보상(질문권)" },
  { key: "feature.review_reward", label: "후기 보상(질문권)" },
  { key: "feature.referral", label: "추천 링크 전체" },
] as const;

export async function decideReferral(deps: BenefitDeps, input: { inviteeUserId: string; decision: "confirm" | "reject"; reason: string; by: string }): Promise<{ ok: true; status: "confirmed" | "rejected"; points?: number } | { ok: false; message: string }> {
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, message: "처리 이유를 3자 이상 적어 주세요." };
  const r = await deps.benefits.decideReferralSignup({ inviteeUserId: input.inviteeUserId, decision: input.decision, reason: reason.slice(0, 200), by: input.by });
  if (!r.ok) return { ok: false, message: r.reason === "not-review" ? "이미 처리됐거나 검토 대상이 아니에요." : "처리하지 못했어요. 다시 시도해 주세요." };
  return r;
}

export async function revokeReferral(deps: BenefitDeps, input: { inviteeUserId: string; reason: string; by: string }): Promise<{ ok: boolean; message?: string }> {
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, message: "회수 이유를 3자 이상 적어 주세요." };
  const r = await deps.benefits.revokeReferralSignup({ inviteeUserId: input.inviteeUserId, reason: reason.slice(0, 200), by: input.by });
  return r.ok ? { ok: true } : { ok: false, message: "회수하지 못했어요(이미 회수됐거나 대상이 아니에요)." };
}

export type { ReferralSignupStatus };

// ── 월 손익(관리회계 추정) ─────────────────────

export type FinanceMonthView = {
  month: string;
  revenue: {
    /** 실결제(live) 결제 완료 주문의 금액 합 */
    grossKrw: number;
    refundedKrw: number;
    netKrw: number;
    paidCount: number;
    refundedCount: number;
    /** 테스트 결제(매출 제외) · 혜택 주문(0원, 매출 아님) */
    testPaidCount: number;
    benefitOrderCount: number;
  };
  aiCostKrw: number;
  /** 가격표에 없는 호출 수 — 있으면 AI 비용이 낮게 잡혔을 수 있다 */
  aiUnpricedCalls: number;
  expenses: { adKrw: number; fixedKrw: number; otherKrw: number; items: ExpenseRecord[] };
  /** 이번 달 지급된 보상의 추정 비용: 포인트 1P의 기대 비용(가정) × 지급 포인트 + 질문권 × 질문 원가 × 사용률(가정). 확정 회계가 아니다 */
  rewardCostEstimateKrw: number;
  ledger: LedgerTotals | null;
  /** 순매출 − AI 비용 − 광고 · 고정 · 기타 비용 − 보상 비용 추정. 결제 수수료 · 세금은 빼지 않았다 */
  operatingBeforeFeeTaxKrw: number;
  caveats: string[];
};

const KST = "+09:00";
const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

export async function getFinanceMonthView(deps: BenefitDeps, input: { month: string }): Promise<FinanceMonthView> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error("month must be YYYY-MM");
  const since = new Date(`${input.month}-01T00:00:00${KST}`).toISOString();
  const until = new Date(`${nextMonth(input.month)}-01T00:00:00${KST}`).toISOString();
  const { repo, benefits } = deps;
  const { ready, settings } = await loadBenefitSettings(benefits);
  const { assumptions } = assumptionsFromSettings(settings);

  const orders = (await repo.listOrdersForMetrics(since, 20_000)).filter((o) => o.createdAt < until);
  const live = orders.filter((o) => o.paymentEnv === "live" && (o.provider ?? "tosspayments") === "tosspayments");
  const paid = live.filter((o) => o.status === "paid");
  const refunded = live.filter((o) => o.status === "refunded");
  const grossKrw = paid.reduce((n, o) => n + o.amount, 0) + refunded.reduce((n, o) => n + o.amount, 0);
  const refundedKrw = refunded.reduce((n, o) => n + o.amount, 0);

  const usage = (await repo.listAiUsageSince(since, 50_000)).filter((u) => u.createdAt < until);
  const aiCostKrw = Math.round(usage.reduce((n, u) => n + (u.estCostKrw ?? 0), 0) * 100) / 100;

  let expenses: ExpenseRecord[] = [];
  let ledger: LedgerTotals | null = null;
  if (ready) {
    expenses = (await benefits.listExpenses(500)).filter((e) => e.month === input.month);
    ledger = await benefits.ledgerTotals(since);
  }
  const sum = (kind: ExpenseRecord["kind"]) => expenses.filter((e) => e.kind === kind).reduce((n, e) => n + e.amountKrw, 0);
  const rewardCost = ledger ? ledger.pointsEarned * costPerIssuedPointKrw(assumptions) + ledger.creditsGranted * assumptions.aiQuestionCostKrw * assumptions.creditUsageRate : 0;
  const netKrw = grossKrw - refundedKrw;
  const exp = { adKrw: sum("ad"), fixedKrw: sum("fixed"), otherKrw: sum("other") };
  const operating = netKrw - aiCostKrw - exp.adKrw - exp.fixedKrw - exp.otherKrw - rewardCost;

  return {
    month: input.month,
    revenue: { grossKrw, refundedKrw, netKrw, paidCount: paid.length, refundedCount: refunded.length, testPaidCount: orders.filter((o) => o.paymentEnv !== "live" && o.status === "paid" && (o.provider ?? "tosspayments") === "tosspayments").length, benefitOrderCount: orders.filter((o) => o.provider === "benefit").length },
    aiCostKrw,
    aiUnpricedCalls: usage.filter((u) => u.estCostKrw === null).length,
    expenses: { ...exp, items: expenses },
    rewardCostEstimateKrw: Math.round(rewardCost * 100) / 100,
    ledger,
    operatingBeforeFeeTaxKrw: Math.round(operating),
    caveats: [
      "관리회계 추정이에요. 결제 수수료 · 부가세 · 소득세는 빼지 않았고 세무 처리와는 따로 정해야 해요.",
      "포인트 1P의 비용은 사용률 · 잠식률 가정으로 추정한 값이에요(1P = 1원으로 회계 처리하지 않았어요).",
      ledger ? "" : "혜택 표가 아직 없는 DB라 보상 비용 · 비용 입력은 비어 있어요.",
      aiCostKrw === 0 && usage.length === 0 ? "이 달에 기록된 AI 호출이 없어요." : "",
    ].filter(Boolean),
  };
}

/**
 * 연간 전망(가정) — 월 구매자 수 · 추천 구매 비중 · 감면율을 넣어 세후 이익을 본다. 감면율은 확정되지 않은 가정이며 기본은 0%(감면 없음)다.
 * 세 가지 감면 가정(0 · 50 · 75%)을 나란히 보이되 75%는 "확정되지 않은 조건부 가정"이라고 화면에 밝힌다.
 */
export function annualScenarios(a: Assumptions, input: { monthlyBuyers: number; referralShare: number; otherIncomeKrw: number }): { reductionRate: number; label: string; result: AnnualResult }[] {
  return [
    { reductionRate: 0, label: "감면 없음(기본)" },
    { reductionRate: 0.5, label: "감면 50%(가정)" },
    { reductionRate: 0.75, label: "감면 75%(확정되지 않은 조건부 가정)" },
  ].map((s) => ({
    ...s,
    result: annualAfterTax(a, { monthlyBuyers: input.monthlyBuyers, referralShare: input.referralShare, otherIncomeKrw: input.otherIncomeKrw, deductionsKrw: 0, reductionRate: s.reductionRate, autoVatMode: true }),
  }));
}
