// 혜택(포인트 · 질문권 · 쿠폰 · 0원 혜택 주문 · 친구 추천 · 설정 · 비용 입력) Supabase 저장소 — BenefitRepository 구현.
// 서버 비밀키 클라이언트로만 쓴다(브라우저 권한으로는 이 표 · 함수에 접근할 수 없다). 서비스가 소유자를 확인한 뒤에만 부른다.
// DB 변경 19~22번이 없으면(표 · 함수 없음) 코드 42P01로 통일해 던진다 — 호출한 쪽이 "혜택 준비 중"으로 다루고 기존 화면은 그대로 동작한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CouponCheck, ReferralCheck } from "../../commerce/benefits.ts";
import type {
  AiQuestionCostRow,
  BenefitFailureRecord,
  BenefitMaintenanceResult,
  BenefitOrderGrantRecord,
  BenefitRepository,
  ClaimReferralResult,
  CouponRecord,
  CouponRedemptionRecord,
  CreditLedgerRecord,
  CreditLotRecord,
  CreditRestoreResult,
  CreditSpendResult,
  DecideReferralResult,
  EvaluateReferralResult,
  ExpenseRecord,
  GrantBenefitOrderResult,
  GrantResult,
  LedgerTotals,
  PointLedgerRecord,
  PointLotRecord,
  PointRestoreResult,
  PointSpendResult,
  RedeemCreditCouponResult,
  ReferralFirstPurchaseStatus,
  ReferralSignupRecord,
  ReferralSignupStatus,
  RegisterReferralResult,
  ReleaseBenefitOrderResult,
  ReserveCouponResult,
  SettingHistoryRecord,
} from "../../services/benefit-ports.ts";

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };

const MISSING = new Set(["PGRST202", "42883", "PGRST205", "42P01"]);

