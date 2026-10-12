// 대표 경향 v2 — 12가지 일상 반응 유형 + 가까운 관계 방식 4가지 (설계 초안).
// 아직 화면 · 저장에 연결하지 않는다. 새 상황형 문항(7개 관점)이 생기면 연결한다.
//
// 원칙
// - 설문 응답만으로 분류한다. 사주는 이 계산에 넣지 않는다 (합산 금지 — 사주는 리포트에서 따로 근거로 쓴다).
// - 유형은 화면용 요약이다. 리포트 본문은 개인별 근거(사주 · 관점별 응답 · 상황 문항 선택)로 쓴다.
// - 일상 반응(일 · 결정 · 새로운 상황)과 가까운 관계의 반응은 비교하지 않고 따로 분류한다.
//   (예전 규칙은 관계 불안 점수와 새로움 점수를 같은 줄에 놓고 비교했다)
// - 동점 · 경계 · 쏠림 없음은 그대로 알려 준다. 특정 유형을 우선하지 않는다.

/** 기질 4 + 성격 3 관점 (미유 자체 문항으로 측정 예정 — 공식 검사 이름 · 문항을 쓰지 않는다) */
export type GeneralDimension = "novelty" | "caution" | "sensitivity" | "persistence" | "direction" | "cooperation" | "meaning";
/** 가까운 관계 (애착) */
export type RelationDimension = "anxiety" | "avoidance";

export const DIMENSION_LABEL: Record<GeneralDimension | RelationDimension, string> = {
  novelty: "새로움에 끌리는 정도",
  caution: "위험을 대비하는 정도",
  sensitivity: "주변 반응에 움직이는 정도",
  persistence: "끝까지 이어가는 정도",
  direction: "스스로 방향을 정하는 정도",
  cooperation: "다른 사람에게 맞추는 정도",
  meaning: "의미 · 이유를 중시하는 정도",
  anxiety: "가까워질수록 확인하고 싶은 마음",
  avoidance: "가까워질수록 거리를 두고 싶은 마음",
};

export type TypeId =
  | "quick-try"
  | "prepared-explore"
  | "steady-keep"
  | "immerse-shift"
  | "long-haul"
  | "on-site"
  | "lead-coordinate"
  | "independent"
  | "recognition"
  | "harmony"
  | "meaning"
  | "practical";

type Pole = { dim: GeneralDimension; dir: 1 | -1; weight: number };

export type TypeDef = {
  id: TypeId;
  name: string;
  /** 한 줄 요약 — 좋고 나쁨이 아니라 방향 */
  summary: string;
  signature: Pole[];
};

const p = (dim: GeneralDimension, dir: 1 | -1, weight = 1): Pole => ({ dim, dir, weight });

export const TYPE_DEFS: TypeDef[] = [
  { id: "quick-try", name: "빠른시도형", summary: "새로운 일을 해 보면서 배우고, 준비보다 시작이 빠르다", signature: [p("novelty", 1), p("caution", -1)] },
  { id: "prepared-explore", name: "준비탐색형", summary: "새로운 것에 끌리지만, 충분히 알아본 뒤에 움직인다", signature: [p("novelty", 1), p("caution", 1)] },
  { id: "steady-keep", name: "안정유지형", summary: "검증된 방식을 지키고, 바꿀 이유가 분명할 때만 바꾼다", signature: [p("novelty", -1), p("caution", 1)] },
  { id: "immerse-shift", name: "몰입전환형", summary: "흥미가 생기면 깊게 빠지고, 흥미가 식으면 다음으로 옮긴다", signature: [p("novelty", 1), p("persistence", -1)] },
  { id: "long-haul", name: "꾸준완주형", summary: "반응이 없어도 정한 일을 오래 이어 간다", signature: [p("persistence", 1), p("sensitivity", -1)] },
  { id: "on-site", name: "현장대응형", summary: "변수가 생겨도 덜 흔들리고, 그 자리에서 판단해 대응한다", signature: [p("caution", -1), p("sensitivity", -1)] },
  { id: "lead-coordinate", name: "주도조율형", summary: "방향을 먼저 정하되, 사람들의 의견을 모아 함께 끌고 간다", signature: [p("direction", 1), p("cooperation", 1)] },
  { id: "independent", name: "독립판단형", summary: "다른 사람의 기대보다 자기 기준으로 판단하고 결정한다", signature: [p("direction", 1), p("cooperation", -1)] },
  { id: "recognition", name: "인정동기형", summary: "주변의 반응과 인정이 의욕과 방향을 크게 움직인다", signature: [p("sensitivity", 1), p("direction", -1)] },
  { id: "harmony", name: "조화배려형", summary: "내 기준보다 관계와 분위기를 먼저 맞춘다", signature: [p("cooperation", 1), p("direction", -1)] },
  { id: "meaning", name: "의미추구형", summary: "이유와 의미가 납득되어야 움직이고, 납득되면 오래 간다", signature: [p("meaning", 1)] },
  { id: "practical", name: "현실실용형", summary: "명분보다 지금의 쓸모와 결과로 판단한다", signature: [p("meaning", -1)] },
];

