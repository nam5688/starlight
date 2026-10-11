import type { Metadata } from "next";
import Link from "next/link";
import { FullReportView } from "@/components/report/full-report-view";
import { SourceBadge } from "@/components/ui/source-badge";
import { buttonPrimary, buttonSecondary, pageWide } from "@/components/ui/styles";
import { sampleReport } from "@/lib/samples/sample-report";

export const metadata: Metadata = {
  title: "리포트 예시 · ME:U 미유",
};

export default function SampleReportPage() {
  const report = sampleReport;
  return (
    <main>
      <div className="border-b border-line bg-mist">
        <div className={`${pageWide} py-7 md:py-9`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SourceBadge source={report.source} />
            <span className="text-[13px] text-ink-3">가상의 인물 예시 · 실제 검사·만세력 계산 결과가 아닙니다</span>
          </div>
          <h1 className="mt-3 text-[26px] font-bold tracking-tight md:text-[32px]">
            {report.personName} 님의 개인 통합 리포트
          </h1>
          <p className="mt-1 text-[16px] text-ink-2">사주 · MBTI · 기질 · 애착</p>
        </div>
      </div>

      <FullReportView
        report={report}
        footer={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/analyze" className={buttonPrimary}>
              내 분석 시작하기
            </Link>
            <Link href="/" className={buttonSecondary}>
              처음으로
            </Link>
          </div>
        }
      />
    </main>
  );
}
