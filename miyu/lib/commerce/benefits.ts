// 통합 혜택(쿠폰 · 미유 포인트 · 질문권 · 친구 추천 · 구매 적립)의 순수 규칙 — React · Next · 외부 SDK를 불러오지 않는다.
//
// 값(적립률 · 교환가 · 유효기간 · 추천 가격 …)의 기준은 DB의 benefit_settings(관리자가 바꾸고 변경 이력이 남는다)이며, 여기의 기본값은 마이그레이션 19번의 기본값과 같다.
// 이 파일은 설정을 읽어 해석하고 · 검사하고 · 화면에 쓸 이름을 정하고 · 결제 전 견적(정가 · 할인 선택지 · 사유)을 만든다. 지급 · 차감의 진짜 기준은 DB 함수이며 여기서 계산한 값을 지급에 쓰지 않는다.
//
// 지키는 것 (운영자 결정 2026-10-17):
// - 할인은 자동으로 겹쳐 적용하지 않는다. 조건이 되는 할인이 둘 이상이면 고객이 고른다(서버는 조용히 하나를 고르지 않는다).
// - 요청한 할인의 자격이 없으면 사유와 정가를 보이고, 고객이 금액을 확인한 뒤에만 결제로 넘어간다. **서버 오류는 "할인 불가"가 아니다**(오류 안내 + 다시 시도).
// - 포인트 교환가는 현금 결제와 구분해 보인다(원화로 환산해 적립금처럼 보이지 않는다).

export const BENEFIT_FEATURES = ["points_earn", "points_spend", "coupons", "referral", "referral_signup_points", "referral_purchase_credits", "review_reward"] as const;
export type BenefitFeature = (typeof BENEFIT_FEATURES)[number];

export type EarnTier = { fromKrw: number; rate: number };

export type BenefitSettings = {
  features: Record<BenefitFeature, boolean>;
  earnTiers: EarnTier[];
  /** 상품별 포인트 교환가(P). 코드가 계산하지 않고 설정에 명시 저장한다 */
  pointPrices: Record<string, number>;
  /** 0이면 만료 없음 */
  pointExpireDays: number;
  creditExpireDays: number;
  restoreGraceDays: number;
  referral: {
    inviteePrice: number;
    signupPoints: number;
    holdHours: number;
    inviterCredits: number;
    inviteeCredits: number;
    newMemberHours: number;
    maxConfirmedPerInviterPerDay: number;
    risk: { burstPerHour: number; minVisitSeconds: number; youngInviterMinutes: number };
  };
  review: { rewardCredits: number; minBodyChars: number };
  /** 탈퇴한 회원의 혜택 장부 보관 일수. null = 정리하지 않음(법률 검토로 정한다) */
  withdrawnLedgerRetentionDays: number | null;
};

/** 마이그레이션 19번 기본값과 같다(혜택은 모두 꺼진 채로 시작한다) */
export const DEFAULT_BENEFIT_SETTINGS: BenefitSettings = {
  features: { points_earn: false, points_spend: false, coupons: false, referral: false, referral_signup_points: false, referral_purchase_credits: false, review_reward: false },
  earnTiers: [
    { fromKrw: 0, rate: 0.03 },
    { fromKrw: 100_000, rate: 0.03 },
    { fromKrw: 300_000, rate: 0.05 },
    { fromKrw: 700_000, rate: 0.07 },
    { fromKrw: 1_000_000, rate: 0.1 },
  ],
  pointPrices: { "personal-integrated-report": 11_900 },
  pointExpireDays: 365,
  creditExpireDays: 365,
  restoreGraceDays: 7,
  referral: {
    inviteePrice: 6_900,
    signupPoints: 500,
    holdHours: 72,
    inviterCredits: 1,
    inviteeCredits: 1,
    newMemberHours: 48,
    maxConfirmedPerInviterPerDay: 20,
    risk: { burstPerHour: 10, minVisitSeconds: 10, youngInviterMinutes: 60 },
  },
  review: { rewardCredits: 1, minBodyChars: 20 },
  withdrawnLedgerRetentionDays: null,
};

const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const flag = (v: unknown): boolean => v === true;

