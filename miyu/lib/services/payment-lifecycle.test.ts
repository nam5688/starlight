// 결제 수명주기 점검(출시 필수 QA 순서) — 가짜 결제사 · 메모리 저장소(실제 토스 · 실결제 · 실제 DB 아님).
// 순서: ① 성공 / 취소 / 실패 → ② 서버 검증 · 금액 · 상품 위변조 · 중복 승인 · 웹훅 멱등 → ③ 리포트 열람 · 질문권 정확히 1회 → ④ 환불 · 권한 · 잔액 → ⑤ 타인 열람 차단.
// 이미 있는 시험(services · payment-scenarios · cash-service · question-refund · pair-service · record-delete)과 겹치지 않는, 위변조 · 재생 · 순서 뒤바뀜 쪽 빈틈만 더한다.
// 각 시험이 이 줄의 번호(①~⑤)를 앞에 달고 있다. 실제 토스 테스트 모드 · 위젯 · 카드 인증은 이 파일이 확인하지 못한다(docs/payment-launch-gaps-v1.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { createQuestionNonce, questionProductId, questionQuote } from "../commerce/cash.ts";
import { createOrderNumber, type GatewayPayment } from "../commerce/order.ts";
import { EMPTY_BASIC_INFO } from "../profile/basic-info.ts";
import { devReportGenerator } from "../report/generate-dev-report.ts";
import { manseryeokEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { getCashView } from "./cash-service.ts";
import { applyPayment, confirmPayment, markCheckoutFailed, startCheckout, syncPayment } from "./order-service.ts";
import type { OrderRecord, PaymentGateway } from "./ports.ts";
import { reconcileBatch } from "./reconcile-service.ts";
import { claimReport, ensureReport, getResultView, queueReport } from "./report-service.ts";
import { createFakeToss } from "./testing/fake-toss.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const INFO = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true, gender: "female" as const };
const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, 4])));
const PACK_PRICE = questionQuote().priceKrw;

async function world(opts: { gateway?: (inner: PaymentGateway) => PaymentGateway } = {}) {
  let t = new Date("2026-10-19T03:00:00Z").getTime();
  const now = () => new Date(t);
  const advance = (ms: number) => void (t += ms);
  const mem = createMemoryRepository(now);
  const toss = createFakeToss(now);
  const gateway = opts.gateway ? opts.gateway(toss.gateway) : toss.gateway;
  const save = async (userId: string, nickname: string) => {
    const saved = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId, channel: "web", info: { ...INFO, nickname }, answers, today: now() });
    if (!saved.ok) throw new Error(saved.message);
    return saved.assessment;
  };
  const mine = await save(USER, "내결과");
  const theirs = await save(OTHER, "남의결과");
  const started = await startCheckout({ repo: mem.repo, now }, { userId: USER, assessmentId: mine.id });
  if (started.kind !== "order") throw new Error(started.kind);
  const pack = await mem.repo.insertOrder({ orderNumber: createOrderNumber(now()), userId: USER, assessmentId: mine.id, productId: questionProductId(createQuestionNonce("love")), amount: PACK_PRICE, paymentEnv: "test" });
  if (!pack.ok) throw new Error("pack order");
  const confirm = (order: OrderRecord, paymentKey: string, over: Partial<{ userId: string; amount: unknown }> = {}) =>
    confirmPayment({ repo: mem.repo, gateway }, { userId: over.userId ?? USER, orderNumber: order.orderNumber, paymentKey, amount: ("amount" in over ? over.amount : order.amount) as number });
  const fresh = async (order: OrderRecord) => (await mem.repo.getOrderByNumber(order.orderNumber))!;
  const statusEvents = (order: OrderRecord, status: string) => mem.events.filter((e) => e.orderId === order.id && e.status === status).length;
  return { mem, toss, gateway, now, advance, mine, theirs, personal: started.order, pack: pack.value, confirm, fresh, statusEvents };
}

