"use server";

import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { validateAnswers } from "@/lib/assessment/scoring";
import type { Answers } from "@/lib/assessment/types";
import { buildDevFreeSummary } from "@/lib/report/build-free-summary";
import type { FreeSummary } from "@/lib/report/types";

export type ScoreResult = { ok: true; summary: FreeSummary } | { ok: false; message: string };

/**
 * 검사 응답을 서버에서 채점해 무료 요약을 돌려준다.
 * 1단계: 개발용 예시 문항 + 임시 규칙. 응답은 저장하지 않고 로그에도 남기지 않는다.
 * 2단계: 로그인 회원 확인 → 채점 → 결과 저장으로 확장한다.
 */
export async function scoreDevAnswers(input: unknown): Promise<ScoreResult> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, message: "응답 형식이 올바르지 않습니다." };
  }
  const answers = input as Answers;
  const check = validateAnswers(ASSESSMENT_MODULES, answers);
  if (!check.ok) {
    return { ok: false, message: "답하지 않았거나 올바르지 않은 문항이 있습니다. 응답을 다시 확인해 주세요." };
  }
  return { ok: true, summary: buildDevFreeSummary(answers) };
}
