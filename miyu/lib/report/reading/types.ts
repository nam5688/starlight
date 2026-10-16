// 개인 통합 리포트 — 읽기 구조(결론을 먼저 읽고, 자세한 풀이와 분석 근거는 눌러서 보는 형식).
// 지금은 가상 인물의 사람이 쓴 예시(리포트 예시 화면)에만 쓴다. 실제 리포트 생성 · 저장 형식은 운영자가 확인한 뒤 바꾼다.
// 기본 화면에는 결론 한 줄(headline) · 요약 2~3문장(summary) · 예시 1개만 보인다. 같은 말을 제목 · 요약 · 본문에서 되풀이하지 않는다.
// 본문(headline · summary · example · details · watch)에는 사주 용어와 응답 점수를 쓰지 않고, 근거는 basis(접어 둔 "분석 근거")에 둔다.
// evidence는 내부 점검용 근거 ID이며 소비자 화면에는 보이지 않는다.
import type { ContextTopic } from "../../personalization/context.ts";
import type { MonthCalendar } from "../../saju/interpret/months.ts";
import type { LuckSlot } from "../../saju/interpret/rules.ts";
import type { Evidence } from "../evidence.ts";
import type { ReportExtras } from "../extras.ts";
import type { DataSource, FreeSummary, SajuSection } from "../types.ts";

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
export type ReadingSummaryCard = {
  kind: "strength" | "caution" | "flow";
  label: string;
  keyword: string;
  note: string;
  /** 카드 맨 아래 작은 줄 — 지금 나의 시기 카드의 기간("2024.08–2034.07 · 사주에서 보는 10년 시기"). 코드가 계산해 채우며 이전에 저장된 리포트에는 없다 */
  foot?: string;
};

/** "강한 포인트 / 힘들 수 있는 포인트" 카드 — short는 카드에 보이는 짧은 말, shines · burden · example은 접어 둔 일상 예시 */
export type ReadingTrait = { name: string; shinesShort: string; burdenShort: string; shines: string; burden: string; /** 이 특징의 가상의 장면 한두 문장 */ example: string };

/** 깊게 읽는 소단락 — 눈길을 끄는 한 줄 제목 → 풀이 → 해 볼 것. 연애(가까운 관계) · 일과 돈 주제에만 있다 */
export type ReadingSection = { title: string; body: string; tryIt: string };

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
  /** 깊게 읽는 소단락(제목 → 풀이 → 해 볼 것) — 가까운 관계 · 일과 돈 주제만 */
  sections?: ReadingSection[];
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
  /** 영역별 이야기(story) 형식 — 요약 다음에 이어지는 문단들. 이전 형식에는 없다 */
  paragraphs?: string[];
  caveat: string;
  /** 지금 지나는 시기 카드의 쉬운 설명 2~3문장 */
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
  /**
   * 글의 짜임 — "story": 영역마다 하나의 이야기를 끝까지 쓴 형식(story-v1, 2026-10-16). 영역의 첫 문단은 summary에, 나머지 문단은 details에 담고 요약 · 예시 · 특징 카드 · 소단락 · 살펴볼 점은 없다.
   * 없으면 예전 읽기 구조(reading-v1: 칸마다 요약 · 예시 · 풀이 · 살펴볼 점). 두 형식이 같은 저장 모양을 써서 채팅 · 관리자 · 내보내기가 둘 다 읽는다.
   */
  layout?: "story";
  source: DataSource;
  personName: string;
  /** 핵심 해석 한 문장 (모바일 두 줄 이내) */
  headline: string;
  summary: ReadingSummaryCard[];
  inputs: ReadingInput[];
  blocks: ReadingBlock[];
  flow: ReadingFlow;
  /** 지금 지나는 시기 타임라인 — 사용자의 사주 계산 결과(luckTimeline)로 만든다. 기준 월은 timelineReference */
  timeline: LuckSlot[];
  timelineReference: { year: number; month: number };
  /** 월 단위 "움직이는 달" 달력 — 사용자의 사주 계산 결과로 코드가 만든다(AI가 쓰지 않는다). 규칙 버전과 함께 저장하고 열 때마다 새로 계산하지 않는다. 이전에 저장된 리포트에는 없다 */
  calendars?: { ruleVersion: string; items: MonthCalendar[] };
  /** 다음 행동 체크리스트 — area는 이 행동이 어느 영역의 풀이에서 나왔는지(story 형식만) */
  actions: { title: string; detail: string; area?: string }[];
  // ── 실제 생성된 리포트에만 있는 값 (예시에는 없다). 글은 AI가 쓰고, 아래 값은 코드가 채운다 ──
  /** 만세력 계산 결과의 화면용 표 */
  saju?: SajuSection;
  /** 응답 요약 (점수 · MBTI 축) — 접어 둔 "내 분석 데이터"에 보인다 */
  base?: FreeSummary;
  /** 규칙 기반 구성 요소 (질문과 답 · 상황별 · 어울리는 관계 조건 · 보완 아이템) — 구매 범위에 포함된 항목 */
  extras?: ReportExtras;
  /** 알려 주신 고민까지 반영한 해석 (내 고민 자세히 알려주기를 적었을 때만) */
  focus?: { text: string; evidence: string[] }[];
  generated?: {
    promptVersion: string;
    ruleVersions: string[];
    referenceDate: string;
    /** 계산 기준 안내 줄 (만세력 엔진 · 자시 · 지역 보정 정책) */
    lines: string[];
    /** 근거 목록 — 접어 둔 분석 근거는 여기서 코드가 만든다 (AI가 쓰지 않는다) */
    evidence: Evidence[];
    /** 반영한 맥락 — 주제와 적은 항목 이름만 (내용은 담지 않는다) */
    context?: { topic: ContextTopic; topicLabel: string; fields: string[]; updatedAt: string | null };
  };
};

