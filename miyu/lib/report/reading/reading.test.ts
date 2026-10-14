// 실행: npm test — 개인 통합 리포트(읽기 구조)의 실제 생성 경로: 지시문 · 형식 검사 · 조립 · 저장 형식이 예시 화면과 같은 기준인지 확인한다.
// 가짜 모델만 쓴다(유료 호출 없음). 좋은 글인지는 이 검사가 보증하지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { sampleReadingAsDraft, sampleReadingReport } from "../../samples/sample-reading-report.ts";
import { sampleReport } from "../../samples/sample-report.ts";
import { buildEvidence, createAiReportGenerator } from "../ai/generator.ts";
import { composeMockReading } from "./mock-model.ts";
import { createMockModel } from "../ai/mock-model.ts";
import type { TextModel } from "../ai/model.ts";
import { reportTexts } from "../concern/texts.ts";
import { isReadingReport, type ReportInput } from "../generator.ts";
import { assembleReading, basisFor } from "./assemble.ts";
import { checkReadingDepth } from "./depth.ts";
import { findRepeatedPhrases, repeatMessages } from "./repeat.ts";
import { BLOCK_PLAN } from "./plan.ts";
import { buildReadingUserMessage, READING_SYSTEM_PROMPT } from "./prompt.ts";
import type { ReadingDraftV1 } from "./types.ts";
import { validateReadingDraft } from "./validate.ts";

const NOW = () => new Date("2026-10-12T03:00:00Z");
const REF = { year: 2026, month: 10 };
const noSleep = async () => {};

