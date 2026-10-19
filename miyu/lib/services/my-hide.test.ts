// MY 목록에서 리포트 숨기기 · 다시 보이게 하기 (비용 0 · 메모리 저장소).
// 확인하는 것: 목록 표시만 나뉨 · 본인 것만 바뀜 · 같은 요청을 여러 번(동시에도) 보내도 결과가 같음 · 복원 가능 ·
// 숨겨도 결과 · 리포트 · 주문 · 결제 · 질문권 · 채팅 · 맛보기 · 동의 · 구매 권한이 그대로 · 27번 전 DB에서는 기능만 꺼짐.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "../profile/basic-info.ts";
import { devReportGenerator } from "../report/generate-dev-report.ts";
import { manseryeokEngine as sajuEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { getMyPage, setReportHidden } from "./my-service.ts";
import { confirmPayment, startCheckout } from "./order-service.ts";
import type { PaymentGateway } from "./ports.ts";
import { ensureReport, getResultView } from "./report-service.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const TODAY = new Date("2026-10-11T00:00:00Z");
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const INFO: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTimeUnknown: true, gender: "female", knownMbti: "INFJ" };
const answersAll = (value: number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, value])));

const gateway: PaymentGateway = {
  provider: "tosspayments",
  async confirm({ paymentKey, orderId, amount }) {
    return { ok: true, payment: { paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: "2026-10-11T10:00:00+09:00", mId: "tvivarepublica" } };
  },
  async getPayment() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
  async getPaymentByOrderId() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
};

/** 회원 한 명에게 무료 결과 하나(채팅·맛보기·질문 횟수가 붙음)와 구매한 결과 하나(리포트 완성)를 만든다 */
async function world() {
  const mem = createMemoryRepository(() => TODAY);
  const save = async (nickname: string, userId = USER) => {
    const saved = await submitAssessment({ repo: mem.repo, saju: sajuEngine }, { userId, channel: "web", info: { ...INFO, nickname }, answers: answersAll(4), today: TODAY });
    assert.ok(saved.ok);
    return saved.ok ? saved.assessment : (null as never);
  };
  const free = await save("무료");
  const bought = await save("구매");
  const stranger = await save("남의결과", OTHER);

  const started = await startCheckout({ repo: mem.repo, now: () => TODAY }, { userId: USER, assessmentId: bought.id });
  if (started.kind !== "order") throw new Error(started.kind);
  const paid = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_hide", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error(paid.kind);
  await ensureReport({ repo: mem.repo, generator: devReportGenerator, now: () => TODAY }, paid.order);

  await mem.repo.upsertTalkRoom({ assessmentId: free.id, userId: USER, roomKey: "love", actions: [{ t: "topic", id: "love" }] });
  await mem.repo.addChatQuestion({ userId: USER, assessmentId: free.id, roomKey: "love" });
  assert.deepEqual(await mem.repo.reserveTasteReport({ userId: USER, assessmentId: free.id }), { state: "reserved" });
  await mem.repo.saveTasteReport({ userId: USER, assessmentId: free.id, content: { marker: "맛보기" }, generator: "test", generatorVersion: "0" });
  await mem.repo.addConsents(USER, [{ type: "terms", version: "t1", agreed: true }]);
  return { mem, free: free.id, bought: bought.id, stranger: stranger.id, boughtOrderNumber: started.order.orderNumber };
}

/** 숨김과 무관한 모든 기록의 모습 — 숨기기 · 되돌리기 전후가 같아야 한다 */
async function snapshot(w: Awaited<ReturnType<typeof world>>) {
  const { mem } = w;
  return JSON.stringify({
    assessments: [...mem.assessments.values()],
    orders: [...mem.orders.values()],
    reports: [...mem.reports.values()],
    events: mem.events,
    talk: [...mem.talkRooms.values()],
    chat: mem.chatQuestions,
    consents: [...mem.consents.entries()],
    taste: await mem.repo.getTasteReport(USER),
    wallets: [...mem.wallets.entries()],
    ledger: mem.ledger,
    packs: [...mem.packs.entries()],
    profiles: [...mem.profiles.entries()],
  });
}

