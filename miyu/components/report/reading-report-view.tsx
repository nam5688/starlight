import { ArrowIcon } from "@/components/ui/icons";
import type { IntegratedReadingReport, ReadingBlock, ReadingGroupId } from "@/lib/report/reading/types";
import type { SajuSection, ScoreRow } from "@/lib/report/types";
import { SajuChart } from "./detail-sections";
import { ReadingNav } from "./reading-nav";
import {
  BasisList,
  CaveatNote,
  ComfortPair,
  ExampleBox,
  Fold,
  FoldRow,
  LuckTimelineCard,
  Paragraphs,
  ReactionStepper,
  SummaryCards,
  TraitCards,
  TraitSentences,
  WatchNote,
} from "./reading-parts";
import { ScoreBar } from "./score-bar";

const STATUS_LABEL = { used: "사용", dev: "사용 · 개발용 문항", none: "없음" } as const;

/** 주제 이동 막대의 이름 — 묶음마다 본문 구역이 하나씩 있다 */
const GROUPS: { id: ReadingGroupId; section: string; label: string }[] = [
  { id: "me", section: "group-me", label: "나의 성향" },
  { id: "relation", section: "group-relation", label: "관계" },
  { id: "work", section: "group-work", label: "일 · 돈" },
];

// html에 이미 scroll-padding-top: 80px이 있어(globals.css) 막대 높이(머리글 + 이동 막대)에서 그만큼을 뺀 값이다
const SCROLL_MARGIN = "scroll-mt-[44px] md:scroll-mt-[52px]";

/**
 * 개인 통합 리포트(읽기 구조) — 첫 화면은 핵심 해석 한 문장 + 요약 카드 3개, 나머지는 주제별로 결론 → 요약 2문장 → 예시 1개이고
 * 자세한 풀이와 분석 근거는 눌러서 본다. 내부 근거 ID는 화면에 보이지 않는다. idPrefix: 화면마다 HTML id가 겹치지 않게 붙인다.
 * 바탕은 페이지 색(bg-page)이고, 카드는 흰 면 하나만 쓴다(카드 안에 카드를 넣지 않는다).
 */
