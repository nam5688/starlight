// 실행: npm test — 같은 입력의 두 글을 나란히 보는 지표(호출 없음). 모의 작성기 글로 지표가 계산되고 마크다운이 만들어지는지만 본다 — 실제 AI 글의 품질을 판정하지 않는다.
import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonas } from "../ai/compare-personas.ts";
import { buildEvidence } from "../ai/generator.ts";
import { ADVICE_WORDS, renderRunComparison, runMetrics } from "./compare-runs.ts";
import { composeMockStory7 } from "./story7-mock-model.ts";
import { STORY7_SECTIONS } from "./story7-plan.ts";
import { buildStory7UserMessage } from "./story7-prompt.ts";
import type { Story7DraftV1 } from "./types.ts";

const P01 = buildPersonas(10)[0];
const evidence = buildEvidence(P01.input, { year: 2026, month: 10 }, { fortune: true });
const draft = (): Story7DraftV1 => composeMockStory7(buildStory7UserMessage(evidence, "2026-10-18", P01.input.context));

test("지표: 장 일곱 개의 모양 · 검사 · 조언 낱말 · 개운 후보를 센다", () => {
  const m = runMetrics(draft(), evidence, { hasContext: Boolean(P01.input.context) });
  assert.equal(m.chapters.length, STORY7_SECTIONS.length);
  assert.ok(m.totalChars > 0);
  assert.equal(m.adviceWords.length, ADVICE_WORDS.length);
  assert.ok(m.fortify.candidates.length >= 1, "개운 후보를 근거에서 꺼낸다");
  assert.deepEqual(Object.keys(m.fortify.spoken).sort(), [...m.fortify.candidates].sort());
  // 6번 장이 후보의 대응을 말한 것으로 센다(모의 글은 첫 후보의 방향 · 색 · 숫자 · 장소를 적는다)
  assert.ok(Object.values(m.fortify.spoken[m.fortify.candidates[0]]).every(Boolean));
  assert.equal(m.fortify.tieVerdict, null);
});

test("낱말 횟수는 글을 바꾸면 달라지고, 두 글 비교표가 만들어진다(채점표는 비워 둔다)", () => {
  const a = draft();
  const b = draft();
  b.sections[0].paragraphs![0] = `${b.sections[0].paragraphs![0]} ${"기준을 정하고 거절하고 미리 정해 두세요. ".repeat(20)}`;
  const ma = runMetrics(a, evidence, { hasContext: true });
  const mb = runMetrics(b, evidence, { hasContext: true });
  const count = (m: typeof ma, w: string) => m.adviceWords.find((x) => x.word === w)!.count;
  assert.ok(count(mb, "기준") >= count(ma, "기준") + 20);
  assert.ok(count(mb, "거절") >= count(ma, "거절") + 20);
  assert.ok(mb.repeatedPhrases.some((p) => /기준을 정하고 거절하고/.test(p.phrase) && p.count >= 3), JSON.stringify(mb.repeatedPhrases));
  // 동점 후보를 하나로 정해 말한 표현은 개인 정보 없이 표시만 한다(후보가 하나뿐이면 걸리지 않는다)
  const md = renderRunComparison({ label: "이전", metrics: ma }, { label: "새", metrics: mb });
  for (const h of ["## 1. 크기와 장별 모양", "## 2. 검사 결과", "## 3. 되풀이되기 쉬운 조언 낱말", "## 4. 각 장의 첫 문장", "## 5. 개운", "## 6. 글을 읽고 운영자가 직접 채점"]) assert.ok(md.includes(h), h);
  assert.match(md, /좋은 글인지는 판정하지 않습니다/);
  assert.match(md, /AI 호출 0회/);
  assert.match(md, /\| \*\*전체\*\* \| 6\.5 \| \| \|/);
});
