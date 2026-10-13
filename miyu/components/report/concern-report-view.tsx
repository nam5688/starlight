import { AdjustIcon, StrengthIcon } from "@/components/ui/icons";
import { formatDateTime } from "@/components/ui/format";
import type { ConcernReportV1 } from "@/lib/report/concern/types";
import { BASE_TERMS, glossaryFor, withHanja } from "@/lib/saju/glossary";
import { EvidenceDetails } from "./evidence-details";
import { ParagraphGroup } from "./personal-v2-view";
import { Fold, FoldRow } from "./reading-parts";
import { ReportShell } from "./report-shell";
import { SectionTitle } from "./summary-blocks";

/**
 * 내 고민 반영 리포트 — 개인 종합 리포트와 별개로, 발급 당시 적은 고민 하나에 답하는 해석. 저장된 내용은 바꾸지 않고 보이는 방식만 정한다.
 * 고민 내용 자체는 여기 싣지 않는다 (나의 고민 기록소의 기록에서 본인만 본다). 문단마다 접힌 "분석 근거 보기"로 사주 · 응답 근거를 펼쳐 볼 수 있다.
 * idPrefix: 화면마다 HTML id가 겹치지 않게 붙인다.
 */
export function ConcernReportView({ report, idPrefix = "", footer }: { report: ConcernReportV1; idPrefix?: string; footer?: React.ReactNode }) {
  const id = (name: string) => `${idPrefix}${name}`;
  const evidence = new Map(report.evidence.map((e) => [e.id, e]));
  const usedIds = [...report.understanding, ...report.pattern, ...report.situations, ...report.timeline, ...report.differences, ...report.actions].flatMap((p) => p.evidence);
  const glossary = glossaryFor(report.evidence, usedIds).filter((g) => !BASE_TERMS.includes(g.term));
  const { concern } = report.basis;
  const nav = [
    { id: id("c-understanding"), label: "전체 요약" },
    { id: id("c-pattern"), label: "반복 구조" },
    { id: id("c-situations"), label: "상황별" },
    ...(report.timeline.length ? [{ id: id("c-timeline"), label: "시기 흐름" }] : []),
    { id: id("c-actions"), label: "실천" },
    { id: id("c-basis"), label: "근거 · 기준" },
  ];

  return (
    <ReportShell nav={nav}>
      <section aria-labelledby={id("c-understanding")}>
        <p id={id("c-understanding")} className="scroll-mt-[44px] flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold text-accent md:scroll-mt-[52px]">
          알려 주신 고민 · {concern.topicLabel}
          <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[12px] text-accent-strong">새 고민 반영</span>
        </p>
        <h2 className="mt-1.5 text-[22px] leading-[1.4] font-bold tracking-tight md:text-[28px]">{report.headline}</h2>
        <div className="mt-4">
          <ParagraphGroup paragraphs={report.understanding} evidence={evidence} restLabel="이어서 보기" />
        </div>
      </section>

      <section aria-labelledby={id("c-pattern")}>
        <SectionTitle id={id("c-pattern")} note="원국 · 대운과 응답에서 이 고민이 이 사람에게 왜 이런 모양으로 되풀이되는지 읽었습니다.">
          이 고민이 반복되는 구조
        </SectionTitle>
        <ParagraphGroup paragraphs={report.pattern} evidence={evidence} />
      </section>

      <section aria-labelledby={id("c-situations")}>
        <SectionTitle id={id("c-situations")} note="알려 주신 상황마다 왜 그렇게 되는지와, 해 볼 수 있는 선택을 따로 적었습니다. 결정을 대신하지 않습니다.">
          상황별 해석과 해 볼 선택
        </SectionTitle>
        <FoldRow>
          {report.situations.map((s, i) => (
            <Fold key={i} label={`상황 ${i + 1}`} hint={s.situation} wide>
              <div className="space-y-5">
                <div className="border-l-[3px] border-line-strong pl-3.5">
                  <p className="text-[13px] font-semibold text-ink-3">이렇게 읽어요</p>
                  <p className="mt-1 text-[15px] leading-[1.75]">{s.reading}</p>
                </div>
                <div className="border-l-[3px] border-accent pl-3.5">
                  <p className="text-[13px] font-semibold text-accent-strong">해 볼 선택</p>
                  <p className="mt-1 text-[15px] leading-[1.75]">{s.suggestion}</p>
                </div>
              </div>
              <EvidenceDetails ids={s.evidence} evidence={evidence} />
            </Fold>
          ))}
        </FoldRow>
      </section>

      {report.timeline.length > 0 && (
        <section aria-labelledby={id("c-timeline")}>
          <SectionTitle id={id("c-timeline")} note="계산된 대운 · 세운에 전통적으로 두드러지는 주제를 이 고민의 관점에서 읽었습니다. 특정 사건이나 날짜를 예언하지 않습니다.">
            이 고민에서 본 시기의 흐름
          </SectionTitle>
          <FoldRow>
            {report.timeline.map((t) => (
              <Fold key={t.period} label={t.period} hint={t.theme} wide>
                <div className="space-y-5">
                  <div className="border-l-[3px] border-positive pl-3.5">
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

      {report.differences.length > 0 && (
        <section aria-labelledby={id("c-differences")}>
          <SectionTitle id={id("c-differences")} note="두 결과를 하나로 맞추지 않고, 이 고민에서 다르게 나온 부분을 그대로 적었습니다.">
            사주와 응답이 다른 부분
          </SectionTitle>
          <ParagraphGroup paragraphs={report.differences} evidence={evidence} />
        </section>
      )}

      <section aria-labelledby={id("c-actions")}>
        <SectionTitle id={id("c-actions")} note="언제 · 얼마나 · 무엇을 하는지가 보이는 행동으로 적었습니다. 하나씩, 할 수 있는 것부터 해 보세요.">
          이 고민을 위한 실천
        </SectionTitle>
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

      <section aria-labelledby={id("c-basis")}>
        <SectionTitle id={id("c-basis")} note="반영한 고민 · 용어 · 해석 기준은 접어 두었습니다.">
          근거와 기준
        </SectionTitle>
        <FoldRow>
          {glossary.length > 0 && (
            <Fold label="사주 용어 풀이" hint="이 리포트에 나온 용어를 한자 뜻과 쉬운 말로 풀었습니다" wide>
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
          <Fold label="반영한 고민 · 해석 기준" hint={`해석 기준일 ${report.basis.referenceDate} (한국 시간)`} wide>
            <div className="space-y-3 text-[14px] leading-[1.7] text-ink-2">
              <p>
                이 리포트는 {formatDateTime(concern.writtenAt)}에 적어 주신 &lsquo;{concern.topicLabel}&rsquo; 고민
                {concern.fields.length ? `(${concern.fields.join(", ")})` : ""}을 반영해 발급한 별도 리포트입니다. 이후에 고민을 고쳐도 이 리포트는 바뀌지 않고, 기존 개인 종합 리포트도 그대로 있습니다.
              </p>
              <p>
                알려 주신 이야기는 해석의 초점으로만 썼고, 사주로 알아낸 것이 아닙니다. 사주 계산(원국 · 대운 · 세운)은 그대로이며, 응답 때문에 사주 시기 해석을 바꾸지 않습니다. 사주와 응답 점수를 합산하지 않습니다.
              </p>
              <p>시기 해석은 전통적인 주제이며 미래 예측이 맞는다는 뜻이 아닙니다. 해석 규칙은 초안으로 전문가 검토 전이고, 이 리포트는 자기 이해를 돕는 참고 자료로 의학적 · 심리학적 · 법률적 판단을 대신하지 않습니다.</p>
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
