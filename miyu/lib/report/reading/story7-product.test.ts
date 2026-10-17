// 7개 대주제(story-7) 제품 경로 — 지시문 · 형식 검사 · 조립 · 생성기 · 채팅 · 내보내기를 확인한다. 실제 AI는 부르지 않는다(모의 작성기만).
// 이 시험이 통과해도 실제 AI의 글이 통과하거나 읽을 만하다는 뜻이 아니다 — 실제 AI로는 아직 한 번도 시험하지 못했다(검증되지 않음).
import assert from "node:assert/strict";
import test from "node:test";
import { REPORT_GENERATION } from "../../config/product.ts";
import { buildPersonas } from "../ai/compare-personas.ts";
import { buildEvidence, createAiReportGenerator } from "../ai/generator.ts";
import { createMockModel } from "../ai/mock-model.ts";
import { renderReadingMarkdown } from "./render-text.ts";
import { assembleStory7 } from "./story7-assemble.ts";
import { story7Evidence } from "./story7-evidence.ts";
import { composeMockStory7 } from "./story7-mock-model.ts";
import { STORY7_FORMAT, STORY7_PROMPT_VERSION, STORY7_SECTIONS } from "./story7-plan.ts";
import { buildStory7UserMessage, STORY7_SYSTEM_PROMPT } from "./story7-prompt.ts";
import { normalizeStory7Draft, story7Paragraphs, validateStory7Draft, visibleStory7Texts } from "./story7-validate.ts";
import { availableRooms, startRoom } from "./talk-room.ts";
import { buildTalkModel } from "./talk.ts";
import { isReadingReport, isStory7Report, isStoryReport, type Story7DraftV1 } from "./types.ts";

const PERSONAS = buildPersonas(10);
const P01 = PERSONAS[0];
const REF = { year: 2026, month: 10 };
const NOW = new Date("2026-10-17T09:00:00+09:00");
const P01_EVIDENCE = buildEvidence(P01.input, REF);

const mockDraft = (evidence = P01_EVIDENCE, context = P01.input.context): Story7DraftV1 => composeMockStory7(buildStory7UserMessage(evidence, "2026-10-17", context));
const clone = <T,>(x: T): T => structuredClone(x);
const errorsOf = (mutate: (d: Story7DraftV1) => void, evidence = P01_EVIDENCE, hasContext = Boolean(P01.input.context)) => {
  const d = clone(mockDraft(evidence));
  mutate(d);
  const r = validateStory7Draft(d, evidence, { hasContext });
  return r.ok ? [] : r.errors;
};
const section = (d: Story7DraftV1, no: number) => d.sections.find((s) => s.no === no)!;
/** 모의 문단 하나를 실제 글처럼 바꿔 끼운다(검사가 어떤 말에 걸리는지 보려고) */
const setPara = (d: Story7DraftV1, no: number, text: string, at = 0) => {
  const s = section(d, no);
  if (s.parts) s.parts[0].paragraphs[at] = text;
  else s.paragraphs![at] = text;
};
const PAD = "그 장의 첫 모습을 일상의 말로 풀어 쓰고 있는 자리라서 글자 수는 충분히 채워 둡니다 그래서 길이 검사는 걸리지 않아요";

// ───── 구성 · 지시문 · 입력 ─────

test("지시문: 7개 대주제와 운영자 확정(재물 항상 · 4번 가족 · 귀인 금지 · 7번 B안 · 조언 2~3가지)이 들어 있고 영역별 이야기 지시문과 구분된다", () => {
  for (const s of STORY7_SECTIONS) assert.ok(STORY7_SYSTEM_PROMPT.includes(s.title), s.title);
  assert.match(STORY7_SYSTEM_PROMPT, /재물 소제목은 모든 리포트에 있다/);
  assert.match(STORY7_SYSTEM_PROMPT, /가족 이야기는 쓰지 않고/);
  assert.match(STORY7_SYSTEM_PROMPT, /귀인 · 사람복 · 인복은 신살을 계산하지 않았으므로/);
  assert.match(STORY7_SYSTEM_PROMPT, /고민이 없으면.*고민을 지어내지 않고/);
  assert.match(STORY7_SYSTEM_PROMPT, /2~3개/);
  assert.match(STORY7_SYSTEM_PROMPT, /계속 ~라면 ~/);
  assert.equal(STORY7_PROMPT_VERSION, "story-7-prompt-0.1");
  assert.equal(STORY7_FORMAT, "story-7");
});

