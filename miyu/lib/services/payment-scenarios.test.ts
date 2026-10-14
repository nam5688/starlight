// 실행: npm test — 결제 예외 상황별 시나리오 (메모리 저장소 + 가짜 토스). 같은 상황을 실제 DB · 브라우저로도 따로 검증한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { PERSONAL_REPORT } from "../config/product.ts";
import { EMPTY_BASIC_INFO } from "../profile/basic-info.ts";
import { devReportGenerator } from "../report/generate-dev-report.ts";
import { manseryeokEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import type { GatewayPayment } from "../commerce/order.ts";
import { applyPayment, confirmPayment, startCheckout, syncPayment } from "./order-service.ts";
import { reconcileBatch, reconcileOrder, RECONCILE_DEFAULTS } from "./reconcile-service.ts";
import { getResultView, queueReport, runReport } from "./report-service.ts";
import { createFakeToss } from "./testing/fake-toss.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";
import type { MiyuRepository, OrderRecord } from "./ports.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const INFO = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true, gender: "female" as const, knownMbti: "INFJ" };
const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, 4])));

/** 시계를 움직일 수 있는 테스트 환경 */
async function setup() {
  let t = new Date("2026-10-12T00:00:00Z").getTime();
  const now = () => new Date(t);
  const advance = (ms: number) => void (t += ms);
  const mem = createMemoryRepository(now);
  const toss = createFakeToss(now);
  const saved = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: USER, channel: "web", info: INFO, answers, today: now() });
  if (!saved.ok) throw new Error("save");
  const started = await startCheckout({ repo: mem.repo, now }, { userId: USER, assessmentId: saved.assessment.id });
  if (started.kind !== "order") throw new Error("order");
  const queued: string[] = [];
  const deps = { repo: mem.repo, gateway: toss.gateway, now, onPaid: async (o: OrderRecord) => void (await queueReport({ repo: mem.repo }, o), queued.push(o.orderNumber)) };
  const confirm = (paymentKey = "pk_1") => confirmPayment({ repo: mem.repo, gateway: toss.gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey, amount: started.order.amount });
  const fresh = async () => (await mem.repo.getOrderByNumber(started.order.orderNumber))!;
  return { mem, toss, now, advance, order: started.order, assessmentId: saved.assessment.id, deps, queued, confirm, fresh };
}

const MIN = 60_000;

test("승인은 됐는데 응답이 오지 않음: 실패로 단정하지 않고 '확인 중', 재확인이 주문번호로 찾아 결제 완료로 맞추고 리포트를 한 번만 준비한다", async () => {
  const s = await setup();
  s.toss.state.confirmMode = "approve-then-lost";
  const first = await s.confirm();
  assert.equal(first.kind, "checking");
  assert.equal(first.kind === "checking" && first.reason, "gateway-unreachable");
  assert.equal((await s.fresh()).status, "pending", "응답을 못 받았다고 failed · canceled로 바꾸지 않는다");

  // 너무 이른 시각에는 결제 진행 중일 수 있어 건드리지 않는다
  assert.equal((await reconcileOrder(s.deps, await s.fresh())).kind, "waiting");
  s.advance(3 * MIN);
  const r = await reconcileOrder(s.deps, await s.fresh());
  assert.equal(r.kind, "paid");
  assert.equal((await s.fresh()).status, "paid");
  assert.equal((await s.fresh()).paymentKey, "pk_1");
  assert.deepEqual(s.queued, [s.order.orderNumber]);

  // 같은 대조를 반복해도 중복 반영 · 중복 리포트가 없다
  for (let i = 0; i < 3; i++) assert.equal((await reconcileOrder(s.deps, await s.fresh())).kind, "ok");
  await queueReport({ repo: s.mem.repo }, await s.fresh());
  assert.equal(s.mem.reports.size, 1);
  const refresh = await s.confirm();
  assert.equal(refresh.kind, "paid", "고객이 성공 주소를 새로고침해도 같은 결과");
});

test("승인은 됐는데 우리 DB 저장이 실패: 결제 실패로 알리지 않고 '확인 중(저장 실패)', 이후 재확인이 맞춘다", async () => {
  const s = await setup();
  const real = s.mem.repo.updateOrder;
  let failures = 1;
  s.mem.repo.updateOrder = async (...args) => {
    if (args[2].status === "paid" && failures-- > 0) throw new Error("db down");
    return real(...args);
  };
  const r = await s.confirm();
  assert.equal(r.kind, "checking");
  assert.equal(r.kind === "checking" && r.reason, "save-failed");
  assert.equal((await s.fresh()).status, "pending");
  assert.equal(s.toss.find(s.order.orderNumber)?.status, "DONE", "결제사에는 승인 기록이 있다");

  s.advance(3 * MIN);
  assert.equal((await reconcileOrder(s.deps, await s.fresh())).kind, "paid");
  assert.equal((await s.fresh()).status, "paid");
});

