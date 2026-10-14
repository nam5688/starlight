import { AdjustIcon, StrengthIcon } from "@/components/ui/icons";
import type { Evidence } from "@/lib/report/evidence";
import { SECTION_PLAN, type Paragraph, type PersonalReportV2 } from "@/lib/report/v2/types";
import { BASE_TERMS, glossaryFor, withHanja } from "@/lib/saju/glossary";
import { SajuChart } from "./detail-sections";
import { EvidenceDetails, ParagraphBlock } from "./evidence-details";
import { ItemsSection, PartnerSection, PlainReadingSection, QuestionsSection, SituationsSection } from "./extras-sections";
import { ActionList } from "./integrated-view";
import { Fold, FoldRow } from "./reading-parts";
import { FoldedRest, ReportShell } from "./report-shell";
import { CoreSummaryTable, SCORE_NOTE, ScoreGroups, SectionTitle, TendencyBlock } from "./summary-blocks";

/** 문단 묶음 — 첫 문단만 보이고 나머지는 접는다. 문단마다 "분석 근거 보기"가 붙는다 */
export function ParagraphGroup({ paragraphs, evidence, restLabel }: { paragraphs: Paragraph[]; evidence: Map<string, Evidence>; restLabel?: string }) {
  const [first, ...rest] = paragraphs;
  if (!first) return null;
  return (
    <div>
      <ParagraphBlock paragraph={first} evidence={evidence} />
      <FoldedRest count={rest.length} label={restLabel}>
        {rest.map((p, i) => (
          <ParagraphBlock key={i} paragraph={p} evidence={evidence} />
        ))}
      </FoldedRest>
    </div>
  );
}

/**
 * 개인 종합 리포트 v2 — 사주(원국 · 대운 · 세운) 중심의 인물 해석. 저장된 문단은 바꾸지 않고 보이는 방식만 정한다:
 * 핵심 요약 → 주제 이동 막대 → 첫 문단과 접힌 자세한 풀이 → 문단마다 접힌 분석 근거.
 * idPrefix: 화면마다 HTML id가 겹치지 않게 붙인다.
 */
