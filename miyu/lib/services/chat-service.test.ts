// 실행: npm test — 자유 질문 처리: 소유자 · 입력 · 힘든 글 · 방마다 무료 질문 수 · 유료 질문(질문 3개 묶음 결제) · 예산 · 연결 안 됨 · 사용 기록 · 이어지는 질문의 앞선 대화
import assert from "node:assert/strict";
import test from "node:test";
import { createQuestionNonce, questionProductId, questionQuote } from "../commerce/cash.ts";
import { MIYU_CASH, QUESTION_PACK_UNITS } from "../config/product.ts";
import { ChatAnswerError, type ChatAnswerer } from "../report/chat/answer.ts";
import { CARE_NOTE, CRISIS_REPLY } from "../report/chat/question.ts";
import type { ChatAsk, ChatContext } from "../report/chat/types.ts";
import { SAMPLE_CHART } from "../samples/sample-report.ts";
import { sampleReadingReport } from "../samples/sample-reading-report.ts";
import { buildTalkModel, QUESTION_MAX } from "../report/reading/talk.ts";
import type { RoomAction } from "../report/reading/talk-room.ts";
import { ASK_MESSAGES, askFreeQuestion, askFreeQuestionUnqueued, recentExchanges, type AskDeps } from "./chat-service.ts";
import { NO_LIMITS } from "./capacity-service.ts";
import type { AssessmentRecord, MiyuRepository } from "./ports.ts";
import { closeRoom } from "./summary-service.ts";
import { saveTalkRoom } from "./talk-service.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const CONTEXT: ChatContext = { room: { label: "연애", mode: "연애박사 미유", focus: "연애 · 관계" }, intake: null, topic: { title: "가까운 관계", headline: "확인이 되면 마음이 편해져요", summary: ["확인이 있으면 편해져요."], detail: [] }, overview: { headline: "확인을 중요하게 여겨요", tendency: null, strength: null, caution: null, flow: null }, followUp: false, taste: false };

type Opts = { answer?: () => Promise<string[]>; extra?: number; tier?: "paid" | "free"; room?: string; roomKey?: string; loaded?: boolean; budget?: number; noMaterial?: boolean };

async function setup(opts: Opts = {}) {
  const mem = createMemoryRepository(() => new Date("2026-10-15T03:00:00Z"));
  const base = { channel: "web", nickname: "서윤", calendar: "solar", isLeapMonth: false, birthYear: 1994, birthMonth: 11, birthDay: 7, birthTime: "08:40", knownMbti: null, answers: {}, contentVersion: "t", source: "sample", summary: {}, saju: { status: "not-connected" } } as unknown as Omit<AssessmentRecord, "id" | "createdAt" | "userId">;
  const mine = await mem.repo.insertAssessment({ ...base, userId: "u1" });
  const other = await mem.repo.insertAssessment({ ...base, userId: "u2" });
  const asks: ChatAsk[] = [];
  const answerer: ChatAnswerer = {
    provider: "test",
    model: "scripted",
    async answer(ask, ctx) {
      asks.push(ask);
      ctx?.onUsage?.({ provider: "test", model: "scripted", promptVersion: "chat-v1-prompt-0.1", inputTokens: 1000, outputTokens: 300, latencyMs: 5, outcome: "ok", errorCode: null });
      return { paragraphs: await (opts.answer ?? (async () => ["천천히 해 보면 좋겠어요."]))() };
    },
  };
  const room = opts.room ?? "love";
  let n = 0;
  const deps = (over: Partial<AskDeps> = {}): AskDeps => ({
    repo: mem.repo,
    answerer,
    now: () => new Date("2026-10-15T03:00:00Z"),
    config: { extraQuestions: opts.extra ?? 0 },
    capacity: opts.budget ? { ...NO_LIMITS, dailyBudgetKrw: opts.budget, priceInputKrwPerMTok: 1000, priceOutputKrwPerMTok: 1000 } : undefined,
    newRef: () => `q-test-ref-${++n}`,
    loadAsk: async () => (opts.loaded === false ? null : { context: CONTEXT, referenceDate: "2026-10-15", tier: opts.tier ?? "paid", room, roomKey: opts.roomKey ?? room, ...(opts.noMaterial ? { noMaterial: true } : {}) }),
    ...over,
  });
  /** 유료 질문을 결제한다 — 실제와 같은 길(질문 결제 주문 → 결제 완료)로 장부에 넣는다. 한 번 결제하면 질문 3개(9단위) 묶음이 들어오므로 packs번 결제하면 묶음이 packs개 쌓인다 */
  const buy = async (userId: string, assessmentId: string, packs = 1, payRoom = "love") => {
    for (let i = 0; i < packs; i++) {
      const ordered = await mem.repo.insertOrder({ orderNumber: `MEU-TEST-${Math.random().toString(36).slice(2, 12).toUpperCase()}`, userId, assessmentId, productId: questionProductId(createQuestionNonce(payRoom)), amount: questionQuote().priceKrw, paymentEnv: "test" });
      assert.ok(ordered.ok);
      await mem.repo.updateOrder(ordered.value.id, ["pending"], { status: "paid", paymentKey: `pk-${ordered.value.id}`, approvedAt: "2026-10-15T03:00:00Z" });
    }
  };
  return { mem, repo: mem.repo as MiyuRepository, mine: mine.id, other: other.id, asks, deps, buy };
}
const input = (assessmentId: string, question: unknown = "요즘 연락이 뜸한 사람이 있어요", userId = "u1", roomKey = "love") => ({ userId, assessmentId, roomKey, question });
const ok = (r: Awaited<ReturnType<typeof askFreeQuestion>>) => r.ok && r.kind === "answer";

