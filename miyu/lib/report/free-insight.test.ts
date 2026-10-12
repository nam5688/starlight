// 실행: npm test — 무료 해석 문단: 응답이 뒷받침하는 문장만, 모두에게 붙지 않는다
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyTendency } from "../assessment/dev-rules.ts";
import { ASSESSMENT_MODULES, relationshipModule, temperamentModule } from "../assessment/modules/index.ts";
import { scoreModule, toScoreMap } from "../assessment/scoring.ts";
import type { Answers } from "../assessment/types.ts";
import { buildDevFreeSummary } from "./build-free-summary.ts";
import { ANSWER_LABEL, buildFreeInsight } from "./free-insight.ts";

const all = (v: number): Answers => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, v])));

test("응답이 뒷받침하는 문장만 들어간다: 연락 문항에 '그렇다'고 답했을 때만 연락 문장이 나온다", () => {
  const base = { ...all(3), r1: 5, r2: 3, r3: 3 };
  const a = buildFreeInsight(base, "reassurance");
  assert.ok(a);
  assert.match(a.text, /평소와 달라진 이유를 모를 때/);
  assert.doesNotMatch(a.text, /상대도 나와 같은 마음/, "근거가 없는 문장은 넣지 않는다");
  assert.deepEqual(a.basis.map((b) => b.itemId), ["r1"]);

  const more = buildFreeInsight({ ...base, r2: 4, r3: 1 }, "reassurance");
  assert.ok(more);
  assert.deepEqual(more.basis.map((b) => b.itemId), ["r1", "r2", "r3"]);
  assert.ok(more.text.length > a.text.length);
});

test("역문항은 문항 문장 그대로의 응답으로 판단한다: '작은 오해에도 불안하지 않다'에 '아니다'라고 답했을 때 오해 문장이 나온다", () => {
  const withReverse = buildFreeInsight({ ...all(3), r3: 1 }, "reassurance");
  assert.ok(withReverse && /작은 오해/.test(withReverse.text));
  const without = buildFreeInsight({ ...all(3), r3: 5, r1: 4 }, "reassurance");
  assert.ok(without && !/작은 오해/.test(without.text));
});

test("근거가 하나도 없으면 문단을 만들지 않는다 (모두에게 붙는 문장을 만들지 않는다)", () => {
  for (const tendency of ["reassurance", "distance", "stability", "exploration"] as const) {
    assert.equal(buildFreeInsight(all(3), tendency), null, tendency);
  }
});

test("응답이 다르면 문단도 다르고, 같은 응답이면 항상 같다", () => {
  const a = buildFreeInsight({ ...all(3), r1: 5, r4: 5 }, "reassurance");
  const b = buildFreeInsight({ ...all(3), r2: 5, r3: 1 }, "reassurance");
  assert.notEqual(a?.text, b?.text);
  assert.deepEqual(buildFreeInsight({ ...all(3), r1: 5, r4: 5 }, "reassurance"), a);
});

test("표현: 단정하지 않고(~할 수 있어요 · ~편일 수 있어요), 좋고 나쁨 · 진단 · 예언 표현을 쓰지 않는다", () => {
  for (const tendency of ["reassurance", "distance", "stability", "exploration"] as const) {
    for (const v of [1, 5]) {
      const ins = buildFreeInsight(all(v), tendency);
      if (!ins) continue;
      for (const sentence of ins.text.split(/(?<=요\.)\s*/).filter(Boolean)) {
        assert.match(sentence, /수 있어요\.$/, `단정하지 않는 어미: ${sentence}`);
      }
      assert.doesNotMatch(ins.text, /반드시|항상|절대|불안장애|우울|진단|운명|예정|만나게/);
    }
  }
});

test("대표 경향과 같은 영역의 문항만 근거로 쓰고, 근거 문항 문장 · 응답이 함께 저장된다", () => {
  const s = buildDevFreeSummary({ ...all(5), r4: 5, r5: 5, r6: 1 });
  const tendency = classifyTendency(toScoreMap(scoreModule(temperamentModule, { ...all(5) })), toScoreMap(scoreModule(relationshipModule, { ...all(5), r4: 5, r5: 5, r6: 1 })));
  assert.equal(s.tendency.id, tendency.id);
  const prefix = s.insight?.basisModule === "relationship" ? "r" : "t";
  assert.ok(s.insight && s.insight.basis.every((b) => b.itemId.startsWith(prefix) && b.text.length > 5 && ANSWER_LABEL[b.answer]));
});

test("새 필드가 없는 이전 저장 결과(insight 없음)도 그대로 읽힌다", () => {
  const s = buildDevFreeSummary(all(3));
  assert.equal(s.insight, undefined);
  assert.ok(s.oneLiner.length > 0);
});
