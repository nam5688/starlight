// 읽기 구조 리포트의 고정 구성 — 예시 화면(sample-reading-report.ts)과 실제 AI 생성이 같은 구성 · 같은 한도를 쓴다.
// 제목 · 묶음 · 이름표 · 안전 안내는 AI가 쓰지 않고 여기서 정한다(코드가 채운다). AI는 근거 목록 안에서 본문만 쓴다.
import { GROUP_THEME_SHORT } from "../../saju/interpret/rules.ts";
import type { ReadingBlockId, ReadingGroupId } from "./types.ts";

export type BlockPlan = {
  id: ReadingBlockId;
  group: ReadingGroupId;
  /** 제목 위의 작은 이름표 (화면의 주제 이름) */
  topic: string;
  /** AI에게 주는 질문 — 이 주제가 답해야 하는 것 */
  ask: string;
  /** 이 주제는 특징 카드 3개를 쓴다 */
  traits?: true;
  /** 이 주제는 상대 없이 보는 관계 스타일(편안한 조건 · 부딪히는 상황)과 반응 단계 그림을 쓴다 */
  relation?: true;
  /** 이 주제는 기본 화면에 "예를 들면" 예시 1개를 둔다 */
  example: boolean;
  /** 깊게 읽는 소단락 — 소단락마다 답해야 하는 질문. 개수가 곧 필수 개수다(서로 다른 질문 · 다른 근거 · 다른 장면) */
  sections?: { ask: string }[];
};

export const BLOCK_PLAN: BlockPlan[] = [
  {
    id: "tendency",
    group: "me",
    topic: "생각과 행동 방식",
    ask: "새로운 일 · 불확실함 앞에서 어떻게 움직이는가. 사주에서 읽은 집중 · 신중함과 응답에서 읽은 경향이 어떻게 겹치거나 달라지는가",
    example: true,
  },
  {
    id: "strength-burden",
    group: "me",
    topic: "강한 포인트와 힘들 수 있는 포인트",
    ask: "이 사람의 특징 세 가지가 어떤 때 강하게 쓰이고(내가 강한 포인트) 어떤 때 힘들어지는가(내가 힘들 수 있는 포인트). 특징마다 가상의 장면 하나",
    traits: true,
    example: false,
  },
  {
    id: "values",
    group: "me",
    topic: "부딪히는 상황과 회복",
    ask: "근거에서 읽히는 중요하게 여기는 것이 어떤 상황에서 부딪히는가(갈등이 생기는 조건 · 스트레스가 쌓이는 과정 · 평소 강점이 부담으로 바뀌는 순간)와, 이 사람에게 맞는 회복 방법 (사실이 아니라 가설로, 진단이 아니라 사주에서 읽은 부담과 반응 방식을 이은 풀이로)",
    example: true,
  },
  {
    id: "love",
    group: "relation",
    topic: "가까운 관계",
    ask: "가까운 사람 앞에서의 반응과, 관계가 불확실해 보일 때 반응이 이어지는 모습. 상대 자료는 없으므로 상대 없이 본다 (상대의 마음 · 나이 · 직업 · 만날 날짜는 쓰지 않는다)",
    relation: true,
    example: false,
    sections: [
      { ask: "끌리는 사람과 오래 편한 사람이 어떻게 다를 수 있는가, 오래 가는 관계 · 결혼생활에서 중요해질 조건은 무엇인가 — 배우자 자리 · 응답에서 읽히는 편한 관계의 모습을, 조건과 장면 하나로. 상대의 나이 · 직업 · 마음, 결혼 여부 · 시기는 쓰지 않는다" },
      { ask: "알아가는 동안의 나의 속도 — 어떤 상황에서 마음이 앞서고 어떤 상황에서 멈추는가. 반응 단계 그림(상대의 답이 늦을 때)과 다른 장면으로, 해 볼 것은 속도를 맞추는 방법" },
      { ask: "서운하거나 부딪혔을 때 풀어 가는 방식 — 바로 말할 때와 혼자 정리할 때 전개가 어떻게 달라질 수 있는가(조건 → 가능성). 상대가 왜 그랬는지는 알 수 없다는 선을 지킨다" },
    ],
  },
  {
    id: "work-money",
    group: "work",
    topic: "일과 돈",
    ask: "일하는 방식 · 재능이 잘 발휘되는 조건과 막히는 조건, 돈을 대하는 모습 (소비 · 저축 습관을 직접 물어본 응답은 없다 — 이 사실을 알리는 안내는 코드가 한곳에 붙이니 본문에서 되풀이하지 않는다)",
    example: true,
    sections: [
      { ask: "만들어 낸 결과물이 성과 · 수입으로 이어지는 방식 — 근거가 있을 때만, 어떤 조건에서 이어지고 어떤 조건에서 멈추는가. 수입이 늘거나 준다는 예언은 쓰지 않는다" },
      { ask: "지금 지나는 시기가 일과 돈에서 무엇을 주제로 읽히는가와, 그 시기에 챙길 관리 습관 하나. 시기는 사건 예언이 아니며 계산된 시기 근거 안에서만, 투자 · 대출 판단은 쓰지 않는다" },
      { ask: "일을 고를 때 확인해 볼 기준 질문 — 업종 이름을 추천하지 않고 힘이 나는 환경 · 반응을 받을 자리 · 속도를 기준으로 삼는 방법" },
    ],
  },
];

