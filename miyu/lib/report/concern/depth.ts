// 고민 반영 리포트의 "내용 차이" 검사 — 고객이 적은 고민이 실제로 반영됐는지, 이미 준 개인 종합 리포트와 다른 내용인지를 본다.
// "기존 리포트에 문단 몇 개를 더한 정도"로는 통과하지 못하게 하는 장치이며, 글자 수는 기준이 아니다.
// 낱말 · 표지를 세는 어림이므로 좋은 글이라는 보증은 아니다 (가려 읽는 사람의 평가가 따로 있다).
//
// 막는 것(hard): 고민 낱말이 거의 안 나옴 · 상황이 고객의 말에서 출발하지 않음 · 이미 준 리포트의 문장을 가져옴.
// 알리기만 하는 것(warn): 조건 부족 · 범용 문장 · 구체성이 약한 제안 · 이전 고민 리포트와 거의 같음.

import { concernTerms } from "../../personalization/concern.ts";
import type { PersonalContextInput } from "../../personalization/context.ts";
import { BARNUM, CONCRETE_ACT, CONDITION, containment, QUANTITY, shingles } from "../v2/depth.ts";
import type { ConcernDraftV1 } from "./types.ts";

export const CONCERN_DEPTH = {
  /** 고민 낱말 중 리포트에 나와야 하는 몫 */
  coverageMin: 0.35,
  /** 상황 항목 중 고객의 낱말을 쓴 몫 */
  situationsWithTermMin: 0.6,
  /** 이미 준 리포트와 겹치는 문단의 몫(이 이하여야 한다) */
  copiedShareMax: 0.15,
  /** 한 문단이 이미 준 리포트와 이만큼 겹치면 "가져온 것"으로 본다 */
  copiedAt: 0.5,
  conditionWarn: 0.6,
  genericWarn: 0.2,
  actionConcreteWarn: 2 / 3,
  previousOverlapWarn: 0.5,
} as const;

export type ConcernDepthMetrics = {
  terms: string[];
  covered: string[];
  coverage: number;
  situationsWithTerm: number;
  situations: number;
  /** 이미 준 리포트와 거의 같은 문단 수 · 몫 */
  copied: number;
  copiedShare: number;
  /** 이미 준 리포트에 없는 말의 평균 몫 (0~1, 높을수록 새로운 내용) */
  novelty: number;
  conditionRatio: number;
  genericParagraphs: number;
  actionConcreteShare: number;
  previousOverlap: number | null;
};

export type ConcernDepthResult = { pass: boolean; errors: string[]; warnings: string[]; metrics: ConcernDepthMetrics };

const SHINGLE = 4;
const norm = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "");

/** 검사하는 글 덩어리: 이해 · 구조 문단, 상황별 해석 · 제안, 실천 제안 */
function blocks(d: ConcernDraftV1): { where: string; text: string }[] {
  return [
    ...d.understanding.map((p, i) => ({ where: `understanding[${i}]`, text: p.text })),
    ...d.pattern.map((p, i) => ({ where: `pattern[${i}]`, text: p.text })),
    ...d.situations.map((s, i) => ({ where: `situations[${i}]`, text: `${s.reading} ${s.suggestion}` })),
    ...d.differences.map((p, i) => ({ where: `differences[${i}]`, text: p.text })),
    ...d.actions.map((a, i) => ({ where: `actions[${i}]`, text: `${a.situation} ${a.action}` })),
  ];
}

