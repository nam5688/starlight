// 실행: npm test — AI 비교 1단계의 "목표 문장 예시"(docs/samples/stage1-target-sentences.json)가 가상 인물의 실제 근거 안에서만 쓰였고,
// 우리가 막는 표현을 쓰지 않으며, "이렇게 쓰지 않는다" 예시는 실제로 점검에 걸리는지 확인한다.
// 예시는 사람이 쓴 기준선이며 실제 AI 출력이 아니다. 이 검사는 좋은 글을 보증하지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildPersonas } from "../ai/compare-personas.ts";
import { referenceFor } from "../ai/compare-plan.ts";
import { buildEvidence } from "../ai/generator.ts";
import { CONCRETE_ACT, QUANTITY } from "../v2/depth.ts";
import { FORBIDDEN } from "../v2/validate.ts";
import { ABSTRACT, groundingOf } from "./compare.ts";
import { BACKSTORY, VERDICT } from "./validate.ts";

type Target = { part: string; text?: string; strength?: string; when?: string; cost?: string; option?: string; protects?: string; costs?: string; check?: string; question?: string; action?: string; evidence: string[] };
type Sample = { personas: { id: string; targets: Target[]; avoid: { text: string; why: string }[] }[] };
const sample = JSON.parse(readFileSync(new URL("../../../docs/samples/stage1-target-sentences.json", import.meta.url), "utf8")) as Sample;
const NOW = new Date("2026-10-12T03:00:00Z");
const ref = referenceFor(NOW);
const personas = buildPersonas(2);
const textsOf = (t: Target) => [t.text, t.strength, t.when, t.cost, t.option, t.protects, t.costs, t.check, t.question, t.action].filter((x): x is string => Boolean(x));
const SURVEY_LABEL: Record<string, string> = { "새로움 추구": "novelty", 신중함: "caution", "타인 반응 민감도": "sensitivity", 지속성: "persistence", "관계 불안": "anxiety", "거리 두기": "avoidance" };
const LABELS = Object.keys(SURVEY_LABEL).join("|");
const SURVEY_NUMBER = new RegExp(`(?:${LABELS})[^.]{0,6}\\d`);
const SURVEY_DIRECTION = new RegExp(`(${LABELS})(?:가|는|이|은)?\\s*(높|낮)`, "g");

test("목표 문장 예시: 가상 인물 2명(P01 · P02)을 모두 다루고, 근거 ID는 그 인물의 계산 결과에 있는 것만 쓴다", () => {
  assert.deepEqual(sample.personas.map((p) => p.id), personas.map((p) => p.id));
  for (const p of personas) {
    const evidence = buildEvidence(p.input, ref);
    const known = new Map(evidence.map((e) => [e.id, e]));
    const target = sample.personas.find((x) => x.id === p.id)!;
    assert.ok(target.targets.length >= 6, `${p.id} 목표 문장 수`);
    for (const t of target.targets) {
      assert.ok(t.evidence.length > 0, `${p.id} ${t.part}: 근거 없음`);
      for (const id of t.evidence) assert.ok(known.has(id), `${p.id} ${t.part}: 없는 근거 ID ${id}`);
      assert.ok(t.evidence.some((id) => !known.get(id)?.uncertain), `${p.id} ${t.part}: 확실하지 않은 근거만 사용`);
      if (t.part.startsWith("큰 흐름")) for (const id of t.evidence) assert.ok(known.get(id)?.period, `${p.id} 큰 흐름은 계산된 시기 근거만: ${id}`);
    }
    // 사주 근거를 중심으로, 응답 근거를 함께 쓴다
    const blocks = target.targets.filter((t) => !t.part.startsWith("큰 흐름") && !t.part.startsWith("정하지"));
    const withSaju = blocks.filter((t) => t.evidence.some((id) => known.get(id)?.source === "saju")).length;
    assert.equal(withSaju, blocks.length, `${p.id}: 모든 해석 문단이 사주 근거를 단다`);
    assert.ok(blocks.filter((t) => t.evidence.some((id) => known.get(id)?.source === "survey")).length >= blocks.length - 1, `${p.id}: 응답 근거를 함께 단다`);
  }
});

