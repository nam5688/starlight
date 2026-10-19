// 실행: npm test — 사주 궁합(유료): 판매 스위치 · 결제 시작 · 상대 출생정보 보관과 지우기 · 리포트 생성(모의 AI) · 열람 권한 · 매출 구분.
// 메모리 저장소 + 가짜 결제사 + 모의 AI. 실제 AI · 결제사를 부르지 않는다. 판매 스위치는 시험에서만 켠다(실제 값은 꺼져 있다).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import type { GatewayPayment } from "../commerce/order.ts";
import { compatProductId, isCompatProduct, SAJU_COMPAT } from "../config/product.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "../profile/basic-info.ts";
import { createAiReportGenerator } from "../report/ai/generator.ts";
import { createMockModel } from "../report/ai/mock-model.ts";
import { isCompatReport } from "../report/compat/types.ts";
import { devReportGenerator } from "../report/generate-dev-report.ts";
import { manseryeokEngine as sajuEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { getCompatReportView, listMyCompat, readCompatPartner, startCompatCheckout } from "./compat-service.ts";
import { getMetrics } from "./metrics-service.ts";
import { withdrawMember } from "./member-service.ts";
import { applyPayment, confirmPayment, startCheckout } from "./order-service.ts";
import type { PaymentGateway } from "./ports.ts";
import { claimReport, completeReport, ensureReport, getResultView, listMyItems, queueReport } from "./report-service.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const T0 = new Date("2026-10-17T00:00:00Z");
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const INFO: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "슬기", birthYear: "1996", birthMonth: "3", birthDay: "29", birthTime: "09:30", gender: "female", knownMbti: "INFJ", regionProvince: "서울특별시", regionDistrict: "마포구" };
const answersAll = (v: number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, v])));
const PARTNER = { nickname: "남수", gender: "male", calendar: "solar", isLeapMonth: false, birthYear: "1994", birthMonth: "11", birthDay: "2", birthTime: "09:30", birthTimeUnknown: false };

function done(orderId: string, amount: number, paymentKey: string): GatewayPayment {
  return { paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: "2026-10-17T10:00:00+09:00", mId: "fake" };
}
const gatewayOk = (): PaymentGateway => ({
  provider: "tosspayments",
  async confirm(i) {
    return { ok: true, payment: done(i.orderId, i.amount, i.paymentKey) };
  },
  async getPayment() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
  async getPaymentByOrderId() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
});

async function setup() {
  const clock = { now: T0 };
  const mem = createMemoryRepository(() => clock.now);
  const saved = await submitAssessment({ repo: mem.repo, saju: sajuEngine }, { userId: USER, channel: "web", info: INFO, answers: answersAll(4), today: T0 });
  assert.ok(saved.ok);
  const assessment = saved.ok ? saved.assessment : (null as never);
  const model = createMockModel();
  const generator = createAiReportGenerator({ model, now: () => T0, sleep: async () => {} });
  const start = (partner: unknown = PARTNER, over: Partial<Parameters<typeof startCompatCheckout>[0]> = {}) =>
    startCompatCheckout({ repo: mem.repo, now: () => clock.now, saleOpen: true, generatorReady: true, ...over }, { userId: USER, assessmentId: assessment.id, partner, relationship: "lover", myGender: "female" });
  const gen = () => ({ repo: mem.repo, generator, now: () => clock.now });
  async function buy() {
    const started = await start();
    if (started.kind !== "order") throw new Error(`주문 실패: ${started.kind}`);
    const paid = await confirmPayment({ repo: mem.repo, gateway: gatewayOk() }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: `pk_${started.requestId}`, amount: started.order.amount });
    if (paid.kind !== "paid") throw new Error("결제 실패");
    return { started, order: paid.order };
  }
  return { mem, clock, assessment, model, generator, start, gen, buy };
}

