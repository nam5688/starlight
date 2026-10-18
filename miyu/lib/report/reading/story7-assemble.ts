// AI가 쓴 7개 대주제 초안(Story7DraftV1) + 코드가 아는 값 → 저장하는 리포트(IntegratedReadingReport, layout "story7").
// 이전 읽기 구조 · 영역별 이야기와 같은 저장 모양을 쓴다 — 1~5번은 blocks(첫 문단은 summary, 나머지는 details, 5번은 소제목 구분을 parts에도 담는다), 6번은 flow, 7번은 advice + actions.
// 그래서 채팅 · 관리자 · 내보내기 · 월 달력이 세 형식을 모두 읽는다. 제목 위 이름표 · 묶음 · 접어 둔 "분석 근거" · 안내 · 큰 흐름 타임라인 · 월별 달력 · 지금 나의 시기 카드 · 참고한 자료 목록은 AI가 쓰지 않고 여기서 근거 목록과 계산 결과로 만든다.
import { filledFields, topicLabel, type PersonalContextInput } from "../../personalization/context.ts";
import { sajuSection } from "../../saju/display.ts";
import { HOUR_UNKNOWN_CAVEAT } from "../../saju/interpret/hour-unknown.ts";
import { MONTH_RULE_VERSION, monthCalendars } from "../../saju/interpret/months.ts";
import { periodLine, periodPlain } from "../../saju/interpret/period-plain.ts";
import { luckTimeline } from "../../saju/interpret/rules.ts";
import { describePolicy } from "../../saju/policy.ts";
import type { Evidence } from "../evidence.ts";
import { buildReportExtras } from "../extras.ts";
import type { ReportInput } from "../generator.ts";
import { basisFor, buildInputs } from "./assemble.ts";
import { CARD_LABEL, FLOW_CAVEAT, SCENARIO_NOTE, STATISTICS_NOTE } from "./plan.ts";
import { STORY7_CAVEAT, STORY7_FLOW_NOTE, STORY7_SECTIONS, story7SectionOf } from "./story7-plan.ts";
import { fillNameInJson } from "./name-fill.ts";
import { story7Paragraphs } from "./story7-validate.ts";
import type { IntegratedReadingReport, ReadingBlock, ReadingFlow, Story7DraftV1, Story7SectionDraft } from "./types.ts";

/** 글 안의 {name}을 이름으로 바꾼다 (이름에 따옴표 · 역슬래시가 있어도 JSON이 깨지지 않게 이스케이프). 이름이 비어 있으면 "{name} 님" 호칭을 지운다 — name-fill.ts */
export function fillStory7Name(draft: Story7DraftV1, name: string): Story7DraftV1 {
  return JSON.parse(fillNameInJson(JSON.stringify(draft), name)) as Story7DraftV1;
}

export type AssembleStory7Options = {
  draft: Story7DraftV1;
  evidence: Evidence[];
  input: Pick<ReportInput, "nickname" | "knownMbti" | "summary" | "saju" | "context">;
  reference: { year: number; month: number; iso: string };
  promptVersion: string;
  ruleVersions: string[];
};

