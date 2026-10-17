// 사주 궁합 리포트(유료, 아직 판매하지 않음)의 고정 구성 — 지시문(prompt.ts) · 형식 검사(validate.ts) · 모의 작성기 · 조립(assemble.ts) · 화면이 같은 값을 쓴다.
// 간단 궁합(무료, /compat)과 같은 엔진 결과(lib/saju/interpret/compat.ts)를 풀어 쓴다 — 커플 유형 · 궁합 지수 · 계산 재료는 코드가 같은 결과에서 채우고 AI는 본문만 쓴다.
// 0.3(운영자 확정 2026-10-17, 순서 6): 담을 것을 운영자가 말한 여덟 가지로 맞췄다 — ① 자연스럽게 잘 맞는 부분 ② 반복해서 부딪히기 쉬운 부분 ③ 서로 다른 표현과 행동 방식 ④ 장기 관계에서 필요한 조건
// ⑤ A님이 B님에게 해 볼 행동 ⑥ B님이 A님에게 해 볼 행동 ⑦ 함께 조율할 방법 ⑧ 실제 계산된 범위의 관계 시기 해석(두 사람 각자의 대운 · 세운 계산 결과를 나란히 놓은 것, compat-timing.ts — 근거가 있을 때만).
// 0.2 구성(영역 다섯 + 행동 3~4개)은 docs/samples/prompts/에 지시문 원문만 남아 있다. 저장되거나 판매된 글은 없다(판매하지 않음).
// 상대의 응답(기질 · 성격 · 애착)은 쓰지 않는다 — 두 사람이 각자 응답한 내용을 비교하는 것은 별도 상품(리포트 궁합)이다.

export const COMPAT_REPORT_KIND = "compat-saju-v1" as const;
export const COMPAT_PROMPT_VERSION = "compat-v1-prompt-0.4";

/**
 * 두 사람의 시기(대운 · 세운)를 계산하는가 — 계산한다(compat-timing.ts, 각자의 계산 결과를 나란히 놓는 범위). 단 근거 목록에 compat.timing.*이 있을 때만 timing 영역을 쓰고,
 * 그 밖의 영역에서는 시기 이야기(올해 · 대운 · 세운 · 연도)를 막는다. 관계가 좋아지거나 나빠지는 해 · 달 · 추천 날짜 · 두 시기가 맞물리는 해는 계산하지 않았으므로 쓰지 않는다.
 */
export const COMPAT_TIMING_BUILT = true;

export type CompatSectionId = "overview" | "fit" | "friction" | "express" | "long" | "timing" | "response";

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
  /** 근거 목록에 compat.timing.*이 있을 때만 쓰는 영역 */
  optional?: boolean;
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
    topic: "자연스럽게 잘 맞는 부분",
    ask: "어떤 때 두 사람이 서로를 편하게 받쳐 주는가 — 근거에서 읽히는 합 · 상생 · 비어 있는 기운을 채우는 조합을 장면으로 쓴다. 근거가 약하면 늘려 쓰지 않는다",
    sources: "compat.day-stem · compat.day-branch · compat.cross.pull · compat.element.fill",
    paragraphs: { min: 2, max: 3 },
  },
  {
    id: "friction",
    topic: "반복해서 부딪히기 쉬운 부분",
    ask: "어떤 때 방식이 부딪히기 쉬운가와 그 순간에 도움이 되는 조율 — 누구 탓으로 쓰지 않고 \"이런 때 이렇게 달라요\"로 쓴다. 충 · 형 · 상극 같은 근거가 없으면 차이가 크지 않다고 쓰고 부딪힘을 지어내지 않는다(속도 차이처럼 근거에 있는 차이만)",
    sources: "compat.day-branch · compat.cross.clash · compat.element.overlap · compat.pace",
    paragraphs: { min: 2, max: 3 },
  },
  {
    id: "express",
    topic: "서로 다른 표현과 행동 방식",
    ask: "가까워지는 속도 · 마음을 건네고 일을 움직이는 방식 · 서로에게 맡기 쉬운 역할이 두 사주의 관계에서 어떻게 다르게 읽히는가 — \"A님 쪽이 먼저 움직이는 쪽으로 읽혀요\"처럼 읽는 방식으로 쓰고 두 사람의 속마음 · 감정은 쓰지 않는다. 조건형(\"~하기 쉬워요\")으로만 쓴다",
    sources: "compat.pace · compat.role · compat.day-branch",
    paragraphs: { min: 2, max: 3 },
  },
  {
    id: "long",
    topic: "오래 가려면 필요한 조건",
    ask: "함께 지내는 시간이 길어졌을 때(함께 사는 생활 · 결혼생활을 포함해) 중요해질 조건과 지치기 쉬운 지점. 결혼을 하게 된다 · 언제 한다 · 헤어진다는 예언은 쓰지 않고, 조건과 조율의 방법까지 쓴다",
    sources: "compat.day-branch · compat.element.fill · compat.element.overlap · compat.pace",
    paragraphs: { min: 2, max: 3 },
  },
  {
    id: "timing",
    topic: "지금 두 사람이 지나는 시기",
    ask: "두 사람이 지금 각자 어떤 주제가 중요한 시기를 지나는지를 나란히 놓고, 주제가 겹치면 같은 이야기를 함께 하기 쉽고 다르면 서로 신경 쓰는 일이 다를 수 있다는 것까지 쓴다 — 근거(compat.timing.*)에 적힌 시기와 연도 안에서만 쓰고, 관계가 좋아지거나 나빠지는 해 · 달, 인연이 깊어지는 때, 추천 날짜, 두 시기가 맞물리는 해는 계산하지 않았으므로 쓰지 않는다",
    sources: "compat.timing.luck · compat.timing.year",
    paragraphs: { min: 1, max: 2 },
    optional: true,
  },
];

