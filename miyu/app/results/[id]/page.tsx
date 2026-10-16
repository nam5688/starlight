import { TasteReportSection } from "@/components/results/taste-report-section";
import { tasteLockedItems } from "@/lib/report/taste/locked";
import { tasteConnected } from "@/server/taste";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ReportFeedback } from "@/components/results/report-feedback";
import { TalkEntry } from "@/components/results/talk-entry";
import { buildTalkModel } from "@/lib/report/reading/talk";
import { buildFreeTalkModel } from "@/lib/report/reading/talk-free";
import { availableRooms } from "@/lib/report/reading/talk-room";
import { seoulDate } from "@/lib/saju/interpret/day-plain";
import { chatConnected } from "@/server/chat";
import { peekRoomChoice } from "@/server/room-choice";
import { Track } from "@/components/analytics/track";
import { ClearAnalyzeDraft } from "@/components/analyze/clear-draft";
import { LoginOptions } from "@/components/auth/login-options";
import { FreePreviewBody } from "@/components/report/free-preview-body";
import { FullReportView } from "@/components/report/full-report-view";
import { SectionTitle } from "@/components/report/summary-blocks";
import { PersonalV2View } from "@/components/report/personal-v2-view";
import { ReadingReportView } from "@/components/report/reading-report-view";
import { ContextPanel } from "@/components/results/context-panel";
import { PurchasePanel } from "@/components/results/purchase-panel";
import { ReceivedReports, RepurchasePanel } from "@/components/results/received-reports";
import { ReadingNav } from "@/components/report/reading-nav";
import { ResultHeader } from "@/components/report/result-header";
import { buttonSecondary, pageNarrow } from "@/components/ui/styles";
import { CONCERN_RECORDS } from "@/lib/config/product";
import { isConcernReport } from "@/lib/report/concern/types";
import { isPersonalV2, isReadingReport } from "@/lib/report/generator";
import { buildFreePreview } from "@/lib/report/preview";
import { seoulReference } from "@/lib/report/reference";
import { receivedRowOf } from "@/lib/services/my-service";
import { getResultView } from "@/lib/services/report-service";
import { isAuthConfigured, paymentConfig } from "@/server/env";
import { currentSaleGate } from "@/server/capacity";
import { now, readRepository, reportGenerator } from "@/server/services";
import { consentPath, getMember } from "@/server/member";
import { reconcileUserInBackground } from "@/server/reconcile";
import { PageFallback } from "@/components/ui/page-fallback";

export const metadata: Metadata = {
  title: "내 리포트 · ME:U 미유",
  robots: { index: false },
};

