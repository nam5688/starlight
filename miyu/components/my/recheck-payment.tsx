"use client";

import { useState, useTransition } from "react";
import { recheckPaymentAction, type RecheckResult } from "@/app/my/orders/[orderNumber]/actions";

const STATUS_TEXT: Record<string, string> = { DONE: "결제 완료", CANCELED: "취소됨", PARTIAL_CANCELED: "부분 취소", ABORTED: "승인 실패", EXPIRED: "만료" };

/** 결제사에 다시 조회해 결과만 보여준다 (주문 상태는 바꾸지 않음) */
export function RecheckPayment({ orderNumber }: { orderNumber: string }) {
  const [result, setResult] = useState<RecheckResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await recheckPaymentAction(orderNumber)))}
        className="inline-flex h-10 items-center rounded-lg border border-line-strong px-4 text-[14px] font-semibold hover:bg-mist disabled:opacity-60"
      >
        {pending ? "조회 중…" : "토스페이먼츠에 다시 조회"}
      </button>
      {result && (
        <div role="status" className="mt-3 rounded-md bg-mist px-4 py-3 text-[14px] leading-relaxed">
          {result.ok ? (
            <>
              <p className="font-semibold">
                토스페이먼츠 기록: {STATUS_TEXT[result.status] ?? result.status}
                {result.matches ? " · 주문번호 · 금액 일치" : " · 주문번호 또는 금액 불일치"}
              </p>
              <p className="text-ink-2">
                결제수단 {result.method ?? "-"} · 승인 {result.approvedAt ? new Date(result.approvedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-"} · 상점 ID {result.mId ?? "-"}
              </p>
            </>
          ) : (
            <p className="text-danger">{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
