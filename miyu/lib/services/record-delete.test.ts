// MY 리포트 "기록 삭제"(회원이 직접 확정) — 비용 0 · 메모리 저장소 · 가상 데이터.
// 확인하는 것: 리포트 본문 · 맛보기 글 · 고민이 실제로 지워짐 / 주문 · 결제 · 환불 증빙 · 질문권 · 채팅 질문 횟수 · 동의 · 궁합 리포트는 그대로 /
// 대화는 읽기용 기록으로 남음(저장된 요약 0개 조건 포함) / 같은 요청 여러 번 · 남의 번호 / 동시 대화(stale) · 진행 중(busy) / 삭제 뒤 모든 열람 · 생성 · 구매 경로 차단 /
// 맛보기 무료 한 번이 다시 생기지 않음 / 새 분석은 가능 / 28번 전 DB에서는 기능만 꺼짐.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { createQuestionNonce, questionProductId, questionQuote } from "../commerce/cash.ts";
import { createOrderNumber } from "../commerce/order.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "../profile/basic-info.ts";
import { createAiReportGenerator } from "../report/ai/generator.ts";
import { createMockModel } from "../report/ai/mock-model.ts";
import type { ChatAnswerer } from "../report/chat/answer.ts";
import type { ChatContext } from "../report/chat/types.ts";
import { isCompatReport } from "../report/compat/types.ts";
import { devReportGenerator } from "../report/generate-dev-report.ts";
import type { TranscriptLine } from "../report/reading/talk-transcript.ts";
import { manseryeokEngine as sajuEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "./assessment-service.ts";
import { getCompatReportView, startCompatCheckout } from "./compat-service.ts";
import { askFreeQuestion, type AskDeps } from "./chat-service.ts";
import { deleteContext, getContextView, saveContext } from "./context-service.ts";
import { getConcernWorkspace } from "./concern-service.ts";
import { createInviteLink, getInviteView } from "./invite-service.ts";
import { deleteNoticeOf, deleteReportRecord, getMyPage, traceOrder, type RenderRoom } from "./my-service.ts";
import { confirmPayment, startCheckout } from "./order-service.ts";
import type { PaymentGateway } from "./ports.ts";
import { claimReport, ensureReport, getResultView, listMyItems, queueReport } from "./report-service.ts";
import { saveRoomSummary } from "./summary-service.ts";
import { loadTalkRoom, loadTranscripts, listSavedRoomKeys, resetTalkRoom, roomEpochOf, saveTalkRoom } from "./talk-service.ts";
import { requestTasteReport } from "./taste-service.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const T0 = new Date("2026-10-19T00:00:00Z");
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const INFO: BasicInfo = { ...EMPTY_BASIC_INFO, nickname: "지민", birthYear: "1995", birthMonth: "4", birthDay: "12", birthTime: "09:30", gender: "female", knownMbti: "INFJ" };
const answersAll = (v: number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, v])));
const PARTNER = { nickname: "남수", gender: "male", calendar: "solar", isLeapMonth: false, birthYear: "1994", birthMonth: "11", birthDay: "2", birthTime: "09:30", birthTimeUnknown: false };

const gateway: PaymentGateway & { confirms: number } = {
  provider: "tosspayments",
  confirms: 0,
  async confirm({ paymentKey, orderId, amount }) {
    gateway.confirms++;
    return { ok: true, payment: { paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: "2026-10-19T10:00:00+09:00", mId: "fake" } };
  },
  async getPayment() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
  async getPaymentByOrderId() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
};

/** 읽기용 줄 만들기 흉내 — 방 이름 + 행동 개수가 줄에 드러나 "다시 읽은 뒤의 대화"인지 가려낼 수 있다 */
const renderer =
  (calls: string[] = []): RenderRoom =>
  async ({ roomKey, actions }) => {
    calls.push(roomKey);
    return [
      { from: "miyu", text: `${roomKey} 방 미유 말 (행동 ${actions.length}개)` },
      { from: "me", text: `${roomKey} 방 내 말` },
    ];
  };

async function world() {
  const clock = { now: T0 };
  const mem = createMemoryRepository(() => clock.now);
  const save = async (nickname: string, userId = USER) => {
    const saved = await submitAssessment({ repo: mem.repo, saju: sajuEngine }, { userId, channel: "web", info: { ...INFO, nickname }, answers: answersAll(4), today: T0 });
    assert.ok(saved.ok);
    return saved.ok ? saved.assessment : (null as never);
  };
  const target = await save("삭제대상");
  const other = await save("남의결과", OTHER);

  // 구매한 개인 리포트(완성) + 만족도 · 고민 입력 · 고민 기록
  const started = await startCheckout({ repo: mem.repo, now: () => clock.now }, { userId: USER, assessmentId: target.id });
  if (started.kind !== "order") throw new Error(started.kind);
  const paid = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_del", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error(paid.kind);
  const report = await ensureReport({ repo: mem.repo, generator: devReportGenerator, now: () => clock.now }, paid.order);
  assert.equal(report?.status, "ready");
  await mem.repo.upsertFeedback({ reportId: report!.id, userId: USER, rating: 5 });
  await mem.repo.upsertContext({ assessmentId: target.id, userId: USER, topic: "work", question: "삭제시험 고민", situation: "", matched: "", differed: "", excerpt: "", agreedAt: T0.toISOString() });
  const concern = await mem.repo.insertConcernRecord({ assessmentId: target.id, userId: USER, topic: "work", question: "삭제시험 고민 기록", situation: "", matched: "", differed: "", excerpt: "", writtenAt: T0.toISOString(), agreedAt: T0.toISOString() });
  assert.ok(concern.ok);

  // 질문 묶음(결제 완료 — 질문권 3개) · 대화방 2개 · 채팅 질문 횟수(오래전) · 맛보기(완성) · 동의
  const pack = await mem.repo.insertOrder({ orderNumber: createOrderNumber(T0), userId: USER, assessmentId: target.id, productId: questionProductId(createQuestionNonce("love")), amount: questionQuote().priceKrw, paymentEnv: "test" });
  assert.ok(pack.ok);
  if (!pack.ok) throw new Error("pack");
  const packPaid = await confirmPayment({ repo: mem.repo, gateway }, { userId: USER, orderNumber: pack.value.orderNumber, paymentKey: "pk_pack", amount: pack.value.amount });
  assert.equal(packPaid.kind, "paid");
  await mem.repo.upsertTalkRoom({ assessmentId: target.id, userId: USER, roomKey: "love", actions: [{ t: "topic", id: "love" }] });
  await mem.repo.upsertTalkRoom({ assessmentId: target.id, userId: USER, roomKey: "main", actions: [{ t: "topic", id: "tendency" }] });
  await mem.repo.addChatQuestion({ userId: USER, assessmentId: target.id, roomKey: "love" });
  for (const q of mem.chatQuestions) q.createdAt = new Date(T0.getTime() - 3600_000).toISOString();
  assert.deepEqual(await mem.repo.reserveTasteReport({ userId: USER, assessmentId: target.id }), { state: "reserved" });
  await mem.repo.saveTasteReport({ userId: USER, assessmentId: target.id, content: { marker: "맛보기 글" }, generator: "test", generatorVersion: "0" });
  await mem.repo.addConsents(USER, [{ type: "terms", version: "t1", agreed: true }]);
  clock.now = new Date(T0.getTime() + 120_000);
  return { mem, clock, target, other, reportId: report!.id, orderNumber: started.order.orderNumber };
}
type World = Awaited<ReturnType<typeof world>>;

