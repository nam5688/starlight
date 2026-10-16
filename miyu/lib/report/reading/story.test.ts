// 영역별 이야기(story-v1) — 근거(평소 행동 방식 · MBTI 방향) · 지시문 · 형식 검사 · 조립 · 생성기 · 채팅 · 내보내기를 확인한다. 실제 AI는 부르지 않는다(모의 작성기만).
import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidence, createAiReportGenerator } from "../ai/generator.ts";
import { buildPersonas } from "../ai/compare-personas.ts";
import { createMockModel } from "../ai/mock-model.ts";
import { mbtiDirections, surveyEvidence } from "../survey-evidence.ts";
import { sampleReport } from "../../samples/sample-report.ts";
import { SAMPLE_EVIDENCE } from "../../samples/sample-reading-report.ts";
import { READING_SYSTEM_PROMPT } from "./prompt.ts";
import { renderReadingMarkdown } from "./render-text.ts";
import { composeMockStory } from "./story-mock-model.ts";
import { STORY_AREAS } from "./story-plan.ts";
import { buildStoryUserMessage, personalEvidenceFor, STORY_SYSTEM_PROMPT } from "./story-prompt.ts";
import { assembleStory, storyDepthSource } from "./story-assemble.ts";
import { validateStoryDraft } from "./story-validate.ts";
import { availableRooms, startRoom } from "./talk-room.ts";
import { buildTalkModel } from "./talk.ts";
import { isReadingReport, isStoryReport, type StoryDraftV1 } from "./types.ts";
import { readingTexts } from "../concern/texts.ts";
import { checkReadingDepth } from "./depth.ts";
import { findRepeatedPhrasesIn } from "./repeat.ts";
import { visibleStoryTexts } from "./story-validate.ts";

const P01 = buildPersonas(1)[0];
const REF = { year: 2026, month: 10 };
const P01_EVIDENCE = buildEvidence(P01.input, REF);

/** 근거 목록으로 모의 작성기가 만든 초안 — 형식 검사를 통과하는 자리 표시 글 */
const mockDraft = (evidence = P01_EVIDENCE, context = P01.input.context): StoryDraftV1 => composeMockStory(buildStoryUserMessage(evidence, "2026-10-16", context));
const clone = <T,>(x: T): T => structuredClone(x);
const errorsOf = (mutate: (d: StoryDraftV1) => void, evidence = P01_EVIDENCE, hasContext = true) => {
  const d = clone(mockDraft(evidence));
  mutate(d);
  const r = validateStoryDraft(d, evidence, { hasContext });
  return r.ok ? [] : r.errors;
};

// ───── 근거: 평소 행동 방식 네 가지와 입력한 MBTI의 방향 ─────

test("평소 행동 방식(에너지 · 정보 · 판단 · 생활)이 뚜렷한 쪽만 응답 근거로 넘어간다 — 예전에는 AI에게 가지 않았다", () => {
  const ids = P01_EVIDENCE.filter((e) => e.source === "survey").map((e) => e.id);
  // P01(가상)의 네 가지는 모두 뚜렷한 쪽이다
  for (const id of ["survey.ei.low", "survey.sn.high", "survey.tf.high", "survey.jp.low"]) assert.ok(ids.includes(id), id);
  // 기질 4 · 가까운 관계 2는 그대로
  for (const id of ["survey.novelty.low", "survey.caution.high", "survey.sensitivity.high", "survey.persistence.low", "survey.anxiety.low", "survey.avoidance.high"]) assert.ok(ids.includes(id), id);
  const ei = P01_EVIDENCE.find((e) => e.id === "survey.ei.low")!;
  assert.match(ei.fact, /에너지를 채우는 방식: 함께하며 채움/);
  assert.match(ei.cue, /^응답에서 나타난 행동 경향: /);
  assert.ok(!/\b[EI][NS][TF][JP]\b/.test(ei.fact + ei.cue), "글자 코드는 근거에도 쓰지 않는다");
});

