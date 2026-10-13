"use client";

import { useFormStatus } from "react-dom";
import { buttonPrimary } from "@/components/ui/styles";

/** 발급 버튼 — 누르면 바로 잠겨서 두 번 눌러도 한 번만 요청된다 (서버도 같은 저장본이면 같은 주문으로 이어 준다) */
export function ConcernIssueSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${buttonPrimary} w-full sm:w-auto`}>
      {pending ? "결제 화면으로 이동 중…" : label}
    </button>
  );
}
