// 실행: npm test — 미유 자체 성향 질문 초안 0.2의 구조 · 균형 · 채점 규칙 검사 (화면에는 연결하지 않은 초안)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contribution,
  coverage,
  coverageOf,
  DRAFT_ITEMS,
  DOMAIN_LABEL,
  HOLD_TEXT,
  indicatorCounts,
  MIN_INDICATORS,
  NA_OPTION_TEXT,
  PERSPECTIVE_IDS,
  PERSPECTIVES,
  scoreDraft,
  scoreItems,
  UNCLEAR_TEXT,
  type DraftAnswers,
  type DraftItem,
  type PerspectiveId,
} from "./situational-draft.ts";
import { REINFORCEMENT_CANDIDATES } from "./reinforcement-candidates.ts";

const scored = (item: DraftItem) => item.options.filter((o) => !o.unscored);

test("구성: 30문항 · 기질 11 / 성격 10 / 관계 9, 문항마다 선택지 4개 + 공통 '해당 없음'", () => {
  assert.equal(DRAFT_ITEMS.length, 30);
  assert.deepEqual(DRAFT_ITEMS.map((i) => i.id), Array.from({ length: 30 }, (_, n) => `Q${String(n + 1).padStart(2, "0")}`));
  const by = (d: string) => DRAFT_ITEMS.filter((i) => i.domain === d).length;
  assert.deepEqual([by("temperament"), by("character"), by("relation")], [11, 10, 9]);
  for (const item of DRAFT_ITEMS) {
    assert.deepEqual(item.options.map((o) => o.id), ["a", "b", "c", "d"], item.id);
    assert.ok(item.stem.length >= 20 && item.stem.endsWith("?"), `${item.id} 질문 형식`);
    assert.equal(PERSPECTIVES[item.primary].domain, item.domain, `${item.id} 문항 영역과 주 관점 영역이 같다`);
  }
  assert.equal(new Set(DRAFT_ITEMS.map((i) => i.stem)).size, 30, "같은 질문을 반복하지 않는다");
  assert.equal(new Set(DRAFT_ITEMS.map((i) => i.topic)).size, 30);
  assert.match(NA_OPTION_TEXT, /겪어 본 적이 없거나/);
  assert.deepEqual(Object.keys(DOMAIN_LABEL), ["temperament", "character", "relation"]);
});

test("한 문항은 주 관점 하나에만 점수를 준다: 선택지는 그 관점 하나만 담고, 세기는 1~2이며, 글이 너무 짧거나 길지 않다", () => {
  for (const item of DRAFT_ITEMS) {
    for (const o of item.options) {
      const keys = Object.keys(o.w);
      if (o.unscored) {
        assert.equal(keys.length, 0, `${item.id}${o.id} 점수에 넣지 않는 답은 점수를 주지 않는다`);
        assert.ok(o.reason, `${item.id}${o.id} 점수에 넣지 않는 답은 이유를 적는다`);
      } else {
        assert.deepEqual(keys, [item.primary], `${item.id}${o.id} 주 관점(${item.primary}) 하나에만 점수`);
        assert.ok([-2, -1, 1, 2].includes(o.w[item.primary] as number), `${item.id}${o.id} 세기`);
      }
      assert.ok(o.text.length >= 10 && o.text.length <= 70, `${item.id}${o.id} 길이 ${o.text.length}`);
    }
    assert.ok(scored(item).length >= 3, `${item.id} 점수를 주는 선택지가 3개 이상`);
    const values = scored(item).map((o) => o.w[item.primary] as number);
    assert.ok(Math.max(...values) > 0 && Math.min(...values) < 0, `${item.id} 높은 쪽과 낮은 쪽 선택지가 모두 있다`);
  }
});

test("지표 수: 문항 30개는 지표 30개다 (0.1은 문항 30개가 지표 62개였다) — 읽을 수 있는 관점은 다섯 개뿐이고 나머지는 보강이 필요하다", () => {
  const counts = indicatorCounts();
  assert.equal(Object.values(counts).reduce((n, v) => n + v, 0), 30);
  assert.deepEqual(counts, { T1: 3, T2: 2, T3: 2, T4: 2, T5: 2, C1: 3, C2: 2, C3: 2, C4: 3, R1: 3, R2: 3, R3: 2, R4: 1 });
  const cov = coverage();
  assert.deepEqual(cov.readable, ["T1", "C1", "C4", "R1", "R2"]);
  assert.deepEqual(cov.needMore.map((n) => `${n.id}+${n.short}`), ["T2+1", "T3+1", "T4+1", "T5+1", "C2+1", "C3+1", "R3+1", "R4+2"]);
  assert.equal(cov.needMore.reduce((n, x) => n + x.short, 0), 9, "보강 후보는 모두 9문항");
});

