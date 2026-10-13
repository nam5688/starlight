import type { Evidence } from "@/lib/report/evidence";
import { ChevronIcon } from "@/components/ui/icons";
import type { Paragraph } from "@/lib/report/v2/types";

const SOURCE_LABEL: Record<Evidence["source"], string> = {
  saju: "사주 계산",
  survey: "미유 응답",
  self: "본인 입력",
};

/** 문단과 그 문단의 "분석 근거 보기" — 개인 종합 리포트 · 고민 반영 리포트가 함께 쓴다 */
export function ParagraphBlock({ paragraph, evidence }: { paragraph: Paragraph; evidence: Map<string, Evidence> }) {
  return (
    <div>
      <p className="text-[16px] leading-[1.75] text-ink">{paragraph.text}</p>
      <EvidenceDetails ids={paragraph.evidence} evidence={evidence} />
    </div>
  );
}

export function EvidenceDetails({ ids, evidence }: { ids: string[]; evidence: Map<string, Evidence> }) {
  const items = ids.map((i) => evidence.get(i)).filter((e): e is Evidence => Boolean(e));
  if (!items.length) return null;
  return (
    <details data-fold className="group mt-3 rounded-lg border border-line-strong bg-canvas">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2 text-[14px] font-semibold [&::-webkit-details-marker]:hidden">
        <span>
          분석 근거 보기 <span className="font-normal text-ink-3">({items.length})</span>
        </span>
        <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="space-y-3 border-t border-line px-3.5 py-4 text-[14px] leading-[1.65] text-ink-2">
        {items.map((e) => (
          <li key={e.id} className="border-l-2 border-line pl-3">
            <span className="mb-0.5 block text-[13px] font-semibold text-ink-3">{SOURCE_LABEL[e.source]}</span>
            {e.fact}
          </li>
        ))}
      </ul>
    </details>
  );
}
