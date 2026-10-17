// Vercel 미리보기(Preview) 배포 보호 — 주소를 아는 누구나 열 수 있는 공유 링크로 미리보기를 보여 줄 때, 운영 DB · 실결제 · 유료 AI에 닿지 않게 하는 안전망.
// 환경변수 범위(All Environments)를 잘못 잡아 운영 키가 미리보기에도 들어와도 기본은 모두 막는다(막는 쪽이 기본, 여는 쪽이 예외).
//  - VERCEL_ENV=preview(Vercel이 넣어 주는 값)일 때만 켜진다. 정식 배포(production) · 내 PC(값 없음)에서는 아무것도 바꾸지 않는다.
//  - DB(Supabase): 값이 있어도 무시한다 → 로그인 · 저장 · 결제 · 관리자 화면이 열리지 않는다. 시험용 별도 DB를 일부러 연결할 때만 PREVIEW_ALLOW_DATABASE=yes
//  - 실결제(PAYMENTS_LIVE_MODE=true) · 실제 AI(anthropic)는 예외 없이 막는다
// 코드에서 이 값을 읽는 곳은 server/env.ts · proxy.ts 두 곳뿐이다.

export type PreviewGuard = {
  /** 미리보기 배포인가 */
  active: boolean;
  /** Supabase 값을 무시해야 하는가 (미리보기이면서 PREVIEW_ALLOW_DATABASE=yes가 아닐 때) */
  blocksDatabase: boolean;
};

export const PREVIEW_BLOCK_REASON = {
  payment: "미리보기 배포에서는 실결제를 쓸 수 없어요",
  ai: "미리보기 배포에서는 실제 AI를 쓰지 않아요",
} as const;

export function previewGuardOf(env: Readonly<Record<string, string | undefined>>): PreviewGuard {
  const active = (env.VERCEL_ENV ?? "").trim() === "preview";
  const allowDatabase = (env.PREVIEW_ALLOW_DATABASE ?? "").trim() === "yes";
  return { active, blocksDatabase: active && !allowDatabase };
}
