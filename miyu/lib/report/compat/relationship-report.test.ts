// 실행: npm test — 사주 궁합 · 리포트 궁합 생성 경로에 "무슨 사이인가요?"가 정식 구조로 연결됐는지 확인한다(비용 0 · 모의 작성기 · 실제 AI 호출 없음).
//  ① 사이는 지시문 본문이 아니라 사용자 메시지의 relationship 항목으로만 간다(없으면 메시지가 예전과 같다 — 지시문 0.6 / 0.4는 고객이 읽는 글의 서술 방식만 바꿨고 사이 처리는 그대로다)
//  ② AI 요청에는 이름 · 성별 · 생년월일이 없다(사이의 이름표와 읽는 법뿐) ③ 여섯 사이마다 요청 · 5번 장 이름표 · 저장 형식 · 안내가 모두 사이를 따른다
//  ④ 점수 · 유형 · 근거는 사이로 바뀌지 않는다 ⑤ 검사는 사이에 맞는 글은 통과시키고 맞지 않는 글(친구에 연애, 썸에 마음 확정, 결혼 사이에 앞날 보장, 기타에 관계 이름)을 막는다
// 실제 AI가 사이에 맞는 좋은 글을 쓰는지는 이 시험으로 알 수 없다(실제 AI로 읽지 않았다).
import assert from "node:assert/strict";
import { test } from "node:test";
import { COMPAT_RELATIONSHIPS, RELATIONSHIP_LABEL, type CompatRelationship } from "../../compat/relationship.ts";
import type { SajuOk } from "../../saju/engine.ts";
import { compatOf } from "../../saju/interpret/compat.ts";
import { compatExtraEvidence } from "../../saju/interpret/compat-extra.ts";
import { compatTimingOf } from "../../saju/interpret/compat-timing.ts";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { createAiReportGenerator } from "../ai/generator.ts";
import { createMockModel } from "../ai/mock-model.ts";
import type { ModelRequest, TextModel } from "../ai/model.ts";
import { readSource } from "../test-source.ts";
import { COMPAT_NOTES, COMPAT_SECTIONS, topicFor } from "./plan.ts";
import { buildCompatUserMessage, buildPairUserMessage, COMPAT_SYSTEM_PROMPT, PAIR_SYSTEM_PROMPT } from "./prompt.ts";
import { composeMockCompat } from "./mock-model.ts";
import type { CompatDraftV1 } from "./types.ts";
import { validateCompatDraft } from "./validate.ts";

const T0 = new Date("2026-10-19T00:00:00Z");
const REF = { year: 2026, month: 10 };
const saju = (y: number, m: number, d: number, gender: "male" | "female"): SajuOk => {
  const r = calculateSaju({ year: y, month: m, day: d, calendar: "solar", isLeapMonth: false, birthTime: "09:30", gender });
  assert.equal(r.status, "ok");
  return r as SajuOk;
};
const A = saju(1996, 3, 29, "female");
const B = saju(1994, 11, 2, "male");
const result = compatOf(A, B);
const evidence = [...result.evidence, ...compatExtraEvidence(A, B, result), ...compatTimingOf(A, B, REF).evidence];
const bodyOf = (msg: string) => JSON.parse(msg.slice(msg.indexOf("\n") + 1));
const clone = (d: CompatDraftV1) => JSON.parse(JSON.stringify(d)) as CompatDraftV1;
const love = (d: CompatDraftV1) => d.sections.find((s) => s.id === "love")!;

