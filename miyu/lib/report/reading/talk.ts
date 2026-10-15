// 대화형 풀이(1단계) — 저장된 읽기 구조 리포트를 "주제별 짧은 풀이 + 눌러서 이어 보는 조각"으로 나눈다.
// 새 글을 쓰지 않는다(AI 호출 없음): 풀이 · 예시 · 근거는 모두 저장된 리포트의 문장 그대로이고, 대화 속 안내 문구만 이 파일의 고정 문구다.
// 자유 질문 · "내 경우는 달라"에 AI가 답하는 기능은 아직 없다(2단계, 운영자 결정 뒤) — 화면에서 "준비 중"으로 밝힌다.
// 이 파일은 채널 독립 코드다(React · Next · 브라우저 API를 쓰지 않는다). 화면은 components/talk/ 에 있다.
import { tendencyPhrase } from "../../assessment/dev-rules.ts";
import { CHAT_ROOMS, formatKrw, QUESTION_PACK_SIZE, REPORT_TIER_NAMES } from "../../config/product.ts";
import type { SajuResult } from "../../saju/engine.ts";
import { periodPlain } from "../../saju/interpret/period-plain.ts";
import type { MonthCalendar } from "../../saju/interpret/months.ts";
import { basisFor } from "./assemble.ts";
import { codeTopicsFor } from "./talk-code.ts";
import { CALENDAR_CHAT_NOTES, MONTH_NOTES, upcomingMonthTexts, upcomingSummary, type CalendarTopic } from "./calendar-text.ts";
import type { IntegratedReadingReport, LuckSlot, ReadingBasis, ReadingBlock } from "./types.ts";

/** 대화 속 조각 — para: 문단(label은 위의 작은 이름표) · note: 작은 안내 · flow: 반응이 이어지는 모습 · comfort: 편안한 조건 / 부딪히기 쉬운 상황 */
export type TalkPiece =
  | { kind: "para"; text: string; label?: string }
  | { kind: "note"; text: string }
  | { kind: "flow"; when: string; steps: { label: string; text: string }[]; helpful: string }
  | { kind: "comfort"; comfortable: string[]; clash: string[]; note: string };

export type TalkTopic = {
  /** 블록 id · "flow"(앞으로의 시기) · "focus"(알려 주신 고민) */
  id: string;
  /** 큰 주제 번호 (리포트의 번호와 같다) */
  number: number;
  /** 고르는 버튼 이름 */
  chip: string;
  /** 풀이 위의 작은 이름표 (리포트의 주제 이름) */
  title: string;
  headline: string;
  /** 짧은 풀이 — 저장된 요약 그대로 */
  summary: string[];
  traits?: { name: string; shinesShort: string; burdenShort: string }[];
  caveat?: string;
  /** 지금 나의 시기 그림 — 제목 · 생활 의미는 카드가 계산된 그룹에서 쉬운 말로 보이고, 예시는 이어지는 말풍선(periodExample)으로 보낸다 */
  timeline?: { slots: LuckSlot[]; reference: { year: number; month: number } };
  /** 지금 나의 시기의 예시 한 줄 — 계산된 현재 시기의 그룹을 쉬운 말로 옮긴 고정 문구(period-plain.ts) */
  periodExample?: string;
  /** [예를 들어줘] — 비어 있으면 버튼을 보이지 않는다 */
  example: TalkPiece[];
  /** [더 자세히 알려줘] */
  detail: TalkPiece[];
  /** [이렇게 분석한 이유] — 저장된 분석 근거 */
  basis: ReadingBasis | null;
  /** 앞으로의 시기 — 저장된 월별 달력(코드 계산). 있으면 [연애운이 강해지는 달은?] · [재물이 눈에 띄는 달은?] 버튼을 보인다 */
  calendar?: { items: MonthCalendar[]; reference: { year: number; month: number } };
  /** 이 풀이가 소단락(제목 → 풀이 → 해 볼 것) 몇 개로 시작하는가 — detail의 앞쪽 2×개 조각이 소단락이다. 방마다 보여 줄 소단락을 고를 때 쓴다 */
  sectionCount?: number;
  /** 먼저 묻는 질문에서 고른 답(선택지 번호)에 따라 풀이 뒤에 덧붙는 말풍선 — 예: 오늘의 한 장에서 고른 영역의 한 줄 팁 · 올해의 흐름에서 고른 달력 */
  picks?: Record<string, TalkBubble[]>;
  /** 무료 맛보기에서 이 풀이에 내 자료(응답에서 읽은 반응 · 사주 계산)로 읽은 내용이 있는가 — 없으면(예: "가볍게 살펴봤어요" 한 줄뿐) 그 방의 무료 질문을 열지 않는다. 코드가 계산한 풀이는 요약이 있으면 있는 것으로 본다 */
  grounded?: boolean;
  /** 무료 맛보기 — 이 풀이의 나머지는 리포트에서 이어진다. 여기에는 질문(무엇에 답하는지)만 담고 잠긴 문장은 담지 않는다 */
  locked?: { hooks: string[] };
  /** 풀이를 읽은 뒤 [맞아요] 같은 내 경험 답장을 보이지 않는다 (오늘의 한 장처럼 한 번으로 끝나는 풀이) */
  noFeel?: boolean;
  /** 마지막 질문 대신 보이는 맺음말 (한 번으로 끝나는 풀이) */
  closing?: string;
  /** 풀이 뒤의 질문을 이 문장으로 바꾼다 (없으면 주제별 기본 질문) */
  askText?: string;
};