export function ReadingReportView({
  report,
  saju,
  scores = [],
  idPrefix = "",
  footer,
}: {
  report: IntegratedReadingReport;
  saju: SajuSection;
  /** 응답 환산값 막대 — 실제 채점이 있을 때만 넘긴다 */
  scores?: { title: string; rows: ScoreRow[] }[];
  idPrefix?: string;
  footer?: React.ReactNode;
}) {
  const id = (name: string) => `${idPrefix}${name}`;
  const used = report.inputs.filter((i) => i.status !== "none").map((i) => i.name.replace(/\(.*\)/, ""));
  const none = report.inputs.filter((i) => i.status === "none").map((i) => i.name);
  const nav = [
    { id: id("summary"), label: "전체 요약" },
    ...GROUPS.filter((g) => report.blocks.some((b) => b.group === g.id)).map((g) => ({ id: id(g.section), label: g.label })),
    { id: id(report.flow.id), label: "미래 흐름" },
  ];

  return (
    <div className="bg-page pb-16">
      <ReadingNav items={nav} />

      <div className="mx-auto w-full max-w-[720px] px-5">
        <section id={id("summary")} aria-labelledby={id("headline")} className={`pt-6 md:pt-8 ${SCROLL_MARGIN}`}>
          <h2 id={id("headline")} className="text-[13px] font-semibold text-accent">
            핵심 해석
          </h2>
          <p className="mt-1.5 text-[22px] leading-[1.4] font-bold tracking-tight md:text-[28px]">{report.headline}</p>
          <SummaryCards cards={report.summary} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={`#${id("tendency")}`} className="inline-flex h-11 items-center justify-center rounded-lg bg-accent px-3 text-[15px] font-semibold text-white transition-colors hover:bg-accent-strong">
              내 성향 자세히
            </a>
            <a href={`#${id("love")}`} className="inline-flex h-11 items-center justify-center rounded-lg border border-line-strong bg-canvas px-3 text-[15px] font-semibold transition-colors hover:bg-mist">
              관계에서의 모습
            </a>
          </div>

          <details className="group mt-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 py-1.5 [&::-webkit-details-marker]:hidden">
              <span className="text-[14px] leading-[1.6] text-ink-2">
                <span className="font-semibold text-ink">참고한 자료</span> {used.join(" · ")}
                <span className="mx-1.5 text-ink-3">/</span>
                <span className="font-semibold text-ink">없음</span> {none.join(" · ")}
              </span>
              <span className="flex shrink-0 items-center gap-0.5 pt-0.5 text-[13px] font-semibold text-accent">
                <span className="group-open:hidden">자세히</span>
                <span className="hidden group-open:inline">접기</span>
              </span>
            </summary>
            <ul className="divide-y divide-line rounded-lg border border-line bg-canvas text-[14px]">
              {report.inputs.map((i) => (
                <li key={i.name} className="grid gap-0.5 px-4 py-3 md:grid-cols-[170px_minmax(0,1fr)] md:gap-4">
                  <p className="font-semibold">
                    {i.name}
                    <span className={`ml-2 text-[13px] font-medium ${i.status === "none" ? "text-ink-3" : "text-accent"}`}>{STATUS_LABEL[i.status]}</span>
                  </p>
                  <p className="leading-[1.6] text-ink-2">
                    {i.note}
                    {i.usedIn.length > 0 && <span className="mt-1 block text-[13px] text-ink-3">쓰인 곳 · {i.usedIn.join(" · ")}</span>}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        </section>

        {GROUPS.map((g) => {
          const blocks = report.blocks.filter((b) => b.group === g.id);
          if (blocks.length === 0) return null;
          return (
            <section key={g.id} id={id(g.section)} aria-labelledby={id(`${g.section}-h`)} className={`mt-12 ${SCROLL_MARGIN}`}>
              <h2 id={id(`${g.section}-h`)} className="flex items-baseline justify-between gap-3 border-t-2 border-accent pt-3 text-[18px] font-bold">
                {g.label}
              </h2>
              <div className="mt-6 space-y-10 [&>article+article]:border-t [&>article+article]:border-line [&>article+article]:pt-10">
                {blocks.map((b) => (
                  <BlockView key={b.id} block={b} id={id(b.id)} showTopic={blocks.length > 1} />
                ))}
              </div>
            </section>
          );
        })}

        <section id={id(report.flow.id)} aria-labelledby={id(`${report.flow.id}-h`)} className={`mt-12 ${SCROLL_MARGIN}`}>
          <h2 id={id(`${report.flow.id}-h`)} className="border-t-2 border-accent pt-3 text-[18px] font-bold">
            미래 흐름
          </h2>
          <article className="mt-6">
            <h3 className="text-[20px] leading-snug font-bold tracking-tight md:text-[22px]">{report.flow.headline}</h3>
            <p className="mt-2 text-[16px] leading-[1.7]">{report.flow.summary}</p>
            <CaveatNote text={report.flow.caveat} />

            <LuckTimelineCard timeline={report.timeline} text={report.flow.cardText} reference={report.timelineReference} />

            <div className="mt-4 rounded-xl border border-line bg-canvas p-4 md:p-5">
              <p className="text-[17px] font-bold tracking-tight">가까운 세 해</p>
              <ul className="mt-2 divide-y divide-line">
                {report.flow.years.map((y) => (
                  <li key={y.year} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-baseline gap-x-3 py-2.5">
                    <span className="text-[16px] font-bold text-accent tabular-nums">{y.year}</span>
                    <span className="text-[15px] leading-snug">{y.theme}</span>
                  </li>
                ))}
              </ul>
            </div>

            <FoldRow>
              <Fold label="자세한 풀이" wide>
                <div className="space-y-5">
                  <div>
                    <p className="text-[15px] font-semibold">시기별로 읽으면</p>
                    <ul className="mt-2 divide-y divide-line">
                      {report.flow.periods.map((p) => (
                        <li key={p.period} className="py-3">
                          <p className="text-[14px] font-semibold text-ink-2">{p.period}</p>
                          <p className="mt-1 text-[15px] leading-[1.7]">{p.theme}</p>
                          <p className="mt-1 text-[15px] leading-[1.7] text-ink-2">{p.watch}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold">응답으로 본 가능성</p>
                    <p className="mt-0.5 text-[13px] text-ink-3">{report.flow.scenarioNote}</p>
                    <ul className="mt-2 divide-y divide-line">
                      {report.flow.scenarios.map((s) => (
                        <li key={s.when} className="py-3">
                          <p className="text-[15px] leading-snug font-semibold">{s.when}</p>
                          <p className="mt-1 flex gap-2 text-[15px] leading-[1.7]">
                            <ArrowIcon className="mt-[7px] size-3.5 shrink-0 text-ink-3" />
                            <span>{s.then}</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold">연구 통계</p>
                    <p className="mt-1 text-[14px] leading-[1.7] text-ink-2">{report.flow.statistics}</p>
                  </div>
                </div>
              </Fold>
              <Fold label="시기 계산과 해석 근거" wide>
                <BasisList basis={report.flow.basis} />
              </Fold>
            </FoldRow>
          </article>
        </section>

        <section aria-labelledby={id("actions")} className="mt-12">
          <h2 id={id("actions")} className="border-t-2 border-accent pt-3 text-[18px] font-bold">
            지금 확인해 볼 것
          </h2>
          <p className="mt-1 text-[14px] leading-[1.6] text-ink-3">정답을 정하는 목록이 아니라, 위의 해석이 나에게 맞는지 확인해 볼 수 있는 작은 행동입니다.</p>
          <ul className="mt-4 space-y-2">
            {report.actions.map((a) => (
              <li key={a.title}>
                <label className="flex cursor-pointer gap-3 rounded-xl border border-line bg-canvas p-4">
                  <input type="checkbox" className="mt-0.5 size-5 shrink-0 cursor-pointer accent-accent" />
                  <span className="min-w-0">
                    <span className="block text-[16px] leading-snug font-semibold">{a.title}</span>
                    <span className="mt-1 block text-[15px] leading-[1.65] text-ink-2">{a.detail}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby={id("data")} className="mt-12">
          <h2 id={id("data")} className="border-t-2 border-accent pt-3 text-[18px] font-bold">
            내 분석 데이터
          </h2>
          <FoldRow>
            <Fold label="내 분석 데이터 보기" wide>
              <div className="space-y-6">
                <div>
                  <p className="text-[15px] font-semibold">사주 원국과 오행</p>
                  <p className="mt-0.5 mb-3 text-[13px] text-ink-3">만세력 엔진이 계산한 결과입니다. 오행 막대는 원국 글자 수 기준 개수이며, 많고 적음이 좋고 나쁨은 아닙니다.</p>
                  <SajuChart saju={saju} />
                </div>
                {scores.length > 0 && (
                  <div>
                    <p className="text-[15px] font-semibold">응답 환산값</p>
                    <p className="mt-0.5 text-[13px] text-ink-3">개발용 예시 문항에 답한 값을 0~100으로 옮긴 것입니다. 백분위나 정확도가 아니며, 높고 낮음은 좋고 나쁨이 아닙니다.</p>
                    {scores.map((s) => (
                      <div key={s.title} className="mt-3">
                        <p className="text-[13px] font-semibold text-ink-2">{s.title}</p>
                        <div className="divide-y divide-line">
                          {s.rows.map((r) => (
                            <ScoreBar key={r.id} row={r} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Fold>
          </FoldRow>
        </section>

        <div className="mt-12 space-y-6 border-t border-line pt-8">
          <section aria-label="준비 중인 기능">
            <p className="text-[14px] font-semibold text-ink-2">이어서 살펴볼 수 있는 것</p>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-canvas text-[15px]">
              {[
                ["상대와의 관계 비교", "상대가 직접 참여해 두 사람의 응답을 함께 비교합니다."],
                ["AI 고민 상담", "내 분석을 참고해 연애 · 관계 · 돈 · 일 고민을 이어서 상담합니다."],
              ].map(([name, desc]) => (
                <li key={name} className="grid gap-0.5 px-4 py-3 md:grid-cols-[170px_minmax(0,1fr)_auto] md:items-baseline md:gap-4">
                  <p className="font-semibold">{name}</p>
                  <p className="leading-[1.6] text-ink-2">{desc}</p>
                  <p className="text-[13px] font-medium text-ink-3">준비 중</p>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-[13px] leading-[1.7] text-ink-3">
            미유는 사주의 전통적 해석과 자기보고식 응답을 활용한 자기이해 서비스입니다. 사주 해석과 미래 전망은 과학적으로 검증된 개인 예측이 아니며, 제시된 가능성은 실제 사건과 결과를 보장하지 않습니다.
          </p>
          {footer}
        </div>
      </div>
    </div>
  );
}

/** 주제 하나 — 이름표 → 결론(제목) → 요약 2문장 → (그림) → 예시 1개 → 조건 한 줄 → 접힘 두 개 */
function BlockView({ block: b, id, showTopic }: { block: ReadingBlock; id: string; showTopic: boolean }) {
  const hasFoldA = b.details.length > 0 || b.traits || b.reactionFlow || b.detailExample || b.watch;
  return (
    <article id={id} aria-labelledby={`${id}-h`} className={SCROLL_MARGIN}>
      {showTopic && <p className="mb-0.5 text-[13px] font-semibold text-ink-3">{b.topic}</p>}
      <h3 id={`${id}-h`} className="text-[20px] leading-snug font-bold tracking-tight md:text-[22px]">
        {b.headline}
      </h3>
      <p className="mt-2 text-[16px] leading-[1.7]">{b.summary}</p>

      {b.traits && <TraitCards traits={b.traits} />}
      {b.reactionFlow && <ReactionStepper flow={b.reactionFlow} />}
      {b.comfort && <ComfortPair comfort={b.comfort} />}
      {b.example && !b.traits && <ExampleBox text={b.example} />}
      {b.caveat && <CaveatNote text={b.caveat} />}

      <FoldRow>
        {hasFoldA && (
          <Fold label={b.traits ? "일상 예시 보기" : "자세한 풀이"}>
            {b.traits && (
              <>
                <TraitSentences traits={b.traits} />
                {b.example && <ExampleBox text={b.example} variant="line" />}
              </>
            )}
            {b.details.length > 0 && <Paragraphs items={b.details} />}
            {b.reactionFlow && (
              <div className={b.details.length > 0 ? "mt-4 border-l-[3px] border-line-strong pl-3" : "border-l-[3px] border-line-strong pl-3"}>
                <p className="text-[13px] font-semibold text-ink-3">이럴 때 도움이 되는 것</p>
                <p className="mt-1 text-[15px] leading-[1.7] text-ink-2">{b.reactionFlow.helpful}</p>
              </div>
            )}
            {b.detailExample && <ExampleBox text={b.detailExample} variant="line" />}
            {b.watch && <WatchNote text={b.watch} />}
          </Fold>
        )}
        <Fold label="분석 근거 보기">
          <BasisList basis={b.basis} />
        </Fold>
      </FoldRow>
    </article>
  );
}
