// 실행: npm test — 미유 자체 성향 질문 초안의 구조 · 균형 · 채점 규칙 검사 (화면에는 연결하지 않은 초안)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contribution,
  DRAFT_ITEMS,
  DOMAIN_LABEL,
  indicatorCounts,
  MIN_INDICATORS,
  NA_OPTION_TEXT,
  PERSPECTIVE_IDS,
  PERSPECTIVES,
  scoreDraft,
  type DraftAnswers,
  type DraftItem,
  type PerspectiveId,
} from "./situational-draft.ts";

const perspectivesOf = (item: DraftItem) => [...new Set(item.options.flatMap((o) => Object.keys(o.w) as PerspectiveId[]))];

test("구성: 30문항 · 기질 11 / 성격 10 / 관계 9, 문항마다 선택지 4개 + 공통 '해당 없음'", () => {
  assert.equal(DRAFT_ITEMS.length, 30);
  assert.deepEqual(DRAFT_ITEMS.map((i) => i.id), Array.from({ length: 30 }, (_, n) => `Q${String(n + 1).padStart(2, "0")}`));
  const by = (d: string) => DRAFT_ITEMS.filter((i) => i.domain === d).length;
  assert.deepEqual([by("temperament"), by("character"), by("relation")], [11, 10, 9]);
  for (const item of DRAFT_ITEMS) {
    assert.deepEqual(item.options.map((o) => o.id), ["a", "b", "c", "d"], item.id);
    assert.ok(item.stem.length >= 20 && item.stem.endsWith("?"), `${item.id} 질문 형식`);
  }
  assert.equal(new Set(DRAFT_ITEMS.map((i) => i.stem)).size, 30, "같은 질문을 반복하지 않는다");
  assert.equal(new Set(DRAFT_ITEMS.map((i) => i.topic)).size, 30);
  assert.match(NA_OPTION_TEXT, /겪어 본 적이 없거나/);
  assert.deepEqual(Object.keys(DOMAIN_LABEL), ["temperament", "character", "relation"]);
});

test("선택지: 한 선택지는 최대 2개 관점에만 점수를 주고, 세기는 1~2이며, 글이 너무 짧거나 길지 않다", () => {
  for (const item of DRAFT_ITEMS) {
    for (const o of item.options) {
      const entries = Object.entries(o.w);
      assert.ok(entries.length >= 1 && entries.length <= 2, `${item.id}${o.id} 관점 수 ${entries.length}`);
      for (const [, v] of entries) assert.ok([-2, -1, 1, 2].includes(v as number), `${item.id}${o.id} 세기`);
      assert.ok(o.text.length >= 10 && o.text.length <= 70, `${item.id}${o.id} 길이 ${o.text.length}`);
    }
  }
});

test("지표 수: 13개 관점 모두 4개 이상의 문항에서 점수를 받고, 대표 경향 12유형이 쓰는 7개 관점도 마찬가지다", () => {
  const counts = indicatorCounts();
  for (const p of PERSPECTIVE_IDS) assert.ok(counts[p] >= 4, `${p} ${PERSPECTIVES[p].name} 지표 ${counts[p]}`);
  const typePerspectives = PERSPECTIVE_IDS.filter((p) => PERSPECTIVES[p].usedByTypes);
  assert.deepEqual(typePerspectives.sort(), ["C1", "C3", "C4", "T1", "T2", "T4", "T5"]);
  // 각 영역의 관점은 자기 영역의 문항에서 먼저 측정한다 (영역별 점수를 서로 섞지 않는다)
  for (const p of PERSPECTIVE_IDS) {
    const own = DRAFT_ITEMS.filter((i) => i.domain === PERSPECTIVES[p].domain && perspectivesOf(i).includes(p)).length;
    assert.ok(own >= 3, `${p}는 자기 영역 문항에서 ${own}개 지표`);
  }
});

test("균형: 한 문항이 한쪽으로만 점수를 줄 수 없고(범위가 있어야 함), 관점마다 높은 쪽 · 낮은 쪽 선택지가 비슷하게 있으며, 정답처럼 보이는 표현이 없다", () => {
  for (const item of DRAFT_ITEMS) for (const p of perspectivesOf(item)) {
    const values = item.options.map((o) => o.w[p] ?? 0);
    assert.notEqual(Math.max(...values), Math.min(...values), `${item.id}-${p} 점수 범위`);
  }
  for (const p of PERSPECTIVE_IDS) {
    const all = DRAFT_ITEMS.flatMap((i) => i.options.map((o) => o.w[p]).filter((v): v is NonNullable<typeof v> => v !== undefined));
    const up = all.filter((v) => v > 0).length;
    const down = all.filter((v) => v < 0).length;
    assert.ok(up > 0 && down > 0 && up / down >= 0.4 && up / down <= 2.5, `${p} 높은 쪽 ${up} · 낮은 쪽 ${down}`);
  }
  const text = DRAFT_ITEMS.map((i) => i.stem + i.options.map((o) => o.text).join(" ")).join(" ");
  for (const word of ["성숙", "이기적", "착한", "올바른", "바람직", "훌륭", "정답", "MBTI", "TCI", "ECR", "애착검사", "성격검사", "기질 및 성격"]) assert.ok(!text.includes(word), `금지 표현 ${word}`);
  // 가장 센 높은 쪽 선택지가 한 글자(a~d)에 몰리지 않는다
  const letter = { a: 0, b: 0, c: 0, d: 0 };
  for (const item of DRAFT_ITEMS) {
    const best = [...item.options].sort((x, y) => Math.max(...Object.values(y.w)) - Math.max(...Object.values(x.w)))[0];
    letter[best.id] += 1;
  }
  for (const [k, v] of Object.entries(letter)) assert.ok(v >= 3 && v <= 14, `${k} ${v}`);
});