export const FLOW_TOPIC = "앞으로의 시기";

/**
 * 코드가 채우는 고정 문구 — AI가 쓰지 않는다. 예시 화면(sample-reading-report.ts)도 같은 문구를 가져다 쓴다(예시와 실제 생성이 어긋나지 않게).
 * 이름이 들어가는 문구는 함수다 (이름 뒤의 " 님"은 띄어 쓴다).
 */
// 한계 안내는 주제마다 되풀이하지 않고 하단 한곳(PAGE_NOTE)에 모은다(운영자 2026-10-16). 여기에는 자료가 실제로 없는 곳만 남긴다 — 상대 자료 · 돈에 직접 물어본 응답.
export const BLOCK_CAVEAT: Partial<Record<ReadingBlockId, (name: string) => string>> = {
  love: (name) => `상대 자료: 없음 · 이 부분은 ${name} 님의 사주와 응답만으로 읽었어요.`,
  "work-money": () => "돈 부분은 소비 · 저축 습관을 직접 물은 응답이 아니라 사주의 재물 해석과 평소 행동 경향을 이어 읽었어요. 투자나 대출 결정의 근거가 아니에요.",
};
/** 하단 안내 — 개인 통합 리포트의 한계 안내를 한곳에 모은다 (합쇼체) */
export const PAGE_NOTE = "미유는 전통 사주 해석과 개인 응답을 바탕으로 성향과 삶의 흐름을 읽는 참고 콘텐츠입니다. 실제 경험과 미래는 개인의 선택과 환경에 따라 달라질 수 있습니다.";
export const comfortNote = (name: string) => `${name} 님이 편안해할 관계의 조건이에요. 상대의 나이나 직업은 정해서 말하지 않고, 편안해할 만한 관계의 조건만 읽어요.`;
/** 월별 달력이 있는 리포트에서 소단락 아래에 붙이는 안내 — 달 이름은 계산된 달력이 말하고 본문은 쓰지 않는다 */
export const SECTION_CALENDAR_NOTE: Partial<Record<ReadingBlockId, string>> = {
  love: "연애운이 강해지는 달은 ‘앞으로의 시기’의 월별 달력에서 볼 수 있어요.",
  "work-money": "재물 주제가 눈에 띄기 쉬운 달은 ‘앞으로의 시기’의 월별 달력에서 볼 수 있어요.",
};
export const FLOW_CAVEAT = "전통 해석으로 본 시기와, 응답에서 읽은 가능성이에요. 어떤 일이 일어난다는 예측이 아니고, 실제 일이나 결과를 보장하지 않아요.";
export const SCENARIO_NOTE = "응답에서 읽은 가능성이고, 그렇게 된다는 예측이 아니에요.";
export const STATISTICS_NOTE = "이번 리포트에는 연구 통계를 쓰지 않았어요. 출처와 조사 대상 · 조건이 확인된 통계가 없고, 집단의 통계를 한 사람의 앞날 확률로 바꿀 수도 없어요.";
export const RULE_DRAFT_NOTE = "사주 해석 규칙은 전문가 검토 전 초안이며, 일상에서 실제로 어떻게 나타나는지는 확인하지 못했습니다.";
export const SCORE_NOTE = "괄호 안 숫자는 응답 환산값(0~100)이며 백분위가 아닙니다. 개발용 예시 문항입니다.";

/** 첫 화면 카드 이름 */
export const CARD_LABEL = { strength: "내가 강한 포인트", caution: "내가 힘들 수 있는 포인트", flow: "지금 나의 시기" } as const;