/** 답장 버튼이 여는 조각 */
export type TalkExtra = "example" | "detail" | "basis" | "calendar-love" | "calendar-money";

export type TalkCard = {
  headline: string;
  /** 대표 경향 설명(예: 관계에서 확인을 중요하게 여기는 편) — "~형" 이름표 대신 쓴다. 없으면 null */
  tendency: string | null;
  strength: { label: string; keyword: string; note: string };
  caution: { label: string; keyword: string; note: string };
  /** foot: 기간 줄(예: 2024.08–2034.07 · 사주에서 보는 10년 시기) — 이전에 저장된 리포트에는 없다 */
  flow: { label: string; keyword: string; note: string; foot?: string };
  /** 사용한 정보의 이름 (없음은 넣지 않는다) */
  inputs: string[];
};

/** 첫 화면에서 고르는 큰 묶음 — 묶음 안의 풀이는 이어서 고른다 (예: 내 성향 → 강한 포인트 · 힘들 수 있는 포인트 → 중요하게 여기는 것) */
export type TalkGroup = { id: string; chip: string; topicIds: string[] };

/**
 * 자유 질문 · 이야기 이어 가기의 상태 — ready: 입력창을 연다 · pending: AI 연결 전이라 준비 중 · locked: 리포트를 받은 분에게 열린다.
 * free: 무료 맛보기(구매 전)에서 로그인한 분께 열어 주는 "첫 질문"이다(ready일 때) · used: 그 무료 질문을 이미 썼다(locked일 때).
 */
export type TalkChat = {
  state: "ready" | "pending" | "locked";
  /** 무료 리포트(무료) 회원이다 — 무료 질문 한 번의 글자 수가 QUESTION_MAX.free(300자)로 제한된다 (심층 리포트 회원의 질문 · 결제한 질문은 500자) */
  free?: boolean;
  /** 이 방의 무료 질문을 모두 썼다 (state가 ready면 유료 질문으로 이어서 묻는 중, locked면 유료 질문을 열 수 없다) */
  used?: boolean;
  /** 이 방에 남은 무료 질문 수 (방마다 정해진다 — CHAT_ROOMS) */
  left?: number;
  /** 무료 맛보기에서 이 방의 풀이에 내 자료로 읽은 내용이 아직 없어 질문을 열지 않았다 (locked일 때) */
  noMaterial?: boolean;
  /** 결제한 질문의 장부를 쓸 수 있다 (DB 13번 전이면 없음) — balance가 per 이상이면 결제한 질문이 남아 있다(결제 없이 묻는다, 남은 질문 수 = balance ÷ per) */
  cash?: { balance: number; per: number };
  /** 이 방은 질문 3개 묶음 결제로 이어 갈 수 있다(결제가 연결됐을 때) — 결제한 질문이 하나도 없을 때 질문을 보내면 결제 화면으로 이어진다. priceKrw는 묶음(질문 3개)의 값 */
  pay?: { priceKrw: number };
  /** 무료 리포트로는 더 이어 갈 수 없는 방이다 (질문이 없는 방) — 심층 리포트로 이어 준다 */
  deepOnly?: boolean;
};
/** 무료 맛보기에서 잠긴 내용으로 이어지는 버튼 — owned: 이미 구매한 분(리포트 보기)인지 */
export type TalkBuy = { href: string; label: string; owned: boolean };

