// 검사 모듈 공통 타입.
// MBTI 성향 · 기질 · 관계(애착)는 각각 독립된 모듈이며, 같은 구조를 따른다.

export type ModuleId = "mbti" | "temperament" | "relationship";

/**
 * 문항 출처 상태.
 * - "dev-example": 개발용 예시 문항 (화면 확인용, 운영 사용 금지)
 * - "licensed": 이용 조건을 확인하고 확정한 운영 문항 (아직 없음)
 */
export type ContentStatus = "dev-example" | "licensed";

export type Dimension = {
  id: string;
  label: string;
  /** 점수가 낮을 때의 의미 — 좋고 나쁨이 아니라 방향을 설명한다 */
  lowMeaning: string;
  /** 점수가 높을 때의 의미 */
  highMeaning: string;
  /** 양극 지표(MBTI)의 낮은 쪽/높은 쪽 글자 */
  lowCode?: string;
  highCode?: string;
  lowName?: string;
  highName?: string;
};

export type Item = {
  id: string;
  text: string;
  /** 이 문항이 측정하는 지표 id */
  dimension: string;
  /** true면 역문항: (6 - 응답)으로 계산한다 */
  reverse?: boolean;
};

export type AssessmentModule = {
  id: ModuleId;
  title: string;
  /** 검사 시작 시 보여주는 안내. 해석이나 유도 문구를 넣지 않는다. */
  intro: string;
  status: ContentStatus;
  version: string;
  dimensions: Dimension[];
  items: Item[];
};

/** 문항 id → 1~5 응답 */
export type Answers = Record<string, number>;

export type DimensionScore = {
  dimensionId: string;
  /** 0~100 환산값. 백분위나 정확도가 아니다. */
  score: number;
};

export const LIKERT_OPTIONS = [
  { value: 1, label: "전혀 아니다" },
  { value: 2, label: "아니다" },
  { value: 3, label: "보통" },
  { value: 4, label: "그렇다" },
  { value: 5, label: "매우 그렇다" },
] as const;
