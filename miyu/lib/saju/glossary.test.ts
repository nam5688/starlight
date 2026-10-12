// 실행: npm test — 사주 용어 풀이 (한자 · 한자 뜻 · 쉬운 말)
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SajuOk } from "./engine.ts";
import { BASE_TERMS, GLOSSARY, glossaryFor, termsOfEvidence, withHanja } from "./glossary.ts";
import { sajuEvidence } from "./interpret/rules.ts";
import { calculateSaju } from "./manseryeok-engine.ts";

const chart = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" }) as SajuOk;
const evidence = sajuEvidence(chart, { reference: { year: 2026, month: 10 }, gender: "female" });

test("모든 용어에 한자 · 한자 뜻 · 쉬운 말이 있고, 쉬운 말은 단정하지 않는다", () => {
  for (const g of Object.values(GLOSSARY)) {
    assert.match(g.hanja, /^[一-鿿]+$/, g.term);
    assert.ok(g.literal.length >= 1 && g.plain.length >= 10, g.term);
    assert.doesNotMatch(g.plain, /반드시|100%|운명|정확/, g.term);
  }
  assert.equal(withHanja(GLOSSARY["상관"]), "상관(傷官)");
});

test("근거에서 용어를 고른다: 기본 용어 먼저, 실제로 나온 십신 · 관계 · 시기 용어만", () => {
  const terms = glossaryFor(evidence).map((g) => g.term);
  assert.deepEqual(terms.slice(0, BASE_TERMS.length), BASE_TERMS);
  for (const t of ["정인", "상관", "인성", "식상", "편재", "충", "육합", "공망", "대운", "세운", "일지", "관성"]) assert.ok(terms.includes(t), t);
  assert.ok(!terms.includes("편관") && !terms.includes("정관"), "원국 · 시기 근거에 없는 십신은 넣지 않는다");
  assert.equal(new Set(terms).size, terms.length);
});

test("리포트에 쓰인 근거만 고를 수 있다", () => {
  const only = glossaryFor(evidence, ["saju.daymaster", "saju.tengod.인성.many"]).map((g) => g.term);
  assert.deepEqual(only, [...BASE_TERMS, "십신", "인성", "정인"]);
  assert.deepEqual(termsOfEvidence({ id: "survey.caution.high", source: "survey", topics: [], strength: "moderate", fact: "정인 상관", cue: "" }), []);
});
