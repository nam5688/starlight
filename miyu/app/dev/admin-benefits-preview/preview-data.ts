// 개발용 미리보기의 가상 값 — 혜택 관리자 화면의 모양을 보려는 값이며 실제 값이 아니다. 아무것도 저장하지 않는다.
// 실제 서비스 함수(getBenefitAdminOverview · getFinanceMonthView)를 메모리 저장소 위에서 돌리되, 저장소가 돌려주는 집계(퍼널 · 장부 · 질문 원가 · 주문 · 비용)만 가상 값으로 바꿔 끼운다.
// 그래서 손익분기 경고 문구 · 비교표 · 월 손익은 서비스가 계산한 결과이고, 가상인 것은 그 입력뿐이다.

import type { GrantRow } from "@/components/admin/benefits/overview-tab";
import { getBenefitAdminOverview, getFinanceMonthView, type BenefitAdminOverview, type FinanceMonthView } from "@/lib/services/benefit-admin-service";
import type { AiQuestionCostRow, BenefitRepository, CouponRecord, ExpenseRecord, LedgerTotals, ReferralSignupRecord, SettingHistoryRecord } from "@/lib/services/benefit-ports";
import type { AiUsageRecord, MetricsOrder, MiyuRepository } from "@/lib/services/ports";
import { createMemoryBenefits, rawDefaultSettings } from "@/lib/services/testing/memory-benefits";
import { createMemoryRepository } from "@/lib/services/testing/memory-repository";

export const PREVIEW_NOW = new Date("2026-10-20T03:00:00Z"); // 2026-10-20 12:00 한국 시간

export type PreviewState = "warn" | "sparse" | "empty" | "notready";

export const PREVIEW_STATES: { key: PreviewState; label: string; note: string }[] = [
  { key: "warn", label: "손익분기 미달 · 검토 대기 · 장부 어긋남", note: "추천 가입 확정 120명 중 첫 구매 3명(2.5%)이라 손익분기에 못 미치고, 검토 대기 3건 · 장부 어긋남 2개 · 막힌 기록이 있는 모습이에요." },
  { key: "sparse", label: "자료 부족", note: "확정 가입이 10명뿐이라 전환을 판단하지 않고, 질문 원가 표본도 모자라 가정값을 쓰는 모습이에요." },
  { key: "empty", label: "아직 아무것도 없음", note: "추천 가입 · 쿠폰 · 장부가 모두 비어 있는 처음 상태예요." },
  { key: "notready", label: "준비 전 (DB 19~22번 전)", note: "혜택 표가 없어서 모든 탭이 준비 중으로 보이는 모습이에요." },
];

const U = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const iso = (s: string) => new Date(s).toISOString();

const FUNNEL = {
  warn: { links: 64, visits: 912, signups: 140, confirmed: 120, review: 3, firstPurchasesConfirmed: 3, firstPurchasesRevoked: 1 },
  sparse: { links: 9, visits: 88, signups: 12, confirmed: 10, review: 0, firstPurchasesConfirmed: 2, firstPurchasesRevoked: 0 },
  empty: { links: 0, visits: 0, signups: 0, confirmed: 0, review: 0, firstPurchasesConfirmed: 0, firstPurchasesRevoked: 0 },
  notready: { links: 0, visits: 0, signups: 0, confirmed: 0, review: 0, firstPurchasesConfirmed: 0, firstPurchasesRevoked: 0 },
} as const;