test("사용자 메시지: 장마다 배정된 사주 · 개인 근거를 담고, 입력한 MBTI는 1 · 3 · 5번에만, 고민은 있을 때만 넣는다", () => {
  const msg = buildStory7UserMessage(P01_EVIDENCE, "2026-10-17", null);
  const payload = JSON.parse(msg.slice(msg.indexOf("\n") + 1)) as { sections: { no: number; sajuEvidence: string[]; personalEvidence: string[] }[]; evidence: { id: string }[]; context?: unknown };
  assert.equal(payload.sections.length, 7);
  assert.equal(payload.context, undefined);
  const mine = story7Evidence(P01_EVIDENCE);
  for (const s of payload.sections) {
    assert.deepEqual(s.sajuEvidence, mine.saju[s.no]);
    assert.deepEqual(s.personalEvidence, mine.personal[s.no]);
  }
  assert.deepEqual(payload.sections.filter((s) => s.personalEvidence.includes("self.mbti")).map((s) => s.no), [1, 3, 5]);
  const withContext = buildStory7UserMessage(P01_EVIDENCE, "2026-10-17", { topic: "work", focusGuide: "일을 고르는 기준" } as never);
  assert.ok(JSON.parse(withContext.slice(withContext.indexOf("\n") + 1)).context);
});

// ───── 형식 검사 ─────

test("모의 작성기 초안은 가상 인물 10명 모두에서 형식 검사를 통과한다(검사와 지시문 · 근거 배정이 서로 어긋나지 않는다)", () => {
  for (const p of PERSONAS) {
    const ev = buildEvidence(p.input, REF);
    const draft = composeMockStory7(buildStory7UserMessage(ev, "2026-10-17", p.input.context));
    const r = validateStory7Draft(draft, ev, { hasContext: Boolean(p.input.context) });
    assert.ok(r.ok, `${p.id}: ${r.ok ? "" : r.errors.slice(0, 3).join(" / ")}`);
  }
});

test("7개 장은 순서대로 모두 있어야 한다 — 빼거나 합치거나 순서를 바꾸면 막는다", () => {
  assert.ok(errorsOf((d) => (d.sections = d.sections.slice(0, 6))).some((e) => /sections: 7개|7개/.test(e)));
  assert.ok(errorsOf((d) => d.sections.reverse()).some((e) => /no가 1번이어야/.test(e)));
});

test("5번 일과 재물은 소제목 일 · 재물로 쓰고, 다른 장은 소제목을 쓰지 않는다", () => {
  assert.ok(errorsOf((d) => { section(d, 5).paragraphs = ["x"]; }).some((e) => /paragraphs가 아니라 소제목/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 5).parts![1].title = "돈"; }).some((e) => /소제목이 "재물"/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 3).parts = [{ title: "일", paragraphs: [] }]; }).some((e) => /소제목\(parts\)은 5번/.test(e)));
});

test("재물은 모든 리포트에 있다 — 돈 이야기가 비면 막고, 작성 과정 문장은 돈 이야기로 세지 않는다", () => {
  const empty = errorsOf((d) => setPara(d, 5, `${PAD} 재물 소제목인데도 돈과 관련된 낱말이 하나도 들어 있지 않은 글이에요.`.replace(/돈|재물/g, "것"), 0));
  // 모의 글의 재물 소제목은 parts[1]이다
  const noMoney = errorsOf((d) => { section(d, 5).parts![1].paragraphs[0] = `${PAD} 그저 평소처럼 지내는 모습이 이어질 수 있어요.`; });
  assert.ok(noMoney.some((e) => /재물 소제목에 돈 이야기가 없습니다/.test(e)), noMoney.join("\n"));
  const processOnly = errorsOf((d) => { section(d, 5).parts![1].paragraphs[0] = `${PAD} 이번 풀이에서는 재물은 근거가 약해 길게 풀지 않았어요 그래서 짧게 마칩니다.`; });
  assert.ok(processOnly.some((e) => /재물 소제목에 돈 이야기가 없습니다|작성 과정을 말하는 문장/.test(e)));
  assert.ok(Array.isArray(empty));
});