test("가운데 점수의 방향은 근거로 만들지 않는다", () => {
  const mid = clone(sampleReport);
  mid.mbti.axes = mid.mbti.axes.map((a) => ({ ...a, score: 50 }));
  assert.equal(surveyEvidence(mid, null).filter((e) => /^survey\.(ei|sn|tf|jp)\./.test(e.id)).length, 0);
});

test("입력한 MBTI는 알파벳이 아니라 선호의 방향으로 풀어 근거 문구에 건넨다 — 형식이 아니면 만들지 않는다", () => {
  assert.deepEqual(mbtiDirections("INFJ"), [
    "에너지는 안에서 충분히 정리한 뒤 밖으로 꺼내는 쪽",
    "정보는 전체 의미와 가능성을 먼저 보는 쪽",
    "판단은 사람과 관계에 미칠 영향을 먼저 보는 쪽",
    "생활은 미리 정해 두어야 마음이 놓이는 쪽",
  ]);
  assert.equal(mbtiDirections("ABCD"), null);
  assert.equal(mbtiDirections("모름"), null);
  const mbti = P01_EVIDENCE.find((e) => e.id === "self.mbti")!;
  assert.equal(mbti.strength, "weak");
  assert.ok(mbti.topics.includes("relationship") && mbti.topics.includes("work") && mbti.topics.includes("personality"));
  assert.match(mbti.cue, /선호가 가리키는 방향/);
  assert.match(mbti.cue, /응답이 먼저/);
});

test("P01은 근거 45개(사주 34 · 응답 10 · MBTI 1) — 입력한 MBTI(안에서 정리)와 응답(함께할 때 힘이 남)이 다른 경우다", () => {
  assert.equal(P01_EVIDENCE.length, 45);
  assert.equal(P01_EVIDENCE.filter((e) => e.source === "saju").length, 34);
  assert.equal(P01_EVIDENCE.filter((e) => e.source === "survey").length, 10);
  assert.equal(P01_EVIDENCE.filter((e) => e.source === "self").length, 1);
  assert.match(P01_EVIDENCE.find((e) => e.id === "self.mbti")!.cue, /안에서 충분히 정리한 뒤/);
  assert.match(P01_EVIDENCE.find((e) => e.id === "survey.ei.low")!.cue, /함께할 때 에너지가 생깁니다/);
});

// ───── 지시문: 이전 지시문(0.13)은 그대로, 구조와 무관한 규칙은 그 부분을 가져오고, 달라진 것만 새로 ─────