test("① 성공 · 취소 · 실패: 성공하면 결제 완료, 결제창을 닫으면 취소, 카드 거절이면 실패, 취소 · 실패한 주문은 성공 주소로 되살릴 수 없고 결제사에 승인 요청도 나가지 않는다", async () => {
  const w = await world();
  // 성공
  const ok = await w.confirm(w.personal, "pk_ok");
  assert.equal(ok.kind, "paid");
  assert.equal(w.toss.calls.confirm, 1);
  // 결제창을 닫음(실패 주소로 돌아옴) → 취소. 그 뒤 성공 주소로 오면 승인하지 않는다
  const closed = await markCheckoutFailed({ repo: w.mem.repo }, { userId: USER, orderNumber: w.pack.orderNumber, code: "PAY_PROCESS_CANCELED", message: "사용자가 결제를 취소했습니다" });
  assert.equal(closed?.status, "canceled");
  const replay = await w.confirm(w.pack, "pk_after_cancel");
  assert.deepEqual([replay.kind, replay.kind === "rejected" ? replay.code : ""], ["rejected", "ORDER_NOT_PAYABLE"]);
  assert.equal(w.toss.calls.confirm, 1, "취소된 주문으로는 결제사에 승인 요청을 보내지 않는다");
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 0, "취소된 질문 묶음은 질문을 주지 않는다");
  // 카드 거절 → 실패(주문은 failed, 질문 · 리포트 권한 없음)
  const w2 = await world();
  w2.toss.state.confirmMode = "reject";
  const rejected = await w2.confirm(w2.pack, "pk_reject");
  assert.deepEqual([rejected.kind, rejected.kind === "rejected" ? rejected.code : ""], ["rejected", "REJECT_CARD_PAYMENT"]);
  assert.equal((await w2.fresh(w2.pack)).status, "failed");
  assert.equal((await getCashView(w2.mem.repo, USER)).questions, 0);
  // 실패한 결제 시도 뒤 같은 사람이 새 결제를 시작하면 이전 실패 주문은 되살아나지 않는다(성공 주소 재사용 불가)
  const reuse = await w2.confirm(w2.pack, "pk_reuse");
  assert.equal(reuse.kind, "rejected");
});

test("② 금액 위변조: 성공 주소의 금액이 서버 주문과 정확히 같지 않으면(작게 · 크게 · 0 · 음수 · 소수 · NaN · Infinity · 문자열 · 비어 있음) 어떤 상품이든 결제사에 승인 요청을 보내지 않고, 맞는 금액이면 한 번 승인된다", async () => {
  const w = await world();
  const bad: unknown[] = [w.personal.amount - 1, w.personal.amount + 1, 0, -w.personal.amount, w.personal.amount + 0.5, NaN, Infinity, String(w.personal.amount), null, undefined, [w.personal.amount]];
  for (const order of [w.personal, w.pack]) {
    for (const amount of bad) {
      const r = await w.confirm(order, `pk_bad_${String(amount)}`, { amount });
      assert.deepEqual([r.kind, r.kind === "rejected" ? r.code : ""], ["rejected", "AMOUNT_MISMATCH"], `${order.productId.slice(0, 12)} · ${String(amount)}`);
    }
    assert.equal((await w.fresh(order)).status, "pending", "위변조 시도로 주문 상태가 바뀌지 않는다");
  }
  assert.equal(w.toss.calls.confirm, 0, "결제사에는 한 번도 승인 요청이 나가지 않았다");
  assert.equal(w.toss.byKey.size, 0);
  assert.equal(w.statusEvents(w.personal, "AMOUNT_MISMATCH"), bad.length, "시도마다 운영 기록이 남는다");
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 0);
  // 맞는 금액은 정확히 한 번
  assert.equal((await w.confirm(w.pack, "pk_good")).kind, "paid");
  assert.equal(w.toss.calls.confirm, 1);
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 3);
});

test("② 상품 · 소유자 위변조: 남의 주문번호 · 없는 주문번호로는 승인하지 않고, 결제 완료된 주문에 다른 결제키로 다시 승인을 시도해도 결제사에 요청이 나가지 않으며 처음 결제키가 그대로 남는다", async () => {
  const w = await world();
  const foreign = await w.confirm(w.personal, "pk_steal", { userId: OTHER });
  assert.equal(foreign.kind, "not-found", "다른 회원은 이 주문을 승인할 수 없다(존재 여부도 알리지 않는다)");
  assert.equal((await confirmPayment({ repo: w.mem.repo, gateway: w.gateway }, { userId: USER, orderNumber: "MEU-00000000-NOPE", paymentKey: "pk_x", amount: 1 })).kind, "not-found");
  assert.equal(w.toss.calls.confirm, 0);
  assert.equal((await w.fresh(w.personal)).status, "pending");

  assert.equal((await w.confirm(w.personal, "pk_first")).kind, "paid");
  const callsAfterPaid = w.toss.calls.confirm;
  const second = await w.confirm(w.personal, "pk_second");
  assert.deepEqual([second.kind, second.kind === "rejected" ? second.code : ""], ["rejected", "ALREADY_PAID"]);
  assert.equal(w.toss.calls.confirm, callsAfterPaid, "이미 결제된 주문의 두 번째 승인 요청은 결제사에 나가지 않는다");
  assert.equal((await w.fresh(w.personal)).paymentKey, "pk_first");
  // 같은 결제키의 재생(성공 주소를 새로고침 · 두 탭)은 같은 결제로 본다
  assert.equal((await w.confirm(w.personal, "pk_first")).kind, "paid");
  assert.equal(w.toss.calls.confirm, callsAfterPaid);
});

