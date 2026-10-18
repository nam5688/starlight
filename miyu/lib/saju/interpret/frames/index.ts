// 명리 조합 해석 엔진(1단계) — 연애 · 재물 · 과거 회고. 만세력 계산 위에 얹는 별도 계층이며 계산 엔진은 바꾸지 않는다.
//   계산 → 프레임 평가(`evaluateFrames`) → 이야기 선택(`selectStories`) → 읽기 카드(`buildCards`) + AI 근거(`frameEvidenceOf`, story-7 형식에만 연결 — 운영자 2026-10-18)
import type { SajuOk } from "../../engine.ts";
import type { Evidence } from "../../../report/evidence.ts";
import { buildCards, type CardSet } from "./cards.ts";
import { buildFrameContext, type ContextOptions } from "./context.ts";
import { frameEvidenceOf } from "./evidence.ts";
import { evaluateFrames, selectStories, type Evaluation, type Selection } from "./select.ts";
import type { FrameContext } from "./types.ts";

export { FRAME_BY_ID, FRAME_HIT_RATE, FRAMES } from "./catalog.ts";
export { buildCards, renderCard } from "./cards.ts";
export type { CardSet, CardTrace, ReadingCard } from "./cards.ts";
export { baseEvidenceOf, forAudience, pastLuckOf } from "./base.ts";
export { buildFrameContext, surveyAxesOf } from "./context.ts";
export { DATA_NOTES } from "./data.ts";
export type { DataNote, Mark } from "./data.ts";
export { audienceEvidence, AXIS_LABEL, frameEvidenceOf, RESPONSE_MARK } from "./evidence.ts";
export { evaluateFrames, heldReasonOf, leadFaceOf, responseLinkOf, selectStories } from "./select.ts";
export type { Evaluation, Selection } from "./select.ts";
export * from "./types.ts";

/** 한 번에: 계산 결과 → 카드(근거 추적 포함) + AI 근거 */
export function frameCardsOf(saju: SajuOk, opts: ContextOptions): { ctx: FrameContext; evaluation: Evaluation; selection: Selection; cards: CardSet; evidence: Evidence[] } {
  const ctx = buildFrameContext(saju, opts);
  const evaluation = evaluateFrames(ctx);
  const selection = selectStories(ctx, evaluation);
  return { ctx, evaluation, selection, cards: buildCards(ctx, selection), evidence: frameEvidenceOf(ctx, selection) };
}

/** AI 근거 목록에 더할 프레임 근거만 필요할 때(story-7 생성) */
export function frameEvidenceFor(saju: SajuOk, opts: ContextOptions): Evidence[] {
  return frameCardsOf(saju, opts).evidence;
}
