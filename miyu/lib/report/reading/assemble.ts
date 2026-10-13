// AI가 쓴 초안(ReadingDraftV1) + 코드가 아는 값 → 저장하는 리포트(IntegratedReadingReport).
// 제목 위 이름표 · 묶음 · 접어 둔 "분석 근거" · 안전 안내 · 큰 흐름 타임라인 · 참고한 자료 목록은 AI가 쓰지 않고 여기서 근거 목록과 계산 결과로 만든다.
// (예시 화면과 실제 생성이 같은 고정 문구를 쓰도록 plan.ts의 문구를 가져다 쓴다.)
import { filledFields, topicLabel, type PersonalContextInput } from "../../personalization/context.ts";
import { sajuSection } from "../../saju/display.ts";
import { GLOSSARY, termsOfEvidence } from "../../saju/glossary.ts";
import { luckTimeline } from "../../saju/interpret/rules.ts";
import { describePolicy } from "../../saju/policy.ts";
import type { Evidence } from "../evidence.ts";
import { buildReportExtras } from "../extras.ts";
import type { ReportInput } from "../generator.ts";
import { BLOCK_CAVEAT, BLOCK_PLAN, CARD_LABEL, comfortNote, FLOW_CAVEAT, FLOW_TOPIC, RULE_DRAFT_NOTE, SCENARIO_NOTE, SCORE_NOTE, STATISTICS_NOTE } from "./plan.ts";
import type { IntegratedReadingReport, ReadingBasis, ReadingBlock, ReadingDraftV1, ReadingFlow, ReadingInput } from "./types.ts";
import { periodRefs } from "./validate.ts";