/** 설정 행(키 → 값)을 읽는다 — 값이 없거나 모양이 틀리면 기본값으로 두어 화면이 깨지지 않게 한다 */
export function parseBenefitSettings(raw: Record<string, unknown>): BenefitSettings {
  const d = DEFAULT_BENEFIT_SETTINGS;
  const tiers = Array.isArray(raw["earn.tiers"])
    ? (raw["earn.tiers"] as unknown[])
        .map((t) => ({ fromKrw: num((t as EarnTier)?.fromKrw, NaN), rate: num((t as EarnTier)?.rate, NaN) }))
        .filter((t) => Number.isFinite(t.fromKrw) && Number.isFinite(t.rate))
        .sort((a, b) => a.fromKrw - b.fromKrw)
    : d.earnTiers;
  const prices = raw["point.prices"];
  const pointPrices: Record<string, number> = {};
  if (prices && typeof prices === "object" && !Array.isArray(prices)) {
    for (const [k, v] of Object.entries(prices as Record<string, unknown>)) if (typeof v === "number" && Number.isInteger(v) && v > 0) pointPrices[k] = v;
  }
  const retention = raw["benefit.withdrawn_ledger_retention_days"];
  return {
    features: Object.fromEntries(BENEFIT_FEATURES.map((f) => [f, flag(raw[`feature.${f}`])])) as Record<BenefitFeature, boolean>,
    earnTiers: tiers.length > 0 ? tiers : d.earnTiers,
    pointPrices: Object.keys(pointPrices).length > 0 ? pointPrices : d.pointPrices,
    pointExpireDays: num(raw["point.expire_days"], d.pointExpireDays),
    creditExpireDays: num(raw["credit.expire_days"], d.creditExpireDays),
    restoreGraceDays: num(raw["point.restore_grace_days"], d.restoreGraceDays),
    referral: {
      inviteePrice: num(raw["referral.invitee_price"], d.referral.inviteePrice),
      signupPoints: num(raw["referral.signup_points"], d.referral.signupPoints),
      holdHours: num(raw["referral.hold_hours"], d.referral.holdHours),
      inviterCredits: num(raw["referral.inviter_credits"], d.referral.inviterCredits),
      inviteeCredits: num(raw["referral.invitee_credits"], d.referral.inviteeCredits),
      newMemberHours: num(raw["referral.new_member_hours"], d.referral.newMemberHours),
      maxConfirmedPerInviterPerDay: num(raw["referral.max_confirmed_per_inviter_per_day"], d.referral.maxConfirmedPerInviterPerDay),
      risk: {
        burstPerHour: num(raw["referral.risk.burst_per_hour"], d.referral.risk.burstPerHour),
        minVisitSeconds: num(raw["referral.risk.min_visit_seconds"], d.referral.risk.minVisitSeconds),
        youngInviterMinutes: num(raw["referral.risk.young_inviter_minutes"], d.referral.risk.youngInviterMinutes),
      },
    },
    review: { rewardCredits: num(raw["review.reward_credits"], d.review.rewardCredits), minBodyChars: num(raw["review.min_body_chars"], d.review.minBodyChars) },
    withdrawnLedgerRetentionDays: typeof retention === "number" && retention > 0 ? retention : null,
  };
}

// ── 관리자 설정 화면 ───────────────────────────────

export type SettingGroup = "switch" | "earn" | "point" | "credit" | "referral" | "risk" | "review" | "retention";
export type SettingKind = "flag" | "int" | "tiers" | "prices";
export type SettingField = {
  key: string;
  label: string;
  description: string;
  group: SettingGroup;
  kind: SettingKind;
  /** 숫자 설정의 허용 범위 */
  min?: number;
  max?: number;
  unit?: string;
};

export const SETTING_GROUP_LABEL: Record<SettingGroup, string> = {
  switch: "켜고 끄기",
  earn: "구매 적립",
  point: "미유 포인트",
  credit: "질문권",
  referral: "친구 추천",
  risk: "추천 위험 신호 기준",
  review: "후기 보상",
  retention: "탈퇴 회원 장부",
};