test("장면: 두 문항 이상이 보는 관점은 서로 다른 장면(일 · 친구 · 연애 · 가족 · 혼자 · 돈 · 낯선 자리)에서 묻는다", () => {
  for (const p of PERSPECTIVE_IDS) {
    const items = DRAFT_ITEMS.filter((i) => i.primary === p);
    if (items.length < 2) continue;
    const scenes = new Set(items.map((i) => i.scene));
    assert.ok(scenes.size >= 2, `${p} ${PERSPECTIVES[p].name}: 장면이 ${[...scenes].join("·")} 하나뿐`);
  }
});

test("관점 정의: 13개 모두 무엇이고 무엇이 아닌지 · 이웃 관점과의 차이를 적었고, '맞춤'은 배려 · 거절하기 어려움 · 갈등 피하기 · 인정받으려는 마음과 구분한다", () => {
  assert.equal(PERSPECTIVE_IDS.length, 13);
  for (const p of PERSPECTIVE_IDS) {
    const d = PERSPECTIVES[p];
    for (const field of [d.means, d.notThis, d.vs, d.high, d.low, d.purpose]) assert.ok(field.length >= 8, `${p} 정의가 비어 있다`);
  }
  assert.deepEqual(PERSPECTIVE_IDS.filter((p) => PERSPECTIVES[p].usedByTypes).sort(), ["C1", "C3", "C4", "T1", "T2", "T4", "T5"]);
  const c3 = PERSPECTIVES.C3;
  assert.match(c3.notThis, /거절하기 어려워서/);
  assert.match(c3.notThis, /갈등이 싫어서/);
  assert.match(c3.notThis, /인정받고 싶어서/);
  assert.match(c3.vs, /R3/);
  assert.match(c3.vs, /T4/);
});

test("같은 행동 · 다른 이유: 거절하기 어려워서 · 약속 때문에 같은 이유의 답은 목표 관점의 점수에 넣지 않고 이유만 남긴다", () => {
  const unscoredItems = DRAFT_ITEMS.filter((i) => i.options.some((o) => o.unscored)).map((i) => i.id);
  assert.deepEqual(unscoredItems, ["Q19", "Q20", "Q22"]);
  const q20 = DRAFT_ITEMS.find((i) => i.id === "Q20")!;
  const hard = q20.options.find((o) => o.unscored)!;
  assert.equal(hard.reason, "거절하기 어려워서");
  assert.equal(contribution(q20, hard.id, "C3"), null, "거절하기 어려워서 돕는 답은 배려(C3)의 증거가 아니다");
  const considerate = q20.options.find((o) => o.reason === "상대 사정을 고려해서")!;
  assert.ok((contribution(q20, considerate.id, "C3") ?? 0) > 0.5);
  const q22 = DRAFT_ITEMS.find((i) => i.id === "Q22")!;
  const byPromise = q22.options.find((o) => o.unscored)!;
  assert.match(byPromise.text, /약속/);
  assert.equal(contribution(q22, byPromise.id, "R1"), null, "약속 때문에 연락한 답은 확인하고 싶은 마음(R1)의 증거가 아니다");
});

test("균형: 한쪽 방향으로 쏠린 관점이 없고, 가장 센 높은 쪽 선택지가 한 글자에 몰리지 않으며, 정답처럼 보이는 낱말이 없다", () => {
  for (const p of PERSPECTIVE_IDS) {
    const all = DRAFT_ITEMS.flatMap((i) => i.options.filter((o) => !o.unscored).map((o) => o.w[p]).filter((v): v is NonNullable<typeof v> => v !== undefined));
    if (all.length === 0) continue;
    const up = all.filter((v) => v > 0).length;
    const down = all.filter((v) => v < 0).length;
    assert.ok(up > 0 && down > 0 && up / down >= 0.4 && up / down <= 2.5, `${p} 높은 쪽 ${up} · 낮은 쪽 ${down}`);
  }
  const text = DRAFT_ITEMS.map((i) => i.stem + i.options.map((o) => o.text).join(" ")).join(" ");
  for (const word of ["성숙", "이기적", "착한", "올바른", "바람직", "훌륭", "정답", "MBTI", "TCI", "ECR", "애착검사", "성격검사", "기질 및 성격", "책임감 있", "배려심", "무책임", "예민", "소심", "쿨하게"]) assert.ok(!text.includes(word), `금지 표현 ${word}`);
  const letter = { a: 0, b: 0, c: 0, d: 0 };
  for (const item of DRAFT_ITEMS) {
    const best = [...scored(item)].sort((x, y) => Math.abs(y.w[item.primary] ?? 0) - Math.abs(x.w[item.primary] ?? 0) || (y.w[item.primary] ?? 0) - (x.w[item.primary] ?? 0))[0];
    const top = scored(item).reduce((a, b) => ((b.w[item.primary] ?? 0) > (a.w[item.primary] ?? 0) ? b : a));
    letter[top.id] += 1;
    assert.ok(best);
  }
  for (const [k, v] of Object.entries(letter)) assert.ok(v >= 5 && v <= 10, `가장 높은 쪽 선택지가 ${k}에 ${v}번 — 위치가 방향을 알려 준다`);
});

