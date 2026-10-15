// 실행: npm test — 운영자 문의 대응: 결제사 확인 뒤에만 질문을 수동 반영하고(주문당 한 번, 결제 완료가 아니면 안 함), 최근 주문 · 리포트 읽기 전용 보기는 필요한 것만 보여 준다
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { QUESTION_PACK_SIZE, QUESTION_PACK_UNITS } from "../config/product.ts";
import { createQuestionNonce } from "../commerce/cash.ts";
import { EMPTY_BASIC_INFO } from "../profile/basic-info.ts";
import { manseryeokEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { adminCreditQuestionOrder, adminReportView, questionLedgerState, recentOrdersForAdmin } from "./admin-support-service.ts";
import { getAdminOverview, adminLookup } from "./admin-service.ts";
import { getCashView, startQuestionPayment } from "./cash-service.ts";
import { confirmPayment, startCheckout } from "./order-service.ts";
import { reconcileOrder, type ReconcileOutcome } from "./reconcile-service.ts";
import type { OrderRecord } from "./ports.ts";
import { createFakeToss } from "./testing/fake-toss.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";
import { PERSONAL_REPORT } from "../config/product.ts";
import { sampleReadingReport } from "../samples/sample-reading-report.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const INFO = { ...EMPTY_BASIC_INFO, nickname: "슬기", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true, gender: "female" as const };
const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, 4])));

async function world() {
  const t = new Date("2026-10-15T03:00:00Z").getTime();
  const now = () => new Date(t);
  const mem = createMemoryRepository(now);
  const toss = createFakeToss(now);
  const saved = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: USER, channel: "web", info: INFO, answers, today: now() });
  if (!saved.ok) throw new Error(saved.message);
  const assessment = saved.assessment;
  let n = 0;
  // 질문 결제 주문(대기)을 하나 만든다 — 무료 질문을 다 쓴 방에서
  const answerer = { provider: "t", model: "t", answer: async () => ({ paragraphs: ["답이에요."] }) };
  const context = { room: { label: "연애", mode: "연애박사 미유", focus: "연애 · 관계" }, intake: null, topic: { title: "가까운 관계", headline: "확인이 되면 마음이 편해져요", summary: ["확인이 있으면 편해져요."], detail: [] }, overview: { headline: "확인을 중요하게 여겨요", tendency: null, strength: null, caution: null, flow: null }, followUp: false, taste: false };
  const deps = { repo: mem.repo, answerer, now, config: { extraQuestions: 0 }, nonce: (r: string) => createQuestionNonce(r, (b) => b.fill(++n % 200)), loadAsk: async () => ({ context, referenceDate: "2026-10-15", tier: "paid" as const, room: "love", roomKey: "love" }) };
  async function questionOrder(): Promise<OrderRecord> {
    for (let i = 0; i < 3; i++) await mem.repo.addChatQuestion({ userId: USER, assessmentId: assessment.id, roomKey: "love" });
    const r = await startQuestionPayment(deps, { userId: USER, assessmentId: assessment.id, roomKey: "love", question: "요즘 연락이 뜸한 사람이 있어요", paymentEnv: "test" });
    if (r.kind !== "order") throw new Error(r.kind);
    return r.order;
  }
  /** 결제사에서는 승인됐지만 우리 쪽 장부에는 아직 질문이 없다 — 트리거가 건너뛴 경우를 흉내 낸다(주문만 결제 완료로 놓는다) */
  function paidWithoutLedger(order: OrderRecord): OrderRecord {
    toss.approveBehindOurBack(`pk_${order.orderNumber}`, order.orderNumber, order.amount);
    const paid = { ...order, status: "paid" as const, approvedAt: now().toISOString() };
    mem.orders.set(order.id, paid);
    return paid;
  }
  const verify = (order: OrderRecord): Promise<ReconcileOutcome> => reconcileOrder({ repo: mem.repo, gateway: toss.gateway, now: () => new Date(t + 60_000) }, order, { pendingMinAgeMs: 0 });
  return { mem, toss, now, assessment, questionOrder, paidWithoutLedger, verify };
}

