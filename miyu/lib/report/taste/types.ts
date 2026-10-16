// 맛보기 리포트(무료 · 로그인한 회원 · 한 계정당 1번) 타입 — 채널 독립 코드.
// AI가 사주와 응답에서 읽은 문구(무료 미리보기가 이미 공개한 것)를 엮어 "한 줄 제목 + 풀이"만 쓴다. 유료 리포트의 핵심(실제 연애의 진행 · 어울리는 사람 · 시기)은 쓰지 않는다.
// AI에는 이름 · 생년월일 원문을 보내지 않는다.
//
// taste-v2(운영자 2026-10-16): 사주를 읽고 이 사람에게 어떻게 나타나는지 풀어 주는 완결된 짧은 풀이 — 내 성향과 지나온 모습 · 일에서는 · 가까운 관계에서는 · 지금 필요한 한 가지.
// taste-v1(네 섹션: 나는 이런 사람 · 연애 · 일 · 마음이 흔들릴 때)로 이미 받은 글은 그대로 읽는다(저장된 글은 바꾸지 않는다).

export const TASTE_VERSION = "taste-v2";
export const TASTE_LEGACY_VERSION = "taste-v1";

/** 쓰는 순서 — 이 네 섹션만 쓴다 */
export const TASTE_SECTION_IDS = ["self", "work", "love", "action"] as const;
/** 예전(v1)에 받은 글의 섹션 — 읽기만 한다 */
export const TASTE_LEGACY_SECTION_IDS = ["self", "love", "work", "heart"] as const;
export type TasteSectionId = (typeof TASTE_SECTION_IDS)[number] | (typeof TASTE_LEGACY_SECTION_IDS)[number];

export type TasteSection = {
  id: TasteSectionId;
  /** 사람마다 다른 눈길을 끄는 한 줄 제목 */
  title: string;
  /** 풀이 문단 — 사주에서 읽은 점 · 응답에서 읽은 반응 · 둘이 만나는 지점 */
  body: string;
};

export type TasteReport = {
  version: typeof TASTE_VERSION | typeof TASTE_LEGACY_VERSION;
  /** 한 줄 총평 제목 */
  headline: string;
  sections: TasteSection[];
};

/** 사용자가 직접 고른 실제 응답 한 건 — 문항 문장(개발용 예시 문항)과 고른 답. 보통(3)은 담지 않는다 */
export type TasteAnswer = { area: "평소 행동 방식" | "기질" | "관계"; statement: string; answer: "전혀 아니다" | "아니다" | "그렇다" | "매우 그렇다" };

/**
 * AI가 읽는 근거 — 무료 미리보기가 이미 사용자에게 보여 준 문구(talk-free.ts의 tasteProfile)와 사용자가 직접 고른 실제 응답(answers)이다.
 * 사주만으로 쓰지 않고 실제 응답을 함께 엮어 예상하게 한다(운영자 2026-10-16). 새 사실을 더하지 않는다.
 */
export type TasteInput = {
  profile: { saju: string[]; response: string[] };
  answers: TasteAnswer[];
};
