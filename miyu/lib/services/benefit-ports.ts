// 혜택(포인트 · 질문권 · 쿠폰 · 0원 혜택 주문 · 친구 추천 · 설정 · 비용 입력) 저장소의 약속.
// 웹은 Supabase 구현체(연결 폴더의 supabase/benefits.ts), 시험은 메모리 구현체(lib/services/testing/memory-benefits.ts)를 쓴다 — 둘 다 DB 변경 19~22번과 같은 규칙을 따른다.
// 모든 지급 · 차감 · 회수 · 확정은 서버(비밀키)만 부르고, 서비스가 소유자를 확인한 뒤에만 부른다. 이 파일은 React · Next · 외부 SDK를 불러오지 않는다.

import type { CouponCheck, ReferralCheck } from "../commerce/benefits.ts";

export type PointLotRecord = { id: string; amount: number; remaining: number; expiresAt: string | null; sourceKind: string; sourceRef: string | null; revokedAt: string | null; createdAt: string };
export type PointLedgerRecord = { id: number; kind: string; amount: number; lotId: string | null; orderId: string | null; shortfall: number; createdAt: string };
export type CreditLotRecord = { id: string; kind: string; quantity: number; remaining: number; expiresAt: string | null; sourceRef: string | null; revokedAt: string | null; createdAt: string };
export type CreditLedgerRecord = { id: number; kind: string; qty: number; lotId: string; shortfall: number; createdAt: string };

export type PointSpendResult = { status: "spent"; balance: number } | { status: "already"; balance: number } | { status: "insufficient"; balance: number } | { status: "invalid" };
export type PointRestoreResult = { status: "restored"; balance: number } | { status: "already"; balance: number } | { status: "nothing" };
export type CreditSpendResult = { status: "spent"; kind: string; balance: number } | { status: "already"; balance: number } | { status: "none"; balance: number } | { status: "invalid" };
export type CreditRestoreResult = { status: "restored"; balance: number } | { status: "already"; balance: number } | { status: "nothing" };
export type GrantResult = { status: "granted"; amount?: number; qty?: number } | { status: "duplicate" } | { status: "invalid" };

/** 원 단위 쿠폰 종류 — amount 정액 · percent 정률 · free-product 상품 100% · free-report-entitlement 무료 이용권 · credit 질문권 지급 */
export type CouponType = "amount" | "percent" | "free-product" | "free-report-entitlement" | "credit";
export type CouponStatus = "draft" | "active" | "paused" | "revoked";
export type CouponPurpose = "promo" | "trial" | "cs" | "event";

export type CouponRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: CouponType;
  value: number;
  productIds: string[];
  targetUserId: string | null;
  perUserLimit: number;
  issueLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  purpose: CouponPurpose;
  reviewRewardEligible: boolean;
  stackableWithReferral: boolean;
  creditExpireDays: number | null;
  status: CouponStatus;
  createdAt: string;
  /** 예약 또는 사용 중인 수 */
  activeCount: number;
  usedCount: number;
};
export type NewCoupon = Omit<CouponRecord, "id" | "createdAt" | "activeCount" | "usedCount" | "status"> & { status?: CouponStatus; createdBy: string | null };
export type CouponRedemptionRecord = { id: string; couponId: string; userId: string; orderId: string | null; status: "reserved" | "used" | "released" | "revoked"; createdAt: string };

export type ReserveCouponResult = { ok: true; redemptionId: string; duplicate?: boolean } | { ok: false; reason: string };
export type RedeemCreditCouponResult = { ok: true; qty?: number; duplicate?: boolean } | { ok: false; reason: string };

export type GrantBenefitOrderInput = {
  userId: string;
  assessmentId: string;
  productId: string;
  kind: "coupon" | "points" | "admin";
  couponCode?: string | null;
  pointPrice?: number | null;
  listPriceKrw: number;
  orderNumber: string;
  paymentEnv: string;
  grantedBy?: string | null;
  reason?: string | null;
};
export type GrantBenefitOrderResult = { ok: true; orderId: string; orderNumber: string } | { ok: false; reason: string };
export type ReleaseBenefitOrderResult = { ok: true; already?: boolean; mode?: "restore" | "revoke" } | { ok: false; reason: string };

export type BenefitOrderGrantRecord = {
  orderId: string;
  kind: "coupon" | "points" | "admin";
  ref: string | null;
  pointSpent: number;
  couponRedemptionId: string | null;
  reviewRewardEligible: boolean;
  grantedBy: string | null;
  reason: string | null;
  releasedAt: string | null;
  releaseMode: "restore" | "revoke" | null;
  releaseReason: string | null;
  createdAt: string;
};

