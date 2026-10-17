// 결과 화면의 결제 전 가격 선택지에 쓰는 순수 규칙 — React · Next · 외부 SDK를 불러오지 않는다.
// 주소(searchParams)에서 쿠폰 코드 · 알림을 안전하게 읽고, 서버가 만든 견적이 "평범한가"(혜택 선택지를 그릴 필요가 없는가)를 가른다.
// 금액 · 자격은 여기서 계산하지 않는다 — 서버가 매번 다시 만든 견적(`CheckoutQuote`)만 믿는다.

import { COUPON_REASON_TEXT, REFERRAL_REASON_TEXT, type CheckoutQuote, type PriceOption } from "./benefits.ts";

/** 서버가 만든 견적과 화면에 필요한 것들(쿠폰 입력을 보일지 · 내 포인트) */
export type PriceQuoteView = {
  quote: CheckoutQuote;
  /** 견적을 만들 때 쓴 쿠폰 코드(입력하지 않았으면 null) */
  couponCode: string | null;
  /** 포인트 교환이 켜져 있을 때만 숫자 */
  pointBalance: number | null;
  couponsEnabled: boolean;
};

/** 결제 시작 뒤 되돌아왔을 때의 알림(주소의 benefit · reason · coupon) */
export type BenefitNotice = { kind: "error" | "denied" | "confirm" | "choose" | "invalid"; reason?: string | null; coupon?: string | null };

/** 쿠폰 코드(?coupon=) — 영문 대문자 · 숫자 · - · _ 만, 최대 32자. 맞지 않으면 없는 것으로 본다(서버 동작도 같은 규칙으로 정리한다) */
const COUPON_PARAM = /^[A-Z0-9_-]{1,32}$/;
/** 알림 종류(?benefit=) */
export const BENEFIT_NOTICE_KINDS: readonly BenefitNotice["kind"][] = ["error", "denied", "confirm", "choose", "invalid"];
/** 사유(?reason=)의 모양 — 사유는 문구 표에 있는 코드일 때만 문구로 바뀌고 주소의 글자를 그대로 쓰지 않는다 */
const REASON_PARAM = /^[A-Za-z0-9_+-]{1,40}$/;

export type BenefitQuery = { couponCode: string | null; again: boolean; notice: BenefitNotice | null };

export function readBenefitQuery(query: Record<string, string | string[] | undefined>): BenefitQuery {
  const rawCoupon = typeof query.coupon === "string" ? query.coupon.trim().toUpperCase() : "";
  const couponCode = COUPON_PARAM.test(rawCoupon) ? rawCoupon : null;
  const kind = BENEFIT_NOTICE_KINDS.find((k) => k === query.benefit);
  const reason = typeof query.reason === "string" && REASON_PARAM.test(query.reason) ? query.reason : null;
  return { couponCode, again: query.again === "1", notice: kind ? { kind, reason, coupon: couponCode } : null };
}

/** 혜택이 모두 꺼져 있고 쿠폰 입력도 없는 평범한 견적인가 — 이때는 예전 구매 영역 그대로 보인다 */
export function isPlainQuote(v: PriceQuoteView): boolean {
  const q = v.quote;
  return !v.couponsEnabled && q.options.length === 1 && q.options[0].kind === "list" && q.denied.length === 0 && !q.needsChoice && !q.needsListConfirmation && q.pointsShortfall === null;
}

const isDiscount = (o: PriceOption) => o.kind !== "list" && o.kind !== "points";

/** 정가보다 싸지는 선택지(추천 가격 · 쿠폰)가 있는가 */
export function hasDiscountOptions(v: PriceQuoteView): boolean {
  return v.quote.options.some(isDiscount);
}

/** 사유 코드 → 쉬운 문구. 표에 없는 코드(주소를 직접 고친 값 포함)는 일반 문구로 바꾼다 */
export function reasonText(reason: string | null | undefined): string {
  if (reason && Object.hasOwn(COUPON_REASON_TEXT, reason)) return COUPON_REASON_TEXT[reason];
  if (reason && Object.hasOwn(REFERRAL_REASON_TEXT, reason)) return REFERRAL_REASON_TEXT[reason];
  return "혜택을 적용하지 못했어요.";
}