export const SETTING_FIELDS: readonly SettingField[] = [
  { key: "feature.points_earn", label: "구매 적립 포인트", description: "결제 완료 주문에 적립 포인트를 줍니다. 끄면 새 적립만 멈추고 이미 준 포인트는 그대로입니다. 끈 동안 결제된 주문은 켜도 소급해서 주지 않습니다.", group: "switch", kind: "flag" },
  { key: "feature.points_spend", label: "포인트로 리포트 교환", description: "포인트로 개인 심층 리포트를 교환하는 기능입니다.", group: "switch", kind: "flag" },
  { key: "feature.coupons", label: "쿠폰", description: "쿠폰 코드 사용(할인 · 무료 이용권 · 질문권)을 엽니다.", group: "switch", kind: "flag" },
  { key: "feature.referral", label: "친구 추천(링크 · 추천 가격)", description: "켜면 새 추천 방식(추천 가입 기록 · 추천 가격)을 씁니다. 끄면 기존 초대 할인(5,900원 · 3명)이 그대로 동작합니다.", group: "switch", kind: "flag" },
  { key: "feature.referral_signup_points", label: "추천 가입 포인트", description: "추천받은 친구의 가입이 검증(계정 확인 · 무료 분석 완료 · 위험 신호 없음)을 통과하면 추천인에게 포인트를 줍니다.", group: "switch", kind: "flag" },
  { key: "feature.referral_purchase_credits", label: "친구 첫 구매 질문권", description: "추천받은 친구가 첫 심층 리포트를 결제하면 추천인 · 구매자에게 질문권을 줍니다.", group: "switch", kind: "flag" },
  { key: "feature.review_reward", label: "후기 보상 질문권", description: "후기 작성 보상(질문권 1개)을 줍니다. 후기 시스템이 만들어지기 전에는 지급되지 않습니다.", group: "switch", kind: "flag" },
  { key: "earn.tiers", label: "누적 결제액별 적립률", description: "누적 유효 현금 결제액 구간별 적립률입니다(등급 도달 다음 구매부터 · 소급 없음). 10만~30만원 구간은 운영자 확정 전이라 기본 3%입니다.", group: "earn", kind: "tiers" },
  { key: "point.prices", label: "포인트 교환가(상품별)", description: "상품별 교환 포인트입니다. 현금 가격에서 계산하지 않고 이 값을 그대로 씁니다.", group: "point", kind: "prices" },
  { key: "point.expire_days", label: "포인트 유효기간", description: "지급일로부터 며칠 뒤 소멸하는지입니다. 0이면 소멸하지 않습니다. 지급할 때의 값이 그 포인트에 박힙니다.", group: "point", kind: "int", min: 0, max: 3650, unit: "일" },
  { key: "point.restore_grace_days", label: "사용 취소 포인트 유예", description: "교환을 취소해 되돌릴 때 원래 포인트가 이미 만료됐다면 새 포인트로 돌려주는 유효 일수입니다.", group: "point", kind: "int", min: 1, max: 90, unit: "일" },
  { key: "credit.expire_days", label: "보상 질문권 유효기간", description: "지급일로부터 며칠입니다. 0이면 소멸하지 않습니다.", group: "credit", kind: "int", min: 0, max: 3650, unit: "일" },
  { key: "referral.invitee_price", label: "친구 첫 구매 가격", description: "추천받은 친구의 첫 개인 심층 리포트 결제 금액입니다(정가는 상품 설정).", group: "referral", kind: "int", min: 100, max: 9900, unit: "원" },
  { key: "referral.signup_points", label: "추천 가입 포인트", description: "검증을 통과한 추천 가입 1명당 추천인에게 주는 포인트입니다.", group: "referral", kind: "int", min: 0, max: 5000, unit: "P" },
  { key: "referral.hold_hours", label: "지급 확정 전 보류 시간", description: "가입 뒤 이 시간이 지나야 포인트 지급을 확정합니다(0이면 조건을 채우는 즉시).", group: "referral", kind: "int", min: 0, max: 720, unit: "시간" },
  { key: "referral.inviter_credits", label: "친구 첫 구매 — 추천인 질문권", description: "추천받은 친구가 결제를 마치면 추천인에게 주는 질문권 수입니다.", group: "referral", kind: "int", min: 0, max: 10, unit: "개" },
  { key: "referral.invitee_credits", label: "친구 첫 구매 — 구매자 질문권", description: "결제를 마친 친구에게 주는 질문권 수입니다.", group: "referral", kind: "int", min: 0, max: 10, unit: "개" },
  { key: "referral.new_member_hours", label: "신규 회원으로 보는 시간", description: "가입한 지 이 시간 안이고 구매한 적이 없어야 추천 가입으로 셉니다.", group: "referral", kind: "int", min: 1, max: 720, unit: "시간" },
  { key: "referral.max_confirmed_per_inviter_per_day", label: "추천인별 하루 지급 확정 한도", description: "한 추천인에게 하루 안에 확정하는 추천 가입 수의 상한입니다. 넘으면 관리자 확인으로 올립니다.", group: "referral", kind: "int", min: 1, max: 1000, unit: "명" },
  { key: "referral.risk.burst_per_hour", label: "한 링크 1시간 가입 수", description: "한 추천 링크로 1시간 안에 이 수 이상 가입하면 위험 신호입니다.", group: "risk", kind: "int", min: 1, max: 1000, unit: "명" },
  { key: "referral.risk.min_visit_seconds", label: "링크 방문 → 가입 최소 시간", description: "링크를 처음 연 뒤 이보다 빨리 가입하면 위험 신호입니다.", group: "risk", kind: "int", min: 0, max: 600, unit: "초" },
  { key: "referral.risk.young_inviter_minutes", label: "추천인 가입 직후 기준", description: "추천인 계정이 가입한 지 이 시간 안에 퍼뜨린 링크는 위험 신호입니다.", group: "risk", kind: "int", min: 0, max: 1440, unit: "분" },
  { key: "review.reward_credits", label: "후기 보상 질문권 수", description: "후기 1건당 주는 질문권 수입니다.", group: "review", kind: "int", min: 0, max: 10, unit: "개" },
  { key: "review.min_body_chars", label: "후기 최소 글자 수", description: "빈 후기로 보상을 받는 것을 막는 기준입니다. 별점 · 내용 방향과 무관하게 같습니다.", group: "review", kind: "int", min: 0, max: 200, unit: "자" },
];