/** 삭제와 무관해야 하는 모든 기록의 모습 */
async function kept(w: World) {
  const { mem } = w;
  return JSON.stringify({
    orders: [...mem.orders.values()],
    events: mem.events,
    chat: mem.chatQuestions,
    consents: [...mem.consents.entries()],
    wallets: [...mem.wallets.entries()],
    ledger: mem.ledger,
    packs: [...mem.packs.entries()],
    profiles: [...mem.profiles.entries()],
    assessment: { ...mem.assessments.get(w.target.id), recordDeletedAt: null },
  });
}

test("삭제: 리포트 본문 · 맛보기 글 · 고민은 지워지고, 증빙 · 질문권 · 채팅 질문 횟수 · 동의 · 분석 원자료는 그대로이며, 저장된 요약이 0개여도 대화를 읽을 수 있다", async () => {
  const w = await world();
  assert.equal(await w.mem.repo.countVisibleChatSummaries(USER), 0, "실제 조건: 저장된 채팅 요약은 없다");
  const before = await kept(w);
  const balance = await w.mem.repo.getCashBalance(USER);
  assert.ok(balance > 0);
  const calls: string[] = [];

  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer(calls) }), { kind: "deleted" });
  assert.deepEqual(calls.sort(), ["love", "main"], "방마다 한 번 옮겼다");

  // 지워졌다
  assert.equal([...w.mem.reports.values()].filter((r) => r.assessmentId === w.target.id).length, 0, "리포트 줄이 없다");
  assert.equal(w.mem.feedback.size, 0, "만족도 의견도 함께");
  assert.equal(w.mem.contexts.has(w.target.id), false);
  assert.equal([...w.mem.concernRecords.values()].filter((c) => c.assessmentId === w.target.id).length, 0);
  assert.equal(w.mem.talkRooms.size, 0, "행동 목록 줄은 읽기용 기록으로 옮긴 뒤 정리");
  const taste = await w.mem.repo.getTasteReport(USER);
  assert.equal(taste?.status, "ready", "맛보기 줄은 남는다(무료 한 번)");
  assert.deepEqual(taste?.content, { deleted: true });
  assert.equal(JSON.stringify(taste).includes("맛보기 글"), false);
  assert.equal(w.mem.assessments.get(w.target.id)?.recordDeletedAt != null, true);

  // 남는다
  assert.equal(await kept(w), before);
  assert.equal(await w.mem.repo.getCashBalance(USER), balance, "남은 질문권은 그대로");
  assert.equal(await w.mem.repo.countVisibleChatSummaries(USER), 0, "요약을 만들어 대신하지 않는다");

  // 대화를 읽는다 — 목록(방 이름)도, 방 안의 줄도
  const transcripts = await loadTranscripts(w.mem.repo, { userId: USER, assessmentId: w.target.id });
  assert.deepEqual(transcripts.map((t) => t.roomKey), ["love", "main"]);
  assert.deepEqual(transcripts[0].lines satisfies TranscriptLine[], [{ from: "miyu", text: "love 방 미유 말 (행동 1개)" }, { from: "me", text: "love 방 내 말" }]);
  assert.deepEqual((await listSavedRoomKeys(w.mem.repo, { userId: USER, assessmentId: w.target.id })).sort(), ["love", "main"]);

  // 화면 자료
  const page = await getMyPage(w.mem.repo, USER, w.clock.now);
  assert.equal(page.cards.length, 0);
  assert.equal(page.deleteAvailable, true);
  assert.deepEqual(page.deletedRecords.map((d) => [d.assessmentId, d.chatRooms]), [[w.target.id, 2]]);
  assert.equal(page.orders.length, 2, "주문 · 결제내역 2건(개인 리포트 · 질문 묶음)이 그대로");
  assert.equal((await listMyItems(w.mem.repo, USER)).length, 0);
  const view = await getResultView(w.mem.repo, { userId: USER, assessmentId: w.target.id });
  assert.equal(view?.deleted, true);
  assert.equal(view?.report, null);
  assert.equal(view?.paidOrder, null);
  assert.deepEqual(view?.received, []);
  assert.deepEqual(view?.taste, { kind: "unavailable" });
  const trace = await traceOrder(w.mem.repo, w.mem.repo, { userId: USER, orderNumber: w.orderNumber, now: w.clock.now });
  assert.equal(trace?.recordDeleted, true, "주문 추적은 삭제한 기록임을 알린다");
  assert.equal(trace?.generation, "none");
  assert.equal(trace?.entitled, true, "결제 기록은 그대로");
});

test("같은 요청을 여러 번(동시에도) 보내도 한 번만 지워지고, 남의 번호 · 없는 번호는 아무것도 바꾸지 않는다", async () => {
  const w = await world();
  const before = await kept(w);
  const burst = await Promise.all(Array.from({ length: 6 }, () => deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() })));
  assert.equal(burst.filter((r) => r.kind === "deleted").length, 1, JSON.stringify(burst));
  assert.equal(burst.filter((r) => r.kind === "unchanged").length, 5);
  assert.equal(w.mem.transcripts.size, 2, "읽기용 기록이 겹쳐 쌓이지 않는다");
  const stamp = w.mem.assessments.get(w.target.id)?.recordDeletedAt;
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "unchanged" });
  assert.equal(w.mem.assessments.get(w.target.id)?.recordDeletedAt, stamp);
  assert.equal(await kept(w), before);

  // 남의 번호 · 없는 번호 · 형식이 틀린 번호
  const w2 = await world();
  assert.deepEqual(await deleteReportRecord(w2.mem.repo, { userId: OTHER, assessmentId: w2.target.id }, { renderRoom: renderer() }), { kind: "not-found" });
  assert.deepEqual(await deleteReportRecord(w2.mem.repo, { userId: USER, assessmentId: w2.other.id }, { renderRoom: renderer() }), { kind: "not-found" });
  assert.deepEqual(await deleteReportRecord(w2.mem.repo, { userId: USER, assessmentId: "00000000-0000-4000-8000-000000000000" }, { renderRoom: renderer() }), { kind: "not-found" });
  assert.equal(w2.mem.assessments.get(w2.target.id)?.recordDeletedAt ?? null, null);
  assert.equal(w2.mem.assessments.get(w2.other.id)?.recordDeletedAt ?? null, null);
  assert.equal(w2.mem.talkRooms.size, 2);
});

