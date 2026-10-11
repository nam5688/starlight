import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "미유 · 개인 통합 분석 리포트",
  description: "사주 · MBTI · 기질 · 애착을 한 번에. 긴 서론 대신, 필요한 결론부터.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line">
          <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-5">
            <Link href="/" className="text-[17px] font-bold tracking-tight">
              미유
            </Link>
            <Link href="/result" className="text-sm text-sub hover:text-ink">
              샘플 리포트
            </Link>
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
