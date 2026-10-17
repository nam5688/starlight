// 혜택 서비스 — 설정 읽기 · MY 혜택 요약 · 결제 전 견적 · 가격 계획(할인 · 무료 제공) · 포인트 교환 · 추천 링크 · 질문권 쿠폰.
// 지급 · 차감 · 확정의 진짜 기준은 DB 함수(BenefitRepository)이고, 여기서는 소유자 확인 → 서버에서 다시 계산한 견적 → 저장소 호출 순서만 정한다.
//
// 지키는 것(운영자 결정 2026-10-17):
// - 브라우저가 보낸 금액 · 할인 종류를 믿지 않는다. 고객은 "어떤 선택지"(kind)만 고르고, 금액은 서버가 다시 만든 견적에서만 가져온다.
// - 할인은 자동으로 겹치지 않는다(조건이 되는 할인이 둘 이상이면 고객이 고른다). 요청한 할인이 적격이 아니면 사유와 정가를 보이고 고객이 확인해야 결제한다.
// - **서버 오류는 "할인 불가"가 아니다.** 확인 중 오류가 나면 error로 돌려 다시 시도하게 하고 정가 주문을 자동으로 만들지 않는다.
// - 혜택 표 · 함수가 아직 없는 DB(19~22번 전)에서는 혜택이 "준비 중"일 뿐 기존 구매 · 질문 흐름은 그대로 동작한다(ready: false).

import { buildQuote, DEFAULT_BENEFIT_SETTINGS, daysUntil, earnFor, nextTier, parseBenefitSettings, pickOption, validateSettingValue, type BenefitSettings, type CheckoutQuote, type CouponCheck, type PriceOptionKind, type ReferralCheck } from "../commerce/benefits.ts";
import { PERSONAL_REPORT, personalProductId } from "../config/product.ts";
import type { BenefitRepository, CouponRecord, CouponStatus, NewCoupon } from "./benefit-ports.ts";
import type { CheckoutPlan } from "./order-service.ts";
import type { Acquisition, MiyuRepository, OrderRecord, PaymentEnv } from "./ports.ts";
import { nextPersonalSeq, paidPersonalOrders } from "./purchases.ts";

export type BenefitDeps = { repo: MiyuRepository; benefits: BenefitRepository; now: () => Date };

const missing = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";

/** 설정 읽기. 혜택 표가 없으면(DB 19번 전) 모든 혜택이 꺼진 기본값과 ready: false */
export async function loadBenefitSettings(benefits: BenefitRepository): Promise<{ ready: boolean; settings: BenefitSettings }> {
  try {
    return { ready: true, settings: parseBenefitSettings(await benefits.getSettings()) };
  } catch (e) {
    if (missing(e)) return { ready: false, settings: DEFAULT_BENEFIT_SETTINGS };
    throw e;
  }
}

// ── MY 혜택 ───────────────────────────────────

export type PointLotView = { remaining: number; expiresAt: string | null; daysLeft: number | null; sourceLabel: string };
export type CreditLotView = { kind: string; remaining: number; expiresAt: string | null; daysLeft: number | null };
export type BenefitOverview = {
  ready: boolean;
  settings: BenefitSettings;
  points: { balance: number; lots: PointLotView[]; /** 30일 안에 소멸하는 포인트 합계와 가장 이른 소멸일 */ expiringSoon: { amount: number; expiresAt: string } | null; recent: { id: number; kind: string; amount: number; shortfall: number; createdAt: string }[] };
  credits: { balance: number; lots: CreditLotView[]; recent: { id: number; kind: string; qty: number; shortfall: number; createdAt: string }[] };
  coupons: { history: { id: string; code: string; name: string; status: string; createdAt: string }[] };
  referral: { link: { token: string } | null; overview: { signups: number; byStatus: Record<string, number>; firstPurchases: number; visits: number } | null };
  tier: { cumulativeKrw: number; rate: number; next: { fromKrw: number; rate: number; remainingKrw: number } | null };
};