export function checkConcernDepth(input: {
  draft: ConcernDraftV1;
  concern: PersonalContextInput;
  /** 이미 준 개인 종합 리포트의 글 (없으면 중복 검사는 건너뛴다) */
  baseTexts: string[];
  /** 이전에 발급한 고민 반영 리포트들의 글 */
  previousTexts?: string[][];
}): ConcernDepthResult {
  const { draft, concern } = input;
  const T = CONCERN_DEPTH;
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1) 고민 반영: 고객이 적은 낱말이 해석에 나오는가
  const terms = concernTerms(concern);
  const reportText = norm(
    [
      ...draft.understanding.map((p) => p.text),
      ...draft.pattern.map((p) => p.text),
      ...draft.situations.flatMap((s) => [s.situation, s.reading, s.suggestion]),
      ...draft.actions.flatMap((a) => [a.situation, a.action]),
    ].join(" "),
  );
  const covered = terms.filter((t) => reportText.includes(norm(t)));
  const coverage = terms.length ? covered.length / terms.length : 1;
  const needed = terms.length >= 2 ? Math.min(terms.length, Math.max(2, Math.ceil(terms.length * T.coverageMin))) : 0;
  if (needed > 0 && covered.length < needed) {
    errors.push(
      `고객이 적은 고민의 말이 해석에 거의 나오지 않습니다 (핵심 낱말 ${terms.length}개 중 ${covered.length}개 반영, 최소 ${needed}개). 적은 상황 · 표현(예: ${terms.slice(0, 5).join(", ")})을 받아 그 상황에서 왜 그런지, 무엇을 해 볼 수 있는지 새로 쓰세요.`,
    );
  } else if (terms.length < 2) {
    warnings.push("고객이 적은 글이 짧아 고민이 얼마나 반영됐는지 확인하기 어렵습니다.");
  }

  // 상황 항목이 고객의 말에서 출발하는가
  const situationsWithTerm = draft.situations.filter((s) => terms.some((t) => norm(s.situation).includes(norm(t)))).length;
  if (terms.length >= 2 && situationsWithTerm < Math.ceil(draft.situations.length * T.situationsWithTermMin)) {
    errors.push(`상황별 해석 ${draft.situations.length}개 중 고객이 적은 낱말로 시작한 것이 ${situationsWithTerm}개뿐입니다. 상황마다 고객이 적은 상황 · 표현에서 출발하세요.`);
  }

  // 2) 이미 준 리포트와의 차이
  const parts = blocks(draft);
  let copied = 0;
  let noveltySum = 0;
  if (input.baseTexts.length) {
    const baseSet = shingles(input.baseTexts.join(" "), SHINGLE);
    for (const b of parts) {
      const c = containment(shingles(b.text, SHINGLE), baseSet);
      noveltySum += 1 - c;
      if (c >= T.copiedAt) copied++;
    }
  }
  const copiedShare = parts.length ? copied / parts.length : 0;
  const novelty = input.baseTexts.length && parts.length ? noveltySum / parts.length : 1;
  if (input.baseTexts.length && copiedShare > T.copiedShareMax) {
    errors.push(`이미 준 개인 종합 리포트와 거의 같은 문단이 ${copied}개(${Math.round(copiedShare * 100)}%)입니다. 기존 내용을 다시 쓰지 말고 이번 고민에 새로 답하세요.`);
  }

  // 3) 알리기만 하는 것
  const withCondition = parts.filter((b) => CONDITION.test(b.text)).length;
  const conditionRatio = parts.length ? withCondition / parts.length : 0;
  if (conditionRatio < T.conditionWarn) warnings.push(`조건 · 상황 표지가 있는 문단이 ${Math.round(conditionRatio * 100)}%입니다 (기준 ${Math.round(T.conditionWarn * 100)}%).`);
  const genericParagraphs = parts.filter((b) => BARNUM.some((re) => re.test(b.text)) && !CONDITION.test(b.text)).length;
  if (parts.length && genericParagraphs / parts.length > T.genericWarn) warnings.push(`아무에게나 해당하는 말로 읽히는 문단이 ${genericParagraphs}개입니다.`);
  const concrete = draft.actions.filter((a) => QUANTITY.test(a.action) && CONCRETE_ACT.test(a.action)).length;
  const actionConcreteShare = draft.actions.length ? concrete / draft.actions.length : 0;
  if (actionConcreteShare < T.actionConcreteWarn) warnings.push(`시점 · 분량과 구체적인 행동이 모두 보이는 제안이 ${Math.round(actionConcreteShare * 100)}%입니다.`);

  let previousOverlap: number | null = null;
  if (input.previousTexts?.length) {
    const sets = input.previousTexts.map((t) => shingles(t.join(" "), SHINGLE));
    const overlaps = sets.map((set) => parts.filter((b) => containment(shingles(b.text, SHINGLE), set) >= T.copiedAt).length / Math.max(1, parts.length));
    previousOverlap = Math.max(...overlaps);
    if (previousOverlap > T.previousOverlapWarn) warnings.push(`이전에 발급한 고민 리포트와 ${Math.round(previousOverlap * 100)}%가 같은 문단입니다 (고민이 거의 같을 수 있습니다).`);
  }

  return {
    pass: errors.length === 0,
    errors,
    warnings,
    metrics: { terms, covered, coverage, situationsWithTerm, situations: draft.situations.length, copied, copiedShare, novelty, conditionRatio, genericParagraphs, actionConcreteShare, previousOverlap },
  };
}
