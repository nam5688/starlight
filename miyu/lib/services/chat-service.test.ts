// 실행: npm test — 자유 질문 처리: 소유자 · 입력 · 힘든 글 · 하루 횟수 · 예산 · 연결 안 됨 · 사용 기록 · 이어지는 질문의 앞선 대화
import assert from "node:assert/strict";
import test from "node:test";
import { ChatAnswerError, type ChatAnswerer } from "../report/chat/answer.ts";
import { CARE_NOTE, CRISIS_REPLY } from "../report/chat/question.ts";
import type { ChatAsk, ChatContext } from "../report/chat/types.ts";
import type { RoomAction } from "../report/reading/talk-room.ts";
import { ASK_MESSAGES, askFreeQuestion, recentExchanges, type AskDeps } from "./chat-service.ts";
import { NO_LIMITS } from "./capacity-service.ts";
import type { AssessmentRecord } from "./ports.ts";
import { saveTalkRoom } from "./talk-service.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const CONTEXT: ChatContext = { room: { label: "연애", mode: "연애박사 미유", focus: "연애 · 관계" }, intake: null, topic: { title: "가까운 관계", headline: "확인이 되면 마음이 편해져요", summary: ["확인이 있으면 편해져요."], detail: [] }, overview: { headline: "확인을 중요하게 여겨요", tendency: null, strength: null, caution: null, flow: null }, followUp: false, taste: false };

async function setup(opts: { answer?: () => Promise<string[]>; dailyLimit?: number; freeLimit?: number; tier?: "paid" | "free"; loaded?: boolean; budget?: number } = {}) {
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
  const deps = (over: Partial<AskDeps> = {}): AskDeps => ({
    repo: mem.repo,
    answerer,
    now: () => new Date("2026-10-15T03:00:00Z"),
    config: { dailyLimit: opts.dailyLimit ?? 3, freeLimit: opts.freeLimit ?? 1 },
    capacity: opts.budget ? { ...NO_LIMITS, dailyBudgetKrw: opts.budget, priceInputKrwPerMTok: 1000, priceOutputKrwPerMTok: 1000 } : undefined,
    loadAsk: async () => (opts.loaded === false ? null : { context: CONTEXT, referenceDate: "2026-10-15", tier: opts.tier ?? "paid" }),
    ...over,
  });
  return { mem, repo: mem.repo, mine: mine.id, other: other.id, asks, deps };
}
const input = (assessmentId: string, question: unknown = "요즘 연락이 뜸한 사람이 있어요", userId = "u1") => ({ userId, assessmentId, roomKey: "love", question });

