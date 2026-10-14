// 실행: npm test — 자유 질문: 질문 정리(개인정보 가리기 · 힘든 글 구분) · 근거(이름 가리기 · 풀이 범위) · 지시문 · 답 검사 · 고쳐 쓰기
import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_CHART } from "../../samples/sample-report.ts";
import { sampleReadingReport } from "../../samples/sample-reading-report.ts";
import { ModelCallError, type ModelRequest, type TextModel } from "../ai/model.ts";
import { FREE_ANSWER_PARAGRAPH_MAX, FREE_ANSWER_PARAGRAPHS_MAX, FREE_QUESTION_MAX, ROOMS, ROOM_ORDER, type RoomId } from "../reading/talk-room.ts";
import { buildTalkModel } from "../reading/talk.ts";
import { buildFreeTalkModel } from "../reading/talk-free.ts";
import { buildFreePreview } from "../preview.ts";
import { buildDevFreeSummary } from "../build-free-summary.ts";
import { ASSESSMENT_MODULES } from "../../assessment/modules/index.ts";
import { ChatAnswerError, createChatAnswerer } from "./answer.ts";
import { buildChatContext, ROOM_AI_FOCUS } from "./context.ts";
import { composeMockChatAnswer, createMockChatModel } from "./mock-model.ts";
import { CHAT_LIMITS } from "./plan.ts";
import { buildChatRepairMessage, buildChatUserMessage, CHAT_PROMPT_MARK, CHAT_SYSTEM_PROMPT } from "./prompt.ts";
import { CARE_NOTE, CRISIS_REPLY, cleanQuestion, crisisLevel, isCrisisQuestion } from "./question.ts";
import type { ChatAsk } from "./types.ts";
import { validateChatAnswer } from "./validate.ts";

const model = buildTalkModel(sampleReadingReport, { saju: SAMPLE_CHART, today: { year: 2026, month: 10, day: 15 }, chat: { state: "ready" } });
const ask = (over: Partial<ChatAsk> = {}): ChatAsk => ({ context: buildChatContext(model, "love", { topicId: "love", intakeId: "some" }), question: "요즘 연락이 뜸한 사람이 있어요. 어떻게 하면 좋을까요?", recent: [], referenceDate: "2026-10-15", ...over });

const ANSWERS = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((item, i) => [item.id, (i % 5) + 1])));
const FREE_PREVIEW = buildFreePreview({ summary: buildDevFreeSummary(ANSWERS), saju: SAMPLE_CHART, reference: { year: 2026, month: 10 } });
const GOOD = "연락이 뜸할 때 마음이 먼저 앞서는 편이라고 리포트에서 읽었어요. 다만 그 사람의 마음은 알 수 없어요.\n\n오늘은 답을 기다리는 대신 내가 편한 속도를 한 줄로 적어 보면 어때요?";

test("한도: 답 한도는 저장 한도(서버 저장 · 화면)보다 작다", () => {
  assert.ok(CHAT_LIMITS.paragraphs.max <= FREE_ANSWER_PARAGRAPHS_MAX);
  assert.ok(CHAT_LIMITS.paragraph.max <= FREE_ANSWER_PARAGRAPH_MAX);
  assert.ok(CHAT_LIMITS.total <= CHAT_LIMITS.paragraphs.max * CHAT_LIMITS.paragraph.max);
});

test("질문 정리: 공백 · 제어 문자 정리, 연락처 · 이메일 가리기, 빈 글 · 300자 초과 거절", () => {
  assert.deepEqual(cleanQuestion("  요즘   고민이\n있어요 "), { ok: true, text: "요즘 고민이 있어요", redactions: 0 });
  const r = cleanQuestion("제 번호는 010-1234-5678이고 메일은 a@b.com 이에요");
  assert.ok(r.ok && !/010-1234|a@b\.com/.test(r.text) && r.redactions === 2, JSON.stringify(r));
  assert.deepEqual(cleanQuestion("   "), { ok: false, reason: "empty" });
  assert.deepEqual(cleanQuestion(undefined), { ok: false, reason: "empty" });
  assert.deepEqual(cleanQuestion("가".repeat(FREE_QUESTION_MAX + 1)), { ok: false, reason: "too-long" });
  assert.ok(cleanQuestion("가".repeat(FREE_QUESTION_MAX)).ok);
});

