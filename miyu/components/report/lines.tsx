/** 문장마다 줄을 바꿔 보여 준다 — 한 문단은 짧은 줄 2~3개로 읽히고, 문단 사이는 따로 띄운다 */
export function Lines({ text, className = "", gap = "mt-1.5" }: { text: string; className?: string; gap?: string }) {
  const lines = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return (
    <p className={className}>
      {lines.map((l, i) => (
        <span key={i} className={`block ${i > 0 ? gap : ""}`}>
          {l}
        </span>
      ))}
    </p>
  );
}
