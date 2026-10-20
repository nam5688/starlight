// 혜택 관리자 화면에서 쓰는 이름 · 값 표시 — 순수 함수(React · Next 없음).

import { SETTING_FIELDS, type BenefitFeature, type BenefitSettings } from "@/lib/commerce/benefits";
import type { Assumptions } from "@/lib/commerce/profit";
import { formatKrw } from "@/lib/config/product";

// ── 쿠폰 ─────────────────────────────────────

export const COUPON_TYPE_LABEL: Record<string, string> = {
  amount: "정액 할인",
  percent: "정률 할인",
  "free-product": "상품 100% 할인",
  "free-report-entitlement": "무료 이용권",
  credit: "질문권 지급",
};

/** 종류 + 값을 한 줄로(예: 정액 할인 · 5,000원) */
export function couponValueText(type: string, value: number): string {
  const name = COUPON_TYPE_LABEL[type] ?? type;
  if (type === "amount") return `${name} · ${formatKrw(value)}`;
  if (type === "percent") return `${name} · ${value}%`;
  if (type === "credit") return `${name} · ${value}개`;
  return name;
}

export const COUPON_STATUS_LABEL: Record<string, string> = {
  draft: "초안 · 아직 쓰이지 않아요",
  active: "사용 중",
  paused: "잠시 멈춤",
  revoked: "폐기됨",
};

export const COUPON_PURPOSE_LABEL: Record<string, string> = {
  promo: "프로모션",
  trial: "체험",
  cs: "고객 응대 보상",
  event: "이벤트",
};

// ── 혜택 주문(0원) ───────────────────────────

export const GRANT_KIND_LABEL: Record<string, string> = {
  coupon: "쿠폰",
  points: "포인트 교환",
  admin: "운영 지급",
};

export const GRANT_RELEASE_LABEL: Record<string, string> = {
  restore: "되돌림(포인트 돌려줌)",
  revoke: "이용 회수",
};

/** 혜택 주문의 주문 상태(결제사 없이 만들어진 0원 주문이라 '결제'라고 쓰지 않는다) */
export const BENEFIT_ORDER_STATUS_LABEL: Record<string, string> = {
  paid: "제공 완료",
  pending: "처리 중",
  failed: "실패",
  canceled: "취소됨",
  refunded: "되돌림",
};

export const CREDIT_SOURCE_LABEL: Record<string, string> = {
  free: "무료 질문",
  reward: "보상 질문권",
  paid: "결제한 질문",
  unknown: "구분 없음",
};

// ── 설정 값 ──────────────────────────────────

/** 설정 키 → 지금 값(파싱된 설정에서). 설정 필드가 늘면 여기에도 더한다 */
export function settingValue(settings: BenefitSettings, key: string): unknown {
  if (key.startsWith("feature.")) return settings.features[key.slice("feature.".length) as BenefitFeature];
  switch (key) {
    case "earn.tiers":
      return settings.earnTiers;
    case "point.prices":
      return settings.pointPrices;
    case "point.expire_days":
      return settings.pointExpireDays;
    case "point.restore_grace_days":
      return settings.restoreGraceDays;
    case "credit.expire_days":
      return settings.creditExpireDays;
    case "referral.invitee_price":
      return settings.referral.inviteePrice;
    case "referral.signup_points":
      return settings.referral.signupPoints;
    case "referral.hold_hours":
      return settings.referral.holdHours;
    case "referral.inviter_credits":
      return settings.referral.inviterCredits;
    case "referral.invitee_credits":
      return settings.referral.inviteeCredits;
    case "referral.new_member_hours":
      return settings.referral.newMemberHours;
    case "referral.max_confirmed_per_inviter_per_day":
      return settings.referral.maxConfirmedPerInviterPerDay;
    case "referral.risk.burst_per_hour":
      return settings.referral.risk.burstPerHour;
    case "referral.risk.min_visit_seconds":
      return settings.referral.risk.minVisitSeconds;
    case "referral.risk.young_inviter_minutes":
      return settings.referral.risk.youngInviterMinutes;
    case "review.reward_credits":
      return settings.review.rewardCredits;
    case "review.min_body_chars":
      return settings.review.minBodyChars;
    default:
      return undefined;
  }
}

/** 0이 "끔 · 없음"을 뜻하는 설정의 풀이 */
const ZERO_MEANS: Record<string, string> = {
  "point.expire_days": "소멸하지 않음",
  "credit.expire_days": "소멸하지 않음",
  "referral.hold_hours": "조건을 채우는 즉시 확정",
};

const pctText = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

