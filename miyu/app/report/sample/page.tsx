import type { Metadata } from "next";
import Link from "next/link";
import { DetailSections } from "@/components/report/detail-sections";
import { ActionList, IntegratedView, ReportDisclaimer } from "@/components/report/integrated-view";
import { CoreSummaryTable, SCORE_NOTE, ScoreGroups, SectionTitle, TendencyBlock } from "@/components/report/summary-blocks";
import { SourceBadge } from "@/components/ui/source-badge";
import { buttonPrimary, buttonSecondary, pageWide } from "@/components/ui/styles";
import { sampleReport } from "@/lib/samples/sample-report";

export const metadata: Metadata = {
  title: "리포트 예시 · ME:U 미유",
};

const TOC = [
  { id: "tendency", label: "대표 경향 · 한 줄 요약" },
  { id: "core", label: "핵심 요약" },
  { id: "scores", label: "항목별 점수" },
  { id: "details", label: "네 가지 상세 분석" },
  { id: "integrated", label: "통합 해석" },
  { id: "actions", label: "실천 제안" },
];

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

      <div className={`${pageWide} py-10 lg:grid lg:grid-cols-[200px_minmax(0,720px)] lg:gap-16 lg:py-14`}>
        <nav aria-label="리포트 목차" className="hidden lg:block">
          <ol className="sticky top-28 space-y-1 border-l border-line text-[14px]">
            {TOC.map((t, i) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-ink-3 hover:border-accent hover:text-ink">
                  <span className="mr-2 tabular-nums">{i + 1}</span>
                  {t.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="min-w-0 space-y-16">
          <section aria-labelledby="tendency">
            <TendencyBlock summary={report} />
          </section>

          <section aria-labelledby="core">
            <SectionTitle id="core">핵심 요약</SectionTitle>
            <CoreSummaryTable core={report.core} />
          </section>

          <section aria-labelledby="scores">
            <SectionTitle id="scores" note={SCORE_NOTE}>
              항목별 점수
            </SectionTitle>
            <ScoreGroups summary={report} />
          </section>

          <section aria-labelledby="details">
            <SectionTitle id="details" note="영역마다 무엇을 근거로 봤는지와 한계를 함께 적었습니다.">
              네 가지 상세 분석
            </SectionTitle>
            <DetailSections report={report} />
          </section>

          <section aria-labelledby="integrated">
            <SectionTitle id="integrated" note="모든 결과를 하나로 맞추지 않고, 겹치는 부분과 다른 부분을 나눠 정리합니다.">
              통합 해석
            </SectionTitle>
            <IntegratedView integrated={report.integrated} />
          </section>

          <section aria-labelledby="actions">
            <SectionTitle id="actions">실천 제안</SectionTitle>
            <ActionList actions={report.actions} />
          </section>

          <div className="space-y-6 border-t border-line pt-8">
            <ReportDisclaimer />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/analyze" className={buttonPrimary}>
                내 분석 시작하기
              </Link>
              <Link href="/" className={buttonSecondary}>
                처음으로
              </Link>
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}
