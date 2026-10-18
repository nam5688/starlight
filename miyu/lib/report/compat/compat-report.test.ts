// 실행: npm test — 사주 궁합 리포트(compat-v1, 7개 대주제 중 6번을 뺀 여섯 장): 근거(엔진의 compat.* + 두 사람의 오행 분포 · 개운)가 지시문 · 요청에 그대로 가는지, 지시문이 시기 · 판정 · 속마음 · 관계 종류 · 응답을 쓰지 말라고 하는지,
// 형식 검사가 이 규칙들을 실제로 막는지, 조립이 무료 간단 궁합과 같은 커플 유형 · 지수를 쓰는지, 쓰기(고쳐 쓰기 · 실패)가 되는지, 출생 시각을 모르는 사람의 범위가 지켜지는지 확인한다.
// 모의 작성기의 글은 자리 표시이며 좋은 글이 아니다 — 이 시험은 규칙이 지켜지는지 보는 것이고, 실제 AI가 쓴 글의 품질이나 궁합 풀이의 정확도를 보증하지 않는다.
import assert from "node:assert/strict";
import test from "node:test";
import { cardOf } from "../../compat/simple.ts";
import type { SajuOk } from "../../saju/engine.ts";
import { compatOf } from "../../saju/interpret/compat.ts";
import { compatExtraEvidence, compatFortifyElementsOf, compatFortifyHasTie } from "../../saju/interpret/compat-extra.ts";
import { compatTimingOf } from "../../saju/interpret/compat-timing.ts";
import { ELEMENT_FORTUNE, fortifyOf } from "../../saju/interpret/fortune.ts";
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
/** 한 사람이 출생 시각을 모르는 쌍(절기 당일이 아닌 날짜) */
const UNKNOWN_PAIR: [SajuOk, SajuOk] = [person(1990, 5, 17), person(1991, 9, 20, null)];
const result = compatOf(...PAIRS[0]);
/** 시기를 읽는 기준 시점 — 시험은 고정한 값을 쓴다 */
const REF = { year: 2026, month: 10 };
/** 엔진의 compat.* 근거만(시기 · 오행 분포 · 개운 근거가 없는 가장 작은 입력) */
const baseOf = (a: SajuOk, b: SajuOk) => {
  const r = compatOf(a, b);
  return { r, evidence: r.evidence };
};
/** 실제 요청과 같은 구성 — compat.* + 두 사람의 오행 분포 · 개운(compat-extra) + 두 사람의 시기(compat.timing.*) */
const fullOf = (a: SajuOk, b: SajuOk) => {
  const r = compatOf(a, b);
  return { r, evidence: [...r.evidence, ...compatExtraEvidence(a, b, r), ...compatTimingOf(a, b, REF).evidence] };
};
const base = baseOf(...PAIRS[0]);
const full = fullOf(...PAIRS[0]);
const messageOf = (x: { r: ReturnType<typeof compatOf>; evidence: typeof base.evidence }) => buildCompatUserMessage(x.evidence, x.r.cautions);
const draftOf = (x = base) => composeMockCompat(messageOf(x));
const fullDraft = () => draftOf(full);
const clone = (d: CompatDraftV1) => JSON.parse(JSON.stringify(d)) as CompatDraftV1;
const errorsWith = (d: unknown, evidence: typeof base.evidence) => {
  const v = validateCompatDraft(d, evidence);
  return v.ok ? [] : v.errors;
};
const warningsWith = (d: unknown, evidence: typeof base.evidence) => validateCompatDraft(d, evidence).warnings;
const errorsOf = (d: unknown) => errorsWith(d, base.evidence);
const warningsOf = (d: unknown) => warningsWith(d, base.evidence);
const fullErrors = (d: unknown) => errorsWith(d, full.evidence);
const sec = (d: CompatDraftV1, id: string) => d.sections.find((s) => s.id === id)!;
/** 오행 조화 장(harmony)의 마지막 문단을 바꿔 본다 — 첫 문단은 용어 한도가 따로 있어 두 번째 문단을 쓴다 */
const withParagraph = (text: string): CompatDraftV1 => {
  const d = clone(draftOf());
  sec(d, "harmony").paragraphs[1] = text;
  return d;
};
const PAD = "두 분이 함께 있는 장면을 일상의 말로 풀어 쓰고 있는 자리라서 글자 수를 충분히 채워 둡니다 그래서 길이 검사는 걸리지 않아요";