export type RelationId = "secure" | "reassurance" | "distance" | "careful";

export const RELATION_DEFS: Record<RelationId, { name: string; summary: string }> = {
  secure: { name: "편안한 연결", summary: "가까운 관계에서도 확인이나 거리 두기가 크게 늘지 않는다" },
  reassurance: { name: "확인추구", summary: "가까워질수록 상대의 마음을 확인하고 싶어진다" },
  distance: { name: "거리유지", summary: "가까워질수록 혼자만의 시간과 거리가 필요해진다" },
  careful: { name: "관계신중", summary: "가까워지고 싶은 마음과 거리를 두고 싶은 마음이 함께 있어, 확실한 신호를 기다린다" },
};

export const TENDENCY_V2_VERSION = "types12-draft-0.1";

/** 분류 기준값 — 시범 응답(운영 전)으로 다시 맞춘다 */
export const THRESHOLDS = {
  /** 이보다 낮으면 "뚜렷한 쏠림 없음" (한 관점만 보는 유형 기준 약 68점, 두 관점 유형은 두 관점 모두 약 63점) */
  clear: 0.36,
  /** 1 · 2위 차이가 이보다 작으면 "경계" — 두 유형을 함께 보여 준다 */
  boundary: 0.08,
  /** 보조 경향으로 보여 줄 최소값 */
  secondary: 0.24,
  /** 관계 방식: 이 점수 이상이면 그 마음이 뚜렷한 것으로 본다 */
  relationHigh: 60,
  /** 관계 방식: 두 점수가 모두 이보다 낮으면 편안한 연결 */
  relationLow: 50,
};

export type GeneralScores = Partial<Record<GeneralDimension, number>>;
export type RelationScores = Partial<Record<RelationDimension, number>>;

export type TypeMatch = { id: TypeId; name: string; match: number };

export type SharedPole = { dim: GeneralDimension; dir: 1 | -1; label: string };

export type GeneralResult =
  /** 응답 품질 문제(모두 같은 답 등) 또는 필요한 관점 점수가 없음 */
  | { status: "insufficient"; reason: string }
  /** 한쪽으로 뚜렷하게 기울지 않음 — 유형 이름을 붙이지 않고 약한 경향만 보여 준다 */
  | { status: "flat"; leaning: TypeMatch[] }
  /**
   * 1위와 거의 같은 유형이 있음 — 함께 보여 준다 (순서는 우선순위가 아님).
   * 셋 이상이 같은 관점 하나 때문에 묶이면(shared) 유형 대신 그 관점을 대표로 보여 준다.
   */
  | { status: "boundary"; group: TypeMatch[]; shared: SharedPole | null; ranking: TypeMatch[] }
  | { status: "clear"; primary: TypeMatch; secondary: TypeMatch | null; ranking: TypeMatch[] };

export type RelationResult = { status: "insufficient" } | { status: "flat" } | { status: "clear"; id: RelationId; name: string };

const z = (score: number) => (Math.min(100, Math.max(0, score)) - 50) / 50;

/**
 * 유형 일치도: 유형의 방향(서명)으로 응답을 투영한 값.
 * - 관점 수가 다른 유형끼리 공정하게 비교되도록 가중치 길이로 나눈다
 * - 반대 방향으로 나온 관점이 있으면 그만큼 깎는다 (둘 다 맞아야 높게)
 */