// ── AI가 돌려주는 부분(초안). 근거 · 사주 용어 풀이 · 안전 안내 · 시기 계산은 코드가 채운다 ──

export type ReadingBlockId = "tendency" | "strength-burden" | "values" | "love" | "work-money";

export type ReadingTraitDraft = ReadingTrait & { example: string };

export type ReadingBlockDraft = {
  id: ReadingBlockId;
  /** 결론 한 줄 (8~30자) */
  headline: string;
  /** 요약 1~2문장 — 제목을 되풀이하지 않는다 */
  summary: string;
  /** 쉬운 예시 (강한 포인트 블록은 특징마다 따로 있고, 가까운 관계는 반응 단계 그림이 그 자리를 맡는다) */
  example?: string;
  /** 자세한 풀이 — 문단마다 2~3문장 */
  details: string[];
  /** 살펴볼 점 — 소단락(sections)이 있는 주제는 소단락마다 해 볼 것이 있어 쓰지 않는다 */
  watch?: string;
  /** 깊게 읽는 소단락 — plan에서 sections가 있는 주제만 쓴다 */
  sections?: ReadingSection[];
  traits?: ReadingTraitDraft[];
  comfort?: { comfortable: string[]; clash: string[] };
  reactionFlow?: { when: string; steps: { label: string; text: string }[]; helpful: string };
  evidence: string[];
};

export type ReadingFlowDraft = {
  headline: string;
  summary: string;
  /** 지금 지나는 시기 카드의 쉬운 설명 2~3문장 */
  cardText: string;
  years: { year: string; theme: string }[];
  /** ref는 사용자 메시지의 periods 목록에서 고른다 (current · next · y2026 …) */
  periods: { ref: string; theme: string; watch: string }[];
  scenarios: { when: string; then: string }[];
  evidence: string[];
};

export type ReadingDraftV1 = {
  /** 이 사람의 핵심 해석 한 문장 */
  headline: string;
  /** 지금 나의 시기 카드의 기간 문장은 계산 결과로 코드가 붙인다 — AI는 주제 한 줄(keyword)만 쓴다 */
  cards: { strength: { keyword: string; note: string }; caution: { keyword: string; note: string }; flow: { keyword: string } };
  blocks: ReadingBlockDraft[];
  flow: ReadingFlowDraft;
  actions: { title: string; detail: string; evidence: string[] }[];
  focus?: { text: string; evidence: string[] }[];
};

// ── story-v1(영역별 이야기) — AI가 돌려주는 초안. 요약 · 예시 · 주의 · 행동을 칸마다 채우지 않고 영역마다 문단들로 한 이야기를 쓴다 ──

export type StoryAreaId = "core" | "relation" | "work-money";

export type StoryAreaDraft = {
  id: StoryAreaId;
  /** 이 영역에서만 말하는 연결 한 문장 — 본문을 다 쓴 뒤 풀이의 결론으로 쓴다 */
  headline: string;
  /** 이야기 문단들 — 사주에서 읽은 것 → 이 사람에게 나타나는 장면 → 겪기 쉬웠던 부담 → 방향 */
  paragraphs: string[];
  evidence: string[];
};

export type StoryFlowDraft = {
  headline: string;
  /** 계산된 시기를 풀이하고 이 사람이 그 시기를 어떻게 받아들일지까지 — 시기 이야기는 이 영역에만 쓴다 */
  paragraphs: string[];
  years: { year: string; theme: string }[];
  scenarios: { when: string; then: string }[];
  evidence: string[];
};

export type StoryActionArea = StoryAreaId | "flow";

export type StoryDraftV1 = {
  /** 이 사람의 중심이 되는 연결 한 문장 (공유용 카드에 실리므로 이름을 쓰지 않는다) */
  headline: string;
  cards: { strength: { keyword: string; note: string }; caution: { keyword: string; note: string }; flow: { keyword: string } };
  areas: StoryAreaDraft[];
  flow: StoryFlowDraft;
  /** 알려 준 고민이 있을 때만 — 앞 영역의 결론을 지금 선택에 적용한다 */
  focus?: { text: string; evidence: string[] }[];
  /** 지금 해 볼 행동 세 가지 — 앞 영역에서 나온 것을 한곳에 모은다. area는 어느 영역의 풀이에서 나온 행동인지 */
  actions: { title: string; detail: string; area: StoryActionArea; evidence: string[] }[];
};

/** 저장된 리포트가 영역별 이야기(story) 형식인가 */
export const isStoryReport = (c: unknown): c is IntegratedReadingReport => isReadingReport(c) && c.layout === "story";

/** 저장된 리포트가 이 읽기 구조인가 (kind만 본다. 실제로 생성된 리포트에는 saju · base · extras · generated가 있고, 예시 화면의 데이터에는 없다) */
export const isReadingReport = (c: unknown): c is IntegratedReadingReport => typeof c === "object" && c !== null && (c as { kind?: unknown }).kind === "integrated-reading";
