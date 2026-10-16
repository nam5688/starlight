import "server-only";
import { cookies } from "next/headers";
import { isInviteToken } from "@/lib/commerce/invite";

/**
 * 초대 링크로 들어온 사람의 링크 기억 — 무료 분석 · 로그인을 거쳐 결과 화면에서 초대 가격을 보여 주기 위한 쿠키.
 * 링크의 무작위 토큰만 담는다(이름 · 생년월일 · 회원번호 없음). 30일 뒤 사라지고, 쿠키를 거부한 브라우저에서는 정가로 이어진다.
 * 이 쿠키만으로는 할인이 되지 않는다 — 대상 확인 · 한도는 결제를 시작할 때 서버(DB)가 한다.
 */
export const INVITE_COOKIE = "miyu_invite";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function peekInviteToken(): Promise<string | null> {
  const v = (await cookies()).get(INVITE_COOKIE)?.value;
  return isInviteToken(v) ? v : null;
}

/** 링크를 기억한다 (Route Handler · Server Action에서만) */
export async function rememberInviteToken(token: string): Promise<void> {
  (await cookies()).set(INVITE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE_SECONDS });
}
