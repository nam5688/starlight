// 실행: npm test — AI 리포트 생성기(모의 모델)와 형식 검사. 실제 AI를 부르지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../../assessment/modules/index.ts";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { buildDevFreeSummary } from "../build-free-summary.ts";
import type { ReportInput } from "../generator.ts";
import { buildUserMessage } from "../v2/prompt.ts";
import type { ReportDraftV2 } from "../v2/types.ts";
import { validateDraft } from "../v2/validate.ts";
import { buildEvidence, createAiReportGenerator, extractJson } from "./generator.ts";
import { composeMockDraft, createMockModel } from "./mock-model.ts";
import { ModelCallError, type TextModel } from "./model.ts";
import { glossaryFor } from "../../saju/glossary.ts";

const NOW = () => new Date("2026-10-12T03:00:00Z");
const REF = { year: 2026, month: 10 };

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((item, i) => [item.id, (i % 5) + 1])));
  return {
    nickname: "서윤",
    knownMbti: "INFJ",
    birthText: "1994년 11월 7일 (양력) · 08:40",
    summary: buildDevFreeSummary(answers),
    saju: calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" }),
    gender: "female",
    context: null,
    ...overrides,
  };
}

const noSleep = async () => {};

test("모의 모델로 v2 리포트를 만든다 — 모든 문장이 있는 근거 ID를 쓰고, 이름은 저장할 때만 채운다", async () => {
  const model = createMockModel();
  const generator = createAiReportGenerator({ model, now: NOW, sleep: noSleep });
  const report = await generator.generate(input());
  assert.equal(model.calls, 1);
  if (!("kind" in report)) throw new Error("v2가 아님");
  assert.equal(report.kind, "personal-v2");
  assert.equal(report.personName, "서윤");
  assert.equal(report.basis.referenceDate, "2026-10-12");
  assert.ok(report.basis.ruleVersions.some((v) => v.startsWith("saju-rules")));
  assert.equal(report.saju.status, "computed");
  assert.equal(report.sections.length, 4);
  const known = new Set(report.evidence.map((e) => e.id));
  for (const p of [...report.summary, ...report.sections.flatMap((s) => s.paragraphs), ...report.differences]) {
    for (const id of p.evidence) assert.ok(known.has(id), id);
  }
  assert.ok(report.timeline.length >= 1, "대운 · 세운 시기");
  assert.ok(!JSON.stringify(report).includes("{name}"));
  assert.match(generator.version, /mock-0\|personal-v2-prompt-.*\|saju-rules-/);
});

test("AI에게 보내는 자료에는 이름 · 생년월일 원문이 없다", () => {
  const msg = buildUserMessage(buildEvidence(input(), REF), "2026-10-12");
  assert.doesNotMatch(msg, /서윤/);
  assert.doesNotMatch(msg, /1994|11월 7일|08:40/);
});

test("일시 오류는 잠시 뒤 다시 부르고(2초 → 6초), 한도를 넘으면 오류를 던진다", async () => {
  const waits: number[] = [];
  const sleep = async (ms: number) => void waits.push(ms);
  const recovering = createMockModel({ failTimes: 2 });
  const report = await createAiReportGenerator({ model: recovering, now: NOW, sleep }).generate(input());
  assert.ok("kind" in report);
  assert.equal(recovering.calls, 3);
  assert.deepEqual(waits, [2000, 6000]);

  const down = createMockModel({ failTimes: 5 });
  await assert.rejects(createAiReportGenerator({ model: down, now: NOW, sleep: noSleep }).generate(input()), /모의 일시 오류/);
  assert.equal(down.calls, 3, "처음 1번 + 다시 2번");
});

test("다시 해도 안 되는 오류(인증 등)는 바로 던진다", async () => {
  let calls = 0;
  const model: TextModel = {
    provider: "x",
    model: "x",
    async complete() {
      calls++;
      throw new ModelCallError("인증 실패", { retryable: false, code: "HTTP_401" });
    },
  };
  await assert.rejects(createAiReportGenerator({ model, now: NOW, sleep: noSleep }).generate(input()), /인증 실패/);
  assert.equal(calls, 1);
});

test("형식 검사에 실패하면 문제 목록을 주고 한 번 다시 쓰게 한다", async () => {
  const seen: string[][] = [];
  const inner = createMockModel({ invalidTimes: 1 });
  const model: TextModel = {
    provider: "mock",
    model: "mock-0",
    complete: (req) => (seen.push(req.messages.map((m) => m.role)), inner.complete(req)),
  };
  const report = await createAiReportGenerator({ model, now: NOW, sleep: noSleep }).generate(input());
  assert.ok("kind" in report);
  assert.deepEqual(seen, [["user"], ["user", "assistant", "user"]]);

  const stubborn = createMockModel({ invalidTimes: 9 });
  await assert.rejects(createAiReportGenerator({ model: stubborn, now: NOW, sleep: noSleep }).generate(input()), /리포트 형식 검사 실패: headline/);
  assert.equal(stubborn.calls, 2, "처음 1번 + 고쳐 쓰기 1번");
});