test("힘든 글의 구분: 스스로를 해치겠다는 분명한 표현만 AI를 막고, 힘든 마음의 표현은 답하되 안내를 붙이고, 일반적인 슬픔 · 연애 고민은 그대로 답한다", () => {
  for (const q of ["자살하고 싶어요", "자해를 했어요", "극단적 선택을 하고 싶어요", "죽을 방법을 찾고 있어요", "유서를 썼어요", "죽어 버릴 거예요"]) assert.equal(crisisLevel(q), "hard", q);
  for (const q of ["죽고 싶다는 생각이 들어요", "그냥 사라지고 싶어요", "살기 싫어요", "모든 게 의미 없어요"]) assert.equal(crisisLevel(q), "soft", q);
  const ordinary = [
    "연락이 뜸한 사람이 있어요",
    "이직을 하면 죽을 만큼 힘들까요",
    "올해 돈 운이 어떤가요",
    "사랑에 죽고 사는 편이에요",
    "너무 우울하고 외로워요",
    "헤어져서 힘들어요. 눈물이 자꾸 나요",
    "불안해서 잠이 안 와요",
    "남자친구가 연락이 없어서 속상해요",
    "창피해서 쥐구멍에 숨고 싶어요",
    "일이 너무 힘들어서 다 그만두고 싶어요",
    "이 관계를 끝내야 할지 고민이에요",
  ];
  for (const q of ordinary) assert.equal(crisisLevel(q), "none", q);
  assert.ok(isCrisisQuestion("자살하고 싶어요") && !isCrisisQuestion("죽고 싶다는 생각이 들어요"));
  // 고정 안내는 풀이가 아니라 곁의 사람 · 전문 상담으로 이어 주며, 저장 한도 안이다
  const all = [...CRISIS_REPLY, CARE_NOTE].join(" ");
  assert.ok(all.includes("109") && CRISIS_REPLY.join(" ").includes("119"));
  for (const p of [...CRISIS_REPLY, CARE_NOTE]) assert.ok(p.length <= FREE_ANSWER_PARAGRAPH_MAX && p.length <= CHAT_LIMITS.paragraph.max + 200);
  assert.ok(CRISIS_REPLY.length <= FREE_ANSWER_PARAGRAPHS_MAX && CHAT_LIMITS.paragraphs.max + 1 <= FREE_ANSWER_PARAGRAPHS_MAX, "AI 답 + 안내 한 문단이 저장 한도 안");
});

test("진로 방과 재무 방: 같은 저장된 풀이에서 서로 다른 소단락 · 질문 · 초점을 쓰고, 새 글을 더하지 않는다", () => {
  const career = buildChatContext(model, "career", { topicId: "work-money" });
  const money = buildChatContext(model, "money", { topicId: "work-money" });
  assert.notEqual(career.room.focus, money.room.focus);
  assert.match(money.room.focus, /투자/);
  assert.match(career.room.focus, /업종/);
  assert.ok(career.topic && money.topic);
  assert.notDeepEqual(career.topic!.detail, money.topic!.detail, "방마다 보이는 소단락이 다르다");
  const block = sampleReadingReport.blocks.find((b) => b.id === "work-money")!;
  assert.ok(block.sections && block.sections.length === 3);
  const [s0, s1, s2] = block.sections!;
  const has = (c: typeof career, text: string) => c.topic!.detail.some((d) => d === text);
  assert.ok(has(career, s0.body) && has(career, s2.body) && !has(career, s1.body), "진로: 일하는 방식 · 일을 고르는 기준");
  assert.ok(has(money, s0.body) && has(money, s1.body) && !has(money, s2.body), "재무: 성과와 수입으로 이어지는 방식 · 시기와 관리 습관");
  // 모든 방에 초점이 있고 서로 다르다
  assert.equal(new Set(ROOM_ORDER.map((r) => ROOM_AI_FOCUS[r])).size, ROOM_ORDER.length);
});

