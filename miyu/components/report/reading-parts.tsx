import { Fragment } from "react";
import { AdjustIcon, ChevronIcon, FlowIcon, InfoIcon, LeafIcon, StrengthIcon } from "@/components/ui/icons";
import { lineGroups } from "@/lib/report/reading/line-breaks";
import { periodLine, periodPlain } from "@/lib/saju/interpret/period-plain";
import type { LuckSlot, ReadingBasis, ReadingBlock, ReadingSection, ReadingSummaryCard, ReadingTrait } from "@/lib/report/reading/types";

// 읽기 구조 리포트의 부품. 크기: 카드 제목 17px · 본문 16px(줄 간격 1.7) · 보조 설명 13~14px.
// 색: 내가 강한 포인트 = positive, 내가 힘들 수 있는 포인트 = caution, 현재 위치 · 링크 = accent. 색은 작은 이름표 · 핵심 구절 · 구분선에만 쓰고,
// 뜻은 항상 글자와 아이콘이 함께 전한다(색만으로 구분하지 않는다). 카드 안에 카드를 넣지 않는다.

/**
 * 본문 글 — 저장된 글은 그대로 두고, 문장 길이에 따라 줄을 나눈다 (`lib/report/reading/line-breaks.ts`).
 * 짧은 문장 + 짧은 문장은 이어서, 긴 문장이 끼면 줄을 바꾼다. 한 문단(<p>) 안에서 줄만 바뀌므로 읽는 순서 · 글자는 같다.
 */
export function Prose({ text, className, as: Tag = "p" }: { text: string; className?: string; as?: "p" | "span" | "div" }) {
  const lines = lineGroups(text);
  return (
    <Tag className={`${className ?? ""} text-pretty`.trim()}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </Tag>
  );
}

/** 특징 카드와 일상 예시에서 같이 쓰는 이름표 */
export const TRAIT_LABEL = { strong: "내가 강한 포인트", hard: "내가 힘들 수 있는 포인트" } as const;

const KIND = {
  strength: { Icon: StrengthIcon, label: "text-positive", band: "before:bg-positive-fill" },
  caution: { Icon: AdjustIcon, label: "text-caution", band: "before:bg-caution" },
  flow: { Icon: FlowIcon, label: "text-accent", band: "before:bg-accent" },
} as const;

/** 첫 화면 요약 카드 3개 — 강점 · 주의할 점 · 지금 나의 시기 */
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
            <Prose text={c.note} className="mt-1 text-[14px] leading-[1.6] text-ink-2" />
            {c.foot && <p className="mt-1.5 text-[13px] leading-[1.5] text-ink-3 tabular-nums">{c.foot}</p>}
          </li>
        );
      })}
    </ul>
  );
}

/** 눌러서 펼치는 접힘. data-fold는 "전체 펼치기"가 찾는 표시 — 잠금(구매 전 가림)과 모양이 다르다(화살표 · 열리는 상자). hint: 접힌 채로 보이는 한 줄 설명 */
export function Fold({ label, hint, children, wide = false }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <details
      data-fold
      className={`group min-w-0 rounded-lg border border-line-strong bg-canvas open:flex-[1_1_100%] ${wide || hint ? "flex-[1_1_100%]" : "flex-[1_1_calc(50%-0.25rem)]"}`}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold">{label}</span>
          {hint && <span className="mt-0.5 block text-[13px] leading-[1.5] text-ink-3">{hint}</span>}
        </span>
        <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-4 py-5">{children}</div>
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
      <Prose text={text} className="mt-1 text-[15px] leading-[1.7] text-ink-2" />
    </div>
  );
}

/** 읽는 데 중요한 조건(자료 없음 · 해석의 범위) — 본문 바로 아래에 짧게 */
export function CaveatNote({ text }: { text: string }) {
  return (
    <p className="mt-3 flex gap-1.5 text-[13px] leading-[1.6] text-ink-3">
      <InfoIcon className="mt-[3px] size-3.5 shrink-0" />
      <Prose as="span" text={text} />
    </p>
  );
}

