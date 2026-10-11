"use client";

import { loadTossPayments, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk";
import { useEffect, useRef, useState } from "react";
import { buttonPrimary } from "@/components/ui/styles";
import { formatKrw } from "@/lib/config/product";

/**
 * 토스페이먼츠 주문서형 결제 화면.
 * 보여줄 결제수단(카드 기본, 간편결제 추가 등)은 토스페이먼츠 상점관리자의 결제 UI 설정에서 정한다.
 * 금액·주문번호는 서버가 만든 값을 그대로 쓰고, 승인은 서버에서 다시 확인한다.
 */
export function TossCheckout({
  clientKey,
  customerKey,
  orderId,
  orderName,
  amount,
}: {
  clientKey: string;
  customerKey: string;
  orderId: string;
  orderName: string;
  amount: number;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "requesting" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return; // 개발 모드의 이중 실행·화면 재표시 때 다시 그리지 않는다
    startedRef.current = true;
    (async () => {
      try {
        const toss = await loadTossPayments(clientKey);
        const widgets = toss.widgets({ customerKey });
        await widgets.setAmount({ currency: "KRW", value: amount });
        await Promise.all([
          widgets.renderPaymentMethods({ selector: "#toss-payment-methods", variantKey: "DEFAULT" }),
          widgets.renderAgreement({ selector: "#toss-agreement", variantKey: "AGREEMENT" }),
        ]);
        widgetsRef.current = widgets;
        setStatus("ready");
      } catch {
        setStatus("error");
        setMessage("결제 화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    })();
  }, [clientKey, customerKey, amount]);

  async function pay() {
    const widgets = widgetsRef.current;
    if (!widgets) return;
    setStatus("requesting");
    setMessage(null);
    try {
      await widgets.requestPayment({
        orderId,
        orderName,
        successUrl: `${window.location.origin}/payments/success`,
        failUrl: `${window.location.origin}/payments/fail`,
      });
    } catch (error) {
      // 약관 미동의, 결제창 닫기 등 — 다시 시도할 수 있게 둔다
      setStatus("ready");
      setMessage(error instanceof Error && error.message ? error.message : "결제를 진행하지 못했습니다.");
    }
  }

  return (
    <div>
      <div id="toss-payment-methods" />
      <div id="toss-agreement" />
      {status === "loading" && <p className="py-6 text-[15px] text-ink-2">결제 수단을 불러오고 있어요.</p>}
      {message && (
        <p role="alert" className="mt-3 text-[15px] font-medium text-danger">
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={pay}
        disabled={status !== "ready"}
        aria-busy={status === "requesting"}
        className={`${buttonPrimary} mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {status === "requesting" ? "결제 진행 중…" : `${formatKrw(amount)} 결제하기`}
      </button>
    </div>
  );
}