/** 설정 한 줄의 값을 사람이 읽는 글로(이력 · 현재 값 공통) */
export function formatSettingValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "(없음)";
  const field = SETTING_FIELDS.find((f) => f.key === key);
  if (typeof value === "boolean") return value ? "켜짐" : "꺼짐";
  if (typeof value === "number") {
    const base = `${value.toLocaleString("ko-KR")}${field?.unit ?? ""}`;
    return value === 0 && ZERO_MEANS[key] ? `${base} (${ZERO_MEANS[key]})` : base;
  }
  if (Array.isArray(value)) {
    const tiers = value.filter((t): t is { fromKrw: number; rate: number } => typeof t?.fromKrw === "number" && typeof t?.rate === "number");
    if (tiers.length === value.length && tiers.length > 0) return tiers.map((t) => `${t.fromKrw.toLocaleString("ko-KR")}원~ ${pctText(t.rate)}`).join(" · ");
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 0 && entries.every(([, v]) => typeof v === "number")) return entries.map(([k, v]) => `${k} ${(v as number).toLocaleString("ko-KR")}P`).join(" · ");
  }
  return JSON.stringify(value);
}

export const zeroMeaning = (key: string): string | null => ZERO_MEANS[key] ?? null;

// ── 손익 가정값 ──────────────────────────────

export type AssumptionUnit = "krw" | "pct" | "count" | "point" | "text";

export const ASSUMPTION_LABELS: Record<keyof Assumptions, { label: string; unit: AssumptionUnit }> = {
  listPriceKrw: { label: "개인 심층 리포트 정가", unit: "krw" },
  invitePriceKrw: { label: "추천받은 친구의 첫 구매 가격", unit: "krw" },
  questionPackPriceKrw: { label: "질문 3개 묶음 가격", unit: "krw" },
  sajuCompatPriceKrw: { label: "사주 궁합 가격", unit: "krw" },
  reportCompatPriceKrw: { label: "리포트 궁합 가격(한 쌍 한 번)", unit: "krw" },
  vatMode: { label: "과세 유형", unit: "text" },
  simpleValueAddedRate: { label: "간이과세 부가가치율", unit: "pct" },
  pgFeeRate: { label: "결제 수수료율", unit: "pct" },
  refundRate: { label: "환불률", unit: "pct" },
  aiReportCostKrw: { label: "심층 리포트 한 건 AI 원가", unit: "krw" },
  aiCompatCostKrw: { label: "궁합 한 건 AI 원가", unit: "krw" },
  aiQuestionCostKrw: { label: "질문 1회 AI 원가", unit: "krw" },
  deepFreeQuestions: { label: "심층 리포트 회원의 무료 질문 수(방 8개 × 3)", unit: "count" },
  deepQuestionUsageRate: { label: "심층 리포트 회원의 무료 질문 사용률", unit: "pct" },
  freeRoomQuestions: { label: "무료 리포트 회원의 무료 질문 수", unit: "count" },
  freeQuestionUsageRate: { label: "무료 리포트 회원의 무료 질문 사용률", unit: "pct" },
  tasteReportCostKrw: { label: "맛보기 리포트 한 번 AI 원가", unit: "krw" },
  tasteReportShare: { label: "맛보기 리포트를 받는 무료 이용자 비율", unit: "pct" },
  freeToPaidRate: { label: "무료 이용자 → 심층 리포트 구매 전환율", unit: "pct" },
  reportPointPrice: { label: "심층 리포트 포인트 교환가", unit: "point" },
  pointUsageRate: { label: "발행 포인트 사용률", unit: "pct" },
  pointCannibalization: { label: "포인트 교환이 현금 구매를 대신한 비율(잠식)", unit: "pct" },
  signupRewardPoints: { label: "추천 가입 보상 포인트", unit: "point" },
  referralSignupToBuyRate: { label: "추천 가입 → 첫 구매 전환율", unit: "pct" },
  signupConfirmRate: { label: "추천 가입 중 검증을 통과해 확정되는 비율", unit: "pct" },
  creditUsageRate: { label: "지급한 질문권 사용률", unit: "pct" },
  reviewRate: { label: "구매자 중 후기를 쓰는 비율", unit: "pct" },
  adCostPerBuyerKrw: { label: "구매자 1명당 광고비", unit: "krw" },
  fixedMonthlyKrw: { label: "월 고정비(서버 · 도구)", unit: "krw" },
  rentMonthlyKrw: { label: "월 임대료", unit: "krw" },
  monthlyBuyers: { label: "월 구매자 수", unit: "count" },
};

const VAT_MODE_LABEL: Record<string, string> = { general: "일반과세", simple: "간이과세", "simple-exempt": "간이과세(납부 면제 구간)" };

export const vatModeLabel = (mode: string) => VAT_MODE_LABEL[mode] ?? mode;

export function formatAssumption(key: keyof Assumptions, value: number | string): string {
  const unit = ASSUMPTION_LABELS[key].unit;
  if (key === "vatMode") return vatModeLabel(String(value));
  if (typeof value !== "number") return String(value);
  switch (unit) {
    case "krw":
      return formatKrw(value);
    case "pct":
      return pctText(value);
    case "count":
      return `${value.toLocaleString("ko-KR")}${key === "monthlyBuyers" ? "명" : "개"}`;
    case "point":
      return `${value.toLocaleString("ko-KR")}P`;
    default:
      return String(value);
  }
}
