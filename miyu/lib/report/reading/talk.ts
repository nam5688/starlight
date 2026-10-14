// 대화형 풀이(1단계) — 저장된 읽기 구조 리포트를 "주제별 짧은 풀이 + 눌러서 이어 보는 조각"으로 나눈다.
// 새 글을 쓰지 않는다(AI 호출 없음): 풀이 · 예시 · 근거는 모두 저장된 리포트의 문장 그대로이고, 대화 속 안내 문구만 이 파일의 고정 문구다.
// 자유 질문 · "내 경우는 달라"에 AI가 답하는 기능은 아직 없다(2단계, 운영자 결정 뒤) — 화면에서 "준비 중"으로 밝힌다.
// 이 파일은 채널 독립 코드다(React · Next · 브라우저 API를 쓰지 않는다). 화면은 components/talk/ 에 있다.
import type { MonthCalendar } from "../../saju/interpret/months.ts";
import { basisFor } from "./assemble.ts";
import { CALENDAR_CHAT_NOTES, MONTH_NOTES, upcomingMonthTexts, upcomingSummary, type CalendarTopic } from "./calendar-text.ts";
import { splitSentences } from "./line-breaks.ts";
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
  timeline?: { slots: LuckSlot[]; text: string; reference: { year: number; month: number } };
  /** [예를 들어줘] — 비어 있으면 버튼을 보이지 않는다 */
  example: TalkPiece[];
  /** [더 자세히 알려줘] */
  detail: TalkPiece[];
  /** [이렇게 분석한 이유] — 저장된 분석 근거 */
  basis: ReadingBasis | null;
  /** 앞으로의 시기 — 저장된 월별 달력(코드 계산). 있으면 [가까운 관계가 움직이는 달은?] · [재물이 눈에 띄는 달은?] 버튼을 보인다 */
  calendar?: { items: MonthCalendar[]; reference: { year: number; month: number } };
};

/** 답장 버튼이 여는 조각 */
export type TalkExtra = "example" | "detail" | "basis" | "calendar-love" | "calendar-money";

export type TalkCard = {
  headline: string;
  /** 대표 경향 이름(~형, 후보 이름) — 없으면 null */
  tendency: string | null;
  strength: { label: string; keyword: string; note: string };
  caution: { label: string; keyword: string; note: string };
  flow: { label: string; keyword: string; note: string };
  /** 사용한 정보의 이름 (없음은 넣지 않는다) */
  inputs: string[];
};

/** 첫 화면에서 고르는 큰 묶음 — 묶음 안의 풀이는 이어서 고른다 (예: 내 성향 → 장점 · 단점이 될 수 있는 부분 → 중요하게 여기는 것) */
export type TalkGroup = { id: string; chip: string; topicIds: string[] };

export type TalkModel = { name: string; card: TalkCard; topics: TalkTopic[]; groups: TalkGroup[] };

/**
 * 말풍선 하나에 담기는 내용 — 저장된 리포트의 글을 문장 단위로 끊어 나눈 것이다(글자는 바꾸지 않는다).
 * text: 말풍선(label은 위의 작은 이름표, muted는 작은 안내) · 나머지는 말풍선 안에 들어가는 그림 · 표.
 */
export type TalkBubble =
  | { kind: "headline"; number: number; title: string; text: string }
  | { kind: "text"; text: string; label?: string; muted?: boolean }
  | { kind: "traits"; traits: { name: string; shinesShort: string; burdenShort: string }[] }
  | { kind: "timeline"; slots: LuckSlot[]; text: string; reference: { year: number; month: number } }
  | { kind: "flow"; when: string; steps: { label: string; text: string }[]; helpful: string }
  | { kind: "comfort"; comfortable: string[]; clash: string[]; note: string }
  | { kind: "basis"; basis: ReadingBasis };

export const CARD_DISCLAIMER = "참고용 해석이며 예측이나 진단이 아닙니다.";