export type TalkModel = {
  name: string;
  card: TalkCard;
  /** 리포트의 주제 풀이 (저장된 글 그대로) */
  topics: TalkTopic[];
  groups: TalkGroup[];
  /** 리포트 주제가 아니라 코드가 계산해 만든 풀이(오늘의 한 장 · 인연의 경향 · 오래 가는 관계) — 방이 id로 직접 연다. AI가 쓰지 않는다 */
  codeTopics: TalkTopic[];
  /** paid: 저장된 리포트 전체 · free: 무료 맛보기(잠긴 내용은 담지 않는다) */
  tier: "paid" | "free";
  buy: TalkBuy | null;
  /** 오늘(한국 날짜, YYYY-MM-DD) — 오늘의 한 장 방의 이어 보기 저장은 날짜별로 나눈다 */
  dayKey: string;
  chat: TalkChat;
};

/**
 * 말풍선 하나에 담기는 내용 — 저장된 리포트의 글을 문단 단위로 보여 준다(글자는 바꾸지 않는다). 답변 한 번에 말풍선은 1~2개다(운영자 2026-10-15).
 * answer: 결론 한 줄(굵게) + 요약을 한 말풍선으로 묶은 것 · text: 말풍선(label은 위의 작은 이름표, muted는 작은 안내) · 나머지는 말풍선 안에 들어가는 그림 · 표.
 */
export type TalkBubble =
  | { kind: "answer"; number: number; title: string; headline: string; paragraphs: string[] }
  | { kind: "text"; text: string; label?: string; muted?: boolean }
  | { kind: "traits"; traits: { name: string; shinesShort: string; burdenShort: string }[] }
  | { kind: "timeline"; slots: LuckSlot[]; reference: { year: number; month: number } }
  | { kind: "flow"; when: string; steps: { label: string; text: string }[]; helpful: string }
  | { kind: "comfort"; comfortable: string[]; clash: string[]; note: string }
  | { kind: "basis"; basis: ReadingBasis }
  /** 무료 맛보기의 잠금 안내 — 이어지는 내용이 답하는 질문들(문장이 아니라 질문만). 구매 버튼은 화면이 model.buy로 붙인다 */
  | { kind: "lock"; title: string; hooks: string[] };

export const CARD_DISCLAIMER = "참고용 해석이며 예측이나 진단이 아닙니다.";

/**
 * 질문 한 번의 글자 수 한도(운영자 2026-10-15: "500자도 너무 많다 — 무료 300자 · 유료 리포트 500자 · 질문 충전한 사람도 500자").
 *  - free: 무료 리포트 회원의 **무료 질문** 300자
 *  - paid: 그 밖 — 심층 리포트 회원의 질문, 그리고 결제한 질문(질문 3개 묶음 2,500원, 무료 리포트 회원이어도) 500자
 * 입력창 · 서버 확인 · 저장이 같은 값을 쓴다. 저장하는 글은 둘 중 큰 쪽(paid)까지 받는다.
 */
export const QUESTION_MAX = { free: 300, paid: 500 } as const;
export const questionMaxFor = (free: boolean) => (free ? QUESTION_MAX.free : QUESTION_MAX.paid);