test("결제 기록(payment_events) 저장이 실패해도 구매 권한 반영은 막히지 않는다", async () => {
  const s = await setup();
  s.mem.repo.addPaymentEvent = async () => {
    throw new Error("events table down");
  };
  const r = await s.confirm();
  assert.equal(r.kind, "paid");
});

test("결제사에 연결할 수 없음(인터넷 끊김 · 장애): 주문은 대기로 남고, 재확인 조회도 실패하면 단정하지 않는다", async () => {
  const s = await setup();
  s.toss.state.confirmMode = "unreachable";
  assert.equal((await s.confirm()).kind, "checking");
  s.advance(3 * MIN);
  s.toss.state.lookupDown = true;
  const r = await reconcileOrder(s.deps, await s.fresh());
  assert.equal(r.kind, "error");
  assert.equal((await s.fresh()).status, "pending");
  // 1시간이 지나도 결제사 조회 장애는 '결제 없음'이 아니다 — 미완료로 정리하지 않는다
  s.advance(2 * 60 * MIN);
  assert.equal((await reconcileOrder(s.deps, await s.fresh())).kind, "error");
  assert.equal((await s.fresh()).status, "pending");
  // 장애가 풀리고 결제사에 결제가 없으면 그때 정리한다
  s.toss.state.lookupDown = false;
  const closed = await reconcileOrder(s.deps, await s.fresh());
  assert.equal(closed.kind, "closed");
  assert.equal((await s.fresh()).status, "canceled");
  assert.equal((await s.fresh()).failureCode, "ABANDONED");
});

test("결제창을 닫음: 결제사에 기록이 없으면 일정 시간 기다린 뒤에만 미완료로 정리, 인증만 끝난 결제는 결제사 상태를 따른다", async () => {
  const s = await setup();
  s.advance(10 * MIN);
  const early = await reconcileOrder(s.deps, await s.fresh());
  assert.equal(early.kind, "waiting");
  assert.equal(early.kind === "waiting" && early.reason, "NO_PAYMENT_YET");

  // 인증은 끝났고 승인 전 → 결제사에서 진행 중 → 기다린다
  s.toss.authorize("pk_open", s.order.orderNumber, s.order.amount);
  const inFlight = await reconcileOrder(s.deps, await s.fresh());
  assert.equal(inFlight.kind, "waiting");
  assert.equal(inFlight.kind === "waiting" && inFlight.reason, "IN_PROGRESS");
  assert.equal((await s.fresh()).status, "pending");
});

test("결제사에서 승인 없이 만료 · 취소된 결제: 실패 · 미완료로 정리하고 권한을 주지 않는다", async () => {
  for (const status of ["EXPIRED", "ABORTED", "CANCELED"] as const) {
    const s = await setup();
    s.toss.approveBehindOurBack("pk_x", s.order.orderNumber, s.order.amount);
    s.toss.setStatus("pk_x", status);
    s.advance(5 * MIN);
    const r = await reconcileOrder(s.deps, await s.fresh());
    assert.equal(r.kind, "closed", status);
    const o = await s.fresh();
    assert.ok(o.status === "failed" || o.status === "canceled", `${status} → ${o.status}`);
    assert.equal((await getResultView(s.mem.repo, { userId: USER, assessmentId: s.assessmentId }))?.paidOrder, null);
    assert.equal(s.queued.length, 0);
  }
});

test("연타 · 여러 탭: 같은 승인 요청이 동시에 와도 결제 완료는 한 번, 결제사 승인 기록 한 건, 리포트 한 건", async () => {
  const s = await setup();
  const results = await Promise.all(Array.from({ length: 6 }, () => s.confirm()));
  assert.ok(results.every((r) => r.kind === "paid"), JSON.stringify(results.map((r) => r.kind)));
  assert.equal(s.toss.byKey.size, 1, "결제사 승인 기록은 한 건");
  assert.equal((await s.fresh()).status, "paid");
  await Promise.all(Array.from({ length: 6 }, () => queueReport({ repo: s.mem.repo }, results[0].kind === "paid" ? results[0].order : s.order)));
  assert.equal(s.mem.reports.size, 1);
  const rep = await Promise.all(Array.from({ length: 4 }, () => runReport({ repo: s.mem.repo, generator: devReportGenerator, now: s.now }, results[0].kind === "paid" ? results[0].order : s.order)));
  assert.equal(s.mem.reports.size, 1);
  assert.equal([...s.mem.reports.values()][0].attempts, 1, "동시에 요청해도 생성은 한 번만 가져간다");
  assert.ok(rep.some((r) => r?.status === "ready"));
});