test("정상 질문(심층 리포트): 답이 돌아오고, 횟수 한 줄과 AI 사용 기록이 남으며, 질문 내용은 어떤 기록에도 없다", async () => {
  const { mem, mine, deps, asks } = await setup();
  const r = await askFreeQuestion(deps(), input(mine));
  assert.deepEqual(r, { ok: true, kind: "answer", question: "요즘 연락이 뜸한 사람이 있어요", paragraphs: ["천천히 해 보면 좋겠어요."], remaining: 2 });
  assert.equal(asks[0].question, "요즘 연락이 뜸한 사람이 있어요");
  assert.equal(asks[0].referenceDate, "2026-10-15");
  assert.equal(mem.chatQuestions.length, 1);
  assert.deepEqual(Object.keys(mem.chatQuestions[0]).sort(), ["assessmentId", "createdAt", "roomKey", "userId"]);
  assert.equal(mem.aiUsage.length, 1);
  assert.equal(mem.aiUsage[0].reportId, null);
  assert.ok(!JSON.stringify([mem.aiUsage, mem.chatQuestions, mem.opsEvents]).includes("연락이 뜸한"));
});

test("남의 검사 결과 · 잘못된 방 이름은 거절하고 AI를 부르지 않는다", async () => {
  const { other, mine, deps, asks, mem } = await setup();
  assert.deepEqual(await askFreeQuestion(deps(), input(other)), { ok: false, reason: "not-found", message: ASK_MESSAGES["not-found"] });
  assert.equal((await askFreeQuestion(deps(), { ...input(mine), roomKey: "../x" })).ok, false);
  assert.equal(asks.length, 0);
  assert.equal(mem.chatQuestions.length, 0);
});

test("입력: 빈 글 · 500자 초과는 거절하고(500자까지는 받는다), 연락처는 가려서 AI에 보낸다", async () => {
  const { mine, deps, asks } = await setup();
  assert.equal((await askFreeQuestion(deps(), input(mine, "  "))).ok, false);
  const long = await askFreeQuestion(deps(), input(mine, "가".repeat(QUESTION_MAX.paid + 1)));
  assert.ok(!long.ok && long.reason === "too-long" && long.message.includes("500자"));
  assert.equal(asks.length, 0);
  await askFreeQuestion(deps(), input(mine, "이 번호 010-1234-5678 로 연락이 왔어요"));
  assert.ok(!asks[0].question.includes("1234-5678"));
});

test("스스로를 해치겠다는 분명한 표현만 AI를 부르지 않고 고정 안내를 돌려주며 횟수에도 세지 않는다 — 무료 질문을 다 썼어도 · 방이 닫혀 있어도 안내가 먼저다", async () => {
  const { mine, deps, asks, mem } = await setup({ tier: "free", room: "career" });
  const r = await askFreeQuestion(deps(), input(mine, "자살하고 싶다는 생각이 들어요"));
  assert.deepEqual(r, { ok: true, kind: "safety", paragraphs: CRISIS_REPLY });
  assert.equal(asks.length, 0);
  assert.equal(mem.chatQuestions.length, 0);
  // AI가 연결되지 않은 환경에서도 같은 안내가 나온다
  assert.equal((await askFreeQuestion(deps({ answerer: null }), input(mine, "자해를 했어요"))).ok, true);
});

test("힘든 마음의 표현(죽고 싶다 등)은 막지 않고 답하되 마음을 먼저 받아 주도록 AI에 알리고 답 뒤에 안내 한 문단을 붙이며, 일반적인 슬픔 · 연애 고민은 그대로 답한다", async () => {
  const { mine, deps, asks, mem } = await setup({ extra: 10 });
  const soft = await askFreeQuestion(deps(), input(mine, "헤어지고 나서 죽고 싶다는 생각까지 들어요"));
  assert.ok(soft.ok && soft.kind === "answer", JSON.stringify(soft));
  assert.equal(asks[0].care, true);
  assert.equal(soft.paragraphs[soft.paragraphs.length - 1], CARE_NOTE);
  assert.ok(soft.paragraphs.length <= 6, "저장 한도 안");
  assert.equal(mem.chatQuestions.length, 1, "AI가 답했으니 횟수에 센다");
  for (const q of ["너무 우울하고 외로워요", "헤어져서 힘들어요. 눈물이 자꾸 나요", "불안해서 잠이 안 와요", "남자친구가 연락이 없어서 속상해요"]) {
    const r = await askFreeQuestion(deps(), input(mine, q));
    assert.ok(r.ok && r.kind === "answer" && !r.paragraphs.includes(CARE_NOTE), q);
  }
  assert.equal(asks.length, 5);
  assert.ok(asks.slice(1).every((a) => !a.care));
});

test("AI가 연결되지 않았으면 닫혀 있다 (준비 중)", async () => {
  const { mine, deps } = await setup();
  assert.deepEqual(await askFreeQuestion(deps({ answerer: null }), input(mine)), { ok: false, reason: "closed", message: ASK_MESSAGES.closed });
});