test("모의 작성기의 초안은 세 쌍의 사주 모두에서 형식 검사를 통과하고 조립된다(자리 표시 글일 뿐이다) — 여섯 장 + 추천 질문", () => {
  for (const [a, b] of PAIRS) {
    const r = compatOf(a, b);
    const d = composeMockCompat(buildCompatUserMessage(r.evidence, r.cautions));
    const v = validateCompatDraft(d, r.evidence);
    assert.ok(v.ok, v.ok ? "" : v.errors.join("\n"));
    assert.deepEqual(d.sections.map((s) => s.id), COMPAT_SECTIONS.map((s) => s.id));
    assert.deepEqual(d.sections.map((s) => s.id), ["overview", "harmony", "fit", "friction", "love", "advice"], "사주 궁합은 6번(view)을 뺀 여섯 장");
    assert.deepEqual(Object.keys(d.steps), COMPAT_STEP_GROUPS.map((g) => g.id));
    assert.ok(d.questions.length >= COMPAT_LIMITS.questions.min);
    // 실제 요청과 같은 구성(오행 분포 · 개운 · 시기까지)에서는 맡은 장이 그 근거를 단다
    const t = fullOf(a, b);
    const dt = composeMockCompat(buildCompatUserMessage(t.evidence, t.r.cautions));
    const vt = validateCompatDraft(dt, t.evidence);
    assert.ok(vt.ok, vt.ok ? "" : vt.errors.join("\n"));
    // 절기 당일 · 경계로 uncertain인 근거는 해석에 쓰지 않으므로(모의 작성기도 달지 않는다) 쓸 수 있을 때만 단다
    const usable = (id: string) => t.evidence.some((e) => e.id === id && !e.uncertain);
    assert.equal(sec(dt, "harmony").evidence.includes("compat.chart"), usable("compat.chart"));
    assert.equal(sec(dt, "advice").evidence.includes("compat.fortify"), usable("compat.fortify"));
    assert.equal(sec(dt, "love").evidence.some((id) => id.startsWith("compat.timing.")), usable("compat.timing.luck") || usable("compat.timing.year"));
  }
});

test("요청 근거: 궁합 엔진이 계산한 compat.* 근거와 두 사람의 오행 분포 · 개운이 그대로 가고, 두 사람을 A님 · B님으로만 부르며, 이름 · 생년월일 원문이 없다 · 장은 id · 이름만 건넨다(묻는 것은 지시문에 있다)", () => {
  const msg = messageOf(full);
  const payload = JSON.parse(msg.slice(msg.indexOf("{")));
  assert.deepEqual(payload.people, ["A님", "B님"]);
  assert.deepEqual(payload.evidence.map((e: { id: string }) => e.id), full.evidence.map((e) => e.id));
  assert.ok(payload.evidence.every((e: { id: string }) => e.id.startsWith("compat.")));
  assert.ok(payload.evidence.some((e: { id: string }) => e.id === "compat.chart") && payload.evidence.some((e: { id: string }) => e.id === "compat.fortify"));
  assert.ok(!/1996|1994|03-29|11-02/.test(msg), "생년월일 형태가 없다");
  assert.deepEqual(Object.keys(payload.sections[0]).sort(), ["id", "topic"]);
  // 무료 간단 궁합과 같은 결과 — 유형 · 지수 근거가 요청에도 들어 있다
  const type = payload.evidence.find((e: { id: string }) => e.id === "compat.type");
  const score = payload.evidence.find((e: { id: string }) => e.id === "compat.score");
  assert.ok(type.fact.includes(full.r.coupleType.name));
  assert.ok(score.fact.includes(`궁합 지수 ${full.r.score}`));
});

test("무료와 유료의 일치: 새 근거(compat.chart · fortify)는 유료 풀이를 만들 때만 더해지고, 무료 간단 궁합이 쓰는 compatOf의 결과(점수 · 유형 · 근거 목록)는 바뀌지 않는다", () => {
  const r = compatOf(...PAIRS[0]);
  assert.ok(!r.evidence.some((e) => /^compat\.(chart|fortify)$/.test(e.id)), "compatOf의 근거에는 새 근거가 없다");
  const extra = compatExtraEvidence(...PAIRS[0], r);
  assert.deepEqual(extra.map((e) => e.id), ["compat.chart", "compat.fortify"]);
  // 같은 입력이면 같은 결과(순서를 바꿔도 점수 · 유형은 같다)
  const swapped = compatOf(PAIRS[0][1], PAIRS[0][0]);
  assert.equal(swapped.score, r.score);
  assert.equal(swapped.coupleType.id, r.coupleType.id);
  // 새 근거 문장에는 계산하지 않은 판정 이름이 없다
  for (const e of extra) assert.doesNotMatch(`${e.fact} ${e.cue}`, /격국|용신|희신|기신|신살|십이운성/, e.id);
  // 개운 근거는 보완 후보 1순위 기운의 전통 대응(방향 · 색 · 수)을 그대로 담는다
  const elements = compatFortifyElementsOf(extra);
  assert.ok(elements.length >= 1);
  for (const el of elements) {
    const f = ELEMENT_FORTUNE[el];
    const cue = extra[1].cue;
    assert.ok(cue.includes(f.direction) && cue.includes(f.colors[0]) && cue.includes(String(f.numbers[0])), el);
  }
});

