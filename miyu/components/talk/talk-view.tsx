"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BasisList, CaveatNote, ComfortPair, LuckTimelineCard, Prose, ReactionStepper } from "@/components/report/reading-parts";
import { AdjustIcon, ArrowIcon, StrengthIcon } from "@/components/ui/icons";
import { nextTopic, TALK_COPY, type TalkModel, type TalkPiece, type TalkTopic } from "@/lib/report/reading/talk";
import { AnalysisCard } from "./analysis-card";
import { CardActions } from "./card-actions";

type Extra = "example" | "detail" | "basis";
type Msg =
  | { id: number; from: "me"; text: string }
  | { id: number; from: "miyu"; kind: "text"; text: string; link?: { href: string; label: string } }
  | { id: number; from: "miyu"; kind: "card" }
  | { id: number; from: "miyu"; kind: "answer"; topicId: string }
  | { id: number; from: "miyu"; kind: "extra"; topicId: string; which: Extra };

type NewMsg = Msg extends infer M ? (M extends unknown ? Omit<M, "id"> : never) : never;

type Props = {
  model: TalkModel;
  dateLabel: string;
  /** 전체 리포트 화면 */
  reportHref: string;
  /** 나의 고민 기록소 (없으면 링크를 보이지 않는다) */
  contextHref?: string;
};

/**
 * 대화로 풀어보기(1단계) — 분석 카드 → 주제 고르기 → 짧은 풀이 → 예시 · 자세히 · 분석 근거 · 다음 풀이.
 * 모두 저장된 리포트의 글을 보여 주며 AI를 부르지 않는다. 자유 질문 · "내 경우는 달라"는 아직 준비 중이라고 밝힌다.
 * 대화는 이 화면 안에서만 이어지고 저장하지 않는다 (새로고침하면 처음부터).
 */