/** 대화 속 고정 안내 문구 — 친구에게 말하듯 짧게. 풀이 내용은 여기에 쓰지 않는다 */
export const TALK_COPY = {
  intro: (name: string) => `${name} 님의 분석을 한 장으로 정리했어요.`,
  askTopic: "어떤 이야기부터 풀어 볼까요?",
  notice: "저장된 리포트를 나눠서 보여 줘요. AI가 새로 쓰는 글이 아니고, 결과를 보장하지 않아요.",
  /** 풀이를 읽은 뒤 내 경험을 말하게 하는 질문 — 주제마다 다르다 */
  ask: {
    tendency: (name: string) => `${name} 님은 실제로 어때요?`,
    "strength-burden": (name: string) => `${name} 님은 실제로 어때요?`,
    values: (name: string) => `${name} 님은 실제로 어때요?`,
    love: () => "가까운 사람과는 실제로 어때요?",
    "work-money": () => "일이나 돈 앞에서는 실제로 어때요?",
    flow: () => "지금 시기는 어떻게 느껴져요?",
    focus: () => "이 고민, 지금은 어떤 상태예요?",
    partner: () => "이 분위기, 끌렸던 사람과 닿는 부분이 있어요?",
    marriage: () => "이 조건, 내가 생각하는 오래 가는 관계와 닮았어요?",
    other: (name: string) => `${name} 님은 실제로 어때요?`,
  },
  /** 내 경험을 고르는 답장 — 고정 문구로만 답하고 눌러 준 답을 저장하거나 해석에 반영하지 않는다 */
  feel: {
    yes: { label: "맞아요", lead: "그렇군요. 그럼 이런 장면일 수 있어요.", leadNoExample: "그렇군요. 맞는 부분이 있다면 그 부분을 기억해 두세요." },
    mixed: {
      label: "상황에 따라 달라요",
      lead: "상황에 따라 다른 건 아주 자연스러워요. 어떤 때는 맞고 어떤 때는 다르다는 걸 알아 두는 것도 이 풀이를 쓰는 방법이에요.",
      pending: "어떤 상황에서 달랐는지 대화로 이어 가는 기능은 아직 준비 중이에요.",
      pendingLink: "지금은 ‘나의 고민 기록소’에 적어 둘 수 있어요.",
      locked: "어떤 상황에서 달랐는지 이어서 이야기 나누는 건 리포트를 받은 분께 열려 있어요.",
    },
    unsure: { label: "잘 모르겠어요", lead: "괜찮아요. 한 번에 정할 필요 없어요. 일상 예시나 분석한 이유를 보고 맞는 부분만 가져가세요." },
    note: "눌러 준 답은 풀이를 바꾸지 않아요.",
  },
  /** 무료 맛보기의 잠금 안내 */
  lock: { title: "여기서부터는 리포트에서 이어져요", sub: "리포트에는 이런 질문의 답이 들어 있어요" },
  basisIntro: "이 풀이는 아래 자료를 보고 썼어요. 사주 계산은 만세력 엔진이 한 값이고, 해석 규칙은 아직 검증된 사실이 아니에요.",
  concernPending: "지금 고민을 대화로 이어 가는 기능은 아직 준비 중이에요.",
  concernPendingLink: "고민을 적어 두는 건 ‘나의 고민 기록소’에서 할 수 있어요.",
  allDone: "준비한 풀이를 모두 둘러봤어요. 전체 내용은 리포트에서 언제든 다시 볼 수 있어요.",
  typing: "미유가 입력하고 있어요",
  menuTitle: "다른 이야기 보기",
  freeQuestion: "자유롭게 질문하기 · 준비 중",
  freeQuestionPending: "자유 질문은 준비 중이에요. 지금은 버튼으로 이어 볼 수 있어요.",
  freeQuestionReady: "궁금한 것을 직접 물어보세요",
  freeQuestionAsking: "어떤 상황에서 달랐는지 적어 주세요",
  freeQuestionLocked: "자유 질문 · 리포트를 받으면 열려요",
  freeQuestionNoMaterial: "이 주제는 리포트를 받으면 질문할 수 있어요",
  freeQuestionUsed: "무료 질문을 모두 썼어요",
  /** 무료 질문을 다 썼을 때 입력창 안내 — 결제해 둔 질문이 남아 있을 때(남은 개수) · 질문을 보내면 결제로 이어질 때(질문 3개 묶음 결제, 낱개 없음) */
  freeQuestionTicket: (left: number) => `결제해 둔 질문 ${left}개가 남아 있어요`,
  freeQuestionPay: (priceKrw: number) => `질문 ${QUESTION_PACK_SIZE}개 ${formatKrw(priceKrw)} · 적어서 보내면 결제로 이어져요`,
  freeQuestionDeepOnly: "자세한 이야기는 심층 리포트에서 이어져요",
  /** 유료 질문을 보내 결제 화면으로 넘어가는 동안 입력창에 · 결제를 마치지 못하고 돌아왔을 때 알림 */
  payMoving: "결제 화면으로 이동하고 있어요",
  payNotDone: "결제를 마치지 못해서 질문은 보내지 않았어요. 적어 두신 질문은 그대로 두었어요.",
  /**
   * 무료 질문을 모두 썼을 때 뜨는 안내창 — 무료 질문을 다 썼다는 것과 이어 가는 방법(질문 3개 묶음 결제)을 알린다(운영자 2026-10-15: 가격 · 글자 수 문장은 이 창에 넣지 않는다 — 가격은 입력창 안내와 결제 화면에 보인다).
   * 충전 금액을 고르는 선불 충전은 없다(낱개 없이 3개 묶음 하나뿐). 버튼은 입력창으로 돌아가거나(묶음 결제로 이어 갈 수 있을 때) 심층 리포트 구매로 이어진다. 경우:
   *  - free-used: 무료 리포트 회원이 이 방의 무료 질문을 다 썼다  - paid-used: 심층 리포트 회원이 다 썼다  - deep: 무료 리포트로는 더 이어 갈 수 없는 방이다
   */
  recharge: {
    "free-used": { title: "무료 질문을 모두 썼어요", body: `이어서 묻고 싶다면 질문을 적어 보내 주세요. 질문 ${QUESTION_PACK_SIZE}개를 묶어서 결제하는 화면으로 이어져요.` },
    "paid-used": { title: "이 방의 무료 질문을 모두 썼어요", body: `더 묻고 싶다면 질문을 적어 보내 주세요. 질문 ${QUESTION_PACK_SIZE}개를 묶어서 결제하는 화면으로 이어 갈 수 있어요.` },
    deep: { title: "자세한 이야기는 심층 리포트에서 이어져요", body: `${REPORT_TIER_NAMES.deep}로는 모든 상담방을 열 수 있고, 방마다 무료 질문을 ${CHAT_ROOMS.deepFreeQuestions}번 드려요.` },
    later: "다음에 할게요",
    payLabel: "질문 이어가기",
    open: "안내 열기 — 무료 질문을 모두 썼어요",
  },
  buttons: { example: "일상 예시", detail: "더 자세히 알려줘", basis: "분석 이유", "calendar-love": "연애운이 강해지는 달은?", "calendar-money": "재물이 눈에 띄는 달은?", concern: "고민 말하기", next: "다음 풀이", menu: "메뉴 열기", menuClose: "메뉴 닫기", fullReport: "전체 리포트 보기", data: "내 분석 자료" },
} as const;