test("이전 읽기 구조 지시문의 규칙 부분(사주를 읽는 범위 · 방향 제시 · 보완 아이템 · 쓰지 않는 것)을 그대로 가져온다", () => {
  for (const head of ["[이 글이 해내야 하는 것", "[방향을 제시한다", "[보완 아이템", "[쓰지 않는 것"]) {
    const section = READING_SYSTEM_PROMPT.split(/\n\n(?=\[)/).find((s) => s.startsWith(head))!;
    assert.ok(STORY_SYSTEM_PROMPT.includes(section), `${head} 부분이 그대로여야 한다`);
  }
});

test("강약이 갈리면 상황에 따라 기운이 달라진다고 쓰라던 이전 문장을 뺐고, 갈림은 성격 변화로 번역하지 않는다고 적었다", () => {
  assert.ok(READING_SYSTEM_PROMPT.includes("상황에 따라 ~쪽으로 기울 수 있어요"), "이전 지시문은 그대로(저장된 기록 · 비교용)");
  assert.ok(!STORY_SYSTEM_PROMPT.includes("상황에 따라 ~쪽으로 기울 수 있어요"));
  assert.match(STORY_SYSTEM_PROMPT, /성격 설명으로 번역하지 않는다/);
});

test("지시문이 칸의 나눔과 개인 성향 자료 쓰는 법을 말한다", () => {
  for (const must of [
    "영역마다 하나의 이야기를 끝까지 쓴다",
    "이 영역에서만 말할 연결 하나",
    "영역끼리 결론이 겹치지 않는다",
    "구체적인 실천은 마지막 actions 세 가지에 모은다",
    "시기 이야기(대운 · 세운 · 올해 · 내년 · 연도)는",
    "평소 행동 방식(에너지 · 정보 · 판단 · 생활)은 점수나 이름이 아니라 행동으로",
    "두 곳 이상에서",
    "응답이 먼저이고, MBTI로 응답을 덮어쓰지 않는다",
    "반응 민감도",
    "신중함이 높다는 것을 표현이 서툴다",
    "응답 근거 둘을 이어 붙인 문장",
  ]) assert.ok(STORY_SYSTEM_PROMPT.includes(must), must);
  // 이전 형식의 칸 이름은 이 지시문의 출력 형식에 없다
  for (const gone of ["traits", "reactionFlow", "sections", "comfort", "tryIt", "watch", "detailExample"]) assert.ok(!new RegExp(`"${gone}"`).test(STORY_SYSTEM_PROMPT.slice(STORY_SYSTEM_PROMPT.indexOf("[출력]"))), gone);
});

test("사용자 메시지에 영역마다 연결할 수 있는 개인 성향 근거가 들어 있다", () => {
  const mine = personalEvidenceFor(P01_EVIDENCE);
  assert.ok(mine.core.includes("self.mbti") && mine.core.includes("survey.ei.low"));
  assert.ok(mine.relation.includes("survey.anxiety.low") && mine.relation.includes("survey.sensitivity.high"));
  assert.ok(mine["work-money"].includes("survey.persistence.low") && mine["work-money"].includes("survey.jp.low"));
  const payload = JSON.parse(buildStoryUserMessage(P01_EVIDENCE, "2026-10-16", null).replace(/^[^{]*/, ""));
  assert.deepEqual(payload.areas.map((a: { id: string }) => a.id), ["core", "relation", "work-money"]);
  assert.ok(payload.evidence.length === 45);
});

// ───── 형식 검사: 구조가 달라진 곳 ─────

test("모의 초안은 형식 검사를 통과한다(자리 표시 글이라 내용 검사는 통과할 수 없다)", () => {
  const r = validateStoryDraft(mockDraft(), P01_EVIDENCE, { hasContext: true });
  assert.ok(r.ok, r.ok ? "" : r.errors.join("\n"));
  assert.equal(checkReadingDepth({ draft: storyDepthSource(mockDraft()) }).pass, false);
  const sy = validateStoryDraft(mockDraft(SAMPLE_EVIDENCE, null), SAMPLE_EVIDENCE, { hasContext: false });
  assert.ok(sy.ok, sy.ok ? "" : sy.errors.join("\n"));
});

test("영역은 정확히 셋(핵심 · 가까운 관계 · 일과 재물), 영역마다 문단과 근거가 있어야 한다", () => {
  assert.ok(errorsOf((d) => d.areas.pop()).some((e) => /areas: .*(2개|가 없습니다)/.test(e)));
  assert.ok(errorsOf((d) => (d.areas[0].paragraphs = d.areas[0].paragraphs.slice(0, 1))).some((e) => /paragraphs: 1개 \(3~5개\)/.test(e)));
  assert.ok(errorsOf((d) => (d.areas[1].evidence = [])).some((e) => /근거 ID가 없습니다/.test(e)));
  assert.ok(errorsOf((d) => (d.areas[0].paragraphs[0] = "짧아요.")).some((e) => /길이 \d+자 \(60~380자\)/.test(e)));
  const four = "[모의 생성] 첫 문장을 길게 씁니다 하나 둘 셋. 둘째 문장도 길게 씁니다 넷 다섯 여섯. 셋째 문장도 길게 씁니다 일곱 여덟. 넷째 문장까지 씁니다 아홉 열.";
  assert.ok(errorsOf((d) => (d.areas[2].paragraphs[1] = four)).some((e) => /4문장 \(3문장 이하/.test(e)));
});

test("영역마다 그 영역과 맞닿는 개인 성향 근거(응답 · MBTI)를 연결해야 한다 — 사주만으로 끝내지 않는다", () => {
  const onlySaju = (d: StoryDraftV1, i: number) => (d.areas[i].evidence = d.areas[i].evidence.filter((id) => !/^(survey|self)\./.test(id)));
  assert.ok(errorsOf((d) => onlySaju(d, 1)).some((e) => /areas\.relation.*개인 성향 근거\(응답 · MBTI\)를 1개 이상 연결/.test(e)));
  assert.ok(errorsOf((d) => onlySaju(d, 2)).some((e) => /areas\.work-money.*개인 성향 근거/.test(e)));
  assert.ok(errorsOf((d) => onlySaju(d, 0)).some((e) => /areas\.core.*2개 이상 연결/.test(e)));
});

test("입력한 MBTI는 시기를 뺀 영역 가운데 두 곳 이상에서 쓰고, 근거만 달고 본문에 쓰지 않으면 막는다 — 알파벳 코드는 어디에도 쓰지 않는다", () => {
  assert.ok(errorsOf((d) => d.areas.forEach((a) => (a.evidence = a.evidence.filter((id) => id !== "self.mbti")))).some((e) => /self\.mbti\)를 핵심 · 가까운 관계 · 일과 재물 영역 가운데 2곳 이상/.test(e)));
  assert.ok(errorsOf((d) => (d.flow.evidence = [...d.flow.evidence, "self.mbti"])).some((e) => /flow\.evidence: 입력한 MBTI는 시기 풀이에 쓰지 않습니다/.test(e)));
  assert.ok(errorsOf((d) => (d.areas[0].paragraphs = d.areas[0].paragraphs.map((p) => p.replace("입력해 주신 성향까지 함께 보면", "그 밖에")))).some((e) => /MBTI 근거를 달았는데 본문에서 쓰지 않았습니다/.test(e)));
  assert.ok(errorsOf((d) => (d.areas[1].paragraphs[1] = `${d.areas[1].paragraphs[1]} INFJ라서 그래요.`)).some((e) => /알파벳 유형 코드\("INFJ"\)/.test(e)));
  // MBTI를 입력하지 않은 사람은 연결할 것이 없다
  const none = P01_EVIDENCE.filter((e) => e.id !== "self.mbti");
  const ok = validateStoryDraft(mockDraft(none), none, { hasContext: true });
  assert.ok(ok.ok, ok.ok ? "" : ok.errors.join("\n"));
});

test("시기 이야기(대운 · 세운 · 올해 · 연도)는 흐름 영역에만 쓴다 — 같은 이야기를 두 번 풀지 않는다", () => {
  assert.ok(errorsOf((d) => (d.areas[2].paragraphs[0] = `${d.areas[2].paragraphs[0]} 올해는 새 일이 늘어요.`)).some((e) => /시기 이야기\("올해"\)는 "현재와 앞으로의 흐름" 영역에만/.test(e)));
  assert.ok(errorsOf((d) => (d.areas[0].paragraphs[1] = `${d.areas[0].paragraphs[1]} 지금 지나는 시기에는 더 그래요.`)).some((e) => /시기 이야기/.test(e)));
});

test("행동 과제는 영역마다 한 문장까지 — 구체적인 실천은 마지막 행동 세 가지에 모은다", () => {
  const two = "[모의 생성] 먼저 확인할 것을 적어 보세요. 그다음 상대에게 말해 보세요. 이 영역의 행동 과제가 둘입니다.";
  assert.ok(errorsOf((d) => (d.areas[1].paragraphs[2] = two)).some((e) => /행동 과제 문장이 2개/.test(e)));
  assert.equal(errorsOf((d) => (d.areas[1].paragraphs[2] = "[모의 생성] 먼저 확인할 것을 적어 보세요. 이 영역의 행동 과제는 하나입니다. 그래서 통과합니다.")).filter((e) => /행동 과제/.test(e)).length, 0);
});

test("영역 제목은 서로 다른 연결이어야 하고 본문이 제목을 되풀이하지 않는다", () => {
  assert.ok(errorsOf((d) => (d.areas[1].headline = d.areas[0].headline)).some((e) => /제목이 거의 같은 말/.test(e)));
  assert.ok(errorsOf((d) => (d.headline = `${d.areas[0].headline} 입니다`)).some((e) => /headline과 areas\.core\.headline이 거의 같은 말/.test(e)));
  assert.ok(errorsOf((d) => (d.areas[0].paragraphs[1] = `${d.areas[0].paragraphs[1]} ${d.areas[0].headline}`)).some((e) => /문단이 제목을 그대로 되풀이/.test(e)));
});

test("행동 세 가지는 서로 다른 영역에서 나와야 한다(적어도 두 영역)", () => {
  assert.ok(errorsOf((d) => d.actions.forEach((a) => (a.area = "core"))).some((e) => /모두 같은 영역/.test(e)));
  assert.ok(errorsOf((d) => d.actions.pop()).some((e) => /actions: 2개 \(3~3개\)/.test(e)));
  assert.ok(errorsOf((d) => ((d.actions[0] as { area: string }).area = "unknown")).some((e) => /actions\[0\]\.area/.test(e)));
});

test("한 문단에 새로 설명하는 사주 용어는 둘까지 — 문단 하나에서 새 개념을 여럿 배우지 않게", () => {
  const three = "[모의 생성] 월령(태어난 달의 기운)과 일간(나 자신을 나타내는 글자), 통근(뿌리의 힘)을 각각 한 문장씩 나눠 씁니다. 그래도 한 문단에 셋이면 많습니다.";
  const e = errorsOf((d) => (d.areas[0].paragraphs[2] = three));
  assert.ok(e.some((x) => /한 문단에 사주 용어가 3개/.test(x)), e.join("\n"));
});

test("핵심 문장 · 카드에는 이름을 쓰지 않고, 알려 준 고민이 없으면 focus를 쓰지 않는다", () => {
  assert.ok(errorsOf((d) => (d.headline = "지민 님은 먼저 확인하는 사람이에요")).some((e) => /headline: 이름을 쓰지 않습니다/.test(e)));
  const d = clone(mockDraft(SAMPLE_EVIDENCE, null));
  d.focus = [{ text: "[모의 생성] 알려 주신 고민을 반영하면 이렇게 봅니다. 쓰면 안 되는 자리입니다 그렇습니다.", evidence: [d.flow.evidence[0]] }];
  const r = validateStoryDraft(d, SAMPLE_EVIDENCE, { hasContext: false });
  assert.ok(!r.ok && r.errors.some((e) => /focus: 알려 주신 고민이 없는데/.test(e)));
});

test("이전 형식과 같은 글 규칙(점수 · 원인 단정 · 응답 읽어 주기 · 나이 · 결정 대행 · 계산되지 않은 해)이 영역 본문에도 적용된다", () => {
  const add = (text: string) => errorsOf((d) => (d.areas[0].paragraphs[1] = `${d.areas[0].paragraphs[1]} ${text}`));
  assert.ok(add("신중함은 88점이에요.").some((e) => /점수 · 퍼센트/.test(e)));
  assert.ok(add("불안 때문에 그래요.").some((e) => /원인을 하나로 좁혀/.test(e)));
  assert.ok(add("문항에서 그렇게 답했어요.").some((e) => /응답을 그대로 읽어 주는 말/.test(e)));
  assert.ok(add("서른 살쯤에는 달라져요.").some((e) => /나이/.test(e)));
  assert.ok(add("퇴사하세요.").some((e) => /중대한 선택을 확정/.test(e)));
  assert.ok(add("월령이 약해서 흔들려요.").some((e) => /설명 없는 사주 용어\(월령\)/.test(e)));
});

// ───── 조립 · 저장 모양 · 생성기 ─────

test("조립: 영역의 첫 문단은 summary, 나머지는 details — 같은 저장 모양에 layout story로 구분한다(요약 · 예시 · 카드 · 소단락 · 살펴볼 점 없음)", () => {
  const draft = mockDraft();
  const report = assembleStory({ draft, evidence: P01_EVIDENCE, input: P01.input, reference: { ...REF, iso: "2026-10-16" }, promptVersion: "x", ruleVersions: [] });
  assert.equal(report.kind, "integrated-reading");
  assert.equal(report.layout, "story");
  assert.ok(isReadingReport(report) && isStoryReport(report));
  assert.deepEqual(report.blocks.map((b) => b.id), ["tendency", "love", "work-money"]);
  report.blocks.forEach((b, i) => {
    assert.equal(b.summary, draft.areas[i].paragraphs[0]);
    assert.deepEqual(b.details, draft.areas[i].paragraphs.slice(1));
    assert.ok(!b.example && !b.watch && !b.traits && !b.sections && !b.reactionFlow && !b.comfort);
    assert.ok(b.basis.computed.length > 0 && b.evidence.length > 0);
  });
  assert.equal(report.flow.summary, draft.flow.paragraphs[0]);
  assert.deepEqual(report.flow.paragraphs, draft.flow.paragraphs.slice(1));
  assert.equal(report.flow.periods.length, 0);
  assert.equal(report.summary.length, 3);
  assert.deepEqual(report.actions.map((a) => a.area), ["core", "relation", "work-money"]);
  assert.ok(report.timeline.length > 0 && report.calendars && report.saju && report.extras);
  // MBTI · 응답 · 평소 행동 방식이 참고한 자료에 나온다
  const names = report.inputs.filter((i) => i.status !== "none").map((i) => i.name);
  for (const n of ["MBTI", "기질 · 성격", "가까운 관계에서의 반응(애착 경향)", "평소 행동 방식"]) assert.ok(names.includes(n), n);
  // 이전 형식(layout 없음)은 story가 아니다
  assert.ok(!isStoryReport({ ...report, layout: undefined }));
});

test("생성기: story-v1은 같은 흐름(초안 → 형식 검사 → 조립)으로 리포트를 만들고 지시문 버전을 남긴다 — 이전 형식 기본값은 그대로", async () => {
  const model = createMockModel({});
  const gen = createAiReportGenerator({ model, format: "story-v1", now: () => new Date("2026-10-16T09:00:00+09:00") });
  assert.match(gen.version, /story-v1-prompt-0\.1/);
  const report = (await gen.generate(P01.input, {})) as ReturnType<typeof assembleStory>;
  assert.equal(report.layout, "story");
  assert.equal(report.generated?.promptVersion, "story-v1-prompt-0.1");
  assert.equal(model.calls, 1);
  const legacy = createAiReportGenerator({ model: createMockModel({}), now: () => new Date("2026-10-16T09:00:00+09:00") });
  assert.match(legacy.version, /reading-v1-prompt-0\.13/);
  const old = (await legacy.generate(P01.input, {})) as ReturnType<typeof assembleStory>;
  assert.ok(!old.layout && old.blocks.length === 5);
});

test("생성기: 첫 초안이 검사에 걸리면 이유를 주고 한 번 고쳐 쓰게 한다(호출 2회) — 계속 걸리면 실패로 남긴다", async () => {
  const fixed = createAiReportGenerator({ model: createMockModel({ invalidTimes: 1 }), format: "story-v1", now: () => new Date("2026-10-16T09:00:00+09:00") });
  const ok = (await fixed.generate(P01.input, {})) as ReturnType<typeof assembleStory>;
  assert.equal(ok.layout, "story");
  const failing = createAiReportGenerator({ model: createMockModel({ invalidTimes: 5 }), format: "story-v1", now: () => new Date("2026-10-16T09:00:00+09:00") });
  await assert.rejects(() => failing.generate(P01.input, {}), /리포트 형식 검사 실패/);
});

test("생성기: 시도마다 원문과 오류가 남는다(첫 응답 · 고쳐 쓴 응답을 각각 보관할 수 있다)", async () => {
  const attempts: { round: number; errors: string[]; text: string }[] = [];
  const gen = createAiReportGenerator({ model: createMockModel({ invalidTimes: 2 }), format: "story-v1", now: () => new Date("2026-10-16T09:00:00+09:00") });
  await assert.rejects(() => gen.generate(P01.input, { onAttempt: (a) => attempts.push(a) }));
  assert.deepEqual(attempts.map((a) => a.round), [0, 1]);
  assert.ok(attempts.every((a) => a.errors.length > 0 && a.text.length > 0));
});

test("반복 확인은 영역별 이야기에서도 같은 구절이 두 곳에 있으면 위치와 함께 찾는다", () => {
  const d = clone(mockDraft());
  assert.equal(findRepeatedPhrasesIn(visibleStoryTexts(d).filter((t) => t.where.startsWith("headline") || t.where.startsWith("cards"))).length, 0);
  d.areas[1].paragraphs[0] = `${d.areas[1].paragraphs[0]} 확인하는 시간이 상대에게는 기다림이 돼요.`;
  d.areas[2].paragraphs[0] = `${d.areas[2].paragraphs[0]} 확인하는 시간이 상대에게는 기다림이 돼요.`;
  const found = findRepeatedPhrasesIn(visibleStoryTexts(d));
  assert.ok(found.some((r) => /확인하는 시간이 상대에게는 기다림이/.test(r.phrase) && r.where.join().includes("areas.relation") && r.where.join().includes("areas.work-money")));
});

// ───── 채팅 · 내보내기 · 글 모으기가 영역별 이야기를 읽는다 ─────

test("채팅: 영역별 이야기도 방(나를 알아보기 · 연애 · 진로 · 재무 · 올해의 흐름)이 열리고 흐름 문단이 자세히 보기에 나온다", () => {
  const report = assembleStory({ draft: mockDraft(), evidence: P01_EVIDENCE, input: P01.input, reference: { ...REF, iso: "2026-10-16" }, promptVersion: "x", ruleVersions: [] });
  const model = buildTalkModel(report, { saju: P01.input.saju.status === "ok" ? P01.input.saju : null, today: { year: 2026, month: 10, day: 16 } });
  const rooms = availableRooms(model);
  for (const room of ["main", "love", "career", "money", "year"] as const) assert.ok(rooms.includes(room), room);
  for (const room of rooms) assert.doesNotThrow(() => startRoom(model, room), room);
  const flow = model.topics.find((t) => t.id === "flow")!;
  const detail = flow.detail.flatMap((p) => (p.kind === "para" ? [p.text] : []));
  for (const p of report.flow.paragraphs ?? []) assert.ok(detail.includes(p));
  const love = model.topics.find((t) => t.id === "love")!;
  assert.equal(love.example.length, 0, "소단락 · 예시가 없는 이야기 영역은 일상 예시 버튼이 없다");
  assert.ok(love.detail.length >= 2);
});

test("내보내기 · 글 모으기: 영역별 이야기의 문단 · 흐름 문단 · 행동의 영역 이름이 빠지지 않는다", () => {
  const report = assembleStory({ draft: mockDraft(), evidence: P01_EVIDENCE, input: P01.input, reference: { ...REF, iso: "2026-10-16" }, promptVersion: "x", ruleVersions: [] });
  const md = renderReadingMarkdown(report);
  for (const a of STORY_AREAS) assert.ok(md.includes(a.topic), a.topic);
  for (const p of mockDraft().flow.paragraphs) assert.ok(md.includes(p));
  assert.match(md, /\(내 사주의 중심에서\)/);
  const all = readingTexts(report).all.join("\n");
  for (const p of mockDraft().flow.paragraphs) assert.ok(all.includes(p));
});
