// 실행: npm test — 고민 반영 리포트: 고민 낱말 · 형식 검사 · 내용 차이(반영 · 중복) 검사 · 모의 작성기. 실제 AI를 부르지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../../assessment/modules/index.ts";
import { concernTerms, sameConcern } from "../../personalization/concern.ts";
import { filledFields, topicLabel, type PersonalContextInput } from "../../personalization/context.ts";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { buildEvidence, createAiReportGenerator } from "../ai/generator.ts";
import { composeMockDraft, createMockModel } from "../ai/mock-model.ts";
import type { TextModel } from "../ai/model.ts";
import { buildDevFreeSummary } from "../build-free-summary.ts";
import type { AiUsageSample, ConcernInput, ReportInput } from "../generator.ts";
import { JARGON } from "../reading/plan.ts";
import { buildUserMessage } from "../v2/prompt.ts";
import type { PersonalReportV2 } from "../v2/types.ts";
import { checkConcernDepth } from "./depth.ts";
import { composeMockConcernDraft } from "./mock-model.ts";
import { alreadyProvidedOf, buildConcernUserMessage, CONCERN_PROMPT_VERSION, CONCERN_SYSTEM_PROMPT } from "./prompt.ts";
import { personalV2Texts } from "./texts.ts";
import { validateConcernDraft } from "./validate.ts";

const REF = { year: 2026, month: 10 };
const blank = { question: "", situation: "", matched: "", differed: "", excerpt: "" };
const CONCERN: PersonalContextInput = {
  ...blank,
  topic: "work",
  question: "지금 다니는 회사를 계속 다닐지 이직을 준비할지 결정을 못 하고 있어요.",
  situation: "새로운 제안이 오면 처음엔 끌리다가 연봉 협상 이야기가 나오면 계속 미루게 돼요. 팀장님 앞에서는 말이 잘 안 나와요.",
};

function input(over: Partial<ReportInput> = {}): ReportInput {
  const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((item, i) => [item.id, (i % 5) + 1])));
  return {
    nickname: "서윤",
    knownMbti: "INFJ",
    birthText: "1994년 11월 7일 (양력) · 08:40",
    summary: buildDevFreeSummary(answers),
    saju: calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" }),
    gender: "female",
    context: null,
    ...over,
  };
}
const evidence = () => buildEvidence(input(), REF);
const baseReportTexts = () => {
  const draft = composeMockDraft(buildUserMessage(evidence(), "2026-10-12", null));
  return personalV2Texts({ ...draft, kind: "personal-v2" } as unknown as PersonalReportV2);
};
const concernMessage = (c: PersonalContextInput = CONCERN) => {
  const base = baseReportTexts();
  return buildConcernUserMessage({ evidence: evidence(), referenceDate: "2026-10-12", concern: c, alreadyProvided: alreadyProvidedOf(base, "서윤"), previousConcerns: [] });
};
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** 이미 준 리포트의 글을 "가져온 글"로 쓰는 시험용 — 새 규칙(본문에 사주 용어 · 점수 금지)에 걸리지 않게 그 낱말만 바꾸고 나머지는 그대로 둔다 */
const unjargon = (t: string) => t.replace(new RegExp(JARGON.source, "g"), "특징").replace(/백분위|\(\d{2,3}\)|\d{2,3}\s*점|\d+\s*%|퍼센트|확률/g, "");

test("고민 낱말: 조사 · 흔한 말을 빼고 핵심 낱말만 고르고, 대화 일부와 가려진 개인정보는 넣지 않는다", () => {
  const terms = concernTerms(CONCERN);
  for (const t of ["회사", "이직", "연봉", "협상", "팀장님"]) assert.ok(terms.includes(t), `${t} 포함 (${terms.join(",")})`);
  assert.ok(!terms.includes("회사를") && !terms.includes("있어요"));
  const withExcerpt = concernTerms({ ...CONCERN, excerpt: "엄청나게긴대화에만나오는낱말 이메일은 a@b.co 입니다" });
  assert.ok(!withExcerpt.some((t) => t.includes("긴대화")));
  assert.ok(!concernTerms({ ...blank, topic: "self", question: "연락은 010-1234-5678 으로 주세요 저한테" }).some((t) => /010|1234/.test(t)));
});