test("② 결제사가 주문과 다른 결제를 돌려주는 경우(다른 주문번호 · 더 작은 금액 · 승인 아닌 상태)는 결제 완료로 반영하지 않고 운영 기록을 남기며 리포트 · 질문을 주지 않는다", async () => {
  const forged = (mutate: (p: GatewayPayment) => GatewayPayment) => (inner: PaymentGateway): PaymentGateway => ({
    ...inner,
    async confirm(args) {
      const r = await inner.confirm(args);
      return r.ok ? { ok: true, payment: mutate(r.payment) } : r;
    },
  });
  const cases: [string, (p: GatewayPayment) => GatewayPayment, string][] = [
    ["다른 주문번호", (p) => ({ ...p, orderId: "MEU-20260101-OTHERORDER" }), "PAYMENT_MISMATCH"],
    ["더 작은 금액", (p) => ({ ...p, totalAmount: p.totalAmount - 1000, balanceAmount: p.balanceAmount - 1000 }), "PAYMENT_MISMATCH"],
    ["승인 아닌 상태(IN_PROGRESS)", (p) => ({ ...p, status: "IN_PROGRESS" }), "NO_CHANGE"],
  ];
  for (const [label, mutate, code] of cases) {
    const w = await world({ gateway: forged(mutate) });
    const r = await w.confirm(w.pack, "pk_forged");
    assert.equal(r.kind, "rejected", label);
    if (r.kind === "rejected") {
      assert.equal(r.code, code, label);
      assert.ok(r.message.length > 0, `${label}: 고객에게 보이는 안내 문구가 비어 있지 않다`);
    }
    assert.equal((await w.fresh(w.pack)).status, "pending", `${label}: 주문은 결제 완료가 되지 않는다`);
    assert.equal((await getCashView(w.mem.repo, USER)).questions, 0, `${label}: 질문을 주지 않는다`);
    assert.equal((await w.mem.repo.getReportByOrder(w.pack.id)), null, `${label}: 리포트를 만들지 않는다`);
  }
});

test("② · ③ 웹훅 폭주 · 재대조에도 결제 완료는 한 번, 질문권 3개는 한 번만 들어가고 장부 줄이 하나뿐이다 (동시 승인 · 중복 웹훅 · 재대조 · 성공 주소 재생)", async () => {
  const w = await world();
  const key = "pk_storm";
  // 성공 주소를 여러 탭에서 동시에 + 같은 결제의 웹훅이 여러 번
  const results = await Promise.all([
    ...Array.from({ length: 4 }, () => w.confirm(w.pack, key)),
    ...Array.from({ length: 6 }, () => syncPayment({ repo: w.mem.repo, gateway: w.gateway }, { paymentKey: key })),
  ]);
  assert.ok(results.every((r) => r.kind !== "rejected"), JSON.stringify(results.map((r) => r.kind)));
  w.advance(11 * 60_000);
  for (let i = 0; i < 2; i++) await reconcileBatch({ repo: w.mem.repo, gateway: w.gateway, now: w.now });
  assert.equal((await w.fresh(w.pack)).status, "paid");
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 3, "질문권은 정확히 3개");
  assert.equal(w.mem.ledger.filter((l) => l.orderId === w.pack.id && l.kind === "charge").length, 1, "충전(charge) 장부 줄은 하나");
  assert.equal(w.toss.byKey.size, 1, "결제사 승인 기록도 한 건");
  assert.equal(w.mem.packs.size, 1, "묶음 장부도 한 줄");
});

