// 대표 경향 분류 — 개발용 임시 규칙.
// 유형 이름은 후보이며 분류 규칙은 확정되지 않았다. 운영 전 기준을 다시 정한다.
// 사주는 이 계산에 넣지 않는다 (심리검사 점수와 합산 금지).

export type TendencyId = "reassurance" | "distance" | "stability" | "exploration";

export const TENDENCY_NAMES: Record<TendencyId, string> = {
  reassurance: "확인추구형",
  distance: "거리유지형",
  stability: "안정지향형",
  exploration: "탐색지향형",
};

/** 점수가 같을 때 앞에 있는 것을 고른다 */
const TIE_ORDER: TendencyId[] = ["reassurance", "distance", "stability", "exploration"];

export type TendencySignals = Record<TendencyId, number>;

/**
 * temperament: novelty · caution 점수, relationship: anxiety · avoidance 점수를 받는다.
 * 각 후보의 신호값을 계산해 가장 큰 쪽을 대표 경향으로 고른다.
 */
export function classifyTendency(
  temperament: Record<string, number>,
  relationship: Record<string, number>,
): { id: TendencyId; signals: TendencySignals } {
  const signals: TendencySignals = {
    reassurance: relationship.anxiety,
    distance: relationship.avoidance,
    stability: (temperament.caution + (100 - temperament.novelty)) / 2,
    exploration: (temperament.novelty + (100 - temperament.caution)) / 2,
  };
  let best: TendencyId = TIE_ORDER[0];
  for (const id of TIE_ORDER) {
    if (signals[id] > signals[best]) best = id;
  }
  return { id: best, signals };
}
