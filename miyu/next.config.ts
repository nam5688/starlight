import type { NextConfig } from "next";

// 개인 결과 · 결제 · 관리자 화면은 어디에도 저장(캐시)되지 않고 검색에 노출되지 않게 한다.
// 검색 제외(noindex)는 "비공개"가 아니다 — 접근 통제는 서버의 로그인 확인과 DB 접근 정책이 따로 한다.
const PRIVATE_HEADERS = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];
// /pair(리포트 궁합) · /compat/report(사주 궁합 결과)도 로그인한 회원의 결과 화면이다 — 2026-10-19 QA에서 프레임워크 기본값에만 기대고 있던 것을 명시했다(/compat 자체는 입력을 저장하지 않는 공개 화면이라 제외)
const PRIVATE_PATHS = ["/results", "/my", "/checkout", "/payments", "/admin", "/auth", "/setup", "/dev", "/api", "/invite", "/pair", "/compat/report"];

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      ...PRIVATE_PATHS.flatMap((p) => [
        { source: p, headers: PRIVATE_HEADERS },
        { source: `${p}/:path*`, headers: PRIVATE_HEADERS },
      ]),
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