test("지시문(시스템 프롬프트)은 바뀌지 않았다 — 사이는 사용자 메시지로만 가고, 사이가 없으면 메시지가 예전과 글자까지 같다", () => {
  const saved = readSource(new URL("../../../docs/samples/prompts/compat-v1-prompt-0.6.txt", import.meta.url));
  const savedPair = readSource(new URL("../../../docs/samples/prompts/pair-v1-prompt-0.4.txt", import.meta.url));
  assert.equal(COMPAT_SYSTEM_PROMPT, saved);
  assert.equal(PAIR_SYSTEM_PROMPT, savedPair);
  const neutral = buildCompatUserMessage(evidence, result.cautions);
  assert.equal(neutral, buildCompatUserMessage(evidence, result.cautions, null));
  assert.equal(bodyOf(neutral).relationship, undefined);
  assert.equal(buildPairUserMessage(evidence, result.cautions), buildPairUserMessage(evidence, result.cautions, null));
  // 사이가 있는 메시지는 relationship 항목만 더해지고 나머지(근거 · 장 · 행동)는 그대로다
  for (const rel of COMPAT_RELATIONSHIPS) {
    const withRel = bodyOf(buildCompatUserMessage(evidence, result.cautions, rel));
    const { relationship, ...rest } = withRel;
    assert.ok(relationship);
    assert.deepEqual(rest, bodyOf(neutral), rel);
  }
});

test("AI 요청의 사이 항목 — 여섯 사이마다 이름표 · 읽는 법 · 쓰지 않을 것이 다르고, 이름 · 성별 · 생년월일은 없다", () => {
  const seen = new Set<string>();
  for (const rel of COMPAT_RELATIONSHIPS) {
    for (const build of [buildCompatUserMessage, buildPairUserMessage]) {
      const msg = build(evidence, result.cautions, rel);
      const r = bodyOf(msg).relationship as { id: string; label: string; given: string; read: string; avoid: string };
      assert.equal(r.id, rel);
      assert.equal(r.label, RELATIONSHIP_LABEL[rel]);
      assert.match(r.given, /사용자가 직접 알려 준/);
      assert.match(r.given, /궁합 지수와 근거 목록은 이 값과 상관없이 그대로/);
      assert.ok(r.read.length > 40 && r.avoid.length > 30);
      seen.add(`${r.read}|${r.avoid}`);
      for (const secret of ["슬기", "남수", "1996", "1994", "male", "female", "남자", "여자", "03-29", "11-02"]) assert.ok(!msg.includes(secret), `${rel}: 요청에 ${secret}이 있다`);
    }
  }
  assert.equal(seen.size, 6, "읽는 법이 사이마다 다르다");
  // 지시한 사이별 중심 내용
  const read = (rel: CompatRelationship) => bodyOf(buildCompatUserMessage(evidence, [], rel)).relationship as { read: string; avoid: string };
  assert.match(read("lover").read, /대화.*갈등/);
  for (const w of ["생활", "시간", "돈", "역할"]) assert.ok(read("engaged").read.includes(w), w);
  for (const w of ["속도", "경계", "대화"]) assert.ok(read("some").read.replace("선(경계)", "경계").includes(w), w);
  assert.match(read("some").avoid, /상대가 어떤 마음/);
  for (const w of ["일상", "협력", "회복"]) assert.ok(read("married").read.includes(w), w);
  for (const w of ["우정", "거리감", "협력"]) assert.ok(read("friend").read.includes(w), w);
  assert.match(read("friend").avoid, /연애.*결혼/);
  assert.match(read("other").read, /구체적인 관계를 짐작하지 않고/);
  assert.match(read("other").avoid, /구체적인 관계 이름/);
});