/** 남은 무료 질문 수 말 — 한 번 남았으면 "한 번", 그 이상이면 숫자로(기본 정책은 2번이라 처음에는 "2번") */
export const freeLeftText = (left?: number) => (left && left > 1 ? `${left}번` : "한 번");
/** 무료 질문이 열려 있을 때 입력창 안내 */
export const freeQuestionPlaceholder = (left?: number) => `무료 질문 ${freeLeftText(left)} · 궁금한 것을 물어보세요`;

const CHIP: Record<string, string> = {
  tendency: "나는 어떤 사람?",
  "strength-burden": "강한 포인트 · 힘들 수 있는 포인트",
  values: "중요하게 여기는 것",
  love: "가까운 관계",
  "work-money": "일과 돈",
};

const para = (text: string, label?: string): TalkPiece => ({ kind: "para", text, ...(label ? { label } : {}) });

function blockTopic(b: ReadingBlock, number: number): TalkTopic {
  const example: TalkPiece[] = [];
  const detail: TalkPiece[] = [];
  if (b.traits) {
    for (const t of b.traits) example.push(para(t.example, t.name));
    for (const t of b.traits) detail.push(para(t.shines, `${t.name} · 내가 강한 포인트`), para(t.burden, `${t.name} · 내가 힘들 수 있는 포인트`));
  } else if (b.example) example.push(para(b.example));
  if (b.reactionFlow) example.push({ kind: "flow", when: b.reactionFlow.when, steps: b.reactionFlow.steps, helpful: b.reactionFlow.helpful });
  // 깊게 읽는 소단락(가까운 관계 · 일과 돈)은 [더 자세히 알려줘]의 앞에 — 제목이 이름표, 풀이와 해 볼 것이 말풍선으로 도착한다
  for (const s of b.sections ?? []) detail.push(para(s.body, s.title), para(s.tryIt, "해 볼 것"));
  for (const d of b.details) detail.push(para(d));
  if (b.comfort) detail.push({ kind: "comfort", comfortable: b.comfort.comfortable, clash: b.comfort.clash, note: b.comfort.note });
  if (b.reactionFlow) detail.push(para(b.reactionFlow.helpful));
  if (b.detailExample) detail.push(para(b.detailExample));
  if (b.watch) detail.push(para(b.watch, "살펴볼 점"));
  return {
    id: b.id,
    number,
    chip: CHIP[b.id] ?? b.topic,
    title: b.topic,
    headline: b.headline,
    summary: [b.summary],
    ...(b.traits ? { traits: b.traits.map((t) => ({ name: t.name, shinesShort: t.shinesShort, burdenShort: t.burdenShort })) } : {}),
    ...(b.caveat ? { caveat: b.caveat } : {}),
    ...(b.sections?.length ? { sectionCount: b.sections.length } : {}),
    example,
    detail,
    basis: b.basis,
  };
}