test("판매 스위치가 꺼져 있으면(실제 기본값) 주문을 만들지 않는다 — 돈이 빠지지 않는다", async () => {
  assert.equal(SAJU_COMPAT.saleOpen, false);
  const s = await setup();
  const r = await startCompatCheckout({ repo: s.mem.repo, now: () => s.clock.now, generatorReady: true }, { userId: USER, assessmentId: s.assessment.id, partner: PARTNER, relationship: "lover", myGender: "female" });
  assert.equal(r.kind, "not-open");
  assert.equal((await s.mem.repo.listOrdersForAssessment(s.assessment.id)).length, 0);
});

test("AI가 연결되지 않았으면(개발용 생성기) 스위치가 켜져 있어도 주문을 만들지 않는다", async () => {
  const s = await setup();
  assert.equal((await s.start(PARTNER, { generatorReady: false })).kind, "ai-not-connected");
  assert.equal(devReportGenerator.generateCompat, undefined);
});

test("다른 사람의 검사 결과로는 시작하지 못한다", async () => {
  const s = await setup();
  const r = await startCompatCheckout({ repo: s.mem.repo, now: () => s.clock.now, saleOpen: true, generatorReady: true }, { userId: OTHER, assessmentId: s.assessment.id, partner: PARTNER, relationship: "lover", myGender: "female" });
  assert.equal(r.kind, "not-found");
});

test("상대 입력이 잘못되면 주문 없이 이유를 알려 준다", async () => {
  const s = await setup();
  assert.equal((await s.start({ ...PARTNER, birthYear: "", birthMonth: "", birthDay: "" })).kind, "invalid");
  assert.equal((await s.start({ ...PARTNER, birthDay: "31", birthMonth: "2" })).kind, "invalid");
  assert.equal((await s.start("not-an-object")).kind, "invalid");
  assert.equal((await s.mem.repo.listOrdersForAssessment(s.assessment.id)).length, 0);
  assert.equal(readCompatPartner({ ...PARTNER, nickname: "가".repeat(30) }, T0, "lover").ok, false);
});

test("시작하면 사주 궁합 주문(상품 번호 saju-compat:요청번호) + 상대 출생정보 보관이 생기고, 개인 통합 리포트 주문과 섞이지 않는다", async () => {
  const s = await setup();
  const r = await s.start();
  assert.equal(r.kind, "order");
  if (r.kind !== "order") return;
  assert.equal(r.order.productId, compatProductId(r.requestId));
  assert.ok(isCompatProduct(r.order.productId));
  assert.equal(r.order.amount, SAJU_COMPAT.priceKrw);
  const req = await s.mem.repo.getCompatRequestByOrder(r.order.id);
  assert.equal(req?.partner?.birthYear, 1994);
  assert.equal(req?.partner?.nickname, "남수");
  // 개인 통합 리포트의 결과 화면 · MY 목록 · 결제 시작은 이 주문을 모른다
  const view = await getResultView(s.mem.repo, { userId: USER, assessmentId: s.assessment.id });
  assert.equal(view?.paidOrder, null);
  const personal = await startCheckout({ repo: s.mem.repo, now: () => s.clock.now }, { userId: USER, assessmentId: s.assessment.id });
  assert.equal(personal.kind, "order");
});

test("결제하지 않고 다시 시작하면 이전 대기 주문은 취소되고 보관한 상대 정보도 지워진다", async () => {
  const s = await setup();
  const first = await s.start();
  assert.equal(first.kind, "order");
  s.clock.now = new Date(T0.getTime() + 60_000);
  const second = await s.start({ ...PARTNER, nickname: "도윤" });
  assert.equal(second.kind, "order");
  if (first.kind !== "order" || second.kind !== "order") return;
  const old = await s.mem.repo.getOrderByNumber(first.order.orderNumber);
  assert.equal(old?.status, "canceled");
  const oldReq = await s.mem.repo.getCompatRequestByOrder(first.order.id);
  assert.equal(oldReq?.partner, null);
  assert.ok(oldReq?.scrubbedAt);
  assert.equal((await s.mem.repo.getCompatRequestByOrder(second.order.id))?.partner?.nickname, "도윤");
});

