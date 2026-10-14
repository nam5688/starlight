"use client";

import { useState } from "react";
import { Fold } from "@/components/report/reading-parts";
import {
  basisLines,
  CALENDAR_TOPIC_LABEL,
  calendarNotes,
  monthLabel,
  levelLabel,
  reasonLine,
  startsLabel,
  summaryLine,
  topicUnavailable,
  type CalendarTopic,
} from "@/lib/report/reading/calendar-text";
import type { MonthCalendar, MonthLevel } from "@/lib/saju/interpret/months";

/**
 * 월별 달력 — 그 해 열두 달에서 가까운 관계 · 재물 주제가 눈에 띄기 쉬운 달을 보여 준다.
 * 일어날 일을 알려 주는 것이 아니라 전통 해석이 그 달을 어떻게 읽는지의 표시이며, 모든 값은 저장된 달력(코드 계산)에서 온다.
 * 단계는 색만으로 구분하지 않는다 — 글자(움직임이 큰 달 · 조금 움직이는 달 · 차분한 달)와 채움 모양이 함께 전한다.
 */
const CHIP: Record<MonthLevel, string> = {
  high: "bg-accent text-white",
  mid: "bg-accent-soft text-accent-strong",
  calm: "border border-line-strong bg-canvas text-ink-2",
};
const DOT: Record<MonthLevel, string> = {
  high: "bg-white",
  mid: "border-2 border-accent-strong bg-accent-soft",
  calm: "border border-ink-3 bg-canvas",
};

function Segmented<T extends string>({ name, label, value, options, onChange }: { name: string; label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${options.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {options.map(([v, text]) => (
        <label key={v} className="cursor-pointer">
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="peer sr-only" />
          <span className="flex min-h-11 items-center justify-center rounded-lg border border-line-strong px-2 text-center text-[15px] peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-semibold peer-checked:text-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">{text}</span>
        </label>
      ))}
    </div>
  );
}

export function MonthCalendarView({ calendars, idPrefix }: { calendars: MonthCalendar[]; idPrefix: string }) {
  const [yearIndex, setYearIndex] = useState(0);
  const first = calendars[0];
  const [topic, setTopic] = useState<CalendarTopic>(first?.usedSpouseStar ? "love" : "money");
  if (!first) return null;
  const cal = calendars[Math.min(yearIndex, calendars.length - 1)];
  const unavailable = topicUnavailable(cal, topic);
  const basis = basisLines(cal, topic);

  return (
    <div>
      <div className="space-y-2.5">
        <Segmented
          name={`${idPrefix}-topic`}
          label="달력 주제"
          value={topic}
          options={[["love", CALENDAR_TOPIC_LABEL.love], ["money", CALENDAR_TOPIC_LABEL.money]] as const}
          onChange={setTopic}
        />
        <Segmented
          name={`${idPrefix}-year`}
          label="달력 연도 (입춘 기준)"
          value={String(yearIndex)}
          options={calendars.map((c, i) => [String(i), `${c.year}년`] as const)}
          onChange={(v) => setYearIndex(Number(v))}
        />
      </div>

      <p aria-live="polite" className="mt-4 text-[16px] leading-[1.7] font-semibold text-pretty">{summaryLine(cal, topic)}</p>

      {!unavailable && (
        <ol className="mt-3 divide-y divide-line rounded-xl border border-line bg-canvas">
          {cal.months.map((m) => {
            const level = m[topic].level;
            return (
              <li key={m.index} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 px-3.5 py-3">
                <div>
                  <p className="text-[16px] font-bold tabular-nums">{monthLabel(cal, m)}</p>
                  <p className="mt-0.5 text-[12px] leading-tight text-ink-3">{startsLabel(m)}</p>
                </div>
                <div className="min-w-0">
                  <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-semibold ${CHIP[level]}`}>
                    <span aria-hidden className={`size-2.5 rounded-full ${DOT[level]}`} />
                    {levelLabel(topic, level)}
                  </span>
                  <p className="mt-1.5 text-[14px] leading-[1.65] text-ink-2">{reasonLine(m, topic)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <ul className="mt-3 space-y-1 text-[13px] leading-[1.6] text-ink-3">
        {calendarNotes(cal, topic).map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      {!unavailable && basis.length > 0 && (
        <div className="mt-4">
          <Fold label="달력 계산 근거 보기" wide>
            <p className="text-[13px] leading-[1.6] text-ink-3">그 달의 월운과 원국을 겹쳐 계산한 결과예요. 전통 해석 규칙은 전문가 검토 전 초안이에요.</p>
            <ul className="mt-3 space-y-2 text-[13px] leading-[1.65] text-ink-2">
              {basis.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Fold>
        </div>
      )}
    </div>
  );
}
