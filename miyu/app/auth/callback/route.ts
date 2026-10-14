import { NextResponse, type NextRequest } from "next/server";
import { pathAfterLogin } from "@/server/auth-complete";
import { isAuthConfigured } from "@/server/env";
import { getSiteUrl, safeNextPath } from "@/server/session";
import { createServerSupabase } from "@/server/supabase";

/**
 * 카카오 로그인 · 이메일 확인 메일 · 비밀번호 재설정 메일의 링크가 돌아오는 미유 사이트의 로그인 완료 주소 (/auth/callback).
 * Supabase 대시보드의 Redirect URLs에 등록하는 주소가 이것이다.
 * (카카오 디벨로퍼스에는 Supabase의 callback 주소를 등록한다 — 다른 주소)
 *
 * 1) 인증 코드를 세션으로 바꾼다
 * 2) 신규 회원이거나 약관이 바뀌었으면 가입 동의 화면으로 보낸다 (보관한 검사 결과는 동의 후 저장)
 * 3) 로그인 전에 보관한 검사 결과가 있으면 이 회원번호로 저장하고 결과 화면으로 보낸다 (server/auth-complete.ts)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // 서버 내부 주소(localhost 등)가 아니라 서비스 주소로 돌려보낸다 — 쿠키가 같은 주소에 남아야 한다
  const site = await getSiteUrl();
  const to = (path: string) => NextResponse.redirect(new URL(path, site));

  if (!isAuthConfigured()) return to("/auth/error?reason=not-configured");
  if (searchParams.get("error")) return to("/auth/error?reason=denied");

  const code = searchParams.get("code");
  if (!code) return to("/auth/error?reason=missing-code");

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return to("/auth/error?reason=exchange");

  const next = safeNextPath(searchParams.get("next"));
  return to(await pathAfterLogin(data.user.id, next, "auth/callback"));
}
