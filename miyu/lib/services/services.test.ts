// 실행: npm test — 서비스 흐름을 메모리 저장소와 가짜 결제사로 확인한다.
import assert from "node:assert/strict";
import { REPORT_GENERATING_STALE_MS } from "../commerce/report.ts";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import type { GatewayPayment } from "../commerce/order.ts";
import { isValidOrderNumber } from "../commerce/order.ts";
import { PERSONAL_REPORT } from "../config/product.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "../profile/basic-info.ts";
import { createAiReportGenerator } from "../report/ai/generator.ts";
import { createMockModel } from "../report/ai/mock-model.ts";
import { devReportGenerator } from "../report/generate-dev-report.ts";
import { isReadingReport, type ReportGenerator } from "../report/generator.ts";
import { manseryeokEngine as sajuEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { confirmPayment, markCheckoutFailed, startCheckout, syncPayment } from "./order-service.ts";
import type { GatewayResult, PaymentGateway } from "./ports.ts";
import { getMyPage, orderStatusLabel, traceOrder } from "./my-service.ts";
import { deleteContext, getContextView, saveContext } from "./context-service.ts";
import { canRetryReport, claimReport, completeReport, ensureReport, getResultView, listMyItems, queueReport, reportInputOf, runReport } from "./report-service.ts";
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
  gender: "female",
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
    async getPaymentByOrderId() {
      return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
    },
  };
  return { gateway, calls };
}

function done(orderId: string, amount: number, paymentKey = "pk_test_1"): GatewayPayment {
  return { paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: "2026-10-11T10:00:00+09:00", mId: "tvivarepublica" };
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
  assert.equal(assessment.saju.status, "ok", "만세력 엔진으로 원국을 계산해 함께 저장한다");
  assert.equal(mem.profiles.get(USER)?.nickname, "지민");
  assert.deepEqual(mem.regions.get(USER), { province: "서울특별시", district: "마포구" });
});

test("검사 저장: 성별은 필수 — 여성 · 남성을 고르면 대운 · 배우자 별 계산에 쓰고 결과와 함께 저장하며, 고르지 않으면 저장하지 않는다", async () => {
  const mem = createMemoryRepository(() => TODAY);
  const d = { repo: mem.repo, saju: sajuEngine };
  for (const [g, user] of [["female", USER], ["male", OTHER]] as const) {
    const saved = await submitAssessment(d, { userId: user, channel: "web", info: { ...INFO, gender: g }, answers: answersAll(3), today: TODAY });
    assert.ok(saved.ok, g);
    const a = saved.ok ? saved.assessment : (null as never);
    assert.equal(a.saju.status, "ok");
    assert.equal(a.saju.status === "ok" ? a.saju.gender : null, g);
    assert.ok(a.saju.status === "ok" && a.saju.luck && a.saju.luck.periods.length > 0, "성별이 있으면 대운을 계산한다");
    assert.equal(reportInputOf(a).gender, g, "리포트 생성에 성별 기준이 전달된다");
  }
  // 여성 · 남성 기준은 대운 방향이 달라 결과가 다르다
  const [f, m] = [...mem.assessments.values()].map((x) => x.saju);
  assert.ok(f.status === "ok" && m.status === "ok" && JSON.stringify(f.luck) !== JSON.stringify(m.luck));

  for (const g of ["", undefined] as const) {
    const none = await submitAssessment(d, { userId: "33333333-3333-4333-8333-333333333333", channel: "web", info: { ...INFO, gender: g }, answers: answersAll(3), today: TODAY });
    assert.equal(none.ok, false);
    assert.match(none.ok ? "" : none.message, /성별을 선택해 주세요/);
  }
});