test("읽은 뒤 대화방이 바뀌면(동시 대화) 다시 읽어 옮긴 뒤 지운다 — 오간 말이 읽기용 기록에서 빠지지 않고, 렌더 실패면 아무것도 지우지 않는다", async () => {
  const w = await world();
  let first = true;
  const racing: RenderRoom = async ({ roomKey, actions }) => {
    if (first && roomKey === "love") {
      first = false;
      // 앱이 읽은 뒤, 다른 탭에서 대화가 이어졌다
      w.clock.now = new Date(w.clock.now.getTime() + 1000);
      await w.mem.repo.upsertTalkRoom({ assessmentId: w.target.id, userId: USER, roomKey: "love", actions: [{ t: "topic", id: "love" }, { t: "free", q: "새 질문", a: ["새 답"] }] });
    }
    return [{ from: "miyu", text: `${roomKey} 행동 ${actions.length}개` }];
  };
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: racing }), { kind: "deleted" });
  const love = w.mem.transcripts.get(`${w.target.id}|love`);
  assert.equal(love?.lines[0].text, "love 행동 2개", "마지막 대화까지 옮겨졌다");

  // 렌더 실패 → 삭제하지 않는다
  const w2 = await world();
  const before = await kept(w2);
  assert.deepEqual(await deleteReportRecord(w2.mem.repo, { userId: USER, assessmentId: w2.target.id }, { renderRoom: async () => { throw new Error("그릴 수 없음"); } }), { kind: "transcript-failed" });
  assert.equal(w2.mem.assessments.get(w2.target.id)?.recordDeletedAt ?? null, null);
  assert.equal(w2.mem.talkRooms.size, 2);
  assert.equal([...w2.mem.reports.values()].filter((r) => r.assessmentId === w2.target.id).length, 1);
  assert.equal(await kept(w2), before);

  // 끝없이 바뀌면(세 번 모두 stale) 지우지 않고 busy
  const w3 = await world();
  let n = 0;
  const forever: RenderRoom = async ({ roomKey }) => {
    w3.clock.now = new Date(w3.clock.now.getTime() + 1000);
    await w3.mem.repo.upsertTalkRoom({ assessmentId: w3.target.id, userId: USER, roomKey, actions: [{ t: "topic", id: "love" }, ...Array.from({ length: ++n }, () => ({ t: "topic" as const, id: "tendency" }))] });
    return [];
  };
  assert.deepEqual(await deleteReportRecord(w3.mem.repo, { userId: USER, assessmentId: w3.target.id }, { renderRoom: forever }), { kind: "busy" });
  assert.equal(w3.mem.assessments.get(w3.target.id)?.recordDeletedAt ?? null, null);
  assert.equal(w3.mem.transcripts.size, 0, "읽기용 기록도 만들지 않았다");
});

test("진행 중인 생성 · 결제 대기 · 궁합 결제(리포트 줄 없음) · 맛보기 작성 · 답을 기다리는 질문 · 방금 쓴 질문권이 있으면 지우지 않는다(busy)", async () => {
  const noCall = renderer();
  const cases: [string, (w: World) => Promise<void> | void][] = [
    ["생성 중인 궁합 리포트", async (w) => {
      const o = await w.mem.repo.insertOrder({ orderNumber: createOrderNumber(T0), userId: USER, assessmentId: w.target.id, productId: "saju-compat:abc", amount: 4900, paymentEnv: "test" });
      if (!o.ok) throw new Error("order");
      await confirmPayment({ repo: w.mem.repo, gateway }, { userId: USER, orderNumber: o.value.orderNumber, paymentKey: "pk_c", amount: 4900 });
      const r = await w.mem.repo.insertReport({ userId: USER, orderId: o.value.id, assessmentId: w.target.id, status: "generating", attempts: 1 });
      assert.ok(r.ok);
    }],
    ["결제 대기 주문", async (w) => void (await w.mem.repo.insertOrder({ orderNumber: createOrderNumber(T0), userId: USER, assessmentId: w.target.id, productId: "personal-integrated-report:r2:x", amount: 9900, paymentEnv: "test" }))],
    ["궁합 결제 완료 · 리포트 줄 없음", async (w) => {
      const o = await w.mem.repo.insertOrder({ orderNumber: createOrderNumber(T0), userId: USER, assessmentId: w.target.id, productId: "report-compat:abc", amount: 9900, paymentEnv: "test" });
      if (!o.ok) throw new Error("order");
      await confirmPayment({ repo: w.mem.repo, gateway }, { userId: USER, orderNumber: o.value.orderNumber, paymentKey: "pk_rc", amount: 9900 });
    }],
    ["답을 기다리는 질문", async (w) => void w.mem.chatReservations.push({ id: 1, userId: USER, assessmentId: w.target.id, roomKey: "love", until: w.clock.now.getTime() + 60_000 })],
    ["방금 오간 질문", (w) => void w.mem.chatQuestions.push({ userId: USER, assessmentId: w.target.id, roomKey: "love", createdAt: w.clock.now.toISOString() })],
    ["방금 쓴 질문권", async (w) => void (await w.mem.repo.spendCash({ userId: USER, amount: 1, ref: "spend-now" }))],
  ];
  for (const [label, setup] of cases) {
    const w = await world();
    await setup(w);
    const before = await kept(w);
    assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: noCall }), { kind: "busy" }, label);
    assert.equal(w.mem.assessments.get(w.target.id)?.recordDeletedAt ?? null, null, `${label}: 그대로`);
    assert.equal(w.mem.talkRooms.size, 2, `${label}: 대화방도 그대로`);
    assert.equal(JSON.stringify([...w.mem.orders.values()]).includes("deleted"), false);
    void before;
  }
});

