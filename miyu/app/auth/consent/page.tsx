import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ConsentForm } from "@/components/membership/consent-form";
import { pageNarrow } from "@/components/ui/styles";
import { getMember } from "@/server/member";
import { readPendingSubmission } from "@/server/pending-submission";
import { safeNextPath } from "@/server/session";

export const metadata: Metadata = { title: "가입 동의 · ME:U 미유", robots: { index: false } };

export default function ConsentPage({ searchParams }: PageProps<"/auth/consent">) {
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <Suspense fallback={<p className="text-[16px] text-ink-2">잠시만 기다려 주세요.</p>}>
        <ConsentContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ConsentContent({ searchParams }: Pick<PageProps<"/auth/consent">, "searchParams">) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  const member = await getMember();
  if (!member) redirect("/my");
  if (!member.needsConsent) redirect(next);
  const pending = await readPendingSubmission();

  return (
    <>
      <h1 className="text-[26px] font-bold tracking-tight md:text-[30px]">
        {member.isNew ? "미유 가입을 위해 동의해 주세요" : "약관이 바뀌어 다시 동의가 필요해요"}
      </h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        카카오 계정으로 가입합니다. 회원은 카카오 이메일이 아니라 미유 내부 회원번호로 구분하며, 검사 결과와 구매한 리포트는
        이 회원번호에 저장됩니다.
      </p>
      {pending && (
        <p className="mt-4 rounded-md bg-accent-soft px-4 py-3 text-[15px] leading-relaxed text-ink">
          로그인 전에 마친 <strong>{pending.info.nickname}</strong> 님의 검사 결과는 동의하면 바로 저장됩니다.
        </p>
      )}
      <ConsentForm next={next} />
      <p className="mt-6 text-[13px] leading-relaxed text-ink-3">
        동의하지 않으면 가입되지 않으며, 방금 만든 계정과 보관 중인 검사 결과는 삭제됩니다. 기존 회원은 로그아웃되고 저장된
        결과는 그대로 유지됩니다.
      </p>
    </>
  );
}