test("무료 리포트: 연애 방 무료 질문 2번 · 고민해결소 2번 · 오늘의 운세 1번, 다 쓰면 결제해 둔 질문으로 이어 가고(없으면 need-payment) AI를 부르지 않는다", async () => {
  for (const [room, quota] of [["love", 2], ["concern", 2], ["daily", 1]] as const) {
    const { mine, deps, asks, mem } = await setup({ tier: "free", room });
    for (let i = 0; i < quota; i++) {
      const r = await askFreeQuestion(deps(), input(mine, "질문이에요", "u1", room));
      assert.ok(r.ok && r.kind === "answer" && r.remaining === quota - 1 - i, `${room} ${i + 1}번째`);
    }
    assert.deepEqual(await askFreeQuestion(deps(), input(mine, "질문이에요", "u1", room)), { ok: false, reason: "need-payment", message: ASK_MESSAGES["need-payment"] }, room);
    assert.equal(asks.length, quota, "다 쓴 뒤에는 AI를 부르지 않는다");
    assert.equal(mem.chatQuestions.length, quota);
  }
});

test("무료 리포트: 나를 알아보기는 질문이 없고(deep-only), 올해의 흐름 · 결혼 · 진로 · 재무 방은 심층 리포트로만 열린다 (room-locked) — 결제해 둔 질문이 있어도 열리지 않는다", async () => {
  const main = await setup({ tier: "free", room: "main" });
  await main.buy("u1", main.mine, 1);
  assert.deepEqual(await askFreeQuestion(main.deps(), input(main.mine, "질문", "u1", "main")), { ok: false, reason: "deep-only", message: ASK_MESSAGES["deep-only"] });
  assert.equal(main.asks.length, 0);
  for (const room of ["year", "marriage", "career", "money"]) {
    const s = await setup({ tier: "free", room });
    await s.buy("u1", s.mine, 1);
    assert.deepEqual(await askFreeQuestion(s.deps(), input(s.mine, "질문", "u1", room)), { ok: false, reason: "room-locked", message: ASK_MESSAGES["room-locked"] }, room);
    assert.equal(s.asks.length, 0);
    assert.equal(await s.repo.getCashBalance("u1"), 9, "결제해 둔 질문 3개(9단위)는 쓰이지 않았다");
  }
});

test("심층 리포트: 모든 방이 열리고 방마다 무료 질문 3번 — 한 방에서 다 써도 다른 방은 그대로다", async () => {
  const { mine, deps, asks } = await setup({ tier: "paid", room: "love" });
  for (let i = 0; i < 3; i++) assert.ok(ok(await askFreeQuestion(deps(), input(mine))));
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "need-payment", message: ASK_MESSAGES["need-payment"] });
  assert.equal(asks.length, 3);
  // 다른 방(진로)은 자기 몫 3번이 따로 있다
  const career = deps({ loadAsk: async () => ({ context: CONTEXT, referenceDate: "2026-10-15", tier: "paid", room: "career", roomKey: "career" }) });
  for (let i = 0; i < 3; i++) assert.ok(ok(await askFreeQuestion(career, input(mine, "질문", "u1", "career"))));
  assert.equal(asks.length, 6);
});

test("방 이름은 서버가 정한다: 브라우저가 다른 방 이름을 보내도 서버가 정한 방으로 세고, 다른 방 이름으로 무료 질문 수를 우회하지 못한다", async () => {
  const { mine, deps, mem } = await setup({ tier: "free", room: "love" });
  for (const fake of ["fakea", "fakeb"]) assert.ok(ok(await askFreeQuestion(deps(), input(mine, "질문", "u1", fake))));
  assert.ok(mem.chatQuestions.every((q) => q.roomKey === "love"), "서버가 정한 방(love)으로 기록");
  assert.equal((await askFreeQuestion(deps(), input(mine, "질문", "u1", "other"))).ok, false);
});

test("오늘의 운세는 날짜별 방이라 날짜마다 무료 질문 1번씩이다", async () => {
  const day1 = await setup({ tier: "free", room: "daily", roomKey: "daily:2026-10-15" });
  assert.ok(ok(await askFreeQuestion(day1.deps(), input(day1.mine, "오늘 어때요", "u1", "daily:2026-10-15"))));
  assert.equal((await askFreeQuestion(day1.deps(), input(day1.mine, "한 번 더", "u1", "daily:2026-10-15"))).ok, false);
  const next = day1.deps({ loadAsk: async () => ({ context: CONTEXT, referenceDate: "2026-10-16", tier: "free", room: "daily", roomKey: "daily:2026-10-16" }) });
  assert.ok(ok(await askFreeQuestion(next, input(day1.mine, "내일은요", "u1", "daily:2026-10-16"))));
});

