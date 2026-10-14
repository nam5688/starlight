import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmailForm } from "@/components/auth/email-form";
import { pageNarrow } from "@/components/ui/styles";
import { isAuthConfigured } from "@/server/env";
import { getSessionUserId } from "@/server/session";

export const metadata: Metadata = { title: "새 비밀번호 · ME:U 미유", robots: { index: false } };

/** 비밀번호 재설정 메일의 링크(/auth/callback?next=/auth/reset)로 로그인한 뒤 새 비밀번호를 정하는 화면 */
export default function ResetPasswordPage() {
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <Suspense fallback={<p className="text-[16px] text-ink-2">잠시만 기다려 주세요.</p>}>
        <ResetContent />
      </Suspense>
    </main>
  );
}

async function ResetContent() {
  await connection(); // 설정 · 로그인 확인은 빌드가 아니라 요청 때 실행한다
  if (!isAuthConfigured()) redirect("/auth/error?reason=not-configured");
  // 메일의 링크로 들어오지 않았거나 링크가 만료됐으면 다시 요청하게 한다
  if (!(await getSessionUserId())) redirect("/auth/email?mode=reset");
  return (
    <>
      <h1 className="text-[24px] font-bold tracking-tight md:text-[28px]">새 비밀번호 정하기</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-2">앞으로 이메일 로그인에 쓸 새 비밀번호를 적어 주세요.</p>
      <EmailForm mode="new-password" next="/my" />
    </>
  );
}
