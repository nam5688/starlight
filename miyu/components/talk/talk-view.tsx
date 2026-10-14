"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { BasisList, ComfortPair, LuckTimelineCard, Prose, ReactionStepper } from "@/components/report/reading-parts";
import { AdjustIcon, ArrowIcon, MenuIcon, StrengthIcon } from "@/components/ui/icons";
import { answerBubbles, extraBubbles, nextTopic, TALK_COPY, type TalkBubble, type TalkGroup, type TalkModel, type TalkTopic } from "@/lib/report/reading/talk";
import { AnalysisCard } from "./analysis-card";
import { CardActions } from "./card-actions";

type Extra = "example" | "detail" | "basis";
/** 미유가 보내는 말 하나 — 저장된 리포트의 글을 나눈 말풍선(TalkBubble), 분석 카드, 링크가 달린 안내 */
type Say = TalkBubble | { kind: "card" } | { kind: "link"; text: string; href: string; label: string };
type Item = { id: number; from: "me"; text: string } | { id: number; from: "miyu"; say: Say };

type Props = {
  model: TalkModel;
  dateLabel: string;
  /** 전체 리포트 화면 */
  reportHref: string;
  /** 리포트의 "내 분석 데이터"(원국 · 오행 · 응답 환산값) 위치 */
  dataHref: string;
  /** 머리글 아래 한 줄 — 가상 인물 예시인지 저장된 리포트인지 */
  subtitle: string;
  /** 나의 고민 기록소 (없으면 링크를 보이지 않는다) */
  contextHref?: string;
};

/** 폰 크기 틀로 보이는 조건(넓고 충분히 높은 화면)의 반대 — 이때는 화면 전체를 쓴다 (globals.css의 chat-frame 조건과 같아야 한다) */
const OVERLAY_QUERY = "not all and (min-width: 768px) and (min-height: 600px)";

const delayFor = (s: Say) => (s.kind === "text" ? Math.min(1000, (s.muted ? 240 : 360) + s.text.length * 8) : s.kind === "headline" ? 520 : 680);

const chipBase = "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-[15px] font-semibold whitespace-nowrap transition-colors";
const chip = `${chipBase} border-line-strong bg-canvas text-ink hover:bg-mist`;
const chipPrimary = `${chipBase} border-transparent bg-accent text-white hover:bg-accent-strong`;
const pending = <span className="text-[13px] font-medium text-ink-3">· 준비 중</span>;

/**
 * 대화로 풀어보기(1단계) — 휴대폰 채팅 앱처럼: 분석 카드 한 장 → 큰 주제 고르기 → 짧은 말풍선이 하나씩 도착 → [예시] [자세히] [분석 이유] 답장 버튼.
 * 모두 저장된 리포트의 글을 문장 단위로 나눠 보여 주며 AI를 부르지 않는다. 자유 질문 · "내 경우는 달라" · 고민 말하기는 아직 준비 중이라고 밝힌다.
 * 대화는 이 화면 안에서만 이어지고 저장하지 않는다 (새로고침하면 처음부터). 모션을 줄이는 설정이면 말풍선이 한꺼번에 나타난다.
 * 모바일에서는 화면 전체를 쓰고(뒤쪽 화면은 비활성), PC에서는 가운데에 폰 화면 크기의 틀로 보인다.
 */