const QUEUE: ReferralSignupRecord[] = [
  { inviteeUserId: U(31415926), inviterUserId: U(27182818), status: "review", risk: ["same_device_repeat", "too_fast"], signedUpAt: iso("2026-10-19T14:20:00+09:00"), holdUntil: iso("2026-10-22T14:20:00+09:00"), decidedAt: null, decisionReason: null, firstPurchase: null },
  { inviteeUserId: U(16180339), inviterUserId: U(27182818), status: "review", risk: ["burst"], signedUpAt: iso("2026-10-19T14:25:00+09:00"), holdUntil: iso("2026-10-22T14:25:00+09:00"), decidedAt: null, decisionReason: null, firstPurchase: null },
  { inviteeUserId: U(14142135), inviterUserId: U(57721566), status: "review", risk: ["young_inviter", "daily_cap"], signedUpAt: iso("2026-10-20T09:02:00+09:00"), holdUntil: iso("2026-10-23T09:02:00+09:00"), decidedAt: null, decisionReason: null, firstPurchase: null },
];

const TOTALS: Record<PreviewState, LedgerTotals> = {
  warn: {
    pointsEarned: 61_500, pointsSpent: 23_800, pointsExpired: 1_200, pointsClawed: 2_400, pointsShortfall: 600, pointsOutstanding: 34_100,
    creditsGranted: 42, creditsSpent: 19, creditsExpired: 2, creditsRevoked: 2, creditsShortfall: 1, creditsOutstanding: 19,
    pointsBySource: { purchase: 38_500, referral_signup: 60_000, admin: 5_000, event: 2_000 },
    creditsByKind: { referral_inviter: 20, referral_invitee: 18, review: 6, promo: 8 },
    lotMismatches: 2,
  },
  sparse: {
    pointsEarned: 4_500, pointsSpent: 0, pointsExpired: 0, pointsClawed: 0, pointsShortfall: 0, pointsOutstanding: 4_500,
    creditsGranted: 4, creditsSpent: 1, creditsExpired: 0, creditsRevoked: 0, creditsShortfall: 0, creditsOutstanding: 3,
    pointsBySource: { purchase: 2_000, referral_signup: 2_500 }, creditsByKind: { referral_inviter: 2, referral_invitee: 2 }, lotMismatches: 0,
  },
  empty: { pointsEarned: 0, pointsSpent: 0, pointsExpired: 0, pointsClawed: 0, pointsShortfall: 0, pointsOutstanding: 0, creditsGranted: 0, creditsSpent: 0, creditsExpired: 0, creditsRevoked: 0, creditsShortfall: 0, creditsOutstanding: 0, pointsBySource: {}, creditsByKind: {}, lotMismatches: 0 },
  notready: { pointsEarned: 0, pointsSpent: 0, pointsExpired: 0, pointsClawed: 0, pointsShortfall: 0, pointsOutstanding: 0, creditsGranted: 0, creditsSpent: 0, creditsExpired: 0, creditsRevoked: 0, creditsShortfall: 0, creditsOutstanding: 0, pointsBySource: {}, creditsByKind: {}, lotMismatches: 0 },
};

/** 질문 n개(재시도 몇 개 포함) — 질문 번호로 묶이는 호출 행 */
function questionRows(n: number): AiQuestionCostRow[] {
  const rows: AiQuestionCostRow[] = [];
  const sources = ["free", "free", "paid", "reward"] as const;
  for (let i = 0; i < n; i += 1) {
    const base = 9 + ((i * 7) % 23);
    const at = (m: number) => new Date(PREVIEW_NOW.getTime() - (i + 1) * 3_600_000 + m * 1000).toISOString();
    rows.push({ requestKey: `q${i}`, creditSource: sources[i % 4], roomKey: i % 3 === 0 ? "love" : "talk", estCostKrw: base, outcome: "ok", createdAt: at(0) });
    if (i % 6 === 0) rows.push({ requestKey: `q${i}`, creditSource: sources[i % 4], roomKey: "love", estCostKrw: Math.round(base * 0.9), outcome: "ok", createdAt: at(30) });
  }
  if (n > 0) rows.push({ requestKey: "q-unpriced", creditSource: "free", roomKey: "love", estCostKrw: null, outcome: "ok", createdAt: new Date(PREVIEW_NOW.getTime() - 60_000).toISOString() });
  return rows;
}

