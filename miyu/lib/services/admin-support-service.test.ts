// 실행: npm test — 운영자 문의 대응: 결제사 확인 뒤에만 질문을 수동 반영하고(주문당 한 번, 결제 완료가 아니면 안 함), 최근 주문 · 리포트 읽기 전용 보기는 필요한 것만 보여 준다
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { QUESTION_PACK_SIZE, QUESTION_PACK_UNITS } from "../config/product.ts";
import { createQuestionNonce } from "../commerce/cash.ts";
import { EMPTY_BASIC_INFO } from "../profile/basic-info.ts";
import { manseryeokEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { adminCreditQuestionOrder, adminReportView, questionLedgerState, recentOrdersForAdmin, reportStateLabel } from "./admin-support-service.ts";
import { adminReconcileOnce, describeReconcile } from "./admin-reconcile-note.ts";
import { readSource } from "../report/test-source.ts";
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

// ─────────────────────────────────────────────
// 2026-10-22 운영자 확인: 같은 주문이 목록에서는 "완성", 상세에서는 "생성 중 · 시도 1/5"로 나왔다 / 대조 버튼을 눌러도 새 안내 · 기록이 보이지 않았다
// ─────────────────────────────────────────────

async function paidReportOrder(w: Awaited<ReturnType<typeof world>>, status: "queued" | "generating" | "ready" | "failed", updatedAgoMs = 0) {
  const started = await startCheckout({ repo: w.mem.repo, now: w.now }, { userId: USER, assessmentId: w.assessment.id });
  if (started.kind !== "order") throw new Error(started.kind);
  const paid = await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: `pk_${status}_${updatedAgoMs}`, amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error(paid.kind);
  const inserted = await w.mem.repo.insertReport({ userId: USER, orderId: paid.order.id, assessmentId: w.assessment.id, status: "queued", attempts: 1 });
  if (!inserted.ok) throw new Error("insert");
  const id = inserted.value.id;
  if (status === "ready") await w.mem.repo.updateReport(id, ["queued"], { status: "ready", content: sampleReadingReport, generator: "ai:test", generatorVersion: "1", readyAt: w.now().toISOString() });
  else if (status === "generating") await w.mem.repo.updateReport(id, ["queued"], { status: "generating" });
  else if (status === "failed") await w.mem.repo.updateReport(id, ["queued"], { status: "failed", lastError: "형식 검사 실패" });
  void updatedAgoMs;
  return paid.order;
}

test("리포트 상태 말: 주문 상세와 최근 주문 목록이 같은 리포트에 같은 말을 쓴다 — 완성된 리포트가 상세에서 '생성 중'으로 나오지 않는다", async () => {
  for (const [status, want] of [["ready", "완성"], ["queued", "대기 중"], ["generating", "만드는 중"], ["failed", "만들지 못함"]] as const) {
    const w = await world();
    const order = await paidReportOrder(w, status);
    const detail = await adminLookup(w.mem.repo, order.orderNumber, w.now());
    if (detail.kind !== "order") throw new Error(detail.kind);
    const list = (await recentOrdersForAdmin(w.mem.repo, w.now(), 30)).find((r) => r.orderNumber === order.orderNumber);
    assert.equal(detail.order.report?.stateLabel, want, `${status}: 상세`);
    assert.equal(list?.report, want, `${status}: 목록`);
    assert.equal(detail.order.report?.stateLabel, list?.report, `${status}: 상세와 목록이 같은 말`);
    assert.equal(detail.order.report?.attempts, 1);
  }
});

test("리포트 상태 말: 만드는 중인 리포트가 고객 지연 기준(30분)을 넘으면 상세와 목록 모두 지연이라고 말하고, 완성 · 실패에는 지연을 붙이지 않는다", async () => {
  const w = await world();
  const order = await paidReportOrder(w, "generating");
  const later = new Date(w.now().getTime() + 31 * 60_000);
  const detail = await adminLookup(w.mem.repo, order.orderNumber, later);
  if (detail.kind !== "order") throw new Error(detail.kind);
  const list = (await recentOrdersForAdmin(w.mem.repo, later, 30)).find((r) => r.orderNumber === order.orderNumber);
  assert.match(detail.order.report?.stateLabel ?? "", /지연/);
  assert.equal(detail.order.report?.stateLabel, list?.report);
  assert.equal(reportStateLabel({ status: "ready", pastSla: true }), "완성");
  assert.equal(reportStateLabel({ status: "failed", pastSla: true }), "만들지 못함");
});

test("리포트 상태 말: 관리자 화면은 리포트 상태 말을 따로 만들지 않고 서비스가 준 stateLabel을 그대로 보인다 (완성 분기 없는 화면 함수의 재발 방지)", () => {
  const page = readSource(new URL("../../app/admin/page.tsx", import.meta.url));
  assert.ok(!/function reportLabel/.test(page), "화면에 따로 만든 리포트 상태 함수가 없다");
  assert.ok(!/"생성 중"/.test(page.replace(/<Row label="대기 · 생성 중">/, "")), "상태 문구를 화면이 직접 정하지 않는다");
  assert.ok(/report\.stateLabel/.test(page) && /r\.stateLabel/.test(page), "상세와 실패 · 지연 표가 모두 stateLabel을 쓴다");
});

const MERCHANT_404 = { ok: false as const, code: "NOT_FOUND_MERCHANT", message: "존재하지 않는 상점 정보 입니다.", retryable: false };

test("대조 버튼: 결제 완료 주문에서 결제사 조회가 실패해도(NOT_FOUND_MERCHANT) 코드 · 주문 그대로 · 성공 실패와 무관함을 안내하고 운영 기록 문장을 돌려준다 — 주문 상태는 바뀌지 않는다", async () => {
  const w = await world();
  const order = await paidReportOrder(w, "ready");
  assert.equal(order.status, "paid");
  const failing = { ...w.toss.gateway, getPayment: async () => MERCHANT_404, getPaymentByOrderId: async () => MERCHANT_404 };
  const result = await adminReconcileOnce(
    { reconcile: (o) => reconcileOrder({ repo: w.mem.repo, gateway: failing, now: w.now }, o, { pendingMinAgeMs: 0 }), now: w.now },
    order,
  );
  assert.equal(result.kind, "error");
  assert.equal(result.code, "NOT_FOUND_MERCHANT");
  assert.equal(result.changed, false);
  assert.equal(result.severity, "warn");
  assert.match(result.note, /NOT_FOUND_MERCHANT/);
  assert.match(result.note, /결제 완료/, "주문이 지금 어떤 상태인지 말한다");
  assert.match(result.note, /바꾸지 않았습니다/);
  assert.match(result.note, /성공했는지 실패했는지와는 별개/, "조회 실패를 결제 실패로 읽게 두지 않는다");
  assert.doesNotMatch(result.note, /\berror\b/, "결과 이름을 영어 그대로 던지지 않는다");
  assert.match(result.record, /NOT_FOUND_MERCHANT/);
  assert.equal((await w.mem.repo.getOrderByNumber(order.orderNumber))?.status, "paid", "결제 완료 그대로");
});

test("대조 버튼: 결제사 기록과 일치하면 '바꾼 것이 없음'을, 결제사 승인인데 우리 주문이 대기면 '결제 완료로 맞춤'을 안내한다", async () => {
  const w = await world();
  const order = await paidReportOrder(w, "ready");
  const ok = await adminReconcileOnce({ reconcile: (o) => w.verify(o), now: w.now }, order);
  assert.equal(ok.kind, "ok");
  assert.equal(ok.changed, false);
  assert.match(ok.note, /일치|같습니다/);
  assert.match(ok.note, /바꾼 것이 없습니다/);
  assert.equal(ok.severity, "info");

  const w2 = await world();
  const pending = await w2.questionOrder();
  w2.toss.approveBehindOurBack(`pk_${pending.orderNumber}`, pending.orderNumber, pending.amount);
  const fixed = await adminReconcileOnce({ reconcile: (o) => w2.verify(o), now: w2.now }, pending);
  assert.equal(fixed.kind, "paid");
  assert.equal(fixed.changed, true);
  assert.match(fixed.note, /결제 완료'로 맞췄습니다/);
  assert.equal((await w2.mem.repo.getOrderByNumber(pending.orderNumber))?.status, "paid");
});

test("대조 버튼: 결제사가 아직 진행 중이면 주문을 그대로 두고 이유를 알린다 (인증 대기는 실패가 아니다)", async () => {
  const w = await world();
  const pending = await w.questionOrder();
  w.toss.authorize(`pk_${pending.orderNumber}`, pending.orderNumber, pending.amount);
  const r = await adminReconcileOnce({ reconcile: (o) => w.verify(o), now: w.now }, pending);
  assert.equal(r.kind, "waiting");
  assert.equal(r.changed, false);
  assert.match(r.note, /진행 중/);
  assert.match(r.note, /그대로 두었습니다/);
  assert.doesNotMatch(r.note, /실패|취소됐|결제되지 않/, "진행 중을 실패로 말하지 않는다");
  assert.equal((await w.mem.repo.getOrderByNumber(pending.orderNumber))?.status, "pending");
});

test("대조 버튼: 대조 중 예외가 나도 안내가 나온다 — 오류 번호만 담고 예외 내용(행 내용 가능)은 담지 않는다", async () => {
  const w = await world();
  const order = await paidReportOrder(w, "ready");
  const r = await adminReconcileOnce(
    {
      reconcile: async () => {
        throw new Error("duplicate key value violates unique constraint (user_id)=(11111111-1111-4111-8111-111111111111)");
      },
      now: w.now,
      errorId: () => "ERR-TEST0001",
    },
    order,
  );
  assert.equal(r.kind, "exception");
  assert.equal(r.severity, "error");
  assert.equal(r.errorId, "ERR-TEST0001");
  assert.match(r.note, /ERR-TEST0001/);
  assert.match(r.note, /확인되지 않았/, "주문이 바뀌었는지 모르면 모른다고 말한다");
  assert.ok(!r.note.includes("11111111") && !r.record.includes("11111111") && !/duplicate key/.test(r.note + r.record), "예외 내용 · 회원번호는 안내와 기록에 없다");
});

test("대조 버튼: 모든 결과 종류가 영어 결과 이름 없이 주문 상태를 말하는 안내를 만든다", () => {
  const base = { id: "o1", orderNumber: "MEU-20261015-ABCDEFGHJK", status: "paid", failureCode: null, createdAt: "2026-10-15T03:00:00Z" } as unknown as OrderRecord;
  const now = new Date("2026-10-15T05:00:00Z");
  const outcomes: ReconcileOutcome[] = [
    { kind: "paid", order: base, transitioned: true },
    { kind: "paid", order: base, transitioned: false },
    { kind: "refunded", order: base },
    { kind: "closed", order: base, reason: "ABANDONED" },
    { kind: "waiting", order: base, reason: "IN_PROGRESS" },
    { kind: "waiting", order: base, reason: "TOO_EARLY" },
    { kind: "ok", order: base },
    { kind: "anomaly", order: base, code: "PAYMENT_MISMATCH", message: "결제사 기록의 주문번호 또는 금액이 주문과 다릅니다." },
    { kind: "error", order: base, code: "NETWORK_ERROR" },
    { kind: "error", order: base, code: "HTTP_502" },
  ];
  for (const o of outcomes) {
    const r = describeReconcile(o, now);
    assert.ok(r.note.length > 20 && r.note.length < 420, `${o.kind}: 안내 길이 ${r.note.length}`);
    assert.ok(r.record.length > 10 && r.record.length < 200, `${o.kind}: 기록 길이`);
    assert.doesNotMatch(r.note, /결과: (paid|ok|error|waiting|anomaly|closed)\b/);
  }
  const anomaly = describeReconcile(outcomes[7]!, now);
  assert.equal(anomaly.severity, "warn");
  assert.match(anomaly.note, /자동으로 고치지 않았습니다/);
});

test("대조 버튼: 서버 동작이 결과 안내를 운영 기록(admin.reconcile)과 화면 결과 자리(#admin-result)에 항상 남긴다 (조용히 끝나지 않는다)", () => {
  const actions = readSource(new URL("../../app/admin/actions.ts", import.meta.url));
  const body = actions.slice(actions.indexOf("export async function adminReconcileOrderAction"), actions.indexOf("export async function adminRetryReportAction"));
  assert.ok(/adminReconcileOnce\(/.test(body), "결과 변환을 거친다");
  assert.ok(/recordOps\(\{ kind: "admin\.reconcile", severity: result\.severity/.test(body), "결과 종류와 코드가 운영 기록에 남는다");
  assert.ok(/back\(order\.orderNumber, result\.note\)/.test(body), "같은 안내가 화면에 나온다");
  assert.ok(!/결제사 대조 결과: \$\{/.test(actions), "영어 결과 이름 한 줄 안내는 없다");
  assert.ok(/#admin-result/.test(actions));
  const page = readSource(new URL("../../app/admin/page.tsx", import.meta.url));
  assert.ok(/id="admin-result"/.test(page), "안내가 붙는 자리가 있다");
  assert.ok(/note && <ResultNote note=\{note\} \/>/.test(page), "주문 상세 안에 결과가 버튼 아래에 나온다");
});

test("대조 버튼: 결제 완료 주문(결제 키 있음)이 결제사 기록과 맞으면 무엇과 맞았는지(결제사 상태 · 금액 · 취소 0 · 조회 경로)를 말하고, 결제사 기록이 DONE이 아니면 일치로 말하지 않는다", async () => {
  const w = await world();
  const order = await paidReportOrder(w, "ready");
  assert.ok(order.paymentKey, "승인 때 저장한 결제 키가 있다");
  const ok = await adminReconcileOnce({ reconcile: (o) => w.verify(o), now: w.now }, order);
  assert.equal(ok.kind, "ok");
  assert.match(ok.note, /DONE/);
  assert.match(ok.note, new RegExp(order.amount.toLocaleString("ko-KR")));
  assert.match(ok.note, /취소 0원/);
  assert.match(ok.note, /결제 키로 조회/, "결제 키가 있는 주문은 결제 키로 조회한다");
  assert.match(ok.record, /DONE/);
  assert.equal(ok.changed, false);

  // 결제사에서 전액 취소된 뒤의 대조 — 같은 버튼이 '환불 완료'로 맞추고 열람 권한을 회수했다고 안내한다 (실제 검수: 2026-10-22 운영자 확인, 취소는 결제사 쪽에서 했고 미유는 취소를 실행하지 않는다)
  assert.equal(w.toss.cancel(order.paymentKey!), true);
  const refunded = await adminReconcileOnce({ reconcile: (o) => w.verify(o), now: w.now }, order);
  assert.equal(refunded.kind, "refunded");
  assert.equal(refunded.changed, true);
  assert.match(refunded.note, /환불 완료/);
  assert.match(refunded.note, /열람 권한을 회수/);
  const after = await w.mem.repo.getOrderByNumber(order.orderNumber);
  assert.equal(after?.status, "refunded");

  // 이미 정리된 주문을 다시 누르면 결제사에 묻지 않고 '이미 정리됨'이라고 말한다 — 승인 완료라고 말하지 않는다
  const again = await adminReconcileOnce({ reconcile: (o) => w.verify(o), now: w.now }, after!);
  assert.equal(again.kind, "ok");
  assert.match(again.note, /이미 '환불 완료'로 정리/);
  assert.doesNotMatch(again.note, /승인 완료/);
});

test("대조 버튼: 서버 동작 버튼은 처리 중 표시를 보이고(눌렀는지 알 수 있게) 두 번 눌리지 않는다 — 처리는 끝났는데 화면이 그대로여서 응답 없음으로 보이던 문제", () => {
  const page = readSource(new URL("../../app/admin/page.tsx", import.meta.url));
  const btn = readSource(new URL("../../components/admin/admin-submit-button.tsx", import.meta.url));
  assert.ok(/useFormStatus\(\)/.test(btn) && /disabled=\{pending\}/.test(btn) && /aria-busy=\{pending\}/.test(btn), "누르면 잠긴다");
  assert.ok(/role="status"/.test(btn) && /pendingNote/.test(btn), "처리 중 안내가 그 자리에 보인다");
  for (const label of ["결제사와 대조해 맞추기", "리포트 다시 만들기", "결제사 확인 후 질문 넣기", "결제 · 리포트 전체 점검 지금 실행"]) {
    const at = page.indexOf(`label="${label}"`);
    assert.ok(at > 0 && page.lastIndexOf("<AdminSubmitButton", at) > page.lastIndexOf("<button", at), `${label}: 처리 중 표시가 있는 버튼을 쓴다`);
  }
  assert.ok(!/결제사에 확인하는 중…[^]*결제가 되지 않/.test(page), "처리 중 안내가 결제 여부를 단정하지 않는다");
});