test("재물 소제목: 직접 묻지 않은 소비 · 저축 습관은 사실처럼 쓰지 않고 조건형 · 질문으로만 쓴다 · 재물운 판정도 막는다", () => {
  const fact = errorsOf((d) => { section(d, 5).parts![1].paragraphs[0] = `${PAD} 이 사람은 저축을 꼬박꼬박 하고 지출은 늘 줄여서 돈이 쌓이는 사람이에요.`; });
  assert.ok(fact.some((e) => /습관을 사실처럼 쓰지 않습니다/.test(e)), fact.join("\n"));
  const cond = errorsOf((d) => { section(d, 5).parts![1].paragraphs[0] = `${PAD} 큰 지출을 앞두면 이것저것 따져 보느라 결정이 늦어질 수 있어요 돈 앞에서의 선택이에요.`; });
  assert.ok(!cond.some((e) => /습관을 사실처럼/.test(e)), cond.join("\n"));
  const fate = errorsOf((d) => { section(d, 5).parts![1].paragraphs[0] = `${PAD} 재성이 없어서 돈복이 없는 편이라 돈 앞에서 고생할 수 있어요.`; });
  assert.ok(fate.some((e) => /재물의 운명을 판정하는 말/.test(e)));
});

test("4번: 가족 이야기 · 귀인 · 사람복은 쓰지 않는다 — 입력받지 않았고 신살을 계산하지 않았다", () => {
  const family = errorsOf((d) => setPara(d, 4, `${PAD} 부모님과의 관계에서도 비슷한 모습이 나타날 수 있어요.`));
  assert.ok(family.some((e) => /가족\("부모님"\) 이야기는 입력받은 것이 없어/.test(e)), family.join("\n"));
  const luck = errorsOf((d) => setPara(d, 4, `${PAD} 주변에 귀인이 나타나 도움을 줄 수 있어요 사람복이 있어요.`));
  assert.ok(luck.some((e) => /귀인 · 인복을 계산하는 신살을 아직 계산하지 않아/.test(e)));
});

test("시기 이야기는 6번에만 쓴다 — 다른 장 · 카드 · 조언에 올해 · 대운 · 연도를 쓰면 막는다", () => {
  assert.ok(errorsOf((d) => setPara(d, 3, `${PAD} 올해는 특히 관계에서 마음이 앞서기 쉬워요.`)).some((e) => /시기 이야기\("올해"\)는 6번/.test(e)));
  assert.ok(errorsOf((d) => { d.cards.strength.note = "올해 두드러지는 힘이 있어요"; }).some((e) => /cards\.strength\.note: 시기 이야기/.test(e)));
  assert.ok(errorsOf((d) => { d.actions[0].detail = "올해 안에 한 번 짧게 물어보고 기록해 두세요."; }).some((e) => /조언에 시점이나 기간/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 3).years = [{ year: "2026", theme: "한 줄 자리예요 괜찮아요" }]; }).some((e) => /years · scenarios는 6번 장에만/.test(e)));
});

test("조언(actions)은 2~3가지다 — 1개나 4개는 막는다", () => {
  assert.ok(errorsOf((d) => (d.actions = d.actions.slice(0, 1))).some((e) => /actions: 1개 \(2~3개\)/.test(e)));
  assert.ok(errorsOf((d) => (d.actions = [...d.actions, ...d.actions, ...d.actions])).some((e) => /actions: 6개 \(2~3개\)/.test(e)));
});

test("첫 문단에는 사주 용어를 쓰지 않고, 없는 기운을 생활 기능의 부족으로 풀지 않는다", () => {
  assert.ok(errorsOf((d) => setPara(d, 1, `${PAD} 월령이 큰 영향을 주는 사람이에요.`)).some((e) => /첫 문단에 사주 용어/.test(e)));
  assert.ok(errorsOf((d) => setPara(d, 4, `${PAD} 수 기운이 없어서 쉬는 힘이 약해요.`)).some((e) => /생활 기능의 부족이나 원인/.test(e)));
});

test("근거: 소유하는 장은 사주 근거와 개인 성향 근거를 달아야 하고, 엮는 장(2 · 7번)은 비워도 된다 · MBTI는 1 · 3 · 5번에서만 · 달았으면 본문에 쓴다", () => {
  assert.ok(errorsOf((d) => { section(d, 3).evidence = []; }).some((e) => /sections\.3.*근거 ID가 없습니다/.test(e)));
  assert.deepEqual(errorsOf((d) => { section(d, 2).evidence = []; section(d, 7).evidence = []; }), []);
  assert.ok(errorsOf((d) => { section(d, 6).evidence.push("self.mbti"); }).some((e) => /MBTI\(self\.mbti\)는 1 · 3 · 5번 장에서만/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 4).evidence.push("self.mbti"); }).some((e) => /MBTI\(self\.mbti\)는 1 · 3 · 5번 장에서만/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 1).evidence = section(d, 1).evidence.filter((id) => id !== "self.mbti"); section(d, 3).evidence = section(d, 3).evidence.filter((id) => id !== "self.mbti"); }).some((e) => /MBTI\(self\.mbti\)를 1 · 3 · 5번 장 가운데 2곳 이상/.test(e)));
  assert.ok(errorsOf((d) => setPara(d, 1, `${PAD} 평소 모습이 이어질 수 있어요.`, 0)).some((e) => /MBTI 근거를 달았는데 본문에서 쓰지 않았습니다/.test(e)));
});