test("채점: 기여값은 네 선택지를 같은 확률로 고르는 사람이 0이 되게 맞춘다 (한쪽으로만 점수를 주는 문항도 쏠림을 만들지 않는다)", () => {
  const withWeight = (item: DraftItem, p: PerspectiveId, v: number) => item.options.find((o) => o.w[p] === v)!.id;
  const q23 = DRAFT_ITEMS.find((i) => i.id === "Q23")!; // R1은 선택지 하나에서만 +1
  const r1 = withWeight(q23, "R1", 1);
  assert.equal(contribution(q23, r1, "R1"), 1);
  const other = q23.options.find((o) => o.id !== r1 && o.w.R1 === undefined)!.id;
  assert.ok(Math.abs((contribution(q23, other, "R1") ?? 0) + 1 / 3) < 1e-9);
  const sum = q23.options.reduce((n, o) => n + (contribution(q23, o.id, "R1") ?? 0), 0);
  assert.ok(Math.abs(sum) < 1e-9, "네 선택지의 기여값 합이 0");
  const q01 = DRAFT_ITEMS.find((i) => i.id === "Q01")!;
  assert.equal(contribution(q01, withWeight(q01, "T1", 2), "T1"), 1);
  assert.equal(contribution(q01, withWeight(q01, "T1", -2), "T1"), -1);
  assert.equal(contribution(q23, r1, "T1"), null, "관련 없는 관점");
});

test("채점: 무작위 응답 5,000명의 평균은 모든 관점에서 50 근처이고 쏠리지 않는다", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const sums = Object.fromEntries(PERSPECTIVE_IDS.map((p) => [p, 0])) as Record<PerspectiveId, number>;
  let n = 0;
  for (let r = 0; r < 5000; r++) {
    const answers: DraftAnswers = {};
    for (const item of DRAFT_ITEMS) answers[item.id] = (["a", "b", "c", "d"] as const)[Math.floor(rnd() * 4)];
    const res = scoreDraft(answers);
    for (const p of PERSPECTIVE_IDS) {
      const v = res.perspectives[p];
      assert.equal(v.status, "ok");
      if (v.status === "ok") sums[p] += v.score;
    }
    n += 1;
  }
  for (const p of PERSPECTIVE_IDS) assert.ok(Math.abs(sums[p] / n - 50) < 4, `${p} 평균 ${(sums[p] / n).toFixed(1)}`);
});

test("채점: 한 관점의 방향대로 일관되게 답하면 뚜렷하게 나오고, 문항마다 방향이 갈리면 '상황에 따라 다름'으로 표시한다", () => {
  const pick = (p: PerspectiveId, dir: 1 | -1): DraftAnswers => {
    const answers: DraftAnswers = {};
    for (const item of DRAFT_ITEMS) {
      const scored = item.options.map((o) => ({ id: o.id, v: (o.w[p] ?? 0) * dir }));
      answers[item.id] = scored.sort((x, y) => y.v - x.v)[0].id;
    }
    return answers;
  };
  const high = scoreDraft(pick("T5", 1)).perspectives.T5;
  assert.ok(high.status === "ok" && high.direction === "high" && high.strength === "clear" && high.score >= 85, JSON.stringify(high));
  const low = scoreDraft(pick("T5", -1)).perspectives.T5;
  assert.ok(low.status === "ok" && low.direction === "low" && low.strength === "clear" && low.score <= 15, JSON.stringify(low));
  // 번갈아 반대로 답함
  const mixed: DraftAnswers = {};
  let flip = 1;
  for (const item of DRAFT_ITEMS) {
    const p: PerspectiveId = "T5";
    const best = [...item.options].sort((x, y) => ((y.w[p] ?? 0) - (x.w[p] ?? 0)) * flip)[0];
    mixed[item.id] = best.id;
    if (perspectivesOf(item).includes(p)) flip *= -1;
  }
  const res = scoreDraft(mixed).perspectives.T5;
  assert.ok(res.status === "ok" && res.situational && res.strength === "even", JSON.stringify(res));
});

test("채점: '해당 없음'은 점수에 넣지 않고, 지표가 3개 미만이 되면 그 관점은 판단을 보류한다 (억지로 분류하지 않는다)", () => {
  const allNa: DraftAnswers = Object.fromEntries(DRAFT_ITEMS.map((i) => [i.id, "na" as const]));
  const none = scoreDraft(allNa);
  assert.equal(none.answered, 0);
  for (const p of PERSPECTIVE_IDS) assert.equal(none.perspectives[p].status, "hold");
  // 한 관점의 문항 중 두 개만 답하면 보류
  const partial: DraftAnswers = { ...allNa };
  const t5Items = DRAFT_ITEMS.filter((i) => perspectivesOf(i).includes("T5")).slice(0, MIN_INDICATORS - 1);
  for (const i of t5Items) partial[i.id] = "a";
  assert.equal(scoreDraft(partial).perspectives.T5.status, "hold");
  // 같은 문항을 건너뛰어도 다른 관점은 그대로 계산된다
  const some: DraftAnswers = Object.fromEntries(DRAFT_ITEMS.map((i) => [i.id, "b" as const]));
  some.Q03 = "na";
  assert.equal(scoreDraft(some).perspectives.T1.status, "ok");
  assert.equal(scoreDraft(some).skipped, 1);
});
