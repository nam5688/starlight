// 유료 리포트의 "내용 차이" 검사 — 길이가 아니라 내용이 있는지를 어림해서 거른다.
// 형식 검사(validate.ts: 근거 ID · 금지 표현 · 반복 문장)를 통과한 초안에 대해, 다음을 센다.
//  · 조건 · 상황이 있는가 ("~할 때는", "~하면", "다만")      · 아무에게나 해당하는 말(범용 문장)로 채우지 않았는가
//  · 사주 근거가 중심이고 응답과 함께 쓰였는가               · 실천 제안이 구체적이고 서로 다른 상황인가
//  · 문단끼리 · 다른 사람의 리포트와 겹치지 않는가           · 무료 미리보기에 이미 있던 말의 반복이 아닌가
//  · 무료가 약속한 내용(편한 환경 · 반복되는 반응 · 스트레스 상황 · 바로 적용할 행동 · 상황별 · 관계 · 큰 흐름)이 실제로 있는가
// 한계: 이것은 낱말 · 표지를 세는 어림이다. 얕은 글을 걸러 낼 수는 있어도 좋은 글임을 보증하지 않는다.
// "구체적인가 · 새로 알게 됐나 · 읽을 만한가"의 판단은 가려서 읽는 사람의 평가(ai-quality-comparison-plan.md)가 한다.
// 길이(글자 수)는 보고만 하고 통과 기준에 쓰지 않는다.

import type { Evidence } from "../evidence.ts";
import type { Paragraph, ReportDraftV2 } from "./types.ts";

/** 조건 · 상황 표지: ~할 때(는), ~하면, 다만 · 반면 · 하지만, ~는 경우 */
export const CONDITION = /때(?!문)(?:는|에는|에|면|만|도)?(?=[\s,.)]|$)|(?:하|되|이|있|없|라|으|보|오|가|지|나|드|같|다르|많|적|길|짧)면(?!서)(?=[\s,.)]|$)|경우|상황에서|다만|반면|하지만|그러나|그렇지 않|아니라면|한편/;

/** 아무에게나 해당하는 말로 읽히는 표지 (바넘 문장) — 조건 없이 이것만 있는 문단을 범용 문장으로 본다 */
export const BARNUM = [/누구나/, /사람들은 대체로/, /때로는[^.]{0,30}때로는/, /가끔은[^.]{0,30}가끔은/, /겉으로는[^.]{0,40}속으로는/, /내면에는/, /남들에게 (보이지|드러내지)/, /인정받고 싶은 (마음|욕구)/, /스스로에게 (엄격|높은 기준)/, /이해받고 싶/, /숨은 (잠재력|재능)/, /잠재력이 (많|큰|있)/];

/**
 * 실천 제안의 구체성: 시간 · 분량 단서 + 실제로 하는 행동.
 * (첫 실행에서 목표 샘플의 실천 제안 2개가 "미리 · 오늘 · 내일 · 한 문장"처럼 이 목록에 없던 낱말 때문에 걸렸다.
 * 기준값이 아니라 낱말 목록의 누락이어서 목록만 넓혔고, 통과 기준(DEPTH_THRESHOLDS)은 바꾸지 않았다.)
 */
export const QUANTITY = /\d+\s*(?:분|번|개|가지|일|주|시간|줄|문장|명|곳|단어|문단)|(?:한|두|세|네|다섯)\s*(?:분|번|개|가지|줄|문장|명|곳|사람|단어|문단|시간)|하루|이틀|오늘|내일|모레|아침|저녁|주말|이번 주|다음 주|이내|전에|뒤에|까지|미리|먼저|첫 |매일|매주|날짜|기한/;
// 2026-10-16 보강: 영역별 이야기(story-v1) 대리 작성기 글의 행동("건네 두세요" · "물어보세요" · "말을 열어 보세요" · "꺼내 보세요")이 실제로 하는 행동인데 낱말 목록에 없어 구체적이지 않은 것으로 센 오탐을 고쳤다(글을 본 뒤의 사후 수정).
export const CONCRETE_ACT = /(적(어|는|고|습니다)|말(로|해|하|을 (?:건네|열|꺼내|전하))|보내|묻|물어|정하|정해|미루|줄이|늘리|쉬|걷|확인하|알리|기록|나누|비교|써 |쓰기|읽|연락|질문|메모|체크|점검|계획|예약|끊|멈추|넘기|건네|꺼내|전하|부탁|요청)/;

