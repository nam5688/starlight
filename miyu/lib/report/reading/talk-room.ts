// 대화 방(상담 모드) — 방 정의 · 먼저 묻는 질문 · 눌러서 이어 가는 행동 → 말풍선 · 답장 버튼 · 이어 보기용 되돌려 재생.
// 풀이 · 예시 · 근거는 저장된 리포트의 글 그대로이거나(리포트 주제), 사주 계산에서 고른 고정 문구(오늘의 한 장 · 인연의 경향)다. 모드 접속 안내 · 먼저 묻는 질문 · 질문에 대한 짧은 반응은 이 파일의 고정 문구다.
// 이 파일은 AI를 부르지 않는다. 자유 질문의 답은 서버가 만들어 오고(자유 질문 행동 "free"), 이 파일은 그 글을 대화에 놓고 되살리기만 한다.
// 눌러 준 답(연애 상태 등)은 풀이를 바꾸지 않는다. 풀이를 어떻게 읽을지 알려 주는 한 줄에만 쓴다.
// 채널 독립 코드다(React · Next · 브라우저 API를 쓰지 않는다). 화면은 components/talk/ 에 있다.
import { CHAT_SUMMARY_POLICY, formatKrw } from "../../config/product.ts";
import { answerBubbles, extraBubbles, freeLeftText, nextTopic, QUESTION_MAX, TALK_COPY, type TalkBubble, type TalkBuy, type TalkExtra, type TalkModel, type TalkTopic } from "./talk.ts";

/** 미유의 표정 — 운영자가 보낸 캐릭터 시트의 표정 시트 6가지와 액션 포즈 3가지 (그림은 components/talk/miyu-moods.ts) */
export type TalkMood = "basic" | "happy" | "surprised" | "thinking" | "playful" | "worried" | "wave" | "glasses" | "aha";
export const TALK_MOODS: readonly TalkMood[] = ["basic", "happy", "surprised", "thinking", "playful", "worried", "wave", "glasses", "aha"];

export type RoomId = "main" | "daily" | "year" | "love" | "marriage" | "career" | "money" | "concern";
export const ROOM_ORDER: readonly RoomId[] = ["main", "daily", "year", "love", "marriage", "career", "money", "concern"];

/** 미유가 보내는 말 하나 — 리포트의 글(TalkBubble) · 분석 카드 · 링크가 달린 안내 · 모드 접속 안내(가운데 알림) */
export type TalkSay = TalkBubble | { kind: "card" } | { kind: "link"; text: string; href: string; label: string } | { kind: "system"; text: string; sub?: string };
export type TalkLine = { from: "me"; text: string } | { from: "miyu"; say: TalkSay; mood: TalkMood };

type IntakeOption = { id: string; label: string; lead: string; mood: TalkMood };
/** 풀이 전에 먼저 묻는 질문 — 고른 답은 풀이를 어떻게 읽을지 알려 주는 한 줄(과 풀이 뒤의 덧붙임)에만 쓰고 풀이를 바꾸지 않는다 */
export type Intake = { question: string; options: IntakeOption[]; skip: IntakeOption };

export type RoomDef = {
  id: RoomId;
  /** 메인 카드 · 채팅방 목록에 보이는 직설적인 이름 (카테고리) */
  label: string;
  /** 이 방에서 미유가 쓰는 이름 (기본 방은 그냥 "미유") */
  mode: string;
  /** 채팅방 목록의 한 줄 설명 */
  blurb: string;
  /** 모드 접속 안내 — 기본 방에는 없다 */
  connect: string | null;
  connectNote: string | null;
  /** 이 방에서 열 수 있는 풀이 — 리포트 주제의 id 또는 코드가 계산한 풀이(daily · partner · marriage)의 id */
  topicIds: string[];
  /** 풀이 답장에서 쓸 수 있는 월별 달력 */
  calendars: ("love" | "money")[];
  /** 풀이 없이 이야기만 나누는 방 (고민해결소) */
  chatOnly?: boolean;
  intake?: Intake;
  greeting: (name: string) => string;
};

const SKIP = (lead: string, label = "말하고 싶지 않아요"): IntakeOption => ({ id: "skip", label, lead, mood: "basic" });

