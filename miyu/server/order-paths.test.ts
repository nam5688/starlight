// 실행: npm test — 주문이 끝난 뒤 돌아갈 화면: 개인 통합 리포트는 결과 화면, 고민 반영 리포트는 나의 고민 기록소(결제 완료면 그 기록의 리포트)
import assert from "node:assert/strict";
import { test } from "node:test";
import { concernProductId, PERSONAL_REPORT } from "../lib/config/product.ts";
import { resultPathOf } from "./order-paths.ts";

const A = "11111111-1111-4111-8111-111111111111";
const R = "22222222-2222-4222-8222-222222222222";

test("개인 통합 리포트 주문은 결과 화면으로 돌아간다 (결제 여부와 관계없이)", () => {
  assert.equal(resultPathOf({ assessmentId: A, productId: PERSONAL_REPORT.id }), `/results/${A}`);
  assert.equal(resultPathOf({ assessmentId: A, productId: PERSONAL_REPORT.id }, { paid: true }), `/results/${A}`);
});

test("고민 반영 리포트 주문은 결제 전에는 나의 고민 기록소로, 결제 완료 뒤에는 그 기록의 리포트로 간다", () => {
  const order = { assessmentId: A, productId: concernProductId(R) };
  assert.equal(resultPathOf(order), `/results/${A}/context`);
  assert.equal(resultPathOf(order, { paid: true }), `/results/${A}/context/${R}`);
});

test("상품 번호가 고민 기록 번호 형식이 아니면 개인 통합 리포트와 같은 화면으로 둔다", () => {
  assert.equal(resultPathOf({ assessmentId: A, productId: "concern-report:not-a-uuid" }, { paid: true }), `/results/${A}`);
});
