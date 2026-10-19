import type { FlowFortify } from "@/lib/report/reading/flow-view";
import { LeafIcon } from "@/components/ui/icons";
import { Prose } from "./reading-parts";

/**
 * 개운 카드 — 보완 후보 기운(동점이면 둘 다 같은 무게로)마다 추천 장소 · 색상 칩 · 숫자와 느낌표 팁 한 줄.
 * 카드는 저장된 근거 `saju.fortify`가 정한 후보에서 만들며 기운을 고정하지 않는다. 전통 오행 대응의 상징이라 효과를 보장하지 않는다는 안내는 6번 장 맨 아래 한곳에 있다.
 * 색은 칩 옆에 이름을 함께 적어 색만으로 구분하지 않는다.
 */
export function FortifyCards({ fortify }: { fortify: FlowFortify }) {
  return (
    <section className="mt-8" aria-label="개운">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-accent">
        <LeafIcon />
        개운 · 생활에서 채우기
      </p>
      <Prose text={fortify.lead} className="mt-1.5 text-[17px] leading-snug font-bold tracking-tight" />
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {fortify.cards.map((c) => (
          <li key={c.element} className="flex flex-col rounded-xl bg-canvas p-4 shadow-soft">
            <p className="text-[17px] leading-snug font-bold tracking-tight">{c.title}</p>
            <dl className="mt-3 space-y-3 text-[15px] leading-[1.6]">
              <div>
                <dt className="text-[13px] font-semibold text-ink-3">추천 장소</dt>
                <dd className="mt-0.5">{c.place}</dd>
              </div>
              <div>
                <dt className="text-[13px] font-semibold text-ink-3">추천 색상</dt>
                <dd className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1.5">
                  {c.colors.map((col) => (
                    <span key={col.name} className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className="size-4 shrink-0 rounded-full border border-line-strong" style={{ backgroundColor: col.css }} />
                      {col.name}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-[13px] font-semibold text-ink-3">추천 숫자</dt>
                <dd className="mt-0.5 tabular-nums">{c.numbers}</dd>
              </div>
            </dl>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2.5 text-[14px] leading-[1.6] text-ink-2">
              <span aria-hidden="true" className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[13px] leading-none font-bold text-white">
                !
              </span>
              <span>{c.tip}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
