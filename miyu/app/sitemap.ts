import type { MetadataRoute } from "next";
import { siteUrl } from "@/server/env";

// 로그인 없이 볼 수 있는 안내 화면만. 개인 결과 · 리포트 · MY · 결제 · 관리자는 넣지 않는다.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const pages: { path: string; priority: number }[] = [
    { path: "/", priority: 1 },
    { path: "/analyze", priority: 0.8 },
    { path: "/report/sample", priority: 0.8 },
    { path: "/terms", priority: 0.3 },
    { path: "/privacy", priority: 0.3 },
    { path: "/assessment-basis", priority: 0.3 },
  ];
  return pages.map((p) => ({ url: `${base}${p.path === "/" ? "" : p.path}`, priority: p.priority, changeFrequency: "monthly" as const }));
}
