// 실행: npm test — 자유 질문 처리: 소유자 · 입력 · 힘든 글 · 방마다 무료 질문 수 · 미유캐시 · 예산 · 연결 안 됨 · 사용 기록 · 이어지는 질문의 앞선 대화
import assert from "node:assert/strict";
import test from "node:test";
import { quoteCharge, productIdFor } from "../commerce/cash.ts";
import { MIYU_CASH } from "../config/product.ts";
import { ChatAnswerError, type ChatAnswerer } from "../report/chat/answer.ts";
import { CARE_NOTE, CRISIS_REPLY } from "../report/chat/question.ts";
import type { ChatAsk, ChatContext } from "../report/chat/types.ts";
import { SAMPLE_CHART } from "../samples/sample-report.ts";
import { sampleReadingReport } from "../samples/sample-reading-report.ts";
import { buildTalkModel, QUESTION_MAX } from "../report/reading/talk.ts";
import type { RoomAction } from "../report/reading/talk-room.ts";
import { ASK_MESSAGES, askFreeQuestion, recentExchanges, type AskDeps } from "./chat-service.ts";
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
  /** 미유캐시를 충전한다 — 실제와 같은 길(충전 주문 → 결제 완료)로 지갑에 넣는다 */
  const topUp = async (userId: string, assessmentId: string, cash: number) => {
    const quote = quoteCharge(cash)!;
    const ordered = await mem.repo.insertOrder({ orderNumber: `MEU-TEST-${Math.random().toString(36).slice(2, 12).toUpperCase()}`, userId, assessmentId, productId: productIdFor(quote, `T${Math.random().toString(36).slice(2, 10).toUpperCase()}`), amount: quote.priceKrw, paymentEnv: "test" });
    assert.ok(ordered.ok);
    await mem.repo.updateOrder(ordered.value.id, ["pending"], { status: "paid", paymentKey: `pk-${ordered.value.id}`, approvedAt: "2026-10-15T03:00:00Z" });
    return quote;
  };
  return { mem, repo: mem.repo as MiyuRepository, mine: mine.id, other: other.id, asks, deps, topUp };
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

