// AI가 쓴 영역별 이야기 초안(StoryDraftV1) + 코드가 아는 값 → 저장하는 리포트(IntegratedReadingReport, layout "story").
// 이전 읽기 구조와 같은 저장 모양을 쓴다 — 영역의 첫 문단은 summary에, 나머지는 details에 담고, 요약 · 예시 · 특징 카드 · 소단락 · 살펴볼 점은 없다. 그래서 채팅 · 관리자 · 내보내기 · 월 달력이 둘 다 읽는다.
// 제목 위 이름표 · 묶음 · 접어 둔 "분석 근거" · 안전 안내 · 큰 흐름 타임라인 · 월별 달력 · 참고한 자료 목록은 AI가 쓰지 않고 여기서 근거 목록과 계산 결과로 만든다(assemble.ts와 같은 고정 문구).
import { filledFields, topicLabel, type PersonalContextInput } from "../../personalization/context.ts";
import { sajuSection } from "../../saju/display.ts";
import { MONTH_RULE_VERSION, monthCalendars } from "../../saju/interpret/months.ts";
import { periodLine, periodPlain } from "../../saju/interpret/period-plain.ts";
import { luckTimeline } from "../../saju/interpret/rules.ts";
import { describePolicy } from "../../saju/policy.ts";
import type { Evidence } from "../evidence.ts";
import { buildReportExtras } from "../extras.ts";
import type { ReportInput } from "../generator.ts";
import { basisFor, buildInputs } from "./assemble.ts";
import { BLOCK_CAVEAT, CARD_LABEL, FLOW_CAVEAT, SCENARIO_NOTE, STATISTICS_NOTE } from "./plan.ts";
import { STORY_AREAS, STORY_FLOW_TOPIC } from "./story-plan.ts";
import type { IntegratedReadingReport, ReadingBlock, ReadingFlow, StoryDraftV1 } from "./types.ts";

/** 글 안의 {name}을 이름으로 바꾼다 (이름에 따옴표 · 역슬래시가 있어도 JSON이 깨지지 않게 이스케이프) */
export function fillStoryName(draft: StoryDraftV1, name: string): StoryDraftV1 {
  const escaped = JSON.stringify(name).slice(1, -1);
  return JSON.parse(JSON.stringify(draft).replaceAll("{name}", escaped)) as StoryDraftV1;
}

export type AssembleStoryOptions = {
  draft: StoryDraftV1;
  evidence: Evidence[];
  input: Pick<ReportInput, "nickname" | "knownMbti" | "summary" | "saju" | "context">;
  reference: { year: number; month: number; iso: string };
  promptVersion: string;
  ruleVersions: string[];
};

