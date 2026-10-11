// 실행: npm test  (Node 내장 테스트 러너 사용, 추가 패키지 없음)
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyTendency } from "./dev-rules.ts";
import { ASSESSMENT_MODULES, mbtiModule, relationshipModule, temperamentModule } from "./modules/index.ts";
import { bipolarCode, scoreModule, toScoreMap, validateAnswers } from "./scoring.ts";
import type { Answers, AssessmentModule } from "./types.ts";

function fill(modules: AssessmentModule[], value: number): Answers {
  return Object.fromEntries(modules.flatMap((m) => m.items.map((i) => [i.id, value])));
}

test("모든 문항 id는 서로 겹치지 않는다", () => {
  const ids = ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => i.id));
  assert.equal(new Set(ids).size, ids.length);
});

test("모든 지표에 문항이 하나 이상 있다", () => {
  for (const m of ASSESSMENT_MODULES) {
    for (const d of m.dimensions) {
      assert.ok(m.items.some((i) => i.dimension === d.id), `${m.id}.${d.id}`);
    }
  }
});

test("validateAnswers: 빠진 응답과 범위 밖 값, 모르는 문항을 잡아낸다", () => {
  const answers = fill(ASSESSMENT_MODULES, 3);
  assert.deepEqual(validateAnswers(ASSESSMENT_MODULES, answers), { ok: true });

  delete answers.m1;
  answers.t1 = 6;
  answers.zz = 3;
  const r = validateAnswers(ASSESSMENT_MODULES, answers);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.deepEqual(r.missing, ["m1"]);
    assert.deepEqual(r.invalid.sort(), ["t1", "zz"]);
  }
});

test("scoreModule: 모두 '보통'이면 모든 지표가 50", () => {
  const scores = scoreModule(temperamentModule, fill([temperamentModule], 3));
  assert.ok(scores.every((s) => s.score === 50));
});

test("scoreModule: 역문항을 뒤집어 계산한다", () => {
  // t1(정문항) 5, t2(역문항) 1 → 새로움 추구 최댓값
  const answers = { ...fill([temperamentModule], 3), t1: 5, t2: 1 };
  assert.equal(toScoreMap(scoreModule(temperamentModule, answers)).novelty, 100);
});

test("scoreModule: 응답이 빠지면 오류를 던진다", () => {
  assert.throws(() => scoreModule(relationshipModule, {}));
});

test("bipolarCode: 50 초과는 높은 쪽, 미만은 낮은 쪽, 50은 X", () => {
  const answers: Answers = {
    m1: 5, m2: 1, // ei 100 → I
    m3: 1, m4: 5, // sn 0 → S
    m5: 3, m6: 3, // tf 50 → X
    m7: 1, m8: 5, // jp 0 → J
  };
  assert.equal(bipolarCode(mbtiModule, scoreModule(mbtiModule, answers)), "ISXJ");
});

test("classifyTendency: 관계 불안이 가장 크면 확인추구형", () => {
  const r = classifyTendency({ novelty: 34, caution: 71 }, { anxiety: 72, avoidance: 28 });
  assert.equal(r.id, "reassurance");
});

test("classifyTendency: 새로움 추구가 높고 신중함이 낮으면 탐색지향형", () => {
  const r = classifyTendency({ novelty: 90, caution: 20 }, { anxiety: 40, avoidance: 30 });
  assert.equal(r.id, "exploration");
});

test("classifyTendency: 같은 입력에는 항상 같은 결과", () => {
  const a = classifyTendency({ novelty: 50, caution: 50 }, { anxiety: 50, avoidance: 50 });
  const b = classifyTendency({ novelty: 50, caution: 50 }, { anxiety: 50, avoidance: 50 });
  assert.deepEqual(a, b);
  assert.equal(a.id, "reassurance"); // 동점이면 정해진 순서의 첫 번째
});
