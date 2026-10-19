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
const DESCRIPTION = "사주 · MBTI · 기질 · 애착을 함께 보는 개인 통합 분석 리포트. 무료 미리보기로 먼저 확인하고, 구매하면 저장된 같은 버전으로 다시 볼 수 있어요.";

export const metadata: Metadata = {
  // 공유 주소 · 이미지의 기준 (배포 후에는 SITE_URL의 실제 주소)
  metadataBase: new URL(siteUrl()),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "ME:U 미유", locale: "ko_KR", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  // 홈 화면에 추가했을 때 앱처럼 열린다(아이콘 · 매니페스트는 app/apple-icon.png · app/manifest.ts). 상태 표시줄은 기본 모양을 쓴다.
  appleWebApp: { capable: true, title: "ME:U 미유", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

// viewportFit(cover)은 켜지 않았다: 켜면 화면 전체가 노치 · 홈 막대 밑까지 그려져서 모든 화면에 안전 영역 여백이 따로 필요하다.
// 켜지 않으면 iOS · Android가 알아서 안전 영역 안에 그려 주므로 지금의 화면 배치가 그대로다(env(safe-area-inset-*)를 쓰는 곳은 켜도 되도록 이미 준비돼 있다).
// 확대 · 글자 크기를 막지 않는다(maximumScale · userScalable 없음).
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