/** 강한 포인트 / 힘들 수 있는 포인트 — 특징마다 칸을 둘로 나눈 카드 (모바일은 세로, PC는 가로 3칸) */
export function TraitCards({ traits }: { traits: ReadingTrait[] }) {
  return (
    <ul className="mt-5 grid gap-3 md:grid-cols-3">
      {traits.map((t) => (
        <li key={t.name} className="overflow-hidden rounded-xl border border-line bg-canvas">
          <p className="px-4 pt-3.5 pb-3 text-[17px] leading-snug font-bold tracking-tight">{t.name}</p>
          <div className="border-t border-line px-4 py-3">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-positive">
              <StrengthIcon />
              {TRAIT_LABEL.strong}
            </p>
            <p className="mt-1 text-[15px] leading-snug">{t.shinesShort}</p>
          </div>
          <div className="border-t border-line px-4 py-3">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-caution">
              <AdjustIcon />
              {TRAIT_LABEL.hard}
            </p>
            <p className="mt-1 text-[15px] leading-snug">{t.burdenShort}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 일상 예시 보기 — 특징마다 구분선으로 나누고, 안에서도 "강한 포인트 · 힘들 수 있는 포인트 · 예를 들면"을 칸으로 띄운다.
 * 왼쪽 가이드줄(청록 · 황토 · 회색)로 칸이 구분되며, 줄 색만이 아니라 이름표 글자로도 뜻을 전한다.
 */
export function TraitSentences({ traits }: { traits: ReadingTrait[] }) {
  return (
    <ul className="divide-y divide-line">
      {traits.map((t) => (
        <li key={t.name} className="py-6 first:pt-0 last:pb-0">
          <p className="text-[17px] leading-snug font-bold tracking-tight">{t.name}</p>

          <div className="mt-4 border-l-[3px] border-positive-fill pl-3.5">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-positive">
              <StrengthIcon />
              {TRAIT_LABEL.strong}
            </p>
            <Prose text={t.shines} className="mt-1.5 text-[15px] leading-[1.75]" />
          </div>

          <div className="mt-5 border-l-[3px] border-caution pl-3.5">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-caution">
              <AdjustIcon />
              {TRAIT_LABEL.hard}
            </p>
            <Prose text={t.burden} className="mt-1.5 text-[15px] leading-[1.75]" />
          </div>

          <div className="mt-5 border-l-[3px] border-line-strong pl-3.5">
            <p className="text-[13px] font-semibold text-ink-3">예를 들면</p>
            <Prose text={t.example} className="mt-1.5 text-[15px] leading-[1.75] text-ink-2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 마음이 편해지는 관계 조건 / 부딪히기 쉬운 상황 — 상대 없이 보는 관계 스타일. 꼭 기억할 정보라 색이 있는 칸으로 둔다(테두리 없이) */
export function ComfortPair({ comfort, compact = false, className = "mt-4" }: { comfort: NonNullable<ReadingBlock["comfort"]>; /** 좁은 칸(대화 말풍선 안)에서는 세로로만 쌓는다 */ compact?: boolean; className?: string }) {
  const lists = [
    { title: "이런 관계에서 마음이 편해져요", items: comfort.comfortable, Icon: LeafIcon, tone: "text-positive", face: "bg-positive-soft", dot: "before:bg-positive-fill" },
    { title: "이럴 땐 마음이 부딪히기 쉬워요", items: comfort.clash, Icon: AdjustIcon, tone: "text-caution", face: "bg-caution-soft", dot: "before:bg-caution" },
  ];
  return (
    <div className={className}>
      <div className={compact ? "grid gap-3" : "grid gap-3 md:grid-cols-2"}>
        {lists.map((l) => (
          <div key={l.title} className={`rounded-xl ${l.face} p-4`}>
            <p className={`flex items-center gap-1.5 text-[14px] font-semibold ${l.tone}`}>
              <l.Icon />
              {l.title}
            </p>
            <ul className="mt-2 space-y-1.5 text-[15px] leading-[1.6]">
              {l.items.map((i) => (
                <li key={i} className={`relative pl-3.5 before:absolute before:top-[0.72em] before:left-0 before:size-1 before:rounded-full ${l.dot}`}>
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Prose text={comfort.note} className="mt-2 text-[13px] leading-[1.6] text-ink-3" />
    </div>
  );
}

/** 상대의 반응이 이어지는 모습 — 단계 그림 (모바일은 세로, PC는 가로) */
export function ReactionStepper({ flow, compact = false, className = "mt-5" }: { flow: NonNullable<ReadingBlock["reactionFlow"]>; /** 좁은 칸(대화 말풍선 안)에서는 세로로만 쌓는다 */ compact?: boolean; className?: string }) {
  return (
    <div className={`${className} rounded-xl bg-canvas p-4 ${compact ? "shadow-soft" : "border border-line md:p-5"}`}>
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-accent">
        <FlowIcon />
        반응이 이어지는 모습
      </p>
      <p className="mt-1 text-[17px] leading-snug font-bold tracking-tight">{flow.when}</p>
      <ol className={compact ? "mt-4" : "mt-4 md:grid md:grid-cols-4 md:gap-4"}>
        {flow.steps.map((s, i) => (
          <li key={s.label} className={compact ? "group/step relative flex gap-3 pb-4 last:pb-0" : "group/step relative flex gap-3 pb-4 last:pb-0 md:block md:pb-0"}>
            <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-accent-strong tabular-nums">{i + 1}</span>
            <span className={compact ? "absolute top-8 bottom-0 left-3.5 w-px bg-line-strong group-last/step:hidden" : "absolute top-8 bottom-0 left-3.5 w-px bg-line-strong group-last/step:hidden md:top-3.5 md:right-[-1rem] md:bottom-auto md:left-8 md:h-px md:w-auto"} aria-hidden="true" />
            <div className={compact ? "min-w-0 pt-0.5" : "min-w-0 pt-0.5 md:mt-2 md:pt-0"}>
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

/**
 * 지금 지나는 시기 — 쉬운 제목 → 생활에서 뜻하는 것 → 예시 순서로 쓰고(계산된 천간 · 지지의 그룹을 쉬운 말로 옮긴 period-plain.ts),
 * 계산된 기간으로 이전 · 지금 · 다음을 한 줄에 놓고 현재 위치를 표시한다. 곡선 · 점수는 그리지 않는다.
 * showExample을 끄면 예시를 빼고 보인다(대화에서는 예시를 다음 말풍선으로 이어 준다).
 */
export function LuckTimelineCard({ timeline, reference, className = "mt-5", soft = false, showExample = true }: { timeline: LuckSlot[]; reference: { year: number; month: number }; className?: string; /** 대화 말풍선 안에서는 테두리 대신 칸 색만으로 */ soft?: boolean; showExample?: boolean }) {
  const cur = timeline.find((s) => s.role === "current");
  if (!cur) return null;
  const plain = periodPlain(cur.stemGroup, cur.branchGroup);
  const pct = Math.round((cur.progress ?? 0) * 100);
  const elapsed = Math.max(0, reference.year * 12 + reference.month - monthIndex(cur.from));
  const years = Math.floor(elapsed / 12);
  const months = elapsed % 12;
  const elapsedText = `${years > 0 ? `${years}년 ` : ""}${months > 0 ? `${months}개월` : years > 0 ? "" : "0개월"}`.trim();
  const others = timeline.filter((s) => s.role !== "current");
  const NAME = { previous: "이전", current: "지금", next: "다음" } as const;
  return (
    <div className={`${className} rounded-xl bg-canvas p-4 md:p-5 ${soft ? "" : "border border-line"}`}>
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-accent">
        <FlowIcon />
        지금 나의 시기
      </p>
      <p className="mt-1.5 text-[20px] leading-snug font-bold tracking-tight">{plain.title}</p>
      <Prose text={plain.meaning} className="mt-1.5 text-[15px] leading-[1.65] text-ink-2" />
      {showExample && <Prose text={plain.example} className="mt-2 text-[15px] leading-[1.65]" />}
      <p className="mt-2 text-[13px] leading-[1.5] text-ink-3 tabular-nums">{periodLine(cur.from, cur.to)}</p>

      <div className="mt-4">
        <p className="mb-2 text-[13px] leading-[1.6] text-ink-3">사주에서는 사람마다 10년 단위로 분위기가 바뀐다고 봐요. 지금이 그 10년 중 어디쯤인지 보여 드려요.</p>
        <div
          className="grid grid-cols-3 gap-1"
          role="img"
          aria-label={`이전 ${fmtMonth(timeline[0].from)}부터, 지금 ${fmtMonth(cur.from)}부터 ${fmtMonth(cur.to)}까지, 다음 ${fmtMonth(timeline[timeline.length - 1].to)}까지. ${reference.year}년 ${reference.month}월 기준으로 지금 시기가 시작된 지 ${elapsedText} 지났어요.`}
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
          {reference.year}년 {reference.month}월 기준, 이 시기가 시작된 지 {elapsedText} 지난 지점이에요.
        </p>
      </div>

      {others.length > 0 && (
        <ul className={`mt-3 text-[14px] ${soft ? "space-y-2" : "divide-y divide-line border-t border-line"}`}>
          {others.map((s) => (
            <li key={s.role} className={`grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 ${soft ? "" : "py-2.5"}`}>
              <span className="font-semibold text-ink-3">{NAME[s.role]}</span>
              <span>
                <span className="block tabular-nums">
                  {fmtMonth(s.from)} — {fmtMonth(s.to)}
                </span>
                <span className="block text-[13px] text-ink-3">{periodPlain(s.stemGroup, s.branchGroup).title}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 접어 둔 "분석 근거" — 사주 계산 결과와 전통 해석 규칙을 나누고, 응답 · 다르게 나온 부분 · 아직 확인되지 않은 것을 칸으로 나누어 적는다 */
export function BasisList({ basis }: { basis: ReadingBasis }) {
  const groups: { label: string; items: string[]; note?: string }[] = [
    { label: "사주 계산 결과", items: basis.computed, note: "만세력 엔진이 계산한 값입니다." },
    { label: "전통 해석 규칙", items: basis.tradition, note: "계산 결과를 읽는 규칙이며 검증된 사실이 아닙니다." },
    { label: "응답 · 본인 입력", items: basis.answers },
    ...(basis.differences?.length ? [{ label: "서로 다르게 나온 부분", items: basis.differences }] : []),
    { label: "다른 가능성 · 아직 확인되지 않은 것", items: basis.unknown },
  ];
  return (
    <div className="divide-y divide-line">
      {groups.map((g) => (
        <div key={g.label} className="py-5 first:pt-0 last:pb-0">
          <p className="text-[14px] font-semibold text-ink">{g.label}</p>
          {g.note && <p className="mt-0.5 text-[13px] leading-[1.6] text-ink-3">{g.note}</p>}
          <ul className="mt-3 space-y-3 border-l-2 border-line pl-3.5 text-[14px] leading-[1.7] text-ink-2">
            {g.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** 본문 문단 — 한 문단 2~3문장. 줄바꿈은 문장 길이로 화면이 정한다(Prose) */
export function Paragraphs({ items }: { items: string[] }) {
  return (
    <div className="space-y-5">
      {items.map((p) => (
        <Prose key={p} text={p} className="text-[16px] leading-[1.75]" />
      ))}
    </div>
  );
}

/** 살펴볼 점 — 접힘 안의 마지막 한 덩어리 */
export function WatchNote({ text }: { text: string }) {
  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="border-l-[3px] border-accent pl-3.5">
        <p className="text-[13px] font-semibold text-accent">살펴볼 점</p>
        <Prose text={text} className="mt-1.5 text-[15px] leading-[1.75]" />
      </div>
    </div>
  );
}

/**
 * 깊게 읽는 소단락 — 눈길을 끄는 한 줄 제목만 보이고, 눌러서 풀이와 "해 볼 것"을 읽는다(가까운 관계 · 일과 돈).
 * 접힘이라 길어도 훑어보기 쉽고, "해 볼 것"은 박스가 아니라 왼쪽 선으로 구분한다(카드 안에 카드를 넣지 않는다).
 * note는 월별 달력이 있는 리포트에서만 보이는 안내 한 줄(코드가 붙이는 고정 문구)이다.
 */
export function SectionList({ sections, note, className = "mt-5" }: { sections: ReadingSection[]; note?: string; className?: string }) {
  return (
    <div className={className}>
      <ul className="divide-y divide-line rounded-xl border border-line bg-canvas">
        {sections.map((s) => (
          <li key={s.title}>
            <details data-fold className="group">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="text-[16px] leading-snug font-semibold text-pretty">{s.title}</span>
                <ChevronIcon className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-line px-4 py-4">
                <Prose text={s.body} className="text-[16px] leading-[1.75]" />
                <div className="mt-4 border-l-[3px] border-accent pl-3.5">
                  <p className="text-[13px] font-semibold text-accent-strong">해 볼 것</p>
                  <Prose text={s.tryIt} className="mt-1 text-[15px] leading-[1.7] text-ink-2" />
                </div>
              </div>
            </details>
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-[13px] leading-[1.6] text-ink-3">{note}</p>}
    </div>
  );
}
