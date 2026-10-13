import { AdjustIcon, ChevronIcon, FlowIcon, InfoIcon, StrengthIcon } from "@/components/ui/icons";
import type { LuckSlot, ReadingBasis, ReadingBlock, ReadingSummaryCard, ReadingTrait } from "@/lib/report/reading/types";

// 읽기 구조 리포트의 부품. 크기: 카드 제목 17px · 본문 16px(줄 간격 1.7) · 보조 설명 13~14px.
// 색: 강점 · 잘 쓰일 때 = positive, 주의 · 조절이 필요할 때 = caution, 현재 위치 · 링크 = accent. 색은 작은 이름표 · 핵심 구절 · 구분선에만 쓰고,
// 뜻은 항상 글자와 아이콘이 함께 전한다(색만으로 구분하지 않는다). 카드 안에 카드를 넣지 않는다.

const KIND = {
  strength: { Icon: StrengthIcon, label: "text-positive", band: "before:bg-positive" },
  caution: { Icon: AdjustIcon, label: "text-caution", band: "before:bg-caution" },
  flow: { Icon: FlowIcon, label: "text-accent", band: "before:bg-accent" },
} as const;

/** 첫 화면 요약 카드 3개 — 강점 · 주의할 점 · 현재 흐름 */
export function SummaryCards({ cards }: { cards: ReadingSummaryCard[] }) {
  return (
    <ul className="mt-5 grid gap-3 md:grid-cols-3">
      {cards.map((c) => {
        const k = KIND[c.kind];
        return (
          <li key={c.kind} className={`relative overflow-hidden rounded-xl border border-line bg-canvas px-4 pt-4 pb-3.5 before:absolute before:inset-x-0 before:top-0 before:h-[3px] ${k.band}`}>
            <p className={`flex items-center gap-1.5 text-[13px] font-semibold ${k.label}`}>
              <k.Icon />
              {c.label}
            </p>
            <p className="mt-1.5 text-[17px] leading-snug font-bold tracking-tight">{c.keyword}</p>
            <p className="mt-1 text-[14px] leading-[1.6] text-ink-2">{c.note}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** 눌러서 펼치는 접힘. data-fold는 "전체 펼치기"가 찾는 표시 — 잠금(구매 전 가림)과 모양이 다르다(화살표 · 열린 상자) */
export function Fold({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <details
      data-fold
      className={`group min-w-0 rounded-lg border border-line-strong bg-canvas open:flex-[1_1_100%] ${wide ? "flex-[1_1_100%]" : "flex-[1_1_calc(50%-0.25rem)]"}`}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
        <span>{label}</span>
        <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

export function FoldRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex flex-wrap gap-2">{children}</div>;
}

/** "예를 들면" — 기본 화면에는 하나만. box: 바탕 있는 상자 / line: 접힘 안에서 쓰는 왼쪽 선 */
export function ExampleBox({ text, variant = "box" }: { text: string; variant?: "box" | "line" }) {
  return (
    <div className={variant === "box" ? "mt-4 rounded-lg bg-accent-soft px-4 py-3.5" : "mt-4 border-l-[3px] border-line-strong pl-3"}>
      <p className={`text-[13px] font-semibold ${variant === "box" ? "text-accent-strong" : "text-ink-3"}`}>예를 들면</p>
      <p className="mt-1 text-[15px] leading-[1.7] text-ink-2">{text}</p>
    </div>
  );
}

/** 읽는 데 중요한 조건(자료 없음 · 해석의 범위) — 본문 바로 아래에 짧게 */
export function CaveatNote({ text }: { text: string }) {
  return (
    <p className="mt-3 flex gap-1.5 text-[13px] leading-[1.6] text-ink-3">
      <InfoIcon className="mt-[3px] size-3.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

/** 강점과 부담 — 한 줄 문구로 줄인 카드 (모바일은 세로로 쌓고 이름표는 왼쪽, PC는 가로 3칸) */
export function TraitCards({ traits }: { traits: ReadingTrait[] }) {
  return (
    <ul className="mt-5 grid gap-3 md:grid-cols-3">
      {traits.map((t) => (
        <li key={t.name} className="rounded-xl border border-line bg-canvas px-4 py-3.5">
          <p className="text-[17px] leading-snug font-bold tracking-tight">{t.name}</p>
          <dl className="mt-2.5 grid grid-cols-[8.25rem_minmax(0,1fr)] gap-x-2 gap-y-2 border-t border-line pt-2.5 md:grid-cols-1 md:gap-y-2.5">
            <dt className="flex items-start gap-1.5 pt-[3px] text-[13px] font-semibold text-positive md:pt-0">
              <StrengthIcon className="mt-px size-4 shrink-0" />
              잘 쓰일 때
            </dt>
            <dd className="text-[15px] leading-snug md:-mt-1.5">{t.shinesShort}</dd>
            <dt className="flex items-start gap-1.5 pt-[3px] text-[13px] font-semibold text-caution md:pt-0">
              <AdjustIcon className="mt-px size-4 shrink-0" />
              조절이 필요할 때
            </dt>
            <dd className="text-[15px] leading-snug md:-mt-1.5">{t.burdenShort}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}

/** 접힘 안에서 보이는 특징별 풀이 (카드의 한 줄을 문장으로 풀어 쓴 것) */
export function TraitSentences({ traits }: { traits: ReadingTrait[] }) {
  return (
    <ul className="space-y-4">
      {traits.map((t) => (
        <li key={t.name}>
          <p className="text-[15px] font-semibold">{t.name}</p>
          <p className="mt-1 text-[15px] leading-[1.7]">
            <span className="font-semibold text-positive">잘 쓰일 때 </span>
            {t.shines}
          </p>
          <p className="mt-1 text-[15px] leading-[1.7]">
            <span className="font-semibold text-caution">조절이 필요할 때 </span>
            {t.burden}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** 편안하게 느끼는 조건 / 부딪히기 쉬운 상황 — 상대 없이 보는 관계 스타일 */
export function ComfortPair({ comfort }: { comfort: NonNullable<ReadingBlock["comfort"]> }) {
  const lists = [
    { title: "편안하게 느끼는 조건", items: comfort.comfortable, Icon: StrengthIcon, tone: "text-positive" },
    { title: "부딪히기 쉬운 상황", items: comfort.clash, Icon: AdjustIcon, tone: "text-caution" },
  ];
  return (
    <div className="mt-4">
      <div className="grid gap-3 md:grid-cols-2">
        {lists.map((l) => (
          <div key={l.title} className="rounded-xl border border-line bg-canvas p-4">
            <p className={`flex items-center gap-1.5 text-[14px] font-semibold ${l.tone}`}>
              <l.Icon />
              {l.title}
            </p>
            <ul className="mt-2 space-y-1.5 text-[15px] leading-[1.6]">
              {l.items.map((i) => (
                <li key={i} className="relative pl-3.5 before:absolute before:top-[0.72em] before:left-0 before:size-1 before:rounded-full before:bg-line-strong">
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[13px] leading-[1.6] text-ink-3">{comfort.note}</p>
    </div>
  );
}

/** 상대의 반응이 이어지는 모습 — 단계 그림 (모바일은 세로, PC는 가로) */
export function ReactionStepper({ flow }: { flow: NonNullable<ReadingBlock["reactionFlow"]> }) {
  return (
    <div className="mt-5 rounded-xl border border-line bg-canvas p-4 md:p-5">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-accent">
        <FlowIcon />
        반응이 이어지는 모습
      </p>
      <p className="mt-1 text-[17px] leading-snug font-bold tracking-tight">{flow.when}</p>
      <ol className="mt-4 md:grid md:grid-cols-4 md:gap-4">
        {flow.steps.map((s, i) => (
          <li key={s.label} className="group/step relative flex gap-3 pb-4 last:pb-0 md:block md:pb-0">
            <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-accent-strong tabular-nums">{i + 1}</span>
            <span className="absolute top-8 bottom-0 left-3.5 w-px bg-line-strong group-last/step:hidden md:top-3.5 md:right-[-1rem] md:bottom-auto md:left-8 md:h-px md:w-auto" aria-hidden="true" />
            <div className="min-w-0 pt-0.5 md:mt-2 md:pt-0">
              <p className="text-[13px] font-semibold text-ink-3">{s.label}</p>
              <p className="text-[15px] leading-snug">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const fmtMonth = (s: string) => s.replace("-", ".");
const monthIndex = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7));

/** 지금 지나는 큰 흐름 — 계산된 기간으로 이전 · 지금 · 다음을 한 줄에 놓고 현재 위치를 표시한다. 곡선 · 점수는 그리지 않는다 */
export function LuckTimelineCard({ timeline, text, reference }: { timeline: LuckSlot[]; text: string; reference: { year: number; month: number } }) {
  const cur = timeline.find((s) => s.role === "current");
  if (!cur) return null;
  const pct = Math.round((cur.progress ?? 0) * 100);
  const elapsed = Math.max(0, reference.year * 12 + reference.month - monthIndex(cur.from));
  const years = Math.floor(elapsed / 12);
  const months = elapsed % 12;
  const elapsedText = `${years > 0 ? `${years}년 ` : ""}${months > 0 ? `${months}개월` : years > 0 ? "" : "0개월"}`.trim();
  const others = timeline.filter((s) => s.role !== "current");
  const NAME = { previous: "이전", current: "지금", next: "다음" } as const;
  return (
    <div className="mt-5 rounded-xl border border-line bg-canvas p-4 md:p-5">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-accent">
        <FlowIcon />
        지금 지나는 큰 흐름 · 10년 단위
      </p>
      <p className="mt-1.5 text-[22px] leading-snug font-bold tracking-tight tabular-nums">
        {fmtMonth(cur.from)} — {fmtMonth(cur.to)}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {cur.themes.map((t) => (
          <li key={t} className="rounded-md bg-accent-soft px-2.5 py-1 text-[13px] font-semibold text-accent-strong">
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[16px] leading-[1.7]">{text}</p>

      <div className="mt-5">
        <div
          className="grid grid-cols-3 gap-1"
          role="img"
          aria-label={`이전 ${fmtMonth(timeline[0].from)}부터, 지금 ${fmtMonth(cur.from)}부터 ${fmtMonth(cur.to)}까지, 다음 ${fmtMonth(timeline[timeline.length - 1].to)}까지. ${reference.year}년 ${reference.month}월 기준으로 지금 흐름이 시작된 지 ${elapsedText} 지났습니다.`}
        >
          {timeline.map((s) => (
            <div key={s.role} className="relative h-2 rounded-full bg-track">
              {s.role === "current" && (
                <>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  <div className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-canvas bg-accent-strong shadow-[0_0_0_1px_var(--color-accent-strong)]" style={{ left: `${pct}%` }} />
                </>
              )}
            </div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1 text-[13px]" aria-hidden="true">
          {timeline.map((s) => (
            <p key={s.role} className={s.role === "current" ? "font-semibold text-accent-strong" : "text-ink-3"}>
              {NAME[s.role]}
            </p>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-ink-3">
          {reference.year}년 {reference.month}월 기준, 이 흐름이 시작된 지 {elapsedText} 지난 지점입니다.
        </p>
      </div>

      <ul className="mt-3 divide-y divide-line border-t border-line text-[14px]">
        {others.map((s) => (
          <li key={s.role} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 py-2.5">
            <span className="font-semibold text-ink-3">{NAME[s.role]}</span>
            <span>
              <span className="block tabular-nums">
                {fmtMonth(s.from)} — {fmtMonth(s.to)}
              </span>
              <span className="block text-[13px] text-ink-3">{s.themes.join(" / ")}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 접어 둔 "분석 근거" — 사주 계산 결과와 전통 해석 규칙을 나누고, 응답 · 다르게 나온 부분 · 아직 확인되지 않은 것을 적는다 */
export function BasisList({ basis }: { basis: ReadingBasis }) {
  const groups: { label: string; items: string[]; note?: string }[] = [
    { label: "사주 계산 결과", items: basis.computed, note: "만세력 엔진이 계산한 값입니다." },
    { label: "전통 해석 규칙", items: basis.tradition, note: "계산 결과를 읽는 규칙이며 검증된 사실이 아닙니다." },
    { label: "응답 · 본인 입력", items: basis.answers },
    ...(basis.differences?.length ? [{ label: "서로 다르게 나온 부분", items: basis.differences }] : []),
    { label: "다른 가능성 · 아직 확인되지 않은 것", items: basis.unknown },
  ];
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="text-[13px] font-semibold text-ink-2">
            {g.label}
            {g.note && <span className="ml-2 font-normal text-ink-3">{g.note}</span>}
          </p>
          <ul className="mt-1.5 space-y-1.5 border-l-2 border-line pl-3 text-[14px] leading-[1.65] text-ink-2">
            {g.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** 본문 문단 — 한 문단 2~3문장, 문장마다 줄을 바꾸지 않는다 */
export function Paragraphs({ items }: { items: string[] }) {
  return (
    <div className="space-y-3">
      {items.map((p) => (
        <p key={p} className="text-[16px] leading-[1.75]">
          {p}
        </p>
      ))}
    </div>
  );
}

/** 살펴볼 점 — 접힘 안의 마지막 한 덩어리 */
export function WatchNote({ text }: { text: string }) {
  return (
    <div className="mt-4 border-l-[3px] border-accent pl-3">
      <p className="text-[13px] font-semibold text-accent">살펴볼 점</p>
      <p className="mt-1 text-[15px] leading-[1.7]">{text}</p>
    </div>
  );
}
