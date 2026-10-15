// 실행: npm test — 같은 결과로 개인 통합 리포트를 여러 번 받는다(운영자 2026-10-15): 재결제 · 받은 리포트 전부 기록 · 이미 받은 리포트는 그대로
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import type { GatewayPayment } from "../commerce/order.ts";
import { PERSONAL_REPORT, parsePersonalSeq, personalProductId, productNameOf, isPersonalProduct } from "../config/product.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "../profile/basic-info.ts";
import { devReportGenerator } from "../report/generate-dev-report.ts";
import type { ReportGenerator } from "../report/generator.ts";
import { manseryeokEngine as sajuEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { getMyPage } from "./my-service.ts";
import { confirmPayment, startCheckout } from "./order-service.ts";
import type { PaymentGateway } from "./ports.ts";
import { nextPersonalSeq, paidPersonalOrders } from "./purchases.ts";
import { currentPersonalReport, ensureReport, getResultView } from "./report-service.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const TODAY = new Date("2026-10-11T00:00:00Z");
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const INFO: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true, gender: "female", knownMbti: "INFJ", regionProvince: "서울특별시", regionDistrict: "마포구" };
const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, 4])));

async function setup() {
  const mem = createMemoryRepository(() => TODAY);
  const saved = await submitAssessment({ repo: mem.repo, saju: sajuEngine }, { userId: USER, channel: "web", info: INFO, answers, today: TODAY });
  if (!saved.ok) throw new Error("검사 저장 실패");
  return { mem, assessment: saved.assessment };
}

const deps = (mem: ReturnType<typeof createMemoryRepository>) => ({ repo: mem.repo, now: () => TODAY });

/** 결제 승인 시각이 주문마다 다르도록(실제 결제처럼) 날짜를 하루씩 늘려 가며 승인한다 */
let day = 11;
function gatewayFor() {
  const gateway: PaymentGateway = {
    provider: "tosspayments",
    async confirm(i) {
      const payment: GatewayPayment = { paymentKey: i.paymentKey, orderId: i.orderId, status: "DONE", totalAmount: i.amount, balanceAmount: i.amount, method: "카드", approvedAt: `2026-10-${String(day++).padStart(2, "0")}T10:00:00+09:00`, mId: "tvivarepublica" };
      return { ok: true, payment };
    },
    async getPayment() {
      return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
    },
    async getPaymentByOrderId() {
      return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
    },
  };
  return gateway;
}

async function buy(mem: ReturnType<typeof createMemoryRepository>, assessmentId: string, again: boolean, generator: ReportGenerator = devReportGenerator) {
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId, again });
  if (started.kind !== "order") throw new Error(`주문 시작 실패: ${started.kind}`);
  const paid = await confirmPayment({ repo: mem.repo, gateway: gatewayFor() }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: `pk_${started.order.orderNumber}`, amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error(`승인 실패: ${paid.kind}`);
  const report = await ensureReport({ repo: mem.repo, generator, now: () => TODAY }, paid.order);
  return { order: paid.order, report };
}

test("상품 번호: 첫 구매는 지금까지의 번호 그대로, 다시 받기는 :r2 · :r3 — 번째를 읽을 수 있고 고민 반영 · 유료 질문 번호와 섞이지 않는다", () => {
  assert.equal(personalProductId(1), PERSONAL_REPORT.id);
  assert.equal(personalProductId(2), `${PERSONAL_REPORT.id}:r2`);
  assert.equal(parsePersonalSeq(PERSONAL_REPORT.id), 1);
  assert.equal(parsePersonalSeq(`${PERSONAL_REPORT.id}:r3`), 3);
  for (const bad of [`${PERSONAL_REPORT.id}:r1`, `${PERSONAL_REPORT.id}:r0`, `${PERSONAL_REPORT.id}:r2x`, `${PERSONAL_REPORT.id}:2`, `${PERSONAL_REPORT.id}:r`, "concern-report:abc", "cash-charge:10:0:abcdef", "other"]) {
    assert.equal(parsePersonalSeq(bad), null, bad);
    assert.equal(isPersonalProduct(bad), false, bad);
  }
  assert.equal(productNameOf(`${PERSONAL_REPORT.id}:r2`), `${PERSONAL_REPORT.name} (2번째 받기)`);
  assert.equal(productNameOf(PERSONAL_REPORT.id), PERSONAL_REPORT.name);
});