test("검사 저장: 기본 정보나 응답이 잘못되면 거부한다", async () => {
  const mem = createMemoryRepository(() => TODAY);
  const d = { repo: mem.repo, saju: sajuEngine };
  const bad = await submitAssessment(d, { userId: USER, channel: "web", info: { ...INFO, birthMonth: "2", birthDay: "30" }, answers: answersAll(3), today: TODAY });
  assert.equal(bad.ok, false);
  const missing = await submitAssessment(d, { userId: USER, channel: "web", info: INFO, answers: { m1: 3 }, today: TODAY });
  assert.equal(missing.ok, false);
  const noLeap = await submitAssessment(d, {
    userId: USER,
    channel: "web",
    info: { ...INFO, calendar: "lunar", isLeapMonth: true, birthYear: "2021", birthMonth: "4", birthDay: "1" },
    answers: answersAll(3),
    today: TODAY,
  });
  assert.deepEqual(noLeap, { ok: false, message: "2021년에는 음력 윤4월이 없습니다. 윤달이 아니라면 ‘윤달’ 선택을 해제해 주세요." });
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

test("리포트 읽기 구조(AI 모의 모델): 일시 오류가 계속되면 failed, 다시 만들기로 완성하고 이후에는 다시 부르지 않는다", async () => {
  const { mem, assessment } = await setup();
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (started.kind !== "order") throw new Error();
  const { gateway } = fakeGateway({ confirm: (i) => ({ ok: true, payment: done(i.orderId, i.amount, i.paymentKey) }) });
  const paid = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_ai", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error();

  const model = createMockModel({ failTimes: 3 });
  const generator = createAiReportGenerator({ model, now: () => TODAY, sleep: async () => {} });
  const failed = await runReport({ repo: mem.repo, generator, now: () => TODAY }, paid.order);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.lastError, "모의 일시 오류");
  assert.equal(mem.orders.get(paid.order.id)?.status, "paid");

  const ready = await runReport({ repo: mem.repo, generator, now: () => TODAY }, paid.order, { retryFailed: true, ignoreCooldown: true });
  assert.equal(ready?.status, "ready");
  assert.equal(ready?.generator, "ai:mock");
  assert.ok(ready?.content && isReadingReport(ready.content));
  assert.equal(ready.content.personName, "지민");

  const callsBefore = model.calls;
  const again = await ensureReport({ repo: mem.repo, generator, now: () => TODAY }, paid.order);
  assert.equal(model.calls, callsBefore, "완성된 리포트는 다시 보기만 한다 (AI 비용 없음)");
  assert.deepEqual(again?.content, ready.content);
});

test("내 고민 자세히 알려주기: 본인 결과에만 저장 · 수정 · 삭제, 동의 없이는 저장하지 않고 연락처는 가린다", async () => {
  const { mem, assessment } = await setup();
  const ids = { userId: USER, assessmentId: assessment.id };
  const raw = { topic: "marriage", question: "지금 사람과 결혼을 결정해도 될지", excerpt: "그 사람 번호는 010-2222-3333" };

  const noAgree = await saveContext(mem.repo, { ...ids, raw, agreed: false, now: () => TODAY });
  assert.equal(noAgree.kind, "invalid");
  assert.equal(await mem.repo.getContext(assessment.id), null);

  const other = await saveContext(mem.repo, { userId: OTHER, assessmentId: assessment.id, raw, agreed: true, now: () => TODAY });
  assert.equal(other.kind, "not-found", "다른 회원의 검사 결과에는 저장할 수 없다");
  assert.equal(await getContextView(mem.repo, { userId: OTHER, assessmentId: assessment.id }), null);

  const saved = await saveContext(mem.repo, { ...ids, raw, agreed: true, now: () => TODAY });
  assert.equal(saved.kind, "saved");
  if (saved.kind !== "saved") return;
  assert.equal(saved.redactions, 1);
  assert.equal(saved.context.excerpt, "그 사람 번호는 [연락처 가림]");
  assert.equal(saved.context.agreedAt, TODAY.toISOString());

  const edited = await saveContext(mem.repo, { ...ids, raw: { topic: "work", situation: "결정을 미뤄요" }, agreed: true, now: () => TODAY });
  assert.ok(edited.kind === "saved" && edited.context.topic === "work" && edited.context.question === "" && edited.context.excerpt === "");
  const view = await getContextView(mem.repo, ids);
  assert.equal(view?.context?.situation, "결정을 미뤄요");
  assert.equal(view?.reportStatus, null);
  assert.deepEqual((await mem.repo.listContexts(USER)).map((c) => c.topic), ["work"]);

  assert.equal(await deleteContext(mem.repo, { userId: OTHER, assessmentId: assessment.id }), false);
  assert.ok(await mem.repo.getContext(assessment.id), "다른 회원은 지울 수 없다");
  assert.equal(await deleteContext(mem.repo, ids), true);
  assert.equal(await mem.repo.getContext(assessment.id), null);
});

test("내 고민 자세히 알려주기: AI 생성기는 생성 시점의 내용을 반영하고, 리포트를 만든 뒤 고치거나 지워도 구매한 리포트는 그대로다", async () => {
  const { mem, assessment } = await setup();
  await saveContext(mem.repo, { userId: USER, assessmentId: assessment.id, raw: { topic: "work", question: "이직을 해도 될지" }, agreed: true, now: () => TODAY });
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (started.kind !== "order") throw new Error();
  const { gateway } = fakeGateway({ confirm: (i) => ({ ok: true, payment: done(i.orderId, i.amount, i.paymentKey) }) });
  const paid = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_ctx", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error();

  const generator = createAiReportGenerator({ model: createMockModel(), now: () => TODAY, sleep: async () => {} });
  const ready = await ensureReport({ repo: mem.repo, generator, now: () => TODAY }, paid.order);
  assert.ok(ready?.content && isReadingReport(ready.content));
  assert.equal(ready.content.generated?.context?.topicLabel, "일 · 진로 · 이직");
  assert.match(ready.content.focus?.[0].text ?? "", /알려 주신 고민/);
  assert.equal((await getContextView(mem.repo, { userId: USER, assessmentId: assessment.id }))?.reportStatus, "ready");

  const before = JSON.stringify(ready.content);
  await deleteContext(mem.repo, { userId: USER, assessmentId: assessment.id });
  const again = await ensureReport({ repo: mem.repo, generator, now: () => TODAY }, paid.order);
  assert.equal(JSON.stringify(again?.content), before);
});

test("내 고민 자세히 알려주기: 개발용 규칙 생성기는 반영하지 않으므로 읽지도 않는다", async () => {
  const { mem, assessment } = await setup();
  await saveContext(mem.repo, { userId: USER, assessmentId: assessment.id, raw: { topic: "love" }, agreed: true, now: () => TODAY });
  let reads = 0;
  const original = mem.repo.getContext;
  mem.repo.getContext = async (id) => (reads++, original(id));
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (started.kind !== "order") throw new Error();
  const { gateway } = fakeGateway({ confirm: (i) => ({ ok: true, payment: done(i.orderId, i.amount, i.paymentKey) }) });
  const paid = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_dev", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error();
  const ready = await ensureReport({ repo: mem.repo, generator: devReportGenerator, now: () => TODAY }, paid.order);
  assert.equal(ready?.status, "ready");
  assert.equal(reads, 0);
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

test("MY: 구매 전에는 무료 결과, 결제 후에는 구매 완료 · 생성 상태를 따로 보여준다", async () => {
  const { mem, assessment } = await setup();
  let page = await getMyPage(mem.repo, USER);
  assert.equal(page.cards[0].entitlement, "free");
  assert.equal(page.cards[0].generation, "none");
  assert.match(page.cards[0].subject, /^지민 님 · 1995년 4월 12일/);
  assert.deepEqual(page.orders, []);

  const first = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id, paymentEnv: "test-docs" });
  const second = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id, paymentEnv: "test-docs" });
  if (first.kind !== "order" || second.kind !== "order") throw new Error();
  const { gateway } = fakeGateway({ confirm: (i) => ({ ok: true, payment: done(i.orderId, i.amount, i.paymentKey) }) });
  const paid = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: second.order.orderNumber, paymentKey: "pk_my", amount: second.order.amount });
  if (paid.kind !== "paid") throw new Error(paid.kind);

  // 결제는 끝났지만 리포트 생성이 실패한 상태: 다시 구매하게 하지 않는다
  const broken: ReportGenerator = { name: "broken", version: "0", async generate() { throw new Error("생성 실패"); } };
  await ensureReport({ repo: mem.repo, generator: broken, now: () => TODAY }, paid.order);
  page = await getMyPage(mem.repo, USER);
  assert.equal(page.cards[0].entitlement, "purchased");
  assert.equal(page.cards[0].generation, "failed");
  assert.equal(page.cards[0].paidOrderNumber, second.order.orderNumber);

  await ensureReport({ repo: mem.repo, generator: devReportGenerator, now: () => TODAY }, paid.order);
  page = await getMyPage(mem.repo, USER);
  assert.equal(page.cards[0].generation, "ready");

  // 결제내역: 최근 주문부터, 대체된 주문과 테스트 표시 구분
  assert.deepEqual(
    page.orders.map((o) => [o.orderNumber, o.statusLabel, o.paymentEnv]),
    [
      [second.order.orderNumber, "결제 완료", "test-docs"],
      [first.order.orderNumber, "새 결제로 대체", "test-docs"],
    ],
  );
});