export async function getBenefitOverview(deps: BenefitDeps, userId: string): Promise<BenefitOverview> {
  const { benefits, now } = deps;
  const { ready, settings } = await loadBenefitSettings(benefits);
  const empty: BenefitOverview = {
    ready,
    settings,
    points: { balance: 0, lots: [], expiringSoon: null, recent: [] },
    credits: { balance: 0, lots: [], recent: [] },
    coupons: { history: [] },
    referral: { link: null, overview: null },
    tier: { cumulativeKrw: 0, rate: 0, next: null },
  };
  if (!ready) return empty;
  const [balance, lots, ledger, cBalance, cLots, cLedger, redemptions, link, cumulative] = await Promise.all([
    benefits.getPointBalance(userId),
    benefits.listPointLots(userId),
    benefits.listPointLedger(userId, 20),
    benefits.getCreditBalance(userId),
    benefits.listCreditLots(userId),
    benefits.listCreditLedger(userId, 20),
    benefits.listUserCouponRedemptions(userId, 10),
    benefits.getReferralLink(userId),
    benefits.cumulativePaidKrw(userId),
  ]);
  const nowDate = now();
  const live = (l: { remaining: number; expiresAt: string | null; revokedAt: string | null }) => l.remaining > 0 && !l.revokedAt && (l.expiresAt === null || new Date(l.expiresAt).getTime() > nowDate.getTime());
  const pointLots = lots.filter(live).sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"));
  const soon = pointLots.filter((l) => l.expiresAt && daysUntil(l.expiresAt, nowDate)! <= 30);
  const overview = link ? await benefits.referralOverview(userId) : null;
  return {
    ready,
    settings,
    points: {
      balance,
      lots: pointLots.map((l) => ({ remaining: l.remaining, expiresAt: l.expiresAt, daysLeft: daysUntil(l.expiresAt, nowDate), sourceLabel: l.sourceKind })),
      expiringSoon: soon.length > 0 ? { amount: soon.reduce((s, l) => s + l.remaining, 0), expiresAt: soon[0].expiresAt! } : null,
      recent: ledger.map((l) => ({ id: l.id, kind: l.kind, amount: l.amount, shortfall: l.shortfall, createdAt: l.createdAt })),
    },
    credits: {
      balance: cBalance,
      lots: cLots.filter(live).sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999")).map((l) => ({ kind: l.kind, remaining: l.remaining, expiresAt: l.expiresAt, daysLeft: daysUntil(l.expiresAt, nowDate) })),
      recent: cLedger.map((l) => ({ id: l.id, kind: l.kind, qty: l.qty, shortfall: l.shortfall, createdAt: l.createdAt })),
    },
    coupons: { history: redemptions.map((r) => ({ id: r.id, code: r.code, name: r.name, status: r.status, createdAt: r.createdAt })) },
    referral: { link: link && !link.deactivatedAt ? { token: link.token } : null, overview: overview ? { ...overview, byStatus: overview.byStatus as Record<string, number> } : null },
    tier: { cumulativeKrw: cumulative, rate: earnFor(10_000, cumulative, settings.earnTiers).rate, next: nextTier(settings.earnTiers, cumulative) },
  };
}

/** 추천 링크 만들기(가입 회원 누구나 · 이미 있으면 그 링크) — 추천 기능이 꺼져 있어도 링크 자체는 받을 수 있게 두지 않는다 */
export async function createReferralLink(deps: BenefitDeps, userId: string, newToken: () => string): Promise<{ ok: true; token: string } | { ok: false; reason: "off" | "not-ready" }> {
  const { ready, settings } = await loadBenefitSettings(deps.benefits);
  if (!ready) return { ok: false, reason: "not-ready" };
  if (!settings.features.referral) return { ok: false, reason: "off" };
  const existing = await deps.benefits.getReferralLink(userId);
  if (existing && !existing.deactivatedAt) return { ok: true, token: existing.token };
  return { ok: true, token: await deps.benefits.ensureReferralLink({ userId, token: newToken() }) };
}

