// 실행: npm test — 사주 궁합 리포트(compat-v1): 근거(엔진의 compat.*)가 지시문 · 요청에 그대로 가는지, 지시문이 시기 · 판정 · 속마음 · 관계 종류 · 응답을 쓰지 말라고 하는지,
// 형식 검사가 이 규칙들을 실제로 막는지, 조립이 무료 간단 궁합과 같은 커플 유형 · 지수를 쓰는지, 쓰기(고쳐 쓰기 · 실패)가 되는지 확인한다.
// 모의 작성기의 글은 자리 표시이며 좋은 글이 아니다 — 이 시험은 규칙이 지켜지는지 보는 것이고, 실제 AI가 쓴 글의 품질이나 궁합 풀이의 정확도를 보증하지 않는다.
import assert from "node:assert/strict";
import test from "node:test";
import { cardOf } from "../../compat/simple.ts";
import type { SajuOk } from "../../saju/engine.ts";
import { compatOf } from "../../saju/interpret/compat.ts";
import { compatTimingOf } from "../../saju/interpret/compat-timing.ts";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { ModelCallError, type ModelRequest, type ModelResult, type TextModel } from "../ai/model.ts";
import { assembleCompatReport, nameText } from "./assemble.ts";
import { composeMockCompat } from "./mock-model.ts";
import { COMPAT_LIMITS, COMPAT_NOTES, COMPAT_SECTIONS, COMPAT_STEP_GROUPS, COMPAT_TIMING_BUILT, sectionsFor } from "./plan.ts";
import { buildCompatUserMessage, COMPAT_PROMPT_MARK, COMPAT_PROMPT_VERSION, COMPAT_SYSTEM_PROMPT } from "./prompt.ts";
import type { CompatDraftV1 } from "./types.ts";
import { compatAllowedYears, validateCompatDraft } from "./validate.ts";
import { CompatWriteError, createCompatWriter } from "./writer.ts";

const person = (year: number, month: number, day: number, birthTime: string | null = "09:30"): SajuOk => {
  const r = calculateSaju({ year, month, day, calendar: "solar", isLeapMonth: false, birthTime, gender: "female" });
  assert.equal(r.status, "ok");
  return r as SajuOk;
};
const PAIRS: [SajuOk, SajuOk][] = [
  [person(1996, 3, 29), person(1994, 11, 2)],
  [person(1990, 5, 17), person(1991, 8, 8, null)],
  [person(2001, 1, 9), person(1999, 12, 24)],
];
const result = compatOf(...PAIRS[0]);
/** 시기를 읽는 기준 시점 — 시험은 고정한 값을 쓴다 */
const REF = { year: 2026, month: 10 };
/** 두 사람의 시기(compat.timing.*)까지 더한 근거 — 실제 요청과 같은 구성이다 */
const withTiming = (a: SajuOk, b: SajuOk) => {
  const r = compatOf(a, b);
  return { r, evidence: [...r.evidence, ...compatTimingOf(a, b, REF).evidence] };
};
const full = withTiming(...PAIRS[0]);
const mockMessage = (r = result) => buildCompatUserMessage(r.evidence, r.cautions);
const fullMessage = () => buildCompatUserMessage(full.evidence, full.r.cautions);
const draftOf = (r = result) => composeMockCompat(mockMessage(r));
const fullDraft = () => composeMockCompat(fullMessage());
const clone = (d: CompatDraftV1) => JSON.parse(JSON.stringify(d)) as CompatDraftV1;
const errorsOf = (d: unknown, r = result) => {
  const v = validateCompatDraft(d, r.evidence);
  return v.ok ? [] : v.errors;
};
const fullErrors = (d: unknown) => {
  const v = validateCompatDraft(d, full.evidence);
  return v.ok ? [] : v.errors;
};
/** 첫 영역의 마지막 문단을 바꿔 본다 — 첫 문단은 용어 금지 · 내용 규칙이 따로 있어 두 번째 문단을 쓴다 */
const withParagraph = (text: string): CompatDraftV1 => {
  const d = clone(draftOf());
  d.sections[1].paragraphs[1] = text;
  return d;
};