test("같은 고민 판단: 앞뒤 공백 · 줄바꿈 차이는 같고, 한 글자라도 고치면 다른 고민이다", () => {
  assert.equal(sameConcern(CONCERN, { ...CONCERN, question: `  ${CONCERN.question}\r\n` }), true);
  assert.equal(sameConcern(CONCERN, { ...CONCERN, question: CONCERN.question.replace("못 하고", "못하고") }), false);
  assert.equal(sameConcern(CONCERN, { ...CONCERN, topic: "money" }), false);
});

test("AI에게 보내는 자료: 이름 · 생년월일이 없고, 이미 준 내용의 이름은 {name}으로 바뀌고, 고민에 맞는 근거를 앞에 둔다", () => {
  const draft = composeMockDraft(buildUserMessage(evidence(), "2026-10-12", null));
  draft.headline = "서윤님의 해석";
  draft.summary[0].text = "서윤님은 신중한 편입니다.";
  const base = personalV2Texts({ ...draft, kind: "personal-v2" } as unknown as PersonalReportV2);
  const msg = buildConcernUserMessage({ evidence: evidence(), referenceDate: "2026-10-12", concern: CONCERN, alreadyProvided: alreadyProvidedOf(base, "서윤"), previousConcerns: [] });
  assert.doesNotMatch(msg, /서윤/);
  assert.doesNotMatch(msg, /1994|11월 7일|08:40/);
  assert.match(msg, /\{name\}/);
  assert.match(msg, /"task":"concern-report"/);
  const payload = JSON.parse(msg.slice(msg.indexOf("{"))) as { evidence: { forConcern: boolean }[] };
  const firstOther = payload.evidence.findIndex((e) => !e.forConcern);
  assert.ok(firstOther < 0 || payload.evidence.slice(firstOther).every((e) => !e.forConcern), "고민에 맞는 근거가 앞에 모여 있다");
  assert.ok(payload.evidence.some((e) => e.forConcern));
});

test("모의 고민 리포트는 형식 검사와 내용 차이 검사를 통과한다 (고민의 말이 반영되고, 이미 준 리포트와 다르다)", () => {
  const draft = composeMockConcernDraft(concernMessage());
  const valid = validateConcernDraft(draft, evidence());
  assert.deepEqual(valid.ok ? [] : valid.errors, []);
  const res = checkConcernDepth({ draft, concern: CONCERN, baseTexts: baseReportTexts().all });
  assert.deepEqual(res.errors, []);
  assert.ok(res.metrics.coverage >= 0.35, `반영 ${res.metrics.coverage}`);
  assert.ok(res.metrics.copiedShare <= 0.15, `겹침 ${res.metrics.copiedShare}`);
  assert.ok(res.metrics.novelty > 0.5);
});

test("고민을 받지 않은 일반 해석은 통과하지 못한다 — 고민의 말이 해석에 나오지 않으면 막는다", () => {
  const draft = composeMockConcernDraft(concernMessage());
  const generic = clone(draft);
  const bland = (i: number) => `[모의 생성] 사주에서 읽은 기운이 고르게 퍼져 있어 전체적으로 안정된 구조를 이루는 편이라는 해석${i}번 문단입니다. 이런 특징은 삶의 여러 장면에서 비슷하게 나타나는 경향이 있습니다.`;
  generic.understanding.forEach((p, i) => (p.text = `알려 주신 고민이 있어서 ${bland(i)}`));
  generic.pattern.forEach((p, i) => (p.text = bland(10 + i)));
  generic.situations.forEach((s, i) => ((s.situation = `[모의 생성] 어떤 상황 ${i}에서 일반적으로`), (s.reading = bland(20 + i)), (s.suggestion = `[모의 생성] 마음을 편하게 가지고 천천히 생각해 보는 ${i}번째 선택을 해 볼 수 있습니다.`)));
  generic.actions.forEach((a, i) => ((a.situation = `[모의 생성] 일반 상황 ${i}`), (a.action = `[모의 생성] 마음을 편하게 하는 ${i}번째 방법을 천천히 찾아봅니다.`)));
  const res = checkConcernDepth({ draft: generic, concern: CONCERN, baseTexts: baseReportTexts().all });
  assert.equal(res.pass, false);
  assert.ok(res.errors.some((e) => /고민의 말이 해석에 거의 나오지 않/.test(e)), res.errors.join("|"));
  assert.ok(res.errors.some((e) => /상황별 해석/.test(e)), res.errors.join("|"));
});

