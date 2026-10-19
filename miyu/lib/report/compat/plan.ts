// 사주 궁합 · 리포트 궁합(유료, 아직 판매하지 않음)의 고정 구성 — 지시문(prompt.ts) · 형식 검사(validate.ts) · 모의 작성기 · 조립(assemble.ts) · 화면이 같은 값을 쓴다.
// 간단 궁합(무료, /compat)과 같은 엔진 결과(lib/saju/interpret/compat.ts)를 풀어 쓴다 — 커플 유형 · 궁합 지수 · 계산 재료는 코드가 같은 결과에서 채우고 AI는 본문만 쓴다.
// 0.5 / 0.3(운영자 확정 2026-10-17, 유료 궁합 구성 최종 정리): **7개 대주제** — 1 우리의 궁합 한눈에 보기 · 2 두 사람의 사주와 오행 조화 · 3 우리가 잘 맞는 부분 · 4 우리가 부딪히는 부분 · 5 연애와 결혼 궁합 ·
//   6 서로에게 어떤 사람일까?(리포트 궁합만 — 두 사람이 각자 직접 답한 응답 비교) · 7 오래 잘 만나기 위한 조언(전통 개운법 + A님 → B님 · B님 → A님 · 함께 정할 약속 + 서로에게 물어볼 추천 질문).
//   사주 궁합은 6번을 뺀 여섯 장이고 리포트 궁합은 같은 여섯 장에 6번을 더한 일곱 장이다(리포트 궁합 = 사주 궁합 풀이 + 응답 비교). 응답은 사주 풀이를 대체하지 않고 그 읽기를 구체화하는 보조다.
//   이전 구성(overview · fit · friction · express · long · timing · response)은 지시문 원문만 남아 있다(docs/samples/prompts/). 저장되거나 판매된 글은 없다(판매하지 않음).
//   시기(compat.timing.*)는 5번 장의 한 문단으로 들어갔다 — 계산된 대운 · 세운 범위 안에서만. **가족 · 자녀 인연의 풀이는 계산하지 않았다**(시주 · 자녀 자리의 궁합 규칙이 엔진에 없고 출산 · 자녀 예언은 기존 금지 규칙이다 — 운영자 결정 항목, docs/compat-composition-v2.md).
// 상대의 응답(기질 · 성격 · 애착)은 사주 궁합에 쓰지 않는다 — 두 사람이 각자 응답한 내용을 비교하는 것은 별도 상품(리포트 궁합)이다.

import type { CompatRelationship } from "../../compat/relationship.ts";

export const COMPAT_REPORT_KIND = "compat-saju-v1" as const;
export const COMPAT_PROMPT_VERSION = "compat-v1-prompt-0.7";

/**
 * 두 사람의 시기(대운 · 세운)를 계산하는가 — 계산한다(compat-timing.ts, 각자의 계산 결과를 나란히 놓는 범위). 근거 목록에 compat.timing.*이 있으면 5번 장(연애와 결혼 궁합)이 한 문단으로 쓰고,
 * 그 밖의 장에서는 시기 이야기(올해 · 대운 · 세운 · 연도)를 막는다. 관계가 좋아지거나 나빠지는 해 · 달 · 추천 날짜 · 두 시기가 맞물리는 해는 계산하지 않았으므로 쓰지 않는다.
 */
export const COMPAT_TIMING_BUILT = true;

export type CompatSectionId = "overview" | "harmony" | "fit" | "friction" | "love" | "view" | "advice";

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
  /** 근거 목록에 해당 근거가 있을 때만 쓰는 장(지금은 없다 — 시기는 5번 장 안의 한 문단이다) */
  optional?: boolean;
  /** 리포트 궁합에만 있는 장 */
  pairOnly?: boolean;
};

