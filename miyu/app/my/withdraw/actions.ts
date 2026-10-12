"use server";

import { redirect } from "next/navigation";
import { WITHDRAWAL_CONFIRM_WORD } from "@/lib/membership/withdrawal";
import { withdrawMember } from "@/lib/services/member-service";
import { isAuthConfigured } from "@/server/env";
import { getMember } from "@/server/member";
import { logError, recordOps } from "@/server/ops";
import { writeRepository } from "@/server/services";
import { createAdminSupabase, createServerSupabase } from "@/server/supabase";

/**
 * 회원 탈퇴. 순서가 중요하다:
 * ① DB의 개인정보를 삭제하고 거래 기록만 분리해 남긴다 (여러 번 불러도 같은 결과)
 * ② 로그인 연결(카카오 식별 정보)을 Supabase Auth의 탈퇴 처리로 지운다
 * ②가 실패하면 ①은 이미 끝났으므로 같은 화면에서 다시 시도하면 된다.
 */
export async function withdrawAction(formData: FormData) {
  const member = await getMember();
  if (!member) redirect("/my");
  if (formData.get("agree") !== "on" || String(formData.get("confirm") ?? "").trim() !== WITHDRAWAL_CONFIRM_WORD) {
    redirect("/my/withdraw?error=confirm");
  }

  let result;
  try {
    result = await withdrawMember(writeRepository(), member.userId);
  } catch (e) {
    logError("withdraw.data", e);
    redirect("/my/withdraw?error=failed");
  }
  if (result.kind === "blocked") redirect(`/my/withdraw?error=${result.reason}`);
  if (result.kind === "not-found") redirect("/my");

  if (isAuthConfigured()) {
    try {
      // 두 번째 인자 true = 탈퇴 처리(계정 행은 남기되 카카오 식별 정보 · 이메일 · 프로필 정보를 지움). 주문 기록의 회원 연결을 끊지 않기 위함
      const { error } = await createAdminSupabase().auth.admin.deleteUser(member.userId, true);
      if (error) throw error;
    } catch (e) {
      logError("withdraw.auth", e);
      redirect("/my/withdraw?error=auth");
    }
    try {
      await (await createServerSupabase()).auth.signOut();
    } catch {
      // 계정이 이미 지워져 세션이 무효이므로 로그아웃 오류는 무시한다
    }
  }

  await recordOps({
    kind: "member.withdrawn",
    severity: "info",
    message: `회원 탈퇴 처리: 리포트 ${result.counts.reports ?? 0}건 · 검사 ${result.counts.assessments_deleted ?? 0}건 삭제, 주문에 연결된 검사 ${result.counts.assessments_emptied ?? 0}건 비움`,
  });
  redirect("/withdrawn");
}
