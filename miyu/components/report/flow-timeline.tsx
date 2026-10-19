"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronIcon } from "@/components/ui/icons";
import type { FlowBar, FlowItem, FlowView } from "@/lib/report/reading/flow-view";
import { FLOW_HIT_PX } from "@/lib/report/reading/flow-metrics";
import { Prose } from "./reading-parts";

// 6번 장 "앞으로의 운과 변화"의 시기별 칸 + 시간축 그래프. 값은 모두 서버가 저장된 리포트에서 계산해 넘긴다(lib/report/reading/flow-view.ts) —
// 이 컴포넌트는 그리고 여닫기만 한다. 막대의 위치 · 길이는 기간일 뿐이고 높이나 색으로 좋고 나쁨을 나타내지 않는다.
// 칸은 네이티브 <details data-fold>라서 스크립트 없이도 눌러서 열리고, 주제 이동 막대의 "전체 펼치기"도 함께 열고 닫는다.
// 막대(버튼)를 누르면 같은 칸이 열리고 닫힌다. 막대 사이는 화살표 키로 옮긴다.

type Data = Pick<FlowView, "hourUnknown" | "items" | "notes" | "axis">;

const BAR_H = 30; // 눈에 보이는 막대 높이(px)
const LANE = FLOW_HIT_PX; // 줄 하나의 높이(px) — 눌리는 영역의 높이와 같아 위아래 줄의 눌리는 영역이 겹치지 않는다(막대는 줄 가운데에 놓인다)

const BAR_STYLE: Record<FlowBar["kind"], string> = {
  past: "border border-line-strong bg-mist text-ink-2",
  now: "border border-accent-strong bg-accent text-white",
  year: "border border-accent bg-accent-soft text-accent-strong",
  next: "border-2 border-accent bg-canvas text-accent-strong",
};

const GROUPS: { id: string; title: string; kinds: FlowItem["kind"][] }[] = [
  { id: "past", title: "지나온 시기", kinds: ["past"] },
  { id: "now", title: "지금 · 가까운 해", kinds: ["now", "year"] },
  { id: "next", title: "앞으로", kinds: ["next"] },
];