test("지시문: 사주 궁합의 일(명리 풀이 · 장면 · 조율 · 개운 · 방향)과 쓰지 않는 것(판정 · 속마음 · 관계 종류 · 시기 · 상품 안내 · 응답 · 점수)을 함께 말한다", () => {
  assert.ok(COMPAT_SYSTEM_PROMPT.startsWith(COMPAT_PROMPT_MARK));
  for (const must of ["A님", "B님", "해요체", "쓰지 않는 것은 이 일을 해치는 것", "누구 탓", "evidence", "~로 읽혀요", "두 사람의 관계 종류", "속마음", "천생연분", "점수 숫자", "커플 유형 이름을 되풀이하지", "응답은 이 풀이에 없다", "구매 · 가격 · 질문권", "JSON 객체 하나만", "그 모양이 읽히지 않았다는 뜻", "누가 누구를 키우는지의 방향이 없다", "weak 근거", "반복의 기준은 낱말 횟수가 아니다", "compat.timing.*", "맞물리는 해", "aToB", "bToA", "together", "건넬 짧은 말 한 문장", "따옴표 없이", "compat.fortify", "questions", "세 기둥(시주 제외)", "자녀 · 출산", "격국 · 용신 · 희신 · 기신 · 신살 · 십이운성", "명리 풀이가 이 글의 중심이다", "우선 참고(목록에 있는 것만)", "0단계여도 작은 충 · 형"]) {
    assert.ok(COMPAT_SYSTEM_PROMPT.includes(must), must);
  }
  for (const s of COMPAT_SECTIONS) assert.ok(COMPAT_SYSTEM_PROMPT.includes(` ${s.id} (${s.topic}`), s.id);
  assert.ok(!COMPAT_SYSTEM_PROMPT.includes(" view ("), "사주 궁합에는 6번(응답 비교) 장이 없다");
  assert.equal(COMPAT_PROMPT_VERSION, "compat-v1-prompt-0.5");
  assert.equal(COMPAT_TIMING_BUILT, true, "두 사람의 시기(각자의 대운 · 세운을 나란히 놓는 범위)는 계산한다 — 바꾸면 이 시험 · 지시문 · 검사 · 화면 안내를 함께 바꾼다");
});

