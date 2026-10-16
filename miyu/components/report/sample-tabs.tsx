"use client";

import { useState, type ReactNode } from "react";

type Tab = "free" | "deep";

/**
 * 리포트 예시 페이지의 두 탭 — 같은 가상 인물의 무료 리포트와 심층 리포트를 번갈아 읽는다(운영자 방향 2026-10-16).
 * 두 탭 모두 실제 풀이를 그대로 읽을 수 있고 "구매 후 공개"로 가리지 않는다. 한 번에 한 탭만 그려 HTML id가 겹치지 않는다.
 */
export function SampleTabs({ free, deep, deepLabel }: { free: ReactNode; deep: ReactNode; deepLabel: string }) {
  const [tab, setTab] = useState<Tab>("free");
  const tabs: { id: Tab; label: string }[] = [
    { id: "free", label: "무료 리포트 예시" },
    { id: "deep", label: deepLabel },
  ];
  return (
    <div>
      <div className="mx-auto w-full max-w-[720px] px-5">
        <div role="tablist" aria-label="리포트 예시 선택" className="grid grid-cols-2 gap-1 rounded-xl bg-mist p-1">
          {tabs.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`sample-tab-${t.id}`}
                aria-selected={on}
                aria-controls={`sample-panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`min-h-11 rounded-lg px-2 text-[14px] leading-tight font-semibold transition-colors md:text-[15px] ${on ? "bg-accent text-white shadow-soft" : "text-ink-2 hover:bg-canvas"}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div role="tabpanel" id={`sample-panel-${tab}`} aria-labelledby={`sample-tab-${tab}`} tabIndex={-1}>
        {tab === "free" ? free : deep}
      </div>
    </div>
  );
}