test("선택지 순서: 점수가 높은 쪽 · 낮은 쪽이 한 위치에 몰리지 않고, 어느 문항도 높음 → 낮음(또는 반대)으로 줄 서 있지 않다 (순서만 보고 방향을 짐작하지 못하게)", () => {
  const bottom = { a: 0, b: 0, c: 0, d: 0 };
  for (const item of DRAFT_ITEMS) {
    const sc = scored(item);
    const low = sc.reduce((a, b) => ((b.w[item.primary] ?? 0) < (a.w[item.primary] ?? 0) ? b : a));
    bottom[low.id] += 1;
    const ws = sc.map((o) => o.w[item.primary] as number);
    const sortedUp = [...ws].sort((x, y) => x - y);
    const sortedDown = [...ws].sort((x, y) => y - x);
    assert.notDeepEqual(ws, sortedUp, `${item.id} 선택지가 낮음 → 높음 순서로 줄 서 있다`);
    assert.notDeepEqual(ws, sortedDown, `${item.id} 선택지가 높음 → 낮음 순서로 줄 서 있다`);
  }
  for (const [k, v] of Object.entries(bottom)) assert.ok(v >= 5 && v <= 10, `가장 낮은 쪽 선택지가 ${k}에 ${v}번`);
});

test("뻔한 선택지: 높은 쪽 · 낮은 쪽 선택지의 길이가 한쪽으로 길지 않고, 극단 선택지가 단정 표현(항상 · 절대 · 무조건)으로 눈에 띄지 않는다", () => {
  const len = (o: { text: string }) => o.text.length;
  const high: number[] = [];
  const low: number[] = [];
  for (const item of DRAFT_ITEMS) {
    for (const o of scored(item)) (((o.w[item.primary] ?? 0) > 0 ? high : low)).push(len(o));
  }
  const mean = (xs: number[]) => xs.reduce((n, v) => n + v, 0) / xs.length;
  const ratio = mean(high) / mean(low);
  assert.ok(ratio > 0.85 && ratio < 1.18, `높은 쪽 선택지 평균 ${mean(high).toFixed(1)}자 · 낮은 쪽 ${mean(low).toFixed(1)}자 (비 ${ratio.toFixed(2)})`);
  const text = DRAFT_ITEMS.flatMap((i) => i.options.map((o) => o.text)).join(" ");
  for (const word of ["항상", "절대", "무조건", "전혀", "완전히"]) assert.ok(!text.includes(word), `단정 표현 ${word}`);
});

test("채점: 기여값은 점수를 주는 선택지를 같은 확률로 고르는 사람이 0이 되게 맞추고, 주 관점이 아닌 관점 · 이유가 다른 답은 증거가 아니다", () => {
  const q01 = DRAFT_ITEMS.find((i) => i.id === "Q01")!;
  const id = (item: DraftItem, v: number) => item.options.find((o) => o.w[item.primary] === v)!.id;
  assert.equal(contribution(q01, id(q01, 2), "T1"), 1);
  assert.equal(contribution(q01, id(q01, -2), "T1"), -1);
  assert.equal(contribution(q01, id(q01, 2), "R1"), null, "주 관점이 아닌 관점");
  for (const item of DRAFT_ITEMS) {
    const sum = scored(item).reduce((n, o) => n + (contribution(item, o.id, item.primary) ?? 0), 0);
    assert.ok(Math.abs(sum) < 1e-9, `${item.id} 점수를 주는 선택지의 기여값 합 ${sum}`);
  }
  // 한쪽으로 치우친 선택지를 가진 문항(Q19: 높은 쪽 하나 · 낮은 쪽 둘)도 세 선택지를 같은 확률로 고르면 0이다
  const q19 = DRAFT_ITEMS.find((i) => i.id === "Q19")!;
  assert.equal(scored(q19).length, 3);
  const hard = q19.options.find((o) => o.unscored)!;
  assert.equal(contribution(q19, hard.id, "C3"), null);
});