const SCORE_NUMBER = /\d{1,3}\s*점|백분위|상위\s*\d+\s*%|\d{1,3}\s*퍼센트/;
const PLACEHOLDER = /\[모의 생성\]/;

const norm = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "");
export function shingles(s: string, n = 3) {
  const t = norm(s);
  const out = new Set<string>();
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n));
  return out;
}
/** A의 조각 중 B에도 있는 몫 (A가 B에 얼마나 들어 있나) */
export function containment(a: Set<string>, b: Set<string>) {
  if (!a.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / a.size;
}
export function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
}
const words = (s: string) => new Set(s.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1));
function wordOverlap(a: string, b: string) {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

type Body = { where: string; text: string; evidence: string[]; section?: string };

function bodyOf(d: ReportDraftV2): Body[] {
  const out: Body[] = [];
  const add = (where: string, p: Paragraph | undefined, section?: string) => p && typeof p.text === "string" && out.push({ where, text: p.text, evidence: p.evidence ?? [], section });
  d.summary.forEach((p, i) => add(`summary[${i}]`, p));
  d.sections.forEach((s) => s.paragraphs.forEach((p, i) => add(`sections.${s.id}[${i}]`, p, s.id)));
  d.differences.forEach((p, i) => add(`differences[${i}]`, p));
  (d.focus ?? []).forEach((p, i) => add(`focus[${i}]`, p));
  return out;
}

export type DepthMetrics = {
  /** 본문 문단 수 (요약 · 섹션 · 상황별 차이 · 고민 반영) */
  paragraphs: number;
  /** 보고만 한다 — 통과 기준에 쓰지 않는다 */
  totalChars: number;
  /** 조건 · 상황 표지가 있는 문단의 몫 */
  conditionRatio: number;
  /** 사주 근거를 하나 이상 단 문단의 몫 */
  sajuCitedShare: number;
  /** 섹션 문단 중 사주 근거와 응답(설문 · 본인 입력) 근거를 함께 단 몫 */
  sectionMixedShare: number;
  /** 범용 문장 표지가 있고 조건은 없는 문단의 수와 몫 */
  genericParagraphs: string[];
  genericShare: number;
  /** 실천 제안 중 구체적(분량 · 시간 단서 + 행동 + 상황 조건)인 몫 */
  actionConcreteShare: number;
  /** 서로 다른 상황의 실천 제안 수 */
  distinctActions: number;
  /** 문단끼리 가장 많이 겹치는 쌍의 겹침 (3글자 조각 기준 자카드) */
  selfOverlapMax: number;
  /** 무료 미리보기 글과 겹치지 않는 문단의 몫 (무료 글을 주지 않으면 null) */
  novelty: number | null;
  /** 응답 환산값 숫자(점 · 백분위)를 글에 쓴 곳 */
  scoreNumbers: string[];
  /** 모의 생성 표시가 남은 문단 수 */
  placeholders: number;
};

export type DepthPromises = {
  comfortableEnvironment: boolean;
  repeatedReaction: boolean;
  stressSituation: boolean;
  applicableActions: boolean;
  situationDifference: boolean;
  relationship: boolean;
  flow: boolean;
};

export type DepthFlag = { id: string; severity: "fail" | "warn"; message: string };
export type DepthResult = { metrics: DepthMetrics; promises: DepthPromises; flags: DepthFlag[]; pass: boolean };

/** 통과 기준 — 결과를 보기 전에 정한 값이다. 샘플에 맞춰 조정하지 않고, 바꿀 때는 이유를 문서에 남긴다 */
export const DEPTH_THRESHOLDS = {
  conditionRatioMin: 0.6,
  sajuCitedMin: 0.8,
  sectionMixedWarn: 0.4,
  genericShareMax: 0.2,
  actionConcreteMin: 2 / 3,
  distinctActionsMin: 3,
  selfOverlapMax: 0.35,
  noveltyWarn: 0.7,
} as const;

const PROMISE_LABEL: Record<keyof DepthPromises, string> = {
  comfortableEnvironment: "내가 편한 환경",
  repeatedReaction: "자주 반복되는 반응",
  stressSituation: "스트레스를 받기 쉬운 상황",
  applicableActions: "바로 적용해볼 행동",
  situationDifference: "상황별로 달라지는 모습(응답과 원국의 차이)",
  relationship: "관계에서의 모습",
  flow: "앞으로의 큰 흐름(시기별 주제)",
};

export function checkDepth(input: { draft: ReportDraftV2; evidence: Evidence[]; freeTexts?: string[]; hasContext?: boolean }): DepthResult {
  const { draft, evidence } = input;
  const bySrc = new Map(evidence.map((e) => [e.id, e.source]));
  const body = bodyOf(draft);
  const n = body.length || 1;
  const share = (k: number) => k / n;

  const withCondition = body.filter((b) => CONDITION.test(b.text));
  const withSaju = body.filter((b) => b.evidence.some((id) => bySrc.get(id) === "saju"));
  const sectionBody = body.filter((b) => b.section);
  const mixed = sectionBody.filter((b) => b.evidence.some((id) => bySrc.get(id) === "saju") && b.evidence.some((id) => bySrc.get(id) !== "saju" && bySrc.has(id)));
  const generic = body.filter((b) => BARNUM.some((re) => re.test(b.text)) && !CONDITION.test(b.text));

  const actionConcrete = draft.actions.filter((a) => QUANTITY.test(a.action) && CONCRETE_ACT.test(a.action) && CONDITION.test(a.situation));
  const distinct: string[] = [];
  for (const a of draft.actions) if (!distinct.some((x) => wordOverlap(x, a.action) > 0.7)) distinct.push(a.action);

  const sh = body.map((b) => shingles(b.text));
  let selfMax = 0;
  for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) selfMax = Math.max(selfMax, jaccard(sh[i], sh[j]));

  let novelty: number | null = null;
  if (input.freeTexts?.length) {
    const freeSh = shingles(input.freeTexts.join(" "));
    novelty = body.filter((b) => containment(shingles(b.text), freeSh) < 0.35).length / n;
  }

  const allText = [draft.headline, ...body.map((b) => b.text), ...draft.timeline.flatMap((t) => [t.theme, t.opportunity, t.caution]), ...draft.actions.flatMap((a) => [a.situation, a.action])];
  const scoreNumbers = allText.filter((t) => SCORE_NUMBER.test(t)).map((t) => t.slice(0, 40));
  const placeholders = allText.filter((t) => PLACEHOLDER.test(t)).length;

  const sec = (id: string) => draft.sections.find((s) => s.id === id)?.paragraphs.map((p) => p.text).join(" ") ?? "";
  const conditionsText = sec("conditions");
  const promises: DepthPromises = {
    comfortableEnvironment: /환경|조건|편한|편안|살아나|맞는/.test(conditionsText),
    repeatedReaction: /반복|반응|습관|흔히|자주|늘|버릇/.test(sec("mechanics")),
    stressSituation: /스트레스|지치|지쳐|부담|어려움|힘들|무너|소진|예민/.test(conditionsText),
    applicableActions: distinct.length >= DEPTH_THRESHOLDS.distinctActionsMin && actionConcrete.length >= 1,
    situationDifference: draft.differences.length >= 1 && draft.differences.every((p) => p.evidence.some((id) => bySrc.get(id) === "saju") && p.evidence.some((id) => bySrc.get(id) !== "saju" && bySrc.has(id))),
    relationship: (draft.sections.find((s) => s.id === "relationships")?.paragraphs.length ?? 0) >= 1 && /가까운|관계|사람|연락|친구|연인|가족/.test(sec("relationships")),
    flow: draft.timeline.length >= 1,
  };

  const metrics: DepthMetrics = {
    paragraphs: body.length,
    totalChars: allText.reduce((t, s) => t + s.length, 0),
    conditionRatio: share(withCondition.length),
    sajuCitedShare: share(withSaju.length),
    sectionMixedShare: sectionBody.length ? mixed.length / sectionBody.length : 0,
    genericParagraphs: generic.map((b) => b.where),
    genericShare: share(generic.length),
    actionConcreteShare: draft.actions.length ? actionConcrete.length / draft.actions.length : 0,
    distinctActions: distinct.length,
    selfOverlapMax: selfMax,
    novelty,
    scoreNumbers,
    placeholders,
  };

  const T = DEPTH_THRESHOLDS;
  const flags: DepthFlag[] = [];
  const pc = (x: number) => `${Math.round(x * 100)}%`;
  if (placeholders > 0) flags.push({ id: "placeholder", severity: "fail", message: `모의 생성 표시가 ${placeholders}곳에 남아 있습니다 — 근거 문장을 이어 붙인 모의 글은 판매할 수 없습니다.` });
  if (metrics.conditionRatio < T.conditionRatioMin) flags.push({ id: "condition", severity: "fail", message: `"~할 때는 · ~하면 · 다만" 같은 조건이 있는 문단이 ${pc(metrics.conditionRatio)}뿐입니다 (기준 ${pc(T.conditionRatioMin)} 이상). 조건 없이 단정하는 글은 누구에게나 해당할 수 있습니다.` });
  if (metrics.genericShare > T.genericShareMax) flags.push({ id: "generic", severity: "fail", message: `아무에게나 해당하는 말(범용 문장)로 읽히는 문단이 ${pc(metrics.genericShare)}입니다 (${metrics.genericParagraphs.join(", ")}). 기준 ${pc(T.genericShareMax)} 이하.` });
  if (metrics.sajuCitedShare < T.sajuCitedMin) flags.push({ id: "saju-center", severity: "fail", message: `사주 근거를 단 문단이 ${pc(metrics.sajuCitedShare)}입니다 (기준 ${pc(T.sajuCitedMin)} 이상). 사주 원국 · 대운 · 세운이 해석의 중심이어야 합니다.` });
  if (metrics.sectionMixedShare < T.sectionMixedWarn) flags.push({ id: "mixed", severity: "warn", message: `사주와 응답 근거를 함께 단 섹션 문단이 ${pc(metrics.sectionMixedShare)}입니다 — 실제 행동은 응답으로 설명하는 부분이 더 필요할 수 있습니다.` });
  if (metrics.distinctActions < T.distinctActionsMin) flags.push({ id: "actions-distinct", severity: "fail", message: `서로 다른 실천 제안이 ${metrics.distinctActions}개입니다 (기준 ${T.distinctActionsMin}개 이상).` });
  if (metrics.actionConcreteShare < T.actionConcreteMin) flags.push({ id: "actions-concrete", severity: "fail", message: `분량 · 시점 단서와 구체적인 행동, 상황 조건이 모두 있는 실천 제안이 ${pc(metrics.actionConcreteShare)}입니다 (기준 ${pc(T.actionConcreteMin)} 이상).` });
  if (metrics.selfOverlapMax > T.selfOverlapMax) flags.push({ id: "self-overlap", severity: "fail", message: `문단끼리 거의 같은 말이 있습니다 (겹침 ${pc(metrics.selfOverlapMax)}, 기준 ${pc(T.selfOverlapMax)} 이하).` });
  if (metrics.novelty !== null && metrics.novelty < T.noveltyWarn) flags.push({ id: "novelty", severity: "warn", message: `무료 미리보기에 이미 있던 말과 겹치지 않는 문단이 ${pc(metrics.novelty)}입니다 (기준 ${pc(T.noveltyWarn)} 이상) — 새로 알게 되는 내용이 부족할 수 있습니다.` });
  if (metrics.scoreNumbers.length) flags.push({ id: "score-numbers", severity: "warn", message: `응답 환산값을 숫자(점 · 백분위)로 쓴 곳이 ${metrics.scoreNumbers.length}곳 있습니다 — 방향과 정도로 씁니다.` });
  for (const k of Object.keys(promises) as (keyof DepthPromises)[]) if (!promises[k]) flags.push({ id: `promise-${k}`, severity: "fail", message: `무료에서 약속한 "${PROMISE_LABEL[k]}"에 해당하는 내용이 확인되지 않습니다.` });

  return { metrics, promises, flags, pass: !flags.some((f) => f.severity === "fail") };
}

/** 두 사람의 리포트가 얼마나 같은 말인가 — A의 문단 중 B의 어느 문단과 거의 같은 것의 몫 (0~1). 이름을 가려도 이 사람의 이야기로 읽히려면 낮아야 한다 */
export function crossPersonOverlap(a: ReportDraftV2, b: ReportDraftV2, threshold = 0.5): number {
  const A = bodyOf(a);
  const B = bodyOf(b).map((x) => shingles(x.text));
  if (!A.length) return 0;
  let n = 0;
  for (const p of A) {
    const s = shingles(p.text);
    if (B.some((x) => containment(s, x) >= threshold)) n++;
  }
  return n / A.length;
}
