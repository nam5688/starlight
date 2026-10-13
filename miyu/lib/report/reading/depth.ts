// 읽기 구조 리포트의 "내용 차이" 검사 — 길이가 아니라 내용이 있는지를 어림해서 거른다.
// 형식 검사(validate.ts: 근거 ID · 글자 · 문장 수 · 쉬운 말 · 금지 표현 · 반복 문장)를 통과한 초안에 대해 다음을 센다.
//  · 조건 · 상황이 있는가 ("~할 때는", "~하면", "다만")        · 아무에게나 해당하는 말(범용 문장)로 채우지 않았는가
//  · 문단끼리 · 무료 미리보기에 이미 있던 말과 겹치지 않는가   · 실천 제안이 서로 다른 상황의 구체적인 행동인가
//  · 문장이 지나치게 길어 읽기 어렵지 않은가                    · 모의 생성 표시가 남지 않았는가
// 한계: 낱말 · 표지를 세는 어림이다. 얕은 글을 걸러 낼 수는 있어도 좋은 글임을 보증하지 않는다.
// "구체적인가 · 새로 알게 됐나 · 읽을 만한가"는 가려서 읽는 사람의 평가(ai-quality-comparison-plan.md)가 한다.
// 통과 기준은 결과를 보기 전에 정한 값이며 예시에 맞춰 조정하지 않는다 (v2/depth.ts와 같은 표지를 쓴다).
import { BARNUM, CONCRETE_ACT, CONDITION, containment, jaccard, shingles } from "../v2/depth.ts";
import { sentences } from "../v2/validate.ts";

type Unit = { where: string; text: string };

/** 내용 검사가 읽는 값 — AI 초안(ReadingDraftV1)과 저장된 리포트(IntegratedReadingReport)가 모두 이 모양을 만족한다 */
export type ReadingDepthSource = {
  headline: string;
  blocks: { id: string; summary: string; example?: string; details: string[]; watch?: string; traits?: { shines: string; burden: string; example: string }[]; reactionFlow?: { helpful: string } }[];
  flow: { summary: string; cardText: string; scenarios: { when: string; then: string }[] };
  actions: { title: string; detail: string }[];
  focus?: { text: string }[];
};

/** 조건 · 상황 · 범용 · 겹침을 셀 "의미 단위" — 주제마다 요약 + 예시 + 풀이 + 살펴볼 점을 한 단위로, 특징 · 시나리오 · 행동은 각각 한 단위로 본다 */
export function readingUnits(d: ReadingDepthSource): Unit[] {
  const out: Unit[] = [];
  for (const b of d.blocks ?? []) {
    out.push({ where: `blocks.${b.id}`, text: [b.summary, b.example, ...(b.details ?? []), b.watch, b.reactionFlow?.helpful].filter(Boolean).join(" ") });
    (b.traits ?? []).forEach((t, i) => out.push({ where: `blocks.${b.id}.traits[${i}]`, text: `${t.shines} ${t.burden} ${t.example}` }));
  }
  out.push({ where: "flow", text: `${d.flow?.summary ?? ""} ${d.flow?.cardText ?? ""}` });
  (d.flow?.scenarios ?? []).forEach((s, i) => out.push({ where: `flow.scenarios[${i}]`, text: `${s.when} ${s.then}` }));
  (d.focus ?? []).forEach((p, i) => out.push({ where: `focus[${i}]`, text: p.text }));
  return out.filter((u) => u.text.trim());
}

export type ReadingDepthMetrics = {
  units: number;
  /** 조건 · 상황 표지가 있는 단위의 몫 */
  conditionRatio: number;
  /** 범용 문장 표지가 있고 조건은 없는 단위 */
  genericUnits: string[];
  genericShare: number;
  /** 단위끼리 가장 많이 겹치는 쌍의 겹침 (3글자 조각 기준 자카드) */
  selfOverlapMax: number;
  /** 무료 미리보기 글과 겹치지 않는 단위의 몫 (무료 글을 주지 않으면 null) */
  novelty: number | null;
  /** 실천 제안 중 구체적인 행동(적기 · 묻기 · 정하기처럼 실제로 하는 일)이 있는 몫 */
  actionConcreteShare: number;
  distinctActions: number;
  /** 한 문장이 70자를 넘는 문장의 몫 (읽기 어려움 어림) */
  longSentenceShare: number;
  placeholders: number;
};

export type ReadingDepthFlag = { id: string; severity: "fail" | "warn"; message: string };
export type ReadingDepthResult = { metrics: ReadingDepthMetrics; flags: ReadingDepthFlag[]; pass: boolean };

export const READING_DEPTH_THRESHOLDS = {
  conditionRatioMin: 0.6,
  genericShareMax: 0.2,
  selfOverlapMax: 0.35,
  noveltyWarn: 0.7,
  actionConcreteMin: 2 / 3,
  distinctActionsMin: 3,
  longSentenceWarn: 0.25,
} as const;