test("생성 경로(모의 작성기): 여섯 사이마다 요청 · 5번 장 이름표 · 저장된 사이 · 안내가 사이를 따르고, 점수 · 유형 · 근거는 사이와 상관없이 같다", async () => {
  const mock = createMockModel();
  const calls: ModelRequest[] = [];
  const spy: TextModel = { provider: mock.provider, model: mock.model, async complete(req) { calls.push(req); return mock.complete(req); } };
  const gen = createAiReportGenerator({ model: spy, now: () => T0, sleep: async () => {} });
  const names = { a: "슬기", b: "남수" };
  const neutral = await gen.generateCompat!({ names, a: A, b: B, reference: REF });
  assert.equal(neutral.relationship, undefined, "사이를 모르는 예전 주문은 특정 관계로 채우지 않는다");
  assert.equal(neutral.sections.find((s) => s.id === "love")!.topic, "연애와 결혼 궁합");
  assert.ok(!bodyOf(calls[0].messages[0].content).relationship);
  assert.ok(!neutral.notes.items.some((t) => t.includes("사이는 직접 알려 주신 값")));

  const topics = new Set<string>();
  for (const rel of COMPAT_RELATIONSHIPS) {
    calls.length = 0;
    const r = await gen.generateCompat!({ names, a: A, b: B, relationship: rel, reference: REF });
    // 모델 입력까지 사이가 왔다 — 첫 요청의 사용자 메시지에 relationship, 이름은 없다
    assert.equal(bodyOf(calls[0].messages[0].content).relationship.id, rel);
    for (const c of calls) for (const m of c.messages) for (const secret of ["슬기", "남수"]) assert.ok(!m.content.includes(secret), `${rel}: AI 요청에 이름이 있다`);
    assert.equal(r.relationship, rel);
    assert.equal(r.headline.includes(RELATIONSHIP_LABEL[rel]), true, "모의 작성기가 받은 사이의 이름표를 글에 남긴다");
    const topic = r.sections.find((s) => s.id === "love")!.topic;
    assert.equal(topic, topicFor(COMPAT_SECTIONS.find((s) => s.id === "love")!, rel));
    topics.add(topic);
    if (rel === "friend" || rel === "other") assert.doesNotMatch(topic, /연애|결혼/, `${rel}의 5번 장 이름표에 연애 · 결혼이 없다`);
    assert.ok(r.notes.items.some((t) => t.includes("사이는 직접 알려 주신 값")), "사이를 쓴 글에는 관점만 바꿨다는 안내가 붙는다");
    // 점수 · 유형 · 계산 재료는 사이로 달라지지 않는다
    assert.equal(r.summary.score, neutral.summary.score);
    assert.equal(r.summary.typeName, neutral.summary.typeName);
    assert.deepEqual(r.summary.parts, neutral.summary.parts);
    assert.equal(r.ruleVersion, neutral.ruleVersion);
    // 성별을 받은 두 사람은 시기(대운) 근거가 만들어져 시기 안내가 "썼다" 쪽이다
    assert.ok(r.notes.items.includes(COMPAT_NOTES.timingUsed), `${rel}: 두 사람의 대운 근거가 쓰였다`);
  }
  assert.equal(topics.size, 6, "5번 장 이름표가 사이마다 다르다");
});

test("성별은 AI 요청에 값으로 가지 않고, 성별 조합(동성 포함)이 바뀌어도 근거 목록 · 점수는 같다 — 성별은 10년 시기 계산에만 들어간다", () => {
  const combos: ["male" | "female", "male" | "female"][] = [["female", "male"], ["male", "female"], ["female", "female"], ["male", "male"]];
  const baseEvidence = (ga: "male" | "female", gb: "male" | "female") => {
    const a = saju(1996, 3, 29, ga);
    const b = saju(1994, 11, 2, gb);
    const r = compatOf(a, b);
    return { r, evidence: [...r.evidence, ...compatExtraEvidence(a, b, r)] };
  };
  const ref = baseEvidence("female", "male");
  for (const [ga, gb] of combos) {
    const x = baseEvidence(ga, gb);
    assert.equal(x.r.score, ref.r.score, `${ga}/${gb}`);
    assert.equal(x.r.coupleType.id, ref.r.coupleType.id);
    assert.deepEqual(x.evidence, ref.evidence, "시기를 뺀 근거(compat.*, 오행 분포 · 개운)는 성별 조합과 상관없이 같다");
    const msg = buildCompatUserMessage(x.evidence, x.r.cautions, "lover");
    assert.ok(!/male|female|남자|여자/.test(msg), "성별 값이 요청에 없다");
  }
  // 성별을 받지 않았을 때(예전 상대 입력)는 대운 근거만 없다 — 다른 근거는 같다
  const noGender = calculateSaju({ year: 1994, month: 11, day: 2, calendar: "solar", isLeapMonth: false, birthTime: "09:30" }) as SajuOk;
  const held = compatTimingOf(A, noGender, REF);
  assert.ok(!held.evidence.some((e) => e.id === "compat.timing.luck"));
  assert.ok(held.held.some((h) => h.id === "luck"));
  assert.ok(compatTimingOf(A, B, REF).evidence.some((e) => e.id === "compat.timing.luck"), "성별을 받으면 대운 근거가 생긴다");
});