test("무료 맛보기의 근거는 taste로 표시되고 보이는 글뿐이다", () => {
  const free = buildFreeTalkModel({ name: "서윤", preview: FREE_PREVIEW, saju: SAMPLE_CHART, today: { year: 2026, month: 10, day: 15 }, href: "/results/x#r-purchase", owned: false, chat: { state: "ready", free: true } });
  const c = buildChatContext(free, "main", { topicId: "tendency" });
  assert.equal(c.taste, true);
  assert.equal(buildChatContext(model, "main", { topicId: "tendency" }).taste, false);
  // 잠긴 질문(hooks)은 근거에 들어가지 않는다
  const text = JSON.stringify(c);
  for (const t of free.topics) for (const h of t.locked?.hooks ?? []) assert.ok(!text.includes(h), h);
});

test("근거: 이 방의 풀이 글만 담고 이름은 가리며, 이 방에서 열 수 없는 풀이는 쓰지 않는다", () => {
  const c = buildChatContext(model, "love", { topicId: "love", intakeId: "some", followUp: true });
  assert.equal(c.room.label, ROOMS.love.label);
  assert.equal(c.followUp, true);
  assert.ok(c.topic && c.topic.summary.length > 0 && c.topic.detail.length > 0);
  assert.equal(c.overview.strength, null, "풀이가 있으면 카드 요약을 더하지 않는다");
  assert.ok(c.intake && c.intake.answer.length > 0);
  // 다른 방의 풀이(연애 방에서 돈 풀이)는 쓰지 않고, 모르는 번호도 쓰지 않는다
  assert.equal(buildChatContext(model, "love", { topicId: "work-money" }).topic, null);
  assert.equal(buildChatContext(model, "love", { topicId: "nope" }).topic, null);
  // 먼저 묻는 질문을 건너뛴 답은 담지 않는다
  assert.equal(buildChatContext(model, "love", { topicId: "love", intakeId: "skip" }).intake, null);
  // 이름은 "이 분"으로
  const named = buildTalkModel({ ...sampleReadingReport, headline: `${model.name}은 확인을 중요하게 여겨요` }, { saju: SAMPLE_CHART, today: { year: 2026, month: 10, day: 15 }, chat: { state: "ready" } });
  const o = buildChatContext(named, "main", {});
  assert.ok(o.overview.headline.includes("이 분") && !o.overview.headline.includes(named.name));
  // 풀이 없이 이야기만 나누는 방은 카드 요약(장점 · 어려운 점 · 시기)을 근거로 쓴다
  const concern = buildChatContext(model, "concern", {});
  assert.equal(concern.topic, null);
  assert.ok(concern.overview.strength && concern.overview.caution && concern.overview.flow);
  // 모든 방이 만들어진다
  for (const r of ROOM_ORDER) assert.ok(buildChatContext(model, r as RoomId, {}).room.mode.length > 0);
});

test("근거의 크기는 한도 안이고, 코드가 계산한 풀이(오늘의 한 장 · 인연의 경향)도 근거가 될 수 있다", () => {
  for (const t of [...model.topics, ...model.codeTopics]) {
    const c = buildChatContext(model, "main", { topicId: t.id });
    const size = JSON.stringify(c.topic).length;
    assert.ok(size < 6000, `${t.id}: ${size}`);
  }
  assert.ok(buildChatContext(model, "daily", { topicId: "daily" }).topic, "원데이 미유의 오늘의 한 장");
});