export type CouponCodeResult = { kind: "credited"; qty: number } | { kind: "use-at-checkout" } | { kind: "denied"; reason: string } | { kind: "off" } | { kind: "not-ready" };

/** MY에서 쿠폰 코드를 입력: 질문권 쿠폰은 바로 지급, 할인 · 무료 이용권은 결제 화면에서 쓴다고 안내한다 */
export async function redeemCouponCode(deps: BenefitDeps, input: { userId: string; code: string; key: string }): Promise<CouponCodeResult> {
  const { ready, settings } = await loadBenefitSettings(deps.benefits);
  if (!ready) return { kind: "not-ready" };
  if (!settings.features.coupons) return { kind: "off" };
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{4,32}$/.test(code)) return { kind: "denied", reason: "not-found" };
  // 질문권 쿠폰이면 지급, 아니면 결제 화면에서 쓰는 쿠폰이다
  const asCredit = await deps.benefits.couponCheck({ code, userId: input.userId, productId: "credit" });
  if (asCredit.ok && asCredit.type === "credit") {
    const r = await deps.benefits.redeemCreditCoupon({ code, userId: input.userId, key: input.key });
    return r.ok ? { kind: "credited", qty: r.qty ?? asCredit.value } : { kind: "denied", reason: r.reason };
  }
  const asReport = await deps.benefits.couponCheck({ code, userId: input.userId, productId: PERSONAL_REPORT.id });
  if (asReport.ok) return { kind: "use-at-checkout" };
  return { kind: "denied", reason: asCredit.ok ? asReport.reason : asCredit.reason === "product" ? asReport.reason : asCredit.reason };
}

// ── 추천 링크 화면 ─────────────────────────────

export type ReferralLanding =
  | { kind: "open"; priceKrw: number; listKrw: number }
  /** 추천 링크가 아니거나(예전 초대 링크일 수 있다) 추천 기능이 꺼져 있다 — 부른 쪽이 예전 초대 링크 화면으로 넘어간다 */
  | { kind: "not-referral" };

/** 링크의 무작위 토큰이 지금 쓸 수 있는 추천 링크인가 — 초대한 사람의 정보는 돌려주지 않는다 */
export async function referralLanding(benefits: BenefitRepository, token: string): Promise<ReferralLanding> {
  if (!/^[A-Za-z0-9_-]{24}$/.test(token)) return { kind: "not-referral" };
  try {
    const { ready, settings } = await loadBenefitSettings(benefits);
    if (!ready || !settings.features.referral) return { kind: "not-referral" };
    if (!(await benefits.getReferralLinkOwner(token))) return { kind: "not-referral" };
    return { kind: "open", priceKrw: settings.referral.inviteePrice, listKrw: PERSONAL_REPORT.priceKrw };
  } catch {
    return { kind: "not-referral" };
  }
}

// ── 결제 전 견적 ───────────────────────────────

export type QuoteInput = { userId: string; assessmentId: string; couponCode?: string | null; again?: boolean };
export type QuoteResult =
  | { kind: "quote"; productId: string; quote: CheckoutQuote; couponCode: string | null; pointBalance: number | null; settings: BenefitSettings }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

/** 이 결과에서 받을 상품 번호(첫 구매 · 다시 받기) */
async function productFor(deps: BenefitDeps, assessmentId: string, again: boolean): Promise<string> {
  const orders = await deps.repo.listOrdersForAssessment(assessmentId);
  const received = paidPersonalOrders(orders);
  return personalProductId(received.length > 0 && again ? nextPersonalSeq(orders) : received.length > 0 ? nextPersonalSeq(orders) : 1);
}

/**
 * 견적: 정가 · 적격 할인 선택지 · 거절된 요청과 사유. 서버가 매번 다시 만들며 화면의 선택(kind)은 이 견적에 있을 때만 받아들인다.
 * 확인 중 서버 오류가 나면 "할인 불가"로 바꾸지 않고 error로 돌려준다.
 */
