import type { Metadata } from "next";
import Link from "next/link";
import { ReadingReportView } from "@/components/report/reading-report-view";
import { ArrowIcon } from "@/components/ui/icons";
import { SourceBadge } from "@/components/ui/source-badge";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
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
    <main className="bg-page">
      <div className="mx-auto w-full max-w-[720px] px-5 pt-5 pb-4 md:pt-10">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SourceBadge source={report.source} />
          <span className="text-[13px] text-ink-3">가상 인물 예시 · 실제 검사 · 만세력 계산 결과가 아닙니다</span>
        </div>
        <h1 className="mt-3 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">{report.personName} 님의 개인 통합 리포트</h1>
      </div>

      <div className="mx-auto w-full max-w-[720px] px-5 pb-1">
        <Link href="/report/sample/talk" className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-soft px-4 py-2.5 transition-colors hover:border-accent">
          <span>
            <span className="block text-[16px] font-bold text-accent-strong">대화로 풀어보기 (예시)</span>
            <span className="block text-[13px] leading-[1.5] text-ink-2">같은 리포트를 분석 카드와 한 주제씩 읽는 대화 형식으로 봅니다.</span>
          </span>
          <ArrowIcon className="size-5 shrink-0 text-accent-strong" />
        </Link>
      </div>
      <ReadingReportView
        report={report}
        tendencyName={sampleReport.tendency.name}
        saju={sampleReport.details.saju.saju}
        scores={[
          { title: "기질 · 성격 (개발용 예시 문항)", rows: sampleReport.temperament },
          { title: "가까운 관계 반응 (개발용 예시 문항)", rows: sampleReport.relationship },
        ]}
        footer={
          <>
            <p className="text-[13px] leading-[1.7] text-ink-3">
              이 예시는 미유가 목표로 하는 리포트 형식을 사람이 쓴 것입니다. AI가 연결되면 실제 리포트도 이 형식으로 만들어집니다. AI 연결 전에 만들어지는 개발 단계의 리포트는 구성이 다를 수 있습니다.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/analyze" className={buttonPrimary}>
                내 분석 시작하기
              </Link>
              <Link href="/" className={buttonSecondary}>
                처음으로
              </Link>
            </div>
          </>
        }
      />
    </main>
  );
}
