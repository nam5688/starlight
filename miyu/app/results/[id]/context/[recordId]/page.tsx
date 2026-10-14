import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Track } from "@/components/analytics/track";
import { LoginOptions } from "@/components/auth/login-options";
import { ConcernReportView } from "@/components/report/concern-report-view";
import { ConcernScrub } from "@/components/results/concern-scrub";
import { ReportFeedback } from "@/components/results/report-feedback";
import { ReportStatusPoller } from "@/components/results/report-status-poller";
import { formatDate, formatDateTime } from "@/components/ui/format";
import { PageFallback } from "@/components/ui/page-fallback";
import { ResultHeader } from "@/components/report/result-header";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonPrimary, buttonSecondary, pageNarrow, textLink } from "@/components/ui/styles";
import { CONCERN_RECORDS, CONCERN_REPORT } from "@/lib/config/product";
import { CONTEXT_FIELDS, topicLabel } from "@/lib/personalization/context";
import { isConcernReport } from "@/lib/report/concern/types";
import { getConcernRecordView } from "@/lib/services/concern-service";
import { canRetryReport } from "@/lib/services/report-service";
import { retryConcernReportAction } from "@/app/results/[id]/context/actions";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { reconcileUserInBackground } from "@/server/reconcile";
import { readRepository } from "@/server/services";

export const metadata: Metadata = {
  title: "내 고민 반영 리포트 · ME:U 미유",
  robots: { index: false },
};