test("입력: 빈 글 · 1,000자 초과는 거절하고(1,000자까지는 받는다), 연락처는 가려서 AI에 보낸다", async () => {
  const { mine, deps, asks } = await setup();
  assert.equal((await askFreeQuestion(deps(), input(mine, "  "))).ok, false);
  const long = await askFreeQuestion(deps(), input(mine, "가".repeat(QUESTION_MAX.paid + 1)));
  assert.ok(!long.ok && long.reason === "too-long" && long.message.includes("1,000자"));
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

test("간단 리포트: 연애 방 무료 질문 2번 · 고민해결소 2번 · 오늘의 운세 1번, 다 쓰면 free-used (캐시가 없으면 AI를 부르지 않는다)", async () => {
  for (const [room, quota] of [["love", 2], ["concern", 2], ["daily", 1]] as const) {
    const { mine, deps, asks, mem } = await setup({ tier: "free", room });
    for (let i = 0; i < quota; i++) {
      const r = await askFreeQuestion(deps(), input(mine, "질문이에요", "u1", room));
      assert.ok(r.ok && r.kind === "answer" && r.remaining === quota - 1 - i, `${room} ${i + 1}번째`);
    }
    assert.deepEqual(await askFreeQuestion(deps(), input(mine, "질문이에요", "u1", room)), { ok: false, reason: "free-used", message: ASK_MESSAGES["free-used"] }, room);
    assert.equal(asks.length, quota, "다 쓴 뒤에는 AI를 부르지 않는다");
    assert.equal(mem.chatQuestions.length, quota);
  }
});

test("간단 리포트: 나를 알아보기는 질문이 없고(deep-only), 올해의 흐름 · 결혼 · 진로 · 재무 방은 심층 리포트로만 열린다 (room-locked) — 캐시가 있어도 열리지 않는다", async () => {
  const main = await setup({ tier: "free", room: "main" });
  await main.topUp("u1", main.mine, 100);
  assert.deepEqual(await askFreeQuestion(main.deps(), input(main.mine, "질문", "u1", "main")), { ok: false, reason: "deep-only", message: ASK_MESSAGES["deep-only"] });
  assert.equal(main.asks.length, 0);
  for (const room of ["year", "marriage", "career", "money"]) {
    const s = await setup({ tier: "free", room });
    await s.topUp("u1", s.mine, 100);
    assert.deepEqual(await askFreeQuestion(s.deps(), input(s.mine, "질문", "u1", room)), { ok: false, reason: "room-locked", message: ASK_MESSAGES["room-locked"] }, room);
    assert.equal(s.asks.length, 0);
    assert.equal(await s.repo.getCashBalance("u1"), 115, "충전한 캐시(100개 + 보너스 15개)는 쓰이지 않았다");
  }
});

test("심층 리포트: 모든 방이 열리고 방마다 무료 질문 3번 — 한 방에서 다 써도 다른 방은 그대로다", async () => {
  const { mine, deps, asks } = await setup({ tier: "paid", room: "love" });
  for (let i = 0; i < 3; i++) assert.ok(ok(await askFreeQuestion(deps(), input(mine))));
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "limit", message: ASK_MESSAGES.limit });
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

test("글자 수: 간단 리포트의 무료 질문은 500자, 미유캐시 질문 · 심층 리포트는 1,000자 — 넘으면 AI를 부르지 않고 횟수도 · 캐시도 쓰지 않으며, 위기 표현은 길어도 안내가 먼저다", async () => {
  assert.equal(QUESTION_MAX.free, 500);
  assert.equal(QUESTION_MAX.paid, 1000);
  assert.equal(QUESTION_MAX.paid, QUESTION_MAX.free * 2);
  const free = await setup({ tier: "free", room: "love" });
  const over = await askFreeQuestion(free.deps(), input(free.mine, "가".repeat(QUESTION_MAX.free + 1)));
  assert.ok(!over.ok && over.reason === "too-long-free" && over.message.includes("500자") && over.message.includes("1,000자"), JSON.stringify(over));
  assert.equal(free.asks.length, 0);
  assert.equal(free.mem.chatQuestions.length, 0);
  assert.ok(ok(await askFreeQuestion(free.deps(), input(free.mine, "가".repeat(QUESTION_MAX.free)))));
  const longCrisis = await askFreeQuestion(free.deps(), input(free.mine, `자살하고 싶어요 ${"가".repeat(QUESTION_MAX.free)}`));
  assert.deepEqual(longCrisis, { ok: true, kind: "safety", paragraphs: CRISIS_REPLY });

  const paid = await setup({ tier: "paid" });
  assert.ok(ok(await askFreeQuestion(paid.deps(), input(paid.mine, "가".repeat(QUESTION_MAX.free + 1)))), "심층 리포트는 500자를 넘어도 된다");
  assert.ok(ok(await askFreeQuestion(paid.deps(), input(paid.mine, "가".repeat(QUESTION_MAX.paid)))));
  const tooLong = await askFreeQuestion(paid.deps(), input(paid.mine, "가".repeat(QUESTION_MAX.paid + 1)));
  assert.ok(!tooLong.ok && tooLong.reason === "too-long");

  // 간단 리포트도 무료 질문을 다 쓰고 미유캐시로 묻는 질문은 1,000자까지
  const cash = await setup({ tier: "free", room: "daily" });
  assert.ok(ok(await askFreeQuestion(cash.deps(), input(cash.mine, "무료", "u1", "daily"))));
  await cash.topUp("u1", cash.mine, 30);
  assert.ok(ok(await askFreeQuestion(cash.deps(), input(cash.mine, "가".repeat(QUESTION_MAX.paid), "u1", "daily"))));
});

test("미유캐시: 무료 질문을 다 쓴 뒤 캐시가 질문 한 번(3개)만큼 있으면 이어서 묻고, 답을 받으면 3개가 차감되며 횟수에 센다", async () => {
  const { mine, deps, repo, mem, topUp } = await setup({ tier: "free", room: "love" });
  for (let i = 0; i < 2; i++) assert.ok(ok(await askFreeQuestion(deps(), input(mine))));
  const quote = await topUp("u1", mine, 50); // 50개 + 보너스 5개 = 55개
  assert.equal(await repo.getCashBalance("u1"), quote.total);
  const r = await askFreeQuestion(deps(), input(mine, "이번엔 캐시로 물어볼게요"));
  assert.deepEqual(r, { ok: true, kind: "answer", question: "이번엔 캐시로 물어볼게요", paragraphs: ["천천히 해 보면 좋겠어요."], remaining: 0, cash: { balance: 52 } });
  assert.equal(await repo.getCashBalance("u1"), quote.total - MIYU_CASH.perQuestion);
  assert.equal(mem.chatQuestions.length, 3);
  const spends = mem.ledger.filter((l) => l.kind === "spend");
  assert.equal(spends.length, 1);
  assert.equal(spends[0].amount, -3);
  assert.ok(!JSON.stringify([mem.ledger, mem.chatQuestions]).includes("캐시로 물어볼게요"), "질문 내용은 기록에 없다");
});

test("미유캐시: 잔액이 모자라면 아무것도 쓰지 않고 AI도 부르지 않는다 (no-cash), 심층 리포트의 3번을 다 쓴 방에서도 같다", async () => {
  const { mine, deps, asks, repo, topUp } = await setup({ tier: "paid", room: "love" });
  for (let i = 0; i < 3; i++) assert.ok(ok(await askFreeQuestion(deps(), input(mine))));
  // 지갑이 아예 없다 — "이 방의 무료 질문을 모두 썼어요"
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "limit", message: ASK_MESSAGES.limit });
  assert.equal(asks.length, 3);
  // 10개를 충전하면 3번 물을 수 있고(3 × 3 = 9), 남은 1개로는 더 물을 수 없다
  await topUp("u1", mine, 10);
  for (let i = 0; i < 3; i++) assert.ok(ok(await askFreeQuestion(deps(), input(mine))), `캐시 ${i + 1}번째`);
  assert.equal(await repo.getCashBalance("u1"), 1);
  // 조금 남았지만 한 번에 모자라면 "미유캐시가 부족해요"
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "no-cash", message: ASK_MESSAGES["no-cash"] });
  assert.equal(asks.length, 6);
  assert.equal(await repo.getCashBalance("u1"), 1, "모자란 질문은 캐시를 쓰지 않는다");
});

