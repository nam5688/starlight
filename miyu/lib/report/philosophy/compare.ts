// 같은 가상 인물의 "기존 풀이"와 "자기 이해 풀이(수정안)"를 나란히 놓고, 말만 추상적으로 길어진 것이 아닌지 어림으로 센다.
// 이 파일은 비교 문서(docs/reading-comparison-haerin.html)와 테스트(philosophy-sample.test.ts)가 함께 쓰며, 제품 화면 · 생성 지침에는 연결하지 않았다.
//
// 한계: 낱말 · 표지를 세는 어림이다. 글이 좋은지 보증하지 않고, 낮은 값이 좋은 글이라는 뜻도 아니다.
// "어디가 새로운가 · 읽을 만한가"는 문단별 점검표(근거 · 새로 알게 되는 것)와 가려 읽는 사람의 평가가 본다. 길이는 보고만 한다.
import { concernTerms } from "../../personalization/concern.ts";
import type { PersonalContextInput } from "../../personalization/context.ts";
import type { Evidence } from "../evidence.ts";
import { CONCRETE_ACT, CONDITION, containment, jaccard, QUANTITY, shingles } from "../v2/depth.ts";
import { sentences } from "../v2/validate.ts";
import type { ConcernDraftV1 } from "../concern/types.ts";

/** 자기 이해 풀이(수정안) — 아직 제품 형식이 아니다. 비교용 구조 */
export type ReadingBlock = { text: string; evidence: string[] };
export type PhilosophicalReading = {
  headline: string;
  intro: ReadingBlock;
  values: (ReadingBlock & { title: string })[];
  conflicts: (ReadingBlock & { title: string; between: [string, string] })[];
  disagreement: ReadingBlock;
  strengthCost: { strength: string; cost: string; when: string; reading: string; evidence: string[] }[];
  choices: { option: string; protects: string; costs: string; check: string; evidence: string[] }[];
  flow: ReadingBlock;
  noVerdict: string;
  questionsActions: { when: string; question: string; action: string; evidence: string[] }[];
};

/** 두 풀이를 같은 잣대로 세기 위해 "글 덩어리"로 편다 */
export type Block = { kind: string; text: string; evidence: string[]; isAction?: boolean };

export function readingBlocks(r: PhilosophicalReading): Block[] {
  return [
    { kind: "읽는 법", text: r.intro.text, evidence: r.intro.evidence },
    ...r.values.map((v) => ({ kind: "중요하게 여기는 것", text: `${v.title}. ${v.text}`, evidence: v.evidence })),
    ...r.conflicts.map((c) => ({ kind: "내 안의 갈등", text: `${c.title}. ${c.text}`, evidence: c.evidence })),
    { kind: "내 안의 갈등", text: r.disagreement.text, evidence: r.disagreement.evidence },
    ...r.strengthCost.map((s) => ({ kind: "강점과 대가", text: `${s.strength}. ${s.when}: ${s.cost}. ${s.reading}`, evidence: s.evidence })),
    ...r.choices.map((c) => ({ kind: "고민의 선택지", text: `${c.option}. 지키는 것: ${c.protects}. 내려놓는 것: ${c.costs}. 확인할 것: ${c.check}`, evidence: c.evidence })),
    { kind: "계산된 흐름", text: r.flow.text, evidence: r.flow.evidence },
    ...r.questionsActions.map((q) => ({ kind: "질문과 행동", text: `${q.when}: ${q.question} ${q.action}`, evidence: q.evidence, isAction: true })),
  ];
}

export function concernBlocks(d: ConcernDraftV1): Block[] {
  return [
    ...d.understanding.map((p) => ({ kind: "이해", text: p.text, evidence: p.evidence })),
    ...d.pattern.map((p) => ({ kind: "구조", text: p.text, evidence: p.evidence })),
    ...d.situations.map((s) => ({ kind: "상황별", text: `${s.situation}. ${s.reading} ${s.suggestion}`, evidence: s.evidence })),
    ...d.timeline.map((t) => ({ kind: "시기", text: `${t.period} ${t.theme}. ${t.opportunity} ${t.caution}`, evidence: t.evidence })),
    ...d.differences.map((p) => ({ kind: "차이", text: p.text, evidence: p.evidence })),
    ...d.actions.map((a) => ({ kind: "행동", text: `${a.situation} ${a.action}`, evidence: a.evidence, isAction: true })),
  ];
}

