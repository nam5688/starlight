import type { Metadata } from "next";
import Link from "next/link";
import { ScoreBar, SplitBar } from "@/components/bars";
import { levelOf, sampleReport } from "@/lib/report";

export const metadata: Metadata = {
  title: "결과 · 미유",
};

// 화면 순서: 대표 경향 → 한 줄 요약 → 항목별 점수 → 해석 근거 → 실천 제안
export default function ResultPage() {
  const report = sampleReport;
  const { saju, mbti, temperament, attachment } = report.scores;
  const sajuTotal = saju.elements.reduce((n, e) => n + e.count, 0);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-20">
      <div className="flex items-center justify-between pt-8 text-sm text-faint">
        <span>개인 통합 분석 리포트</span>
        <span>
          {report.isSample && (
            <span className="mr-2 rounded border border-line px-1.5 py-0.5 text-xs text-sub">
              샘플
            </span>
          )}
          <time dateTime={report.createdAt} className="tabular-nums">
            {report.createdAt.replaceAll("-", ".")}
          </time>
        </span>
      </div>

      {/* 1. 대표 경향 */}
      <section className="pt-8" aria-labelledby="headline">
        <p className="text-sm font-semibold text-sub">대표 경향</p>
        <h1 id="headline" className="mt-2 text-[26px] font-bold leading-snug tracking-tight sm:text-[30px]">
          {report.headline}
        </h1>
        <dl className="mt-6 grid grid-cols-2 border-t border-l border-line">
          {report.keyFacts.map((f) => (
            <div key={f.area} className="border-r border-b border-line px-4 py-3">
              <dt className="text-xs text-faint">{f.area}</dt>
              <dd className="mt-1 text-[15px] font-semibold leading-snug">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 2. 한 줄 요약 */}
      <section className="mt-10" aria-labelledby="summary">
        <h2 id="summary" className="text-sm font-semibold text-sub">
          한 줄 요약
        </h2>
        <p className="mt-2 border-l-2 border-ink pl-4 text-[17px] font-medium leading-relaxed">
          {report.summary}
        </p>
      </section>

      {/* 3. 항목별 점수 */}
      <section className="mt-12 border-t border-line pt-10" aria-labelledby="scores">
        <h2 id="scores" className="text-xl font-bold tracking-tight">
          항목별 점수
        </h2>

        <ScoreGroup title="사주" meta={`일간 ${saju.dayMaster}`}>
          {saju.elements.map((e) => (
            <ScoreBar
              key={e.name}
              label={e.name}
              value={e.count}
              max={sajuTotal}
              display={`${e.count}/${sajuTotal}`}
            />
          ))}
        </ScoreGroup>

        <ScoreGroup title="MBTI" meta={mbti.type}>
          {mbti.axes.map((a) => (
            <SplitBar key={a.left + a.right} left={a.left} right={a.right} leftPct={a.leftPct} />
          ))}
        </ScoreGroup>

        <ScoreGroup title="기질" meta="0–100">
          {temperament.map((t) => (
            <ScoreBar key={t.name} label={t.name} value={t.score} note={levelOf(t.score)} />
          ))}
        </ScoreGroup>

        <ScoreGroup title="애착" meta={attachment.style}>
          {attachment.dimensions.map((d) => (
            <ScoreBar key={d.name} label={d.name} value={d.score} note={levelOf(d.score)} />
          ))}
        </ScoreGroup>
      </section>

      {/* 4. 해석 근거 */}
      <section className="mt-12 border-t border-line pt-10" aria-labelledby="evidence">
        <h2 id="evidence" className="text-xl font-bold tracking-tight">
          해석 근거
        </h2>
        <ul className="mt-6 space-y-6">
          {report.evidence.map((e) => (
            <li key={e.claim}>
              <p className="text-[16px] font-semibold leading-relaxed">{e.claim}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="근거 지표">
                {e.basis.map((b) => (
                  <li key={b} className="rounded-md bg-wash px-2.5 py-1 text-sm tabular-nums text-sub">
                    {b}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {/* 5. 실천 제안 */}
      <section className="mt-12 border-t border-line pt-10" aria-labelledby="actions">
        <h2 id="actions" className="text-xl font-bold tracking-tight">
          실천 제안
        </h2>
        <ol className="mt-6 space-y-5">
          {report.actions.map((a, i) => (
            <li key={a.title} className="flex gap-4">
              <span className="w-5 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-faint">
                {i + 1}
              </span>
              <div>
                <p className="text-[16px] font-semibold leading-relaxed">{a.title}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-sub">{a.reason}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-14 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/test"
          className="flex h-13 items-center justify-center rounded-xl bg-ink text-[16px] font-semibold text-paper hover:bg-black sm:flex-1"
        >
          다시 검사하기
        </Link>
        <Link
          href="/"
          className="flex h-13 items-center justify-center rounded-xl border border-line text-[16px] font-medium hover:bg-wash sm:flex-1"
        >
          처음으로
        </Link>
      </div>

      <p className="mt-10 text-xs leading-relaxed text-faint">
        이 리포트는 자기 이해를 돕는 참고 자료이며, 의학적·심리학적 진단을 대신하지 않습니다.
        {report.isSample && " 현재 화면의 수치는 샘플 데이터입니다."}
      </p>
    </main>
  );
}

function ScoreGroup({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between border-b border-line pb-2">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-sm text-sub">{meta}</span>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}