test("지시문과 입력: 이름 · 생년월일이 없고, 근거 안에서만 · 알려 준 사실과 읽은 경향 구분 · 금지 규칙이 들어 있다", () => {
  const msg = buildChatUserMessage(ask());
  assert.ok(!msg.includes(model.name) || model.name.length < 2 || !JSON.stringify(ask().context).includes(model.name));
  assert.ok(!/19\d\d|20[0-2]\d\s*년\s*\d+\s*월\s*\d+\s*일/.test(msg.replace(/referenceDate[^\n]*\n/, "")), "생년월일 형태가 없다");
  assert.ok(CHAT_SYSTEM_PROMPT.startsWith(CHAT_PROMPT_MARK));
  for (const must of ["알려 준 사실", "리포트에서 읽은 경향", "속마음", "투자", "결정을 대신", "100%", "followUp", "해요체", "room.focus", "taste", "care", "슬픔"]) assert.ok(CHAT_SYSTEM_PROMPT.includes(must), must);
  const withRecent = buildChatUserMessage(ask({ recent: [{ q: "앞 질문", a: "앞 답" }] }));
  assert.ok(withRecent.includes("앞 질문") && withRecent.includes('"question"'));
  assert.ok(buildChatRepairMessage(["가", "나"]).includes("- 가") && buildChatRepairMessage(["가"]).includes("처음부터 다시"));
});

test("답 검사: 좋은 답은 통과하고, 단정 · 진단 · 사주 용어 · 점수 · 나이 · 속마음 · 결정 대신 내리기 · 투자 · 합쇼체 · 마크다운은 막는다", () => {
  const ok = validateChatAnswer(GOOD);
  assert.ok(ok.ok && ok.paragraphs.length === 2, JSON.stringify(ok));
  const bad: [string, string][] = [
    ["반드시 좋은 인연이 생겨요. 걱정하지 않아도 돼요.", "단정"],
    ["우울증 진단이에요. 병원에 가 보세요.", "진단"],
    ["일간이 약해서 그런 편이에요. 천천히 해 보세요.", "사주 용어"],
    ["연애운은 80점이에요. 천천히 해 보세요 정말로요.", "점수"],
    ["30대에는 달라질 수 있어요. 천천히 해 보세요 정말로요.", "나이"],
    ["그 사람은 속으로 이미 마음이 식었어요. 천천히 해 보세요.", "속마음"],
    ["이 관계는 헤어지세요. 그게 맞아요 정말로요.", "결정"],
    ["올해는 주식 투자를 하세요. 수익이 날 거예요.", "투자"],
    ["그렇게 하시는 것이 좋습니다. 천천히 해 보세요.", "합쇼체"],
    ["**중요해요** 천천히 해 보세요 정말로요.", "마크다운"],
    ["- 첫째로 천천히 해 보세요 정말로요.\n- 둘째로요.", "목록"],
    ["성격이 아니라 시기 때문에 그래요. 천천히 해 보세요.", "원인 좁히기"],
    ["천천히 해 보세요 정말로요 😊 힘내요.", "이모지"],
    ["짧아요", "너무 짧음"],
    ["가".repeat(CHAT_LIMITS.paragraph.max + 1), "너무 긺"],
    [Array.from({ length: CHAT_LIMITS.paragraphs.max + 1 }, () => "천천히 해 보세요 정말로요.").join("\n\n"), "문단 수"],
    ["", "빈 글"],
  ];
  for (const [text, label] of bad) assert.equal(validateChatAnswer(text).ok, false, label);
  // 부정 안내는 허용한다 (상대의 마음을 알 수 없다고 말하는 것)
  assert.ok(validateChatAnswer("그 사람이 왜 그랬는지는 알 수 없어요. 대신 내가 어떻게 반응했는지는 같이 볼 수 있어요.").ok);
  // 줄바꿈만 있는 글도 문단으로 나눈다
  const lines = validateChatAnswer("천천히 해 보면 좋겠어요. 그럴 수 있어요.\n오늘은 한 줄만 적어 보면 어때요?");
  assert.ok(lines.ok && lines.paragraphs.length === 2);
});

type Call = { system: string; messages: ModelRequest["messages"] };
const scripted = (replies: (string | Error)[]): { model: TextModel; calls: Call[] } => {
  const calls: Call[] = [];
  return {
    calls,
    model: {
      provider: "test",
      model: "scripted",
      async complete(req) {
        calls.push({ system: req.system, messages: [...req.messages] });
        const r = replies[Math.min(calls.length - 1, replies.length - 1)];
        if (r instanceof Error) throw r;
        return { text: r, model: "scripted", usage: { inputTokens: 1000, outputTokens: 300 } };
      },
    },
  };
};

