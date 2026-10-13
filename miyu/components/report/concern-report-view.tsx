import { formatDateTime } from "@/components/ui/format";
import type { ConcernReportV1 } from "@/lib/report/concern/types";
import { BASE_TERMS, glossaryFor, withHanja } from "@/lib/saju/glossary";
import { EvidenceDetails, ParagraphBlock } from "./evidence-details";
import { SectionTitle } from "./summary-blocks";
import { ReportToc } from "./toc";

/**
 * 내 고민 반영 리포트 — 개인 종합 리포트와 별개로, 발급 당시 적은 고민 하나에 답하는 해석.
 * 고민 내용 자체는 여기 싣지 않는다 (나의 고민 기록소의 기록에서 본인만 본다). 문단마다 "근거 보기"로 사주 · 응답 근거를 펼쳐 볼 수 있다.
 * idPrefix: 화면마다 HTML id가 겹치지 않게 붙인다.
 */
export function ConcernReportView({ report, idPrefix = "", footer }: { report: ConcernReportV1; idPrefix?: string; footer?: React.ReactNode }) {
  const id = (name: string) => `${idPrefix}${name}`;
  const evidence = new Map(report.evidence.map((e) => [e.id, e]));
  const usedIds = [...report.understanding, ...report.pattern, ...report.situations, ...report.timeline, ...report.differences, ...report.actions].flatMap((p) => p.evidence);
  const glossary = glossaryFor(report.evidence, usedIds).filter((g) => !BASE_TERMS.includes(g.term));
  const { concern } = report.basis;
  const toc = [
    { id: id("c-understanding"), label: "알려 주신 고민을 이렇게 읽었어요" },
    { id: id("c-pattern"), label: "이 고민이 반복되는 구조" },
    { id: id("c-situations"), label: "상황별 해석과 해 볼 선택" },
    ...(report.timeline.length ? [{ id: id("c-timeline"), label: "이 고민에서 본 시기의 흐름" }] : []),
    ...(report.differences.length ? [{ id: id("c-differences"), label: "사주와 응답이 다른 부분" }] : []),
    { id: id("c-actions"), label: "이 고민을 위한 실천" },
    ...(glossary.length ? [{ id: id("c-glossary"), label: "사주 용어 풀이" }] : []),
    { id: id("c-basis"), label: "반영한 고민 · 해석 기준" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 lg:grid lg:grid-cols-[200px_minmax(0,720px)] lg:gap-16 lg:py-14">
      <ReportToc items={toc} />

      <article className="min-w-0 space-y-16">
        <section aria-labelledby={id("c-understanding")}>
          <p id={id("c-understanding")} className="text-[14px] font-semibold text-accent">
            알려 주신 고민 · {concern.topicLabel}
          </p>
          <h2 className="mt-2 text-[24px] font-bold leading-snug tracking-tight md:text-[28px]">{report.headline}</h2>
          <div className="mt-6 space-y-6">
            {report.understanding.map((p, i) => (
              <ParagraphBlock key={i} paragraph={p} evidence={evidence} />
            ))}
          </div>
        </section>

        <section aria-labelledby={id("c-pattern")}>
          <SectionTitle id={id("c-pattern")} note="원국 · 대운과 응답에서 이 고민이 이 사람에게 왜 이런 모양으로 되풀이되는지 읽었습니다.">
            이 고민이 반복되는 구조
          </SectionTitle>
          <div className="space-y-6">
            {report.pattern.map((p, i) => (
              <ParagraphBlock key={i} paragraph={p} evidence={evidence} />
            ))}
          </div>
        </section>

        <section aria-labelledby={id("c-situations")}>
          <SectionTitle id={id("c-situations")} note="알려 주신 상황마다 왜 그렇게 되는지와, 해 볼 수 있는 선택을 따로 적었습니다. 결정을 대신하지 않습니다.">
            상황별 해석과 해 볼 선택
          </SectionTitle>
          <ol className="divide-y divide-line border-y border-line">
            {report.situations.map((s, i) => (
              <li key={i} className="py-6">
                <p className="text-[13px] font-semibold text-ink-3">상황 {i + 1}</p>
                <p className="mt-1 border-l-[3px] border-accent pl-3 text-[17px] font-semibold leading-snug">{s.situation}</p>
                <dl className="mt-4 grid gap-x-4 gap-y-3 text-[16px] leading-[1.75] sm:grid-cols-[88px_minmax(0,1fr)]">
                  <dt className="text-[14px] font-medium text-ink-3 sm:pt-0.5">이렇게 읽어요</dt>
                  <dd className="text-ink">{s.reading}</dd>
                  <dt className="text-[14px] font-medium text-ink-3 sm:pt-0.5">해 볼 선택</dt>
                  <dd className="text-ink">{s.suggestion}</dd>
                </dl>
                <EvidenceDetails ids={s.evidence} evidence={evidence} />
              </li>
            ))}
          </ol>
        </section>

        {report.timeline.length > 0 && (
          <section aria-labelledby={id("c-timeline")}>
            <SectionTitle id={id("c-timeline")} note="계산된 대운 · 세운에 전통적으로 두드러지는 주제를 이 고민의 관점에서 읽었습니다. 특정 사건이나 날짜를 예언하지 않습니다.">
              이 고민에서 본 시기의 흐름
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

        {report.differences.length > 0 && (
          <section aria-labelledby={id("c-differences")}>
            <SectionTitle id={id("c-differences")} note="두 결과를 하나로 맞추지 않고, 이 고민에서 다르게 나온 부분을 그대로 적었습니다.">
              사주와 응답이 다른 부분
            </SectionTitle>
            <div className="space-y-6">
              {report.differences.map((p, i) => (
                <ParagraphBlock key={i} paragraph={p} evidence={evidence} />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby={id("c-actions")}>
          <SectionTitle id={id("c-actions")} note="언제 · 얼마나 · 무엇을 하는지가 보이는 행동으로 적었습니다. 하나씩, 할 수 있는 것부터 해 보세요.">
            이 고민을 위한 실천
          </SectionTitle>
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

        {glossary.length > 0 && (
          <section aria-labelledby={id("c-glossary")}>
            <SectionTitle id={id("c-glossary")} note="이 리포트에 나온 사주 용어를 한자 뜻과 쉬운 말로 풀었습니다.">
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
        )}

        <section aria-labelledby={id("c-basis")} className="space-y-3 border-t border-line pt-8 text-[13px] leading-relaxed text-ink-3">
          <h2 id={id("c-basis")} className="text-[15px] font-semibold text-ink-2">
            반영한 고민 · 해석 기준
          </h2>
          <p>
            이 리포트는 {formatDateTime(concern.writtenAt)}에 적어 주신 &lsquo;{concern.topicLabel}&rsquo; 고민
            {concern.fields.length ? `(${concern.fields.join(", ")})` : ""}을 반영해 발급한 별도 리포트입니다. 이후에 고민을 고쳐도 이 리포트는 바뀌지 않고, 기존 개인 종합 리포트도 그대로 있습니다.
          </p>
          <p>
            알려 주신 이야기는 해석의 초점으로만 썼고, 사주로 알아낸 것이 아닙니다. 사주 계산(원국 · 대운 · 세운)은 그대로이며, 응답 때문에 사주 시기 해석을 바꾸지 않습니다. 사주와 응답 점수를 합산하지 않습니다.
          </p>
          <p>시기 해석은 전통적인 주제이며 미래 예측이 맞는다는 뜻이 아닙니다. 해석 규칙은 초안으로 전문가 검토 전이고, 이 리포트는 자기 이해를 돕는 참고 자료로 의학적 · 심리학적 · 법률적 판단을 대신하지 않습니다.</p>
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
