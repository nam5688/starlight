import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ReportFeedback } from "@/components/results/report-feedback";
import { Track } from "@/components/analytics/track";
import { ClearAnalyzeDraft } from "@/components/analyze/clear-draft";
import { KakaoLoginForm } from "@/components/auth/kakao-login-button";
import { FreePreviewBody } from "@/components/report/free-preview-body";
import { FullReportView } from "@/components/report/full-report-view";
import { PersonalV2View } from "@/components/report/personal-v2-view";
import { ContextPanel } from "@/components/results/context-panel";
import { PurchasePanel } from "@/components/results/purchase-panel";
import { SourceBadge } from "@/components/ui/source-badge";
import { buttonSecondary, pageNarrow, pageWide } from "@/components/ui/styles";
import { isPersonalV2 } from "@/lib/report/generator";
import { buildFreePreview } from "@/lib/report/preview";
import { seoulReference } from "@/lib/report/reference";
import { getResultView } from "@/lib/services/report-service";
import { isAuthConfigured, paymentConfig } from "@/server/env";
import { currentSaleGate } from "@/server/capacity";
import { readRepository, reportGenerator } from "@/server/services";
import { consentPath, getMember } from "@/server/member";
import { reconcileUserInBackground } from "@/server/reconcile";

export const metadata: Metadata = {
  title: "내 리포트 · ME:U 미유",
  robots: { index: false },
};

export default function ResultPage({ params }: PageProps<"/results/[id]">) {
  return (
    <main>
      <Suspense fallback={<p className={`${pageNarrow} py-16 text-[16px] text-ink-2`}>결과를 불러오고 있어요.</p>}>
        <ResultContent params={params} />
      </Suspense>
    </main>
  );
}

async function ResultContent({ params }: Pick<PageProps<"/results/[id]">, "params">) {
  const { id } = await params;
  if (!isAuthConfigured()) notFound();

  const member = await getMember();
  if (!member) {
    return (
      <div className={`${pageNarrow} py-14 md:py-20`}>
        <h1 className="text-[24px] font-bold tracking-tight">로그인이 필요합니다</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">저장된 결과는 본인만 볼 수 있습니다. 카카오로 로그인해 주세요.</p>
        <div className="mt-8">
          <KakaoLoginForm next={`/results/${id}`} />
        </div>
      </div>
    );
  }

  if (member.needsConsent) redirect(consentPath(`/results/${id}`));
  // 결제 승인이 났는데 돌아오지 못한 주문이 있으면 응답 뒤에 결제사 기록과 맞춘다
  reconcileUserInBackground(member.userId);

  // 로그인한 사용자 권한으로 조회 — 다른 회원의 결과는 DB 접근 정책에서도 걸러진다
  const view = await getResultView(await readRepository(), { userId: member.userId, assessmentId: id });
  if (!view) notFound();

  const { assessment, report } = view;
  const usesContext = Boolean(reportGenerator().usesContext);
  const created = new Date(assessment.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

  if (view.paidOrder && report?.status === "ready" && report.content) {
    const content = report.content;
    const feedback = await (await readRepository()).getFeedback(report.id);
    const footer = (
      <div className="space-y-4">
        <ReportFeedback reportId={report.id} initial={feedback?.rating ?? null} />
        <ContextPanel assessmentId={assessment.id} context={view.context} usesContext={usesContext} reportReady />
        <p className="text-[13px] text-ink-3">
          주문번호 {view.paidOrder.orderNumber} · 생성 {report.generator} {report.generatorVersion}
        </p>
        <Link href="/my" className={buttonSecondary}>
          MY로 가기
        </Link>
      </div>
    );
    return (
      <>
        <ClearAnalyzeDraft />
        <Track name="report_view" />
        <ResultHeader
          title={isPersonalV2(content) ? `${assessment.nickname} 님의 개인 종합 사주 리포트` : `${assessment.nickname} 님의 개인 통합 리포트`}
          subtitle={isPersonalV2(content) ? "사주 원국 · 대운 · 세운 중심, 성향 응답은 보조 근거" : undefined}
          source={content.source}
          meta={`검사일 ${created} · 저장된 리포트`}
        />
        {isPersonalV2(content) ? (
          <PersonalV2View report={content} idPrefix="r-" footer={footer} />
        ) : (
          <FullReportView report={content} idPrefix="r-" footer={footer} />
        )}
      </>
    );
  }

  const payment = paymentConfig();
  // 지금 새 구매를 받는 중인지 (리포트 준비가 밀렸거나 하루 예산에 가까우면 닫힘). 확인이 실패하면 막지 않는다
  const gate = await currentSaleGate().catch(() => null);
  // 잠긴 내용은 서버에서 아예 만들지 않는다 — 전체 요약 · 점수는 구매 후 리포트에만
  const preview = buildFreePreview({ summary: assessment.summary, saju: assessment.saju, reference: seoulReference(new Date()) });
  return (
    <>
      <ClearAnalyzeDraft />
      <Track name="preview_view" />
      <ResultHeader title={`${assessment.nickname} 님의 무료 미리보기`} source={assessment.source} meta={`검사일 ${created} · 저장됨`} />
      <div className={`${pageNarrow} space-y-16 py-10 md:py-14`}>
        <FreePreviewBody preview={preview} idPrefix="r-" ctaHref="#r-purchase" />
        <ContextPanel assessmentId={assessment.id} context={view.context} usesContext={usesContext} reportReady={false} />
        <PurchasePanel view={view} included={preview.locked.map((l) => l.title)} paymentsReady={payment.ok} paymentsNote={payment.ok ? null : payment.reason} salesClosedReason={gate && !gate.open ? { reason: gate.reason } : null} />
      </div>
    </>
  );
}

function ResultHeader({
  title,
  subtitle = "사주 · MBTI · 기질 · 애착",
  source,
  meta,
}: {
  title: string;
  subtitle?: string;
  source: "sample" | "dev-scoring";
  meta: string;
}) {
  return (
    <div className="border-b border-line bg-mist">
      <div className={`${pageWide} py-7 md:py-9`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SourceBadge source={source} />
          <span className="text-[13px] text-ink-3">{meta}</span>
        </div>
        <h1 className="mt-3 text-[26px] font-bold tracking-tight md:text-[32px]">{title}</h1>
        <p className="mt-1 text-[16px] text-ink-2">{subtitle}</p>
      </div>
    </div>
  );
}