test("이미 준 개인 종합 리포트의 문장을 가져오면(기존 리포트에 문단만 더한 글) 막는다", () => {
  const base = baseReportTexts();
  const draft = composeMockConcernDraft(concernMessage());
  const copied = clone(draft);
  // 문단 대부분을 기존 리포트의 문단으로 바꾼다 (고민 낱말은 일부러 남겨 둔다)
  const longBase = base.sections.filter((t) => t.length > 120);
  copied.pattern[0].text = longBase[0];
  copied.pattern[1].text = longBase[1] ?? longBase[0];
  copied.situations[0].reading = longBase[2] ?? longBase[0];
  copied.situations[1].reading = longBase[3] ?? longBase[1] ?? longBase[0];
  copied.differences = [];
  const res = checkConcernDepth({ draft: copied, concern: CONCERN, baseTexts: base.all });
  assert.ok(res.metrics.copiedShare > 0.15, `겹침 ${res.metrics.copiedShare}`);
  assert.ok(res.errors.some((e) => /이미 준 개인 종합 리포트와 거의 같은 문단/.test(e)), res.errors.join("|"));
});

test("형식 검사: 고객이 알려 준 내용임을 밝히지 않거나, 만남 시기 · 사주로 맞힌 표현 · 근거 없는 문단은 막는다", () => {
  const draft = composeMockConcernDraft(concernMessage());
  const bad = clone(draft);
  bad.understanding[0].text = bad.understanding[0].text.replace("알려 주신", "정리한");
  bad.pattern[0].text += " 올해 안에 좋은 인연을 만나게 될 시기가 옵니다.";
  bad.pattern[1].text += " 사주에 이미 다 나와 있었던 고민입니다.";
  bad.situations[0].evidence = [];
  bad.actions = bad.actions.slice(0, 3);
  const res = validateConcernDraft(bad, evidence());
  assert.ok(!res.ok);
  const text = res.ok ? "" : res.errors.join("\n");
  for (const re of [/understanding\[0\]: 고객이 알려 준 내용/, /만남 시기 예언/, /사주로 맞힌/, /situations\[0\]: 근거 ID가 없습니다/, /actions: 3개 \(4~6개\)/]) assert.match(text, re);
});

test("고민 글이 아주 짧으면 반영 정도를 판단하지 않고 알리기만 한다", () => {
  const short: PersonalContextInput = { ...blank, topic: "self", question: "요즘 힘들어요" };
  const draft = composeMockConcernDraft(concernMessage(short));
  const res = checkConcernDepth({ draft, concern: short, baseTexts: baseReportTexts().all });
  assert.ok(res.errors.every((e) => !/고민의 말이 해석에/.test(e)));
});

test("이전 고민 리포트와 거의 같은 글이면 경고한다 (막지는 않는다)", () => {
  const draft = composeMockConcernDraft(concernMessage());
  const res = checkConcernDepth({ draft, concern: CONCERN, baseTexts: baseReportTexts().all, previousTexts: [[draft.headline, ...draft.pattern.map((p) => p.text), ...draft.situations.flatMap((s) => [s.reading, s.suggestion]), ...draft.actions.map((a) => a.action)]] });
  assert.equal(res.pass, true);
  assert.ok(res.warnings.some((w) => /이전에 발급한 고민 리포트/.test(w)), res.warnings.join("|"));
});

test("이전 고민 리포트와 다른 글이면 겹침이 작고 경고도 없다 (이전 고민과 지금 고민에 대한 해석이 서로 다른 글로 남는다)", () => {
  const draft = composeMockConcernDraft(concernMessage());
  const earlier = [
    "연애에서는 상대가 먼저 다가오기를 기다리다가 마음을 놓치는 일이 반복되는 편입니다. 이번에는 표현을 먼저 해 보는 쪽으로 방향을 바꿔 보세요.",
    "상견례 일정을 정할 때 부모님의 기대와 내 속도가 어긋나는 장면을 따로 적어 두면 결정이 쉬워질 수 있습니다.",
    "두 달 동안 주말마다 한 시간씩 서로의 기준을 이야기하는 시간을 정해 두는 방법을 생각해 볼 수 있습니다.",
  ];
  const res = checkConcernDepth({ draft, concern: CONCERN, baseTexts: baseReportTexts().all, previousTexts: [earlier] });
  assert.equal(res.pass, true);
  assert.equal(res.metrics.previousOverlap, 0);
  assert.ok(!res.warnings.some((w) => /이전에 발급한/.test(w)));
});

// ---- 생성기: 형식 · 내용 차이 검사를 거쳐야 저장한다 ----

const NOW = () => new Date("2026-10-12T03:00:00Z");
const noSleep = async () => {};
const SNAPSHOT = { recordId: "11111111-1111-4111-8111-111111111111", writtenAt: "2026-10-12T01:00:00.000Z" };