export function FlowTimeline({ view, idPrefix }: { view: Data; idPrefix: string }) {
  const { items, axis, notes } = view;
  const root = useRef<HTMLDivElement>(null);
  const barRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const cardId = (key: string) => `${idPrefix}-card-${key}`;
  const expandable = new Map(items.map((i) => [i.key, Boolean(i.text || i.plain)]));

  // 칸이 열리고 닫히는 것(눌러서 · 전체 펼치기로)을 읽어 막대의 눌림 표시와 맞춘다
  useEffect(() => {
    const sync = () => {
      const next = new Set<string>();
      root.current?.querySelectorAll<HTMLDetailsElement>("details[data-flow-key]").forEach((d) => {
        if (d.open && d.dataset.flowKey) next.add(d.dataset.flowKey);
      });
      setOpen(next);
    };
    document.addEventListener("toggle", sync, true);
    return () => document.removeEventListener("toggle", sync, true);
  }, []);

  function press(key: string) {
    const el = document.getElementById(cardId(key));
    if (!el) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (el instanceof HTMLDetailsElement) {
      el.open = !el.open;
      if (el.open) el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    } else {
      el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }
  }

  // 화살표 · Home · End로 막대 사이를 옮긴다 — 시간 순서(칸 순서)대로
  function onKeyDown(e: React.KeyboardEvent) {
    const order = items.filter((i) => axis?.bars.some((b) => b.key === i.key)).map((i) => i.key);
    const here = order.findIndex((k) => barRefs.current.get(k) === document.activeElement);
    if (here < 0) return;
    let to = here;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") to = Math.min(order.length - 1, here + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = Math.max(0, here - 1);
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = order.length - 1;
    else return;
    e.preventDefault();
    barRefs.current.get(order[to])?.focus();
  }

  return (
    <div ref={root} className="mt-5">
      <p className="text-[13px] leading-[1.6] text-ink-3">막대나 아래 칸을 누르면 풀이가 열려요.</p>

      {axis && (
        <div className="mt-3 rounded-xl bg-canvas px-3 pt-3 pb-2 shadow-soft md:px-4" role="group" aria-label="시기 타임라인 — 막대를 누르면 해당 풀이가 열려요">
          <div className="relative" style={{ height: axis.laneCount * LANE + 20, paddingTop: 20 }}>
            <p className="absolute top-0 -translate-x-1/2 text-[12px] font-semibold text-accent-strong" style={{ left: `${axis.nowLeft}%` }} aria-hidden="true">
              지금
            </p>
            <div className="absolute top-4 bottom-0 w-px bg-accent-strong/60" style={{ left: `${axis.nowLeft}%` }} aria-hidden="true" />
            <div className="relative" onKeyDown={onKeyDown}>
              {axis.bars.map((b) => {
                const isOpen = open.has(b.key);
                return (
                  <button
                    key={b.key}
                    ref={(el) => {
                      if (el) barRefs.current.set(b.key, el);
                      else barRefs.current.delete(b.key);
                    }}
                    type="button"
                    onClick={() => press(b.key)}
                    aria-expanded={expandable.get(b.key) ? isOpen : undefined}
                    aria-controls={cardId(b.key)}
                    aria-label={b.label}
                    title={b.label}
                    className={`absolute inline-flex h-[30px] items-center justify-center rounded-md px-1 text-[12px] font-semibold whitespace-nowrap before:absolute before:top-1/2 before:left-1/2 before:h-11 before:w-[max(calc(100%+4px),44px)] before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong ${BAR_STYLE[b.kind]} ${isOpen ? "ring-2 ring-accent-strong ring-offset-1" : ""}`}
                    style={{ left: `${b.left}%`, width: `${b.width}%`, top: b.lane * LANE + (LANE - BAR_H) / 2 }}
                  >
                    <span className="block max-w-full overflow-hidden text-ellipsis">{b.short}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="relative mt-1 h-5 border-t border-line text-[12px] text-ink-3 tabular-nums" aria-hidden="true">
            {axis.ticks.map((t) => (
              <span key={t.year} className="absolute top-1 -translate-x-1/2" style={{ left: `${t.left}%` }}>
                {t.year}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 space-y-6">
        {GROUPS.map((g) => {
          const rows = items.filter((i) => g.kinds.includes(i.kind));
          const groupNotes = g.id === "past" ? notes.past : g.id === "now" ? notes.now : notes.next;
          if (rows.length === 0 && groupNotes.length === 0) return null;
          return (
            <section key={g.id} aria-label={g.title}>
              <h4 className="text-[15px] font-bold text-ink-2">{g.title}</h4>
              <ul className="mt-2 space-y-2">
                {rows.map((i) => (
                  <li key={i.key}>
                    <Card item={i} id={cardId(i.key)} />
                  </li>
                ))}
              </ul>
              {groupNotes.length > 0 && (
                <div className="mt-2 space-y-1.5 text-[14px] leading-[1.7] text-ink-2">
                  {groupNotes.map((n) => (
                    <Prose key={n} text={n} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Head({ item }: { item: FlowItem }) {
  return (
    <span className="min-w-0">
      <span className="block text-[16px] leading-snug font-bold tracking-tight">{item.title}</span>
      <span className="mt-0.5 block text-[13px] leading-[1.5] text-ink-3 tabular-nums">{item.caption}</span>
      {item.theme && <span className="mt-1 block text-[14px] leading-[1.55] text-ink-2">{item.theme}</span>}
    </span>
  );
}

/** 시기 칸 하나 — 풀이가 있으면 눌러서 펼치고, 없으면 제목 줄만 보인다 */
function Card({ item, id }: { item: FlowItem; id: string }) {
  if (!item.text && !item.plain) {
    return (
      <div id={id} tabIndex={-1} className="rounded-xl bg-canvas px-4 py-3 shadow-soft">
        <Head item={item} />
      </div>
    );
  }
  return (
    <details id={id} data-fold data-flow-key={item.key} className="group rounded-xl bg-canvas shadow-soft">
      <summary className="flex min-h-12 cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <Head item={item} />
        <ChevronIcon className="mt-0.5 size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="space-y-3 px-4 pt-1 pb-4">
        {item.text && <Prose text={item.text} className="text-[16px] leading-[1.75]" />}
        {item.plain && (
          <div className="rounded-lg bg-accent-soft px-3.5 py-3">
            <p className="text-[13px] font-semibold text-accent-strong">쉬운 말로 풀면</p>
            <Prose text={item.plain.meaning} className="mt-1 text-[15px] leading-[1.7] text-ink-2" />
            <Prose text={item.plain.example} className="mt-1.5 text-[15px] leading-[1.7] text-ink-2" />
          </div>
        )}
      </div>
    </details>
  );
}
