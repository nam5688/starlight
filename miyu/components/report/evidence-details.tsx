import type { Evidence } from "@/lib/report/evidence";
import type { Paragraph } from "@/lib/report/v2/types";

const SOURCE_LABEL: Record<Evidence["source"], string> = {
  saju: "사주 계산",
  survey: "미유 응답",
  self: "본인 입력",
};

/** 문단과 그 문단의 "근거 보기" — 개인 종합 리포트 · 고민 반영 리포트가 함께 쓴다 */
export function ParagraphBlock({ paragraph, evidence }: { paragraph: Paragraph; evidence: Map<string, Evidence> }) {
  return (
    <div>
      <p className="text-[16px] leading-[1.8] text-ink">{paragraph.text}</p>
      <EvidenceDetails ids={paragraph.evidence} evidence={evidence} />
    </div>
  );
}

export function EvidenceDetails({ ids, evidence }: { ids: string[]; evidence: Map<string, Evidence> }) {
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
