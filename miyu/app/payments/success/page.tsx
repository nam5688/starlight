import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmRunner } from "@/components/payments/confirm-runner";
import { pageNarrow } from "@/components/ui/styles";

export const metadata: Metadata = { title: "결제 확인 · ME:U 미유", robots: { index: false } };

export default function PaymentSuccessPage() {
  return (
    <main className={`${pageNarrow} py-14 md:py-20`}>
      <h1 className="text-[24px] font-bold tracking-tight">결제 확인</h1>
      <Suspense fallback={<p className="mt-4 text-[16px] text-ink-2">결제를 확인하고 있어요.</p>}>
        <ConfirmRunner />
      </Suspense>
    </main>
  );
}