test("수동 반영: 결제사 기록으로 결제 완료를 확인한 질문 결제 주문에만 질문 3개 묶음(9단위)이 들어가고, 같은 주문에는 두 번 들어가지 않는다", async () => {
  const w = await world();
  const order = w.paidWithoutLedger(await w.questionOrder());
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0, "시작 상태: 결제는 됐는데 질문이 없다");
  const state = await questionLedgerState(w.mem.repo, order);
  assert.deepEqual([state?.ready, state?.credited, state?.questionsLeft], [true, false, 0]);

  const first = await adminCreditQuestionOrder({ repo: w.mem.repo, verify: w.verify }, order);
  assert.deepEqual(first, { kind: "credited" });
  const view = await getCashView(w.mem.repo, USER);
  assert.equal(view.balance, QUESTION_PACK_UNITS);
  assert.equal(view.questions, QUESTION_PACK_SIZE);
  assert.deepEqual(view.ledger.map((l) => [l.kind, l.amount]), [["charge", QUESTION_PACK_UNITS]]);
  assert.equal((await questionLedgerState(w.mem.repo, order))?.credited, true);

  // 버튼을 다시 눌러도 더 들어가지 않는다
  const second = await adminCreditQuestionOrder({ repo: w.mem.repo, verify: w.verify }, order);
  assert.equal(second.kind, "already");
  assert.equal((await getCashView(w.mem.repo, USER)).balance, QUESTION_PACK_UNITS);
  assert.equal(w.mem.ledger.filter((l) => l.orderId === order.id).length, 1);
});

test("수동 반영: 결제사에 결제 기록이 없으면(주문만 결제 완료로 적혀 있어도) 질문을 넣지 않는다 — 주문 상태도 바꾸지 않는다", async () => {
  const w = await world();
  const pending = await w.questionOrder();
  const fake: OrderRecord = { ...pending, status: "paid", approvedAt: w.now().toISOString() };
  w.mem.orders.set(pending.id, fake); // 결제사에는 이 주문의 결제가 없다
  const r = await adminCreditQuestionOrder({ repo: w.mem.repo, verify: w.verify }, fake);
  assert.equal(r.kind, "not-verified");
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0);
  assert.equal(w.mem.orders.get(pending.id)?.status, "paid", "대조는 상태를 임의로 바꾸지 않고 사람이 확인할 일로 남긴다");
});

test("수동 반영: 결제사에서 취소된 결제 · 금액이 다른 결제 · 아직 결제 진행 중인 주문에는 질문을 넣지 않는다", async () => {
  // 취소된 결제
  const a = await world();
  const paidA = a.paidWithoutLedger(await a.questionOrder());
  a.toss.cancel(`pk_${paidA.orderNumber}`);
  const refunded = await adminCreditQuestionOrder({ repo: a.mem.repo, verify: a.verify }, paidA);
  assert.equal(refunded.kind, "not-verified");
  assert.equal((await getCashView(a.mem.repo, USER)).balance, 0);
  assert.equal(a.mem.orders.get(paidA.id)?.status, "refunded", "결제사 기록에 맞춰 환불됨으로 맞춘다");

  // 금액 불일치
  const b = await world();
  const orderB = await b.questionOrder();
  b.toss.approveBehindOurBack(`pk_${orderB.orderNumber}`, orderB.orderNumber, orderB.amount - 100);
  const paidB: OrderRecord = { ...orderB, status: "paid", approvedAt: b.now().toISOString() };
  b.mem.orders.set(orderB.id, paidB);
  const mismatch = await adminCreditQuestionOrder({ repo: b.mem.repo, verify: b.verify }, paidB);
  assert.equal(mismatch.kind, "not-verified");
  assert.equal((await getCashView(b.mem.repo, USER)).balance, 0);

  // 결제 진행 중(인증만 끝남)
  const c = await world();
  const orderC = await c.questionOrder();
  c.toss.authorize(`pk_${orderC.orderNumber}`, orderC.orderNumber, orderC.amount);
  const inFlight = await adminCreditQuestionOrder({ repo: c.mem.repo, verify: c.verify }, orderC);
  assert.equal(inFlight.kind, "not-verified");
  assert.equal((await getCashView(c.mem.repo, USER)).balance, 0);
});

