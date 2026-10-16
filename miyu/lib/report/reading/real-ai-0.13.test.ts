// 실행: npm test — 실제 서비스 AI(claude-sonnet-5-5)가 지시문 0.13으로 쓴 첫 글(가상 인물 P01, 2026-10-16, 운영자 PC 실행)을 제품 검사에 다시 넣어 본다.
// 그 글은 형식 검사를 두 번 모두 통과하지 못해 리포트로 저장되지 않았다(실패한 글 · 비용 · 이유는 docs/samples/real-ai/ 에 있다). 걸린 15개 가운데 14개가 검사가 모델의 풀이 순서 · 따옴표 · "기운이" 를 몰라서 생긴 오탐이었고,
// 그 세 가지를 고친 뒤 남는 것은 실령 한 곳(꾸미는 말만 있는 풀이)이다. 이 시험은 그 상태를 고정해 두고, 같은 글에서 오탐이 되돌아오지 않는지 본다.
// 주의: 검사는 이 글을 본 뒤에 고쳤다(사후 수정). 고친 규칙이 설명 없는 용어 · 지어낸 판정을 더 많이 통과시키지 않는지는 terms.test.ts · prompt-pack.test.ts의 반대 사례가 함께 지킨다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildPersonas } from "../ai/compare-personas.ts";
import { buildEvidence } from "../ai/generator.ts";
import { GUARANTEE_RULES } from "./plan.ts";
import { countSentences, validateReadingDraft } from "./validate.ts";

const FIXTURE = new URL("../../../docs/samples/real-ai/reading-0.13-P01-stage-1-20261016-153543/failed/P01-X-round2.json", import.meta.url);

test("실제 AI의 0.13 첫 글(P01, 두 번째 시도): 오탐 세 가지를 고친 뒤 남는 것은 실령 한 곳뿐이다", () => {
  const p = buildPersonas(2)[0];
  const evidence = buildEvidence(p.input, { year: 2026, month: 10 });
  const raw = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const r = validateReadingDraft(raw, evidence, { hasContext: Boolean(p.input.context) });
  assert.equal(r.ok, false);
  const errors = r.ok ? [] : r.errors;
  // 되돌아오면 안 되는 오탐: 따옴표 안의 마침표 · "기운이 들어와" · "풀이(용어)" 순서의 풀이
  assert.ok(!errors.some((e) => /3문장/.test(e)), "따옴표 안의 말이 문장으로 세어졌다");
  assert.ok(!errors.some((e) => /운을 바꾼다는 보장/.test(e)), "\"기운이 들어와\"가 운 보장으로 걸렸다");
  const termErrors = errors.filter((e) => /설명 없는 사주 용어/.test(e));
  assert.deepEqual(termErrors.map((e) => e.match(/용어\((.+?)\)/)?.[1]), ["실령"]);
  assert.equal(errors.length, 1, errors.join("\n"));
});

test("문장 수: 따옴표로 묶은 말 안의 마침표는 문장을 나누지 않고, 짝이 없는 따옴표 · 실제 세 문장은 그대로 센다", () => {
  assert.equal(countSentences('이렇게 말해 보세요. "저는 천천히 알아가는 게 편해요. 중간중간 속도를 맞춰 봐요."'), 2);
  assert.equal(countSentences("이렇게 말해 보세요. “저는 천천히 알아가는 게 편해요. 속도를 맞춰 봐요.”"), 2);
  assert.equal(countSentences("하나예요. 둘이에요. 셋이에요."), 3);
  assert.equal(countSentences('이렇게 말해 보세요. "저는 천천히 알아가요. 중간에 확인해요.'), 3, "짝이 없는 따옴표는 묶지 않는다");
});

test("운 보장 검사: 기운이 들어온다는 해석은 막지 않고, 운이 트인다 · 들어온다는 보장은 계속 막는다", () => {
  const hit = (t: string) => GUARANTEE_RULES.some((r) => r.re.test(t));
  assert.equal(hit("그 기운이 들어와 있어서 준비한 것을 보여 주는 일이 커질 수 있어요."), false);
  assert.equal(hit("표현하는 기운이 들어오는 시기라서 결과물을 보여 주는 일이 주제로 읽혀요."), false);
  for (const bad of ["운이 들어와요.", "연애운이 올라요.", "행운이 따라요.", "재물운이 열려요.", "이 소품을 두면 운이 트여요."]) assert.equal(hit(bad), true, bad);
});
