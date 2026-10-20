// 리포트에 함께 저장하는 규칙 기반 구성 요소 — 원국 쉬운 풀이 · 개인 질문과 답 · 상황별 잘하는 점/주의할 점 · 어울리는 관계 조건 · 보완 아이템.
// AI 생성기를 쓰든 개발용 규칙 생성기를 쓰든 같은 방식으로 만들고, 구매한 리포트에는 만든 시점의 내용을 저장한다
// (규칙 문구가 나중에 바뀌어도 구매한 리포트는 그대로).

import { itemSuggestions, type ItemSuggestions } from "../saju/items.ts";
import { sajuEvidence, spousePalace } from "../saju/interpret/rules.ts";
import { plainSajuReading, type PlainReading } from "../saju/plain.ts";
import type { SajuResult } from "../saju/engine.ts";
import { situationsOf, starterActionsOf } from "../assessment/situational/summary.ts";
import { buildPartnerConditions, type PartnerConditions } from "./partner.ts";
import { personalQuestions, type PersonalQA } from "./questions.ts";
import { buildSituations, type Situation } from "./situations.ts";
import { STARTER_ACTIONS, type StarterAction } from "./starter-actions.ts";
import type { FreeSummary } from "./types.ts";

export const EXTRAS_VERSION = "extras-0.1-draft";

export type ReportExtras = {
  version: string;
  /** 사주 계산 결과가 있을 때만 */
  plain: PlainReading | null;
  questions: PersonalQA[];
  situations: Situation[];
  partner: PartnerConditions | null;
  items: ItemSuggestions | null;
  /** 바로 해볼 실천 제안 3가지 (무료 미리보기는 첫 번째만) */
  starterActions: StarterAction[];
};

export function buildReportExtras(input: {
  summary: Pick<FreeSummary, "temperament" | "relationship" | "tendency" | "situational">;
  saju: SajuResult;
  reference: { year: number; month: number };
}): ReportExtras {
  // 상황형 28문항 결과는 점수 줄이 없다 — 상황별 · 실천 제안을 읽기 결과에서 만든다(22문항 결과와 예전 저장본은 그대로 점수 규칙)
  const sit = input.summary.situational;
  const situations = sit ? situationsOf(sit) : buildSituations(input.summary);
  const starterActions = sit ? starterActionsOf(sit) : STARTER_ACTIONS[input.summary.tendency.id];
  if (input.saju.status !== "ok") return { version: EXTRAS_VERSION, plain: null, questions: [], situations, partner: null, items: null, starterActions };

  const saju = input.saju;
  const evidence = sajuEvidence(saju, { reference: input.reference, gender: null });
  const palace = spousePalace(saju);
  return {
    version: EXTRAS_VERSION,
    plain: plainSajuReading(saju),
    questions: personalQuestions(evidence, { spouseGroup: palace.group }),
    situations,
    partner: buildPartnerConditions({ summary: input.summary, spouseGroup: palace.group, evidence }),
    items: itemSuggestions(saju),
    starterActions,
  };
}
