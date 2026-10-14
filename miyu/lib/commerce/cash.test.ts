// 실행: npm test — 미유캐시 견적 · 보너스 · 상품 번호 규칙
import assert from "node:assert/strict";
import test from "node:test";
import { cashProductId, isCashProduct, MIYU_CASH, parseCashProductId, productNameOf } from "../config/product.ts";
import { bonusFor, canAffordQuestion, chargePackages, createCashNonce, isChargeable, productIdFor, questionsLeft, quoteCharge } from "./cash.ts";

test("운영자 지정값: 질문 한 번 3캐시, 10캐시 단위 충전", () => {
  assert.equal(MIYU_CASH.perQuestion, 3);
  assert.equal(MIYU_CASH.unit, 10);
  assert.equal(MIYU_CASH.minCash, 10);
});

test("충전 가능한 개수: 10의 배수 · 정수 · 범위 안만", () => {
  for (const ok of [10, 20, 50, 100, 500]) assert.equal(isChargeable(ok), true, String(ok));
  for (const bad of [0, 5, 15, 9, 505, 510, -10, 10.5, NaN, Infinity, "10", null, undefined]) assert.equal(isChargeable(bad), false, String(bad));
});

test("견적: 결제 금액은 캐시 × 1캐시의 값이고, 보너스는 가장 높은 구간 하나만 · 소수점 버림", () => {
  assert.deepEqual(quoteCharge(10), { cash: 10, bonus: 0, total: 10, bonusPct: 0, priceKrw: 1000, questions: 3 });
  assert.deepEqual(quoteCharge(30), { cash: 30, bonus: 0, total: 30, bonusPct: 0, priceKrw: 3000, questions: 10 });
  assert.deepEqual(quoteCharge(50), { cash: 50, bonus: 5, total: 55, bonusPct: 10, priceKrw: 5000, questions: 18 });
  assert.deepEqual(quoteCharge(100), { cash: 100, bonus: 15, total: 115, bonusPct: 15, priceKrw: 10000, questions: 38 });
  assert.deepEqual(quoteCharge(300), { cash: 300, bonus: 60, total: 360, bonusPct: 20, priceKrw: 30000, questions: 120 });
  assert.equal(quoteCharge(15), null);
  assert.equal(quoteCharge(1000), null);
  // 구간 바로 아래 · 바로 위
  assert.equal(bonusFor(40).bonus, 0);
  assert.equal(bonusFor(90).pct, 10);
  assert.equal(bonusFor(290).pct, 15);
});

test("보너스는 충전할수록 질문 한 번의 값이 내려가는 방향으로만 움직이고, 어떤 충전도 보너스가 충전 캐시를 넘지 않는다", () => {
  let last = Infinity;
  for (let cash: number = MIYU_CASH.minCash; cash <= MIYU_CASH.maxCash; cash += MIYU_CASH.unit) {
    const q = quoteCharge(cash)!;
    assert.ok(q.bonus <= q.cash * 0.5, `${cash}: 보너스는 충전의 절반을 넘지 않는다`);
    assert.equal(q.priceKrw, cash * MIYU_CASH.krwPerCash);
    assert.equal(q.total, q.cash + q.bonus);
    const perQuestion = q.priceKrw / Math.max(1, q.questions);
    // 남는 캐시(3으로 나눈 나머지) 때문에 한 단계마다 정확히 줄지는 않지만, 구간이 올라갈 때 값이 나빠지지 않는다
    if (cash === 50 || cash === 100 || cash === 300) assert.ok(perQuestion <= last + 1e-9, `${cash}`);
    last = perQuestion;
  }
});

test("빠른 선택은 모두 충전 가능한 견적이다", () => {
  const list = chargePackages();
  assert.equal(list.length, MIYU_CASH.packages.length);
  assert.ok(list.every((q) => q.cash % MIYU_CASH.unit === 0));
});

test("잔액으로 물어볼 수 있는 횟수와 질문 가능 여부", () => {
  assert.equal(questionsLeft(0), 0);
  assert.equal(questionsLeft(2), 0);
  assert.equal(questionsLeft(3), 1);
  assert.equal(questionsLeft(55), 18);
  assert.equal(canAffordQuestion(2), false);
  assert.equal(canAffordQuestion(3), true);
});

test("상품 번호: 충전 캐시 · 보너스를 적고 다시 읽으며, 리포트 상품과 헷갈리지 않는다", () => {
  const id = productIdFor(quoteCharge(100)!, "ABCDE23456");
  assert.equal(id, "cash-charge:100:15:ABCDE23456");
  assert.deepEqual(parseCashProductId(id), { cash: 100, bonus: 15, nonce: "ABCDE23456" });
  assert.equal(isCashProduct(id), true);
  assert.equal(cashProductId({ cash: 10, bonus: 0, nonce: "ZZZZZZ" }), "cash-charge:10:0:ZZZZZZ");
  for (const other of ["personal-integrated-report", "concern-report:11111111-1111-4111-8111-111111111111", "cash-charge:x:1:ABCDEF", "cash-charge:10:0", "cash-charge:10:0:ab", "cash-charge:1000000000:0:ABCDEF"]) {
    assert.equal(parseCashProductId(other), null, other);
    assert.equal(isCashProduct(other), false, other);
  }
  assert.equal(productNameOf(id), "미유캐시 100개 충전");
});

test("주문마다 다른 임의 번호를 만든다 (영문 · 숫자만)", () => {
  const a = createCashNonce();
  const b = createCashNonce();
  assert.match(a, /^[A-Z2-9]{10}$/);
  assert.notEqual(a, b);
  assert.equal(parseCashProductId(`cash-charge:10:0:${a}`)?.nonce, a);
});
