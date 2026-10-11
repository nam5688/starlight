// 응답 → 지표 점수 계산. 화면·서버 어디에도 의존하지 않는 순수 함수만 둔다.
// 운영에서는 서버에서만 호출한다 (app/analyze/actions.ts).

import type { Answers, AssessmentModule, DimensionScore } from "./types.ts";

export type AnswerValidation =
  | { ok: true }
  | { ok: false; missing: string[]; invalid: string[] };

/** 모든 문항에 1~5 정수 응답이 있는지, 모르는 문항 id가 섞이지 않았는지 확인한다. */
export function validateAnswers(modules: AssessmentModule[], answers: Answers): AnswerValidation {
  const known = new Set(modules.flatMap((m) => m.items.map((i) => i.id)));
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const id of known) {
    const v = answers[id];
    if (v === undefined) missing.push(id);
    else if (!Number.isInteger(v) || v < 1 || v > 5) invalid.push(id);
  }
  for (const id of Object.keys(answers)) {
    if (!known.has(id)) invalid.push(id);
  }

  return missing.length === 0 && invalid.length === 0 ? { ok: true } : { ok: false, missing, invalid };
}

/**
 * 지표별 평균 응답을 0~100으로 환산한다. (평균 1 → 0, 평균 5 → 100)
 * 역문항은 6에서 뺀 값으로 계산한다. 응답이 없으면 오류를 던진다 — 먼저 validateAnswers를 통과해야 한다.
 */
export function scoreModule(module: AssessmentModule, answers: Answers): DimensionScore[] {
  return module.dimensions.map((d) => {
    const items = module.items.filter((i) => i.dimension === d.id);
    const values = items.map((i) => {
      const v = answers[i.id];
      if (v === undefined) throw new Error(`응답 없음: ${i.id}`);
      return i.reverse ? 6 - v : v;
    });
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return { dimensionId: d.id, score: Math.round(((mean - 1) / 4) * 100) };
  });
}

export function toScoreMap(scores: DimensionScore[]): Record<string, number> {
  return Object.fromEntries(scores.map((s) => [s.dimensionId, s.score]));
}

/**
 * 양극 지표 점수로 네 글자 코드를 만든다. 50보다 크면 높은 쪽 글자, 작으면 낮은 쪽 글자.
 * 정확히 50이면 어느 쪽으로도 정하지 않고 "X"로 둔다.
 */
export function bipolarCode(module: AssessmentModule, scores: DimensionScore[]): string {
  const map = toScoreMap(scores);
  return module.dimensions
    .map((d) => {
      const s = map[d.id];
      if (s > 50) return d.highCode ?? "?";
      if (s < 50) return d.lowCode ?? "?";
      return "X";
    })
    .join("");
}
