import type { Evidence } from "@/lib/report/evidence";
import { SECTION_PLAN, type Paragraph, type PersonalReportV2 } from "@/lib/report/v2/types";
import { BASE_TERMS, glossaryFor, withHanja } from "@/lib/saju/glossary";
import { SajuChart } from "./detail-sections";
import { ReportToc } from "./toc";
import { ItemsSection, PartnerSection, PlainReadingSection, QuestionsSection, SituationsSection } from "./extras-sections";
import { ActionList } from "./integrated-view";
import { CoreSummaryTable, SCORE_NOTE, ScoreGroups, SectionTitle, TendencyBlock } from "./summary-blocks";

const SOURCE_LABEL: Record<Evidence["source"], string> = {
  saju: "사주 계산",
  survey: "미유 응답",
  self: "본인 입력",
};

/**
 * 개인 종합 리포트 v2 — 사주(원국 · 대운 · 세운) 중심의 인물 해석.
 * 문단마다 "근거 보기"로 어떤 계산 · 응답을 근거로 썼는지 펼쳐 볼 수 있다.
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
  const toc = [
    { id: id("v2-summary"), label: "핵심 구조" },
    ...(base ? [{ id: id("v2-tendency"), label: "대표 경향 · 핵심 요약" }] : []),
    ...(focus.length ? [{ id: id("v2-focus"), label: "알려 주신 고민까지 반영한 해석" }] : []),
    { id: id("v2-chart"), label: "사주 원국" },
    ...(extras?.plain ? [{ id: id("v2-plain"), label: "그래서 어떤 사람일까요" }] : []),
    ...(extras?.questions.length ? [{ id: id("v2-questions"), label: "내 원국이 던지는 질문과 답" }] : []),
    ...report.sections.map((s) => ({ id: id(`v2-${s.id}`), label: sectionTitle(s.id) })),
    ...(extras ? [{ id: id("v2-situations"), label: "상황별 잘하는 점 · 주의할 점" }] : []),
    ...(report.timeline.length ? [{ id: id("v2-timeline"), label: "시기의 흐름" }] : []),
    ...(extras?.partner ? [{ id: id("v2-partner"), label: "어울리는 관계 조건" }] : []),
    ...(extras?.items ? [{ id: id("v2-items"), label: "보완 아이템" }] : []),
    ...(base ? [{ id: id("v2-scores"), label: "항목별 점수" }] : []),
    ...(report.differences.length ? [{ id: id("v2-differences"), label: "사주와 응답이 다른 부분" }] : []),
    { id: id("v2-actions"), label: "상황별 실천" },
    { id: id("v2-glossary"), label: "사주 용어 풀이" },
    { id: id("v2-basis"), label: "계산 · 해석 기준" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 lg:grid lg:grid-cols-[200px_minmax(0,720px)] lg:gap-16 lg:py-14">
      <ReportToc items={toc} />

      <article className="min-w-0 space-y-16">
        <section aria-labelledby={id("v2-summary")}>
          <p id={id("v2-summary")} className="text-[14px] font-semibold text-accent">
            핵심 구조
          </p>
          <h2 className="mt-2 text-[24px] font-bold leading-snug tracking-tight md:text-[28px]">{report.headline}</h2>
          <div className="mt-6 space-y-6">
            {report.summary.map((p, i) => (
              <ParagraphBlock key={i} paragraph={p} evidence={evidence} />
            ))}
          </div>
        </section>

        {base && (
          <section aria-labelledby={id("v2-tendency")} className="space-y-8">
            <TendencyBlock summary={base} headingId={id("v2-tendency")} />
            <CoreSummaryTable core={base.core} />
          </section>
        )}

        {focus.length > 0 && (
          <section aria-labelledby={id("v2-focus")} className="border-l-2 border-accent pl-4 md:pl-6">
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
            <div className="space-y-6">
              {focus.map((p, i) => (
                <ParagraphBlock key={i} paragraph={p} evidence={evidence} />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby={id("v2-chart")}>
          <SectionTitle id={id("v2-chart")} note="아래 해석은 모두 이 계산 결과에서 출발합니다.">
            사주 원국
          </SectionTitle>
          <SajuChart saju={report.saju} />
        </section>

        {extras?.plain && <PlainReadingSection plain={extras.plain} id={id("v2-plain")} />}
        {extras && extras.questions.length > 0 && <QuestionsSection questions={extras.questions} id={id("v2-questions")} />}

        {report.sections.map((s) => (
          <section key={s.id} aria-labelledby={id(`v2-${s.id}`)}>
            <SectionTitle id={id(`v2-${s.id}`)}>{sectionTitle(s.id)}</SectionTitle>
            <div className="space-y-6">
              {s.paragraphs.map((p, i) => (
                <ParagraphBlock key={i} paragraph={p} evidence={evidence} />
              ))}
            </div>
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
            <ol className="divide-y divide-line border-y border-line">
              {report.timeline.map((t) => (
                <li key={t.period} className="py-5">
                  <p className="text-[15px] font-semibold text-accent">{t.period}</p>
                  <p className="mt-1 text-[17px] font-semibold leading-snug">{t.theme}</p>
                  <dl className="mt-3 grid gap-x-4 gap-y-2 text-[15px] leading-relaxed sm:grid-cols-[88px_minmax(0,1fr)]">
                    <dt className="font-medium text-ink-3">살릴 기회</dt>
                    <dd className="text-ink-2">{t.opportunity}</dd>
                    <dt className="font-medium text-ink-3">살펴볼 점</dt>
                    <dd className="text-ink-2">{t.caution}</dd>
                  </dl>
                  <EvidenceDetails ids={t.evidence} evidence={evidence} />
                </li>
              ))}
            </ol>
          </section>
        )}

        {extras?.partner && <PartnerSection partner={extras.partner} id={id("v2-partner")} />}
        {extras?.items && <ItemsSection items={extras.items} id={id("v2-items")} />}

        {base && (
          <section aria-labelledby={id("v2-scores")}>
            <SectionTitle id={id("v2-scores")} note={SCORE_NOTE}>
              항목별 점수
            </SectionTitle>
            <ScoreGroups summary={base} />
          </section>
        )}

        {report.differences.length > 0 && (
          <section aria-labelledby={id("v2-differences")}>
            <SectionTitle id={id("v2-differences")} note="두 결과를 하나로 맞추지 않고, 다르게 나온 부분을 그대로 적었습니다.">
              사주와 응답이 다른 부분
            </SectionTitle>
            <div className="space-y-6">
              {report.differences.map((p, i) => (
                <ParagraphBlock key={i} paragraph={p} evidence={evidence} />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby={id("v2-actions")}>
          <SectionTitle id={id("v2-actions")}>상황별 실천</SectionTitle>
          {extras && extras.starterActions.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-2 text-[15px] font-semibold text-ink-2">바로 해볼 3가지</h3>
              <ActionList actions={extras.starterActions} />
            </div>
          )}
          <ol className="divide-y divide-line border-y border-line">
            {report.actions.map((a, i) => (
              <li key={i} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6">
                <p className="text-[15px] font-medium text-ink-3">{a.situation}</p>
                <div>
                  <p className="text-[16px] leading-relaxed">{a.action}</p>
                  <EvidenceDetails ids={a.evidence} evidence={evidence} />
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby={id("v2-glossary")}>
          <SectionTitle id={id("v2-glossary")} note="이 리포트에 나온 사주 용어를 한자 뜻과 쉬운 말로 풀었습니다. 원국 · 천간 · 지지 · 일간 · 오행은 원국 표 아래 '표 읽는 법'에 있습니다.">
            사주 용어 풀이
          </SectionTitle>
          <dl className="divide-y divide-line border-y border-line">
            {glossary.map((g) => (
              <div key={g.term} className="grid gap-1 py-3.5 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-4">
                <dt className="text-[16px] font-semibold">{withHanja(g)}</dt>
                <dd className="text-[15px] leading-relaxed text-ink-2">
                  <span className="text-ink-3">한자 뜻 </span>
                  {g.literal}
                  <span className="block text-ink">{g.plain}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby={id("v2-basis")} className="space-y-3 border-t border-line pt-8 text-[13px] leading-relaxed text-ink-3">
          <h2 id={id("v2-basis")} className="text-[15px] font-semibold text-ink-2">
            계산 · 해석 기준
          </h2>
          <p>
            사주는 만세력 계산 결과(원국 · 대운 · 세운)만 쓰고, 성향 응답은 생활 속 모습을 설명하는 보조 근거로만 씁니다. 두 결과의 점수를
            합산하지 않으며, 응답 때문에 사주 시기 해석을 바꾸지 않습니다.
          </p>
          <p>
            만세력 계산이 정확하다는 것이 미래 예측이 맞는다는 뜻은 아닙니다. 시기 해석은 전통적인 주제이며, 해석 규칙은 초안으로 전문가 검토
            전입니다. 이 리포트는 자기 이해를 돕는 참고 자료이며 의학적 · 심리학적 진단을 대신하지 않습니다.
          </p>
          <p>
            해석 기준일 {report.basis.referenceDate} (한국 시간) · 규칙 {report.basis.ruleVersions.join(" · ")}
          </p>
          {report.basis.lines.length > 0 && <p>{report.basis.lines.join(" · ")}</p>}
          {footer && <div className="pt-4 text-[14px]">{footer}</div>}
        </section>
      </article>
    </div>
  );
}

function ParagraphBlock({ paragraph, evidence }: { paragraph: Paragraph; evidence: Map<string, Evidence> }) {
  return (
    <div>
      <p className="text-[16px] leading-[1.8] text-ink">{paragraph.text}</p>
      <EvidenceDetails ids={paragraph.evidence} evidence={evidence} />
    </div>
  );
}

function EvidenceDetails({ ids, evidence }: { ids: string[]; evidence: Map<string, Evidence> }) {
  const items = ids.map((i) => evidence.get(i)).filter((e): e is Evidence => Boolean(e));
  if (!items.length) return null;
  return (
    <details className="group mt-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[13px] font-medium text-accent">
        근거 보기 <span className="text-ink-3">({items.length})</span>
      </summary>
      <ul className="mt-2 space-y-1.5 border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink-2">
        {items.map((e) => (
          <li key={e.id}>
            <span className="mr-1.5 font-medium text-ink-3">{SOURCE_LABEL[e.source]}</span>
            {e.fact}
          </li>
        ))}
      </ul>
    </details>
  );
}
