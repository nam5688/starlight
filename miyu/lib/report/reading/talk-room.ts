// 대화 방(상담 모드) — 방 정의 · 먼저 묻는 질문 · 눌러서 이어 가는 행동 → 말풍선 · 답장 버튼 · 이어 보기용 되돌려 재생.
// AI를 부르지 않는다: 풀이 · 예시 · 근거는 저장된 리포트의 글 그대로이고, 모드 접속 안내 · 먼저 묻는 질문 · 질문에 대한 짧은 반응은 이 파일의 고정 문구다.
// 눌러 준 답(연애 상태 등)은 풀이를 바꾸지 않고, 이 기기 화면에만 남는다(서버로 보내지 않는다). 풀이를 어떻게 읽을지 알려 주는 한 줄에만 쓴다.
// 채널 독립 코드다(React · Next · 브라우저 API를 쓰지 않는다). 화면은 components/talk/ 에 있다.
import { answerBubbles, extraBubbles, nextTopic, TALK_COPY, type TalkBubble, type TalkExtra, type TalkModel, type TalkTopic } from "./talk.ts";

/** 미유의 표정 — 운영자가 보낸 캐릭터 시트의 표정 시트 6가지와 액션 포즈 3가지 (그림은 components/talk/miyu-moods.ts) */
export type TalkMood = "basic" | "happy" | "surprised" | "thinking" | "playful" | "worried" | "wave" | "glasses" | "aha";
export const TALK_MOODS: readonly TalkMood[] = ["basic", "happy", "surprised", "thinking", "playful", "worried", "wave", "glasses", "aha"];

export type RoomId = "main" | "love" | "work" | "money";
export const ROOM_ORDER: readonly RoomId[] = ["main", "love", "work", "money"];

/** 미유가 보내는 말 하나 — 저장된 리포트의 글(TalkBubble) · 분석 카드 · 링크가 달린 안내 · 모드 접속 안내(가운데 알림) */
export type TalkSay = TalkBubble | { kind: "card" } | { kind: "link"; text: string; href: string; label: string } | { kind: "system"; text: string; sub?: string };
export type TalkLine = { from: "me"; text: string } | { from: "miyu"; say: TalkSay; mood: TalkMood };

type IntakeOption = { id: string; label: string; lead: string; mood: TalkMood };
/** 풀이 전에 먼저 묻는 질문 — 고른 답은 풀이를 어떻게 읽을지 알려 주는 한 줄에만 쓰고 풀이를 바꾸지 않는다 */
export type Intake = { question: string; options: IntakeOption[]; skip: IntakeOption };

export type RoomDef = {
  id: RoomId;
  /** 메인 카드 · 채팅방 목록에 보이는 이름 */
  label: string;
  /** 이 방에서 미유가 쓰는 이름 (기본 방은 그냥 "미유") */
  mode: string;
  /** 채팅방 목록의 한 줄 설명 */
  blurb: string;
  /** 모드 접속 안내 — 기본 방에는 없다 */
  connect: string | null;
  connectNote: string | null;
  /** 이 방에서 열 수 있는 풀이(리포트의 주제 번호가 아니라 talk 모델의 topic id) */
  topicIds: string[];
  /** 풀이 답장에서 쓸 수 있는 월별 달력 */
  calendars: ("love" | "money")[];
  intake?: Intake;
  greeting: (name: string) => string;
};

const SKIP = (lead: string): IntakeOption => ({ id: "skip", label: "말하고 싶지 않아요", lead, mood: "basic" });

export const ROOM_COPY = {
  /** 먼저 묻는 질문의 답을 받은 뒤 한 번 보이는 작은 안내 */
  intakeNote: "눌러 준 답은 이야기를 어떻게 읽을지 정하는 데만 쓰고, 풀이 자체를 바꾸지는 않아요. 이 기기 화면에만 남아요.",
  newRoom: "이 채팅방은 새 대화로 시작해요.",
} as const;

