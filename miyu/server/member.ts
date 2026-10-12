import "server-only";
import { getMemberStatus, type MemberStatus } from "@/lib/services/member-service";
import { adminUserIds } from "./env";
import { readRepository } from "./services";
import { getSessionUserId, safeNextPath } from "./session";

export type Member = MemberStatus & { userId: string };

/** 로그인한 회원과 가입 동의 상태. 로그인하지 않았으면 null */
export async function getMember(): Promise<Member | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const status = await getMemberStatus(await readRepository(), userId);
  return { userId, ...status };
}

/** 가입 동의 화면 주소 (동의 후 next로 돌아온다) */
export function consentPath(next: string): string {
  return `/auth/consent?next=${encodeURIComponent(safeNextPath(next))}`;
}

/** 관리자 여부 — 서버 환경변수 ADMIN_USER_IDS에 회원번호가 있는 사람만. 화면 숨김이 아니라 서버에서 매번 확인한다 */
export async function getAdminMember(): Promise<Member | null> {
  const member = await getMember();
  if (!member || member.needsConsent) return null;
  return adminUserIds().includes(member.userId.toLowerCase()) ? member : null;
}
