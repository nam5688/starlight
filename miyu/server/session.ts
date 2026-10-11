import "server-only";
import { headers } from "next/headers";
import { isAuthConfigured } from "./env";
import { createServerSupabase } from "./supabase";

/** 로그인한 회원의 내부 회원번호. 세션은 Supabase가 검증한 값(getClaims)만 믿는다. */
export async function getSessionUserId(): Promise<string | null> {
  if (!isAuthConfigured()) return null;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return !error && typeof sub === "string" ? sub : null;
}

/** 서비스 주소. 운영에서는 SITE_URL을 설정한다 (로그인 후 돌아올 주소에 쓰임). */
export async function getSiteUrl(): Promise<string> {
  const configured = (process.env.SITE_URL ?? "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

/** 로그인 뒤 이동할 경로는 같은 사이트 안의 경로만 허용한다 */
export function safeNextPath(value: unknown, fallback = "/my"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}