export const ROOMS: Record<RoomId, RoomDef> = {
  main: {
    id: "main",
    label: "나를 알아보기",
    mode: "미유",
    blurb: "내 분석 한 장과 주제별 풀이",
    connect: null,
    connectNote: null,
    topicIds: [],
    calendars: ["love", "money"],
    greeting: (name) => TALK_COPY.intro(name),
  },
  love: {
    id: "love",
    label: "연애 · 관계",
    mode: "연애박사 미유",
    blurb: "연락 · 표현 · 갈등, 가까운 관계 이야기",
    connect: "연애박사 미유 모드로 접속합니다",
    connectNote: "사주와 응답으로 읽은 이야기만 해요. 결과를 보장하는 상담은 아니에요.",
    topicIds: ["love"],
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
  work: {
    id: "work",
    label: "일 · 진로",
    mode: "일·진로 미유",
    blurb: "일하는 방식과 지금의 선택",
    connect: "일·진로 미유 모드로 접속합니다",
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
    label: "돈 · 소비",
    mode: "돈·소비 미유",
    blurb: "돈을 대하는 방식과 소비 습관",
    connect: "돈·소비 미유 모드로 접속합니다",
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
};

/** 눌러서 이어 가는 행동 — 이 목록을 순서대로 다시 적용하면(replayRoom) 같은 대화가 그대로 되살아난다 */
export type RoomAction =
  | { t: "group"; id: string }
  | { t: "topic"; id: string }
  | { t: "intake"; option: string }
  | { t: "extra"; topic: string; which: TalkExtra }
  | { t: "feel"; topic: string; kind: "yes" | "mixed" | "unsure" }
  | { t: "concern" };

export type RoomState = {
  lines: TalkLine[];
  /** 본 주제 */
  opened: string[];
  /** 주제마다 이미 연 답장 (TalkExtra · "yes" · "mixed" · "unsure") */
  used: Record<string, string[]>;
  current: string | null;
  /** 먼저 묻는 질문에 고른 답의 번호 ("skip" 포함), 아직이면 null */
  intake: string | null;
  phase: "pick" | "intake" | "chat";
};

export type RoomContext = { contextHref?: string };

const miyu = (say: TalkSay, mood: TalkMood): TalkLine => ({ from: "miyu", say, mood });
const me = (text: string): TalkLine => ({ from: "me", text });
const text = (t: string, muted = false): TalkSay => ({ kind: "text", text: t, ...(muted ? { muted: true } : {}) });

/** 이 방이 여는 풀이 */
export function roomTopics(model: TalkModel, room: RoomId): TalkTopic[] {
  const def = ROOMS[room];
  return room === "main" ? model.topics : def.topicIds.map((id) => model.topics.find((t) => t.id === id)).filter((t): t is TalkTopic => Boolean(t));
}

/** 이 방을 열 수 있는가 — 풀이가 하나도 없는 방(예: 해당 주제가 없는 리포트)은 열지 않는다 */
export const roomAvailable = (model: TalkModel, room: RoomId) => roomTopics(model, room).length > 0;

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
      phase: "pick",
    };
  }
  const lines: TalkLine[] = [
    miyu({ kind: "system", text: room.connect ?? "", ...(room.connectNote ? { sub: room.connectNote } : {}) }, "wave"),
    miyu(text(room.greeting(model.name)), "wave"),
  ];
  if (room.intake) lines.push(miyu(text(room.intake.question), "basic"));
  return { lines, opened: [], used: {}, current: null, intake: null, phase: room.intake ? "intake" : "chat" };
}

const withUsed = (state: RoomState, topic: string, key: string): Record<string, string[]> => ({ ...state.used, [topic]: [...new Set([...(state.used[topic] ?? []), key])] });

function openTopic(model: TalkModel, state: RoomState, t: TalkTopic, echo: string | null, mood: TalkMood = "basic"): { state: RoomState; added: TalkLine[] } {
  const added: TalkLine[] = [...(echo ? [me(echo)] : []), ...answerBubbles(t, model.name).map((b) => miyu(b, mood))];
  return {
    added,
    state: { ...state, lines: [...state.lines, ...added], opened: [...new Set([...state.opened, t.id])], used: { ...state.used, [t.id]: [] }, current: t.id, phase: "chat" },
  };
}