/** 글 안의 {name}을 이름으로 바꾼다 (이름에 따옴표 · 역슬래시가 있어도 JSON이 깨지지 않게 이스케이프) */
export function fillReadingName(draft: ReadingDraftV1, name: string): ReadingDraftV1 {
  const escaped = JSON.stringify(name).slice(1, -1);
  return JSON.parse(JSON.stringify(draft).replaceAll("{name}", escaped)) as ReadingDraftV1;
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** 근거 ID들로 접어 둔 "분석 근거"를 만든다 — 계산 결과 · 전통 해석 · 응답을 나누고, 쓰인 사주 용어는 한자와 쉬운 뜻을 붙인다 */
export function basisFor(ids: string[], evidence: Evidence[], extra: { uncertain?: boolean } = {}): ReadingBasis {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const cited = uniq(ids).map((id) => byId.get(id)).filter((e): e is Evidence => Boolean(e));
  const saju = cited.filter((e) => e.source === "saju" && !e.uncertain);
  const answers = cited.filter((e) => e.source !== "saju" && !e.uncertain);

  // 쓰인 사주 용어 — 한자와 쉬운 뜻을 한 줄씩 (본문에는 용어를 쓰지 않으므로 여기서만 풀이한다)
  const gloss = uniq(saju.flatMap((e) => termsOfEvidence(e)))
    .map((t) => GLOSSARY[t])
    .filter(Boolean)
    .slice(0, 6)
    .map((g) => `용어 · ${g.term}(${g.hanja}): ${g.plain}`);

  const computed = [...uniq(saju.map((e) => e.fact)), ...gloss];

  const unknown: string[] = [RULE_DRAFT_NOTE];
  if (!answers.some((e) => e.source === "survey")) unknown.push("이 부분은 응답 자료 없이 사주만으로 읽었습니다.");
  if (answers.some((e) => e.id === "self.mbti")) unknown.push("MBTI는 본인이 입력한 값이며 참고로만 봤습니다. 공식 MBTI 검사 결과가 아닙니다.");
  if (answers.some((e) => e.source === "survey")) unknown.push("응답 문항은 개발용 예시이며, 미유의 새 성향 질문은 아직 적용하지 않았습니다.");
  if (extra.uncertain) for (const e of evidence.filter((x) => x.uncertain)) unknown.push(`${e.fact} — 학파 · 경계에 따라 달라질 수 있어 해석에 쓰지 않았습니다.`);

  return {
    computed,
    tradition: uniq(saju.map((e) => e.cue)),
    answers: answers.length ? [...uniq(answers.map((e) => `${e.fact} — ${e.cue}`)), ...(answers.some((e) => e.source === "survey") ? [SCORE_NOTE] : [])] : [],
    unknown,
  };
}

const RESPONSE_GROUPS: { name: string; re: RegExp; note: string }[] = [
  { name: "기질 · 성격", re: /^survey\.(novelty|caution|sensitivity|persistence)\./, note: "개발용 예시 문항 응답입니다. 미유의 새 성향 질문은 아직 적용하지 않았습니다." },
  { name: "가까운 관계에서의 반응(애착 경향)", re: /^survey\.(anxiety|avoidance|closeness)\./, note: "개발용 예시 문항 응답입니다. 미유의 새 성향 질문은 아직 적용하지 않았습니다." },
];

/** "참고한 자료" 목록 — 어떤 자료가 있었고 어느 주제에 쓰였는지를 실제로 단 근거에서 센다 (말과 어긋나지 않게) */
function buildInputs(args: { knownMbti: string | null; hasContext: boolean; hasSaju: boolean; topics: { topic: string; evidence: string[] }[]; allEvidence: Evidence[]; nickname: string }): ReadingInput[] {
  const usedIn = (re: RegExp) => args.topics.filter((t) => t.evidence.some((id) => re.test(id))).map((t) => t.topic);
  const has = (re: RegExp) => args.allEvidence.some((e) => re.test(e.id));
  const out: ReadingInput[] = [
    { name: "사주", status: args.hasSaju ? "used" : "none", note: "만세력 엔진으로 계산한 원국 · 대운 · 세운입니다. 해석 규칙은 전문가 검토 전 초안입니다.", usedIn: usedIn(/^saju\./) },
    args.knownMbti
      ? { name: "MBTI", status: "used", note: `본인이 입력한 ${args.knownMbti}입니다. 참고값으로만 봤으며 공식 MBTI 검사 결과가 아닙니다.`, usedIn: usedIn(/^self\.mbti$/) }
      : { name: "MBTI", status: "none", note: "입력하지 않았습니다.", usedIn: [] },
  ];
  for (const g of RESPONSE_GROUPS) {
    out.push(
      has(g.re)
        ? { name: g.name, status: "dev", note: g.note, usedIn: usedIn(g.re) }
        : { name: g.name, status: "none", note: "뚜렷한 방향으로 나온 응답이 없어 해석에 쓰지 않았습니다. 만들어 채우지 않았습니다.", usedIn: [] },
    );
  }
  out.push(
    args.hasContext
      ? { name: "알려 준 고민 · 상황", status: "used", note: "알려 주신 고민은 해석의 초점과 예시를 고르는 데만 썼습니다. 사주 계산은 바꾸지 않았습니다.", usedIn: ["알려 주신 고민"] }
      : { name: "알려 준 고민 · 상황", status: "none", note: "입력하지 않았습니다. 특정 고민 없이 쓴 종합 해석입니다.", usedIn: [] },
    { name: "상대 자료", status: "none", note: `없습니다. 관계 부분은 ${args.nickname} 님의 사주와 응답만으로 읽었습니다.`, usedIn: [] },
    { name: "연구 통계", status: "none", note: "사용하지 않았습니다.", usedIn: [] },
  );
  return out;
}

const positionText = (progress: number | undefined) => (progress === undefined ? "" : progress < 1 / 3 ? "지금은 그 앞부분을 지나고 있어요" : progress < 2 / 3 ? "지금은 그 중간쯤을 지나고 있어요" : "지금은 그 뒷부분을 지나고 있어요");

export type AssembleOptions = {
  draft: ReadingDraftV1;
  evidence: Evidence[];
  input: Pick<ReportInput, "nickname" | "knownMbti" | "summary" | "saju" | "context">;
  reference: { year: number; month: number; iso: string };
  promptVersion: string;
  ruleVersions: string[];
};

/** 형식 검사를 통과한 초안으로 저장할 리포트를 만든다 */
export function assembleReading(o: AssembleOptions): IntegratedReadingReport {
  const { evidence, input, reference } = o;
  const draft = fillReadingName(o.draft, input.nickname);
  const name = input.nickname;
  const saju = input.saju;
  const context = input.context as (PersonalContextInput & { updatedAt?: string }) | null;

  const blocks: ReadingBlock[] = BLOCK_PLAN.map((plan) => {
    const b = draft.blocks.find((x) => x.id === plan.id)!;
    const caveat = BLOCK_CAVEAT[plan.id]?.(name);
    return {
      id: plan.id,
      group: plan.group,
      topic: plan.topic,
      headline: b.headline,
      summary: b.summary,
      ...(b.example ? { example: b.example } : {}),
      details: b.details ?? [],
      watch: b.watch,
      ...(b.traits ? { traits: b.traits } : {}),
      ...(b.comfort ? { comfort: { ...b.comfort, note: comfortNote(name) } } : {}),
      ...(b.reactionFlow ? { reactionFlow: b.reactionFlow } : {}),
      ...(caveat ? { caveat } : {}),
      basis: basisFor(b.evidence, evidence),
      evidence: b.evidence,
    };
  });

  const refs = periodRefs(evidence);
  const timeline = saju.status === "ok" ? luckTimeline(saju, reference) : [];
  const current = timeline.find((s) => s.role === "current");
  const dot = (s: string) => s.replace("-", ".");

  const flow: ReadingFlow = {
    id: "flow",
    topic: FLOW_TOPIC,
    headline: draft.flow.headline,
    summary: draft.flow.summary,
    caveat: FLOW_CAVEAT,
    cardText: draft.flow.cardText,
    years: draft.flow.years,
    periods: draft.flow.periods.map((p) => ({ period: refs.find((r) => r.ref === p.ref)?.label ?? p.ref, theme: p.theme, watch: p.watch })),
    scenarios: draft.flow.scenarios,
    scenarioNote: SCENARIO_NOTE,
    statistics: STATISTICS_NOTE,
    basis: basisFor(
      uniq([...draft.flow.evidence, ...draft.flow.periods.flatMap((p) => refs.find((r) => r.ref === p.ref)?.ids ?? [])]),
      evidence,
      { uncertain: true },
    ),
    evidence: draft.flow.evidence,
  };

  const topicsForInputs = [...blocks.map((b) => ({ topic: b.topic, evidence: b.evidence })), { topic: FLOW_TOPIC, evidence: draft.flow.evidence }, ...(draft.focus?.length ? [{ topic: "알려 주신 고민", evidence: draft.focus.flatMap((f) => f.evidence) }] : [])];

  return {
    kind: "integrated-reading",
    source: input.summary.source,
    personName: name,
    headline: draft.headline,
    summary: [
      { kind: "strength", label: CARD_LABEL.strength, keyword: draft.cards.strength.keyword, note: draft.cards.strength.note },
      { kind: "caution", label: CARD_LABEL.caution, keyword: draft.cards.caution.keyword, note: draft.cards.caution.note },
      {
        kind: "flow",
        label: CARD_LABEL.flow,
        keyword: draft.cards.flow.keyword,
        note: current ? `${dot(current.from)}부터 ${dot(current.to)}까지, ${positionText(current.progress)}.` : "10년 시기의 기간은 계산하지 못했어요. 가까운 해의 분위기만 읽었어요.",
      },
    ],
    inputs: buildInputs({ knownMbti: input.knownMbti, hasContext: Boolean(context), hasSaju: saju.status === "ok", topics: topicsForInputs, allEvidence: evidence, nickname: name }),
    blocks,
    flow,
    timeline,
    timelineReference: { year: reference.year, month: reference.month },
    actions: draft.actions.map((a) => ({ title: a.title, detail: a.detail })),
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
