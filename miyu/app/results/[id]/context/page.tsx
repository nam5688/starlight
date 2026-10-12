import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { KakaoLoginForm } from "@/components/auth/kakao-login-button";
import { ContextForm } from "@/components/results/context-form";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { getContextView } from "@/lib/services/context-service";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { readRepository, reportGenerator } from "@/server/services";
import { PageFallback } from "@/components/ui/page-fallback";

export const metadata: Metadata = {
  title: "나를 더 반영하기 · ME:U 미유",
  robots: { index: false },
};

export default function ContextPage({ params, searchParams }: PageProps<"/results/[id]/context">) {
  return (
    <main className={`${pageNarrow} py-12 md:py-16`}>
      <Suspense fallback={<PageFallback />}>
        <ContextContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ContextContent({ params, searchParams }: Pick<PageProps<"/results/[id]/context">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  if (!isAuthConfigured()) notFound();
  const member = await getMember();
  if (!member) {
    return (
      <div>
        <h1 className="text-[24px] font-bold tracking-tight">로그인이 필요합니다</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">적은 내용은 본인만 볼 수 있습니다. 카카오로 로그인해 주세요.</p>
        <div className="mt-8">
          <KakaoLoginForm next={`/results/${id}/context`} />
        </div>
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath(`/results/${id}/context`));

  // 로그인한 사용자 권한으로 조회 — 다른 회원의 결과 · 적은 내용은 DB 접근 정책에서도 걸러진다
  const view = await getContextView(await readRepository(), { userId: member.userId, assessmentId: id });
  if (!view) notFound();
  const { context, reportStatus } = view;
  const usesContext = Boolean(reportGenerator().usesContext);
  const saved = query.saved === "1";
  const deleted = query.deleted === "1";
  const redacted = typeof query.redacted === "string" ? Number(query.redacted) : 0;

  return (
    <div>
      <p className="text-[14px] font-semibold text-accent">선택 단계</p>
      <h1 className="mt-2 text-[26px] font-bold tracking-tight md:text-[30px]">나를 더 반영하기</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        같은 사주라도 지금 고민에 따라 더 자세히 봐야 할 부분이 다릅니다. 결혼을 고민한다면 관계를 결정하는 과정을, 이직을 고민한다면
        선택과 불확실성에 반응하는 방식을 더 자세히 풉니다. 주제만 골라도 되고, 나머지는 적고 싶은 것만 적어 주세요.
      </p>

      <div className="mt-6 space-y-3" aria-live="polite">
        {saved && (
          <p role="status" className="rounded-lg bg-accent-soft px-4 py-3 text-[15px] text-accent">
            저장했습니다.{redacted > 0 && ` 연락처 · 이메일처럼 보이는 내용 ${redacted}곳을 가려서 저장했습니다.`}
          </p>
        )}
        {deleted && (
          <p role="status" className="rounded-lg bg-accent-soft px-4 py-3 text-[15px] text-accent">
            적은 내용을 지웠습니다.
          </p>
        )}
        {(reportStatus === "ready" || reportStatus === "generating") && (
          <p className="rounded-lg border border-line px-4 py-3 text-[15px] leading-relaxed text-ink-2">
            {reportStatus === "ready"
              ? "이미 만든 리포트에는 그때 반영한 해석이 그대로 남아 있습니다. 여기서 고치거나 지워도 이미 만든 리포트는 바뀌지 않습니다."
              : "지금 리포트를 만들고 있어, 여기서 고친 내용은 이번 리포트에 반영되지 않을 수 있습니다."}
          </p>
        )}
        {!usesContext && reportStatus !== "ready" && (
          <p className="rounded-lg border border-line px-4 py-3 text-[15px] leading-relaxed text-ink-2">
            지금은 AI 해석 연결 전이라, 개발용 리포트에는 적은 내용이 반영되지 않습니다.
          </p>
        )}
      </div>

      <div className="mt-10">
        <ContextForm
          assessmentId={id}
          initial={
            context
              ? {
                  topic: context.topic,
                  question: context.question,
                  situation: context.situation,
                  matched: context.matched,
                  differed: context.differed,
                  excerpt: context.excerpt,
                }
              : null
          }
        />
      </div>

      <p className="mt-10 text-[15px]">
        <Link href={`/results/${id}`} className={textLink}>
          결과 화면으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