test("정상 질문: 답이 돌아오고, 횟수 한 줄과 AI 사용 기록이 남으며, 질문 내용은 어떤 기록에도 없다", async () => {
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

test("입력: 빈 글 · 300자 초과는 거절하고, 연락처는 가려서 AI에 보낸다", async () => {
  const { mine, deps, asks } = await setup();
  assert.equal((await askFreeQuestion(deps(), input(mine, "  "))).ok, false);
  const long = await askFreeQuestion(deps(), input(mine, "가".repeat(301)));
  assert.ok(!long.ok && long.reason === "too-long");
  assert.equal(asks.length, 0);
  await askFreeQuestion(deps(), input(mine, "이 번호 010-1234-5678 로 연락이 왔어요"));
  assert.ok(!asks[0].question.includes("1234-5678"));
});

test("스스로를 해치겠다는 분명한 표현만 AI를 부르지 않고 고정 안내를 돌려주며 횟수에도 세지 않는다", async () => {
  const { mine, deps, asks, mem } = await setup();
  const r = await askFreeQuestion(deps(), input(mine, "자살하고 싶다는 생각이 들어요"));
  assert.deepEqual(r, { ok: true, kind: "safety", paragraphs: CRISIS_REPLY });
  assert.equal(asks.length, 0);
  assert.equal(mem.chatQuestions.length, 0);
  // AI가 연결되지 않은 환경에서도 같은 안내가 나온다
  assert.equal((await askFreeQuestion(deps({ answerer: null }), input(mine, "자해를 했어요"))).ok, true);
});

test("힘든 마음의 표현(죽고 싶다 등)은 막지 않고 답하되 마음을 먼저 받아 주도록 AI에 알리고 답 뒤에 안내 한 문단을 붙이며, 일반적인 슬픔 · 연애 고민은 그대로 답한다", async () => {
  const { mine, deps, asks, mem } = await setup({ dailyLimit: 10 });
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

test("AI가 연결되지 않았거나 한도가 0이면 닫혀 있다 (준비 중)", async () => {
  const { mine, deps } = await setup();
  assert.deepEqual(await askFreeQuestion(deps({ answerer: null }), input(mine)), { ok: false, reason: "closed", message: ASK_MESSAGES.closed });
  assert.equal((await askFreeQuestion(deps({ config: { dailyLimit: 0, freeLimit: 1 } }), input(mine))).ok, false);
});

test("하루 횟수 한도: 한도까지는 답하고 넘으면 멈추며, 날짜가 바뀌면 다시 열리고, 다른 회원 몫과 섞이지 않는다", async () => {
  const { mine, other, deps, mem } = await setup({ dailyLimit: 2 });
  assert.ok((await askFreeQuestion(deps(), input(mine))).ok);
  const second = await askFreeQuestion(deps(), input(mine));
  assert.ok(second.ok && second.kind === "answer" && second.remaining === 0);
  const third = await askFreeQuestion(deps(), input(mine));
  assert.deepEqual(third, { ok: false, reason: "limit", message: ASK_MESSAGES.limit });
  // 다른 회원은 자기 몫이 있다
  assert.ok((await askFreeQuestion(deps(), input(other, "질문이에요", "u2"))).ok);
  // 다음 날(한국 날짜)에는 다시 열린다 — 어제 기록은 오늘 몫에 세지 않는다
  mem.chatQuestions.forEach((q) => (q.createdAt = "2026-10-14T02:00:00.000Z"));
  assert.ok((await askFreeQuestion(deps(), input(mine))).ok);
});

test("하루 예산에 닿으면 새 질문만 멈춘다", async () => {
  const { mine, deps, mem } = await setup({ budget: 1 });
  assert.ok((await askFreeQuestion(deps(), input(mine))).ok);
  // 첫 질문의 사용 기록(1000 · 300토큰)이 예산(1원)을 넘기게 단가가 정해져 있지 않으므로 비용을 직접 채워 넘긴 상태를 만든다
  await mem.repo.addAiUsage({ reportId: null, provider: "t", model: "t", promptVersion: "t", inputTokens: 1, outputTokens: 1, estCostKrw: 5, latencyMs: 1, outcome: "ok", errorCode: null });
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "budget", message: ASK_MESSAGES.budget });
});

test("구매해 준비된 리포트가 없으면(자료가 없으면) 열지 않는다", async () => {
  const { mine, deps, asks } = await setup({ loaded: false });
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "not-ready", message: ASK_MESSAGES["not-ready"] });
  assert.equal(asks.length, 0);
});

test("12번 DB 변경 전(횟수 표가 없음)에는 열지 않는다", async () => {
  const { mine, deps, repo } = await setup();
  const missing = Object.assign(Object.create(repo), { countChatQuestionsSince: async () => Promise.reject(Object.assign(new Error("x"), { code: "42P01" })) });
  assert.deepEqual(await askFreeQuestion(deps({ repo: missing }), input(mine)), { ok: false, reason: "not-ready", message: ASK_MESSAGES["not-ready"] });
});

test("답 만들기 실패: 호출 자체가 실패하면 횟수에 세지 않고, 검사에 계속 걸린 답은 비용이 들었으므로 센다 — 어느 쪽도 글은 보이지 않는다", async () => {
  const { mine, deps, mem } = await setup();
  const hard = { provider: "t", model: "t", answer: async () => Promise.reject(new ChatAnswerError("호출 실패", "MODEL")) } as ChatAnswerer;
  assert.deepEqual(await askFreeQuestion(deps({ answerer: hard }), input(mine)), { ok: false, reason: "failed", message: ASK_MESSAGES.failed });
  assert.equal(mem.chatQuestions.length, 0);
  const invalid = { provider: "t", model: "t", answer: async () => Promise.reject(new ChatAnswerError("검사 실패", "INVALID", ["단정"])) } as ChatAnswerer;
  const r = await askFreeQuestion(deps({ answerer: invalid }), input(mine));
  assert.ok(!r.ok && r.reason === "failed" && !r.message.includes("단정"));
  assert.equal(mem.chatQuestions.length, 1);
  // 예상하지 못한 오류는 그대로 올려 운영 기록에 남게 한다
  const boom = { provider: "t", model: "t", answer: async () => Promise.reject(new Error("boom")) } as ChatAnswerer;
  await assert.rejects(askFreeQuestion(deps({ answerer: boom }), input(mine)), /boom/);
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

test("무료 맛보기(구매 전)의 로그인한 회원은 첫 질문 1번만 답을 받고, 그 횟수는 평생 센다 (날짜가 지나도 다시 열리지 않는다)", async () => {
  const { mine, deps, asks, mem } = await setup({ tier: "free", freeLimit: 1, dailyLimit: 10 });
  const first = await askFreeQuestion(deps(), input(mine));
  assert.ok(first.ok && first.kind === "answer" && first.remaining === 0);
  assert.equal(mem.chatQuestions.length, 1);
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "free-used", message: ASK_MESSAGES["free-used"] });
  assert.equal(asks.length, 1, "두 번째는 AI를 부르지 않는다");
  // 다음 날 · 한 달 뒤에도 무료 질문은 다시 열리지 않는다
  mem.chatQuestions.forEach((q) => (q.createdAt = "2026-08-01T02:00:00.000Z"));
  assert.equal((await askFreeQuestion(deps(), input(mine))).ok, false);
});