test("수동 반영: 결제사는 승인했는데 우리 주문이 대기로 남아 있으면 대조가 결제 완료로 맞추고 질문은 그 처리 안에서 자동으로 들어간다 (더 넣지 않는다)", async () => {
  const w = await world();
  const order = await w.questionOrder();
  w.toss.approveBehindOurBack(`pk_${order.orderNumber}`, order.orderNumber, order.amount);
  assert.equal(order.status, "pending");
  const r = await adminCreditQuestionOrder({ repo: w.mem.repo, verify: w.verify }, order);
  assert.deepEqual(r, { kind: "already", autoCredited: true });
  assert.equal(w.mem.orders.get(order.id)?.status, "paid");
  assert.equal((await getCashView(w.mem.repo, USER)).balance, QUESTION_PACK_UNITS);
  assert.equal(w.mem.ledger.filter((l) => l.orderId === order.id).length, 1);
});

test("수동 반영: 질문 결제가 아닌 주문(리포트 주문)은 결제사에 묻지도 않고 거절한다", async () => {
  const w = await world();
  const started = await startCheckout({ repo: w.mem.repo, now: w.now }, { userId: USER, assessmentId: w.assessment.id });
  if (started.kind !== "order") throw new Error(started.kind);
  let asked = 0;
  const r = await adminCreditQuestionOrder({ repo: w.mem.repo, verify: async (o) => { asked++; return { kind: "ok", order: o }; } }, started.order);
  assert.equal(r.kind, "not-question-order");
  assert.equal(asked, 0);
  assert.equal(await questionLedgerState(w.mem.repo, started.order), null);
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0);
});

test("수동 반영: DB에 15번 변경이 없으면(함수 없음) 이유를 알려 주고 아무것도 넣지 않는다 — 다른 오류는 숨기지 않는다", async () => {
  const w = await world();
  const order = w.paidWithoutLedger(await w.questionOrder());
  const noFn = { ...w.mem.repo, adminCreditQuestion: async () => { throw Object.assign(new Error("function does not exist"), { code: "42P01" }); } };
  assert.deepEqual(await adminCreditQuestionOrder({ repo: noFn, verify: w.verify }, order), { kind: "unavailable" });
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0);
  const broken = { ...w.mem.repo, adminCreditQuestion: async () => { throw new Error("연결 끊김"); } };
  await assert.rejects(adminCreditQuestionOrder({ repo: broken, verify: w.verify }, order), /연결 끊김/);
});

test("수동 반영으로 넣은 질문도 결제가 취소되면 회수된다 (환불된 결제에 질문이 남지 않는다)", async () => {
  const w = await world();
  const order = w.paidWithoutLedger(await w.questionOrder());
  assert.equal((await adminCreditQuestionOrder({ repo: w.mem.repo, verify: w.verify }, order)).kind, "credited");
  assert.equal((await getCashView(w.mem.repo, USER)).balance, QUESTION_PACK_UNITS);
  await w.mem.repo.updateOrder(order.id, ["paid"], { status: "refunded" });
  assert.equal((await getCashView(w.mem.repo, USER)).balance, 0);
});

test("주문 조회: 질문 결제 주문에는 질문 장부 상태가 보이고 리포트 다시 만들기 안내는 붙지 않으며, 질문 · 대화 내용은 없다", async () => {
  const w = await world();
  const order = w.paidWithoutLedger(await w.questionOrder());
  const before = await adminLookup(w.mem.repo, order.orderNumber, w.now());
  assert.equal(before.kind, "order");
  if (before.kind !== "order") return;
  assert.equal(before.order.question?.credited, false);
  assert.equal(before.order.needsReportAction, false, "질문 주문은 리포트 처리 대상이 아니다");
  await adminCreditQuestionOrder({ repo: w.mem.repo, verify: w.verify }, order);
  const after = await adminLookup(w.mem.repo, order.orderNumber, w.now());
  if (after.kind !== "order") throw new Error(after.kind);
  assert.equal(after.order.question?.credited, true);
  assert.equal(after.order.question?.questionsLeft, QUESTION_PACK_SIZE);
  assert.ok(!JSON.stringify(after).includes("연락이 뜸한"));
});