export const ROOM_COPY = {
  /** 먼저 묻는 질문의 답을 받은 뒤 한 번 보이는 작은 안내 */
  intakeNote: "눌러 준 답은 이야기를 어떻게 읽을지 정하는 데만 쓰고, 풀이 자체를 바꾸지는 않아요.",
  newRoom: "이 채팅방은 새 대화로 시작해요.",
  /** 채팅 요약 저장 — [저장하기] · 대화 종료 · MY의 저장한 채팅 요약(운영자 2026-10-15). 요약은 코드가 규칙대로 줄이며 AI를 부르지 않는다 */
  summary: {
    save: "저장하기",
    saveHint: "지금까지 한 대화를 요약 저장해요",
    saving: "저장하는 중이에요",
    saved: "지금까지의 대화를 요약해서 저장했어요.",
    savedLink: "저장한 채팅 요약 보기",
    nothing: "아직 저장할 대화가 없어요. 이야기를 조금 나눈 뒤에 저장해 주세요.",
    failed: "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    /** 대화 종료 */
    close: "대화 종료하기",
    closeTitle: "대화를 끝낼까요?",
    closeBody: "이전 채팅내용은 다시 볼 수 없어요. 저장할까요?",
    yes: "예",
    yesSub: "요약해서 저장하고 끝내요",
    no: "아니오",
    noSub: "저장하지 않고 끝내요",
    stay: "계속 대화하기",
    /** 저장하지 않아도 남는 참고 기록을 숨기지 않고 알린다 */
    closeNote: `저장하지 않아도 이 방에서 나눈 이야기는, 다음에 질문할 때 미유가 이어서 참고하도록 보이지 않는 기록으로 남아요. 화면에서는 볼 수 없고 ${CHAT_SUMMARY_POLICY.referenceKeepDays}일이 지나면 자동으로 지워져요. 그 전에 지우고 싶으면 MY의 저장한 채팅 요약에서 ‘이전 대화 기록 모두 지우기’를 눌러 주세요.`,
    closedSaved: "요약을 저장하고 대화를 끝냈어요. 새 대화로 시작해요.",
    closedUnsaved: "대화를 끝냈어요. 새 대화로 시작해요.",
    /** MY의 저장한 채팅 요약 */
    pageTitle: "저장한 채팅 요약",
    pageLead: "채팅방에서 [저장하기]를 누르거나 대화를 끝내면서 저장한 요약이에요. 저장할 때마다 이전 저장 이후에 나눈 이야기만 담겨요.",
    readLabel: "함께 읽은 이야기",
    empty: "아직 저장한 채팅 요약이 없어요. 채팅방의 [저장하기]를 누르면 이곳에 쌓여요.",
    deleteOne: "이 요약 지우기",
    deleteAll: "이전 대화 기록 모두 지우기",
    deleteAllNote: "저장한 요약과, 저장하지 않고 끝낸 대화의 참고 기록을 모두 지워요. 지운 뒤에는 되돌릴 수 없고, 리포트와 질문 횟수에는 영향이 없어요.",
    deleted: "요약을 지웠어요.",
    deletedAll: "이전 대화 기록을 모두 지웠어요.",
  },
  /** 고민해결소에서 자유 질문 상태별 안내 */
  chatReady: "아래 입력창에 편하게 적어 주세요. 한두 문장이면 충분해요.",
  chatPending: "자유롭게 이야기를 나누는 기능은 아직 준비 중이에요.",
  chatLocked: "이야기를 이어 가는 건 리포트를 받은 분께 열려 있어요.",
  /** 무료 리포트로는 질문이 없는 방(나를 알아보기) — 심층 리포트로 이어 준다 */
  chatDeepOnly: "자세한 이야기는 심층 리포트에서 이어져요.",
  /** 무료 질문을 모두 쓴 뒤 유료 질문(질문 한 개당 결제)으로 이어 가는 중 — 결제한 질문이 남아 있을 때 · 질문을 보낼 때 결제로 이어질 때 · 유료 질문을 지금 열 수 없을 때 */
  chatTicketLead: "무료 질문은 모두 썼어요. 결제해 둔 질문이 하나 있어요. 아래 입력창에 적어 보내면 바로 이어서 답해요.",
  chatPayLead: (priceKrw: number) => `무료 질문은 모두 썼어요. 더 묻고 싶다면 질문 한 개에 ${formatKrw(priceKrw)}이에요. 질문을 적어 보내면 결제로 이어지고, 결제가 끝나면 바로 답해요.`,
  chatPayLow: "무료 질문을 모두 썼어요. 유료 질문은 지금 열 수 없어요. 잠시 뒤에 다시 와 주세요.",
  /** 입력창 설명(보조기기용) — 결제 화면으로 이어지는 것과 답을 받지 못하면 같은 결제로 다시 물을 수 있다는 것 */
  chatPayNote: (priceKrw: number) => `질문 한 개에 ${formatKrw(priceKrw)}이에요. 보내면 결제 화면으로 이어지고, 결제가 끝나면 바로 답해요. 답을 받지 못하면 같은 결제로 다시 물을 수 있어요.`,
  /** 무료 맛보기에서 이 방의 풀이에 내 자료로 읽은 내용이 아직 없을 때 — 무료 질문을 열지 않는다(재료가 있는 방에서만 연다) */
  chatNoMaterial: "이 방의 무료 풀이에는 아직 이야기 나눌 내용이 없어서 무료 질문은 열리지 않았어요. 리포트를 받으면 이어서 물어볼 수 있어요.",
  /** 무료 맛보기에서 로그인한 분께 열어 주는 무료 질문(기본 2번) — 열려 있을 때 · 이미 썼을 때 */
  chatFreeUsed: "무료 질문을 모두 썼어요. 이어서 묻고 깊은 풀이를 보려면 리포트에서 이어져요.",
  chatFreeNote: `무료 질문은 ${QUESTION_MAX.free}자까지 쓸 수 있고, 지금 보이는 맛보기 내용만 가지고 답해요. 깊은 풀이는 리포트에서 이어져요.`,
  /** 자유 질문이 열려 있을 때 입력창 위에 작게 — AI가 쓴 답이라는 것과 예측이 아니라는 것 */
  chatAiNote: "답은 AI가 내 리포트의 글과 적어 준 내용으로 쓴 해석이에요. 예측이나 진단이 아니에요.",
  /** 진로 방과 재무 방은 같은 저장된 "일과 돈" 풀이에서 보여 주는 소단락 · 질문 · 안내를 달리한다 — 새 글을 쓰지 않고 고르기만 한다 */
  focus: {
    career: {
      line: "이 방에서는 일하는 방식과 일을 고르는 기준을 중심으로 읽어요.",
      ask: "일할 때는 어떤 방식이 잘 맞아요?",
      hooks: [] as string[],
    },
    money: {
      line: "이 방에서는 돈을 대하는 방식과 관리 습관을 중심으로 읽어요. 투자 · 대출 결정은 사주로 정하지 않아요.",
      ask: "돈을 쓰고 모을 때는 어떤 편이에요?",
      /** 무료 맛보기에서 재무 방이 리포트에서 이어 보여 주는 것 — 질문만 */
      hooks: ["돈을 쓰고 모을 때 내가 반복하는 습관은?", "지금 시기는 일과 돈에서 어떤 주제로 읽힐까?", "재물 주제가 눈에 띄기 쉬운 달은 언제일까?"],
    },
  },
  mixedAsk: "어떤 상황에서는 달랐는지 한 줄만 알려 주세요. 그 상황에 맞춰 풀이를 다시 읽어 볼게요.",
  /** 무료 맛보기에서 고민해결소가 리포트에서 이어 보여 주는 것 — 질문만 */
  concernHooks: ["지금 고민에 내 사주와 응답은 어떻게 이어질까?", "비슷한 상황이 반복되는 이유는 무엇일까?", "지금 해 볼 수 있는 작은 행동은 무엇일까?"],
} as const;

