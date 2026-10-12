import type { FullReport } from "@/lib/report/types";
import { DetailSections, SajuChart } from "./detail-sections";
import { ReportToc } from "./toc";
import { ItemsSection, PartnerSection, PlainReadingSection, QuestionsSection, SituationsSection } from "./extras-sections";
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
  const extras = report.extras;
  const toc = [
    { id: id("tendency"), label: "대표 경향 · 한 줄 요약" },
    { id: id("core"), label: "핵심 요약" },
    ...(extras?.plain ? [{ id: id("plain"), label: "사주 — 그래서 어떤 사람일까요" }] : []),
    ...(extras?.questions.length ? [{ id: id("questions"), label: "내 원국이 던지는 질문과 답" }] : []),
    { id: id("scores"), label: "항목별 점수" },
    { id: id("details"), label: "네 가지 상세 분석" },
    ...(extras ? [{ id: id("situations"), label: "상황별 잘하는 점 · 주의할 점" }] : []),
    { id: id("integrated"), label: "통합 해석" },
    ...(extras?.partner ? [{ id: id("partner"), label: "어울리는 관계 조건" }] : []),
    ...(extras?.items ? [{ id: id("items"), label: "보완 아이템" }] : []),
    { id: id("actions"), label: "실천 제안" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 lg:grid lg:grid-cols-[200px_minmax(0,720px)] lg:gap-16 lg:py-14">
      <ReportToc items={toc} />

      <article className="min-w-0 space-y-16">
        <section aria-labelledby={id("tendency")}>
          <TendencyBlock summary={report} headingId={id("tendency")} />
        </section>

        <section aria-labelledby={id("core")}>
          <SectionTitle id={id("core")}>핵심 요약</SectionTitle>
          <CoreSummaryTable core={report.core} />
        </section>

        {extras?.plain && report.details.saju.saju.status !== "not-connected" && (
          <div className="space-y-10">
            <section aria-label="사주 원국">
              <SajuChart saju={report.details.saju.saju} />
            </section>
            <PlainReadingSection plain={extras.plain} id={id("plain")} />
          </div>
        )}

        {extras && extras.questions.length > 0 && <QuestionsSection questions={extras.questions} id={id("questions")} />}

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
          <DetailSections report={report} showChart={!extras?.plain} />
        </section>

        {extras && <SituationsSection situations={extras.situations} id={id("situations")} />}

        <section aria-labelledby={id("integrated")}>
          <SectionTitle id={id("integrated")} note="모든 결과를 하나로 맞추지 않고, 겹치는 부분과 다른 부분을 나눠 정리합니다.">
            통합 해석
          </SectionTitle>
          <IntegratedView integrated={report.integrated} />
        </section>

        {extras?.partner && <PartnerSection partner={extras.partner} id={id("partner")} />}
        {extras?.items && <ItemsSection items={extras.items} id={id("items")} />}

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