export async function quoteForCheckout(deps: BenefitDeps, input: QuoteInput): Promise<QuoteResult> {
  const assessment = await deps.repo.getAssessment(input.assessmentId);
  if (!assessment || assessment.userId !== input.userId) return { kind: "not-found" };
  const listKrw = PERSONAL_REPORT.priceKrw;
  try {
    const { ready, settings } = await loadBenefitSettings(deps.benefits);
    const productId = await productFor(deps, input.assessmentId, Boolean(input.again));
    if (!ready) return { kind: "quote", productId, quote: buildQuote({ listKrw, referral: null, coupon: null, points: null }), couponCode: null, pointBalance: null, settings };

    let referral: ReferralCheck | null = null;
    if (settings.features.referral && productId === PERSONAL_REPORT.id) {
      const r = await deps.benefits.referralDiscountStatus(input.userId);
      // 추천 링크로 가입한 적이 없거나 기능이 꺼져 있으면 요청하지 않은 것으로 본다(일반 회원에게 거절 사유를 보이지 않는다)
      referral = !r.ok && (r.reason === "no-signup" || r.reason === "feature-off") ? null : r;
    }
    let coupon: { code: string; check: CouponCheck } | null = null;
    const code = input.couponCode?.trim().toUpperCase() ?? "";
    if (code) coupon = { code, check: settings.features.coupons ? await deps.benefits.couponCheck({ code, userId: input.userId, productId }) : { ok: false, reason: "feature-off" } };
    let points: { price: number; balance: number } | null = null;
    let pointBalance: number | null = null;
    if (settings.features.points_spend) {
      const key = /:r\d+$/.test(productId) ? PERSONAL_REPORT.id : productId;
      const price = settings.pointPrices[key];
      pointBalance = await deps.benefits.getPointBalance(input.userId);
      if (price) points = { price, balance: pointBalance };
    }
    return { kind: "quote", productId, quote: buildQuote({ listKrw, referral, coupon, points }), couponCode: coupon?.code ?? null, pointBalance, settings };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message.slice(0, 120) : "견적을 만들지 못했습니다." };
  }
}

export type PlanChoice = { kind: PriceOptionKind; couponCode?: string | null; confirmListPrice?: boolean };
export type PlanResult =
  | { kind: "plan"; plan: CheckoutPlan }
  /** 요청한 할인이 적격이 아니다 — 고객이 사유 · 정가를 보고 확인(confirmListPrice)해야 결제로 간다 */
  | { kind: "needs-confirmation"; quote: CheckoutQuote }
  /** 적격 할인이 둘 이상인데 고르지 않았다 */
  | { kind: "needs-choice"; quote: CheckoutQuote }
  | { kind: "invalid-choice"; quote: CheckoutQuote }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