test("검사: 통과하는 글(조건형 · 두 분 · 장면)과 걸러야 할 글 — 관계 판정 · 속마음 · 관계 종류 · 시기 · 점수 · 한 글자 이름 · 첫 문단 용어 한도", () => {
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
  // 첫 문단: 명리 풀이를 위해 용어 둘까지(풀이와 함께)가 권장이고, 셋 이상은 경고(WARN)만 한다 — 저장을 막지 않고 고쳐 쓰기도 부탁하지 않는다(운영자 정책 2026-10-17)
  const twoTerms = clone(draftOf());
  sec(twoTerms, "overview").paragraphs[0] = "A님과 B님의 일간(태어난 날의 하늘 글자)은 서로 돕는 관계로 읽혀요. 두 분이 함께 있을 때 한쪽이 다른 쪽을 받쳐 주는 장면이 자주 있을 수 있어요.";
  assert.deepEqual(errorsOf(twoTerms), []);
  const manyTerms = clone(draftOf());
  sec(manyTerms, "overview").paragraphs[0] = "A님과 B님의 일간은 서로 돕는 관계이고 천간합과 오행의 조화도 함께 읽혀요. 두 분이 함께 있을 때 한쪽이 다른 쪽을 받쳐 주는 장면이 자주 있을 수 있어요.";
  assert.match(warningsOf(manyTerms).join("\n"), /첫 문단에 사주 용어/);
  assert.ok(!errorsOf(manyTerms).some((e) => /사주 용어/.test(e)), "용어 개수는 BLOCK이 아니다");
  assert.ok(validateCompatDraft(manyTerms, base.evidence).ok, "경고만 있는 글은 통과(저장)한다 — 판매 합격은 아니다");
  // 문단 문장 수 · 설명 없는 용어도 경고다
  const longPara = clone(draftOf());
  sec(longPara, "overview").paragraphs[1] = "A님과 B님은 서로 다른 속도로 움직여요. 한쪽이 먼저 정하고 다른 쪽이 따라가는 장면이 있어요. 그때 서운함이 생길 수 있어요. 말로 확인하면 풀리기 쉬워요. 다섯째 문장이 하나 더 이어져요. 여섯째 문장으로 마무리해요 그래서 길이는 충분해요.";
  assert.match(warningsOf(longPara).join("\n"), /문장 \(4문장 이하로 묶어 주세요\)/);
  assert.ok(!errorsOf(longPara).some((e) => /문장 \(/.test(e)));
  // BLOCK은 그대로 — 두 사람의 속마음을 아는 것처럼 쓰거나 없는 근거를 인용하면 용어 설명을 붙여도 막는다
  const blockMind = clone(draftOf());
  sec(blockMind, "overview").paragraphs[1] = "A님은 속으로 B님이 떠날까 봐 늘 불안해하고 있어요. 두 분이 함께 있을 때 그 마음이 자주 드러나요.";
  assert.ok(errorsOf(blockMind).length > 0, "속마음 단정은 BLOCK이다");
});

test("검사: 장 순서 · 없는 근거 · 근거 되풀이(다섯 장까지) · 행동 묶음 개수 · 건넬 말(따옴표 · 되풀이) · 추천 질문", () => {
  const d1 = clone(draftOf());
  d1.sections = [d1.sections[1], d1.sections[0], ...d1.sections.slice(2)];
  assert.match(errorsOf(d1).join("\n"), /순서로 6개/);

  const d2 = clone(draftOf());
  d2.sections[2].evidence = ["compat.없는근거"];
  assert.match(errorsOf(d2).join("\n"), /없는 근거 ID/);

  // 같은 근거를 모든 장이 인용해도 새 정보가 있으면 되지만, 거의 모든 장을 끌고 가면 걸린다(다섯 장까지)
  const d3 = clone(draftOf());
  for (const s of d3.sections) s.evidence = [base.evidence[0].id];
  assert.match(errorsOf(d3).join("\n"), new RegExp(`${COMPAT_LIMITS.evidenceReuseMax}개 영역까지만`));
  const d3b = clone(draftOf());
  d3b.sections.forEach((s, i) => (s.evidence = i < COMPAT_LIMITS.evidenceReuseMax ? [base.evidence[0].id, base.evidence[1].id] : [base.evidence[2].id]));
  assert.ok(!errorsOf(d3b).some((e) => /영역까지만/.test(e)), "다섯 장까지는 같은 근거를 쓸 수 있다");

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

  // 추천 질문: 2~3개 · 물음표로 끝나는 질문 한 문장 · 따옴표 없음 · 되풀이 없음
  const q0 = clone(draftOf());
  q0.questions = ["서로 어떤 방식이 편한지 한 번 물어봐 줄래요?"];
  assert.match(errorsOf(q0).join("\n"), /questions: 1개/);
  const q1 = clone(draftOf());
  q1.questions = ["서로 어떤 방식이 편한지 한 번 이야기해 봐요.", "함께 정해 두면 좋을 약속이 있을까요?"];
  assert.match(errorsOf(q1).join("\n"), /물음표로 끝나는 질문/);
  const q2 = clone(draftOf());
  q2.questions = [q2.questions[0], q2.questions[0]];
  assert.match(errorsOf(q2).join("\n"), /같은 질문이 되풀이됩니다/);
  const q3 = clone(draftOf());
  delete (q3 as Partial<CompatDraftV1>).questions;
  assert.match(errorsOf(q3).join("\n"), /questions: 0개/);
  // 질문도 속마음 단정 검사를 받는다
  const q4 = clone(draftOf());
  q4.questions = ["B님은 사실 속으로 A님을 싫어하고 있는 건 아닐까요?", q4.questions[1]];
  assert.match(errorsOf(q4).join("\n"), /속마음/);
});

test("반복: 같은 구절 · 같은 말로 여는 문단은 저장을 막지 않는다(운영자 2026-10-17) — 읽기 전 지표로만 센다. 문장이 통째로 같은 복사는 여전히 막는다", () => {
  const d = clone(draftOf());
  const NUMS = ["하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉", "열", "열하나", "열둘"];
  let n = 0;
  // 문장은 저마다 다르고(끝말만 바뀜) 12자 이상의 같은 구절만 되풀이되는 글 — 낱말 · 구절 반복만으로는 막지 않는다
  for (const s of d.sections) s.paragraphs = s.paragraphs.map(() => `${NUMS[n]} 번째 장면에서는 A님 쪽이 먼저 움직이고 B님 쪽이 한 번 더 확인하는 흐름으로 읽혀요. 약속을 잡을 때 두 분의 속도가 달라서 답을 기다리는 시간이 길게 느껴질 수 있어요 ${NUMS[n++]}.`);
  const v = validateCompatDraft(d, base.evidence);
  assert.ok(v.ok, v.ok ? "" : v.errors.join("\n"));
  if (v.ok) assert.ok(v.repeats.length > 0, "되풀이는 지표로 남는다");
  // 문장이 통째로 같은 복사는 막는다
  const copy = clone(draftOf());
  for (const s of copy.sections) s.paragraphs = s.paragraphs.map(() => "A님 쪽이 먼저 움직이고 B님 쪽이 한 번 더 확인하는 흐름으로 읽혀요. 약속을 잡을 때 두 분의 속도가 달라서 답을 기다리는 시간이 길게 느껴질 수 있어요.");
  assert.match(errorsOf(copy).join("\n"), /같은 문장이 반복됩니다/);
});

test("시기: 시기 이야기는 5번 장(연애와 결혼 궁합)의 한 문단에서만 쓰고(근거 compat.timing.*이 있을 때), 계산하지 않은 시기(내년 · 달 · 좋은 때 · 맞물리는 해)는 그 안에서도 막는다", () => {
  const ok = fullDraft();
  assert.deepEqual(fullErrors(ok), []);
  assert.equal(sectionsFor(full.evidence).length, 6, "시기 근거가 있어도 장은 여섯 개(시기는 5번 장 안의 한 문단)");
  // 5번 장은 시기 근거를 달아야 한다
  const noCite = clone(ok);
  sec(noCite, "love").evidence = [full.evidence[0].id];
  assert.match(fullErrors(noCite).join("\n"), /compat\.timing\.\*\)가 있으면 5번 장/);

  // 5번 장 안에서 쓸 수 있는 말(근거에 적힌 시기 · 연도 안, 주제가 겹치는지 다른지)
  const inside = clone(ok);
  sec(inside, "love").paragraphs[2] = "두 분이 지금 각자 지나는 시기는 신경 쓰는 주제가 서로 다를 수 있어요. 올해는 서로 무엇이 중요한지 한 번씩 물어봐 주면 같은 이야기를 하기 쉬워져요.";
  assert.deepEqual(fullErrors(inside), []);

  // 5번 장 안에서도 계산하지 않은 시기는 막는다
  const notComputed = ["내년에는 두 분의 관계가 한 번 더 깊어지는 때가 올 수 있어요. 그때 속도를 맞춰 보면 좋아요.", "올해 3월에 두 분이 함께 하는 시간이 늘어나기 쉬워요. 그 달에 약속을 정해 두면 좋아요.", "두 분의 시기가 맞물리는 해에는 서로 더 잘 맞춰 갈 수 있어요. 그해를 기억해 두면 좋아요.", "올해는 두 분에게 좋은 시기라서 편안하게 이어지기 쉬워요. 그 점을 믿고 가면 좋아요."];
  for (const text of notComputed) {
    const d = clone(ok);
    sec(d, "love").paragraphs[2] = text;
    assert.match(fullErrors(d).join("\n"), /계산하지 않은 시기 이야기|좋고 나쁨을 매기지/, text);
  }
  // 시기 근거의 사실 문장에 적힌 각자의 대운 시작 · 끝 연도는 쓸 수 있다 — 근거에 없는 해는 막는다
  const luck = full.evidence.find((e) => e.id === "compat.timing.luck")!;
  const personYears = [...luck.fact.matchAll(/(?<!\d)(20\d{2})-\d{2}/g)].map((m) => m[1]);
  assert.ok(personYears.length >= 4 && personYears.every((y) => compatAllowedYears(full.evidence).has(y)), "근거 문장의 연도는 모두 허용");
  const years = clone(ok);
  sec(years, "love").paragraphs[2] = `A님은 대략 ${personYears[0]}년부터 ${personYears[1]}년 사이, B님은 대략 ${personYears[2]}년부터 ${personYears[3]}년 사이의 큰 시기를 지나는 것으로 읽혀요. 주제가 서로 달라 신경 쓰는 일도 다를 수 있으니 서로 먼저 물어봐 주면 좋아요.`;
  assert.deepEqual(fullErrors(years), []);
  const strange = clone(ok);
  sec(strange, "love").paragraphs[2] = "A님은 대략 1999년부터 2009년 사이의 큰 시기를 지나는 것으로 읽혀요. 주제가 서로 달라 신경 쓰는 일도 다를 수 있으니 서로 먼저 물어봐 주면 좋아요.";
  assert.match(fullErrors(strange).join("\n"), /계산되지 않은 해/);
  // 다른 장에서는 시기 이야기를 막는다(근거가 있어도 5번 장에서만)
  const elsewhere = clone(ok);
  sec(elsewhere, "harmony").paragraphs[1] = "올해는 두 분이 서로를 편하게 받쳐 주는 장면이 늘어나기 쉬워요. 그때 한 번 더 말해 보면 좋아요.";
  assert.match(fullErrors(elsewhere).join("\n"), /5번 장\(연애와 결혼 궁합\)에서만/);
  // 근거가 없을 때는 5번 장을 포함한 어느 장에서도 막는다
  const noEvidence = clone(draftOf());
  sec(noEvidence, "love").paragraphs[2] = "올해는 두 분이 서로를 편하게 받쳐 주는 장면이 늘어나기 쉬워요. 그때 한 번 더 말해 보면 좋아요.";
  assert.match(errorsOf(noEvidence).join("\n"), /시기 근거가 없어/);
  // 시기 근거가 uncertain이면 5번 장이 그 근거를 달라고 요구하지 않는다(출생 시각이 달라질 수 있어 해석에 쓰지 않는다)
  const uncertainEvidence = full.evidence.map((e) => (e.id.startsWith("compat.timing.") ? { ...e, uncertain: true } : e));
  const d = clone(ok);
  sec(d, "love").evidence = [full.evidence[0].id];
  assert.deepEqual(errorsWith(d, uncertainEvidence), []);
});