test("모의 작성기의 초안은 세 쌍의 사주 모두에서 형식 검사를 통과하고 조립된다(자리 표시 글일 뿐이다)", () => {
  for (const [a, b] of PAIRS) {
    const r = compatOf(a, b);
    const d = composeMockCompat(buildCompatUserMessage(r.evidence, r.cautions));
    const v = validateCompatDraft(d, r.evidence);
    assert.ok(v.ok, v.ok ? "" : v.errors.join("\n"));
    assert.equal(d.sections.length, 5, "시기 근거가 없으면 다섯 영역");
    assert.deepEqual(d.sections.map((s) => s.id), COMPAT_SECTIONS.filter((s) => !s.optional).map((s) => s.id));
    assert.deepEqual(Object.keys(d.steps), COMPAT_STEP_GROUPS.map((g) => g.id));
    // 두 사람의 시기 근거까지 더하면 여섯 영역(timing 포함)이고 그 영역은 compat.timing.* 근거를 쓴다
    const t = withTiming(a, b);
    const dt = composeMockCompat(buildCompatUserMessage(t.evidence, t.r.cautions));
    const vt = validateCompatDraft(dt, t.evidence);
    assert.ok(vt.ok, vt.ok ? "" : vt.errors.join("\n"));
    assert.deepEqual(dt.sections.map((s) => s.id), COMPAT_SECTIONS.map((s) => s.id));
    assert.ok(dt.sections.at(-1)!.evidence.every((id) => id.startsWith("compat.timing.")));
  }
});

test("요청 근거: 궁합 엔진이 계산한 compat.* 근거가 그대로 가고, 두 사람을 A님 · B님으로만 부르며, 이름 · 생년월일 원문이 없다", () => {
  const msg = mockMessage();
  const payload = JSON.parse(msg.slice(msg.indexOf("{")));
  assert.deepEqual(payload.people, ["A님", "B님"]);
  assert.deepEqual(payload.evidence.map((e: { id: string }) => e.id), result.evidence.map((e) => e.id));
  assert.ok(payload.evidence.every((e: { id: string }) => e.id.startsWith("compat.")));
  assert.ok(!/1996|1994|03-29|11-02/.test(msg), "생년월일 형태가 없다");
  // 무료 간단 궁합과 같은 결과 — 유형 · 지수 근거가 요청에도 들어 있다
  const type = payload.evidence.find((e: { id: string }) => e.id === "compat.type");
  const score = payload.evidence.find((e: { id: string }) => e.id === "compat.score");
  assert.ok(type.fact.includes(result.coupleType.name));
  assert.ok(score.fact.includes(`궁합 지수 ${result.score}`));
});

test("지시문: 사주 궁합의 일(풀이 · 장면 · 조율 · 방향)과 쓰지 않는 것(판정 · 속마음 · 관계 종류 · 시기 · 상품 안내 · 응답 · 점수)을 함께 말한다", () => {
  assert.ok(COMPAT_SYSTEM_PROMPT.startsWith(COMPAT_PROMPT_MARK));
  for (const must of ["A님", "B님", "해요체", "쓰지 않는 것은 이 네 가지를 해치는 것", "누구 탓", "evidence", "~로 읽혀요", "관계의 종류를 단정하지", "속마음", "천생연분", "점수 숫자", "커플 유형 이름을 본문에서 되풀이하지", "두 사람의 시기", "두 사람의 응답은 이 풀이에 없다", "구매 안내는 화면이 한다", "JSON 객체 하나만", "첫 문단은 용어 없이", "그 모양이 읽히지 않았다는 뜻", "누가 누구를 키우는지의 방향이 없다", "strength가 weak인 근거", "세 영역 이상에서 되풀이하지 않는다", "우선 참고(목록에 있는 것만)", "영역마다 한두 개만", "0단계\"(compat.type)여도 근거에 작은 충", "compat.timing.*", "맞물리는 해", "aToB", "bToA", "together", "건넬 짧은 말 한 문장", "say는 사람이 실제로 입으로 건넬 수 있는 한 문장", "따옴표로 감싸지 않"]) {
    assert.ok(COMPAT_SYSTEM_PROMPT.includes(must), must);
  }
  for (const s of COMPAT_SECTIONS) assert.ok(COMPAT_SYSTEM_PROMPT.includes(`- ${s.id} (${s.topic}`), s.id);
  assert.equal(COMPAT_PROMPT_VERSION, "compat-v1-prompt-0.4");
  assert.equal(COMPAT_TIMING_BUILT, true, "두 사람의 시기(각자의 대운 · 세운을 나란히 놓는 범위)는 계산한다 — 바꾸면 이 시험 · 지시문 · 검사 · 화면 안내를 함께 바꾼다");
});