/** 글자 · 문장 수 한도 — 검사(validate.ts) · 지시문(prompt.ts) · 모의 작성기 · 예시 테스트가 모두 이 값을 쓴다 */
export const READING_LIMITS = {
  headline: { min: 10, max: 40 },
  blockHeadline: { min: 8, max: 30 },
  card: { keywordMax: 18, noteMin: 12, noteMax: 60 },
  summary: { min: 40, max: 220, sentencesMax: 2 },
  example: { min: 30, max: 260, sentencesMax: 3 },
  details: { min: 1, max: 3, textMin: 40, textMax: 520, sentencesMax: 3 },
  watch: { min: 20, max: 300 },
  /** 깊게 읽는 소단락: 한 줄 제목 · 풀이(조건이 있는 2~3문장) · 해 볼 것(실제로 하는 행동 1~2문장) */
  sections: { title: { min: 8, max: 30 }, body: { min: 60, max: 300, sentencesMax: 3 }, tryIt: { min: 20, max: 160, sentencesMax: 2 } },
  trait: { count: 3, nameMax: 12, shortMax: 16, longMin: 20, longMax: 130, exampleMin: 20, exampleMax: 150, exampleSentencesMax: 2 },
  comfort: { count: 3, itemMin: 8, itemMax: 40 },
  reactionFlow: { whenMax: 30, steps: 4, stepTextMax: 30, helpfulMin: 30, helpfulMax: 220 },
  flow: { headlineMax: 30, summaryMin: 40, summaryMax: 220, cardTextMin: 40, cardTextMax: 260, years: { min: 1, max: 3, themeMax: 40 }, periods: { min: 1, max: 4, themeMin: 20, themeMax: 220, watchMin: 15, watchMax: 160 }, scenarios: { min: 2, max: 3, whenMax: 90, thenMax: 220 } },
  actions: { min: 3, max: 4, titleMax: 30, detailMin: 20, detailMax: 220 },
  focus: { min: 1, max: 3, textMin: 80, textMax: 520 },
} as const;

/**
 * 읽는 사람 화면의 본문에 쓰지 않는 사주 전문 용어 — 한자 · 뜻풀이는 접어 둔 "분석 근거"에만 둔다.
 * (예시 화면도 같은 규칙이며 sample-reading-report.test.ts가 확인한다.)
 */
// 해요체 · 일상어와 겹치는 낱말은 걸리지 않게 한다: "주는 편인데" · "상관없이" · "편해지지 않아요" · "~일지도 몰라요" · "계획을 세운 뒤에"
export const JARGON = /비겁|식상|관성|인성|재성|정관|편관|비견|겁재|식신|상관(?!없|이 없)|편재|정재|정인|편인(?![데지가])|(?<![가-힣])일지(?![도가-힣])|일간|천간|(?<![가-힣])지지(?![가-힣])|원국|오행|세운(?=[은는이가을를의에도(·,)]|$)|대운|십신|용신/;

/**
 * 시기를 읽는 해석 키워드 나열 — 본문에 그대로 옮기지 않는다(운영자 2026-10-15). "성과 · 수입 · 관리"는 성과가 돈인지 일인지, "표현 · 생산"은 말인지 창작인지 알 수 없다.
 * 쉬운 제목 → 생활에서 뜻하는 것 → 예시로 풀어 쓴다(lib/saju/interpret/period-plain.ts). 접어 둔 분석 근거의 전통 해석 칸에는 그대로 남는다.
 */
export const RAW_THEME_TEXT = new RegExp(Object.values(GROUP_THEME_SHORT).join("|"));

/** 본문에 쓰지 않는 점수 · 확률 표현 (응답 환산값은 접어 둔 분석 근거에만 있다) */
export const SCORE_TEXT = /\d{2,3}\s*점|백분위|\(\d{2,3}\)|\d+\s*%|퍼센트|확률/;

/** 나이를 말하는 표현 (스물 · 서른 같은 우리말 숫자도 포함) */
export const AGE_TEXT = /\d{1,2}\s*살|\d{2}\s*세(?!기)|(?:스물|서른|마흔|쉰|예순)\s*(?:살|세)|(?<!\d)[1-9]0대(?!표)/;

/** 원인을 하나로 좁혀 말하는 표현 */
export const CAUSE_NARROWING = /성격이 아니라|불안이 아니라|시기 때문입니다|때문입니다|때문이에요|때문이죠|때문이야|(?:불안|성격|사주|시기) 때문에/;

/**
 * 응답을 그대로 읽어 주는 말 — 응답은 사주 풀이가 이 사람에게 어떻게 나타나는지 구체화하는 재료이지 문장으로 되풀이하는 대상이 아니다(운영자 2026-10-16).
 * "라고 답했으므로" · "응답에서 ~로 나타났어요" · "문항에서는" · "검사 결과" · "고르셨어요". 쉬운 일상어 "답이 늦을 때"는 걸리지 않는다.
 */
export const ANSWER_ECHO = /라고 (?:답|응답)|(?:답|응답)(?:했|하셨)(?:으므로|기에|기 때문|어요|습니다|고)|응답(?:에서|으로|을 보면|상|한 대로)|문항(?:에서|에는|에 )|검사 결과|고르(?:셨|신)|선택(?:하셨|한 답)/;

/** 풀이마다 붙이는 한계 경고 — "사주만으로는 알 수 없어요" 같은 문장은 한곳(PAGE_NOTE)에 모은다 */
export const HEDGE_REPEAT = /사주(?:만으로|로는|만 보고는)\s*(?:는\s*)?(?:알 수 없|판단할 수 없|단정할 수 없|확인할 수 없|말할 수 없)/;
