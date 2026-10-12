// 미유 자체 성향 질문 초안 — "30문항으로 13개 관점을 얼마나 믿고 읽을 수 있는가"를 가상 응답으로 재는 계산.
//
// 이것은 실제 사람의 응답이 아니다. 사람이 문항에 얼마나 일관되게 답하는지(아래 consistency)를 가정하고,
// 그 가정 아래에서 지금의 문항 · 채점 규칙이 만드는 결과가 얼마나 흔들리는지를 센다.
// 그러므로 "실제 신뢰도"가 아니라 "문항 구조가 허용하는 한계"다. 실제 값은 시범 응답으로 확인한다.
// 같은 응답자가 같은 기분으로 다시 답한다고 가정하므로(기억 · 상태 변화 없음), 실제 재응답 일치는 이보다 낮을 가능성이 크다.
import {
  contribution,
  DRAFT_ITEMS,
  indicatorCounts,
  isSituational,
  PERSPECTIVE_IDS,
  PERSPECTIVES,
  scoreDraft,
  type DraftAnswers,
  type PerspectiveId,
  type PerspectiveResult,
  type SituationalRule,
} from "./situational-draft.ts";

/** 재현 가능한 난수 (mulberry32) */
export function makeRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
const gumbel = (rand: () => number) => -Math.log(-Math.log(Math.max(rand(), 1e-12)));

export type SimOptions = {
  people: number;
  seed: number;
  /** 응답 일관성 — 클수록 자기 성향에 맞는 선택지를 안정적으로 고른다 (가정값). 0이면 무작위 */
  consistency: number;
  /** "해당 없음"을 고르는 확률 (가정값) */
  naRate: number;
  /** 상황에 따라 성향이 달라지는 정도 — 문항마다 성향에 더해지는 흔들림의 크기. 0이면 어느 상황에서나 같은 성향 */
  contextSpread?: number;
};

/** 한 사람의 가상 응답 — 성향(잠재값)과 소음에서 선택지를 고른다 */
export function simulateAnswers(theta: Record<PerspectiveId, number>, o: Pick<SimOptions, "consistency" | "naRate" | "contextSpread">, rand: () => number): DraftAnswers {
  const answers: DraftAnswers = {};
  for (const item of DRAFT_ITEMS) {
    if (rand() < o.naRate) {
      answers[item.id] = "na";
      continue;
    }
    let best = item.options[0];
    let bestU = -Infinity;
    // 이 문항의 상황에서 각 관점의 성향이 얼마나 달라지는지 (문항마다 한 번 정한다)
    const shift = {} as Record<PerspectiveId, number>;
    for (const p of PERSPECTIVE_IDS) shift[p] = o.contextSpread ? o.contextSpread * gaussian(rand) : 0;
    for (const opt of item.options) {
      let u = 0;
      for (const [p, w] of Object.entries(opt.w)) u += (w as number) * (theta[p as PerspectiveId] + shift[p as PerspectiveId]);
      const noisy = o.consistency * u + gumbel(rand);
      if (noisy > bestU) {
        bestU = noisy;
        best = opt;
      }
    }
    answers[item.id] = best.id;
  }
  return answers;
}