test("숨기면 MY 목록에서만 빠지고 숨긴 리포트 목록으로 간다 — 복원하면 돌아온다", async () => {
  const w = await world();
  let page = await getMyPage(w.mem.repo, USER);
  assert.equal(page.hideAvailable, true);
  assert.deepEqual(page.cards.map((c) => c.assessmentId).sort(), [w.free, w.bought].sort());
  assert.deepEqual(page.hiddenCards, []);

  assert.deepEqual(await setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.free, hidden: true }), { kind: "hidden" });
  page = await getMyPage(w.mem.repo, USER);
  assert.deepEqual(page.cards.map((c) => c.assessmentId), [w.bought]);
  assert.deepEqual(page.hiddenCards.map((c) => c.assessmentId), [w.free]);
  assert.equal(page.hiddenCards[0].entitlement, "free");
  assert.equal(page.hiddenCards[0].productName, "무료 리포트");

  assert.deepEqual(await setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.free, hidden: false }), { kind: "restored" });
  page = await getMyPage(w.mem.repo, USER);
  assert.deepEqual(page.cards.map((c) => c.assessmentId).sort(), [w.free, w.bought].sort());
  assert.deepEqual(page.hiddenCards, []);
});

test("숨겨도 결과 · 리포트 · 주문 · 결제 · 질문권 · 채팅 · 맛보기 · 동의 · 구매 권한은 한 글자도 바뀌지 않는다", async () => {
  const w = await world();
  const before = await snapshot(w);

  await setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.bought, hidden: true });
  await setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.free, hidden: true });
  assert.equal(await snapshot(w), before, "숨기기는 다른 기록을 건드리지 않는다");

  // 숨긴 뒤에도: 공용 목록은 그대로(채팅 · 질문권 문맥을 잃지 않는다), 구매 여부 · 열람 · 맛보기 · 채팅은 그대로
  assert.deepEqual((await w.mem.repo.listAssessments(USER)).map((a) => a.id).sort(), [w.free, w.bought].sort());
  const page = await getMyPage(w.mem.repo, USER);
  assert.deepEqual(page.cards, []);
  const hiddenBought = page.hiddenCards.find((c) => c.assessmentId === w.bought);
  assert.equal(hiddenBought?.entitlement, "purchased");
  assert.equal(hiddenBought?.generation, "ready");
  assert.equal(hiddenBought?.paidOrderNumber, w.boughtOrderNumber);
  assert.equal(hiddenBought?.productName, "심층 리포트");
  assert.equal(page.orders.length, 1, "결제내역은 그대로");
  const view = await getResultView(w.mem.repo, { userId: USER, assessmentId: w.bought });
  assert.equal(view?.report?.status, "ready", "구매한 리포트는 숨겨도 열린다");
  assert.ok(await getResultView(w.mem.repo, { userId: USER, assessmentId: w.free }), "무료 결과도 숨겨도 열린다");
  assert.equal((await w.mem.repo.getTalkRoom(w.free, "love"))?.actions.length, 1, "채팅은 그대로");
  const taste = await w.mem.repo.reserveTasteReport({ userId: USER, assessmentId: w.free });
  assert.equal(taste.state, "ready", "맛보기는 다시 발급되지 않는다");
  // 이미 산 결과를 다시 결제하게 하지 않는다 (구매 권한 그대로)
  const again = await startCheckout({ repo: w.mem.repo, now: () => TODAY }, { userId: USER, assessmentId: w.bought });
  assert.notEqual(again.kind, "order", "구매한 결과는 숨겨도 중복 결제로 이어지지 않는다");

  await setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.bought, hidden: false });
  await setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.free, hidden: false });
  assert.equal(await snapshot(w), before, "되돌린 뒤에도 같다");
});