function concernInput(over: Partial<ConcernInput> = {}): ConcernInput {
  const base = input();
  const texts = baseReportTexts();
  return { nickname: base.nickname, knownMbti: base.knownMbti, summary: base.summary, saju: base.saju, gender: base.gender, concern: CONCERN, snapshot: SNAPSHOT, base: texts, previous: [], ...over };
}

/** 응답 목록을 차례로 돌려주는 모델 (마지막 응답은 되풀이) */
function scripted(make: (userMessage: string) => unknown[]): TextModel & { calls: number; roles: string[][] } {
  let queue: unknown[] | null = null;
  const m = {
    provider: "mock",
    model: "mock-0",
    calls: 0,
    roles: [] as string[][],
    async complete(req: { messages: { role: string; content: string }[] }) {
      m.calls++;
      m.roles.push(req.messages.map((x) => x.role));
      queue ??= make(req.messages[0].content);
      const next = queue.length > 1 ? queue.shift() : queue[0];
      return { text: JSON.stringify(next), model: "mock-0", usage: { inputTokens: 10, outputTokens: 20 } };
    },
  };
  return m;
}

test("고민 리포트 생성: 근거 · 고민 기록 번호 · 작성 시점을 남기고 고민 내용은 basis에 담지 않는다", async () => {
  const usage: AiUsageSample[] = [];
  const model = createMockModel();
  const gen = createAiReportGenerator({ model, now: NOW, sleep: noSleep });
  assert.equal(typeof gen.generateConcern, "function");
  const report = await gen.generateConcern!(concernInput(), { onUsage: (u) => usage.push(u) });
  assert.equal(model.calls, 1);
  assert.equal(report.kind, "concern-v1");
  assert.equal(report.personName, "서윤");
  assert.deepEqual(report.basis.concern, { recordId: SNAPSHOT.recordId, topic: "work", topicLabel: topicLabel("work"), fields: filledFields(CONCERN), writtenAt: SNAPSHOT.writtenAt });
  assert.ok(report.basis.ruleVersions.some((v) => v.startsWith("concern-v1-prompt")));
  assert.equal(report.basis.referenceDate, "2026-10-12");
  assert.ok(!/연봉|팀장님/.test(JSON.stringify(report.basis)), "basis에는 고객이 적은 내용이 없다");
  assert.ok(!JSON.stringify(report).includes("{name}"));
  const known = new Set(report.evidence.map((e) => e.id));
  for (const p of [...report.understanding, ...report.pattern, ...report.differences]) for (const id of p.evidence) assert.ok(known.has(id), id);
  assert.ok(report.basis.quality && report.basis.quality.coverage >= 0.35);
  assert.deepEqual(usage.map((u) => u.outcome), ["ok"]);
  assert.match(usage[0].promptVersion, /^concern-v1-prompt/);
});

test("고민 리포트 생성: 이미 준 리포트의 문단을 가져오면 이유를 알려 주고 한 번 다시 쓰게 한다", async () => {
  const base = baseReportTexts();
  const longBase = base.sections.filter((t) => t.length > 120);
  const usage: AiUsageSample[] = [];
  const model = scripted((user) => {
    const good = composeMockConcernDraft(user);
    const copied = clone(good);
    copied.pattern[0].text = unjargon(longBase[0]);
    copied.pattern[1].text = unjargon(longBase[1] ?? longBase[0]);
    copied.situations[0].reading = unjargon(longBase[2] ?? longBase[0]);
    copied.situations[1].reading = unjargon(longBase[3] ?? longBase[1] ?? longBase[0]);
    copied.differences = [];
    return [copied, good];
  });
  const report = await createAiReportGenerator({ model, now: NOW, sleep: noSleep }).generateConcern!(concernInput(), { onUsage: (u) => usage.push(u) });
  assert.equal(report.kind, "concern-v1");
  assert.deepEqual(model.roles, [["user"], ["user", "assistant", "user"]]);
  assert.deepEqual(usage.map((u) => u.outcome), ["invalid", "ok"], "실패한 호출도 사용 기록에 남는다");
});

