import { ChevronIcon } from "@/components/ui/icons";
import type { IntegratedReadingReport, ReadingBasis, ReadingSection } from "@/lib/report/reading/types";
import type { SajuSection } from "@/lib/report/types";
import { SajuChart } from "./detail-sections";
import { Lines } from "./lines";
import { ReportToc } from "./toc";

const STATUS_LABEL = { used: "사용", dev: "사용 · 개발용 문항", none: "없음" } as const;

/**
 * 개인 통합 리포트(읽기 구조) — 종합 해석을 먼저 읽고, 분석한 이유는 눌러서 본다.
 * 첫 화면: 핵심 해석 한 문장 · 요약 3개 · 목차. 주제마다 핵심 결론 → 쉬운 설명 → 예를 들면 → 살펴볼 점 → (접힘) 이렇게 분석했어요.
 * 내부 근거 ID는 화면에 보이지 않는다. idPrefix: 화면마다 HTML id가 겹치지 않게 붙인다.
 */
export function ReadingReportView({
  report,
  saju,
  idPrefix = "",
  footer,
}: {
  report: IntegratedReadingReport;
  saju: SajuSection;
  idPrefix?: string;
  footer?: React.ReactNode;
}) {
  const id = (name: string) => `${idPrefix}${name}`;
  const used = report.inputs.filter((i) => i.status !== "none").map((i) => i.name.replace(/\(.*\)/, ""));
  const none = report.inputs.filter((i) => i.status === "none").map((i) => i.name);
  const toc = [
    ...report.sections.map((s) => ({ id: id(s.id), label: s.title })),
    { id: id(report.flow.id), label: report.flow.title },
    { id: id("actions"), label: "지금 확인해 볼 것" },
    { id: id("chart"), label: "내 사주 계산표" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8 lg:grid lg:grid-cols-[200px_minmax(0,720px)] lg:gap-16 lg:py-14">
      <ReportToc items={toc} />

      <article className="min-w-0 space-y-16">
        <section aria-labelledby={id("headline")}>
          <h2 id={id("headline")} className="text-[15px] font-semibold text-accent">
            {report.personName} 님의 핵심 해석
          </h2>
          <Lines text={report.headline} gap="mt-1" className="mt-3 border-l-4 border-accent pl-4 text-[27px] leading-[1.3] font-bold tracking-tight md:text-[36px]" />

          <dl className="mt-10 divide-y divide-line border-y border-line">
            {report.summary.map((s) => (
              <div key={s.label} className="py-6">
                <dt className="text-[14px] font-semibold text-accent">{s.label}</dt>
                <dd className="mt-1.5">
                  <p className="text-[23px] leading-snug font-bold tracking-tight md:text-[26px]">{s.keyword}</p>
                  <Lines text={s.text} className="mt-2 text-[14px] leading-relaxed text-ink-2 md:text-[15px]" />
                </dd>
              </div>
            ))}
          </dl>

          <details className="group mt-6">
            <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden">
              <span className="text-[14px] leading-relaxed text-ink-2">
                <span className="font-semibold text-ink">참고한 자료</span> {used.join(" · ")}
                <span className="mx-1.5 text-ink-3">/</span>
                <span className="font-semibold text-ink">없음</span> {none.join(" · ")}
              </span>
              <span className="flex shrink-0 items-center gap-1 pt-0.5 text-[13px] text-ink-3">
                <span className="group-open:hidden">자세히</span>
                <span className="hidden group-open:inline">접기</span>
                <ChevronIcon className="size-4 transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <ul className="divide-y divide-line border-y border-line text-[14px]">
              {report.inputs.map((i) => (
                <li key={i.name} className="grid gap-0.5 py-3 md:grid-cols-[180px_minmax(0,1fr)] md:gap-4">
                  <p className="font-semibold">
                    {i.name}
                    <span className={`ml-2 text-[13px] font-medium ${i.status === "none" ? "text-ink-3" : "text-accent"}`}>{STATUS_LABEL[i.status]}</span>
                  </p>
                  <p className="leading-relaxed text-ink-2">
                    {i.note}
                    {i.usedIn.length > 0 && <span className="mt-1 block text-[13px] text-ink-3">쓰인 곳 · {i.usedIn.join(" · ")}</span>}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        </section>

        {report.sections.map((s, i) => (
          <ReadingSectionView key={s.id} section={s} id={id(s.id)} index={i + 1} />
        ))}

        <section aria-labelledby={id(report.flow.id)}>
          <SectionHead id={id(report.flow.id)} index={report.sections.length + 1} title={report.flow.title} headline={report.flow.headline} lead={report.flow.lead} />
          <Lines text={report.flow.caveat} className="mt-4 rounded-md bg-mist px-4 py-3 text-[14px] leading-relaxed text-ink-2" />

          <h3 className="mt-8 border-b border-ink pb-2 text-[17px] font-bold">사주 시기 해석</h3>
          <ul className="divide-y divide-line">
            {report.flow.periods.map((p) => (
              <li key={p.period} className="py-4">
                <p className="text-[16px] font-semibold">{p.period}</p>
                <Lines text={p.theme} className="mt-1.5 text-[16px] leading-[1.8]" />
                <div className="mt-2.5">
                  <p className="text-[13px] font-semibold text-accent">살펴볼 점</p>
                  <Lines text={p.watch} className="mt-0.5 text-[15px] leading-relaxed text-ink-2" />
                </div>
              </li>
            ))}
          </ul>

          <h3 className="mt-8 border-b border-ink pb-2 text-[17px] font-bold">응답으로 본 시나리오</h3>
          <p className="mt-2 text-[13px] text-ink-3">{report.flow.scenarioNote}</p>
          <ul className="divide-y divide-line">
            {report.flow.scenarios.map((s) => (
              <li key={s.when} className="py-4">
                <p className="text-[16px] font-semibold leading-snug">{s.when}</p>
                <Lines text={s.then} className="mt-1.5 text-[16px] leading-[1.8]" />
              </li>
            ))}
          </ul>

          <h3 className="mt-8 border-b border-ink pb-2 text-[17px] font-bold">연구 통계</h3>
          <Lines text={report.flow.statistics} className="mt-3 text-[15px] leading-[1.8] text-ink-2" />

          <BasisDetails basis={report.flow.basis} />
        </section>

        <section aria-labelledby={id("actions")}>
          <h2 id={id("actions")} className="text-[22px] font-bold tracking-tight md:text-[24px]">
            지금 확인해 볼 것
          </h2>
          <p className="mt-1.5 mb-5 text-[14px] leading-relaxed text-ink-3">정답을 정하는 목록이 아니라, 위의 해석이 나에게 맞는지 확인해 볼 수 있는 작은 행동입니다.</p>
          <ol className="border-t border-ink">
            {report.actions.map((a, i) => (
              <li key={a.title} className="flex gap-4 border-b border-line py-5">
                <span className="w-6 shrink-0 text-[17px] font-bold tabular-nums text-accent">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[16px] leading-snug font-semibold">{a.title}</p>
                  <Lines text={a.detail} className="mt-1.5 text-[15px] leading-relaxed text-ink-2" />
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby={id("chart")}>
          <details className="group border-y border-line">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 [&::-webkit-details-marker]:hidden">
              <span>
                <span id={id("chart")} className="block text-[17px] font-bold">
                  내 사주 계산표
                </span>
                <span className="block text-[14px] text-ink-3">원국 · 오행 · 계산 기준 (만세력 엔진 계산 결과)</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[13px] text-ink-3">
                <span className="group-open:hidden">펼치기</span>
                <span className="hidden group-open:inline">접기</span>
                <ChevronIcon className="size-5 transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div className="pb-6">
              <SajuChart saju={saju} />
            </div>
          </details>
        </section>

        <div className="space-y-6 border-t border-line pt-8">
          <section aria-label="준비 중인 기능">
            <p className="text-[14px] font-semibold text-ink-2">이어서 살펴볼 수 있는 것</p>
            <ul className="mt-2 divide-y divide-line border-y border-line text-[15px]">
              {[
                ["상대와의 관계 비교", "상대가 직접 참여해 두 사람의 응답을 함께 비교합니다."],
                ["AI 고민 상담", "내 분석을 참고해 연애 · 관계 · 돈 · 일 고민을 이어서 상담합니다."],
              ].map(([name, desc]) => (
                <li key={name} className="grid gap-0.5 py-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-baseline md:gap-4">
                  <p className="font-semibold">{name}</p>
                  <p className="leading-relaxed text-ink-2">{desc}</p>
                  <p className="text-[13px] font-medium text-ink-3">준비 중</p>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-[13px] leading-relaxed text-ink-3">
            미유는 사주의 전통적 해석과 자기보고식 응답을 활용한 자기이해 서비스입니다. 사주 해석과 미래 전망은 과학적으로 검증된 개인 예측이 아니며, 제시된 가능성은 실제 사건과 결과를 보장하지 않습니다.
          </p>
          {footer}
        </div>
      </article>
    </div>
  );
}

/** 주제 머리 — 작은 이름표 → 크고 굵은 핵심 결론 → 한두 줄 작은 설명. 색은 늘리지 않고 크기와 굵기로 구분한다 */
function SectionHead({ id, index, title, headline, lead }: { id: string; index: number; title: string; headline: string; lead: string }) {
  return (
    <>
      <h2 id={id} className="text-[14px] font-semibold text-accent">
        <span className="mr-1.5 tabular-nums">{index}</span>
        {title}
      </h2>
      <Lines text={headline} gap="mt-1" className="mt-2 text-[26px] leading-[1.3] font-bold tracking-tight md:text-[32px]" />
      <Lines text={lead} gap="mt-1" className="mt-3 text-[15px] leading-relaxed text-ink-2 md:text-[16px]" />
    </>
  );
}

function ReadingSectionView({ section: s, id, index }: { section: ReadingSection; id: string; index: number }) {
  return (
    <section aria-labelledby={id}>
      <SectionHead id={id} index={index} title={s.title} headline={s.headline} lead={s.lead} />
      <div className="mt-7 space-y-6 border-t border-line pt-7">
        {s.paragraphs.map((p) => (
          <Lines key={p} text={p} className="text-[16px] leading-[1.85]" gap="mt-1.5" />
        ))}
      </div>

      {s.traits && (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {s.traits.map((t) => (
            <li key={t.name} className="py-4">
              <p className="text-[16px] font-bold">{t.name}</p>
              <div className="mt-2 grid gap-3 md:grid-cols-2 md:gap-6">
                <p className="text-[15px] leading-relaxed">
                  <span className="mb-0.5 block text-[13px] font-semibold text-accent">힘이 되는 때</span>
                  {t.shines}
                </p>
                <p className="text-[15px] leading-relaxed">
                  <span className="mb-0.5 block text-[13px] font-semibold text-ink-3">부담이 되는 때</span>
                  {t.burden}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {s.comfort && (
        <div className="mt-6">
          <div className="grid gap-6 border-y border-line py-4 md:grid-cols-2 md:gap-8">
            <div>
              <p className="text-[13px] font-semibold text-accent">편안하게 느낄 조건</p>
              <ul className="mt-2 space-y-1.5 text-[15px] leading-relaxed">
                {s.comfort.comfortable.map((c) => (
                  <li key={c} className="relative pl-4 before:absolute before:top-[0.8em] before:left-0 before:h-px before:w-2 before:bg-ink-3">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-ink-3">부딪히기 쉬운 상황</p>
              <ul className="mt-2 space-y-1.5 text-[15px] leading-relaxed">
                {s.comfort.clash.map((c) => (
                  <li key={c} className="relative pl-4 before:absolute before:top-[0.8em] before:left-0 before:h-px before:w-2 before:bg-ink-3">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{s.comfort.note}</p>
        </div>
      )}

      {s.caveat && <Lines text={s.caveat} className="mt-5 rounded-md bg-mist px-4 py-3 text-[14px] leading-relaxed text-ink-2" />}

      <div className="mt-7 border-l-2 border-line-strong pl-4">
        <p className="text-[13px] font-semibold text-ink-3">예를 들면</p>
        <Lines text={s.example} className="mt-1.5 text-[16px] leading-[1.8] text-ink-2" />
      </div>

      <div className="mt-6">
        <p className="text-[13px] font-semibold text-accent">살펴볼 점</p>
        <Lines text={s.watch} className="mt-1.5 text-[16px] leading-[1.8]" />
      </div>

      <BasisDetails basis={s.basis} />
    </section>
  );
}

/** 접어 둔 "이렇게 분석했어요" — 사주 계산 결과와 전통 해석 규칙을 나누고, 응답 · 다르게 나온 부분 · 아직 확인되지 않은 것을 적는다 */
function BasisDetails({ basis }: { basis: ReadingBasis }) {
  const groups: { label: string; items: string[]; note?: string }[] = [
    { label: "사주 계산 결과", items: basis.computed, note: "만세력 엔진이 계산한 값입니다." },
    { label: "전통 해석 규칙", items: basis.tradition, note: "계산 결과를 읽는 규칙이며 검증된 사실이 아닙니다." },
    { label: "응답 · 본인 입력", items: basis.answers },
    ...(basis.differences?.length ? [{ label: "서로 다르게 나온 부분", items: basis.differences }] : []),
    { label: "다른 가능성 · 아직 확인되지 않은 것", items: basis.unknown },
  ];
  return (
    <details className="group mt-6 border-y border-line">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
        <span>이렇게 분석했어요</span>
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-normal text-ink-3">
          <span className="group-open:hidden">펼치기</span>
          <span className="hidden group-open:inline">접기</span>
          <ChevronIcon className="size-5 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-5 pb-5">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="text-[13px] font-semibold text-ink-2">
              {g.label}
              {g.note && <span className="ml-2 font-normal text-ink-3">{g.note}</span>}
            </p>
            <ul className="mt-1.5 space-y-1.5 border-l-2 border-line pl-3 text-[14px] leading-relaxed text-ink-2">
              {g.items.map((t) => (
                <li key={t}>
                  <Lines text={t} gap="mt-0.5" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