export type TalkModelOptions = {
  tendencyName?: string;
  /** 사주 계산 결과 — 있으면 인연의 경향 · 오래 가는 관계 · 오늘의 한 장을 코드로 계산해 더한다 */
  saju?: SajuResult | null;
  /** 오늘(한국 날짜) — 오늘의 한 장에 쓴다. 없으면 오늘의 한 장은 만들지 않는다 */
  today?: { year: number; month: number; day: number };
  chat?: TalkChat;
};

export function buildTalkModel(report: IntegratedReadingReport, opts: TalkModelOptions = {}): TalkModel {
  const topics: TalkTopic[] = report.blocks.map((b, i) => blockTopic(b, i + 1));

  const f = report.flow;
  const current = report.timeline.find((s) => s.role === "current");
  topics.push({
    id: "flow",
    number: report.blocks.length + 1,
    chip: f.topic,
    title: f.topic,
    headline: f.headline,
    summary: [f.summary],
    caveat: f.caveat,
    timeline: { slots: report.timeline, reference: report.timelineReference },
    ...(current ? { periodExample: periodPlain(current.stemGroup, current.branchGroup).example } : {}),
    example: [note(f.scenarioNote), ...f.scenarios.map((s) => para(s.then, s.when))],
    detail: [...f.years.map((y) => para(y.theme, y.year)), ...f.periods.flatMap((p) => [para(p.theme, p.period), para(p.watch, `${p.period} · 살펴볼 점`)]), note(f.statistics)],
    basis: f.basis,
    ...(report.calendars && report.calendars.items.length > 0 ? { calendar: { items: report.calendars.items, reference: report.timelineReference } } : {}),
  });
  const calendar = report.calendars && report.calendars.items.length > 0 ? { items: report.calendars.items, reference: report.timelineReference } : undefined;
  // 올해의 흐름 방: 먼저 묻는 질문에서 고른 쪽(재물 · 인연)의 월별 달력을 시기 풀이 뒤에 바로 보여 준다
  const flowTopic = topics.find((t) => t.id === "flow");
  if (flowTopic && calendar) flowTopic.picks = { money: calendarBubbles(calendar, "money"), love: calendarBubbles(calendar, "love") };

  if (report.focus?.length) {
    topics.push({
      id: "focus",
      number: topics.length + 1,
      chip: "알려 주신 고민",
      title: "알려 주신 고민까지 반영한 해석",
      headline: "알려 주신 고민을 반영하면",
      summary: report.focus.map((x) => x.text),
      example: [],
      detail: [],
      basis: report.generated ? basisFor(report.focus.flatMap((x) => x.evidence), report.generated.evidence) : null,
    });
  }

  const cardOf = (kind: "strength" | "caution" | "flow") => {
    const c = report.summary.find((s) => s.kind === kind);
    return { label: c?.label ?? "", keyword: c?.keyword ?? "", note: c?.note ?? "", ...(c?.foot ? { foot: c.foot } : {}) };
  };
  const inputs = report.inputs.filter((i) => i.status !== "none").map((i) => `${i.name.replace(/\(.*\)/, "").trim()}${i.status === "dev" ? " (개발용 문항)" : ""}`);

  return {
    name: report.personName,
    card: {
      headline: report.headline,
      tendency: tendencyPhrase(opts.tendencyName ?? report.base?.tendency.name),
      strength: cardOf("strength"),
      caution: cardOf("caution"),
      flow: cardOf("flow"),
      inputs,
    },
    topics,
    groups: groupsOf(topics),
    codeTopics: codeTopicsFor({ saju: opts.saju ?? null, today: opts.today ?? null, calendar, tier: "paid" }),
    tier: "paid",
    buy: null,
    dayKey: opts.today ? `${opts.today.year}-${String(opts.today.month).padStart(2, "0")}-${String(opts.today.day).padStart(2, "0")}` : "",
    chat: opts.chat ?? { state: "pending" },
  };
}