/** 대화 속 고정 안내 문구 — 친구에게 말하듯 짧게. 풀이 내용은 여기에 쓰지 않는다 */
export const TALK_COPY = {
  intro: (name: string) => `${name} 님의 분석을 한 장으로 정리했어요.`,
  askTopic: "저장해 두고 다시 봐도 좋아요. 어떤 이야기부터 풀어 볼까요?",
  notice: "이 대화는 저장된 리포트의 풀이를 나눠서 보여 줘요. AI가 새로 쓰는 글이 아니고, 예측이나 결과를 보장하지 않아요.",
  askNext: "더 알아볼까요?",
  askMore: "더 보고 싶은 이야기를 골라 주세요.",
  opening: (chip: string) => `‘${chip}’ 이야기부터 해 볼게요.`,
  openingMore: (chip: string) => `이어서 ‘${chip}’ 이야기예요.`,
  afterExample: "맞는 부분도, 아닌 부분도 있을 수 있어요.",
  afterDetail: "여기까지가 자세한 풀이예요.",
  basisIntro: "이 풀이는 아래 자료를 보고 썼어요. 사주 계산은 만세력 엔진이 한 값이고, 해석 규칙은 아직 검증된 사실이 아니에요.",
  differ: "맞지 않는 부분이 있을 수 있어요. 대화로 풀이를 함께 고쳐 가는 기능은 아직 준비 중이에요. 지금은 어느 부분이 어떤 상황에서 달랐는지 직접 적어 두세요. 나중에 해석을 다시 살펴볼 때 기준이 돼요.",
  concernPending: "지금 고민을 대화로 이어 가는 기능은 아직 준비 중이에요.",
  concernPendingLink: "고민을 적어 두는 건 ‘나의 고민 기록소’에서 할 수 있어요.",
  allDone: "준비한 풀이를 모두 둘러봤어요. 전체 내용은 리포트에서 언제든 다시 볼 수 있어요.",
  menuTitle: "다른 이야기 보기",
  freeQuestion: "자유롭게 질문하기 · 준비 중",
  freeQuestionPending: "자유 질문은 준비 중이에요. 지금은 버튼으로 이어 볼 수 있어요.",
  buttons: { example: "예를 들어줘", detail: "더 자세히 알려줘", basis: "이렇게 분석한 이유", "calendar-love": "가까운 관계가 움직이는 달은?", "calendar-money": "재물이 눈에 띄는 달은?", differ: "내 경우는 달라", concern: "고민 말하기", pickTopic: "다른 주제 고르기", next: "다음 풀이", menu: "메뉴 열기", menuClose: "메뉴 닫기", fullReport: "전체 리포트 보기", data: "내 분석 자료" },
} as const;

const CHIP: Record<string, string> = {
  tendency: "나는 어떤 사람?",
  "strength-burden": "장점 · 단점이 될 수 있는 부분",
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
    for (const t of b.traits) detail.push(para(t.shines, `${t.name} · 장점`), para(t.burden, `${t.name} · 단점이 될 수 있는 부분`));
  } else if (b.example) example.push(para(b.example));
  if (b.reactionFlow) example.push({ kind: "flow", when: b.reactionFlow.when, steps: b.reactionFlow.steps, helpful: b.reactionFlow.helpful });
  // 깊게 읽는 소단락(가까운 관계 · 일과 돈)은 [더 자세히 알려줘]의 앞에 — 제목이 이름표, 풀이와 해 볼 것이 말풍선으로 도착한다
  for (const s of b.sections ?? []) detail.push(para(s.body, s.title), para(s.tryIt, "해 볼 것"));
  for (const d of b.details) detail.push(para(d));
  if (b.comfort) detail.push({ kind: "comfort", comfortable: b.comfort.comfortable, clash: b.comfort.clash, note: b.comfort.note });
  if (b.reactionFlow) detail.push(para(b.reactionFlow.helpful, "이럴 때 도움이 되는 것"));
  if (b.detailExample) detail.push(para(b.detailExample, "예를 들면"));
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
    example,
    detail,
    basis: b.basis,
  };
}