test("④ 환불 · 권한 · 잔액: 전액 취소는 한 번만 반영되고 남은 질문을 모두 회수하며, 늦게 도착한 옛 '승인' 정보로 환불된 주문이 되살아나거나 질문이 다시 들어가지 않는다", async () => {
  const w = await world();
  const key = "pk_refund";
  assert.equal((await w.confirm(w.pack, key)).kind, "paid");
  const donePayload = w.toss.find(w.pack.orderNumber)!; // 결제 직후의 '승인' 모습(옛 알림 내용)
  assert.equal(donePayload.status, "DONE");
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 3);

  assert.ok(w.toss.cancel(key), "결제사 관리자에서 전액 취소");
  const syncs = await Promise.all(Array.from({ length: 4 }, () => syncPayment({ repo: w.mem.repo, gateway: w.gateway }, { paymentKey: key })));
  assert.equal(syncs.filter((s) => s.kind === "updated").length, 1, "환불은 한 번만 반영");
  assert.equal((await w.fresh(w.pack)).status, "refunded");
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 0, "남은 질문은 모두 회수");
  const clawbacks = w.mem.ledger.filter((l) => l.orderId === w.pack.id && /claw/.test(l.kind)).length;

  // 옛 '승인' 내용을 늦게 다시 적용해도(순서 뒤바뀐 알림을 그대로 믿는 경우를 가정) 환불된 주문은 되살아나지 않는다
  const revive = await applyPayment(w.mem.repo, await w.fresh(w.pack), donePayload, "webhook");
  assert.notEqual(revive.kind, "paid");
  assert.equal((await w.fresh(w.pack)).status, "refunded");
  assert.equal((await getCashView(w.mem.repo, USER)).questions, 0, "질문이 다시 들어가지 않는다");
  assert.equal(w.mem.ledger.filter((l) => l.orderId === w.pack.id && l.kind === "charge").length, 1, "충전 장부는 처음 한 줄 그대로");
  assert.equal(w.mem.ledger.filter((l) => l.orderId === w.pack.id && /claw/.test(l.kind)).length, clawbacks, "회수 줄도 늘지 않는다");
  // 성공 주소 재생도 막힌다(환불된 주문은 결제할 수 없다)
  const replay = await w.confirm(w.pack, key);
  assert.equal(replay.kind, "rejected");
});

test("④ · ⑤ 개인 리포트: 결제 완료 뒤에만 열리고, 환불되면 주인도 열 수 없으며(새로 만들기 · 다시 가져가기도 안 된다), 다른 회원은 어느 단계에서도 볼 수 없다", async () => {
  const w = await world();
  const peek = (userId: string) => getResultView(w.mem.repo, { userId, assessmentId: w.mine.id });
  // 결제 전: 주인은 무료 결과만, 다른 회원은 존재도 알 수 없다
  assert.equal((await peek(USER))?.paidOrder, null);
  assert.equal(await peek(OTHER), null);
  // 결제 → 리포트 생성(개발 생성기) → 주인만 본다
  const paid = await w.confirm(w.personal, "pk_report");
  assert.equal(paid.kind, "paid");
  if (paid.kind !== "paid") return;
  const report = await ensureReport({ repo: w.mem.repo, generator: devReportGenerator, now: w.now }, paid.order);
  assert.equal(report?.status, "ready");
  assert.equal((await peek(USER))?.report?.status, "ready");
  assert.equal(await peek(OTHER), null, "결제 뒤에도 다른 회원은 볼 수 없다");
  assert.equal((await w.mem.repo.listOrdersForAssessment(w.theirs.id)).length, 0);
  // 환불 → 주인도 열 수 없다
  assert.ok(w.toss.cancel("pk_report"));
  assert.equal((await syncPayment({ repo: w.mem.repo, gateway: w.gateway }, { paymentKey: "pk_report" })).kind, "updated");
  const after = await peek(USER);
  assert.deepEqual([after?.paidOrder, after?.report, after?.refunded], [null, null, true]);
  assert.equal(await peek(OTHER), null);
  // 환불된 주문으로는 대기열에 올리지도 가져가지도 못한다
  const refundedOrder = await w.fresh(w.personal);
  assert.equal(await queueReport({ repo: w.mem.repo }, refundedOrder), null);
  assert.equal((await claimReport({ repo: w.mem.repo, generator: devReportGenerator, now: w.now }, refundedOrder, { retryFailed: true })).report, null);
});

