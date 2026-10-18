// 영역별 이야기(story-v1)의 고정 구성 — 지시문(story-prompt.ts) · 형식 검사(story-validate.ts) · 조립(story-assemble.ts) · 모의 작성기 · 예시가 같은 값을 쓴다.
// 왜 바꿨나(운영자 2026-10-16): 이전 읽기 구조는 한 사람을 설명하는 글 칸이 98개이고 행동 칸만 18개였다. 응답 근거는 6개뿐이라 모델이 같은 성향을 요약 · 예시 · 풀이 · 주의 · 행동 칸마다
// 다시 채웠고, 단어를 줄여도(혼자 정리 11번 → 3번) 같은 설명("확인하는 시간이 상대에게는 거리로 느껴진다")이 여러 칸에 남았다. 단어를 더 막는 검사가 아니라 칸의 나눔을 바꾼다:
// 영역마다 하나의 이야기를 끝까지 쓰고, 행동은 마지막 한곳에 모으고, 시기는 흐름 영역에만 둔다.
import type { Topic } from "../evidence.ts";
import { LIFE_POWER_SOURCE } from "./life-words.ts";
import type { ReadingBlockId, ReadingGroupId, StoryAreaId } from "./types.ts";

export type StoryAreaPlan = {
  id: StoryAreaId;
  /** 저장된 블록 id — 채팅방 · 주제 이동 링크가 이미 쓰는 이름을 그대로 쓴다(예전 리포트와 같은 이름이라 읽는 곳을 따로 만들지 않는다) */
  blockId: ReadingBlockId;
  group: ReadingGroupId;
  /** 제목 위의 작은 이름표 (화면의 영역 이름) */
  topic: string;
  /** AI에게 주는 질문 — 이 영역에서만 답하는 것 */
  ask: string;
  /** 이 영역에서 사주 말고 어떤 개인 성향 자료를 우선 읽는가 — AI에게 그대로 건넨다 */
  sources: string;
  /** 이 영역과 맞닿는 개인 성향 근거(evidence의 topics) — 하나 이상 연결해야 한다 */
  personalTopics: Topic[];
  /** 개인 근거를 영역마다 나눠 건넬 때 이 영역이 먼저 가져가는 근거 ID 모양 — `sources` 문장과 같은 뜻이다(핵심 · 일은 평소 행동 방식 · 기질, 가까운 관계는 관계 반응 · 타인 반응 민감도) */
  prefer: RegExp;
  /** 개인 성향 근거를 몇 개 이상 연결해야 하는가 (근거가 그만큼 있을 때) */
  personalMin: number;
};

