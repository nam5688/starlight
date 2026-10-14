import { AdjustIcon, FlowIcon, StrengthIcon } from "@/components/ui/icons";
import { CARD_DISCLAIMER, type TalkCard } from "@/lib/report/reading/talk";
import { MiyuAvatar } from "./miyu-character";

/**
 * 분석 카드 한 장 — 대화 맨 앞에 보이고, 같은 내용이 이미지로 저장된다(card-image.ts).
 * 화면보다 길지 않게 짧게(운영자 2026-10-15): 이름 · 대표 경향 설명 · 핵심 문장 + 세 줄(내가 강한 포인트 · 내가 힘들 수 있는 포인트 · 지금 나의 시기).
 * 자세한 설명은 주제를 눌렀을 때 대화로 이어진다. 테두리 대신 색 바탕으로 나누고, 약한 그림자는 이 카드에만 쓴다. 점수 그래프 · 정확도는 넣지 않는다.
 */
export function AnalysisCard({ card, name, dateLabel }: { card: TalkCard; name: string; dateLabel: string }) {
  const rows = [
    { c: card.strength, Icon: StrengthIcon, tone: "text-positive", face: "bg-positive-soft" },
    { c: card.caution, Icon: AdjustIcon, tone: "text-caution", face: "bg-caution-soft" },
    { c: card.flow, Icon: FlowIcon, tone: "text-accent-strong", face: "bg-accent-soft" },
  ];
  return (
    <section aria-label="나의 분석 카드" className="overflow-hidden rounded-3xl bg-canvas shadow-soft">
      <div className="flex items-center gap-3 bg-accent-soft px-4 py-3.5">
        <MiyuAvatar className="size-12" mood="happy" />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-bold text-accent-strong">ME:U 미유</span>
            <span className="text-[13px] text-ink-3">{dateLabel}</span>
          </p>
          <p className="text-[16px] leading-snug font-bold">{name} 님의 분석 카드</p>
        </div>
      </div>

      <div className="px-4 pt-3.5 pb-3.5">
        {card.tendency && <p className="text-[13px] leading-snug text-ink-3">{card.tendency}</p>}
        <p className="mt-1 text-[20px] leading-[1.4] font-bold tracking-tight">{card.headline}</p>

        <ul className="mt-3 space-y-2">
          {rows.map(({ c, Icon, tone, face }) => (
            <li key={c.label} className={`rounded-xl ${face} px-3.5 py-2.5`}>
              <p className={`flex items-center gap-1.5 text-[13px] font-bold ${tone}`}>
                <Icon />
                {c.label}
              </p>
              <p className="mt-0.5 text-[15px] leading-snug font-semibold">{c.keyword}</p>
            </li>
          ))}
        </ul>
        {card.flow.foot && <p className="mt-2 text-[13px] leading-[1.5] text-ink-3 tabular-nums">{card.flow.foot}</p>}
        <p className="mt-2 text-[12px] leading-[1.5] text-ink-3">{CARD_DISCLAIMER}</p>
      </div>
    </section>
  );
}
