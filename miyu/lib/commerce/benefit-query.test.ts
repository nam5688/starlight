// 실행: npm test — 결과 화면의 결제 전 가격 선택지: 주소 읽기 · 평범한 견적 판단 · 사유 문구
import assert from "node:assert/strict";
import test from "node:test";
import { buildQuote, COUPON_REASON_TEXT, type CouponCheck } from "./benefits.ts";
import { hasDiscountOptions, isPlainQuote, readBenefitQuery, reasonText, type PriceQuoteView } from "./benefit-query.ts";

const view = (input: Parameters<typeof buildQuote>[0], couponsEnabled = false): PriceQuoteView => ({ quote: buildQuote(input), couponCode: input.coupon?.code ?? null, pointBalance: input.points?.balance ?? null, couponsEnabled });
const okCoupon: CouponCheck = { ok: true, couponId: "c", type: "amount", value: 1000, purpose: "promo", stackableWithReferral: false, creditExpireDays: null, name: "쿠폰" };

test("주소의 쿠폰 코드는 영문 대문자 · 숫자 · - · _ (최대 32자)만 통과한다 — 소문자는 대문자로 바꿔 읽는다", () => {
  assert.equal(readBenefitQuery({ coupon: "welcome-2000" }).couponCode, "WELCOME-2000");
  assert.equal(readBenefitQuery({ coupon: "  AB_12  " }).couponCode, "AB_12");
  assert.equal(readBenefitQuery({ coupon: "A".repeat(32) }).couponCode, "A".repeat(32));
  assert.equal(readBenefitQuery({ coupon: "A".repeat(33) }).couponCode, null, "32자를 넘으면 없는 것으로 본다");
  for (const bad of ["", "   ", "가나다", "a b", "A;DROP", "<script>", "A.B"]) assert.equal(readBenefitQuery({ coupon: bad }).couponCode, null, bad);
  assert.equal(readBenefitQuery({ coupon: ["A1", "B2"] }).couponCode, null, "배열은 쓰지 않는다");
  assert.equal(readBenefitQuery({}).couponCode, null);
});

test("주소의 알림은 정해진 종류만 읽고, 사유는 모양이 맞는 코드만 남긴다", () => {
  assert.deepEqual(readBenefitQuery({ benefit: "denied", reason: "sold-out", coupon: "ab12" }).notice, { kind: "denied", reason: "sold-out", coupon: "AB12" });
  for (const kind of ["error", "confirm", "choose", "invalid"]) assert.equal(readBenefitQuery({ benefit: kind }).notice?.kind, kind);
  assert.equal(readBenefitQuery({ benefit: "success" }).notice, null);
  assert.equal(readBenefitQuery({ benefit: ["error"] }).notice, null);
  assert.equal(readBenefitQuery({ benefit: "denied", reason: "<b>x</b>" }).notice?.reason, null, "모양이 틀린 사유는 버린다");
  assert.equal(readBenefitQuery({ again: "1" }).again, true);
  assert.equal(readBenefitQuery({ again: "true" }).again, false);
});

test("사유 문구는 문구 표에 있는 코드만 쓰고, 표에 없거나 주소를 고친 값은 일반 문구로 바꾼다(주소의 글자를 그대로 보이지 않는다)", () => {
  assert.equal(reasonText("sold-out"), COUPON_REASON_TEXT["sold-out"]);
  assert.match(reasonText("used"), /추천 가격/);
  for (const bad of ["constructor", "__proto__", "toString", "hello", "", null, undefined]) assert.equal(reasonText(bad), "혜택을 적용하지 못했어요.", String(bad));
});

test("평범한 견적(혜택 꺼짐 · 정가 하나뿐 · 쿠폰 입력 없음)만 예전 구매 영역 그대로 보이고, 그 밖에는 선택지를 그린다", () => {
  const list = { listKrw: 9900, referral: null, coupon: null, points: null } as const;
  assert.equal(isPlainQuote(view(list)), true);
  assert.equal(isPlainQuote(view(list, true)), false, "쿠폰 기능이 켜지면 쿠폰 입력이 생긴다");
  assert.equal(isPlainQuote(view({ ...list, referral: { ok: true, price: 6900, inviterUserId: "u" } })), false);
  assert.equal(isPlainQuote(view({ ...list, coupon: { code: "ABCD", check: { ok: false, reason: "not-found" } } })), false, "거절된 쿠폰은 사유를 보인다");
  assert.equal(isPlainQuote(view({ ...list, points: { price: 11900, balance: 100 } })), false, "포인트가 모자라도 모자란 양을 알린다");
  assert.equal(isPlainQuote(view({ ...list, points: { price: 11900, balance: 20000 } })), false);
});

test("할인 선택지가 있는지는 추천 가격 · 쿠폰만 센다(정가 · 포인트 교환은 세지 않는다)", () => {
  const list = { listKrw: 9900, referral: null, coupon: null, points: null } as const;
  assert.equal(hasDiscountOptions(view(list)), false);
  assert.equal(hasDiscountOptions(view({ ...list, points: { price: 11900, balance: 20000 } })), false);
  assert.equal(hasDiscountOptions(view({ ...list, referral: { ok: true, price: 6900, inviterUserId: "u" } })), true);
  assert.equal(hasDiscountOptions(view({ ...list, coupon: { code: "ABCD", check: okCoupon } })), true);
  assert.equal(hasDiscountOptions(view({ ...list, coupon: { code: "ABCD", check: { ok: false, reason: "ended" } } })), false);
});

test("쿠폰 기간: 시간대 없는 값은 한국 시간으로 읽고, 비면 제한 없음, 읽을 수 없으면 오류", async () => {
  const { couponTimeOf } = await import("./benefits.ts");
  assert.equal(couponTimeOf(""), null);
  // 한국 시간 2026-11-01 00:00 = UTC 2026-10-31 15:00
  assert.equal(couponTimeOf("2026-11-01T00:00"), "2026-10-31T15:00:00.000Z");
  assert.equal(couponTimeOf("2026-11-01T00:00:30"), "2026-10-31T15:00:30.000Z");
  // 시간대가 이미 있으면 그대로
  assert.equal(couponTimeOf("2026-11-01T00:00:00+09:00"), "2026-10-31T15:00:00.000Z");
  assert.equal(couponTimeOf("2026-11-01T00:00:00Z"), "2026-11-01T00:00:00.000Z");
  assert.equal(couponTimeOf("내일"), undefined);
  assert.equal(couponTimeOf("2026-13-45T00:00"), undefined);
});
