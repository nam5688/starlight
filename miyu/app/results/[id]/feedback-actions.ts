"use server";

import { getMember } from "@/server/member";
import { readRepository, writeRepository } from "@/server/services";

/** 구매한 리포트에 대한 만족도(1~5). 리포트의 주인만, 완성된 리포트에만 남길 수 있고 다시 누르면 고쳐진다 */
export async function submitFeedbackAction(reportId: string, rating: number): Promise<{ ok: boolean }> {
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || typeof reportId !== "string") return { ok: false };
  // 로그인한 사용자 권한(RLS)으로 본인의 완성된 리포트인지 확인한 뒤 서버 권한으로 기록한다
  const mine = await (await readRepository()).listReportStatuses(member.userId);
  if (!mine.some((r) => r.id === reportId && r.status === "ready")) return { ok: false };
  try {
    await writeRepository().upsertFeedback({ reportId, userId: member.userId, rating });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
