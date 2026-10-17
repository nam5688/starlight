import "server-only";
import { cookies } from "next/headers";
import { ANON_COOKIE } from "./acquisition";
import { peekInviteToken } from "./invite";
import { logError } from "./ops";
import { benefitRepository } from "./services";

/**
 * 추천 링크로 가입한 회원을 추천 가입으로 등록하고(보상은 아직 주지 않는다), 이미 분석을 마쳤다면 확정 조건을 확인한다.
 * - 링크의 무작위 토큰은 초대 링크 쿠키(miyu_invite)에서 읽는다. 쿠키에 담긴 것이 예전 초대 링크(invites 표)면 여기서는 아무 일도 하지 않는다(예전 할인은 그대로).
 * - 신규 회원 여부 · 자기 초대 · 같은 기기 반복 같은 판단은 모두 DB 함수가 한다. 여기서는 부르기만 한다.
 * - 어떤 오류도 로그인 · 저장 · 결제를 막지 않는다(혜택 표가 아직 없는 DB에서도 조용히 건너뛴다). 오류는 가린 형태로만 기록한다.
 */
export async function registerReferralSignup(userId: string): Promise<void> {
  try {
    const token = await peekInviteToken();
    if (!token) return;
    const benefits = benefitRepository();
    if (!(await benefits.getReferralLinkOwner(token))) return;
    const anon = (await cookies()).get(ANON_COOKIE)?.value ?? null;
    await benefits.registerReferralSignup({ token, inviteeUserId: userId, anonId: anon });
  } catch (e) {
    if ((e as { code?: string } | null)?.code !== "42P01") logError("referral.register", e);
  }
}

/** 친구가 무료 분석을 마쳤을 때 확정 조건(계정 확인 · 무료 분석 1건 · 확인 기간 · 위험 신호)을 한 번 확인한다. 아직 조건이 안 됐으면 정기 점검이 이어서 확인한다 */
export async function evaluateReferralSignup(userId: string): Promise<void> {
  try {
    await benefitRepository().evaluateReferralSignup(userId);
  } catch (e) {
    if ((e as { code?: string } | null)?.code !== "42P01") logError("referral.evaluate", e);
  }
}

/** 링크를 연 기기를 구분하는 익명 번호(쿠키)가 없으면 만든다 — 같은 기기에서 여러 번 가입하는 반복을 가리는 데만 쓴다. Route Handler · Server Action에서만 부른다 */
export async function ensureAnonId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(ANON_COOKIE)?.value ?? "";
  if (/^[0-9a-f-]{36}$/.test(existing)) return existing;
  const anonId = crypto.randomUUID();
  jar.set(ANON_COOKIE, anonId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 365 * 24 * 3600 });
  return anonId;
}

/** 추천 링크 방문을 기록한다(토큰 · 익명 번호 · 시각뿐, 이름 · 생년월일 없음). 실패해도 링크 이동을 막지 않는다 */
export async function logReferralVisit(token: string): Promise<void> {
  try {
    const anonId = await ensureAnonId();
    await benefitRepository().logReferralVisit({ token, anonId });
  } catch (e) {
    if ((e as { code?: string } | null)?.code !== "42P01") logError("referral.visit", e);
  }
}
