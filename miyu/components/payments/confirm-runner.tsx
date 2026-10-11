"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { confirmPaymentAction, type ConfirmOutcome } from "@/app/payments/actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";

/** 결제사에서 돌아온 값으로 서버 승인을 요청하고, 결과에 따라 이동하거나 안내한다 */
export function ConfirmRunner() {
  const params = useSearchParams();
  const router = useRouter();
  const [outcome, setOutcome] = useState<ConfirmOutcome | null>(null);
  const [busy, setBusy] = useState(true);
  const started = useRef(false);

  const orderId = params.get("orderId") ?? "";
  const paymentKey = params.get("paymentKey") ?? "";
  const amount = Number(params.get("amount"));

  const run = useCallback(async () => {
    setBusy(true);
    const result = await confirmPaymentAction({ orderId, paymentKey, amount });
    setOutcome(result);
    setBusy(false);
    if (result.kind === "paid") router.replace(`/results/${result.assessmentId}`);
  }, [orderId, paymentKey, amount, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  if (busy || outcome?.kind === "paid") {
    return (
      <p role="status" className="mt-4 text-[16px] leading-relaxed text-ink-2">
        결제를 확인하고 있어요. 이 화면을 닫지 말아 주세요.
      </p>
    );
  }

  if (outcome?.kind === "checking") {
    return (
      <div className="mt-4 space-y-5">
        <p className="text-[16px] leading-relaxed text-ink-2">
          결제사 응답을 받지 못해 결과를 확인하고 있습니다. 결제가 완료되었다면 잠시 후 결과 화면에 반영됩니다.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={run} className={buttonPrimary}>
            다시 확인
          </button>
          <Link href={`/results/${outcome.assessmentId}`} className={buttonSecondary}>
            결과 화면으로
          </Link>
        </div>
      </div>
    );
  }

  if (outcome?.kind === "login") {
    return (
      <div className="mt-4 space-y-5">
        <p className="text-[16px] leading-relaxed text-ink-2">로그인이 풀렸습니다. MY에서 다시 로그인한 뒤 결과를 확인해 주세요.</p>
        <Link href="/my" className={buttonPrimary}>
          MY로 가기
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-5">
      <p role="alert" className="text-[16px] font-medium leading-relaxed text-danger">
        {outcome?.kind === "rejected" ? outcome.message : "결제를 확인하지 못했습니다."}
      </p>
      <p className="text-[14px] text-ink-3">승인되지 않은 결제는 청구되지 않습니다.</p>
      <Link
        href={outcome?.kind === "rejected" && outcome.assessmentId ? `/results/${outcome.assessmentId}` : "/my"}
        className={buttonSecondary}
      >
        결과 화면으로 돌아가기
      </Link>
    </div>
  );
}