test("글자 수: 무료 리포트의 무료 질문은 300자, 심층 리포트 · 결제한 질문은 500자 — 넘으면 AI를 부르지 않고 횟수도 · 결제한 질문도 쓰지 않으며, 위기 표현은 길어도 안내가 먼저다", async () => {
  assert.equal(QUESTION_MAX.free, 300);
  assert.equal(QUESTION_MAX.paid, 500);
  const free = await setup({ tier: "free", room: "love" });
  const over = await askFreeQuestion(free.deps(), input(free.mine, "가".repeat(QUESTION_MAX.free + 1)));
  assert.ok(!over.ok && over.reason === "too-long-free" && over.message.includes("300자") && !over.message.includes("500자"), JSON.stringify(over));
  assert.equal(free.asks.length, 0);
  assert.equal(free.mem.chatQuestions.length, 0);
  assert.ok(ok(await askFreeQuestion(free.deps(), input(free.mine, "가".repeat(QUESTION_MAX.free)))));
  const longCrisis = await askFreeQuestion(free.deps(), input(free.mine, `자살하고 싶어요 ${"가".repeat(QUESTION_MAX.free)}`));
  assert.deepEqual(longCrisis, { ok: true, kind: "safety", paragraphs: CRISIS_REPLY });

  const paid = await setup({ tier: "paid" });
  assert.ok(ok(await askFreeQuestion(paid.deps(), input(paid.mine, "가".repeat(QUESTION_MAX.free + 1)))), "심층 리포트는 300자를 넘어도 된다");
  assert.ok(ok(await askFreeQuestion(paid.deps(), input(paid.mine, "가".repeat(QUESTION_MAX.paid)))));
  const tooLong = await askFreeQuestion(paid.deps(), input(paid.mine, "가".repeat(QUESTION_MAX.paid + 1)));
  assert.ok(!tooLong.ok && tooLong.reason === "too-long");

  // 무료 리포트도 무료 질문을 다 쓰고 결제한 질문으로 묻는 질문은 500자까지(무료 질문의 300자보다 넉넉하다)
  const cashFree = await setup({ tier: "free", room: "daily" });
  assert.ok(ok(await askFreeQuestion(cashFree.deps(), input(cashFree.mine, "무료", "u1", "daily"))));
  await cashFree.buy("u1", cashFree.mine, 1);
  const cashTooLong = await askFreeQuestion(cashFree.deps(), input(cashFree.mine, "가".repeat(QUESTION_MAX.paid + 1), "u1", "daily"));
  assert.ok(!cashTooLong.ok && cashTooLong.reason === "too-long", "결제한 질문도 500자를 넘으면 받지 않는다");
  const cash = await setup({ tier: "free", room: "daily" });
  assert.ok(ok(await askFreeQuestion(cash.deps(), input(cash.mine, "무료", "u1", "daily"))));
  await cash.buy("u1", cash.mine, 1);
  assert.ok(ok(await askFreeQuestion(cash.deps(), input(cash.mine, "가".repeat(QUESTION_MAX.paid), "u1", "daily"))));
});

test("유료 질문: 무료 질문을 다 쓴 뒤 결제해 둔 질문이 있으면 이어서 묻고, 답을 받으면 하나(3단위)가 차감되며 횟수에 센다 — 묶음에서 쓰고 남은 질문은 이어서 쓴다", async () => {
  const { mine, deps, repo, mem, buy } = await setup({ tier: "free", room: "love" });
  for (let i = 0; i < 2; i++) assert.ok(ok(await askFreeQuestion(deps(), input(mine))));
  await buy("u1", mine, 1); // 질문 3개 묶음 = 9단위
  assert.equal(await repo.getCashBalance("u1"), QUESTION_PACK_UNITS);
  const r = await askFreeQuestion(deps(), input(mine, "이번엔 유료로 물어볼게요"));
  assert.deepEqual(r, { ok: true, kind: "answer", question: "이번엔 유료로 물어볼게요", paragraphs: ["천천히 해 보면 좋겠어요."], remaining: 0, cash: { balance: QUESTION_PACK_UNITS - MIYU_CASH.perQuestion } });
  assert.equal(await repo.getCashBalance("u1"), QUESTION_PACK_UNITS - MIYU_CASH.perQuestion, "하나를 쓰고 2개가 남는다");
  assert.equal(mem.chatQuestions.length, 3);
  const spends = mem.ledger.filter((l) => l.kind === "spend");
  assert.equal(spends.length, 1);
  assert.equal(spends[0].amount, -3);
  assert.ok(!JSON.stringify([mem.ledger, mem.chatQuestions]).includes("유료로 물어볼게요"), "질문 내용은 기록에 없다");
});

test("유료 질문: 결제해 둔 질문이 없으면 아무것도 쓰지 않고 AI도 부르지 않는다 (need-payment) — 심층 리포트의 3번을 다 쓴 방에서도 같다", async () => {
  const { mine, deps, asks, repo, buy } = await setup({ tier: "paid", room: "love" });
  for (let i = 0; i < 3; i++) assert.ok(ok(await askFreeQuestion(deps(), input(mine))));
  // 장부가 비어 있다 — 결제부터 해야 한다
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "need-payment", message: ASK_MESSAGES["need-payment"] });
  assert.equal(asks.length, 3);
  // 묶음 하나(질문 3개)를 결제하면 세 번 물을 수 있다
  await buy("u1", mine, 1);
  for (let i = 0; i < 3; i++) assert.ok(ok(await askFreeQuestion(deps(), input(mine))), `결제한 질문 ${i + 1}번째`);
  assert.equal(await repo.getCashBalance("u1"), 0);
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "need-payment", message: ASK_MESSAGES["need-payment"] });
  assert.equal(asks.length, 6);
  assert.equal(await repo.getCashBalance("u1"), 0, "결제하지 않은 질문은 아무것도 쓰지 않는다");
});

