import Link from "next/link";
import type { ReactNode } from "react";
import { hrefTo, DAY_CHOICES, type BenefitsNav } from "@/components/admin/benefits/href";
import { inputClass } from "@/components/ui/form-controls";
import { formatDateTime } from "@/components/ui/format";
import { CheckIcon, InfoIcon } from "@/components/ui/icons";

// 혜택 관리자 화면의 공통 조각 — 운영자 한 사람이 읽는 화면이라 화려하지 않게, 표 · 폼의 정렬과 간격만 정돈한다.
// 색은 globals.css 토큰만 쓰고, 경고 · 주의는 글과 아이콘을 함께 둔다(색만으로 뜻을 구분하지 않는다).

export const fmtTime = (iso: string | null | undefined) => (iso ? formatDateTime(iso) || "-" : "-");
export const fmtNum = (n: number, maxFraction = 2) => n.toLocaleString("ko-KR", { maximumFractionDigits: maxFraction });
export const shortId = (id: string) => id.slice(0, 8);

// ── 버튼 ─────────────────────────────────────

const smallBase = "inline-flex h-11 items-center justify-center rounded-lg px-4 text-[14px] font-semibold transition-colors";
export const smallButton = `${smallBase} border border-line-strong bg-canvas text-ink hover:bg-mist`;
export const smallPrimary = `${smallBase} border border-transparent bg-accent text-white hover:bg-accent-strong`;
export const smallCaution = `${smallBase} border border-caution/40 bg-canvas text-caution hover:bg-caution-soft`;

// ── 구역 · 안내 ──────────────────────────────