export type SettingCheck = { ok: true; value: unknown } | { ok: false; message: string };

/** 관리자가 보낸 값을 저장하기 전에 확인한다(DB에도 형식 확인이 있지만 잘못된 설정이 지급 · 가격에 쓰이기 전에 여기서 막는다) */
export function validateSettingValue(key: string, raw: unknown): SettingCheck {
  const field = SETTING_FIELDS.find((f) => f.key === key);
  if (!field) return { ok: false, message: "알 수 없는 설정입니다." };
  switch (field.kind) {
    case "flag":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false, message: "켬 · 끔 중 하나여야 합니다." };
    case "int": {
      if (typeof raw !== "number" || !Number.isInteger(raw)) return { ok: false, message: "정수만 쓸 수 있습니다." };
      if (field.min !== undefined && raw < field.min) return { ok: false, message: `${field.min}${field.unit ?? ""} 이상이어야 합니다.` };
      if (field.max !== undefined && raw > field.max) return { ok: false, message: `${field.max}${field.unit ?? ""} 이하여야 합니다.` };
      return { ok: true, value: raw };
    }
    case "tiers": {
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > 12) return { ok: false, message: "구간은 1~12개여야 합니다." };
      const tiers: EarnTier[] = [];
      for (const t of raw) {
        const r = (t as { rate?: unknown } | null)?.rate;
        const f = (t as { fromKrw?: unknown } | null)?.fromKrw;
        if (typeof f !== "number" || !Number.isInteger(f) || f < 0) return { ok: false, message: "구간 시작 금액은 0 이상의 정수여야 합니다." };
        if (typeof r !== "number" || !(r >= 0 && r <= 0.2)) return { ok: false, message: "적립률은 0~20% 사이여야 합니다." };
        tiers.push({ fromKrw: f, rate: r });
      }
      tiers.sort((a, b) => a.fromKrw - b.fromKrw);
      if (tiers[0].fromKrw !== 0) return { ok: false, message: "첫 구간은 0원부터 시작해야 합니다." };
      for (let i = 1; i < tiers.length; i++) if (tiers[i].fromKrw === tiers[i - 1].fromKrw) return { ok: false, message: "같은 시작 금액이 두 번 있습니다." };
      return { ok: true, value: tiers };
    }
    case "prices": {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: "상품별 교환가 목록이어야 합니다." };
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!/^[a-z0-9:_-]{3,60}$/.test(k)) return { ok: false, message: `상품 번호가 올바르지 않습니다: ${k}` };
        if (typeof v !== "number" || !Number.isInteger(v) || v < 100 || v > 1_000_000) return { ok: false, message: "교환가는 100~1,000,000 사이의 정수여야 합니다." };
        out[k] = v;
      }
      return Object.keys(out).length > 0 ? { ok: true, value: out } : { ok: false, message: "교환가가 하나도 없습니다." };
    }
  }
}

