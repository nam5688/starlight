// 실행: npm test — AI 비교 1단계의 "목표 문장 예시"(docs/samples/stage1-target-sentences.json)가
// 가상 인물의 실제 근거 안에서만 쓰였고, 본문은 쉬운 말이며 근거는 "이렇게 읽은 이유"로 분리됐고, 우리가 막는 표현이 없는지 확인한다.
// 예시는 사람이 쓴 기준선이며 실제 AI 출력이 아니다. 이 검사는 근거가 결론을 실제로 뒷받침하는지는 알 수 없다 — 그것은 사람이 근거 문구와 나란히 읽어 확인한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildPersonas } from "../ai/compare-personas.ts";
import { referenceFor } from "../ai/compare-plan.ts";
import { buildEvidence } from "../ai/generator.ts";
import { CONCRETE_ACT, CONDITION } from "../v2/depth.ts";
import { FORBIDDEN } from "../v2/validate.ts";
import { ABSTRACT, groundingOf } from "./compare.ts";
import { BACKSTORY, VERDICT } from "./validate.ts";

type Block = {
  kind: "reading" | "choices" | "actions";
  title: string;
  text?: string[];
  options?: { option: string; gains: string; burdens: string; check: string }[];
  items?: { question: string; action: string }[];
  why: string[];
  evidence: string[];
};
type Sample = { personas: { id: string; intro: { text: string }; blocks: Block[]; avoid: { text: string; why: string }[] }[] };
const sample = JSON.parse(readFileSync(new URL("../../../docs/samples/stage1-target-sentences.json", import.meta.url), "utf8")) as Sample;
const NOW = new Date("2026-10-12T03:00:00Z");
const ref = referenceFor(NOW);
const personas = buildPersonas(2);
const bodyOf = (b: Block) => [...(b.text ?? []), ...(b.options ?? []).flatMap((o) => [o.option, o.gains, o.burdens, o.check]), ...(b.items ?? []).flatMap((i) => [i.question, i.action])];
const allOf = (id: string) => {
  const p = sample.personas.find((x) => x.id === id)!;
  return [p.intro.text, ...p.blocks.flatMap((b) => [...bodyOf(b), ...b.why])];
};
const SURVEY_LABEL = "새로움 추구|신중함|타인 반응 민감도|지속성|관계 불안|거리 두기";
const SURVEY_NUMBER = new RegExp(`(?:${SURVEY_LABEL})[^.]{0,6}\\d`);
// 본문(문단 · 선택지 · 질문과 행동)은 사주 용어 없이 쉬운 말로 쓴다. 용어는 "이렇게 읽은 이유"에서 뜻과 함께 쓴다.
const JARGON = /비겁|식상|관성|인성|재성|정관|편관|비견|겁재|식신|상관|일지|천간|지지|원국/; // 편인 · 정인은 "~는 편인데" 같은 말과 겹쳐 빼 둔다

test("목표 문장 예시: 가상 인물 2명(P01 · P02)을 모두 다루고, 근거 ID는 그 인물의 계산 결과에 있는 것만 쓴다", () => {
  assert.deepEqual(sample.personas.map((p) => p.id), personas.map((p) => p.id));
  for (const p of personas) {
    const known = new Map(buildEvidence(p.input, ref).map((e) => [e.id, e]));
    const target = sample.personas.find((x) => x.id === p.id)!;
    assert.ok(target.blocks.length >= 5, `${p.id} 덩어리 수`);
    for (const b of target.blocks) {
      assert.ok(b.evidence.length > 0 && b.why.length > 0, `${p.id} ${b.title}: 근거 없음`);
      for (const id of b.evidence) assert.ok(known.has(id), `${p.id} ${b.title}: 없는 근거 ID ${id}`);
      assert.ok(b.evidence.every((id) => !known.get(id)?.uncertain), `${p.id} ${b.title}: 확실하지 않은 근거를 썼음`);
      assert.ok(b.evidence.some((id) => known.get(id)?.source === "saju"), `${p.id} ${b.title}: 사주 근거가 없음`);
    }
  }
});

test("목표 문장 예시: 본문은 쉬운 말이고(사주 용어는 '이렇게 읽은 이유'에서만), 응답 점수 숫자를 쓰지 않는다", () => {
  for (const target of sample.personas) {
    for (const b of target.blocks) {
      for (const t of bodyOf(b)) {
        assert.doesNotMatch(t, JARGON, `${target.id} ${b.title}: 본문에 사주 용어 — ${t.slice(0, 30)}`);
        assert.doesNotMatch(t, SURVEY_NUMBER, `${target.id} ${b.title}: 응답 점수 숫자`);
      }
      for (const t of b.why) assert.doesNotMatch(t, SURVEY_NUMBER, `${target.id} ${b.title}: 이유에 응답 점수 숫자`);
    }
  }
});

