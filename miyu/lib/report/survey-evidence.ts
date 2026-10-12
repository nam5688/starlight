// 응답 근거 v0 — 지금의 개발용 문항 점수에서 행동 근거를 만든다 (새 상황형 문항으로 바뀌면 교체).
// 점수는 응답 환산값이며 사주 근거와 합산하지 않는다. 본인이 입력한 MBTI는 자기 인식 참고값으로만 쓴다.

import type { Evidence, Topic } from "./evidence.ts";
import type { FreeSummary, ScoreRow } from "./types.ts";

export const SURVEY_RULE_VERSION = "survey-dev-0.1";

const TOPICS: Record<string, Topic[]> = {
  novelty: ["personality", "work"],
  caution: ["personality", "work", "money"],
  sensitivity: ["personality", "relationship"],
  persistence: ["work"],
  anxiety: ["love", "relationship"],
  avoidance: ["love", "relationship"],
};

function rowEvidence(row: ScoreRow): Evidence | null {
  const high = row.score >= 65;
  const low = row.score <= 35;
  if (!high && !low) return null;
  return {
    id: `survey.${row.id}.${high ? "high" : "low"}`,
    source: "survey",
    topics: TOPICS[row.id] ?? ["personality"],
    strength: row.score >= 80 || row.score <= 20 ? "strong" : "moderate",
    fact: `${row.label} ${row.score} (응답 환산값, 개발용 문항 — 백분위가 아님)`,
    cue: `응답에서 나타난 행동 경향: ${high ? row.highMeaning : row.lowMeaning}`,
  };
}

export function surveyEvidence(summary: FreeSummary, knownMbti: string | null): Evidence[] {
  const out = [...summary.temperament, ...summary.relationship].map(rowEvidence).filter((e): e is Evidence => e !== null);
  const anxiety = summary.relationship.find((r) => r.id === "anxiety");
  const avoidance = summary.relationship.find((r) => r.id === "avoidance");
  if (anxiety && avoidance && anxiety.score >= 55 && avoidance.score >= 55) {
    out.push({
      id: "survey.closeness.both",
      source: "survey",
      topics: ["love", "relationship"],
      strength: "moderate",
      fact: `관계 불안 ${anxiety.score} · 거리 두기 ${avoidance.score} (응답 환산값)`,
      cue: "가까워지고 싶은 마음과 거리를 두고 싶은 마음이 함께 나타나, 가까운 관계에서 상황에 따라 반응이 달라질 수 있습니다.",
    });
  }
  if (knownMbti) {
    out.push({
      id: "self.mbti",
      source: "self",
      topics: ["personality"],
      strength: "weak",
      fact: `본인이 알고 있는 MBTI ${knownMbti}`,
      cue: "자기 인식 참고값으로만 쓰고, 성격을 판정하거나 사주로 알아맞힌 것처럼 쓰지 않습니다.",
    });
  }
  return out;
}