test("⑥ 카드사 인증 대기(결제 창이 열려 있는 정상 상태): 서버는 대기 중인 주문을 실패 · 취소 · 포기로 바꾸지 않고, 결제사 기록(IN_PROGRESS)을 기다리며, 인증을 마쳐 결제사에서 승인되면 그때 한 번만 결제 완료로 맞춘다(탭을 닫았어도)", async () => {
  const w = await world();
  const order = w.personal;
  const key = "pk_auth_wait";
  // 고객이 결제 창에서 카드사 본인 인증까지 열었다(승인 전). 이 화면은 서버에 아무것도 알리지 않는다 — 20초 안내도 서버 상태를 바꾸지 않는다.
  w.toss.authorize(key, order.orderNumber, order.amount);

  // 막 시작한 직후는 확인하지 않고, 몇 분 뒤에도 결제사 기록이 IN_PROGRESS면 기다린다(실패 · 취소 · 포기로 바꾸지 않는다)
  let elapsed = 0;
  for (const minutes of [1, 5, 30, 70]) {
    w.advance((minutes - elapsed) * 60_000);
    elapsed = minutes;
    const batch = await reconcileBatch({ repo: w.mem.repo, gateway: w.gateway, now: w.now });
    assert.equal(batch.counts.paid, 0, `${minutes}분: 아직 결제 완료로 바꾸지 않는다`);
    const o = await w.fresh(order);
    assert.equal(o.status, "pending", `${minutes}분: 주문은 대기 그대로`);
    assert.equal(o.failureCode ?? null, null, `${minutes}분: 실패 코드를 남기지 않는다`);
    assert.equal(w.statusEvents(order, "ABANDONED") + w.statusEvents(order, "CANCELED"), 0, `${minutes}분: 포기 · 취소 기록이 없다`);
  }
  assert.equal(await w.mem.repo.getReportByOrder(order.id), null, "승인 전에는 리포트를 만들지 않는다");

  // 고객이 인증을 마쳤고 결제사에서 승인됐지만 우리 화면으로 돌아오지 못했다(탭 닫힘) → 재대조가 맞춘다
  w.toss.approveBehindOurBack(key, order.orderNumber, order.amount);
  const first = await reconcileBatch({ repo: w.mem.repo, gateway: w.gateway, now: w.now });
  assert.equal(first.counts.paid, 1);
  assert.equal((await w.fresh(order)).status, "paid");
  const second = await reconcileBatch({ repo: w.mem.repo, gateway: w.gateway, now: w.now });
  assert.equal(second.counts.paid, 0, "두 번째 대조는 바꿀 것이 없다");
  // 돌아온 성공 주소가 뒤늦게 와도 중복 승인되지 않는다
  assert.equal((await w.confirm(order, key)).kind, "paid");
  assert.equal(w.toss.byKey.size, 1);
});

test("⑥ 알려진 한계(서버): 인증 대기 중에 같은 결과의 구매를 다시 시작하면 이전 대기 주문은 대체(SUPERSEDED)로 닫히고 옛 주문의 성공 주소는 승인되지 않는다 — 결제사 승인 요청이 나가지 않아 금액이 청구되지 않지만 안내가 혼란스러울 수 있다(대기 주문 재사용은 운영자 결정 항목)", async () => {
  const w = await world();
  const old = w.personal;
  w.toss.authorize("pk_old_auth", old.orderNumber, old.amount);
  const again = await startCheckout({ repo: w.mem.repo, now: w.now }, { userId: USER, assessmentId: w.mine.id });
  assert.equal(again.kind, "order");
  if (again.kind !== "order") return;
  assert.notEqual(again.order.orderNumber, old.orderNumber);
  assert.equal((await w.fresh(old)).status, "canceled");
  assert.equal((await w.fresh(old)).failureCode, "SUPERSEDED");
  const calls = w.toss.calls.confirm;
  const late = await w.confirm(old, "pk_old_auth");
  assert.equal(late.kind, "rejected");
  assert.equal(w.toss.calls.confirm, calls, "대체된 주문에는 결제사 승인 요청을 보내지 않는다(청구되지 않는다)");
  const pendings = (await w.mem.repo.listOrdersForAssessment(w.mine.id)).filter((o) => o.status === "pending" && o.productId.startsWith("personal-integrated-report"));
  assert.equal(pendings.length, 1, "개인 리포트 대기 주문은 하나만 남는다");
});

test("⑥ 인증 대기 중 구매자가 창을 닫아 실패 주소로 돌아온 경우에만 취소로 정리하고, 결제 화면 새로고침은 이미 끝난 주문을 결제 화면으로 다시 열지 않는다(소스 확인)", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const page = readFileSync(join(import.meta.dirname, "..", "..", "app", "checkout", "[orderNumber]", "page.tsx"), "utf8");
  assert.match(page, /if \(order\.status !== "pending"\) redirect\(resultPathOf\(order, \{ paid: order\.status === "paid" \}\)\)/, "대기가 아닌 주문(결제 완료 · 환불 · 취소)은 결제 화면 대신 돌아갈 화면으로 보낸다");
  const w = await world();
  w.toss.authorize("pk_closed", w.pack.orderNumber, w.pack.amount);
  const closed = await markCheckoutFailed({ repo: w.mem.repo }, { userId: USER, orderNumber: w.pack.orderNumber, code: "PAY_PROCESS_CANCELED", message: "사용자가 결제를 취소했습니다" });
  assert.equal(closed?.status, "canceled", "결제사가 돌려준 취소 코드가 있을 때만 취소로 정리한다");
});