export const ROOMS: Record<RoomId, RoomDef> = {
  main: {
    id: "main",
    label: "나를 알아보기",
    mode: "미유",
    blurb: "종합 분석 한 장과 주제별 풀이",
    connect: null,
    connectNote: null,
    topicIds: [],
    calendars: ["love", "money"],
    greeting: (name) => TALK_COPY.intro(name),
  },
  daily: {
    id: "daily",
    label: "오늘의 운세",
    mode: "원데이 미유",
    blurb: "오늘 하루 한 장 · 하루 한 번 무료",
    connect: "원데이 미유 모드로 접속합니다",
    connectNote: "오늘의 일진을 내 사주와 겹쳐 읽어요. 오늘 무슨 일이 생긴다는 뜻은 아니에요.",
    topicIds: ["daily"],
    calendars: [],
    greeting: (name) => `${name} 님, 오늘도 반가워요. 오늘의 한 장을 펼쳐 볼게요.`,
    intake: {
      question: "오늘은 어떤 쪽이 가장 신경 쓰여요?",
      options: [
        { id: "work", label: "일 · 공부", lead: "일 · 공부 쪽을 중심으로 오늘의 한 장을 읽어 볼게요.", mood: "basic" },
        { id: "people", label: "사람 · 연애", lead: "사람 · 연애 쪽을 중심으로 오늘의 한 장을 읽어 볼게요.", mood: "playful" },
        { id: "money", label: "돈 · 소비", lead: "돈 · 소비 쪽을 중심으로 오늘의 한 장을 읽어 볼게요.", mood: "thinking" },
        { id: "mind", label: "컨디션 · 마음", lead: "컨디션 · 마음 쪽을 중심으로 오늘의 한 장을 읽어 볼게요.", mood: "basic" },
      ],
      skip: SKIP("괜찮아요. 오늘의 분위기부터 읽어 볼게요.", "딱히 없어요"),
    },
  },
  year: {
    id: "year",
    label: "올해의 흐름",
    mode: "흐름박사 미유",
    blurb: "1년 단위로 보는 시기와 움직이는 달",
    connect: "흐름박사 미유 모드로 접속합니다",
    connectNote: "전통 해석으로 시기의 분위기를 읽어요. 일어날 일을 맞히는 예측은 아니에요.",
    topicIds: ["flow"],
    calendars: ["love", "money"],
    greeting: (name) => `${name} 님, 반가워요. 올해와 앞으로의 시기를 같이 살펴볼게요.`,
    intake: {
      question: "올해는 어떤 쪽이 제일 궁금해요?",
      options: [
        { id: "money", label: "일 · 돈", lead: "일과 돈 쪽의 움직임까지 같이 볼게요.", mood: "thinking" },
        { id: "love", label: "사람 · 연애", lead: "사람과 인연 쪽의 움직임까지 같이 볼게요.", mood: "playful" },
        { id: "all", label: "전체 분위기", lead: "먼저 큰 분위기부터 볼게요.", mood: "basic" },
      ],
      skip: SKIP("괜찮아요. 큰 분위기부터 볼게요.", "잘 모르겠어요"),
    },
  },
  love: {
    id: "love",
    label: "연애",
    mode: "연애박사 미유",
    blurb: "연락 · 표현 · 갈등, 끌리는 사람의 경향",
    connect: "연애박사 미유 모드로 접속합니다",
    connectNote: "사주와 응답으로 읽은 이야기만 해요. 결과를 보장하는 상담은 아니고, 두 사람의 궁합 비교는 준비 중이에요.",
    topicIds: ["love", "partner"],
    calendars: ["love"],
    greeting: (name) => `${name} 님, 반가워요. 연애 이야기는 사람마다, 또 시기마다 달라서 먼저 지금 상황부터 알고 싶어요.`,
    intake: {
      question: "먼저, 지금 어떤 상황인지 물어봐도 될까요?",
      options: [
        { id: "solo", label: "솔로예요", lead: "솔로라면, 아래 이야기는 ‘어떤 관계에서 마음이 편한지’를 가늠하는 기준으로 읽어 보세요.", mood: "basic" },
        { id: "crush", label: "짝사랑하는 사람이 있어요", lead: "짝사랑 중이라면, 상대의 마음을 짐작하기보다 내가 어떻게 반응하는지를 살펴보는 데 써 보세요. 상대의 속마음을 단정하지는 않아요.", mood: "playful" },
        { id: "some", label: "썸 타는 중이에요", lead: "썸 타는 중이라면, 상대의 반응이 느리거나 흐릿할 때 내가 어떻게 반응하는지를 중심으로 읽어 보세요.", mood: "playful" },
        { id: "dating", label: "연애 중이에요", lead: "연애 중이라면, 지금 관계에서 편한 점과 부딪히기 쉬운 점을 비춰 보는 용도로 읽어 보세요.", mood: "happy" },
        { id: "breakup", label: "헤어진 지 얼마 안 됐어요", lead: "헤어진 지 얼마 안 됐다면, 이 이야기를 ‘왜 헤어졌는지’의 답으로 쓰기보다 지금 마음을 돌보는 참고로만 읽어 주세요.", mood: "worried" },
        { id: "wedding", label: "결혼 준비 중이에요", lead: "결혼을 준비 중이라면, 결혼 여부나 시기를 사주로 정하지 않고 서로 맞춰 가는 방식을 살펴보는 데 써 보세요.", mood: "happy" },
        { id: "married", label: "결혼했어요", lead: "결혼한 사이라면, 지금 관계에서 편한 점과 맞춰 가야 할 점을 보는 데 써 보세요.", mood: "happy" },
      ],
      skip: SKIP("괜찮아요. 상황을 몰라도 읽을 수 있게 이야기할게요."),
    },
  },
  marriage: {
    id: "marriage",
    label: "결혼",
    mode: "결혼박사 미유",
    blurb: "오래 가는 관계에서 중요한 것 · 인연의 경향",
    connect: "결혼박사 미유 모드로 접속합니다",
    connectNote: "결혼 여부나 시기를 사주로 정하지 않아요. 두 사람의 궁합 비교는 준비 중이에요.",
    topicIds: ["marriage", "partner"],
    calendars: ["love"],
    greeting: (name) => `${name} 님, 반가워요. 결혼 이야기는 사람마다 상황이 달라서 먼저 지금 어떤지 알고 싶어요.`,
    intake: {
      question: "지금 어떤 상황에 가까워요?",
      options: [
        { id: "thinking", label: "결혼을 생각 중이에요", lead: "결혼을 생각 중이라면, 결혼 여부나 시기를 사주로 정하지 않고 ‘오래 가는 관계에서 내가 중요하게 보는 것’을 살펴보는 데 써 보세요.", mood: "thinking" },
        { id: "preparing", label: "결혼을 준비 중이에요", lead: "결혼을 준비 중이라면, 서로 맞춰 가는 방식을 살펴보는 참고로 읽어 보세요.", mood: "happy" },
        { id: "married", label: "결혼했어요", lead: "결혼한 사이라면, 지금 관계에서 편한 점과 맞춰 가야 할 점을 보는 데 써 보세요.", mood: "happy" },
        { id: "notyet", label: "아직 생각 없어요", lead: "괜찮아요. 결혼과 상관없이 오래 가는 관계에서 내가 중요하게 보는 것을 가볍게 살펴봐요.", mood: "basic" },
      ],
      skip: SKIP("괜찮아요. 상황을 몰라도 읽을 수 있게 이야기할게요.", "잘 모르겠어요"),
    },
  },
  career: {
    id: "career",
    label: "일 · 진로",
    mode: "진로박사 미유",
    blurb: "일하는 방식과 지금의 선택",
    connect: "진로박사 미유 모드로 접속합니다",
    connectNote: "사주와 응답으로 읽은 이야기만 해요. 결정을 대신 내려 주지는 않아요.",
    topicIds: ["work-money"],
    calendars: [],
    greeting: (name) => `${name} 님, 반가워요. 일 이야기는 하는 방식과 지금 놓인 상황에 따라 달라요.`,
    intake: {
      question: "일하는 방식이 궁금해요, 아니면 지금 선택이 고민이에요?",
      options: [
        { id: "way", label: "일하는 방식이 궁금해요", lead: "일하는 방식이 궁금하다면, 아래 이야기에서 내가 잘 쓰는 방식과 힘이 드는 방식을 나눠 보세요.", mood: "basic" },
        { id: "choice", label: "지금 선택이 고민이에요", lead: "선택이 고민이라면, 결정을 대신 내려 주지는 않고 기준을 세우는 데 쓸 수 있는 이야기를 먼저 볼게요.", mood: "thinking" },
        { id: "stuck", label: "요즘 일이 막막해요", lead: "막막할 때는 해석을 답으로 보기보다, 하나씩 확인해 볼 질문으로 읽어 보세요.", mood: "worried" },
        { id: "unsure", label: "잘 모르겠어요", lead: "괜찮아요. 일하는 방식부터 같이 볼게요.", mood: "basic" },
      ],
      skip: SKIP("괜찮아요. 일하는 방식부터 같이 볼게요."),
    },
  },
  money: {
    id: "money",
    label: "돈 · 재무",
    mode: "재무박사 미유",
    blurb: "돈을 대하는 방식과 소비 습관",
    connect: "재무박사 미유 모드로 접속합니다",
    connectNote: "수익 보장이나 투자 · 대출 결정은 사주로 정하지 않아요. 돈을 대하는 방식과 습관까지만 이야기해요.",
    topicIds: ["work-money"],
    calendars: ["money"],
    greeting: (name) => `${name} 님, 반가워요. 소비 습관이나 돈 때문에 고민되는 상황을 먼저 알려 주세요.`,
    intake: {
      question: "요즘 어떤 상황이 가장 마음에 걸려요?",
      options: [
        { id: "impulse", label: "충동적으로 쓰는 편이에요", lead: "쓰는 방식 이야기는 습관을 살펴보는 용도예요. 잘못이라는 뜻이 아니에요.", mood: "basic" },
        { id: "saving", label: "모으는 게 어려워요", lead: "모으는 게 어렵다면, 의지 문제로 보기보다 어떤 때 쓰게 되는지 살펴보는 데 써 보세요.", mood: "thinking" },
        { id: "big", label: "큰돈 쓸 일이 있어요", lead: "큰돈이 드는 결정은 사주로 정하지 않아요. 투자나 대출 결정에는 쓰지 말고, 내 습관과 기준을 살펴보는 용도로만 읽어 주세요.", mood: "thinking" },
        { id: "worry", label: "돈 걱정이 자꾸 돼요", lead: "걱정이 클 때는 이야기를 답으로 쓰기보다 확인할 것을 정리하는 데 써 보세요.", mood: "worried" },
        { id: "unsure", label: "잘 모르겠어요", lead: "괜찮아요. 돈을 대하는 방식부터 같이 볼게요.", mood: "basic" },
      ],
      skip: SKIP("괜찮아요. 돈을 대하는 방식부터 같이 볼게요."),
    },
  },
  concern: {
    id: "concern",
    label: "고민 상담",
    mode: "고민해결소 미유",
    blurb: "지금 고민을 직접 이야기해요",
    connect: "고민해결소 미유 모드로 접속합니다",
    connectNote: "결정을 대신 내려 주지 않고, 상대의 속마음을 단정하지 않아요. 내 사주와 응답으로 읽은 범위에서만 이야기해요.",
    topicIds: [],
    calendars: [],
    chatOnly: true,
    greeting: (name) => `${name} 님, 반가워요. 지금 마음에 걸리는 고민을 편하게 들려주세요.`,
    intake: {
      question: "어떤 고민에 가까워요?",
      options: [
        { id: "love", label: "연애 · 관계", lead: "연애 · 관계 고민이시군요.", mood: "thinking" },
        { id: "work", label: "일 · 진로", lead: "일 · 진로 고민이시군요.", mood: "thinking" },
        { id: "money", label: "돈 · 소비", lead: "돈 · 소비 고민이시군요.", mood: "thinking" },
        { id: "family", label: "가족 · 인간관계", lead: "가족이나 주변 사람과의 고민이시군요.", mood: "worried" },
        { id: "self", label: "나 자신", lead: "나 자신에 대한 고민이시군요.", mood: "basic" },
      ],
      skip: SKIP("괜찮아요. 편한 것부터 이야기해 주세요.", "그 밖의 고민이에요"),
    },
  },
};

