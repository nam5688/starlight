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
