// 자기 이해 풀이(비교용 v0)의 "내용 차이" 검사 — 말만 추상적으로 길어진 글을 거르려는 어림이다 (compare.ts의 측정을 합격선으로 묶은 것).
// 합격선은 결과를 보기 전에 정한 값이며 샘플에 맞춰 조정하지 않는다. 낱말 · 표지를 세는 어림이라 좋은 글의 보증이 아니다 (가려 읽는 평가가 따로 있다).
// 글자 수는 보고만 하고 기준에 쓰지 않는다.
import type { PersonalContextInput } from "../../personalization/context.ts";
import type { Evidence } from "../evidence.ts";
import { containment, shingles } from "../v2/depth.ts";
import { groundingOf, readingBlocks, type Block, type Grounding } from "./compare.ts";
import type { PhilosophicalDraftV0 } from "./types.ts";

export const PHILOSOPHY_DEPTH = {
  /** 상황 표지(원국 · 응답 · 알려 준 내용 · 조건 · 분량)가 없는 추상적인 문장 — 이 수를 넘으면 실패, 1개 이상이면 알림 */
  ungroundedAbstractFail: 3,
  /** 사주 근거를 단 덩어리의 몫 (사주가 틀이어야 한다) */
  sajuCitedMin: 0.8,
  actionConcreteMin: 2 / 3,
  selfOverlapMax: 0.35,
  conditionWarn: 0.6,
  mixedWarn: 0.6,
} as const;

export type PhilosophyDepth = {
  pass: boolean;
  fails: string[];
  warns: string[];
  metrics: Grounding & { sajuCitedShare: number; scoreNumbers: number; placeholders: number };
};

const SCORE_NUMBER = /\d{1,3}\s*점|백분위|상위\s*\d+\s*%|\d{1,3}\s*퍼센트/;
const EMPTY_CONCERN: PersonalContextInput = { topic: "other", question: "", situation: "", matched: "", differed: "", excerpt: "" };

export function checkPhilosophicalDepth(input: { draft: PhilosophicalDraftV0; evidence: Evidence[]; concern: PersonalContextInput | null }): PhilosophyDepth {
  const T = PHILOSOPHY_DEPTH;
  const blocks = readingBlocks(input.draft);
  const g = groundingOf(blocks, input.concern ?? EMPTY_CONCERN, input.evidence);
  const bySrc = new Map(input.evidence.map((e) => [e.id, e.source]));
  const withEv = blocks.filter((b) => b.evidence.length);
  const sajuCitedShare = withEv.length ? withEv.filter((b) => b.evidence.some((id) => bySrc.get(id) === "saju")).length / withEv.length : 0;
  const all = blocks.map((b) => b.text).concat(input.draft.headline);
  const scoreNumbers = all.filter((t) => SCORE_NUMBER.test(t)).length;
  const placeholders = all.filter((t) => /\[모의 생성\]/.test(t)).length;
  const fails: string[] = [];
  const warns: string[] = [];
  if (placeholders) fails.push("placeholder");
  if (g.ungroundedAbstract.length > T.ungroundedAbstractFail) fails.push("ungrounded-abstract");
  else if (g.ungroundedAbstract.length > 0) warns.push("ungrounded-abstract");
  if (sajuCitedShare < T.sajuCitedMin) fails.push("saju-center");
  if (g.actionConcreteShare < T.actionConcreteMin) fails.push("actions-concrete");
  if (g.selfOverlapMax > T.selfOverlapMax) fails.push("self-overlap");
  if (g.conditionShare < T.conditionWarn) warns.push("condition");
  if (g.mixedShare < T.mixedWarn) warns.push("mixed");
  if (scoreNumbers) warns.push("score-numbers");
  return { pass: fails.length === 0, fails, warns, metrics: { ...g, sajuCitedShare, scoreNumbers, placeholders } };
}

/** 두 풀이가 얼마나 같은 말인가 — A의 덩어리 가운데 B의 어느 덩어리와 거의 같은 것의 몫 (서로 다른 사람의 풀이가 같은 말로 채워지지 않았는지 보는 데 쓴다) */
export function crossOverlapBlocks(a: Block[], b: Block[], threshold = 0.5): number {
  if (!a.length) return 0;
  const sb = b.map((x) => shingles(x.text));
  return a.filter((x) => sb.some((s) => containment(shingles(x.text), s) >= threshold)).length / a.length;
}