test("결제 → 리포트 생성(모의 AI) → 완성되면 상대 출생정보가 지워지고, 리포트는 본인만 열 수 있다", async () => {
  const s = await setup();
  const { order } = await s.buy();
  await queueReport({ repo: s.mem.repo }, order);
  const report = await ensureReport(s.gen(), order);
  assert.equal(report?.status, "ready");
  assert.ok(report?.content && isCompatReport(report.content));
  if (!report?.content || !isCompatReport(report.content)) return;
  assert.deepEqual(report.content.names, { a: "슬기", b: "남수" });
  assert.equal(report.content.placeholder, true, "모의 작성기의 글은 자리 표시 글로 표시된다");
  // 상대 출생정보 삭제
  const req = await s.mem.repo.getCompatRequestByOrder(order.id);
  assert.equal(req?.partner, null);
  assert.ok(req?.scrubbedAt);
  // 저장된 글 어디에도 상대 생년월일이 없다
  assert.ok(!JSON.stringify(report.content).includes("1994"));
  // 열람: 본인만
  const mine = await getCompatReportView(s.mem.repo, { userId: USER, orderNumber: order.orderNumber });
  assert.equal(mine.kind, "ready");
  assert.equal((await getCompatReportView(s.mem.repo, { userId: OTHER, orderNumber: order.orderNumber })).kind, "not-found");
  // 개인 통합 리포트 화면에는 나타나지 않는다
  assert.equal((await getResultView(s.mem.repo, { userId: USER, assessmentId: s.assessment.id }))?.received.length, 0);
  assert.equal((await listMyItems(s.mem.repo, USER))[0].purchase, "none");
  const list = await listMyCompat(s.mem.repo, USER);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].names, { a: "슬기", b: "남수" });
  assert.equal(list[0].status, "paid-ready");
});

test("같은 모의 AI로 같은 쌍을 두 번 결제해도(요청이 다르면) 각각 따로 리포트가 생긴다", async () => {
  const s = await setup();
  const a = await s.buy();
  const b = await s.buy();
  assert.notEqual(a.order.productId, b.order.productId);
  await ensureReport(s.gen(), a.order);
  await ensureReport(s.gen(), b.order);
  assert.equal((await listMyCompat(s.mem.repo, USER)).length, 2);
});

test("생성기가 사주 궁합을 만들 수 없으면(개발용 규칙 생성기) 실패로 남고 상대 정보는 지우지 않는다 — 같은 주문으로 다시 만들 수 있다", async () => {
  const s = await setup();
  const { order } = await s.buy();
  const broken = { repo: s.mem.repo, generator: devReportGenerator, now: () => s.clock.now };
  const failed = await ensureReport(broken, order);
  assert.equal(failed?.status, "failed");
  assert.match(failed?.lastError ?? "", /사주 궁합/);
  assert.ok((await s.mem.repo.getCompatRequestByOrder(order.id))?.partner, "실패했으니 상대 정보는 그대로(재시도에 필요)");
  // AI 생성기로 다시 만든다
  const again = await ensureReport(s.gen(), order);
  assert.equal(again?.status, "ready");
  assert.equal((await s.mem.repo.getCompatRequestByOrder(order.id))?.partner, null);
});

test("이미 완성된 리포트는 다시 가져가 만들지 않고 저장된 글이 그대로 보인다", async () => {
  const s = await setup();
  const { order } = await s.buy();
  await ensureReport(s.gen(), order);
  const claim = await claimReport({ repo: s.mem.repo, generator: s.generator, now: () => s.clock.now }, order, { retryFailed: true, ignoreCooldown: true });
  assert.equal(claim.claimed, false, "이미 완성된 리포트는 다시 가져가지 않는다");
  const view = await getCompatReportView(s.mem.repo, { userId: USER, orderNumber: order.orderNumber });
  assert.equal(view.kind, "ready");
});