// ── 글 검사: 사이에 맞는 글은 통과, 맞지 않는 글은 막는다 ──────────────────────────────────────────────

/** 5번 장(love)의 앞 두 문단만 사이에 맞는 글로 바꾼 초안 — 나머지는 모의 작성기 초안 그대로 */
const withLove = (rel: CompatRelationship, p0: string, p1: string): CompatDraftV1 => {
  const d = clone(composeMockCompat(buildCompatUserMessage(evidence, result.cautions, rel)));
  love(d).paragraphs[0] = p0;
  love(d).paragraphs[1] = p1;
  return d;
};
const verdict = (d: CompatDraftV1, rel: CompatRelationship | null) => validateCompatDraft(d, evidence, rel ? { relationship: rel } : {});
const errorsOf = (d: CompatDraftV1, rel: CompatRelationship | null) => {
  const v = verdict(d, rel);
  return v.ok ? [] : v.errors;
};

const GOOD: Record<CompatRelationship, [string, string]> = {
  lover: [
    "연인 사이에서는 서운한 마음을 오래 두지 않고 그날 짧게 말하는 쪽이 두 분에게 잘 맞아요. 서로 닿는 모양이 있어서 대화를 이어 가면 금방 편안해지기 쉬워요.",
    "다툼이 생기면 누가 맞는지보다 각자 원하는 게 무엇인지부터 말해 보세요. 그러면 방식이 달라서 생긴 오해가 가볍게 풀리기 쉬워요.",
  ],
  engaged: [
    "결혼을 준비하는 두 분에게는 생활 · 시간 · 돈 · 역할을 하나씩 합의해 가는 일이 가장 중요해 보여요. 한쪽이 먼저 정하고 다른 쪽이 확인하는 모양이라 정하기 전에 같이 이야기하는 순서를 만들면 편해요.",
    "금액을 말하기 전에 어떤 기준으로 쓰고 모을지부터 이야기해 보세요. 서로 양보하기 어려운 것을 한 가지씩 먼저 꺼내면 준비가 한결 가벼워져요.",
  ],
  some: [
    "썸을 타는 두 분에게는 다가가는 속도와 서로의 선을 말로 맞춰 가는 일이 중요해요. 한쪽은 먼저 움직이고 다른 쪽은 확인하며 움직이는 모양이라 속도 차이가 오해로 번지기 쉬워요.",
    "상대의 마음은 사주로 알 수 없으니 궁금한 건 가볍게 직접 물어보세요. 편한 속도를 서로 한 번씩 말해 두면 부담이 줄어들어요.",
  ],
  married: [
    "함께 살아가는 두 분에게는 일상에서 서로 돕는 방식을 한 번 정해 두면 감정 소모가 줄어요. 집안일이나 일정처럼 반복해서 부딪히는 주제는 기준을 말로 정해 두는 쪽이 편해요.",
    "다툰 뒤에는 누가 먼저 풀지보다 풀 때 필요한 것이 시간인지 설명인지 사과인지를 각자 말해 보세요. 그러면 회복하는 속도가 맞춰지기 쉬워요.",
  ],
  friend: [
    "친구 사이인 두 분은 편하게 만나다가도 약속을 잡는 방식이 달라 서운함이 생기기 쉬워요. 한쪽이 먼저 움직이고 다른 쪽이 확인하는 모양이라 날짜를 제안하는 쪽을 번갈아 정해 보세요.",
    "연락이 뜸할 때는 서운함을 쌓기보다 요즘 바빴는지 가볍게 물어보세요. 함께 무언가를 할 때는 각자 맡을 일을 먼저 나누면 협력이 훨씬 수월해져요.",
  ],
  other: [
    "두 분이 함께 있을 때는 서로의 방식을 알아 가며 편안해지는 분위기로 읽혀요. 한쪽이 먼저 움직이고 다른 쪽이 확인하는 모양이라 시작하기 전에 의견을 한 번 묻는 습관이 도움이 돼요.",
    "뜻이 헷갈리는 말은 짐작하지 말고 이런 뜻이었는지 한 번 더 물어보세요. 부딪히는 부분이 있으면 상대를 고치려 하기보다 방식의 차이로 이야기해 보세요.",
  ],
};