/** 눌러서 이어 가는 행동 — 이 목록을 순서대로 다시 적용하면(replayRoom) 같은 대화가 그대로 되살아난다 */
export type RoomAction =
  | { t: "group"; id: string }
  | { t: "topic"; id: string }
  | { t: "intake"; option: string }
  | { t: "extra"; topic: string; which: TalkExtra }
  | { t: "feel"; topic: string; kind: "yes" | "mixed" | "unsure" }
  /** 자유 질문과 미유의 답 — 답은 서버가 만들어 온 글이라 다시 만들 수 없어 그대로 담는다 */
  | { t: "free"; q: string; a: string[]; topic?: string };

export type RoomState = {
  lines: TalkLine[];
  /** 본 주제 */
  opened: string[];
  /** 주제마다 이미 연 답장 (TalkExtra · "yes" · "mixed" · "unsure") */
  used: Record<string, string[]>;
  current: string | null;
  /** 먼저 묻는 질문에 고른 답의 번호 ("skip" 포함), 아직이면 null */
  intake: string | null;
  /** "상황에 따라 달라요"를 누른 뒤 다음 자유 질문이 그 풀이에 이어지는지 */
  asking: { topic: string } | null;
  phase: "pick" | "intake" | "chat";
};

export type RoomContext = { contextHref?: string };