const SAJU = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" });
function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return { nickname: "서윤", knownMbti: "INFJ", birthText: "1994년 11월 7일 (양력) · 08:40", summary: sampleReport, saju: SAJU, gender: "female", context: null, ...overrides };
}
const evidence = buildEvidence(input(), REF);
const draft = (): ReadingDraftV1 => structuredClone(sampleReadingAsDraft());
const fakeModel = (text: string | (() => string)): TextModel & { calls: number; seen: string[] } => {
  const m = {
    provider: "mock",
    model: "mock-0",
    calls: 0,
    seen: [] as string[],
    async complete(req: { messages: { role: string; content: string }[] }) {
      m.calls++;
      m.seen.push(req.messages.map((x) => x.content).join("\n"));
      return { text: typeof text === "string" ? text : text(), model: "mock-0", usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
  return m as never;
};

const WORK_CONTEXT = {
  topic: "work" as const,
  question: "지금 회사를 옮겨도 될지, 무엇을 기준으로 정해야 할지 궁금해요.",
  situation: "새 제안이 오면 처음엔 끌리다가 결정할 때가 되면 계속 미뤄요",
  matched: "",
  differed: "",
  excerpt: "",
  updatedAt: "2026-10-12T01:00:00.000Z",
};

test("기본 생성 형식은 읽기 구조다 — 모의 모델로 만든 리포트가 예시와 같은 구성(주제 5개 · 큰 흐름 · 행동)이고 저장 형식 값을 채운다", async () => {
  const model = createMockModel();
  const generator = createAiReportGenerator({ model, now: NOW, sleep: noSleep });
  const report = await generator.generate(input());
  assert.equal(model.calls, 1);
  assert.ok(isReadingReport(report));
  assert.deepEqual(report.blocks.map((b) => b.id), BLOCK_PLAN.map((b) => b.id));
  assert.deepEqual(report.blocks.map((b) => b.topic), sampleReadingReport.blocks.map((b) => b.topic));
  assert.deepEqual(report.summary.map((s) => s.kind), ["strength", "caution", "flow"]);
  assert.equal(report.personName, "서윤");
  assert.equal(report.saju?.status, "computed");
  assert.ok(report.base && report.extras, "요약과 규칙 기반 구성 요소가 함께 저장된다");
  assert.ok(report.generated);
  assert.match(generator.version, /mock-0\|reading-v1-prompt-.*\|saju-rules-/);
  assert.deepEqual(report.generated.ruleVersions.slice(-1), [report.generated.promptVersion]);
  assert.equal(report.generated.referenceDate, "2026-10-12");
  assert.ok(!JSON.stringify(report).includes("{name}"));
  // 코드가 채우는 값: 타임라인은 계산 결과, 큰 흐름 카드의 기간 문장도 계산 결과
  assert.deepEqual(report.timeline.map((s) => s.role), ["previous", "current", "next"]);
  assert.match(report.summary[2].note, /^2024\.08부터 2034\.07까지, 지금은 그 앞부분을 지나고 있어요\.$/);
});

test("가짜 모델이 예시와 같은 초안을 돌려주면, 생성기가 만든 리포트의 구조 · 고정 문구 · 타임라인 · 자료 목록이 예시와 같다 (예시와 실제 생성의 기준이 같다)", async () => {
  const model = fakeModel(JSON.stringify(sampleReadingAsDraft()));
  const report = await createAiReportGenerator({ model, now: NOW, sleep: noSleep }).generate(input());
  assert.ok(isReadingReport(report));
  const S = sampleReadingReport;
  assert.equal(report.headline, S.headline);
  assert.deepEqual(report.summary, S.summary);
  assert.deepEqual(report.inputs, S.inputs);
  assert.deepEqual(report.timeline, S.timeline);
  assert.deepEqual(report.timelineReference, S.timelineReference);
  assert.deepEqual(report.actions, S.actions);
  // 비교에서 뺀다: 분석 근거(코드가 근거 목록에서 만든다)와 내부 근거 ID
  const strip = <T extends { basis?: unknown; evidence?: unknown }>(x: T) => {
    const rest: Record<string, unknown> = { ...x };
    delete rest.basis;
    delete rest.evidence;
    return rest;
  };
  assert.deepEqual(report.blocks.map(strip), S.blocks.map(strip));
  assert.deepEqual(strip(report.flow), strip(S.flow));
});

test("접어 둔 분석 근거는 AI가 쓰지 않고 근거 목록에서 코드가 만든다 — 계산 결과 · 전통 해석 · 응답을 나누고, 쓰인 사주 용어는 한자와 쉬운 뜻을 붙인다", async () => {
  const report = await createAiReportGenerator({ model: fakeModel(JSON.stringify(sampleReadingAsDraft())), now: NOW, sleep: noSleep }).generate(input());
  assert.ok(isReadingReport(report));
  const tendency = report.blocks[0].basis;
  const byId = new Map(evidence.map((e) => [e.id, e]));
  for (const id of report.blocks[0].evidence.filter((x) => x.startsWith("saju."))) assert.ok(tendency.computed.includes(byId.get(id)!.fact), id);
  for (const id of report.blocks[0].evidence.filter((x) => x.startsWith("saju."))) assert.ok(tendency.tradition.includes(byId.get(id)!.cue), id);
  assert.ok(tendency.computed.some((l) => /^용어 · 일간\(日干\):/.test(l)), "용어 풀이에 한자가 있다");
  assert.ok(tendency.answers.some((l) => /신중함 \d+ \(응답 환산값/.test(l)));
  assert.ok(tendency.answers.some((l) => /본인이 알고 있는 MBTI INFJ/.test(l)));
  assert.ok(tendency.unknown.some((l) => /전문가 검토 전 초안/.test(l)));
  assert.ok(tendency.unknown.some((l) => /공식 MBTI 검사 결과가 아닙니다/.test(l)));
  assert.ok(tendency.unknown.some((l) => /개발용 예시/.test(l)));
  // 응답 근거를 달지 않은 주제는 응답 없이 사주만으로 읽었다고 밝힌다
  const sajuOnly = basisFor(["saju.daymaster"], evidence);
  assert.deepEqual(sajuOnly.answers, []);
  assert.ok(sajuOnly.unknown.some((l) => /응답 자료 없이 사주만으로/.test(l)));
  // 시기 근거: 기준이 흔들릴 수 있는 근거(uncertain)는 해석에 쓰지 않았다는 안내로만 남긴다
  const flowBasis = basisFor(report.flow.evidence, evidence, { uncertain: true });
  for (const e of evidence.filter((x) => x.uncertain)) assert.ok(flowBasis.unknown.some((l) => l.startsWith(e.fact)));
  // 화면에 보이는 글에는 근거 ID가 나오지 않는다
  assert.doesNotMatch(JSON.stringify(reportTexts(report)), /\b(saju|survey|self)\.[\w.가-힣-]+/);
});

test("AI에게 보내는 자료에는 이름 · 생년월일 원문이 없고, 구성(blocks) · 고를 수 있는 시기(periods) · 쉬운 말 풀이(terms)가 들어 있다", () => {
  const msg = buildReadingUserMessage(evidence, "2026-10-12");
  assert.doesNotMatch(msg, /서윤/);
  assert.doesNotMatch(msg, /1994|11월 7일|08:40/);
  const payload = JSON.parse(msg.slice(msg.indexOf("{")));
  assert.deepEqual(payload.blocks.map((b: { id: string }) => b.id), BLOCK_PLAN.map((b) => b.id));
  assert.deepEqual(payload.periods.map((p: { ref: string }) => p.ref).slice(0, 3), ["current", "next", "y2026"]);
  assert.ok(payload.terms.every((t: { term: string; plain: string }) => t.term && t.plain));
  assert.doesNotMatch(msg, /"context"/);
  // 지시문은 예시와 같은 한도(plan.ts)를 숫자로 담는다
  assert.match(READING_SYSTEM_PROMPT, /headline: .*10~40자/);
  assert.match(READING_SYSTEM_PROMPT, /요약은 제목을 그대로 옮기지 않는다/);
  assert.match(READING_SYSTEM_PROMPT, /사주 용어.*쓰지 않는다/);
});

test("형식 검사: 예시 초안은 통과하고, 모의 초안도 통과한다", () => {
  assert.ok(validateReadingDraft(draft(), evidence).ok);
  const mock = composeMockReading(buildReadingUserMessage(evidence, "2026-10-12"));
  const r = validateReadingDraft(mock, evidence);
  assert.ok(r.ok, r.ok ? "" : r.errors.join("\n"));
});

const errorsOf = (mutate: (d: ReadingDraftV1) => void, opts: { hasContext?: boolean } = {}) => {
  const d = draft();
  mutate(d);
  const r = validateReadingDraft(d, evidence, opts);
  return r.ok ? [] : r.errors;
};

test("형식 검사: 본문의 사주 용어 · 점수 · 퍼센트 · 원인 단정 · 나이를 막는다", () => {
  assert.ok(errorsOf((d) => (d.blocks[0].summary = "원국에서 인성이 많아 신중한 편입니다. 익숙한 방식을 선호합니다.")).some((e) => /사주 전문 용어/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[0].watch = "지금 대운은 성과가 주제인 시기로 읽습니다. 이 흐름을 살펴보세요.")).some((e) => /사주 전문 용어\(대운\)/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[1].traits![0].shines = "신중함 71점으로 완성도가 중요한 일에서 강점이 될 수 있습니다.")).some((e) => /점수/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[3].watch = "상대가 일부러 거리를 두는 것이 아니라 바쁘기 때문입니다. 직접 확인해 보세요.")).some((e) => /원인을 하나로 좁혀/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[4].example = "서른 살 즈음 새 프로젝트를 맡으면 처음에는 자료를 읽느라 조용할 수 있습니다. 구조가 잡히면 빨라질 수 있습니다. 32살에도 같을 수 있습니다.")).some((e) => /나이|3문장/.test(e)));
});

