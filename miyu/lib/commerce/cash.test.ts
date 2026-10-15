// 실행: npm test — 유료 질문(질문 한 개당 결제) 견적 · 상품 번호 규칙
import assert from "node:assert/strict";
import test from "node:test";
import { cashProductId, isCashProduct, MIYU_CASH, parseCashProductId, productNameOf, QUESTION_PRICE_KRW } from "../config/product.ts";
import { canAffordQuestion, createQuestionNonce, questionProductId, questionQuote, questionRoomOf, questionsLeft } from "./cash.ts";

test("운영자 지정값: 선불 충전은 없고 질문 한 개 = 550원(부가세 포함, 장부 단위와 값은 따로 정한다)", () => {
  assert.equal(MIYU_CASH.perQuestion, 3);
  assert.equal(MIYU_CASH.priceKrw, 550);
  assert.equal(QUESTION_PRICE_KRW, 550);
  assert.equal("krwPerCash" in MIYU_CASH, false, "가격은 장부 단위에서 계산하지 않는다");
  assert.deepEqual(questionQuote(), { priceKrw: 550, units: 3 });
  // 충전 · 보너스 · 단위 같은 선불 충전 설정은 남아 있지 않다
  for (const gone of ["unit", "minCash", "maxCash", "bonusTiers", "packages"]) assert.equal(gone in MIYU_CASH, false, gone);
});

test("결제해 둔 질문 수와 질문 가능 여부 — 장부 단위 3개가 질문 한 개", () => {
  assert.equal(questionsLeft(0), 0);
  assert.equal(questionsLeft(2), 0);
  assert.equal(questionsLeft(3), 1);
  assert.equal(questionsLeft(9), 3);
  assert.equal(canAffordQuestion(2), false);
  assert.equal(canAffordQuestion(3), true);
});

test("질문 결제의 임의 번호: 방 이름(대문자) + 임의 10자, 영문 · 숫자만, 주문마다 다르다", () => {
  const a = createQuestionNonce("love");
  const b = createQuestionNonce("love");
  assert.match(a, /^LOVE[A-Z2-9]{10}$/);
  assert.notEqual(a, b);
  assert.match(createQuestionNonce("marriage"), /^MARRIAGE[A-Z2-9]{10}$/);
  for (const bad of ["", "a", "Love", "love1", "love-x", "방", "../x", "a".repeat(21)]) assert.throws(() => createQuestionNonce(bad), /상담방 이름/, bad);
});

test("상품 번호: 질문 결제는 항상 3단위 · 보너스 0이고 방 이름을 되읽을 수 있으며, 리포트 상품과 헷갈리지 않는다", () => {
  const id = questionProductId("LOVEABCDE23456");
  assert.equal(id, "cash-charge:3:0:LOVEABCDE23456");
  assert.deepEqual(parseCashProductId(id), { cash: 3, bonus: 0, nonce: "LOVEABCDE23456" });
  assert.equal(isCashProduct(id), true);
  assert.equal(questionRoomOf(id), "love");
  assert.equal(questionRoomOf(questionProductId(createQuestionNonce("marriage"))), "marriage");
  assert.equal(productNameOf(id), "유료 질문 1개");
  // DB 13번 트리거가 읽는 형식 그대로다
  assert.match(id, /^cash-charge:[0-9]{1,6}:[0-9]{1,6}:[A-Za-z0-9]{6,32}$/);
  for (const other of ["personal-integrated-report", "concern-report:11111111-1111-4111-8111-111111111111", "cash-charge:x:1:ABCDEF", "cash-charge:3:0", "cash-charge:3:0:ab", "cash-charge:1000000000:0:ABCDEF"]) {
    assert.equal(parseCashProductId(other), null, other);
    assert.equal(isCashProduct(other), false, other);
    assert.equal(questionRoomOf(other), null, other);
  }
});

test("예전 선불 충전 주문(이미 저장된 것)도 읽히고 기록은 그대로 남지만, 방 이름은 없다 — 돌아갈 화면은 기본 채팅방이다", () => {
  const old = cashProductId({ cash: 100, bonus: 15, nonce: "ABCDE23456" });
  assert.equal(isCashProduct(old), true);
  assert.equal(questionRoomOf(old), null, "충전 주문은 질문 결제가 아니다");
  assert.equal(productNameOf(old), "미유캐시 100개 충전 (예전 방식)");
  // 질문 결제와 같은 단위(3)라도 방 이름이 앞에 없으면 방을 돌려주지 않는다
  assert.equal(questionRoomOf(cashProductId({ cash: 3, bonus: 0, nonce: "ABCDE23456" })), null, "임의 10자만 있는 번호");
  assert.equal(questionRoomOf(cashProductId({ cash: 3, bonus: 0, nonce: "ZZ12ABCDE23456" })), null, "방 이름 자리에 숫자가 섞이면 방이 아니다");
});
