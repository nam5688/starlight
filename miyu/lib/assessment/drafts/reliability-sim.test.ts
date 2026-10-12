// 실행: npm test — 30문항 초안의 가상 응답 점검 계산이 흔들리지 않는지 확인한다 (실제 응답이 아니라 가정 아래의 계산)
import assert from "node:assert/strict";
import { test } from "node:test";
import { calibrateSituational, indicatorsNeeded, makeRandom, runSimulation } from "./reliability-sim.ts";
import { isSituational, PERSPECTIVE_IDS } from "./situational-draft.ts";

const BASE = { people: 600, seed: 7, naRate: 0.05 };

test("같은 난수 씨앗이면 같은 결과가 나온다", () => {
  const a = makeRandom(1);
  const b = makeRandom(1);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  const x = runSimulation({ ...BASE, consistency: 1 });
  const y = runSimulation({ ...BASE, consistency: 1 });
  assert.deepEqual(x.perspectives.map((p) => p.retestCorrelation), y.perspectives.map((p) => p.retestCorrelation));
});

test("응답이 성향과 무관한 무작위(일관성 0)면 재응답이 거의 일치하지 않고, 일관성이 올라가면 점수가 성향을 따라간다", () => {
  const random = runSimulation({ ...BASE, consistency: 0 });
  for (const p of random.perspectives) {
    assert.ok(Math.abs(p.retestCorrelation) < 0.2, `${p.id} 무작위 재응답 상관 ${p.retestCorrelation.toFixed(2)}`);
    assert.ok(Math.abs(p.scoreVsTrait) < 0.2, `${p.id} 무작위 성향 상관 ${p.scoreVsTrait.toFixed(2)}`);
  }
  const mid = runSimulation({ ...BASE, consistency: 1 });
  const high = runSimulation({ ...BASE, consistency: 2 });
  assert.equal(mid.perspectives.length, PERSPECTIVE_IDS.length);
  for (let i = 0; i < PERSPECTIVE_IDS.length; i++) {
    assert.ok(mid.perspectives[i].scoreVsTrait > 0.6, `${mid.perspectives[i].id} 성향 상관 ${mid.perspectives[i].scoreVsTrait.toFixed(2)}`);
    assert.ok(high.perspectives[i].retestCorrelation >= mid.perspectives[i].retestCorrelation - 0.05, `${mid.perspectives[i].id} 일관성이 높아도 재응답이 나아지지 않음`);
  }
});

test("해당 없음이 많을수록 보류가 늘고, 5%에서는 거의 보류되지 않는다", () => {
  const few = runSimulation({ ...BASE, consistency: 1, naRate: 0.05 });
  const many = runSimulation({ ...BASE, consistency: 1, naRate: 0.3 });
  const mean = (xs: number[]) => xs.reduce((n, v) => n + v, 0) / xs.length;
  assert.ok(mean(few.perspectives.map((p) => p.holdRate)) < 0.05);
  assert.ok(mean(many.perspectives.map((p) => p.holdRate)) > mean(few.perspectives.map((p) => p.holdRate)) + 0.1);
});

test("관점 간 상관은 성향이 독립이어도 문항 구조 때문에 생기며(새로움-대비), 대부분의 쌍은 작다", () => {
  const r = runSimulation({ ...BASE, people: 1500, consistency: 1 });
  assert.equal(r.crossCorrelation.pairs, 78);
  assert.ok(r.crossCorrelation.meanAbs < 0.15, `평균 ${r.crossCorrelation.meanAbs.toFixed(2)}`);
  assert.ok(Math.abs(r.crossCorrelation.max.r) > 0.25, "문항 구조가 만드는 상관이 가장 큰 쌍은 눈에 띄어야 한다 (T1-T2)");
});

test("'상황에 따라 다름' 표시: 지금 규칙은 한결같은 사람에게도 자주 붙고, 엄격하게 하면 탐지가 사라진다 (그래서 사람마다 판정하는 용도로 쓰지 않는다)", () => {
  const [now, strict] = calibrateSituational({ ...BASE, people: 800, consistency: 1 }, [{ spread: 0.7, minEach: 1 }, { spread: 0.9, minEach: 3 }]);
  assert.ok(now.falseFlag > 0.08, `지금 규칙 오탐 ${now.falseFlag.toFixed(2)}`);
  assert.ok(now.detected - now.falseFlag < 0.25, "탐지가 오탐보다 크게 앞서지 않는다");
  assert.ok(strict.falseFlag < 0.02 && strict.detected < 0.05);
});

test("스피어만-브라운: 상관이 목표보다 낮으면 지표가 더 필요하고, 이미 높으면 적게 필요하다", () => {
  assert.ok(indicatorsNeeded(4, 0.5, 0.8) > 4);
  assert.ok(indicatorsNeeded(4, 0.9, 0.8) < 4);
  assert.equal(indicatorsNeeded(4, 0, 0.8), Number.POSITIVE_INFINITY);
  assert.ok(Math.abs(indicatorsNeeded(4, 0.8, 0.8) - 4) < 1e-9);
});

test("isSituational: 방향이 양쪽으로 크게 갈릴 때만 켜진다", () => {
  assert.equal(isSituational([1, -1, 1, -1]), true);
  assert.equal(isSituational([1, 1, 1, 0.8]), false);
  assert.equal(isSituational([]), false);
  assert.equal(isSituational([1, -1, 0, 0], { spread: 0.7, minEach: 2 }), false);
});