test("형식 검사: 없는 근거 ID · 사주 근거 없음 · 시기 근거 없음 · 계산되지 않은 해 · 없는 시기 ref를 막는다", () => {
  assert.ok(errorsOf((d) => (d.blocks[0].evidence = ["saju.없는근거"])).some((e) => /없는 근거 ID/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[0].evidence = ["survey.caution.high"])).some((e) => /사주 근거가 없습니다/.test(e)));
  assert.ok(errorsOf((d) => (d.flow.evidence = ["saju.spouse-palace"])).some((e) => /시기 근거/.test(e)));
  assert.ok(errorsOf((d) => (d.flow.years[0].year = "2031")).some((e) => /계산된 해가 아닙니다/.test(e)));
  assert.ok(errorsOf((d) => (d.flow.periods[1].ref = "y2040")).some((e) => /ref가 목록에 없습니다/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[4].watch = "2031년에는 큰 성과가 나올 수 있으니 미리 준비해 두면 좋습니다. 다만 단정하지는 않습니다.")).some((e) => /계산되지 않은 해 2031/.test(e)));
  assert.ok(errorsOf((d) => (d.flow.periods[1].ref = d.flow.periods[0].ref)).some((e) => /두 번 썼습니다/.test(e)));
});

test("형식 검사: 구성 · 글자 수 · 문장 수 · 예시 위치 · 되풀이를 막는다", () => {
  assert.ok(errorsOf((d) => d.blocks.pop()).some((e) => /blocks: 4개/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[0].summary = "짧아요.")).some((e) => /summary: 길이/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[0].summary = "첫 번째 문장은 이렇게 씁니다 충분히 길게. 두 번째 문장도 이렇게 씁니다 충분히 길게. 세 번째 문장까지 이어 쓰면 안 됩니다 충분히 길게.")).some((e) => /문장 \(2문장 이하/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[0].summary = `${d.blocks[0].headline} 이 제목을 그대로 다시 쓰는 요약은 같은 말을 되풀이하는 것입니다.`)).some((e) => /제목을 그대로 되풀이/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[1].example = "특징 카드가 있는 주제에는 따로 예시를 두지 않습니다. 이 예시는 들어가면 안 됩니다.")).some((e) => /예시를 따로 두지 않습니다/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[3].comfort = undefined)).length > 0);
  assert.ok(errorsOf((d) => d.blocks[1].traits!.pop()).some((e) => /traits: 2개/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[1].traits![1].example = d.blocks[1].traits![0].example)).some((e) => /같은 장면/.test(e)));
  assert.ok(errorsOf((d) => d.actions.splice(2)).some((e) => /actions: 2개/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[2].details[0] = d.blocks[0].details[0])).some((e) => /같은 문장이 반복/.test(e)));
  assert.ok(errorsOf((d) => (d.flow.scenarios[0].then = "상대는 별일 없다고 느끼는데 혼자 지치게 됩니다.")).some((e) => /가능성으로/.test(e)));
});