test("삭제 뒤: 열람 · 생성 · 구매 경로가 모두 막히고, 기존 결제 주문은 다시 만들기도 다시 구매 유도도 하지 않는다", async () => {
  const w = await world();
  const paid = [...w.mem.orders.values()].find((o) => o.productId === "personal-integrated-report")!;
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "deleted" });
  const reportsBefore = w.mem.reports.size;

  // 생성: 결제된 주문이 있어도 리포트 줄을 새로 만들지 않는다
  assert.equal(await queueReport({ repo: w.mem.repo }, paid), null);
  const claimed = await claimReport({ repo: w.mem.repo, generator: devReportGenerator, now: () => w.clock.now }, paid, { retryFailed: true });
  assert.equal(claimed.report, null);
  assert.equal(await ensureReport({ repo: w.mem.repo, generator: devReportGenerator, now: () => w.clock.now }, paid), null);
  assert.equal(w.mem.reports.size, reportsBefore);
  // 저장소 마지막 방어선도 같다
  assert.deepEqual(await w.mem.repo.insertReport({ userId: USER, orderId: paid.id, assessmentId: w.target.id, status: "queued", attempts: 0 }), { ok: false, reason: "conflict" });

  // 구매: 새 주문을 만들지 않고 결제 승인 요청도 하지 않는다
  assert.deepEqual(await startCheckout({ repo: w.mem.repo, now: () => w.clock.now }, { userId: USER, assessmentId: w.target.id }), { kind: "record-deleted" });
  assert.deepEqual(await startCheckout({ repo: w.mem.repo, now: () => w.clock.now }, { userId: USER, assessmentId: w.target.id, again: true } as never), { kind: "record-deleted" });
  // 저장소 마지막 방어선: 삭제한 기록에는 개인 · 궁합 · 고민 주문 줄도 새로 만들 수 없다
  for (const productId of ["personal-integrated-report:r2:late", "saju-compat:late", "concern-report:late"]) {
    await assert.rejects(w.mem.repo.insertOrder({ orderNumber: createOrderNumber(T0), userId: USER, assessmentId: w.target.id, productId, amount: 9900, paymentEnv: "test" }), /record_deleted/, productId);
  }
  // 질문 결제는 채팅이 이어지므로 허용
  const cash = await w.mem.repo.insertOrder({ orderNumber: createOrderNumber(T0), userId: USER, assessmentId: w.target.id, productId: questionProductId(createQuestionNonce("love")), amount: questionQuote().priceKrw, paymentEnv: "test" });
  assert.ok(cash.ok);

  // 맛보기: 삭제한 기록에서 새로 받을 수 없고, 새 분석에서도 무료 한 번이 다시 생기지 않는다
  const writer = { provider: "test", model: "m", promptVersion: "p", totalTimeoutMs: 1000, write: async () => { throw new Error("호출되면 안 된다"); } };
  const deps = { repo: w.mem.repo, writer, loadInput: async () => ({ ok: false as const, reason: "not-found" as const }) };
  const onDeleted = await requestTasteReport(deps as never, { userId: USER, assessmentId: w.target.id });
  assert.equal(onDeleted.ok ? "" : onDeleted.reason, "deleted");
  const fresh = await submitAssessment({ repo: w.mem.repo, saju: sajuEngine }, { userId: USER, channel: "web", info: { ...INFO, nickname: "새분석" }, answers: answersAll(3), today: w.clock.now });
  assert.ok(fresh.ok);
  const onFresh = await requestTasteReport(deps as never, { userId: USER, assessmentId: fresh.ok ? fresh.assessment.id : "" });
  assert.equal(onFresh.ok ? "" : onFresh.reason, "used-elsewhere");
  await assert.rejects(w.mem.repo.saveTasteReport({ userId: USER, assessmentId: w.target.id, content: { marker: "늦게 온 응답" }, generator: "late", generatorVersion: "0" }), /record_deleted|taste_not_reserved/);
  assert.deepEqual((await w.mem.repo.getTasteReport(USER))?.content, { deleted: true });

  // 고민 · 초대 · 읽기 화면은 삭제한 기록을 찾지 못한다
  assert.equal(await getContextView(w.mem.repo, { userId: USER, assessmentId: w.target.id }), null);
  assert.equal(await getConcernWorkspace(w.mem.repo, { userId: USER, assessmentId: w.target.id, now: () => w.clock.now } as never), null);
  assert.deepEqual(await getInviteView(w.mem.repo, { userId: USER, assessmentId: w.target.id }), { kind: "locked" });
  assert.deepEqual(await createInviteLink(w.mem.repo, { userId: USER, assessmentId: w.target.id }), { ok: false, reason: "not-found" });
  const ctx = await saveContext(w.mem.repo, { userId: USER, assessmentId: w.target.id, raw: { topic: "work", question: "다시 적기", situation: "", matched: "", differed: "", excerpt: "" }, agreed: true, now: () => w.clock.now });
  assert.deepEqual(ctx, { kind: "not-found" });
  assert.equal(await deleteContext(w.mem.repo, { userId: USER, assessmentId: w.target.id }), false);
  assert.equal(w.mem.contexts.has(w.target.id), false, "고민을 다시 적을 수 없다");

  // 새 분석은 그대로 가능하고 새 결과로는 구매도 된다
  const started = await startCheckout({ repo: w.mem.repo, now: () => w.clock.now }, { userId: USER, assessmentId: fresh.ok ? fresh.assessment.id : "" });
  assert.equal(started.kind, "order");
});

test("삭제 전에 만든 결제 대기 주문은 삭제 뒤 승인하지 않는다 (결제사에 승인 요청을 보내지 않는다)", async () => {
  const w = await world();
  const pending = await w.mem.repo.insertOrder({ orderNumber: createOrderNumber(T0), userId: USER, assessmentId: w.target.id, productId: "personal-integrated-report:r2:p", amount: 9900, paymentEnv: "test" });
  assert.ok(pending.ok);
  if (!pending.ok) return;
  // 1시간이 지난 대기 주문은 삭제를 막지 않는다
  w.clock.now = new Date(T0.getTime() + 2 * 3600_000);
  pending.value.createdAt = T0.toISOString();
  w.mem.orders.set(pending.value.id, { ...pending.value, createdAt: T0.toISOString() });
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "deleted" });
  const confirmsBefore = gateway.confirms;
  const result = await confirmPayment({ repo: w.mem.repo, gateway }, { userId: USER, orderNumber: pending.value.orderNumber, paymentKey: "pk_late", amount: 9900 });
  assert.equal(result.kind, "rejected");
  assert.equal(gateway.confirms, confirmsBefore, "결제사 승인 요청을 보내지 않았다");
  assert.equal(w.mem.orders.get(pending.value.id)?.status, "canceled");
  assert.equal([...w.mem.reports.values()].some((r) => r.orderId === pending.value.id), false, "리포트가 생기지 않았다");
});

test("삭제한 기록에서도 채팅은 계속된다: 새 대화는 저장되고, 삭제 전에 열어 둔 화면(옛 표지)의 저장은 거절된다", async () => {
  const w = await world();
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "deleted" });
  const transcripts = await loadTranscripts(w.mem.repo, { userId: USER, assessmentId: w.target.id });
  const loveEpoch = roomEpochOf(true, transcripts, "love");
  assert.ok(loveEpoch && loveEpoch !== "none");
  // 삭제 전에 열려 있던 화면: 표지가 없다 → 거절
  assert.deepEqual(await saveTalkRoom(w.mem.repo, { userId: USER, assessmentId: w.target.id, roomKey: "love", actions: [{ t: "topic", id: "love" }, { t: "topic", id: "tendency" }] }), { ok: false, reason: "stale" });
  assert.deepEqual(await saveTalkRoom(w.mem.repo, { userId: USER, assessmentId: w.target.id, roomKey: "love", actions: [{ t: "topic", id: "love" }], epoch: "none" }), { ok: false, reason: "stale" });
  assert.equal(w.mem.talkRooms.size, 0, "되돌려 쓰지 못했다");
  // 삭제 뒤 새로 연 화면: 표지를 돌려보내면 새 대화가 저장된다
  assert.deepEqual(await saveTalkRoom(w.mem.repo, { userId: USER, assessmentId: w.target.id, roomKey: "love", actions: [{ t: "topic", id: "love" }], epoch: loveEpoch }), { ok: true });
  assert.deepEqual(await loadTalkRoom(w.mem.repo, { userId: USER, assessmentId: w.target.id, roomKey: "love" }), [{ t: "topic", id: "love" }]);
  // 읽기용 기록이 없던 방은 "none"
  const careerEpoch = roomEpochOf(true, transcripts, "career");
  assert.equal(careerEpoch, "none");
  assert.deepEqual(await saveTalkRoom(w.mem.repo, { userId: USER, assessmentId: w.target.id, roomKey: "career", actions: [{ t: "topic", id: "work-money" }], epoch: careerEpoch }), { ok: true });
  // 남의 계정은 어느 쪽도 읽거나 쓸 수 없다
  assert.deepEqual(await loadTranscripts(w.mem.repo, { userId: OTHER, assessmentId: w.target.id }), []);
  assert.deepEqual(await saveTalkRoom(w.mem.repo, { userId: OTHER, assessmentId: w.target.id, roomKey: "love", actions: [{ t: "topic", id: "love" }], epoch: loveEpoch }), { ok: false, reason: "not-found" });
  // 삭제하지 않은 기록은 표지를 쓰지 않는다
  assert.equal(roomEpochOf(false, transcripts, "love"), null);
});