const ALL_SECTIONS: CompatSectionPlan[] = [
  {
    id: "overview",
    topic: "우리의 궁합 한눈에 보기",
    ask: "두 사람이 함께 있을 때 가장 두드러지는 모습 하나를 headline으로 잡아, 그 모습이 어떤 상황에서 나타나는지 풀어 쓴다(근거는 일간 사이 · 일지 사이 · 속도 중 가장 뚜렷한 것). 커플 유형 이름 · 지수는 화면이 보여 주므로 되풀이하지 않는다",
    sources: "compat.day-stem · compat.day-branch · compat.pace · compat.type",
    paragraphs: { min: 2, max: 3 },
  },
  {
    id: "harmony",
    topic: "두 사람의 사주와 오행 조화",
    ask: "각자 오행 분포(compat.chart)는 개수 · 있고 없음을 나열하지 않고, 서로 비어 있는 쪽을 채우는지 · 같은 쪽이 겹치는지 · 두 일간 사이(같은 기운 · 상생 · 상극 · 합)가 함께 정할 때 일을 나누고 서로의 방식을 확인하는 모습으로 쓴다(능력이 없다고 단정하지 않는다). 시주를 모르는 사람은 세 기둥 기준임을 밝힌다. 개운(색 · 방향)은 7번 장의 몫이다",
    sources: "compat.chart · compat.day-stem · compat.element.fill · compat.element.overlap",
    paragraphs: { min: 2, max: 4 },
  },
  {
    id: "fit",
    topic: "우리가 잘 맞는 부분",
    ask: "어떤 상황에서 두 사람이 서로 편하게 이어지는가 — 합 · 상생 · 비어 있는 기운을 채우는 조합이 실제로 뜻하는 모습(가까이 있을 때 · 함께 계획할 때 · 일과 생활)을 장면으로 쓴다. 근거가 약하면 늘려 쓰지 않는다",
    sources: "compat.day-stem · compat.day-branch · compat.cross.pull · compat.element.fill",
    paragraphs: { min: 2, max: 3 },
  },
  {
    id: "friction",
    topic: "우리가 부딪히는 부분",
    ask: "어떤 상황에서 방식이 달라지기 쉬운가와 그때 도움이 되는 조율 — 누구 탓으로 쓰지 않고 \"이런 때 이렇게 달라요\"로 쓴다. 충 · 형 · 상극 같은 근거가 없으면 차이가 크지 않다고 쓰고 부딪힘을 지어내지 않는다(속도 차이처럼 근거에 있는 차이만)",
    sources: "compat.day-branch · compat.cross.clash · compat.element.overlap · compat.pace",
    paragraphs: { min: 2, max: 3 },
  },
  {
    id: "love",
    topic: "연애와 결혼 궁합",
    ask: "애정 표현과 연애 관계(가까운 사이의 분위기와 compat.role이 읽는 서로의 자리를 용어 대신 두 사람의 행동으로) · 오래 함께할 때의 생활 방식과 조건(함께 사는 생활 · 결혼생활을 포함해, 월지 · 년지끼리의 합 · 충을 \"가족 · 생활 환경 쪽 기준이 맞닿는지 부딪히는지\"로 조건형으로 한 번) · 근거에 compat.timing.*이 있으면 지금 각자 지나는 시기의 주제가 겹치는지 다른지를 마지막 한 문단으로. 결혼을 하게 된다 · 언제 한다 · 헤어진다 · 자녀 · 출산 이야기는 쓰지 않는다(계산하지 않았다)",
    sources: "compat.day-branch · compat.day-stem · compat.role · compat.cross.pull · compat.cross.clash · compat.pace · compat.timing.*",
    paragraphs: { min: 3, max: 4 },
  },
  {
    id: "view",
    topic: "서로에게 어떤 사람일까?",
    ask: "한 사람이 상대에게 어떤 모습으로 느껴지기 쉬운지를 사주(compat.role — A 기준 B의 자리 · compat.pace)와 두 사람이 각자 직접 답한 응답(pair.*)이 같은 쪽 · 다른 쪽인 영역으로 풀어 쓴다. 응답은 사주 풀이를 대체하지 않고 그 읽기가 두 사람에게 어떤 장면으로 나타나는지 구체화하며, 사주와 다르면 차이를 지우지 않고 상황별 차이로 설명한다. 상대의 속마음 · 생각 단정 · 애착 유형 이름 · 원래 답 · 점수 · 문항을 쓰지 않는다. 비교한 응답이 없으면 사주만으로 쓴다",
    sources: "compat.role · compat.pace · pair.*",
    paragraphs: { min: 2, max: 3 },
    pairOnly: true,
  },
  {
    id: "advice",
    topic: "오래 잘 만나기 위한 조언",
    ask: "① 두 사람이 함께 쓸 수 있는 전통 개운법 — compat.fortify에 적힌 보완 후보 기운의 방향 · 색 · 숫자 · 장소를 함께 머무는 공간 · 만나는 장소 · 소품 · 산책 방향으로 옮겨 쓴다(임의로 다른 기운을 쓰지 않는다) ② 이유 있는 방향 한 문단. A님이 B님에게 · B님이 A님에게 · 함께 정할 약속은 steps에, 서로에게 물어보면 좋은 추천 질문은 questions에 쓴다",
    sources: "compat.fortify · compat.pace · compat.day-branch",
    paragraphs: { min: 1, max: 2 },
  },
];