const FAILURES = [
  { id: 2, kind: "orders_trigger", ref: "6f5b0c3e-1c3b-4d7a-9f7e-2a8d9c0b1e11", message: "unique violation on point_lots (opKey earn:6f5b0c3e)", createdAt: iso("2026-10-19T21:40:00+09:00") },
  { id: 1, kind: "referral_confirm", ref: U(14142135), message: "daily cap reached, moved to review", createdAt: iso("2026-10-18T10:05:00+09:00") },
];

const COUPONS: CouponRecord[] = [
  { id: "c0000001-0000-4000-8000-000000000001", code: "WELCOME5000", name: "첫 구매 5,000원 할인", description: "신규 가입 안내 메일용", type: "amount", value: 5000, productIds: [], targetUserId: null, perUserLimit: 1, issueLimit: 100, startsAt: iso("2026-10-18T00:00:00+09:00"), endsAt: iso("2026-11-30T23:59:00+09:00"), purpose: "promo", reviewRewardEligible: false, stackableWithReferral: false, creditExpireDays: null, status: "active", createdAt: iso("2026-10-17T12:00:00+09:00"), activeCount: 14, usedCount: 11 },
  { id: "c0000002-0000-4000-8000-000000000002", code: "TRIAL-TEAM", name: "체험단 무료 이용권", description: "10월 체험단 12명", type: "free-report-entitlement", value: 0, productIds: [], targetUserId: null, perUserLimit: 1, issueLimit: 12, startsAt: null, endsAt: null, purpose: "trial", reviewRewardEligible: true, stackableWithReferral: false, creditExpireDays: null, status: "paused", createdAt: iso("2026-10-16T12:00:00+09:00"), activeCount: 12, usedCount: 12 },
  { id: "c0000003-0000-4000-8000-000000000003", code: "ASKMORE3", name: "질문권 3개 선물", description: null, type: "credit", value: 3, productIds: [], targetUserId: null, perUserLimit: 1, issueLimit: null, startsAt: null, endsAt: iso("2026-10-15T23:59:00+09:00"), purpose: "event", reviewRewardEligible: false, stackableWithReferral: true, creditExpireDays: 30, status: "active", createdAt: iso("2026-10-01T12:00:00+09:00"), activeCount: 40, usedCount: 38 },
  { id: "c0000004-0000-4000-8000-000000000004", code: "PERCENT20", name: "20% 할인 (초안)", description: "아직 켜지 않음", type: "percent", value: 20, productIds: [], targetUserId: null, perUserLimit: 2, issueLimit: 50, startsAt: iso("2026-11-01T00:00:00+09:00"), endsAt: null, purpose: "promo", reviewRewardEligible: false, stackableWithReferral: false, creditExpireDays: null, status: "draft", createdAt: iso("2026-10-19T12:00:00+09:00"), activeCount: 0, usedCount: 0 },
  { id: "c0000005-0000-4000-8000-000000000005", code: "CS-SORRY-01", name: "고객 응대 보상 (1명 전용)", description: "결제 오류 사과", type: "free-product", value: 0, productIds: [], targetUserId: U(27182818), perUserLimit: 1, issueLimit: 1, startsAt: null, endsAt: null, purpose: "cs", reviewRewardEligible: false, stackableWithReferral: false, creditExpireDays: null, status: "revoked", createdAt: iso("2026-10-12T12:00:00+09:00"), activeCount: 0, usedCount: 0 },
];