export function TalkView({ model, dateLabel, reportHref, contextHref }: Props) {
  const { topics, name } = model;
  const byId = new Map(topics.map((t) => [t.id, t]));
  const seq = useRef(2);
  const [log, setLog] = useState<Msg[]>([
    { id: 0, from: "miyu", kind: "text", text: TALK_COPY.intro(name) },
    { id: 1, from: "miyu", kind: "card" },
    { id: 2, from: "miyu", kind: "text", text: TALK_COPY.askTopic },
  ]);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [used, setUsed] = useState<Record<string, Set<Extra | "differ">>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [picking, setPicking] = useState(true);
  const optionsRef = useRef<HTMLDivElement>(null);
  const scrollTo = useRef<number | null>(null);

  // 새 말풍선이 생기면 그 첫 줄부터 보이게 하고, 다음 선택지로 키보드 초점을 옮긴다
  useEffect(() => {
    const id = scrollTo.current;
    if (id === null) return;
    scrollTo.current = null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`talk-msg-${id}`)?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    optionsRef.current?.focus({ preventScroll: true });
  }, [log]);

  const append = (...msgs: NewMsg[]) => {
    const withIds = msgs.map((m) => ({ ...m, id: ++seq.current })) as Msg[];
    scrollTo.current = withIds.find((m) => m.from === "miyu")?.id ?? withIds[0].id;
    setLog((l) => [...l, ...withIds]);
  };

  const openTopic = (t: TalkTopic) => {
    append({ from: "me", text: `${t.number}. ${t.chip}` }, { from: "miyu", kind: "text", text: TALK_COPY.opening(t.number, t.chip) }, { from: "miyu", kind: "answer", topicId: t.id });
    setOpened((o) => new Set(o).add(t.id));
    setCurrent(t.id);
    setPicking(false);
  };

  const mark = (id: string, what: Extra | "differ") => setUsed((u) => ({ ...u, [id]: new Set(u[id] ?? []).add(what) }));

  const openExtra = (t: TalkTopic, which: Extra) => {
    const label = TALK_COPY.buttons[which];
    const after = which === "example" ? TALK_COPY.afterExample : which === "detail" ? TALK_COPY.afterDetail : null;
    append({ from: "me", text: label }, ...(which === "basis" ? [{ from: "miyu" as const, kind: "text" as const, text: TALK_COPY.basisIntro }] : []), { from: "miyu", kind: "extra", topicId: t.id, which }, ...(after ? [{ from: "miyu" as const, kind: "text" as const, text: after }] : []));
    mark(t.id, which);
  };

  const differ = (t: TalkTopic) => {
    append({ from: "me", text: TALK_COPY.buttons.differ }, { from: "miyu", kind: "text", text: TALK_COPY.differ });
    mark(t.id, "differ");
  };

  const concern = () => {
    append({ from: "me", text: TALK_COPY.buttons.concern }, { from: "miyu", kind: "text", text: TALK_COPY.concernPending, ...(contextHref ? { link: { href: contextHref, label: TALK_COPY.concernPendingLink } } : {}) });
  };

  const next = nextTopic(topics, current, opened);
  const allDone = opened.size === topics.length;
  const cur = current ? byId.get(current) : null;
  const usedHere = (current && used[current]) || new Set<Extra | "differ">();

  const chip = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-canvas px-4 py-2 text-[15px] font-semibold text-ink transition-colors hover:bg-mist";
  const chipPrimary = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[15px] font-semibold text-white transition-colors hover:bg-accent-strong";

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-20">
      <div role="log" aria-label="미유와의 대화" aria-live="polite" className="space-y-4">
        {log.map((m) => (
          <div key={m.id} id={`talk-msg-${m.id}`} className="scroll-mt-20">
            {m.from === "me" ? <MeBubble text={m.text} /> : <MiyuBlock msg={m} byId={byId} model={model} dateLabel={dateLabel} />}
          </div>
        ))}
      </div>

      <div ref={optionsRef} tabIndex={-1} aria-label="다음 선택" className="mt-5 outline-none">
        {picking ? (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-3">고르면 이어서 풀어 드려요</p>
            <div className="flex flex-wrap gap-2">
              {topics.map((t) => (
                <button key={t.id} type="button" onClick={() => openTopic(t)} className={chip}>
                  <span className="grid size-6 place-items-center rounded-md bg-accent-soft text-[13px] font-bold text-accent-strong tabular-nums">{t.number}</span>
                  {t.chip}
                  {opened.has(t.id) && <span className="text-[13px] font-medium text-ink-3">· 봤어요</span>}
                </button>
              ))}
              <button type="button" onClick={concern} className={chip}>
                {TALK_COPY.buttons.concern}
                <span className="text-[13px] font-medium text-ink-3">· 준비 중</span>
              </button>
            </div>
          </div>
        ) : cur ? (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-3">{allDone ? TALK_COPY.allDone : TALK_COPY.askNext}</p>
            <div className="flex flex-wrap gap-2">
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
                  <span className="text-[13px] font-medium text-ink-3">· 준비 중</span>
                </button>
              )}
              {next && (
                <button type="button" onClick={() => openTopic(next)} className={chipPrimary}>
                  다음 풀이 · {next.number}. {next.chip}
                  <ArrowIcon className="size-4" />
                </button>
              )}
              <button type="button" onClick={() => setPicking(true)} className={chip}>
                {TALK_COPY.buttons.pickTopic}
              </button>
              {allDone && (
                <Link href={reportHref} className={chipPrimary}>
                  {TALK_COPY.buttons.fullReport}
                </Link>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-line-strong px-4 py-3.5">
        <p className="text-[15px] font-semibold text-ink-2">
          {TALK_COPY.freeQuestion} <span className="ml-1 text-[13px] font-medium text-ink-3">준비 중</span>
        </p>
        <p className="mt-0.5 text-[13px] leading-[1.6] text-ink-3">{TALK_COPY.freeQuestionPending}</p>
      </div>

      <p className="mt-6 text-[13px] leading-[1.7] text-ink-3">
        이 대화는 저장된 리포트의 풀이를 나눠서 보여 드리는 것이며 AI가 새로 쓰지 않습니다. 사주 해석과 앞날에 대한 이야기는 과학적으로 검증된 개인 예측이 아니며 실제 사건과 결과를 보장하지 않습니다.
      </p>
      <p className="mt-3">
        <Link href={reportHref} className="inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
          {TALK_COPY.buttons.fullReport}
          <ArrowIcon className="size-4" />
        </Link>
      </p>
    </div>
  );
}

function MeBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-tr-md bg-accent px-4 py-2.5 text-[15px] leading-[1.55] font-semibold text-white">{text}</p>
    </div>
  );
}

function MiyuBlock({ msg, byId, model, dateLabel }: { msg: Exclude<Msg, { from: "me" }>; byId: Map<string, TalkTopic>; model: TalkModel; dateLabel: string }) {
  const bubble = "max-w-full rounded-2xl rounded-tl-md border border-line bg-canvas px-4 py-3.5";
  return (
    <div>
      <p className="mb-1 text-[13px] font-semibold text-ink-3">미유</p>
      {msg.kind === "text" && (
        <div className={`${bubble} inline-block`}>
          <p className="text-[16px] leading-[1.65]">{msg.text}</p>
          {msg.link && (
            <p className="mt-1.5">
              <Link href={msg.link.href} className="text-[15px] font-semibold text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">
                {msg.link.label}
              </Link>
            </p>
          )}
        </div>
      )}
      {msg.kind === "card" && (
        <div>
          <AnalysisCard card={model.card} name={model.name} dateLabel={dateLabel} />
          <CardActions card={model.card} name={model.name} dateLabel={dateLabel} />
        </div>
      )}
      {msg.kind === "answer" && <AnswerBubble topic={byId.get(msg.topicId)!} className={bubble} />}
      {msg.kind === "extra" && <ExtraBubble topic={byId.get(msg.topicId)!} which={msg.which} className={bubble} />}
    </div>
  );
}

function AnswerBubble({ topic: t, className }: { topic: TalkTopic; className: string }) {
  return (
    <div className={className}>
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-3">
        <span className="grid size-6 place-items-center rounded-md bg-accent-soft text-[13px] font-bold text-accent-strong tabular-nums">{t.number}</span>
        {t.title}
      </p>
      <h3 className="mt-1.5 text-[19px] leading-snug font-bold tracking-tight">{t.headline}</h3>
      <div className="mt-2 space-y-3">
        {t.summary.map((s) => (
          <Prose key={s} text={s} className="text-[16px] leading-[1.7]" />
        ))}
      </div>
      {t.traits && (
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
          {t.traits.map((x) => (
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
      )}
      {t.timeline && <LuckTimelineCard timeline={t.timeline.slots} text={t.timeline.text} reference={t.timeline.reference} />}
      {t.caveat && <CaveatNote text={t.caveat} />}
    </div>
  );
}

function ExtraBubble({ topic: t, which, className }: { topic: TalkTopic; which: Extra; className: string }) {
  return (
    <div className={className}>
      <p className="text-[13px] font-semibold text-ink-3">
        {t.number}. {t.chip} · {which === "example" ? "예를 들면" : which === "detail" ? "자세히" : "분석 근거"}
      </p>
      <div className="mt-2">{which === "basis" ? t.basis && <BasisList basis={t.basis} /> : <Pieces items={which === "example" ? t.example : t.detail} />}</div>
    </div>
  );
}

function Pieces({ items }: { items: TalkPiece[] }) {
  return (
    <div className="space-y-4">
      {items.map((p, i) => {
        if (p.kind === "para")
          return (
            <div key={i} className={p.label ? "border-l-[3px] border-line-strong pl-3.5" : ""}>
              {p.label && <p className="text-[13px] font-semibold text-ink-3">{p.label}</p>}
              <Prose text={p.text} className="mt-0.5 text-[15px] leading-[1.75]" />
            </div>
          );
        if (p.kind === "note") return <Prose key={i} text={p.text} className="text-[13px] leading-[1.6] text-ink-3" />;
        if (p.kind === "flow") return <ReactionStepper key={i} flow={{ when: p.when, steps: p.steps, helpful: p.helpful }} />;
        return <ComfortPair key={i} comfort={{ comfortable: p.comfortable, clash: p.clash, note: p.note }} />;
      })}
    </div>
  );
}