/** 고객의 선택 → 서버가 다시 만든 견적에서 가격 계획을 만든다 */
export async function planCheckout(deps: BenefitDeps, input: QuoteInput & { choice: PlanChoice; newOrderNumber?: (now: Date) => string }): Promise<PlanResult> {
  // 화면이 코드를 선택지에만 담아 보내도 견적이 같은 코드로 만들어지게 한다(견적과 선택이 어긋나 "invalid-choice"가 되는 일을 막는다)
  const q = await quoteForCheckout(deps, { ...input, couponCode: input.couponCode ?? input.choice.couponCode ?? null });
  if (q.kind !== "quote") return q;
  const { quote } = q;
  const choice = input.choice;
  const code = q.couponCode ?? null;

  if (choice.kind === "list") {
    // 요청한 할인이 거절됐거나, 쓸 수 있는 할인이 있는데 정가를 고른 것은 고객이 확인한 경우에만 정가로 간다
    if ((quote.denied.length > 0 || quote.needsChoice) && !choice.confirmListPrice) return quote.needsChoice ? { kind: "needs-choice", quote } : { kind: "needs-confirmation", quote };
    return { kind: "plan", plan: { mode: "pay", amountKrw: quote.listKrw, listKrw: quote.listKrw, discountKind: null, discountRef: null } };
  }
  const option = pickOption(quote, choice.kind);
  if (!option) return { kind: "invalid-choice", quote };

  const { benefits } = deps;
  const user = input.userId;
  const useReferral = option.kind === "referral" || option.kind === "referral+coupon";
  const useCoupon = option.kind === "coupon" || option.kind === "referral+coupon";

  if (option.kind === "points") {
    return {
      kind: "plan",
      plan: {
        mode: "free",
        listKrw: quote.listKrw,
        grant: async (product, orderNumber, env) => {
          const r = await benefits.grantBenefitOrder({ userId: user, assessmentId: input.assessmentId, productId: product, kind: "points", pointPrice: option.points ?? 0, listPriceKrw: quote.listKrw, orderNumber, paymentEnv: env });
          return r.ok ? { ok: true } : { ok: false, reason: r.reason };
        },
      },
    };
  }
  if (option.free) {
    // 100% 쿠폰 · 무료 이용권(추천 가격 + 쿠폰이 0원이 되는 경우 포함)은 PG 없이 서버가 검증한 무료 주문으로 처리한다
    if (!useCoupon || !code) return { kind: "invalid-choice", quote };
    return {
      kind: "plan",
      plan: {
        mode: "free",
        listKrw: quote.listKrw,
        grant: async (product, orderNumber, env) => {
          const r = await benefits.grantBenefitOrder({ userId: user, assessmentId: input.assessmentId, productId: product, kind: "coupon", couponCode: code, listPriceKrw: quote.listKrw, orderNumber, paymentEnv: env });
          return r.ok ? { ok: true } : { ok: false, reason: r.reason };
        },
      },
    };
  }
  return {
    kind: "plan",
    plan: {
      mode: "pay",
      amountKrw: option.amountKrw,
      listKrw: quote.listKrw,
      discountKind: useReferral ? "referral" : "coupon",
      discountRef: useCoupon ? code : "referral",
      claim: async (order: OrderRecord) => {
        if (useReferral) {
          const r = await benefits.claimReferralDiscount({ inviteeUserId: user, orderId: order.id, listPriceKrw: quote.listKrw });
          if (!r.ok) return { ok: false, reason: r.reason };
        }
        if (useCoupon && code) {
          const r = await benefits.reserveCoupon({ code, userId: user, orderId: order.id, key: `coupon-order:${order.id}` });
          if (!r.ok) return { ok: false, reason: r.reason };
        }
        return { ok: true };
      },
    },
  };
}

/** 결제 환경 · 유입 출처와 함께 주문을 시작할 때 쓰는 입력 (서버 동작이 채운다) */
export type BenefitCheckoutInput = QuoteInput & { choice: PlanChoice; paymentEnv: PaymentEnv; acquisition: Acquisition | null };

// ── 관리자: 설정 · 쿠폰 · 추천 ─────────────────────

export async function changeBenefitSetting(deps: BenefitDeps, input: { key: string; value: unknown; reason: string; by: string }): Promise<{ ok: true; changed: boolean } | { ok: false; message: string }> {
  if (!input.reason.trim()) return { ok: false, message: "변경 사유를 적어 주세요." };
  const check = validateSettingValue(input.key, input.value);
  if (!check.ok) return { ok: false, message: check.message };
  try {
    const r = await deps.benefits.setSetting({ key: input.key, value: check.value, reason: input.reason.trim(), by: input.by });
    return { ok: true, changed: r === "changed" };
  } catch (e) {
    if (missing(e)) return { ok: false, message: "DB 변경 19번이 필요합니다." };
    throw e;
  }
}

const COUPON_TYPES = ["amount", "percent", "free-product", "free-report-entitlement", "credit"] as const;