const words = (s: string) => new Set(s.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1));
function wordOverlap(a: string, b: string) {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

export function checkReadingDepth(input: { draft: ReadingDepthSource; freeTexts?: string[] }): ReadingDepthResult {
  const { draft } = input;
  const units = readingUnits(draft);
  const n = units.length || 1;

  const withCondition = units.filter((u) => CONDITION.test(u.text));
  const generic = units.filter((u) => BARNUM.some((re) => re.test(u.text)) && !CONDITION.test(u.text));

  const sh = units.map((u) => shingles(u.text));
  let selfMax = 0;
  for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) selfMax = Math.max(selfMax, jaccard(sh[i], sh[j]));

  let novelty: number | null = null;
  if (input.freeTexts?.length) {
    const freeSh = shingles(input.freeTexts.join(" "));
    novelty = units.filter((u) => containment(shingles(u.text), freeSh) < 0.35).length / n;
  }

  const actions = draft.actions ?? [];
  const concrete = actions.filter((a) => CONCRETE_ACT.test(a.detail));
  const distinct: string[] = [];
  for (const a of actions) if (!distinct.some((x) => wordOverlap(x, a.detail) > 0.7)) distinct.push(a.detail);

  const allSentences = units.flatMap((u) => sentences(u.text));
  const long = allSentences.filter((s) => s.length > 70);
  const placeholders = [draft.headline, ...units.map((u) => u.text), ...actions.map((a) => a.detail)].filter((t) => /\[모의 생성\]/.test(t)).length;

  const metrics: ReadingDepthMetrics = {
    units: units.length,
    conditionRatio: withCondition.length / n,
    genericUnits: generic.map((u) => u.where),
    genericShare: generic.length / n,
    selfOverlapMax: selfMax,
    novelty,
    actionConcreteShare: actions.length ? concrete.length / actions.length : 0,
    distinctActions: distinct.length,
    longSentenceShare: allSentences.length ? long.length / allSentences.length : 0,
    placeholders,
  };

  const T = READING_DEPTH_THRESHOLDS;
  const pc = (x: number) => `${Math.round(x * 100)}%`;
  const flags: ReadingDepthFlag[] = [];
  if (placeholders > 0) flags.push({ id: "placeholder", severity: "fail", message: `모의 생성 표시가 ${placeholders}곳에 남아 있습니다 — 모의 글은 판매할 수 없습니다.` });
  if (metrics.conditionRatio < T.conditionRatioMin) flags.push({ id: "condition", severity: "fail", message: `"~할 때는 · ~하면 · 다만" 같은 조건이 있는 부분이 ${pc(metrics.conditionRatio)}뿐입니다 (기준 ${pc(T.conditionRatioMin)} 이상). 조건 없이 단정하는 글은 누구에게나 해당할 수 있습니다.` });
  if (metrics.genericShare > T.genericShareMax) flags.push({ id: "generic", severity: "fail", message: `아무에게나 해당하는 말(범용 문장)로 읽히는 부분이 ${pc(metrics.genericShare)}입니다 (${metrics.genericUnits.join(", ")}). 기준 ${pc(T.genericShareMax)} 이하.` });
  if (metrics.selfOverlapMax > T.selfOverlapMax) flags.push({ id: "self-overlap", severity: "fail", message: `부분끼리 거의 같은 말이 있습니다 (겹침 ${pc(metrics.selfOverlapMax)}, 기준 ${pc(T.selfOverlapMax)} 이하).` });
  if (metrics.distinctActions < T.distinctActionsMin) flags.push({ id: "actions-distinct", severity: "fail", message: `서로 다른 실천 제안이 ${metrics.distinctActions}개입니다 (기준 ${T.distinctActionsMin}개 이상).` });
  if (metrics.actionConcreteShare < T.actionConcreteMin) flags.push({ id: "actions-concrete", severity: "fail", message: `적기 · 묻기 · 정하기처럼 실제로 하는 행동이 들어 있는 실천 제안이 ${pc(metrics.actionConcreteShare)}입니다 (기준 ${pc(T.actionConcreteMin)} 이상).` });
  if (metrics.novelty !== null && metrics.novelty < T.noveltyWarn) flags.push({ id: "novelty", severity: "warn", message: `무료 미리보기에 이미 있던 말과 겹치지 않는 부분이 ${pc(metrics.novelty)}입니다 (기준 ${pc(T.noveltyWarn)} 이상) — 새로 알게 되는 내용이 부족할 수 있습니다.` });
  if (metrics.longSentenceShare > T.longSentenceWarn) flags.push({ id: "long-sentences", severity: "warn", message: `70자를 넘는 긴 문장이 ${pc(metrics.longSentenceShare)}입니다 — 짧은 문장으로 나누면 읽기 쉽습니다.` });

  return { metrics, flags, pass: !flags.some((f) => f.severity === "fail") };
}

/** 두 사람의 리포트가 얼마나 같은 말인가 — A의 부분 중 B의 어느 부분과 거의 같은 것의 몫 (0~1). 이름을 가려도 이 사람의 이야기로 읽히려면 낮아야 한다 */
export function crossPersonOverlapReading(a: ReadingDepthSource, b: ReadingDepthSource, threshold = 0.5): number {
  const A = readingUnits(a);
  const B = readingUnits(b).map((u) => shingles(u.text));
  if (!A.length) return 0;
  let n = 0;
  for (const u of A) {
    const sh = shingles(u.text);
    if (B.some((x) => containment(sh, x) >= threshold)) n++;
  }
  return n / A.length;
}