test("같은 개인 성향 근거를 근거를 소유하는 장 셋 이상이 앞세우면 막는다", () => {
  const poolIds = story7Evidence(P01_EVIDENCE).personal[1].filter((id) => id !== "self.mbti");
  const errors = errorsOf((d) => { for (const no of [1, 3, 4]) if (!section(d, no).evidence.includes(poolIds[0])) section(d, no).evidence.push(poolIds[0]); });
  assert.ok(errors.some((e) => /개인 성향 근거 .*를 3개 장/.test(e)), errors.join("\n"));
});

test("맺음 틀 변형 예산 · 작성 과정 문장 · 이름 · 알파벳 유형 코드를 막는다", () => {
  const formula = errorsOf((d) => { setPara(d, 1, `${PAD} 계속 확인하다 보면 지칠 수 있어요.`); setPara(d, 3, `${PAD} 계속 미루다면 어긋날 수 있어요.`); setPara(d, 4, `${PAD} 계속 혼자 하다면 외로울 수 있어요.`); });
  assert.ok(formula.some((e) => /"계속 ~라면"이\(가\) 3곳/.test(e)), formula.join("\n"));
  assert.ok(errorsOf((d) => setPara(d, 4, `${PAD} 이번 분석에서는 강약을 한쪽으로 정하지 않았어요.`)).some((e) => /작성 과정을 말하는 문장/.test(e)));
  assert.ok(errorsOf((d) => { d.headline = "지민 님의 중심은 이런 연결이에요"; }).some((e) => /이름을 쓰지 않습니다/.test(e)));
  assert.ok(errorsOf((d) => setPara(d, 3, `${PAD} INTJ 같은 유형이라서 그래요.`)).some((e) => /알파벳 유형 코드/.test(e)));
});

test("7번: 알려 준 고민이 없으면 \"알려 주신\"을 쓰지 않고, 있으면 첫 문단이 그 고민을 밝힌다", () => {
  assert.ok(errorsOf((d) => setPara(d, 7, `${PAD} 알려 주신 고민을 반영하면 이 순서가 맞아 보여요.`), P01_EVIDENCE, false).some((e) => /"알려 주신"을 썼습니다/.test(e)));
  assert.ok(errorsOf((d) => setPara(d, 7, `${PAD} 앞 장의 결론이 만나는 곳에서 이 순서가 맞아요.`), P01_EVIDENCE, true).some((e) => /알려 준 고민을 밝히며 시작/.test(e)));
});

test("6번: 계산된 해만, 가능성으로 쓰고 시기 근거를 달아야 한다", () => {
  assert.ok(errorsOf((d) => { section(d, 6).years = [{ year: "1999", theme: "한 줄 자리예요 괜찮아요" }]; }).some((e) => /계산된 해가 아닙니다/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 6).scenarios = [{ when: "지금 모습이 그대로 이어지면 어떻게 될까요", then: "이렇게 흘러갑니다 반드시요 확실하게 그렇게요." }]; }).some((e) => /확률이 아닌 가능성/.test(e)));
  assert.ok(errorsOf((d) => { section(d, 6).evidence = [section(d, 6).evidence[0]]; }).some((e) => /시기 근거\(period가 있는 ID\)가 없습니다/.test(e)));
});

