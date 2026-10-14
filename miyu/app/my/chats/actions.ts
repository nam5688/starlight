"use server";

import { redirect } from "next/navigation";
import { ROOMS } from "@/lib/report/reading/talk-room";
import { deleteAllSummaries, deleteSavedSummary } from "@/lib/services/summary-service";
import { getMember } from "@/server/member";
import { logError } from "@/server/ops";
import { writeRepository } from "@/server/services";

/** 저장한 채팅 요약 하나 지우기 — 내 요약만(서비스가 회원 번호로 한정한다). 지운 뒤 그 방의 목록으로 돌아간다 */
export async function deleteChatSummaryAction(room: string, id: string) {
  const back = room in ROOMS ? `/my/chats/${room}` : "/my/chats";
  const member = await getMember();
  if (!member || member.needsConsent) redirect("/my");
  try {
    await deleteSavedSummary(writeRepository(), member.userId, id);
  } catch (e) {
    logError("my.chats.delete", e);
    redirect(`${back}?error=1`);
  }
  redirect(`${back}?done=one`);
}

/** "이전 대화 기록 모두 지우기" — 저장한 요약과 저장하지 않고 끝낸 대화의 참고 기록을 모두 지운다 */
export async function deleteAllChatSummariesAction() {
  const member = await getMember();
  if (!member || member.needsConsent) redirect("/my");
  try {
    await deleteAllSummaries(writeRepository(), member.userId);
  } catch (e) {
    logError("my.chats.deleteAll", e);
    redirect("/my/chats?error=1");
  }
  redirect("/my/chats?done=all");
}
