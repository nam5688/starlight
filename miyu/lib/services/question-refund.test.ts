// 실행: npm test — 질문 3개 묶음의 부분 환불: 결제사의 누적 취소액을 묶음 장부에 반영해 남은 질문을 회수한다.
// 총 환불액은 결제액(2,500원)을 넘지 않고, 전부 환불하면 정확히 2,500원이다(834 + 833 + 833). 알림이 중복 · 지연 · 순서 뒤바뀜으로 와도 결과가 같다.
// (부분 취소 기능을 만든 뒤에는 시험에 반드시 포함한다 — 운영자 2026-10-15)
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { nextRefundSteps, packRemaining, packShortfall, refundQuestionsFor, refundSchedule, refundTotalFor } from "../commerce/cash.ts";
import { MIYU_CASH, QUESTION_PACK_PRICE_KRW, QUESTION_PACK_SIZE } from "../config/product.ts";
import { createQuestionNonce } from "../commerce/cash.ts";
import { EMPTY_BASIC_INFO } from "../profile/basic-info.ts";
import { manseryeokEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { getCashView, startQuestionPayment } from "./cash-service.ts";
import type { AskDeps } from "./chat-service.ts";
import { confirmPayment, startCheckout, syncPayment } from "./order-service.ts";
import { reconcileBatch, reconcileOrder } from "./reconcile-service.ts";
import { createFakeToss } from "./testing/fake-toss.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const INFO = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true, gender: "female" as const };
const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, 4])));
const PER = MIYU_CASH.perQuestion;

// ───────────── 환불 금액 계산 (순수 규칙) ─────────────

test("누적 환불표: 2,500원 · 질문 3개는 834 → 1,667 → 2,500이고 이번에 취소할 금액은 834 · 833 · 833 (합 2,500원)", () => {
  assert.deepEqual(refundSchedule(2500, 3), [834, 1667, 2500]);
  const steps = refundSchedule(2500, 3).map((c, i, a) => c - (a[i - 1] ?? 0));
  assert.deepEqual(steps, [834, 833, 833]);
  assert.equal(steps.reduce((s, n) => s + n, 0), 2500, "예전 방식(매번 올림 834 × 3)이면 2,502원이 됐다");
  assert.equal(refundTotalFor(2500, 3, 3), QUESTION_PACK_PRICE_KRW);
  assert.equal(refundQuestionsFor(2500, 3, 1667), 2);
  assert.equal(refundQuestionsFor(2500, 3, 1000), null, "질문 수에 맞지 않는 취소 금액은 표에 없다");
});

test("누적 환불표는 어떤 가격 · 묶음 크기에서도 결제액을 넘지 않고, 늘어나기만 하며, 끝은 정확히 결제액이다", () => {
  for (const price of [1000, 2499, 2500, 2501, 9900, 12345]) {
    for (const q of [1, 2, 3, 4, 5, 7]) {
      const table = refundSchedule(price, q);
      assert.equal(table.length, q);
      assert.equal(table[q - 1], price, `${price}원 · ${q}개의 마지막 누적액`);
      for (let i = 0; i < q; i++) {
        assert.ok(table[i] <= price);
        if (i > 0) assert.ok(table[i] > table[i - 1] || price < q, "누적액은 늘어난다");
      }
    }
  }
});

test("묶음 계산: 남은 질문 · 회수하지 못한 몫 · 다음 환불 금액(이번에 취소할 금액 = 누적표 − 이미 환불한 누적액)", () => {
  assert.equal(packRemaining({ questions: 3, used: 1, refundedQuestions: 1 }), 1);
  assert.equal(packRemaining({ questions: 3, used: 3, refundedQuestions: 2 }), 0, "음수가 되지 않는다");
  assert.equal(packShortfall({ questions: 3, used: 3, refundedQuestions: 2 }), 2);
  assert.equal(packShortfall({ questions: 3, used: 1, refundedQuestions: 1 }), 0);
  assert.deepEqual(nextRefundSteps({ questions: 3, priceKrw: 2500, used: 0, refundedQuestions: 0, refundedKrw: 0 }), [
    { questions: 1, cancelNow: 834, cumulative: 834 },
    { questions: 2, cancelNow: 1667, cumulative: 1667 },
    { questions: 3, cancelNow: 2500, cumulative: 2500 },
  ]);
  assert.deepEqual(nextRefundSteps({ questions: 3, priceKrw: 2500, used: 0, refundedQuestions: 1, refundedKrw: 834 }), [
    { questions: 1, cancelNow: 833, cumulative: 1667 },
    { questions: 2, cancelNow: 1666, cumulative: 2500 },
  ]);
  assert.deepEqual(nextRefundSteps({ questions: 3, priceKrw: 2500, used: 3, refundedQuestions: 0, refundedKrw: 0 }), [], "다 쓴 묶음은 환불할 질문이 없다");
});