/**
 * 5번 장(love)의 제목 위 이름표 — 알려 준 사이에 맞게 바꾼다(친구 · 기타에 "연애와 결혼"을 붙이지 않는다). 장의 id · 질문(ask) · 근거는 그대로이고 이름표만 바뀐다.
 * 사이가 없는(이 기능 이전의) 글은 예전 이름표 그대로다.
 */
const LOVE_TOPIC: Record<CompatRelationship, string> = {
  lover: "연애와 오래 함께하는 방식",
  engaged: "결혼 준비와 생활 합의",
  some: "다가가는 속도와 서로의 선",
  married: "함께 사는 일상과 회복",
  friend: "우정과 오래 가는 거리감",
  other: "오래 함께 지내는 방식",
};
export const topicFor = (plan: Pick<CompatSectionPlan, "id" | "topic">, rel: CompatRelationship | null | undefined): string => (plan.id === "love" && rel ? LOVE_TOPIC[rel] : plan.topic);

/** 사주 궁합의 장 — 6번(서로에게 어떤 사람일까?)을 뺀 여섯 장 */
export const COMPAT_SECTIONS: CompatSectionPlan[] = ALL_SECTIONS.filter((s) => !s.pairOnly);

// ─── 리포트 궁합(유료 2, 2026-10-17 구현 · 판매 스위치 꺼짐) ───
// 사주 궁합과 같은 엔진 · 같은 위쪽 요약(cardOf) · 같은 여섯 장에, 두 사람이 각자 직접 답한 응답을 같은 영역끼리 비교한 근거(pair.*, pair-evidence.ts)로 6번 "서로에게 어떤 사람일까?"를 더한다.
// 저장되는 글에는 이름 · 생년월일 · 응답 원문 · 점수가 없다 — 본문은 "A님 · B님"이고 화면이 읽는 사람에게 누가 누구인지 알려 준다.
export const PAIR_REPORT_KIND = "compat-pair-v1" as const;
export const PAIR_PROMPT_VERSION = "pair-v1-prompt-0.5";

/** 리포트 궁합의 장 — 일곱 장 모두 항상 쓴다(비교한 응답이 없으면 6번은 사주만으로, 응답을 지어내지 않는다) */
export const PAIR_SECTIONS: CompatSectionPlan[] = ALL_SECTIONS;

/** 응답 근거가 6번 장에 쓸 만한 비교(pair.mbti가 아닌 pair.*)가 하나 이상 있는가. 입력한 MBTI 비교만으로는 응답 풀이를 만들지 않는다 */
export const hasPairResponseEvidence = (evidence: { id: string; uncertain?: boolean }[]): boolean => evidence.some((e) => e.id.startsWith("pair.") && e.id !== "pair.mbti" && !e.uncertain);

