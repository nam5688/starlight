"use server";

import { redirect } from "next/navigation";
import { isAuthConfigured } from "@/server/env";
import { kakaoAuthorizeUrl } from "@/server/kakao";
import { safeNextPath } from "@/server/session";
import { createServerSupabase } from "@/server/supabase";

/** 카카오 로그인 시작. 로그인 뒤 next 경로로 돌아온다. */
export async function signInWithKakao(formData: FormData) {
  if (!isAuthConfigured()) redirect("/auth/error?reason=not-configured");
  const next = safeNextPath(formData.get("next"));
  const url = await kakaoAuthorizeUrl(next);
  redirect(url ?? "/auth/error?reason=start");
}

export async function signOut() {
  if (isAuthConfigured()) {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  }
  redirect("/");
}
