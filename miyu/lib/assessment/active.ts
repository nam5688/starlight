// 질문 버전별 응답 검증과 무료 요약 만들기의 단일 입구 — 화면이 보여 주는 질문은 하나이지만(lib/config/product.ts의 ASSESSMENT.active),
// 서버는 응답의 키로 어떤 질문에 답한 것인지 알아보고 그 버전의 규칙으로 처리한다(저장 중이던 예전 22문항 응답도 같은 규칙으로 저장되고, 이미 저장된 결과는 바뀌지 않는다).
//  · 상황형 28문항: 키 s01~s28, 값 1~4 — 장면을 가로로 읽는다(점수 환산 없음).
//  · 예전 22문항: 키 m1.. · t1.. · r1.., 값 1~5 — 점수 환산 규칙 그대로.
// 두 질문의 응답을 서로 환산하지 않는다.
import { buildDevFreeSummary } from "../report/build-free-summary.ts";
import type { FreeSummary } from "../report/types.ts";
import { ASSESSMENT_MODULES } from "./modules/index.ts";
import { validateAnswers } from "./scoring.ts";
import { answerVersionOf, buildSituationalFreeSummary, pickKnownSceneAnswers, validateSceneAnswers } from "./situational/summary.ts";
import type { Answers } from "./types.ts";

export type AssessmentVersion = "situational-28" | "likert-22";

export type SummarizeResult = { ok: true; version: AssessmentVersion; answers: Answers; summary: FreeSummary } | { ok: false; message: string };

export const MISSING_ANSWER_MESSAGE = "답하지 않았거나 올바르지 않은 문항이 있어요. 응답을 다시 확인해 주세요.";

/**
 * 응답을 검증하고(모든 문항에 허용된 값) 알려진 문항의 응답만 남겨 그 버전의 무료 요약을 만든다.
 * strict면 모르는 키가 섞인 응답도 거절한다(브라우저가 보낸 값 — 저장 단계는 모르는 키를 버리고 처음부터 있던 방식 그대로 받아들인다).
 */
export function summarizeAnswers(raw: Answers, opts: { strict?: boolean } = {}): SummarizeResult {
  const version = answerVersionOf(raw);
  if (version === "situational-28") {
    const answers = pickKnownSceneAnswers(raw);
    if (!validateSceneAnswers(opts.strict ? raw : answers).ok) return { ok: false, message: MISSING_ANSWER_MESSAGE };
    return { ok: true, version, answers, summary: buildSituationalFreeSummary(answers) };
  }
  if (version === "likert-22") {
    const known = new Set(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => i.id)));
    const answers: Answers = {};
    for (const [id, v] of Object.entries(raw)) if (known.has(id)) answers[id] = v;
    if (!validateAnswers(ASSESSMENT_MODULES, opts.strict ? raw : answers).ok) return { ok: false, message: MISSING_ANSWER_MESSAGE };
    return { ok: true, version, answers, summary: buildDevFreeSummary(answers) };
  }
  return { ok: false, message: MISSING_ANSWER_MESSAGE };
}
