import type { FullReport } from "@/lib/report/types";

/** 6) 통합 해석 — 공통점과 서로 다른 관점을 나눠서 보여준다 */
export function IntegratedView({ integrated }: { integrated: FullReport["integrated"] }) {
  return (
    <div className="grid gap-10 md:grid-cols-2 md:gap-8">
      <div>
        <h3 className="border-b border-ink pb-2 text-[17px] font-bold">공통적으로 나타나는 특징</h3>
        <ul className="divide-y divide-line">
          {integrated.common.map((c) => (
            <li key={c.point} className="py-4">
              <p className="text-[16px] font-semibold leading-snug">{c.point}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="근거 지표">
                {c.basis.map((b) => (
                  <li key={b} className="rounded bg-mist px-2 py-0.5 text-[13px] text-ink-2">
                    {b}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="border-b border-ink pb-2 text-[17px] font-bold">관점이 다른 부분</h3>
        <ul className="divide-y divide-line">
          {integrated.different.map((d) => (
            <li key={d.point} className="py-4">
              <p className="text-[16px] font-semibold leading-snug">{d.point}</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{d.explanation}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 7) 실천 제안 */
export function ActionList({ actions }: { actions: FullReport["actions"] }) {
  return (
    <ol className="border-t border-ink">
      {actions.map((a, i) => (
        <li key={a.title} className="flex gap-4 border-b border-line py-4">
          <span className="w-6 shrink-0 text-[17px] font-bold tabular-nums text-accent">{i + 1}</span>
          <div>
            <p className="text-[16px] font-semibold leading-snug">{a.title}</p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{a.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ReportDisclaimer() {
  return (
    <p className="text-[13px] leading-relaxed text-ink-3">
      이 리포트는 자기 이해를 돕는 참고 자료이며, 의학적·심리학적 진단을 대신하지 않습니다. 대표 경향은 현재
      응답에서 보이는 경향으로, 시기와 상황에 따라 달라질 수 있습니다. 사주는 전통 해석 체계이며 심리검사 점수와
      합산하지 않습니다.
    </p>
  );
}