function fail(context: string, error: DbError, status?: number): never {
  const missing = (error.code && MISSING.has(error.code)) || (status === 404 && !error.code);
  const e = new Error(`${context}: ${missing ? "혜택 표 · 함수가 없습니다 (DB 변경 19~22번 필요)" : error.message}`) as Error & { code?: string };
  e.code = missing ? "42P01" : error.code;
  throw e;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const nstr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const int = (v: unknown): number => Number(v ?? 0) || 0;

function toPointLot(r: Row): PointLotRecord {
  return { id: str(r.id), amount: int(r.amount), remaining: int(r.remaining), expiresAt: nstr(r.expires_at), sourceKind: str(r.source_kind), sourceRef: nstr(r.source_ref), revokedAt: nstr(r.revoked_at), createdAt: str(r.created_at) };
}
function toCreditLot(r: Row): CreditLotRecord {
  return { id: str(r.id), kind: str(r.kind), quantity: int(r.quantity), remaining: int(r.remaining), expiresAt: nstr(r.expires_at), sourceRef: nstr(r.source_ref), revokedAt: nstr(r.revoked_at), createdAt: str(r.created_at) };
}
function toCoupon(r: Row, activeCount = 0, usedCount = 0): CouponRecord {
  return {
    id: str(r.id),
    code: str(r.code),
    name: str(r.name),
    description: nstr(r.description),
    type: r.type as CouponRecord["type"],
    value: int(r.value),
    productIds: Array.isArray(r.product_ids) ? (r.product_ids as string[]) : [],
    targetUserId: nstr(r.target_user_id),
    perUserLimit: int(r.per_user_limit) || 1,
    issueLimit: r.issue_limit === null || r.issue_limit === undefined ? null : int(r.issue_limit),
    startsAt: nstr(r.starts_at),
    endsAt: nstr(r.ends_at),
    purpose: r.purpose as CouponRecord["purpose"],
    reviewRewardEligible: Boolean(r.review_reward_eligible),
    stackableWithReferral: Boolean(r.stackable_with_referral),
    creditExpireDays: r.credit_expire_days === null || r.credit_expire_days === undefined ? null : int(r.credit_expire_days),
    status: r.status as CouponRecord["status"],
    createdAt: str(r.created_at),
    activeCount,
    usedCount,
  };
}
function toRedemption(r: Row): CouponRedemptionRecord {
  return { id: str(r.id), couponId: str(r.coupon_id), userId: str(r.user_id), orderId: nstr(r.order_id), status: r.status as CouponRedemptionRecord["status"], createdAt: str(r.created_at) };
}
function toGrant(r: Row): BenefitOrderGrantRecord {
  return {
    orderId: str(r.order_id),
    kind: r.kind as BenefitOrderGrantRecord["kind"],
    ref: nstr(r.ref),
    pointSpent: int(r.point_spent),
    couponRedemptionId: nstr(r.coupon_redemption_id),
    reviewRewardEligible: Boolean(r.review_reward_eligible),
    grantedBy: nstr(r.granted_by),
    reason: nstr(r.reason),
    releasedAt: nstr(r.released_at),
    releaseMode: (r.release_mode as "restore" | "revoke" | null) ?? null,
    releaseReason: nstr(r.release_reason),
    createdAt: str(r.created_at),
  };
}

export function createSupabaseBenefitRepository(db: SupabaseClient): BenefitRepository {
  async function rpc<T = Row>(context: string, fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error, status } = await db.rpc(fn, args);
    if (error) fail(context, error, status);
    return data as T;
  }

  /** 한 사용자의 질문(PostgREST 한 번에 최대 1,000행) — 집계는 가져온 만큼만 센다 */
  const PAGE = 1000;

  return {
    // ── 설정 ──
    async getSettings() {
      const { data, error, status } = await db.from("benefit_settings").select("key, value");
      if (error) fail("혜택 설정 조회", error, status);
      return Object.fromEntries((data ?? []).map((r) => [str(r.key), r.value]));
    },
    async setSetting({ key, value, reason, by }) {
      const r = await rpc<{ status: string }>("혜택 설정 저장", "set_benefit_setting", { p_key: key, p_value: value, p_reason: reason, p_by: by });
      return r.status === "unchanged" ? "unchanged" : "changed";
    },
    async listSettingHistory(limit) {
      const { data, error, status } = await db.from("benefit_settings_history").select().order("id", { ascending: false }).limit(limit);
      if (error) fail("혜택 설정 이력 조회", error, status);
      return (data ?? []).map((r): SettingHistoryRecord => ({ id: int(r.id), key: str(r.key), oldValue: r.old_value, newValue: r.new_value, changedBy: nstr(r.changed_by), reason: str(r.reason), changedAt: str(r.changed_at) }));
    },
    async listFailures(limit) {
      const { data, error, status } = await db.from("benefit_failures").select().is("resolved_at", null).order("id", { ascending: false }).limit(limit);
      if (error) fail("혜택 오류 기록 조회", error, status);
      return (data ?? []).map((r): BenefitFailureRecord => ({ id: int(r.id), kind: str(r.kind), ref: nstr(r.ref), message: str(r.message), createdAt: str(r.created_at) }));
    },

    // ── 포인트 ──
    async getPointBalance(userId) {
      return int(await rpc<number>("포인트 잔액 조회", "point_balance", { p_user: userId }));
    },
    async listPointLots(userId) {
      const { data, error, status } = await db.from("point_lots").select().eq("user_id", userId).order("created_at", { ascending: false }).limit(200);
      if (error) fail("포인트 로트 조회", error, status);
      return (data ?? []).map(toPointLot);
    },
    async listPointLedger(userId, limit) {
      const { data, error, status } = await db.from("point_ledger").select("id, kind, amount, lot_id, order_id, shortfall, created_at").eq("user_id", userId).order("id", { ascending: false }).limit(limit);
      if (error) fail("포인트 내역 조회", error, status);
      return (data ?? []).map((r): PointLedgerRecord => ({ id: int(r.id), kind: str(r.kind), amount: int(r.amount), lotId: nstr(r.lot_id), orderId: nstr(r.order_id), shortfall: int(r.shortfall), createdAt: str(r.created_at) }));
    },
    async grantPoints({ userId, amount, sourceKind, sourceRef, opKey, expiresAt, meta }) {
      return rpc<GrantResult>("포인트 지급", "grant_points", { p_user: userId, p_amount: amount, p_source_kind: sourceKind, p_source_ref: sourceRef, p_op_key: opKey, p_expires_at: expiresAt, p_order: null, p_meta: meta ?? {} });
    },
    async spendPoints({ userId, amount, ref }) {
      return rpc<PointSpendResult>("포인트 사용", "spend_points", { p_user: userId, p_amount: amount, p_ref: ref });
    },
    async restorePointSpend({ userId, ref }) {
      return rpc<PointRestoreResult>("포인트 사용 되돌림", "restore_points_spend", { p_user: userId, p_ref: ref });
    },

    // ── 질문권 ──
    async getCreditBalance(userId) {
      return int(await rpc<number>("질문권 잔액 조회", "credit_balance", { p_user: userId }));
    },
    async listCreditLots(userId) {
      const { data, error, status } = await db.from("credit_lots").select().eq("user_id", userId).order("created_at", { ascending: false }).limit(200);
      if (error) fail("질문권 로트 조회", error, status);
      return (data ?? []).map(toCreditLot);
    },
    async listCreditLedger(userId, limit) {
      const { data, error, status } = await db.from("credit_ledger").select("id, kind, qty, lot_id, shortfall, created_at").eq("user_id", userId).order("id", { ascending: false }).limit(limit);
      if (error) fail("질문권 내역 조회", error, status);
      return (data ?? []).map((r): CreditLedgerRecord => ({ id: int(r.id), kind: str(r.kind), qty: int(r.qty), lotId: str(r.lot_id), shortfall: int(r.shortfall), createdAt: str(r.created_at) }));
    },
    async grantCredit({ userId, kind, qty, sourceRef, opKey, expiresAt }) {
      return rpc<GrantResult>("질문권 지급", "grant_credit", { p_user: userId, p_kind: kind, p_qty: qty, p_source_ref: sourceRef, p_op_key: opKey, p_expires_at: expiresAt });
    },
    async spendCredit({ userId, ref }) {
      return rpc<CreditSpendResult>("질문권 사용", "spend_credit", { p_user: userId, p_ref: ref });
    },
    async restoreCreditSpend({ userId, ref }) {
      return rpc<CreditRestoreResult>("질문권 사용 되돌림", "restore_credit_spend", { p_user: userId, p_ref: ref });
    },

    // ── 쿠폰 ──
    async couponCheck({ code, userId, productId }) {
      return rpc<CouponCheck>("쿠폰 확인", "coupon_check", { p_code: code, p_user: userId, p_product: productId });
    },
    async reserveCoupon({ code, userId, orderId, key }) {
      return rpc<ReserveCouponResult>("쿠폰 예약", "reserve_coupon", { p_code: code, p_user: userId, p_order: orderId, p_key: key });
    },
    async redeemCreditCoupon({ code, userId, key }) {
      return rpc<RedeemCreditCouponResult>("질문권 쿠폰 사용", "redeem_credit_coupon", { p_code: code, p_user: userId, p_key: key });
    },
    async createCoupon(c) {
      const { data, error, status } = await db
        .from("coupons")
        .insert({
          code: c.code,
          name: c.name,
          description: c.description,
          type: c.type,
          value: c.value,
          product_ids: c.productIds,
          target_user_id: c.targetUserId,
          per_user_limit: c.perUserLimit,
          issue_limit: c.issueLimit,
          starts_at: c.startsAt,
          ends_at: c.endsAt,
          purpose: c.purpose,
          review_reward_eligible: c.reviewRewardEligible,
          stackable_with_referral: c.stackableWithReferral,
          credit_expire_days: c.creditExpireDays,
          status: c.status ?? "draft",
          created_by: c.createdBy,
        })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return { ok: false, reason: "duplicate-code" };
        fail("쿠폰 만들기", error, status);
      }
      return { ok: true, coupon: toCoupon(data as Row) };
    },
    async listCoupons() {
      const { data, error, status } = await db.from("coupons").select().order("created_at", { ascending: false }).limit(200);
      if (error) fail("쿠폰 목록 조회", error, status);
      const rows = (data ?? []) as Row[];
      if (rows.length === 0) return [];
      const { data: reds, error: rerr, status: rstatus } = await db.from("coupon_redemptions").select("coupon_id, status").in("coupon_id", rows.map((r) => str(r.id))).limit(PAGE * 5);
      if (rerr) fail("쿠폰 사용 수 조회", rerr, rstatus);
      const active = new Map<string, number>();
      const used = new Map<string, number>();
      for (const r of reds ?? []) {
        const id = str(r.coupon_id);
        if (r.status === "reserved" || r.status === "used") active.set(id, (active.get(id) ?? 0) + 1);
        if (r.status === "used") used.set(id, (used.get(id) ?? 0) + 1);
      }
      return rows.map((r) => toCoupon(r, active.get(str(r.id)) ?? 0, used.get(str(r.id)) ?? 0));
    },
    async setCouponStatus(id, status) {
      const { data, error, status: s } = await db.from("coupons").update({ status }).eq("id", id).select("id");
      if (error) fail("쿠폰 상태 변경", error, s);
      return (data ?? []).length > 0;
    },
    async listCouponRedemptions(couponId, limit) {
      const { data, error, status } = await db.from("coupon_redemptions").select().eq("coupon_id", couponId).order("created_at", { ascending: false }).limit(limit);
      if (error) fail("쿠폰 사용 내역 조회", error, status);
      return (data ?? []).map(toRedemption);
    },
    async listUserCouponRedemptions(userId, limit) {
      const { data, error, status } = await db.from("coupon_redemptions").select("*, coupons(code, name)").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
      if (error) fail("내 쿠폰 사용 내역 조회", error, status);
      return (data ?? []).map((r) => {
        const c = (Array.isArray(r.coupons) ? r.coupons[0] : r.coupons) as Row | null;
        return { ...toRedemption(r as Row), code: str(c?.code), name: str(c?.name) };
      });
    },

    // ── 0원 혜택 주문 ──
    async grantBenefitOrder(i) {
      return rpc<GrantBenefitOrderResult>("혜택 주문 만들기", "grant_benefit_order", {
        p_user: i.userId,
        p_assessment: i.assessmentId,
        p_product: i.productId,
        p_kind: i.kind,
        p_coupon_code: i.couponCode ?? null,
        p_point_price: i.pointPrice ?? null,
        p_list_price: i.listPriceKrw,
        p_order_number: i.orderNumber,
        p_payment_env: i.paymentEnv,
        p_granted_by: i.grantedBy ?? null,
        p_reason: i.reason ?? null,
      });
    },
    async releaseBenefitOrder({ orderId, mode, reason, by }) {
      return rpc<ReleaseBenefitOrderResult>("혜택 주문 회수", "release_benefit_order", { p_order: orderId, p_mode: mode, p_reason: reason, p_by: by });
    },
    async getBenefitGrant(orderId) {
      const { data, error, status } = await db.from("benefit_order_grants").select().eq("order_id", orderId).maybeSingle();
      if (error) fail("혜택 주문 조회", error, status);
      return data ? toGrant(data as Row) : null;
    },
    async listBenefitGrants(limit) {
      const { data, error, status } = await db.from("benefit_order_grants").select("*, orders!inner(user_id, order_number, status)").order("created_at", { ascending: false }).limit(limit);
      if (error) fail("혜택 주문 목록 조회", error, status);
      return (data ?? []).map((r) => {
        const o = (Array.isArray(r.orders) ? r.orders[0] : r.orders) as Row;
        return { ...toGrant(r as Row), userId: str(o.user_id), orderNumber: str(o.order_number), orderStatus: str(o.status) };
      });
    },

    // ── 친구 추천 ──
    async ensureReferralLink({ userId, token }) {
      return str(await rpc<string>("추천 링크 만들기", "ensure_referral_link", { p_user: userId, p_token: token }));
    },
    async getReferralLink(userId) {
      const { data, error, status } = await db.from("referral_links").select("token, deactivated_at").eq("user_id", userId).maybeSingle();
      if (error) fail("추천 링크 조회", error, status);
      return data ? { token: str(data.token), deactivatedAt: nstr(data.deactivated_at) } : null;
    },
    async getReferralLinkOwner(token) {
      const { data, error, status } = await db.from("referral_links").select("user_id, deactivated_at").eq("token", token).maybeSingle();
      if (error) fail("추천 링크 조회", error, status);
      return data && !data.deactivated_at ? str(data.user_id) : null;
    },
    async logReferralVisit({ token, anonId }) {
      await rpc("추천 링크 방문 기록", "log_referral_visit", { p_token: token, p_anon: anonId });
    },
    async registerReferralSignup({ token, inviteeUserId, anonId }) {
      return rpc<RegisterReferralResult>("추천 가입 기록", "register_referral_signup", { p_token: token, p_invitee: inviteeUserId, p_anon: anonId });
    },
    async evaluateReferralSignup(inviteeUserId) {
      return rpc<EvaluateReferralResult>("추천 가입 확인", "evaluate_referral_signup", { p_invitee: inviteeUserId });
    },
    async referralDiscountStatus(inviteeUserId) {
      return rpc<ReferralCheck>("추천 가격 확인", "referral_discount_status", { p_invitee: inviteeUserId });
    },
    async claimReferralDiscount({ inviteeUserId, orderId, listPriceKrw }) {
      return rpc<ClaimReferralResult>("추천 가격 확정", "claim_referral_discount", { p_invitee: inviteeUserId, p_order: orderId, p_list_price: listPriceKrw });
    },
    async referralOverview(inviterUserId) {
      const { data, error, status } = await db.from("referral_signups").select("status, referral_first_purchases(status)").eq("inviter_user_id", inviterUserId).limit(PAGE);
      if (error) fail("추천 현황 조회", error, status);
      const byStatus: Partial<Record<ReferralSignupStatus, number>> = {};
      let firstPurchases = 0;
      for (const r of data ?? []) {
        const s = r.status as ReferralSignupStatus;
        byStatus[s] = (byStatus[s] ?? 0) + 1;
        const fp = (Array.isArray(r.referral_first_purchases) ? r.referral_first_purchases[0] : r.referral_first_purchases) as Row | null | undefined;
        if (fp && (fp.status === "confirmed" || fp.status === "held")) firstPurchases += 1;
      }
      const link = await db.from("referral_links").select("token").eq("user_id", inviterUserId).maybeSingle();
      let visits = 0;
      if (link.data?.token) {
        const v = await db.from("referral_visits").select("id", { count: "exact", head: true }).eq("token", link.data.token as string);
        if (!v.error) visits = v.count ?? 0;
      }
      return { signups: (data ?? []).length, byStatus, firstPurchases, visits };
    },
    async listReferralSignups({ status, limit }) {
      let q = db.from("referral_signups").select("invitee_user_id, inviter_user_id, status, risk, signed_up_at, hold_until, decided_at, decision_reason, referral_first_purchases(status)").order("signed_up_at", { ascending: false }).limit(limit);
      if (status) q = q.eq("status", status);
      const { data, error, status: s } = await q;
      if (error) fail("추천 가입 목록 조회", error, s);
      return (data ?? []).map((r): ReferralSignupRecord => {
        const fp = (Array.isArray(r.referral_first_purchases) ? r.referral_first_purchases[0] : r.referral_first_purchases) as Row | null | undefined;
        return {
          inviteeUserId: str(r.invitee_user_id),
          inviterUserId: str(r.inviter_user_id),
          status: r.status as ReferralSignupStatus,
          risk: Array.isArray(r.risk) ? (r.risk as string[]) : [],
          signedUpAt: str(r.signed_up_at),
          holdUntil: str(r.hold_until),
          decidedAt: nstr(r.decided_at),
          decisionReason: nstr(r.decision_reason),
          firstPurchase: fp ? (fp.status as ReferralFirstPurchaseStatus) : null,
        };
      });
    },
    async decideReferralSignup({ inviteeUserId, decision, reason, by }) {
      return rpc<DecideReferralResult>("추천 가입 결정", "admin_decide_referral_signup", { p_invitee: inviteeUserId, p_decision: decision, p_reason: reason, p_admin: by });
    },
    async revokeReferralSignup({ inviteeUserId, reason, by }) {
      const r = await rpc<{ ok: boolean; reason?: string }>("추천 가입 회수", "revoke_referral_signup", { p_invitee: inviteeUserId, p_reason: reason, p_admin: by });
      return { ok: Boolean(r.ok), ...(r.reason ? { reason: r.reason } : {}) };
    },
    async referralFunnelCounts(since) {
      const count = async (table: string, build: (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => unknown) => {
        const base = db.from(table).select("*", { count: "exact", head: true });
        const q = build(base) as PromiseLike<{ count: number | null; error: DbError | null; status?: number }>;
        const { count: c, error, status } = await q;
        if (error) fail(`${table} 집계`, error, status);
        return c ?? 0;
      };
      const [links, visits, signups, confirmed, review, fpConfirmed, fpRevoked] = await Promise.all([
        count("referral_links", (q) => q.gte("created_at", since)),
        count("referral_visits", (q) => q.gte("created_at", since)),
        count("referral_signups", (q) => q.gte("signed_up_at", since)),
        count("referral_signups", (q) => q.gte("signed_up_at", since).eq("status", "confirmed")),
        count("referral_signups", (q) => q.gte("signed_up_at", since).eq("status", "review")),
        count("referral_first_purchases", (q) => q.gte("created_at", since).in("status", ["confirmed", "held"])),
        count("referral_first_purchases", (q) => q.gte("created_at", since).eq("status", "revoked")),
      ]);
      return { links, visits, signups, confirmed, review, firstPurchasesConfirmed: fpConfirmed, firstPurchasesRevoked: fpRevoked };
    },

    async cumulativePaidKrw(userId) {
      const { data, error, status } = await db.from("orders").select("amount").eq("user_id", userId).eq("status", "paid").eq("provider", "tosspayments").limit(PAGE);
      if (error) fail("누적 결제액 조회", error, status);
      const total = (data ?? []).reduce((s, r) => s + int(r.amount), 0);
      const packs = await db.from("question_packs").select("refunded_krw").eq("user_id", userId).limit(PAGE);
      const refunded = packs.error ? 0 : (packs.data ?? []).reduce((s, r) => s + int(r.refunded_krw), 0);
      return Math.max(0, total - refunded);
    },

    // ── 정기 점검 ──
    async runMaintenance(): Promise<BenefitMaintenanceResult> {
      const a = await rpc<Row>("포인트 · 질문권 점검", "reconcile_points_credits", {});
      const b = await rpc<Row>("추천 점검", "reconcile_referrals", {});
      const p = await rpc<Row>("탈퇴 회원 장부 정리", "purge_withdrawn_benefit_ledgers", {});
      return {
        expiredPointLots: int(a.expiredPointLots),
        expiredCreditLots: int(a.expiredCreditLots),
        earnedBackfill: int(a.earnedBackfill),
        partialRefundAdjusted: int(a.partialRefundAdjusted),
        referralEvaluated: int(b.evaluated),
        referralConfirmed: int(b.confirmedSignups),
        referralPurchaseRewards: int(b.purchaseRewards),
        visitsPurged: int(b.visitsPurged),
        purge: str(p.status),
      };
    },

    // ── 관리자 집계 ──
    async ledgerTotals(since): Promise<LedgerTotals> {
      const pl = await db.from("point_ledger").select("kind, amount, shortfall, lot_id").gte("created_at", since).limit(PAGE * 20);
      if (pl.error) fail("포인트 장부 집계", pl.error, pl.status);
      const cl = await db.from("credit_ledger").select("kind, qty, shortfall").gte("created_at", since).limit(PAGE * 20);
      if (cl.error) fail("질문권 장부 집계", cl.error, cl.status);
      const lots = await db.from("point_lots").select("id, amount, remaining, expires_at, source_kind").limit(PAGE * 20);
      if (lots.error) fail("포인트 로트 집계", lots.error, lots.status);
      const clots = await db.from("credit_lots").select("quantity, remaining, expires_at, kind").limit(PAGE * 20);
      if (clots.error) fail("질문권 로트 집계", clots.error, clots.status);
      const t: LedgerTotals = { pointsEarned: 0, pointsSpent: 0, pointsExpired: 0, pointsClawed: 0, pointsShortfall: 0, pointsOutstanding: 0, creditsGranted: 0, creditsSpent: 0, creditsExpired: 0, creditsRevoked: 0, creditsShortfall: 0, creditsOutstanding: 0, pointsBySource: {}, creditsByKind: {}, lotMismatches: 0 };
      for (const r of pl.data ?? []) {
        const a = int(r.amount);
        if (r.kind === "earn") t.pointsEarned += a;
        else if (r.kind === "spend") t.pointsSpent += -a;
        else if (r.kind === "spend_restore") t.pointsSpent -= a;
        else if (r.kind === "expire") t.pointsExpired += -a;
        else if (r.kind === "clawback") t.pointsClawed += -a;
        t.pointsShortfall += int(r.shortfall);
      }
      for (const r of cl.data ?? []) {
        const q = int(r.qty);
        if (r.kind === "grant") t.creditsGranted += q;
        else if (r.kind === "spend") t.creditsSpent += -q;
        else if (r.kind === "restore") t.creditsSpent -= q;
        else if (r.kind === "expire") t.creditsExpired += -q;
        else if (r.kind === "revoke") t.creditsRevoked += -q;
        t.creditsShortfall += int(r.shortfall);
      }
      const now = Date.now();
      for (const r of lots.data ?? []) {
        t.pointsBySource[str(r.source_kind)] = (t.pointsBySource[str(r.source_kind)] ?? 0) + int(r.amount);
        if (!r.expires_at || new Date(str(r.expires_at)).getTime() > now) t.pointsOutstanding += int(r.remaining);
      }
      for (const r of clots.data ?? []) {
        t.creditsByKind[str(r.kind)] = (t.creditsByKind[str(r.kind)] ?? 0) + int(r.quantity);
        if (!r.expires_at || new Date(str(r.expires_at)).getTime() > now) t.creditsOutstanding += int(r.remaining);
      }
      // 장부와 잔액이 어긋난 로트(0이어야 한다) — 전체 장부를 로트별로 합쳐 남은 양과 비교한다
      const all = await db.from("point_ledger").select("lot_id, amount").limit(PAGE * 50);
      if (!all.error) {
        const sum = new Map<string, number>();
        for (const r of all.data ?? []) if (r.lot_id) sum.set(str(r.lot_id), (sum.get(str(r.lot_id)) ?? 0) + int(r.amount));
        for (const l of lots.data ?? []) if ((sum.get(str(l.id)) ?? 0) !== int(l.remaining)) t.lotMismatches += 1;
      }
      return t;
    },
    async listExpenses(limit) {
      const { data, error, status } = await db.from("benefit_expenses").select().order("month", { ascending: false }).order("id", { ascending: false }).limit(limit);
      if (error) fail("비용 입력 조회", error, status);
      return (data ?? []).map((r): ExpenseRecord => ({ id: int(r.id), month: str(r.month), kind: r.kind as ExpenseRecord["kind"], amountKrw: int(r.amount_krw), memo: nstr(r.memo), createdAt: str(r.created_at) }));
    },
    async addExpense({ month, kind, amountKrw, memo, by }) {
      const { error, status } = await db.from("benefit_expenses").insert({ month, kind, amount_krw: amountKrw, memo, entered_by: by });
      if (error) fail("비용 입력", error, status);
    },
    async deleteExpense(id) {
      const { error, status } = await db.from("benefit_expenses").delete().eq("id", id);
      if (error) fail("비용 삭제", error, status);
    },
    async listAiQuestionCosts(since, limit) {
      const { data, error, status } = await db.from("ai_usage").select("request_key, credit_source, room_key, est_cost_krw, outcome, created_at").eq("purpose", "chat").gte("created_at", since).order("created_at", { ascending: false }).limit(limit);
      if (error) fail("질문 AI 원가 조회", error, status);
      return (data ?? []).map((r): AiQuestionCostRow => ({ requestKey: nstr(r.request_key), creditSource: nstr(r.credit_source), roomKey: nstr(r.room_key), estCostKrw: r.est_cost_krw === null || r.est_cost_krw === undefined ? null : Number(r.est_cost_krw), outcome: str(r.outcome), createdAt: str(r.created_at) }));
    },
  };
}