/** 이번 근거로 써야 하는 리포트 궁합의 장 — 일곱 장 모두(근거가 있고 없음은 6번 장이 무엇을 인용해야 하는지만 바꾼다) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 이전 구성과 같은 호출 모양을 유지한다(근거에 따라 장이 바뀌지 않는다)
export const pairSectionsFor = (_evidence: { id: string; uncertain?: boolean }[] = []): CompatSectionPlan[] => PAIR_SECTIONS;

/** 가짜 AI 서버 · 모의 작성기가 리포트 궁합 요청을 알아보는 표지 */
export const PAIR_PROMPT_MARK = "[미유 리포트 궁합]";

/** 코드가 채우는 리포트 궁합의 고정 안내 — AI가 쓰지 않는다 */
export const PAIR_NOTES = {
  page: "리포트 궁합은 두 사람의 출생정보에서 전통 사주 해석을 단순화한 규칙으로 읽은 관계에, 두 사람이 각자 직접 답한 응답의 방향을 같은 영역끼리 비교해 더한 참고 콘텐츠입니다. 두 사람의 실제 성격이나 마음, 관계의 결과를 알려 주지 않으며 어떤 일이 일어난다는 예측이 아닙니다.",
  privacy: "상대의 원래 답 · 개인 리포트 · 상담 내용은 이 풀이에도 보이지 않아요. 두 사람이 모두 뚜렷하게 답한 영역의 방향(같은 쪽 · 다른 쪽)만 썼어요.",
  /** 한쪽만 뚜렷하게 답해 비교하지 않은 영역이 있을 때 */
  skipped: "한쪽만 뚜렷하게 답한 영역은 비교하지 않았어요. 없는 응답을 짐작해 채우지 않았어요.",
  /** 비교할 영역이 하나도 없을 때 */
  noCompared: "두 사람이 모두 뚜렷하게 답한 영역이 없어서 이번 풀이의 6번은 사주 궁합과 같은 사주 중심으로만 썼어요.",
} as const;

/** 행동 묶음 셋 — 운영자가 말한 "A가 B에게 해 볼 행동 · B가 A에게 해 볼 행동 · 함께 정할 약속" */
export type CompatStepGroupId = "aToB" | "bToA" | "together";

export const COMPAT_STEP_GROUPS: { id: CompatStepGroupId; label: string; ask: string }[] = [
  { id: "aToB", label: "A님이 B님에게 해 볼 행동", ask: "근거에서 읽히는 B님 쪽의 방식(예: 확인하고 움직이는 쪽)에 맞춰 A님이 먼저 바꿔 볼 수 있는 작은 행동 — B님을 고치라는 말이 아니라 A님이 해 볼 수 있는 것" },
  { id: "bToA", label: "B님이 A님에게 해 볼 행동", ask: "근거에서 읽히는 A님 쪽의 방식에 맞춰 B님이 먼저 바꿔 볼 수 있는 작은 행동 — A님을 고치라는 말이 아니라 B님이 해 볼 수 있는 것" },
  { id: "together", label: "함께 정할 약속", ask: "두 사람이 같이 정해 두면 좋은 약속 · 순서 · 신호 — 한쪽이 아니라 둘이 함께 하는 것" },
];