const BAD: Partial<Record<CompatRelationship, { text: [string, string]; why: RegExp }>> = {
  friend: {
    text: ["연애하듯 서로를 챙기고 결혼 생활처럼 생활을 맞춰 가면 두 분이 편해져요. 일지가 배우자 자리를 보는 곳이라 서로 잘 맞는 모양이에요.", "연락이 뜸할 때는 가볍게 물어보세요. 함께 무언가를 할 때는 각자 맡을 일을 먼저 나누면 협력이 수월해져요 그래서 부담이 줄어요."],
    why: /친구 사이의 풀이에는 연애 · 배우자 · 결혼 이야기/,
  },
  other: {
    text: ["두 분은 부부처럼 호흡이 맞고 친구 사이처럼 편한 순간도 많이 있어요. 오래 함께한 가족처럼 서로의 방식을 알아서 편해요.", "뜻이 헷갈리는 말은 한 번 더 물어보세요. 부딪히는 부분이 있으면 방식의 차이로 이야기해 보세요 그러면 오해가 줄어요."],
    why: /기타 사이의 풀이에는 연애 · 배우자 · 결혼 이야기|구체적인 관계 이름/,
  },
  some: {
    text: ["두 분은 서로 좋아하고 있어서 곧 사귀게 될 거예요. 상대도 마음이 있어서 고백하면 연인 사이가 될 가능성이 커요 그래서 기대해도 돼요.", "궁금한 건 가볍게 직접 물어보세요. 편한 속도를 서로 한 번씩 말해 두면 부담이 줄어들어요 그러면 더 편해져요."],
    why: /썸 사이의 풀이에서 서로의 마음 · 연애 확정/,
  },
  engaged: {
    text: ["두 분의 결혼은 성공할 거예요. 평생 함께 행복하게 지낼 수 있어서 걱정하지 않아도 돼요 그래서 안심해도 좋아요.", "결혼식 날짜도 순조롭게 잡힐 거예요. 준비 과정에서 서로 이야기하는 순서를 정해 두면 한결 가벼워져요 그래서 부담이 줄어요."],
    why: /결혼준비중 사이의 풀이에서 앞날을 보장하거나 판정하는 말/,
  },
  married: {
    text: ["결혼 생활이 행복하게 오래 이어져요. 이혼 위기도 오지 않고 별거할 일도 없어서 안심해도 돼요 그래서 걱정이 없어요.", "집안일이나 일정처럼 반복해서 부딪히는 주제는 기준을 말로 정해 두는 쪽이 편해요. 서로 돕는 방식을 정해 두면 한결 가벼워져요."],
    why: /결혼함 사이의 풀이에서 앞날을 보장하거나 판정하는 말/,
  },
};

test("검사: 여섯 사이마다 그 사이에 맞는 5번 장 글은 통과한다(경고만 있을 수 있다) — 지시한 중심 내용을 쓴 글이 사이 규칙에 막히지 않는다", () => {
  for (const rel of COMPAT_RELATIONSHIPS) {
    const d = withLove(rel, ...GOOD[rel]);
    const v = verdict(d, rel);
    assert.ok(v.ok, `${rel}: ${v.ok ? "" : v.errors.join(" / ")}`);
    // 사이를 모르는 예전 검사에서도 같은 글이 통과한다(사이 규칙이 예전 검사를 더 엄하게 만들지 않는다)
    assert.ok(verdict(d, null).ok || rel === "friend" || rel === "other", `${rel}: 예전 검사에서도 통과`);
  }
});

