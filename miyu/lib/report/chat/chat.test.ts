// 실행: npm test — 자유 질문: 질문 정리(개인정보 가리기 · 힘든 글 구분) · 근거(이름 가리기 · 풀이 범위) · 지시문 · 답 검사 · 고쳐 쓰기
import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_CHART } from "../../samples/sample-report.ts";
import { sampleReadingReport } from "../../samples/sample-reading-report.ts";
import { ModelCallError, type ModelRequest, type TextModel } from "../ai/model.ts";
import { QUESTION_MAX } from "../reading/talk.ts";
import { FREE_ANSWER_PARAGRAPH_MAX, FREE_ANSWER_PARAGRAPHS_MAX, ROOMS, ROOM_ORDER, type RoomId } from "../reading/talk-room.ts";
import { buildTalkModel } from "../reading/talk.ts";
import { buildFreeTalkModel } from "../reading/talk-free.ts";
import { buildFreePreview } from "../preview.ts";
import { buildDevFreeSummary } from "../build-free-summary.ts";
import { ASSESSMENT_MODULES } from "../../assessment/modules/index.ts";
import { ChatAnswerError, createChatAnswerer } from "./answer.ts";
import { buildChatContext, PROFILE_TEXT_MAX, ROOM_AI_FOCUS } from "./context.ts";
import { composeMockChatAnswer, createMockChatModel } from "./mock-model.ts";
import { CHAT_LIMITS } from "./plan.ts";
import { buildChatRepairMessage, buildChatUserMessage, CHAT_PROMPT_MARK, CHAT_PROMPT_VERSION, CHAT_SYSTEM_PROMPT } from "./prompt.ts";
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