test("재결제: 이미 받은 뒤 그냥 결제하면 막히고, '새 리포트 받기'(again)를 눌렀을 때만 두 번째 주문이 생긴다", async () => {
  const { mem, assessment } = await setup();
  const first = await buy(mem, assessment.id, false);
  assert.equal(first.report?.status, "ready");

  const plain = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id });
  assert.equal(plain.kind, "already-paid");
  assert.equal(mem.orders.size, 1, "실수로 한 번 더 눌러도 새 주문을 만들지 않는다");

  const again = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id, again: true });
  assert.equal(again.kind, "order");
  if (again.kind !== "order") return;
  assert.equal(again.order.productId, personalProductId(2));
  assert.equal(again.order.amount, PERSONAL_REPORT.priceKrw, "금액은 서버 가격");
  assert.equal(again.order.status, "pending");
});

test("재결제: 다시 눌러도 대기 주문은 하나만 남고, 같은 번째를 쓴다 · 다른 회원은 시작할 수 없다", async () => {
  const { mem, assessment } = await setup();
  await buy(mem, assessment.id, false);
  const a = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id, again: true });
  const b = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id, again: true });
  if (a.kind !== "order" || b.kind !== "order") throw new Error();
  assert.notEqual(a.order.orderNumber, b.order.orderNumber);
  assert.equal(b.order.productId, personalProductId(2));
  assert.equal(mem.orders.get(a.order.id)?.status, "canceled");
  assert.equal([...mem.orders.values()].filter((o) => o.status === "pending").length, 1);

  assert.equal((await startCheckout(deps(mem), { userId: OTHER, assessmentId: assessment.id, again: true })).kind, "not-found");
});

test("재결제: 가장 최근 리포트가 아직 완성되지 않았다면 새로 결제하지 않고 그 리포트의 상태로 돌려보낸다", async () => {
  const { mem, assessment } = await setup();
  const broken: ReportGenerator = { name: "broken", version: "0", async generate() { throw new Error("생성 실패"); } };
  const first = await buy(mem, assessment.id, false, broken);
  assert.equal(first.report?.status, "failed");
  const again = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id, again: true });
  assert.equal(again.kind, "report-not-ready");
  if (again.kind === "report-not-ready") assert.equal(again.order.orderNumber, first.order.orderNumber);
  assert.equal(mem.orders.size, 1);
});

test("재결제: 결제 전에는 again이어도 첫 구매로 시작한다 (받은 리포트가 없으면 일반 결제)", async () => {
  const { mem, assessment } = await setup();
  const r = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id, again: true });
  assert.equal(r.kind, "order");
  if (r.kind === "order") assert.equal(r.order.productId, PERSONAL_REPORT.id);
});

test("받은 리포트 전부 기록: 새로 받아도 먼저 받은 리포트의 내용 · 생성 버전은 그대로이고, 번째 · 받은 순서가 남는다", async () => {
  const { mem, assessment } = await setup();
  const old: ReportGenerator = { name: "dev-rules", version: "old-0.1", async generate(input) { return devReportGenerator.generate(input); } };
  const first = await buy(mem, assessment.id, false, old);
  const firstContent = JSON.stringify(first.report?.content);
  const second = await buy(mem, assessment.id, true);
  const third = await buy(mem, assessment.id, true);

  assert.equal(second.order.productId, personalProductId(2));
  assert.equal(third.order.productId, personalProductId(3));
  const reports = [first, second, third].map((x) => mem.reports.get(x.report!.id)!);
  assert.equal(new Set(reports.map((r) => r.id)).size, 3, "주문마다 리포트가 따로 만들어진다");
  assert.equal(JSON.stringify(reports[0].content), firstContent, "먼저 받은 리포트는 바뀌지 않는다");
  assert.equal(reports[0].generatorVersion, "old-0.1");
  assert.equal(reports[1].generatorVersion, devReportGenerator.version);

  const view = await getResultView(mem.repo, { userId: USER, assessmentId: assessment.id });
  assert.deepEqual(view?.received.map((r) => r.seq), [3, 2, 1], "최근에 받은 것부터");
  assert.equal(view?.paidOrder?.orderNumber, third.order.orderNumber, "고르지 않으면 가장 최근에 완성된 리포트");
});

