import { ChevronIcon, InfoIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/source-badge";
import { COMPAT_SECTIONS } from "@/lib/report/compat/plan";
import type { CompatReport } from "@/lib/report/compat/types";

const AREA_LABEL = Object.fromEntries(COMPAT_SECTIONS.map((s) => [s.id, s.topic]));

/**
 * 사주 궁합 리포트(유료 · 아직 판매하지 않음) 화면 — 위쪽의 커플 유형 · 궁합 지수 · 핵심 한 줄은 무료 간단 궁합과 같은 엔진 결과(코드가 채움)이고, 아래 풀이만 AI가 쓴 본문이다.
 * 지금은 개발용 화면(/dev/compat)에서만 쓴다. 모의 작성기의 자리 표시 글(report.placeholder)이면 그렇다고 표시한다.
 */
export function CompatReportView({ report }: { report: CompatReport }) {
  const s = report.summary;
  return (
    <article aria-label="사주 궁합 풀이" className="space-y-5">
      {report.placeholder && (
        <p role="note" className="rounded-xl bg-caution-soft px-4 py-3 text-[14px] leading-[1.7] text-caution">
          모의 작성기의 자리 표시 글이에요. 실제 풀이가 아니고 판매할 수 없는 글이에요.
        </p>
      )}

      <div className="rounded-2xl bg-canvas p-6 text-center shadow-soft md:p-8">
        <p className="text-[14px] font-medium text-ink-3">
          {report.names.a} × {report.names.b}
        </p>
        <h2 className="mt-2 text-[26px] leading-tight font-bold tracking-tight text-accent-strong md:text-[32px]">{s.typeName}</h2>
        <p className="mx-auto mt-3 max-w-[30rem] text-[16px] leading-[1.65] text-ink">{s.typeLine}</p>
        <div className="mt-5 border-t border-line pt-5">
          <p className="text-[13px] font-semibold text-ink-3">궁합 지수</p>
          <p className="mt-1 text-[48px] leading-none font-bold tracking-tight text-ink tabular-nums" aria-label={`궁합 지수 ${s.score}`}>
            {s.score}
          </p>
          <p className="mx-auto mt-3 max-w-[30rem] text-[14px] leading-[1.7] text-ink-2">{s.scoreMeaning}</p>
          <p className="mx-auto mt-2 max-w-[30rem] text-[13px] leading-[1.7] text-ink-3">{s.scoreNotProbability}</p>
        </div>
        <p className="mx-auto mt-5 max-w-[30rem] rounded-xl bg-accent-soft px-4 py-3 text-[15px] leading-[1.65] font-semibold text-accent-strong">
          <span className="block text-[13px] font-semibold text-accent">우리 커플 핵심</span>
          {s.core}
        </p>
      </div>

      <div className="px-1">
        <p className="text-[13px] font-semibold text-accent">사주 궁합 풀이</p>
        <h2 className="mt-1 text-[22px] leading-snug font-bold tracking-tight md:text-[26px]">{report.headline}</h2>
      </div>

      {report.sections.map((sec, i) => (
        <section key={sec.id} aria-labelledby={`compat-sec-${sec.id}`} className="rounded-2xl bg-canvas p-5 shadow-soft md:p-6">
          <p className="text-[13px] font-semibold text-accent">
            {i + 1}. {sec.topic}
          </p>
          <h3 id={`compat-sec-${sec.id}`} className="mt-1 text-[18px] leading-snug font-bold">
            {sec.headline}
          </h3>
          <div className="mt-3 space-y-3 text-[16px] leading-[1.75] text-ink-2">
            {sec.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="compat-actions" className="rounded-2xl bg-canvas p-5 shadow-soft md:p-6">
        <h3 id="compat-actions" className="text-[18px] font-bold">
          두 분이 해 볼 수 있는 것
        </h3>
        <ul className="mt-3 space-y-4">
          {report.actions.map((a) => (
            <li key={a.title}>
              <p className="text-[13px] font-semibold text-ink-3">{AREA_LABEL[a.area]}</p>
              <p className="mt-0.5 text-[16px] font-semibold">{a.title}</p>
              <p className="mt-1 text-[15px] leading-[1.75] text-ink-2">{a.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="rounded-2xl bg-canvas p-5 shadow-soft md:p-6">
        {report.notes.cautions.map((c) => (
          <p key={c} className="mb-3 flex gap-2 text-[13px] leading-[1.7] text-ink-3">
            <InfoIcon className="mt-1 size-4 shrink-0" />
            <span>{c}</span>
          </p>
        ))}
        <ul className="space-y-1.5 text-[13px] leading-[1.7] text-ink-3">
          {report.notes.items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <details className="group mt-4 border-y border-line">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[15px] font-semibold hover:text-accent [&::-webkit-details-marker]:hidden">
            궁합 지수는 이렇게 계산했어요
            <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="pb-4 text-[14px] leading-[1.75] text-ink-2">
            <p>{s.scoreBasis}</p>
            {s.parts.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {s.parts.map((b) => (
                  <li key={b.label}>
                    <span className="font-semibold text-ink">{b.label}</span> — {b.direction}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
        <p className="mt-4 text-[12px] leading-[1.7] text-ink-3">{report.notes.page}</p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <StatusBadge>{report.generated.provider === "mock" ? "모의 작성기" : "대리 작성기(실제 서비스 AI 아님)"}</StatusBadge>
          <span>
            규칙 {report.ruleVersion} · 지시문 {report.promptVersion}
          </span>
        </p>
      </div>
    </article>
  );
}