export function buildTalkModel(report: IntegratedReadingReport, opts: { tendencyName?: string } = {}): TalkModel {
  const topics: TalkTopic[] = report.blocks.map((b, i) => blockTopic(b, i + 1));

  const f = report.flow;
  topics.push({
    id: "flow",
    number: report.blocks.length + 1,
    chip: f.topic,
    title: f.topic,
    headline: f.headline,
    summary: [f.summary],
    caveat: f.caveat,
    timeline: { slots: report.timeline, text: f.cardText, reference: report.timelineReference },
    example: [note(f.scenarioNote), ...f.scenarios.map((s) => para(s.then, s.when))],
    detail: [...f.years.map((y) => para(y.theme, y.year)), ...f.periods.flatMap((p) => [para(p.theme, p.period), para(p.watch, `${p.period} · 살펴볼 점`)]), note(f.statistics)],
    basis: f.basis,
    ...(report.calendars && report.calendars.items.length > 0 ? { calendar: { items: report.calendars.items, reference: report.timelineReference } } : {}),
  });

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
    return { label: c?.label ?? "", keyword: c?.keyword ?? "", note: c?.note ?? "" };
  };
  const inputs = report.inputs.filter((i) => i.status !== "none").map((i) => `${i.name.replace(/\(.*\)/, "").trim()}${i.status === "dev" ? " (개발용 문항)" : ""}`);

  return {
    name: report.personName,
    card: {
      headline: report.headline,
      tendency: opts.tendencyName ?? report.base?.tendency.name ?? null,
      strength: cardOf("strength"),
      caution: cardOf("caution"),
      flow: cardOf("flow"),
      inputs,
    },
    topics,
    groups: groupsOf(topics),
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
function groupsOf(topics: TalkTopic[]): TalkGroup[] {
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

/** 말풍선 하나에 합쳐 넣는 두 문장의 최대 글자 수 — 이보다 길면 한 문장씩 따로 보낸다 */
export const BUBBLE_PAIR_MAX = 72;

/**
 * 저장된 글을 말풍선 단위로 나눈다 — 문장 단위로 끊고, 짧은 두 문장만 한 말풍선에 묶는다.
 * 글자는 바꾸지 않는다: 돌려준 말풍선을 공백으로 이으면 원래 글(공백만 정리)과 같다.
 */
export function toBubbles(text: string): string[] {
  const sentences = splitSentences(text);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const a = sentences[i];
    const b = sentences[i + 1];
    if (b !== undefined && a.length + 1 + b.length <= BUBBLE_PAIR_MAX) {
      out.push(`${a} ${b}`);
      i++;
    } else out.push(a);
  }
  return out;
}

/** 조각(문단 · 안내 · 그림)을 말풍선으로 — 이름표는 그 조각의 첫 말풍선에만 붙는다 */
function piecesToBubbles(pieces: TalkPiece[]): TalkBubble[] {
  return pieces.flatMap((p): TalkBubble[] => {
    if (p.kind === "para") return toBubbles(p.text).map((text, i) => ({ kind: "text", text, ...(p.label && i === 0 ? { label: p.label } : {}) }));
    if (p.kind === "note") return toBubbles(p.text).map((text) => ({ kind: "text", text, muted: true }));
    if (p.kind === "flow") return [{ kind: "flow", when: p.when, steps: p.steps, helpful: p.helpful }];
    return [{ kind: "comfort", comfortable: p.comfortable, clash: p.clash, note: p.note }];
  });
}

/** 주제를 골랐을 때 이어서 도착하는 짧은 풀이 — 결론 한 줄 → 요약 → (특징 · 시기 그림) → 안내 */
export function answerBubbles(t: TalkTopic): TalkBubble[] {
  const out: TalkBubble[] = [{ kind: "headline", number: t.number, title: t.title, text: t.headline }];
  for (const s of t.summary) for (const text of toBubbles(s)) out.push({ kind: "text", text });
  if (t.traits) out.push({ kind: "traits", traits: t.traits });
  if (t.timeline) out.push({ kind: "timeline", slots: t.timeline.slots, text: t.timeline.text, reference: t.timeline.reference });
  if (t.caveat) for (const text of toBubbles(t.caveat)) out.push({ kind: "text", text, muted: true });
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
  const out: TalkBubble[] = toBubbles(upcomingSummary(cal.items, cal.reference, topic)).map((text) => ({ kind: "text", text }));
  const months = upcomingMonthTexts(cal.items, cal.reference, topic);
  for (const m of months) out.push({ kind: "text", text: m.text, label: m.label });
  if (months.length > 0) {
    for (const text of toBubbles(MONTH_NOTES.limit)) out.push({ kind: "text", text, muted: true });
    for (const text of toBubbles(CALENDAR_CHAT_NOTES.more)) out.push({ kind: "text", text, muted: true });
  }
  return out;
}
