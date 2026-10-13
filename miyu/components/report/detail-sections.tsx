import type { DetailBlock, FullReport, SajuSection } from "@/lib/report/types";
import { BASE_TERMS, GLOSSARY, withHanja } from "@/lib/saju/glossary";
import { BRANCHES, STEMS } from "@/lib/saju/glyphs";
import { Fold } from "./reading-parts";

/** 5) 네 가지 상세 분석 — 영역별로 펼쳐 보기 */
export function DetailSections({ report, showChart = true }: { report: FullReport; showChart?: boolean }) {
  const { details } = report;
  const strongest = [...report.temperament]
    .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))
    .slice(0, 2)
    .map((r) => `${r.label} ${r.score}`)
    .join(" · ");
  const relationship = report.relationship.map((r) => `${r.label} ${r.score}`).join(" · ");
  const saju = details.saju.saju;

  return (
    <div className="flex flex-wrap gap-2">
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
          saju.status === "not-connected"
            ? "만세력 계산 연결 전"
            : `일간 ${saju.dayMaster} · ${saju.elements.map((e) => `${e.name}${e.count}`).join(" ")}`
        }
        block={details.saju}
      >
        {showChart && <SajuChart saju={saju} />}
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
    <Fold label={title} hint={headline} wide>
      <div className="space-y-6">
        <div>
          <p className="text-[13px] font-semibold text-ink-3">무엇을 봤나요</p>
          <p className="mt-1 text-[15px] leading-[1.7] text-ink-2">{block.basis}</p>
        </div>
        {children}
        <ul className="space-y-3">
          {block.findings.map((f) => (
            <li key={f} className="relative pl-4 text-[15px] leading-[1.75] before:absolute before:top-[0.8em] before:left-0 before:size-1.5 before:rounded-full before:bg-line-strong">
              {f}
            </li>
          ))}
        </ul>
        <div className="border-l-[3px] border-line-strong pl-3.5">
          <p className="text-[13px] font-semibold text-ink-3">한계</p>
          <p className="mt-1 text-[14px] leading-[1.7] text-ink-2">{block.limits}</p>
        </div>
      </div>
    </Fold>
  );
}

export function SajuChart({ saju, showGlossary = true }: { saju: SajuSection; showGlossary?: boolean }) {
  if (saju.status === "not-connected") {
    return <p className="text-[15px] text-ink-2">만세력 계산 결과가 없는 결과입니다.</p>;
  }
  const total = saju.elements.reduce((n, e) => n + e.count, 0);
  return (
    <div className="space-y-5">
      <table className="w-full table-fixed border-collapse text-center">
        <caption className="mb-2 text-left text-[13px] text-ink-3">
          {saju.status === "sample" ? "사주 원국 (예시 · 가상 데이터)" : "사주 원국 (만세력 계산)"}
        </caption>
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
                if (p.unknown) {
                  return (
                    <td key={p.position} className="py-3 text-[13px] text-ink-3">
                      {kind === "stem" ? "출생시간" : "모름"}
                    </td>
                  );
                }
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
      {showGlossary && (
      <details className="border-t border-line pt-3">
        <summary className="cursor-pointer text-[14px] font-medium text-accent">표 읽는 법 · 용어 풀이</summary>
        <dl className="mt-3 space-y-2 text-[14px] leading-relaxed">
          {BASE_TERMS.map((t) => GLOSSARY[t]).map((g) => (
            <div key={g.term}>
              <dt className="inline font-semibold">{withHanja(g)}</dt>
              <dd className="inline text-ink-2">
                {" "}
                — {g.literal}. {g.plain}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      )}
      {saju.notes?.length || saju.basis?.length ? (
        <div className="space-y-2 border-t border-line pt-3 text-[13px] leading-relaxed text-ink-3">
          {saju.notes?.map((n) => (
            <p key={n}>{n}</p>
          ))}
          {saju.basis && <p>계산 기준: {saju.basis.join(" · ")}</p>}
        </div>
      ) : null}
    </div>
  );
}