test("완성된 뒤 리포트 생성을 강제로 다시 돌려도(내용이 지워진 요청) 오류로 실패하고 개인정보를 만들어 내지 않는다", async () => {
  const s = await setup();
  const { order } = await s.buy();
  await s.mem.repo.scrubCompatRequest(order.id);
  const report = (await queueReport({ repo: s.mem.repo }, order))!;
  const claimed = await s.mem.repo.updateReport(report.id, ["queued"], { status: "generating", attempts: 1 });
  assert.ok(claimed);
  const after = await completeReport(s.gen(), order, claimed!);
  assert.equal(after?.status, "failed");
  assert.match(after?.lastError ?? "", /지워져/);
});

test("결제사에서 환불되면(리포트가 만들어지기 전이어도) 보관해 둔 상대 정보를 지우고, 환불된 주문은 열람이 막힌다", async () => {
  const s = await setup();
  const { order } = await s.buy();
  assert.ok((await s.mem.repo.getCompatRequestByOrder(order.id))?.partner, "결제 직후에는 만들기 위해 보관 중");
  const canceled: GatewayPayment = { ...done(order.orderNumber, order.amount, order.paymentKey!), status: "CANCELED", balanceAmount: 0 };
  const applied = await applyPayment(s.mem.repo, order, canceled, "reconcile");
  assert.equal(applied.kind, "updated");
  assert.equal((await s.mem.repo.getCompatRequestByOrder(order.id))?.partner, null);
  const view = await getCompatReportView(s.mem.repo, { userId: USER, orderNumber: order.orderNumber });
  assert.equal(view.kind, "refunded");
});

test("탈퇴하면 상대 출생정보가 지워진다", async () => {
  const s = await setup();
  const started = await s.start();
  assert.equal(started.kind, "order");
  if (started.kind !== "order") return;
  // 결제 대기 주문이 남아 있으면 탈퇴가 막힌다 — 취소 뒤 탈퇴
  await s.mem.repo.updateOrder(started.order.id, ["pending"], { status: "canceled", failureCode: "T", failureMessage: "t" });
  const result = await withdrawMember(s.mem.repo, USER);
  assert.equal(result.kind, "done");
  const req = await s.mem.repo.getCompatRequestByOrder(started.order.id);
  assert.equal(req?.partner ?? null, null);
});

test("관리자 지표에서 사주 궁합(실결제)은 개인 리포트 매출 · 한 건당 계산과 따로 센다", async () => {
  const s = await setup();
  const started = await startCompatCheckout({ repo: s.mem.repo, now: () => s.clock.now, saleOpen: true, generatorReady: true }, { userId: USER, assessmentId: s.assessment.id, partner: PARTNER, relationship: "lover", myGender: "female", paymentEnv: "live" });
  assert.equal(started.kind, "order");
  if (started.kind !== "order") return;
  const paid = await confirmPayment({ repo: s.mem.repo, gateway: gatewayOk() }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_live_compat", amount: started.order.amount });
  assert.equal(paid.kind, "paid");
  if (paid.kind !== "paid") return;
  await ensureReport(s.gen(), paid.order);
  const m = await getMetrics(s.mem.repo, s.clock.now, 30);
  assert.equal(m.revenue.compat.paidCount, 1);
  assert.equal(m.revenue.compat.netKrw, SAJU_COMPAT.priceKrw);
  assert.equal(m.revenue.paidCount, 0, "개인 리포트 결제 수에 섞이지 않는다");
  assert.equal(m.revenue.grossKrw, 0, "개인 리포트 매출에 섞이지 않는다");
  assert.equal(m.funnel.find((f) => f.key === "checkout")?.count, 0, "개인 리포트 결제 시작 단계에 섞이지 않는다");
});