export const FREE_ANSWER_PARAGRAPHS_MAX = 6;
export const FREE_ANSWER_PARAGRAPH_MAX = 600;

const miyu = (say: TalkSay, mood: TalkMood): TalkLine => ({ from: "miyu", say, mood });
const me = (text: string): TalkLine => ({ from: "me", text });
const text = (t: string, muted = false): TalkSay => ({ kind: "text", text: t, ...(muted ? { muted: true } : {}) });

/** 풀이 전체 — 리포트 주제와 코드가 계산한 풀이 */
const allTopics = (model: TalkModel): TalkTopic[] => [...model.topics, ...model.codeTopics];

/** 진로 방이 보여 주는 소단락(일하는 방식 · 일을 고르는 기준) · 재무 방이 보여 주는 소단락(성과와 수입으로 이어지는 방식 · 시기와 관리 습관) — plan.ts의 일과 돈 소단락 순서 */
const SECTION_PICK = { career: [0, 2], money: [0, 1] } as const;
const MONEY_HINT = /돈|소비|저축|재물|수입/;

/**
 * 같은 저장된 "일과 돈" 풀이를 진로 · 재무 방에서 서로 다른 초점으로 본다 — 저장된 소단락을 고르고 질문 · 안내 문구(고정)를 바꿀 뿐 새 글을 쓰지 않는다.
 * 소단락이 없는 이전 리포트와 무료 맛보기(잠금 질문만 있음)에서도 질문 · 안내는 방마다 다르다.
 */
export function roomView(room: RoomId, t: TalkTopic): TalkTopic {
  if (t.id !== "work-money" || (room !== "career" && room !== "money")) return t;
  const f = ROOM_COPY.focus[room];
  const n = t.sectionCount ?? 0;
  const detail = n > 0 ? [...t.detail.slice(0, n * 2).filter((_, i) => (SECTION_PICK[room] as readonly number[]).includes(Math.floor(i / 2))), ...t.detail.slice(n * 2)] : t.detail;
  const hooks = t.locked ? (room === "money" ? [...f.hooks] : t.locked.hooks.filter((h) => !MONEY_HINT.test(h))) : null;
  // 재무 방은 일하는 방식 특징 카드를 보이지 않는다
  const base: TalkTopic = { ...t };
  if (room === "money") delete base.traits;
  return {
    ...base,
    detail,
    caveat: room === "money" && t.caveat ? `${f.line} ${t.caveat}` : f.line,
    askText: f.ask,
    ...(hooks ? { locked: { hooks } } : {}),
  };
}

/** 이 방에서 보이는 풀이 하나 — 방의 보기(roomView)를 거친다 */
export function roomTopic(model: TalkModel, room: RoomId, id: string): TalkTopic | undefined {
  const t = allTopics(model).find((x) => x.id === id);
  return t ? roomView(room, t) : undefined;
}

/** 이 방이 여는 풀이 */
export function roomTopics(model: TalkModel, room: RoomId): TalkTopic[] {
  const def = ROOMS[room];
  if (room === "main") return model.topics;
  return def.topicIds.map((id) => roomTopic(model, room, id)).filter((t): t is TalkTopic => Boolean(t));
}

/** 무료 맛보기에서 이 풀이에 내 자료로 읽은 내용이 있는가 — 맛보기 모델이 표시한 값(grounded), 코드가 계산한 풀이는 요약이 있으면 있는 것 */
const hasMaterial = (t: TalkTopic) => t.grounded ?? t.summary.length > 0;

/**
 * 이 방에서 무료 질문을 열 만큼 내 자료로 읽은 내용이 있는가(운영자 2026-10-15) — 무료 맛보기는 풀이에 재료가 있는 방에서만 질문을 열고,
 * 응답에서 읽힌 반응도 사주 계산도 없어 "가볍게 살펴봤어요"만 있는 방은 열지 않는다. 구매한 리포트는 늘 열린다.
 * 나를 알아보기와 이야기만 나누는 방은 맛보기 전체 풀이 중 하나라도 재료가 있으면 연다.
 */
export function roomHasMaterial(model: TalkModel, room: RoomId): boolean {
  if (model.tier !== "free") return true;
  const def = ROOMS[room];
  const topics = room === "main" || def.chatOnly ? allTopics(model) : def.topicIds.map((id) => allTopics(model).find((t) => t.id === id)).filter((t): t is TalkTopic => Boolean(t));
  return topics.some(hasMaterial);
}