export const STORY_AREAS: StoryAreaPlan[] = [
  {
    id: "core",
    blockId: "tendency",
    group: "me",
    topic: "내 사주의 중심과 지나온 모습",
    ask: "이 사주의 중심 성향이 이 사람에게는 어떤 모습으로 나타나는가를 한 흐름으로 — 잘해 왔을 부분 · 그 힘이 부담으로 바뀌는 장면 · 그때 맞는 방향. 강점과 부담, 부딪힘과 회복은 따로 나누지 않고 하나의 이야기로 잇는다",
    sources: "사주(원국 · 십신 · 월령 · 통근 · 강약 후보) + 평소 행동 방식 네 가지 + 기질 + 입력한 MBTI(선호 방향의 구체화)",
    personalTopics: ["personality"],
    prefer: /^survey\.(ei|sn|tf|jp|novelty|caution|persistence)\./,
    personalMin: 2,
  },
  {
    id: "relation",
    blockId: "love",
    group: "relation",
    topic: "가까운 관계에서의 나",
    ask: "가까운 사람 앞에서 마음을 주고 표현하는 방식, 거리와 속도를 조절하는 방식, 서운하거나 부딪혔을 때 풀어 가는 방식이 어떻게 이어지는가, 그리고 편안한 관계의 조건. 상대 자료는 없으므로 상대 없이 본다(상대의 마음 · 나이 · 직업 · 만날 날짜는 쓰지 않는다). 오래 가는 관계 · 결혼생활에서 중요해질 조건은 쓸 수 있다(결혼을 하게 된다 · 언제 한다는 예언만 쓰지 않는다)",
    sources: "사주(배우자 자리 · 합 · 충 · 관계 십신) + 가까운 관계 반응(관계 불안 · 거리 두기) + 타인 반응 민감도 + 입력한 MBTI(표현의 속도 · 방식)",
    personalTopics: ["love", "relationship", "marriage"],
    prefer: /^survey\.(anxiety|avoidance|sensitivity)\./,
    personalMin: 1,
  },
  {
    id: "work-money",
    blockId: "work-money",
    group: "work",
    topic: "일과 재물의 방향",
    ask: "이 사람의 힘이 잘 쓰이는 일의 조건(역할 · 권한 · 속도 · 협업 방식 · 평가받는 기준)과 막히는 조건, 그리고 돈을 대하는 모습. 직업 · 업종 이름을 추천하지 않는다. 재물 해석 근거가 목록에 있을 때만 돈을 풀고, 근거가 약하면 한 문단 안으로 짧게 쓰며 늘려 쓰지 않는다. 시기 이야기는 하지 않는다",
    sources: "사주(재성 · 관성 · 식상 분포와 조합) + 평소 행동 방식(정보 · 판단 · 생활) + 기질(새로움 · 신중함 · 지속성) + 입력한 MBTI(일을 납득하는 방식)",
    personalTopics: ["work", "money"],
    prefer: /^survey\.(sn|tf|jp|novelty|caution|persistence)\./,
    personalMin: 1,
  },
];

export const STORY_FLOW_TOPIC = "현재와 앞으로의 흐름";
export const STORY_FLOW_ASK =
  "계산된 대운 · 세운이 지금 이 사람에게 어떤 주제를 두드러지게 하는가, 그리고 이 사람이 그 시기를 어떻게 받아들일지(기회가 와도 확인을 더 하다 늦어질 수 있는지, 먼저 움직이는 쪽인지). 시기 이야기는 이 영역에만 쓴다";
export const STORY_FLOW_SOURCES = "사주 시기(대운 · 세운 근거) 거의 전부. 개인 성향은 \"이 흐름을 어떻게 받아들이는가\" 한 군데에만 쓰고 입력한 MBTI는 쓰지 않는다";
export const STORY_FOCUS_ASK = "알려 준 고민이 있을 때만 — 앞의 성향 설명을 다시 쓰지 않고, 앞 영역의 결론을 지금 선택에 적용한다";
export const STORY_ACTIONS_ASK = "앞 영역에서 나온 해 볼 행동 세 가지를 한곳에 모은다. 영역 본문에는 행동 과제를 쌓지 않았으므로 여기서 구체적인 방법으로 쓴다";

/** 영역 본문에서 "~해 보세요"처럼 과제를 내는 문장 — 영역마다 한 문장까지(행동은 마지막 actions에 모은다) */
export const TASK_IMPERATIVE = /(?:적어|정해|말해|물어|보내|나눠|써|만들어|알려|확인해|해)\s*(?:보세요|봐요|두세요|둬요|보는 것도 좋)|해 보시|해 보는 걸 추천/;
export const TASK_PER_AREA_MAX = 1;

/** 시기 이야기 — 흐름 영역에만 쓴다(다른 영역에서 대운 · 세운 · 올해를 말하면 같은 이야기를 두 번 푸는 일이 생긴다) */
export const PERIOD_TALK = /대운|세운|올해|내년|내후년|지금 지나는 시기|다음 시기|(?<![\d.])(?:19|20)\d{2}\s*년/;

