"use server";

import { redirect } from "next/navigation";
import { emailError, newPasswordError, normalizeEmail, type EmailFormState } from "@/lib/auth/email";
import { pathAfterLogin } from "@/server/auth-complete";
import { isAuthConfigured } from "@/server/env";
import { getSessionUserId, getSiteUrl, safeNextPath } from "@/server/session";
import { createServerSupabase } from "@/server/supabase";

// 이메일 로그인(자체 로그인) — Supabase Auth의 이메일 · 비밀번호 로그인을 쓴다. 비밀번호는 미유 서버 · DB · 로그에 남지 않는다(Supabase가 해시로만 보관).
// 오류 안내는 가입 여부를 알려 주지 않는 말로 쓴다(로그인 실패 · 비밀번호 재설정). 이 파일은 이메일 · 비밀번호 값을 어디에도 기록하지 않는다.

const tooMany = (e: { status?: number; code?: string } | null) => e?.status === 429 || Boolean(e?.code?.includes("rate_limit"));

/** 이메일로 로그인. 성공하면 카카오 로그인과 같은 규칙으로 이동한다(동의 · 보관한 검사 결과 저장) */
export async function signInWithEmail(_prev: EmailFormState, formData: FormData): Promise<EmailFormState> {
  if (!isAuthConfigured()) redirect("/auth/error?reason=not-configured");
  const next = safeNextPath(formData.get("next"));
  const email = normalizeEmail(formData.get("email"));
  const password = formData.get("password");
  const bad = emailError(email);
  if (bad) return { error: bad, email };
  if (typeof password !== "string" || password.length === 0 || password.length > 200) return { error: "비밀번호를 적어 주세요.", email };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (tooMany(error)) return { error: "시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.", email };
    if (error?.code === "email_not_confirmed") return { error: "메일 확인이 아직 끝나지 않았어요. 받은 메일의 링크를 눌러 주세요.", email };
    return { error: "이메일 또는 비밀번호가 맞지 않아요. 카카오로 가입했다면 카카오로 로그인해 주세요.", email };
  }
  redirect(await pathAfterLogin(data.user.id, next, "auth/email"));
}

/** 이메일로 가입. 확인 메일을 쓰는 설정이면 메일의 링크를 누른 뒤에 로그인되고, 쓰지 않는 설정(개발 환경)이면 바로 로그인된다 */
export async function signUpWithEmail(_prev: EmailFormState, formData: FormData): Promise<EmailFormState> {
  if (!isAuthConfigured()) redirect("/auth/error?reason=not-configured");
  const next = safeNextPath(formData.get("next"));
  const email = normalizeEmail(formData.get("email"));
  const password = formData.get("password");
  const bad = emailError(email) ?? newPasswordError(password, email);
  if (bad) return { error: bad, email };
  if (password !== formData.get("passwordConfirm")) return { error: "비밀번호가 서로 달라요.", email };

  const supabase = await createServerSupabase();
  const site = await getSiteUrl();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: password as string,
    options: { emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    if (tooMany(error)) return { error: "메일을 너무 자주 보냈어요. 잠시 뒤에 다시 해 주세요.", email };
    if (error.code === "weak_password") return { error: "더 길고 흔하지 않은 비밀번호를 써 주세요.", email };
    if (error.code === "user_already_exists") return { error: "이미 가입된 이메일이에요. 로그인해 주세요.", email };
    if (error.code === "email_address_invalid") return { error: "이메일 주소를 확인해 주세요.", email };
    return { error: "가입을 진행하지 못했어요. 잠시 뒤에 다시 해 주세요.", email };
  }
  if (data.session && data.user) redirect(await pathAfterLogin(data.user.id, next, "auth/email"));
  // 확인 메일을 쓰는 설정 — 이미 가입된 주소여도 같은 안내를 보인다(가입 여부를 알려 주지 않는다)
  return { notice: "확인 메일을 보냈어요. 메일의 링크를 이 브라우저에서 열면 가입이 끝나요. 메일이 안 보이면 스팸함도 확인해 주세요.", email };
}

/** 비밀번호 재설정 메일 보내기 — 가입된 주소인지와 상관없이 같은 안내를 보인다 */
export async function sendPasswordReset(_prev: EmailFormState, formData: FormData): Promise<EmailFormState> {
  if (!isAuthConfigured()) redirect("/auth/error?reason=not-configured");
  const email = normalizeEmail(formData.get("email"));
  const bad = emailError(email);
  if (bad) return { error: bad, email };
  const supabase = await createServerSupabase();
  const site = await getSiteUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${site}/auth/callback?next=${encodeURIComponent("/auth/reset")}` });
  if (error) return { error: tooMany(error) ? "메일을 너무 자주 요청했어요. 잠시 뒤에 다시 해 주세요." : "메일을 보내지 못했어요. 잠시 뒤에 다시 해 주세요.", email };
  return { notice: "가입된 이메일이라면 비밀번호를 바꾸는 링크를 보냈어요. 메일의 링크를 이 브라우저에서 열어 주세요.", email };
}

/** 새 비밀번호 저장 — 재설정 메일의 링크로 로그인한 상태(또는 로그인한 회원)에서만 */
export async function updatePassword(_prev: EmailFormState, formData: FormData): Promise<EmailFormState> {
  if (!isAuthConfigured()) redirect("/auth/error?reason=not-configured");
  if (!(await getSessionUserId())) redirect("/auth/email?mode=reset");
  const password = formData.get("password");
  const bad = newPasswordError(password);
  if (bad) return { error: bad };
  if (password !== formData.get("passwordConfirm")) return { error: "비밀번호가 서로 달라요." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password: password as string });
  if (error) {
    if (error.code === "same_password") return { error: "이전과 다른 비밀번호를 써 주세요." };
    if (error.code === "weak_password") return { error: "더 길고 흔하지 않은 비밀번호를 써 주세요." };
    return { error: "비밀번호를 바꾸지 못했어요. 잠시 뒤에 다시 해 주세요." };
  }
  redirect("/my");
}
