// 검사 모듈의 지표 정보 + 점수 → 화면용 행 데이터

import type { AssessmentModule } from "../assessment/types.ts";
import type { AxisRow, ScoreRow } from "./types.ts";

export function toScoreRows(module: AssessmentModule, scores: Record<string, number>): ScoreRow[] {
  return module.dimensions.map((d) => ({
    id: d.id,
    label: d.label,
    score: scores[d.id],
    lowMeaning: d.lowMeaning,
    highMeaning: d.highMeaning,
  }));
}

export function toAxisRows(module: AssessmentModule, scores: Record<string, number>): AxisRow[] {
  return module.dimensions.map((d) => ({
    id: d.id,
    label: d.label,
    score: scores[d.id],
    lowMeaning: d.lowMeaning,
    highMeaning: d.highMeaning,
    lowCode: d.lowCode ?? "",
    lowName: d.lowName ?? "",
    highCode: d.highCode ?? "",
    highName: d.highName ?? "",
  }));
}
