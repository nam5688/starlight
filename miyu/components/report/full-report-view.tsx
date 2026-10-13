import type { FullReport } from "@/lib/report/types";
import { DetailSections, SajuChart } from "./detail-sections";
import { ItemsSection, PartnerSection, PlainReadingSection, QuestionsSection, SituationsSection } from "./extras-sections";
import { ActionList, IntegratedView, ReportDisclaimer } from "./integrated-view";
import { Fold, FoldRow } from "./reading-parts";
import { ReportShell } from "./report-shell";
import { CoreSummaryTable, SCORE_NOTE, ScoreGroups, SectionTitle, TendencyBlock } from "./summary-blocks";

/**
 * 개인 통합 리포트 본문. 리포트 예시와 구매한 리포트가 같은 화면을 쓴다. 저장된 내용은 그대로 두고 보이는 방식만 정한다.
 * 순서: 핵심 요약 → (주제 이동 막대) 사주 풀이 · 상황별 · 관계 · 실천 → 접어 둔 점수와 상세 분석(근거와 한계).
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
  const hasChart = report.details.saju.saju.status !== "not-connected";
  const nav = [
    { id: id("tendency"), label: "전체 요약" },
    ...(extras?.plain || hasChart ? [{ id: id(extras?.plain ? "plain" : "chart"), label: "사주 풀이" }] : []),
    ...(extras ? [{ id: id("situations"), label: "상황별" }] : []),
    ...(extras?.partner ? [{ id: id("partner"), label: "관계" }] : []),
    { id: id("actions"), label: "실천" },
    { id: id("scores"), label: "점수 · 근거" },
  ];

  return (
    <ReportShell nav={nav}>
      <section aria-labelledby={id("tendency")}>
        <TendencyBlock summary={report} headingId={id("tendency")} />
        <div className="mt-6">
          <CoreSummaryTable core={report.core} />
        </div>
      </section>

      {hasChart && (
        <div className="space-y-12">
          {extras?.plain && <PlainReadingSection plain={extras.plain} id={id("plain")} />}
          <section aria-labelledby={id("chart")}>
            <SectionTitle id={id("chart")} note="태어난 날짜와 시간으로 만세력에서 계산한 결과입니다.">
              사주 원국
            </SectionTitle>
            <FoldRow>
              <Fold label="원국 표와 오행 분포 보기" hint="천간 · 지지 표, 오행 개수, 표 읽는 법" wide>
                <SajuChart saju={report.details.saju.saju} />
              </Fold>
            </FoldRow>
          </section>
        </div>
      )}

      {extras && extras.questions.length > 0 && <QuestionsSection questions={extras.questions} id={id("questions")} />}

      {extras && <SituationsSection situations={extras.situations} id={id("situations")} />}

      {extras?.partner && <PartnerSection partner={extras.partner} id={id("partner")} />}
      {extras?.items && <ItemsSection items={extras.items} id={id("items")} />}

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

      <section aria-labelledby={id("scores")}>
        <SectionTitle id={id("scores")} note="점수와 영역별 근거 · 한계는 접어 두었습니다. 눌러서 펼쳐 보세요.">
          점수와 상세 분석
        </SectionTitle>
        <FoldRow>
          <Fold label="항목별 점수 보기" hint="0~100은 응답 환산값이며 백분위나 정확도가 아닙니다" wide>
            <p className="mb-5 text-[13px] leading-[1.65] text-ink-3">{SCORE_NOTE}</p>
            <ScoreGroups summary={report} />
          </Fold>
        </FoldRow>
        <div className="mt-2">
          <DetailSections report={report} showChart={false} />
        </div>
      </section>

      <div className="space-y-6 border-t border-line pt-8">
        <ReportDisclaimer />
        {footer}
      </div>
    </ReportShell>
  );
}