/** 글자 · 문장 · 개수 한도 — 지시문 · 검사 · 모의 작성기가 모두 이 값을 쓴다 */
export const COMPAT_LIMITS = {
  headline: { min: 10, max: 46 },
  sectionHeadline: { min: 8, max: 38 },
  /** 명리 풀이를 충분히 쓰도록 문단을 조금 넓혔다(한 문단 4문장 · 360자) */
  paragraph: { min: 60, max: 360, sentencesMax: 4 },
  /** 행동 묶음마다 개수 · 글자 수 — say는 서로에게 건넬 짧은 말 한 문장 */
  steps: { perGroup: { min: 1, max: 2 }, titleMin: 6, titleMax: 30, detailMin: 20, detailMax: 220, sayMin: 8, sayMax: 50 },
  /** 7번 장의 추천 질문 — 서로에게 물어보면 좋은 질문(상대의 속마음을 단정하지 않는다) */
  questions: { min: 2, max: 3, textMin: 12, textMax: 60 },
  /** 같은 근거 ID를 쓸 수 있는 장 수 — 장이 일곱이라 넓혔다(한 근거가 거의 모든 장을 끌고 가는 경우만 걸러낸다). 같은 명리 근거가 여러 장에서 쓰여도 장마다 새로운 해석이면 허용하고(운영자 2026-10-17), 새 정보 없이 되풀이하는지는 사람이 읽고 판단한다 */
  evidenceReuseMax: 5,
  /** 사주 용어 한도 — 지시문 0.6 · 0.4부터 본문에는 명리 용어를 쓰지 않는 쪽이고(고객이 읽는 글), 이 한도는 용어가 새어 나왔을 때의 경고(WARN) 기준이다(설명 없는 용어 · 근거 없는 판정은 그대로 막는다, terms.ts) */
  terms: { perSentenceMax: 3, perParagraphMax: 4, firstParagraphMax: 2 },
} as const;

/** 근거 목록에 두 사람의 시기(compat.timing.*)가 있는가 — 있으면 5번 장이 한 문단으로 쓰고 없으면 시기를 말하지 않는다 */
export const hasTimingEvidence = (evidence: { id: string; uncertain?: boolean }[]): boolean => evidence.some((e) => e.id.startsWith("compat.timing.") && !e.uncertain);

/** 이번 근거로 써야 하는 사주 궁합의 장 — 근거와 상관없이 여섯 장 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 이전 구성과 같은 호출 모양을 유지한다(근거에 따라 장이 바뀌지 않는다)
export const sectionsFor = (_evidence: { id: string; uncertain?: boolean }[] = []): CompatSectionPlan[] => COMPAT_SECTIONS;

/** 코드가 채우는 고정 안내 — AI가 쓰지 않는다 */
export const COMPAT_NOTES = {
  /** 하단 안내(합쇼체) */
  page: "사주 궁합은 두 사람의 출생정보에서 전통 사주 해석을 단순화한 규칙으로 읽은 참고 콘텐츠입니다. 두 사람의 실제 성격이나 마음, 관계의 결과를 알려 주지 않으며 어떤 일이 일어난다는 예측이 아닙니다.",
  rule: "궁합 규칙은 전통 해석을 단순화한 초안이며 전문가 검토 전입니다. 일상에서 실제로 어떻게 나타나는지는 확인하지 못했습니다.",
  noResponses: "이 풀이는 두 사람의 사주만 봤어요. 두 사람이 각자 답한 성격 · 기질 · 애착은 쓰지 않았어요(그 비교는 리포트 궁합이 맡아요).",
  /** 시기 문단을 쓴 경우 */
  timingUsed: "시기 풀이는 두 사람 각자의 대운 · 세운 계산 결과를 일간 기준으로 읽어 나란히 놓은 것이에요. 관계가 좋아지거나 나빠지는 때, 추천 날짜, 두 시기가 맞물리는 해는 계산하지 않았어요.",
  /** 시기 근거를 만들지 못한 경우(성별 입력이 없는 등) */
  timingMissing: "두 사람의 시기(대운)는 성별 입력이 없는 등의 이유로 계산하지 못해 이번 풀이에서 뺐어요.",
  noInnerMind: "상대가 무슨 마음인지, 두 사람의 관계가 어떻게 될지는 이 풀이로 알 수 없어요.",
  /** 가족 · 자녀 인연은 계산하지 않았다 — 7개 대주제 구성에 있는 항목이지만 근거 없이 쓰지 않았다는 것을 밝힌다(5번 장 아래) */
  noFamilyChild: "가족 · 자녀 인연은 계산하지 않았어요. 월지 · 년지 사이의 합 · 충을 가족 · 생활 환경 쪽 기준이 맞닿는지 부딪히는지로만 읽었어요.",
} as const;