test("유료 질문: 답을 받지 못하면(호출 실패 · 검사에 걸림) 쓴 질문을 되돌리고 횟수에도 세지 않는다 — 어느 쪽도 글은 보이지 않는다", async () => {
  const { mine, deps, repo, mem, buy } = await setup({ tier: "free", room: "daily" });
  assert.ok(ok(await askFreeQuestion(deps(), input(mine, "무료", "u1", "daily"))));
  await buy("u1", mine, 1, "daily");
  const before = await repo.getCashBalance("u1");
  const hard = { provider: "t", model: "t", answer: async () => Promise.reject(new ChatAnswerError("호출 실패", "MODEL")) } as ChatAnswerer;
  assert.deepEqual(await askFreeQuestion(deps({ answerer: hard }), input(mine, "질문", "u1", "daily")), { ok: false, reason: "failed", message: ASK_MESSAGES.failed });
  assert.equal(await repo.getCashBalance("u1"), before, "호출이 실패하면 되돌린다");
  const invalid = { provider: "t", model: "t", answer: async () => Promise.reject(new ChatAnswerError("검사 실패", "INVALID", ["단정"])) } as ChatAnswerer;
  const r = await askFreeQuestion(deps({ answerer: invalid }), input(mine, "질문", "u1", "daily"));
  assert.ok(!r.ok && r.reason === "failed" && !r.message.includes("단정"));
  assert.equal(await repo.getCashBalance("u1"), before, "검사에 걸려도 되돌린다");
  assert.equal(mem.chatQuestions.length, 1, "횟수에 세지 않았다");
  assert.equal(mem.ledger.filter((l) => l.kind === "spend").length, 2);
  assert.equal(mem.ledger.filter((l) => l.kind === "spend_restore").length, 2);
  // 예상하지 못한 오류도 되돌린 뒤 그대로 올려 운영 기록에 남게 한다
  const boom = { provider: "t", model: "t", answer: async () => Promise.reject(new Error("boom")) } as ChatAnswerer;
  await assert.rejects(askFreeQuestion(deps({ answerer: boom }), input(mine, "질문", "u1", "daily")), /boom/);
  assert.equal(await repo.getCashBalance("u1"), before);
});

test("무료 질문도 답을 받지 못하면 차감하지 않는다 — 호출이 실패했든 검사에 걸렸든 다시 물을 수 있다", async () => {
  const { mine, deps, mem } = await setup({ tier: "free", room: "daily" });
  const hard = { provider: "t", model: "t", answer: async () => Promise.reject(new ChatAnswerError("호출 실패", "MODEL")) } as ChatAnswerer;
  assert.equal((await askFreeQuestion(deps({ answerer: hard }), input(mine, "질문", "u1", "daily"))).ok, false);
  const invalid = { provider: "t", model: "t", answer: async () => Promise.reject(new ChatAnswerError("검사 실패", "INVALID", ["단정"])) } as ChatAnswerer;
  assert.equal((await askFreeQuestion(deps({ answerer: invalid }), input(mine, "질문", "u1", "daily"))).ok, false);
  assert.equal(mem.chatQuestions.length, 0);
  assert.ok(ok(await askFreeQuestion(deps(), input(mine, "질문", "u1", "daily"))), "실패한 뒤에도 무료 질문이 남아 있다");
  assert.equal((await askFreeQuestion(deps(), input(mine, "질문", "u1", "daily"))).ok, false);
});

test("DB 변경이 아직 안 된 환경: 12번 전(횟수 표 없음)에는 열지 않고, 13번 전(결제한 질문 장부 표 없음)에는 무료 질문이 끝난 것으로만 안내한다", async () => {
  const { mine, deps, repo } = await setup({ tier: "free" });
  const missing = Object.assign(Object.create(repo), { countChatQuestionsInRoom: async () => Promise.reject(Object.assign(new Error("x"), { code: "42P01" })) });
  assert.deepEqual(await askFreeQuestion(deps({ repo: missing }), input(mine)), { ok: false, reason: "not-ready", message: ASK_MESSAGES["not-ready"] });
  const noCash = Object.assign(Object.create(repo), { spendCash: async () => Promise.reject(Object.assign(new Error("x"), { code: "42P01" })) });
  for (let i = 0; i < 2; i++) assert.ok(ok(await askFreeQuestion(deps({ repo: noCash }), input(mine))));
  assert.deepEqual(await askFreeQuestion(deps({ repo: noCash }), input(mine)), { ok: false, reason: "free-used", message: ASK_MESSAGES["free-used"] });
});

test("재료가 없는 방(무료 리포트의 맛보기에 내 자료로 읽은 내용이 없음)은 질문을 열지 않고 AI를 부르지 않으며 횟수도 쓰지 않는다 — 심층 리포트는 늘 열린다", async () => {
  const { mine, deps, asks, mem } = await setup({ tier: "free", noMaterial: true });
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "no-material", message: ASK_MESSAGES["no-material"] });
  assert.equal(asks.length, 0);
  assert.equal(mem.chatQuestions.length, 0);
  const paid = await setup({ tier: "paid", noMaterial: true });
  assert.ok(ok(await askFreeQuestion(paid.deps(), input(paid.mine))), "심층 리포트는 재료 여부와 상관없이 열린다");
});

test("자료가 없으면(분석 결과를 찾지 못하면) 열지 않는다", async () => {
  const { mine, deps, asks } = await setup({ loaded: false });
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "not-ready", message: ASK_MESSAGES["not-ready"] });
  assert.equal(asks.length, 0);
});