// ── 적립 · 만료 ───────────────────────────────

/** 이 누적액(그 주문 이전의 누적 유효 현금 결제액)에서의 적립률 */
export function tierRateFor(tiers: readonly EarnTier[], cumulativeKrw: number): number {
  let rate = 0;
  for (const t of [...tiers].sort((a, b) => a.fromKrw - b.fromKrw)) if (t.fromKrw <= Math.max(0, cumulativeKrw)) rate = t.rate;
  return rate;
}

/** 이 주문에서 받을 적립 — DB의 earn_purchase_points와 같은 계산(소수점 버림). 화면 안내 · 시험용이며 지급은 DB가 한다 */
export function earnFor(orderAmountKrw: number, cumulativeBeforeKrw: number, tiers: readonly EarnTier[]): { rate: number; points: number } {
  const rate = tierRateFor(tiers, cumulativeBeforeKrw);
  return { rate, points: Math.floor(orderAmountKrw * rate) };
}

/** 지금 누적액에서 다음 구간까지(없으면 null) — 불안 · 압박 문구 없이 담담하게 보이는 용도 */
export function nextTier(tiers: readonly EarnTier[], cumulativeKrw: number): { fromKrw: number; rate: number; remainingKrw: number } | null {
  const higher = [...tiers].sort((a, b) => a.fromKrw - b.fromKrw).find((t) => t.fromKrw > Math.max(0, cumulativeKrw) && t.rate > tierRateFor(tiers, cumulativeKrw));
  return higher ? { fromKrw: higher.fromKrw, rate: higher.rate, remainingKrw: higher.fromKrw - Math.max(0, cumulativeKrw) } : null;
}

export const DAY_MS = 86_400_000;

/** 지급 시각 + 유효 일수 → 만료 시각(0 이하면 만료 없음 = null) */
export function expiryFrom(now: Date, days: number): string | null {
  return days > 0 ? new Date(now.getTime() + days * DAY_MS).toISOString() : null;
}

/** 만료까지 남은 일수(올림, 이미 지났으면 0, 만료 없음이면 null) */
export function daysUntil(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null;
  const left = new Date(expiresAt).getTime() - now.getTime();
  return left <= 0 ? 0 : Math.ceil(left / DAY_MS);
}

// ── 화면 이름 ─────────────────────────────────

export const CREDIT_KIND_LABEL: Record<string, string> = {
  promo: "프로모션 질문권",
  review: "후기 보상 질문권",
  referral_inviter: "친구 추천 질문권",
  referral_invitee: "첫 구매 보상 질문권",
  event: "이벤트 질문권",
  admin: "운영 지급 질문권",
};

export const POINT_SOURCE_LABEL: Record<string, string> = {
  purchase: "구매 적립",
  referral_signup: "친구 추천",
  admin: "운영 지급",
  event: "이벤트",
  coupon: "쿠폰",
  restore: "교환 취소 복원",
};

export const POINT_LEDGER_LABEL: Record<string, string> = {
  earn: "적립",
  spend: "교환에 사용",
  spend_restore: "교환 취소로 돌려받음",
  expire: "유효기간 지나 소멸",
  clawback: "환불로 회수",
  forfeit: "탈퇴로 소멸",
  adjust: "운영 정정",
};

export const CREDIT_LEDGER_LABEL: Record<string, string> = {
  grant: "지급",
  spend: "질문에 사용",
  restore: "사용 취소로 돌려받음",
  expire: "유효기간 지나 소멸",
  revoke: "환불로 회수",
  forfeit: "탈퇴로 소멸",
};

export const REFERRAL_STATUS_LABEL: Record<string, string> = {
  pending: "확인 중",
  review: "운영자 확인 중",
  confirmed: "확정",
  rejected: "지급하지 않음",
  revoked: "취소됨",
};