test("사주 계산 결과가 없으면 AI를 부르지 않고 실패한다", async () => {
  const model = createMockModel();
  await assert.rejects(
    createAiReportGenerator({ model, now: NOW, sleep: noSleep }).generate(input({ saju: { status: "not-connected" } })),
    /사주 계산 결과가 없어/,
  );
  assert.equal(model.calls, 0);
});

test("성별이 없으면 대운 근거 없이 세운만 시기로 쓴다", async () => {
  const noGender = input({
    gender: null,
    saju: calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40" }),
  });
  const report = await createAiReportGenerator({ model: createMockModel(), now: NOW, sleep: noSleep }).generate(noGender);
  if (!("kind" in report)) throw new Error();
  assert.ok(!report.evidence.some((e) => e.id.startsWith("saju.daeun")));
  assert.ok(report.timeline.every((t) => /세운/.test(t.period) || /20\d\d/.test(t.period)));
});

test("JSON 꺼내기: 앞뒤 설명 · 코드 블록이 붙어도 읽는다", () => {
  assert.deepEqual(extractJson('설명입니다\n```json\n{"a": 1}\n```'), { a: 1 });
  assert.throws(() => extractJson("JSON 없음"));
});

// ---- 형식 검사 (validateDraft) ----

const evidence = buildEvidence(input(), REF);
const good = (): ReportDraftV2 => composeMockDraft(buildUserMessage(evidence, "2026-10-12"));

test("형식 검사: 모의 초안은 통과한다", () => {
  const r = validateDraft(good(), evidence);
  assert.ok(r.ok, r.ok ? "" : r.errors.join("\n"));
});

test("형식 검사: 쓰지 않는 표현을 막는다 (정확도 · 단정 · 날짜 예언 · 사건 예언 · 불안 자극)", () => {
  const cases: [string, RegExp][] = [
    ["이 해석의 정확도는 높은 편입니다", /정확도/],
    ["이 흐름은 100% 맞는 이야기입니다", /단정/],
    ["2027년 3월 14일에 큰 변화가 생깁니다", /특정 날짜/],
    ["이 시기에 결혼하게 될 것입니다", /사건 예언/],
    ["지금 바꾸지 않으면 후회하게 됩니다", /불안/],
  ];
  for (const [phrase, why] of cases) {
    const d = good();
    d.sections[0].paragraphs[0].text += ` ${phrase}.`;
    const r = validateDraft(d, evidence);
    assert.ok(!r.ok && r.errors.some((e) => why.test(e)), phrase);
  }
});

test("형식 검사: 없는 근거 ID · 계산되지 않은 시기 · 시기 아닌 근거로 시기 설명을 막는다", () => {
  const d = good();
  d.summary[0].evidence = ["saju.made-up"];
  d.timeline[0].period = "2031년 행운의 시기";
  const r = validateDraft(d, evidence);
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /없는 근거 ID saju\.made-up/.test(e)));
  assert.ok(r.errors.some((e) => /계산된 시기가 아닙니다/.test(e)));

  const d2 = good();
  d2.timeline[0].evidence = ["saju.daymaster"];
  const r2 = validateDraft(d2, evidence);
  assert.ok(!r2.ok && r2.errors.some((e) => /시기 근거가 아닌 ID/.test(e)));
});

test("형식 검사: 확실하지 않은 근거만으로 쓴 문단, 같은 행동 반복, 같은 문장 반복을 막는다", () => {
  const uncertain = evidence.find((e) => e.uncertain);
  if (uncertain) {
    const d = good();
    d.summary[0].evidence = [uncertain.id];
    const r = validateDraft(d, evidence);
    assert.ok(!r.ok && r.errors.some((e) => /확실하지 않은 근거만/.test(e)));
  }

  const d2 = good();
  d2.actions[1].action = d2.actions[0].action;
  const r2 = validateDraft(d2, evidence);
  assert.ok(!r2.ok && r2.errors.some((e) => /거의 같습니다/.test(e)));

  const d3 = good();
  d3.sections[1].paragraphs.push({ ...d3.sections[0].paragraphs[0] });
  const r3 = validateDraft(d3, evidence);
  assert.ok(!r3.ok && r3.errors.some((e) => /같은 문장이 반복/.test(e)));
});

test("형식 검사: 장이 빠지거나 실천 개수가 맞지 않으면 막는다", () => {
  const d = good();
  d.sections = d.sections.slice(0, 3);
  d.actions = d.actions.slice(0, 2);
  const r = validateDraft(d, evidence);
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /conditions/.test(e)));
  assert.ok(r.errors.some((e) => /actions: 2개/.test(e)));
});

// ---- 나를 더 반영하기 ----