test("독립 상품인 사주 궁합은 삭제와 무관하다: 완성된 리포트는 계속 열리고, 삭제한 기록으로는 새 궁합을 시작하지 못한다", async () => {
  const w = await world();
  const generator = createAiReportGenerator({ model: createMockModel(), now: () => w.clock.now, sleep: async () => {} });
  const started = await startCompatCheckout({ repo: w.mem.repo, now: () => w.clock.now, saleOpen: true, generatorReady: true }, { userId: USER, assessmentId: w.target.id, partner: PARTNER, relationship: "lover", myGender: "female" });
  if (started.kind !== "order") throw new Error(`궁합 주문: ${started.kind}`);
  const paid = await confirmPayment({ repo: w.mem.repo, gateway }, { userId: USER, orderNumber: started.order.orderNumber, paymentKey: "pk_compat", amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error("결제");
  // 결제는 끝났고 리포트 줄이 아직 없으면 지우지 않는다(삭제 뒤에는 줄을 만들 수 없으므로)
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "busy" });
  const compat = await ensureReport({ repo: w.mem.repo, generator, now: () => w.clock.now }, paid.order);
  assert.equal(compat?.status, "ready");
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "deleted" });
  const view = await getCompatReportView(w.mem.repo, { userId: USER, orderNumber: paid.order.orderNumber });
  assert.equal(view.kind, "ready", "삭제 뒤에도 궁합 리포트는 그대로 열린다");
  assert.ok(compat?.content && isCompatReport(compat.content));
  assert.ok([...w.mem.reports.values()].some((r) => r.id === compat!.id), "궁합 리포트 줄이 남았다");
  assert.deepEqual(await startCompatCheckout({ repo: w.mem.repo, now: () => w.clock.now, saleOpen: true, generatorReady: true }, { userId: USER, assessmentId: w.target.id, partner: PARTNER, relationship: "lover", myGender: "female" }), { kind: "not-found" });
});

test("28번 전 DB(삭제 열 없음)에서는 삭제 기능만 꺼지고 MY · 결과는 예전처럼 동작한다", async () => {
  const w = await world();
  w.mem.myDelete.ready = false;
  const page = await getMyPage(w.mem.repo, USER, w.clock.now);
  assert.equal(page.deleteAvailable, false);
  assert.equal(page.cards.length, 1);
  assert.deepEqual(page.deletedRecords, []);
  const view = await getResultView(w.mem.repo, { userId: USER, assessmentId: w.target.id });
  assert.equal(view?.deleted, false);
  assert.equal(view?.report?.status, "ready");
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "db-not-ready" });
  assert.equal(w.mem.talkRooms.size, 2);
  assert.equal([...w.mem.reports.values()].filter((r) => r.assessmentId === w.target.id).length, 1);
});

test("삭제 결과 안내는 주소의 알려진 값만 보인다", () => {
  for (const k of ["deleted", "unchanged", "busy", "transcript-failed", "not-found", "db-not-ready"]) assert.ok(deleteNoticeOf(k), k);
  assert.equal(deleteNoticeOf("<script>"), null);
  assert.equal(deleteNoticeOf(undefined), null);
  assert.equal(deleteNoticeOf(["deleted"]), null);
  assert.equal(deleteNoticeOf("toString"), null);
  assert.equal(deleteNoticeOf("__proto__"), null);
});

test("삭제한 기록에서도 직접 적는 질문이 된다: 무료 질문이 먼저 쓰이고 결제해 둔 질문권(잔액)은 줄지 않으며, 질문 횟수만 한 줄 늘고 남의 계정은 막힌다", async () => {
  const w = await world();
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "deleted" });
  const balance = await w.mem.repo.getCashBalance(USER);
  const context: ChatContext = { room: { label: "연애", mode: "연애박사 미유", focus: "연애 · 관계" }, intake: null, topic: { title: "가까운 관계", headline: "확인이 되면 마음이 편해져요", summary: ["확인이 있으면 편해져요."], detail: [] }, overview: { headline: "확인을 중요하게 여겨요", tendency: null, strength: null, caution: null, flow: null }, followUp: false, taste: false };
  const asked: string[] = [];
  const answerer: ChatAnswerer = {
    provider: "test",
    model: "scripted",
    async answer(ask) {
      asked.push(ask.question);
      return { paragraphs: ["천천히 해 보면 좋겠어요."] };
    },
  };
  let n = 0;
  const deps: AskDeps = {
    repo: w.mem.repo,
    answerer,
    now: () => w.clock.now,
    config: { extraQuestions: 0 },
    newRef: () => `q-del-${++n}`,
    loadAsk: async () => ({ context, referenceDate: "2026-10-19", tier: "free", room: "love", roomKey: "love" }),
  };
  const before = w.mem.chatQuestions.length;
  const r = await askFreeQuestion(deps, { userId: USER, assessmentId: w.target.id, roomKey: "love", question: "삭제한 뒤에도 이어 묻는 질문" });
  assert.ok(r.ok && r.kind === "answer", JSON.stringify(r));
  assert.deepEqual(asked, ["삭제한 뒤에도 이어 묻는 질문"]);
  assert.equal(w.mem.chatQuestions.length, before + 1, "질문 횟수 한 줄");
  assert.equal(await w.mem.repo.getCashBalance(USER), balance, "무료 질문이 먼저라 결제해 둔 질문권은 줄지 않는다");
  // 남의 계정은 이 기록의 방에서 물을 수 없다
  assert.equal((await askFreeQuestion(deps, { userId: OTHER, assessmentId: w.target.id, roomKey: "love", question: "남의 질문" })).ok, false);
  assert.equal(asked.length, 1);
});