test("형식 검사: 해요체로 쓴 사건 예언 · 단정 · 진단 · 나이대 · 원인 좁히기도 막고, 공유용 카드에 실리는 핵심 문장 · 카드에는 이름을 쓰지 않는다", () => {
  for (const bad of ["올해 안에 결혼하게 될 거예요.", "곧 이별할 거예요.", "반드시 좋은 일이 생겨요.", "이건 불안 진단이에요.", "30대에는 크게 달라질 수 있어요.", "그건 불안 때문에 생기는 일이에요."]) {
    assert.ok(errorsOf((d) => (d.blocks[0].watch = `${bad} 적어 보면 도움이 될 수 있어요.`)).length > 0, `통과하면 안 되는 문장: ${bad}`);
  }
  // 부정 안내 · 일상 표현은 막지 않는다
  for (const okText of ["이건 진단이 아니에요. 참고로 읽어 주세요.", "그 때문에 늦어질 수 있어요."]) assert.deepEqual(errorsOf((d) => (d.blocks[0].watch = `${okText} 적어 보면 도움이 될 수 있어요.`)).filter((e) => /watch/.test(e) && /쓰지 않는 표현|나이|원인/.test(e)), [], okText);
  assert.ok(errorsOf((d) => (d.headline = "{name} 님은 다듬어서 내놓는 사람이에요.")).some((e) => /headline: 이름을 쓰지 않습니다/.test(e)));
  assert.ok(errorsOf((d) => (d.cards.strength.note = "{name} 님은 배운 걸 정리해서 말할 때 힘이 나요.")).some((e) => /cards.strength.note: 이름을 쓰지 않습니다/.test(e)));
  assert.ok(!errorsOf((d) => (d.blocks[0].summary = "{name} 님은 새로운 일 앞에서 위험은 없는지 먼저 살펴보는 편이에요. 익숙한 방식이 편한 사람이에요.")).some((e) => /이름을 쓰지 않습니다/.test(e)), "다른 글에서는 가끔 이름을 불러도 된다");
});

