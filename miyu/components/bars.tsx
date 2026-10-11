// 결과 화면의 점수 막대. 장식 없이 값과 막대만 보여준다.

export function ScoreBar({
  label,
  value,
  max = 100,
  display,
  note,
}: {
  label: string;
  value: number;
  max?: number;
  /** 오른쪽에 표시할 값 (기본: value) */
  display?: string;
  /** 값 옆의 보조 표기 (예: 높음) */
  note?: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[15px]">
        <span>{label}</span>
        <span className="tabular-nums">
          {note && <span className="mr-2 text-sm text-faint">{note}</span>}
          <span className="font-semibold">{display ?? value}</span>
        </span>
      </div>
      <div
        className="mt-2 h-2 rounded-full bg-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 양극 지표(MBTI). 우세한 쪽을 진하게 표시한다. */
export function SplitBar({
  left,
  right,
  leftPct,
}: {
  left: string;
  right: string;
  leftPct: number;
}) {
  const rightPct = 100 - leftPct;
  const leftWins = leftPct >= rightPct;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[15px] tabular-nums">
        <span className={leftWins ? "font-semibold" : "text-faint"}>
          {left} {leftPct}%
        </span>
        <span className={leftWins ? "text-faint" : "font-semibold"}>
          {rightPct}% {right}
        </span>
      </div>
      <div
        className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`${left} ${leftPct}%, ${right} ${rightPct}%`}
      >
        <div
          className={leftWins ? "bg-ink" : "bg-track"}
          style={{ width: `${leftPct}%` }}
        />
        <div
          className={leftWins ? "bg-track" : "bg-ink"}
          style={{ width: `${rightPct}%` }}
        />
      </div>
    </div>
  );
}