// ───────────────────────────── 삭제 범위 확대(DB 29번) ─────────────────────────────
// 29번 적용 후 DB는 메모리 저장소의 myDelete.purge = true로 흉내 낸다(기본 false라 위의 28번 시험은 그대로 예전 범위로 돈다).
// 확인하는 것: 연결된 대화방 · 저장한 요약 · 읽기용 기록이 함께 지워짐 / 질문권 · 주문 · 결제 · 환불 증빙 · 질문 횟수 · 다른 분석은 그대로 / 같은 요청 여러 번 · 남의 번호 /
// 삭제 뒤 대화 · 질문 · 요약 · 옛 화면의 늦은 저장 차단 / 분석 원자료는 쌍이 쓰는 동안만 남김 / 진행 중이면 지우지 않음 / 예전 범위로 삭제한 기록은 소급 정리하지 않음 / 29번 전 DB로 되돌아가는 경로.
const purgeWorld = async () => {
  const w = await world();
  w.mem.myDelete.purge = true;
  // 삭제 전에 쌓인 대화 흔적: 저장한 요약 · 예전 범위로 만든 읽기용 기록(실제로는 28번 범위로 삭제한 다른 기록에서만 생기지만, 같은 결과의 것도 지워지는지 본다)
  await w.mem.repo.insertChatSummary({ userId: USER, assessmentId: w.target.id, room: "love", visible: true, items: { read: ["연애 풀이"], qa: [{ q: "삭제될 질문", a: "삭제될 답" }] } });
  w.mem.transcripts.set(`${w.target.id}|work`, { assessmentId: w.target.id, roomKey: "work", userId: USER, lines: [{ from: "miyu", text: "삭제될 읽기용 말" }], createdAt: w.clock.now.toISOString() });
  // 다른 분석 결과(같은 회원) — 삭제와 무관해야 한다
  const sibling = await submitAssessment({ repo: w.mem.repo, saju: sajuEngine }, { userId: USER, channel: "web", info: { ...INFO, nickname: "다른분석" }, answers: answersAll(3), today: T0 });
  assert.ok(sibling.ok);
  const siblingId = sibling.ok ? sibling.assessment.id : "";
  await w.mem.repo.upsertTalkRoom({ assessmentId: siblingId, userId: USER, roomKey: "love", actions: [{ t: "topic", id: "love" }] });
  await w.mem.repo.insertChatSummary({ userId: USER, assessmentId: siblingId, room: "love", visible: true, items: { read: [], qa: [{ q: "남는 질문", a: "남는 답" }] } });
  return { ...w, siblingId };
};

test("삭제 범위 확대: 리포트 · 맛보기 · 고민에 더해 채팅방 · 저장한 요약 · 읽기용 기록도 지워지고, 질문권 · 주문 · 결제 · 질문 횟수 · 동의 · 다른 분석은 그대로다", async () => {
  const w = await purgeWorld();
  assert.equal(await w.mem.repo.purgeAvailable(), true);
  assert.equal(await w.mem.repo.countVisibleChatSummaries(USER), 2);
  const before = await kept(w);
  const balance = await w.mem.repo.getCashBalance(USER);
  assert.ok(balance > 0);
  const calls: string[] = [];

  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer(calls) }), { kind: "deleted-all" });
  assert.deepEqual(calls, [], "읽기용 기록으로 옮기는 단계가 없다 — 대화를 렌더하지 않는다");

  // 지워졌다 — 이 결과의 대화 내용 셋(방 · 요약 · 읽기용 기록)과 리포트 · 맛보기 · 고민
  assert.equal([...w.mem.talkRooms.values()].filter((r) => r.assessmentId === w.target.id).length, 0, "대화방");
  assert.equal(w.mem.chatSummaries.filter((s) => s.assessmentId === w.target.id).length, 0, "저장한 요약");
  assert.equal([...w.mem.transcripts.values()].filter((t) => t.assessmentId === w.target.id).length, 0, "읽기용 기록");
  assert.equal([...w.mem.reports.values()].filter((r) => r.assessmentId === w.target.id).length, 0);
  assert.equal(w.mem.feedback.size, 0);
  assert.equal(w.mem.contexts.has(w.target.id), false);
  assert.equal([...w.mem.concernRecords.values()].filter((c) => c.assessmentId === w.target.id).length, 0);
  const taste = await w.mem.repo.getTasteReport(USER);
  assert.deepEqual(taste?.content, { deleted: true }, "맛보기는 글만 비우고 줄은 남는다(무료 한 번)");
  assert.equal(JSON.stringify([...w.mem.talkRooms.values(), ...w.mem.chatSummaries, ...w.mem.transcripts.values()]).includes("삭제될"), false, "지운 대화 내용이 어느 곳에도 남지 않았다");

  // 분석 원자료는 쌍이 쓰지 않으므로 비워졌고, 삭제 표시 둘이 찍혔다
  const a = w.mem.assessments.get(w.target.id)!;
  assert.equal(a.nickname, "삭제");
  assert.deepEqual([a.birthYear, a.birthMonth, a.birthDay, a.answers, a.summary, a.saju, a.knownMbti, a.birthTime], [1900, 1, 1, {}, {}, {}, null, null]);
  assert.ok(a.recordDeletedAt && a.recordPurgedAt && a.recordDeletedAt === a.recordPurgedAt);

  // 남는다 — 주문 · 결제 · 환불 증빙 · 질문권 · 질문 횟수 · 동의 · 프로필(분석 원자료 열만 제외하고 비교)
  const keptNow = JSON.parse(await kept(w));
  const keptBefore = JSON.parse(before);
  delete keptNow.assessment;
  delete keptBefore.assessment;
  assert.deepEqual(keptNow, keptBefore);
  assert.equal(await w.mem.repo.getCashBalance(USER), balance, "남은 질문권은 그대로");
  assert.equal(w.mem.chatQuestions.length, 1, "질문 횟수 줄은 남는다(내용 없음)");
  assert.deepEqual(Object.keys(w.mem.chatQuestions[0]).sort(), ["assessmentId", "createdAt", "roomKey", "userId"].sort(), "질문 횟수 줄에는 대화 내용 열이 없다");
  // 다른 분석 결과의 대화 · 요약은 그대로
  assert.equal([...w.mem.talkRooms.values()].filter((r) => r.assessmentId === w.siblingId).length, 1);
  assert.equal(w.mem.chatSummaries.filter((s) => s.assessmentId === w.siblingId).length, 1);
  assert.equal(w.mem.assessments.get(w.siblingId)?.nickname, "다른분석");

  // 화면 자료 — 삭제한 기록 목록에는 열 것이 없으므로 나오지 않고, 결제내역은 그대로
  const page = await getMyPage(w.mem.repo, USER, w.clock.now);
  assert.deepEqual(page.cards.map((c) => c.assessmentId), [w.siblingId]);
  assert.deepEqual(page.deletedRecords, []);
  assert.equal(page.orders.length, 2);
  const view = await getResultView(w.mem.repo, { userId: USER, assessmentId: w.target.id });
  assert.equal(view?.deleted, true);
  assert.equal(view?.purged, true);
  assert.equal(view?.report, null);
  const trace = await traceOrder(w.mem.repo, w.mem.repo, { userId: USER, orderNumber: w.orderNumber, now: w.clock.now });
  assert.equal(trace?.recordDeleted, true);
  assert.equal(trace?.entitled, true, "결제 기록은 그대로");
});

