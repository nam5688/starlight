"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { BasisList, ComfortPair, LuckTimelineCard, Prose, ReactionStepper } from "@/components/report/reading-parts";
import { AdjustIcon, ArrowIcon, MenuIcon, StrengthIcon } from "@/components/ui/icons";
import { TALK_COPY, type TalkModel } from "@/lib/report/reading/talk";
import {
  applyAction,
  parseRoomSave,
  replayRoom,
  replyOptions,
  roomAvailable,
  roomTopics,
  ROOM_ORDER,
  ROOMS,
  ROOM_SAVE_VERSION,
  startRoom,
  type ReplyChip,
  type RoomAction,
  type RoomId,
  type RoomState,
  type TalkLine,
  type TalkMood,
  type TalkSay,
} from "@/lib/report/reading/talk-room";
import { AnalysisCard } from "./analysis-card";
import { CardActions } from "./card-actions";
import { MiyuAvatar, TypingDots } from "./miyu-character";

/** 화면에 보이는 대화 한 줄 — 번호를 붙여 스크롤 · 초점이 어느 줄인지 찾는다 */
type Item = TalkLine & { id: number };

type Props = {
  model: TalkModel;
  /** 지금 들어와 있는 채팅방(상담 모드) */
  room: RoomId;
  /** 이어 보기 저장의 범위 — 결과 번호, 예시 화면은 "sample" */
  scope: string;
  dateLabel: string;
  /** 전체 리포트 화면 */
  reportHref: string;
  /** 리포트의 "내 분석 데이터"(원국 · 오행 · 응답 환산값) 위치 */
  dataHref: string;
  /** 머리글의 작은 이름표(눌러서 안내를 본다) — 가상 인물 예시인지 저장된 리포트인지 */
  badge: { label: string; text: string };
  /** 나의 고민 기록소 (없으면 링크를 보이지 않는다) */
  contextHref?: string;
  /** 채팅방 이동 주소 — 메뉴에는 여기 적힌 방만 보인다(개발용 비교 화면은 방이 하나뿐이다). 서버 화면에서 넘기므로 함수가 아니라 주소 표다 */
  roomHrefs: Partial<Record<RoomId, string>>;
};

/** 넓고 충분히 높은 화면에서는 가운데 채팅 틀로 보이고, 그 반대(모바일)에서는 화면 전체를 쓴다 (globals.css의 chat-frame 조건과 같아야 한다) */
const OVERLAY_QUERY = "not all and (min-width: 768px) and (min-height: 600px)";

const delayFor = (l: TalkLine) => {
  if (l.from !== "miyu") return 0;
  const s = l.say;
  if (s.kind === "system") return 260;
  if (s.kind === "text") return Math.min(1000, (s.muted ? 240 : 360) + s.text.length * 8);
  return s.kind === "answer" ? 560 : 680;
};

// 추천 질문은 흰 테두리 버튼이 아니라 연보라 둥근 버튼으로, 다음으로 이어 가는 버튼만 진한 보라로 둔다
const chipBase = "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[15px] font-semibold transition-colors";
const chip = `${chipBase} bg-accent-soft text-accent-strong hover:brightness-95`;
const chipSub = "inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-mist px-3.5 py-1.5 text-[14px] font-medium whitespace-nowrap text-ink-2 transition-colors hover:brightness-95";
const chipPrimary = `${chipBase} bg-accent text-white whitespace-nowrap hover:bg-accent-strong`;
const pending = <span className="text-[13px] font-medium text-ink-3">· 준비 중</span>;