test("문단 나눔 보정: 문장 수 한도를 넘은 문단은 문장은 그대로 두고 문단만 나눈다 — 장의 문단 수 상한을 넘기면 건드리지 않는다", () => {
  const d = clone(mockDraft());
  const sentence = "이 문장은 문단을 나눌 때 한 글자도 바뀌지 않아야 하는 문장이에요.";
  section(d, 1).paragraphs = [[sentence, sentence.replace("이 문장은", "둘째 문장은"), sentence.replace("이 문장은", "셋째 문장은"), sentence.replace("이 문장은", "넷째 문장은")].join(" ")];
  const before = story7Paragraphs(section(d, 1)).join(" ");
  const fixed = normalizeStory7Draft(d);
  assert.equal(story7Paragraphs(section(fixed, 1)).length, 2);
  assert.equal(story7Paragraphs(section(fixed, 1)).join(" "), before);
  assert.equal(story7Paragraphs(section(d, 1)).length, 1, "입력은 바꾸지 않는다");
  // 2번은 문단 상한이 2개라 3문장 넘는 문단 둘을 나누면 넘친다 → 그대로
  const e = clone(mockDraft());
  const long = [sentence, sentence.replace("이 문장은", "둘째 문장은"), sentence.replace("이 문장은", "셋째 문장은"), sentence.replace("이 문장은", "넷째 문장은")].join(" ");
  section(e, 2).paragraphs = [long, long.replace(/문장은/g, "문장이")];
  assert.equal(story7Paragraphs(section(normalizeStory7Draft(e), 2)).length, 2);
});

// ───── 조립 · 저장 모양 ─────

const assembled = () => assembleStory7({ draft: mockDraft(), evidence: P01_EVIDENCE, input: P01.input, reference: { ...REF, iso: "2026-10-17" }, promptVersion: "x", ruleVersions: [] });

test("조립: 1~5번은 blocks(채팅이 읽는 id 그대로), 6번은 flow, 7번은 advice + actions — layout story7로 구분한다", () => {
  const report = assembled();
  const flags = { reading: isReadingReport(report), story7: isStory7Report(report), story: isStoryReport(report) };
  assert.deepEqual(flags, { reading: true, story7: true, story: false });
  assert.deepEqual(report.blocks.map((b) => b.id), ["tendency", "strength-burden", "love", "people", "work-money"]);
  assert.deepEqual(report.blocks.map((b) => b.topic), ["나는 어떤 사람일까?", "나의 강점과 약점", "연애와 애착", "인간관계와 인연", "일과 재물"]);
  assert.equal(report.flow.topic, "앞으로의 운과 변화");
  assert.equal(report.advice?.topic, "미유의 종합 조언");
  assert.equal(report.advice?.id, "advice");
  const draft = mockDraft();
  report.blocks.forEach((b, i) => {
    const paragraphs = story7Paragraphs(section(draft, i + 1));
    assert.equal(b.summary, paragraphs[0]);
    assert.deepEqual(b.details, paragraphs.slice(1));
    assert.ok(!b.example && !b.watch && !b.traits && !b.sections && !b.reactionFlow && !b.comfort);
    assert.ok(b.basis.computed.length > 0 || b.evidence.length === 0);
  });
  // 5번만 소제목 구분이 있다
  assert.deepEqual(report.blocks[4].parts?.map((p) => p.title), ["일", "재물"]);
  assert.ok(report.blocks.slice(0, 4).every((b) => !b.parts));
  assert.equal(report.actions.length, draft.actions.length);
  assert.ok(report.actions.every((a) => !a.area));
  assert.equal(report.summary.length, 3);
  assert.deepEqual(report.summary.map((c) => c.kind), ["strength", "caution", "flow"]);
  assert.ok(report.timeline.length > 0 && report.calendars && report.saju && report.extras && report.base);
  assert.equal(report.flow.periods.length, 0);
  // 자료가 실제로 없는 곳(상대 · 가족 · 동료 · 돈 응답)만 코드가 한 줄 밝힌다
  assert.ok(report.blocks[2].caveat?.includes("상대 자료: 없음"));
  assert.ok(report.blocks[3].caveat?.includes("친구 · 가족 · 동료"));
  assert.ok(report.blocks[4].caveat?.includes("소비 · 저축 습관을 직접 물은 응답이 아니라"));
  assert.ok(!report.blocks[0].caveat && !report.blocks[1].caveat);
  // 대표 경향 이름(~형)은 코드가 정한 값이 그대로 저장된다
  assert.ok(/형$/.test(report.base?.tendency.name ?? ""));
  // 참고한 자료 목록에 응답 · MBTI가 나온다
  const names = report.inputs.filter((i) => i.status !== "none").map((i) => i.name);
  for (const n of ["MBTI", "기질 · 성격", "가까운 관계에서의 반응(애착 경향)", "평소 행동 방식"]) assert.ok(names.includes(n), n);
});