/** 첫 화면 묶음 — [내 성향] [연애 · 관계] [일 · 돈] [앞으로의 시기] (+ 알려 준 고민이 있으면 그 주제). 어느 묶음에도 없는 풀이는 따로 묶어 빠뜨리지 않는다 */
const GROUPS: { id: string; chip: string; ids: string[] }[] = [
  { id: "me", chip: "내 성향", ids: ["tendency", "strength-burden", "values"] },
  { id: "relation", chip: "연애 · 관계", ids: ["love"] },
  { id: "work", chip: "일 · 돈", ids: ["work-money"] },
  { id: "flow", chip: "앞으로의 시기", ids: ["flow"] },
  { id: "focus", chip: "알려 주신 고민", ids: ["focus"] },
];
export function groupsOf(topics: TalkTopic[]): TalkGroup[] {
  const have = new Set(topics.map((t) => t.id));
  const placed = new Set(GROUPS.flatMap((g) => g.ids));
  const groups = GROUPS.map((g) => ({ id: g.id, chip: g.chip, topicIds: g.ids.filter((id) => have.has(id)) })).filter((g) => g.topicIds.length > 0);
  for (const t of topics) if (!placed.has(t.id)) groups.push({ id: t.id, chip: t.chip, topicIds: [t.id] });
  return groups;
}

function note(text: string): TalkPiece {
  return { kind: "note", text };
}

/** 다음 풀이 — 지금 주제 다음 순서에서 아직 보지 않은 첫 주제 (없으면 처음부터 다시 훑어 보지 않은 것). 모두 봤으면 null */
export function nextTopic(topics: TalkTopic[], currentId: string | null, opened: ReadonlySet<string>): TalkTopic | null {
  const start = currentId ? topics.findIndex((t) => t.id === currentId) + 1 : 0;
  const order = [...topics.slice(start), ...topics.slice(0, start)];
  return order.find((t) => !opened.has(t.id)) ?? null;
}