const WORK_CONTEXT = {
  topic: "work" as const,
  question: "지금 회사를 옮겨도 될지, 무엇을 기준으로 정해야 할지 궁금해요. 연락은 010-1234-5678로 주세요",
  situation: "새 제안이 오면 처음엔 끌리다가 결정할 때가 되면 계속 미뤄요",
  matched: "",
  differed: "무료 결과에서는 신중하다고 했는데 저는 충동적인 편이에요",
  excerpt: "",
  updatedAt: "2026-10-12T01:00:00.000Z",
};

test("나를 더 반영하기: 고민을 AI 자료에 넣되 연락처는 가리고, 리포트에 '알려 주신 고민' 해석과 반영 항목(내용 없이)을 남긴다", async () => {
  const model = createMockModel();
  const seen: string[] = [];
  const wrapped: TextModel = { provider: "mock", model: "mock-0", complete: (req) => (seen.push(req.messages[0].content), model.complete(req)) };
  const report = await createAiReportGenerator({ model: wrapped, now: NOW, sleep: noSleep }).generate(input({ context: WORK_CONTEXT }));
  if (!("kind" in report)) throw new Error();
  assert.match(seen[0], /"topic":"일 · 진로 · 이직"/);
  assert.match(seen[0], /선택과 불확실성에 대한 반응/, "주제별로 더 자세히 풀 부분");
  assert.match(seen[0], /\[연락처 가림\]/);
  assert.doesNotMatch(seen[0], /010-1234-5678/);
  assert.equal(report.focus?.length, 1);
  assert.match(report.focus![0].text, /알려 주신 고민\(일 · 진로 · 이직\)/);
  assert.deepEqual(report.basis.context, {
    topic: "work",
    topicLabel: "일 · 진로 · 이직",
    fields: ["지금 가장 궁금한 문제", "최근 반복되는 상황", "이전 풀이에서 달랐던 점"],
    updatedAt: "2026-10-12T01:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(report.basis), /회사를 옮겨도/, "리포트 기준 정보에는 적은 내용을 담지 않는다");
});

test("나를 더 반영하기: 적지 않았으면 focus가 없고, AI 자료에도 context가 없다", async () => {
  const report = await createAiReportGenerator({ model: createMockModel(), now: NOW, sleep: noSleep }).generate(input());
  if (!("kind" in report)) throw new Error();
  assert.equal(report.focus, undefined);
  assert.equal(report.basis.context, undefined);
  assert.doesNotMatch(buildUserMessage(evidence, "2026-10-12"), /"context"/);
});

test("형식 검사: 고민을 적었는데 focus가 없거나, 고객이 말한 내용임을 밝히지 않거나, 사주로 맞힌 것처럼 쓰면 막는다", () => {
  const msg = buildUserMessage(evidence, "2026-10-12", WORK_CONTEXT);
  const draft = composeMockDraft(msg);
  assert.ok(validateDraft(draft, evidence, { hasContext: true }).ok);

  const missing = { ...draft, focus: [] };
  const r1 = validateDraft(missing, evidence, { hasContext: true });
  assert.ok(!r1.ok && r1.errors.some((e) => /focus: 0개/.test(e)));

  const noAttribution = { ...draft, focus: [{ ...draft.focus![0], text: draft.focus![0].text.replace("알려 주신 고민", "이직 고민") }] };
  const r2 = validateDraft(noAttribution, evidence, { hasContext: true });
  assert.ok(!r2.ok && r2.errors.some((e) => /알려 준 내용임을 밝히며/.test(e)));

  const guessed = { ...draft, focus: [{ ...draft.focus![0], text: `${draft.focus![0].text} 이 고민은 사주에 이미 나와 있습니다.` }] };
  const r3 = validateDraft(guessed, evidence, { hasContext: true });
  assert.ok(!r3.ok && r3.errors.some((e) => /사주로 맞힌 것처럼/.test(e)));

  const disclaimer = { ...draft, focus: [{ ...draft.focus![0], text: `${draft.focus![0].text} 알려 주신 이야기를 사주로 알아맞힌 것은 아닙니다.` }] };
  assert.ok(validateDraft(disclaimer, evidence, { hasContext: true }).ok, "부정 안내 문장은 허용");

  const r4 = validateDraft(draft, evidence, { hasContext: false });
  assert.ok(!r4.ok && r4.errors.some((e) => /고민이 없는데 focus/.test(e)));
});

test("쉬운 말: AI 자료에 리포트 근거에 나온 사주 용어의 한자와 쉬운 뜻을 함께 보낸다", () => {
  const msg = JSON.parse(buildUserMessage(evidence, "2026-10-12").slice(buildUserMessage(evidence, "2026-10-12").indexOf("{")));
  const terms = msg.terms.map((t: { term: string }) => t.term);
  for (const t of ["일간", "오행", "상관", "정인", "인성", "대운", "세운", "충"]) assert.ok(terms.includes(t), t);
  const sanggwan = msg.terms.find((t: { term: string }) => t.term === "상관");
  assert.equal(sanggwan.hanja, "傷官");
  assert.match(sanggwan.plain, /틀/);
  assert.equal(glossaryFor(evidence).length, msg.terms.length);
});