test("주문 추적: 주문번호로 승인 기록(상점 ID 포함) · 주문 상태 · 리포트 권한을 함께 보고, 다른 회원은 볼 수 없다", async () => {
  const { mem, assessment } = await setup();
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id, paymentEnv: "test" });
  if (started.kind !== "order") throw new Error();
  const { gateway } = fakeGateway({ confirm: (i) => ({ ok: true, payment: done(i.orderId, i.amount, i.paymentKey) }) });
  await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_trace", amount: started.order.amount });

  const trace = await traceOrder(mem.repo, mem.repo, { userId: USER, orderNumber: started.order.orderNumber });
  assert.ok(trace);
  assert.equal(trace.order.status, "paid");
  assert.equal(trace.entitled, true);
  const approval = trace.events.find((e) => e.source === "승인 요청" && e.status === "DONE");
  assert.equal(approval?.mId, "tvivarepublica");
  assert.equal(approval?.method, "카드");
  assert.equal(await traceOrder(mem.repo, mem.repo, { userId: OTHER, orderNumber: started.order.orderNumber }), null);

  // 결제 화면까지만 가고 승인되지 않은 주문은 리포트 권한이 없다
  const another = await submitAssessment({ repo: mem.repo, saju: sajuEngine }, { userId: USER, channel: "web", info: INFO, answers: answersAll(2), today: TODAY });
  if (!another.ok) throw new Error();
  const pending = await startCheckout(deps(mem), { userId: USER, assessmentId: another.assessment.id });
  if (pending.kind !== "order") throw new Error();
  const notPaid = await traceOrder(mem.repo, mem.repo, { userId: USER, orderNumber: pending.order.orderNumber, now: TODAY });
  assert.equal(notPaid?.entitled, false);
  // 방금 연 결제창은 승인 여부를 아직 모르므로 "확인 중", 오래 지나도 기록이 없으면 "미완료"
  assert.equal(notPaid?.order.statusLabel, "결제 확인 중");
  assert.equal(orderStatusLabel({ status: "pending", failureCode: null, createdAt: "2026-01-01T00:00:00Z" }, new Date("2026-01-01T02:00:00Z")), "결제 미완료");
});

