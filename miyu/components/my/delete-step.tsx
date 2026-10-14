import type { ReactNode } from "react";

/**
 * 지우기 확인 — 눌러 펼치면 설명과 "지우기" 버튼이 나온다(자바스크립트 없이도 두 번 눌러야 지워진다). 서버 동작은 action으로 받는다.
 */
export function DeleteStep({ action, label, confirmLabel, children }: { action: () => Promise<void>; label: string; confirmLabel: string; children?: ReactNode }) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-[14px] font-medium text-ink-3 underline decoration-ink-3/30 underline-offset-4 hover:text-ink-2 [&::-webkit-details-marker]:hidden">{label}</summary>
      <div className="mt-1 rounded-2xl bg-caution-soft px-4 py-3">
        {children && <div className="text-[13px] leading-[1.65] text-caution">{children}</div>}
        <form action={action} className="mt-2">
          <button type="submit" className="inline-flex min-h-11 items-center rounded-full bg-canvas px-4 text-[14px] font-semibold text-caution shadow-soft hover:brightness-95">
            {confirmLabel}
          </button>
        </form>
      </div>
    </details>
  );
}
