import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after, connection } from "next/server";
import { Suspense } from "react";
import { ConcernReportView } from "@/components/report/concern-report-view";
import { FullReportView } from "@/components/report/full-report-view";
import { PersonalV2View } from "@/components/report/personal-v2-view";
import { ReadingReportView } from "@/components/report/reading-report-view";
import { ResultHeader } from "@/components/report/result-header";
import { PageFallback } from "@/components/ui/page-fallback";
import { pageWide, textLink } from "@/components/ui/styles";
import { isConcernReport } from "@/lib/report/concern/types";
import { isPersonalV2, isReadingReport } from "@/lib/report/generator";
import { adminReportView } from "@/lib/services/admin-support-service";
import { getAdminMember } from "@/server/member";
import { recordOps } from "@/server/ops";
import { now, writeRepository } from "@/server/services";

export const metadata: Metadata = { title: "리포트 보기 · 관리자 · ME:U 미유", robots: { index: false, follow: false } };

// 운영자가 고객 문의에 답하려고 저장된 리포트를 읽기 전용으로 여는 화면 — 고객에게 보이는 것과 같은 저장본이며 새로 만들거나 바꾸지 않는다.
// 열 때마다 운영 기록(주문번호만, 내용 없음)을 남긴다. 채팅 대화 · 고민은 이 화면에 없다.
export default function AdminReportPage({ params }: PageProps<"/admin/report/[orderNumber]">) {
  return (
    <main className="bg-page">
      <div className={`${pageWide} pt-8`}>
        <p className="text-[14px]">
          <Link href="/admin" className={textLink}>
            관리자
          </Link>
        </p>
      </div>
      <Suspense fallback={<PageFallback text="리포트를 불러오고 있어요." className={`${pageWide} py-10`} />}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: Pick<PageProps<"/admin/report/[orderNumber]">, "params">) {
  await connection();
  // 관리자가 아니면 화면이 있다는 사실도 알리지 않는다
  if (!(await getAdminMember())) notFound();
  const { orderNumber } = await params;
  const view = await adminReportView(writeRepository(), orderNumber, now());
  if (view.kind === "invalid" || view.kind === "not-found") notFound();

  if (view.kind === "no-report") {
    return (
      <div className={`${pageWide} py-8`}>
        <h1 className="text-[22px] font-bold tracking-tight">볼 수 있는 리포트가 없어요</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{view.reason}</p>
        <p className="mt-4 text-[14px]">
          <Link href={`/admin?q=${view.order.orderNumber}`} className={textLink}>
            이 주문 조회로 돌아가기
          </Link>
        </p>
      </div>
    );
  }

  const { content } = view;
  // 열람 기록 — 주문번호만 남긴다 (응답 뒤에 한 번)
  after(() => recordOps({ kind: "admin.view_report", severity: "info", orderNumber: view.order.orderNumber, message: "운영자가 문의 대응을 위해 저장된 리포트를 열람" }));
  const created = new Date(view.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  return (
    <>
      <div className={`${pageWide} pt-4`}>
        <section aria-label="운영자 확인용 안내" className="rounded-lg bg-mist px-4 py-3 text-[14px] leading-relaxed text-ink-2">
          <p className="font-semibold text-ink">운영자 확인용 · 읽기 전용</p>
          <p className="mt-1">
            주문 {view.order.orderNumber} · {view.order.productName} · 닉네임 {view.nickname}. 고객에게 보이는 것과 같은 저장본이고, 새로 만들거나 바꾸지 않습니다. 열람은 운영 기록에 남습니다(주문번호만, 내용은 남기지 않습니다). 채팅 대화 · 고민은 이 화면에 없습니다.
          </p>
          {view.text ? (
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold text-ink">고객에게 글로 보내기 (복사해서 붙여 넣기)</summary>
              <p className="mt-2 text-[13px] text-ink-3">화면에 보이는 본문(분석 근거 · 내부 번호 제외)을 글로 옮긴 것입니다. 글 안을 눌러 전체 선택 후 복사하세요. 다른 사람에게 보내기 전에 고객 본인 확인을 먼저 하세요.</p>
              <textarea readOnly rows={14} defaultValue={view.text} aria-label="리포트 본문 글" className="mt-2 w-full rounded-md border border-line-strong bg-white p-3 font-mono text-[13px] leading-relaxed" />
            </details>
          ) : (
            <p className="mt-2 text-[13px] text-ink-3">이 리포트 형식은 글 복사를 지원하지 않습니다. 화면을 캡처해 보내 주세요.</p>
          )}
        </section>
      </div>
      <ResultHeader title={`${view.nickname} 님의 ${isPersonalV2(content) ? "개인 종합 사주 리포트" : "심층 리포트"}`} subtitle="운영자 확인용 보기" source={content.source} meta={`검사일 ${created} · 저장된 리포트${view.generator ? ` · 생성 ${view.generator}` : ""}`} />
      {isReadingReport(content) ? <ReadingReportView report={content} idPrefix="adm-" /> : isPersonalV2(content) ? <PersonalV2View report={content} idPrefix="adm-" /> : isConcernReport(content) ? <ConcernReportView report={content} idPrefix="adm-" /> : <FullReportView report={content} idPrefix="adm-" />}
    </>
  );
}
