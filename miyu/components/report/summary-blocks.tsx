import type { CoreSummary, FreeSummary } from "@/lib/report/types";
import { ANSWER_LABEL } from "@/lib/report/free-insight";
import { Fold, FoldRow } from "./reading-parts";
import { AxisBar, ScoreBar } from "./score-bar";

/** 구역 제목 — 위쪽 포인트 색 선으로 구역을 나누고(구분용), 제목은 18px, 설명은 한두 줄로 작게 */
export function SectionTitle({ id, children, note }: { id?: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 id={id} className="scroll-mt-[44px] border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight md:scroll-mt-[52px]">
        {children}
      </h2>
      {note && <p className="mt-1.5 text-[14px] leading-[1.65] text-ink-3">{note}</p>}
    </div>
  );
}

/** 1) 대표 경향 + 2) 한 줄 요약 — 첫 화면. "이렇게 읽은 이유"는 접어 둔다 */
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
      <h2 id={headingId} className="scroll-mt-[44px] text-[13px] font-semibold text-accent md:scroll-mt-[52px]">
        대표 경향
      </h2>
      <p className="mt-1 text-[26px] leading-tight font-bold tracking-tight md:text-[32px]">{summary.tendency.name}</p>
      <p className="mt-2 text-[13px] leading-[1.6] text-ink-3">후보 유형 · 분류 규칙 확정 전. 지금의 응답에서 두드러진 경향이며, 고정된 성격 유형이 아닙니다.</p>

      <p className="mt-6 border-l-[3px] border-accent pl-3.5 text-[18px] leading-snug font-semibold md:text-[20px]">{summary.oneLiner}</p>

      {insight && (
        <>
          <p className="mt-6 text-[13px] font-semibold text-ink-3">내 응답에서 읽은 것</p>
          <p className="mt-1.5 text-[16px] leading-[1.75]">{insight.text}</p>
          <FoldRow>
            <Fold label="이렇게 읽은 이유 보기" hint="이 문단에는 응답만 쓰였고, 사주와 합산하지 않았습니다." wide>
              <ul className="divide-y divide-line">
                {insight.basis.map((b) => (
                  <li key={b.itemId} className="grid gap-1 py-3.5 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_140px] md:gap-4">
                    <p className="text-[15px] leading-[1.65]">“{b.text}”</p>
                    <p className="text-[14px] font-semibold text-accent-strong md:text-right">내 응답 · {ANSWER_LABEL[b.answer] ?? b.answer}</p>
                  </li>
                ))}
              </ul>
            </Fold>
          </FoldRow>
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

/**
 * 3) 핵심 요약 — 한 면 안에서 줄로 나눈다 (카드 안에 카드를 넣지 않는다).
 * omit: 같은 화면의 다른 구역이 이미 같은 내용을 보여 줄 때 줄을 뺀다 (구매한 리포트는 "실천 제안"이 "바로 적용해볼 행동"과 같은 제안이라 뺀다 — 같은 말을 두 번 보이지 않는다)
 */
export function CoreSummaryTable({ core, omit = [] }: { core: CoreSummary; omit?: (keyof CoreSummary)[] }) {
  return (
    <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas">
      {CORE_ROWS.filter(({ key }) => !omit.includes(key)).map(({ key, label }) => (
        <div
          key={key}
          className={`grid gap-1 px-4 py-3.5 md:grid-cols-[180px_minmax(0,1fr)] md:gap-5 ${key === "tryNow" ? "bg-accent-soft" : ""}`}
        >
          <dt className={`text-[13px] font-semibold md:pt-0.5 ${key === "tryNow" ? "text-accent-strong" : "text-ink-3"}`}>{label}</dt>
          <dd className="text-[15px] leading-[1.7]">{core[key]}</dd>
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
        title="평소 행동 방식"
        meta="이번 응답"
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
