import { TasteReportSection } from "@/components/results/taste-report-section";
import { tasteConnected } from "@/server/taste";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ReportFeedback } from "@/components/results/report-feedback";
import { IdentityCard } from "@/components/results/identity-card";
import { MiyuFirst } from "@/components/results/miyu-first";
import { TalkEntry } from "@/components/results/talk-entry";
import { ReviewLink } from "@/components/reviews/review-link";
import { talkRoomPath } from "@/components/talk/room-paths";
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
import { InviteSection } from "@/components/results/invite-section";
import { PurchasePanel } from "@/components/results/purchase-panel";
import { ReceivedReports, RepurchasePanel } from "@/components/results/received-reports";
import { ReadingNav } from "@/components/report/reading-nav";
import { ResultHeader } from "@/components/report/result-header";
import { buttonSecondary, pageNarrow } from "@/components/ui/styles";
import { CONCERN_RECORDS, LUCKY_INDEX, PERSONAL_TYPE, REPORT_BASIS } from "@/lib/config/product";
import { type BenefitNotice, type PriceQuoteView, readBenefitQuery } from "@/lib/commerce/benefit-query";
import { isConcernReport } from "@/lib/report/concern/types";
import { isCompatReport, isPairReport } from "@/lib/report/compat/types";
import { isPersonalV2, isReadingReport } from "@/lib/report/generator";
import { buildIdentity } from "@/lib/report/identity";
import { buildFreePreview } from "@/lib/report/preview";
import { seoulReference } from "@/lib/report/reference";
import { quoteForCheckout } from "@/lib/services/benefit-service";
import { getInviteView, quoteInviteDiscount } from "@/lib/services/invite-service";
import { receivedRowOf } from "@/lib/services/my-service";
import { getResultView } from "@/lib/services/report-service";
import { isAuthConfigured, paymentConfig } from "@/server/env";
import { currentSaleGate } from "@/server/capacity";
import { peekInviteToken } from "@/server/invite";
import { logError } from "@/server/ops";
import { getSiteUrl } from "@/server/session";
import { benefitRepository, now, readRepository, reportGenerator, writeRepository } from "@/server/services";
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

/**
 * 결제 전 견적(정가 · 적격 할인 선택지 · 거절 사유 · 포인트 교환)을 서버에서 만든다.
 * 확인 중 서버 오류는 "할인을 쓸 수 없다"가 아니라 오류 알림으로 돌려주고(구매는 막지 않는다), 정가 주문은 만들지 않는다.
 */
async function loadPurchaseQuote(input: { userId: string; assessmentId: string; couponCode: string | null; again: boolean }): Promise<{ quote: PriceQuoteView | null; failed: boolean }> {
  try {
    const r = await quoteForCheckout({ repo: writeRepository(), benefits: benefitRepository(), now }, input);
    if (r.kind === "error") {
      logError("benefit.quote", new Error(r.message));
      return { quote: null, failed: true };
    }
    if (r.kind !== "quote") return { quote: null, failed: false };
    return { quote: { quote: r.quote, couponCode: r.couponCode, pointBalance: r.pointBalance, couponsEnabled: r.settings.features.coupons }, failed: false };
  } catch (e) {
    logError("benefit.quote", e);
    return { quote: null, failed: true };
  }
}