export function TalkView({ model, dateLabel, reportHref, dataHref, subtitle, contextHref }: Props) {
  const { topics, groups, name } = model;
  const byId = new Map(topics.map((t) => [t.id, t]));
  const noteId = useId();
  const seq = useRef(10);
  const [log, setLog] = useState<Item[]>([
    { id: 0, from: "miyu", say: { kind: "text", text: TALK_COPY.intro(name) } },
    { id: 1, from: "miyu", say: { kind: "card" } },
    { id: 2, from: "miyu", say: { kind: "text", text: TALK_COPY.notice, muted: true } },
    { id: 3, from: "miyu", say: { kind: "text", text: TALK_COPY.askTopic } },
  ]);
  const [typing, setTyping] = useState(false);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [used, setUsed] = useState<Record<string, Set<Extra | "differ">>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const queue = useRef<Say[]>([]);
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

  const toItem = (say: Say): Item => ({ id: ++seq.current, from: "miyu", say });

  const pump = () => {
    if (queue.current.length === 0) {
      running.current = false;
      setTyping(false);
      return;
    }
    running.current = true;
    setTyping(true);
    timer.current = window.setTimeout(() => {
      const item = toItem(queue.current.shift()!);
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

  /** 미유의 말을 차례로 보낸다 — 하나씩 "입력 중"을 보이고 도착한다 (모션을 줄이는 설정이면 한꺼번에) */
  const say = (...items: Say[]) => {
    acted.current = true;
    if (reduceMotion.current) {
      const made = items.map(toItem);
      anchor.current = made[0]?.id ?? null;
      setLog((l) => [...l, ...made]);
      return;
    }
    queue.current.push(...items);
    if (!running.current) pump();
  };
  const skip = () => {
    stopTimer();
    running.current = false;
    const rest = queue.current.splice(0).map(toItem);
    setTyping(false);
    setLog((l) => [...l, ...rest]);
  };
  const echo = (text: string) => {
    const item: Item = { id: ++seq.current, from: "me", text };
    stick.current = true;
    setLog((l) => [...l, item]);
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

  const mark = (id: string, what: Extra | "differ") => setUsed((u) => ({ ...u, [id]: new Set(u[id] ?? []).add(what) }));

  const openTopic = (t: TalkTopic, echoText: string, more: boolean) => {
    const done = opened.size + (opened.has(t.id) ? 0 : 1) === topics.length;
    echo(echoText);
    say({ kind: "text", text: more ? TALK_COPY.openingMore(t.chip) : TALK_COPY.opening(t.chip) }, ...answerBubbles(t), { kind: "text", text: done ? TALK_COPY.allDone : TALK_COPY.askNext });
    setOpened((o) => new Set(o).add(t.id));
    setUsed((u) => (u[t.id] ? { ...u, [t.id]: new Set() } : u));
    setCurrent(t.id);
  };
  const pickGroup = (g: TalkGroup) => {
    const target = g.topicIds.map((id) => byId.get(id)!).find((t) => !opened.has(t.id)) ?? byId.get(g.topicIds[0])!;
    openTopic(target, g.chip, false);
  };
  const openExtra = (t: TalkTopic, which: Extra) => {
    echo(TALK_COPY.buttons[which]);
    say(
      ...(which === "basis" ? [{ kind: "text", text: TALK_COPY.basisIntro } as const] : []),
      ...extraBubbles(t, which),
      ...(which === "example" ? [{ kind: "text", text: TALK_COPY.afterExample } as const] : which === "detail" ? [{ kind: "text", text: TALK_COPY.afterDetail } as const] : []),
    );
    mark(t.id, which);
  };
  const differ = (t: TalkTopic) => {
    echo(TALK_COPY.buttons.differ);
    say({ kind: "text", text: TALK_COPY.differ });
    mark(t.id, "differ");
  };
  const concern = () => {
    echo(TALK_COPY.buttons.concern);
    say(contextHref ? { kind: "link", text: `${TALK_COPY.concernPending} ${TALK_COPY.concernPendingLink}`, href: contextHref, label: "나의 고민 기록소로 가기" } : { kind: "text", text: TALK_COPY.concernPending });
  };
  /** 메뉴에서 주제를 고른다 — 답이 아직 도착하는 중이면 먼저 모두 보여 준 뒤 이어 간다 */
  const goTopic = (t: TalkTopic) => {
    setMenuOpen(false);
    if (running.current) skip();
    openTopic(t, t.chip, opened.size > 0);
  };
  const goConcern = () => {
    setMenuOpen(false);
    if (running.current) skip();
    concern();
  };

  // 메뉴: 열면 첫 항목으로 초점, Esc · 바깥을 누르면 닫고 메뉴 버튼으로 초점을 돌려준다
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuBtnRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || menuBtnRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen]);

  const cur = current ? byId.get(current) : null;
  const usedHere = (current && used[current]) || new Set<Extra | "differ">();
  const allDone = opened.size === topics.length;
  const next = nextTopic(topics, current, opened);

  return (
    <div
      ref={rootRef}
      className="fixed inset-x-0 top-0 z-40 mx-auto flex h-dvh w-full max-w-[560px] flex-col border-x border-line bg-canvas chat-frame:static chat-frame:z-auto chat-frame:my-8 chat-frame:h-[max(560px,min(800px,calc(100dvh-9rem)))] chat-frame:w-[420px] chat-frame:overflow-hidden chat-frame:rounded-[28px] chat-frame:border chat-frame:border-line-strong"
    >
      <header className="flex items-center gap-2 border-b border-line bg-canvas px-2 py-2">
        <Link href={reportHref} aria-label="전체 리포트로 돌아가기" className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-mist">
          <ArrowIcon className="size-5 rotate-180" />
        </Link>
        <Avatar className="size-10 text-[17px]" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] leading-tight font-bold">
            미유<span className="sr-only"> · {name} 님의 분석 이야기</span>
          </h1>
          <p className="line-clamp-2 text-[13px] leading-snug text-ink-3">{subtitle}</p>
        </div>
      </header>

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
        aria-label="미유와의 대화"
        aria-live="polite"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-page px-3 py-4">
        {log.map((m, i) => {
          const sameSender = i > 0 && log[i - 1].from === m.from;
          return (
            <div key={m.id} data-msg={m.id} className={i === 0 ? "" : sameSender ? "mt-1.5" : "mt-4"}>
              {m.from === "me" ? <MeBubble text={m.text} /> : <MiyuRow say={m.say} first={!sameSender} model={model} dateLabel={dateLabel} />}
            </div>
          );
        })}
        {typing && (
          <div className={log[log.length - 1]?.from === "miyu" ? "mt-1.5" : "mt-4"}>
            <div className="flex items-start gap-2">
              <div className="w-8 shrink-0">{log[log.length - 1]?.from !== "miyu" && <Avatar className="size-8 text-[14px]" />}</div>
              <div className="rounded-2xl rounded-tl-md border border-line bg-canvas px-4 py-3.5">
                <span className="sr-only">미유가 입력하고 있어요</span>
                <span aria-hidden="true" className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-2 rounded-full bg-ink-3 motion-safe:animate-pulse" style={{ animationDelay: `${i * 180}ms` }} />
                  ))}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div ref={optionsRef} tabIndex={-1} role="group" aria-label="답장 고르기" className="border-t border-line bg-canvas pt-2.5 pb-2 outline-none">
        {typing ? (
          <div className="flex min-h-11 items-center justify-between gap-3 px-3">
            <p className="text-[14px] text-ink-3">미유가 답하고 있어요</p>
            <button type="button" onClick={skip} className="min-h-11 px-1 text-[14px] font-semibold text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
              바로 모두 보기
            </button>
          </div>
        ) : (
          // 답장 버튼만 한 줄로 — 옆으로 밀어 넘긴다. 다른 주제 · 분석 자료 · 리포트는 입력창 왼쪽 메뉴에 있다
          <div className="flex gap-2 overflow-x-auto px-3 pr-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {cur ? (
              <>
                {cur.example.length > 0 && !usedHere.has("example") && (
                  <button type="button" onClick={() => openExtra(cur, "example")} className={chip}>
                    {TALK_COPY.buttons.example}
                  </button>
                )}
                {cur.detail.length > 0 && !usedHere.has("detail") && (
                  <button type="button" onClick={() => openExtra(cur, "detail")} className={chip}>
                    {TALK_COPY.buttons.detail}
                  </button>
                )}
                {cur.basis && !usedHere.has("basis") && (
                  <button type="button" onClick={() => openExtra(cur, "basis")} className={chip}>
                    {TALK_COPY.buttons.basis}
                  </button>
                )}
                {!usedHere.has("differ") && (
                  <button type="button" onClick={() => differ(cur)} className={chip}>
                    {TALK_COPY.buttons.differ}
                    {pending}
                  </button>
                )}
                {next && (
                  <button type="button" onClick={() => openTopic(next, TALK_COPY.buttons.next, true)} className={chipPrimary}>
                    {TALK_COPY.buttons.next} · {next.chip}
                    <ArrowIcon className="size-4" />
                  </button>
                )}
                {allDone && (
                  <Link href={reportHref} className={chipPrimary}>
                    {TALK_COPY.buttons.fullReport}
                  </Link>
                )}
              </>
            ) : (
              groups.map((g) => (
                <button key={g.id} type="button" onClick={() => pickGroup(g)} className={chip}>
                  {g.chip}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="relative flex items-center gap-2 border-t border-line bg-canvas px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {menuOpen && (
          <div ref={menuRef} id={menuId} role="group" aria-label={TALK_COPY.menuTitle} className="absolute right-3 bottom-full left-3 mb-2 max-h-[min(30rem,70dvh)] overflow-y-auto rounded-2xl border border-line-strong bg-canvas p-2">
            {groups.map((g) => (
              <div key={g.id} className="px-1">
                {g.topicIds.length > 1 && <p className="px-2 pt-1.5 pb-0.5 text-[13px] font-semibold text-ink-3">{g.chip}</p>}
                {g.topicIds.map((id) => {
                  const t = byId.get(id)!;
                  return (
                    <button key={id} type="button" onClick={() => goTopic(t)} aria-current={current === id ? "true" : undefined} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-[15px] font-semibold hover:bg-mist aria-[current=true]:bg-accent-soft aria-[current=true]:text-accent-strong">
                      <span>{t.chip}</span>
                      {opened.has(id) && <span className="shrink-0 text-[13px] font-medium text-ink-3">봤어요</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="mt-1 border-t border-line px-1 pt-1">
              <button type="button" onClick={goConcern} className="flex min-h-11 w-full items-center gap-1.5 rounded-lg px-2 text-left text-[15px] font-semibold hover:bg-mist">
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
          className="grid size-11 shrink-0 place-items-center rounded-full border border-line-strong bg-canvas text-ink hover:bg-mist"
        >
          <MenuIcon />
        </button>
        <input
          type="text"
          disabled
          aria-label={TALK_COPY.freeQuestion}
          aria-describedby={noteId}
          placeholder={TALK_COPY.freeQuestion}
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-mist px-4 text-[15px] placeholder:text-ink-3 disabled:cursor-not-allowed"
        />
        <button type="button" disabled aria-label="보내기 (준비 중)" className="grid size-11 shrink-0 place-items-center rounded-full bg-mist text-ink-3 disabled:cursor-not-allowed">
          <ArrowIcon className="size-5 -rotate-90" />
        </button>
        <span id={noteId} className="sr-only">
          {TALK_COPY.freeQuestionPending}
        </span>
      </div>
    </div>
  );
}

function Avatar({ className }: { className: string }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-xl bg-accent-soft font-bold text-accent-strong ${className}`}>
      미
    </span>
  );
}

function MeBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-tr-md bg-accent px-3.5 py-2.5 text-[15px] leading-[1.5] font-semibold text-white">{text}</p>
    </div>
  );
}

const bubble = "rounded-2xl rounded-tl-md border border-line bg-canvas px-3.5 py-2.5";

function MiyuRow({ say, first, model, dateLabel }: { say: Say; first: boolean; model: TalkModel; dateLabel: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-8 shrink-0">{first && <Avatar className="size-8 text-[14px]" />}</div>
      <div className="min-w-0 flex-1">
        <Content say={say} model={model} dateLabel={dateLabel} />
      </div>
    </div>
  );
}

function Content({ say, model, dateLabel }: { say: Say; model: TalkModel; dateLabel: string }) {
  switch (say.kind) {
    case "card":
      return (
        <div>
          <AnalysisCard card={model.card} name={model.name} dateLabel={dateLabel} />
          <CardActions card={model.card} name={model.name} dateLabel={dateLabel} />
        </div>
      );
    case "text":
      if (say.muted) return <Prose text={say.text} className="px-1 text-[13px] leading-[1.6] text-ink-3" />;
      return (
        <div className={`${bubble} inline-block max-w-full`}>
          {say.label && <p className="mb-0.5 text-[13px] font-semibold text-ink-3">{say.label}</p>}
          <Prose text={say.text} className="text-[16px] leading-[1.6]" />
        </div>
      );
    case "link":
      return (
        <div className={`${bubble} inline-block max-w-full`}>
          <Prose text={say.text} className="text-[16px] leading-[1.6]" />
          <p className="mt-1">
            <Link href={say.href} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
              {say.label}
            </Link>
          </p>
        </div>
      );
    case "headline":
      return (
        <div className={`${bubble} inline-block max-w-full`}>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-3">
            <span className="grid size-5 place-items-center rounded bg-accent-soft text-[12px] font-bold text-accent-strong tabular-nums">{say.number}</span>
            {say.title}
          </p>
          <p className="mt-1 text-[18px] leading-snug font-bold tracking-tight">{say.text}</p>
        </div>
      );
    case "traits":
      return (
        <ul className="divide-y divide-line rounded-2xl rounded-tl-md border border-line bg-canvas">
          {say.traits.map((x) => (
            <li key={x.name} className="px-3.5 py-3">
              <p className="text-[16px] font-bold">{x.name}</p>
              <p className="mt-1.5 flex items-start gap-1.5 text-[14px] leading-snug">
                <StrengthIcon className="mt-0.5 size-4 shrink-0 text-positive" />
                <span>
                  <span className="font-semibold text-positive">장점</span> {x.shinesShort}
                </span>
              </p>
              <p className="mt-1.5 flex items-start gap-1.5 text-[14px] leading-snug">
                <AdjustIcon className="mt-0.5 size-4 shrink-0 text-caution" />
                <span>
                  <span className="font-semibold text-caution">단점이 될 수 있는 부분</span> {x.burdenShort}
                </span>
              </p>
            </li>
          ))}
        </ul>
      );
    case "timeline":
      return <LuckTimelineCard className="" timeline={say.slots} text={say.text} reference={say.reference} />;
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