/** 조각(문단 · 안내 · 그림)을 말풍선으로 — 문단 하나가 말풍선 하나이고 이름표는 그 위에 붙는다 */
function piecesToBubbles(pieces: TalkPiece[]): TalkBubble[] {
  return pieces.flatMap((p): TalkBubble[] => {
    if (p.kind === "para") return [{ kind: "text", text: p.text, ...(p.label ? { label: p.label } : {}) }];
    if (p.kind === "note") return [{ kind: "text", text: p.text, muted: true }];
    if (p.kind === "flow") return [{ kind: "flow", when: p.when, steps: p.steps, helpful: p.helpful }];
    return [{ kind: "comfort", comfortable: p.comfortable, clash: p.clash, note: p.note }];
  });
}

/** 주제의 마지막 질문 — 풀이를 읽고 내 경험을 말하게 한다 (고정 문구) */
export function askFor(topicId: string, name: string): string {
  const ask = TALK_COPY.ask as Record<string, (n: string) => string>;
  return (ask[topicId] ?? ask.other)(name);
}

/**
 * 주제를 골랐을 때 이어서 도착하는 짧은 풀이 — 결론 한 줄 + 요약을 한 말풍선으로 묶고, (특징 · 시기 그림) → 먼저 묻는 질문에서 고른 답에 맞춘 덧붙임(pick) → 안내 → (무료 맛보기면 잠금 안내) → 내 경험을 묻는 질문(또는 맺음말) 순서다.
 * 답변 한 번에 말풍선은 풀이 하나 · 질문 하나다(그림 · 작은 안내는 말풍선으로 세지 않는다).
 */
export function answerBubbles(t: TalkTopic, name = "", pick?: string): TalkBubble[] {
  const out: TalkBubble[] = [{ kind: "answer", number: t.number, title: t.title, headline: t.headline, paragraphs: t.summary }];
  if (t.traits) out.push({ kind: "traits", traits: t.traits });
  if (t.timeline) out.push({ kind: "timeline", slots: t.timeline.slots, reference: t.timeline.reference });
  if (t.periodExample) out.push({ kind: "text", text: t.periodExample });
  const picked = pick ? t.picks?.[pick] : undefined;
  if (picked) out.push(...picked);
  if (t.caveat) out.push({ kind: "text", text: t.caveat, muted: true });
  if (t.locked) out.push({ kind: "lock", title: TALK_COPY.lock.title, hooks: t.locked.hooks });
  if (t.closing) out.push({ kind: "text", text: t.closing });
  else out.push({ kind: "text", text: t.askText ?? askFor(t.id, name || "당신") });
  return out;
}

/** [예를 들어줘] · [더 자세히 알려줘] · [이렇게 분석한 이유]를 눌렀을 때 도착하는 말풍선 */
export function extraBubbles(t: TalkTopic, which: TalkExtra): TalkBubble[] {
  if (which === "basis") return t.basis ? [{ kind: "basis", basis: t.basis }] : [];
  if (which === "calendar-love" || which === "calendar-money") return t.calendar ? calendarBubbles(t.calendar, which === "calendar-love" ? "love" : "money") : [];
  return piecesToBubbles(which === "example" ? t.example : t.detail);
}

/**
 * 월별 달력 답장 — 저장된 달력의 앞으로 12개월에서 고른 달만 말한다. 문장은 고정 문구와 계산된 달 · 단계 · 이유로만 만든다(AI가 쓰지 않는다).
 * 성별을 답하지 않아 가까운 관계 달력이 없으면 이유만 알린다.
 */
export function calendarBubbles(cal: NonNullable<TalkTopic["calendar"]>, topic: CalendarTopic): TalkBubble[] {
  const out: TalkBubble[] = [{ kind: "text", text: upcomingSummary(cal.items, cal.reference, topic) }];
  const months = upcomingMonthTexts(cal.items, cal.reference, topic);
  for (const m of months) out.push({ kind: "text", text: m.text, label: m.label });
  if (months.length > 0) {
    out.push({ kind: "text", text: MONTH_NOTES.limit, muted: true });
    if (topic === "love" && cal.items.some((c) => c.usedSpouseStar)) out.push({ kind: "text", text: MONTH_NOTES.commonLove, muted: true });
    out.push({ kind: "text", text: CALENDAR_CHAT_NOTES.more, muted: true });
  }
  return out;
}