test("최근 주문: 닉네임 · 회원번호 앞 8자 · 상품 · 상태 · 리포트 상태만 보이고 생년월일 · 응답은 없다", async () => {
  const w = await world();
  const order = w.paidWithoutLedger(await w.questionOrder());
  await adminCreditQuestionOrder({ repo: w.mem.repo, verify: w.verify }, order);
  const report = await startCheckout({ repo: w.mem.repo, now: w.now }, { userId: USER, assessmentId: w.assessment.id });
  if (report.kind !== "order") throw new Error(report.kind);
  const rows = await recentOrdersForAdmin(w.mem.repo, w.now(), 30);
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.nickname, "슬기");
    assert.equal(r.memberShort, USER.slice(0, 8));
  }
  const q = rows.find((r) => r.isQuestion);
  const rep = rows.find((r) => !r.isQuestion);
  assert.equal(q?.report, null);
  assert.equal(rep?.productName, PERSONAL_REPORT.name);
  assert.equal(rep?.report, "-", "결제 전 주문은 리포트가 없다");
  const text = JSON.stringify(rows);
  assert.ok(!text.includes("1995") && !text.includes(USER), "생년월일 · 전체 회원번호는 목록에 없다");
});

test("리포트 읽기 전용 보기: 결제 완료 + 완성된 리포트만 열고, 질문 결제 · 결제 전 · 리포트 없음은 이유를 알려 준다 (채팅 · 고민은 가져오지 않는다)", async () => {
  const w = await world();
  const qOrder = w.paidWithoutLedger(await w.questionOrder());
  assert.equal((await adminReportView(w.mem.repo, qOrder.orderNumber, w.now())).kind, "no-report");
  assert.equal((await adminReportView(w.mem.repo, "bad", w.now())).kind, "invalid");
  assert.equal((await adminReportView(w.mem.repo, "MEU-20261015-ABCDEFGHJK", w.now())).kind, "not-found");

  const started = await startCheckout({ repo: w.mem.repo, now: w.now }, { userId: USER, assessmentId: w.assessment.id });
  if (started.kind !== "order") throw new Error(started.kind);
  const pendingView = await adminReportView(w.mem.repo, started.order.orderNumber, w.now());
  assert.ok(pendingView.kind === "no-report" && /결제 완료 주문만/.test(pendingView.reason));

  const paid = await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_report_1", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error(paid.kind);
  const noReport = await adminReportView(w.mem.repo, paid.order.orderNumber, w.now());
  assert.ok(noReport.kind === "no-report" && /리포트 기록이 없습니다/.test(noReport.reason));

  const inserted = await w.mem.repo.insertReport({ userId: USER, orderId: paid.order.id, assessmentId: w.assessment.id, status: "queued", attempts: 0 });
  if (!inserted.ok) throw new Error("insert");
  await w.mem.repo.updateReport(inserted.value.id, ["queued"], { status: "ready", content: sampleReadingReport, generator: "ai:test", generatorVersion: "1", readyAt: w.now().toISOString() });
  const view = await adminReportView(w.mem.repo, paid.order.orderNumber, w.now());
  assert.equal(view.kind, "ready");
  if (view.kind !== "ready") return;
  assert.equal(view.nickname, "슬기");
  assert.equal(view.generator, "ai:test 1");
  assert.ok(view.text?.includes(sampleReadingReport.headline), "읽기 구조 리포트는 글로 옮긴 본문이 있다");
  assert.ok(!view.text?.includes("evidence") && !/\bE\d{2}\b/.test(view.text ?? ""), "내부 근거 번호는 없다");
});

test("관리자 개요는 질문 결제 주문 때문에 리포트 처리 대상으로 세지 않는다", async () => {
  const w = await world();
  w.paidWithoutLedger(await w.questionOrder());
  const overview = await getAdminOverview(w.mem.repo, w.now());
  assert.equal(overview.counts.failedReports, 0);
  assert.equal(overview.reports.length, 0);
});
