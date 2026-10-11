import "server-only";
import { getSiteUrl } from "./session";
import { createServerSupabase } from "./supabase";

/** 카카오 로그인 주소 (Supabase Auth가 만들고, 인증 확인용 값은 쿠키에 남긴다) */
export async function kakaoAuthorizeUrl(next: string): Promise<string | null> {
  const supabase = await createServerSupabase();
  const site = await getSiteUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    },
  });
  return error || !data.url ? null : data.url;
}