/** 형식 검사를 통과한 영역별 이야기 초안으로 저장할 리포트를 만든다 */
export function assembleStory(o: AssembleStoryOptions): IntegratedReadingReport {
  const { evidence, input, reference } = o;
  const draft = fillStoryName(o.draft, input.nickname);
  const name = input.nickname;
  const saju = input.saju;
  const context = input.context as (PersonalContextInput & { updatedAt?: string }) | null;

  const blocks: ReadingBlock[] = STORY_AREAS.map((plan) => {
    const a = draft.areas.find((x) => x.id === plan.id)!;
    const caveat = BLOCK_CAVEAT[plan.blockId]?.(name);
    return {
      id: plan.blockId,
      group: plan.group,
      topic: plan.topic,
      headline: a.headline,
      summary: a.paragraphs[0],
      details: a.paragraphs.slice(1),
      ...(caveat ? { caveat } : {}),
      basis: basisFor(a.evidence, evidence),
      evidence: a.evidence,
    };
  });

  const timeline = saju.status === "ok" ? luckTimeline(saju, reference) : [];
  const current = timeline.find((s) => s.role === "current");

  const flow: ReadingFlow = {
    id: "flow",
    topic: STORY_FLOW_TOPIC,
    headline: draft.flow.headline,
    summary: draft.flow.paragraphs[0],
    paragraphs: draft.flow.paragraphs.slice(1),
    caveat: FLOW_CAVEAT,
    // 계산된 현재 시기가 있으면 시기 카드의 글도 쉬운 말 설명(period-plain.ts)에서 코드가 채운다 — AI가 다시 쓴 글로 덮어쓰지 않는다
    cardText: current ? `${periodPlain(current.stemGroup, current.branchGroup).meaning} ${periodPlain(current.stemGroup, current.branchGroup).example}` : draft.flow.paragraphs[0],
    years: draft.flow.years,
    periods: [],
    scenarios: draft.flow.scenarios,
    scenarioNote: SCENARIO_NOTE,
    statistics: STATISTICS_NOTE,
    basis: basisFor(draft.flow.evidence, evidence, { uncertain: true }),
    evidence: draft.flow.evidence,
  };

  const topicsForInputs = [...blocks.map((b) => ({ topic: b.topic, evidence: b.evidence })), { topic: STORY_FLOW_TOPIC, evidence: draft.flow.evidence }, ...(draft.focus?.length ? [{ topic: "알려 주신 고민", evidence: draft.focus.flatMap((f) => f.evidence) }] : [])];

  return {
    kind: "integrated-reading",
    layout: "story",
    source: input.summary.source,
    personName: name,
    headline: draft.headline,
    summary: [
      { kind: "strength", label: CARD_LABEL.strength, keyword: draft.cards.strength.keyword, note: draft.cards.strength.note },
      { kind: "caution", label: CARD_LABEL.caution, keyword: draft.cards.caution.keyword, note: draft.cards.caution.note },
      {
        kind: "flow",
        label: CARD_LABEL.flow,
        // 계산된 대운이 있으면 제목 · 뜻은 해석 키워드가 아니라 쉬운 말 설명(period-plain.ts)을 코드가 채운다
        ...(current
          ? { keyword: periodPlain(current.stemGroup, current.branchGroup).title, note: periodPlain(current.stemGroup, current.branchGroup).meaning, foot: periodLine(current.from, current.to) }
          : { keyword: draft.cards.flow.keyword, note: "10년 시기의 기간은 계산하지 못했어요. 가까운 해의 분위기만 읽었어요." }),
      },
    ],
    inputs: buildInputs({ knownMbti: input.knownMbti, hasContext: Boolean(context), hasSaju: saju.status === "ok", topics: topicsForInputs, allEvidence: evidence, nickname: name }),
    blocks,
    flow,
    timeline,
    timelineReference: { year: reference.year, month: reference.month },
    ...(saju.status === "ok" ? { calendars: { ruleVersion: MONTH_RULE_VERSION, items: monthCalendars(saju, reference) } } : {}),
    actions: draft.actions.map((a) => ({ title: a.title, detail: a.detail, area: a.area })),
    saju: sajuSection(saju),
    base: input.summary,
    extras: buildReportExtras({ summary: input.summary, saju, reference }),
    ...(draft.focus?.length ? { focus: draft.focus } : {}),
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

/** 내용 검사(depth.ts)가 읽는 모양 — 영역마다 한 덩어리, 흐름은 문단 모두 한 덩어리. 반복 검사(repeat.ts)는 글 조각 위치(where)를 그대로 쓴다 */
export function storyDepthSource(d: StoryDraftV1) {
  return {
    headline: d.headline,
    blocks: d.areas.map((a) => ({ id: a.id, summary: a.paragraphs[0] ?? "", details: a.paragraphs.slice(1) })),
    flow: { summary: d.flow.paragraphs[0] ?? "", cardText: d.flow.paragraphs.slice(1).join(" "), scenarios: d.flow.scenarios },
    actions: d.actions.map((a) => ({ title: a.title, detail: a.detail })),
    ...(d.focus?.length ? { focus: d.focus.map((f) => ({ text: f.text })) } : {}),
  };
}
