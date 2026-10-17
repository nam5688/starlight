import { ArrowIcon, ChevronIcon } from "@/components/ui/icons";
import { tendencyPhrase } from "@/lib/assessment/dev-rules";
import { REPORT_BASIS } from "@/lib/config/product";
import { basisFor } from "@/lib/report/reading/assemble";
import type { IntegratedReadingReport, ReadingBlock, ReadingGroupId } from "@/lib/report/reading/types";
import type { SajuSection, ScoreRow } from "@/lib/report/types";
import { SajuChart } from "./detail-sections";
import { MonthCalendarView } from "./month-calendar";
import { SECTION_CALENDAR_NOTE } from "@/lib/report/reading/plan";
import { STORY7_SECTIONS } from "@/lib/report/reading/story7-plan";
import { ItemsSection, PartnerSection, PlainReadingSection, QuestionsSection, SituationsSection } from "./extras-sections";
import { ActionList } from "./integrated-view";
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
  Prose,
  ReactionStepper,
  SectionList,
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
  scores,
  tendencyName,
  idPrefix = "",
  footer,
}: {
  report: IntegratedReadingReport;
  /** 원국 표 — 실제 리포트는 저장된 report.saju를 쓴다 (예시 화면만 따로 넘긴다) */
  saju?: SajuSection;
  /** 응답 환산값 막대 — 실제 리포트는 저장된 report.base에서 만든다 (예시 화면만 따로 넘긴다) */
  scores?: { title: string; rows: ScoreRow[] }[];
  /** 대표 경향 이름(~형, 후보 이름) — 실제 리포트는 저장된 report.base에서 읽는다 (예시 화면만 따로 넘긴다) */
  tendencyName?: string;
  idPrefix?: string;
  footer?: React.ReactNode;
}) {
  const id = (name: string) => `${idPrefix}${name}`;
  const chart = saju ?? report.saju;
  const scoreGroups = scores ?? (report.base ? [{ title: "기질 · 성격", rows: report.base.temperament }, { title: "가까운 관계 반응(애착 경향)", rows: report.base.relationship }] : []);
  const tendencyTitle = tendencyName ?? report.base?.tendency.name ?? null;
  const tendency = tendencyPhrase(tendencyTitle);
  // 큰 주제에 붙이는 번호 — 주제 5개 다음이 "앞으로의 시기"
  const numberOf = new Map(report.blocks.map((b, i) => [b.id, i + 1]));
  const rangeOf = (g: ReadingGroupId) => {
    const ns = report.blocks.filter((b) => b.group === g).map((b) => numberOf.get(b.id)!);
    return ns.length === 0 ? "" : ns.length === 1 ? `${ns[0]}` : `${ns[0]}~${ns[ns.length - 1]}`;
  };
  const extras = report.extras;
  const focus = report.focus ?? [];
  const hasExtras = Boolean(extras && (extras.plain || extras.questions.length || extras.situations.length || extras.partner || extras.items));
  const story = report.layout === "story";
  // 7개 대주제(story-7) — 1~5번은 blocks, 6번은 flow, 7번은 advice + actions. 번호 순서대로 한 줄로 이어 읽고 이동 막대도 7개 이름이다
  const story7 = report.layout === "story7";
  const used = report.inputs.filter((i) => i.status !== "none").map((i) => i.name.replace(/\(.*\)/, ""));
  const none = report.inputs.filter((i) => i.status === "none").map((i) => i.name);
  const nav = story7
    ? [
        { id: id("summary"), label: "전체 요약" },
        ...STORY7_SECTIONS.map((p) => ({ id: id(p.blockId), label: p.navLabel })),
        ...(hasExtras ? [{ id: id("extras"), label: "더 알아보기" }] : []),
      ]
    : [
        { id: id("summary"), label: "전체 요약" },
        ...(focus.length ? [{ id: id("focus"), label: "내 고민" }] : []),
        ...GROUPS.filter((g) => report.blocks.some((b) => b.group === g.id)).map((g) => ({ id: id(g.section), label: g.label })),
        { id: id(report.flow.id), label: "앞으로의 시기" },
        ...(hasExtras ? [{ id: id("extras"), label: "더 알아보기" }] : []),
      ];

  return (
    <div className="bg-page pb-16">
      <ReadingNav items={nav} />

      <div className="mx-auto w-full max-w-[720px] px-5">
        <section id={id("summary")} aria-labelledby={id("headline")} className={`pt-6 md:pt-8 ${SCROLL_MARGIN}`}>
          <h2 id={id("headline")} className="text-[13px] font-semibold text-accent">
            핵심 해석
          </h2>
          {tendency && tendencyTitle && (
            <div className="mt-2.5">
              <p className="text-[13px] text-ink-3">나의 대표 경향</p>
              {/* 무료 리포트(FreePreviewBody)와 같이 후보 이름(~형)을 크게 보인다 — 심층에서 빠지면 무료에만 있는 이름이 된다 */}
              <p className="mt-1 text-[26px] leading-tight font-bold tracking-tight text-accent-strong md:text-[32px]">{tendencyTitle}</p>
              <p className="mt-2 inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-[14px] font-semibold text-accent-strong">{tendency}</p>
            </div>
          )}
          <p className="mt-2 text-[22px] leading-[1.4] font-bold tracking-tight md:text-[28px]">{report.headline}</p>
          {tendency && <p className="mt-1.5 text-[13px] leading-[1.6] text-ink-3">대표 경향은 응답을 보고 붙인 후보 설명이며, 진단이나 평생 가는 유형이 아닙니다.</p>}
          <SummaryCards cards={report.summary} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={`#${id("tendency")}`} className="inline-flex h-11 items-center justify-center rounded-lg bg-accent px-3 text-[15px] font-semibold text-white transition-colors hover:bg-accent-strong">
              내 성향 자세히
            </a>
            <a href={`#${id("love")}`} className="inline-flex h-11 items-center justify-center rounded-lg border border-line-strong bg-canvas px-3 text-[15px] font-semibold transition-colors hover:bg-mist">
              관계에서의 모습
            </a>
          </div>

          {REPORT_BASIS.visible && (
            <details className="group mt-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-end [&::-webkit-details-marker]:hidden">
                <span className="inline-flex h-9 items-center gap-1 rounded-full border border-line-strong bg-canvas pr-2.5 pl-3.5 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-mist">
                  참고한 자료 {used.length}개
                  <ChevronIcon className="size-4 transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <p className="mb-2 text-[13px] leading-[1.6] text-ink-3">
                <span className="font-semibold text-ink-2">쓰지 않은 것</span> {none.join(" · ") || "없음"} — 자료가 없는 부분은 만들어 채우지 않았습니다.
              </p>
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
          )}
        </section>

        {focus.length > 0 && (
          <section id={id("focus")} aria-labelledby={id("focus-h")} className={`mt-12 ${SCROLL_MARGIN}`}>
            <h2 id={id("focus-h")} className="border-t-2 border-accent pt-3 text-[18px] font-bold">
              알려 주신 고민까지 반영한 해석
            </h2>
            <p className="mt-1 text-[14px] leading-[1.6] text-ink-3">
              {report.generated?.context
                ? `최근 알려 주신 내용(${report.generated.context.topicLabel}${report.generated.context.fields.length ? ` · ${report.generated.context.fields.join(", ")}` : ""})을 반영해 해석의 초점과 예시를 골랐어요. `
                : "알려 주신 고민을 반영해 해석의 초점과 예시를 골랐어요. "}
              사주 계산은 그대로이고, 알려 주신 이야기를 사주로 알아낸 것은 아니에요.
            </p>
            <div className="mt-4">
              <Paragraphs items={focus.map((f) => f.text)} />
            </div>
            {REPORT_BASIS.visible && report.generated && (
              <FoldRow>
                <Fold label="분석 근거 보기">
                  <BasisList basis={basisFor(focus.flatMap((f) => f.evidence), report.generated.evidence)} />
                </Fold>
              </FoldRow>
            )}
          </section>
        )}

        {story7 && (
          <>
            {report.blocks.map((b, i) => (
              <SectionShell key={b.id} id={id(b.id)} title={b.topic} n={i + 1}>
                <Story7Body block={b} id={id(`${b.id}-body`)} hasCalendar={Boolean(report.calendars?.items.length)} />
              </SectionShell>
            ))}
            <SectionShell id={id(report.flow.id)} title={report.flow.topic} n={report.blocks.length + 1}>
              <FlowArticle report={report} id={id} story hideLabel />
            </SectionShell>
            {report.advice && (
              <SectionShell id={id(report.advice.id)} title={report.advice.topic} n={report.blocks.length + 2}>
                <Story7Body block={report.advice} id={id(`${report.advice.id}-body`)} hasCalendar={false}>
                  <ActionChecklist actions={report.actions} />
                </Story7Body>
              </SectionShell>
            )}
          </>
        )}

        {!story7 && GROUPS.map((g) => {
          const blocks = report.blocks.filter((b) => b.group === g.id);
          if (blocks.length === 0) return null;
          return (
            <section key={g.id} id={id(g.section)} aria-labelledby={id(`${g.section}-h`)} className={`mt-12 ${SCROLL_MARGIN}`}>
              <h2 id={id(`${g.section}-h`)} className="flex items-baseline justify-between gap-3 border-t-2 border-accent pt-3 text-[18px] font-bold">
                <span>{g.label}</span>
                <span className="text-[13px] font-semibold text-ink-3 tabular-nums">{rangeOf(g.id)}</span>
              </h2>
              <div className="mt-6 space-y-10 [&>article+article]:border-t [&>article+article]:border-line [&>article+article]:pt-10">
                {blocks.map((b) => (
                  <BlockView key={b.id} block={b} id={id(b.id)} number={numberOf.get(b.id)!} hasCalendar={Boolean(report.calendars?.items.length)} story={story} />
                ))}
              </div>
            </section>
          );
        })}

        {!story7 && (
          <section id={id(report.flow.id)} aria-labelledby={id(`${report.flow.id}-h`)} className={`mt-12 ${SCROLL_MARGIN}`}>
            <h2 id={id(`${report.flow.id}-h`)} className="flex items-baseline justify-between gap-3 border-t-2 border-accent pt-3 text-[18px] font-bold">
              <span>앞으로의 시기</span>
            </h2>
            <FlowArticle report={report} id={id} story={story} />
          </section>
        )}

        {hasExtras && extras && (
          <section id={id("extras")} aria-labelledby={id("extras-h")} className={`mt-12 ${SCROLL_MARGIN}`}>
            <h2 id={id("extras-h")} className="border-t-2 border-accent pt-3 text-[18px] font-bold">
              더 알아보기
            </h2>
            <p className="mt-1 text-[14px] leading-[1.6] text-ink-3">위 풀이에서 이어서 궁금할 때만 열어 보세요. 앞에서 한 이야기는 되풀이하지 않고, 사주 여덟 글자에 대한 질문 · 상황별 풀이 · 어울리는 관계 조건 · 보완 아이템만 따로 모았어요.</p>
            <FoldRow>
              <Fold label="더 알아보기 열기" hint="원국 질문과 답 · 상황별 풀이 · 어울리는 관계 조건 · 보완 아이템 · 바로 해볼 3가지" wide>
                <div className="space-y-12">
                  {extras.plain && <PlainReadingSection plain={extras.plain} id={id("x-plain")} />}
                  {extras.questions.length > 0 && <QuestionsSection questions={extras.questions} id={id("x-questions")} />}
                  {extras.situations.length > 0 && <SituationsSection situations={extras.situations} id={id("x-situations")} />}
                  {extras.partner && <PartnerSection partner={extras.partner} id={id("x-partner")} />}
                  {extras.items && <ItemsSection items={extras.items} id={id("x-items")} />}
                  {extras.starterActions.length > 0 && (
                    <section aria-labelledby={id("x-starter")}>
                      <h3 id={id("x-starter")} className="text-[16px] font-bold">
                        바로 해볼 3가지
                      </h3>
                      <div className="mt-3">
                        <ActionList actions={extras.starterActions} />
                      </div>
                    </section>
                  )}
                </div>
              </Fold>
            </FoldRow>
          </section>
        )}

        {!story7 && (
          <section aria-labelledby={id("actions")} className="mt-12">
            <h2 id={id("actions")} className="border-t-2 border-accent pt-3 text-[18px] font-bold">
              지금 확인해 볼 것
            </h2>
            <p className="mt-1 text-[14px] leading-[1.6] text-ink-3">정답을 정하는 목록이 아니라, 위의 해석이 나에게 맞는지 확인해 볼 수 있는 작은 행동이에요.</p>
            <ActionChecklist actions={report.actions} />
          </section>
        )}

        <section aria-labelledby={id("data")} className="mt-12">
          <h2 id={id("data")} className={`border-t-2 border-accent pt-3 text-[18px] font-bold ${SCROLL_MARGIN}`}>
            내 분석 데이터
          </h2>
          <FoldRow>
            <Fold label="내 분석 데이터 보기" wide>
              <div className="space-y-6">
                {chart && (
                  <div>
                    <p className="text-[15px] font-semibold">사주 원국과 오행</p>
                    <p className="mt-0.5 mb-3 text-[13px] text-ink-3">만세력 엔진이 계산한 결과예요. 오행 막대는 원국 글자 수 기준 개수이며, 많고 적음이 좋고 나쁨은 아니에요.</p>
                    <SajuChart saju={chart} />
                  </div>
                )}
                {scoreGroups.length > 0 && (
                  <div>
                    <p className="text-[15px] font-semibold">응답 환산값</p>
                    <p className="mt-0.5 text-[13px] text-ink-3">개발용 예시 문항에 답한 값을 0~100으로 옮긴 것이에요. 백분위나 정확도가 아니며, 높고 낮음은 좋고 나쁨이 아니에요.</p>
                    {scoreGroups.map((s) => (
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
                ["상대와의 관계 비교", "상대가 직접 참여해 두 사람의 응답을 함께 비교해요."],
                ["AI 고민 상담", "내 분석을 참고해 연애 · 관계 · 돈 · 일 고민을 이어서 상담해요."],
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
            미유는 사주의 전통적 해석과 자기보고식 응답을 활용한 자기이해 서비스예요. 사주 해석과 미래 전망은 과학적으로 검증된 개인 예측이 아니며, 제시된 가능성은 실제 사건과 결과를 보장하지 않아요.
          </p>
          {footer}
        </div>
      </div>
    </div>
  );
}

/** 주제 하나 — 이름표 → 결론(제목) → 요약 2문장 → (그림) → 예시 1개 → 조건 한 줄 → 접힘 두 개 */
function BlockView({ block: b, id, number, hasCalendar, story = false }: { block: ReadingBlock; id: string; number: number; hasCalendar: boolean; story?: boolean }) {
  // 영역별 이야기(story-v1) — 요약 · 예시 · 접힌 풀이 없이 영역 하나가 한 이야기로 이어진다. 첫 문단은 summary, 나머지는 details에 있다
  if (story) {
    const calendarNote = hasCalendar ? SECTION_CALENDAR_NOTE[b.id as keyof typeof SECTION_CALENDAR_NOTE] : undefined;
    return (
      <article id={id} aria-labelledby={`${id}-h`} className={SCROLL_MARGIN}>
        <p className="mb-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink-3">
          <NumberBadge n={number} />
          {b.topic}
        </p>
        <h3 id={`${id}-h`} className="text-[20px] leading-snug font-bold tracking-tight md:text-[22px]">
          {b.headline}
        </h3>
        <div className="mt-3">
          <Paragraphs items={[b.summary, ...b.details]} />
        </div>
        {b.caveat && <CaveatNote text={b.caveat} />}
        {calendarNote && <p className="mt-3 text-[13px] leading-[1.6] text-ink-3">{calendarNote}</p>}
        {REPORT_BASIS.visible && (
          <FoldRow>
            <Fold label="분석 근거 보기">
              <BasisList basis={b.basis} />
            </Fold>
          </FoldRow>
        )}
      </article>
    );
  }
  const hasFoldA = b.details.length > 0 || b.traits || b.reactionFlow || b.detailExample || b.watch;
  return (
    <article id={id} aria-labelledby={`${id}-h`} className={SCROLL_MARGIN}>
      <p className="mb-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink-3">
        <NumberBadge n={number} />
        {b.topic}
      </p>
      <h3 id={`${id}-h`} className="text-[20px] leading-snug font-bold tracking-tight md:text-[22px]">
        {b.headline}
      </h3>
      <Prose text={b.summary} className="mt-2 text-[16px] leading-[1.7]" />

      {b.traits && <TraitCards traits={b.traits} />}
      {b.reactionFlow && <ReactionStepper flow={b.reactionFlow} />}
      {b.comfort && <ComfortPair comfort={b.comfort} />}
      {b.example && !b.traits && <ExampleBox text={b.example} />}
      {b.caveat && <CaveatNote text={b.caveat} />}
      {b.sections && b.sections.length > 0 && <SectionList sections={b.sections} note={hasCalendar ? SECTION_CALENDAR_NOTE[b.id as keyof typeof SECTION_CALENDAR_NOTE] : undefined} />}

      <FoldRow>
        {hasFoldA && (
          <Fold label={b.traits ? "일상 예시 보기" : "자세한 풀이"}>
            {b.traits && <TraitSentences traits={b.traits} />}
            {b.details.length > 0 && <Paragraphs items={b.details} />}
            {b.reactionFlow && (
              <div className={`${b.details.length > 0 ? "mt-6 border-t border-line pt-5" : ""}`}>
                <div className="border-l-[3px] border-line-strong pl-3.5">
                  <p className="text-[13px] font-semibold text-ink-3">이럴 때 도움이 되는 것</p>
                  <Prose text={b.reactionFlow.helpful} className="mt-1.5 text-[15px] leading-[1.75] text-ink-2" />
                </div>
              </div>
            )}
            {b.detailExample && <ExampleBox text={b.detailExample} variant="line" />}
            {b.watch && <WatchNote text={b.watch} />}
          </Fold>
        )}
        {REPORT_BASIS.visible && (
          <Fold label="분석 근거 보기">
            <BasisList basis={b.basis} />
          </Fold>
        )}
      </FoldRow>
    </article>
  );
}

/** 큰 주제 번호 — 어디까지 읽었는지 알 수 있게 주제마다 붙인다 (색만이 아니라 숫자로 구분) */
function NumberBadge({ n }: { n: number }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent-soft text-[13px] font-bold text-accent-strong tabular-nums" aria-label={`주제 ${n}`}>
      {n}
    </span>
  );
}

/** 앞으로의 시기(6번) 본문 — 결론 → 이야기(또는 요약) → 조건 안내 → 타임라인 · 가까운 세 해 → 접힘(월별 달력 · 자세한 풀이 · 근거). 7개 대주제는 장 제목을 따로 달아 이름표를 숨긴다 */
function FlowArticle({ report, id, story, hideLabel = false }: { report: IntegratedReadingReport; id: (name: string) => string; story: boolean; hideLabel?: boolean }) {
  return (
    <article className={hideLabel ? "" : "mt-6"}>
      {!hideLabel && (
        <p className="mb-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink-3">
          <NumberBadge n={report.blocks.length + 1} />
          {report.flow.topic}
        </p>
      )}
      <h3 className="text-[20px] leading-snug font-bold tracking-tight md:text-[22px]">{report.flow.headline}</h3>
      {story ? (
        <div className="mt-3">
          <Paragraphs items={[report.flow.summary, ...(report.flow.paragraphs ?? [])]} />
        </div>
      ) : (
        <Prose text={report.flow.summary} className="mt-2 text-[16px] leading-[1.7]" />
      )}
      <CaveatNote text={report.flow.caveat} />

      <LuckTimelineCard timeline={report.timeline} reference={report.timelineReference} />

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
        {report.calendars && report.calendars.items.length > 0 && (
          <Fold label="월별 달력" hint="가까운 관계 · 재물이 눈에 띄기 쉬운 달" wide>
            <MonthCalendarView calendars={report.calendars.items} idPrefix={id("cal")} />
          </Fold>
        )}
        <Fold label="자세한 풀이" wide>
          <div className="divide-y divide-line [&>div]:py-6 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0">
            {report.flow.periods.length > 0 && (
            <div>
              <p className="text-[16px] font-bold">시기별로 읽으면</p>
              <ul className="mt-3 space-y-5">
                {report.flow.periods.map((p) => (
                  <li key={p.period} className="border-l-[3px] border-line-strong pl-3.5">
                    <p className="text-[13px] font-semibold text-ink-3">{p.period}</p>
                    <Prose text={p.theme} className="mt-1.5 text-[15px] leading-[1.75]" />
                    <Prose text={p.watch} className="mt-2 text-[15px] leading-[1.75] text-ink-2" />
                  </li>
                ))}
              </ul>
            </div>
            )}
            <div>
              <p className="text-[16px] font-bold">응답으로 본 가능성</p>
              <Prose text={report.flow.scenarioNote} className="mt-0.5 text-[13px] leading-[1.6] text-ink-3" />
              <ul className="mt-3 space-y-5">
                {report.flow.scenarios.map((s) => (
                  <li key={s.when} className="border-l-[3px] border-accent pl-3.5">
                    <p className="text-[13px] font-semibold text-accent">이런 모습이 이어지면</p>
                    <Prose text={s.when} className="mt-1 text-[15px] leading-[1.7] font-semibold" />
                    <p className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-ink-3">
                      <ArrowIcon className="size-3.5" />
                      이렇게 될 수 있어요
                    </p>
                    <Prose text={s.then} className="mt-1 text-[15px] leading-[1.75]" />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[16px] font-bold">연구 통계</p>
              <Prose text={report.flow.statistics} className="mt-2 text-[14px] leading-[1.75] text-ink-2" />
            </div>
          </div>
        </Fold>
        {REPORT_BASIS.visible && (
          <Fold label="시기 계산과 해석 근거" wide>
            <BasisList basis={report.flow.basis} />
          </Fold>
        )}
      </FoldRow>
    </article>
  );
}

/** 지금 확인해 볼 작은 행동 목록 — 정답을 정하는 목록이 아니라 위의 해석이 나에게 맞는지 확인해 보는 행동 */
function ActionChecklist({ actions }: { actions: { title: string; detail: string }[] }) {
  return (
    <ul className="mt-4 space-y-2">
      {actions.map((a) => (
        <li key={a.title}>
          <label className="flex cursor-pointer gap-3 rounded-xl border border-line bg-canvas p-4">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 cursor-pointer accent-accent" />
            <span className="min-w-0">
              <span className="block text-[16px] leading-snug font-semibold">{a.title}</span>
              <Prose as="span" text={a.detail} className="mt-1 block text-[15px] leading-[1.65] text-ink-2" />
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** 7개 대주제 하나의 틀 — 위쪽 포인트 선 · 번호와 장 이름. 7개가 순서대로 이어져 어디까지 읽었는지 알 수 있다 */
function SectionShell({ id, title, n, children }: { id: string; title: string; n: number; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`mt-12 ${SCROLL_MARGIN}`}>
      <h2 id={`${id}-h`} className="flex items-center justify-between gap-3 border-t-2 border-accent pt-3 text-[18px] font-bold">
        <span className="flex items-center gap-2">
          <NumberBadge n={n} />
          {title}
        </span>
        <span className="text-[13px] font-semibold text-ink-3 tabular-nums">{n} / 7</span>
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** 7개 대주제 1~5 · 7번 본문 — 결론(제목) → 문단들(5번은 소제목 일 · 재물로 나뉨) → 안내 → (7번은 행동 목록) */
function Story7Body({ block: b, id, hasCalendar, children }: { block: ReadingBlock; id: string; hasCalendar: boolean; children?: React.ReactNode }) {
  const calendarNote = hasCalendar ? SECTION_CALENDAR_NOTE[b.id as keyof typeof SECTION_CALENDAR_NOTE] : undefined;
  return (
    <article aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="text-[20px] leading-snug font-bold tracking-tight md:text-[22px]">
        {b.headline}
      </h3>
      {b.parts && b.parts.length > 0 ? (
        <div className="mt-3 space-y-6">
          {b.parts.map((p) => (
            <div key={p.title}>
              <p className="mb-1.5 text-[15px] font-bold text-accent-strong">{p.title}</p>
              <Paragraphs items={p.paragraphs} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <Paragraphs items={[b.summary, ...b.details]} />
        </div>
      )}
      {b.caveat && <CaveatNote text={b.caveat} />}
      {calendarNote && <p className="mt-3 text-[13px] leading-[1.6] text-ink-3">{calendarNote}</p>}
      {children}
      {REPORT_BASIS.visible && (
        <FoldRow>
          <Fold label="분석 근거 보기">
            <BasisList basis={b.basis} />
          </Fold>
        </FoldRow>
      )}
    </article>
  );
}
