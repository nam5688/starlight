import type { CoreSummary, FreeSummary } from "@/lib/report/types";
import { ANSWER_LABEL } from "@/lib/report/free-insight";
import { AxisBar, ScoreBar } from "./score-bar";

export function SectionTitle({ id, children, note }: { id?: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 id={id} className="text-[22px] font-bold tracking-tight md:text-[24px]">
        {children}
      </h2>
      {note && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-3">{note}</p>}
    </div>
  );
}

/** 1) 대표 경향 + 2) 한 줄 요약 */
export function TendencyBlock({
  summary,
  headingId = "tendency",
}: {
  summary: Pick<FreeSummary, "tendency" | "oneLiner" | "insight">;
  headingId?: string;
}) {
  const insight = summary.insight;
  return (
    <div>
      <h2 id={headingId} className="text-[15px] font-semibold text-accent">
        대표 경향
      </h2>
      <p className="mt-1 text-[32px] font-bold leading-tight tracking-tight md:text-[38px]">{summary.tendency.name}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
        후보 유형 · 분류 규칙 확정 전. 지금의 응답에서 두드러진 경향이며, 고정된 성격 유형이 아닙니다.
      </p>

      <h3 className="mt-8 text-[15px] font-semibold text-ink-2">한 줄 요약</h3>
      <p className="mt-2 border-l-[3px] border-accent pl-4 text-[19px] font-semibold leading-snug md:text-[21px]">
        {summary.oneLiner}
      </p>

      {insight && (
        <>
          <h3 className="mt-8 text-[15px] font-semibold text-ink-2">내 응답에서 읽은 것</h3>
          <p className="mt-2 text-[17px] leading-[1.8]">{insight.text}</p>
          <h3 className="mt-6 text-[15px] font-semibold text-ink-2">이렇게 읽은 이유</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
            아래 응답이 이 문단의 근거입니다. 이 문단에는 응답만 쓰였고, 사주와 합산하지 않았습니다.
          </p>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {insight.basis.map((b) => (
              <li key={b.itemId} className="grid gap-1 py-3 md:grid-cols-[minmax(0,1fr)_140px] md:gap-4">
                <p className="text-[15px] leading-relaxed">“{b.text}”</p>
                <p className="text-[14px] font-semibold text-accent md:text-right">내 응답 · {ANSWER_LABEL[b.answer] ?? b.answer}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const CORE_ROWS: { key: keyof CoreSummary; label: string }[] = [
  { key: "comfortableEnvironment", label: "내가 편한 환경" },
  { key: "repeatedReaction", label: "자주 반복되는 반응" },
  { key: "stressTrigger", label: "스트레스를 받기 쉬운 상황" },
  { key: "tryNow", label: "바로 적용해볼 행동" },
];

/** 3) 핵심 요약 */
export function CoreSummaryTable({ core }: { core: CoreSummary }) {
  return (
    <dl className="border-t border-ink">
      {CORE_ROWS.map(({ key, label }) => (
        <div
          key={key}
          className={`grid gap-1 border-b border-line px-1 py-4 md:grid-cols-[200px_minmax(0,1fr)] md:gap-6 ${
            key === "tryNow" ? "bg-accent-soft px-3 md:px-4" : ""
          }`}
        >
          <dt className={`text-[14px] font-semibold ${key === "tryNow" ? "text-accent" : "text-ink-2"}`}>{label}</dt>
          <dd className="text-[16px] leading-relaxed">{core[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 4) 항목별 점수 */
export function ScoreGroups({ summary }: { summary: Pick<FreeSummary, "temperament" | "relationship" | "mbti"> }) {
  return (
    <div className="space-y-10">
      <ScoreGroup title="기질" rows={summary.temperament.map((r) => <ScoreBar key={r.id} row={r} />)} />
      <ScoreGroup title="관계(애착)" rows={summary.relationship.map((r) => <ScoreBar key={r.id} row={r} />)} />
      <ScoreGroup
        title="MBTI 성향"
        meta={`이번 응답 ${summary.mbti.code}`}
        rows={summary.mbti.axes.map((r) => <AxisBar key={r.id} row={r} />)}
      />
    </div>
  );
}

function ScoreGroup({ title, meta, rows }: { title: string; meta?: string; rows: React.ReactNode[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
        <h3 className="text-[17px] font-bold">{title}</h3>
        {meta && <span className="text-[14px] font-semibold text-ink-2">{meta}</span>}
      </div>
      <div className="divide-y divide-line">{rows}</div>
    </div>
  );
}

export const SCORE_NOTE =
  "0~100은 응답을 환산한 값이며 백분위나 정확도가 아닙니다. 높고 낮음은 방향의 차이이고, 좋고 나쁨을 뜻하지 않습니다.";
