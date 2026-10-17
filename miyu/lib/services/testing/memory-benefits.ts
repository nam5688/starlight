// 시험용 혜택 저장소(메모리) — DB 변경 19~22번의 표 · 함수 · 주문 트리거와 같은 규칙을 흉내 낸다. 서비스 시험은 DB 없이 이것으로 하고, SQL 자체는 supabase/tests/db.test.ts가 실제 Postgres로 확인한다.
// 메모리 저장소(createMemoryRepository)의 주문 상태 변화에 훅(orderHooks)으로 반응한다 — DB의 orders 트리거(적립 · 쿠폰 상태 · 추천 구매 보상)와 같은 자리다.

import { DEFAULT_BENEFIT_SETTINGS, couponPrice, parseBenefitSettings, type BenefitSettings, type CouponCheck, type ReferralCheck } from "../../commerce/benefits.ts";
import type { createMemoryRepository } from "./memory-repository.ts";
import type {
  AiQuestionCostRow,
  BenefitFailureRecord,
  BenefitOrderGrantRecord,
  BenefitRepository,
  CouponRecord,
  CouponRedemptionRecord,
  CreditLedgerRecord,
  CreditLotRecord,
  ExpenseRecord,
  GrantResult,
  LedgerTotals,
  PointLedgerRecord,
  PointLotRecord,
  ReferralFirstPurchaseStatus,
  ReferralSignupRecord,
  ReferralSignupStatus,
  SettingHistoryRecord,
} from "../benefit-ports.ts";
import type { OrderRecord } from "../ports.ts";

type Mem = ReturnType<typeof createMemoryRepository>;
const DAY = 86_400_000;
const HOUR = 3_600_000;

/** DB의 benefit_settings 기본 행과 같은 값(키 → 값) */
export function rawDefaultSettings(): Record<string, unknown> {
  const d = DEFAULT_BENEFIT_SETTINGS;
  const raw: Record<string, unknown> = {
    "earn.tiers": d.earnTiers,
    "point.prices": d.pointPrices,
    "point.expire_days": d.pointExpireDays,
    "point.restore_grace_days": d.restoreGraceDays,
    "credit.expire_days": d.creditExpireDays,
    "referral.invitee_price": d.referral.inviteePrice,
    "referral.signup_points": d.referral.signupPoints,
    "referral.hold_hours": d.referral.holdHours,
    "referral.inviter_credits": d.referral.inviterCredits,
    "referral.invitee_credits": d.referral.inviteeCredits,
    "referral.new_member_hours": d.referral.newMemberHours,
    "referral.max_confirmed_per_inviter_per_day": d.referral.maxConfirmedPerInviterPerDay,
    "referral.risk.burst_per_hour": d.referral.risk.burstPerHour,
    "referral.risk.min_visit_seconds": d.referral.risk.minVisitSeconds,
    "referral.risk.young_inviter_minutes": d.referral.risk.youngInviterMinutes,
    "review.reward_credits": d.review.rewardCredits,
    "review.min_body_chars": d.review.minBodyChars,
    "benefit.withdrawn_ledger_retention_days": null,
  };
  for (const [k, v] of Object.entries(d.features)) raw[`feature.${k}`] = v;
  return raw;
}

type PLot = PointLotRecord & { userId: string };
type PLedger = PointLedgerRecord & { userId: string; opKey: string };
type CLot = CreditLotRecord & { userId: string };
type CLedger = CreditLedgerRecord & { userId: string; opKey: string };
type Redemption = CouponRedemptionRecord;
type Signup = { inviteeUserId: string; inviterUserId: string; linkToken: string; anonId: string | null; status: ReferralSignupStatus; risk: string[]; signedUpAt: string; holdUntil: string; decidedAt: string | null; decisionReason: string | null };