test("채점: 무작위 응답 5,000명의 평균은 읽을 수 있는 모든 관점에서 50 근처이고, 읽을 수 없는 관점은 모두 보류된다", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const sums = Object.fromEntries(PERSPECTIVE_IDS.map((p) => [p, 0])) as Record<PerspectiveId, number>;
  const okCount = Object.fromEntries(PERSPECTIVE_IDS.map((p) => [p, 0])) as Record<PerspectiveId, number>;
  const readable = coverage().readable;
  const people = 5000;
  for (let r = 0; r < people; r++) {
    const answers: DraftAnswers = {};
    for (const item of DRAFT_ITEMS) answers[item.id] = (["a", "b", "c", "d"] as const)[Math.floor(rnd() * 4)];
    const res = scoreDraft(answers);
    for (const p of PERSPECTIVE_IDS) {
      const v = res.perspectives[p];
      if (v.status === "ok") {
        sums[p] += v.score;
        okCount[p] += 1;
      }
    }
  }
  // 점수에 넣지 않는 선택지(같은 행동 · 다른 이유)가 있는 관점은, 무작위로 그 선택지를 고르면 증거가 모자라 보류된다 — R1은 문항 3개 중 하나(Q22)가 그렇다
  for (const p of PERSPECTIVE_IDS) {
    if (readable.includes(p)) {
      const hasUnscored = DRAFT_ITEMS.some((i) => i.primary === p && i.options.some((o) => o.unscored));
      assert.ok(okCount[p] > people * (hasUnscored ? 0.7 : 0.99), `${p} 읽힌 사람 ${okCount[p]}`);
      assert.ok(Math.abs(sums[p] / okCount[p] - 50) < 4, `${p} 평균 ${(sums[p] / okCount[p]).toFixed(1)}`);
    } else assert.equal(okCount[p], 0, `${p}는 문항이 부족해 읽히지 않는다`);
  }
});

test("채점: 한 관점의 방향대로 일관되게 답하면 뚜렷하게 나오고, 문항마다 방향이 갈리면 '현재 응답만으로 뚜렷하지 않음'이다 (약간 · 고르게로 나누지 않는다)", () => {
  const pick = (p: PerspectiveId, dir: 1 | -1): DraftAnswers => {
    const answers: DraftAnswers = {};
    for (const item of DRAFT_ITEMS) {
      if (item.primary !== p) {
        answers[item.id] = "na";
        continue;
      }
      answers[item.id] = [...scored(item)].sort((x, y) => ((y.w[p] ?? 0) - (x.w[p] ?? 0)) * dir)[0].id;
    }
    return answers;
  };
  const high = scoreDraft(pick("T1", 1)).perspectives.T1;
  assert.ok(high.status === "ok" && high.direction === "high" && high.strength === "clear" && high.score >= 85, JSON.stringify(high));
  const low = scoreDraft(pick("T1", -1)).perspectives.T1;
  assert.ok(low.status === "ok" && low.direction === "low" && low.strength === "clear" && low.score <= 15, JSON.stringify(low));
  // 문항마다 반대로 답함
  const mixed: DraftAnswers = Object.fromEntries(DRAFT_ITEMS.map((i) => [i.id, "na" as const]));
  const t1 = DRAFT_ITEMS.filter((i) => i.primary === "T1");
  t1.forEach((item, n) => {
    mixed[item.id] = [...scored(item)].sort((x, y) => ((y.w.T1 ?? 0) - (x.w.T1 ?? 0)) * (n % 2 === 0 ? 1 : -1))[0].id;
  });
  const res = scoreDraft(mixed).perspectives.T1;
  assert.ok(res.status === "ok" && res.strength === "unclear" && res.direction === "unclear", JSON.stringify(res));
  assert.equal(UNCLEAR_TEXT, "현재 응답만으로 뚜렷하지 않음");
  assert.match(HOLD_TEXT, /보류/);
  // 중간 선택지만 고르면 방향을 억지로 붙이지 않는다
  const middle: DraftAnswers = Object.fromEntries(DRAFT_ITEMS.map((i) => [i.id, "na" as const]));
  for (const item of t1) middle[item.id] = item.options.find((o) => o.w.T1 === 1)!.id;
  const mid = scoreDraft(middle).perspectives.T1;
  assert.ok(mid.status === "ok", JSON.stringify(mid));
});