async function paidOrder() {
  const { mem, assessment } = await setup();
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  if (started.kind !== "order") throw new Error();
  const { gateway } = fakeGateway({ confirm: (i) => ({ ok: true, payment: done(i.orderId, i.amount, i.paymentKey) }) });
  const paid = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: `pk_${Math.random()}`, amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error(paid.kind);
  return { mem, order: paid.order };
}

test("백그라운드 생성: 결제 직후에는 대기열에만 올리고(AI를 기다리지 않음), 한 곳만 생성 권리를 가져간다", async () => {
  const { mem, order } = await paidOrder();
  const queued = await queueReport({ repo: mem.repo }, order);
  assert.equal(queued?.status, "queued");
  assert.equal(queued?.attempts, 0);
  assert.equal((await queueReport({ repo: mem.repo }, order))?.id, queued?.id, "두 번 올려도 하나");

  const d = { repo: mem.repo, generator: devReportGenerator, now: () => TODAY };
  const first = await claimReport(d, order);
  const second = await claimReport(d, order);
  assert.equal(first.claimed, true);
  assert.equal(second.claimed, false, "동시에 와도 한 곳만 생성");
  assert.equal(first.report?.attempts, 1);
  const ready = await completeReport(d, order, first.report!);
  assert.equal(ready?.status, "ready");
  assert.equal((await runReport(d, order))?.readyAt, ready?.readyAt, "완성 후에는 다시 만들지 않는다");
});