test("오행 조화 · 개운: 2번 장은 두 사람의 오행 분포 근거를 쓰고, 7번 장의 개운은 근거에 적힌 보완 후보 기운의 대응(방향 · 색 · 숫자 · 장소 셋 이상)을 말한다 — 보장하는 말은 막고 전통 개운법은 막지 않는다", () => {
  const ok = fullDraft();
  assert.deepEqual(fullErrors(ok), []);
  // 2번 장이 compat.chart를 달지 않으면 걸린다
  const noChart = clone(ok);
  sec(noChart, "harmony").evidence = noChart.sections[0].evidence;
  assert.match(fullErrors(noChart).join("\n"), /compat\.chart/);
  // 7번 장이 compat.fortify를 달지 않거나 대응을 말하지 않으면 걸린다
  const noFortify = clone(ok);
  sec(noFortify, "advice").evidence = [full.evidence[0].id];
  assert.match(fullErrors(noFortify).join("\n"), /compat\.fortify/);
  const element = compatFortifyElementsOf(full.evidence)[0];
  const f = ELEMENT_FORTUNE[element];
  const vague = clone(ok);
  sec(vague, "advice").paragraphs = [`두 분이 함께 있을 때 기운을 보태 줄 작은 습관을 하나 정해 두면 좋아요. 이 기운이 적어서 생활에서 보태 주면 균형이 맞는다고 전통에서 읽어요. ${PAD}`];
  assert.match(fullErrors(vague).join("\n"), /개운 풀이에서 방향 · 색 · 숫자 · 장소 가운데/);
  // 근거의 대응을 그대로 쓴 전통 개운법은 통과한다
  const traditional = clone(ok);
  sec(traditional, "advice").paragraphs = [`이 기운이 적어서 생활에서 보태 주면 균형이 맞는다고 전통에서 읽어요. 두 분이 함께 머무는 공간은 ${f.places[0]}처럼, 소품은 ${f.colors[0]} 계열로, 산책은 ${f.direction} 쪽으로, 즐겨 쓰는 번호는 ${f.numbers[0]}이나 ${f.numbers[1]}로 가볍게 먼저 해 볼 수 있어요.`];
  assert.deepEqual(fullErrors(traditional), []);
  // 효과 · 결과를 보장하는 말과 액운 · 부적 · 복권은 막는다
  for (const text of ["이 색을 쓰면 반드시 재산이 늘어요. 두 분의 운도 틀림없이 바뀌어요.", "이 방향으로 걸으면 액운을 막아 줘요. 부적처럼 지니고 다니면 좋아요."]) {
    const d = clone(traditional);
    sec(d, "advice").paragraphs = [`${text} ${f.direction} ${f.colors[0]} ${f.numbers[0]} ${f.places[0]} ${PAD}`];
    assert.ok(fullErrors(d).length > 0, text);
  }
  // 근거에 개운 근거가 없으면(가장 작은 입력) 요구하지 않는다
  assert.deepEqual(errorsOf(draftOf()), []);
});

