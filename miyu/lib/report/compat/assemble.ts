// 사주 궁합 리포트 조립 — AI가 쓴 본문(CompatDraftV1)에 코드가 계산한 부분(커플 유형 · 궁합 지수 · 계산 재료 · 안내)을 더해 저장 형식(CompatReport)으로 만든다.
// 요약은 무료 간단 궁합이 쓰는 같은 함수(cardOf)로 같은 결과에서 만들어, 무료에서 본 커플 유형 · 지수와 유료 풀이의 위쪽이 어긋나지 않는다.
// 본문의 "A님 · B님"은 이때 실제 이름(또는 "나 · 상대")으로 바꿔 넣는다. 이름 · 생년월일 원문은 AI에 보내지 않았다.
// 시기는 5번 장(love)이 시기 근거(compat.timing.*)를 인용했을 때만 쓴 것으로 보고, 안내는 시기를 쓴 경우 / 쓰지 못한 경우를 나눠 코드가 채운다. 가족 · 자녀 인연은 계산하지 않았다는 안내도 코드가 붙인다.
import { RELATION_FRAME_NOTE, type CompatRelationship } from "../../compat/relationship.ts";
import { cardOf } from "../../compat/simple.ts";
import type { CompatResult } from "../../saju/interpret/compat.ts";
import { COMPAT_NOTES, COMPAT_PROMPT_VERSION, COMPAT_REPORT_KIND, COMPAT_SECTIONS, COMPAT_STEP_GROUPS, PAIR_NOTES, PAIR_PROMPT_VERSION, PAIR_REPORT_KIND, PAIR_SECTIONS, topicFor } from "./plan.ts";
import type { CompatDraftV1, CompatReport, CompatStep, PairReport } from "./types.ts";

export type CompatAssembleMeta = { provider: string; model: string; at: string; placeholder?: boolean };

/** 본문의 두 사람 이름 자리를 실제 이름으로 — 이름 뒤의 " 님"은 띄어 쓴다 */
export function nameText(text: string, names: { a: string; b: string }): string {
  return text.replace(/A님/g, `${names.a} 님`).replace(/B님/g, `${names.b} 님`);
}

/** 5번 장(연애와 결혼 궁합)이 시기 근거(compat.timing.*)를 인용했는가 — 시기 문단을 쓴 것으로 본다 */
const usedTiming = (draft: CompatDraftV1): boolean => draft.sections.some((s) => s.id === "love" && s.evidence.some((id) => id.startsWith("compat.timing.")));

/** 사이를 알려 준 글에만 붙는 안내 — 사이가 읽는 관점만 바꿨고 점수 · 사주 계산은 그대로라는 것 */
const relationItems = (rel: CompatRelationship | null | undefined): string[] => (rel ? [RELATION_FRAME_NOTE] : []);

export function assembleCompatReport(draft: CompatDraftV1, result: CompatResult, names: { a: string; b: string }, meta: CompatAssembleMeta, relationship?: CompatRelationship | null): CompatReport {
  const card = cardOf(result, names);
  const n = (t: string) => nameText(t, names);
  const sections = COMPAT_SECTIONS.flatMap((plan) => {
    const s = draft.sections.find((x) => x.id === plan.id);
    return s ? [{ id: plan.id, topic: topicFor(plan, relationship), headline: n(s.headline), paragraphs: s.paragraphs.map(n) }] : [];
  });
  const hasTiming = usedTiming(draft);
  const steps = Object.fromEntries(
    COMPAT_STEP_GROUPS.map((g) => [g.id, draft.steps[g.id].map((a): CompatStep => ({ title: n(a.title), detail: n(a.detail), say: n(a.say) }))]),
  ) as CompatReport["steps"];
  return {
    kind: COMPAT_REPORT_KIND,
    ruleVersion: result.version,
    promptVersion: COMPAT_PROMPT_VERSION,
    names,
    ...(relationship ? { relationship } : {}),
    summary: {
      typeName: card.typeName,
      typeLine: card.typeLine,
      score: card.score,
      scoreMeaning: card.scoreMeaning,
      core: card.core,
      scoreBasis: card.notes.scoreBasis,
      scoreNotProbability: card.notes.scoreNotProbability,
      parts: card.basis,
    },
    headline: n(draft.headline),
    sections,
    steps,
    questions: draft.questions.map(n),
    notes: {
      cautions: card.cautions,
      items: [COMPAT_NOTES.noResponses, hasTiming ? COMPAT_NOTES.timingUsed : COMPAT_NOTES.timingMissing, COMPAT_NOTES.noFamilyChild, COMPAT_NOTES.noInnerMind, ...relationItems(relationship), COMPAT_NOTES.rule],
      page: COMPAT_NOTES.page,
    },
    ...(meta.placeholder ? { placeholder: true as const } : {}),
    generated: { provider: meta.provider, model: meta.model, at: meta.at },
  };
}

