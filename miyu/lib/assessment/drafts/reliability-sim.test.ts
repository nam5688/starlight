// 실행: npm test — 문항 초안의 가상 응답 점검 계산이 흔들리지 않는지 확인한다 (실제 응답이 아니라 가정 아래의 계산)
import assert from "node:assert/strict";
import { test } from "node:test";
import { calibrateSituational, describeStructure, indicatorsNeeded, makeRandom, runSimulation } from "./reliability-sim.ts";
import { isSituational } from "./situational-draft.ts";
import { DRAFT_V01, DRAFT_V02, DRAFT_V02_PLUS } from "./versions.ts";

const BASE = { people: 600, seed: 7, naRate: 0.05 };
const readableOf = (d: typeof DRAFT_V02) => d.ids.filter((p) => d.indicatorCounts()[p] >= 3);

test("같은 난수 씨앗이면 같은 결과가 나온다", () => {
  const a = makeRandom(1);
  const b = makeRandom(1);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  const x = runSimulation({ ...BASE, consistency: 1 });
  const y = runSimulation({ ...BASE, consistency: 1 });
  assert.deepEqual(x.perspectives.map((p) => p.retestCorrelation), y.perspectives.map((p) => p.retestCorrelation));
});

test("문항 구조: 0.1은 문항 30개가 지표 62개였고, 0.2는 문항 30개가 지표 30개다 — 읽을 수 있는 관점은 13개에서 5개로 줄었다", () => {
  const v1 = describeStructure(DRAFT_V01);
  assert.equal(v1.items, 30);
  assert.equal(v1.indicators, 62);
  assert.deepEqual(v1.itemsByPerspectiveCount, { one: 2, two: 24, threePlus: 4 });
  assert.equal(v1.maxPerspectivesPerItem, 3);
  assert.ok(v1.sharedPairs >= 20, `같은 문항을 함께 쓰는 관점 쌍 ${v1.sharedPairs}`);
  assert.equal(v1.readableByDistinctItems.length, 13);
  const v2 = describeStructure(DRAFT_V02);
  assert.equal(v2.items, 30);
  assert.equal(v2.indicators, 30);
  assert.deepEqual(v2.itemsByPerspectiveCount, { one: 30, two: 0, threePlus: 0 });
  assert.equal(v2.sharedPairs, 0);
  assert.deepEqual(v2.readableByDistinctItems, ["T1", "C1", "C4", "R1", "R2"]);
  const v3 = describeStructure(DRAFT_V02_PLUS);
  assert.equal(v3.items, 39);
  assert.equal(v3.indicators, 39);
  assert.equal(v3.readableByDistinctItems.length, 13);
  assert.equal(v3.minIndicators, 3);
});

test("응답이 성향과 무관한 무작위(일관성 0)면 재응답이 거의 일치하지 않고, 일관성이 올라가면 점수가 성향을 따라간다 (읽을 수 있는 관점만)", () => {
  const random = runSimulation({ ...BASE, consistency: 0 });
  const readable = readableOf(DRAFT_V02);
  for (const p of random.perspectives.filter((x) => readable.includes(x.id))) {
    assert.ok(Math.abs(p.retestCorrelation) < 0.25, `${p.id} 무작위 재응답 상관 ${p.retestCorrelation.toFixed(2)}`);
    assert.ok(Math.abs(p.scoreVsTrait) < 0.25, `${p.id} 무작위 성향 상관 ${p.scoreVsTrait.toFixed(2)}`);
  }
  const mid = runSimulation({ ...BASE, consistency: 1 });
  const high = runSimulation({ ...BASE, consistency: 2 });
  assert.equal(mid.perspectives.length, 13);
  for (let i = 0; i < mid.perspectives.length; i++) {
    if (!readable.includes(mid.perspectives[i].id)) {
      assert.equal(mid.perspectives[i].holdRate, 1, `${mid.perspectives[i].id}는 문항이 모자라 모든 응답에서 보류`);
      continue;
    }
    assert.ok(mid.perspectives[i].scoreVsTrait > 0.5, `${mid.perspectives[i].id} 성향 상관 ${mid.perspectives[i].scoreVsTrait.toFixed(2)}`);
    assert.ok(high.perspectives[i].retestCorrelation >= mid.perspectives[i].retestCorrelation - 0.05, `${mid.perspectives[i].id} 일관성이 높아도 재응답이 나아지지 않음`);
  }
});

test("해당 없음이 많을수록 보류가 늘고, 3문항뿐인 관점은 문항 하나만 건너뛰어도 보류되므로 5%에서도 눈에 띄게 보류된다", () => {
  const few = runSimulation({ ...BASE, consistency: 1, naRate: 0.05 });
  const many = runSimulation({ ...BASE, consistency: 1, naRate: 0.3 });
  const readable = readableOf(DRAFT_V02);
  const mean = (r: typeof few) => r.perspectives.filter((p) => readable.includes(p.id)).reduce((n, p) => n + p.holdRate, 0) / readable.length;
  assert.ok(mean(few) > 0.08 && mean(few) < 0.3, `5%에서 평균 보류 ${mean(few).toFixed(2)} (3문항 모두 답해야 읽힌다)`);
  assert.ok(mean(many) > mean(few) + 0.2);
});

