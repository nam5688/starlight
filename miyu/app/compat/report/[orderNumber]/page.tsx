import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginOptions } from "@/components/auth/login-options";
import { CompatStatusPoller } from "@/components/compat/compat-status-poller";
import { CompatReportView } from "@/components/report/compat-report-view";
import { ResultHeader } from "@/components/report/result-header";
import { PageFallback } from "@/components/ui/page-fallback";
import { buttonSecondary, pageNarrow } from "@/components/ui/styles";
import { getCompatReportView } from "@/lib/services/compat-service";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { reconcileUserInBackground } from "@/server/reconcile";
import { readRepository } from "@/server/services";

export const metadata: Metadata = { title: "사주 궁합 · ME:U 미유", robots: { index: false, follow: false } };

const ORDER_NUMBER = /^[A-Za-z0-9_-]{6,64}$/;

/** 구매한 사주 궁합 열람 — 본인 주문만. 저장된 글을 그대로 보여 주고 열 때마다 새로 만들지 않는다 */
export default function CompatReportPage({ params }: PageProps<"/compat/report/[orderNumber]">) {
  return (
    <main className="bg-page">
      <Suspense fallback={<PageFallback text="궁합 리포트를 불러오고 있어요." className={`${pageNarrow} py-16`} tall />}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: Pick<PageProps<"/compat/report/[orderNumber]">, "params">) {
  const { orderNumber } = await params;
  if (!ORDER_NUMBER.test(orderNumber)) notFound();
  if (!isAuthConfigured()) notFound();
  const here = `/compat/report/${orderNumber}`;
  const member = await getMember();
  if (!member) {
    return (
      <div className={`${pageNarrow} py-14 md:py-20`}>
        <h1 className="text-[24px] font-bold tracking-tight">로그인이 필요합니다</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">구매한 궁합 리포트는 본인만 볼 수 있습니다. 로그인해 주세요.</p>
        <div className="mt-8">
          <LoginOptions next={here} />
        </div>
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath(here));
  // 결제 승인이 났는데 돌아오지 못한 주문이 있으면 응답 뒤에 결제사 기록과 맞춘다
  reconcileUserInBackground(member.userId);

  const view = await getCompatReportView(await readRepository(), { userId: member.userId, orderNumber });
  if (view.kind === "not-found") notFound();

  if (view.kind === "refunded") {
    return (
      <div className={`${pageNarrow} py-14 md:py-20`}>
        <h1 className="text-[22px] font-bold tracking-tight">환불된 주문이에요</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">이 사주 궁합 주문은 환불되어 리포트를 열 수 없어요. 주문번호 {orderNumber}</p>
        <Link href="/my" className={`${buttonSecondary} mt-6`}>
          MY로 가기
        </Link>
      </div>
    );
  }
  if (view.kind === "generating" || view.kind === "failed") {
    return (
      <div className={`${pageNarrow} py-14 md:py-20`}>
        <h1 className="text-[22px] font-bold tracking-tight">사주 궁합</h1>
        <div className="mt-5">
          <CompatStatusPoller orderNumber={orderNumber} initial={view.kind} />
        </div>
      </div>
    );
  }

  const report = view.report;
  return (
    <>
      <ResultHeader title={`${report.names.a} × ${report.names.b} 사주 궁합`} subtitle="두 사람의 사주를 풀어 읽은 궁합이에요. 재미 · 참고용이고 관계의 결과를 알려 주지 않아요." source={report.placeholder ? "dev-scoring" : undefined} meta={`저장된 리포트 · 주문번호 ${orderNumber}`} />
      <div className={`${pageNarrow} pb-14`}>
        <CompatReportView report={report} />
        <div className="mt-8">
          <Link href="/my" className={buttonSecondary}>
            MY로 가기
          </Link>
        </div>
      </div>
    </>
  );
}