test("목표 문장 예시: 응답 점수 숫자를 본문에 쓰지 않고, '높게 · 낮게'라고 쓴 방향은 그 인물의 실제 응답 근거와 같다", () => {
  for (const p of personas) {
    const ids = new Set(buildEvidence(p.input, ref).map((e) => e.id));
    const target = sample.personas.find((x) => x.id === p.id)!;
    for (const t of target.targets) {
      for (const text of textsOf(t)) {
        assert.doesNotMatch(text, SURVEY_NUMBER, `${p.id}: 응답 점수 숫자를 본문에 썼음 — ${text.slice(0, 30)}`);
        for (const m of text.matchAll(SURVEY_DIRECTION)) {
          const id = `survey.${SURVEY_LABEL[m[1]]}.${m[2] === "높" ? "high" : "low"}`;
          assert.ok(ids.has(id), `${p.id}: "${m[0]}"과 맞는 근거(${id})가 없음`);
        }
      }
    }
  }
});

test("목표 문장 예시: 막는 표현 · 지어낸 배경 · 결정 대신 내리기가 없고, 질문은 질문이며 행동은 시점이 보인다", () => {
  for (const target of sample.personas) {
    for (const t of target.targets) {
      for (const text of textsOf(t)) {
        for (const f of FORBIDDEN) assert.doesNotMatch(text, f.re, `${target.id} ${t.part}: ${f.why} — ${text.slice(0, 30)}`);
        assert.doesNotMatch(text, BACKSTORY, `${target.id} ${t.part}: 지어낸 배경`);
        assert.doesNotMatch(text.trim(), VERDICT, `${target.id} ${t.part}: 결정 대신 내림`);
      }
      if (t.question) assert.match(t.question, /\?$/, `${target.id}: 질문`);
      if (t.action) {
        assert.match(t.action, QUANTITY, `${target.id}: 시점 · 분량 없는 행동`);
        assert.match(t.action, CONCRETE_ACT, `${target.id}: 구체적인 동작 없는 행동`);
      }
      if (t.option) for (const k of ["protects", "costs", "check"] as const) assert.ok(t[k], `${target.id} ${t.option}: ${k}`);
    }
  }
});

test("목표 문장 예시: 고민이 있는 인물에서만 '알려 주신' · 선택지 · 정하지 않는다는 안내가 나오고, 알려 준 말은 사주로 알아맞힌 것처럼 쓰지 않는다", () => {
  const p01 = sample.personas.find((p) => p.id === "P01")!;
  const p02 = sample.personas.find((p) => p.id === "P02")!;
  const p01Text = p01.targets.flatMap(textsOf).join("\n");
  const p02Text = p02.targets.flatMap(textsOf).join("\n");
  assert.match(p01Text, /알려 주신/);
  assert.ok(p01.targets.some((t) => t.option), "P01 선택지");
  assert.match(p01Text, /정하지 않습니다/);
  assert.doesNotMatch(p02Text, /알려 주신|말씀해 주신|정하지 않습니다/);
  assert.ok(!p02.targets.some((t) => t.option), "P02는 선택지가 없다");
  assert.doesNotMatch(p01Text, /사주(에|로|가)[^.!?]{0,30}(먼저 연락|기다릴지|말수가 줄)/, "알려 준 이야기를 사주가 보여 준 것처럼 쓰지 않는다");
  // 알려 준 고민의 사실을 말하는 문단은 모두 알려 준 내용임을 밝힌다
  for (const t of p01.targets) {
    const text = textsOf(t).join(" ");
    if (/먼저 할지 기다릴지|말수가 줄|뜸해지면/.test(text) && !t.question) assert.match(text, /알려 주신|말씀해 주신/, `밝히지 않음: ${t.part}`);
  }
});

test("'이렇게 쓰지 않는다' 예시는 자동 점검 중 하나에 실제로 걸린다 — 점검이 느슨해지면 이 시험이 알려 준다", () => {
  for (const target of sample.personas) {
    const persona = personas.find((p) => p.id === target.id)!;
    const evidence = buildEvidence(persona.input, ref);
    for (const a of target.avoid) {
      const forbidden = FORBIDDEN.some((f) => f.re.test(a.text));
      const verdict = VERDICT.test(a.text.trim());
      const g = groundingOf([{ kind: "avoid", text: a.text, evidence: [] }], persona.input.context ?? ({ topic: "love", question: "", situation: "", matched: "", differed: "", excerpt: "" } as never), evidence);
      const abstractUngrounded = ABSTRACT.test(a.text) && g.ungroundedAbstract.length > 0;
      const noSign = !QUANTITY.test(a.text) && !/응답|원국|전통 해석|알려 주신/.test(a.text);
      assert.ok(forbidden || verdict || abstractUngrounded || noSign, `자동 점검에 걸리지 않음: ${a.text}`);
    }
  }
});