export function Section({ id, title, hint, children }: { id: string; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-[18px] font-bold">
        {title}
      </h2>
      {hint && <p className="mt-1 text-[14px] leading-relaxed text-ink-3">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const TONE = { info: "bg-mist text-ink-2", warn: "bg-caution-soft text-caution", ok: "bg-positive-soft text-positive" } as const;

/** 안내 상자 — warn은 황토 글자 + 살구 바탕이고 앞에 이름(label)을 글로 적는다 */
export function Notice({ tone, label, children }: { tone: keyof typeof TONE; label?: string; children: ReactNode }) {
  return (
    <div className={`flex gap-3 rounded-md px-4 py-3 text-[14px] leading-relaxed ${TONE[tone]}`}>
      {tone === "ok" ? <CheckIcon className="mt-0.5 size-4 shrink-0" /> : <InfoIcon className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0">
        {label && <strong className="font-semibold">{label} · </strong>}
        {children}
      </div>
    </div>
  );
}

export function StateChip({ tone, children }: { tone: "on" | "off" | "warn"; children: ReactNode }) {
  const cls = tone === "on" ? "bg-positive-soft text-positive" : tone === "warn" ? "bg-caution-soft text-caution" : "bg-mist text-ink-3";
  return <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[13px] font-semibold ${cls}`}>{children}</span>;
}

/** 가정 · 추정 값 옆에 붙이는 작은 이름표 */
export function AssumedTag({ children = "가정" }: { children?: ReactNode }) {
  return <span className="ml-1.5 inline-flex shrink-0 items-center rounded-md border border-line-strong px-1.5 py-px align-middle text-[12px] font-medium text-ink-3">{children}</span>;
}

/** 되돌릴 수 없는 동작 — 눌러 펼치면 경고와 확인 버튼이 나온다(자바스크립트 없이 두 번 눌러야 실행된다) */
export function ConfirmStep({ action, fields, summary, warning, confirmLabel }: { action: (formData: FormData) => void | Promise<void>; fields: Record<string, string>; summary: string; warning: ReactNode; confirmLabel: string }) {
  return (
    <details>
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-[14px] font-medium text-ink-3 underline decoration-ink-3/30 underline-offset-4 hover:text-ink-2 [&::-webkit-details-marker]:hidden">{summary}</summary>
      <div className="mt-1 max-w-[16rem] rounded-xl bg-caution-soft px-3 py-3">
        <p className="text-[13px] leading-snug text-caution">{warning}</p>
        <form action={action} className="mt-2">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <button type="submit" className={smallCaution}>
            {confirmLabel}
          </button>
        </form>
      </div>
    </details>
  );
}

// ── 숫자 ─────────────────────────────────────

export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const lg = cols === 4 ? "md:grid-cols-4" : cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return <dl className={`grid grid-cols-2 gap-3 ${lg}`}>{children}</dl>;
}

export function Stat({ label, value, sub, warn }: { label: string; value: ReactNode; sub?: ReactNode; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-canvas px-4 py-3 shadow-soft">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className={`mt-0.5 text-[22px] font-bold tabular-nums ${warn ? "text-danger" : ""}`}>{value}</dd>
      {sub && <dd className="mt-0.5 text-[13px] leading-snug text-ink-3">{sub}</dd>}
    </div>
  );
}

export function KeyValueList({ children }: { children: ReactNode }) {
  return <dl className="border-y border-line text-[14px]">{children}</dl>;
}

export function KeyValue({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

// ── 표 ───────────────────────────────────────

export type Col = string | { label: string; align?: "right" };

export const TD = "py-2.5 pr-4 align-top";
export const TD_NUM = "py-2.5 pr-4 text-right align-top tabular-nums";

/** 가로로 스크롤되는 표 — 모바일에서 페이지 본문이 넘치지 않고 표만 옆으로 밀린다 */
export function DataTable({ caption, head, minWidth = 560, children }: { caption: string; head: Col[]; minWidth?: number; children: ReactNode }) {
  return (
    <>
      <div role="region" aria-label={caption} tabIndex={0} className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <table style={{ minWidth }} className="w-full border-collapse text-left text-[14px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-y border-line text-[13px] text-ink-3">
              {head.map((h) => {
                const col: { label: string; align?: "right" } = typeof h === "string" ? { label: h } : h;
                return (
                  <th key={col.label} scope="col" className={`py-2 pr-4 font-medium ${col.align === "right" ? "text-right" : ""}`}>
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {minWidth > 380 && <p className="mt-1 text-[12px] text-ink-3 md:hidden">표는 옆으로 밀어서 볼 수 있어요.</p>}
    </>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-ink-2">{children}</p>;
}

// ── 폼 ───────────────────────────────────────

/** 라벨 + 입력 + 도움말 — 입력에 aria-describedby={`${id}-hint`}를 달아 쓴다 */
export function Field({ id, label, hint, children, className = "" }: { id: string; label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-[13px] leading-snug text-ink-3">
          {hint}
        </p>
      )}
    </div>
  );
}

/** 사유 입력 — 서버가 3자 이상을 요구한다(설정 변경은 비어 있지 않으면 되지만 같은 기준으로 받는다) */
export function ReasonInput({ id, name = "reason", placeholder = "예: 점검 끝나고 다시 켬" }: { id: string; name?: string; placeholder?: string }) {
  return <input id={id} name={name} type="text" required minLength={3} maxLength={200} placeholder={placeholder} autoComplete="off" className={inputClass()} />;
}

export const textareaClass = "w-full rounded-lg border border-line-strong bg-canvas px-4 py-3 font-mono text-[15px] leading-relaxed text-ink focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

// ── 기간 선택 ────────────────────────────────

/** 7 · 30 · 90일 — 장부 합계 · 추천 퍼널 · 질문 원가의 집계 기간 */
export function PeriodNav({ nav, days }: { nav: BenefitsNav; days: number }) {
  return (
    <nav aria-label="집계 기간" className="flex flex-wrap items-center gap-2 text-[14px]">
      <span className="text-ink-3">집계 기간</span>
      {DAY_CHOICES.map((d) => (
        <Link key={d} href={hrefTo(nav, { days: d })} aria-current={d === days ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-4 font-semibold ${d === days ? "border-accent bg-accent text-white" : "border-line-strong bg-canvas hover:bg-mist"}`}>
          최근 {d}일
        </Link>
      ))}
    </nav>
  );
}
