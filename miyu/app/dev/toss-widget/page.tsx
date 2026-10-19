import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TossWidgetPreview } from "@/components/dev/toss-widget-preview";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow } from "@/components/ui/styles";

export const metadata: Metadata = { title: "결제 화면 준비 과정 확인 · ME:U 미유", robots: { index: false } };

/** 개발용 — 내 컴퓨터에서만 열린다(공개 배포에서는 열리지 않는다). 실제 결제 · 토스 서버와 통신하지 않는다 */
export default function DevTossWidgetPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className={`${pageNarrow} py-10 md:py-14`}>
      <StatusBadge>개발용 · 내 컴퓨터에서만 열림</StatusBadge>
      <h1 className="mt-3 text-[24px] leading-snug font-bold tracking-tight">결제 화면 준비 과정 확인</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
        가상 SDK로 결제수단 · 약관 화면이 준비되는 과정과 막혔을 때의 보고 · 다시 불러오기를 확인하는 화면이에요. 아무것도 결제하거나 저장하지 않아요.
      </p>
      <div className="mt-6">
        <TossWidgetPreview />
      </div>
    </main>
  );
}