test("고민 리포트 생성: 형식은 맞아도 고민을 반영하지 않은 일반 해석이 계속되면 저장하지 않고 실패한다 (같은 발급 건으로 다시 시도)", async () => {
  const model = scripted((user) => {
    const d = composeMockConcernDraft(user);
    // 형식 검사(길이 · 근거 · 반복)는 통과하지만 고객의 말이 하나도 나오지 않는 글
    const W = ["첫째", "둘째", "셋째", "넷째", "다섯째", "여섯째", "일곱째", "여덟째", "아홉째", "열째"];
    const K = ["차분함", "꾸준함", "신중함", "균형감", "절제력", "배려심", "집중력", "여유로움", "성실함", "유연함"];
    const bland = (i: number) =>
      `[모의 생성] 사주에서 읽은 기운이 고르게 퍼져 있어 전체적으로 안정된 구조를 이루는 편이라는 ${W[i % 10]} 해석입니다. 이런 특징은 삶의 여러 장면에서 비슷하게 나타나는 경향이 있고 ${K[(i * 3) % 10]}이 도드라지는 편입니다. 다만 이것은 ${W[(i + 5) % 10]} 가지 읽기이며 ${K[(i * 7 + 1) % 10]}에 따라 달라질 수 있습니다.`;
    d.understanding.forEach((p, i) => (p.text = `알려 주신 내용이 있어서 ${bland(i)}`));
    d.pattern.forEach((p, i) => (p.text = bland(2 + i)));
    d.situations.forEach((x, i) => ((x.situation = `[모의 생성] 어떤 상황 ${i}에서 일반적으로 나타나는 모습`), (x.reading = bland(4 + i)), (x.suggestion = `[모의 생성] ${["산책을 하며", "음악을 들으며", "차를 마시며", "일기를 쓰며", "스트레칭을 하며"][i % 5]} 마음을 편하게 가지고 천천히 생각해 보는 선택을 해 볼 수 있습니다.`)));
    d.actions.forEach((a, i) => ((a.situation = `[모의 생성] 일반 상황 ${i}`), (a.action = ["[모의 생성] 숨을 깊게 쉬면서 어깨의 힘을 풀고 잠시 쉬어 갑니다.", "[모의 생성] 따뜻한 물을 천천히 마시며 오늘 하루를 돌아봅니다.", "[모의 생성] 좋아하는 노래를 한 곡 듣고 기분이 어떻게 변하는지 느껴 봅니다.", "[모의 생성] 창밖의 풍경을 한동안 바라보며 생각을 비워 봅니다."][i % 4])));
    return [d];
  });
  await assert.rejects(createAiReportGenerator({ model, now: NOW, sleep: noSleep }).generateConcern!(concernInput()), /고민 리포트 검사 실패: .*고민의 말이 해석에 거의 나오지 않/);
  assert.equal(model.calls, 2, "처음 1번 + 고쳐 쓰기 1번");
});

test("고민 리포트 생성: 사주 계산 결과가 없으면 AI를 부르지 않는다", async () => {
  const model = createMockModel();
  await assert.rejects(createAiReportGenerator({ model, now: NOW, sleep: noSleep }).generateConcern!(concernInput({ saju: { status: "not-connected" } })), /사주 계산 결과가 없어/);
  assert.equal(model.calls, 0);
});

// ---- 읽기 규칙과 같은 본문 규칙 (2026-10-13): 쉬운 말 · 점수 · 원인 단정 · 나이 · 계산되지 않은 해 · 시기 이름 ----

const errorsOf = (mutate: (d: ReturnType<typeof composeMockConcernDraft>) => void) => {
  const d = composeMockConcernDraft(concernMessage());
  mutate(d);
  const r = validateConcernDraft(d, evidence());
  return r.ok ? [] : r.errors;
};