test("조립: 7번 장의 알려 준 고민은 지어내지 않는다 — 고민이 없으면 context도 focus도 저장하지 않는다", () => {
  const input = { ...P01.input, context: null };
  const ev = buildEvidence(input, REF);
  const draft = composeMockStory7(buildStory7UserMessage(ev, "2026-10-17", null));
  const report = assembleStory7({ draft, evidence: ev, input, reference: { ...REF, iso: "2026-10-17" }, promptVersion: "x", ruleVersions: [] });
  assert.ok(!report.focus && !report.generated?.context);
  assert.equal(report.inputs.find((i) => i.name === "알려 준 고민 · 상황")?.status, "none");
});

// ───── 생성기 ─────

test("생성기: story-7은 같은 흐름(초안 → 형식 검사 → 조립)으로 리포트를 만들고 지시문 버전을 남긴다 · 이전 형식 기본값은 그대로", async () => {
  const model = createMockModel({});
  const gen = createAiReportGenerator({ model, format: "story-7", now: () => NOW });
  assert.match(gen.version, /story-7-prompt-0\.1/);
  const report = (await gen.generate(P01.input, {})) as ReturnType<typeof assembleStory7>;
  assert.equal(report.layout, "story7");
  assert.equal(report.generated?.promptVersion, "story-7-prompt-0.1");
  assert.equal(model.calls, 1);
  const legacy = createAiReportGenerator({ model: createMockModel({}), now: () => NOW });
  assert.match(legacy.version, /reading-v1-prompt-0\.13/);
});

test("생성기: 첫 초안이 검사에 걸리면 이유를 주고 한 번 고쳐 쓰게 한다 — maxRepairs 0이면 첫 응답에서 멈추고 원문이 남는다", async () => {
  const fixed = createAiReportGenerator({ model: createMockModel({ invalidTimes: 1 }), format: "story-7", now: () => NOW });
  assert.equal(((await fixed.generate(P01.input, {})) as ReturnType<typeof assembleStory7>).layout, "story7");
  const attempts: { round: number; errors: string[]; text: string }[] = [];
  const once = createAiReportGenerator({ model: createMockModel({ invalidTimes: 5 }), format: "story-7", maxRepairs: 0, maxRetries: 0, now: () => NOW });
  await assert.rejects(() => once.generate(P01.input, { onAttempt: (a) => attempts.push(a) }), /리포트 형식 검사 실패/);
  assert.equal(attempts.length, 1);
  assert.ok(attempts[0].text.length > 0);
});

test("신규 생성 기본 형식은 한 곳(REPORT_GENERATION)에서 정하고 한 줄로 되돌릴 수 있다", () => {
  assert.ok(["reading-v1", "story-v1", "story-7"].includes(REPORT_GENERATION.format));
});

// ───── 채팅 · 내보내기 ─────

test("채팅: 7개 대주제 리포트도 같은 방 · 말풍선으로 읽히고 인간관계(people) 주제가 목록에 있다 — 저장된 풀이 글만 쓴다", () => {
  const report = assembled();
  const model = buildTalkModel(report, { saju: P01.input.saju.status === "ok" ? P01.input.saju : null, today: { year: 2026, month: 10, day: 17 } });
  assert.deepEqual(model.topics.filter((t) => t.id !== "flow").map((t) => t.id), ["tendency", "strength-burden", "love", "people", "work-money"]);
  const rooms = availableRooms(model);
  assert.ok(rooms.length > 0);
  for (const room of rooms) assert.doesNotThrow(() => startRoom(model, room), room);
});

test("내보내기: 번호 붙은 7개 장 · 5번 소제목 · 조언 2~3가지가 읽는 순서 글에 모두 나온다", () => {
  const md = renderReadingMarkdown(assembled());
  for (const [i, t] of ["나는 어떤 사람일까?", "나의 강점과 약점", "연애와 애착", "인간관계와 인연", "일과 재물", "앞으로의 운과 변화", "미유의 종합 조언"].entries()) assert.ok(md.includes(`## ${i + 1}. ${t}`), t);
  assert.ok(md.includes("#### 일") && md.includes("#### 재물"));
  assert.ok(md.includes("### 조언 2~3가지(실천)"));
});

test("화면에 보이는 모든 글 조각 위치가 장 번호로 읽힌다(반복 · 모티프 검사가 쓴다)", () => {
  const where = visibleStory7Texts(mockDraft()).map((t) => t.where);
  assert.ok(where.includes("headline") && where.includes("sections.5.parts[1].paragraphs[0]") && where.some((w) => w.startsWith("sections.6.years[")) && where.some((w) => w.startsWith("actions[")));
});
