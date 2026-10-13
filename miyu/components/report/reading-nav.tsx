"use client";

import { useEffect, useRef, useState } from "react";

export type ReadingNavItem = { id: string; label: string };

/**
 * 주제 이동 막대 — 화면 위에 붙어 있고, 지금 읽는 주제를 표시한다. 오른쪽 "전체 펼치기"는 리포트 안의 모든 접힘(data-fold)을 한 번에 열고 닫는다.
 * 스크립트가 없어도 링크로 이동하고 접힘은 눌러서 열린다(향상 기능일 뿐이다).
 */
export function ReadingNav({ items, expandAll = true }: { items: ReadingNavItem[]; /** 접힘이 있는 화면에서만 "전체 펼치기"를 보인다 */ expandAll?: boolean }) {
  const [current, setCurrent] = useState(items[0]?.id ?? "");
  const [allOpen, setAllOpen] = useState(false);
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      // 화면 위쪽(막대 아래)에 걸린 마지막 주제를 현재로 본다
      let now = items[0]?.id ?? "";
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top <= 150) now = it.id;
      }
      setCurrent(now);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onToggle = () => {
      const folds = document.querySelectorAll<HTMLDetailsElement>("details[data-fold]");
      setAllOpen(folds.length > 0 && [...folds].every((d) => d.open));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("toggle", onToggle, true);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("toggle", onToggle, true);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  // 현재 주제 이름표가 가려지지 않게 가로 스크롤 위치를 맞춘다 (페이지 세로 스크롤은 건드리지 않는다)
  useEffect(() => {
    const box = rail.current;
    const chip = box?.querySelector<HTMLElement>("[aria-current='true']");
    if (box && chip) box.scrollTo({ left: chip.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
  }, [current]);

  function toggleAll() {
    const next = !allOpen;
    document.querySelectorAll<HTMLDetailsElement>("details[data-fold]").forEach((d) => {
      d.open = next;
    });
    setAllOpen(next);
  }

  return (
    <nav aria-label="리포트 주제" className="sticky top-14 z-20 border-b border-line bg-canvas/95 backdrop-blur md:top-16">
      <div className="mx-auto flex max-w-[720px] items-center gap-1 px-5">
        <div ref={rail} className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-2 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((it) => (
            <a
              key={it.id}
              href={`#${it.id}`}
              aria-current={current === it.id ? "true" : undefined}
              className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[14px] whitespace-nowrap transition-colors ${
                current === it.id ? "border-accent bg-accent-soft font-semibold text-accent-strong" : "border-line bg-canvas text-ink-2 hover:border-line-strong"
              }`}
            >
              {it.label}
            </a>
          ))}
        </div>
        {expandAll && (
        <button
          type="button"
          onClick={toggleAll}
          aria-pressed={allOpen}
          className="h-9 shrink-0 rounded-md px-2.5 text-[13px] font-semibold text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
        >
          {allOpen ? "전체 접기" : "전체 펼치기"}
        </button>
        )}
      </div>
    </nav>
  );
}
