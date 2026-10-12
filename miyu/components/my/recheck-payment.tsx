"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recheckPaymentAction, type RecheckResult } from "@/app/my/orders/[orderNumber]/actions";

/** 결제사에 다시 조회해 결제사 기록에 맞게 주문을 바로잡는다 (결제가 승인됐는데 반영되지 않은 경우의 복구 버튼) */
export function RecheckPayment({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const [result, setResult] = useState<RecheckResult | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      try {
        setResult(await recheckPaymentAction(orderNumber));
        router.refresh();
      } catch {
        setResult({ ok: false, message: "인터넷 연결이 불안정해 확인하지 못했습니다. 연결을 확인하고 다시 눌러 주세요. 다시 결제하지는 마세요." });
      }
    });

  const bad = !result || !result.ok || result.kind === "anomaly" || result.kind === "error";
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="inline-flex h-10 items-center rounded-lg border border-line-strong px-4 text-[14px] font-semibold hover:bg-mist disabled:opacity-60"
      >
        {pending ? "확인 중…" : "결제사에 다시 확인하고 맞추기"}
      </button>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-3">결제사의 실제 기록만 기준으로 합니다. 결제가 승인되었다면 다시 결제하지 않아도 이 버튼이나 자동 확인으로 반영됩니다.</p>
      {result && (
        <p role="status" className={`mt-3 rounded-md bg-mist px-4 py-3 text-[14px] leading-relaxed ${result.ok && !bad ? "" : "text-ink-2"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