test("검사: 통과하는 글(조건형 · 두 분 · 장면)과 걸러야 할 글 — 관계 판정 · 속마음 · 관계 종류 · 시기 · 점수 · 한 글자 이름 · 첫 문단 용어", () => {
  const good = "A님 쪽이 먼저 움직이고 B님 쪽이 한 번 더 확인하는 흐름으로 읽혀요. 약속을 잡을 때 두 분의 속도가 달라서 답을 기다리는 시간이 길게 느껴질 수 있어요.";
  assert.deepEqual(errorsOf(withParagraph(good)), []);

  const bad: [string, RegExp][] = [
    ["두 분은 천생연분이라서 어떤 일이 있어도 이어질 수 있어요. 서로가 정말 잘 맞는 조합으로 읽혀요.", /좋고 나쁨|운명/],
    ["A님은 사실 마음속으로 B님이 부담스럽다고 느끼는 면이 있을 수 있어요. 그래서 거리를 두려는 쪽으로 읽혀요.", /속마음/],
    ["A님은 B님의 남자친구라서 연락이 늦으면 서운함이 쌓이기 쉬운 쪽으로 읽혀요. 그럴 때 한 번 말해 보면 좋아요.", /관계 종류/],
    ["올해 안에 두 분의 관계가 한 번 크게 깊어지는 시기가 올 수 있어요. 그 시기에 속도를 맞춰 보면 좋아요.", /시기/],
    ["두 분의 궁합 점수는 높아서 85점 정도로 볼 수 있어요. 그래서 대체로 편안하게 이어지기 쉬워요.", /점수/],
    ["A는 먼저 움직이는 쪽이고 B는 확인하는 쪽으로 읽혀요. 두 분이 약속을 정할 때 속도가 달라 보일 수 있어요.", /한 글자/],
  ];
  for (const [text, re] of bad) {
    const e = errorsOf(withParagraph(text)).join("\n");
    assert.match(e, re, text);
  }
  // 첫 문단에 사주 용어를 쓰면 막는다
  const termFirst = clone(draftOf());
  termFirst.sections[0].paragraphs[0] = "A님과 B님의 일간은 서로 돕는 관계로 읽혀요. 두 분이 함께 있을 때 한쪽이 다른 쪽을 받쳐 주는 장면이 자주 있을 수 있어요.";
  assert.match(errorsOf(termFirst).join("\n"), /첫 문단에는 사주 용어/);
});