test("질문 정리: 공백 · 제어 문자 정리, 연락처 · 이메일 가리기, 빈 글 · 1,000자 초과 거절", () => {
  assert.deepEqual(cleanQuestion("  요즘   고민이\n있어요 "), { ok: true, text: "요즘 고민이 있어요", redactions: 0, length: 10 });
  const r = cleanQuestion("제 번호는 010-1234-5678이고 메일은 a@b.com 이에요");
  assert.ok(r.ok && !/010-1234|a@b\.com/.test(r.text) && r.redactions === 2, JSON.stringify(r));
  assert.deepEqual(cleanQuestion("   "), { ok: false, reason: "empty" });
  assert.deepEqual(cleanQuestion(undefined), { ok: false, reason: "empty" });
  assert.deepEqual(cleanQuestion("가".repeat(QUESTION_MAX.paid + 1)), { ok: false, reason: "too-long" });
  assert.ok(cleanQuestion("가".repeat(QUESTION_MAX.paid)).ok, "가장 넉넉한 한도(리포트를 받은 분)까지는 받는다 — 무료 500자는 서비스가 센다");
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

test("무료 맛보기의 질문에는 방의 풀이 한 줄만이 아니라 이미 공개된 사주 · 응답 문구가 근거 종류별로 함께 간다 (선택한 답을 풀어 쓰는 데 그치지 않게)", () => {
  const free = buildFreeTalkModel({ name: "서윤", preview: FREE_PREVIEW, saju: SAMPLE_CHART, today: { year: 2026, month: 10, day: 15 }, href: "/results/x#r-purchase", owned: false, chat: { state: "ready", free: true } });
  // 연애 방에는 연애 풀이 한 주제뿐이지만, 사주 · 응답에서 읽은 문구는 다른 주제의 것도 근거로 간다
  const c = buildChatContext(free, "love", { topicId: "love", intakeId: "some" });
  assert.ok(c.profile, "무료 맛보기에는 profile이 있다");
  assert.ok(c.profile!.saju.length >= 2, "사주에서 읽은 문구(일간 비유 · 기운 · 원국에서 읽히는 한 줄 · 인연의 경향)");
  assert.ok(c.profile!.response.length >= 1, "응답에서 읽은 문구(편한 환경 · 자주 반복되는 반응)");
  // 응답 문구는 무료 미리보기가 이미 공개한 글뿐이다 (잠긴 핵심 요약 · 점수 · 상세는 없다)
  const shown = [FREE_PREVIEW.lead.kind === "insight" ? FREE_PREVIEW.lead.text : "", ...FREE_PREVIEW.core.shown.map((r) => `${r.label}: ${r.text}`)];
  for (const line of c.profile!.response) assert.ok(shown.includes(line), `공개되지 않은 응답 문구: ${line}`);
  for (const l of FREE_PREVIEW.core.locked) assert.ok(!JSON.stringify(c.profile).includes(l.question), l.question);
  // 사주 문구에는 점수 · 개수 숫자가 없다(숫자는 답에서 막는 표현이다)
  for (const line of c.profile!.saju) assert.ok(!/\d/.test(line), `숫자가 든 사주 문구: ${line}`);
  // 질문 근거로 실제 AI에 가는 글에 profile이 들어 있다
  const msg = buildChatUserMessage({ context: c, question: "요즘 연애가 잘 안 풀리는 느낌이에요.", recent: [], referenceDate: "2026-10-15" });
  assert.ok(msg.includes('"profile"') && msg.includes('"saju"') && msg.includes('"response"'));
  // 구매한 리포트의 풀이에는 profile이 없다 (그 풀이 글이 사주 · 응답을 함께 풀어 쓴 것이다)
  const paid = buildChatContext(model, "love", { topicId: "love" });
  assert.equal(paid.profile, null);
  assert.ok(!buildChatUserMessage(ask()).includes('"profile"'));
});

test("무료 맛보기 profile: 이름은 가리고, 글자 수 한도 안에서 응답 문구를 먼저 담아 두 종류가 모두 남는다", () => {
  const base = buildFreeTalkModel({ name: "서윤", preview: FREE_PREVIEW, saju: SAMPLE_CHART, today: { year: 2026, month: 10, day: 15 }, href: "/results/x#r-purchase", owned: false, chat: { state: "ready", free: true } });
  const named = { ...base, tasteProfile: { saju: ["서윤은 큰 강처럼 넓게 흐르는 사람이에요"], response: ["서윤은 확인하고 시작하는 편일 수 있어요"] } };
  const p = buildChatContext(named, "love", { topicId: "love" }).profile!;
  assert.ok(p.saju[0].startsWith("이 분은") && p.response[0].startsWith("이 분은") && !JSON.stringify(p).includes("서윤"));
  // 사주 문구가 아주 길어도 응답 문구가 밀려나지 않고, 두 종류 합이 한도를 넘지 않는다
  const long = { ...base, tasteProfile: { saju: Array.from({ length: 40 }, (_, i) => `사주에서 읽은 아주 긴 문구 ${"가".repeat(80)}${i}`), response: ["응답에서 읽은 짧은 문구예요"] } };
  const q = buildChatContext(long, "love", { topicId: "love" }).profile!;
  assert.deepEqual(q.response, ["응답에서 읽은 짧은 문구예요"]);
  assert.ok(q.saju.length > 0 && [...q.saju, ...q.response].join("").length <= PROFILE_TEXT_MAX);
  // profile이 없거나 비어 있으면 입력에 싣지 않는다
  const none = buildChatContext({ ...base, tasteProfile: undefined }, "love", { topicId: "love" });
  assert.equal(none.profile, null);
  assert.ok(!buildChatUserMessage({ context: none, question: "요즘 고민이 있어요", recent: [], referenceDate: "2026-10-15" }).includes('"profile"'));
  const empty = buildChatContext({ ...base, tasteProfile: { saju: [], response: [] } }, "love", { topicId: "love" });
  assert.ok(!buildChatUserMessage({ context: empty, question: "요즘 고민이 있어요", recent: [], referenceDate: "2026-10-15" }).includes('"profile"'));
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
  // 이전 대화(memory): 있을 때만 보내고, 지시문은 참고용이며 새 근거가 아니라고 못박는다 (사실로 단정 금지 · 이어질 때만 가볍게)
  const withMemory = buildChatUserMessage(ask({ memory: [{ q: "지난 질문", a: "지난 답" }] }));
  assert.ok(withMemory.includes('"memory"') && withMemory.includes("지난 질문"));
  assert.ok(!buildChatUserMessage(ask()).includes('"memory"') && !buildChatUserMessage(ask({ memory: [] })).includes('"memory"'));
  for (const must of ["memory", "이어질 때만", "새 근거가 아니다", "단정하지 않는다"]) assert.ok(CHAT_SYSTEM_PROMPT.includes(must), `memory 지시: ${must}`);
  // 사주에서 읽은 점 → 응답에서 읽은 반응 → 만나는 장면 순서로 잇고, 사주와 응답이 다르면 차이를 설명하며, 문구를 베끼지 않는다 (무료 맛보기 profile)
  for (const must of ["profile", "saju는 사주에서 읽은 문구", "response는 사용자의 응답이 뒷받침한 문구", "사주에서는 ~로 읽혀요", "하나로 맞추지 않는다", "그대로 베끼지 말고", "물 기운이 많은 구성"]) assert.ok(CHAT_SYSTEM_PROMPT.includes(must), `profile 지시: ${must}`);
  assert.equal(CHAT_PROMPT_VERSION, "chat-v1-prompt-0.7");
  // 0.6 — 고민 상담의 흐름(사주 해석 → 상황의 뜻 → 구체적 추천, 단계 이름을 드러내지 않기) · 이유 있는 추천 · 용어를 물으면 구분해서 답하기 · 가벼운 보완 아이템
  for (const must of ["[답의 흐름 — 사주 해석 → 지금 상황이 뜻하는 것 → 구체적인 추천]", "단계를 이름 붙여 나열하지 않는다", "목차 · 소제목", "추천은 이유와 함께 말한다", "중대한 선택을 확정해 주는 말", "이 주식을 사세요", "사용자가 용어를 물으면", "아직 이 분의", "이 분의 것으로 정해 주지 않는다", "색 · 공간 · 습관", "구매한 리포트 방(taste false)에서는 풀이에 필요하면 용어를 쓸 수 있고"]) assert.ok(CHAT_SYSTEM_PROMPT.includes(must), `0.6 지시: ${must}`);
  assert.ok(!CHAT_SYSTEM_PROMPT.includes("기준과 스스로 확인할 질문까지만 쓴다"), "방향 제시를 기준 · 질문까지로 제한한 줄은 없앴다");
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