test("하루 예산에 닿으면 새 질문만 멈춘다 (결제한 질문도 쓰지 않는다)", async () => {
  const { mine, deps, mem, repo, buy } = await setup({ budget: 1, tier: "paid", room: "love" });
  await buy("u1", mine, 1);
  assert.ok(ok(await askFreeQuestion(deps(), input(mine))));
  // 첫 질문의 사용 기록(1000 · 300토큰)이 예산(1원)을 넘기게 단가가 정해져 있지 않으므로 비용을 직접 채워 넘긴 상태를 만든다
  await mem.repo.addAiUsage({ reportId: null, provider: "t", model: "t", promptVersion: "t", inputTokens: 1, outputTokens: 1, estCostKrw: 5, latencyMs: 1, outcome: "ok", errorCode: null });
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "budget", message: ASK_MESSAGES.budget });
  assert.equal(await repo.getCashBalance("u1"), QUESTION_PACK_UNITS, "예산 때문에 막힌 질문은 결제한 질문을 쓰지 않는다 (첫 질문은 무료 질문이었다)");
});

test("이어지는 질문: 이 방에 저장된 앞선 질문과 답이 최근 2개까지 함께 간다", async () => {
  const { mine, repo, deps, asks } = await setup();
  const free = (n: number): RoomAction => ({ t: "free", q: `질문${n}`, a: [`답${n}`] });
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love", actions: [{ t: "intake", option: "some" }, free(1), free(2), free(3)] });
  await askFreeQuestion(deps(), input(mine));
  assert.deepEqual(asks[0].recent, [{ q: "질문2", a: "답2" }, { q: "질문3", a: "답3" }]);
  assert.deepEqual(recentExchanges([{ t: "topic", id: "love" }]), []);
  assert.equal(recentExchanges([{ t: "free", q: "가".repeat(300), a: ["나".repeat(600)] }])[0].a.length, 400);
});

test("이전 대화의 참고: 이 방에서 이미 끝낸 대화의 질문 · 답이 memory로 함께 가고, 이번 대화에 아직 있는 질문은 중복해서 보내지 않는다", async () => {
  const { mine, repo, deps, asks } = await setup();
  const model = buildTalkModel(sampleReadingReport, { tendencyName: "확인추구형", saju: SAMPLE_CHART, today: { year: 2026, month: 10, day: 15 }, chat: { state: "ready" } });
  const free = (n: number): RoomAction => ({ t: "free", q: `예전 질문${n}`, a: [`예전 답${n}이에요.`] });
  // 저장하지 않고 끝낸 이전 대화 (참고 기록으로만 남는다)
  await closeRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love", room: "love", actions: [free(1), free(2)], model, keep: false });
  await askFreeQuestion(deps(), input(mine));
  assert.deepEqual(asks[0].memory, [{ q: "예전 질문1", a: "예전 답1이에요." }, { q: "예전 질문2", a: "예전 답2이에요." }]);
  assert.deepEqual(asks[0].recent, [], "새 대화에는 아직 앞선 질문이 없다");

  // 이번 대화에 같은 질문이 이미 있으면 memory에서 뺀다
  await saveTalkRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "love", actions: [free(2)] });
  await askFreeQuestion(deps(), input(mine));
  assert.deepEqual(asks[1].memory, [{ q: "예전 질문1", a: "예전 답1이에요." }]);
  assert.deepEqual(asks[1].recent.map((r) => r.q), ["예전 질문2"]);
});

test("이전 대화의 참고가 없으면 memory 항목 자체를 보내지 않는다 (다른 방의 이야기는 가져오지 않는다)", async () => {
  const { mine, repo, deps, asks } = await setup();
  const model = buildTalkModel(sampleReadingReport, { tendencyName: "확인추구형", saju: SAMPLE_CHART, today: { year: 2026, month: 10, day: 15 }, chat: { state: "ready" } });
  await closeRoom(repo, { userId: "u1", assessmentId: mine, roomKey: "money", room: "money", actions: [{ t: "free", q: "돈 질문", a: ["돈 답이에요."] }], model, keep: false });
  await askFreeQuestion(deps(), input(mine));
  assert.equal("memory" in asks[0], false);
});

// ───────────── 동시에 보낸 질문 · 중복 차감 (질문 3개 묶음) ─────────────
const slow = (ms = 15) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test("동시 질문: 무료 질문이 하나 남았을 때 두 개를 동시에 보내도 무료로는 한 개만 답하고, 나머지는 결제가 필요하다고 안내한다 (무료 질문 수를 넘기지 않는다)", async () => {
  const { mem, repo, mine, deps } = await setup({ answer: async () => (await slow(), ["천천히 해 보면 좋겠어요."]) });
  for (let i = 0; i < 2; i++) await repo.addChatQuestion({ userId: "u1", assessmentId: mine, roomKey: "love" }); // 방마다 3번 중 2번 씀
  const results = await Promise.all([askFreeQuestion(deps(), input(mine, "첫 번째 질문이에요")), askFreeQuestion(deps(), input(mine, "두 번째 질문이에요"))]);
  assert.equal(results.filter(ok).length, 1, JSON.stringify(results.map((r) => (r.ok ? r.kind : r.reason))));
  const other = results.find((r) => !ok(r));
  assert.ok(other && !other.ok && other.reason === "need-payment", JSON.stringify(other));
  assert.equal(mem.chatQuestions.length, 3, "무료 질문 3번을 넘겨 세지 않는다");
});