test("검사: 영역 순서 · 없는 근거 · 근거 되풀이(세 영역까지) · 행동 묶음 개수 · 건넬 말(따옴표 · 되풀이)", () => {
  const d1 = clone(draftOf());
  d1.sections = [d1.sections[1], d1.sections[0], ...d1.sections.slice(2)];
  assert.match(errorsOf(d1).join("\n"), /순서로 5개/);

  const d2 = clone(draftOf());
  d2.sections[2].evidence = ["compat.없는근거"];
  assert.match(errorsOf(d2).join("\n"), /없는 근거 ID/);

  const d3 = clone(draftOf());
  for (const s of d3.sections) s.evidence = [result.evidence[0].id];
  assert.match(errorsOf(d3).join("\n"), new RegExp(`${COMPAT_LIMITS.evidenceReuseMax}개 영역까지만`));

  // 행동은 세 묶음 모두 1~2개
  const d4 = clone(draftOf());
  d4.steps.bToA = [];
  assert.match(errorsOf(d4).join("\n"), /steps\.bToA: 0개/);
  const d4b = clone(draftOf());
  d4b.steps.together = [d4b.steps.together[0], d4b.steps.together[0], d4b.steps.together[0]];
  assert.match(errorsOf(d4b).join("\n"), /steps\.together: 3개/);
  const d4c = clone(draftOf());
  delete (d4c as Partial<CompatDraftV1>).steps;
  assert.match(errorsOf(d4c).join("\n"), /steps: aToB/);

  // 건넬 말: 따옴표로 감싸지 않고, 같은 말을 되풀이하지 않는다
  const d5 = clone(draftOf());
  d5.steps.aToB[0].say = "\"천천히 정해도 괜찮아요\" 라고 말해 봐요";
  assert.match(errorsOf(d5).join("\n"), /따옴표로 감싸지 않습니다/);
  const d6 = clone(draftOf());
  d6.steps.bToA[0].say = d6.steps.aToB[0].say;
  assert.match(errorsOf(d6).join("\n"), /같은 건넬 말이 되풀이됩니다/);
  const d7 = clone(draftOf());
  d7.steps.bToA[0].detail = d7.steps.aToB[0].detail;
  assert.match(errorsOf(d7).join("\n"), /같은 행동 문장이 되풀이됩니다/);
});

test("시기: 두 사람의 시기 근거(compat.timing.*)가 있을 때만 timing 영역을 쓰고, 계산하지 않은 시기(내년 · 달 · 좋은 때 · 맞물리는 해)는 timing 안에서도 막고 다른 영역에서는 시기 이야기를 막는다", () => {
  // 근거가 있으면 여섯 영역이 필요하고 timing이 없으면 걸린다
  const ok = fullDraft();
  assert.deepEqual(fullErrors(ok), []);
  assert.equal(sectionsFor(full.evidence).length, 6);
  assert.equal(sectionsFor(result.evidence).length, 5);
  const noTiming = clone(ok);
  noTiming.sections = noTiming.sections.slice(0, 5);
  assert.match(fullErrors(noTiming).join("\n"), /순서로 6개/);
  // 근거가 없는데 timing 영역을 쓰면 걸린다
  assert.match(errorsOf(ok).join("\n"), /순서로 5개/);
  // timing 영역은 compat.timing.* 근거를 달아야 한다
  const wrongEvidence = clone(ok);
  wrongEvidence.sections[5].evidence = [full.evidence[0].id];
  assert.match(fullErrors(wrongEvidence).join("\n"), /compat\.timing\.\* 근거를 써야/);

  // timing 안에서 쓸 수 있는 말(근거에 적힌 시기 · 연도 안, 주제가 겹치는지 다른지)
  const inside = clone(ok);
  inside.sections[5].paragraphs[0] = "두 분이 지금 각자 지나는 시기는 신경 쓰는 주제가 서로 다를 수 있어요. 올해는 서로 무엇이 중요한지 한 번씩 물어봐 주면 같은 이야기를 하기 쉬워져요.";
  assert.deepEqual(fullErrors(inside), []);

  // timing 안에서도 계산하지 않은 시기는 막는다
  const notComputed = ["내년에는 두 분의 관계가 한 번 더 깊어지는 때가 올 수 있어요. 그때 속도를 맞춰 보면 좋아요.", "올해 3월에 두 분이 함께 하는 시간이 늘어나기 쉬워요. 그 달에 약속을 정해 두면 좋아요.", "두 분의 시기가 맞물리는 해에는 서로 더 잘 맞춰 갈 수 있어요. 그해를 기억해 두면 좋아요.", "올해는 두 분에게 좋은 시기라서 편안하게 이어지기 쉬워요. 그 점을 믿고 가면 좋아요."];
  for (const text of notComputed) {
    const d = clone(ok);
    d.sections[5].paragraphs[0] = text;
    assert.match(fullErrors(d).join("\n"), /계산하지 않은 시기 이야기/, text);
  }
  // 시기 근거의 사실 문장에 적힌 각자의 대운 시작 · 끝 연도는 쓸 수 있다(합친 범위의 양 끝만이 아니다) — 근거에 없는 해는 막는다
  const luck = full.evidence.find((e) => e.id === "compat.timing.luck")!;
  const personYears = [...luck.fact.matchAll(/(?<!\d)(20\d{2})-\d{2}/g)].map((m) => m[1]);
  assert.ok(personYears.length >= 4 && personYears.every((y) => compatAllowedYears(full.evidence).has(y)), "근거 문장의 연도는 모두 허용");
  const years = clone(ok);
  years.sections[5].paragraphs[0] = `A님은 대략 ${personYears[0]}년부터 ${personYears[1]}년 사이, B님은 대략 ${personYears[2]}년부터 ${personYears[3]}년 사이의 큰 시기를 지나는 것으로 읽혀요. 주제가 서로 달라 신경 쓰는 일도 다를 수 있으니 서로 먼저 물어봐 주면 좋아요.`;
  assert.deepEqual(fullErrors(years), []);
  const strange = clone(ok);
  strange.sections[5].paragraphs[0] = "A님은 대략 1999년부터 2009년 사이의 큰 시기를 지나는 것으로 읽혀요. 주제가 서로 달라 신경 쓰는 일도 다를 수 있으니 서로 먼저 물어봐 주면 좋아요.";
  assert.match(fullErrors(strange).join("\n"), /계산되지 않은 해/);
  // 다른 영역에서는 시기 이야기를 막는다(근거가 있어도 timing 영역에서만)
  const elsewhere = clone(ok);
  elsewhere.sections[1].paragraphs[1] = "올해는 두 분이 서로를 편하게 받쳐 주는 장면이 늘어나기 쉬워요. 그때 한 번 더 말해 보면 좋아요.";
  assert.match(fullErrors(elsewhere).join("\n"), /timing 영역에서만/);
  // 근거가 없을 때는 어느 영역에서도 막는다
  assert.match(errorsOf(withParagraph("올해는 두 분이 서로를 편하게 받쳐 주는 장면이 늘어나기 쉬워요. 그때 한 번 더 말해 보면 좋아요.")).join("\n"), /시기 근거가 없어/);
  // 시기 근거가 uncertain이면 timing 영역을 요구하지 않는다(출생 시각이 달라질 수 있어 해석에 쓰지 않는다)
  const uncertainEvidence = full.evidence.map((e) => (e.id.startsWith("compat.timing.") ? { ...e, uncertain: true } : e));
  assert.equal(sectionsFor(uncertainEvidence).length, 5);
});

