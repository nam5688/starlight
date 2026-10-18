// 명리 조합 해석 엔진(1단계) — 연애 · 재물 · 과거 회고. 만세력 계산 위에 얹는 별도 계층이며 계산 엔진은 바꾸지 않는다.
//   계산 → 프레임 평가(`evaluateFrames`) → 이야기 선택(`selectStories`) → 읽기 카드(`buildCards`) → [AI 근거로 변환 `cardsToEvidence` — 아직 연결 안 함]
import type { SajuOk } from "../../engine.ts";
import { buildCards, type CardSet } from "./cards.ts";
import { buildFrameContext, type ContextOptions } from "./context.ts";
import { evaluateFrames, selectStories, type Evaluation, type Selection } from "./select.ts";
import type { FrameContext } from "./types.ts";

export { FRAME_BY_ID, FRAME_HIT_RATE, FRAMES } from "./catalog.ts";
export { buildCards, renderCard } from "./cards.ts";
export type { CardSet, CardTrace, ReadingCard } from "./cards.ts";
export { buildFrameContext, surveyAxesOf } from "./context.ts";
export { cardsToEvidence } from "./evidence.ts";
export { DATA_NOTES } from "./data.ts";
export type { DataNote, Mark } from "./data.ts";
export { evaluateFrames, leadFaceOf, responseLinkOf, selectStories } from "./select.ts";
export type { Evaluation, Selection } from "./select.ts";
export * from "./types.ts";

/** 한 번에: 계산 결과 → 카드(근거 추적 포함) */
export function frameCardsOf(saju: SajuOk, opts: ContextOptions): { ctx: FrameContext; evaluation: Evaluation; selection: Selection; cards: CardSet } {
  const ctx = buildFrameContext(saju, opts);
  const evaluation = evaluateFrames(ctx);
  const selection = selectStories(ctx, evaluation);
  return { ctx, evaluation, selection, cards: buildCards(ctx, selection) };
}