// ─── 리포트 궁합(유료 2, 2026-10-17 구현 · 판매 스위치 꺼짐) ───
// 사주 궁합과 같은 엔진 · 같은 위쪽 요약(cardOf)을 쓰고, 두 사람이 각자 직접 답한 응답을 같은 영역끼리 비교한 근거(pair.*, pair-evidence.ts)를 더해 "응답" 영역을 하나 둔다.
// 저장되는 글에는 이름 · 생년월일 · 응답 원문 · 점수가 없다 — 본문은 "A님 · B님"이고 화면이 읽는 사람에게 누가 누구인지 알려 준다.
export const PAIR_REPORT_KIND = "compat-pair-v1" as const;
export const PAIR_PROMPT_VERSION = "pair-v1-prompt-0.2";

const RESPONSE_SECTION: CompatSectionPlan = {
  id: "response",
  topic: "각자 답한 내용으로 본 두 사람",
  ask: "두 사람이 각자 직접 답한 응답의 방향이 같은 쪽인 영역에서는 어떤 장면에서 닮게 반응하기 쉬운지, 서로 다른 쪽인 영역에서는 어떤 장면에서 어긋나기 쉽고 어떻게 서로 보완할 수 있는지를 사주에서 읽은 관계와 이어서 쓴다. 근거(pair.*)에 적힌 영역만 쓰고 점수 · 문항 문장 · 원래 답을 옮기지 않으며 애착 유형 이름으로 부르지 않는다. 응답이 사주와 다르면 차이를 지우지 않고 상황별 차이로 설명한다",
  sources: "pair.*",
  paragraphs: { min: 2, max: 3 },
  optional: true,
};

/** 리포트 궁합의 영역 순서 — 사주 궁합의 영역에 응답 영역(근거가 있을 때만)을 "서로 다른 표현과 행동 방식" 다음에 끼운다 */
export const PAIR_SECTIONS: CompatSectionPlan[] = [...COMPAT_SECTIONS.slice(0, 4), RESPONSE_SECTION, ...COMPAT_SECTIONS.slice(4)];

/** 응답 영역을 쓸 만한 비교 근거가 있는가 — 비교한 응답(pair.mbti가 아닌 pair.*)이 하나 이상. 입력한 MBTI 비교만으로는 영역을 만들지 않는다 */
export const hasPairResponseEvidence = (evidence: { id: string; uncertain?: boolean }[]): boolean => evidence.some((e) => e.id.startsWith("pair.") && e.id !== "pair.mbti" && !e.uncertain);

/** 이번 근거로 써야 하는 리포트 궁합의 영역 — 응답 근거가 없으면 response를, 시기 근거가 없으면 timing을 뺀다 */
export const pairSectionsFor = (evidence: { id: string; uncertain?: boolean }[]): CompatSectionPlan[] =>
  PAIR_SECTIONS.filter((s) => (s.id === "response" ? hasPairResponseEvidence(evidence) : !s.optional || hasTimingEvidence(evidence)));

/** 가짜 AI 서버 · 모의 작성기가 리포트 궁합 요청을 알아보는 표지 */
export const PAIR_PROMPT_MARK = "[미유 리포트 궁합]";

/** 코드가 채우는 리포트 궁합의 고정 안내 — AI가 쓰지 않는다 */
export const PAIR_NOTES = {
  page: "리포트 궁합은 두 사람의 출생정보에서 전통 사주 해석을 단순화한 규칙으로 읽은 관계에, 두 사람이 각자 직접 답한 응답의 방향을 같은 영역끼리 비교해 더한 참고 콘텐츠입니다. 두 사람의 실제 성격이나 마음, 관계의 결과를 알려 주지 않으며 어떤 일이 일어난다는 예측이 아닙니다.",
  privacy: "상대의 원래 답 · 개인 리포트 · 상담 내용은 이 풀이에도 보이지 않아요. 두 사람이 모두 뚜렷하게 답한 영역의 방향(같은 쪽 · 다른 쪽)만 썼어요.",
  /** 한쪽만 뚜렷하게 답해 비교하지 않은 영역이 있을 때 */
  skipped: "한쪽만 뚜렷하게 답한 영역은 비교하지 않았어요. 없는 응답을 짐작해 채우지 않았어요.",
  /** 비교할 영역이 하나도 없을 때 */
  noCompared: "두 사람이 모두 뚜렷하게 답한 영역이 없어서 이번 풀이는 사주 궁합과 같은 사주 중심으로만 썼어요.",
} as const;