test("본인 것만: 남의 번호 · 없는 번호 · 형식이 틀린 번호는 아무것도 바꾸지 않고 서로 구분되지 않는다", async () => {
  const w = await world();
  const before = await snapshot(w);
  const notFound = { kind: "not-found" };
  assert.deepEqual(await setReportHidden(w.mem.repo, { userId: OTHER, assessmentId: w.free, hidden: true }), notFound, "다른 회원이 내 번호로");
  assert.deepEqual(await setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.stranger, hidden: true }), notFound, "내가 남의 번호로");
  assert.deepEqual(await setReportHidden(w.mem.repo, { userId: USER, assessmentId: "00000000-0000-4000-8000-0000000fffff", hidden: true }), notFound, "없는 번호");
  assert.deepEqual(await setReportHidden(w.mem.repo, { userId: USER, assessmentId: "not-a-uuid", hidden: true }), notFound, "형식이 틀린 번호");
  assert.deepEqual(await setReportHidden(w.mem.repo, { userId: USER, assessmentId: "", hidden: true }), notFound, "빈 번호");
  assert.equal(await snapshot(w), before);
  assert.deepEqual(await w.mem.repo.listHiddenAssessmentIds(USER), []);
  assert.deepEqual(await w.mem.repo.listHiddenAssessmentIds(OTHER), []);
  // 남의 화면에는 내 숨김이 나타나지 않는다
  await setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.free, hidden: true });
  const other = await getMyPage(w.mem.repo, OTHER);
  assert.deepEqual(other.hiddenCards, []);
  assert.deepEqual(other.cards.map((c) => c.assessmentId), [w.stranger]);
});

test("같은 요청을 여러 번 · 동시에 보내도 한 번만 바뀌고 결과가 같다", async () => {
  const w = await world();
  const hides = await Promise.all(Array.from({ length: 6 }, () => setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.free, hidden: true })));
  assert.equal(hides.filter((r) => r.kind === "hidden").length, 1, JSON.stringify(hides));
  assert.equal(hides.filter((r) => r.kind === "unchanged").length, 5);
  assert.deepEqual(await w.mem.repo.listHiddenAssessmentIds(USER), [w.free]);

  const restores = await Promise.all(Array.from({ length: 6 }, () => setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.free, hidden: false })));
  assert.equal(restores.filter((r) => r.kind === "restored").length, 1, JSON.stringify(restores));
  assert.equal(restores.filter((r) => r.kind === "unchanged").length, 5);
  assert.deepEqual(await w.mem.repo.listHiddenAssessmentIds(USER), []);

  // 숨기고 숨긴 채로 다시 숨기기 · 보이는 것을 복원하기도 오류 없이 "그대로"
  assert.deepEqual(await setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.bought, hidden: false }), { kind: "unchanged" });
});

test("27번 전 DB(숨김 열 없음): 숨기기 기능만 꺼지고 MY는 모든 리포트를 예전처럼 보인다", async () => {
  const w = await world();
  w.mem.myHide.ready = false;
  const page = await getMyPage(w.mem.repo, USER);
  assert.equal(page.hideAvailable, false);
  assert.deepEqual(page.cards.map((c) => c.assessmentId).sort(), [w.free, w.bought].sort());
  assert.deepEqual(page.hiddenCards, []);
  assert.deepEqual(await setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.free, hidden: true }), { kind: "db-not-ready" });
  assert.deepEqual(await setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.stranger, hidden: true }), { kind: "not-found" }, "남의 번호는 열 유무와 상관없이 구분되지 않는다");
});

test("숨김 정보를 읽다 오류가 나도 MY는 열린다 (숨긴 결과는 어디서도 지워지거나 바뀌지 않는다)", async () => {
  const w = await world();
  await setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.free, hidden: true });
  const broken = { ...w.mem.repo, listHiddenAssessmentIds: async () => { throw new Error("일시 오류"); } };
  const page = await getMyPage(broken, USER);
  assert.equal(page.hideAvailable, false);
  assert.equal(page.cards.length, 2);
  assert.deepEqual(await w.mem.repo.listHiddenAssessmentIds(USER), [w.free], "저장된 숨김은 그대로");
});

test("숨기기는 회원 탈퇴 표시가 아니다 — 프로필 · 검사 결과의 탈퇴 상태를 만들지 않는다", async () => {
  const w = await world();
  await setReportHidden(w.mem.repo, { userId: USER, assessmentId: w.free, hidden: true });
  const a = w.mem.assessments.get(w.free)!;
  assert.equal(a.nickname, "무료", "내용이 비워지지 않는다");
  assert.equal(a.contentVersion !== "withdrawn", true);
  assert.deepEqual(w.mem.myHidden.has(w.free), true);
  const consents = await w.mem.repo.listConsents(USER);
  assert.equal(consents.length, 1, "동의 기록 그대로");
});
