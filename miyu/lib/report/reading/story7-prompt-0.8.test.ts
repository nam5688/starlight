// 지시문 story-7-prompt-0.8 — 5차 실제 AI 글(지시문 0.7, 형식 검사 불통과 BLOCK 2 · WARN 7)에서 확인된 문제를 만든 지시문 줄만 최소로 고친 판의 회귀 시험(운영자 지시 2026-10-19).
// 실제 AI는 부르지 않는다. 이 시험이 통과해도 실제 AI의 글이 나아진다는 뜻이 아니다 — 0.8로는 실제 AI를 한 번도 시험하지 못했다(검증되지 않음).
// 확인하는 것: ① 문제를 유도한 옛 지시 문장이 사라지고 새 규칙이 들어갔다 ② 근거 · 프레임 · 7개 장 · 분량 상수 · BLOCK 정책은 바뀌지 않았다(검사가 걸러내던 문장은 그대로 걸린다)
// 5차 원문은 이 파일에 옮기지 않았다 — 아래 문장은 모두 유형을 보인 새로 쓴 예시다.
import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonas } from "../ai/compare-personas.ts";
import { buildEvidence } from "../ai/generator.ts";
import { hourUnknownErrors } from "./hour-scope.ts";
import { LIFE_WORDS7, lifeWordsPrompt } from "./life-words.ts";
import { composeMockStory7 } from "./story7-mock-model.ts";
import { STORY7_FORMULA_BUDGET, STORY7_LIMITS, STORY7_PROMPT_VERSION, STORY7_SECTIONS, STORY7_TASK_MAX, STORY7_TERMS } from "./story7-plan.ts";
import { buildStory7UserMessage, STORY7_SYSTEM_PROMPT } from "./story7-prompt.ts";
import { validateStory7Draft } from "./story7-validate.ts";
import type { Story7DraftV1 } from "./types.ts";

const PERSONAS = buildPersonas(10);
const UNKNOWN = PERSONAS[2]; // 출생 시각을 모르는 가상 인물(P03)
const REF = { year: 2026, month: 10 };
const EVIDENCE = buildEvidence(UNKNOWN.input, REF, { fortune: true });
const mockDraft = (): Story7DraftV1 => structuredClone(composeMockStory7(buildStory7UserMessage(EVIDENCE, "2026-10-17", UNKNOWN.input.context)));
const setPara = (d: Story7DraftV1, no: number, text: string, at = 0) => {
  const s = d.sections.find((x) => x.no === no)!;
  if (s.parts) s.parts[0].paragraphs[at] = text;
  else s.paragraphs![at] = text;
};
const errorsOf = (d: Story7DraftV1) => {
  const r = validateStory7Draft(d, EVIDENCE, { hasContext: Boolean(UNKNOWN.input.context) });
  return r.ok ? [] : r.errors;
};

const P = STORY7_SYSTEM_PROMPT;

test("지시문 0.8: 버전이 올랐고 5차 문제를 유도한 옛 지시 문장이 남지 않는다", () => {
  assert.equal(STORY7_PROMPT_VERSION, "story-7-prompt-0.8");
  for (const old of [
    // 구조 설명체를 유도한 문장(월령 · 강약 풀이를 환경의 도움 · 받쳐 주는 힘으로 쓰라고 한 지시)
    '"자란 환경 · 태어난 계절의 도움" 같은 생활 말로 쓴다',
    '"받쳐 주는 힘이 넉넉한 쪽 · 덜 받는 쪽"의 요소를 조건형 생활 말로 풀며',
    "자란 환경의 도움을 받는지 · 속에서 받쳐 주는 힘이 있는지 같은 생활 말로 풀며",
    // 근거에 없는 시기 말을 그대로 쓰라고 한 문장
    '"그 주제가 들어오는 시기에 크게 느껴질 수 있어요 · 일상에서 채우는 쪽을 전통에서는 권해요"까지만 쓴다',
    "그 주제가 시기(대운 · 세운)에 들어올 때 상대적으로 크게 느껴질 수 있다 (나)",
    "없는 쪽은 그 기운이 들어오는 시기에 크게 느껴지는 주제로 읽는다",
    // 개운 문단의 "시주를 알면 달라질 수 있다"만 덧붙이게 한 문장(범위는 앞에 두어야 한다)
    "시주를 알면 달라질 수 있다고 한 문장으로 곁들인다",
  ]) assert.ok(!P.includes(old), `옛 문장이 남아 있다: ${old}`);
  // 번역표: 어린 시절 · 환경의 도움을 사실처럼 풀게 한 행
  const rows = JSON.stringify(LIFE_WORDS7);
  assert.ok(!rows.includes("어린 시절 바깥 환경의 분위기"));
  assert.ok(!rows.includes("자란 환경에서 몸에 밴 모습"));
  assert.ok(!rows.includes("속에서 받쳐 주는 힘"));
  assert.ok(!lifeWordsPrompt().includes("힘을 받는 쪽 · 덜 받는 쪽으로만"));
});

