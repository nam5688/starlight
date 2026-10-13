import type { ReportExtras } from "@/lib/report/extras";
import { AdjustIcon, StrengthIcon } from "@/components/ui/icons";
import { Fold, FoldRow } from "./reading-parts";
import { SectionTitle } from "./summary-blocks";

/** 원국 쉬운 풀이 — 일간 · 오행 각각의 뜻과 내 원국에서의 모습 (표는 SajuChart가 따로 보여 준다). 오행별 풀이는 접어 둔다 */
export function PlainReadingSection({ plain, id }: { plain: NonNullable<ReportExtras["plain"]>; id: string }) {
  return (
    <section aria-labelledby={id}>
      <SectionTitle id={id} note="원국 표를 일상의 말로 풀었습니다.">
        그래서 어떤 사람일까요
      </SectionTitle>
      <p className="text-[18px] leading-snug font-semibold md:text-[20px]">{plain.headline}</p>
      <div className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-canvas">
        <div className="px-4 py-3.5">
          <p className="text-[13px] font-semibold text-ink-3">
            나를 나타내는 글자 · {plain.dayMaster.label} · {plain.dayMaster.image}
          </p>
          <p className="mt-1 text-[15px] leading-[1.7]">{plain.dayMaster.trait}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-positive">
            <StrengthIcon />
            잘 발휘될 때
          </p>
          <p className="mt-1 text-[15px] leading-[1.7]">{plain.dayMaster.goodAt}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-caution">
            <AdjustIcon />
            과해질 때 주의할 점
          </p>
          <p className="mt-1 text-[15px] leading-[1.7]">{plain.dayMaster.watchOut}</p>
        </div>
      </div>

      <FoldRow>
        <Fold label="오행별로 풀어 보면" hint="많거나 적은 기운이 관계 · 일 · 선택에서 어떻게 나타날 수 있는지" wide>
          <p className="mb-4 text-[13px] leading-[1.65] text-ink-3">개수만으로 성격을 정하지 않고, “이런 모습으로 나타날 수 있다”는 전통 해석의 방향입니다.</p>
          <ul className="divide-y divide-line">
            {plain.elements.map((e) => (
              <li key={e.element} className="py-5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-[16px] font-semibold">
                    {e.element}
                    <span className="ml-1.5 text-[13px] font-normal text-ink-3">
                      {e.hanja} · {e.image} — {e.keywords}
                    </span>
                  </p>
                  <p className={`text-[13px] tabular-nums ${e.level === "many" || e.level === "none" ? "font-semibold text-accent-strong" : "text-ink-3"}`}>
                    {e.count}개 · {e.levelLabel}
                  </p>
                </div>
                {e.plain && <p className="mt-2 text-[15px] leading-[1.7] text-ink-2">{e.plain}</p>}
                {e.domains ? (
                  <dl className="mt-3 space-y-3 border-l-[3px] border-line-strong pl-3.5 text-[15px] leading-[1.7]">
                    {(
                      [
                        ["관계에서", e.domains.relation],
                        ["일에서", e.domains.work],
                        ["선택에서", e.domains.choice],
                      ] as const
                    ).map(([label, text]) => (
                      <div key={label}>
                        <dt className="text-[13px] font-semibold text-ink-3">{label}</dt>
                        <dd>{text}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-[14px] text-ink-3">고르게 들어 있어 한쪽으로 크게 치우치지 않은 기운입니다.</p>
                )}
              </li>
            ))}
          </ul>
        </Fold>
      </FoldRow>
      <p className="mt-3 text-[13px] leading-[1.65] text-ink-3">{plain.limits}</p>
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
      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-xl border border-line bg-canvas px-4 py-4">
            <p className="flex gap-2.5 text-[16px] leading-snug font-semibold">
              <span className="w-4 shrink-0 text-accent-strong tabular-nums">{i + 1}</span>
              <span>{q.question}</span>
            </p>
            <p className="mt-2.5 border-l-[3px] border-line-strong pl-3.5 text-[15px] leading-[1.75]">{q.answer}</p>
            <p className="mt-2.5 text-[13px] leading-[1.6] text-ink-3">근거 · {q.basis}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 상황별 잘하는 점 · 주의할 점 — 상황 이름과 한 줄을 보고 눌러서 자세히 본다 */
export function SituationsSection({ situations, id }: { situations: ReportExtras["situations"]; id: string }) {
  return (
    <section aria-labelledby={id}>
      <SectionTitle id={id} note="응답에서 나타난 경향을 일 · 가까운 관계 · 선택 · 갈등의 네 상황으로 풀었습니다. ‘~라면 이 경향 때문일 수 있어요’라는 뜻이며 단정이 아닙니다.">
        상황별 잘하는 점 · 주의할 점
      </SectionTitle>
      <FoldRow>
        {situations.map((s) => (
          <Fold key={s.id} label={s.title} hint={`${s.strengthLabel} / ${s.cautionLabel}`} wide>
            <div className="space-y-5">
              <div className="border-l-[3px] border-line-strong pl-3.5">
                <p className="text-[13px] font-semibold text-ink-3">이런 모습이라면</p>
                <p className="mt-1 text-[15px] leading-[1.75] text-ink-2">{s.scenario}</p>
              </div>
              <div className="border-l-[3px] border-positive pl-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-positive">
                  <StrengthIcon />
                  잘 발휘될 때 · {s.strengthLabel}
                </p>
                <p className="mt-1 text-[15px] leading-[1.75]">{s.strength}</p>
              </div>
              <div className="border-l-[3px] border-caution pl-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-caution">
                  <AdjustIcon />
                  과해질 때 · {s.cautionLabel}
                </p>
                <p className="mt-1 text-[15px] leading-[1.75]">{s.caution}</p>
              </div>
              <div className="border-l-[3px] border-accent pl-3.5">
                <p className="text-[13px] font-semibold text-accent-strong">해볼 선택</p>
                <p className="mt-1 text-[15px] leading-[1.75]">{s.tip}</p>
              </div>
            </div>
          </Fold>
        ))}
      </FoldRow>
    </section>
  );
}

/** 어울리는 관계 조건 */
export function PartnerSection({ partner, id }: { partner: NonNullable<ReportExtras["partner"]>; id: string }) {
  const lists = [
    { title: "편안하기 쉬운 상대의 모습", items: partner.fits, Icon: StrengthIcon, tone: "text-positive" },
    { title: "맞추기 어려울 수 있는 모습", items: partner.watch, Icon: AdjustIcon, tone: "text-caution" },
  ];
  return (
    <section aria-labelledby={id}>
      <SectionTitle id={id} note={partner.intro}>
        어울리는 관계 조건
      </SectionTitle>
      <p className="mb-5 text-[14px] leading-[1.65] text-ink-2">
        상대 없이 나만 보는 “잘 맞는 관계 스타일”입니다. 특정한 사람과의 궁합이나 상대의 나이 · 직업 · 만나는 날짜는 이 리포트에 포함되지 않습니다.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {lists.map((l) => (
          <div key={l.title} className="rounded-xl border border-line bg-canvas px-4 py-4">
            <p className={`flex items-center gap-1.5 text-[14px] font-semibold ${l.tone}`}>
              <l.Icon />
              {l.title}
            </p>
            <ul className="mt-3 divide-y divide-line">
              {l.items.map((f) => (
                <li key={f.title} className="py-3.5 first:pt-0 last:pb-0">
                  <p className="text-[15px] leading-snug font-semibold">{f.title}</p>
                  <p className="mt-1 text-[14px] leading-[1.7] text-ink-2">{f.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <FoldRow>
        <Fold label="관계 주제가 두드러질 수 있는 해" hint={partner.timing.years.length > 0 ? "연 단위 주제이며 예측이 아닙니다" : partner.timing.note} wide>
          <p className="text-[14px] leading-[1.7] text-ink-3">{partner.timing.note}</p>
          {partner.timing.years.length > 0 && (
            <ul className="mt-4 space-y-4">
              {partner.timing.years.map((y, i) => (
                <li key={`${y.year}-${i}`} className="border-l-[3px] border-accent pl-3.5">
                  <p className="text-[14px] font-semibold text-accent-strong">{y.label}</p>
                  <p className="mt-1 text-[15px] leading-[1.7] text-ink-2">{y.why}</p>
                </li>
              ))}
            </ul>
          )}
        </Fold>
      </FoldRow>
      <p className="mt-3 text-[13px] leading-[1.65] text-ink-3">{partner.limits}</p>
    </section>
  );
}

/** 보완 아이템 — 기운마다 접어 둔다 */
export function ItemsSection({ items, id }: { items: NonNullable<ReportExtras["items"]>; id: string }) {
  return (
    <section aria-labelledby={id}>
      <SectionTitle id={id} note={items.intro}>
        보완 아이템
      </SectionTitle>
      <FoldRow>
        {items.items.map((it) => (
          <Fold key={it.element} label={`${it.element}(${it.image}) 기운`} hint={it.stateLabel} wide>
            <dl className="space-y-4 text-[15px] leading-[1.7]">
              {(
                [
                  ["색", it.colors.join(" · ")],
                  ["소재", it.materials.join(" · ")],
                  ["공간", it.place],
                  ["습관", it.habits.join(" · ")],
                ] as const
              ).map(([label, text]) => (
                <div key={label} className="border-l-[3px] border-line-strong pl-3.5">
                  <dt className="text-[13px] font-semibold text-ink-3">{label}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </Fold>
        ))}
      </FoldRow>
      <p className="mt-3 text-[13px] leading-[1.65] text-ink-3">{items.limits}</p>
    </section>
  );
}