test("형식 검사: 알려 준 고민이 없는데 focus · '알려 주신'을 쓰면 막고, 있는데 빠지거나 말해 준 내용임을 밝히지 않으면 막는다", () => {
  assert.ok(errorsOf((d) => (d.focus = [{ text: "알려 주신 고민을 반영하면 결정 앞에서 기준을 먼저 정하는 것이 도움이 될 수 있습니다. ".repeat(2), evidence: ["saju.daymaster"] }])).some((e) => /알려 주신 고민이 없는데 focus/.test(e)));
  assert.ok(errorsOf((d) => (d.blocks[0].watch = "알려 주신 내용처럼 한 가지로 정하기보다 상황마다 적어 보면 좋습니다. 다시 살펴봅니다.")).some((e) => /알려 주신/.test(e)));
  assert.ok(errorsOf(() => {}, { hasContext: true }).some((e) => /focus: 목록이 아닙니다/.test(e)));
  const text = "회사를 옮길지 정하는 일은 정보를 모은 뒤에 움직이는 방식과 만날 수 있습니다. 기준을 먼저 적어 두면 정하는 때에 덜 흔들릴 수 있습니다. 결정은 직접 내리는 것이며, 확인할 질문까지만 정리했습니다.";
  assert.ok(errorsOf((d) => (d.focus = [{ text, evidence: ["saju.daymaster"] }]), { hasContext: true }).some((e) => /알려 준 내용임을 밝히며/.test(e)));
  assert.deepEqual(errorsOf((d) => (d.focus = [{ text: `알려 주신 고민을 반영하면, ${text}`, evidence: ["saju.daymaster"] }]), { hasContext: true }), []);
});

test("내용 차이 검사: 조건 없이 단정하는 글 · 범용 문장 · 모의 글 · 같은 행동 반복을 거른다 (좋은 글의 보증은 아니다)", () => {
  const ok = checkReadingDepth({ draft: draft() });
  assert.ok(ok.pass, ok.flags.map((f) => f.message).join("\n"));
  const generic = draft();
  for (const b of generic.blocks) {
    b.summary = "누구나 가끔은 지치고 때로는 힘을 내며 산다. 내면에는 인정받고 싶은 마음이 있다.";
    b.example = "사람들은 대체로 비슷한 마음으로 하루를 보내고 이해받고 싶은 마음이 있다.";
    b.details = ["겉으로는 강해 보이지만 속으로는 여린 면이 있는 사람이다. 숨은 잠재력이 크다."];
  }
  const g = checkReadingDepth({ draft: generic });
  assert.ok(!g.pass);
  assert.ok(g.flags.some((f) => f.id === "generic" || f.id === "condition" || f.id === "self-overlap"));
  const mock = checkReadingDepth({ draft: composeMockReading(buildReadingUserMessage(evidence, "2026-10-12")) });
  assert.ok(!mock.pass && mock.flags.some((f) => f.id === "placeholder"), "모의 글은 판매할 수 없다");
  const same = draft();
  same.actions = same.actions.slice(0, 3).map((a) => ({ ...a, detail: same.actions[0].detail }));
  assert.ok(checkReadingDepth({ draft: same }).flags.some((f) => f.id === "actions-distinct"));
});

