"use client";

import { useFormStatus } from "react-dom";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";

/**
 * 관리자 동작 버튼 — 누르면 바로 잠기고 "처리 중" 안내가 그 자리에 보인다.
 * 서버 동작은 결제사에 묻고 기록을 쓰는 동안 몇 초 걸릴 수 있는데, 그동안 화면이 그대로면 눌렀는지 알 수 없고 한 번 더 누르게 된다
 * (2026-10-22 운영자 확인: 대조 버튼을 눌렀을 때 처리가 끝나기 전에는 아무 변화가 없어 "응답 없음"으로 보였다. 처리는 끝까지 됐다).
 * 결과 안내는 처리가 끝난 뒤 서버가 보내는 화면(주문 상세의 버튼 아래)에 나온다.
 */
export function AdminSubmitButton({ label, pendingLabel, pendingNote, tone = "secondary" }: { label: string; pendingLabel: string; pendingNote: string; tone?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col gap-2">
      <button type="submit" disabled={pending} aria-busy={pending} className={`${tone === "primary" ? buttonPrimary : buttonSecondary} disabled:cursor-not-allowed disabled:opacity-60`} data-testid="admin-submit">
        {pending ? pendingLabel : label}
      </button>
      {pending && (
        <p role="status" className="max-w-md text-[13px] leading-relaxed text-ink-2" data-testid="admin-submit-pending">
          {pendingNote}
        </p>
      )}
    </div>
  );
}