export const RISK_LABEL: Record<string, string> = {
  same_device_repeat: "같은 기기에서 반복 가입",
  too_fast: "링크를 열고 너무 빨리 가입",
  burst: "짧은 시간에 많은 가입",
  young_inviter: "추천인 계정이 가입 직후",
  daily_cap: "하루 지급 한도 초과",
};

// ── 결제 전 견적 ───────────────────────────────

export type CouponCheckOk = { ok: true; couponId: string; type: string; value: number; purpose: string; stackableWithReferral: boolean; creditExpireDays: number | null; name: string };
export type CouponCheckFail = { ok: false; reason: string };
export type CouponCheck = CouponCheckOk | CouponCheckFail;
export type ReferralCheck = { ok: true; price: number; inviterUserId: string } | { ok: false; reason: string };

export const COUPON_REASON_TEXT: Record<string, string> = {
  "feature-off": "지금은 쿠폰을 쓸 수 없어요.",
  "not-found": "입력한 쿠폰 코드를 찾지 못했어요. 코드를 다시 확인해 주세요.",
  inactive: "지금은 사용할 수 없는 쿠폰이에요.",
  "not-started": "아직 사용 기간이 시작되지 않은 쿠폰이에요.",
  ended: "사용 기간이 지난 쿠폰이에요.",
  product: "이 상품에는 쓸 수 없는 쿠폰이에요.",
  user: "다른 분 전용 쿠폰이에요.",
  "user-limit": "이미 사용한 쿠폰이에요.",
  "sold-out": "준비된 수량이 모두 사용된 쿠폰이에요.",
  type: "이 방식으로는 쓸 수 없는 쿠폰이에요.",
  "not-free": "무료로 받을 수 있는 쿠폰이 아니에요.",
  "order-mismatch": "주문 정보가 맞지 않아 쿠폰을 쓰지 못했어요.",
};

export const REFERRAL_REASON_TEXT: Record<string, string> = {
  "feature-off": "지금은 친구 추천 가격을 쓸 수 없어요.",
  "no-signup": "친구 추천 링크로 가입한 기록이 없어 추천 가격을 적용할 수 없어요.",
  "signup-rejected": "추천 가입 확인이 끝나지 않아 추천 가격을 적용할 수 없어요.",
  "not-first": "추천 가격은 첫 심층 리포트 구매에만 적용돼요.",
  used: "이미 추천 가격으로 구매하셨어요.",
  "order-mismatch": "주문 정보가 맞지 않아 추천 가격을 적용하지 못했어요.",
};

/** 쿠폰이 정가에 주는 최종 결제 금액 */
export function couponPrice(type: string, value: number, baseKrw: number): number | null {
  switch (type) {
    case "free-product":
    case "free-report-entitlement":
      return 0;
    case "amount":
      return Math.max(0, baseKrw - value);
    case "percent":
      return Math.max(0, baseKrw - Math.floor((baseKrw * value) / 100));
    default:
      return null;
  }
}

export type PriceOptionKind = "list" | "referral" | "coupon" | "referral+coupon" | "points";
export type PriceOption = {
  kind: PriceOptionKind;
  label: string;
  /** 현금 결제 금액(원). points면 0 */
  amountKrw: number;
  /** 정가에서 줄어든 금액 */
  discountKrw: number;
  /** points 선택지의 교환 포인트 */
  points?: number;
  /** 0원이면 결제사를 거치지 않는 무료 제공 경로(쿠폰 · 포인트 교환) */
  free: boolean;
  couponCode?: string;
  note?: string;
};

export type QuoteDenied = { kind: "referral" | "coupon"; reason: string; message: string };

export type CheckoutQuote = {
  listKrw: number;
  options: PriceOption[];
  /** 요청했지만 적격이 아닌 할인과 사유 — 비어 있지 않으면 고객이 사유 · 정가를 보고 확인해야 결제한다 */
  denied: QuoteDenied[];
  /** 적격인 할인이 둘 이상이라 고객이 하나를 골라야 한다(서버는 조용히 고르지 않는다) */
  needsChoice: boolean;
  /** 적격 할인이 없는데 요청한 할인이 거절됨 — 정가 확인 필요 */
  needsListConfirmation: boolean;
  /** 포인트 교환이 안 되는 이유 · 모자라는 포인트(교환이 켜져 있을 때만) */
  pointsShortfall: number | null;
};