const GRANTS: GrantRow[] = [
  { orderId: "o1", orderNumber: "MEU-20261019-0042", userId: U(31415926), kind: "coupon", ref: "TRIAL-TEAM", pointSpent: 0, couponRedemptionId: "r1", reviewRewardEligible: true, grantedBy: null, reason: null, releasedAt: null, releaseMode: null, releaseReason: null, createdAt: iso("2026-10-19T18:10:00+09:00"), orderStatus: "paid" },
  { orderId: "o2", orderNumber: "MEU-20261018-0037", userId: U(16180339), kind: "points", ref: null, pointSpent: 11_900, couponRedemptionId: null, reviewRewardEligible: false, grantedBy: null, reason: null, releasedAt: null, releaseMode: null, releaseReason: null, createdAt: iso("2026-10-18T09:30:00+09:00"), orderStatus: "paid" },
  { orderId: "o3", orderNumber: "MEU-20261017-0031", userId: U(14142135), kind: "admin", ref: null, pointSpent: 0, couponRedemptionId: null, reviewRewardEligible: false, grantedBy: U(27182818), reason: "결제 오류 사과로 리포트 무료 제공", releasedAt: null, releaseMode: null, releaseReason: null, createdAt: iso("2026-10-17T15:45:00+09:00"), orderStatus: "paid" },
  { orderId: "o4", orderNumber: "MEU-20261016-0024", userId: U(57721566), kind: "points", ref: null, pointSpent: 11_900, couponRedemptionId: null, reviewRewardEligible: false, grantedBy: null, reason: null, releasedAt: iso("2026-10-16T21:00:00+09:00"), releaseMode: "restore", releaseReason: "리포트 생성 실패", createdAt: iso("2026-10-16T20:40:00+09:00"), orderStatus: "refunded" },
];

const HISTORY: SettingHistoryRecord[] = [
  { id: 6, key: "feature.referral", oldValue: false, newValue: true, changedBy: U(27182818), reason: "추천 링크 시험 시작", changedAt: iso("2026-10-19T11:00:00+09:00") },
  { id: 5, key: "referral.invitee_price", oldValue: 5900, newValue: 6900, changedBy: U(27182818), reason: "운영자 확정 2026-10-17", changedAt: iso("2026-10-18T10:30:00+09:00") },
  { id: 4, key: "earn.tiers", oldValue: [{ fromKrw: 0, rate: 0.03 }, { fromKrw: 300_000, rate: 0.05 }], newValue: [{ fromKrw: 0, rate: 0.03 }, { fromKrw: 100_000, rate: 0.03 }, { fromKrw: 300_000, rate: 0.05 }], changedBy: U(27182818), reason: "10만~30만원 구간 기본 3%로 명시", changedAt: iso("2026-10-18T10:00:00+09:00") },
  { id: 3, key: "feature.points_earn", oldValue: true, newValue: false, changedBy: U(27182818), reason: "적립 점검 동안 잠시 중지", changedAt: iso("2026-10-17T22:10:00+09:00") },
  { id: 2, key: "point.prices", oldValue: { "personal-integrated-report": 11_880 }, newValue: { "personal-integrated-report": 11_900 }, changedBy: null, reason: "교환가 끝자리 정리", changedAt: iso("2026-10-17T10:00:00+09:00") },
  { id: 1, key: "point.expire_days", oldValue: 0, newValue: 365, changedBy: U(27182818), reason: "포인트 유효기간 1년", changedAt: iso("2026-10-16T10:00:00+09:00") },
];

function ordersFor(month: string): MetricsOrder[] {
  if (month !== "2026-10") return [];
  const mk = (i: number, amount: number, status: MetricsOrder["status"], env: MetricsOrder["paymentEnv"], provider?: "tosspayments" | "benefit"): MetricsOrder =>
    ({ id: `po${i}`, userId: U(1000 + i), assessmentId: `a${i}`, productId: "personal-integrated-report", status, amount, paymentEnv: env, createdAt: iso(`2026-10-${String(1 + (i % 19)).padStart(2, "0")}T12:00:00+09:00`), approvedAt: null, acquisition: null, provider }) as MetricsOrder;
  const orders: MetricsOrder[] = [];
  let i = 0;
  for (let k = 0; k < 30; k += 1) orders.push(mk(i++, 9900, "paid", "live"));
  for (let k = 0; k < 6; k += 1) orders.push(mk(i++, 6900, "paid", "live"));
  for (let k = 0; k < 2; k += 1) orders.push(mk(i++, 9900, "refunded", "live"));
  for (let k = 0; k < 3; k += 1) orders.push(mk(i++, 9900, "paid", "test"));
  for (let k = 0; k < 4; k += 1) orders.push(mk(i++, 0, "paid", "live", "benefit"));
  return orders;
}