// ───────────── 서비스 흐름: 부분 취소 → 장부 반영 ─────────────

async function world() {
  const t = new Date("2026-10-15T03:00:00Z").getTime();
  const now = () => new Date(t);
  const mem = createMemoryRepository(now);
  const toss = createFakeToss(now);
  const saved = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: USER, channel: "web", info: INFO, answers, today: now() });
  if (!saved.ok) throw new Error(saved.message);
  const assessment = saved.assessment;
  let n = 0;
  const askDeps: AskDeps & { nonce: (room: string) => string } = {
    repo: mem.repo,
    answerer: { provider: "t", model: "t", answer: async () => ({ paragraphs: ["답이에요."] }) },
    now,
    config: { extraQuestions: 0 },
    nonce: (r) => createQuestionNonce(r, (b) => b.fill(++n % 200)),
    loadAsk: async () => {
      throw new Error("이 시험에서는 질문 답변을 부르지 않는다");
    },
  };
  /** 묶음 하나를 결제하고 승인까지 마친다 (무료 질문 확인은 건너뛰고 주문을 바로 만든다) */
  async function buyPack() {
    const order = await mem.repo.insertOrder({
      orderNumber: `MEU-Q-${++n}`,
      userId: USER,
      assessmentId: assessment.id,
      productId: `cash-charge:9:0:LOVE${String(n).padStart(10, "0")}`,
      amount: QUESTION_PACK_PRICE_KRW,
      paymentEnv: "test",
      acquisition: null,
    });
    if (!order.ok) throw new Error("주문 생성 실패");
    const paymentKey = `pk_refund_${++n}`;
    const paid = await confirmPayment({ repo: mem.repo, gateway: toss.gateway }, { userId: USER, orderNumber: order.value.orderNumber, paymentKey, amount: QUESTION_PACK_PRICE_KRW });
    if (paid.kind !== "paid") throw new Error(paid.kind);
    return { order: paid.order, paymentKey };
  }
  const sync = (paymentKey: string) => syncPayment({ repo: mem.repo, gateway: toss.gateway }, { paymentKey });
  const spend = (ref: string) => mem.repo.spendCash({ userId: USER, amount: PER, ref });
  const balance = () => mem.repo.getCashBalance(USER);
  return { mem, toss, now, assessment, askDeps, buyPack, sync, spend, balance };
}

test("부분 환불 1개(834원): 질문 1개를 회수하고 주문은 결제 완료로 남으며, 같은 알림이 다시 와도 한 번만 반영된다", async () => {
  const w = await world();
  const { order, paymentKey } = await w.buyPack();
  assert.equal(await w.balance(), 9);

  assert.equal(w.toss.cancel(paymentKey, 834), true);
  const r1 = await w.sync(paymentKey);
  assert.equal(r1.kind, "updated");
  if (r1.kind !== "updated") return;
  assert.equal(r1.to, "partial-refunded");
  assert.deepEqual(r1.refund && { q: r1.refund.questions, krw: r1.refund.refundedKrw, clawed: r1.refund.clawed, shortfall: r1.refund.shortfall }, { q: 1, krw: 834, clawed: 1, shortfall: 0 });
  assert.equal(r1.order.status, "paid", "부분 취소는 주문을 환불됨으로 바꾸지 않는다");
  assert.equal(await w.balance(), 6, "질문 3개에서 1개를 회수");
  const pack = await w.mem.repo.getQuestionPack(order.id);
  assert.deepEqual(pack && { used: pack.used, rq: pack.refundedQuestions, krw: pack.refundedKrw }, { used: 0, rq: 1, krw: 834 });

  // 같은 알림 중복 — 결제사를 다시 조회한 누적값이 같으므로 아무것도 더 회수하지 않는다
  const r2 = await w.sync(paymentKey);
  assert.equal(r2.kind, "unchanged");
  assert.equal(await w.balance(), 6);
  assert.equal(w.mem.ledger.filter((l) => l.kind === "refund_claw").length, 1);
});