test("채점: '해당 없음'은 점수에 넣지 않고, 지표가 3개 미만이 되면 그 관점은 판단을 보류한다 (억지로 분류하지 않는다)", () => {
  const allNa: DraftAnswers = Object.fromEntries(DRAFT_ITEMS.map((i) => [i.id, "na" as const]));
  const none = scoreDraft(allNa);
  assert.equal(none.answered, 0);
  for (const p of PERSPECTIVE_IDS) assert.equal(none.perspectives[p].status, "hold");
  // 한 관점의 문항 중 하나만 건너뛰면 읽을 수 있던 관점(문항 3개)도 보류된다
  const all: DraftAnswers = Object.fromEntries(DRAFT_ITEMS.map((i) => [i.id, "b" as const]));
  assert.equal(scoreDraft(all).perspectives.T1.status, "ok");
  const skipOne: DraftAnswers = { ...all, Q01: "na" };
  assert.equal(scoreDraft(skipOne).perspectives.T1.status, "hold", "3개뿐인 관점은 한 문항만 건너뛰어도 보류");
  assert.equal(scoreDraft(skipOne).perspectives.C1.status, "ok", "다른 관점은 그대로 계산된다");
  assert.equal(scoreDraft(skipOne).skipped, 1);
  // 같은 이유 문항에서 이유가 다른 답을 고르면 그 문항은 증거가 아니므로 2개만 남아 보류된다
  const reasoned: DraftAnswers = { ...all };
  const q22 = DRAFT_ITEMS.find((i) => i.id === "Q22")!;
  reasoned.Q22 = q22.options.find((o) => o.unscored)!.id;
  assert.equal(scoreDraft(reasoned).perspectives.R1.status, "hold");
});

test("보강 후보 9문항: 읽을 수 없는 관점만 보강하고, 같은 구조 규칙을 지키며, 화면에는 연결하지 않았다", () => {
  assert.equal(REINFORCEMENT_CANDIDATES.length, 9);
  const needed = coverage().needMore;
  const ids = new Set(DRAFT_ITEMS.map((i) => i.id));
  const counts = new Map<PerspectiveId, number>();
  for (const c of REINFORCEMENT_CANDIDATES) {
    assert.ok(!ids.has(c.id), `${c.id}가 기존 문항 번호와 겹친다`);
    assert.match(c.id, /^N0[1-9]$/);
    assert.ok(needed.some((n) => n.id === c.primary), `${c.id}는 이미 읽을 수 있는 관점(${c.primary})을 보강한다`);
    counts.set(c.primary, (counts.get(c.primary) ?? 0) + 1);
    assert.deepEqual(c.options.map((o) => o.id), ["a", "b", "c", "d"]);
    for (const o of c.options) {
      if (o.unscored) assert.ok(o.reason && Object.keys(o.w).length === 0);
      else assert.deepEqual(Object.keys(o.w), [c.primary], `${c.id}${o.id}`);
    }
    // 같은 관점을 이미 묻는 장면과 겹치지 않는 장면을 하나 더한다
    const used = new Set(DRAFT_ITEMS.filter((i) => i.primary === c.primary).map((i) => i.scene));
    assert.ok(!used.has(c.scene), `${c.id} ${c.primary}에서 이미 쓴 장면(${c.scene})`);
  }
  for (const n of needed) assert.equal(counts.get(n.id), n.short, `${n.id} 보강 수`);
  // 후보를 더하면 13개 관점 모두 문항 3개 이상이 된다 — 최소선일 뿐이며, 한 문항만 건너뛰어도 보류되는 관점이 생긴다
  const merged = [...DRAFT_ITEMS, ...REINFORCEMENT_CANDIDATES];
  const after = coverageOf(merged);
  assert.equal(after.readable.length, 13);
  assert.equal(after.needMore.length, 0);
  const counted = indicatorCountsAfter(merged);
  assert.equal(Math.min(...Object.values(counted)), MIN_INDICATORS);
  // 후보를 더해도 기존 문항의 점수는 바뀌지 않는다 (같은 응답은 같은 결과)
  const answers: DraftAnswers = Object.fromEntries(DRAFT_ITEMS.map((i) => [i.id, "a" as const]));
  const before = scoreDraft(answers).perspectives;
  const withCandidates = scoreItems(merged, answers).perspectives;
  for (const p of coverage().readable) assert.deepEqual(withCandidates[p], before[p]);
});

function indicatorCountsAfter(items: DraftItem[]) {
  const out = Object.fromEntries(PERSPECTIVE_IDS.map((p) => [p, 0])) as Record<PerspectiveId, number>;
  for (const i of items) out[i.primary] += 1;
  return out;
}
