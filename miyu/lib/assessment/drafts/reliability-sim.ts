// 미유 자체 성향 질문 초안 — "문항 구조가 허용하는 한계"를 가상 응답으로 재는 계산.
//
// 이것은 실제 사람의 응답이 아니다. 사람이 문항에 얼마나 일관되게 답하는지(아래 consistency)를 가정하고,
// 그 가정 아래에서 지금의 문항 · 채점 규칙이 만드는 결과가 얼마나 흔들리는지를 센다.
// 그러므로 "실제 신뢰도"가 아니라 "문항 구조가 허용하는 한계"다. 실제 값은 시범 응답으로 확인한다.
//
// 이 계산이 하지 못하는 것 (반드시 같이 읽는다)
// - 응답자는 "선택지에 적힌 점수 방향대로" 성향에서 선택지를 고른다고 가정한다. 그래서 같은 행동의 다른 이유(예: 불안해서 연락한 사람 vs
//   약속 때문에 연락한 사람)는 이 모델에 들어 있지 않다. 이유를 구분했는지는 사람에게 물어야만 알 수 있다 (시범 인터뷰).
// - 같은 응답자가 같은 기분으로 다시 답한다고 가정하므로(기억 · 상태 변화 없음), 실제 재응답 일치는 이보다 낮을 가능성이 크다.
// - 12유형 분류 일치율은 "분류 규칙이 점수의 흔들림을 얼마나 증폭하는가"이지, 유형이 맞는지(타당도)가 아니다.
//
// 0.1(동결본)과 0.2(현재 초안)를 같은 방식으로 잴 수 있게 SimDraft 묶음(versions.ts)을 받는다.
import { classifyGeneral, type GeneralDimension, type GeneralResult } from "../tendency-v2.ts";
import { DRAFT_V02, type SimDraft, type SimResult } from "./versions.ts";
import { isSituational, type DraftAnswers, type PerspectiveId, type SituationalRule } from "./situational-draft.ts";

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

