// 실행: npm test — 서비스 흐름을 메모리 저장소와 가짜 결제사로 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import type { GatewayPayment } from "../commerce/order.ts";
import { isValidOrderNumber } from "../commerce/order.ts";
import { PERSONAL_REPORT } from "../config/product.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "../profile/basic-info.ts";
import { devReportGenerator } from "../report/generate-dev-report.ts";
import type { ReportGenerator } from "../report/generator.ts";
import { sajuEngine } from "../saju/engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { confirmPayment, markCheckoutFailed, startCheckout, syncPayment } from "./order-service.ts";
import type { GatewayResult, PaymentGateway } from "./ports.ts";
import { ensureReport, getResultView, listMyItems } from "./report-service.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const TODAY = new Date("2026-10-11T00:00:00Z");
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const INFO: BasicInfo = {
  ...EMPTY_BASIC_INFO,
  nickname: "지민",
  birthYear: "1995",
  birthMonth: "4",
  birthDay: "12",
  birthTimeUnknown: true,
  knownMbti: "INFJ",
  regionProvince: "서울특별시",
  regionDistrict: "마포구",
};

function answersAll(value: number) {
  return Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, value])));
}

function fakeGateway(handler: {
  confirm?: (input: { paymentKey: string; orderId: string; amount: number }) => GatewayResult;
  get?: (paymentKey: string) => GatewayResult;
}) {
  const calls = { confirm: 0, get: 0 };
  const gateway: PaymentGateway = {
    provider: "tosspayments",
    async confirm(input) {
      calls.confirm++;
      return handler.confirm ? handler.confirm(input) : { ok: false, code: "NOT_IMPLEMENTED", message: "", retryable: false };
    },
    async getPayment(paymentKey) {
      calls.get++;
      return handler.get ? handler.get(paymentKey) : { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
    },
  };
  return { gateway, calls };
}

function done(orderId: string, amount: number, paymentKey = "pk_test_1"): GatewayPayment {
  return { paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: "2026-10-11T10:00:00+09:00" };
}

async function setup() {
  const mem = createMemoryRepository(() => TODAY);
  const saved = await submitAssessment(
    { repo: mem.repo, saju: sajuEngine },
    { userId: USER, channel: "web", info: INFO, answers: { ...answersAll(4), extra: 5 }, today: TODAY },
  );
  assert.ok(saved.ok);
  return { mem, assessment: saved.ok ? saved.assessment : (null as never) };
}

const deps = (mem: ReturnType<typeof createMemoryRepository>) => ({ repo: mem.repo, now: () => TODAY });

test("검사 저장: 서버에서 채점하고 모르는 문항 키는 버린다", async () => {
  const { mem, assessment } = await setup();
  assert.equal(assessment.source, "dev-scoring");
  assert.equal(assessment.birthTime, null);
  assert.equal(assessment.knownMbti, "INFJ");
  assert.equal("extra" in assessment.answers, false);
  assert.equal(assessment.saju.status, "not-connected");
  assert.equal(mem.profiles.get(USER)?.nickname, "지민");
  assert.deepEqual(mem.regions.get(USER), { province: "서울특별시", district: "마포구" });
});

test("검사 저장: 기본 정보나 응답이 잘못되면 거부한다", async () => {
  const mem = createMemoryRepository(() => TODAY);
  const d = { repo: mem.repo, saju: sajuEngine };
  const bad = await submitAssessment(d, { userId: USER, channel: "web", info: { ...INFO, birthMonth: "2", birthDay: "30" }, answers: answersAll(3), today: TODAY });
  assert.equal(bad.ok, false);
  const missing = await submitAssessment(d, { userId: USER, channel: "web", info: INFO, answers: { m1: 3 }, today: TODAY });
  assert.equal(missing.ok, false);
  assert.equal(mem.assessments.size, 0);
});

test("결제 시작: 서버 가격으로 주문을 만들고, 다시 누르면 이전 대기 주문을 취소한다", async () => {
  const { mem, assessment } = await setup();
  const first = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  assert.equal(first.kind, "order");
  if (first.kind !== "order") return;
  assert.equal(first.order.amount, PERSONAL_REPORT.priceKrw);
  assert.ok(isValidOrderNumber(first.order.orderNumber));

  const second = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  assert.equal(second.kind, "order");
  if (second.kind !== "order") return;
  assert.notEqual(second.order.orderNumber, first.order.orderNumber);
  assert.equal(mem.orders.get(first.order.id)?.status, "canceled");
});

test("결제 시작: 다른 회원의 검사로는 주문할 수 없다", async () => {
  const { mem, assessment } = await setup();
  const r = await startCheckout(deps(mem), { userId: OTHER, assessmentId: assessment.id });
  assert.equal(r.kind, "not-found");
});

test("결제 승인: 금액이 다르면 결제사에 승인 요청을 보내지 않는다", async () => {
  const { mem, assessment } = await setup();
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (started.kind !== "order") throw new Error();
  const { gateway, calls } = fakeGateway({ confirm: (i) => ({ ok: true, payment: done(i.orderId, i.amount) }) });
  const r = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk", amount: 100 });
  assert.equal(r.kind, "rejected");
  assert.equal(calls.confirm, 0);
  assert.equal(mem.orders.get(started.order.id)?.status, "pending");
});

test("결제 승인: 성공하면 paid, 같은 요청을 다시 보내도 한 번만 승인한다", async () => {
  const { mem, assessment } = await setup();
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (started.kind !== "order") throw new Error();
  const { gateway, calls } = fakeGateway({ confirm: (i) => ({ ok: true, payment: done(i.orderId, i.amount, i.paymentKey) }) });
  const input = { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_a", amount: started.order.amount };
  const first = await confirmPayment({ repo: mem.repo, gateway }, input);
  const again = await confirmPayment({ repo: mem.repo, gateway }, input);
  assert.equal(first.kind, "paid");
  assert.equal(again.kind, "paid");
  assert.equal(calls.confirm, 1);
  assert.equal(mem.orders.get(started.order.id)?.paymentKey, "pk_a");

  const other = await confirmPayment({ repo: mem.repo, gateway }, { ...input, userId: OTHER });
  assert.equal(other.kind, "not-found");

  const after = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  assert.equal(after.kind, "already-paid");
});

test("결제 승인: 결제사 응답을 못 받으면 대기 상태로 두고, 이미 처리된 결제는 조회해서 맞춘다", async () => {
  const { mem, assessment } = await setup();
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (started.kind !== "order") throw new Error();
  const input = { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_b", amount: started.order.amount };

  const network = fakeGateway({ confirm: () => ({ ok: false, code: "NETWORK_ERROR", message: "", retryable: true }) });
  const checking = await confirmPayment({ repo: mem.repo, gateway: network.gateway }, input);
  assert.equal(checking.kind, "checking");
  assert.equal(mem.orders.get(started.order.id)?.status, "pending");

  const processed = fakeGateway({
    confirm: () => ({ ok: false, code: "ALREADY_PROCESSED_PAYMENT", message: "", retryable: false }),
    get: (key) => ({ ok: true, payment: done(started.order.orderNumber, started.order.amount, key) }),
  });
  const paid = await confirmPayment({ repo: mem.repo, gateway: processed.gateway }, input);
  assert.equal(paid.kind, "paid");
});

test("결제 승인: 카드 거절 같은 확정 실패는 failed로 남긴다", async () => {
  const { mem, assessment } = await setup();
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (started.kind !== "order") throw new Error();
  const { gateway } = fakeGateway({ confirm: () => ({ ok: false, code: "REJECT_CARD_PAYMENT", message: "한도 초과", retryable: false }) });
  const r = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk", amount: started.order.amount });
  assert.equal(r.kind, "rejected");
  assert.equal(mem.orders.get(started.order.id)?.status, "failed");
});

test("결제 승인: 새 결제로 대체된 주문은 승인하지 않는다", async () => {
  const { mem, assessment } = await setup();
  const first = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (first.kind !== "order") throw new Error();
  const { gateway, calls } = fakeGateway({ confirm: (i) => ({ ok: true, payment: done(i.orderId, i.amount) }) });
  const r = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: first.order.orderNumber, paymentKey: "pk", amount: first.order.amount });
  assert.equal(r.kind, "rejected");
  assert.equal(calls.confirm, 0);
});

test("결제 실패 주소: 구매자 취소는 canceled, 그 밖의 실패는 failed", async () => {
  const { mem, assessment } = await setup();
  const a = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (a.kind !== "order") throw new Error();
  await markCheckoutFailed({ repo: mem.repo }, { userId: USER, orderNumber: a.order.orderNumber, code: "PAY_PROCESS_CANCELED", message: "취소" });
  assert.equal(mem.orders.get(a.order.id)?.status, "canceled");

  const b = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (b.kind !== "order") throw new Error();
  await markCheckoutFailed({ repo: mem.repo }, { userId: OTHER, orderNumber: b.order.orderNumber, code: "X", message: "" });
  assert.equal(mem.orders.get(b.order.id)?.status, "pending", "다른 회원은 바꿀 수 없다");
  await markCheckoutFailed({ repo: mem.repo }, { userId: USER, orderNumber: b.order.orderNumber, code: "REJECT_CARD_COMPANY", message: "거절" });
  assert.equal(mem.orders.get(b.order.id)?.status, "failed");
});

test("웹훅 동기화: 결제사 조회 결과로만 주문을 맞춘다", async () => {
  const { mem, assessment } = await setup();
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (started.kind !== "order") throw new Error();
  const n = started.order.orderNumber;
  const amt = started.order.amount;

  // 승인 응답이 유실된 뒤 실패로 기록됐더라도, 결제사가 DONE이면 paid로 맞춘다
  await mem.repo.updateOrder(started.order.id, ["pending"], { status: "failed" });
  const doneGw = fakeGateway({ get: (k) => ({ ok: true, payment: done(n, amt, k) }) });
  const r1 = await syncPayment({ repo: mem.repo, gateway: doneGw.gateway }, { paymentKey: "pk_w" });
  assert.equal(r1.kind, "updated");
  assert.equal(mem.orders.get(started.order.id)?.status, "paid");

  // 결제사에서 취소되면 refunded
  const canceledGw = fakeGateway({ get: (k) => ({ ok: true, payment: { ...done(n, amt, k), status: "CANCELED", balanceAmount: 0 } }) });
  await syncPayment({ repo: mem.repo, gateway: canceledGw.gateway }, { paymentKey: "pk_w" });
  assert.equal(mem.orders.get(started.order.id)?.status, "refunded");

  const unknown = fakeGateway({ get: (k) => ({ ok: true, payment: done("MEU-UNKNOWN-1", amt, k) }) });
  assert.equal((await syncPayment({ repo: mem.repo, gateway: unknown.gateway }, { paymentKey: "x" })).kind, "ignored");

  const down = fakeGateway({ get: () => ({ ok: false, code: "HTTP_503", message: "", retryable: true }) });
  await assert.rejects(syncPayment({ repo: mem.repo, gateway: down.gateway }, { paymentKey: "x" }));
});

test("리포트: 결제된 주문만, 한 번만 생성하고 같은 버전을 다시 보여준다", async () => {
  const { mem, assessment } = await setup();
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (started.kind !== "order") throw new Error();
  assert.equal(await ensureReport({ repo: mem.repo, generator: devReportGenerator, now: () => TODAY }, started.order), null);

  const { gateway } = fakeGateway({ confirm: (i) => ({ ok: true, payment: done(i.orderId, i.amount, i.paymentKey) }) });
  const paid = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_r", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error();

  let calls = 0;
  const counting: ReportGenerator = { name: "count", version: "1", generate: async (input) => (calls++, devReportGenerator.generate(input)) };
  const first = await ensureReport({ repo: mem.repo, generator: counting, now: () => TODAY }, paid.order);
  const second = await ensureReport({ repo: mem.repo, generator: counting, now: () => TODAY }, paid.order);
  assert.equal(first?.status, "ready");
  assert.equal(calls, 1);
  assert.deepEqual(second?.content, first?.content);

  const view = await getResultView(mem.repo, { userId: USER, assessmentId: assessment.id });
  assert.equal(view?.report?.status, "ready");
  assert.equal(await getResultView(mem.repo, { userId: OTHER, assessmentId: assessment.id }), null);

  const items = await listMyItems(mem.repo, USER);
  assert.equal(items[0].purchase, "paid");
  assert.equal(items[0].reportStatus, "ready");
});

test("리포트: 생성에 실패하면 failed로 남기고 다시 시도할 수 있다", async () => {
  const { mem, assessment } = await setup();
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (started.kind !== "order") throw new Error();
  const { gateway } = fakeGateway({ confirm: (i) => ({ ok: true, payment: done(i.orderId, i.amount, i.paymentKey) }) });
  const paid = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_f", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error();

  const broken: ReportGenerator = { name: "broken", version: "1", generate: async () => { throw new Error("생성 서버 오류"); } };
  const failed = await ensureReport({ repo: mem.repo, generator: broken, now: () => TODAY }, paid.order);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.lastError, "생성 서버 오류");
  assert.equal(mem.orders.get(paid.order.id)?.status, "paid", "리포트 실패가 결제 상태를 바꾸지 않는다");

  const retried = await ensureReport({ repo: mem.repo, generator: devReportGenerator, now: () => TODAY }, paid.order);
  assert.equal(retried?.status, "ready");
  assert.equal(retried?.attempts, 2);
});