test("검사: 사이에 맞지 않는 글은 저장하지 않는다 — 친구 · 기타에 연애 · 배우자 · 결혼 / 기타에 관계 이름 / 썸에 마음 확정 / 결혼준비중 · 결혼함에 앞날 보장", () => {
  for (const rel of Object.keys(BAD) as CompatRelationship[]) {
    const { text, why } = BAD[rel]!;
    const d = withLove(rel, ...text);
    const errors = errorsOf(d, rel);
    assert.ok(errors.some((e) => why.test(e)), `${rel}: ${errors.join(" / ") || "통과했다"}`);
    // 같은 글도 다른 사이로 바꿔 검사하면 그 사이의 규칙을 따른다 — 사이 규칙은 선택한 사이에만 걸린다
  }
  // 사이가 맞으면 막히지 않는 말이 다른 사이에서는 막힌다
  const loverText = withLove("lover", ...GOOD.lover);
  assert.ok(verdict(loverText, "lover").ok);
  const asFriend = errorsOf(loverText, "friend");
  assert.ok(asFriend.some((e) => /친구 사이의 풀이에는 연애/.test(e)), "연인 글을 친구 사이로 검사하면 걸린다");
});

test("검사: 알려 준 사이를 말하는 것은 지어낸 사건이 아니다 — 결혼함은 \"결혼한 사이\", 연인은 \"사귀고 있\"을 쓸 수 있고, 다른 사이에서는 여전히 사건 단정으로 막는다", () => {
  const married = withLove("married", "결혼한 사이인 두 분은 일상에서 서로 돕는 방식이 달라요. 집안일이나 일정처럼 반복해서 부딪히는 주제는 기준을 말로 정해 두는 쪽이 편해요.", GOOD.married[1]);
  assert.ok(verdict(married, "married").ok, errorsOf(married, "married").join(" / "));
  assert.ok(errorsOf(married, "lover").some((e) => /입력받지 않은 두 사람의 사건/.test(e)), "연인이라고 알려 준 사람의 글에서 결혼한 사이는 지어낸 사건이다");
  assert.ok(errorsOf(married, null).some((e) => /입력받지 않은 두 사람의 사건/.test(e)), "사이를 모르면 예전처럼 막는다");
  const lover = withLove("lover", "사귀고 있는 두 분은 서운한 마음을 오래 두지 않고 그날 짧게 말하는 쪽이 잘 맞아요. 서로 닿는 모양이 있어서 대화를 이어 가면 금방 편안해지기 쉬워요.", GOOD.lover[1]);
  assert.ok(verdict(lover, "lover").ok, errorsOf(lover, "lover").join(" / "));
  assert.ok(errorsOf(lover, "friend").length > 0);
  assert.ok(errorsOf(lover, null).some((e) => /입력받지 않은 두 사람의 사건/.test(e)));
});

test("검사: 사이 규칙은 5번 장만이 아니라 모든 글 조각(제목 · 다른 장 · 행동 · 추천 질문)에 걸린다", () => {
  const d = clone(composeMockCompat(buildCompatUserMessage(evidence, result.cautions, "friend")));
  d.steps.together[0].detail = "두 분이 연애하는 사이처럼 매일 연락하는 약속을 한 줄로 적어 두고 같이 읽어 봐요.";
  d.questions[0] = "우리가 결혼하면 생활 방식이 맞을지 서로에게 물어볼 수 있을까요?";
  const errors = errorsOf(d, "friend");
  assert.ok(errors.some((e) => e.startsWith("steps.together[0]")), errors.join(" / "));
  assert.ok(errors.some((e) => e.startsWith("questions[0]")), errors.join(" / "));
});