test("무료 질문 횟수(AI_CHAT_FREE_LIMIT)를 늘릴 수 있고 0이면 무료 질문은 닫힌다 — 리포트를 받은 회원의 하루 한도는 따로다", async () => {
  const two = await setup({ tier: "free", freeLimit: 2 });
  assert.ok((await askFreeQuestion(two.deps(), input(two.mine))).ok);
  const second = await askFreeQuestion(two.deps(), input(two.mine));
  assert.ok(second.ok && second.kind === "answer" && second.remaining === 0);
  assert.equal((await askFreeQuestion(two.deps(), input(two.mine))).ok, false);

  const off = await setup({ tier: "free", freeLimit: 0 });
  assert.deepEqual(await askFreeQuestion(off.deps(), input(off.mine)), { ok: false, reason: "not-ready", message: ASK_MESSAGES["not-ready"] });
  assert.equal(off.asks.length, 0);

  // 무료로 한 번 물은 회원이 리포트를 받으면(paid) 하루 한도로 이어서 묻는다 — 무료 질문은 하루 몫을 줄이지만 오늘 것으로는 세지 않는다
  const bought = await setup({ tier: "free", freeLimit: 1, dailyLimit: 3 });
  assert.ok((await askFreeQuestion(bought.deps(), input(bought.mine))).ok);
  bought.mem.chatQuestions.forEach((q) => (q.createdAt = "2026-10-01T02:00:00.000Z"));
  const paid = await askFreeQuestion(bought.deps({ loadAsk: async () => ({ context: CONTEXT, referenceDate: "2026-10-15", tier: "paid" }) }), input(bought.mine));
  assert.ok(paid.ok && paid.kind === "answer" && paid.remaining === 2);
});

test("무료 질문은 답을 받지 못했다면 — 호출이 실패했든 검사에 걸렸든 — 차감하지 않는다(다시 물을 수 있다). 리포트를 받은 분의 하루 한도는 검사에 걸린 답을 센다", async () => {
  const { mine, deps, mem } = await setup({ tier: "free" });
  const hard = { provider: "t", model: "t", answer: async () => Promise.reject(new ChatAnswerError("호출 실패", "MODEL")) } as ChatAnswerer;
  assert.equal((await askFreeQuestion(deps({ answerer: hard }), input(mine))).ok, false);
  assert.equal(mem.chatQuestions.length, 0);
  // 검사에 계속 걸려 답을 받지 못한 경우도 무료 질문은 그대로 남는다
  const invalid = { provider: "t", model: "t", answer: async () => Promise.reject(new ChatAnswerError("검사 실패", "INVALID", ["단정"])) } as ChatAnswerer;
  const r = await askFreeQuestion(deps({ answerer: invalid }), input(mine));
  assert.ok(!r.ok && r.reason === "failed");
  assert.equal(mem.chatQuestions.length, 0, "검사에 걸려 답을 못 받은 무료 질문은 차감하지 않는다");
  assert.ok((await askFreeQuestion(deps(), input(mine))).ok, "실패한 뒤에도 무료 질문이 남아 있다");
  assert.equal(mem.chatQuestions.length, 1);
  // 답을 받은 뒤에는 무료 질문을 다 쓴 것이다
  assert.deepEqual(await askFreeQuestion(deps(), input(mine)), { ok: false, reason: "free-used", message: ASK_MESSAGES["free-used"] });
});
