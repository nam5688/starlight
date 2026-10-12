// 카카오 로그인 요청 옵션 (Next.js에 의존하지 않음 — 회귀 테스트에서 직접 불러온다)
//
// 미유는 카카오 이메일을 받지 않는다 (비즈 앱 아님, account_email 권한 없음).
// - 기본 signInWithOAuth는 Supabase가 account_email을 함께 요청해 카카오가 KOE205 오류를 낸다.
// - options.scopes는 기본 요청에 "추가"만 되므로 account_email이 그대로 남는다.
// - queryParams.scope는 카카오로 가는 scope 값을 "대체"한다 → 닉네임 · 프로필 사진만 요청.
// 운영자가 실제 카카오 로그인 · 재로그인으로 확인한 방식이다 (2026-10-12). 바꾸지 말 것.

export const KAKAO_SCOPE = "profile_nickname profile_image";

export function kakaoOAuthOptions(site: string, next: string) {
  return {
    queryParams: {
      scope: KAKAO_SCOPE,
    },
    redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}`,
    skipBrowserRedirect: true,
  };
}