test("1개씩 세 번 환불해도 총 환불액은 정확히 2,500원이고(834 + 833 + 833), 마지막에 주문이 환불됨으로 바뀌며 질문은 모두 회수된다", async () => {
  const w = await world();
  const { order, paymentKey } = await w.buyPack();
  const cancels = [834, 833, 833];
  let total = 0;
  for (const [i, amount] of cancels.entries()) {
    assert.equal(w.toss.cancel(paymentKey, amount), true, `${i + 1}번째 취소 ${amount}원`);
    total += amount;
    const r = await w.sync(paymentKey);
    assert.equal(r.kind, "updated");
    assert.equal(await w.balance(), 9 - (i + 1) * PER);
    const pack = await w.mem.repo.getQuestionPack(order.id);
    assert.equal(pack?.refundedKrw, total);
    assert.ok((pack?.refundedKrw ?? 0) <= QUESTION_PACK_PRICE_KRW);
  }
  assert.equal(total, 2500);
  assert.equal(w.toss.byKey.get(paymentKey)?.status, "CANCELED");
  assert.equal((await w.mem.repo.getOrderById(order.id))?.status, "refunded");
  assert.equal(await w.balance(), 0);
  // 결제사가 더 환불해 줄 수 없다 (남은 금액이 없다)
  assert.equal(w.toss.cancel(paymentKey, 1), false);
  assert.equal(w.mem.ledger.filter((l) => l.kind === "refund_claw").reduce((s, l) => s + l.amount, 0), -9);
});

test("알림이 늦거나 순서가 바뀌어도 결과가 같다: 두 번째 취소 알림이 먼저 와서 2개를 회수하고, 늦게 온 첫 알림은 이미 반영된 것으로 본다", async () => {
  const w = await world();
  const { order, paymentKey } = await w.buyPack();
  w.toss.cancel(paymentKey, 834);
  w.toss.cancel(paymentKey, 833); // 첫 알림은 지연 — 결제사 기록은 이미 누적 1,667원
  const late = await w.sync(paymentKey);
  assert.equal(late.kind, "updated");
  if (late.kind === "updated") assert.equal(late.refund?.questions, 2);
  assert.equal(await w.balance(), 3);
  const delayedFirst = await w.sync(paymentKey); // 늦게 도착한 첫 알림 — 결제사를 다시 조회해도 같은 누적값
  assert.equal(delayedFirst.kind, "unchanged");
  assert.equal(await w.balance(), 3);
  assert.equal((await w.mem.repo.getQuestionPack(order.id))?.refundedKrw, 1667);
});

test("이미 쓴 질문까지 환불된 경우: 남은 질문만 회수하고(음수 없음) 회수하지 못한 몫은 알림 대상으로 남는다", async () => {
  const w = await world();
  const { order, paymentKey } = await w.buyPack();
  await w.spend("ask-1");
  await w.spend("ask-2"); // 묶음에서 2개 사용 — 남은 질문 1개
  w.toss.cancel(paymentKey, 1667); // 2개 환불
  const r = await w.sync(paymentKey);
  assert.equal(r.kind, "updated");
  if (r.kind !== "updated" || !r.refund) return;
  assert.equal(r.refund.clawed, 1, "남은 1개만 회수");
  assert.equal(r.refund.shortfall, 1, "이미 쓴 질문 1개는 회수하지 못한 몫");
  assert.equal(await w.balance(), 0);
  const pack = await w.mem.repo.getQuestionPack(order.id);
  assert.equal(packShortfall({ questions: 3, used: pack!.used, refundedQuestions: pack!.refundedQuestions }), 1);
  // 알림에 회수하지 못한 몫이 보인다 (이름 · 대화 없이 주문번호와 개수만)
  const row = w.mem.ledger.find((l) => l.kind === "refund_claw");
  assert.equal(row?.shortfall, PER);
});

