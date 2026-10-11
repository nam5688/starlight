// 리포트 데이터 구조와 샘플 데이터.
// 실제 채점·사주 계산 로직이 붙기 전까지 결과 화면은 sampleReport만 사용한다.

export type Level = "낮음" | "보통" | "높음";

export type Report = {
  isSample: boolean;
  createdAt: string;
  /** 대표 경향: 감성적 별명 대신 서술형 문장 */
  headline: string;
  /** 영역별 핵심 지표 한 줄씩 */
  keyFacts: { area: string; value: string }[];
  /** 한 줄 요약 */
  summary: string;
  scores: {
    saju: {
      dayMaster: string;
      /** 원국 8글자 기준 오행 개수 */
      elements: { name: string; count: number }[];
    };
    mbti: {
      type: string;
      /** left/right 극의 비율(%) — left + right = 100 */
      axes: { left: string; right: string; leftPct: number }[];
    };
    temperament: { name: string; score: number }[];
    attachment: {
      style: string;
      dimensions: { name: string; score: number }[];
    };
  };
  /** 해석 근거: 결론마다 뒷받침하는 지표 */
  evidence: { claim: string; basis: string[] }[];
  /** 실천 제안 */
  actions: { title: string; reason: string }[];
};

export function levelOf(score: number): Level {
  if (score >= 65) return "높음";
  if (score <= 35) return "낮음";
  return "보통";
}

export const sampleReport: Report = {
  isSample: true,
  createdAt: "2026-10-11",
  headline: "신중하게 계획하고, 관계에서는 확인을 원하는 편",
  keyFacts: [
    { area: "사주", value: "을목 일간 · 토 비중 높음" },
    { area: "MBTI", value: "INTJ" },
    { area: "기질", value: "위험회피 높음" },
    { area: "애착", value: "불안 경향" },
  ],
  summary:
    "준비된 환경에서 강점이 크게 드러나고, 불확실한 관계 신호에는 민감하게 반응합니다.",
  scores: {
    saju: {
      dayMaster: "을목(乙木)",
      elements: [
        { name: "목", count: 2 },
        { name: "화", count: 1 },
        { name: "토", count: 3 },
        { name: "금", count: 1 },
        { name: "수", count: 1 },
      ],
    },
    mbti: {
      type: "INTJ",
      axes: [
        { left: "E", right: "I", leftPct: 32 },
        { left: "S", right: "N", leftPct: 39 },
        { left: "T", right: "F", leftPct: 57 },
        { left: "J", right: "P", leftPct: 64 },
      ],
    },
    temperament: [
      { name: "자극추구", score: 38 },
      { name: "위험회피", score: 72 },
      { name: "사회적 민감성", score: 58 },
      { name: "인내력", score: 66 },
    ],
    attachment: {
      style: "불안 경향",
      dimensions: [
        { name: "불안", score: 68 },
        { name: "회피", score: 31 },
      ],
    },
  },
  evidence: [
    {
      claim: "계획을 세운 뒤에 움직일 때 안정적입니다.",
      basis: ["MBTI J 64%", "기질 인내력 66", "사주 토 3/8"],
    },
    {
      claim: "새로운 자극보다 익숙한 방식을 먼저 고릅니다.",
      basis: ["기질 위험회피 72", "기질 자극추구 38", "MBTI I 68%"],
    },
    {
      claim: "관계에서는 상대의 반응을 확인할 때 편안해집니다.",
      basis: ["애착 불안 68", "기질 사회적 민감성 58", "애착 회피 31"],
    },
  ],
  actions: [
    {
      title: "새 일은 ‘첫 단계’만 정하고 바로 시작하기",
      reason: "위험회피가 높으면 준비 기간이 길어지기 쉽습니다.",
    },
    {
      title: "불안할 때는 추측 대신 한 문장으로 확인하기",
      reason: "애착 불안이 높을수록 확인 한 번이 긴 고민을 줄입니다.",
    },
    {
      title: "일주일에 한 번, 익숙하지 않은 작은 시도 하기",
      reason: "자극추구가 낮은 편이라 의도적인 변화가 도움이 됩니다.",
    },
  ],
};