test("형식 검사에 실패하면 문제 목록을 주고 한 번 다시 쓰게 하며, 계속 틀리면 오류를 던진다", async () => {
  const bad = { headline: "짧음" };
  let n = 0;
  const model = fakeModel(() => (n++ === 0 ? JSON.stringify(bad) : JSON.stringify(sampleReadingAsDraft())));
  const report = await createAiReportGenerator({ model, now: NOW, sleep: noSleep }).generate(input());
  assert.ok(isReadingReport(report));
  assert.equal(model.calls, 2);
  assert.match(model.seen[1], /검사를 통과하지 못했습니다/);
  assert.match(model.seen[1], /headline: 길이/);
  const stubborn = fakeModel(JSON.stringify(bad));
  await assert.rejects(createAiReportGenerator({ model: stubborn, now: NOW, sleep: noSleep }).generate(input()), /리포트 형식 검사 실패: .*headline/);
  assert.equal(stubborn.calls, 2);
  await assert.rejects(createAiReportGenerator({ model: fakeModel("JSON이 아닙니다"), now: NOW, sleep: noSleep }).generate(input()), /리포트 형식 검사 실패: JSON 형식이 아닙니다/);
});

test("내용 검사를 켜면(enforceDepth) 형식은 맞아도 내용이 얕은 글은 한 번 고쳐 쓰게 하고, 모의 글은 저장하지 않는다 — 기본은 꺼 둔다", async () => {
  // 기본: 모의 글도 형식만 맞으면 저장된다 (로컬 전체 흐름 검사용)
  const mockReport = await createAiReportGenerator({ model: createMockModel(), now: NOW, sleep: noSleep }).generate(input());
  assert.ok(isReadingReport(mockReport));
  // 켜면: 모의 글은 거른다
  await assert.rejects(createAiReportGenerator({ model: createMockModel(), now: NOW, sleep: noSleep, enforceDepth: true }).generate(input()), /모의 생성 표시/);
  // 한 번 고쳐 쓰는 경로: 첫 응답은 모의 글, 두 번째는 정상
  let n = 0;
  const m = fakeModel(() => (n++ === 0 ? JSON.stringify(composeMockReading(buildReadingUserMessage(evidence, "2026-10-12"))) : JSON.stringify(sampleReadingAsDraft())));
  const ok = await createAiReportGenerator({ model: m, now: NOW, sleep: noSleep, enforceDepth: true }).generate(input());
  assert.ok(isReadingReport(ok));
  assert.equal(m.calls, 2);
  assert.match(m.seen[1], /모의 생성 표시/);
});