test("환불 뒤에는 남은 질문만 쓸 수 있다: 1개를 환불하면 2개까지 쓰고 세 번째 질문은 결제해 둔 질문이 없어 막힌다", async () => {
  const w = await world();
  const { paymentKey } = await w.buyPack();
  w.toss.cancel(paymentKey, 834);
  await w.sync(paymentKey);
  assert.notEqual(await w.spend("a"), null);
  assert.notEqual(await w.spend("b"), null);
  assert.equal(await w.spend("c"), null, "환불한 1개는 다시 쓸 수 없다");
  assert.equal(await w.balance(), 0);
});

test("환불 중에 질문을 쓰는 경우: 환불 반영과 질문 사용이 어느 순서로 끝나도 장부가 음수가 되지 않고 질문을 둘 다 가질 수 없다", async () => {
  for (const refundFirst of [true, false]) {
    const w = await world();
    const { order, paymentKey } = await w.buyPack();
    await w.spend("ask-1"); // 이미 1개 사용 — 남은 질문 2개
    w.toss.cancel(paymentKey, 1667); // 질문 2개 환불
    const run = [
      () => w.sync(paymentKey),
      () => Promise.all([w.spend("ask-2"), w.spend("ask-3")]),
    ];
    await Promise.all((refundFirst ? run : [...run].reverse()).map((f) => f()));
    const bal = await w.balance();
    const pack = await w.mem.repo.getQuestionPack(order.id);
    assert.ok(bal >= 0, "장부는 음수가 되지 않는다");
    assert.equal(bal % PER, 0);
    // 환불한 질문 + 쓴 질문 + 아직 남은 질문 = 묶음 크기 (모자란 몫은 회수하지 못한 몫으로 기록된다)
    const left = bal / PER;
    assert.equal(pack!.used + pack!.refundedQuestions + left - packShortfall({ questions: 3, used: pack!.used, refundedQuestions: pack!.refundedQuestions }), QUESTION_PACK_SIZE, `refundFirst=${refundFirst}`);
    const spendRows = w.mem.ledger.filter((l) => l.kind === "spend").length;
    assert.ok(spendRows <= 3);
  }
});

test("묶음이 둘일 때 한 묶음을 환불해도 다른 묶음의 질문은 회수하지 않는다 (예전 지갑 합계 방식의 과다 회수 방지)", async () => {
  const w = await world();
  const a = await w.buyPack();
  await w.spend("a-1");
  await w.spend("a-2");
  await w.spend("a-3"); // 묶음 A 다 씀
  const b = await w.buyPack(); // 묶음 B 새로 결제 — 질문 3개
  assert.equal(await w.balance(), 9);
  w.toss.cancel(a.paymentKey, 2500); // 묶음 A 전액 취소 (이미 모두 사용)
  await w.sync(a.paymentKey);
  assert.equal(await w.balance(), 9, "묶음 B의 질문 3개는 그대로");
  const packB = await w.mem.repo.getQuestionPack(b.order.id);
  assert.equal(packB?.refundedQuestions, 0);
  const view = await getCashView(w.mem.repo, USER);
  assert.equal(view.questions, 3);
});

test("답을 받지 못해 되돌린 질문: 환불이 남은 질문만 정산했다면 그 질문은 지갑에 돌아오고, 이미 환불에 포함됐다면 다시 넣지 않는다 — 어느 쪽도 묶음 크기(3개)를 넘지 않는다", async () => {
  // ① 질문 1개를 쓰는 중(답 기다리는 중)에 2개 환불 — 환불은 남은 2개만 정산하므로 실패한 1개는 되돌려 받는다 (환불 2 + 남은 1 = 3)
  const a = await world();
  const packA = await a.buyPack();
  await a.spend("ask-1");
  a.toss.cancel(packA.paymentKey, 1667);
  await a.sync(packA.paymentKey);
  assert.equal(await a.balance(), 0, "남은 질문 2개를 회수 — 지갑 0");
  assert.equal(packRemaining((await a.mem.repo.getQuestionPack(packA.order.id))!), 0);
  await a.mem.repo.restoreCashSpend({ userId: USER, ref: "ask-1" });
  assert.equal(await a.balance(), PER, "답을 받지 못한 질문 1개는 돌아온다");
  const pa = (await a.mem.repo.getQuestionPack(packA.order.id))!;
  assert.equal(pa.used + pa.refundedQuestions + (await a.balance()) / PER, QUESTION_PACK_SIZE);

  // ② 같은 상황에서 3개 전부 환불 — 쓰는 중인 1개까지 환불에 포함됐으니(회수하지 못한 몫 1) 되돌려도 지갑이 늘지 않는다
  const b = await world();
  const packB = await b.buyPack();
  await b.spend("ask-1");
  b.toss.cancel(packB.paymentKey, 2500);
  await b.sync(packB.paymentKey);
  assert.equal(await b.balance(), 0);
  await b.mem.repo.restoreCashSpend({ userId: USER, ref: "ask-1" });
  assert.equal(await b.balance(), 0, "이미 환불받은 질문은 다시 쓸 수 없다");
  const pb = (await b.mem.repo.getQuestionPack(packB.order.id))!;
  assert.ok(pb.used + pb.refundedQuestions >= QUESTION_PACK_SIZE - 0);
  assert.equal(packRemaining(pb), 0);
});

