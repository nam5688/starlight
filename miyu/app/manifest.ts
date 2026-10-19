import type { MetadataRoute } from "next";

// 홈 화면에 추가했을 때 앱처럼 여는 설정(웹 앱 매니페스트). 서비스 워커는 만들지 않았다 — 오프라인 저장(캐시)을 하지 않으므로
// 개인 결과 · 결제 · 권한 응답은 지금의 저장 금지(no-store) 규칙 그대로이고, 홈 화면 실행만을 위해 넓은 캐시를 두지 않는다.
// - start_url · scope: 같은 사이트 전체("/"). 로그인(/auth) · 카카오 · 토스 결제를 다녀오는 주소도 같은 사이트 안이다.
// - orientation은 적지 않는다: 접이식(폴더블) 기기 · 분할 화면 · 가로 사용에서 방향을 고정하지 않는다.
// - 아이콘은 기존 브랜드 자산(미유 캐릭터)에서 만든 것이다(scripts/make-app-icons.py). 원본이 100px이라 512px은 확대본이다.
// - 색: 바탕은 페이지 바탕(#f7f5f1), 위쪽 줄은 머리글 바탕(#ffffff, layout의 viewport.themeColor와 같다).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ME:U 미유",
    short_name: "ME:U 미유",
    description: "사주 · MBTI · 기질 · 애착을 함께 보는 개인 통합 분석 리포트",
    lang: "ko",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f5f1",
    theme_color: "#ffffff",
    icons: [
      { src: "/miyu/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/miyu/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/miyu/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
