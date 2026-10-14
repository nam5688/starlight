"use client";

import { useId, useState } from "react";
import { bonusFor, isChargeable, quoteCharge } from "@/lib/commerce/cash";
import { formatKrw, MIYU_CASH } from "@/lib/config/product";

const won = (n: number) => formatKrw(n);

/**
 * 충전 개수 고르기 — 빠른 선택 5개 + 직접 입력(10개 단위). 아래 요약은 화면용 미리 계산이며,
 * 실제 결제 금액 · 보너스는 서버가 개수로 다시 계산한다(브라우저가 보낸 금액은 쓰지 않는다).
 * 마감 타이머 · "원래 가격" 같은 표시는 쓰지 않는다.
 */
export function ChargeForm({ action, disabledNote, defaultCash = 50 }: { action: (formData: FormData) => void | Promise<void>; disabledNote: string | null; defaultCash?: number }) {
  const idBase = useId();
  const [picked, setPicked] = useState<number | "custom">(MIYU_CASH.packages.includes(defaultCash as never) ? defaultCash : MIYU_CASH.packages[0]);
  const [custom, setCustom] = useState("");
  const cash = picked === "custom" ? (/^\d+$/.test(custom) ? Number(custom) : NaN) : picked;
  const quote = quoteCharge(cash);
  const customInvalid = picked === "custom" && custom !== "" && !isChargeable(cash);

  return (
    <form action={action} className="space-y-5">
      <fieldset>
        <legend className="text-[16px] font-semibold">충전할 캐시</legend>
        <div className="mt-3 grid gap-2.5">
          {MIYU_CASH.packages.map((c) => {
            const q = quoteCharge(c)!;
            const active = picked === c;
            return (
              <label key={c} className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3.5 shadow-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${active ? "bg-accent-soft ring-2 ring-accent" : "bg-canvas"}`}>
                <span className="flex min-w-0 items-center gap-3">
                  <input type="radio" name={`${idBase}-pick`} className="size-5 accent-[var(--color-accent)]" checked={active} onChange={() => setPicked(c)} />
                  <span className="min-w-0">
                    <span className="block text-[16px] font-semibold tabular-nums">
                      {c}캐시{q.bonus > 0 && <span className="ml-1.5 text-[14px] font-semibold text-positive"> + 보너스 {q.bonus}캐시</span>}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-ink-3">질문 {q.questions}번 정도</span>
                  </span>
                </span>
                <span className="shrink-0 text-[16px] font-bold tabular-nums">{won(q.priceKrw)}</span>
              </label>
            );
          })}
          <label className={`flex cursor-pointer flex-wrap items-center gap-3 rounded-2xl px-4 py-3.5 shadow-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${picked === "custom" ? "bg-accent-soft ring-2 ring-accent" : "bg-canvas"}`}>
            <input type="radio" name={`${idBase}-pick`} className="size-5 accent-[var(--color-accent)]" checked={picked === "custom"} onChange={() => setPicked("custom")} />
            <span className="text-[16px] font-semibold">직접 입력</span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                min={MIYU_CASH.minCash}
                max={MIYU_CASH.maxCash}
                step={MIYU_CASH.unit}
                value={custom}
                onFocus={() => setPicked("custom")}
                onChange={(e) => {
                  setPicked("custom");
                  setCustom(e.target.value);
                }}
                aria-label={`충전할 캐시 개수 (${MIYU_CASH.unit}개 단위)`}
                aria-invalid={customInvalid}
                aria-describedby={`${idBase}-custom-hint`}
                className="h-11 w-28 rounded-lg border border-line-strong bg-canvas px-3 text-[16px] tabular-nums"
              />
              <span className="text-[15px] text-ink-2">캐시</span>
            </span>
            <span id={`${idBase}-custom-hint`} className={`basis-full text-[13px] leading-[1.6] ${customInvalid ? "font-medium text-caution" : "text-ink-3"}`}>
              {MIYU_CASH.unit}개 단위로 {MIYU_CASH.minCash}~{MIYU_CASH.maxCash}캐시까지 충전할 수 있어요.
            </span>
          </label>
        </div>
      </fieldset>

      <div aria-live="polite" className="rounded-2xl bg-mist px-4 py-3.5 text-[15px] leading-[1.7]">
        {quote ? (
          <>
            <p>
              <span className="font-semibold tabular-nums">{quote.cash}캐시</span>
              {quote.bonus > 0 && (
                <>
                  {" "}+ 보너스 <span className="font-semibold tabular-nums">{quote.bonus}캐시</span> ({quote.bonusPct}%)
                </>
              )}{" "}
              = <span className="font-bold tabular-nums">{quote.total}캐시</span>
            </p>
            <p className="text-ink-2">질문 {quote.questions}번 정도 · 결제 금액 <span className="font-semibold tabular-nums text-ink">{won(quote.priceKrw)}</span></p>
          </>
        ) : (
          <p className="text-ink-2">{MIYU_CASH.unit}개 단위로 개수를 정해 주세요.</p>
        )}
      </div>

      <input type="hidden" name="cash" value={quote ? quote.cash : ""} />
      {disabledNote ? (
        <div>
          <button type="button" disabled className="inline-flex h-12 w-full cursor-not-allowed items-center justify-center rounded-full border border-line bg-mist px-6 text-[16px] font-semibold text-ink-3 sm:w-auto">
            충전할 수 없어요
          </button>
          <p role="status" className="mt-2 text-[14px] leading-[1.65] text-ink-2">{disabledNote}</p>
        </div>
      ) : (
        <button type="submit" disabled={!quote} className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent px-6 text-[16px] font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-mist disabled:text-ink-3 sm:w-auto">
          {quote ? `${won(quote.priceKrw)} 결제하기` : "개수를 정해 주세요"}
        </button>
      )}
    </form>
  );
}

/** 보너스 구간 표 (항상 같은 표 — 구간 기준은 MIYU_CASH.bonusTiers 한 곳) */
export function BonusTable() {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-canvas text-[15px] shadow-soft">
      {MIYU_CASH.bonusTiers.map((t) => (
        <li key={t.minCash} className="flex items-center justify-between gap-3 px-4 py-3">
          <span>{t.minCash}캐시 이상 충전</span>
          <span className="font-semibold tabular-nums text-positive">보너스 {t.ratePct}%</span>
        </li>
      ))}
      <li className="px-4 py-3 text-[13px] leading-[1.6] text-ink-3">
        예: 100캐시를 충전하면 보너스 {bonusFor(100).bonus}캐시가 더해져요. 보너스도 질문에 똑같이 쓰여요.
      </li>
    </ul>
  );
}