export type QuoteInput = {
  listKrw: number;
  /** 추천 가격을 요청한 경우(추천 링크로 가입함 등)의 서버 확인 결과. 요청하지 않았으면 null */
  referral: ReferralCheck | null;
  /** 쿠폰 코드를 입력한 경우 서버 확인 결과와 입력한 코드. 입력하지 않았으면 null */
  coupon: { code: string; check: CouponCheck } | null;
  /** 포인트 교환이 열려 있고 이 상품의 교환가가 있을 때 */
  points: { price: number; balance: number } | null;
};

export function buildQuote(input: QuoteInput): CheckoutQuote {
  const { listKrw } = input;
  const options: PriceOption[] = [{ kind: "list", label: "정가로 결제", amountKrw: listKrw, discountKrw: 0, free: false }];
  const denied: QuoteDenied[] = [];

  const referral = input.referral && input.referral.ok ? input.referral : null;
  if (input.referral && !input.referral.ok) denied.push({ kind: "referral", reason: input.referral.reason, message: REFERRAL_REASON_TEXT[input.referral.reason] ?? "추천 가격을 적용할 수 없어요." });
  if (referral) {
    options.push({ kind: "referral", label: "친구 추천 가격", amountKrw: referral.price, discountKrw: Math.max(0, listKrw - referral.price), free: referral.price === 0 });
  }

  if (input.coupon) {
    const c = input.coupon.check;
    if (!c.ok) {
      denied.push({ kind: "coupon", reason: c.reason, message: COUPON_REASON_TEXT[c.reason] ?? "쿠폰을 적용할 수 없어요." });
    } else {
      const price = couponPrice(c.type, c.value, listKrw);
      if (price === null) {
        denied.push({ kind: "coupon", reason: "type", message: COUPON_REASON_TEXT.type });
      } else {
        options.push({ kind: "coupon", label: `쿠폰 적용 (${c.name})`, amountKrw: price, discountKrw: listKrw - price, free: price === 0, couponCode: input.coupon.code });
        // 추천 가격과 함께 쓸 수 있는 쿠폰만 겹친다(자동 중복 적용 없음 — 고객이 이 선택지를 고른다)
        if (referral && c.stackableWithReferral) {
          const stacked = couponPrice(c.type, c.value, referral.price) ?? referral.price;
          options.push({ kind: "referral+coupon", label: `추천 가격 + 쿠폰 (${c.name})`, amountKrw: stacked, discountKrw: listKrw - stacked, free: stacked === 0, couponCode: input.coupon.code });
        }
      }
    }
  }

  let pointsShortfall: number | null = null;
  if (input.points) {
    if (input.points.balance >= input.points.price) {
      options.push({ kind: "points", label: "미유 포인트로 교환", amountKrw: 0, discountKrw: listKrw, points: input.points.price, free: true, note: "포인트 전액으로 교환해요(현금과 섞어 쓰지 않아요)." });
    } else {
      pointsShortfall = input.points.price - input.points.balance;
    }
  }

  const discounts = options.filter((o) => o.kind !== "list" && o.kind !== "points");
  return {
    listKrw,
    options,
    denied,
    needsChoice: discounts.length > 1,
    needsListConfirmation: denied.length > 0 && discounts.length === 0,
    pointsShortfall,
  };
}

/** 고객이 고른 선택지가 견적에 실제로 있는지 — 브라우저가 보낸 금액 · 종류를 믿지 않고 서버가 다시 만든 견적에서만 고른다 */
export function pickOption(quote: CheckoutQuote, kind: PriceOptionKind): PriceOption | null {
  return quote.options.find((o) => o.kind === kind) ?? null;
}

/**
 * 쿠폰 기간(시작 · 끝) 읽기 — 시간대 없는 값("2026-11-01T00:00")은 한국 시간으로 본다(서버는 UTC라 그대로 저장하면 9시간 어긋난다).
 * 비어 있으면 null(제한 없음), 날짜로 읽을 수 없으면 undefined(오류).
 */
export function couponTimeOf(raw: string): string | null | undefined {
  if (!raw) return null;
  const withZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw) ? `${raw.length === 16 ? `${raw}:00` : raw}+09:00` : raw;
  const t = new Date(withZone);
  return Number.isNaN(t.getTime()) ? undefined : t.toISOString();
}
