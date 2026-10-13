"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { recordPaymentFailureAction } from "@/app/payments/actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { USER_CANCEL_CODES } from "@/lib/commerce/order";

/** 결제 실패·취소 안내. 대기 중인 주문은 서버에서 정리한다. */
export function FailRecorder() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const message = params.get("message") ?? "";
  const orderId = params.get("orderId");
  const [back, setBack] = useState<{ path: string | null; concern: boolean }>({ path: null, concern: false });
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !orderId) return;
    started.current = true;
    recordPaymentFailureAction({ orderId, code, message }).then((r) => setBack({ path: r.resultPath, concern: r.concern }));
  }, [orderId, code, message]);

  const canceled = USER_CANCEL_CODES.includes(code);

  return (
    <div className="mt-4 space-y-5">
      <p className="text-[16px] leading-relaxed text-ink-2">
        {canceled ? "결제를 취소했습니다." : message || "결제를 완료하지 못했습니다."}
      </p>
      {!canceled && code && <p className="text-[13px] text-ink-3">오류 코드 {code}</p>}
      <p className="text-[14px] text-ink-3">결제가 완료되지 않았으므로 청구되지 않습니다.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        {back.path ? (
          <Link href={back.path} className={buttonPrimary}>
            {back.concern ? "고민 기록소로 돌아가기" : "다시 결제하기"}
          </Link>
        ) : (
          <Link href="/my" className={buttonPrimary}>
            MY로 가기
          </Link>
        )}
        <Link href="/" className={buttonSecondary}>
          처음으로
        </Link>
      </div>
    </div>
  );
}