export function typeMatch(def: TypeDef, scores: GeneralScores): number | null {
  let dot = 0;
  let penalty = 0;
  let norm = 0;
  for (const pole of def.signature) {
    const s = scores[pole.dim];
    if (s === undefined) return null;
    const c = pole.dir * z(s);
    dot += pole.weight * c;
    if (c < 0) penalty += pole.weight * -c;
    norm += pole.weight ** 2;
  }
  return (dot - penalty) / Math.sqrt(norm);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function classifyGeneral(scores: GeneralScores, opts: { straightLined?: boolean } = {}): GeneralResult {
  if (opts.straightLined) return { status: "insufficient", reason: "모든 문항에 같은 답을 골라 경향을 판단하지 않았습니다." };
  const ranking: TypeMatch[] = [];
  for (const def of TYPE_DEFS) {
    const m = typeMatch(def, scores);
    if (m === null) return { status: "insufficient", reason: `${def.name}을 판단할 관점 점수가 없습니다.` };
    ranking.push({ id: def.id, name: def.name, match: round(m) });
  }
  // 정렬: 일치도 → 같으면 가장 뚜렷한 한 관점의 크기 → 그래도 같으면 이름순 (어느 쪽도 우선하지 않도록 경계로 표시된다)
  const peak = (id: TypeId) =>
    Math.max(...TYPE_DEFS.find((d) => d.id === id)!.signature.map((pole) => pole.dir * z(scores[pole.dim]!)));
  ranking.sort((a, b) => b.match - a.match || peak(b.id) - peak(a.id) || a.name.localeCompare(b.name, "ko"));

  const [first] = ranking;
  if (first.match < THRESHOLDS.clear) return { status: "flat", leaning: ranking.filter((r) => r.match > 0).slice(0, 2) };

  const group = ranking.filter((r) => first.match - r.match < THRESHOLDS.boundary);
  if (group.length >= 2) return { status: "boundary", group, shared: group.length >= 3 ? sharedPole(group) : null, ranking };

  // 보조 경향: 주된 유형과 겹치지 않는 관점이 실제로 기울어 있을 때만 (같은 관점을 다른 이름으로 반복하지 않게)
  const own = defOf(first.id).signature.map(poleKey);
  const secondary =
    ranking.slice(1).find((r) => {
      if (r.match < THRESHOLDS.secondary) return false;
      const extra = defOf(r.id).signature.filter((pole) => !own.includes(poleKey(pole)));
      return extra.length > 0 && extra.every((pole) => pole.dir * z(scores[pole.dim]!) >= 0.2);
    }) ?? null;
  return { status: "clear", primary: first, secondary, ranking };
}

const defOf = (id: TypeId) => TYPE_DEFS.find((d) => d.id === id)!;
const poleKey = (pole: Pole) => `${pole.dim}${pole.dir}`;

/** 묶인 유형이 모두 함께 쓰는 관점 하나 (예: 새로움만 높고 나머지는 보통) */
function sharedPole(group: TypeMatch[]): SharedPole | null {
  const [head, ...rest] = group.map((g) => defOf(g.id).signature);
  const common = head.find((pole) => rest.every((sig) => sig.some((q) => poleKey(q) === poleKey(pole))));
  return common ? { dim: common.dim, dir: common.dir, label: `${DIMENSION_LABEL[common.dim]}가 ${common.dir > 0 ? "높은" : "낮은"} 편` } : null;
}

export function classifyRelation(scores: RelationScores, opts: { straightLined?: boolean } = {}): RelationResult {
  const { anxiety, avoidance } = scores;
  if (opts.straightLined || anxiety === undefined || avoidance === undefined) return { status: "insufficient" };
  const hi = THRESHOLDS.relationHigh;
  const lo = THRESHOLDS.relationLow;
  const pick = (id: RelationId): RelationResult => ({ status: "clear", id, name: RELATION_DEFS[id].name });
  if (anxiety >= hi && avoidance >= hi) return pick("careful");
  if (anxiety >= hi && avoidance < hi) return pick("reassurance");
  if (avoidance >= hi && anxiety < hi) return pick("distance");
  if (anxiety < lo && avoidance < lo) return pick("secure");
  return { status: "flat" };
}
