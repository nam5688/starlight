import "server-only";
import { getMemberStatus, type MemberStatus } from "@/lib/services/member-service";
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