export default function ResultPage({ params, searchParams }: PageProps<"/results/[id]">) {
  return (
    <main className="bg-page">
      <Suspense fallback={<PageFallback text="결과를 불러오고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <ResultContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** 같은 결과로 여러 번 받은 리포트 중 하나를 고르는 주문번호 (?r=) — 형식이 맞지 않으면 무시하고 기본(가장 최근에 완성된 리포트)으로 연다 */
const ORDER_NUMBER = /^[A-Za-z0-9_-]{6,64}$/;

async function ResultContent({ params, searchParams }: Pick<PageProps<"/results/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  const chosen = typeof query.r === "string" && ORDER_NUMBER.test(query.r) ? query.r : null;
  if (!isAuthConfigured()) notFound();

  const member = await getMember();
  if (!member) {
    return (
      <div className={`${pageNarrow} py-14 md:py-20`}>
        <h1 className="text-[24px] font-bold tracking-tight">로그인이 필요합니다</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">저장된 결과는 본인만 볼 수 있습니다. 로그인해 주세요.</p>
        <div className="mt-8">
          <LoginOptions next={`/results/${id}`} />
        </div>
      </div>
    );
  }

  if (member.needsConsent) redirect(consentPath(chosen ? `/results/${id}?r=${chosen}` : `/results/${id}`));
  // 결제 승인이 났는데 돌아오지 못한 주문이 있으면 응답 뒤에 결제사 기록과 맞춘다
  reconcileUserInBackground(member.userId);

  // 로그인한 사용자 권한으로 조회 — 다른 회원의 결과는 DB 접근 정책에서도 걸러진다
  const view = await getResultView(await readRepository(), { userId: member.userId, assessmentId: id, orderNumber: chosen });
  if (!view) notFound();

  const { assessment, report } = view;
  const generator = reportGenerator();
  const usesContext = Boolean(generator.usesContext);
  const created = new Date(assessment.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  // 같은 결과로 받은 리포트 전부 (받은 리포트는 모두 기록으로 남는다) — 지금 열려 있는 것과 구분해 보여 준다
  const receivedRows = view.received.map((x) => receivedRowOf(x.order, x.report, assessment.id));
  const seq = receivedRows.find((x) => x.orderNumber === view.paidOrder?.orderNumber)?.seq ?? 1;
  const payment = paymentConfig();
  // 지금 새 구매를 받는 중인지 (리포트 준비가 밀렸거나 하루 예산에 가까우면 닫힘). 확인이 실패하면 막지 않는다
  const gate = await currentSaleGate().catch(() => null);

  if (view.paidOrder && report?.status === "ready" && report.content) {
    const content = report.content;
    if (isConcernReport(content)) notFound(); // 개인 통합 리포트 주문에는 고민 반영 리포트가 붙지 않는다
    const feedback = await (await readRepository()).getFeedback(report.id);
    const footer = (
      <div className="space-y-4">
        <ReportFeedback reportId={report.id} initial={feedback?.rating ?? null} />
        {CONCERN_RECORDS.visible && <ContextPanel assessmentId={assessment.id} context={view.context} usesContext={usesContext} reportReady />}
        <section aria-labelledby="r-received" className="space-y-3">
          <h2 id="r-received" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
            받은 리포트
          </h2>
          <p className="text-[14px] leading-[1.65] text-ink-3">
            이 결과로 받은 리포트는 모두 이곳과 MY에 남고, 새로 받아도 이미 받은 리포트의 내용은 바뀌지 않아요.
          </p>
          <ReceivedReports rows={receivedRows} current={view.paidOrder.orderNumber} />
        </section>
        <RepurchasePanel
          assessmentId={assessment.id}
          paymentsReady={payment.ok}
          paymentsNote={payment.ok ? null : payment.reason}
          salesClosedReason={gate && !gate.open ? { reason: gate.reason } : null}
          latestGenerator={view.received[0]?.report?.status === "ready" && view.received[0].report.generator ? `${view.received[0].report.generator} ${view.received[0].report.generatorVersion ?? ""}`.trim() : null}
          nowGenerator={`${generator.name} ${generator.version}`}
        />
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
          title={isPersonalV2(content) ? `${assessment.nickname} 님의 개인 종합 사주 리포트` : `${assessment.nickname} 님의 심층 리포트`}
          subtitle={
            isReadingReport(content)
              ? "사주를 틀로, 성향 응답과 입력한 MBTI를 함께 읽은 하나의 해석입니다."
              : isPersonalV2(content)
                ? "사주 원국 · 대운 · 세운 중심, 성향 응답은 보조 근거"
                : "사주 · MBTI · 기질 · 애착을 한 사람의 해석으로 읽었습니다."
          }
          source={content.source}
          meta={`검사일 ${created} · 저장된 리포트${receivedRows.length > 1 ? ` · ${seq}번째로 받은 리포트` : ""}`}
        />
        {isReadingReport(content) && <TalkEntry id={assessment.id} tier="deep" chatReady={chatConnected()} rooms={availableRooms(buildTalkModel(content, { saju: assessment.saju, today: seoulDate(now()) }))} remembered={await peekRoomChoice()} />}
        {isReadingReport(content) ? (
          <ReadingReportView report={content} idPrefix="r-" footer={footer} />
        ) : isPersonalV2(content) ? (
          <PersonalV2View report={content} idPrefix="r-" footer={footer} />
        ) : (
          <FullReportView report={content} idPrefix="r-" footer={footer} />
        )}
      </>
    );
  }

  // 잠긴 내용은 서버에서 아예 만들지 않는다 — 전체 요약 · 점수는 구매 후 리포트에만
  const preview = buildFreePreview({ summary: assessment.summary, saju: assessment.saju, reference: seoulReference(new Date()) });
  return (
    <>
      <ClearAnalyzeDraft />
      <Track name="preview_view" />
      <ResultHeader title={`${assessment.nickname} 님의 무료 미리보기`} subtitle="사주 · MBTI · 기질 · 애착 중 무료로 보는 범위입니다." source={assessment.source} meta={`검사일 ${created} · 저장됨`} />
      <ReadingNav
        expandAll={false}
        items={[
          ...(view.taste.kind !== "unavailable" ? [{ id: "r-taste", label: "맛보기 리포트" }] : []),
          { id: "r-tendency", label: "전체 요약" },
          { id: "r-saju", label: "사주 원국" },
          { id: "r-situations", label: "상황별" },
          { id: "r-scores", label: "점수" },
          { id: "r-rooms", label: "상담방" },
          { id: "r-locked", label: "구매 안내" },
        ]}
      />
      {/* 내 맛보기 리포트(무료 · 한 계정당 1번) — AI가 사주와 응답을 엮어 쓴 글. 받기 전에는 받기 버튼, 받은 뒤에는 글과 잠긴 핵심 목록 */}
      <TasteReportSection id="r-taste" assessmentId={assessment.id} state={view.taste} connected={tasteConnected()} locked={tasteLockedItems(preview)} />
      <div className="mx-auto w-full max-w-[720px] px-5 pt-6">
        <FreePreviewBody preview={preview} idPrefix="r-" ctaHref="#r-purchase" />
      </div>
      {/* 결과 화면에서도 궁금한 주제의 상담방을 고른다(운영자 2026-10-15). 홈에서 심층 리포트로만 열리는 방을 골랐다면 그 방은 "이어서 이야기하기" 바로가기로 보인다(무료로 열리는 방은 분석 직후 바로 열려 이 화면에 기억이 남지 않는다) */}
      <section id="r-rooms" aria-labelledby="r-rooms-title" className="mx-auto w-full max-w-[720px] px-5 pt-12">
        <SectionTitle id="r-rooms-title" note="무료 리포트를 읽었다면, 궁금한 주제를 골라 미유와 이야기해 보세요. 방마다 새 대화로 시작해요.">
          이제 궁금한 이야기를 골라 보세요
        </SectionTitle>
      </section>
      <TalkEntry
        id={assessment.id}
        tasting
        tier="simple"
        chatReady={chatConnected()}
        buyHref={view.paidOrder ? undefined : "#r-purchase"}
        rooms={availableRooms(
          buildFreeTalkModel({ name: assessment.nickname, preview, saju: assessment.saju, today: seoulDate(now()), href: `/results/${assessment.id}#r-purchase`, owned: Boolean(view.paidOrder), chat: { state: "locked" }, taste: view.taste?.kind === "ready" ? view.taste.report : null }),
        )}
        remembered={await peekRoomChoice()}
      />
      <div className="mx-auto w-full max-w-[720px] space-y-12 px-5 pt-12 pb-16">
        {CONCERN_RECORDS.visible && <ContextPanel assessmentId={assessment.id} context={view.context} usesContext={usesContext} reportReady={false} />}
        {receivedRows.length > 1 && (
          <section aria-labelledby="r-received" className="space-y-3">
            <h2 id="r-received" className="border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">
              받은 리포트
            </h2>
            <ReceivedReports rows={receivedRows} current={view.paidOrder?.orderNumber} />
          </section>
        )}
        <PurchasePanel view={view} included={preview.locked.map((l) => l.title)} paymentsReady={payment.ok} paymentsNote={payment.ok ? null : payment.reason} salesClosedReason={gate && !gate.open ? { reason: gate.reason } : null} />
      </div>
    </>
  );
}