/** 글자 · 문장 수 한도 — 지시문 · 검사 · 모의 작성기 · 예시 테스트가 모두 이 값을 쓴다 (공통 값은 plan.ts의 READING_LIMITS를 따른다) */
export const STORY_LIMITS = {
  /** 영역 제목 — 본문을 다 쓴 뒤 그 영역의 결론 한 문장 */
  areaHeadline: { min: 8, max: 34 },
  /** 문단 하나 — 한 문단은 2~3문장 */
  paragraph: { min: 60, max: 380, sentencesMax: 3 },
  /** 영역마다 문단 수 */
  paragraphs: { core: { min: 3, max: 5 }, relation: { min: 3, max: 4 }, "work-money": { min: 3, max: 4 }, flow: { min: 2, max: 3 } },
  flow: { headlineMax: 30, years: { min: 1, max: 3, themeMax: 40 }, scenarios: { min: 1, max: 2, whenMax: 90, thenMax: 220 } },
  actions: { count: 3, titleMax: 30, detailMin: 20, detailMax: 220 },
  /** 두 제목이 이 몫 이상 같은 낱말이면 같은 말로 본다 */
  headlineOverlapMax: 0.5,
} as const;

/**
 * 맺음 틀 예산 — 방향 제시의 모범 문장("~쪽이 맞아 보여요. 그래도 ~라면 ~볼 때예요")을 영역마다 같은 틀로 되풀이하면 4개 영역이 같은 끝맺음이 된다(2026-10-16 대리 작성기 두 건에서 관찰:
 * "맞아 보여요" 6 · 5곳). 리포트 전체에서 이 표현을 쓸 수 있는 횟수의 상한이다 — 표지를 센 어림이며, 영역마다 방향의 모양(질문 · 기준 · 건넬 말 · 조건)을 달리 쓰는 것은 지시문과 사람이 읽는 평가가 본다.
 */
export const FORMULA_BUDGET: { re: RegExp; max: number; label: string }[] = [
  { re: /맞아 보여요/g, max: 4, label: "맞아 보여요" },
  { re: /(?:볼|살펴볼|물어볼|짚어 볼) (?:때|차례|신호)(?:예요|이에요)/g, max: 2, label: "~볼 때예요" },
];

/** 입력한 MBTI를 쓰는 영역 수 — 핵심 · 가까운 관계 · 일 가운데 둘 이상(시기에는 쓰지 않는다) */
export const MBTI_AREAS = { min: 2 } as const;

export const STORY_PROMPT_VERSION = "story-v1-prompt-0.3";
export const STORY_FORMAT = "story-v1";

/**
 * 없는 기운 · 십성을 생활 기능의 부족이나 원인으로 풀지 않는다(운영자 2차 검토 2026-10-16 — "수 없음 → 못 쉼 · 목 없음 → 시작 못 함" 같은 단순 풀이로 돌아가지 않게).
 * 근거의 cue는 "전통 해석에서는 생활에서 의식적으로 채우는 쪽을 권하는 경우가 많다 · 결함이라는 뜻은 아니다"까지만 말한다. 한 문장에 ① 오행 · 십성 이름 ② 없음 표현 ③ (생활 기능어 또는 이어 주는 말)이 함께 있으면 막는다.
 * 낱말로 센 어림이며, 말을 바꿔 쓴 단정은 못 잡는다 — 지시문과 사람이 읽는 평가가 함께 본다.
 */
const ABSENCE_KIND_TERM = /(?:[목화토금수]\s*(?:\([^)]*\))?\s*기운|[목화토금수]\([^)]*\)|비겁|식상|재성|관성|인성|비견|겁재|식신|상관|편재|정재|편관|정관|편인|정인)/;