/** 풀이에 붙는 답장이 여는 말풍선 — 달력은 이 방의 풀이에 달려 있지 않아도 앞으로의 시기 풀이의 저장된 달력을 쓴다 */
export function extraFor(model: TalkModel, t: TalkTopic, which: TalkExtra): TalkBubble[] {
  if (which === "calendar-love" || which === "calendar-money") {
    const flow = t.calendar ? t : model.topics.find((x) => x.calendar);
    return flow ? extraBubbles(flow, which) : [];
  }
  return extraBubbles(t, which);
}

const EXTRA_MOOD: Record<TalkExtra, TalkMood> = { example: "playful", detail: "basic", basis: "glasses", "calendar-love": "surprised", "calendar-money": "surprised" };

/** 눌러서 이어 가기 — 새로 더해진 말(내가 누른 말 + 미유의 답)과 바뀐 상태를 돌려준다. 알 수 없는 행동은 아무것도 바꾸지 않는다 */
export function applyAction(model: TalkModel, roomId: RoomId, state: RoomState, action: RoomAction, ctx: RoomContext = {}): { state: RoomState; added: TalkLine[] } {
  const room = ROOMS[roomId];
  const topics = new Map(model.topics.map((t) => [t.id, t]));
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
      const first = roomTopics(model, roomId)[0];
      if (!opt || !first) return nothing;
      const lead: TalkLine[] = [me(opt.label), miyu(text(opt.lead), opt.mood), miyu(text(ROOM_COPY.intakeNote, true), "basic")];
      const opened = openTopic(model, { ...state, lines: [...state.lines, ...lead], intake: opt.id }, first, null);
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
        const pending = ctx.contextHref ? miyu({ kind: "link", text: `${f.mixed.pending} ${f.mixed.pendingLink}`, href: ctx.contextHref, label: "나의 고민 기록소로 가기" }, "thinking") : miyu(text(f.mixed.pending), "thinking");
        return add(state, [me(label), miyu(text(f.mixed.lead), "thinking"), pending, note], { used: withUsed(state, t.id, "mixed") });
      }
      return add(state, [me(label), miyu(text(f.unsure.lead), "thinking"), note], { used: withUsed(state, t.id, "unsure") });
    }
    case "concern": {
      const added = [me(TALK_COPY.buttons.concern), miyu(ctx.contextHref ? { kind: "link", text: `${TALK_COPY.concernPending} ${TALK_COPY.concernPendingLink}`, href: ctx.contextHref, label: "나의 고민 기록소로 가기" } : text(TALK_COPY.concernPending), "thinking")];
      return add(state, added);
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
  | { kind: "chat"; feel: ReplyChip[]; helpers: ReplyChip[]; next: ReplyChip | null; report: boolean };

/** 지금 보여 줄 답장 버튼 — 첫 화면(주제 2×2) · 먼저 묻는 질문 · 풀이를 읽은 뒤(내 경험 · 보조 버튼 · 다음 풀이) */
export function replyOptions(model: TalkModel, roomId: RoomId, state: RoomState): Replies {
  const room = ROOMS[roomId];
  if (state.phase === "pick") return { kind: "pick", groups: model.groups.map((g) => ({ key: g.id, label: g.chip, action: { t: "group", id: g.id } })) };
  if (state.phase === "intake" && room.intake) {
    const chip = (o: IntakeOption): ReplyChip => ({ key: o.id, label: o.label, action: { t: "intake", option: o.id } });
    return { kind: "intake", options: room.intake.options.map(chip), skip: chip(room.intake.skip) };
  }
  const t = state.current ? model.topics.find((x) => x.id === state.current) : undefined;
  if (!t) return { kind: "chat", feel: [], helpers: [], next: null, report: false };
  const used = new Set(state.used[t.id] ?? []);
  const answered = ["yes", "mixed", "unsure"].some((k) => used.has(k));
  const feel: ReplyChip[] = answered ? [] : (["yes", "mixed", "unsure"] as const).map((kind) => ({ key: `feel-${kind}`, label: TALK_COPY.feel[kind].label, action: { t: "feel", topic: t.id, kind } }));
  const helper = (which: TalkExtra): ReplyChip => ({ key: which, label: TALK_COPY.buttons[which], action: { t: "extra", topic: t.id, which } });
  const helpers: ReplyChip[] = [];
  if (t.example.length > 0 && !used.has("example")) helpers.push(helper("example"));
  if (t.detail.length > 0 && !used.has("detail")) helpers.push(helper("detail"));
  const calendarOk = roomId === "main" ? Boolean(t.calendar) : model.topics.some((x) => x.calendar);
  if (calendarOk) {
    const wanted = roomId === "main" ? (["love", "money"] as const) : room.calendars;
    for (const c of wanted) if (!used.has(`calendar-${c}`)) helpers.push(helper(`calendar-${c}`));
  }
  if (t.basis && !used.has("basis")) helpers.push(helper("basis"));
  const next = roomId === "main" ? nextTopic(model.topics, t.id, new Set(state.opened)) : null;
  return {
    kind: "chat",
    feel,
    helpers,
    next: next ? { key: "next", label: `${TALK_COPY.buttons.next} · ${next.chip}`, action: { t: "topic", id: next.id } } : null,
    report: roomId === "main" && state.opened.length === model.topics.length,
  };
}

/** 이어 보기 저장 형식 — 눌렀던 행동 목록뿐이다(리포트 글 · 고민 내용은 담지 않는다). 이 기기의 브라우저에만 둔다 */
export const ROOM_SAVE_VERSION = 1;
export type RoomSave = { v: typeof ROOM_SAVE_VERSION; actions: RoomAction[] };

const ACTION_LIMIT = 200;

/** 저장된 것을 읽는다 — 형식이 맞지 않거나 없는 주제 · 답을 가리키면 그 행동만 버린다 */
export function parseRoomSave(raw: unknown, model: TalkModel, roomId: RoomId): RoomAction[] {
  if (!raw || typeof raw !== "object" || (raw as RoomSave).v !== ROOM_SAVE_VERSION || !Array.isArray((raw as RoomSave).actions)) return [];
  const topicIds = new Set(model.topics.map((t) => t.id));
  const groupIds = new Set(model.groups.map((g) => g.id));
  const intakeIds = new Set(ROOMS[roomId].intake ? [...ROOMS[roomId].intake!.options.map((o) => o.id), "skip"] : []);
  const extras = new Set<string>(["example", "detail", "basis", "calendar-love", "calendar-money"]);
  const out: RoomAction[] = [];
  for (const a of (raw as RoomSave).actions.slice(0, ACTION_LIMIT) as Record<string, unknown>[]) {
    if (!a || typeof a !== "object") continue;
    if (a.t === "group" && typeof a.id === "string" && groupIds.has(a.id)) out.push({ t: "group", id: a.id });
    else if (a.t === "topic" && typeof a.id === "string" && topicIds.has(a.id)) out.push({ t: "topic", id: a.id });
    else if (a.t === "intake" && typeof a.option === "string" && intakeIds.has(a.option)) out.push({ t: "intake", option: a.option });
    else if (a.t === "extra" && typeof a.topic === "string" && topicIds.has(a.topic) && typeof a.which === "string" && extras.has(a.which)) out.push({ t: "extra", topic: a.topic, which: a.which as TalkExtra });
    else if (a.t === "feel" && typeof a.topic === "string" && topicIds.has(a.topic) && (a.kind === "yes" || a.kind === "mixed" || a.kind === "unsure")) out.push({ t: "feel", topic: a.topic, kind: a.kind });
    else if (a.t === "concern") out.push({ t: "concern" });
  }
  return out;
}

/** 행동 목록을 처음부터 다시 적용해 대화를 되살린다 (같은 입력이면 같은 대화) */
export function replayRoom(model: TalkModel, roomId: RoomId, actions: RoomAction[], ctx: RoomContext = {}): RoomState {
  return actions.reduce((state, action) => applyAction(model, roomId, state, action, ctx).state, startRoom(model, roomId));
}