/** 한 사람의 가상 응답 — 성향(잠재값)과 소음에서 선택지를 고른다. 선택지의 점수 방향(w)대로 성향이 선택에 영향을 준다고 가정한다 */
export function simulateAnswers(
  theta: Record<PerspectiveId, number>,
  o: Pick<SimOptions, "consistency" | "naRate" | "contextSpread">,
  rand: () => number,
  draft: SimDraft = DRAFT_V02,
): DraftAnswers {
  const answers: DraftAnswers = {};
  for (const item of draft.items) {
    if (rand() < o.naRate) {
      answers[item.id] = "na";
      continue;
    }
    let best = item.options[0];
    let bestU = -Infinity;
    // 이 문항의 상황에서 각 관점의 성향이 얼마나 달라지는지 (문항마다 한 번 정한다)
    const shift = {} as Record<PerspectiveId, number>;
    for (const p of draft.ids) shift[p] = o.contextSpread ? o.contextSpread * gaussian(rand) : 0;
    for (const opt of item.options) {
      let u = 0;
      for (const [p, w] of Object.entries(opt.w)) u += (w as number) * (theta[p as PerspectiveId] + shift[p as PerspectiveId]);
      const noisy = o.consistency * u + gumbel(rand);
      if (noisy > bestU) {
        bestU = noisy;
        best = opt;
      }
    }
    answers[item.id] = best.id as DraftAnswers[string];
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

/** 스피어만-브라운: 지금 지표 k개에서 재응답 상관이 r일 때, 목표 상관에 필요한 지표 수 (지표들이 서로 독립적으로 같은 성향을 잰다는 가정 — 0.1처럼 같은 문항이 여러 관점에 들어가면 이 가정이 깨진다) */
export function indicatorsNeeded(k: number, r: number, target: number) {
  if (r <= 0 || r >= 1) return Number.POSITIVE_INFINITY;
  return (k * target * (1 - r)) / (r * (1 - target));
}

/** 문항 · 지표 구조 — "문항 30개 = 지표 30개"가 아니었다는 것을 숫자로 보여 준다 */
export type StructureReport = {
  version: string;
  items: number;
  /** (문항, 관점) 쌍의 수 — 선택지가 점수를 주는 관점마다 하나 */
  indicators: number;
  /** 점수를 주는 관점이 1개 · 2개 · 3개 이상인 문항 수 */
  itemsByPerspectiveCount: { one: number; two: number; threePlus: number };
  maxPerspectivesPerItem: number;
  /** 같은 문항을 함께 쓰는 관점 쌍의 수와 가장 많이 공유하는 쌍 */
  sharedPairs: number;
  topShared: { a: PerspectiveId; b: PerspectiveId; items: number }[];
  /** 관점별 지표 수 */
  perPerspective: Record<PerspectiveId, number>;
  /** 지표가 가장 적은 관점의 수 */
  minIndicators: number;
  /** 서로 다른 문항 3개 이상이 그 관점을 보는 관점 (읽을 수 있는 관점) — 이 수는 문항 하나가 여러 관점에 점수를 줘도 "문항 기준"으로 센다 */
  readableByDistinctItems: PerspectiveId[];
};

export function describeStructure(draft: SimDraft = DRAFT_V02): StructureReport {
  const touched = draft.items.map((it) => [...new Set(it.options.flatMap((o) => Object.keys(o.w) as PerspectiveId[]))]);
  const pairCount = new Map<string, number>();
  for (const ps of touched) {
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const key = [ps[i], ps[j]].sort().join("-");
      pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
    }
  }
  const perPerspective = draft.indicatorCounts();
  const top = [...pairCount.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
    .map(([k, n]) => ({ a: k.split("-")[0] as PerspectiveId, b: k.split("-")[1] as PerspectiveId, items: n }));
  return {
    version: draft.version,
    items: draft.items.length,
    indicators: touched.reduce((n, ps) => n + ps.length, 0),
    itemsByPerspectiveCount: {
      one: touched.filter((ps) => ps.length === 1).length,
      two: touched.filter((ps) => ps.length === 2).length,
      threePlus: touched.filter((ps) => ps.length >= 3).length,
    },
    maxPerspectivesPerItem: Math.max(...touched.map((ps) => ps.length)),
    sharedPairs: pairCount.size,
    topShared: top,
    perPerspective,
    minIndicators: Math.min(...draft.ids.map((p) => perPerspective[p])),
    readableByDistinctItems: draft.ids.filter((p) => perPerspective[p] >= 3),
  };
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
  /** 두 번 모두 뚜렷한 방향이 나온 사람 중 방향이 같은 몫 */
  directionAgree: number;
  /** 판독(뚜렷한 높음 · 뚜렷한 낮음 · 뚜렷하지 않음 · 보류)이 두 번 모두 같은 몫 */
  readingAgree: number;
  /** 점수가 보류(지표 부족)인 몫 */
  holdRate: number;
  /** 점수는 나왔지만 "현재 응답만으로 뚜렷하지 않음"인 몫 (보류 제외 전체 응답 중) — 리포트가 방향을 말하지 못하는 비율 */
  unclearRate: number;
  /** "상황에 따라 다름" 표시가 붙는 몫 — 가상 사람은 한 방향의 성향만 가지므로, 이 표시는 소음에서 나온 것이다 */
  situationalRate: number;
  /** 재응답 상관 0.7 · 0.8에 필요한 지표 수 */
  neededFor70: number;
  neededFor80: number;
};

/** 대표 경향 12유형 분류 규칙(tendency-v2)을 두 번의 응답에 실제로 적용한 결과의 일치 */
export type TypeAgreement = {
  /** 분류에 필요한 7개 관점이 모두 읽히는가 — 아니면 분류할 수 없고 아래 값은 의미가 없다 */
  computable: boolean;
  /** 7개 관점 중 읽을 수 있는 관점 수 */
  sevenReadable: number;
  /** 두 번 모두 같은 결과 (뚜렷 · 같은 주된 유형 / 경계 · 같은 묶음 / 쏠림 없음 / 판정 보류가 같은 칸) — 두 번 모두 "판정 보류"인 사람도 같은 것으로 센다 */
  sameResult: number;
  /** 두 번 모두 실제 결과(뚜렷 · 경계 · 쏠림 없음)가 나온 몫과, 그중 결과가 같은 몫 — 판정 보류를 일치로 세지 않은 값 */
  bothReal: number;
  sameGivenBothReal: number;
  /** 두 번 모두 "뚜렷"(주된 유형이 정해짐)인 몫과, 그중 주된 유형이 같은 몫 */
  bothClear: number;
  samePrimaryGivenBothClear: number;
  /** 첫 번째 결과의 주된 유형이 두 번째 결과의 주된 · 보조 · 경계 묶음 안에 있는 몫 */
  primaryInOther: number;
  /** 결과 구성 (두 번 합쳐서): 뚜렷 · 경계 · 쏠림 없음 · 판정 보류 */
  shares: { clear: number; boundary: number; flat: number; insufficient: number };
};

export type FlipBand = { people: number; flipped: number };

export type SimReport = {
  options: SimOptions;
  version: string;
  structure: StructureReport;
  perspectives: PerspectiveReport[];
  /** 대표 경향 12유형이 쓰는 7개 관점의 판독(뚜렷한 높음 · 뚜렷한 낮음 · 뚜렷하지 않음 · 보류)이 두 번 모두 같게 나온 몫 — 12유형 일치율이 아니다 (아래 typeAgreement가 따로 있다) */
  sevenReadingsAllSame: number;
  /** 7개 관점이 두 번 모두 점수가 나왔고 가운데(50)에서 위 · 아래 방향이 모두 같게 나온 몫 — 세기(뚜렷함)는 보지 않는다. 0.1을 처음 점검할 때 쓴 "7개 방향 전체 일치율"과 같은 값이다. 7개를 읽을 수 없는 문항 구성이면 null */
  sevenSignAllSame: number | null;
  typeAgreement: TypeAgreement;
  /**
   * 첫 번째 응답에서 가운데(50)와의 거리가 어느 구간이었을 때, 두 번째 응답에서 위 · 아래 방향이 뒤집힌 몫 (읽을 수 있는 모든 관점을 합쳐서).
   * 거리가 작을수록 다시 답했을 때 방향이 바뀌는 일이 많다는 것을 보여 준다 — "약간 ~한 편"처럼 방향을 붙이지 않는 근거.
   */
  directionFlip: { under10: FlipBand; from10to20: FlipBand; over20: FlipBand };
  /**
   * 관점끼리 점수가 얼마나 같이 움직이는가. 가상 응답자의 성향은 관점끼리 독립이므로, 여기 나오는 상관은 전부
   * 문항 구조(한 문항이 두 관점에 함께 점수를 줌)에서 생긴 것이다. 실제 사람 응답에서 이보다 큰 상관은 사람의 특성일 수 있다.
   */
  crossCorrelation: { meanAbs: number; max: { a: PerspectiveId; b: PerspectiveId; r: number }; pairsAbove03: number; pairs: number };
  /** 한 관점의 점수가 "다른 관점의" 성향과 얼마나 같이 움직이는가 (0에 가까울수록 다른 성향이 섞이지 않는다) */
  leak: { meanAbs: number; max: { score: PerspectiveId; trait: PerspectiveId; r: number } };
};

const readingOf = (r: SimResult) => (r.status === "hold" ? "hold" : r.reading);

const TYPE_DIMENSION: Partial<Record<PerspectiveId, GeneralDimension>> = { T1: "novelty", T2: "caution", T4: "sensitivity", T5: "persistence", C1: "direction", C3: "cooperation", C4: "meaning" };

function typeKey(r: GeneralResult): string {
  if (r.status === "clear") return `clear:${r.primary.id}`;
  if (r.status === "boundary") return `boundary:${r.group.map((g) => g.id).sort().join("+")}`;
  return r.status;
}
const typeSet = (r: GeneralResult): string[] => (r.status === "clear" ? [r.primary.id, ...(r.secondary ? [r.secondary.id] : [])] : r.status === "boundary" ? r.group.map((g) => g.id) : []);

export function runSimulation(opts: SimOptions, draft: SimDraft = DRAFT_V02): SimReport {
  const rand = makeRandom(opts.seed);
  const ids = draft.ids;
  const typeP = ids.filter((p) => draft.perspectives[p].usedByTypes);
  const allA: Record<string, number[]> = {};
  const scoreA: Record<string, number[]> = {};
  const scoreB: Record<string, number[]> = {};
  const trait: Record<string, number[]> = {};
  const traitAll: Record<string, number[]> = {};
  for (const p of ids) {
    allA[p] = [];
    scoreA[p] = [];
    scoreB[p] = [];
    trait[p] = [];
    traitAll[p] = [];
  }
  const agree: Record<string, { both: number; same: number; readingSame: number; hold: number; unclear: number; situ: number; answered: number }> = {};
  for (const p of ids) agree[p] = { both: 0, same: 0, readingSame: 0, hold: 0, unclear: 0, situ: 0, answered: 0 };
  let sevenAll = 0;
  let sevenSign = 0;
  const flip = { under10: { people: 0, flipped: 0 }, from10to20: { people: 0, flipped: 0 }, over20: { people: 0, flipped: 0 } };
  const type = { same: 0, bothReal: 0, sameReal: 0, clearBoth: 0, samePrimary: 0, primaryInOther: 0, clear: 0, boundary: 0, flat: 0, insufficient: 0 };

  for (let i = 0; i < opts.people; i++) {
    const theta = Object.fromEntries(ids.map((p) => [p, gaussian(rand)])) as Record<PerspectiveId, number>;
    const a = draft.score(simulateAnswers(theta, opts, rand, draft));
    const b = draft.score(simulateAnswers(theta, opts, rand, draft));
    for (const p of ids) {
      const ra = a[p];
      allA[p].push(ra.status === "ok" ? ra.score : Number.NaN);
      traitAll[p].push(theta[p]);
    }
    let sameSeven = 0;
    for (const p of ids) {
      const ra = a[p];
      const rb = b[p];
      const g = agree[p];
      if (ra.status === "hold") g.hold++;
      if (rb.status === "hold") g.hold++;
      if (ra.status === "ok") {
        g.answered += ra.answered;
        if (ra.situational) g.situ++;
        if (ra.reading === "unclear") g.unclear++;
      }
      if (rb.status === "ok") {
        g.answered += rb.answered;
        if (rb.situational) g.situ++;
        if (rb.reading === "unclear") g.unclear++;
      }
      if (ra.status === "ok" && rb.status === "ok") {
        const dist = Math.abs(ra.score - 50);
        const band = dist < 10 ? flip.under10 : dist < 20 ? flip.from10to20 : flip.over20;
        band.people++;
        if (rb.score !== 50 && ra.score > 50 !== rb.score > 50) band.flipped++;
        scoreA[p].push(ra.score);
        scoreB[p].push(rb.score);
        trait[p].push(theta[p]);
        if (ra.reading !== "unclear" && rb.reading !== "unclear") {
          g.both++;
          if (ra.reading === rb.reading) g.same++;
        }
      }
      if (readingOf(ra) === readingOf(rb)) {
        g.readingSame++;
        if (typeP.includes(p)) sameSeven++;
      }
    }
    if (sameSeven === typeP.length) sevenAll++;
    if (typeP.every((p) => a[p].status === "ok" && b[p].status === "ok" && (a[p].status === "ok" && b[p].status === "ok" ? (a[p] as { score: number }).score > 50 === (b[p] as { score: number }).score > 50 : false))) sevenSign++;

    // 12유형 분류 규칙을 두 번의 응답에 그대로 적용한다
    const classify = (r: Record<PerspectiveId, SimResult>) => {
      const g: Partial<Record<GeneralDimension, number>> = {};
      for (const p of typeP) {
        const dim = TYPE_DIMENSION[p];
        const x = r[p];
        if (dim && x.status === "ok") g[dim] = x.score;
      }
      return classifyGeneral(g);
    };
    const ta = classify(a);
    const tb = classify(b);
    if (typeKey(ta) === typeKey(tb)) type.same++;
    if (ta.status !== "insufficient" && tb.status !== "insufficient") {
      type.bothReal++;
      if (typeKey(ta) === typeKey(tb)) type.sameReal++;
    }
    for (const t of [ta, tb]) type[t.status === "clear" ? "clear" : t.status === "boundary" ? "boundary" : t.status === "flat" ? "flat" : "insufficient"]++;
    if (ta.status === "clear" && tb.status === "clear") {
      type.clearBoth++;
      if (ta.primary.id === tb.primary.id) type.samePrimary++;
    }
    if (ta.status === "clear" && typeSet(tb).includes(ta.primary.id)) type.primaryInOther++;
  }

  const counts = draft.indicatorCounts();
  const perspectives: PerspectiveReport[] = ids.map((p) => {
    const g = agree[p];
    const retest = pearson(scoreA[p], scoreB[p]);
    const k = g.answered / Math.max(1, 2 * opts.people - g.hold);
    return {
      id: p,
      name: draft.perspectives[p].name,
      indicators: counts[p],
      answeredMean: k,
      scoreVsTrait: (pearson(scoreA[p], trait[p]) + pearson(scoreB[p], trait[p])) / 2,
      retestCorrelation: retest,
      directionAgree: g.both ? g.same / g.both : 0,
      readingAgree: g.readingSame / opts.people,
      holdRate: g.hold / (2 * opts.people),
      unclearRate: g.unclear / Math.max(1, 2 * opts.people - g.hold),
      situationalRate: g.situ / (2 * opts.people),
      neededFor70: indicatorsNeeded(k, retest, 0.7),
      neededFor80: indicatorsNeeded(k, retest, 0.8),
    };
  });

  const cross: number[] = [];
  let max = { a: ids[0], b: ids[1], r: 0 };
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const x: number[] = [];
      const y: number[] = [];
      for (let k = 0; k < opts.people; k++) {
        const u = allA[ids[i]][k];
        const v = allA[ids[j]][k];
        if (!Number.isNaN(u) && !Number.isNaN(v)) {
          x.push(u);
          y.push(v);
        }
      }
      const r = pearson(x, y);
      if (Number.isNaN(r)) continue;
      cross.push(Math.abs(r));
      if (Math.abs(r) > Math.abs(max.r)) max = { a: ids[i], b: ids[j], r };
    }
  }

  // 다른 관점의 성향이 이 관점의 점수에 섞이는 정도
  const leaks: number[] = [];
  let leakMax = { score: ids[0], trait: ids[1], r: 0 };
  for (const s of ids) {
    for (const t of ids) {
      if (s === t) continue;
      const x: number[] = [];
      const y: number[] = [];
      for (let k = 0; k < opts.people; k++) {
        if (!Number.isNaN(allA[s][k])) {
          x.push(allA[s][k]);
          y.push(traitAll[t][k]);
        }
      }
      if (x.length < 30) continue;
      const r = pearson(x, y);
      if (Number.isNaN(r)) continue;
      leaks.push(Math.abs(r));
      if (Math.abs(r) > Math.abs(leakMax.r)) leakMax = { score: s, trait: t, r };
    }
  }

  const n2 = 2 * opts.people;
  const structure = describeStructure(draft);
  const computable = typeP.every((p) => counts[p] >= 3);
  return {
    options: opts,
    version: draft.version,
    structure,
    perspectives,
    crossCorrelation: { meanAbs: cross.length ? cross.reduce((n, v) => n + v, 0) / cross.length : 0, max, pairsAbove03: cross.filter((v) => v >= 0.3).length, pairs: cross.length },
    leak: { meanAbs: leaks.length ? leaks.reduce((n, v) => n + v, 0) / leaks.length : 0, max: leakMax },
    sevenReadingsAllSame: sevenAll / opts.people,
    directionFlip: flip,
    sevenSignAllSame: computable ? sevenSign / opts.people : null,
    typeAgreement: {
      computable,
      sevenReadable: typeP.filter((p) => counts[p] >= 3).length,
      sameResult: type.same / opts.people,
      bothReal: type.bothReal / opts.people,
      sameGivenBothReal: type.bothReal ? type.sameReal / type.bothReal : 0,
      bothClear: type.clearBoth / opts.people,
      samePrimaryGivenBothClear: type.clearBoth ? type.samePrimary / type.clearBoth : 0,
      primaryInOther: type.primaryInOther / opts.people,
      shares: { clear: type.clear / n2, boundary: type.boundary / n2, flat: type.flat / n2, insufficient: type.insufficient / n2 },
    },
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
export function calibrateSituational(base: Omit<SimOptions, "contextSpread">, rules: SituationalRule[], contextSpread = 1, draft: SimDraft = DRAFT_V02): SituationalCalibration[] {
  const run = (spread: number) => {
    const rand = makeRandom(base.seed + (spread ? 7 : 0));
    const hits = rules.map(() => draft.ids.map(() => 0));
    const evaluated = draft.ids.map(() => 0);
    for (let i = 0; i < base.people; i++) {
      const theta = Object.fromEntries(draft.ids.map((p) => [p, gaussian(rand)])) as Record<PerspectiveId, number>;
      const answers = simulateAnswers(theta, { ...base, contextSpread: spread }, rand, draft);
      draft.ids.forEach((p, pi) => {
        const values: number[] = [];
        for (const item of draft.items) {
          const a = answers[item.id];
          if (!a || a === "na") continue;
          const c = draft.contribution(item.id, a, p);
          if (c !== null) values.push(c);
        }
        if (values.length < 3) return;
        evaluated[pi]++;
        rules.forEach((r, ri) => {
          if (isSituational(values, r)) hits[ri][pi]++;
        });
      });
    }
    const total = evaluated.reduce((n, v) => n + v, 0);
    return hits.map((byP) => ({
      mean: total ? byP.reduce((s, v) => s + v, 0) / total : 0,
      worst: Math.max(...byP.map((h, pi) => (evaluated[pi] ? h / evaluated[pi] : 0))),
    }));
  };
  const same = run(0);
  const varied = run(contextSpread);
  return rules.map((rule, i) => ({ rule, falseFlag: same[i].mean, detected: varied[i].mean, worstFalseFlag: same[i].worst }));
}
