// 응답 근거 v0 — 지금의 개발용 문항 점수에서 행동 근거를 만든다 (새 상황형 문항으로 바뀌면 교체).
// 점수는 응답 환산값이며 사주 근거와 합산하지 않는다. 본인이 입력한 MBTI는 자기 인식 참고값이며, 선호가 드러나는 장면을 구체화하는 데만 쓴다(행동을 정하는 값으로 쓰지 않는다).
// 0.2(2026-10-16, 운영자 검토): 기질 4 · 가까운 관계 2에 더해 "평소 행동 방식" 네 가지(에너지 · 정보 · 판단 · 생활)도 근거로 넘긴다 — 사주가 이 사람에게 어떻게 나타나는지 구체화하는 재료다.
//   예전에는 summary.temperament · relationship만 읽어 네 가지가 AI에게 가지 않았다. MBTI는 알파벳이 아니라 선호의 방향(참고)으로 풀어 주고, 실제 응답과 다르면 응답이 먼저다.

import type { Evidence, Topic } from "./evidence.ts";
import type { AxisRow, FreeSummary, ScoreRow } from "./types.ts";

export const SURVEY_RULE_VERSION = "survey-dev-0.2";

const TOPICS: Record<string, Topic[]> = {
  novelty: ["personality", "work"],
  caution: ["personality", "work", "money"],
  sensitivity: ["personality", "relationship"],
  persistence: ["work"],
  anxiety: ["love", "relationship"],
  avoidance: ["love", "relationship"],
  // 평소 행동 방식(에너지 · 정보 · 판단 · 생활) — 어느 영역에서 구체화에 쓰일 수 있는지
  ei: ["personality", "relationship", "work"],
  sn: ["personality", "work"],
  tf: ["personality", "relationship", "work"],
  jp: ["personality", "work", "money"],
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

/** 평소 행동 방식 한 가지 — 어느 쪽 이름(함께하며 채움 · 혼자 정리하며 채움 …)인지가 사실이고, 글자 코드는 쓰지 않는다 */
function axisEvidence(row: AxisRow): Evidence | null {
  const high = row.score >= 65;
  const low = row.score <= 35;
  if (!high && !low) return null;
  const side = high ? row.highName : row.lowName;
  return {
    id: `survey.${row.id}.${high ? "high" : "low"}`,
    source: "survey",
    topics: TOPICS[row.id] ?? ["personality"],
    strength: row.score >= 80 || row.score <= 20 ? "strong" : "moderate",
    fact: `평소 행동 방식 · ${row.label}: ${side || (high ? "높은" : "낮은")} 쪽 ${row.score} (응답 환산값, 개발용 문항 — 백분위가 아님)`,
    cue: `응답에서 나타난 행동 경향: ${high ? row.highMeaning : row.lowMeaning}`,
  };
}

/**
 * 입력한 MBTI 네 글자가 가리키는 선호의 방향을 일상의 말로 풀어 준다(참고) — 알파벳이 본문에 나오지 않게, 그리고 모델이 유형 이름의 일반론을 지어내지 않게 방향만 건넨다.
 * 공식 검사의 설명을 옮기지 않았다(직접 쓴 한 줄 풀이). 네 글자 형식이 아니면 만들지 않는다.
 */
export function mbtiDirections(code: string): string[] | null {
  const m = /^([EI])([NS])([TF])([JP])$/i.exec(code.trim());
  if (!m) return null;
  const [e, n, t, j] = m.slice(1).map((c) => c.toUpperCase());
  return [
    e === "I" ? "에너지는 안에서 충분히 생각을 거친 뒤 밖으로 드러내는 쪽" : "에너지는 사람 · 활동과 함께할 때 나는 쪽",
    n === "N" ? "정보는 전체 의미와 가능성을 먼저 보는 쪽" : "정보는 구체적인 사실과 경험을 먼저 보는 쪽",
    t === "F" ? "판단은 사람과 관계에 미칠 영향을 먼저 보는 쪽" : "판단은 기준과 논리가 맞는지 먼저 보는 쪽",
    j === "J" ? "생활은 미리 정해 두어야 마음이 놓이는 쪽" : "생활은 상황에 맞춰 유연하게 움직이는 쪽",
  ];
}

export function surveyEvidence(summary: FreeSummary, knownMbti: string | null): Evidence[] {
  const out = [...summary.temperament, ...summary.relationship].map(rowEvidence).filter((e): e is Evidence => e !== null);
  // 평소 행동 방식(에너지 · 정보 · 판단 · 생활) — 점수가 뚜렷한 쪽만. 예전에 저장된 요약에도 axes가 있으면 그대로 읽는다
  for (const axis of summary.mbti?.axes ?? []) {
    const e = axisEvidence(axis);
    if (e) out.push(e);
  }
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
    const dirs = mbtiDirections(knownMbti);
    out.push({
      id: "self.mbti",
      source: "self",
      topics: ["personality", "relationship", "work"],
      strength: "weak",
      fact: `본인이 알고 있는 MBTI ${knownMbti}`,
      cue: `본인이 알고 있는 자기 인식 참고값입니다. ${dirs ? `입력한 선호가 가리키는 방향(참고): ${dirs.join(" · ")}. ` : ""}사주에서 읽은 성향이 이 사람에게 어떤 장면으로 나타나는지 구체화하는 데 쓰고, 행동의 원인으로 단정하거나 사주 · 응답과 다를 때 덮어쓰지 않습니다(응답이 먼저이고, 다르면 차이가 나타나는 상황으로 씁니다. MBTI는 선호의 참고이지 행동을 정하는 값이 아닙니다).`,
    });
  }
  return out;
}