test("지시문 0.8: 새 규칙이 들어갔다 — 설명체 금지 · 어린 시절 추정 금지 · 가족은 역할 후보 · 상대 반응 단정 금지 · 없음은 결함 아님 · 시기 말 지어내기 금지 · 개운 문장의 범위 · 과거 시기와 현재 성향 분리", () => {
  assert.match(P, /구조나 자리를 주어로 삼은 해설체로 쓰지 않는다/);
  assert.match(P, /주어는 이 사람이다/);
  assert.match(P, /어린 시절 · 성장 과정 · 가정 분위기를 이 사람의 사실이나 마음으로 추정하지 않는다/);
  assert.match(P, /형제 · 부모 · 가족의 지원이 실제로 있다 · 있었다 · 받는다고 쓰지 않는다/);
  assert.match(P, /도움을 주는 사람의 역할 후보/);
  assert.match(P, /상대가 어떻게 반응하는지를 알려 주는 자료는 없다/);
  assert.match(P, /마음 쓰는 방식을 말로 확인해 보는 선택지/);
  assert.match(P, /결함이나 그 기능이 부족하다는 뜻이 아니다/);
  assert.match(P, /시기 근거가 없는 곳에서 "그 기운 · 그 주제가 들어오는 시기에"를 만들어 쓰지 않는다/);
  assert.match(P, /개운 문단에서도 "적다 · 부족하다 · 보태 준다"를 말하는 그 문장이나 바로 앞 문장에 범위를 먼저 밝힌다/);
  assert.match(P, /시각을 알면 달라질 수 있어요"만 덧붙이는 것으로는 범위를 밝힌 것이 아니다/);
  assert.match(P, /현재 성향이 지난 시기의 증거인 것처럼 쓰지 않는다/);
  assert.match(P, /지난 시기 문장.*현재 성향 문장.*나눠 쓰고/);
  assert.match(P, /문장이 5개가 되면 내용을 빼지 말고 문단을 나눈다/);
});

test("지시문 0.8: 기존 안전 규칙은 그대로다(전통 해석 조건형 · 가족 사건 금지 · 계산하지 않은 판정 금지 · 오행 이름 최소)", () => {
  assert.match(P, /가족은 "전통에서는 ~로 읽어요 · ~기 쉬워요"로만 쓴다/);
  assert.match(P, /격국 · 용신 · 희신 · 기신 · 신살/);
  assert.match(P, /오행의 한글 이름.*해설의 주인공으로 쓰지 않는다.*6번 개운 문단/);
  assert.match(P, /지난 일 · 가족 구성 · 관계의 좋고 나쁨 · 입력받지 않은 사건과 사람을 있었던 일처럼 만들지 않는다/);
  assert.match(P, /동점/);
});

test("근거 · 프레임 · 분량 · 검사 한도는 바뀌지 않았다", () => {
  assert.deepEqual(STORY7_SECTIONS.map((s) => [s.no, s.maxParagraphs]), [[1, 5], [2, 3], [3, 4], [4, 4], [5, 5], [6, 6], [7, 2]]);
  assert.deepEqual(JSON.parse(JSON.stringify(STORY7_LIMITS)), {
    headline: { min: 10, max: 46 },
    sectionHeadline: { min: 8, max: 40 },
    paragraph: { min: 60, max: 420, sentencesMax: 4 },
    part: { min: 1, max: 3 },
    years: { min: 1, max: 3, themeMax: 40 },
    scenarios: { min: 1, max: 2, whenMax: 90, thenMax: 220 },
    actions: { min: 2, max: 3, titleMax: 30, detailMin: 20, detailMax: 220 },
    headlineOverlapMax: 0.5,
  });
  assert.deepEqual({ ...STORY7_TERMS }, { perSentenceMax: 3, perParagraphMax: 4, firstParagraphMax: 2 });
  assert.deepEqual(STORY7_FORMULA_BUDGET.map((f) => f.max), [4, 2, 2, 2]);
  assert.deepEqual({ ...STORY7_TASK_MAX }, { 6: 4, default: 2 });
  // 근거는 그대로 건넨다 — id · fact · cue가 buildEvidence 출력과 같다
  const msg = buildStory7UserMessage(EVIDENCE, "2026-10-17", UNKNOWN.input.context);
  const payload = JSON.parse(msg.slice(msg.indexOf("{"))) as { evidence: { id: string; fact: string; cue: string }[] };
  assert.equal(payload.evidence.length, EVIDENCE.length);
  for (const [i, e] of EVIDENCE.entries()) {
    assert.equal(payload.evidence[i].id, e.id);
    assert.equal(payload.evidence[i].fact, e.fact);
    assert.equal(payload.evidence[i].cue, e.cue);
  }
});

// ───── BLOCK은 낮추지 않았다 — 지시문이 바뀌어도 검사가 걸러내던 문장은 그대로 걸린다 (새로 쓴 예시 문장) ─────

test("BLOCK 유지: 4번 장에서 형제 · 부모의 지원을 사실처럼 쓴 문장은 막고, 전통 해석 조건형은 이 규칙에 걸리지 않는다", () => {
  const bad = mockDraft();
  setPara(bad, 4, "곁에서 형제가 든든하게 지원해 주고 있어서 큰 일도 혼자 떠안지 않고 해결해 와요. 그래서 사람 곁에서 일을 풀어 가는 쪽이 이 사람에게 잘 맞아요.");
  assert.ok(errorsOf(bad).some((m) => m.includes("가족(") && m.includes("사실처럼 쓰지 않습니다")), "가족 사실화는 BLOCK이다");
  const ok = mockDraft();
  setPara(ok, 4, "전통에서는 곁에서 함께 겨루고 나누는 사람의 모습을 형제나 동료의 자리로 읽어요. 그래서 비슷한 역할의 사람이 곁에 생기기 쉬운 모양으로 볼 수 있어요.");
  assert.ok(!errorsOf(ok).some((m) => m.includes("가족(") && m.includes("사실처럼 쓰지 않습니다")), "조건형 · 전통 해석 꼴은 이 규칙으로 막히지 않는다");
});

test("BLOCK 유지: 출생 시각을 모를 때 개운 문장의 '적다'는 같은 문장이나 바로 앞 문장에 범위가 있어야 한다 — 끝에만 붙인 안내는 부족하다", () => {
  const sentence = "타고난 바탕에 금 기운이 적은 편이라, 전통에서는 흰색 계열을 옷이나 소품으로 보태 보라고 읽어요.";
  const scopeLater = `${sentence} 출생 시각을 알면 달라질 수 있어요.`;
  const scopeSame = "출생 시각을 몰라 세 기둥으로 본 범위에서는 금 기운이 적은 편이라, 전통에서는 흰색 계열을 옷이나 소품으로 보태 보라고 읽어요.";
  const scopeBefore = "출생 시각을 몰라 세 기둥으로만 읽었어요. 금 기운이 적은 편이라, 전통에서는 흰색 계열을 옷이나 소품으로 보태 보라고 읽어요.";
  const has = (text: string) => hourUnknownErrors([{ where: "sections.6.paragraphs[2]", text }], { lifeWords: true }).length > 0;
  assert.ok(has(scopeLater), "범위가 뒤 문장에만 있으면 막힌다");
  assert.ok(!has(scopeSame), "같은 문장에 범위가 있으면 통과한다");
  assert.ok(!has(scopeBefore), "바로 앞 문장에 범위가 있으면 통과한다");
});

test("BLOCK 유지: 이 규칙 변경이 시주 풀이 · 신강 신약 · 대운 월 정밀도 검사를 건드리지 않았다", () => {
  const e = (text: string) => hourUnknownErrors([{ where: "w", text }], { lifeWords: true });
  assert.ok(e("말년에는 안정을 찾는 흐름이 읽혀요.").length > 0);
  assert.ok(e("일간이 신약이라 쉽게 지쳐요.").length > 0);
  assert.ok(e("대운은 2031년 11월에 바뀌어요.").length > 0);
});