test("답변 생성: 통과한 글만 돌려주고, 검사에 걸리면 이유를 알려 한 번 고쳐 쓰게 하며, 그래도 걸리면 실패로 남긴다 (사용 기록은 호출마다)", async () => {
  const usage: { outcome: string; promptVersion: string }[] = [];
  const ctx = { onUsage: (u: { outcome: string; promptVersion: string }) => usage.push(u) };

  const direct = scripted([GOOD]);
  const a = await createChatAnswerer({ model: direct.model }).answer(ask(), ctx);
  assert.equal(a.paragraphs.length, 2);
  assert.equal(direct.calls.length, 1);
  assert.deepEqual(usage.map((u) => u.outcome), ["ok"]);

  usage.length = 0;
  const repaired = scripted(["반드시 잘될 거예요. 걱정하지 않아도 돼요.", GOOD]);
  const b = await createChatAnswerer({ model: repaired.model }).answer(ask(), ctx);
  assert.equal(b.paragraphs.length, 2);
  assert.equal(repaired.calls.length, 2);
  const last = repaired.calls[1].messages;
  assert.equal(last.length, 3, "처음 질문 · 걸린 답 · 고치라는 말");
  assert.ok(last[2].content.includes("단정"));
  assert.deepEqual(usage.map((u) => u.outcome), ["invalid", "ok"]);

  const stuck = scripted(["반드시 잘될 거예요. 걱정하지 않아도 돼요."]);
  await assert.rejects(createChatAnswerer({ model: stuck.model }).answer(ask()), (e: unknown) => e instanceof ChatAnswerError && e.code === "INVALID" && e.errors.length > 0);
  assert.equal(stuck.calls.length, 2, "고쳐 쓰기는 한 번뿐");
});

test("답변 생성: 모델 호출 실패는 일시 오류만 한 번 다시 시도하고, 사용자에게는 실패 한 종류로만 알린다", async () => {
  const transient = scripted([new ModelCallError("느림", { retryable: true, code: "HTTP_503" }), GOOD]);
  const ok = await createChatAnswerer({ model: transient.model, sleep: async () => {} }).answer(ask());
  assert.equal(ok.paragraphs.length, 2);
  assert.equal(transient.calls.length, 2);
  const hard = scripted([new ModelCallError("키 오류", { retryable: false, code: "HTTP_401" })]);
  await assert.rejects(createChatAnswerer({ model: hard.model, sleep: async () => {} }).answer(ask()), (e: unknown) => e instanceof ChatAnswerError && e.code === "MODEL" && !e.message.includes("키"));
  assert.equal(hard.calls.length, 1);
  // 첫 응답이 검사에 걸린 뒤 고쳐 쓰는 호출이 실패하면 모델이 이미 응답한 질문이다 — INVALID(횟수에 센다). 호출 전에 실패한 질문은 MODEL
  const afterResponse = scripted(["반드시 잘될 거예요. 걱정하지 않아도 돼요.", new ModelCallError("승인 범위 밖", { retryable: false, code: "BUDGET_EXCEEDED" })]);
  await assert.rejects(createChatAnswerer({ model: afterResponse.model, sleep: async () => {} }).answer(ask()), (e: unknown) => e instanceof ChatAnswerError && e.code === "INVALID" && e.errors.length > 0);
  assert.equal(afterResponse.calls.length, 2);
});

test("모의 모델의 답은 실제 검사를 통과하고, 후속 질문(상황에 따라 달라요) 말투를 쓴다", async () => {
  const plain = composeMockChatAnswer(buildChatUserMessage(ask()));
  const follow = composeMockChatAnswer(buildChatUserMessage(ask({ context: buildChatContext(model, "love", { topicId: "love", followUp: true }) })));
  assert.ok(validateChatAnswer(plain).ok && validateChatAnswer(follow).ok);
  assert.ok(follow.includes("맞지 않는다고") && !plain.includes("맞지 않는다고"));
  const a = await createChatAnswerer({ model: createMockChatModel() }).answer(ask());
  assert.ok(a.paragraphs.length >= 1);
});
