// 사주 궁합 리포트(유료, 아직 판매하지 않음)의 고정 구성 — 지시문(prompt.ts) · 형식 검사(validate.ts) · 모의 작성기 · 조립(assemble.ts) · 화면이 같은 값을 쓴다.
// 간단 궁합(무료, /compat)과 같은 엔진 결과(lib/saju/interpret/compat.ts)를 풀어 쓴다 — 커플 유형 · 궁합 지수 · 계산 재료는 코드가 같은 결과에서 채우고 AI는 본문만 쓴다.
// 관계 시기(두 사람의 대운 · 세운이 만나는 해)는 아직 계산하지 않았으므로 구성에 넣지 않는다 — COMPAT_TIMING_BUILT가 true가 되기 전에는 본문에서 해 · 달 · 시기를 말하지 못하게 막는다.
// 상대의 응답(기질 · 성격 · 애착)은 쓰지 않는다 — 두 사람이 각자 응답한 내용을 비교하는 것은 별도 상품(리포트 궁합)이다.

export const COMPAT_REPORT_KIND = "compat-saju-v1" as const;
export const COMPAT_PROMPT_VERSION = "compat-v1-prompt-0.2";

/** 관계 시기(두 사람의 대운 · 세운) 풀이를 만들었는가 — 지금은 아니다. 이 값이 false인 동안 본문에서 해 · 달 · 시기 이야기를 막고 화면에 "아직 만들지 않았다"고 알린다 */
export const COMPAT_TIMING_BUILT = false;

export type CompatSectionId = "overview" | "fit" | "friction" | "love" | "long";

export type CompatSectionPlan = {
  id: CompatSectionId;
  /** 제목 위의 작은 이름표 */
  topic: string;
  /** AI에게 주는 질문 — 이 영역이 답해야 하는 것 */
  ask: string;
  /** 우선 참고하는 근거 ID 접두 */
  sources: string;
  /** 문단 수 */
  paragraphs: { min: number; max: number };
};

export const COMPAT_SECTIONS: CompatSectionPlan[] = [
  {
    id: "overview",
    topic: "두 사람의 기본 조합",
    ask: "두 사람이 가까이 있을 때 어떤 분위기가 만들어지는가 — 타고난 중심 성향 사이의 관계와 움직이는 속도의 조합. 커플 유형(compat.type)은 이 분위기를 요약한 이름일 뿐 풀이의 근거가 아니다",
    sources: "compat.day-stem · compat.role · compat.pace · compat.type",
    paragraphs: { min: 2, max: 3 },
  },
  {
    id: "fit",
    topic: "잘 맞는 점",
    ask: "어떤 때 두 사람이 서로를 편하게 받쳐 주는가 — 근거에서 읽히는 합 · 상생 · 비어 있는 기운을 채우는 조합을 장면으로 쓴다. 근거가 약하면 늘려 쓰지 않는다",
    sources: "compat.day-stem · compat.day-branch · compat.cross.pull · compat.element.fill",
    paragraphs: { min: 2, max: 3 },
  },
  {
    id: "friction",
    topic: "부딪히기 쉬운 점",
    ask: "어떤 때 방식이 부딪히기 쉬운가와 그 순간에 도움이 되는 조율 — 누구 탓으로 쓰지 않고 \"이런 때 이렇게 달라요\"로 쓴다. 충 · 형 · 상극 같은 근거가 없으면 차이가 크지 않다고 쓰고 부딪힘을 지어내지 않는다(속도 차이처럼 근거에 있는 차이만)",
    sources: "compat.day-branch · compat.cross.clash · compat.element.overlap · compat.pace",
    paragraphs: { min: 2, max: 3 },
  },
  {
    id: "love",
    topic: "연애할 때 나타나기 쉬운 모습",
    ask: "가까워지는 속도 · 서운함이 쌓이는 방식 · 서로에게 맡기 쉬운 역할을 두 사주의 관계에서 읽는다. 두 사람의 속마음 · 상대의 감정은 쓰지 않고 \"~하기 쉬워요\"의 조건형으로만 쓴다",
    sources: "compat.day-branch · compat.role · compat.pace",
    paragraphs: { min: 2, max: 3 },
  },
  {
    id: "long",
    topic: "오래 가려면 필요한 조건",
    ask: "함께 지내는 시간이 길어졌을 때(함께 사는 생활 · 결혼생활을 포함해) 중요해질 조건과 지치기 쉬운 지점. 결혼을 하게 된다 · 언제 한다 · 헤어진다는 예언은 쓰지 않고, 조건과 조율의 방법까지 쓴다",
    sources: "compat.day-branch · compat.element.fill · compat.element.overlap · compat.pace",
    paragraphs: { min: 2, max: 3 },
  },
];

export const COMPAT_ACTION_AREAS = COMPAT_SECTIONS.map((s) => s.id);

/** 글자 · 문장 · 개수 한도 — 지시문 · 검사 · 모의 작성기가 모두 이 값을 쓴다 */
export const COMPAT_LIMITS = {
  headline: { min: 10, max: 40 },
  sectionHeadline: { min: 8, max: 30 },
  paragraph: { min: 60, max: 300, sentencesMax: 3 },
  actions: { min: 3, max: 4, titleMin: 6, titleMax: 30, detailMin: 20, detailMax: 220 },
  /** 같은 근거 ID를 쓸 수 있는 영역 수 — 한 근거가 모든 영역을 끌고 가지 않게 */
  evidenceReuseMax: 3,
  /** 한 문단에 쓸 수 있는 서로 다른 사주 용어 수 */
  termsPerParagraphMax: 2,
} as const;

/** 코드가 채우는 고정 안내 — AI가 쓰지 않는다 */
export const COMPAT_NOTES = {
  /** 하단 안내(합쇼체) */
  page: "사주 궁합은 두 사람의 출생정보에서 전통 사주 해석을 단순화한 규칙으로 읽은 참고 콘텐츠입니다. 두 사람의 실제 성격이나 마음, 관계의 결과를 알려 주지 않으며 어떤 일이 일어난다는 예측이 아닙니다.",
  rule: "궁합 규칙은 전통 해석을 단순화한 초안이며 전문가 검토 전입니다. 일상에서 실제로 어떻게 나타나는지는 확인하지 못했습니다.",
  noResponses: "이 풀이는 두 사람의 사주만 봤어요. 두 사람이 각자 답한 성격 · 기질 · 애착은 쓰지 않았어요(그 비교는 리포트 궁합이 맡아요).",
  timing: "두 사람의 시기(대운 · 세운이 겹치는 때)는 아직 계산하지 않아서 이번 풀이에 넣지 않았어요.",
  noInnerMind: "상대가 무슨 마음인지, 두 사람의 관계가 어떻게 될지는 이 풀이로 알 수 없어요.",
} as const;