export const ABSENCE_MAPPING = {
  /** 오행 · 십성 이름 — "수 기운" · "수(물)" · 재성 · 식상 등 */
  kind: ABSENCE_KIND_TERM,
  /**
   * 고객용 글(story-7, 2026-10-18)이 용어 대신 쓰는 생활 말(번역표 life-words.ts의 어구 · "물의 기운")까지 알아보는 확장 — **story-7 검사만** 켠다(`absenceErrors`의 `lifeWords`).
   * 영역별 이야기(story-v1) · 이전 형식은 `kind`(용어만)로 변경 전 그대로 판정한다. 표에 없는 말로 옮긴 문장은 못 잡는다(미탐).
   */
  kindWithLife: new RegExp(`${ABSENCE_KIND_TERM.source}|${LIFE_POWER_SOURCE}`),
  /** 없음 표현 */
  absent: /(?:없|보이지 않|드러나지 않|비어 있|부족)/,
  /** 생활 기능어 — 오행 이름을 쉬는 힘 · 시작하는 힘 같은 기능으로 번역한 말 */
  gloss: /(?:쉬어 가는 힘|쉬는 힘|쉬어 가는 일|쉬는 것이|시작하는 힘|결단하는 힘|정리하는 힘|돈 관리|돈복|재물복|서툴|못 쉬|쉬지 못|시작을 못|결정을 못|약해|약하)/,
  /** 없음에서 이어지는 인과 · 보상 연결 */
  causal: /(?:대신|그래서|그러니|때문에|탓에|덕분에|이라서|이어서|니까)/,
  /**
   * 없음 표현에 바로 붙는 "~아서 · ~어서"("보이지 않아서 · 없어서") — 실제 AI 글(2026-10-17 P01)이 "식상은 보이지 않아서, 결과물을 먼저 내보이는 일은 부담이 되기 쉬울 수 있어요"로 쓴 것이 위 둘에 걸리지 않았다(사후 보강).
   * 다만 "시기에 그 주제가 크게 느껴질 수 있다 · 생활에서 채우는 쪽을 권한다"는 전통 해석이 말하는 범위라 그 틀(`allowedFrame`)이 같은 문장에 있으면 막지 않는다.
   */
  causalLoose: /(?:않|없|부족)[아어]서/,
  allowedFrame: /(?:시기|대운|세운|올해|해에|크게 느껴|느껴질 수|채우는 쪽|권하는)/,
} as const;

/**
 * 작성 과정을 말하는 문장 — "강약은 이번 분석에서 한쪽으로 정하지 않았어요 · 재성은 이번 풀이에서 근거가 약해 길게 풀지 않았어요"처럼 글이 아니라 글을 쓴 사정을 설명하는 말(2026-10-17 실제 AI 첫 글).
 * 읽는 사람에게는 풀이가 아니라 빈칸이고, 지시문 0.2가 이런 말투를 예로 들어 모델이 따라 썼다 — 0.3에서 예를 지우고 검사로 막는다. 쓸 것이 없으면 그 이야기를 하지 않는다. 낱말 · 틀을 센 어림이다.
 */
export const PROCESS_TALK = /(?:이번|이) (?:분석|풀이|리포트)(?:에서(?:는)?|에는|는)[^.!?]{0,40}?(?:정하지 않았|풀지 않았|다루지 않았|쓰지 않았|판단하지 않았|보조 근거로|살펴봤|살펴보았|근거가 약)|근거가 약(?:해|하여|해서)[^.!?]{0,30}?(?:길게|풀지|쓰지|다루지)|(?:길게|자세히) 풀지 않았/;

/** 일과 재물 영역에 돈 이야기가 실제로 있는가 — 이 영역의 이름이 "일과 재물"인데 재물이 비어 있던 글(2026-10-17)을 막는 어림. 작성 과정 문장(PROCESS_TALK)은 세지 않는다 */
export const MONEY_WORDS = /돈|재물|수입|지출|소비|저축|씀씀이|금전|재정|자산|월급|통장|지갑/;

/** 같은 개인 성향 근거(MBTI 제외)를 앞세울 수 있는 영역 수 — 한 가지 응답이 모든 영역을 끌고 가면 글이 한 모티프로 반복된다(운영자 2차 검토). 개인 근거가 이보다 적으면 이 검사는 하지 않는다 */
export const PERSONAL_REUSE = { maxAreas: 2, minPoolToCheck: 5 } as const;

/** 영역의 첫 문단은 이 사람이 어떤 사람인지 일상의 말로 먼저 — 사주 용어(풀이가 붙은 것도)는 둘째 문단부터 쓴다(운영자 2차 검토: 첫 장부터 일간 · 통근 · 월령을 공부하게 하지 않는다) */
export const FIRST_PARAGRAPH_TERMS_MAX = 0;


export const storyAreaPlan = (id: string): StoryAreaPlan | undefined => STORY_AREAS.find((a) => a.id === id);