test("삭제 범위 확대: 같은 요청을 여러 번(동시에도) 보내도 한 번만 처리되고 남의 번호 · 없는 번호는 아무것도 바꾸지 않는다", async () => {
  const w = await purgeWorld();
  const burst = await Promise.all(Array.from({ length: 6 }, () => deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() })));
  assert.equal(burst.filter((r) => r.kind === "deleted-all").length, 1, JSON.stringify(burst));
  assert.equal(burst.filter((r) => r.kind === "unchanged").length, 5);
  const stamp = w.mem.assessments.get(w.target.id)?.recordPurgedAt;
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "unchanged" });
  assert.equal(w.mem.assessments.get(w.target.id)?.recordPurgedAt, stamp);

  const w2 = await purgeWorld();
  const talkBefore = w2.mem.talkRooms.size;
  assert.deepEqual(await deleteReportRecord(w2.mem.repo, { userId: OTHER, assessmentId: w2.target.id }, { renderRoom: renderer() }), { kind: "not-found" });
  assert.deepEqual(await deleteReportRecord(w2.mem.repo, { userId: USER, assessmentId: w2.other.id }, { renderRoom: renderer() }), { kind: "not-found" });
  assert.deepEqual(await deleteReportRecord(w2.mem.repo, { userId: USER, assessmentId: "00000000-0000-4000-8000-000000000000" }, { renderRoom: renderer() }), { kind: "not-found" });
  assert.equal(w2.mem.talkRooms.size, talkBefore);
  assert.equal(w2.mem.assessments.get(w2.target.id)?.recordPurgedAt ?? null, null);
  assert.equal(w2.mem.assessments.get(w2.other.id)?.recordPurgedAt ?? null, null);
  assert.equal(w2.mem.assessments.get(w2.other.id)?.nickname, "남의결과", "남의 분석 원자료는 그대로");
});

test("삭제 범위 확대 뒤: 옛 화면의 늦은 저장 · 질문 · 요약 · 직접 호출이 모두 막혀 지운 대화가 되살아나지 않는다", async () => {
  const w = await purgeWorld();
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "deleted-all" });

  // 서비스: 모든 대화 읽기 · 쓰기가 없는 기록으로 취급
  assert.deepEqual(await loadTalkRoom(w.mem.repo, { userId: USER, assessmentId: w.target.id, roomKey: "love" }), []);
  assert.deepEqual(await listSavedRoomKeys(w.mem.repo, { userId: USER, assessmentId: w.target.id }), []);
  assert.deepEqual(await loadTranscripts(w.mem.repo, { userId: USER, assessmentId: w.target.id }), []);
  // 삭제 직전에 열려 있던 화면이 늦게 저장하려는 경우(표지가 맞든 틀리든)
  for (const epoch of [undefined, null, "none"]) {
    assert.deepEqual(await saveTalkRoom(w.mem.repo, { userId: USER, assessmentId: w.target.id, roomKey: "love", actions: [{ t: "topic", id: "love" }], epoch }), { ok: false, reason: "not-found" }, `epoch=${String(epoch)}`);
  }
  assert.deepEqual(await resetTalkRoom(w.mem.repo, { userId: USER, assessmentId: w.target.id, roomKey: "love" }), { ok: false, reason: "not-found" });
  const saved = await saveRoomSummary(w.mem.repo, { userId: USER, assessmentId: w.target.id, roomKey: "love", room: "love", actions: [{ t: "topic", id: "love" }], model: {} as never });
  assert.deepEqual(saved, { ok: false, reason: "not-found" });
  // 질문은 소유 확인에서 막히고 AI를 부르지 않는다
  let called = 0;
  const answerer: ChatAnswerer = { provider: "test", model: "scripted", async answer() { called++; return { paragraphs: ["부르면 안 된다"] }; } };
  const context: ChatContext = { room: { label: "연애", mode: "연애박사 미유", focus: "연애 · 관계" }, intake: null, topic: { title: "가까운 관계", headline: "x", summary: ["x"], detail: [] }, overview: { headline: "x", tendency: null, strength: null, caution: null, flow: null }, followUp: false, taste: false };
  const deps: AskDeps = { repo: w.mem.repo, answerer, now: () => w.clock.now, config: { extraQuestions: 0 }, newRef: () => "q-late", loadAsk: async () => ({ context, referenceDate: "2026-10-19", tier: "free", room: "love", roomKey: "love" }) };
  const late = await askFreeQuestion(deps, { userId: USER, assessmentId: w.target.id, roomKey: "love", question: "늦게 도착한 질문" });
  assert.equal(late.ok, false);
  assert.equal(called, 0);

  // 저장소 마지막 방어선(DB 트리거와 같다): 서비스를 우회한 직접 쓰기도 거절
  await assert.rejects(w.mem.repo.upsertTalkRoom({ assessmentId: w.target.id, userId: USER, roomKey: "love", actions: [{ t: "topic", id: "love" }] }), /record_purged/);
  await assert.rejects(w.mem.repo.insertChatSummary({ userId: USER, assessmentId: w.target.id, room: "love", visible: true, items: { read: [], qa: [] } }), /record_purged/);
  await assert.rejects(w.mem.repo.addChatQuestion({ userId: USER, assessmentId: w.target.id, roomKey: "love" }), /record_purged/);
  await assert.rejects(w.mem.repo.reserveChatQuestion({ userId: USER, assessmentId: w.target.id, roomKey: "love", max: 2 }), /record_purged/);
  assert.equal([...w.mem.talkRooms.values()].filter((r) => r.assessmentId === w.target.id).length, 0);
  assert.equal(w.mem.chatSummaries.filter((s) => s.assessmentId === w.target.id).length, 0);
  assert.equal(w.mem.chatQuestions.length, 1, "질문 횟수가 늘지 않았다");

  // 리포트 · 구매 경로도 28번과 같이 막힌다
  assert.deepEqual(await startCheckout({ repo: w.mem.repo, now: () => w.clock.now }, { userId: USER, assessmentId: w.target.id }), { kind: "record-deleted" });
  assert.equal(await queueReport({ repo: w.mem.repo }, [...w.mem.orders.values()].find((o) => o.productId === "personal-integrated-report")!), null);
});

test("삭제 범위 확대 뒤: 남은 질문권은 다른 분석 결과의 채팅방에서 그대로 쓰인다(무료 질문이 먼저, 잔액은 줄지 않는다)", async () => {
  const w = await purgeWorld();
  const balance = await w.mem.repo.getCashBalance(USER);
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "deleted-all" });
  assert.equal(await w.mem.repo.getCashBalance(USER), balance, "삭제로 잔액이 바뀌지 않는다");
  const context: ChatContext = { room: { label: "연애", mode: "연애박사 미유", focus: "연애 · 관계" }, intake: null, topic: { title: "가까운 관계", headline: "x", summary: ["x"], detail: [] }, overview: { headline: "x", tendency: null, strength: null, caution: null, flow: null }, followUp: false, taste: false };
  const asked: string[] = [];
  const answerer: ChatAnswerer = { provider: "test", model: "scripted", async answer(ask) { asked.push(ask.question); return { paragraphs: ["천천히 해 보면 좋겠어요."] }; } };
  let n = 0;
  const deps: AskDeps = { repo: w.mem.repo, answerer, now: () => w.clock.now, config: { extraQuestions: 0 }, newRef: () => `q-sib-${++n}`, loadAsk: async () => ({ context, referenceDate: "2026-10-19", tier: "free", room: "love", roomKey: "love" }) };
  const r = await askFreeQuestion(deps, { userId: USER, assessmentId: w.siblingId, roomKey: "love", question: "다른 분석에서 이어 묻는 질문" });
  assert.ok(r.ok && r.kind === "answer", JSON.stringify(r));
  assert.deepEqual(asked, ["다른 분석에서 이어 묻는 질문"]);
  assert.equal(await w.mem.repo.getCashBalance(USER), balance, "무료 질문이 먼저라 결제해 둔 질문권은 줄지 않는다");
  // 다른 분석 결과의 대화는 저장도 된다
  assert.deepEqual(await saveTalkRoom(w.mem.repo, { userId: USER, assessmentId: w.siblingId, roomKey: "love", actions: [{ t: "topic", id: "love" }] }), { ok: true });
});