test("질문 수에 맞지 않는 취소 금액(예: 1,000원)은 질문을 회수하지 않고 운영자 확인으로 올린다 — 같은 알림을 다시 받아도 결과가 같다", async () => {
  const w = await world();
  const { paymentKey } = await w.buyPack();
  w.toss.cancel(paymentKey, 1000);
  const r = await w.sync(paymentKey);
  assert.equal(r.kind, "attention");
  if (r.kind !== "attention") return;
  assert.equal(r.code, "PARTIAL_REFUND_MISMATCH");
  assert.match(r.message, /834원/);
  assert.match(r.message, /1,667원/);
  assert.match(r.message, /2,500원/);
  assert.equal(await w.balance(), 9, "금액이 맞지 않으면 질문을 회수하지 않는다");
  assert.equal((await w.sync(paymentKey)).kind, "attention");
  assert.equal(await w.balance(), 9);
});

test("결제 완료 뒤 결제사 취소 알림(웹훅)을 놓쳐도 결제 재확인(대조)이 부분 취소를 장부에 맞춘다 — 한 번만, 다시 해도 같은 결과", async () => {
  const w = await world();
  const { order, paymentKey } = await w.buyPack();
  w.toss.cancel(paymentKey, 834);
  const deps = { repo: w.mem.repo, gateway: w.toss.gateway, now: w.now };
  const first = await reconcileOrder(deps, (await w.mem.repo.getOrderById(order.id))!);
  assert.equal(first.kind, "partial-refund");
  if (first.kind === "partial-refund") assert.equal(first.refund.clawed, 1);
  assert.equal(await w.balance(), 6);
  const second = await reconcileOrder(deps, (await w.mem.repo.getOrderById(order.id))!);
  assert.equal(second.kind, "ok", "이미 반영한 취소는 다시 회수하지 않는다");
  assert.equal(await w.balance(), 6);

  // 두 번째 부분 취소도 같은 방식으로 맞춘다
  w.toss.cancel(paymentKey, 833);
  const third = await reconcileBatch(deps, { paidLookbackMs: 24 * 3600_000 });
  assert.equal(third.counts["partial-refund"], 1);
  assert.equal(await w.balance(), 3);
});

test("대조: 질문 수에 맞지 않는 취소는 anomaly(PARTIAL_REFUND_MISMATCH)이고 질문을 건드리지 않는다", async () => {
  const w = await world();
  const { order, paymentKey } = await w.buyPack();
  w.toss.cancel(paymentKey, 2000);
  const out = await reconcileOrder({ repo: w.mem.repo, gateway: w.toss.gateway, now: w.now }, (await w.mem.repo.getOrderById(order.id))!);
  assert.equal(out.kind, "anomaly");
  if (out.kind === "anomaly") assert.equal(out.code, "PARTIAL_REFUND_MISMATCH");
  assert.equal(await w.balance(), 9);
});