test("구매 버튼 연타 · 두 탭에서 결제 시작: 대기 주문은 하나, 이전 주문은 대체되어 승인할 수 없다", async () => {
  const s = await setup();
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => startCheckout({ repo: s.mem.repo, now: s.now }, { userId: USER, assessmentId: s.assessmentId })));
  const pending = [...s.mem.orders.values()].filter((o) => o.status === "pending");
  assert.equal(pending.length, 1, "대기 주문은 하나만");
  assert.ok([a, b, c].every((r) => r.kind === "order"));
  // 오래된 탭에서 이전 주문으로 결제를 마치려 해도 승인하지 않는다 (결제사를 부르지 않으므로 청구도 없다)
  const stale = [...s.mem.orders.values()].find((o) => o.id === s.order.id)!;
  if (stale.status !== "pending") {
    const calls = s.toss.calls.confirm;
    const r = await confirmPayment({ repo: s.mem.repo, gateway: s.toss.gateway }, { userId: USER, orderNumber: stale.orderNumber, paymentKey: "pk_stale", amount: stale.amount });
    assert.equal(r.kind, "rejected");
    assert.equal(s.toss.calls.confirm, calls);
  }
});

test("결제 알림이 중복 · 지연 · 순서가 바뀌어 와도 결제사의 현재 기록을 따른다", async () => {
  const s = await setup();
  s.toss.approveBehindOurBack("pk_w", s.order.orderNumber, s.order.amount);
  // 같은 알림 3번: 첫 번째만 반영, 나머지는 변화 없음
  const sync = () => syncPayment({ repo: s.mem.repo, gateway: s.toss.gateway }, { paymentKey: "pk_w" });
  assert.equal((await sync()).kind, "updated");
  assert.equal((await sync()).kind, "unchanged");
  assert.equal((await sync()).kind, "unchanged");
  assert.equal((await s.fresh()).status, "paid");
  // 결제사에서 취소된 뒤, 예전 '승인' 알림이 늦게 도착: 알림 내용이 아니라 지금 기록(취소)을 따른다
  s.toss.cancel("pk_w");
  assert.equal((await sync()).kind, "updated");
  assert.equal((await s.fresh()).status, "refunded");
  // 취소 알림이 중복으로 와도 그대로
  assert.equal((await sync()).kind, "unchanged");
  assert.equal((await s.fresh()).status, "refunded");
  // 모르는 결제의 알림은 무시
  assert.equal((await syncPayment({ repo: s.mem.repo, gateway: s.toss.gateway }, { paymentKey: "unknown" })).kind, "ignored");
});

test("환불 · 취소: 결제사에서 취소됐는데 알림을 놓쳐도 재확인이 주문을 환불됨으로 맞추고 열람 권한이 사라진다", async () => {
  const s = await setup();
  assert.equal((await s.confirm()).kind, "paid");
  await runReport({ repo: s.mem.repo, generator: devReportGenerator, now: s.now }, await s.fresh());
  const view = await getResultView(s.mem.repo, { userId: USER, assessmentId: s.assessmentId });
  assert.equal(view?.report?.status, "ready");

  s.toss.cancel("pk_1"); // 결제사 관리자에서 취소 — 웹훅은 오지 않음
  const r = await reconcileOrder(s.deps, await s.fresh());
  assert.equal(r.kind, "refunded");
  assert.equal((await s.fresh()).status, "refunded");
  const after = await getResultView(s.mem.repo, { userId: USER, assessmentId: s.assessmentId });
  assert.equal(after?.paidOrder, null, "환불된 주문으로는 리포트를 열 수 없다");
  assert.equal(after?.refunded, true);
  assert.equal(after?.report, null, "저장된 리포트 행이 남아 있어도 화면에는 내려가지 않는다");
});

