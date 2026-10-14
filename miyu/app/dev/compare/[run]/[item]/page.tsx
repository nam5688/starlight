import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ReadingReportView } from "@/components/report/reading-report-view";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow, textLink } from "@/components/ui/styles";
import { isReadingReport } from "@/lib/report/reading/types";
import { readRunReport } from "@/server/dev-compare";

export const metadata: Metadata = { title: "AI 비교 리포트 · ME:U 미유", robots: { index: false } };

export default function DevCompareReportPage({ params }: PageProps<"/dev/compare/[run]/[item]">) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="bg-page">
      <Suspense fallback={<p className={`${pageNarrow} py-16 text-[16px] text-ink-2`}>불러오고 있어요.</p>}>
        <Report params={params} />
      </Suspense>
    </main>
  );
}

async function Report({ params }: Pick<PageProps<"/dev/compare/[run]/[item]">, "params">) {
  await connection();
  const { run, item } = await params;
  const report = await readRunReport(run, item);
  if (!report || !isReadingReport(report)) notFound();
  return (
    <>
      <div className="mx-auto w-full max-w-[720px] px-5 pt-5 pb-4 md:pt-10">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge>개발용 · AI 비교 결과 · {item}</StatusBadge>
        </div>
        <h1 className="mt-3 text-[22px] leading-snug font-bold tracking-tight md:text-[26px]">{report.personName} 님의 개인 통합 리포트</h1>
        <p className="mt-2 text-[14px] leading-[1.7] text-ink-3">
          가상 인물로 만든 비교용 리포트입니다. <b className="text-ink-2">개인 통합 리포트(9,900원 상품, 읽기 구조)</b>이며 고민 반영 리포트(4,900원)가 아닙니다 — 고민 반영 리포트의 AI 지시문은 아직 옛 규칙이라 이 비교에 넣지 않았습니다. 실제 고객 정보는 쓰지 않았고, 응답 문항은 개발용 예시입니다.
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4 text-[14px]">
          <Link href={`/dev/compare/${run}/${item}/talk`} className={textLink}>
            대화로 보기 (채팅 화면)
          </Link>
          <Link href="/dev/compare" className={textLink}>
            비교 결과 목록으로
          </Link>
        </p>
      </div>
      <ReadingReportView report={report} idPrefix="c-" />
    </>
  );
}
