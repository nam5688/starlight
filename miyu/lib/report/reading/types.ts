// 개인 통합 리포트 — 읽기 구조(결론을 먼저 읽고, 자세한 풀이와 분석 근거는 눌러서 보는 형식).
// 지금은 가상 인물의 사람이 쓴 예시(리포트 예시 화면)에만 쓴다. 실제 리포트 생성 · 저장 형식은 운영자가 확인한 뒤 바꾼다.
// 기본 화면에는 결론 한 줄(headline) · 요약 2~3문장(summary) · 예시 1개만 보인다. 같은 말을 제목 · 요약 · 본문에서 되풀이하지 않는다.
// 본문(headline · summary · example · details · watch)에는 사주 용어와 응답 점수를 쓰지 않고, 근거는 basis(접어 둔 "분석 근거")에 둔다.
// evidence는 내부 점검용 근거 ID이며 소비자 화면에는 보이지 않는다.
import type { LuckSlot } from "../../saju/interpret/rules.ts";

export type { LuckSlot };

/** 접어 둔 "분석 근거" — 계산 결과와 전통 해석 규칙을 나누어 적는다 */
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

/** 첫 화면 요약 카드 — 강점 · 주의할 점 · 지금의 흐름 */
export type ReadingSummaryCard = { kind: "strength" | "caution" | "flow"; label: string; keyword: string; note: string };

/** 강점과 부담 카드 — short는 카드에 보이는 짧은 말, shines · burden은 접어 둔 자세한 풀이 */
export type ReadingTrait = { name: string; shinesShort: string; burdenShort: string; shines: string; burden: string };

export type ReadingGroupId = "me" | "relation" | "work";

export type ReadingBlock = {
  id: string;
  group: ReadingGroupId;
  /** 제목 위의 작은 이름표 — 같은 묶음 안에서 무엇을 다루는지 (예: 강점과 부담) */
  topic: string;
  /** 블록 제목이자 결론 한 줄 (약 25자 안팎, 모바일 두 줄 이내) */
  headline: string;
  /** 기본 화면의 요약 2~3문장 (카드로 보여 주는 블록은 비운다) */
  summary: string;
  /** 기본 화면의 예시 1개 (실제 일처럼 쓰지 않은 가상의 장면) */
  example?: string;
  /** 접어 둔 "자세한 풀이" — 한 문단 2~3문장 */
  details: string[];
  /** 자세한 풀이 안의 예시 · 살펴볼 점 */
  detailExample?: string;
  watch?: string;
  traits?: ReadingTrait[];
  /** 상대 없이 보는 관계 스타일 */
  comfort?: { comfortable: string[]; clash: string[]; note: string };
  /** 상대의 반응이 이어지는 모습 — 단계 그림 */
  reactionFlow?: { when: string; steps: { label: string; text: string }[]; helpful: string };
  /** 읽는 데 중요한 조건(자료 없음 · 해석의 범위) — 본문 가까이에 짧게 */
  caveat?: string;
  basis: ReadingBasis;
  /** 내부 점검용 근거 ID (화면에 표시하지 않음) */
  evidence: string[];
};

export type ReadingFlow = {
  id: string;
  topic: string;
  headline: string;
  summary: string;
  caveat: string;
  /** 지금 지나는 큰 흐름 카드의 쉬운 설명 2~3문장 */
  cardText: string;
  /** 해마다 한 줄 */
  years: { year: string; theme: string }[];
  /** 접어 둔 자세한 풀이 — 시기별 읽기 */
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
  /** 이 자료가 쓰인 블록(주제) 이름 (없음이면 비워 둔다) */
  usedIn: string[];
};

export type IntegratedReadingReport = {
  kind: "integrated-reading";
  source: "sample";
  personName: string;
  /** 핵심 해석 한 문장 (모바일 두 줄 이내) */
  headline: string;
  summary: ReadingSummaryCard[];
  inputs: ReadingInput[];
  blocks: ReadingBlock[];
  flow: ReadingFlow;
  /** 지금 지나는 큰 흐름 타임라인 — 사용자의 사주 계산 결과(luckTimeline)로 만든다. 기준 월은 timelineReference */
  timeline: LuckSlot[];
  timelineReference: { year: number; month: number };
  /** 다음 행동 체크리스트 */
  actions: { title: string; detail: string }[];
};