test("고민 리포트 형식 검사: 본문의 사주 용어 · 점수 · 퍼센트 · 원인 단정 · 나이 · 계산되지 않은 해를 막는다", () => {
  assert.deepEqual(errorsOf(() => {}), [], "모의 글은 새 규칙도 통과한다");
  assert.ok(errorsOf((d) => (d.pattern[0].text += " 원국에서 인성이 많은 구조라 신중하게 정하는 편입니다.")).some((e) => /사주 전문 용어/.test(e)));
  assert.ok(errorsOf((d) => (d.timeline[0].theme = "지금 대운은 현실적인 성과가 주제로 떠오르는 시기로 읽힙니다.")).some((e) => /사주 전문 용어\(대운\)/.test(e)));
  assert.ok(errorsOf((d) => (d.situations[0].reading += " 신중함이 71점으로 높아 한 번 더 따져 보게 될 수 있습니다.")).some((e) => /점수/.test(e)));
  assert.ok(errorsOf((d) => (d.pattern[1].text += " 그 반응은 성격이 아니라 시기 때문입니다.")).some((e) => /원인을 하나로 좁혀/.test(e)));
  assert.ok(errorsOf((d) => (d.understanding[0].text += " 서른 살 무렵의 결정이라 더 조심스러울 수 있습니다.")).some((e) => /나이/.test(e)));
  assert.ok(errorsOf((d) => (d.actions[0].action += " 2031년 전에 결정을 마무리해 봅니다.")).some((e) => /계산되지 않은 해 2031/.test(e)));
  assert.ok(errorsOf((d) => (d.pattern[0].text = `${d.pattern[0].text} 첫 번째 문장이 이어집니다. 두 번째 문장이 이어집니다. 세 번째 문장이 이어집니다. 네 번째 문장이 이어집니다.`)).some((e) => /문장 \(3문장 이하/.test(e)));
});

test("고민 리포트 지시문(0.2): 본문에 사주 용어 · 점수를 쓰지 않고, 시기 이름은 코드가 쉬운 말로 바꾸며, 행동의 시점을 임의로 정하지 않는다", () => {
  const msg = concernMessage();
  assert.match(CONCERN_SYSTEM_PROMPT, /사주 용어.*쓰지 않는다/);
  assert.match(CONCERN_SYSTEM_PROMPT, /시점이나 기간.*임의로 정하지 않는다/);
  assert.match(CONCERN_SYSTEM_PROMPT, /한 글자도 바꾸지 않고 그대로/);
  assert.doesNotMatch(CONCERN_SYSTEM_PROMPT, /한자와 쉬운 뜻을 붙이고/, "본문에 한자 풀이를 붙이라는 옛 규칙이 남지 않았다");
  assert.doesNotMatch(CONCERN_SYSTEM_PROMPT, /언제\(이번 주/, "행동에 시점을 강제하는 옛 규칙이 남지 않았다");
  const payload = JSON.parse(msg.slice(msg.indexOf("{"))) as { terms: { term: string; hanja?: string; plain: string }[] };
  assert.ok(payload.terms.length > 0 && payload.terms.every((t) => t.term && t.plain && t.hanja === undefined));
  assert.match(CONCERN_PROMPT_VERSION, /0\.2$/);
});

test("고민 리포트 생성: 저장되는 시기 이름은 쉬운 말이고(대운 · 간지 없음), 근거 목록의 원래 시기 이름은 그대로 남는다", async () => {
  const report = await createAiReportGenerator({ model: createMockModel(), now: NOW, sleep: noSleep }).generateConcern!(concernInput());
  assert.ok(report.timeline.length >= 1);
  for (const t of report.timeline) {
    assert.match(t.period, /^(지금 지나는 큰 흐름|다음 큰 흐름|\d{4}년)$/, t.period);
    assert.doesNotMatch(`${t.theme} ${t.opportunity} ${t.caution}`, JARGON);
  }
  assert.ok(report.evidence.some((e) => e.period && /대운/.test(e.period.label)), "근거 목록(접어 둔 근거)에는 원래 이름이 있다");
  // 본문 전체에 사주 용어 · 점수가 없다
  const body = [report.headline, ...report.understanding.map((p) => p.text), ...report.pattern.map((p) => p.text), ...report.situations.flatMap((s) => [s.situation, s.reading, s.suggestion]), ...report.actions.flatMap((a) => [a.situation, a.action])].join("\n");
  assert.doesNotMatch(body, JARGON);
  assert.doesNotMatch(body, /\d{2,3}\s*점|백분위|\(\d{2,3}\)/);
});

test("고민 반영 내용 검사: 행동의 시점을 정하지 않아도 실제로 하는 행동(적기 · 정하기 …)이 있으면 경고하지 않는다", () => {
  const draft = composeMockConcernDraft(concernMessage());
  const noTime = clone(draft);
  noTime.actions = noTime.actions.map((a, i) => ({ ...a, action: `[모의 생성] ${["마음에 걸리는 점을 세 줄로 적어 두고 다시 읽어 봅니다.", "기준 두 가지를 먼저 정하고 그 기준으로만 비교해 봅니다.", "바로 답하지 말고 한 문장으로 먼저 적어 둡니다.", "달라진 점을 기록하고 확인하는 시간을 따로 잡습니다."][i % 4]}` }));
  const res = checkConcernDepth({ draft: noTime, concern: CONCERN, baseTexts: [] });
  assert.ok(!res.warnings.some((w) => /실제로 하는 행동/.test(w)), res.warnings.join(" | "));
  assert.equal(res.metrics.actionConcreteShare, 1);
});