export type ReferralSignupStatus = "pending" | "review" | "confirmed" | "rejected" | "revoked";
export type ReferralFirstPurchaseStatus = "pending" | "confirmed" | "held" | "void" | "revoked";
/** 관리자 화면용 — 회원번호 앞 8자(서비스가 자른다) · 시각 · 상태만. 이름 · 생년월일 · 응답은 없다 */
export type ReferralSignupRecord = {
  inviteeUserId: string;
  inviterUserId: string;
  status: ReferralSignupStatus;
  risk: string[];
  signedUpAt: string;
  holdUntil: string;
  decidedAt: string | null;
  decisionReason: string | null;
  /** 이 친구의 첫 구매 상태(없으면 null) */
  firstPurchase: ReferralFirstPurchaseStatus | null;
};
export type RegisterReferralResult = { ok: true; status: ReferralSignupStatus; risk?: string[]; already?: boolean } | { ok: false; reason: string };
export type EvaluateReferralResult = { status: "not-found" | "decided" | "feature-off" | "not-confirmed" | "no-analysis" | "holding" | "review" | "confirmed"; to?: string; points?: number; until?: string };
export type DecideReferralResult = { ok: true; status: "confirmed" | "rejected"; points?: number } | { ok: false; reason: string };
export type ClaimReferralResult = ReferralCheck | { ok: false; reason: "order-mismatch" };

export type BenefitMaintenanceResult = {
  expiredPointLots: number;
  expiredCreditLots: number;
  earnedBackfill: number;
  partialRefundAdjusted: number;
  referralEvaluated: number;
  referralConfirmed: number;
  referralPurchaseRewards: number;
  visitsPurged: number;
  purge: string;
};

export type SettingHistoryRecord = { id: number; key: string; oldValue: unknown; newValue: unknown; changedBy: string | null; reason: string; changedAt: string };
export type BenefitFailureRecord = { id: number; kind: string; ref: string | null; message: string; createdAt: string };

export type ExpenseKind = "ad" | "fixed" | "other";
export type ExpenseRecord = { id: number; month: string; kind: ExpenseKind; amountKrw: number; memo: string | null; createdAt: string };

/** 한 기간의 포인트 · 질문권 장부 합계(관리자 · 손익) */
export type LedgerTotals = {
  pointsEarned: number;
  pointsSpent: number;
  pointsExpired: number;
  pointsClawed: number;
  pointsShortfall: number;
  pointsOutstanding: number;
  creditsGranted: number;
  creditsSpent: number;
  creditsExpired: number;
  creditsRevoked: number;
  creditsShortfall: number;
  creditsOutstanding: number;
  /** 지급 종류별(포인트 source_kind · 질문권 kind) 지급 합계 */
  pointsBySource: Record<string, number>;
  creditsByKind: Record<string, number>;
  /** 장부와 잔액이 어긋난 로트 수(0이어야 한다) */
  lotMismatches: number;
};

/** 질문 한 번(request_key)의 AI 원가 집계용 행 */
export type AiQuestionCostRow = { requestKey: string | null; creditSource: string | null; roomKey: string | null; estCostKrw: number | null; outcome: string; createdAt: string };

export interface BenefitRepository {
  // 설정
  getSettings(): Promise<Record<string, unknown>>;
  setSetting(input: { key: string; value: unknown; reason: string; by: string | null }): Promise<"changed" | "unchanged">;
  listSettingHistory(limit: number): Promise<SettingHistoryRecord[]>;
  listFailures(limit: number): Promise<BenefitFailureRecord[]>;

  // 포인트
  getPointBalance(userId: string): Promise<number>;
  listPointLots(userId: string): Promise<PointLotRecord[]>;
  listPointLedger(userId: string, limit: number): Promise<PointLedgerRecord[]>;
  grantPoints(input: { userId: string; amount: number; sourceKind: "admin" | "event"; sourceRef: string; opKey: string; expiresAt: string | null; meta?: Record<string, unknown> }): Promise<GrantResult>;
  spendPoints(input: { userId: string; amount: number; ref: string }): Promise<PointSpendResult>;
  restorePointSpend(input: { userId: string; ref: string }): Promise<PointRestoreResult>;