test("이상 징후(금액 · 주문 불일치, 부분 취소, 결제사에 기록 없음)는 임의로 고치지 않고 사람이 확인하도록 표시한다", async () => {
  const s = await setup();
  assert.equal((await s.confirm()).kind, "paid");
  const paid = await s.fresh();

  s.toss.setStatus("pk_1", "PARTIAL_CANCELED");
  const partial = await reconcileOrder(s.deps, paid);
  assert.equal(partial.kind, "anomaly");
  assert.equal((await s.fresh()).status, "paid", "부분 취소는 주문 상태를 바꾸지 않고 운영자가 확인한다");

  const s2 = await setup();
  assert.equal((await s2.confirm()).kind, "paid");
  s2.toss.byKey.set("pk_1", { ...s2.toss.byKey.get("pk_1")!, totalAmount: 100 });
  const mismatch = await reconcileOrder(s2.deps, await s2.fresh());
  assert.ok(mismatch.kind === "anomaly" && mismatch.code === "PAYMENT_MISMATCH");

  const s3 = await setup();
  assert.equal((await s3.confirm()).kind, "paid");
  s3.toss.byKey.clear();
  const gone = await reconcileOrder(s3.deps, await s3.fresh());
  assert.ok(gone.kind === "anomaly" && gone.code === "PAID_BUT_NOT_AT_GATEWAY");
  assert.equal((await s3.fresh()).status, "paid", "결제사 기록이 안 보인다고 구매 권한을 회수하지 않는다");
});

test("일괄 재확인: 한 건에서 오류가 나도 나머지를 계속하고, 결과를 종류별로 센다", async () => {
  const s = await setup();
  s.toss.approveBehindOurBack("pk_b", s.order.orderNumber, s.order.amount);
  // 두 번째 주문(다른 검사)을 만들어 조회 중 예외가 나게 한다
  const saved2 = await submitAssessment({ repo: s.mem.repo, saju: manseryeokEngine }, { userId: USER, channel: "web", info: { ...INFO, nickname: "두번째" }, answers, today: s.now() });
  if (!saved2.ok) throw new Error();
  const o2 = await startCheckout({ repo: s.mem.repo, now: s.now }, { userId: USER, assessmentId: saved2.assessment.id });
  if (o2.kind !== "order") throw new Error();
  const realLookup = s.toss.gateway.getPaymentByOrderId;
  s.toss.gateway.getPaymentByOrderId = async (n) => {
    if (n === o2.order.orderNumber) throw new Error("boom");
    return realLookup(n);
  };
  s.advance(RECONCILE_DEFAULTS.pendingMinAgeMs + MIN);
  const summary = await reconcileBatch(s.deps);
  assert.equal(summary.checked, 2);
  assert.equal(summary.counts.paid, 1);
  assert.equal(summary.counts.error, 1);
  assert.equal((await s.mem.repo.getOrderByNumber(o2.order.orderNumber))?.status, "pending");
  assert.equal(s.queued.length, 1);
  assert.equal(PERSONAL_REPORT.priceKrw, s.order.amount);
});

test("재확인 대상 조회: 대기 주문(일정 시간 지난 것)과 최근 결제 완료 주문만, 오래전 완료 주문은 제외", async () => {
  const s = await setup();
  s.advance(RECONCILE_DEFAULTS.pendingMinAgeMs + MIN);
  const repo: MiyuRepository = s.mem.repo;
  const now = s.now().getTime();
  const list = await repo.listOrdersForReconcile({ pendingCreatedBefore: new Date(now - RECONCILE_DEFAULTS.pendingMinAgeMs).toISOString(), paidSince: new Date(now - RECONCILE_DEFAULTS.paidLookbackMs).toISOString(), limit: 10 });
  assert.deepEqual(list.map((o) => o.orderNumber), [s.order.orderNumber]);
  assert.equal((await repo.listOrdersForReconcile({ pendingCreatedBefore: new Date(now - 10 * 3600_000).toISOString(), paidSince: new Date(now).toISOString(), limit: 10 })).length, 0);
});

