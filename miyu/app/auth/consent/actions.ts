"use server";

import { redirect } from "next/navigation";
import type { ConsentType } from "@/lib/membership/terms";
import { submitAssessment } from "@/lib/services/assessment-service";
import { agreeToTerms, canRemoveOnDecline } from "@/lib/services/member-service";
import { clearPendingSubmission, readPendingSubmission } from "@/server/pending-submission";
import { sajuEngine, writeRepository } from "@/server/services";
import { getSessionUserId, safeNextPath } from "@/server/session";
import { createAdminSupabase, createServerSupabase } from "@/server/supabase";

export type ConsentFormState = { message: string | null };

/** 가입 동의 → 보관한 검사 결과가 있으면 저장 → 결과 화면 (없으면 next) */
export async function agreeTermsAction(_prev: ConsentFormState, formData: FormData): Promise<ConsentFormState> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/my");

  const choices: Partial<Record<ConsentType, boolean>> = {
    age_14: formData.get("age_14") === "on",
    terms: formData.get("terms") === "on",
    privacy: formData.get("privacy") === "on",
    marketing: formData.get("marketing") === "on",
  };
  const repo = writeRepository();
  const result = await agreeToTerms(repo, userId, choices);
  if (!result.ok) return { message: result.message };

  const pending = await readPendingSubmission();
  if (pending) {
    await clearPendingSubmission();
    const saved = await submitAssessment(
      { repo, saju: sajuEngine },
      { userId, channel: "web", info: pending.info, answers: pending.answers, today: new Date() },
    );
    if (!saved.ok) redirect("/auth/error?reason=save");
    redirect(`/results/${saved.assessment.id}`);
  }
  redirect(safeNextPath(formData.get("next")));
}

/**
 * 동의하지 않음.
 * - 저장한 검사·주문이 없는 신규 계정: 계정과 보관 중인 검사 결과를 지우고 로그아웃
 * - 기존 회원(약관 변경으로 재동의 필요): 데이터는 그대로 두고 로그아웃
 */
export async function declineTermsAction() {
  const userId = await getSessionUserId();
  await clearPendingSubmission();
  if (!userId) redirect("/");

  const removable = await canRemoveOnDecline(writeRepository(), userId);
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  if (removable) {
    await createAdminSupabase().auth.admin.deleteUser(userId);
    redirect("/auth/declined?account=removed");
  }
  redirect("/auth/declined?account=kept");
}