export function PersonalV2View({
  report,
  idPrefix = "",
  footer,
}: {
  report: PersonalReportV2;
  idPrefix?: string;
  footer?: React.ReactNode;
}) {
  const id = (name: string) => `${idPrefix}${name}`;
  const evidence = new Map(report.evidence.map((e) => [e.id, e]));
  const sectionTitle = (sid: string) => SECTION_PLAN.find((s) => s.id === sid)?.title ?? sid;
  const focus = report.focus ?? [];
  const usedIds = [
    ...report.summary,
    ...report.sections.flatMap((s) => s.paragraphs),
    ...report.timeline,
    ...report.differences,
    ...report.actions,
    ...focus,
  ].flatMap((p) => p.evidence);
  // 원국 표를 읽는 기본 용어는 원국 표 아래에 있으므로, 여기서는 그 밖의 용어만 풀이한다
  const glossary = glossaryFor(report.evidence, usedIds).filter((g) => !BASE_TERMS.includes(g.term));
  const base = report.base;
  const extras = report.extras;
  const firstSection = report.sections[0];
  const nav = [
    { id: id("v2-summary"), label: "전체 요약" },
    { id: id("v2-chart"), label: "사주 풀이" },
    ...(firstSection ? [{ id: id(`v2-${firstSection.id}`), label: "주제별" }] : []),
    ...(report.timeline.length ? [{ id: id("v2-timeline"), label: "시기 흐름" }] : []),
    { id: id("v2-actions"), label: "실천" },
    { id: id("v2-basis"), label: "근거 · 기준" },
  ];

  return (
    <ReportShell nav={nav}>
      <section aria-labelledby={id("v2-summary")}>
        <p id={id("v2-summary")} className="scroll-mt-[44px] text-[13px] font-semibold text-accent md:scroll-mt-[52px]">
          핵심 구조
        </p>
        <h2 className="mt-1.5 text-[22px] leading-[1.4] font-bold tracking-tight md:text-[28px]">{report.headline}</h2>
        <div className="mt-4">
          <ParagraphGroup paragraphs={report.summary} evidence={evidence} restLabel="핵심 구조 이어서 보기" />
        </div>
      </section>

      {base && (
        <section aria-labelledby={id("v2-tendency")}>
          <TendencyBlock summary={base} headingId={id("v2-tendency")} />
          <div className="mt-6">
            <CoreSummaryTable core={base.core} />
          </div>
        </section>
      )}

      {focus.length > 0 && (
        <section aria-labelledby={id("v2-focus")}>
          <SectionTitle
            id={id("v2-focus")}
            note={
              report.basis.context
                ? `최근 알려 주신 내용(${report.basis.context.topicLabel}${report.basis.context.fields.length ? ` · ${report.basis.context.fields.join(", ")}` : ""})을 반영해 해석의 초점과 예시를 골랐습니다. 사주 계산은 그대로이며, 알려 주신 이야기를 사주로 알아낸 것이 아닙니다.`
                : "알려 주신 고민을 반영해 해석의 초점과 예시를 골랐습니다. 사주 계산은 그대로입니다."
            }
          >
            알려 주신 고민까지 반영한 해석
          </SectionTitle>
          <ParagraphGroup paragraphs={focus} evidence={evidence} />
        </section>
      )}

      <section aria-labelledby={id("v2-chart")}>
        <SectionTitle id={id("v2-chart")} note="아래 해석은 모두 이 계산 결과에서 출발합니다.">
          사주 원국
        </SectionTitle>
        <FoldRow>
          <Fold label="원국 표와 오행 분포 보기" hint="천간 · 지지 표, 오행 개수, 표 읽는 법" wide>
            <SajuChart saju={report.saju} />
          </Fold>
        </FoldRow>
      </section>

      {extras?.plain && <PlainReadingSection plain={extras.plain} id={id("v2-plain")} />}
      {extras && extras.questions.length > 0 && <QuestionsSection questions={extras.questions} id={id("v2-questions")} />}

      {report.sections.map((s) => (
        <section key={s.id} aria-labelledby={id(`v2-${s.id}`)}>
          <SectionTitle id={id(`v2-${s.id}`)}>{sectionTitle(s.id)}</SectionTitle>
          <ParagraphGroup paragraphs={s.paragraphs} evidence={evidence} />
        </section>
      ))}

      {extras && <SituationsSection situations={extras.situations} id={id("v2-situations")} />}

      {report.timeline.length > 0 && (
        <section aria-labelledby={id("v2-timeline")}>
          <SectionTitle
            id={id("v2-timeline")}
            note="계산된 대운 · 세운에 전통적으로 두드러지는 주제입니다. 특정 사건이나 날짜를 예언하지 않습니다."
          >
            시기의 흐름
          </SectionTitle>
          <FoldRow>
            {report.timeline.map((t) => (
              <Fold key={t.period} label={t.period} hint={t.theme} wide>
                <div className="space-y-5">
                  <div className="border-l-[3px] border-positive-fill pl-3.5">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-positive">
                      <StrengthIcon />
                      살릴 기회
                    </p>
                    <p className="mt-1 text-[15px] leading-[1.75]">{t.opportunity}</p>
                  </div>
                  <div className="border-l-[3px] border-caution pl-3.5">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-caution">
                      <AdjustIcon />
                      살펴볼 점
                    </p>
                    <p className="mt-1 text-[15px] leading-[1.75]">{t.caution}</p>
                  </div>
                </div>
                <EvidenceDetails ids={t.evidence} evidence={evidence} />
              </Fold>
            ))}
          </FoldRow>
        </section>
      )}

      {extras?.partner && <PartnerSection partner={extras.partner} id={id("v2-partner")} />}
      {extras?.items && <ItemsSection items={extras.items} id={id("v2-items")} />}

      {report.differences.length > 0 && (
        <section aria-labelledby={id("v2-differences")}>
          <SectionTitle id={id("v2-differences")} note="두 결과를 하나로 맞추지 않고, 다르게 나온 부분을 그대로 적었습니다.">
            사주와 응답이 다른 부분
          </SectionTitle>
          <ParagraphGroup paragraphs={report.differences} evidence={evidence} />
        </section>
      )}

      <section aria-labelledby={id("v2-actions")}>
        <SectionTitle id={id("v2-actions")}>상황별 실천</SectionTitle>
        {extras && extras.starterActions.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-3 text-[15px] font-semibold text-ink-2">바로 해볼 3가지</h3>
            <ActionList actions={extras.starterActions} />
          </div>
        )}
        <ol className="space-y-3">
          {report.actions.map((a, i) => (
            <li key={i} className="rounded-xl border border-line bg-canvas px-4 py-4">
              <p className="text-[13px] font-semibold text-ink-3">{a.situation}</p>
              <p className="mt-1.5 text-[15px] leading-[1.75]">{a.action}</p>
              <EvidenceDetails ids={a.evidence} evidence={evidence} />
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby={id("v2-basis")}>
        <SectionTitle id={id("v2-basis")} note="점수 · 용어 · 계산 기준은 접어 두었습니다.">
          근거와 기준
        </SectionTitle>
        <FoldRow>
          {base && (
            <Fold label="항목별 점수 보기" hint="0~100은 응답 환산값이며 백분위나 정확도가 아닙니다" wide>
              <p className="mb-5 text-[13px] leading-[1.65] text-ink-3">{SCORE_NOTE}</p>
              <ScoreGroups summary={base} />
            </Fold>
          )}
          {glossary.length > 0 && (
            <Fold label="사주 용어 풀이" hint="원국 · 천간 · 지지 · 일간 · 오행은 원국 표의 ‘표 읽는 법’에 있습니다" wide>
              <dl className="divide-y divide-line">
                {glossary.map((g) => (
                  <div key={g.term} className="py-4 first:pt-0 last:pb-0">
                    <dt className="text-[15px] font-semibold">{withHanja(g)}</dt>
                    <dd className="mt-1 text-[14px] leading-[1.7] text-ink-2">
                      <span className="text-ink-3">한자 뜻 </span>
                      {g.literal}
                      <span className="mt-0.5 block text-ink">{g.plain}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Fold>
          )}
          <Fold label="계산 · 해석 기준" hint={`해석 기준일 ${report.basis.referenceDate} (한국 시간)`} wide>
            <div className="space-y-3 text-[14px] leading-[1.7] text-ink-2">
              <p>
                사주는 만세력 계산 결과(원국 · 대운 · 세운)만 쓰고, 성향 응답은 생활 속 모습을 설명하는 보조 근거로만 씁니다. 두 결과의 점수를 합산하지 않으며, 응답 때문에 사주 시기 해석을 바꾸지 않습니다.
              </p>
              <p>
                만세력 계산이 정확하다는 것이 미래 예측이 맞는다는 뜻은 아닙니다. 시기 해석은 전통적인 주제이며, 해석 규칙은 초안으로 전문가 검토 전입니다. 이 리포트는 자기 이해를 돕는 참고 자료이며 의학적 · 심리학적 진단을 대신하지 않습니다.
              </p>
              <p className="text-[13px] text-ink-3">규칙 {report.basis.ruleVersions.join(" · ")}</p>
              {report.basis.lines.length > 0 && <p className="text-[13px] text-ink-3">{report.basis.lines.join(" · ")}</p>}
            </div>
          </Fold>
        </FoldRow>
        {footer && <div className="mt-8 border-t border-line pt-6 text-[14px]">{footer}</div>}
      </section>
    </ReportShell>
  );
}