function usageFor(month: string): AiUsageRecord[] {
  if (month !== "2026-10") return [];
  const rec = (id: number, cost: number | null) => ({ id, reportId: null, provider: "anthropic", model: "claude-x", promptVersion: "v", inputTokens: 3000, outputTokens: 500, estCostKrw: cost, latencyMs: 4000, outcome: "ok", errorCode: null, createdAt: iso("2026-10-12T12:00:00+09:00") }) as AiUsageRecord;
  return [...Array.from({ length: 36 }, (_, k) => rec(k + 1, 340 + (k % 5) * 20)), rec(99, null)];
}

function expensesFor(month: string): ExpenseRecord[] {
  if (month !== "2026-10") return [];
  return [
    { id: 3, month, kind: "other", amountKrw: 15_000, memo: "도메인 갱신", createdAt: iso("2026-10-18T10:00:00+09:00") },
    { id: 2, month, kind: "fixed", amountKrw: 100_000, memo: "서버 · DB · 도구 합계", createdAt: iso("2026-10-05T10:00:00+09:00") },
    { id: 1, month, kind: "ad", amountKrw: 120_000, memo: "인스타 광고 1차", createdAt: iso("2026-10-03T10:00:00+09:00") },
  ];
}

export type PreviewBundle = {
  overview: BenefitAdminOverview;
  grants: GrantRow[];
  history: SettingHistoryRecord[];
  coupons: CouponRecord[];
  finance: FinanceMonthView;
};

export async function buildPreview(state: PreviewState, month: string, sinceDays: number): Promise<PreviewBundle> {
  const clock = () => PREVIEW_NOW;
  const mem = createMemoryRepository(clock);
  const ben = createMemoryBenefits(mem, clock);
  const raw: Record<string, unknown> = { ...rawDefaultSettings() };
  if (state === "warn" || state === "sparse") {
    for (const k of ["feature.points_earn", "feature.referral", "feature.referral_signup_points", "feature.coupons"]) raw[k] = true;
  }
  const missing = Object.assign(new Error("relation does not exist"), { code: "42P01" });
  const rows = state === "warn" ? questionRows(45) : state === "sparse" ? questionRows(8) : [];
  const filled = state === "warn" || state === "sparse";

  const benefits: BenefitRepository = {
    ...ben.repo,
    getSettings: async () => {
      if (state === "notready") throw missing;
      return raw;
    },
    referralFunnelCounts: async () => ({ ...FUNNEL[state] }),
    listReferralSignups: async () => (state === "warn" ? QUEUE : []),
    ledgerTotals: async () => TOTALS[state],
    listAiQuestionCosts: async () => rows,
    listFailures: async () => (state === "warn" ? FAILURES : []),
    listCoupons: async () => (state === "warn" ? COUPONS : state === "sparse" ? COUPONS.slice(3, 4) : []),
    listSettingHistory: async () => (filled ? HISTORY : []),
    listBenefitGrants: async () => (state === "warn" ? GRANTS : []),
    listExpenses: async () => expensesFor(month),
  };
  const repo = { ...mem.repo, listOrdersForMetrics: async () => ordersFor(month), listAiUsageSince: async () => usageFor(month) } as unknown as MiyuRepository;
  const deps = { repo, benefits, now: clock };

  const overview = await getBenefitAdminOverview(deps, { sinceDays });
  const finance = await getFinanceMonthView(deps, { month });
  return { overview, grants: await benefits.listBenefitGrants(20), history: await benefits.listSettingHistory(30), coupons: await benefits.listCoupons(), finance };
}

export const PREVIEW_DEFAULT_MONTH = "2026-10";
