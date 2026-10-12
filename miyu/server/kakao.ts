import "server-only";
import { getSiteUrl } from "./session";
import { createServerSupabase } from "./supabase";

export async function kakaoAuthorizeUrl(next: string): Promise<string | null> {
  const supabase = await createServerSupabase();
  const site = await getSiteUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      queryParams: {
        scope: "profile_nickname profile_image",
      },
      redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    },
  });
  return error || !data.url ? null : data.url;
}