test("진짜 중복 결제(같은 검사에 이미 결제된 주문이 있는데 다른 주문도 결제사에서 승인됨): 반영하지 않고 운영자 확인(환불) 대상으로 표시한다", async () => {
  const s = await setup();
  assert.equal((await s.confirm()).kind, "paid");
  // 다른 경로로 만들어진 두 번째 대기 주문이 결제사에서 승인된 상황
  const second = await s.mem.repo.insertOrder({
    orderNumber: "MEU-20261012-DUPLICATE1",
    userId: USER,
    assessmentId: s.assessmentId,
    productId: PERSONAL_REPORT.id,
    amount: PERSONAL_REPORT.priceKrw,
    paymentEnv: "test",
  });
  if (!second.ok) throw new Error("insert");
  s.toss.approveBehindOurBack("pk_dup", "MEU-20261012-DUPLICATE1", PERSONAL_REPORT.priceKrw);
  s.advance(5 * MIN);
  const r = await reconcileOrder(s.deps, second.value);
  assert.ok(r.kind === "anomaly" && r.code === "DUPLICATE_PAYMENT", JSON.stringify(r));
  assert.equal((await s.mem.repo.getOrderByNumber("MEU-20261012-DUPLICATE1"))?.status, "pending", "중복 주문에는 구매 권한을 주지 않는다");
  assert.equal((await s.fresh()).status, "paid", "원래 결제 주문은 그대로");
  assert.equal(s.mem.reports.size <= 1, true);
});

test("같은 주문에 다른 결제키의 두 번째 승인이 들어옴(동시 요청 · 알림): 같은 결제로 보지 않고 중복 승인으로 표시한다", async () => {
  const s = await setup();
  assert.equal((await s.confirm("pk_1")).kind, "paid");
  const second = s.toss.approveBehindOurBack("pk_2", s.order.orderNumber, s.order.amount);
  const sameKey = await applyPayment(s.mem.repo, await s.fresh(), (await s.toss.gateway.getPayment("pk_1") as { ok: true; payment: GatewayPayment }).payment, "webhook");
  assert.equal(sameKey.kind, "paid", "같은 결제키의 알림은 중복이어도 문제 없음");
  const dup = await applyPayment(s.mem.repo, await s.fresh(), second, "webhook");
  assert.ok(dup.kind === "unchanged" && dup.code === "DUPLICATE_PAYMENT", JSON.stringify(dup));
  assert.equal((await s.fresh()).paymentKey, "pk_1", "원래 결제키를 바꾸지 않는다");
  assert.ok((await s.mem.repo.listPaymentEvents((await s.fresh()).id)).some((e) => e.status === "DUPLICATE_PAYMENT"));
});

test("승인 완료 · 환불 알림의 기준: 서버가 주문을 실제로 바꾼 한 번만 '전이'로 알려 주고, 다시 열기 · 중복 알림 · 재확인은 전이가 아니다", async () => {
  const s = await setup();
  // 결제창에서 돌아왔다는 것만으로는 전이가 아니다: 결제사가 승인하지 않았으면 paid가 아니다
  s.toss.state.confirmMode = "reject";
  const rejected = await s.confirm();
  assert.equal(rejected.kind, "rejected");

  const s2 = await setup();
  const first = await s2.confirm();
  assert.equal(first.kind === "paid" && first.transitioned, true, "처음 승인된 요청만 전이");
  const again = await s2.confirm(); // 결과 주소를 새로고침 · 다시 열기
  assert.equal(again.kind, "paid");
  assert.equal(again.kind === "paid" && again.transitioned, undefined, "이미 결제 완료인 주문을 다시 열면 전이가 아니다");

  // 결제사 알림(웹훅)이 같은 결제를 다시 알려도 전이가 아니다
  const sync = await syncPayment({ repo: s2.mem.repo, gateway: s2.toss.gateway }, { paymentKey: "pk_1" });
  assert.equal(sync.kind, "unchanged");
  // 재확인도 이미 맞으면 전이가 아니다
  const ok = await reconcileOrder(s2.deps, await s2.fresh());
  assert.equal(ok.kind, "ok");

  // 환불은 결제사 취소를 확인해 주문이 바뀐 한 번만 전이
  s2.toss.cancel("pk_1");
  const refunded = await syncPayment({ repo: s2.mem.repo, gateway: s2.toss.gateway }, { paymentKey: "pk_1" });
  assert.equal(refunded.kind === "updated" && refunded.to, "refunded");
  const refundedAgain = await syncPayment({ repo: s2.mem.repo, gateway: s2.toss.gateway }, { paymentKey: "pk_1" });
  assert.equal(refundedAgain.kind, "unchanged");

  // 응답 유실 뒤 재확인이 결제 완료로 맞춘 경우도 한 번만 전이
  const s3 = await setup();
  s3.toss.state.confirmMode = "approve-then-lost";
  assert.equal((await s3.confirm()).kind, "checking");
  s3.advance(5 * MIN);
  const rec = await reconcileOrder(s3.deps, await s3.fresh());
  assert.equal(rec.kind === "paid" && rec.transitioned, true);
  const rec2 = await reconcileOrder(s3.deps, await s3.fresh());
  assert.equal(rec2.kind, "ok");
});
