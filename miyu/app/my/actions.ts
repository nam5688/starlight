"use server";

import { redirect } from "next/navigation";
import { setMarketingConsent } from "@/lib/services/member-service";
import { deleteReportRecord, type DeleteRecordResult } from "@/lib/services/my-service";
import { getMember } from "@/server/member";
import { writeRepository } from "@/server/services";
import { transcriptRenderer } from "@/server/talk-transcript";

/** 새 상품·할인 소식 수신 동의 변경 (언제든 끌 수 있어야 한다) */
export async function setMarketingAction(agreed: boolean) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect("/my");
  await setMarketingConsent(writeRepository(), member.userId, agreed);
  redirect("/my");
}

/**
 * MY의 "내 리포트" 카드에서 사용자가 직접 누른 "기록 삭제" — 이 검사 결과의 리포트 본문 · 맛보기 글 · 고민 입력을 되돌릴 수 없게 지운다.
 * 로그인한 본인의 것만 지워진다: 번호는 화면이 보낸 값이지만 소유자는 서버가 로그인 회원으로 다시 확인한다(남의 번호 · 없는 번호는 아무것도 지우지 않는다).
 * 계정 · 주문 · 결제 · 환불 기록 · 질문권 · 채팅은 그대로 남고, 채팅방의 지난 대화는 읽기용 기록으로 옮겨 남긴다. 같은 요청을 여러 번 보내도 한 번만 지운다.
 * (Server Action이라 같은 출처의 요청만 받는다 — Next가 Origin/Host를 확인한다.)
 */
export async function deleteReportRecordAction(assessmentId: string) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect("/my");
  let notice: DeleteRecordResult["kind"] = "not-found";
  if (typeof assessmentId === "string" && assessmentId.length > 0 && assessmentId.length <= 64) {
    const result = await deleteReportRecord(writeRepository(), { userId: member.userId, assessmentId }, { renderRoom: transcriptRenderer({ userId: member.userId, assessmentId }) });
    notice = result.kind;
  }
  redirect(`/my?notice=${notice}#my-list`);
}