test("조립: 커플 유형 · 지수 · 계산 재료는 무료 간단 궁합(cardOf)과 같은 결과이고, 이름 자리가 바뀌며, 모의 글은 판매할 수 없다고 표시된다", () => {
  const names = { a: "슬기", b: "남수" };
  const d = clone(draftOf());
  d.sections[1].paragraphs[1] = "A님 쪽이 먼저 움직이고 B님 쪽이 한 번 더 확인하는 흐름으로 읽혀요. 약속을 잡을 때 두 분의 속도가 달라서 답을 기다리는 시간이 길게 느껴질 수 있어요.";
  const report = assembleCompatReport(d, result, names, { provider: "mock", model: "mock", at: "2026-10-16T00:00:00Z", placeholder: true });
  const card = cardOf(result, names);
  assert.equal(report.summary.typeName, card.typeName);
  assert.equal(report.summary.score, card.score);
  assert.equal(report.summary.core, card.core);
  assert.deepEqual(report.summary.parts, card.basis);
  assert.equal(report.summary.scoreNotProbability, card.notes.scoreNotProbability);
  assert.equal(report.ruleVersion, result.version);
  assert.ok(report.sections[1].paragraphs[1].startsWith("슬기 님 쪽이 먼저 움직이고 남수 님 쪽이"));
  assert.ok(!/[AB]님/.test(JSON.stringify(report)), "A님 · B님 자리가 남지 않는다");
  assert.equal(report.placeholder, true);
  assert.deepEqual(report.sections.map((s) => s.id), COMPAT_SECTIONS.filter((s) => !s.optional).map((s) => s.id));
  // 시기 근거가 없는 초안: 안내는 "시기를 쓰지 못했다"
  assert.ok(report.notes.items.includes(COMPAT_NOTES.noResponses) && report.notes.items.includes(COMPAT_NOTES.timingMissing) && report.notes.items.includes(COMPAT_NOTES.noInnerMind) && report.notes.items.includes(COMPAT_NOTES.rule));
  assert.ok(!report.notes.items.includes(COMPAT_NOTES.timingUsed));
  assert.equal(nameText("A님과 B님", names), "슬기 님과 남수 님");
  // 행동 묶음이 이름으로 바뀌고 건넬 말도 이름 자리가 남지 않는다
  assert.deepEqual(Object.keys(report.steps), COMPAT_STEP_GROUPS.map((g) => g.id));
  for (const g of COMPAT_STEP_GROUPS) assert.ok(report.steps[g.id].every((a) => a.title && a.detail && a.say));

  // 시기 근거가 있는 초안: timing 영역이 조립되고 안내는 "시기를 읽었다"(관계가 좋아지는 때 · 추천 날짜 · 맞물리는 해는 계산하지 않았다고 밝힌다)
  const dt = clone(fullDraft());
  for (const s of dt.sections) s.paragraphs = s.paragraphs.map(() => "A님 쪽이 먼저 움직이고 B님 쪽이 한 번 더 확인하는 흐름으로 읽혀요. 약속을 잡을 때 두 분의 속도가 달라서 답을 기다리는 시간이 길게 느껴질 수 있어요.");
  const rt = assembleCompatReport(dt, full.r, names, { provider: "mock", model: "mock", at: "2026-10-17T00:00:00Z", placeholder: true });
  assert.equal(rt.sections.length, 6);
  assert.equal(rt.sections.at(-1)!.id, "timing");
  assert.ok(rt.notes.items.includes(COMPAT_NOTES.timingUsed) && !rt.notes.items.includes(COMPAT_NOTES.timingMissing));
  assert.match(COMPAT_NOTES.timingUsed, /맞물리는 해는 계산하지 않았/);
});