function pearson(x: number[], y: number[]) {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** 스피어만-브라운: 지금 지표 k개에서 재응답 상관이 r일 때, 목표 상관에 필요한 지표 수 */
export function indicatorsNeeded(k: number, r: number, target: number) {
  if (r <= 0 || r >= 1) return Number.POSITIVE_INFINITY;
  return (k * target * (1 - r)) / (r * (1 - target));
}

export type PerspectiveReport = {
  id: PerspectiveId;
  name: string;
  /** 문항 구조상 이 관점에 점수를 주는 문항 수 */
  indicators: number;
  /** 평균으로 실제 응답된 지표 수 (해당 없음 제외) */
  answeredMean: number;
  /** 점수와 가상 성향(잠재값)의 상관 */
  scoreVsTrait: number;
  /** 같은 사람이 다시 답했을 때 두 점수의 상관 */
  retestCorrelation: number;
  /** 두 번 모두 방향이 나온 사람 중 방향이 같은 몫 */
  directionAgree: number;
  /** 높음 · 고르게 · 낮음 세 구분이 두 번 모두 같은 몫 */
  classAgree: number;
  /** 점수가 보류(지표 부족)인 몫 */
  holdRate: number;
  /** "상황에 따라 다름" 표시가 붙는 몫 — 가상 사람은 한 방향의 성향만 가지므로, 이 표시는 소음에서 나온 것이다 */
  situationalRate: number;
  /** 재응답 상관 0.7 · 0.8에 필요한 지표 수 */
  neededFor70: number;
  neededFor80: number;
};

export type SimReport = {
  options: SimOptions;
  perspectives: PerspectiveReport[];
  /** 대표 경향 12유형이 쓰는 7개 관점의 세 구분이 모두 두 번 같게 나온 몫 */
  sevenAllSame: number;
  /** 같은 7개 중 6개 이상이 같게 나온 몫 */
  sevenAtLeastSix: number;
  /** 7개 관점을 "가운데보다 높음 / 낮음" 두 방향으로만 나눴을 때 7개 모두 두 번 같은 몫 (구분 "고르게"를 두지 않는 가장 너그러운 기준) */
  sevenSignAll: number;
  /** 두 번 모두 7개 관점 중 4개 이상이 "뚜렷"인 사람의 몫 */
  fourClearBoth: number;
  /**
   * 관점끼리 점수가 얼마나 같이 움직이는가. 가상 응답자의 성향은 관점끼리 독립이므로, 여기 나오는 상관은 전부
   * 문항 구조(한 문항이 두 관점에 함께 점수를 줌)에서 생긴 것이다. 실제 사람 응답에서 이보다 큰 상관은 사람의 특성일 수 있다.
   */
  crossCorrelation: { meanAbs: number; max: { a: PerspectiveId; b: PerspectiveId; r: number }; pairsAbove03: number; pairs: number };
};

const classOf = (r: PerspectiveResult) => (r.status === "hold" ? "hold" : r.direction);

export function runSimulation(opts: SimOptions): SimReport {
  const rand = makeRandom(opts.seed);
  const typeP = PERSPECTIVE_IDS.filter((p) => PERSPECTIVES[p].usedByTypes);
  const allA: Record<string, number[]> = {};
  const scoreA: Record<string, number[]> = {};
  const scoreB: Record<string, number[]> = {};
  const trait: Record<string, number[]> = {};
  for (const p of PERSPECTIVE_IDS) {
    allA[p] = [];
    scoreA[p] = [];
    scoreB[p] = [];
    trait[p] = [];
  }
  const agree: Record<string, { both: number; same: number; classSame: number; hold: number; situ: number; answered: number }> = {};
  for (const p of PERSPECTIVE_IDS) agree[p] = { both: 0, same: 0, classSame: 0, hold: 0, situ: 0, answered: 0 };
  let sevenAll = 0;
  let sevenSix = 0;
  let sevenSign = 0;
  let fourClear = 0;

  for (let i = 0; i < opts.people; i++) {
    const theta = Object.fromEntries(PERSPECTIVE_IDS.map((p) => [p, gaussian(rand)])) as Record<PerspectiveId, number>;
    const a = scoreDraft(simulateAnswers(theta, opts, rand));
    const b = scoreDraft(simulateAnswers(theta, opts, rand));
    for (const p of PERSPECTIVE_IDS) {
      const ra = a.perspectives[p];
      allA[p].push(ra.status === "ok" ? ra.score : Number.NaN);
    }
    let same = 0;
    let signSame = 0;
    let clearA = 0;
    let clearB = 0;
    for (const p of PERSPECTIVE_IDS) {
      const ra = a.perspectives[p];
      const rb = b.perspectives[p];
      const g = agree[p];
      if (ra.status === "hold") g.hold++;
      if (rb.status === "hold") g.hold++;
      if (ra.status === "ok") {
        g.answered += ra.answered;
        if (ra.situational) g.situ++;
      }
      if (rb.status === "ok") {
        g.answered += rb.answered;
        if (rb.situational) g.situ++;
      }
      if (ra.status === "ok" && rb.status === "ok") {
        scoreA[p].push(ra.score);
        scoreB[p].push(rb.score);
        trait[p].push(theta[p]);
        if (ra.direction !== "even" && rb.direction !== "even") {
          g.both++;
          if (ra.direction === rb.direction) g.same++;
        }
      }
      if (classOf(ra) === classOf(rb)) {
        g.classSame++;
        if (typeP.includes(p)) same++;
      }
      if (typeP.includes(p)) {
        if (ra.status === "ok" && rb.status === "ok" && ra.score !== 50 && rb.score !== 50 && ra.score > 50 === rb.score > 50) signSame++;
        if (ra.status === "ok" && ra.strength === "clear") clearA++;
        if (rb.status === "ok" && rb.strength === "clear") clearB++;
      }
    }
    if (same === typeP.length) sevenAll++;
    if (same >= typeP.length - 1) sevenSix++;
    if (signSame === typeP.length) sevenSign++;
    if (clearA >= 4 && clearB >= 4) fourClear++;
  }

  const counts = indicatorCounts();
  const perspectives: PerspectiveReport[] = PERSPECTIVE_IDS.map((p) => {
    const g = agree[p];
    const retest = pearson(scoreA[p], scoreB[p]);
    const k = g.answered / Math.max(1, 2 * opts.people - g.hold);
    return {
      id: p,
      name: PERSPECTIVES[p].name,
      indicators: counts[p],
      answeredMean: k,
      scoreVsTrait: (pearson(scoreA[p], trait[p]) + pearson(scoreB[p], trait[p])) / 2,
      retestCorrelation: retest,
      directionAgree: g.both ? g.same / g.both : 0,
      classAgree: g.classSame / opts.people,
      holdRate: g.hold / (2 * opts.people),
      situationalRate: g.situ / (2 * opts.people),
      neededFor70: indicatorsNeeded(k, retest, 0.7),
      neededFor80: indicatorsNeeded(k, retest, 0.8),
    };
  });
  const cross: number[] = [];
  let max = { a: PERSPECTIVE_IDS[0], b: PERSPECTIVE_IDS[1], r: 0 };
  for (let i = 0; i < PERSPECTIVE_IDS.length; i++) {
    for (let j = i + 1; j < PERSPECTIVE_IDS.length; j++) {
      const x: number[] = [];
      const y: number[] = [];
      for (let k = 0; k < opts.people; k++) {
        const u = allA[PERSPECTIVE_IDS[i]][k];
        const v = allA[PERSPECTIVE_IDS[j]][k];
        if (!Number.isNaN(u) && !Number.isNaN(v)) {
          x.push(u);
          y.push(v);
        }
      }
      const r = pearson(x, y);
      cross.push(Math.abs(r));
      if (Math.abs(r) > Math.abs(max.r)) max = { a: PERSPECTIVE_IDS[i], b: PERSPECTIVE_IDS[j], r };
    }
  }
  return {
    options: opts,
    perspectives,
    crossCorrelation: { meanAbs: cross.reduce((n, v) => n + v, 0) / cross.length, max, pairsAbove03: cross.filter((v) => v >= 0.3).length, pairs: cross.length },
    sevenAllSame: sevenAll / opts.people,
    sevenAtLeastSix: sevenSix / opts.people,
    sevenSignAll: sevenSign / opts.people,
    fourClearBoth: fourClear / opts.people,
  };
}

export type SituationalCalibration = {
  rule: SituationalRule;
  /** 어느 상황에서나 같은 성향인 사람에게 "상황에 따라 다름"이 붙는 몫 (오탐 — 낮을수록 좋다) */
  falseFlag: number;
  /** 상황에 따라 성향이 실제로 달라지는 사람에게 붙는 몫 (탐지 — 높을수록 좋다) */
  detected: number;
  /** 관점별 오탐 중 가장 높은 값 */
  worstFalseFlag: number;
};

/** "상황에 따라 다름" 표시 규칙을 가상 응답으로 시험한다 — 같은 성향 vs 상황에 따라 달라지는 성향 */
export function calibrateSituational(base: Omit<SimOptions, "contextSpread">, rules: SituationalRule[], contextSpread = 1): SituationalCalibration[] {
  const run = (spread: number) => {
    const rand = makeRandom(base.seed + (spread ? 7 : 0));
    const hits = rules.map(() => PERSPECTIVE_IDS.map(() => 0));
    let n = 0;
    for (let i = 0; i < base.people; i++) {
      const theta = Object.fromEntries(PERSPECTIVE_IDS.map((p) => [p, gaussian(rand)])) as Record<PerspectiveId, number>;
      const answers = simulateAnswers(theta, { ...base, contextSpread: spread }, rand);
      n++;
      PERSPECTIVE_IDS.forEach((p, pi) => {
        const values: number[] = [];
        for (const item of DRAFT_ITEMS) {
          const a = answers[item.id];
          if (!a || a === "na") continue;
          const c = contribution(item, a, p);
          if (c !== null) values.push(c);
        }
        if (values.length < 3) return;
        rules.forEach((r, ri) => {
          if (isSituational(values, r)) hits[ri][pi]++;
        });
      });
    }
    return hits.map((byP) => ({ mean: byP.reduce((s, v) => s + v, 0) / (n * PERSPECTIVE_IDS.length), worst: Math.max(...byP) / n }));
  };
  const same = run(0);
  const varied = run(contextSpread);
  return rules.map((rule, i) => ({ rule, falseFlag: same[i].mean, detected: varied[i].mean, worstFalseFlag: same[i].worst }));
}