test("관점 간 상관: 0.1은 한 문항이 두 관점에 점수를 줘서 성향이 독립인데도 새로움-대비 점수가 얽히고, 0.2는 그 구조 상관이 사라진다", () => {
  const v1 = runSimulation({ ...BASE, people: 1500, consistency: 1 }, DRAFT_V01);
  assert.equal(v1.crossCorrelation.pairs, 78);
  assert.ok(Math.abs(v1.crossCorrelation.max.r) > 0.25, "0.1에서 구조가 만드는 가장 큰 상관 (T1-T2)");
  assert.ok(v1.leak.max.r !== 0 && Math.abs(v1.leak.max.r) > 0.15, "0.1은 다른 관점의 성향이 이 관점의 점수에 섞인다");
  const v2 = runSimulation({ ...BASE, people: 1500, consistency: 1 }, DRAFT_V02);
  assert.ok(Math.abs(v2.crossCorrelation.max.r) < 0.12, `0.2 최대 ${v2.crossCorrelation.max.r.toFixed(2)}`);
  assert.ok(Math.abs(v2.leak.max.r) < 0.12, `0.2 섞임 최대 ${v2.leak.max.r.toFixed(2)}`);
});

test("12유형: 0.1은 7개 관점이 모두 읽혀 실제 분류 일치를 셀 수 있고(전부 같은 결과는 절반 미만), 0.2의 30문항은 7개 중 3개만 읽혀 분류 자체를 할 수 없다", () => {
  const v1 = runSimulation({ ...BASE, people: 1500, consistency: 1 }, DRAFT_V01);
  assert.equal(v1.typeAgreement.computable, true);
  assert.ok(v1.typeAgreement.sameResult > 0.15 && v1.typeAgreement.sameResult < 0.5, `0.1 12유형 전부 같음 ${v1.typeAgreement.sameResult.toFixed(2)}`);
  assert.ok(v1.typeAgreement.sameResult > v1.sevenReadingsAllSame, "12유형 일치는 7개 판독 전체 일치와 다른 값이다 (경계 · 쏠림 없음이 같은 칸이면 같다고 센다)");
  assert.equal(typeof v1.sevenSignAllSame, "number");
  const v2 = runSimulation({ ...BASE, people: 600, consistency: 1 }, DRAFT_V02);
  assert.equal(v2.typeAgreement.computable, false);
  assert.equal(v2.typeAgreement.sevenReadable, 3);
  assert.equal(v2.sevenSignAllSame, null);
  assert.equal(v2.typeAgreement.shares.insufficient, 1, "분류할 수 없으면 모두 판정 보류");
  // 39문항으로 늘려도 7개 관점이 모두 읽혀야 하므로 문항 하나만 건너뛰어도 판정 보류가 많다
  const v3 = runSimulation({ ...BASE, people: 800, consistency: 1 }, DRAFT_V02_PLUS);
  assert.equal(v3.typeAgreement.computable, true);
  assert.ok(v3.typeAgreement.shares.insufficient > 0.5, `0.2+9 판정 보류 ${v3.typeAgreement.shares.insufficient.toFixed(2)}`);
});

test("'상황에 따라 다름' 표시: 지금 규칙은 한결같은 사람에게도 자주 붙고, 엄격하게 하면 탐지가 사라진다 (그래서 사람마다 판정하는 용도로 쓰지 않는다)", () => {
  const [now, strict] = calibrateSituational({ ...BASE, people: 800, consistency: 1 }, [{ spread: 0.7, minEach: 1 }, { spread: 0.9, minEach: 3 }]);
  assert.ok(now.falseFlag > 0.08, `지금 규칙 오탐 ${now.falseFlag.toFixed(2)}`);
  assert.ok(now.detected - now.falseFlag < 0.35, "탐지가 오탐보다 크게 앞서지 않는다");
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

test("다시 답했을 때 방향이 뒤집히는 몫은 가운데에서 가까울수록 크다 — 약한 방향에 \"약간 ~한 편\"을 붙이지 않는 근거", () => {
  const r = runSimulation({ ...BASE, people: 1500, consistency: 1 }, DRAFT_V01);
  const rate = (b: { people: number; flipped: number }) => b.flipped / b.people;
  assert.ok(rate(r.directionFlip.under10) > rate(r.directionFlip.from10to20), "10 미만 > 10~20");
  assert.ok(rate(r.directionFlip.from10to20) > rate(r.directionFlip.over20) * 1.5, "10~20 > 20 이상");
  assert.ok(rate(r.directionFlip.over20) < 0.12, `뚜렷한 방향은 대부분 유지된다 ${rate(r.directionFlip.over20).toFixed(2)}`);
  assert.ok(rate(r.directionFlip.under10) > 0.25, `가운데 근처 방향은 자주 뒤집힌다 ${rate(r.directionFlip.under10).toFixed(2)}`);
});
