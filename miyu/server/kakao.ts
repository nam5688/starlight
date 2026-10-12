import "server-only";
import { kakaoOAuthOptions } from "./kakao-options";
import { getSiteUrl } from "./session";
import { createServerSupabase } from "./supabase";

export async function kakaoAuthorizeUrl(next: string): Promise<string | null> {
  const supabase = await createServerSupabase();
  const site = await getSiteUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    // 이메일 없이 닉네임 · 프로필 사진만 요청한다 (이유는 kakao-options.ts)
    options: kakaoOAuthOptions(site, next),
  });
  return error || !data.url ? null : data.url;
}