async function ResultContent({ params, searchParams }: Pick<PageProps<"/results/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  const chosen = typeof query.r === "string" && ORDER_NUMBER.test(query.r) ? query.r : null;
  if (!isAuthConfigured()) notFound();

  const member = await getMember();
  if (!member) {
    return (
      <div className={`${pageNarrow} py-14 md:py-20`}>
        <h1 className="text-[24px] font-bold tracking-tight">로그인이 필요해요</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">저장된 결과는 본인만 볼 수 있어요. 로그인해 주세요.</p>
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
    if (isConcernReport(content) || isCompatReport(content) || isPairReport(content)) notFound(); // 개인 통합 리포트 주문에는 고민 반영 · 사주 궁합 리포트가 붙지 않는다
    const feedback = await (await readRepository()).getFeedback(report.id);
    // 친구 초대(심층 리포트를 받은 분만) — 확인에 실패하면 이 구역만 보이지 않는다
    const inviteView = await getInviteView(writeRepository(), { userId: member.userId, assessmentId: assessment.id }).catch((e) => {
      logError("invite.view", e);
      return { kind: "unavailable" as const };
    });
    const footer = (
      <div className="space-y-4">
        <ReportFeedback reportId={report.id} initial={feedback?.rating ?? null} />
        {CONCERN_RECORDS.visible && <ContextPanel assessmentId={assessment.id} context={view.context} usesContext={usesContext} reportReady />}
        {inviteView.kind === "available" && <InviteSection assessmentId={assessment.id} origin={await getSiteUrl()} view={inviteView} />}
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
        <ReviewLink kind="personal" subjectRef={view.paidOrder.id} />
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
              ? "사주를 틀로, 성향 응답과 입력한 MBTI를 함께 읽은 하나의 해석이에요."
              : isPersonalV2(content)
                ? "사주 원국 · 대운 · 세운 중심, 성향 응답은 보조 근거"
                : "사주 · MBTI · 기질 · 애착을 한 사람의 해석으로 읽었어요."
          }
          source={content.source}
          meta={`검사일 ${created} · 저장된 리포트${receivedRows.length > 1 ? ` · ${seq}번째로 받은 리포트` : ""}`}
          tone="main"
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

  // 초대 링크로 들어온 사람의 가격(운영자 예외 2026-10-16) — 서버가 대상인지 확인한 뒤에만 초대 가격을 함께 보인다
  const inviteQuote = view.paidOrder ? null : await quoteInviteDiscount(writeRepository(), { token: await peekInviteToken(), userId: member.userId });
  // 결제 전 견적(혜택) — 아직 구매 전이고 지금 새 구매를 받는 중일 때만. 견적을 만들지 못하면 오류 알림만 더하고 정가 구매 버튼은 그대로 둔다
  const benefitQuery = readBenefitQuery(query);
  const purchaseQuote = !view.paidOrder && !(gate && !gate.open) ? await loadPurchaseQuote({ userId: member.userId, assessmentId: assessment.id, couponCode: benefitQuery.couponCode, again: benefitQuery.again }) : null;
  const benefitNotice: BenefitNotice | null = purchaseQuote?.failed ? { kind: "error" } : benefitQuery.notice;
  // 잠긴 내용은 서버에서 아예 만들지 않는다 — 전체 요약 · 점수는 구매 후 리포트에만
  const preview = buildFreePreview({ summary: assessment.summary, saju: assessment.saju, reference: seoulReference(new Date()) });
  // 개인 유형명 · 럭키 지수 카드 — 운영자가 기준을 확정하기 전에는 스위치가 꺼져 있어 만들지도 보이지도 않는다(lib/config/product.ts). 저장하지 않고 열 때마다 계산한다.
  const identity = PERSONAL_TYPE.visible || LUCKY_INDEX.visible ? buildIdentity({ saju: assessment.saju, summary: assessment.summary }) : null;
  const freeRooms = availableRooms(
    buildFreeTalkModel({ name: assessment.nickname, preview, saju: assessment.saju, today: seoulDate(now()), href: `/results/${assessment.id}#r-purchase`, owned: Boolean(view.paidOrder), chat: { state: "locked" }, taste: view.taste?.kind === "ready" ? view.taste.report : null }),
  );
  return (
    <>
      <ClearAnalyzeDraft />
      <Track name="preview_view" />
      <ResultHeader title={`${assessment.nickname} 님의 무료 미리보기`} subtitle="사주 · MBTI · 기질 · 애착 중 무료로 보는 범위예요." source={assessment.source} meta={`검사일 ${created} · 저장됨`} />
      {identity && <IdentityCard identity={identity} showType={PERSONAL_TYPE.visible} showLucky={LUCKY_INDEX.visible} />}
      {/* 분석을 마친 직후의 두 선택 — 미유가 먼저 풀어 주는 길 / 바로 전체 리포트 읽기 (운영자 방향 2026-10-16) */}
      {freeRooms.includes("main") && <MiyuFirst talkHref={talkRoomPath(assessment.id, "main")} reportHref="#r-tendency" />}
      <ReadingNav
        expandAll={false}
        items={[
          ...(view.taste.kind !== "unavailable" ? [{ id: "r-taste", label: "맛보기 리포트" }] : []),
          { id: "r-tendency", label: "대표 경향" },
          { id: "r-self", label: "내 성향" },
          { id: "r-situations", label: "일 · 관계" },
          { id: "r-actions", label: "필요한 한 가지" },
          ...(REPORT_BASIS.visible ? [{ id: "r-basis", label: "분석 근거" }] : preview.saju.status === "ok" ? [{ id: "r-basis", label: "내 사주 원국" }] : []),
          { id: "r-rooms", label: "상담방" },
          { id: "r-purchase", label: "구매 안내" },
        ]}
      />
      {/* 내 맛보기 리포트(무료 · 한 계정당 1번) — AI가 사주를 읽고 응답으로 이 사람에게 어떻게 나타나는지 풀어 쓴 완결된 글. 받기 전에는 받기 버튼 */}
      <TasteReportSection id="r-taste" assessmentId={assessment.id} state={view.taste} connected={tasteConnected()} />
      <div className="mx-auto w-full max-w-[720px] px-5 pt-6">
        <FreePreviewBody preview={preview} idPrefix="r-" />
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
        rooms={freeRooms}
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
        <PurchasePanel
          view={view}
          included={preview.locked.map((l) => l.title)}
          paymentsReady={payment.ok}
          paymentsNote={payment.ok ? null : payment.reason}
          salesClosedReason={gate && !gate.open ? { reason: gate.reason } : null}
          invite={inviteQuote}
          quote={purchaseQuote?.quote ?? null}
          benefitNotice={benefitNotice}
          again={benefitQuery.again}
        />
      </div>
    </>
  );
}