test("목표 문장 예시: 막는 표현 · 지어낸 배경 · 결정 대신 내리기가 없고, 질문은 질문이며, 행동은 구체적인 동작이다 (시점 · 기간을 임의로 정하지 않는다)", () => {
  for (const target of sample.personas) {
    for (const t of allOf(target.id)) {
      for (const f of FORBIDDEN) assert.doesNotMatch(t, f.re, `${target.id}: ${f.why} — ${t.slice(0, 30)}`);
      assert.doesNotMatch(t, BACKSTORY, `${target.id}: 지어낸 배경 — ${t.slice(0, 30)}`);
      assert.doesNotMatch(t.trim(), VERDICT, `${target.id}: 결정 대신 내림 — ${t.slice(0, 30)}`);
      assert.doesNotMatch(t, /(이틀|사흘|나흘|\d+\s*일)\s*(안에|이내|동안)\s*(답|연락)/, `${target.id}: 임의로 정한 기다림 기간 — ${t.slice(0, 30)}`);
    }
    for (const b of target.blocks) {
      for (const i of b.items ?? []) {
        assert.match(i.question, /\?$/, `${target.id}: 질문`);
        assert.match(i.action, CONCRETE_ACT, `${target.id}: 구체적인 동작이 없는 행동 — ${i.action.slice(0, 30)}`);
      }
      for (const o of b.options ?? []) for (const k of ["gains", "burdens", "check"] as const) assert.ok(o[k], `${target.id} ${o.option}: ${k}`);
    }
  }
});

test("목표 문장 예시: 해석의 한계를 같은 문구로 되풀이하지 않는다 — 읽는 법에서 한 번만 말하고 나머지는 확인할 질문으로 전한다", () => {
  for (const target of sample.personas) {
    const text = allOf(target.id).join("\n");
    for (const re of [/가설/, /합치지 않고/, /나란히/, /정하는 일은|정하지 않습니다|{name}님이 정합니다/, /알아맞힌 것이 아니라/]) {
      assert.ok((text.match(new RegExp(re.source, "g")) ?? []).length <= 1, `${target.id}: "${re.source}"가 여러 번 나옴`);
    }
    assert.ok(target.blocks.some((b) => b.kind === "actions"), `${target.id}: 직접 확인할 질문`);
  }
});

test("목표 문장 예시: 고민이 있는 인물에서만 '알려 주신' · 선택지가 나오고, 알려 준 말은 사주로 알아맞힌 것처럼 쓰지 않는다", () => {
  const p01 = sample.personas.find((p) => p.id === "P01")!;
  const p02 = sample.personas.find((p) => p.id === "P02")!;
  const t01 = allOf("P01").join("\n");
  assert.match(t01, /알려 주신/);
  assert.ok(p01.blocks.some((b) => b.kind === "choices"), "P01 선택지");
  assert.doesNotMatch(allOf("P02").join("\n"), /알려 주신|말씀해 주신|말씀하신/);
  assert.ok(!p02.blocks.some((b) => b.kind === "choices"), "P02는 선택지가 없다");
  assert.doesNotMatch(t01, /사주(에|로|가)[^.!?]{0,30}(먼저 연락|기다릴지|말수가 줄)/, "알려 준 이야기를 사주가 보여 준 것처럼 쓰지 않는다");
  // 알려 준 고민의 사실을 말하는 본문은 알려 준 내용임을 밝힌다 (이유 칸 포함)
  for (const b of p01.blocks.filter((x) => x.kind === "reading")) {
    const body = (b.text ?? []).join(" ");
    if (/말수가 줄|뜸해지면 먼저/.test(body)) assert.match([...(b.text ?? []), ...b.why].join(" "), /알려 주신/, `밝히지 않음: ${b.title}`);
  }
});

test("'이렇게 쓰지 않는다' 예시는 자동 점검 중 하나에 실제로 걸린다 (이 점검은 형식 · 표현 · 근거 없음을 찾는 보조일 뿐이다)", () => {
  for (const target of sample.personas) {
    const persona = personas.find((p) => p.id === target.id)!;
    const evidence = buildEvidence(persona.input, ref);
    for (const a of target.avoid) {
      const forbidden = FORBIDDEN.some((f) => f.re.test(a.text));
      const verdict = VERDICT.test(a.text.trim());
      const g = groundingOf([{ kind: "avoid", text: a.text, evidence: [] }], persona.input.context ?? ({ topic: "love", question: "", situation: "", matched: "", differed: "", excerpt: "" } as never), evidence);
      const abstractUngrounded = ABSTRACT.test(a.text) && g.ungroundedAbstract.length > 0;
      const noSign = !/응답|사주|전통 해석|알려 주신/.test(a.text) && !CONDITION.test(a.text);
      assert.ok(forbidden || verdict || abstractUngrounded || noSign, `자동 점검에 걸리지 않음: ${a.text}`);
    }
  }
});