test("백그라운드 생성: 서버가 멈춰 생성 중으로 남으면 일정 시간 뒤 다시 가져가고, 실패는 고객이 누를 때만 다시 만든다", async () => {
  const { mem, order } = await paidOrder();
  let now = TODAY.getTime();
  const d = { repo: mem.repo, generator: devReportGenerator, now: () => new Date(now) };
  const abandoned = await claimReport(d, order); // 생성 시작 후 서버가 꺼졌다고 가정 (completeReport 호출 안 함)
  assert.equal(abandoned.claimed, true);
  assert.equal((await claimReport(d, order)).claimed, false, "아직 진행 중으로 본다");
  now += REPORT_GENERATING_STALE_MS + 60 * 1000; // 멈춤 판단 시간(10분)을 넘게 멈춤
  mem.reports.get(abandoned.report!.id)!.updatedAt = TODAY.toISOString();
  const resumed = await claimReport(d, order);
  assert.equal(resumed.claimed, true, "멈춘 작업을 이어받는다");
  assert.equal(resumed.report?.attempts, 2);

  const broken: ReportGenerator = { name: "broken", version: "0", async generate() { throw new Error("모델 응답 형식 오류"); } };
  const failed = await completeReport({ ...d, generator: broken }, order, resumed.report!);
  assert.equal(failed?.status, "failed");
  assert.equal((await claimReport(d, order)).claimed, false, "실패는 자동으로 반복하지 않는다");
  const retried = await runReport(d, order, { retryFailed: true, ignoreCooldown: true });
  assert.equal(retried?.status, "ready");
  assert.equal(mem.orders.get(order.id)?.status, "paid", "결제 상태는 그대로");
});

test("백그라운드 생성: 시도 횟수 상한을 넘으면 더 만들지 않고 운영자 확인 대상으로 남긴다", async () => {
  const { mem, order } = await paidOrder();
  const broken: ReportGenerator = { name: "broken", version: "0", async generate() { throw new Error("실패"); } };
  const d = { repo: mem.repo, generator: broken, now: () => TODAY };
  await queueReport(d, order);
  for (let i = 0; i < 5; i++) await runReport(d, order, { retryFailed: true, ignoreCooldown: true });
  const report = await mem.repo.getReportByOrder(order.id);
  assert.equal(report?.attempts, 5);
  assert.equal(canRetryReport(report), false);
  assert.equal((await claimReport({ ...d, generator: devReportGenerator }, order, { retryFailed: true, ignoreCooldown: true })).claimed, false);
});