  // 질문권
  getCreditBalance(userId: string): Promise<number>;
  listCreditLots(userId: string): Promise<CreditLotRecord[]>;
  listCreditLedger(userId: string, limit: number): Promise<CreditLedgerRecord[]>;
  grantCredit(input: { userId: string; kind: "event" | "admin" | "promo"; qty: number; sourceRef: string; opKey: string; expiresAt: string | null }): Promise<GrantResult>;
  spendCredit(input: { userId: string; ref: string }): Promise<CreditSpendResult>;
  restoreCreditSpend(input: { userId: string; ref: string }): Promise<CreditRestoreResult>;

  // 쿠폰
  couponCheck(input: { code: string; userId: string; productId: string }): Promise<CouponCheck>;
  reserveCoupon(input: { code: string; userId: string; orderId: string; key: string }): Promise<ReserveCouponResult>;
  redeemCreditCoupon(input: { code: string; userId: string; key: string }): Promise<RedeemCreditCouponResult>;
  createCoupon(coupon: NewCoupon): Promise<{ ok: true; coupon: CouponRecord } | { ok: false; reason: "duplicate-code" }>;
  listCoupons(): Promise<CouponRecord[]>;
  setCouponStatus(id: string, status: CouponStatus): Promise<boolean>;
  listCouponRedemptions(couponId: string, limit: number): Promise<CouponRedemptionRecord[]>;
  listUserCouponRedemptions(userId: string, limit: number): Promise<(CouponRedemptionRecord & { code: string; name: string })[]>;

  // 0원 혜택 주문
  grantBenefitOrder(input: GrantBenefitOrderInput): Promise<GrantBenefitOrderResult>;
  releaseBenefitOrder(input: { orderId: string; mode: "restore" | "revoke"; reason: string; by: string | null }): Promise<ReleaseBenefitOrderResult>;
  getBenefitGrant(orderId: string): Promise<BenefitOrderGrantRecord | null>;
  /** 혜택 주문(최근 순) — 관리자 화면 */
  listBenefitGrants(limit: number): Promise<(BenefitOrderGrantRecord & { userId: string; orderNumber: string; orderStatus: string })[]>;

  // 친구 추천
  ensureReferralLink(input: { userId: string; token: string }): Promise<string>;
  getReferralLink(userId: string): Promise<{ token: string; deactivatedAt: string | null } | null>;
  getReferralLinkOwner(token: string): Promise<string | null>;
  logReferralVisit(input: { token: string; anonId: string }): Promise<void>;
  registerReferralSignup(input: { token: string; inviteeUserId: string; anonId: string | null }): Promise<RegisterReferralResult>;
  evaluateReferralSignup(inviteeUserId: string): Promise<EvaluateReferralResult>;
  referralDiscountStatus(inviteeUserId: string): Promise<ReferralCheck>;
  claimReferralDiscount(input: { inviteeUserId: string; orderId: string; listPriceKrw: number }): Promise<ClaimReferralResult>;
  /** 추천인 본인이 보는 요약 — 가입 수 · 상태별 수 · 보상 상태. 다른 사람의 이름 · 결과는 없다 */
  referralOverview(inviterUserId: string): Promise<{ signups: number; byStatus: Partial<Record<ReferralSignupStatus, number>>; firstPurchases: number; visits: number }>;
  listReferralSignups(filter: { status?: ReferralSignupStatus; limit: number }): Promise<ReferralSignupRecord[]>;
  decideReferralSignup(input: { inviteeUserId: string; decision: "confirm" | "reject"; reason: string; by: string | null }): Promise<DecideReferralResult>;
  revokeReferralSignup(input: { inviteeUserId: string; reason: string; by: string | null }): Promise<{ ok: boolean; reason?: string }>;
  /** 추천 링크가 있는 회원 수 · 링크 방문 수(기간) — 퍼널 */
  referralFunnelCounts(since: string): Promise<{ links: number; visits: number; signups: number; confirmed: number; review: number; firstPurchasesConfirmed: number; firstPurchasesRevoked: number }>;

  // 구매 누적(적립 등급 표시용): 그 회원의 유효 현금 결제 누적액(원)
  cumulativePaidKrw(userId: string): Promise<number>;

  // 정기 점검
  runMaintenance(): Promise<BenefitMaintenanceResult>;

  // 관리자 집계
  ledgerTotals(since: string): Promise<LedgerTotals>;
  listExpenses(limit: number): Promise<ExpenseRecord[]>;
  addExpense(input: { month: string; kind: ExpenseKind; amountKrw: number; memo: string | null; by: string | null }): Promise<void>;
  deleteExpense(id: number): Promise<void>;
  /** 채팅 질문의 AI 사용 기록(원가 측정) — request_key로 묶는다 */
  listAiQuestionCosts(since: string, limit: number): Promise<AiQuestionCostRow[]>;
}