test("가입 동의: 필수 항목이 빠지면 기록하지 않고, 모두 동의하면 이용 가능", async () => {
  const mem = createMemoryRepository(() => TODAY);
  const { getMemberStatus, agreeToTerms, setMarketingConsent, canRemoveOnDecline } = await import("./member-service.ts");
  const fresh = await getMemberStatus(mem.repo, USER);
  assert.deepEqual(fresh, { needsConsent: true, isNew: true, marketing: false });

  const partial = await agreeToTerms(mem.repo, USER, { age_14: true, terms: true });
  assert.equal(partial.ok, false);
  assert.equal((await mem.repo.listConsents(USER)).length, 0);

  assert.deepEqual(await agreeToTerms(mem.repo, USER, { age_14: true, terms: true, privacy: true }), { ok: true });
  const after = await getMemberStatus(mem.repo, USER);
  assert.equal(after.needsConsent, false);
  assert.equal(after.marketing, false, "선택 항목은 따로 동의해야 한다");

  await setMarketingConsent(mem.repo, USER, true);
  assert.equal((await getMemberStatus(mem.repo, USER)).marketing, true);
  await setMarketingConsent(mem.repo, USER, false);
  assert.equal((await getMemberStatus(mem.repo, USER)).marketing, false, "철회는 새 기록으로 남는다");
  assert.equal((await mem.repo.listConsents(USER)).length, 6);

  assert.equal(await canRemoveOnDecline(mem.repo, USER), true);
});

test("가입 동의: 약관 버전이 바뀌면 다시 동의해야 한다", async () => {
  const { hasRequiredConsents } = await import("../membership/terms.ts");
  const old = [
    { type: "age_14" as const, version: "old", agreed: true, createdAt: "2026-01-01T00:00:00Z" },
    { type: "terms" as const, version: "old", agreed: true, createdAt: "2026-01-01T00:00:00Z" },
    { type: "privacy" as const, version: "old", agreed: true, createdAt: "2026-01-01T00:00:00Z" },
  ];
  assert.equal(hasRequiredConsents(old), false);
  assert.equal(hasRequiredConsents(old, "old"), true);
});

test("가입 동의 거절: 저장한 검사가 있는 기존 회원은 계정을 지우지 않는다", async () => {
  const { mem } = await setup();
  const { canRemoveOnDecline } = await import("./member-service.ts");
  assert.equal(await canRemoveOnDecline(mem.repo, USER), false);
  assert.equal(await canRemoveOnDecline(mem.repo, OTHER), true);
});
