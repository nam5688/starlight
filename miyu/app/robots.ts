import type { MetadataRoute } from "next";
import { siteUrl } from "@/server/env";

// 공개 안내 화면만 검색에 열어 둔다. 개인 결과 · 결제 · MY · 관리자 · 설정은 제외한다 (제외는 비공개가 아니다 — 접근 통제는 서버가 따로 한다).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/"], disallow: ["/results", "/my", "/checkout", "/payments", "/admin", "/auth", "/setup", "/api"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
