// 실행: npm test — 구매자의 결제 영수증 열기: 본인 주문 · 결제 승인된 주문 · 결제사 기록 재조회 · 공식 도메인 주소만. 가짜 결제사 · 메모리 저장소(실제 토스 · 실결제 아님).
// 이 시험의 영수증 주소는 시험이 정한 가짜 값이다 — 실제 영수증을 만들거나 흉내 내는 코드는 제품에 없다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import type { GatewayPayment } from "../commerce/order.ts";
import { EMPTY_BASIC_INFO } from "../profile/basic-info.ts";
import { manseryeokEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { confirmPayment, startCheckout } from "./order-service.ts";
import type { PaymentGateway } from "./ports.ts";
import { receiptFor } from "./receipt-service.ts";
import { createFakeToss } from "./testing/fake-toss.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const RECEIPT = "https://dashboard.tosspayments.com/receipt/redirection?transactionId=FAKE-TEST-ONLY&ref=PX";
const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, 4])));

async function world(receiptUrl: unknown = RECEIPT, omit = false) {
  const now = () => new Date("2026-10-20T03:00:00Z");
  const mem = createMemoryRepository(now);
  const toss = createFakeToss(now);
  toss.state.receiptUrl = omit ? undefined : receiptUrl;
  const saved = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: USER, channel: "web", info: { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true, gender: "female" as const }, answers, today: now() });
  if (!saved.ok) throw new Error(saved.message);
  const started = await startCheckout({ repo: mem.repo, now }, { userId: USER, assessmentId: saved.assessment.id });
  if (started.kind !== "order") throw new Error(started.kind);
  const deps = { repo: mem.repo, gateway: toss.gateway };
  const pay = async () => {
    const r = await confirmPayment({ repo: mem.repo, gateway: toss.gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_secret_abc", amount: started.order.amount });
    assert.equal(r.kind, "paid");
  };
  return { mem, toss, deps, order: started.order, pay };
}

test("본인의 결제 완료 주문이면 결제사가 준 공식 영수증 주소로 안내하고, 결과에 결제키 · 카드 정보가 없다", async () => {
  const w = await world();
  await w.pay();
  const r = await receiptFor(w.deps, { userId: USER, orderNumber: w.order.orderNumber });
  assert.deepEqual(r, { kind: "ok", url: RECEIPT });
  assert.doesNotMatch(JSON.stringify(r), /pk_secret|paymentKey|card/i);
  assert.equal(w.toss.calls.byOrder, 1, "결제사 기록을 이번에 다시 읽었다(저장해 둔 주소가 아니다)");
});

test("영수증 주소는 어디에도 저장하지 않는다 — 결제 처리 기록 · 주문 · 승인 결과에 주소가 남지 않는다", async () => {
  const w = await world();
  await w.pay();
  await receiptFor(w.deps, { userId: USER, orderNumber: w.order.orderNumber });
  const stored = JSON.stringify({ events: w.mem.events, order: await w.mem.repo.getOrderByNumber(w.order.orderNumber) });
  assert.doesNotMatch(stored, /receipt|FAKE-TEST-ONLY|tosspayments\.com/i);
});

test("남의 주문 · 없는 주문 · 형식이 틀린 주문번호는 구분 없이 not-found이고 결제사에 묻지 않는다", async () => {
  const w = await world();
  await w.pay();
  for (const [userId, orderNumber] of [[OTHER, w.order.orderNumber], [USER, "MEU-20261020-NOTEXIST00"], [USER, ""], [USER, "../../v1/payments/pk"], [USER, "x".repeat(500)]] as const) {
    assert.deepEqual(await receiptFor(w.deps, { userId, orderNumber }), { kind: "not-found" }, `${userId.slice(0, 2)} ${orderNumber.slice(0, 20)}`);
  }
  assert.equal(w.toss.calls.byOrder, 0, "소유자가 아니면 결제사 조회조차 하지 않는다");
});

test("결제가 승인된 적 없는 주문(대기 · 실패 · 취소)에는 영수증이 없고 결제사에 묻지 않는다 — 결제 성공 주소로 돌아왔다는 사실은 근거가 아니다", async () => {
  const w = await world();
  assert.deepEqual(await receiptFor(w.deps, { userId: USER, orderNumber: w.order.orderNumber }), { kind: "no-payment" }); // pending
  for (const status of ["failed", "canceled"] as const) {
    const each = await world();
    await each.mem.repo.updateOrder(each.order.id, ["pending"], { status });
    assert.deepEqual(await receiptFor(each.deps, { userId: USER, orderNumber: each.order.orderNumber }), { kind: "no-payment" }, status);
    assert.equal(each.toss.calls.byOrder, 0, status);
  }
  assert.equal(w.toss.calls.byOrder, 0);
});

test("환불된 주문도 결제가 승인된 적 있으므로 결제사 기록이 취소 상태여도 영수증을 연다", async () => {
  const w = await world();
  await w.pay();
  assert.ok(w.toss.cancel("pk_secret_abc"));
  await w.mem.repo.updateOrder(w.order.id, ["paid"], { status: "refunded" });
  const r = await receiptFor(w.deps, { userId: USER, orderNumber: w.order.orderNumber });
  // 가짜 결제사의 취소 처리는 receiptUrl을 그대로 이어 주므로 같은 주소가 나온다
  assert.deepEqual(r, { kind: "ok", url: RECEIPT });
});

test("결제사 조회가 실패하거나(연결 끊김 · 예외) 결제 기록이 없으면 unavailable(lookup-failed)이고 주소를 지어내지 않는다", async () => {
  const w = await world();
  await w.pay();
  w.toss.state.lookupDown = true;
  assert.deepEqual(await receiptFor(w.deps, { userId: USER, orderNumber: w.order.orderNumber }), { kind: "unavailable", reason: "lookup-failed" });
  const throwing: PaymentGateway = { ...w.toss.gateway, async getPaymentByOrderId() { throw new Error("boom"); } };
  assert.deepEqual(await receiptFor({ repo: w.mem.repo, gateway: throwing }, { userId: USER, orderNumber: w.order.orderNumber }), { kind: "unavailable", reason: "lookup-failed" });
  const missing: PaymentGateway = { ...w.toss.gateway, async getPaymentByOrderId() { return { ok: false, code: "NOT_FOUND_PAYMENT", message: "없음", retryable: false }; } };
  assert.deepEqual(await receiptFor({ repo: w.mem.repo, gateway: missing }, { userId: USER, orderNumber: w.order.orderNumber }), { kind: "unavailable", reason: "lookup-failed" });
});

test("결제사 기록이 이 주문과 맞지 않으면(주문번호 · 금액 · 승인된 적 없는 상태) 영수증을 열지 않는다(mismatch)", async () => {
  const w = await world();
  await w.pay();
  const real = (await w.toss.gateway.getPaymentByOrderId(w.order.orderNumber)) as { ok: true; payment: GatewayPayment };
  const variants: Partial<GatewayPayment>[] = [{ orderId: "MEU-20261020-OTHERORDER" }, { totalAmount: w.order.amount - 100 }, { totalAmount: w.order.amount + 100 }, { status: "IN_PROGRESS" }, { status: "ABORTED" }, { status: "READY" }];
  for (const v of variants) {
    const gateway: PaymentGateway = { ...w.toss.gateway, async getPaymentByOrderId() { return { ok: true, payment: { ...real.payment, ...v } }; } };
    assert.deepEqual(await receiptFor({ repo: w.mem.repo, gateway }, { userId: USER, orderNumber: w.order.orderNumber }), { kind: "unavailable", reason: "mismatch" }, JSON.stringify(v));
  }
});

test("결제사가 영수증 주소를 주지 않거나 공식 도메인이 아니면 no-receipt이다 — 어떤 결제 연결이 와도 검사하지 않은 주소는 구매자에게 가지 않는다", async () => {
  const none = await world(undefined, true); // 결제사 응답에 receipt가 없다
  await none.pay();
  assert.deepEqual(await receiptFor(none.deps, { userId: USER, orderNumber: none.order.orderNumber }), { kind: "unavailable", reason: "no-receipt" });
  // 연결(gateway)이 검사 없이 값을 그대로 건네는 경우를 흉내 낸다 — 서비스가 같은 검사를 한 번 더 한다
  for (const bad of ["https://evil.com/receipt", "http://dashboard.tosspayments.com/receipt", "https://tosspayments.com.evil.com/r", "javascript:alert(1)", "", 7, null]) {
    const w = await world(bad);
    await w.pay();
    assert.deepEqual(await receiptFor(w.deps, { userId: USER, orderNumber: w.order.orderNumber }), { kind: "unavailable", reason: "no-receipt" }, String(bad));
  }
});
