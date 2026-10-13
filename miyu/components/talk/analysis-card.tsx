import { AdjustIcon, FlowIcon, StrengthIcon } from "@/components/ui/icons";
import { Prose } from "@/components/report/reading-parts";
import { CARD_DISCLAIMER, type TalkCard } from "@/lib/report/reading/talk";

/**
 * 분석 카드 한 장 — 대화 맨 앞에 보이고, 같은 내용이 이미지로 저장된다(card-image.ts).
 * 이름 · 분석일 · 대표 경향 · 핵심 해석 · 성향 요약 · 장점 · 단점이 될 수 있는 부분 · 지금 나의 시기 · 사용한 정보.
 * 점수 그래프 · 정확도는 넣지 않는다.
 */
export function AnalysisCard({ card, name, dateLabel }: { card: TalkCard; name: string; dateLabel: string }) {
  const boxes = [
    { c: card.strength, Icon: StrengthIcon, tone: "text-positive", face: "bg-positive-soft", band: "before:bg-positive" },
    { c: card.caution, Icon: AdjustIcon, tone: "text-caution", face: "bg-caution-soft", band: "before:bg-caution" },
    { c: card.flow, Icon: FlowIcon, tone: "text-accent-strong", face: "bg-accent-soft", band: "before:bg-accent" },
  ];
  return (
    <section aria-label="나의 분석 카드" className="relative overflow-hidden rounded-2xl border border-line bg-canvas px-4 pt-5 pb-4 before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-accent md:px-6 md:pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-bold text-accent">ME:U 미유</p>
        <p className="text-[13px] text-ink-3">{dateLabel}</p>
      </div>
      <p className="mt-1 text-[15px] font-semibold text-ink-2">{name} 님의 분석 카드</p>

      {card.tendency && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center rounded-md bg-accent-soft px-2.5 py-1 text-[16px] font-bold text-accent-strong">{card.tendency}</span>
          <span className="text-[13px] text-ink-3">나의 대표 경향</span>
        </p>
      )}
      <p className="mt-3 text-[21px] leading-[1.4] font-bold tracking-tight">{card.headline}</p>

      <dl className="mt-4 divide-y divide-line border-y border-line">
        {card.rows.map((r) => (
          <div key={r.label} className="py-3">
            <dt className="text-[13px] font-semibold text-ink-3">{r.label}</dt>
            <dd className="mt-0.5 text-[16px] leading-[1.55] font-semibold">{r.text}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-4 space-y-2.5">
        {boxes.map(({ c, Icon, tone, face, band }) => (
          <li key={c.label} className={`relative overflow-hidden rounded-lg ${face} py-3 pr-4 pl-5 before:absolute before:inset-y-0 before:left-0 before:w-[4px] ${band}`}>
            <p className={`flex items-center gap-1.5 text-[13px] font-bold ${tone}`}>
              <Icon />
              {c.label}
            </p>
            <p className="mt-1 text-[17px] leading-snug font-bold tracking-tight">{c.keyword}</p>
            <Prose text={c.note} className="mt-0.5 text-[14px] leading-[1.6] text-ink-2" />
          </li>
        ))}
      </ul>

      {card.inputs.length > 0 && (
        <p className="mt-4 text-[13px] leading-[1.6] text-ink-3">
          <span className="font-semibold text-ink-2">사용한 정보</span> {card.inputs.join(" · ")}
        </p>
      )}
      <p className="mt-2 border-t border-line pt-3 text-[13px] leading-[1.6] text-ink-3">{CARD_DISCLAIMER}</p>
    </section>
  );
}
