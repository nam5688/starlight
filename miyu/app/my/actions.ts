"use server";

import { redirect } from "next/navigation";
import { setMarketingConsent } from "@/lib/services/member-service";
import { setReportHidden } from "@/lib/services/my-service";
import { getMember } from "@/server/member";
import { writeRepository } from "@/server/services";

/** 새 상품·할인 소식 수신 동의 변경 (언제든 끌 수 있어야 한다) */
export async function setMarketingAction(agreed: boolean) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect("/my");
  await setMarketingConsent(writeRepository(), member.userId, agreed);
  redirect("/my");
}

/**
 * MY의 "내 리포트" 목록에서 이 리포트를 숨긴다 — 목록 표시만 바뀐다(결과 · 채팅 · 주문 · 구매 여부 · 열람 권한 · 질문권은 그대로, 회원 탈퇴가 아니다).
 * 로그인한 본인의 것만 바뀐다: 번호는 화면이 보낸 값이지만 소유자는 서버가 로그인 회원으로 다시 확인한다(남의 번호 · 없는 번호는 아무것도 바꾸지 않고 MY로 돌아간다).
 */
export async function hideReportAction(assessmentId: string) {
  await changeReportVisibility(assessmentId, true);
}

/** 숨긴 리포트를 목록에 다시 보이게 한다 (같은 확인 규칙) */
export async function restoreReportAction(assessmentId: string) {
  await changeReportVisibility(assessmentId, false);
}

async function changeReportVisibility(assessmentId: string, hidden: boolean): Promise<never> {
  const member = await getMember();
  if (!member || member.needsConsent) redirect("/my");
  if (typeof assessmentId === "string" && assessmentId.length > 0 && assessmentId.length <= 64) {
    await setReportHidden(writeRepository(), { userId: member.userId, assessmentId, hidden });
  }
  redirect("/my");
}