test("개인 통합 리포트 주문의 부분 취소는 예전처럼 운영자 확인(anomaly)으로만 남고 주문 · 열람 권한은 바뀌지 않는다", async () => {
  const w = await world();
  const started = await startCheckout({ repo: w.mem.repo, now: w.now }, { userId: USER, assessmentId: w.assessment.id, paymentEnv: "test" });
  if (started.kind !== "order") throw new Error(started.kind);
  const paid = await confirmPayment({ repo: w.mem.repo, gateway: w.toss.gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_personal_partial", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error(paid.kind);
  w.toss.cancel("pk_personal_partial", 1000);
  const out = await reconcileOrder({ repo: w.mem.repo, gateway: w.toss.gateway, now: w.now }, paid.order);
  assert.equal(out.kind, "anomaly");
  if (out.kind === "anomaly") assert.equal(out.code, "UNEXPECTED_PARTIAL_CANCELED");
  assert.equal((await w.mem.repo.getOrderById(paid.order.id))?.status, "paid");
  assert.equal(w.mem.ledger.length, 0, "질문 장부는 건드리지 않는다");
});

test("묶음 장부가 없는 예전 주문(16번 전)의 부분 취소는 회수하지 않고 운영자 확인(PARTIAL_REFUND_NO_PACK)으로 올린다", async () => {
  const w = await world();
  const { order, paymentKey } = await w.buyPack();
  w.mem.packs.delete(order.id); // 16번 이전에 결제돼 묶음 장부가 없는 주문
  w.toss.cancel(paymentKey, 834);
  const r = await w.sync(paymentKey);
  assert.equal(r.kind, "attention");
  if (r.kind === "attention") assert.equal(r.code, "PARTIAL_REFUND_NO_PACK");
  assert.equal(await w.balance(), 9);
});

test("결제 시작 화면 흐름은 그대로: 질문이 하나라도 남아 있으면 새로 결제받지 않고, 환불로 모두 정리돼 0이 되면 다시 결제할 수 있다", async () => {
  const w = await world();
  const { paymentKey } = await w.buyPack();
  const room = { label: "연애", mode: "연애박사 미유", focus: "연애 · 관계" };
  const deps: AskDeps & { nonce: (room: string) => string } = {
    ...w.askDeps,
    loadAsk: async () => ({
      context: { room, intake: null, topic: { title: "가까운 관계", headline: "확인이 되면 마음이 편해져요", summary: ["확인이 있으면 편해져요."], detail: [] }, overview: { headline: "확인을 중요하게 여겨요", tendency: null, strength: null, caution: null, flow: null }, followUp: false, taste: false },
      referenceDate: "2026-10-15",
      tier: "free",
      room: "love",
      roomKey: "love",
    }),
  };
  for (let i = 0; i < 2; i++) await w.mem.repo.addChatQuestion({ userId: USER, assessmentId: w.assessment.id, roomKey: "love" });
  const input = { userId: USER, assessmentId: w.assessment.id, roomKey: "love", question: "요즘 연락이 뜸한 사람이 있어요", paymentEnv: "test" as const };
  assert.equal((await startQuestionPayment(deps, input)).kind, "ask", "결제해 둔 질문이 남아 있다");
  w.toss.cancel(paymentKey, 2500);
  await w.sync(paymentKey);
  assert.equal(await w.balance(), 0);
  assert.equal((await startQuestionPayment(deps, input)).kind, "order", "환불로 질문이 없어지면 새 묶음을 결제할 수 있다");
});

// ───────────── 고객이 다시 접속하지 않아도 반영되는가: 질문 사용 전 확인 · 정기 점검 ─────────────
// 호스팅의 정기 실행이 하루 한 번뿐이거나(Vercel Hobby) 웹훅이 오지 않아도, 결제사에서 환불한 질문은 쓰이지 않아야 한다.

import { askFreeQuestion } from "./chat-service.ts";
import { reconcileOpenPacksOfUser } from "./reconcile-service.ts";
import type { ChatContext } from "../report/chat/types.ts";

const CONTEXT: ChatContext = { room: { label: "연애", mode: "연애박사 미유", focus: "연애 · 관계" }, intake: null, topic: null, overview: { headline: "확인을 중요하게 여겨요", tendency: null, strength: null, caution: null, flow: null }, followUp: false, taste: false };

let askRefSeq = 0;
/** 무료 질문을 다 쓴 상태로 만들어 두고(연애 방 3개), 질문 답변 의존물을 돌려준다 — verify를 주면 질문 사용 전 확인이 켜진다 */
function paidAsker(w: Awaited<ReturnType<typeof world>>, verify?: AskDeps["verifyBeforeUse"]) {
  for (let i = 0; i < 3; i++) w.mem.chatQuestions.push({ userId: USER, assessmentId: w.assessment.id, roomKey: "love", createdAt: w.now().toISOString() });
  const deps: AskDeps = {
    ...w.askDeps,
    newRef: () => `q-ref-${++askRefSeq}`,
    loadAsk: async () => ({ context: CONTEXT, referenceDate: "2026-10-15", tier: "paid", room: "love", roomKey: "love" }),
    ...(verify ? { verifyBeforeUse: verify } : {}),
  };
  const ask = () => askFreeQuestion(deps, { userId: USER, assessmentId: w.assessment.id, roomKey: "love", question: "요즘 연락이 뜸한 사람이 있어요" });
  return { ask, deps };
}
const verifyWith = (w: Awaited<ReturnType<typeof world>>): NonNullable<AskDeps["verifyBeforeUse"]> => async (userId) => {
  await reconcileOpenPacksOfUser({ repo: w.mem.repo, gateway: w.toss.gateway, now: w.now }, userId);
};

test("고객이 다시 접속하지 않아도: 토스에서 2개를 부분 취소한 뒤 알림 · 정기 점검이 없었어도, 질문을 쓰는 순간 환불이 먼저 반영돼 환불받은 질문은 쓰이지 않는다", async () => {
  const w = await world();
  const { order, paymentKey } = await w.buyPack();
  w.toss.cancel(paymentKey, 1667); // 토스 관리자에서 2개 환불 — 웹훅은 오지 않았고 고객은 화면을 열지 않았다
  assert.equal(await w.balance(), 9, "아직 장부에 반영되지 않았다");
  const { ask } = paidAsker(w, verifyWith(w));

  const first = await ask();
  assert.ok(first.ok && first.kind === "answer", JSON.stringify(first));
  const pack = (await w.mem.repo.getQuestionPack(order.id))!;
  assert.deepEqual({ rq: pack.refundedQuestions, krw: pack.refundedKrw, used: pack.used }, { rq: 2, krw: 1667, used: 1 }, "질문을 쓰기 전에 환불이 반영돼 남은 1개로 답했다");
  assert.equal(await w.balance(), 0);
  const second = await ask();
  assert.ok(!second.ok && second.reason === "need-payment", "환불받은 질문 2개는 쓸 수 없다");
});

test("확인이 없었다면(비교): 같은 상황에서 환불받은 질문까지 3개를 모두 쓸 수 있었다 — 질문 사용 전 확인이 막는 구멍", async () => {
  const w = await world();
  const { paymentKey } = await w.buyPack();
  w.toss.cancel(paymentKey, 1667);
  const { ask } = paidAsker(w); // verifyBeforeUse 없음
  for (let i = 0; i < 3; i++) {
    const r = await ask();
    assert.ok(r.ok && r.kind === "answer", `${i + 1}번째`);
  }
});

test("질문 사용 전 확인은 같은 환불을 두 번 반영하지 않는다: 이미 반영한 부분 취소가 있고 환불이 더 없으면 장부는 그대로이며 질문은 정상으로 답한다", async () => {
  const w = await world();
  const { order, paymentKey } = await w.buyPack();
  w.toss.cancel(paymentKey, 834);
  await w.sync(paymentKey); // 웹훅이 와서 이미 반영됨 (질문 1개 환불 — 남은 2개)
  const { ask } = paidAsker(w, verifyWith(w));
  assert.ok((await ask()).ok);
  assert.ok((await ask()).ok);
  assert.ok(!(await ask()).ok, "환불 1개 + 사용 2개 = 3개");
  const pack = (await w.mem.repo.getQuestionPack(order.id))!;
  assert.equal(pack.refundedQuestions, 1);
  assert.equal(w.mem.ledger.filter((l) => l.kind === "refund_claw").length, 1);
});

test("전액 취소도 질문을 쓰기 전에 반영된다: 주문이 환불됨으로 바뀌고 남은 질문이 없어져 질문은 결제가 필요하다고 안내한다", async () => {
  const w = await world();
  const { order, paymentKey } = await w.buyPack();
  w.toss.cancel(paymentKey); // 전액
  const { ask } = paidAsker(w, verifyWith(w));
  const r = await ask();
  assert.ok(!r.ok && r.reason === "need-payment");
  assert.equal((await w.mem.repo.getOrderById(order.id))?.status, "refunded");
  assert.equal(await w.balance(), 0);
});

test("결제사 조회가 안 될 때: 질문은 막지 않고(열어 둔다) 장부는 바뀌지 않으며, 확인 단계가 오류를 던져도 질문은 그대로 답한다 — 환불은 정기 점검이 이어서 맞춘다", async () => {
  const w = await world();
  const { order, paymentKey } = await w.buyPack();
  w.toss.cancel(paymentKey, 834);
  w.toss.state.lookupDown = true;
  const outcomes = await reconcileOpenPacksOfUser({ repo: w.mem.repo, gateway: w.toss.gateway, now: w.now }, USER);
  assert.deepEqual(outcomes.map((o) => o.kind), ["error"], "조회 실패는 error로 돌려준다(환불로도 정상으로도 단정하지 않는다)");
  assert.equal(await w.balance(), 9);

  const { ask } = paidAsker(w, verifyWith(w));
  assert.ok((await ask()).ok, "조회가 안 되어도 질문은 열려 있다");
  // 확인 단계가 예상하지 못한 오류를 던져도 질문은 그대로 답한다 (같은 세계 — 결제해 둔 질문이 남아 있다)
  const thrower = paidAsker(w, async () => {
    throw new Error("boom");
  });
  const afterThrow = await thrower.ask();
  assert.ok(afterThrow.ok && afterThrow.kind === "answer", "확인 단계의 오류가 질문을 막지 않는다");
  assert.equal(await w.balance(), 3, "질문 2개를 썼다 (환불은 아직 반영되지 않았다)");

  // 조회가 돌아오면 정기 점검이 이어서 맞춘다
  w.toss.state.lookupDown = false;
  const deps = { repo: w.mem.repo, gateway: w.toss.gateway, now: w.now };
  const sweep = await reconcileBatch(deps);
  assert.equal(sweep.counts["partial-refund"], 1);
  assert.equal((await w.mem.repo.getQuestionPack(order.id))?.refundedQuestions, 1);
});

test("정기 점검은 결제한 지 7일이 지나도 남은 질문이 있는 묶음을 계속 확인한다 — 다 쓴 묶음은 다시 확인하지 않는다", async () => {
  const w = await world();
  const open = await w.buyPack(); // 남은 질문이 있는 묶음
  w.toss.cancel(open.paymentKey, 834);
  const t0 = w.now().getTime();
  const later = () => new Date(t0 + 30 * 86_400_000); // 30일 뒤 (7일 점검 기간 밖)
  const deps = { repo: w.mem.repo, gateway: w.toss.gateway, now: later };

  const sweep = await reconcileBatch(deps);
  assert.equal(sweep.checked, 1, "결제한 지 30일이 지났지만 남은 질문이 있어 확인한다");
  assert.equal(sweep.counts["partial-refund"], 1);
  assert.equal(await w.balance(), 6);

  // 한 번 더 — 이미 반영돼 있으니 장부는 그대로
  const again = await reconcileBatch(deps);
  assert.equal(again.counts["partial-refund"], 0);
  assert.equal(await w.balance(), 6);

  // 질문을 모두 쓰고 나면 더는 정기 점검 대상이 아니다 (환불이 나중에 와도 쓰이지 않을 질문이 없다 — 관리자 재확인 버튼이 맞춘다)
  await w.spend("u-1");
  await w.spend("u-2");
  const done = await reconcileBatch(deps);
  assert.equal(done.checked, 0);
});

test("남은 질문이 있는 묶음 목록: 회원별로 나뉘고 · 다 쓴 묶음과 환불로 정산된 묶음은 빠지며 · 결제 완료가 아닌 주문은 없다", async () => {
  const w = await world();
  const a = await w.buyPack();
  const b = await w.buyPack();
  const ids = async (userId?: string) => (await w.mem.repo.listOrdersWithOpenPacks({ ...(userId ? { userId } : {}), limit: 10 })).map((o) => o.id).sort();
  assert.deepEqual(await ids(USER), [a.order.id, b.order.id].sort());
  assert.deepEqual(await ids("22222222-2222-4222-8222-222222222222"), [], "다른 회원의 묶음은 보이지 않는다");
  await w.spend("x-1");
  await w.spend("x-2");
  await w.spend("x-3"); // 가장 먼저 산 묶음(a)을 모두 사용
  assert.deepEqual(await ids(USER), [b.order.id]);
  w.toss.cancel(b.paymentKey); // b 전액 환불
  await w.sync(b.paymentKey);
  assert.deepEqual(await ids(USER), [], "환불된 주문(결제 완료가 아님)은 빠진다");
});