/** 이 방을 열 수 있는가 — 풀이가 하나도 없는 방(예: 해당 주제가 없는 리포트)은 열지 않는다. 이야기만 나누는 방은 늘 열 수 있다 */
export const roomAvailable = (model: TalkModel, room: RoomId) => Boolean(ROOMS[room].chatOnly) || roomTopics(model, room).length > 0;

/** 이 자료로 열 수 있는 방 (메뉴 · 결과 화면의 입구에 보인다) */
export const availableRooms = (model: TalkModel): RoomId[] => ROOM_ORDER.filter((r) => roomAvailable(model, r));

/** 이어 보기 저장의 방 이름 — 오늘의 한 장은 날짜별로 나눈다(내일은 새 한 장) */
export const roomSaveKey = (model: TalkModel, room: RoomId) => (room === "daily" && model.dayKey ? `${room}:${model.dayKey}` : room);

/** 방에 처음 들어갔을 때의 대화 */
export function startRoom(model: TalkModel, roomId: RoomId): RoomState {
  const room = ROOMS[roomId];
  if (roomId === "main") {
    return {
      lines: [miyu(text(TALK_COPY.intro(model.name)), "happy"), miyu({ kind: "card" }, "happy"), miyu(text(TALK_COPY.askTopic), "basic")],
      opened: [],
      used: {},
      current: null,
      intake: null,
      asking: null,
      phase: "pick",
    };
  }
  const lines: TalkLine[] = [
    miyu({ kind: "system", text: room.connect ?? "", ...(room.connectNote ? { sub: room.connectNote } : {}) }, "wave"),
    miyu(text(room.greeting(model.name)), "wave"),
  ];
  if (room.intake) lines.push(miyu(text(room.intake.question), "basic"));
  return { lines, opened: [], used: {}, current: null, intake: null, asking: null, phase: room.intake ? "intake" : "chat" };
}

const withUsed = (state: RoomState, topic: string, key: string): Record<string, string[]> => ({ ...state.used, [topic]: [...new Set([...(state.used[topic] ?? []), key])] });

function openTopic(model: TalkModel, state: RoomState, t: TalkTopic, echo: string | null, mood: TalkMood = "basic", pick?: string): { state: RoomState; added: TalkLine[] } {
  const added: TalkLine[] = [...(echo ? [me(echo)] : []), ...answerBubbles(t, model.name, pick).map((b) => miyu(b, mood))];
  return {
    added,
    state: { ...state, lines: [...state.lines, ...added], opened: [...new Set([...state.opened, t.id])], used: { ...state.used, [t.id]: [] }, current: t.id, asking: null, phase: "chat" },
  };
}

/** 풀이에 붙는 답장이 여는 말풍선 — 달력은 이 방의 풀이에 달려 있지 않아도 앞으로의 시기 풀이의 저장된 달력을 쓴다 */
export function extraFor(model: TalkModel, t: TalkTopic, which: TalkExtra): TalkBubble[] {
  if (which === "calendar-love" || which === "calendar-money") {
    const flow = t.calendar ? t : allTopics(model).find((x) => x.calendar);
    return flow ? extraBubbles(flow, which) : [];
  }
  return extraBubbles(t, which);
}

const EXTRA_MOOD: Record<TalkExtra, TalkMood> = { example: "playful", detail: "basic", basis: "glasses", "calendar-love": "surprised", "calendar-money": "surprised" };

/** 이야기만 나누는 방(고민해결소)에서 먼저 묻는 질문에 답한 뒤 이어 가는 안내 — 자유 질문 상태에 따라 다르다 */
function chatLead(model: TalkModel, ctx: RoomContext): TalkLine[] {
  const c = model.chat.state;
  const ch = model.chat;
  if (c === "ready") {
    if (ch.used && ch.cash && ch.cash.balance >= ch.cash.per) return [miyu(text(ROOM_COPY.chatTicketLead), "basic")];
    if (ch.used && ch.pay) return [miyu(text(ROOM_COPY.chatPayLead(ch.pay.priceKrw)), "basic")];
    if (ch.left !== undefined) return [miyu(text(`이 방에서 무료 질문을 ${freeLeftText(ch.left)} 더 할 수 있어요. 아래 입력창에 편하게 적어 주세요.`), "basic")];
    return [miyu(text(ROOM_COPY.chatReady), "basic")];
  }
  if (c === "locked") {
    const line = ch.used ? (ch.cash ? ROOM_COPY.chatPayLow : ROOM_COPY.chatFreeUsed) : ch.noMaterial ? ROOM_COPY.chatNoMaterial : ch.deepOnly ? ROOM_COPY.chatDeepOnly : ROOM_COPY.chatLocked;
    return [
      miyu(text(line), "thinking"),
      miyu({ kind: "lock", title: TALK_COPY.lock.title, hooks: [...ROOM_COPY.concernHooks] }, "basic"),
    ];
  }
  return [
    miyu(
      ctx.contextHref
        ? { kind: "link", text: `${ROOM_COPY.chatPending} ${TALK_COPY.concernPendingLink}`, href: ctx.contextHref, label: "나의 고민 기록소로 가기" }
        : text(ROOM_COPY.chatPending),
      "thinking",
    ),
  ];
}

