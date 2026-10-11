import type { DataSource } from "@/lib/report/types";

const LABELS: Record<DataSource, string> = {
  sample: "개발용 샘플",
  "dev-scoring": "개발용 예시 채점",
};

/** 데이터 출처 표시. 샘플·예시 결과가 실제 결과처럼 보이지 않게 항상 붙인다. */
export function SourceBadge({ source }: { source: DataSource }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-line-strong bg-mist px-2 py-0.5 text-[13px] font-medium text-ink-2">
      {LABELS[source]}
    </span>
  );
}

export function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-line bg-canvas px-2 py-0.5 text-[13px] text-ink-3">
      {children}
    </span>
  );
}