test("미유캐시: 답을 받지 못하면(호출 실패 · 검사에 걸림) 차감한 캐시를 되돌리고 횟수에도 세지 않는다 — 어느 쪽도 글은 보이지 않는다", async () => {
  const { mine, deps, repo, mem, topUp } = await setup({ tier: "free", room: "daily" });
  assert.ok(ok(await askFreeQuestion(deps(), input(mine, "무료", "u1", "daily"))));
  await topUp("u1", mine, 20);
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
  // 예상하지 못한 오류도 캐시를 되돌린 뒤 그대로 올려 운영 기록에 남게 한다
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

test("DB 변경이 아직 안 된 환경: 12번 전(횟수 표 없음)에는 열지 않고, 13번 전(캐시 표 없음)에는 무료 질문이 끝난 것으로만 안내한다", async () => {
  const { mine, deps, repo } = await setup({ tier: "free" });
  const missing = Object.assign(Object.create(repo), { countChatQuestionsInRoom: async () => Promise.reject(Object.assign(new Error("x"), { code: "42P01" })) });
  assert.deepEqual(await askFreeQuestion(deps({ repo: missing }), input(mine)), { ok: false, reason: "not-ready", message: ASK_MESSAGES["not-ready"] });
  const noCash = Object.assign(Object.create(repo), { spendCash: async () => Promise.reject(Object.assign(new Error("x"), { code: "42P01" })) });
  for (let i = 0; i < 2; i++) assert.ok(ok(await askFreeQuestion(deps({ repo: noCash }), input(mine))));
  assert.deepEqual(await askFreeQuestion(deps({ repo: noCash }), input(mine)), { ok: false, reason: "free-used", message: ASK_MESSAGES["free-used"] });
});

test("재료가 없는 방(간단 리포트의 맛보기에 내 자료로 읽은 내용이 없음)은 질문을 열지 않고 AI를 부르지 않으며 횟수도 쓰지 않는다 — 심층 리포트는 늘 열린다", async () => {
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

test("하루 예산에 닿으면 새 질문만 멈춘다 (캐시도 쓰지 않는다)", async () => {
  const { mine, deps, mem, repo, topUp } = await setup({ budget: 1, tier: "paid", room: "love" });
  await topUp("u1", mine, 10);
  assert.ok(ok(await askFreeQuestion(deps(), input(mine))));
  // 첫 질문의 사용 기록(1000 · 300토큰)이 예산(1원)을 넘기게 단가가 정해져 있지 않으므로 비용을 직접 채워 넘긴 상태를 만든다
  await mem.repo.addAiUsage({ reportId: null, provider: "t", model: "t", promptVersion: "t", inputTokens: 1, outputTokens: 1, estCostKrw: 5, latencyMs: 1, outcome: "ok", errorCode: null });
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "budget", message: ASK_MESSAGES.budget });
  assert.equal(await repo.getCashBalance("u1"), 10, "예산 때문에 막힌 질문은 캐시를 쓰지 않는다 (첫 질문은 무료 질문이었다)");
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
