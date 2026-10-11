import type { DetailBlock, FullReport, SajuSection } from "@/lib/report/types";
import { BRANCHES, STEMS } from "@/lib/saju/glyphs";
import { ChevronIcon } from "@/components/ui/icons";

/** 5) 네 가지 상세 분석 — 영역별로 펼쳐 보기 */
export function DetailSections({ report }: { report: FullReport }) {
  const { details } = report;
  const strongest = [...report.temperament]
    .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))
    .slice(0, 2)
    .map((r) => `${r.label} ${r.score}`)
    .join(" · ");
  const relationship = report.relationship.map((r) => `${r.label} ${r.score}`).join(" · ");
  const saju = details.saju.saju;

  return (
    <div className="border-t border-ink">
      <Detail
        title="MBTI 성향"
        headline={`이번 응답 ${report.mbti.code}${report.knownMbti ? ` · 본인 입력 ${report.knownMbti}` : ""}`}
        block={details.mbti}
      >
        <dl className="grid grid-cols-2 border-y border-line text-[15px]">
          <div className="border-r border-line px-1 py-3">
            <dt className="text-[13px] text-ink-3">이번 응답</dt>
            <dd className="mt-0.5 text-[20px] font-bold tracking-wide">{report.mbti.code}</dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-[13px] text-ink-3">본인이 알고 있던 MBTI</dt>
            <dd className="mt-0.5 text-[20px] font-bold tracking-wide">{report.knownMbti ?? "입력 안 함"}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[13px] text-ink-3">본인이 입력한 값은 참고용이며, 미유 검사 결과와 따로 표시합니다.</p>
      </Detail>

      <Detail title="기질" headline={`두드러진 지표: ${strongest}`} block={details.temperament} />

      <Detail title="관계(애착)" headline={relationship} block={details.relationship} />

      <Detail
        title="사주"
        headline={
          saju.status === "sample"
            ? `일간 ${saju.dayMaster} · ${saju.elements.map((e) => `${e.name}${e.count}`).join(" ")}`
            : "만세력 계산 연결 전"
        }
        block={details.saju}
      >
        <SajuChart saju={saju} />
      </Detail>
    </div>
  );
}

function Detail({
  title,
  headline,
  block,
  children,
}: {
  title: string;
  headline: string;
  block: DetailBlock;
  children?: React.ReactNode;
}) {
  return (
    <details className="group border-b border-line">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 hover:bg-mist/60 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-[17px] font-bold">{title}</span>
          <span className="mt-0.5 block text-[14px] text-ink-3">{headline}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[14px] text-ink-3">
          <span className="group-open:hidden">펼치기</span>
          <span className="hidden group-open:inline">접기</span>
          <ChevronIcon className="size-5 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-5 pb-7">
        <div>
          <p className="text-[13px] font-semibold text-ink-3">무엇을 봤나요</p>
          <p className="mt-1 text-[15px] text-ink-2">{block.basis}</p>
        </div>
        {children}
        <ul className="space-y-2">
          {block.findings.map((f) => (
            <li key={f} className="relative pl-4 text-[16px] leading-relaxed before:absolute before:top-[0.7em] before:left-0 before:h-px before:w-2 before:bg-ink-3">
              {f}
            </li>
          ))}
        </ul>
        <div className="rounded-md bg-mist px-4 py-3">
          <p className="text-[13px] font-semibold text-ink-2">한계</p>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{block.limits}</p>
        </div>
      </div>
    </details>
  );
}

function SajuChart({ saju }: { saju: SajuSection }) {
  if (saju.status !== "sample") {
    return <p className="text-[15px] text-ink-2">만세력 계산 모듈이 연결되면 원국과 오행 분포가 표시됩니다.</p>;
  }
  const total = saju.elements.reduce((n, e) => n + e.count, 0);
  return (
    <div className="space-y-5">
      <table className="w-full table-fixed border-collapse text-center">
        <caption className="mb-2 text-left text-[13px] text-ink-3">사주 원국 (예시 · 가상 데이터)</caption>
        <thead>
          <tr className="border-y border-line text-[13px] text-ink-3">
            <th scope="col" className="w-14 py-2 text-left font-medium">
              <span className="sr-only">구분</span>
            </th>
            {saju.pillars.map((p) => (
              <th key={p.position} scope="col" className="py-2 font-medium">
                {p.position}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["stem", "branch"] as const).map((kind) => (
            <tr key={kind} className="border-b border-line">
              <th scope="row" className="py-3 text-left text-[13px] font-medium text-ink-3">
                {kind === "stem" ? "천간" : "지지"}
              </th>
              {saju.pillars.map((p) => {
                const glyph = kind === "stem" ? p.stem : p.branch;
                const info = (kind === "stem" ? STEMS : BRANCHES)[glyph];
                const isDayMaster = kind === "stem" && p.position === "일주";
                return (
                  <td key={p.position} className={`py-3 ${isDayMaster ? "bg-accent-soft" : ""}`}>
                    <span className="block text-[22px] font-semibold leading-none">{glyph}</span>
                    <span className="mt-1 block text-[13px] text-ink-3">
                      {info?.reading} · {info?.element}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <p className="text-[13px] font-semibold text-ink-3">오행 분포 (원국 {total}글자 기준 개수)</p>
        <ul className="mt-2 grid grid-cols-5 gap-2">
          {saju.elements.map((e) => (
            <li key={e.name} className="text-center">
              <div className="mx-auto flex h-16 w-full max-w-12 items-end rounded-sm bg-track" aria-hidden="true">
                <div className="w-full rounded-sm bg-accent" style={{ height: `${(e.count / total) * 100}%` }} />
              </div>
              <p className="mt-1.5 text-[14px]">
                {e.name} <span className="font-semibold tabular-nums">{e.count}</span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