/** 눌러서 이어 가기 — 새로 더해진 말(내가 누른 말 + 미유의 답)과 바뀐 상태를 돌려준다. 알 수 없는 행동은 아무것도 바꾸지 않는다 */
export function applyAction(model: TalkModel, roomId: RoomId, state: RoomState, action: RoomAction, ctx: RoomContext = {}): { state: RoomState; added: TalkLine[] } {
  const room = ROOMS[roomId];
  const topics = new Map(allTopics(model).map((t) => [t.id, roomView(roomId, t)]));
  const nothing = { state, added: [] as TalkLine[] };
  const add = (s: RoomState, added: TalkLine[], patch: Partial<RoomState> = {}) => ({ added, state: { ...s, ...patch, lines: [...s.lines, ...added] } });

  switch (action.t) {
    case "group": {
      const g = model.groups.find((x) => x.id === action.id);
      if (!g) return nothing;
      const target = g.topicIds.map((id) => topics.get(id)).filter((t): t is TalkTopic => Boolean(t)).find((t) => !state.opened.includes(t.id)) ?? topics.get(g.topicIds[0]);
      return target ? openTopic(model, state, target, g.chip) : nothing;
    }
    case "topic": {
      const t = topics.get(action.id);
      return t ? openTopic(model, state, t, t.chip) : nothing;
    }
    case "intake": {
      if (!room.intake || state.phase !== "intake") return nothing;
      const opt = action.option === "skip" ? room.intake.skip : room.intake.options.find((o) => o.id === action.option);
      if (!opt) return nothing;
      const lead: TalkLine[] = [me(opt.label), miyu(text(opt.lead), opt.mood), miyu(text(ROOM_COPY.intakeNote, true), "basic")];
      const first = roomTopics(model, roomId)[0];
      if (!first) {
        // 풀이 없이 이야기만 나누는 방 — 먼저 묻는 질문에 답하면 바로 이야기를 시작한다
        const talk = [me(opt.label), miyu(text(opt.lead), opt.mood), ...chatLead(model, ctx)];
        return add(state, talk, { intake: opt.id, phase: "chat" });
      }
      const opened = openTopic(model, { ...state, lines: [...state.lines, ...lead], intake: opt.id }, first, null, "basic", opt.id);
      return { added: [...lead, ...opened.added], state: opened.state };
    }
    case "extra": {
      const t = topics.get(action.topic);
      if (!t) return nothing;
      const bubbles = extraFor(model, t, action.which);
      if (bubbles.length === 0) return nothing;
      const mood = EXTRA_MOOD[action.which];
      const added: TalkLine[] = [me(TALK_COPY.buttons[action.which]), ...(action.which === "basis" ? [miyu(text(TALK_COPY.basisIntro), mood)] : []), ...bubbles.map((b) => miyu(b, mood))];
      return add(state, added, { used: withUsed(state, t.id, action.which) });
    }
    case "feel": {
      const t = topics.get(action.topic);
      if (!t) return nothing;
      const f = TALK_COPY.feel;
      const label = f[action.kind].label;
      const note = miyu(text(f.note, true), "basic");
      if (action.kind === "yes") {
        const example = extraFor(model, t, "example");
        const added = [me(label), miyu(text(example.length > 0 ? f.yes.lead : f.yes.leadNoExample), "aha"), ...example.map((b) => miyu(b, "playful")), note];
        return add(state, added, { used: withUsed(withUsedState(state, t.id, example.length > 0 ? "example" : null), t.id, "yes") });
      }
      if (action.kind === "mixed") {
        if (model.chat.state === "ready") {
          // 자유 질문이 열려 있으면 어떤 상황에서 달랐는지를 듣고 이어 간다
          return add(state, [me(label), miyu(text(f.mixed.lead), "thinking"), miyu(text(ROOM_COPY.mixedAsk), "thinking"), note], { used: withUsed(state, t.id, "mixed"), asking: { topic: t.id } });
        }
        const lockedLine = model.chat.state === "locked" ? miyu(text(f.mixed.locked), "thinking") : null;
        const pending = ctx.contextHref ? miyu({ kind: "link", text: `${f.mixed.pending} ${f.mixed.pendingLink}`, href: ctx.contextHref, label: "나의 고민 기록소로 가기" }, "thinking") : miyu(text(f.mixed.pending), "thinking");
        return add(state, [me(label), miyu(text(f.mixed.lead), "thinking"), lockedLine ?? pending, note], { used: withUsed(state, t.id, "mixed") });
      }
      return add(state, [me(label), miyu(text(f.unsure.lead), "thinking"), note], { used: withUsed(state, t.id, "unsure") });
    }
    case "free": {
      const q = action.q.trim();
      const paragraphs = action.a.map((p) => p.trim()).filter(Boolean);
      if (!q || paragraphs.length === 0) return nothing;
      const added: TalkLine[] = [me(q), ...paragraphs.map((p, i) => miyu(text(p), i === 0 ? "thinking" : "basic"))];
      return add(state, added, { asking: null });
    }
  }
}

/** 예시를 이미 열었다고 표시한 상태 (맞아요를 누르면 예시가 같이 열리므로 [일상 예시] 버튼을 다시 보이지 않는다) */
function withUsedState(state: RoomState, topic: string, key: string | null): RoomState {
  return key ? { ...state, used: withUsed(state, topic, key) } : state;
}

export type ReplyChip = { key: string; label: string; action: RoomAction };
export type Replies =
  | { kind: "pick"; groups: ReplyChip[] }
  | { kind: "intake"; options: ReplyChip[]; skip: ReplyChip }
  | { kind: "chat"; feel: ReplyChip[]; helpers: ReplyChip[]; next: ReplyChip | null; report: boolean; buy: TalkBuy | null; asking: boolean };