test("받은 리포트 고르기: 주문번호로 이전에 받은 리포트를 열고, 모르는 번호 · 다른 회원의 주문번호는 무시하고 기본으로 연다", async () => {
  const { mem, assessment } = await setup();
  const first = await buy(mem, assessment.id, false);
  const second = await buy(mem, assessment.id, true);

  const older = await getResultView(mem.repo, { userId: USER, assessmentId: assessment.id, orderNumber: first.order.orderNumber });
  assert.equal(older?.paidOrder?.orderNumber, first.order.orderNumber);
  assert.equal(older?.report?.id, first.report?.id);
  assert.equal(older?.received.length, 2, "목록에는 항상 전부");

  for (const orderNumber of ["MIYU-00000000-NOPE", "'; drop table orders;--"]) {
    const v = await getResultView(mem.repo, { userId: USER, assessmentId: assessment.id, orderNumber });
    assert.equal(v?.paidOrder?.orderNumber, second.order.orderNumber, orderNumber);
  }
  assert.equal(await getResultView(mem.repo, { userId: OTHER, assessmentId: assessment.id, orderNumber: first.order.orderNumber }), null);
});

test("새로 받은 리포트를 만드는 중이면 완성된 이전 리포트가 기본으로 열리고, 새 리포트는 주문번호로 상태를 본다", async () => {
  const { mem, assessment } = await setup();
  const first = await buy(mem, assessment.id, false);
  const started = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id, again: true });
  if (started.kind !== "order") throw new Error();
  const paid = await confirmPayment({ repo: mem.repo, gateway: gatewayFor() }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_new", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error();
  // 결제는 끝났고 리포트는 아직 만들기 전

  const def = await getResultView(mem.repo, { userId: USER, assessmentId: assessment.id });
  assert.equal(def?.paidOrder?.orderNumber, first.order.orderNumber, "이미 받은 리포트를 계속 볼 수 있다");
  const fresh = await getResultView(mem.repo, { userId: USER, assessmentId: assessment.id, orderNumber: paid.order.orderNumber });
  assert.equal(fresh?.paidOrder?.orderNumber, paid.order.orderNumber);
  assert.ok(fresh?.report === null || fresh?.report?.status !== "ready");

  const cur = await currentPersonalReport(mem.repo, [...mem.orders.values()]);
  assert.equal(cur?.order.orderNumber, first.order.orderNumber);
});

test("번째 계산: 환불된 번째도 건너뛰고(같은 번호를 다시 쓰지 않는다), 받은 것이 없으면 1", async () => {
  const { mem, assessment } = await setup();
  assert.equal(nextPersonalSeq([...mem.orders.values()]), 1);
  const first = await buy(mem, assessment.id, false);
  const second = await buy(mem, assessment.id, true);
  assert.equal(nextPersonalSeq([...mem.orders.values()]), 3);
  await mem.repo.updateOrder(second.order.id, ["paid"], { status: "refunded" });
  assert.equal(nextPersonalSeq([...mem.orders.values()]), 3, "환불된 2번째 뒤에도 3번째");
  assert.deepEqual(paidPersonalOrders([...mem.orders.values()]).map((o) => o.orderNumber), [first.order.orderNumber]);
  const next = await startCheckout(deps(mem), { userId: USER, assessmentId: assessment.id, again: true });
  if (next.kind === "order") assert.equal(next.order.productId, personalProductId(3));
});

test("MY: 같은 결과로 받은 리포트가 전부 목록에 있고(주문번호 · 번째 · 생성 버전 · 열 주소), 결제내역에도 모두 남는다", async () => {
  const { mem, assessment } = await setup();
  const old: ReportGenerator = { name: "dev-rules", version: "old-0.1", async generate(input) { return devReportGenerator.generate(input); } };
  const first = await buy(mem, assessment.id, false, old);
  const second = await buy(mem, assessment.id, true);

  const page = await getMyPage(mem.repo, USER);
  assert.equal(page.cards.length, 1);
  const card = page.cards[0];
  assert.deepEqual(card.received.map((r) => [r.seq, r.orderNumber, r.generation]), [
    [2, second.order.orderNumber, "ready"],
    [1, first.order.orderNumber, "ready"],
  ]);
  assert.equal(card.received[1].generatorLabel, "dev-rules old-0.1");
  assert.equal(card.received[0].href, `/results/${assessment.id}?r=${second.order.orderNumber}`);
  assert.equal(card.entitlement, "purchased");
  assert.equal(card.paidOrderNumber, second.order.orderNumber);
  assert.equal(page.orders.filter((o) => o.status === "paid").length, 2);
  assert.ok(page.orders.some((o) => o.productName === `${PERSONAL_REPORT.name} (2번째 받기)`));
});
