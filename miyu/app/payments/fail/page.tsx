import type { Metadata } from "next";
import { Suspense } from "react";
import { FailRecorder } from "@/components/payments/fail-recorder";
import { pageNarrow } from "@/components/ui/styles";

export const metadata: Metadata = { title: "결제 안내 · ME:U 미유", robots: { index: false } };

export default function PaymentFailPage() {
  return (
    <main className={`${pageNarrow} py-14 md:py-20`}>
      <h1 className="text-[24px] font-bold tracking-tight">결제가 완료되지 않았어요</h1>
      <Suspense fallback={null}>
        <FailRecorder />
      </Suspense>
    </main>
  );
}