test("개운 동점(운영자 2026-10-18): 보완 후보의 개수가 같으면 1순위로 정하지 않고 같은 무게의 후보로 둘 다 싣는다 — 계산 규칙은 그대로이고 동점이 없으면 예전 형식 그대로", () => {
  // 동점이 없는 쌍은 "보완 후보 1순위" 그대로 — 동점은 흔해서(PAIRS[0]도 동점이 있다) 동점이 없는 두 사람을 찾아 쓴다
  const noTie = [person(1994, 11, 7, "08:40"), person(1996, 3, 29), person(1990, 5, 17), person(2001, 1, 9), person(1999, 12, 24), person(1985, 7, 3), person(1992, 2, 20)].filter((p) => fortifyOf(p).tied.length === 0);
  assert.ok(noTie.length >= 2, "동점이 없는 사람 둘을 찾는다");
  const plain = fullOf(noTie[0], noTie[1]);
  const plainEv = plain.evidence.find((e) => e.id === "compat.fortify")!;
  assert.match(plainEv.fact, /^보완 후보 1순위\(/);
  assert.doesNotMatch(plainEv.fact, /동점/);
  assert.equal(compatFortifyHasTie(plain.evidence), false);
  // 동점인 사람(1980-04-14 시각 미상은 목 · 수가 모두 없다)이 있는 쌍
  const tieA = person(1980, 4, 14, null);
  const f = fortifyOf(tieA);
  assert.equal(f.primary.element, "목", "1순위 계산은 그대로");
  assert.deepEqual(f.tied, ["수"]);
  const x = fullOf(tieA, person(1994, 11, 2));
  const ev = x.evidence.find((e) => e.id === "compat.fortify")!;
  assert.match(ev.fact, /^보완 후보\(오행 개수와 태어난 계절로 정한 단순화\): A님 목\(木, 없음\) · 수\(水, 없음\) — 동점\(개수가 같아 우선순위를 가릴 수 없는 같은 후보\)/);
  assert.doesNotMatch(ev.fact, /1순위/);
  assert.match(ev.cue, /같은 무게로 소개하고, 하나를 최우선 · 가장 필요한 기운으로 정하지 않습니다/);
  assert.equal(compatFortifyHasTie(x.evidence), true);
  const els = compatFortifyElementsOf(x.evidence);
  assert.ok(els.includes("목") && els.includes("수"), els.join(","));
  // 근거의 대응은 후보 모두의 방향 · 색 · 숫자 · 장소를 싣는다
  for (const el of ["목", "수"] as const) {
    const m = ELEMENT_FORTUNE[el];
    assert.ok(ev.cue.includes(m.direction) && ev.cue.includes(m.colors[0]) && ev.cue.includes(String(m.numbers[0])), el);
  }
  // 모의 글은 통과하고, 동점 후보를 하나로 정해 말하면 막는다(어느 후보의 대응이든 셋 이상 말하면 통과)
  const ok = draftOf(x);
  assert.deepEqual(errorsWith(ok, x.evidence), []);
  const d = clone(ok);
  const advice = sec(d, "advice");
  advice.paragraphs = [`${advice.paragraphs[0]} 수 기운이 최우선으로 필요한 기운이에요.`, ...advice.paragraphs.slice(1)];
  assert.match(errorsWith(d, x.evidence).join("\n"), /동점 후보가 있어 "최우선"처럼 하나를 먼저/);
  // 같은 문장이라도 동점이 없는 근거에서는 이 검사가 걸리지 않는다(그 쌍의 개운 대응 검사는 따로 걸릴 수 있다)
  assert.doesNotMatch(errorsWith(d, plain.evidence).join("\n"), /동점 후보/);
});

test("출생 시각을 모르는 사람이 있으면: 근거에 세 기둥 기준이 적히고(weak), 없음 · 적음에 범위를 밝히게 하며 시주 풀이 · 신강/신약 · 가족사 단정을 막는다", () => {
  const [a, b] = UNKNOWN_PAIR;
  assert.equal(b.hourPillarOmitted, true);
  const x = fullOf(a, b);
  const chart = x.evidence.find((e) => e.id === "compat.chart")!;
  assert.match(chart.fact, /세 기둥\(시주 제외\) 기준/);
  assert.equal(chart.strength, "weak");
  assert.equal(x.evidence.find((e) => e.id === "compat.fortify")!.strength, "weak");
  const ok = draftOf(x);
  assert.deepEqual(errorsWith(ok, x.evidence), []);
  const errs = (text: string) => {
    const d = clone(ok);
    sec(d, "harmony").paragraphs[1] = `${text} ${PAD}`;
    return errorsWith(d, x.evidence).join("\n");
  };
  assert.match(errs("B님에게는 토 기운이 하나도 없어서 중심을 잡는 힘이 약해요."), /세 기둥 기준/);
  assert.doesNotMatch(errs("출생 시각을 몰라 세 기둥으로 보면 B님에게는 토 기운이 보이지 않아요(시주에 있을 수 있어요)."), /세 기둥 기준/);
  assert.match(errs("B님은 신약해서 A님의 도움을 받는 구조로 읽혀요."), /신약/);
  assert.match(errs("두 분의 자녀가 학업에서 두각을 나타낼 수 있어요."), /시주로 읽는 풀이/);
  assert.match(errs("B님은 어머니의 도움을 받지 못했다고 봐요."), /가족/);
  // 시각을 모두 아는 쌍에는 이 검사를 적용하지 않는다
  const known = fullOf(...PAIRS[0]);
  const dk = clone(draftOf(known));
  sec(dk, "harmony").paragraphs[1] = `B님에게는 토 기운이 하나도 없어서 서로 채워 주는 조합으로 읽혀요. ${PAD}`;
  assert.ok(!errorsWith(dk, known.evidence).some((e) => /세 기둥 기준/.test(e)));
});

test("조립: 커플 유형 · 지수 · 계산 재료는 무료 간단 궁합(cardOf)과 같은 결과이고, 이름 자리가 바뀌며, 모의 글은 판매할 수 없다고 표시된다 — 추천 질문 · 가족 · 자녀 인연 미계산 안내 포함", () => {
  const names = { a: "슬기", b: "남수" };
  const d = clone(draftOf());
  sec(d, "harmony").paragraphs[1] = "A님 쪽이 먼저 움직이고 B님 쪽이 한 번 더 확인하는 흐름으로 읽혀요. 약속을 잡을 때 두 분의 속도가 달라서 답을 기다리는 시간이 길게 느껴질 수 있어요.";
  d.questions = ["A님이 편한 연락 방식은 어떤 건지 B님에게 물어봐 줄래요?", "B님이 쉬고 싶은 날에는 어떻게 말해 주면 좋을까요?"];
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
  assert.deepEqual(report.sections.map((s) => s.id), COMPAT_SECTIONS.map((s) => s.id));
  assert.deepEqual(report.questions, ["슬기 님이 편한 연락 방식은 어떤 건지 남수 님에게 물어봐 줄래요?", "남수 님이 쉬고 싶은 날에는 어떻게 말해 주면 좋을까요?"]);
  // 시기 근거를 인용하지 않은 초안: 안내는 "시기를 쓰지 못했다"
  assert.ok(report.notes.items.includes(COMPAT_NOTES.noResponses) && report.notes.items.includes(COMPAT_NOTES.timingMissing) && report.notes.items.includes(COMPAT_NOTES.noInnerMind) && report.notes.items.includes(COMPAT_NOTES.rule));
  assert.ok(report.notes.items.includes(COMPAT_NOTES.noFamilyChild), "가족 · 자녀 인연은 계산하지 않았다는 안내를 코드가 붙인다");
  assert.ok(!report.notes.items.includes(COMPAT_NOTES.timingUsed));
  assert.equal(nameText("A님과 B님", names), "슬기 님과 남수 님");
  // 행동 묶음이 이름으로 바뀌고 건넬 말도 이름 자리가 남지 않는다
  assert.deepEqual(Object.keys(report.steps), COMPAT_STEP_GROUPS.map((g) => g.id));
  for (const g of COMPAT_STEP_GROUPS) assert.ok(report.steps[g.id].every((a) => a.title && a.detail && a.say));

  // 5번 장이 시기 근거를 인용한 초안: 안내는 "시기를 읽었다"(관계가 좋아지는 때 · 추천 날짜 · 맞물리는 해는 계산하지 않았다고 밝힌다)
  const dt = clone(fullDraft());
  const rt = assembleCompatReport(dt, full.r, names, { provider: "mock", model: "mock", at: "2026-10-17T00:00:00Z", placeholder: true });
  assert.equal(rt.sections.length, 6);
  assert.ok(rt.notes.items.includes(COMPAT_NOTES.timingUsed) && !rt.notes.items.includes(COMPAT_NOTES.timingMissing));
  assert.match(COMPAT_NOTES.timingUsed, /맞물리는 해는 계산하지 않았/);
});

test("쓰기: 경고(WARN)만 있는 글은 고쳐 쓰기를 부르지 않고 그대로 받는다 · 끝의 닫는 괄호만 빠진 글도 글자 그대로 읽는다 — 내용이 틀린 글은 계속 고쳐 쓴다(운영자 정책 2026-10-17)", async () => {
  const input = { evidence: base.evidence, cautions: base.r.cautions };
  const warnDraft = clone(draftOf());
  sec(warnDraft, "overview").paragraphs[0] = "A님과 B님의 일간은 서로 돕는 관계이고 천간합과 오행의 조화도 함께 읽혀요. 두 분이 함께 있을 때 한쪽이 다른 쪽을 받쳐 주는 장면이 자주 있을 수 있어요.";
  const once = (text: string) => {
    const calls: ModelRequest[] = [];
    const model: TextModel = { provider: "mock", model: "once", async complete(req) { calls.push(req); return { text, model: "once", usage: { inputTokens: 1, outputTokens: 1 } }; } };
    return { calls, model };
  };
  // 경고만 — 한 번의 호출, 시도 기록에 경고가 남는다
  const a = once(JSON.stringify(warnDraft));
  const attempts: { round: number; errors: string[]; accepted?: boolean; warnings?: string[] }[] = [];
  const draft = await createCompatWriter({ model: a.model, sleep: async () => {} }).write(input, { onAttempt: (x) => attempts.push(x) });
  assert.equal(a.calls.length, 1, "경고만으로는 AI를 다시 부르지 않는다");
  assert.equal(draft.sections[0].paragraphs[0], sec(warnDraft, "overview").paragraphs[0], "글은 그대로다");
  assert.ok(attempts[0].accepted && (attempts[0].warnings ?? []).some((w) => /첫 문단에 사주 용어/.test(w)), JSON.stringify(attempts));
  // 맨 끝의 `}`가 빠진 글 — 괄호만 보충해 한 번에 받는다
  const b = once(JSON.stringify(draftOf()).slice(0, -1));
  const repaired = await createCompatWriter({ model: b.model, sleep: async () => {} }).write(input);
  assert.equal(b.calls.length, 1);
  assert.equal(repaired.sections.length, 6);
  // 속마음 단정(BLOCK)은 경고가 아니다 — 고쳐 쓰라고 다시 부른다
  const mind = clone(draftOf());
  sec(mind, "overview").paragraphs[1] = "A님은 속으로 B님이 떠날까 봐 늘 불안해하고 있어요. 두 분이 함께 있을 때 그 마음이 자주 드러나요.";
  const c = once(JSON.stringify(mind));
  await assert.rejects(createCompatWriter({ model: c.model, sleep: async () => {} }).write(input), (e: unknown) => e instanceof CompatWriteError && e.code === "INVALID");
  assert.equal(c.calls.length, 2, "BLOCK이면 한 번 고쳐 쓰게 한다");
});

test("쓰기: 첫 글이 검사에 걸리면 이유와 함께 한 번 고쳐 쓰고, 계속 걸리면 INVALID, 호출이 실패하면 MODEL(일시 오류는 한 번 다시)", async () => {
  const input = { evidence: base.evidence, cautions: base.r.cautions };
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
  assert.equal(draft.sections.length, 6);
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