/** 형식 검사를 통과한 7개 대주제 초안으로 저장할 리포트를 만든다 */
export function assembleStory7(o: AssembleStory7Options): IntegratedReadingReport {
  const { evidence, input, reference } = o;
  const draft = fillStory7Name(o.draft, input.nickname);
  const name = input.nickname;
  const saju = input.saju;
  const context = input.context as (PersonalContextInput & { updatedAt?: string }) | null;
  const sectionOf = (no: number): Story7SectionDraft => draft.sections.find((s) => Number(s.no) === no)!;
  const ownerEvidence = STORY7_SECTIONS.filter((p) => p.kind === "owner").flatMap((p) => sectionOf(p.no).evidence);

  const blockOf = (no: number, group: ReadingBlock["group"]): ReadingBlock => {
    const plan = story7SectionOf(no)!;
    const s = sectionOf(no);
    const paragraphs = story7Paragraphs(s);
    // 출생 시각을 모르면 1번 장 아래에 코드가 세 기둥 기준이라는 안내를 붙인다(AI가 쓰지 않는다)
    const hourNote = plan.no === 1 && saju.status === "ok" && saju.hourPillarOmitted ? HOUR_UNKNOWN_CAVEAT : null;
    const caveat = [STORY7_CAVEAT[plan.blockId]?.(name), hourNote].filter(Boolean).join(" ") || undefined;
    const cited = s.evidence.length > 0 ? s.evidence : ownerEvidence;
    // 만 16세 미만은 3번 장이 연애 대신 또래 관계 풀이라 장 이름도 맞춘다(목차 번호 · 위치는 그대로, 운영자 확인 항목)
    const topic = plan.no === 3 && evidence.some((e) => e.id === "saju.frame.audience.child") ? "또래 관계와 애착" : plan.title;
    return {
      id: plan.blockId,
      group,
      topic,
      headline: s.headline,
      summary: paragraphs[0],
      details: paragraphs.slice(1),
      ...(s.parts ? { parts: s.parts.map((p) => ({ title: p.title, paragraphs: p.paragraphs })) } : {}),
      ...(caveat ? { caveat } : {}),
      basis: basisFor(cited, evidence),
      evidence: s.evidence,
    };
  };
  const blocks: ReadingBlock[] = [blockOf(1, "me"), blockOf(2, "me"), blockOf(3, "relation"), blockOf(4, "relation"), blockOf(5, "work")];
  const advice = blockOf(7, "me");

  const timeline = saju.status === "ok" ? luckTimeline(saju, reference) : [];
  const current = timeline.find((s) => s.role === "current");
  const timing = sectionOf(6);
  const timingParagraphs = story7Paragraphs(timing);
  const timingPlan = story7SectionOf(6)!;
  const flow: ReadingFlow = {
    id: "flow",
    topic: timingPlan.title,
    headline: timing.headline,
    summary: timingParagraphs[0],
    paragraphs: timingParagraphs.slice(1),
    caveat: timing.evidence.includes("saju.fortify") ? `${FLOW_CAVEAT} ${STORY7_FLOW_NOTE}` : FLOW_CAVEAT,
    // 계산된 현재 시기가 있으면 시기 카드의 글도 쉬운 말 설명(period-plain.ts)에서 코드가 채운다 — AI가 다시 쓴 글로 덮어쓰지 않는다
    cardText: current ? `${periodPlain(current.stemGroup, current.branchGroup).meaning} ${periodPlain(current.stemGroup, current.branchGroup).example}` : timingParagraphs[0],
    // 화면은 숫자 네 자리만 보인다("2026년"으로 와도 맞춘다)
    years: (timing.years ?? []).map((y) => ({ ...y, year: y.year.replace(/\s*년$/, "") })),
    periods: [],
    scenarios: timing.scenarios ?? [],
    scenarioNote: SCENARIO_NOTE,
    statistics: STATISTICS_NOTE,
    basis: basisFor(timing.evidence, evidence, { uncertain: true }),
    evidence: timing.evidence,
  };

  const topicsForInputs = [...blocks.map((b) => ({ topic: b.topic, evidence: b.evidence })), { topic: timingPlan.title, evidence: timing.evidence }, { topic: advice.topic, evidence: advice.evidence }];

  return {
    kind: "integrated-reading",
    layout: "story7",
    source: input.summary.source,
    personName: name,
    headline: draft.headline,
    summary: [
      { kind: "strength", label: CARD_LABEL.strength, keyword: draft.cards.strength.keyword, note: draft.cards.strength.note },
      { kind: "caution", label: CARD_LABEL.caution, keyword: draft.cards.caution.keyword, note: draft.cards.caution.note },
      {
        kind: "flow",
        label: CARD_LABEL.flow,
        // 지금 나의 시기 카드는 AI가 쓰지 않는다 — 계산된 대운이 있으면 쉬운 말 설명을 코드가 채우고, 없으면 고정 문구
        ...(current
          ? { keyword: periodPlain(current.stemGroup, current.branchGroup).title, note: periodPlain(current.stemGroup, current.branchGroup).meaning, foot: periodLine(current.from, current.to) }
          : { keyword: "가까운 해의 분위기", note: "10년 시기의 기간은 계산하지 못했어요. 가까운 해의 분위기만 읽었어요." }),
      },
    ],
    inputs: buildInputs({ knownMbti: input.knownMbti, hasContext: Boolean(context), hasSaju: saju.status === "ok", topics: topicsForInputs, allEvidence: evidence, nickname: name }),
    blocks,
    flow,
    advice,
    timeline,
    timelineReference: { year: reference.year, month: reference.month },
    ...(saju.status === "ok" ? { calendars: { ruleVersion: MONTH_RULE_VERSION, items: monthCalendars(saju, reference) } } : {}),
    actions: draft.actions.map((a) => ({ title: a.title, detail: a.detail })),
    saju: sajuSection(saju),
    base: input.summary,
    extras: buildReportExtras({ summary: input.summary, saju, reference }),
    generated: {
      promptVersion: o.promptVersion,
      ruleVersions: o.ruleVersions,
      referenceDate: reference.iso,
      lines: saju.status === "ok" ? [`만세력 엔진 ${saju.engine.name} ${saju.engine.version}`, ...describePolicy(saju.options)] : [],
      evidence,
      ...(context ? { context: { topic: context.topic, topicLabel: topicLabel(context.topic), fields: filledFields(context), updatedAt: context.updatedAt ?? null } } : {}),
    },
  };
}

/** 내용 검사(depth.ts)가 읽는 모양 — 장마다 한 덩어리, 시기는 문단 모두 한 덩어리. 반복 검사(repeat.ts)는 글 조각 위치(where)를 그대로 쓴다 */
export function story7DepthSource(d: Story7DraftV1) {
  const body = (no: number) => story7Paragraphs(d.sections.find((s) => Number(s.no) === no) ?? { paragraphs: [] });
  return {
    headline: d.headline,
    blocks: [1, 2, 3, 4, 5, 7].map((no) => ({ id: String(no), summary: body(no)[0] ?? "", details: body(no).slice(1) })),
    flow: { summary: body(6)[0] ?? "", cardText: body(6).slice(1).join(" "), scenarios: d.sections.find((s) => Number(s.no) === 6)?.scenarios ?? [] },
    actions: d.actions.map((a) => ({ title: a.title, detail: a.detail })),
  };
}