/** 지금 보여 줄 답장 버튼 — 첫 화면(주제 2×2) · 먼저 묻는 질문 · 풀이를 읽은 뒤(내 경험 · 보조 버튼 · 다음 풀이 · 무료 맛보기의 이어 보기) */
export function replyOptions(model: TalkModel, roomId: RoomId, state: RoomState): Replies {
  const room = ROOMS[roomId];
  if (state.phase === "pick") return { kind: "pick", groups: model.groups.map((g) => ({ key: g.id, label: g.chip, action: { t: "group", id: g.id } })) };
  if (state.phase === "intake" && room.intake) {
    const chip = (o: IntakeOption): ReplyChip => ({ key: o.id, label: o.label, action: { t: "intake", option: o.id } });
    return { kind: "intake", options: room.intake.options.map(chip), skip: chip(room.intake.skip) };
  }
  const empty = { feel: [] as ReplyChip[], helpers: [] as ReplyChip[], next: null, report: false, asking: state.asking !== null };
  const t = state.current ? roomTopic(model, roomId, state.current) : undefined;
  if (!t) return { kind: "chat", ...empty, buy: model.tier === "free" && room.chatOnly ? model.buy : null };
  const used = new Set(state.used[t.id] ?? []);
  const answered = ["yes", "mixed", "unsure"].some((k) => used.has(k));
  const feel: ReplyChip[] = answered || t.noFeel ? [] : (["yes", "mixed", "unsure"] as const).map((kind) => ({ key: `feel-${kind}`, label: TALK_COPY.feel[kind].label, action: { t: "feel", topic: t.id, kind } }));
  const helper = (which: TalkExtra): ReplyChip => ({ key: which, label: TALK_COPY.buttons[which], action: { t: "extra", topic: t.id, which } });
  const helpers: ReplyChip[] = [];
  if (t.example.length > 0 && !used.has("example")) helpers.push(helper("example"));
  if (t.detail.length > 0 && !used.has("detail")) helpers.push(helper("detail"));
  const calendarOk = Boolean(t.calendar) || allTopics(model).some((x) => x.calendar);
  if (calendarOk) {
    const wanted = roomId === "main" ? (["love", "money"] as const) : room.calendars;
    for (const c of wanted) if (!used.has(`calendar-${c}`)) helpers.push(helper(`calendar-${c}`));
  }
  if (t.basis && !used.has("basis")) helpers.push(helper("basis"));
  const next = nextTopic(roomTopics(model, roomId), t.id, new Set(state.opened));
  return {
    kind: "chat",
    feel,
    helpers,
    next: next ? { key: "next", label: `${TALK_COPY.buttons.next} · ${next.chip}`, action: { t: "topic", id: next.id } } : null,
    report: roomId === "main" && state.opened.length === model.topics.length,
    buy: t.locked ? model.buy : null,
    asking: state.asking !== null,
  };
}

/** 이어 보기 저장 형식 — 눌렀던 행동 목록과 자유 질문 · 답이다(리포트 글은 담지 않는다). 로그인한 회원은 서버에도 남는다(어느 기기에서나 이어 보기), 예시 화면은 이 기기의 브라우저에만 둔다 */
export const ROOM_SAVE_VERSION = 2;
export type RoomSave = { v: typeof ROOM_SAVE_VERSION; actions: RoomAction[] };

export const ACTION_LIMIT = 200;

const cleanText = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim().length > 0 && v.length <= max ? v : null);

const EXTRA_KEYS = new Set<string>(["example", "detail", "basis", "calendar-love", "calendar-money"]);
const idText = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : null);

/**
 * 행동 목록의 모양만 확인해 걸러낸다 (모델 없이) — 서버에 저장하거나 불러올 때 쓴다. 글자 수 · 개수 한도를 지키고, 모르는 행동은 버린다.
 * 없는 주제를 가리키는지는 화면이 모델로 한 번 더 거른다(parseRoomSave).
 */
export function sanitizeRoomActions(raw: unknown): RoomAction[] {
  if (!Array.isArray(raw)) return [];
  const out: RoomAction[] = [];
  for (const a of raw.slice(0, ACTION_LIMIT) as Record<string, unknown>[]) {
    if (!a || typeof a !== "object") continue;
    if (a.t === "group" && idText(a.id)) out.push({ t: "group", id: a.id as string });
    else if (a.t === "topic" && idText(a.id)) out.push({ t: "topic", id: a.id as string });
    else if (a.t === "intake" && idText(a.option)) out.push({ t: "intake", option: a.option as string });
    else if (a.t === "extra" && idText(a.topic) && typeof a.which === "string" && EXTRA_KEYS.has(a.which)) out.push({ t: "extra", topic: a.topic as string, which: a.which as TalkExtra });
    else if (a.t === "feel" && idText(a.topic) && (a.kind === "yes" || a.kind === "mixed" || a.kind === "unsure")) out.push({ t: "feel", topic: a.topic as string, kind: a.kind });
    else if (a.t === "free") {
      const q = cleanText(a.q, QUESTION_MAX.paid);
      const paragraphs = Array.isArray(a.a) ? a.a.map((p) => cleanText(p, FREE_ANSWER_PARAGRAPH_MAX)).filter((p): p is string => p !== null).slice(0, FREE_ANSWER_PARAGRAPHS_MAX) : [];
      if (q && paragraphs.length > 0) out.push({ t: "free", q, a: paragraphs, ...(idText(a.topic) ? { topic: a.topic as string } : {}) });
    }
  }
  return out;
}

/** 저장된 것을 읽는다 — 형식이 맞지 않거나 없는 주제 · 답을 가리키면 그 행동만 버린다 */
export function parseRoomSave(raw: unknown, model: TalkModel, roomId: RoomId): RoomAction[] {
  if (!raw || typeof raw !== "object" || (raw as RoomSave).v !== ROOM_SAVE_VERSION) return [];
  const topicIds = new Set(allTopics(model).map((t) => t.id));
  const groupIds = new Set(model.groups.map((g) => g.id));
  const intakeIds = new Set(ROOMS[roomId].intake ? [...ROOMS[roomId].intake!.options.map((o) => o.id), "skip"] : []);
  const out: RoomAction[] = [];
  for (const a of sanitizeRoomActions((raw as RoomSave).actions)) {
    if (a.t === "group" && groupIds.has(a.id)) out.push(a);
    else if (a.t === "topic" && topicIds.has(a.id)) out.push(a);
    else if (a.t === "intake" && intakeIds.has(a.option)) out.push(a);
    else if ((a.t === "extra" || a.t === "feel") && topicIds.has(a.topic)) out.push(a);
    else if (a.t === "free") out.push(a.topic && !topicIds.has(a.topic) ? { t: "free", q: a.q, a: a.a } : a);
  }
  return out;
}

/** 행동 목록을 처음부터 다시 적용해 대화를 되살린다 (같은 입력이면 같은 대화) */
export function replayRoom(model: TalkModel, roomId: RoomId, actions: RoomAction[], ctx: RoomContext = {}): RoomState {
  return actions.reduce((state, action) => applyAction(model, roomId, state, action, ctx).state, startRoom(model, roomId));
}