export type CouponDraft = {
  code: string;
  name: string;
  description?: string | null;
  type: string;
  value: number;
  perUserLimit?: number;
  issueLimit?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  purpose?: string;
  targetUserId?: string | null;
  reviewRewardEligible?: boolean;
  stackableWithReferral?: boolean;
  creditExpireDays?: number | null;
};

/** 쿠폰 만들기 입력 확인(DB 제약과 같은 규칙을 먼저 안내한다) */
export function validateCouponDraft(d: CouponDraft): { ok: true; coupon: NewCoupon } | { ok: false; message: string } {
  const code = d.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{4,32}$/.test(code)) return { ok: false, message: "코드는 영문 대문자 · 숫자 · - · _ 로 4~32자여야 합니다." };
  if (!d.name.trim() || d.name.length > 60) return { ok: false, message: "이름은 1~60자여야 합니다." };
  if (!COUPON_TYPES.includes(d.type as (typeof COUPON_TYPES)[number])) return { ok: false, message: "쿠폰 종류가 올바르지 않습니다." };
  if (!Number.isInteger(d.value) || d.value < 0) return { ok: false, message: "값은 0 이상의 정수여야 합니다." };
  if (d.type === "percent" && (d.value < 1 || d.value > 100)) return { ok: false, message: "정률 쿠폰은 1~100%여야 합니다." };
  if (d.type === "amount" && d.value < 1) return { ok: false, message: "정액 쿠폰은 1원 이상이어야 합니다." };
  if (d.type === "credit" && d.value < 1) return { ok: false, message: "질문권 쿠폰은 1개 이상이어야 합니다." };
  if ((d.type === "free-product" || d.type === "free-report-entitlement") && d.value !== 0) return { ok: false, message: "무료 이용권의 값은 0이어야 합니다." };
  const per = d.perUserLimit ?? 1;
  if (!Number.isInteger(per) || per < 1) return { ok: false, message: "계정별 횟수는 1 이상이어야 합니다." };
  if (d.issueLimit !== null && d.issueLimit !== undefined && (!Number.isInteger(d.issueLimit) || d.issueLimit < 1)) return { ok: false, message: "전체 한도는 1 이상이거나 비워 두세요." };
  if (d.startsAt && d.endsAt && new Date(d.endsAt).getTime() <= new Date(d.startsAt).getTime()) return { ok: false, message: "종료 시각은 시작 시각보다 뒤여야 합니다." };
  const purpose = d.purpose ?? "promo";
  if (!["promo", "trial", "cs", "event"].includes(purpose)) return { ok: false, message: "쓰임이 올바르지 않습니다." };
  return {
    ok: true,
    coupon: {
      code,
      name: d.name.trim(),
      description: d.description?.trim() || null,
      type: d.type as NewCoupon["type"],
      value: d.value,
      productIds: [],
      targetUserId: d.targetUserId || null,
      perUserLimit: per,
      issueLimit: d.issueLimit ?? null,
      startsAt: d.startsAt || null,
      endsAt: d.endsAt || null,
      purpose: purpose as NewCoupon["purpose"],
      reviewRewardEligible: Boolean(d.reviewRewardEligible),
      stackableWithReferral: Boolean(d.stackableWithReferral),
      creditExpireDays: d.creditExpireDays ?? null,
      createdBy: null,
    },
  };
}

export async function createCouponByAdmin(deps: BenefitDeps, draft: CouponDraft, by: string): Promise<{ ok: true; coupon: CouponRecord } | { ok: false; message: string }> {
  const v = validateCouponDraft(draft);
  if (!v.ok) return v;
  const r = await deps.benefits.createCoupon({ ...v.coupon, createdBy: by });
  return r.ok ? r : { ok: false, message: "같은 코드의 쿠폰이 이미 있습니다." };
}

export async function setCouponStatusByAdmin(deps: BenefitDeps, id: string, status: CouponStatus): Promise<boolean> {
  return deps.benefits.setCouponStatus(id, status);
}
