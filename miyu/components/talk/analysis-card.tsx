import { AdjustIcon, FlowIcon, StrengthIcon } from "@/components/ui/icons";
import { Prose } from "@/components/report/reading-parts";
import { CARD_DISCLAIMER, type TalkCard } from "@/lib/report/reading/talk";
import { MiyuAvatar } from "./miyu-character";

/**
 * 분석 카드 한 장 — 대화 맨 앞에 보이고, 같은 내용이 이미지로 저장된다(card-image.ts).
 * 위쪽 연보라 띠에 작은 캐릭터 · 이름 · 대표 경향, 아래에 핵심 해석과 색이 있는 칸 셋(장점 · 단점이 될 수 있는 부분 · 지금 나의 시기).
 * 테두리 대신 옅은 그림자와 색 바탕으로 나눈다. 점수 그래프 · 정확도는 넣지 않는다.
 */
export function AnalysisCard({ card, name, dateLabel }: { card: TalkCard; name: string; dateLabel: string }) {
  const boxes = [
    { c: card.strength, Icon: StrengthIcon, tone: "text-positive", face: "bg-positive-soft" },
    { c: card.caution, Icon: AdjustIcon, tone: "text-caution", face: "bg-caution-soft" },
    { c: card.flow, Icon: FlowIcon, tone: "text-accent-strong", face: "bg-accent-soft" },
  ];
  return (
    <section aria-label="나의 분석 카드" className="overflow-hidden rounded-3xl bg-canvas shadow-soft">
      <div className="flex items-center gap-3.5 bg-accent-soft px-4 py-4 md:px-6">
        <MiyuAvatar className="size-16" notebook blink />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-bold text-accent-strong">ME:U 미유</span>
            <span className="text-[13px] text-ink-3">{dateLabel}</span>
          </p>
          <p className="mt-0.5 text-[17px] leading-snug font-bold">{name} 님의 분석 카드</p>
          {card.tendency && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center rounded-full bg-canvas px-3 py-0.5 text-[15px] font-bold text-accent-strong">{card.tendency}</span>
              <span className="text-[13px] text-ink-3">나의 대표 경향</span>
            </p>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 pb-4 md:px-6">
        <p className="text-[21px] leading-[1.4] font-bold tracking-tight">{card.headline}</p>

        <ul className="mt-4 space-y-2.5">
          {boxes.map(({ c, Icon, tone, face }) => (
            <li key={c.label} className={`rounded-2xl ${face} px-4 py-3.5`}>
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
        <p className="mt-3 text-[13px] leading-[1.6] text-ink-3">{CARD_DISCLAIMER}</p>
      </div>
    </section>
  );
}