const saveKey = (scope: string, room: RoomId) => `miyu-talk:v${ROOM_SAVE_VERSION}:${scope}:${room}`;
/** 이 기기의 브라우저에만 둔다 — 눌렀던 행동 목록뿐이고 리포트 글 · 고민 내용은 담지 않는다. 막혀 있어도 대화는 그대로 된다 */
const readSave = (scope: string, room: RoomId): unknown => {
  try {
    const raw = window.localStorage.getItem(saveKey(scope, room));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeSave = (scope: string, room: RoomId, actions: RoomAction[]) => {
  try {
    if (actions.length === 0) window.localStorage.removeItem(saveKey(scope, room));
    else window.localStorage.setItem(saveKey(scope, room), JSON.stringify({ v: ROOM_SAVE_VERSION, actions }));
  } catch {
    // 저장이 막힌 브라우저 — 이어 보기만 안 될 뿐이다
  }
};

/**
 * 대화로 풀어보기 — 휴대폰 채팅 앱처럼. 방(상담 모드)마다 새 대화로 시작한다: 기본 미유(내 분석 한 장 → 주제 2×2) · 연애박사 미유(모드 접속 안내 → 먼저 묻는 질문 → 풀이).
 * 모두 저장된 리포트의 글(답변 한 번에 말풍선 1~2개)과 고정 문구이며 AI를 부르지 않는다. 풀이를 읽은 뒤에는 내 경험을 말하는 질문과 보조 버튼이 따라온다.
 * 대화는 이 기기에만 이어 보기로 남는다(서버 저장 없음). 자유 질문 · 고민 말하기(AI가 답하는 부분)는 아직 준비 중이라고 밝힌다. 모션을 줄이는 설정이면 말풍선이 한꺼번에 나타난다.
 */
export function TalkView({ model, room, scope, dateLabel, reportHref, dataHref, badge, contextHref, roomHrefs }: Props) {
  const def = ROOMS[room];
  const { name } = model;
  const noteId = useId();
  const seq = useRef(100);
  const ctx = { contextHref };
  const toItems = (lines: TalkLine[]): Item[] => lines.map((l) => ({ ...l, id: ++seq.current }));

  const [engine, setEngine] = useState<RoomState>(() => startRoom(model, room));
  const [actions, setActions] = useState<RoomAction[]>([]);
  const [log, setLog] = useState<Item[]>(() => startRoom(model, room).lines.map((l, i) => ({ ...l, id: i })));
  const [typing, setTyping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [saved, setSaved] = useState<Partial<Record<RoomId, boolean>>>({});
  const menuId = useId();
  const infoId = useId();
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const queue = useRef<Item[]>([]);
  const timer = useRef<number | null>(null);
  const running = useRef(false);
  const reduceMotion = useRef(false);
  const acted = useRef(false);
  const shownLen = useRef(log.length);
  /** 위로 올려 읽는 중이 아닐 때만 새 말풍선을 따라 내려간다 */
  const stick = useRef(true);
  const touchY = useRef(0);
  /** 모션을 줄이는 설정에서 한꺼번에 도착한 답의 첫 말풍선 — 그 줄부터 보이게 한다 */
  const anchor = useRef<number | null>(null);
  const pumpRef = useRef<() => void>(() => {});

  const stopTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  // 모바일에서는 화면 전체를 대화가 차지한다 — 뒤쪽 머리글 · 안내 · 푸터는 키보드 · 보조기기 초점에서 빼고, 뒤쪽 화면이 같이 스크롤되지 않게 한다
  useEffect(() => {
    const mq = window.matchMedia(OVERLAY_QUERY);
    let locked: Element[] = [];
    const release = () => {
      for (const el of locked) el.removeAttribute("inert");
      locked = [];
      document.documentElement.style.overflow = "";
    };
    const apply = () => {
      release();
      const root = rootRef.current;
      if (!mq.matches || !root) return;
      for (const el of Array.from(document.body.querySelectorAll(":scope > [data-site-chrome]"))) {
        if (el.contains(root) || el.hasAttribute("inert")) continue;
        el.setAttribute("inert", "");
        locked.push(el);
      }
      document.documentElement.style.overflow = "hidden";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      release();
    };
  }, []);

  const pump = () => {
    if (queue.current.length === 0) {
      running.current = false;
      setTyping(false);
      return;
    }
    running.current = true;
    setTyping(true);
    timer.current = window.setTimeout(() => {
      const item = queue.current.shift()!;
      setLog((l) => [...l, item]);
      pumpRef.current();
    }, delayFor(queue.current[0]));
  };

  useEffect(() => {
    pumpRef.current = pump;
  });
  useEffect(() => {
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 화면을 숨겼다가 다시 보여 줄 때(Next의 화면 보존) 효과가 정리되며 타이머가 멈추므로, 남은 말이 있으면 다시 이어서 보낸다
    if (queue.current.length > 0 && timer.current === null) pumpRef.current();
    return stopTimer;
  }, []);

  // 이 기기에 남은 이 방의 대화가 있으면 이어서 보여 준다(처음 그릴 때는 새 대화와 같은 모양이라 어긋나지 않는다)
  useEffect(() => {
    const t = window.setTimeout(() => {
      const restored = parseRoomSave(readSave(scope, room), model, room);
      if (restored.length === 0) return;
      const state = replayRoom(model, room, restored, { contextHref });
      setEngine(state);
      setActions(restored);
      setLog(state.lines.map((l, i) => ({ ...l, id: i })));
      stick.current = true;
    }, 0);
    return () => window.clearTimeout(t);
    // 방이 바뀌면 화면 전체가 새로 만들어진다(경로가 다르다) — 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 미유의 말을 차례로 보낸다 — 하나씩 "입력 중"을 보이고 도착한다 (모션을 줄이는 설정이면 한꺼번에) */
  const deliver = (lines: TalkLine[]) => {
    acted.current = true;
    const items = toItems(lines);
    const mine = items.filter((i) => i.from === "me");
    const theirs = items.filter((i) => i.from === "miyu");
    if (mine.length) {
      stick.current = true;
      setLog((l) => [...l, ...mine]);
    }
    if (theirs.length === 0) return;
    if (reduceMotion.current) {
      anchor.current = theirs[0].id;
      setLog((l) => [...l, ...theirs]);
      return;
    }
    queue.current.push(...theirs);
    if (!running.current) pump();
  };
  const skip = () => {
    stopTimer();
    running.current = false;
    const rest = queue.current.splice(0);
    setTyping(false);
    setLog((l) => [...l, ...rest]);
  };

  /** 눌러서 이어 가기 — 엔진이 새 말과 바뀐 상태를 돌려주고, 행동은 이 기기에 이어 보기로 남긴다 */
  const act = (action: RoomAction) => {
    if (running.current) skip();
    const r = applyAction(model, room, engine, action, ctx);
    if (r.added.length === 0) return;
    setEngine(r.state);
    const next = [...actions, action];
    setActions(next);
    writeSave(scope, room, next);
    deliver(r.added);
  };

  const restart = () => {
    stopTimer();
    running.current = false;
    queue.current = [];
    setTyping(false);
    setMenuOpen(false);
    writeSave(scope, room, []);
    const fresh = startRoom(model, room);
    setEngine(fresh);
    setActions([]);
    setLog(fresh.lines.map((l, i) => ({ ...l, id: ++seq.current + i })));
    stick.current = true;
    acted.current = false;
  };

  // 새 말이 도착하면 아래로 — 위로 올려 읽는 중이면 따라가지 않고, 화면보다 긴 그림 · 표와 한꺼번에 도착한 답은 첫 줄부터 보이게 한다
  /** 사용자가 위로 올려 읽기 시작했다 — 따라 내려가기를 멈춘다 */
  const readingUp = () => {
    stick.current = false;
  };
  const showFromTop = (box: HTMLElement, el: HTMLElement, behavior: ScrollBehavior) => box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8, behavior });
  useEffect(() => {
    if (log.length === shownLen.current && !typing) return;
    const grew = log.length !== shownLen.current;
    shownLen.current = log.length;
    const box = scrollRef.current;
    if (!box || !stick.current) return;
    // 따라 내려가는 이동은 즉시 한다 — 부드럽게 내려가는 도중에 사용자가 위로 올리면 두 움직임이 섞여 끌려 내려가기 때문이다
    const behavior: ScrollBehavior = "auto";
    const find = (id: number) => box.querySelector<HTMLElement>(`[data-msg="${id}"]`);
    const anchorEl = anchor.current !== null ? find(anchor.current) : null;
    anchor.current = null;
    const last = grew ? find(log[log.length - 1].id) : null;
    if (anchorEl) showFromTop(box, anchorEl, behavior);
    else if (last && last.offsetHeight > box.clientHeight - 32) showFromTop(box, last, behavior);
    else box.scrollTo({ top: box.scrollHeight, behavior });
  }, [log, typing]);
  // 대화가 끝나면 선택지로 초점을 옮긴다 (누른 버튼이 사라져 초점이 몸통으로 빠지는 것을 막는다)
  useEffect(() => {
    if (!typing && acted.current) optionsRef.current?.focus({ preventScroll: true });
  }, [typing, log]);

  // 메뉴: 열면 첫 항목으로 초점, Esc · 바깥을 누르면 닫고 메뉴 버튼으로 초점을 돌려준다 · 열 때 이 기기에 남은 방을 확인한다
  useEffect(() => {
    if (!menuOpen) return;
    const t = window.setTimeout(() => setSaved(Object.fromEntries(ROOM_ORDER.map((r) => [r, parseRoomSave(readSave(scope, r), model, r).length > 0]))), 0);
    menuRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuBtnRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || menuBtnRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen, scope, model]);

  const replies = replyOptions(model, room, engine);
  const visibleMiyu = log.filter((l): l is Item & { from: "miyu" } => l.from === "miyu" && l.say.kind !== "system" && l.say.kind !== "card");
  const lastMood: TalkMood = visibleMiyu.length > 0 ? visibleMiyu[visibleMiyu.length - 1].mood : "basic";
  const lastLine = log[log.length - 1];
  const afterMiyuText = lastLine?.from === "miyu" && lastLine.say.kind !== "system";
  const byTopic = new Map(model.topics.map((t) => [t.id, t]));
  const topicsHere = roomTopics(model, room);
  const menuTopics = room === "main" ? model.groups : topicsHere.length > 1 ? topicsHere.map((t) => ({ id: t.id, chip: t.chip, topicIds: [t.id] })) : [];

  return (
    <div
      ref={rootRef}
      className="fixed inset-x-0 top-0 z-40 mx-auto flex h-dvh w-full max-w-[560px] flex-col bg-page chat-frame:static chat-frame:z-auto chat-frame:my-8 chat-frame:h-[max(560px,min(820px,calc(100dvh-9rem)))] chat-frame:w-[680px] chat-frame:max-w-[calc(100vw-3rem)] chat-frame:overflow-hidden chat-frame:rounded-3xl chat-frame:shadow-pop chat-frame:ring-1 chat-frame:ring-line"
    >
      <header className="relative z-10 flex items-center gap-2 bg-page px-2 py-2 shadow-[0_6px_10px_-10px_rgb(48_49_59/0.4)]">
        <Link href={reportHref} aria-label="전체 리포트로 돌아가기" className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-mist">
          <ArrowIcon className="size-5 rotate-180" />
        </Link>
        <MiyuAvatar className="size-11" mood={typing ? "thinking" : lastMood} bob={typing} />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[17px] leading-tight font-bold">
            <span>
              {def.mode}
              <span className="sr-only"> · {name} 님의 분석 이야기</span>
            </span>
            <button
              type="button"
              onClick={() => setInfoOpen((o) => !o)}
              aria-expanded={infoOpen}
              aria-controls={infoId}
              className="inline-flex min-h-6 items-center gap-1 rounded-full bg-mist px-2.5 py-0.5 text-[12px] font-semibold text-ink-3 hover:brightness-95"
            >
              {badge.label}
              <span aria-hidden="true" className="grid size-3.5 place-items-center rounded-full border border-current text-[9px] leading-none">
                i
              </span>
            </button>
          </h1>
          {/* 대표 경향 설명은 분석 카드가 위로 올라가도 계속 보인다 — 후보 설명이며 진단이 아니다. 답을 쓰는 동안에는 "입력하고 있어요"가 겹쳐 보인다(높이는 그대로) */}
          <div className="relative">
            <p className={`line-clamp-2 text-[13px] leading-snug text-ink-3 transition-opacity ${typing ? "opacity-0" : ""}`}>{model.card.tendency ?? def.blurb}</p>
            {typing && (
              <p aria-hidden="true" className="absolute inset-x-0 top-0 flex items-center gap-2 text-[13px] leading-snug font-semibold text-accent-strong">
                {TALK_COPY.typing}
                <TypingDots className="size-1.5" />
              </p>
            )}
          </div>
        </div>
      </header>
      {infoOpen && (
        <div id={infoId} role="note" className="bg-mist px-4 py-2.5 text-[13px] leading-[1.6] text-ink-2">
          <p>{badge.text}</p>
          <p className="mt-1">{TALK_COPY.notice}</p>
        </div>
      )}

      <div
        ref={scrollRef}
        // 위로 올려 읽는 중인지는 사용자의 입력(휠 · 터치 · 키 · 스크롤바)으로만 정한다 — 화면이 스스로 내려가는 scroll 이벤트로는 바꾸지 않는다. 맨 아래 근처로 돌아오면 다시 따라간다
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) stick.current = true;
        }}
        onWheel={(e) => {
          if (e.deltaY < 0) readingUp();
        }}
        onTouchStart={(e) => {
          touchY.current = e.touches[0]?.clientY ?? 0;
        }}
        onTouchMove={(e) => {
          if ((e.touches[0]?.clientY ?? 0) > touchY.current + 4) readingUp();
        }}
        onKeyDown={(e) => {
          if (["ArrowUp", "PageUp", "Home"].includes(e.key)) readingUp();
        }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) readingUp();
        }}
        role="log"
        aria-label={`${def.mode}와의 대화`}
        aria-live="polite"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-page px-3 py-4"
      >
        {log.map((m, i) => {
          const prev = log[i - 1];
          const isSystem = m.from === "miyu" && m.say.kind === "system";
          const sameSender = i > 0 && prev.from === m.from && !isSystem && !(prev.from === "miyu" && prev.say.kind === "system");
          return (
            <div key={m.id} data-msg={m.id} className={`motion-safe:animate-miyu-in ${i === 0 ? "" : sameSender ? "mt-1.5" : "mt-4"}`}>
              {m.from === "me" ? <MeBubble text={m.text} /> : m.say.kind === "system" ? <System text={m.say.text} sub={m.say.sub} /> : <MiyuRow say={m.say} mood={m.mood} first={!sameSender} model={model} dateLabel={dateLabel} dataHref={dataHref} />}
            </div>
          );
        })}
        {typing && (
          <div className={`motion-safe:animate-miyu-in ${afterMiyuText ? "mt-1.5" : "mt-4"}`}>
            <div className="flex items-start gap-2">
              <div className="w-9 shrink-0">{!afterMiyuText && <MiyuAvatar className="size-9" mood="thinking" bob />}</div>
              {/* 점 세 개가 차례로 튀는 "입력 중" 말풍선 — AI가 답을 만드는 동안에도 같은 모양을 쓴다 */}
              <div className="rounded-2xl rounded-tl-md bg-canvas px-4 py-3.5">
                <span className="sr-only">{TALK_COPY.typing}</span>
                <TypingDots />
              </div>
            </div>
          </div>
        )}
      </div>

      <div ref={optionsRef} tabIndex={-1} role="group" aria-label="답장 고르기" className="max-h-[46dvh] overflow-y-auto bg-page pt-2.5 pb-2 outline-none">
        {typing ? (
          <div className="flex min-h-11 items-center justify-between gap-3 px-3">
            <p className="flex items-center gap-2 text-[14px] text-ink-3">
              미유가 답하고 있어요
              <TypingDots className="size-1.5" />
            </p>
            <button type="button" onClick={skip} className="min-h-11 px-1 text-[14px] font-semibold text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
              바로 모두 보기
            </button>
          </div>
        ) : replies.kind === "pick" ? (
          // 첫 화면의 주제는 카드 다음에 2×2로 — 대화가 시작되면 접히고, 다른 이야기는 입력창 왼쪽 메뉴에 있다
          <div className="grid grid-cols-2 gap-2 px-3">{replies.groups.map((c) => <ChipButton key={c.key} chip={c} className={`${chip} w-full`} onPick={act} />)}</div>
        ) : replies.kind === "intake" ? (
          <div className="px-3">
            <div className="grid grid-cols-2 gap-2">{replies.options.map((c) => <ChipButton key={c.key} chip={c} className={`${chip} w-full text-center leading-snug`} onPick={act} />)}</div>
            <div className="mt-1 text-center">
              <button type="button" onClick={() => act(replies.skip.action)} className="min-h-11 px-3 text-[14px] font-medium text-ink-3 underline decoration-ink-3/30 underline-offset-4 hover:decoration-ink-3">
                {replies.skip.label}
              </button>
            </div>
          </div>
        ) : (
          // 풀이를 읽은 뒤: 내 경험을 말하는 답장이 먼저, 일상 예시 · 분석 이유 같은 보조 버튼은 그 아래
          <div className="space-y-2">
            {replies.feel.length > 0 && <div className="flex gap-2 overflow-x-auto px-3 pr-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{replies.feel.map((c) => <ChipButton key={c.key} chip={c} className={`${chip} whitespace-nowrap`} onPick={act} />)}</div>}
            {(replies.helpers.length > 0 || replies.next || replies.report) && (
              <div className="flex gap-2 overflow-x-auto px-3 pr-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {replies.helpers.map((c) => <ChipButton key={c.key} chip={c} className={chipSub} onPick={act} />)}
                {replies.next && <ChipButton chip={replies.next} className={chipPrimary} onPick={act} />}
                {replies.report && (
                  <Link href={reportHref} className={chipPrimary}>
                    {TALK_COPY.buttons.fullReport}
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative flex items-center gap-2 bg-page px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {menuOpen && (
          <div ref={menuRef} id={menuId} role="group" aria-label="채팅방 · 메뉴" className="absolute right-3 bottom-full left-3 mb-2 max-h-[min(30rem,70dvh)] overflow-y-auto rounded-2xl bg-canvas p-2 shadow-pop">
            <p className="px-3 pt-1.5 pb-0.5 text-[13px] font-semibold text-ink-3">채팅방 · 방마다 새 대화로 시작해요</p>
            <div className="px-1">
              {ROOM_ORDER.filter((r) => roomHrefs[r] && roomAvailable(model, r)).map((r) => (
                <Link
                  key={r}
                  href={roomHrefs[r] ?? "#"}
                  aria-current={r === room ? "page" : undefined}
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left hover:bg-mist aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-strong"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">{ROOMS[r].mode === "미유" ? "기본 미유" : ROOMS[r].mode}</span>
                    <span className="block truncate text-[12px] text-ink-3">{ROOMS[r].blurb}</span>
                  </span>
                  <span className="shrink-0 text-[13px] font-medium text-ink-3">{r === room ? "지금 여기" : saved[r] ? "이어 보기" : "새로 시작"}</span>
                </Link>
              ))}
            </div>
            {menuTopics.length > 0 && (
              <div className="mt-1 px-1">
                <p className="px-2 pt-1.5 pb-0.5 text-[13px] font-semibold text-ink-3">{TALK_COPY.menuTitle}</p>
                {menuTopics.map((g) => (
                  <div key={g.id}>
                    {g.topicIds.length > 1 && <p className="px-2 pt-1 pb-0.5 text-[12px] font-semibold text-ink-3">{g.chip}</p>}
                    {g.topicIds.map((id) => {
                      const t = byTopic.get(id)!;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            act({ t: "topic", id });
                          }}
                          aria-current={engine.current === id ? "true" : undefined}
                          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-[15px] font-semibold hover:bg-mist aria-[current=true]:bg-accent-soft aria-[current=true]:text-accent-strong"
                        >
                          <span>{t.chip}</span>
                          {engine.opened.includes(id) && <span className="shrink-0 text-[13px] font-medium text-ink-3">봤어요</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-1 px-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  act({ t: "concern" });
                }}
                className="flex min-h-11 w-full items-center gap-1.5 rounded-lg px-2 text-left text-[15px] font-semibold hover:bg-mist"
              >
                {TALK_COPY.buttons.concern}
                {pending}
              </button>
              <Link href={dataHref} className="flex min-h-11 w-full items-center justify-between rounded-lg px-2 text-[15px] font-semibold hover:bg-mist">
                {TALK_COPY.buttons.data}
                <ArrowIcon className="size-4" />
              </Link>
              <Link href={reportHref} className="flex min-h-11 w-full items-center justify-between rounded-lg px-2 text-[15px] font-semibold hover:bg-mist">
                {TALK_COPY.buttons.fullReport}
                <ArrowIcon className="size-4" />
              </Link>
              <button type="button" onClick={restart} className="flex min-h-11 w-full items-center rounded-lg px-2 text-left text-[15px] font-semibold text-ink-2 hover:bg-mist">
                이 채팅방 새로 시작하기
              </button>
            </div>
          </div>
        )}
        <button
          ref={menuBtnRef}
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? TALK_COPY.buttons.menuClose : TALK_COPY.buttons.menu}
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong hover:brightness-95"
        >
          <MenuIcon />
        </button>
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            disabled
            aria-label={TALK_COPY.freeQuestion}
            aria-describedby={noteId}
            placeholder={typing ? "" : TALK_COPY.freeQuestion}
            className={`h-11 w-full min-w-0 rounded-full bg-canvas px-4 text-[15px] ring-1 ring-line placeholder:text-ink-3 disabled:cursor-not-allowed ${typing ? "motion-safe:animate-miyu-glow" : ""}`}
          />
          {/* 미유가 답을 쓰는 동안 입력창에도 "입력 중"을 보인다 (글자 입력은 아직 준비 중이라 입력창 자체는 계속 비활성) */}
          {typing && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center gap-2 px-4 text-[15px] font-medium text-accent-strong">
              {TALK_COPY.typing}
              <TypingDots className="size-1.5" />
            </span>
          )}
        </div>
        <button type="button" disabled aria-label="보내기 (준비 중)" className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-ink-3 opacity-70 disabled:cursor-not-allowed">
          <ArrowIcon className="size-5 -rotate-90" />
        </button>
        <span id={noteId} className="sr-only">
          {TALK_COPY.freeQuestionPending}
        </span>
      </div>
    </div>
  );
}

function ChipButton({ chip: c, className, onPick }: { chip: ReplyChip; className: string; onPick: (action: RoomAction) => void }) {
  return (
    <button type="button" onClick={() => onPick(c.action)} className={className}>
      {c.label}
    </button>
  );
}

function MeBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-tr-md bg-accent-soft px-3.5 py-2.5 text-[15px] leading-[1.5] font-medium text-ink">{text}</p>
    </div>
  );
}

/** 모드 접속 안내 — 가운데에 작게 (예: 연애박사 미유 모드로 접속합니다) */
function System({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="py-1 text-center">
      <p className="inline-flex items-center rounded-full bg-accent-soft px-3.5 py-1.5 text-[14px] font-semibold text-accent-strong">{text}</p>
      {sub && <p className="mx-auto mt-1.5 max-w-[30rem] text-[13px] leading-[1.6] text-ink-3">{sub}</p>}
    </div>
  );
}

// 일반 답변은 테두리도 그림자도 없이 하얀 말풍선만 — 그림자는 분석 카드에만 약하게 쓴다(박스를 덜 쓴다)
const bubble = "rounded-2xl rounded-tl-md bg-canvas px-3.5 py-2.5";

function MiyuRow({ say, mood, first, model, dateLabel, dataHref }: { say: TalkSay; mood: TalkMood; first: boolean; model: TalkModel; dateLabel: string; dataHref: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-9 shrink-0">{first && <MiyuAvatar className="size-9" mood={mood} />}</div>
      <div className="min-w-0 flex-1">
        <Content say={say} model={model} dateLabel={dateLabel} dataHref={dataHref} />
      </div>
    </div>
  );
}

function Content({ say, model, dateLabel, dataHref }: { say: TalkSay; model: TalkModel; dateLabel: string; dataHref: string }) {
  switch (say.kind) {
    case "card":
      return (
        <div>
          <AnalysisCard card={model.card} name={model.name} dateLabel={dateLabel} />
          <CardActions card={model.card} name={model.name} dateLabel={dateLabel} dataHref={dataHref} />
        </div>
      );
    case "system":
      return null;
    case "text":
      if (say.muted) return <Prose text={say.text} className="px-1 text-[13px] leading-[1.6] text-ink-3" />;
      return (
        <div className={`${bubble} inline-block max-w-full chat-frame:max-w-[36rem]`}>
          {say.label && <p className="mb-0.5 text-[13px] font-semibold text-accent-strong">{say.label}</p>}
          <Prose text={say.text} className="text-[16px] leading-[1.6]" />
        </div>
      );
    case "link":
      return (
        <div className={`${bubble} inline-block max-w-full chat-frame:max-w-[36rem]`}>
          <Prose text={say.text} className="text-[16px] leading-[1.6]" />
          <p className="mt-1">
            <Link href={say.href} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
              {say.label}
            </Link>
          </p>
        </div>
      );
    case "answer":
      // 결론 한 줄(굵게) + 요약을 한 말풍선으로 — 제목 · 설명 · 되풀이 문장을 따로 쪼개지 않는다
      return (
        <div className={`${bubble} inline-block max-w-full chat-frame:max-w-[36rem]`}>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-accent-strong">
            <span className="grid size-5 place-items-center rounded-full bg-accent-soft text-[12px] font-bold tabular-nums">{say.number}</span>
            {say.title}
          </p>
          <p className="mt-1 text-[18px] leading-snug font-bold tracking-tight">{say.headline}</p>
          {say.paragraphs.map((p) => (
            <Prose key={p} text={p} className="mt-2 text-[16px] leading-[1.6]" />
          ))}
        </div>
      );
    case "traits":
      // 내가 강한 포인트 · 내가 힘들 수 있는 포인트는 꼭 기억할 정보라 색이 있는 칸으로 — 바깥 테두리 · 구분선 없이 이름 아래에 바로 놓는다
      return (
        <ul className="space-y-3.5">
          {say.traits.map((x) => (
            <li key={x.name}>
              <p className="px-1 text-[16px] font-bold">{x.name}</p>
              <p className="mt-1.5 flex items-start gap-2 rounded-xl bg-positive-soft px-3 py-2.5 text-[14px] leading-snug">
                <StrengthIcon className="mt-0.5 size-4 shrink-0 text-positive" />
                <span>
                  <span className="font-semibold text-positive">내가 강한 포인트</span> {x.shinesShort}
                </span>
              </p>
              <p className="mt-1.5 flex items-start gap-2 rounded-xl bg-caution-soft px-3 py-2.5 text-[14px] leading-snug">
                <AdjustIcon className="mt-0.5 size-4 shrink-0 text-caution" />
                <span>
                  <span className="font-semibold text-caution">내가 힘들 수 있는 포인트</span> {x.burdenShort}
                </span>
              </p>
            </li>
          ))}
        </ul>
      );
    case "timeline":
      return <LuckTimelineCard soft showExample={false} className="" timeline={say.slots} reference={say.reference} />;
    case "flow":
      return <ReactionStepper compact className="" flow={{ when: say.when, steps: say.steps, helpful: say.helpful }} />;
    case "comfort":
      return <ComfortPair compact className="" comfort={{ comfortable: say.comfortable, clash: say.clash, note: say.note }} />;
    case "basis":
      return (
        <div className={`${bubble} w-full`}>
          <BasisList basis={say.basis} />
        </div>
      );
  }
}