test("내 고민 자세히 알려주기: 고민을 AI 자료에 넣되 연락처는 가리고, 리포트에 '알려 주신 고민' 해석과 반영 항목(내용 없이)을 남긴다", async () => {
  const withPhone = { ...WORK_CONTEXT, question: `${WORK_CONTEXT.question} 연락은 010-1234-5678로 주세요` };
  const model = createMockModel();
  const seen: string[] = [];
  const wrapped: TextModel = { provider: "mock", model: "mock-0", complete: (req) => (seen.push(req.messages[0].content), model.complete(req)) };
  const report = await createAiReportGenerator({ model: wrapped, now: NOW, sleep: noSleep }).generate(input({ context: withPhone }));
  assert.ok(isReadingReport(report));
  assert.match(seen[0], /"topic":"일 · 진로 · 이직"/);
  assert.match(seen[0], /\[연락처 가림\]/);
  assert.doesNotMatch(seen[0], /010-1234-5678/);
  assert.equal(report.focus?.length, 1);
  assert.match(report.focus![0].text, /알려 주신 고민\(일 · 진로 · 이직\)/);
  assert.deepEqual(report.generated?.context, { topic: "work", topicLabel: "일 · 진로 · 이직", fields: ["지금 가장 궁금한 문제", "최근 반복되는 상황"], updatedAt: "2026-10-12T01:00:00.000Z" });
  assert.doesNotMatch(JSON.stringify(report.generated), /회사를 옮겨도/, "리포트 기준 정보에는 적은 내용을 담지 않는다");
  const used = report.inputs.find((i) => i.name === "알려 준 고민 · 상황")!;
  assert.equal(used.status, "used");
  assert.deepEqual(used.usedIn, ["알려 주신 고민"]);
  // 적지 않았으면 focus도 context도 없다
  const plain = await createAiReportGenerator({ model: createMockModel(), now: NOW, sleep: noSleep }).generate(input());
  assert.ok(isReadingReport(plain));
  assert.equal(plain.focus, undefined);
  assert.equal(plain.generated?.context, undefined);
  assert.equal(plain.inputs.find((i) => i.name === "알려 준 고민 · 상황")!.status, "none");
});

