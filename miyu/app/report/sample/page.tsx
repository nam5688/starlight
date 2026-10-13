import type { Metadata } from "next";
import Link from "next/link";
import { Lines } from "@/components/report/lines";
import { ReadingReportView } from "@/components/report/reading-report-view";
import { SourceBadge } from "@/components/ui/source-badge";
import { buttonPrimary, buttonSecondary, pageWide } from "@/components/ui/styles";
import { sampleReport } from "@/lib/samples/sample-report";
import { sampleReadingReport } from "@/lib/samples/sample-reading-report";

export const metadata: Metadata = {
  title: "리포트 예시 · ME:U 미유",
  description:
    "가상 인물의 개인 통합 리포트 예시. 사주에 MBTI · 기질 · 성격 · 가까운 관계 반응을 더해 하나의 해석으로 읽는 형식을 미리 볼 수 있습니다 (실제 검사 · 만세력 계산 결과가 아닙니다).",
  alternates: { canonical: "/report/sample" },
};

export default function SampleReportPage() {
  const report = sampleReadingReport;
  return (
    <main>
      <div className="border-b border-line bg-mist">
        <div className={`${pageWide} py-7 md:py-9`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SourceBadge source={report.source} />
            <span className="text-[13px] text-ink-3">가상의 인물 예시 · 실제 검사·만세력 계산 결과가 아닙니다</span>
          </div>
          <h1 className="mt-3 text-[26px] font-bold tracking-tight md:text-[32px]">{report.personName} 님의 개인 통합 리포트</h1>
          <p className="mt-1 text-[16px] text-ink-2">사주를 바탕으로 MBTI · 기질 · 성격 · 가까운 관계 반응을 함께 읽었습니다.</p>
          <Lines
            className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-3"
            text="이 예시는 미유가 목표로 하는 리포트 형식을 사람이 쓴 것입니다. 실제 리포트는 AI 연결 뒤에 이 형식으로 바꿀 예정이라, 지금 만들어지는 개발 단계의 리포트와 구성이 다를 수 있습니다."
          />
        </div>
      </div>

      <ReadingReportView
        report={report}
        saju={sampleReport.details.saju.saju}
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
