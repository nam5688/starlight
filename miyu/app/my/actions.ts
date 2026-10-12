"use server";

import { redirect } from "next/navigation";
import { setMarketingConsent } from "@/lib/services/member-service";
import { getMember } from "@/server/member";
import { writeRepository } from "@/server/services";

/** 새 상품·할인 소식 수신 동의 변경 (언제든 끌 수 있어야 한다) */
export async function setMarketingAction(agreed: boolean) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect("/my");
  await setMarketingConsent(writeRepository(), member.userId, agreed);
  redirect("/my");
}
