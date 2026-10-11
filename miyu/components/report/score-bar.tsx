import type { AxisRow, ScoreRow } from "@/lib/report/types";

/**
 * 0~100 지표 막대. 높고 낮음의 의미를 양쪽에 함께 보여준다.
 * 점수가 치우친 쪽의 설명만 진하게 표시하고, 색으로 좋고 나쁨을 나타내지 않는다.
 */
export function ScoreBar({ row }: { row: ScoreRow }) {
  const lean = row.score >= 60 ? "high" : row.score <= 40 ? "low" : "mid";
  return (
    <div className="py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[16px] font-semibold">{row.label}</p>
        <p className="text-[16px] font-semibold tabular-nums">{row.score}</p>
      </div>
      <div
        className="relative mt-2 h-2 rounded-full bg-track"
        role="img"
        aria-label={`${row.label} ${row.score} (0~100). 낮을수록 ${row.lowMeaning}. 높을수록 ${row.highMeaning}.`}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${row.score}%` }} />
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-4 text-[13px] leading-snug" aria-hidden="true">
        <p className={lean === "low" ? "text-ink" : "text-ink-3"}>
          <span className="mb-0.5 block font-semibold">낮을수록</span>
          {row.lowMeaning}
        </p>
        <p className={`text-right ${lean === "high" ? "text-ink" : "text-ink-3"}`}>
          <span className="mb-0.5 block font-semibold">높을수록</span>
          {row.highMeaning}
        </p>
      </div>
    </div>
  );
}

/** 양극 지표(MBTI 성향). 가운데(50)를 기준으로 어느 쪽에 가까운지 보여준다. */
export function AxisBar({ row }: { row: AxisRow }) {
  const leanHigh = row.score > 50;
  const leanLow = row.score < 50;
  const start = Math.min(row.score, 50);
  const width = Math.abs(row.score - 50);
  const lean = leanHigh ? `${row.highCode} 쪽` : leanLow ? `${row.lowCode} 쪽` : "중간";

  return (
    <div className="py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[16px] font-semibold">{row.label}</p>
        <p className="text-[16px] font-semibold">
          {lean} <span className="text-[14px] font-normal text-ink-3 tabular-nums">{row.score}</span>
        </p>
      </div>
      <div
        className="relative mt-2 h-2 rounded-full bg-track"
        role="img"
        aria-label={`${row.label}: 0은 ${row.lowCode}(${row.lowName}), 100은 ${row.highCode}(${row.highName}). 현재 ${row.score}, ${lean}.`}
      >
        <div
          className="absolute inset-y-0 rounded-full bg-accent"
          style={{ left: `${start}%`, width: `${width}%` }}
        />
        <div className="absolute -inset-y-1 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-ink-3" />
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-4 text-[13px] leading-snug" aria-hidden="true">
        <p className={leanLow ? "text-ink" : "text-ink-3"}>
          <span className="mb-0.5 block font-semibold">
            {row.lowCode} · {row.lowName}
          </span>
          {row.lowMeaning}
        </p>
        <p className={`text-right ${leanHigh ? "text-ink" : "text-ink-3"}`}>
          <span className="mb-0.5 block font-semibold">
            {row.highCode} · {row.highName}
          </span>
          {row.highMeaning}
        </p>
      </div>
    </div>
  );
}