/**
 * 리포트 궁합 조립 — 위쪽 요약은 사주 궁합 · 간단 궁합과 같은 함수(cardOf)로 같은 엔진 결과에서 채워 세 가지가 어긋나지 않는다.
 * 본문의 "A님 · B님"은 **바꾸지 않는다**(저장되는 글에는 이름 · 생년월일이 없다 — 화면이 읽는 사람에게 누가 누구인지 알려 준다).
 * 비교한 응답 영역은 이름과 개수만 담고 점수 · 원래 답은 담지 않는다.
 */
export function assemblePairReport(draft: CompatDraftV1, result: CompatResult, compared: { labels: string[]; skipped: number; /** 두 사람의 성향 질문 버전이 달라 응답 비교를 하지 않았다 */ versionMismatch?: boolean }, meta: CompatAssembleMeta, relationship?: CompatRelationship | null): PairReport {
  const card = cardOf(result, { a: "A님", b: "B님" });
  const sections = PAIR_SECTIONS.flatMap((plan) => {
    const s = draft.sections.find((x) => x.id === plan.id);
    return s ? [{ id: plan.id, topic: topicFor(plan, relationship), headline: s.headline, paragraphs: [...s.paragraphs] }] : [];
  });
  const hasTiming = usedTiming(draft);
  const steps = Object.fromEntries(COMPAT_STEP_GROUPS.map((g) => [g.id, draft.steps[g.id].map((a): CompatStep => ({ title: a.title, detail: a.detail, say: a.say }))])) as PairReport["steps"];
  return {
    kind: PAIR_REPORT_KIND,
    ruleVersion: result.version,
    promptVersion: PAIR_PROMPT_VERSION,
    ...(relationship ? { relationship } : {}),
    summary: {
      typeName: card.typeName,
      typeLine: card.typeLine,
      score: card.score,
      scoreMeaning: card.scoreMeaning,
      core: card.core,
      scoreBasis: card.notes.scoreBasis,
      scoreNotProbability: card.notes.scoreNotProbability,
      parts: card.basis,
    },
    headline: draft.headline,
    sections,
    steps,
    questions: [...draft.questions],
    response: { comparedLabels: [...compared.labels], skipped: compared.skipped },
    notes: {
      cautions: card.cautions,
      items: [
        PAIR_NOTES.privacy,
        compared.versionMismatch ? PAIR_NOTES.versionMismatch : compared.labels.length === 0 ? PAIR_NOTES.noCompared : compared.skipped > 0 ? PAIR_NOTES.skipped : "",
        hasTiming ? COMPAT_NOTES.timingUsed : COMPAT_NOTES.timingMissing,
        COMPAT_NOTES.noFamilyChild,
        COMPAT_NOTES.noInnerMind,
        ...relationItems(relationship),
        COMPAT_NOTES.rule,
      ].filter((t) => t.length > 0),
      page: PAIR_NOTES.page,
    },
    ...(meta.placeholder ? { placeholder: true as const } : {}),
    generated: { provider: meta.provider, model: meta.model, at: meta.at },
  };
}