test("쓰기: 첫 글이 검사에 걸리면 이유와 함께 한 번 고쳐 쓰고, 계속 걸리면 INVALID, 호출이 실패하면 MODEL(일시 오류는 한 번 다시)", async () => {
  const input = { evidence: result.evidence, cautions: result.cautions };
  const good = JSON.stringify(draftOf());
  const calls: ModelRequest[] = [];
  const flaky: TextModel = {
    provider: "mock",
    model: "flaky",
    async complete(req) {
      calls.push(req);
      return { text: calls.length === 1 ? "```json\n{\"headline\":\"짧아요\"}\n```" : good, model: "flaky", usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  const usage: string[] = [];
  const draft = await createCompatWriter({ model: flaky, sleep: async () => {} }).write(input, { onUsage: (u) => usage.push(`${u.outcome}:${u.promptVersion}`) });
  assert.equal(draft.sections.length, 5);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].messages.length === 3 && calls[1].messages[2].content.includes("검사를 통과하지 못했습니다"), "나쁜 글과 이유가 함께 간다");
  assert.deepEqual(usage, [`invalid:${COMPAT_PROMPT_VERSION}`, `ok:${COMPAT_PROMPT_VERSION}`]);

  const bad: TextModel = { provider: "mock", model: "bad", complete: async (): Promise<ModelResult> => ({ text: "글이에요", model: "bad" }) };
  await assert.rejects(createCompatWriter({ model: bad, sleep: async () => {} }).write(input), (e: unknown) => e instanceof CompatWriteError && e.code === "INVALID" && e.errors.length > 0);

  let n = 0;
  const down: TextModel = {
    provider: "mock",
    model: "down",
    async complete() {
      n++;
      throw new ModelCallError("연결 실패", { retryable: true, code: "NETWORK_ERROR" });
    },
  };
  await assert.rejects(createCompatWriter({ model: down, sleep: async () => {} }).write(input), (e: unknown) => e instanceof CompatWriteError && e.code === "MODEL");
  assert.equal(n, 2, "일시 오류는 한 번 다시 시도");
});
