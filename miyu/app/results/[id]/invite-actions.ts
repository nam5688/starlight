"use server";

import { createInviteLink } from "@/lib/services/invite-service";
import { getMember } from "@/server/member";
import { logError } from "@/server/ops";
import { writeRepository } from "@/server/services";

export type InviteActionResult = { ok: true } | { ok: false; message: string };

/**
 * 초대 링크 만들기 — 심층 리포트를 받은 결과의 주인만(서비스가 확인한다). 이미 있으면 같은 링크를 쓴다.
 * 브라우저가 보내는 것은 결과 번호뿐이고, 링크(토큰)는 서버가 만든다.
 */
export async function createInviteLinkAction(input: { assessmentId: unknown }): Promise<InviteActionResult> {
  if (typeof input?.assessmentId !== "string") return { ok: false, message: "이 결과를 찾지 못했어요. 화면을 새로 열어 주세요." };
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false, message: "로그인이 필요해요." };
  try {
    const r = await createInviteLink(writeRepository(), { userId: member.userId, assessmentId: input.assessmentId });
    if (r.ok) return { ok: true };
    if (r.reason === "not-paid") return { ok: false, message: "심층 리포트를 받은 뒤에 초대 링크를 만들 수 있어요." };
    if (r.reason === "not-ready") return { ok: false, message: "초대 링크는 아직 준비 중이에요." };
    return { ok: false, message: "이 결과를 찾지 못했어요. 화면을 새로 열어 주세요." };
  } catch (e) {
    logError("invite.create", e);
    return { ok: false, message: "이번에는 링크를 만들지 못했어요. 잠시 뒤에 다시 눌러 주세요." };
  }
}