test("동시 질문: 결제해 둔 질문 3개를 5개 동시에 보내도 정확히 3개만 답하고 2개는 결제가 필요하며, 잔액은 0이 되고 차감 기록도 3건뿐이다", async () => {
  const { mem, repo, mine, deps, buy } = await setup({ answer: async () => (await slow(), ["천천히 해 보면 좋겠어요."]) });
  for (let i = 0; i < 3; i++) await repo.addChatQuestion({ userId: "u1", assessmentId: mine, roomKey: "love" }); // 무료 질문을 모두 씀
  await buy("u1", mine);
  assert.equal(await repo.getCashBalance("u1"), QUESTION_PACK_UNITS);
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => askFreeQuestion(deps(), input(mine, `동시에 보낸 질문 ${i + 1}번이에요`))));
  assert.equal(results.filter(ok).length, 3, JSON.stringify(results.map((r) => (r.ok ? r.kind : r.reason))));
  assert.equal(results.filter((r) => !r.ok && r.reason === "need-payment").length, 2);
  assert.equal(await repo.getCashBalance("u1"), 0, "잔액은 음수가 되지 않는다");
  assert.equal(mem.ledger.filter((l) => l.kind === "spend").length, 3);
  assert.equal(mem.chatQuestions.length, 6, "무료 3 + 결제한 질문 3");
});

test("실패 시 미차감: 결제해 둔 질문으로 보낸 질문이 답을 받지 못하면(호출 실패) 그 질문은 쓰이지 않고 횟수에도 세지 않으며, 같은 결제로 다시 물으면 답한다 — 동시에 보낸 다른 질문은 영향받지 않는다", async () => {
  let calls = 0;
  const { mem, repo, mine, deps, buy } = await setup({
    answer: async () => {
      await slow();
      if (++calls === 1) throw new ChatAnswerError("호출 실패", "MODEL");
      return ["천천히 해 보면 좋겠어요."];
    },
  });
  for (let i = 0; i < 3; i++) await repo.addChatQuestion({ userId: "u1", assessmentId: mine, roomKey: "love" });
  await buy("u1", mine);
  const results = await Promise.all([1, 2, 3].map((n) => askFreeQuestion(deps(), input(mine, `동시에 보낸 질문 ${n}번이에요`))));
  assert.equal(results.filter(ok).length, 2);
  assert.equal(results.filter((r) => !r.ok && r.reason === "failed").length, 1);
  assert.equal(await repo.getCashBalance("u1"), MIYU_CASH.perQuestion, "실패한 질문은 쓰이지 않아 질문 1개가 남았다");
  assert.equal(mem.chatQuestions.length, 3 + 2, "답을 받은 질문만 횟수에 센다");
  assert.equal(mem.ledger.filter((l) => l.kind === "spend_restore").length, 1);
  const retry = await askFreeQuestion(deps(), input(mine, "실패한 질문을 다시 보낼게요"));
  assert.ok(ok(retry), "추가 결제 없이 다시 물을 수 있다");
  assert.equal(await repo.getCashBalance("u1"), 0);
});

test("다른 회원의 질문은 서로 기다리지 않고, 한 질문의 실패가 같은 방의 다음 질문을 막지 않는다", async () => {
  let n = 0;
  const { mine, other, deps } = await setup({
    extra: 10,
    answer: async () => {
      if (++n === 1) throw new ChatAnswerError("호출 실패", "MODEL");
      return ["괜찮아요."];
    },
  });
  const a = await askFreeQuestion(deps(), input(mine, "첫 질문이에요"));
  assert.ok(!a.ok && a.reason === "failed");
  const b = await askFreeQuestion(deps(), input(mine, "다음 질문이에요"));
  assert.ok(ok(b));
  const c = await askFreeQuestion(deps(), input(other, "다른 사람의 질문이에요", "u2"));
  assert.ok(ok(c));
});

// ───────────── 여러 서버에서 동시에 온 요청 — 무료 질문 한도는 DB 예약(16번)이 지킨다 ─────────────
// 한 서버 안의 줄 세우기(inRoomQueue)를 거치지 않는 askFreeQuestionUnqueued로 서버가 여러 대인 상황을 흉내 낸다.

test("서버 여러 대 · 무료 질문이 하나 남았을 때 동시에 5개가 와도 정확히 한 개만 무료로 답한다 (줄 세우기 없이도 DB 예약이 막는다)", async () => {
  const { mem, repo, mine, deps } = await setup({ answer: async () => (await slow(), ["천천히 해 보면 좋겠어요."]) });
  for (let i = 0; i < 2; i++) await repo.addChatQuestion({ userId: "u1", assessmentId: mine, roomKey: "love" }); // 3번 중 2번 씀
  const results = await Promise.all([1, 2, 3, 4, 5].map((n) => askFreeQuestionUnqueued(deps(), input(mine, `${n}번째 질문이에요`))));
  assert.equal(results.filter(ok).length, 1, JSON.stringify(results.map((r) => (r.ok ? r.kind : r.reason))));
  assert.equal(results.filter((r) => !r.ok && r.reason === "need-payment").length, 4, "나머지는 결제가 필요하다고 안내한다");
  assert.equal(mem.chatQuestions.length, 3, "무료 질문 3번을 넘겨 세지 않는다");
  assert.equal(mem.chatReservations.length, 0, "답을 받은 예약은 확정돼 남지 않는다");
});

