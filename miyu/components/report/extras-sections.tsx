import type { ReportExtras } from "@/lib/report/extras";
import { SectionTitle } from "./summary-blocks";

/** 원국 쉬운 풀이 — 일간 · 오행 각각의 뜻과 내 원국에서의 모습 (표는 SajuChart가 따로 보여 준다) */
export function PlainReadingSection({ plain, id }: { plain: NonNullable<ReportExtras["plain"]>; id: string }) {
  return (
    <section aria-labelledby={id}>
      <SectionTitle id={id} note="원국 표를 일상의 말로 풀었습니다.">
        그래서 어떤 사람일까요
      </SectionTitle>
      <p className="text-[19px] font-semibold leading-snug">{plain.headline}</p>
      <dl className="mt-5 divide-y divide-line border-y border-line">
        <div className="grid gap-1 py-4 md:grid-cols-[132px_minmax(0,1fr)] md:gap-4">
          <dt className="text-[14px] font-semibold text-ink-2">
            나를 나타내는 글자
            <span className="mt-0.5 block font-normal text-ink-3">
              {plain.dayMaster.label} · {plain.dayMaster.image}
            </span>
          </dt>
          <dd className="text-[16px] leading-relaxed">{plain.dayMaster.trait}</dd>
        </div>
        <div className="grid gap-1 py-4 md:grid-cols-[132px_minmax(0,1fr)] md:gap-4">
          <dt className="text-[14px] font-semibold text-ink-2">잘하는 점</dt>
          <dd className="text-[16px] leading-relaxed">{plain.dayMaster.goodAt}</dd>
        </div>
        <div className="grid gap-1 py-4 md:grid-cols-[132px_minmax(0,1fr)] md:gap-4">
          <dt className="text-[14px] font-semibold text-ink-2">주의할 점</dt>
          <dd className="text-[16px] leading-relaxed">{plain.dayMaster.watchOut}</dd>
        </div>
      </dl>

      <h3 className="mt-8 text-[15px] font-semibold text-ink-2">오행별로 풀어 보면</h3>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {plain.elements.map((e) => (
          <li key={e.element} className="py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-[16px] font-semibold">
                {e.element}
                <span className="ml-1.5 text-[13px] font-normal text-ink-3">
                  {e.hanja} · {e.image} — {e.force}
                </span>
              </p>
              <p className={`text-[14px] tabular-nums ${e.level === "many" || e.level === "none" ? "font-semibold text-accent" : "text-ink-3"}`}>
                {e.count}개 · {e.levelLabel}
              </p>
            </div>
            {e.plain && <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{e.plain}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-3">{plain.limits}</p>
    </section>
  );
}

/** 개인 질문과 답 */
export function QuestionsSection({ questions, id }: { questions: ReportExtras["questions"]; id: string }) {
  if (!questions.length) return null;
  return (
    <section aria-labelledby={id}>
      <SectionTitle id={id} note="내 원국의 계산 결과에서 나온 질문과 쉬운 말 답입니다.">
        내 원국이 던지는 질문과 답
      </SectionTitle>
      <ol className="border-t border-ink">
        {questions.map((q, i) => (
          <li key={q.id} className="border-b border-line py-5">
            <div className="flex gap-3">
              <span className="w-5 shrink-0 text-[17px] font-bold tabular-nums text-accent">{i + 1}</span>
              <div>
                <p className="text-[17px] font-semibold leading-snug">{q.question}</p>
                <p className="mt-2 text-[16px] leading-[1.8]">{q.answer}</p>
                <p className="mt-2 text-[13px] text-ink-3">근거 · {q.basis}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 상황별 잘하는 점 · 주의할 점 */
export function SituationsSection({ situations, id }: { situations: ReportExtras["situations"]; id: string }) {
  return (
    <section aria-labelledby={id}>
      <SectionTitle id={id} note="응답에서 나타난 경향을 생활 속 다섯 가지 상황으로 풀었습니다. ‘~라면 이 경향 때문일 수 있어요’라는 뜻이며 단정이 아닙니다.">
        상황별 잘하는 점 · 주의할 점
      </SectionTitle>
      <div className="divide-y divide-line border-y border-line">
        {situations.map((s) => (
          <article key={s.id} className="py-6">
            <h3 className="text-[18px] font-bold">{s.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{s.scenario}</p>
            <dl className="mt-4 grid gap-4 md:grid-cols-2 md:gap-8">
              <div>
                <dt className="text-[14px] font-semibold text-accent">잘하는 점 · {s.strengthLabel}</dt>
                <dd className="mt-1.5 text-[16px] leading-relaxed">{s.strength}</dd>
              </div>
              <div>
                <dt className="text-[14px] font-semibold text-ink-2">주의할 점 · {s.cautionLabel}</dt>
                <dd className="mt-1.5 text-[16px] leading-relaxed">{s.caution}</dd>
              </div>
            </dl>
            <p className="mt-4 rounded bg-accent-soft px-3 py-2.5 text-[15px] leading-relaxed">
              <span className="font-semibold text-accent">바로 해볼 것 </span>
              {s.tip}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/** 어울리는 관계 조건 */
export function PartnerSection({ partner, id }: { partner: NonNullable<ReportExtras["partner"]>; id: string }) {
  return (
    <section aria-labelledby={id}>
      <SectionTitle id={id} note={partner.intro}>
        어울리는 관계 조건
      </SectionTitle>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="border-b border-ink pb-2 text-[17px] font-bold">편안하기 쉬운 상대의 모습</h3>
          <ul className="divide-y divide-line">
            {partner.fits.map((f) => (
              <li key={f.title} className="py-4">
                <p className="text-[16px] font-semibold leading-snug">{f.title}</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{f.detail}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="border-b border-ink pb-2 text-[17px] font-bold">맞추기 어려울 수 있는 모습</h3>
          <ul className="divide-y divide-line">
            {partner.watch.map((f) => (
              <li key={f.title} className="py-4">
                <p className="text-[16px] font-semibold leading-snug">{f.title}</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{f.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <h3 className="mt-8 text-[15px] font-semibold text-ink-2">관계 주제가 두드러질 수 있는 해</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-3">{partner.timing.note}</p>
      {partner.timing.years.length > 0 && (
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {partner.timing.years.map((y, i) => (
            <li key={`${y.year}-${i}`} className="grid gap-1 py-3.5 md:grid-cols-[132px_minmax(0,1fr)] md:gap-4">
              <p className="text-[15px] font-semibold text-accent">{y.label}</p>
              <p className="text-[15px] leading-relaxed text-ink-2">{y.why}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[13px] leading-relaxed text-ink-3">{partner.limits}</p>
    </section>
  );
}

/** 보완 아이템 */
export function ItemsSection({ items, id }: { items: NonNullable<ReportExtras["items"]>; id: string }) {
  return (
    <section aria-labelledby={id}>
      <SectionTitle id={id} note={items.intro}>
        보완 아이템
      </SectionTitle>
      <div className="divide-y divide-line border-y border-line">
        {items.items.map((it) => (
          <article key={it.element} className="py-5">
            <h3 className="text-[17px] font-bold">
              {it.element}({it.image}) 기운 <span className="text-[14px] font-normal text-ink-3">{it.stateLabel}</span>
            </h3>
            <dl className="mt-3 grid gap-x-4 gap-y-2 text-[15px] leading-relaxed sm:grid-cols-[72px_minmax(0,1fr)]">
              <dt className="font-medium text-ink-3">색</dt>
              <dd>{it.colors.join(" · ")}</dd>
              <dt className="font-medium text-ink-3">소재</dt>
              <dd>{it.materials.join(" · ")}</dd>
              <dt className="font-medium text-ink-3">공간</dt>
              <dd>{it.place}</dd>
              <dt className="font-medium text-ink-3">습관</dt>
              <dd>{it.habits.join(" · ")}</dd>
            </dl>
          </article>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-3">{items.limits}</p>
    </section>
  );
}
