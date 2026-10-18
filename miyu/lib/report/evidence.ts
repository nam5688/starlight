// 해석 근거 — 리포트의 모든 문장은 이 목록의 ID를 근거로 달아야 한다.
// 사주 근거(계산 결과 + 해석 규칙)와 응답 근거(문항 응답)는 따로 만들고, 점수를 합산하지 않는다.

export type Topic = "personality" | "work" | "money" | "love" | "marriage" | "relationship" | "timing";

export const TOPIC_LABEL: Record<Topic, string> = {
  personality: "성격",
  work: "일",
  money: "돈",
  love: "연애",
  marriage: "결혼",
  relationship: "관계",
  timing: "시기",
};

export type Evidence = {
  /** 안정적인 ID (예: saju.tengod.insung.strong) — AI가 문장마다 이 ID를 붙인다 */
  id: string;
  /** saju: 원국 · 대운 · 세운 계산 / survey: 미유 문항 응답 / self: 본인이 입력한 정보(MBTI 등) */
  source: "saju" | "survey" | "self";
  topics: Topic[];
  /** 근거의 세기 — weak는 단정하지 않는다 */
  strength: "strong" | "moderate" | "weak";
  /** 계산 · 응답 사실 (사람이 읽는 문장) */
  fact: string;
  /** 해석 단서 (규칙 문장 — 전통 해석 · 응답 해석). AI는 이 범위 안에서만 해석한다 */
  cue: string;
  /** 시기 근거일 때 기간 (양력 연-월) */
  period?: { from: string; to: string; label: string };
  /**
   * 시기 근거일 때 그 기간의 만 나이 범위(생일의 일은 따지지 않아 "무렵"으로만 말한다) — 지난 대운 · 세운을 "만 N세 무렵"으로 풀 때 글이 이 범위 안에서만 나이를 말하게 한다.
   * 대운 하나는 범위 하나, 여러 대운을 묶은 개요는 대운마다 범위 하나씩이다.
   */
  ageWindows?: { from: number; to: number }[];
  /** 학파 · 경계 때문에 확실하지 않은 근거 — 해석에 쓰지 말고 안내만 한다 */
  uncertain?: boolean;
};

export type EvidenceSet = {
  /** 해석 규칙 버전 — 리포트에 함께 저장한다 */
  ruleVersion: string;
  /** 시기 해석의 기준 날짜 (한국 날짜) */
  referenceDate: string;
  items: Evidence[];
};