test("서버 여러 대 · 무료 질문 자리를 놓친 요청은 결제해 둔 질문이 있으면 그 질문으로 이어 답하고, 결제해 둔 질문 3개를 넘겨 쓰지 않는다", async () => {
  const { mem, repo, mine, deps, buy } = await setup({ answer: async () => (await slow(), ["천천히 해 보면 좋겠어요."]) });
  for (let i = 0; i < 2; i++) await repo.addChatQuestion({ userId: "u1", assessmentId: mine, roomKey: "love" });
  await buy("u1", mine);
  const results = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => askFreeQuestionUnqueued(deps(), input(mine, `${n}번째 질문이에요`))));
  assert.equal(results.filter(ok).length, 4, "무료 1개 + 결제해 둔 질문 3개");
  assert.equal(results.filter((r) => !r.ok && r.reason === "need-payment").length, 2);
  assert.equal(await repo.getCashBalance("u1"), 0);
  assert.equal(mem.ledger.filter((l) => l.kind === "spend").length, 3);
});

test("무료 질문 예약은 답을 받지 못하면 풀린다: 호출이 실패해도 무료 질문이 줄지 않고 같은 질문을 다시 보낼 수 있다", async () => {
  let fail = true;
  const { mem, repo, mine, deps } = await setup({
    answer: async () => {
      if (fail) throw new ChatAnswerError("호출 실패", "MODEL");
      return ["천천히 해 보면 좋겠어요."];
    },
  });
  for (let i = 0; i < 2; i++) await repo.addChatQuestion({ userId: "u1", assessmentId: mine, roomKey: "love" });
  const first = await askFreeQuestionUnqueued(deps(), input(mine));
  assert.equal(first.ok === false && first.reason, "failed");
  assert.equal(mem.chatReservations.length, 0, "실패한 예약은 풀렸다");
  assert.equal(mem.chatQuestions.length, 2);
  fail = false;
  assert.ok(ok(await askFreeQuestionUnqueued(deps(), input(mine))), "마지막 무료 질문이 그대로 남아 있었다");
  assert.equal(mem.chatQuestions.length, 3);
});

test("오래된 예약은 세지 않는다: 답을 기다리다 서버가 죽어 예약이 남았어도 10분이 지나면 무료 질문이 다시 열린다 (영원히 잠기지 않는다)", async () => {
  let t = new Date("2026-10-15T03:00:00Z").getTime();
  const mem = createMemoryRepository(() => new Date(t));
  const base = { channel: "web", nickname: "서윤", calendar: "solar", isLeapMonth: false, birthYear: 1994, birthMonth: 11, birthDay: 7, birthTime: "08:40", knownMbti: null, answers: {}, contentVersion: "t", source: "sample", summary: {}, saju: { status: "not-connected" } } as unknown as Omit<AssessmentRecord, "id" | "createdAt" | "userId">;
  const a = await mem.repo.insertAssessment({ ...base, userId: "u1" });
  const r1 = await mem.repo.reserveChatQuestion({ userId: "u1", assessmentId: a.id, roomKey: "love", max: 1 });
  assert.ok(r1 && r1.id !== null);
  assert.equal(await mem.repo.reserveChatQuestion({ userId: "u1", assessmentId: a.id, roomKey: "love", max: 1 }), null, "예약이 살아 있는 동안은 자리가 없다");
  assert.equal(await mem.repo.countChatQuestionsInRoom("u1", "love"), 1, "예약도 자리를 차지한 것으로 센다");
  t += 11 * 60_000;
  assert.equal(await mem.repo.countChatQuestionsInRoom("u1", "love"), 0, "10분이 지난 예약은 세지 않는다");
  assert.ok(await mem.repo.reserveChatQuestion({ userId: "u1", assessmentId: a.id, roomKey: "love", max: 1 }));
});

test("무료 질문 예약은 회원 · 방마다 따로다: 다른 방 · 다른 회원의 예약이 내 무료 질문을 막지 않는다", async () => {
  const mem = createMemoryRepository(() => new Date("2026-10-15T03:00:00Z"));
  const { repo } = mem;
  const base = { channel: "web", nickname: "서윤", calendar: "solar", isLeapMonth: false, birthYear: 1994, birthMonth: 11, birthDay: 7, birthTime: "08:40", knownMbti: null, answers: {}, contentVersion: "t", source: "sample", summary: {}, saju: { status: "not-connected" } } as unknown as Omit<AssessmentRecord, "id" | "createdAt" | "userId">;
  const a = await repo.insertAssessment({ ...base, userId: "u1" });
  const b = await repo.insertAssessment({ ...base, userId: "u2" });
  assert.ok(await repo.reserveChatQuestion({ userId: "u1", assessmentId: a.id, roomKey: "love", max: 1 }));
  assert.ok(await repo.reserveChatQuestion({ userId: "u1", assessmentId: a.id, roomKey: "worry", max: 1 }), "다른 방");
  assert.ok(await repo.reserveChatQuestion({ userId: "u2", assessmentId: b.id, roomKey: "love", max: 1 }), "다른 회원");
  assert.equal(await repo.reserveChatQuestion({ userId: "u1", assessmentId: a.id, roomKey: "love", max: 1 }), null);
});

test("16번 DB 변경 전(예약 함수 없음): 예전 방식으로 답하고 답을 받은 뒤에 센다 — 무료 질문이 끊기지 않는다", async () => {
  const { mem, repo, mine, deps } = await setup();
  const legacy: MiyuRepository = {
    ...repo,
    reserveChatQuestion: async () => ({ id: null }),
    confirmChatQuestion: async (_r, rec) => repo.addChatQuestion(rec),
    releaseChatQuestion: async () => {},
  };
  const r = await askFreeQuestionUnqueued(deps({ repo: legacy }), input(mine));
  assert.ok(ok(r));
  assert.equal(mem.chatQuestions.length, 1);
});