/** 추상적인 낱말 — 이 말만으로 문장이 이루어지면 어떤 사람에게도 해당하는 말이 되기 쉽다 */
export const ABSTRACT = /가치|의미|본질|존재|내면|정체성|자아|인생|삶의|성장|진정한|근원|깊은 곳|영혼|철학|운명/;
/** 문장이 이 사람의 상황에 붙어 있다는 표지: 알려 준 내용 · 근거 출처 · 조건 · 분량 · 시점 */
const ATTRIBUTION = /알려 주신|하신|말씀|응답에서|응답은|원국|전통 해석|계산된|질문/;

export type Grounding = {
  chars: number;
  blocks: number;
  /** 서로 다른 근거 ID 수 */
  evidenceDistinct: number;
  /** 사주 근거와 응답 · 본인 입력 근거를 함께 단 덩어리의 몫 */
  mixedShare: number;
  conditionShare: number;
  /** 문장 가운데 이 사람의 상황 표지(고민 낱말 · 출처 · 조건 · 분량)가 있는 몫 */
  anchoredSentenceShare: number;
  /** 추상적인 낱말이 있는 문장 수와, 그중 상황 표지가 없는 문장 */
  abstractSentences: number;
  ungroundedAbstract: string[];
  questions: number;
  /** 고민 낱말 중 글에 나온 몫 */
  concernCoverage: number;
  actionConcreteShare: number;
  selfOverlapMax: number;
};

export function groundingOf(blocks: Block[], concern: PersonalContextInput, evidence: Evidence[]): Grounding {
  const terms = concernTerms(concern);
  const bySrc = new Map(evidence.map((e) => [e.id, e.source]));
  const all = blocks.map((b) => b.text).join(" ");
  const norm = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "");
  const sents = blocks.flatMap((b) => sentences(b.text));
  const anchored = (s: string) => terms.some((t) => norm(s).includes(norm(t))) || ATTRIBUTION.test(s) || CONDITION.test(s) || QUANTITY.test(s);
  const abstract = sents.filter((s) => ABSTRACT.test(s));
  const ids = new Set(blocks.flatMap((b) => b.evidence));
  const withEv = blocks.filter((b) => b.evidence.length);
  const mixed = withEv.filter((b) => b.evidence.some((id) => bySrc.get(id) === "saju") && b.evidence.some((id) => bySrc.get(id) !== "saju" && bySrc.has(id)));
  const actions = blocks.filter((b) => b.isAction);
  const sh = blocks.map((b) => shingles(b.text));
  let selfMax = 0;
  for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) selfMax = Math.max(selfMax, jaccard(sh[i], sh[j]));
  return {
    chars: blocks.reduce((n, b) => n + b.text.length, 0),
    blocks: blocks.length,
    evidenceDistinct: ids.size,
    mixedShare: withEv.length ? mixed.length / withEv.length : 0,
    conditionShare: blocks.length ? blocks.filter((b) => CONDITION.test(b.text)).length / blocks.length : 0,
    anchoredSentenceShare: sents.length ? sents.filter(anchored).length / sents.length : 0,
    abstractSentences: abstract.length,
    ungroundedAbstract: abstract.filter((s) => !anchored(s)),
    questions: (all.match(/\?/g) ?? []).length,
    concernCoverage: terms.length ? terms.filter((t) => norm(all).includes(norm(t))).length / terms.length : 1,
    actionConcreteShare: actions.length ? actions.filter((b) => QUANTITY.test(b.text) && CONCRETE_ACT.test(b.text)).length / actions.length : 0,
    selfOverlapMax: selfMax,
  };
}

/** A의 덩어리 가운데 B의 글에 거의 들어 있는 몫 (4글자 조각 · 기본 0.35) */
export function containedShare(a: Block[], bText: string, at = 0.35): number {
  if (!a.length) return 0;
  const set = shingles(bText, 4);
  return a.filter((b) => containment(shingles(b.text, 4), set) >= at).length / a.length;
}
/** A의 덩어리마다 B 글과 겹치지 않는 정도의 평균 (1이면 전부 새 말) */
export function noveltyAgainst(a: Block[], bText: string): number {
  if (!a.length) return 1;
  const set = shingles(bText, 4);
  return a.reduce((n, b) => n + (1 - containment(shingles(b.text, 4), set)), 0) / a.length;
}
