// 개인 통합 리포트 — 읽기 구조(종합 해석을 먼저 읽고, 분석한 이유는 눌러서 보는 형식).
// 지금은 가상 인물의 사람이 쓴 예시(리포트 예시 화면)에만 쓴다. 실제 리포트 생성 · 저장 형식은 운영자가 확인한 뒤 바꾼다.
// 본문(lead · paragraphs · example · watch)에는 사주 용어와 응답 점수를 쓰지 않고, 근거는 basis(접어 둔 "이렇게 분석했어요")에 둔다.
// evidence는 내부 점검용 근거 ID이며 소비자 화면에는 보이지 않는다.

/** 접어 둔 "이렇게 분석했어요" — 계산 결과와 전통 해석 규칙을 나누어 적는다 */
export type ReadingBasis = {
  /** 사주 — 만세력 엔진이 계산한 결과 */
  computed: string[];
  /** 사주 — 전통 해석 규칙(미유의 초안 규칙, 전문가 검토 전)이 이 결과를 어떻게 읽는지 */
  tradition: string[];
  /** 응답 · 본인 입력 (숫자는 응답 환산값, 백분위가 아님) */
  answers: string[];
  /** 자료끼리 다르게 나온 부분 */
  differences?: string[];
  /** 다른 가능성 · 아직 확인되지 않은 것 · 자료가 없는 것 */
  unknown: string[];
};

export type ReadingTrait = { name: string; shines: string; burden: string };

export type ReadingSection = {
  id: string;
  title: string;
  /** 크게 보이는 핵심 결론 — 짧게(약 25자 안팎) */
  headline: string;
  /** 헤드라인 아래 한두 줄 설명(작은 글씨) */
  lead: string;
  /** 쉬운 설명 — 한 문단 2~3문장 */
  paragraphs: string[];
  /** 같은 특징이 강점이 되는 때와 부담이 되는 때 */
  traits?: ReadingTrait[];
  /** 상대 없이 보는 관계 스타일 — 편안한 조건 · 부딪히기 쉬운 상황 */
  comfort?: { comfortable: string[]; clash: string[]; note: string };
  /** 예를 들면 — 실제 일처럼 쓰지 않은 가상의 장면 */
  example: string;
  watch: string;
  /** 읽는 데 중요한 조건(자료 없음 · 해석의 범위) — 본문 가까이에 짧게 */
  caveat?: string;
  basis: ReadingBasis;
  /** 내부 점검용 근거 ID (화면에 표시하지 않음) */
  evidence: string[];
};

export type ReadingFlow = {
  id: string;
  title: string;
  headline: string;
  lead: string;
  caveat: string;
  /** 사주 시기 해석 — 전통 해석에서 해당 시기를 어떤 주제로 읽는지 */
  periods: { period: string; theme: string; watch: string }[];
  /** 응답 기반 시나리오 — 조건 → 전개 (예측이 아닌 가능성) */
  scenarios: { when: string; then: string }[];
  scenarioNote: string;
  /** 연구 통계 — 쓰지 않았다면 그 이유 */
  statistics: string;
  basis: ReadingBasis;
  evidence: string[];
};

export type ReadingInput = {
  name: string;
  /** used: 사용 · dev: 개발용 예시 문항으로 사용 · none: 없음(만들어 채우지 않았다) */
  status: "used" | "dev" | "none";
  note: string;
  /** 이 자료가 쓰인 주제 이름 (없음이면 비워 둔다) */
  usedIn: string[];
};

export type IntegratedReadingReport = {
  kind: "integrated-reading";
  source: "sample";
  personName: string;
  /** 핵심 해석 한 문장 */
  headline: string;
  /** 요약 3개 — keyword는 크게 보이는 핵심어, text는 그 아래 작은 설명 */
  summary: { label: "강점" | "반복되는 어려움" | "앞으로 살펴볼 점"; keyword: string; text: string }[];
  inputs: ReadingInput[];
  sections: ReadingSection[];
  flow: ReadingFlow;
  actions: { title: string; detail: string }[];
};
