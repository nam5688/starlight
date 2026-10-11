import type { FullReport } from "@/lib/report/types";
import { DetailSections } from "./detail-sections";
import { ActionList, IntegratedView, ReportDisclaimer } from "./integrated-view";
import { CoreSummaryTable, SCORE_NOTE, ScoreGroups, SectionTitle, TendencyBlock } from "./summary-blocks";

/**
 * 개인 통합 리포트 본문 (목차 + 7단계 구성). 리포트 예시와 구매한 리포트가 같은 화면을 쓴다.
 * idPrefix: 화면마다 HTML id가 겹치지 않게 붙인다 (Next.js는 이전 화면을 숨긴 채 남겨 둔다).
 */
export function FullReportView({
  report,
  idPrefix = "",
  footer,
}: {
  report: FullReport;
  idPrefix?: string;
  footer?: React.ReactNode;
}) {
  const id = (name: string) => `${idPrefix}${name}`;
  const toc = [
    { id: id("tendency"), label: "대표 경향 · 한 줄 요약" },
    { id: id("core"), label: "핵심 요약" },
    { id: id("scores"), label: "항목별 점수" },
    { id: id("details"), label: "네 가지 상세 분석" },
    { id: id("integrated"), label: "통합 해석" },
    { id: id("actions"), label: "실천 제안" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 lg:grid lg:grid-cols-[200px_minmax(0,720px)] lg:gap-16 lg:py-14">
      <nav aria-label="리포트 목차" className="hidden lg:block">
        <ol className="sticky top-28 space-y-1 border-l border-line text-[14px]">
          {toc.map((t, i) => (
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
        <section aria-labelledby={id("tendency")}>
          <TendencyBlock summary={report} headingId={id("tendency")} />
        </section>

        <section aria-labelledby={id("core")}>
          <SectionTitle id={id("core")}>핵심 요약</SectionTitle>
          <CoreSummaryTable core={report.core} />
        </section>

        <section aria-labelledby={id("scores")}>
          <SectionTitle id={id("scores")} note={SCORE_NOTE}>
            항목별 점수
          </SectionTitle>
          <ScoreGroups summary={report} />
        </section>

        <section aria-labelledby={id("details")}>
          <SectionTitle id={id("details")} note="영역마다 무엇을 근거로 봤는지와 한계를 함께 적었습니다.">
            네 가지 상세 분석
          </SectionTitle>
          <DetailSections report={report} />
        </section>

        <section aria-labelledby={id("integrated")}>
          <SectionTitle id={id("integrated")} note="모든 결과를 하나로 맞추지 않고, 겹치는 부분과 다른 부분을 나눠 정리합니다.">
            통합 해석
          </SectionTitle>
          <IntegratedView integrated={report.integrated} />
        </section>

        <section aria-labelledby={id("actions")}>
          <SectionTitle id={id("actions")}>실천 제안</SectionTitle>
          <ActionList actions={report.actions} />
        </section>

        <div className="space-y-6 border-t border-line pt-8">
          <ReportDisclaimer />
          {footer}
        </div>
      </article>
    </div>
  );
}
