import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { KakaoLoginForm } from "@/components/auth/kakao-login-button";
import { TalkView } from "@/components/talk/talk-view";
import { PageFallback } from "@/components/ui/page-fallback";
import { pageNarrow } from "@/components/ui/styles";
import { isReadingReport } from "@/lib/report/generator";
import { buildTalkModel } from "@/lib/report/reading/talk";
import { getResultView } from "@/lib/services/report-service";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { readRepository } from "@/server/services";

export const metadata: Metadata = {
  title: "대화로 풀어보기 · ME:U 미유",
  robots: { index: false },
};

export default function TalkPage({ params }: PageProps<"/results/[id]/talk">) {
  return (
    <main className="bg-page">
      <Suspense fallback={<PageFallback text="리포트를 불러오고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <TalkContent params={params} />
      </Suspense>
    </main>
  );
}

/** 구매해 준비된 개인 통합 리포트(읽기 구조)만 대화로 풀어 볼 수 있다 — 저장된 글을 나눠서 보여 줄 뿐 AI를 부르지 않는다 */
async function TalkContent({ params }: Pick<PageProps<"/results/[id]/talk">, "params">) {
  const { id } = await params;
  if (!isAuthConfigured()) notFound();
  const member = await getMember();
  if (!member) {
    return (
      <div className={`${pageNarrow} py-14 md:py-20`}>
        <h1 className="text-[24px] font-bold tracking-tight">로그인이 필요합니다</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">저장된 결과는 본인만 볼 수 있습니다. 카카오로 로그인해 주세요.</p>
        <div className="mt-8">
          <KakaoLoginForm next={`/results/${id}/talk`} />
        </div>
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath(`/results/${id}/talk`));

  // 로그인한 사용자 권한으로 조회 — 다른 회원의 결과는 DB 접근 정책에서도 걸러진다
  const view = await getResultView(await readRepository(), { userId: member.userId, assessmentId: id });
  if (!view) notFound();
  const { assessment, report } = view;
  // 구매 전 · 생성 중 · 이전 형식의 리포트는 대화로 풀지 않고 결과 화면으로 돌려보낸다
  if (!view.paidOrder || report?.status !== "ready" || !report.content || !isReadingReport(report.content)) redirect(`/results/${id}`);

  const content = report.content;
  const model = buildTalkModel(content);
  const created = new Date(assessment.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  return <TalkView model={model} dateLabel={created} reportHref={`/results/${id}`} dataHref={`/results/${id}#r-data`} contextHref={`/results/${id}/context`} subtitle={`저장된 리포트 · 검사일 ${created}${content.source === "sample" ? " · 개발용 샘플" : ""}`} />;
}
