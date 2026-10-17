// 실행: npm test — 주문이 끝난 뒤 돌아갈 화면: 개인 통합 리포트는 결과 화면, 고민 반영 리포트는 나의 고민 기록소(결제 완료면 그 기록의 리포트)
import assert from "node:assert/strict";
import { test } from "node:test";
import { cashProductId, compatProductId, concernProductId, PERSONAL_REPORT, personalProductId } from "../lib/config/product.ts";
import { createQuestionNonce, questionProductId } from "../lib/commerce/cash.ts";
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

test("같은 결과로 다시 받은 리포트(2번째부터) 주문은 그 주문의 리포트로, 첫 구매는 지금처럼 결과 화면으로 돌아간다", () => {
  assert.equal(resultPathOf({ assessmentId: A, productId: personalProductId(2), orderNumber: "MIYU-20261015-ABCDEF" }, { paid: true }), `/results/${A}?r=MIYU-20261015-ABCDEF`);
  assert.equal(resultPathOf({ assessmentId: A, productId: personalProductId(1), orderNumber: "MIYU-20261015-ABCDEF" }), `/results/${A}`);
  // 주문번호가 없으면(예전 호출) 결과 화면 그대로
  assert.equal(resultPathOf({ assessmentId: A, productId: personalProductId(3) }), `/results/${A}`);
});

test("유료 질문 주문은 질문했던 채팅방으로 돌아가고, 결제가 끝나면 이어서 보내라는 표시(paid)를 함께 붙인다", () => {
  const order = { assessmentId: A, productId: questionProductId(createQuestionNonce("love")), orderNumber: "MEU-20261015-ABCDEFGHJK" };
  assert.equal(resultPathOf(order), `/results/${A}/talk/love`);
  assert.equal(resultPathOf(order, { paid: true }), `/results/${A}/talk/love?paid=MEU-20261015-ABCDEFGHJK`);
  assert.equal(resultPathOf({ assessmentId: A, productId: order.productId }, { paid: true }), `/results/${A}/talk/love`, "주문번호가 없으면 paid 없이");
  // 기본 방은 /talk, 날짜별 방(오늘의 운세)도 방 이름으로 간다
  assert.equal(resultPathOf({ assessmentId: A, productId: questionProductId(createQuestionNonce("main")), orderNumber: "MEU-1" }, { paid: true }), `/results/${A}/talk?paid=MEU-1`);
  assert.equal(resultPathOf({ assessmentId: A, productId: questionProductId(createQuestionNonce("daily")) }), `/results/${A}/talk/daily`);
});

test("예전 선불 충전 주문 · 알 수 없는 방 이름은 기본 채팅방으로 돌아간다 (옛 /cash 화면은 없다)", () => {
  const legacy = { assessmentId: A, productId: cashProductId({ cash: 100, bonus: 15, nonce: "ABCDEF2345" }), orderNumber: "MEU-20261015-ABCDEFGHJK" };
  assert.equal(resultPathOf(legacy), `/results/${A}/talk`);
  assert.equal(resultPathOf(legacy, { paid: true }), `/results/${A}/talk?paid=MEU-20261015-ABCDEFGHJK`);
  assert.equal(resultPathOf({ assessmentId: A, productId: questionProductId("NOSUCHROOMABCDE12345") }), `/results/${A}/talk`, "없는 방이면 기본 채팅방");
});

test("사주 궁합 주문은 결제 전에는 궁합 입구로, 결제 완료 뒤에는 그 주문의 궁합 리포트로 간다 (개인 통합 리포트 결과 화면으로 가지 않는다)", () => {
  const order = { assessmentId: A, productId: compatProductId(R), orderNumber: "MIYU-20261017-ABCDEF" };
  assert.equal(resultPathOf(order), "/compat");
  assert.equal(resultPathOf(order, { paid: true }), "/compat/report/MIYU-20261017-ABCDEF");
  assert.equal(resultPathOf({ assessmentId: A, productId: compatProductId(R) }, { paid: true }), "/compat");
});