export default function ConcernRecordPage({ params, searchParams }: PageProps<"/results/[id]/context/[recordId]">) {
  return (
    <main className="bg-page">
      <Suspense fallback={<PageFallback text="리포트를 불러오고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/results/[id]/context/[recordId]">, "params" | "searchParams">) {
  const { id, recordId } = await params;
  const query = await searchParams;
  if (!CONCERN_RECORDS.visible || !isAuthConfigured()) notFound();
  const here = `/results/${id}/context/${recordId}`;
  const member = await getMember();
  if (!member) {
    return (
      <div className={`${pageNarrow} py-14 md:py-20`}>
        <h1 className="text-[24px] font-bold tracking-tight">로그인이 필요합니다</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">저장된 리포트는 본인만 볼 수 있습니다. 로그인해 주세요.</p>
        <div className="mt-8">
          <LoginOptions next={here} />
        </div>
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath(here));
  // 결제 승인이 났는데 돌아오지 못한 주문이 있으면 응답 뒤에 결제사 기록과 맞춘다
  reconcileUserInBackground(member.userId);

  // 로그인한 사용자 권한으로 조회 — 다른 회원의 기록은 DB 접근 정책에서도 걸러진다
  const view = await getConcernRecordView(await readRepository(), { userId: member.userId, assessmentId: id, recordId });
  if (!view) notFound();
  const { record, paidOrder, refunded, report } = view;
  const recordsHref = `/results/${id}/context`;
  const filled = CONTEXT_FIELDS.filter((f) => record[f.id].length > 0);
  const scrubbedNow = query.scrubbed === "1";
  const scrubBlocked = query.scrub === "blocked";
  const retryWait = query.retry === "cooldown" ? "방금 다시 시도했어요. 1분 정도 지난 뒤에 다시 눌러 주세요. 결제는 그대로 유효합니다." : query.retry === "capacity" ? "지금 리포트를 준비하는 주문이 많아 순서를 기다리고 있어요. 결제는 그대로 유효합니다." : null;

  const header = (meta: string, source?: "sample" | "dev-scoring") => (
    <ResultHeader
      kicker={CONCERN_REPORT.name}
      title={`${topicLabel(record.topic)} 고민 리포트`}
      subtitle={`${formatDateTime(record.writtenAt)}에 적은 고민을 반영한 별도 리포트`}
      source={source}
      meta={meta}
    />
  );

  // 결제 전 · 환불 — 열람 권한이 없다 (결제가 확인된 주문만 리포트를 연다)
  if (!paidOrder) {
    return (
      <>
        {header("결제 전")}
        <div className={`${pageNarrow} space-y-5 py-10`}>
          <p className="text-[16px] leading-relaxed text-ink-2">
            {refunded ? "이 리포트는 환불 처리되어 열람할 수 없습니다. 고민 기록은 남아 있어요." : "아직 이 고민 리포트의 결제가 확인되지 않았어요. 결제가 끝나면 이곳에서 열 수 있습니다."}
          </p>
          <Link href={recordsHref} className={buttonSecondary}>
            나의 고민 기록소로
          </Link>
        </div>
      </>
    );
  }

  const issued = formatDate(paidOrder.approvedAt ?? paidOrder.createdAt);

  if (report?.status === "ready" && report.content && isConcernReport(report.content)) {
    const feedback = await (await readRepository()).getFeedback(report.id);
    const footer = (
      <div className="space-y-4">
        <ReportFeedback reportId={report.id} initial={feedback?.rating ?? null} />
        <div className="border-y border-line py-5">
          <h2 className="text-[16px] font-semibold">그때 적은 고민</h2>
          {record.scrubbedAt ? (
            <p className="mt-2 text-[14px] leading-relaxed text-ink-3">적은 내용을 지웠어요 ({formatDate(record.scrubbedAt)}). 주제와 작성 시점, 이 리포트는 남아 있습니다.</p>
          ) : (
            <>
              {filled.length > 0 ? (
                <dl className="mt-3 space-y-3 border-l-2 border-line pl-3 text-[14px] leading-relaxed">
                  {filled.map((f) => (
                    <div key={f.id}>
                      <dt className="font-medium text-ink-3">{f.label}</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-ink">{record[f.id]}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-[14px] text-ink-3">주제만 골랐고 적은 글은 없어요.</p>
              )}
              <div className="mt-5">
                <ConcernScrub assessmentId={id} recordId={record.id} />
              </div>
            </>
          )}
        </div>
        <p className="text-[13px] text-ink-3">
          주문번호 {paidOrder.orderNumber} · 발급일 {issued} · 생성 {report.generator} {report.generatorVersion}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={recordsHref} className={buttonSecondary}>
            나의 고민 기록소
          </Link>
          <Link href={`/results/${id}`} className={buttonSecondary}>
            심층 리포트
          </Link>
          <Link href="/my" className={buttonSecondary}>
            MY로 가기
          </Link>
        </div>
      </div>
    );
    return (
      <>
        <Track name="report_view" />
        {header(`발급일 ${issued} · 저장된 리포트`, report.content.source)}
        <div className="mx-auto w-full max-w-[720px] px-5 pt-2">
          {scrubbedNow && (
            <p role="status" className="rounded-lg bg-accent-soft px-4 py-3 text-[15px] text-accent">
              그때 적은 고민 내용을 지웠습니다. 리포트는 그대로 남아 있어요.
            </p>
          )}
          <p className="mt-3 rounded-lg border border-line bg-mist px-4 py-3 text-[14px] leading-relaxed text-ink-2">
            이 리포트는 발급할 때 남긴 고민 기록을 바탕으로 한 별도 리포트입니다. 이후에 고민을 고쳐도 이 리포트는 바뀌지 않고, 기존 개인 통합 리포트도 그대로 있습니다.
          </p>
        </div>
        <ConcernReportView report={report.content} idPrefix="cr-" footer={footer} />
      </>
    );
  }

  // 만들기에 실패 — 같은 발급 건으로 다시 시도한다 (추가 결제 없음)
  if (report?.status === "failed") {
    return (
      <>
        {header(`발급일 ${issued}`)}
        <div className={`${pageNarrow} space-y-5 py-10`}>
          <p className="text-[18px] font-semibold">리포트를 만들지 못했어요</p>
          <p className="text-[15px] leading-relaxed text-ink-2">
            결제는 정상 처리되었고, 이 발급 건은 그대로 유지됩니다. 아래 버튼으로 같은 발급 건으로 다시 만들 수 있어요. <span className="font-semibold text-ink">추가 결제는 없습니다.</span>
          </p>
          {retryWait && (
            <p role="status" className="rounded-lg border border-line px-4 py-3 text-[15px] leading-relaxed text-ink">
              {retryWait}
            </p>
          )}
          {canRetryReport(report) ? (
            <form action={retryConcernReportAction.bind(null, id, record.id)}>
              <button type="submit" className={buttonPrimary}>
                같은 발급 건으로 다시 만들기
              </button>
            </form>
          ) : (
            <p className="text-[15px] leading-relaxed text-ink">여러 번 다시 시도해도 만들어지지 않았습니다. 운영자가 확인하고 있어요. 문의할 때 주문번호 {paidOrder.orderNumber}를 알려 주세요.</p>
          )}
          <p className="text-[14px]">
            <Link href={recordsHref} className={textLink}>
              나의 고민 기록소로
            </Link>
          </p>
        </div>
      </>
    );
  }

  // 만드는 중 (결제 직후 · 대기)
  return (
    <>
      {header(`발급일 ${issued}`)}
      <div className={`${pageNarrow} space-y-5 py-10`}>
        <p className="flex flex-wrap items-center gap-2 text-[18px] font-semibold">
          리포트를 만들고 있어요 <StatusBadge>결제 완료</StatusBadge>
        </p>
        <ReportStatusPoller assessmentId={id} recordId={record.id} />
        <p className="text-[14px]">
          <Link href={recordsHref} className={textLink}>
            나의 고민 기록소로
          </Link>
        </p>
        {scrubBlocked && <p className="text-[14px] text-ink-3">리포트 생성이 끝난 뒤에 고민 내용을 지울 수 있어요.</p>}
      </div>
    </>
  );
}