test("성별이 없어 대운을 계산하지 못하면 큰 흐름 타임라인은 비고, 카드는 기간을 지어내지 않고 가까운 해만 읽는다", async () => {
  const noGender = input({ gender: null, saju: calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40" }) });
  const e = buildEvidence(noGender, REF);
  assert.ok(!e.some((x) => x.id.startsWith("saju.daeun")));
  const report = await createAiReportGenerator({ model: createMockModel(), now: NOW, sleep: noSleep }).generate(noGender);
  assert.ok(isReadingReport(report));
  assert.deepEqual(report.timeline, []);
  assert.match(report.summary[2].note, /기간은 계산하지 못했어요/);
  assert.ok(report.flow.periods.every((p) => /^\d{4}년$/.test(p.period)));
});

test("조립: 이름에 따옴표 · 역슬래시가 있어도 글이 깨지지 않고, 이름은 저장할 때만 채운다", () => {
  const d = draft();
  d.headline = "{name} 님은 다듬어서 말하는 편입니다";
  const r = assembleReading({ draft: d, evidence, input: { nickname: '서"윤\\', knownMbti: null, summary: sampleReport, saju: SAJU, context: null }, reference: { ...REF, iso: "2026-10-12" }, promptVersion: "x", ruleVersions: ["x"] });
  assert.equal(r.headline, '서"윤\\ 님은 다듬어서 말하는 편입니다');
  assert.equal(r.inputs.find((i) => i.name === "MBTI")!.status, "none");
});

test("저장된 리포트 글 뽑기: 읽기 구조 리포트도 이미 준 리포트의 글로 읽힌다 (고민 리포트가 되풀이하지 않게)", async () => {
  const report = await createAiReportGenerator({ model: fakeModel(JSON.stringify(sampleReadingAsDraft())), now: NOW, sleep: noSleep }).generate(input());
  const t = reportTexts(report);
  assert.equal(t.headline, sampleReadingReport.headline);
  assert.equal(t.summary.length, 5);
  assert.ok(t.all.some((x) => x.includes("후기부터 읽어 본 적 있죠")));
  assert.ok(t.actions.length >= 3);
});

test("반복 표현 검사: 서윤 예시에는 없고, 같은 구절이 서로 다른 주제에 되풀이되면 찾아 알려 준다 (말만 바꾼 반복은 못 찾는다)", () => {
  assert.deepEqual(findRepeatedPhrases(draft()), []);
  const d = draft();
  // 실제 AI 글(가상 인물)에서 같은 구절이 두 주제에 되풀이됐던 모양
  d.blocks[0].details[0] = "응답에서는 상황이 바뀌면 방향을 빠르게 바꾸는 경향도 보여요. 처음엔 오래 재다가도 판이 달라지면 방향을 틀 수 있어요.";
  d.blocks[4].details[0] = "응답에서는 익숙한 방식을 편하게 느끼고 상황이 바뀌면 방향을 빠르게 바꾸는 경향이 보여요.";
  const found = findRepeatedPhrases(d);
  assert.equal(found.length, 1);
  assert.match(found[0].phrase, /상황이 바뀌면 방향을 빠르게 바꾸는 경향/);
  assert.deepEqual(found[0].where, ["blocks.tendency.details[0]", "blocks.work-money.details[0]"]);
  assert.match(repeatMessages(found)[0], /되풀이돼요.*상황이 바뀌면 방향을 빠르게/);
  // 시기 구역 안의 층층이 풀이는 반복으로 세지 않는다
  const f = draft();
  f.flow.cardText = "지금 지나는 시기는 결과를 정리하고 관리하는 일이 주제로 읽혀요.";
  f.flow.periods[0].theme = "결과를 정리하고 관리하는 일이 주제로 읽혀요.";
  assert.deepEqual(findRepeatedPhrases(f), []);
});

test("반복 표현 고쳐 쓰기(repairRepeats): 켜면 한 번 고쳐 쓰게 하고, 고쳐 쓴 글이 형식에서 떨어지거나 마지막에도 반복이 남으면 받아 둔다 — 실패로 만들지 않는다", async () => {
  const repeated = draft();
  repeated.blocks[0].details[0] = "응답에서는 상황이 바뀌면 방향을 빠르게 바꾸는 경향도 보여요. 처음엔 오래 재다가도 판이 달라지면 방향을 틀 수 있어요.";
  repeated.blocks[4].details[0] = "응답에서는 익숙한 방식을 편하게 느끼고 상황이 바뀌면 방향을 빠르게 바꾸는 경향이 보여요.";
  const clean = draft();

  // 끄면(기본) 반복이 있어도 첫 응답을 그대로 받는다
  const off = fakeModel(() => JSON.stringify(repeated));
  assert.ok(isReadingReport(await createAiReportGenerator({ model: off, now: NOW, sleep: noSleep }).generate(input())));
  assert.equal(off.calls, 1);

  // 켜면: 첫 응답에 반복 → 이유를 알려 고쳐 쓰게 하고, 깨끗한 두 번째 글을 쓴다
  let n = 0;
  const fix = fakeModel(() => JSON.stringify(n++ === 0 ? repeated : clean));
  const ok = await createAiReportGenerator({ model: fix, now: NOW, sleep: noSleep, repairRepeats: true }).generate(input());
  assert.equal(fix.calls, 2);
  assert.match(fix.seen[1], /같은 표현이 여러 곳에 되풀이돼요/);
  assert.ok(isReadingReport(ok));

  // 고쳐 쓴 글이 형식 검사에서 떨어지면 첫 글을 쓴다 (실패로 만들지 않는다)
  let k = 0;
  const broken = fakeModel(() => (k++ === 0 ? JSON.stringify(repeated) : "{}"));
  assert.ok(isReadingReport(await createAiReportGenerator({ model: broken, now: NOW, sleep: noSleep, repairRepeats: true }).generate(input())));
  assert.equal(broken.calls, 2);

  // 마지막 시도에도 반복이 남아 있으면 그대로 받는다 (더 고쳐 쓰라고 하지 않는다)
  const stuck = fakeModel(() => JSON.stringify(repeated));
  assert.ok(isReadingReport(await createAiReportGenerator({ model: stuck, now: NOW, sleep: noSleep, repairRepeats: true }).generate(input())));
  assert.equal(stuck.calls, 2);
});