export function createMemoryBenefits(mem: Mem, now: () => Date = () => new Date()) {
  const settings = new Map<string, unknown>(Object.entries(rawDefaultSettings()));
  const history: SettingHistoryRecord[] = [];
  const failures: BenefitFailureRecord[] = [];
  const ops = new Set<string>();
  const pointLots: PLot[] = [];
  const pointLedger: PLedger[] = [];
  const creditLots: CLot[] = [];
  const creditLedger: CLedger[] = [];
  const coupons: CouponRecord[] = [];
  const redemptions: (Redemption & { key: string })[] = [];
  const grants = new Map<string, BenefitOrderGrantRecord & { userId: string }>();
  const links = new Map<string, { token: string; deactivatedAt: string | null }>();
  const visits: { token: string; anonId: string; at: number }[] = [];
  const signups = new Map<string, Signup>();
  const firstPurchases = new Map<string, { orderId: string; status: ReferralFirstPurchaseStatus }>();
  const expenses: ExpenseRecord[] = [];
  const joined = new Map<string, number>();
  const unconfirmedUsers = new Set<string>();
  let seq = 0;
  let tick = 0;
  const uid = () => `10000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const stamp = () => new Date(now().getTime() + ++tick).toISOString();
  const cfg = (): BenefitSettings => parseBenefitSettings(Object.fromEntries(settings));
  const flag = (f: keyof BenefitSettings["features"]) => cfg().features[f];
  const claim = (key: string): boolean => {
    if (ops.has(key)) return false;
    ops.add(key);
    return true;
  };

  // ── 포인트 ──
  const alive = (expiresAt: string | null) => expiresAt === null || new Date(expiresAt).getTime() > now().getTime();
  const balanceOf = (userId: string) => pointLots.filter((l) => l.userId === userId && l.remaining > 0 && alive(l.expiresAt)).reduce((s, l) => s + l.remaining, 0);
  const grantPointsInner = (userId: string, amount: number, sourceKind: string, sourceRef: string, opKey: string, expiresAt: string | null, orderId: string | null): GrantResult => {
    if (!(amount > 0)) return { status: "invalid" };
    if (!claim(opKey)) return { status: "duplicate" };
    const lot: PLot = { id: uid(), userId, amount, remaining: amount, expiresAt, sourceKind, sourceRef, revokedAt: null, createdAt: stamp() };
    pointLots.push(lot);
    pointLedger.push({ id: pointLedger.length + 1, userId, opKey, kind: "earn", amount, lotId: lot.id, orderId, shortfall: 0, createdAt: stamp() });
    return { status: "granted", amount };
  };
  const spendPointsInner = (userId: string, amount: number, ref: string) => {
    if (!(amount > 0) || !ref) return { status: "invalid" as const };
    const key = `point-spend:${ref}`;
    if (ops.has(key)) return { status: "already" as const, balance: balanceOf(userId) };
    const bal = balanceOf(userId);
    if (bal < amount) return { status: "insufficient" as const, balance: bal };
    ops.add(key);
    let need = amount;
    const lots = pointLots.filter((l) => l.userId === userId && l.remaining > 0 && alive(l.expiresAt)).sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999") || a.createdAt.localeCompare(b.createdAt));
    for (const lot of lots) {
      if (need <= 0) break;
      const take = Math.min(lot.remaining, need);
      lot.remaining -= take;
      pointLedger.push({ id: pointLedger.length + 1, userId, opKey: key, kind: "spend", amount: -take, lotId: lot.id, orderId: null, shortfall: 0, createdAt: stamp() });
      need -= take;
    }
    return { status: "spent" as const, balance: bal - amount };
  };
  const restorePointsInner = (userId: string, ref: string) => {
    const key = `point-spend:${ref}`;
    const rkey = `point-restore:${ref}`;
    if (!ops.has(key)) return { status: "nothing" as const };
    if (!claim(rkey)) return { status: "already" as const, balance: balanceOf(userId) };
    for (const row of pointLedger.filter((l) => l.opKey === key && l.kind === "spend")) {
      const lot = pointLots.find((l) => l.id === row.lotId)!;
      const qty = -row.amount;
      if (lot.revokedAt) {
        pointLedger.push({ id: pointLedger.length + 1, userId, opKey: rkey, kind: "spend_restore", amount: 0, lotId: lot.id, orderId: null, shortfall: qty, createdAt: stamp() });
      } else if (alive(lot.expiresAt)) {
        lot.remaining += qty;
        pointLedger.push({ id: pointLedger.length + 1, userId, opKey: rkey, kind: "spend_restore", amount: qty, lotId: lot.id, orderId: null, shortfall: 0, createdAt: stamp() });
      } else {
        const fresh: PLot = { id: uid(), userId, amount: qty, remaining: qty, expiresAt: new Date(now().getTime() + cfg().restoreGraceDays * DAY).toISOString(), sourceKind: "restore", sourceRef: ref, revokedAt: null, createdAt: stamp() };
        pointLots.push(fresh);
        pointLedger.push({ id: pointLedger.length + 1, userId, opKey: rkey, kind: "spend_restore", amount: qty, lotId: fresh.id, orderId: null, shortfall: 0, createdAt: stamp() });
      }
    }
    return { status: "restored" as const, balance: balanceOf(userId) };
  };
  const clawbackPoints = (sourceKind: string, sourceRef: string, reason: string) => {
    const lot = pointLots.find((l) => l.sourceKind === sourceKind && l.sourceRef === sourceRef);
    if (!lot) return { status: "nothing" as const };
    if (!claim(`point-clawback:${sourceKind}:${sourceRef}`)) return { status: "already" as const };
    const revoked = lot.remaining;
    const spent = Math.max(0, -pointLedger.filter((l) => l.lotId === lot.id && (l.kind === "spend" || l.kind === "spend_restore")).reduce((s, l) => s + l.amount, 0));
    lot.remaining = 0;
    lot.revokedAt = stamp();
    pointLedger.push({ id: pointLedger.length + 1, userId: lot.userId, opKey: `point-clawback:${sourceKind}:${sourceRef}`, kind: "clawback", amount: -revoked, lotId: lot.id, orderId: null, shortfall: spent, createdAt: stamp() });
    void reason;
    return { status: "clawed" as const, revoked, shortfall: spent };
  };

  // ── 질문권 ──
  const creditBalance = (userId: string) => creditLots.filter((l) => l.userId === userId && l.remaining > 0 && alive(l.expiresAt)).reduce((s, l) => s + l.remaining, 0);
  const grantCreditInner = (userId: string, kind: string, qty: number, sourceRef: string, opKey: string, expiresAt: string | null): GrantResult => {
    if (!(qty > 0)) return { status: "invalid" };
    if (!claim(opKey)) return { status: "duplicate" };
    const lot: CLot = { id: uid(), userId, kind, quantity: qty, remaining: qty, expiresAt, sourceRef, revokedAt: null, createdAt: stamp() };
    creditLots.push(lot);
    creditLedger.push({ id: creditLedger.length + 1, userId, opKey, kind: "grant", qty, lotId: lot.id, shortfall: 0, createdAt: stamp() });
    return { status: "granted", qty };
  };
  const revokeCredits = (sourceRef: string) => {
    for (const lot of creditLots.filter((l) => l.sourceRef === sourceRef)) {
      const key = `credit-revoke:${lot.id}`;
      if (!claim(key)) continue;
      const spent = Math.max(0, -creditLedger.filter((l) => l.lotId === lot.id && (l.kind === "spend" || l.kind === "restore")).reduce((s, l) => s + l.qty, 0));
      const rem = lot.remaining;
      lot.remaining = 0;
      lot.revokedAt = stamp();
      creditLedger.push({ id: creditLedger.length + 1, userId: lot.userId, opKey: key, kind: "revoke", qty: -rem, lotId: lot.id, shortfall: spent, createdAt: stamp() });
    }
  };

  // ── 주문 트리거(DB의 orders_benefit_paid · orders_coupon_state · orders_referral_state) ──
  const orderPaidAt = (o: OrderRecord) => `${o.approvedAt ?? o.createdAt}|${o.id}`;
  const earnForOrder = (o: OrderRecord) => {
    if (o.status !== "paid" || (o.provider ?? "tosspayments") !== "tosspayments" || o.amount <= 0) return;
    const key = `earn:${o.id}`;
    if (ops.has(key)) return;
    if (!flag("points_earn")) {
      ops.add(key);
      return;
    }
    let cum = 0;
    for (const x of mem.orders.values()) {
      if (x.userId !== o.userId || x.status !== "paid" || (x.provider ?? "tosspayments") !== "tosspayments" || x.id === o.id) continue;
      if (orderPaidAt(x) < orderPaidAt(o)) cum += x.amount;
    }
    for (const p of mem.packs.values()) {
      const x = mem.orders.get(p.orderId);
      if (x && x.userId === o.userId && x.status === "paid" && x.id !== o.id && orderPaidAt(x) < orderPaidAt(o)) cum -= p.refundedKrw;
    }
    cum = Math.max(0, cum);
    const tiers = cfg().earnTiers;
    let rate = 0;
    for (const t of [...tiers].sort((a, b) => a.fromKrw - b.fromKrw)) if (t.fromKrw <= cum) rate = t.rate;
    const amt = Math.floor(o.amount * rate);
    if (!(amt > 0)) {
      ops.add(key);
      return;
    }
    const days = cfg().pointExpireDays;
    grantPointsInner(o.userId, amt, "purchase", o.id, key, days > 0 ? new Date(now().getTime() + days * DAY).toISOString() : null, o.id);
  };
  const confirmReferralPurchase = (orderId: string) => {
    const fp = [...firstPurchases.entries()].find(([, v]) => v.orderId === orderId);
    if (!fp || fp[1].status !== "pending") return;
    const [invitee, row] = fp;
    const su = signups.get(invitee);
    if (!su || su.status === "rejected" || su.status === "revoked") {
      row.status = "revoked";
      return;
    }
    if (!flag("referral_purchase_credits")) {
      row.status = "confirmed";
      ops.add(`referral-buy-skipped:${orderId}`);
      return;
    }
    if (su.status === "review") {
      row.status = "held";
      return;
    }
    const days = cfg().creditExpireDays;
    const exp = days > 0 ? new Date(now().getTime() + days * DAY).toISOString() : null;
    const src = `referral-buy:${orderId}`;
    grantCreditInner(su.inviterUserId, "referral_inviter", cfg().referral.inviterCredits, src, `${src}:inviter`, exp);
    grantCreditInner(invitee, "referral_invitee", cfg().referral.inviteeCredits, src, `${src}:invitee`, exp);
    row.status = "confirmed";
  };
  mem.orderHooks.push((before, after) => {
    if (before.status === after.status) return;
    try {
      if (after.status === "paid") {
        earnForOrder(after);
        for (const r of redemptions) if (r.orderId === after.id && r.status === "reserved") r.status = "used";
        confirmReferralPurchase(after.id);
      } else if (after.status === "refunded" && before.status === "paid") {
        clawbackPoints("purchase", after.id, "order-refunded");
        const fp = [...firstPurchases.values()].find((v) => v.orderId === after.id);
        if (fp && (fp.status === "confirmed" || fp.status === "held")) {
          revokeCredits(`referral-buy:${after.id}`);
          fp.status = "revoked";
        }
      } else if ((after.status === "failed" || after.status === "canceled") && before.status === "pending") {
        for (const r of redemptions) if (r.orderId === after.id && r.status === "reserved") r.status = "released";
        for (const fp of firstPurchases.values()) if (fp.orderId === after.id && fp.status === "pending") fp.status = "void";
      }
    } catch (e) {
      failures.push({ id: failures.length + 1, kind: "orders_trigger", ref: after.id, message: String((e as Error).message).slice(0, 300), createdAt: stamp() });
    }
  });

  // ── 쿠폰 ──
  const couponByCode = (code: string) => coupons.find((c) => c.code === code.trim().toUpperCase());
  const liveRedemptions = (couponId: string) => redemptions.filter((r) => r.couponId === couponId && (r.status === "reserved" || r.status === "used"));
  const checkCoupon = (code: string, userId: string, productId: string): CouponCheck => {
    if (!flag("coupons")) return { ok: false, reason: "feature-off" };
    const c = couponByCode(code);
    if (!c) return { ok: false, reason: "not-found" };
    if (c.status !== "active") return { ok: false, reason: "inactive" };
    if (c.startsAt && new Date(c.startsAt).getTime() > now().getTime()) return { ok: false, reason: "not-started" };
    if (c.endsAt && new Date(c.endsAt).getTime() <= now().getTime()) return { ok: false, reason: "ended" };
    if (c.targetUserId && c.targetUserId !== userId) return { ok: false, reason: "user" };
    if (c.type !== "credit") {
      const personal = productId === "personal-integrated-report" || /^personal-integrated-report:r\d+$/.test(productId);
      if (c.productIds.length === 0 ? !personal : !c.productIds.includes(productId)) return { ok: false, reason: "product" };
    }
    if (liveRedemptions(c.id).filter((r) => r.userId === userId).length >= c.perUserLimit) return { ok: false, reason: "user-limit" };
    if (c.issueLimit !== null && liveRedemptions(c.id).length >= c.issueLimit) return { ok: false, reason: "sold-out" };
    return { ok: true, couponId: c.id, type: c.type, value: c.value, purpose: c.purpose, stackableWithReferral: c.stackableWithReferral, creditExpireDays: c.creditExpireDays, name: c.name };
  };

  // ── 추천 ──
  const joinedAt = (userId: string, fallbackOld: boolean) => joined.get(userId) ?? (fallbackOld ? now().getTime() - 10 * DAY : now().getTime());
  const accountConfirmed = (userId: string) => !unconfirmedUsers.has(userId);
  const hasAnalysis = (userId: string) => [...mem.assessments.values()].some((a) => a.userId === userId);
  const personalLike = (productId: string) => productId === "personal-integrated-report" || productId.startsWith("personal-integrated-report:r");
  const discountStatus = (invitee: string): ReferralCheck => {
    if (!flag("referral")) return { ok: false, reason: "feature-off" };
    const s = signups.get(invitee);
    if (!s) return { ok: false, reason: "no-signup" };
    if (s.status === "rejected" || s.status === "revoked") return { ok: false, reason: "signup-rejected" };
    const fp = firstPurchases.get(invitee);
    if (fp) {
      if (fp.status === "confirmed" || fp.status === "held" || fp.status === "revoked") return { ok: false, reason: "used" };
      if (fp.status === "pending" && mem.orders.get(fp.orderId)?.status === "paid") return { ok: false, reason: "used" };
    } else if ([...mem.orders.values()].some((o) => o.userId === invitee && (o.status === "paid" || o.status === "refunded") && personalLike(o.productId))) {
      return { ok: false, reason: "not-first" };
    }
    return { ok: true, price: cfg().referral.inviteePrice, inviterUserId: s.inviterUserId };
  };
  const grantReferralPoints = (s: Signup, meta: boolean) => {
    const days = cfg().pointExpireDays;
    void meta;
    return grantPointsInner(s.inviterUserId, cfg().referral.signupPoints, "referral_signup", s.inviteeUserId, `referral-signup:${s.inviteeUserId}`, days > 0 ? new Date(now().getTime() + days * DAY).toISOString() : null, null);
  };
  const evaluate = (invitee: string) => {
    const s = signups.get(invitee);
    if (!s) return { status: "not-found" as const };
    if (s.status === "confirmed" || s.status === "rejected" || s.status === "revoked") return { status: "decided" as const, to: s.status };
    if (!flag("referral_signup_points")) return { status: "feature-off" as const };
    if (!accountConfirmed(invitee)) return { status: "not-confirmed" as const };
    if (!hasAnalysis(invitee)) return { status: "no-analysis" as const };
    if (now().getTime() < new Date(s.holdUntil).getTime()) return { status: "holding" as const, until: s.holdUntil };
    if (s.status === "review" || s.risk.length > 0) {
      s.status = "review";
      return { status: "review" as const };
    }
    const today = [...signups.values()].filter((x) => x.inviterUserId === s.inviterUserId && x.status === "confirmed" && x.decidedAt && new Date(x.decidedAt).getTime() > now().getTime() - DAY).length;
    if (today >= cfg().referral.maxConfirmedPerInviterPerDay) {
      s.status = "review";
      s.risk = [...s.risk, "daily_cap"];
      return { status: "review" as const };
    }
    grantReferralPoints(s, false);
    s.status = "confirmed";
    s.decidedAt = stamp();
    return { status: "confirmed" as const, points: cfg().referral.signupPoints };
  };

  const repo: BenefitRepository = {
    async getSettings() {
      return Object.fromEntries(settings);
    },
    async setSetting({ key, value, reason, by }) {
      if (!reason.trim()) throw new Error("reason required");
      const old = settings.get(key);
      if (settings.has(key) && JSON.stringify(old) === JSON.stringify(value)) return "unchanged";
      settings.set(key, value);
      history.unshift({ id: history.length + 1, key, oldValue: old, newValue: value, changedBy: by, reason: reason.slice(0, 200), changedAt: stamp() });
      return "changed";
    },
    async listSettingHistory(limit) {
      return history.slice(0, limit);
    },
    async listFailures(limit) {
      return failures.slice(0, limit);
    },

    async getPointBalance(userId) {
      return balanceOf(userId);
    },
    async listPointLots(userId) {
      return pointLots.filter((l) => l.userId === userId).map(({ userId: _u, ...l }) => l).reverse();
    },
    async listPointLedger(userId, limit) {
      return pointLedger.filter((l) => l.userId === userId).map(({ userId: _u, opKey: _o, ...l }) => l).reverse().slice(0, limit);
    },
    async grantPoints({ userId, amount, sourceKind, sourceRef, opKey, expiresAt }) {
      return grantPointsInner(userId, amount, sourceKind, sourceRef, opKey, expiresAt, null);
    },
    async spendPoints({ userId, amount, ref }) {
      return spendPointsInner(userId, amount, ref);
    },
    async restorePointSpend({ userId, ref }) {
      return restorePointsInner(userId, ref);
    },

    async getCreditBalance(userId) {
      return creditBalance(userId);
    },
    async listCreditLots(userId) {
      return creditLots.filter((l) => l.userId === userId).map(({ userId: _u, ...l }) => l).reverse();
    },
    async listCreditLedger(userId, limit) {
      return creditLedger.filter((l) => l.userId === userId).map(({ userId: _u, opKey: _o, ...l }) => l).reverse().slice(0, limit);
    },
    async grantCredit({ userId, kind, qty, sourceRef, opKey, expiresAt }) {
      return grantCreditInner(userId, kind, qty, sourceRef, opKey, expiresAt);
    },
    async spendCredit({ userId, ref }) {
      if (!ref) return { status: "invalid" };
      const key = `credit-spend:${ref}`;
      if (ops.has(key)) return { status: "already", balance: creditBalance(userId) };
      const lot = creditLots
        .filter((l) => l.userId === userId && l.remaining > 0 && alive(l.expiresAt))
        .sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999") || a.createdAt.localeCompare(b.createdAt))[0];
      if (!lot) return { status: "none", balance: 0 };
      ops.add(key);
      lot.remaining -= 1;
      creditLedger.push({ id: creditLedger.length + 1, userId, opKey: key, kind: "spend", qty: -1, lotId: lot.id, shortfall: 0, createdAt: stamp() });
      return { status: "spent", kind: lot.kind, balance: creditBalance(userId) };
    },
    async restoreCreditSpend({ userId, ref }) {
      const key = `credit-spend:${ref}`;
      const rkey = `credit-restore:${ref}`;
      if (!ops.has(key)) return { status: "nothing" };
      if (!claim(rkey)) return { status: "already", balance: creditBalance(userId) };
      for (const row of creditLedger.filter((l) => l.opKey === key && l.kind === "spend")) {
        const lot = creditLots.find((l) => l.id === row.lotId)!;
        const n = -row.qty;
        if (lot.revokedAt) {
          creditLedger.push({ id: creditLedger.length + 1, userId, opKey: rkey, kind: "restore", qty: 0, lotId: lot.id, shortfall: n, createdAt: stamp() });
        } else if (alive(lot.expiresAt)) {
          lot.remaining += n;
          creditLedger.push({ id: creditLedger.length + 1, userId, opKey: rkey, kind: "restore", qty: n, lotId: lot.id, shortfall: 0, createdAt: stamp() });
        } else {
          const fresh: CLot = { id: uid(), userId, kind: lot.kind, quantity: n, remaining: n, expiresAt: new Date(now().getTime() + cfg().restoreGraceDays * DAY).toISOString(), sourceRef: `restore:${ref}`, revokedAt: null, createdAt: stamp() };
          creditLots.push(fresh);
          creditLedger.push({ id: creditLedger.length + 1, userId, opKey: rkey, kind: "restore", qty: n, lotId: fresh.id, shortfall: 0, createdAt: stamp() });
        }
      }
      return { status: "restored", balance: creditBalance(userId) };
    },

    async couponCheck({ code, userId, productId }) {
      return checkCoupon(code, userId, productId);
    },
    async reserveCoupon({ code, userId, orderId, key }) {
      const dup = redemptions.find((r) => r.key === key);
      if (dup) return { ok: true, redemptionId: dup.id, duplicate: true };
      const c = couponByCode(code);
      if (!c) return { ok: false, reason: "not-found" };
      const o = mem.orders.get(orderId);
      if (!o || o.userId !== userId || o.status !== "pending" || (o.provider ?? "tosspayments") !== "tosspayments") return { ok: false, reason: "order-mismatch" };
      const chk = checkCoupon(code, userId, o.productId);
      if (!chk.ok) return chk;
      if (c.type !== "amount" && c.type !== "percent") return { ok: false, reason: "type" };
      const r = { id: uid(), couponId: c.id, userId, orderId, status: "reserved" as const, createdAt: stamp(), key };
      redemptions.push(r);
      return { ok: true, redemptionId: r.id };
    },
    async redeemCreditCoupon({ code, userId, key }) {
      if (redemptions.some((r) => r.key === key)) return { ok: true, duplicate: true };
      const c = couponByCode(code);
      if (!c) return { ok: false, reason: "not-found" };
      const chk = checkCoupon(code, userId, "credit");
      if (!chk.ok) return chk;
      if (c.type !== "credit") return { ok: false, reason: "type" };
      const r = { id: uid(), couponId: c.id, userId, orderId: null, status: "used" as const, createdAt: stamp(), key };
      redemptions.push(r);
      const days = c.creditExpireDays ?? cfg().creditExpireDays;
      grantCreditInner(userId, c.purpose === "trial" ? "event" : c.purpose === "cs" ? "admin" : "promo", c.value, `coupon:${r.id}`, `coupon-credit:${r.id}`, days > 0 ? new Date(now().getTime() + days * DAY).toISOString() : null);
      return { ok: true, qty: c.value };
    },
    async createCoupon(c) {
      if (coupons.some((x) => x.code === c.code)) return { ok: false, reason: "duplicate-code" };
      const rec: CouponRecord = { ...c, id: uid(), status: c.status ?? "draft", createdAt: stamp(), activeCount: 0, usedCount: 0 };
      coupons.push(rec);
      return { ok: true, coupon: rec };
    },
    async listCoupons() {
      return coupons.map((c) => ({ ...c, activeCount: liveRedemptions(c.id).length, usedCount: redemptions.filter((r) => r.couponId === c.id && r.status === "used").length })).reverse();
    },
    async setCouponStatus(id, status) {
      const c = coupons.find((x) => x.id === id);
      if (!c) return false;
      c.status = status;
      return true;
    },
    async listCouponRedemptions(couponId, limit) {
      return redemptions.filter((r) => r.couponId === couponId).map(({ key: _k, ...r }) => r).reverse().slice(0, limit);
    },
    async listUserCouponRedemptions(userId, limit) {
      return redemptions
        .filter((r) => r.userId === userId)
        .map(({ key: _k, ...r }) => ({ ...r, code: coupons.find((c) => c.id === r.couponId)?.code ?? "", name: coupons.find((c) => c.id === r.couponId)?.name ?? "" }))
        .reverse()
        .slice(0, limit);
    },

    async grantBenefitOrder(i) {
      const a = mem.assessments.get(i.assessmentId);
      if (!a || a.userId !== i.userId) return { ok: false, reason: "assessment" };
      if (!personalLike(i.productId)) return { ok: false, reason: "product" };
      if ([...mem.orders.values()].some((o) => o.assessmentId === i.assessmentId && o.productId === i.productId && o.status === "paid")) return { ok: false, reason: "already-granted" };
      let discKind: "coupon" | "points" | "admin";
      let discRef: string;
      let review = false;
      let redemptionOf: (Redemption & { key: string }) | null = null;
      let couponId: string | null = null;
      if (i.kind === "coupon") {
        const c = couponByCode(i.couponCode ?? "");
        if (!c) return { ok: false, reason: "coupon:not-found" };
        const chk = checkCoupon(i.couponCode ?? "", i.userId, i.productId);
        if (!chk.ok) return { ok: false, reason: `coupon:${chk.reason}` };
        if (couponPrice(c.type, c.value, i.listPriceKrw) !== 0) return { ok: false, reason: "not-free" };
        discKind = "coupon";
        discRef = c.code;
        review = c.reviewRewardEligible;
        couponId = c.id;
      } else if (i.kind === "points") {
        if (!flag("points_spend")) return { ok: false, reason: "feature-off" };
        const prices = cfg().pointPrices;
        const key = /:r\d+$/.test(i.productId) ? "personal-integrated-report" : i.productId;
        if (!i.pointPrice || i.pointPrice <= 0 || prices[key] !== i.pointPrice) return { ok: false, reason: "price" };
        if (balanceOf(i.userId) < i.pointPrice) return { ok: false, reason: "insufficient" };
        discKind = "points";
        discRef = `P${i.pointPrice}`;
      } else if (i.kind === "admin") {
        if (!i.grantedBy || !i.reason?.trim()) return { ok: false, reason: "admin" };
        discKind = "admin";
        discRef = "admin";
      } else return { ok: false, reason: "invalid" };

      // 같은 상품의 결제 대기 주문은 정리
      for (const o of mem.orders.values()) if (o.assessmentId === i.assessmentId && o.productId === i.productId && o.userId === i.userId && o.status === "pending") await mem.repo.updateOrder(o.id, ["pending"], { status: "canceled", failureCode: "SUPERSEDED" });
      const order: OrderRecord = {
        id: mem.newId(),
        orderNumber: i.orderNumber,
        userId: i.userId,
        assessmentId: i.assessmentId,
        productId: i.productId,
        amount: 0,
        status: "paid",
        paymentKey: null,
        method: null,
        approvedAt: stamp(),
        failureCode: null,
        failureMessage: null,
        paymentEnv: i.paymentEnv as OrderRecord["paymentEnv"],
        acquisition: null,
        provider: "benefit",
        listAmount: i.listPriceKrw,
        discountKrw: i.listPriceKrw,
        discountKind: discKind,
        discountRef: discRef,
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      mem.orders.set(order.id, order);
      if (i.kind === "coupon" && couponId) {
        redemptionOf = { id: uid(), couponId, userId: i.userId, orderId: order.id, status: "used", createdAt: stamp(), key: `benefit-order:${order.id}` };
        redemptions.push(redemptionOf);
      } else if (i.kind === "points") {
        const r = spendPointsInner(i.userId, i.pointPrice!, i.orderNumber);
        if (r.status !== "spent") throw new Error("point spend failed");
      }
      grants.set(order.id, { orderId: order.id, userId: i.userId, kind: i.kind, ref: discRef, pointSpent: i.kind === "points" ? i.pointPrice! : 0, couponRedemptionId: redemptionOf?.id ?? null, reviewRewardEligible: review, grantedBy: i.grantedBy ?? null, reason: i.reason?.slice(0, 200) ?? null, releasedAt: null, releaseMode: null, releaseReason: null, createdAt: stamp() });
      return { ok: true, orderId: order.id, orderNumber: order.orderNumber };
    },
    async releaseBenefitOrder({ orderId, mode, reason }) {
      const o = mem.orders.get(orderId);
      const g = grants.get(orderId);
      if (!o || !g || o.provider !== "benefit") return { ok: false, reason: "not-benefit" };
      if (g.releasedAt) return { ok: true, already: true };
      if (o.status !== "paid") return { ok: false, reason: "not-paid" };
      await mem.repo.updateOrder(orderId, ["paid"], { status: "refunded", failureCode: "BENEFIT_RELEASED", failureMessage: reason.slice(0, 200) });
      if (mode === "restore") {
        if (g.kind === "points") restorePointsInner(o.userId, o.orderNumber);
        else if (g.kind === "coupon" && g.couponRedemptionId) {
          const r = redemptions.find((x) => x.id === g.couponRedemptionId);
          if (r) r.status = "released";
        }
      } else if (g.kind === "coupon" && g.couponRedemptionId) {
        const r = redemptions.find((x) => x.id === g.couponRedemptionId);
        if (r) r.status = "revoked";
      }
      g.releasedAt = stamp();
      g.releaseMode = mode;
      g.releaseReason = reason.slice(0, 200);
      return { ok: true, mode };
    },
    async getBenefitGrant(orderId) {
      const g = grants.get(orderId);
      if (!g) return null;
      const { userId: _u, ...rest } = g;
      return rest;
    },
    async listBenefitGrants(limit) {
      return [...grants.values()]
        .map((g) => {
          const o = mem.orders.get(g.orderId)!;
          return { ...g, orderNumber: o.orderNumber, orderStatus: o.status };
        })
        .reverse()
        .slice(0, limit);
    },

    async ensureReferralLink({ userId, token }) {
      if (!links.has(userId)) links.set(userId, { token, deactivatedAt: null });
      return links.get(userId)!.token;
    },
    async getReferralLink(userId) {
      return links.get(userId) ?? null;
    },
    async getReferralLinkOwner(token) {
      for (const [uid2, l] of links) if (l.token === token && !l.deactivatedAt) return uid2;
      return null;
    },
    async logReferralVisit({ token, anonId }) {
      if (anonId.length < 8) return;
      if ([...links.values()].some((l) => l.token === token && !l.deactivatedAt)) visits.push({ token, anonId, at: now().getTime() });
    },
    async registerReferralSignup({ token, inviteeUserId, anonId }) {
      if (!flag("referral")) return { ok: false, reason: "feature-off" };
      const owner = [...links.entries()].find(([, l]) => l.token === token && !l.deactivatedAt)?.[0];
      if (!owner) return { ok: false, reason: "invalid" };
      if (owner === inviteeUserId) return { ok: false, reason: "self" };
      const existing = signups.get(inviteeUserId);
      if (existing) return { ok: true, already: true, status: existing.status };
      const c = cfg().referral;
      if (now().getTime() - joinedAt(inviteeUserId, false) > c.newMemberHours * HOUR || [...mem.orders.values()].some((o) => o.userId === inviteeUserId && (o.status === "paid" || o.status === "refunded"))) return { ok: false, reason: "not-new" };
      const risk: string[] = [];
      if (anonId && anonId.length >= 8) {
        if ([...signups.values()].some((s) => s.inviterUserId === owner && s.anonId === anonId)) risk.push("same_device_repeat");
        const first = visits.filter((v) => v.token === token && v.anonId === anonId).sort((a, b) => a.at - b.at)[0];
        if (first && now().getTime() - first.at < c.risk.minVisitSeconds * 1000) risk.push("too_fast");
      }
      if ([...signups.values()].filter((s) => s.linkToken === token && now().getTime() - new Date(s.signedUpAt).getTime() < HOUR).length >= c.risk.burstPerHour) risk.push("burst");
      if (now().getTime() - joinedAt(owner, true) < c.risk.youngInviterMinutes * 60_000) risk.push("young_inviter");
      const status: ReferralSignupStatus = risk.length === 0 ? "pending" : "review";
      signups.set(inviteeUserId, { inviteeUserId, inviterUserId: owner, linkToken: token, anonId: anonId ? anonId.slice(0, 64) : null, status, risk, signedUpAt: stamp(), holdUntil: new Date(now().getTime() + c.holdHours * HOUR).toISOString(), decidedAt: null, decisionReason: null });
      return { ok: true, status, risk };
    },
    async evaluateReferralSignup(invitee) {
      return evaluate(invitee);
    },
    async referralDiscountStatus(invitee) {
      return discountStatus(invitee);
    },
    async claimReferralDiscount({ inviteeUserId, orderId, listPriceKrw }) {
      const st = discountStatus(inviteeUserId);
      if (!st.ok) return st;
      const o = mem.orders.get(orderId);
      if (!o || o.userId !== inviteeUserId || o.status !== "pending" || (o.provider ?? "tosspayments") !== "tosspayments" || o.productId !== "personal-integrated-report" || o.amount !== st.price) return { ok: false, reason: "order-mismatch" };
      const fp = firstPurchases.get(inviteeUserId);
      if (fp && fp.orderId !== orderId) {
        const prev = mem.orders.get(fp.orderId);
        if (prev?.status === "pending") await mem.repo.updateOrder(prev.id, ["pending"], { status: "canceled", failureCode: "DISCOUNT_REPLACED" });
      }
      firstPurchases.set(inviteeUserId, { orderId, status: "pending" });
      mem.orders.set(orderId, { ...o, listAmount: listPriceKrw, discountKrw: Math.max(0, listPriceKrw - o.amount), discountKind: "referral", discountRef: "referral" });
      return st;
    },
    async referralOverview(inviter) {
      const mine = [...signups.values()].filter((s) => s.inviterUserId === inviter);
      const byStatus: Partial<Record<ReferralSignupStatus, number>> = {};
      for (const s of mine) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
      const token = links.get(inviter)?.token;
      return { signups: mine.length, byStatus, firstPurchases: mine.filter((s) => ["confirmed", "held"].includes(firstPurchases.get(s.inviteeUserId)?.status ?? "")).length, visits: token ? visits.filter((v) => v.token === token).length : 0 };
    },
    async listReferralSignups({ status, limit }) {
      return [...signups.values()]
        .filter((s) => !status || s.status === status)
        .sort((a, b) => b.signedUpAt.localeCompare(a.signedUpAt))
        .slice(0, limit)
        .map((s): ReferralSignupRecord => ({ inviteeUserId: s.inviteeUserId, inviterUserId: s.inviterUserId, status: s.status, risk: s.risk, signedUpAt: s.signedUpAt, holdUntil: s.holdUntil, decidedAt: s.decidedAt, decisionReason: s.decisionReason, firstPurchase: firstPurchases.get(s.inviteeUserId)?.status ?? null }));
    },
    async decideReferralSignup({ inviteeUserId, decision, reason }) {
      if (!reason.trim()) return { ok: false, reason: "reason" };
      const s = signups.get(inviteeUserId);
      if (!s) return { ok: false, reason: "not-found" };
      if (s.status !== "pending" && s.status !== "review") return { ok: false, reason: "decided" };
      if (decision === "reject") {
        s.status = "rejected";
        s.decidedAt = stamp();
        s.decisionReason = reason.slice(0, 200);
        const fp = firstPurchases.get(inviteeUserId);
        if (fp?.status === "held") fp.status = "revoked";
        return { ok: true, status: "rejected" };
      }
      if (!flag("referral_signup_points")) return { ok: false, reason: "feature-off" };
      if (!accountConfirmed(inviteeUserId)) return { ok: false, reason: "not-confirmed" };
      if (!hasAnalysis(inviteeUserId)) return { ok: false, reason: "no-analysis" };
      grantReferralPoints(s, true);
      s.status = "confirmed";
      s.decidedAt = stamp();
      s.decisionReason = reason.slice(0, 200);
      const fp = firstPurchases.get(inviteeUserId);
      if (fp?.status === "held") {
        fp.status = "pending";
        confirmReferralPurchase(fp.orderId);
      }
      return { ok: true, status: "confirmed", points: cfg().referral.signupPoints };
    },
    async revokeReferralSignup({ inviteeUserId, reason }) {
      if (!reason.trim()) return { ok: false, reason: "reason" };
      const s = signups.get(inviteeUserId);
      if (!s || s.status !== "confirmed") return { ok: false, reason: "not-confirmed" };
      clawbackPoints("referral_signup", inviteeUserId, reason);
      s.status = "revoked";
      s.decidedAt = stamp();
      s.decisionReason = reason.slice(0, 200);
      return { ok: true };
    },
    async referralFunnelCounts(since) {
      const all = [...signups.values()].filter((s) => s.signedUpAt >= since);
      return {
        links: links.size,
        visits: visits.filter((v) => new Date(v.at).toISOString() >= since).length,
        signups: all.length,
        confirmed: all.filter((s) => s.status === "confirmed").length,
        review: all.filter((s) => s.status === "review").length,
        firstPurchasesConfirmed: [...firstPurchases.values()].filter((f) => f.status === "confirmed" || f.status === "held").length,
        firstPurchasesRevoked: [...firstPurchases.values()].filter((f) => f.status === "revoked").length,
      };
    },

    async cumulativePaidKrw(userId) {
      let t = 0;
      for (const o of mem.orders.values()) if (o.userId === userId && o.status === "paid" && (o.provider ?? "tosspayments") === "tosspayments") t += o.amount;
      for (const p of mem.packs.values()) if (p.userId === userId) t -= p.refundedKrw;
      return Math.max(0, t);
    },

    async runMaintenance() {
      let expiredPointLots = 0;
      let expiredCreditLots = 0;
      for (const lot of pointLots) {
        if (lot.remaining > 0 && lot.expiresAt && !alive(lot.expiresAt) && claim(`point-expire:${lot.id}`)) {
          pointLedger.push({ id: pointLedger.length + 1, userId: lot.userId, opKey: `point-expire:${lot.id}`, kind: "expire", amount: -lot.remaining, lotId: lot.id, orderId: null, shortfall: 0, createdAt: stamp() });
          lot.remaining = 0;
          expiredPointLots += 1;
        }
      }
      for (const lot of creditLots) {
        if (lot.remaining > 0 && lot.expiresAt && !alive(lot.expiresAt) && claim(`credit-expire:${lot.id}`)) {
          creditLedger.push({ id: creditLedger.length + 1, userId: lot.userId, opKey: `credit-expire:${lot.id}`, kind: "expire", qty: -lot.remaining, lotId: lot.id, shortfall: 0, createdAt: stamp() });
          lot.remaining = 0;
          expiredCreditLots += 1;
        }
      }
      let earnedBackfill = 0;
      for (const o of mem.orders.values()) {
        if (o.status === "paid" && (o.provider ?? "tosspayments") === "tosspayments" && o.amount > 0 && !ops.has(`earn:${o.id}`) && now().getTime() - new Date(o.approvedAt ?? o.createdAt).getTime() < 3 * DAY) {
          earnForOrder(o);
          earnedBackfill += 1;
        }
      }
      let referralEvaluated = 0;
      let referralConfirmed = 0;
      for (const s of [...signups.values()]) {
        if ((s.status === "pending" || s.status === "review") && new Date(s.holdUntil).getTime() <= now().getTime()) {
          const r = evaluate(s.inviteeUserId);
          referralEvaluated += 1;
          if (r.status === "confirmed") referralConfirmed += 1;
        }
      }
      let referralPurchaseRewards = 0;
      for (const [, fp] of firstPurchases) {
        if (fp.status === "pending" && mem.orders.get(fp.orderId)?.status === "paid") {
          confirmReferralPurchase(fp.orderId);
          referralPurchaseRewards += 1;
        }
      }
      return { expiredPointLots, expiredCreditLots, earnedBackfill, partialRefundAdjusted: 0, referralEvaluated, referralConfirmed, referralPurchaseRewards, visitsPurged: 0, purge: "off" };
    },

    async ledgerTotals(since, until): Promise<LedgerTotals> {
      const t: LedgerTotals = { pointsEarned: 0, pointsSpent: 0, pointsExpired: 0, pointsClawed: 0, pointsShortfall: 0, pointsOutstanding: 0, creditsGranted: 0, creditsSpent: 0, creditsExpired: 0, creditsRevoked: 0, creditsShortfall: 0, creditsOutstanding: 0, pointsBySource: {}, creditsByKind: {}, lotMismatches: 0 };
      for (const l of pointLedger.filter((x) => x.createdAt >= since && (!until || x.createdAt < until))) {
        if (l.kind === "earn") t.pointsEarned += l.amount;
        else if (l.kind === "spend") t.pointsSpent += -l.amount;
        else if (l.kind === "spend_restore") t.pointsSpent -= l.amount;
        else if (l.kind === "expire") t.pointsExpired += -l.amount;
        else if (l.kind === "clawback") t.pointsClawed += -l.amount;
        t.pointsShortfall += l.shortfall;
      }
      for (const l of creditLedger.filter((x) => x.createdAt >= since && (!until || x.createdAt < until))) {
        if (l.kind === "grant") t.creditsGranted += l.qty;
        else if (l.kind === "spend") t.creditsSpent += -l.qty;
        else if (l.kind === "restore") t.creditsSpent -= l.qty;
        else if (l.kind === "expire") t.creditsExpired += -l.qty;
        else if (l.kind === "revoke") t.creditsRevoked += -l.qty;
        t.creditsShortfall += l.shortfall;
      }
      for (const l of pointLots) {
        t.pointsBySource[l.sourceKind] = (t.pointsBySource[l.sourceKind] ?? 0) + l.amount;
        if (alive(l.expiresAt)) t.pointsOutstanding += l.remaining;
        if (pointLedger.filter((x) => x.lotId === l.id).reduce((s, x) => s + x.amount, 0) !== l.remaining) t.lotMismatches += 1;
      }
      for (const l of creditLots) {
        t.creditsByKind[l.kind] = (t.creditsByKind[l.kind] ?? 0) + l.quantity;
        if (alive(l.expiresAt)) t.creditsOutstanding += l.remaining;
      }
      return t;
    },
    async listExpenses(limit) {
      return expenses.slice().reverse().slice(0, limit);
    },
    async addExpense({ month, kind, amountKrw, memo }) {
      expenses.push({ id: expenses.length + 1, month, kind, amountKrw, memo, createdAt: stamp() });
    },
    async deleteExpense(id) {
      const i = expenses.findIndex((e) => e.id === id);
      if (i >= 0) expenses.splice(i, 1);
    },
    async listAiQuestionCosts(since, limit): Promise<AiQuestionCostRow[]> {
      return mem.aiUsage
        .filter((u) => u.purpose === "chat" && u.createdAt >= since)
        .slice(-limit)
        .map((u) => ({ requestKey: u.requestKey ?? null, creditSource: u.creditSource ?? null, roomKey: u.roomKey ?? null, estCostKrw: u.estCostKrw, outcome: u.outcome, createdAt: u.createdAt }));
    },
  };

  return {
    repo,
    /** 시험용: 가입 시각을 정한다(추천 가입의 신규 회원 · 추천인 가입 직후 위험 신호 판단) */
    setJoinedAt: (userId: string, at: Date) => void joined.set(userId, at.getTime()),
    /** 시험용: 계정 확인이 안 된 회원으로 만든다 */
    setUnconfirmed: (userId: string) => void unconfirmedUsers.add(userId),
    settings,
    pointLots,
    pointLedger,
    creditLots,
    creditLedger,
    signups,
    firstPurchases,
    failures,
    ops,
    grants,
  };
}
