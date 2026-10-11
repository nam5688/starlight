import Link from "next/link";
import { ScoreBar } from "@/components/report/score-bar";
import { ArrowIcon } from "@/components/ui/icons";
import { SourceBadge } from "@/components/ui/source-badge";
import { sampleReport } from "@/lib/samples/sample-report";

/** 메인의 실제 리포트 예시 — 리포트 화면과 같은 부품으로 핵심 부분만 보여준다 */
export function ReportPreview() {
  const r = sampleReport;
  const bars = [r.relationship[0], r.temperament[1]];
  return (
    <figure className="overflow-hidden rounded-xl border border-line-strong bg-canvas">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line bg-mist px-5 py-3">
        <span className="text-[14px] font-semibold text-ink-2">리포트 예시 · {r.personName} 님</span>
        <SourceBadge source={r.source} />
      </figcaption>

      <div className="px-5 pt-5 pb-2 md:px-6">
        <p className="text-[14px] font-semibold text-accent">대표 경향</p>
        <p className="mt-0.5 text-[28px] font-bold tracking-tight">{r.tendency.name}</p>
        <p className="mt-3 border-l-[3px] border-accent pl-3 text-[17px] font-semibold leading-snug">{r.oneLiner}</p>

        <dl className="mt-5 border-t border-line text-[15px]">
          <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-b border-line py-3">
            <dt className="text-[13px] font-semibold text-ink-2">편한 환경</dt>
            <dd className="leading-snug">{r.core.comfortableEnvironment}</dd>
          </div>
          <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-b border-line py-3">
            <dt className="text-[13px] font-semibold text-accent">바로 해볼 행동</dt>
            <dd className="leading-snug">{r.core.tryNow}</dd>
          </div>
        </dl>

        <div className="divide-y divide-line">
          {bars.map((row) => (
            <ScoreBar key={row.id} row={row} />
          ))}
        </div>
      </div>

      <Link
        href="/report/sample"
        className="flex items-center justify-between border-t border-line px-5 py-4 text-[15px] font-semibold text-accent hover:bg-accent-soft md:px-6"
      >
        리포트 예시 전체 보기
        <ArrowIcon />
      </Link>
    </figure>
  );
}