test("삭제 범위 확대: 리포트 궁합 쌍이 이 결과를 쓰는 동안은 분석 원자료를 남기고 대화 · 리포트는 지운다", async () => {
  const w = await purgeWorld();
  w.mem.myDelete.pairRefs.add(w.target.id);
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "deleted-all" });
  const a = w.mem.assessments.get(w.target.id)!;
  assert.equal(a.nickname, "삭제대상", "쌍이 쓰는 분석 원자료는 그대로");
  assert.ok(a.recordPurgedAt, "삭제 표시는 찍힌다");
  assert.equal([...w.mem.talkRooms.values()].filter((r) => r.assessmentId === w.target.id).length, 0);
  assert.equal([...w.mem.reports.values()].filter((r) => r.assessmentId === w.target.id).length, 0);
});

test("삭제 범위 확대: 진행 중인 생성 · 결제 대기 · 방금 쓴 질문권이 있으면 지우지 않고(busy) 아무것도 바뀌지 않는다", async () => {
  const w = await purgeWorld();
  const pending = await w.mem.repo.insertOrder({ orderNumber: createOrderNumber(T0), userId: USER, assessmentId: w.target.id, productId: "personal-integrated-report:r2:p", amount: 9900, paymentEnv: "test" });
  assert.ok(pending.ok);
  const before = JSON.stringify({ rooms: [...w.mem.talkRooms.values()], summaries: w.mem.chatSummaries, reports: [...w.mem.reports.values()], a: w.mem.assessments.get(w.target.id) });
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "busy" });
  assert.equal(JSON.stringify({ rooms: [...w.mem.talkRooms.values()], summaries: w.mem.chatSummaries, reports: [...w.mem.reports.values()], a: w.mem.assessments.get(w.target.id) }), before, "busy는 아무것도 지우지 않는다");
});

test("예전 범위(28번)로 삭제한 기록은 29번 뒤에도 소급해서 정리하지 않는다: 읽기용 대화 기록과 채팅방이 그대로 남고 삭제한 기록 목록에 계속 나온다", async () => {
  const w = await world();
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "deleted" });
  assert.equal(w.mem.transcripts.size, 2);
  w.mem.myDelete.purge = true; // 나중에 29번이 적용됐다
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "unchanged" });
  assert.equal(w.mem.transcripts.size, 2, "읽기용 기록은 그대로");
  assert.equal(w.mem.assessments.get(w.target.id)?.nickname, "삭제대상", "분석 원자료도 그대로");
  assert.equal(w.mem.assessments.get(w.target.id)?.recordPurgedAt ?? null, null);
  const page = await getMyPage(w.mem.repo, USER, w.clock.now);
  assert.deepEqual(page.deletedRecords.map((d) => d.assessmentId), [w.target.id]);
  assert.equal((await getResultView(w.mem.repo, { userId: USER, assessmentId: w.target.id }))?.purged, false);
  // 예전 범위로 삭제한 기록의 채팅은 이어진다(28번 동작 그대로)
  assert.equal((await loadTranscripts(w.mem.repo, { userId: USER, assessmentId: w.target.id })).length, 2);
});

test("29번이 없는 DB(또는 확인 뒤 함수가 사라진 경우)에서는 예전 범위(28번) 삭제로 이어 가고, 그 밖의 오류는 아무것도 지우지 않은 채 그대로 알린다", async () => {
  const w = await world(); // purge=false → purgeAvailable false
  assert.equal(await w.mem.repo.purgeAvailable(), false);
  assert.deepEqual(await deleteReportRecord(w.mem.repo, { userId: USER, assessmentId: w.target.id }, { renderRoom: renderer() }), { kind: "deleted" });

  // 확인(purgeAvailable)은 통과했는데 호출 때 함수가 없다고 나오는 경우 → 예전 범위로
  const w2 = await world();
  const vanishing = { ...w2.mem.repo, purgeAvailable: async () => true, purgeAssessmentRecord: async () => { throw Object.assign(new Error("없음"), { code: "PURGE_UNAVAILABLE" }); } };
  assert.deepEqual(await deleteReportRecord(vanishing, { userId: USER, assessmentId: w2.target.id }, { renderRoom: renderer() }), { kind: "deleted" });
  assert.equal(w2.mem.transcripts.size, 2, "예전 범위: 읽기용 기록으로 남는다");

  // 그 밖의 오류는 예전 범위로 넘어가지 않고 던진다 — 아무것도 지워지지 않았다
  const w3 = await world();
  const broken = { ...w3.mem.repo, purgeAvailable: async () => true, purgeAssessmentRecord: async () => { throw new Error("연결 끊김"); } };
  await assert.rejects(deleteReportRecord(broken, { userId: USER, assessmentId: w3.target.id }, { renderRoom: renderer() }), /연결 끊김/);
  assert.equal(w3.mem.assessments.get(w3.target.id)?.recordDeletedAt ?? null, null);
  assert.equal(w3.mem.transcripts.size, 0);
  assert.equal(w3.mem.talkRooms.size, 2);

  // 확인 자체가 실패하면 예전 범위(검증된 쪽)로
  const w4 = await world();
  const unknown = { ...w4.mem.repo, purgeAvailable: async () => { throw new Error("확인 실패"); } };
  assert.deepEqual(await deleteReportRecord(unknown, { userId: USER, assessmentId: w4.target.id }, { renderRoom: renderer() }), { kind: "deleted" });
});

test("삭제 결과 안내: 새 범위 안내는 지워지는 대화를 사실대로 밝히고 알려진 값만 보인다", () => {
  const n = deleteNoticeOf("deleted-all");
  assert.equal(n?.tone, "ok");
  assert.match(n?.text ?? "", /채팅방/);
  assert.match(n?.text ?? "", /지난 대화/);
  assert.match(n?.text ?? "", /질문권/);
  assert.match(n?.text ?? "", /결제 기록/);
  // 예전 범위 문구는 채팅방이 남는다고 말한다(바꾸지 않았다)
  assert.match(deleteNoticeOf("deleted")?.text ?? "", /채팅방 · 남은 질문권/);
});