/** 행동 묶음 셋 — 운영자가 말한 "A가 B에게 해 볼 행동 · B가 A에게 해 볼 행동 · 함께 조율할 방법" */
export type CompatStepGroupId = "aToB" | "bToA" | "together";

export const COMPAT_STEP_GROUPS: { id: CompatStepGroupId; label: string; ask: string }[] = [
  { id: "aToB", label: "A님이 B님에게 해 볼 행동", ask: "근거에서 읽히는 B님 쪽의 방식(예: 확인하고 움직이는 쪽)에 맞춰 A님이 먼저 바꿔 볼 수 있는 작은 행동 — B님을 고치라는 말이 아니라 A님이 해 볼 수 있는 것" },
  { id: "bToA", label: "B님이 A님에게 해 볼 행동", ask: "근거에서 읽히는 A님 쪽의 방식에 맞춰 B님이 먼저 바꿔 볼 수 있는 작은 행동 — A님을 고치라는 말이 아니라 B님이 해 볼 수 있는 것" },
  { id: "together", label: "함께 조율할 방법", ask: "두 사람이 같이 정해 두면 좋은 약속 · 순서 · 신호 — 한쪽이 아니라 둘이 함께 하는 것" },
];

/** 글자 · 문장 · 개수 한도 — 지시문 · 검사 · 모의 작성기가 모두 이 값을 쓴다 */
export const COMPAT_LIMITS = {
  headline: { min: 10, max: 40 },
  sectionHeadline: { min: 8, max: 30 },
  paragraph: { min: 60, max: 300, sentencesMax: 3 },
  /** 행동 묶음마다 개수 · 글자 수 — say는 서로에게 건넬 짧은 말 한 문장 */
  steps: { perGroup: { min: 1, max: 2 }, titleMin: 6, titleMax: 30, detailMin: 20, detailMax: 220, sayMin: 8, sayMax: 50 },
  /** 같은 근거 ID를 쓸 수 있는 영역 수 — 한 근거가 모든 영역을 끌고 가지 않게 */
  evidenceReuseMax: 3,
  /** 한 문단에 쓸 수 있는 서로 다른 사주 용어 수 */
  termsPerParagraphMax: 2,
} as const;

/** 근거 목록에 두 사람의 시기(compat.timing.*)가 있는가 — 있으면 timing 영역을 써야 하고 없으면 쓰지 않는다 */
export const hasTimingEvidence = (evidence: { id: string; uncertain?: boolean }[]): boolean => evidence.some((e) => e.id.startsWith("compat.timing.") && !e.uncertain);

/** 이번 근거로 써야 하는 영역 — 시기 근거가 없으면 timing을 뺀 다섯 개 */
export const sectionsFor = (evidence: { id: string; uncertain?: boolean }[]): CompatSectionPlan[] => COMPAT_SECTIONS.filter((s) => !s.optional || hasTimingEvidence(evidence));

/** 코드가 채우는 고정 안내 — AI가 쓰지 않는다 */
export const COMPAT_NOTES = {
  /** 하단 안내(합쇼체) */
  page: "사주 궁합은 두 사람의 출생정보에서 전통 사주 해석을 단순화한 규칙으로 읽은 참고 콘텐츠입니다. 두 사람의 실제 성격이나 마음, 관계의 결과를 알려 주지 않으며 어떤 일이 일어난다는 예측이 아닙니다.",
  rule: "궁합 규칙은 전통 해석을 단순화한 초안이며 전문가 검토 전입니다. 일상에서 실제로 어떻게 나타나는지는 확인하지 못했습니다.",
  noResponses: "이 풀이는 두 사람의 사주만 봤어요. 두 사람이 각자 답한 성격 · 기질 · 애착은 쓰지 않았어요(그 비교는 리포트 궁합이 맡아요).",
  /** 시기 영역을 쓴 경우 */
  timingUsed: "시기 풀이는 두 사람 각자의 대운 · 세운 계산 결과를 일간 기준으로 읽어 나란히 놓은 것이에요. 관계가 좋아지거나 나빠지는 때, 추천 날짜, 두 시기가 맞물리는 해는 계산하지 않았어요.",
  /** 시기 근거를 만들지 못한 경우(성별 입력이 없는 등) */
  timingMissing: "두 사람의 시기(대운)는 성별 입력이 없는 등의 이유로 계산하지 못해 이번 풀이에서 뺐어요.",
  noInnerMind: "상대가 무슨 마음인지, 두 사람의 관계가 어떻게 될지는 이 풀이로 알 수 없어요.",
} as const;
