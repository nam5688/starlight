import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { VisitTracker } from "@/components/analytics/track";
import { PreviewNotice } from "@/components/site/preview-notice";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { siteUrl } from "@/server/env";
import { miyuFontVariables } from "./fonts/miyu-fonts";
import "./globals.css";

const TITLE = "ME:U 미유 · 개인 통합 분석 리포트";
const DESCRIPTION = "사주 · MBTI · 기질 · 애착을 함께 보는 개인 통합 분석 리포트. 무료 미리보기로 먼저 확인하고, 구매하면 저장된 같은 버전으로 다시 볼 수 있습니다.";

export const metadata: Metadata = {
  // 공유 주소 · 이미지의 기준 (배포 후에는 SITE_URL의 실제 주소)
  metadataBase: new URL(siteUrl()),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "ME:U 미유", locale: "ko_KR", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${miyuFontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col text-[16px] leading-relaxed">
        <a
          href="#main"
          data-site-chrome=""
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-canvas focus:px-4 focus:py-2 focus:shadow"
        >
          본문으로 건너뛰기
        </a>
        <PreviewNotice />
        <SiteHeader />
        <div id="main" className="flex flex-1 flex-col">
          {children}
        </div>
        <SiteFooter />
        <Suspense fallback={null}>
          <VisitTracker />
        </Suspense>
      </body>
    </html>
  );
}
