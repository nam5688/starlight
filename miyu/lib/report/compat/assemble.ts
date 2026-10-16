// 사주 궁합 리포트 조립 — AI가 쓴 본문(CompatDraftV1)에 코드가 계산한 부분(커플 유형 · 궁합 지수 · 계산 재료 · 안내)을 더해 저장 형식(CompatReport)으로 만든다.
// 요약은 무료 간단 궁합이 쓰는 같은 함수(cardOf)로 같은 결과에서 만들어, 무료에서 본 커플 유형 · 지수와 유료 풀이의 위쪽이 어긋나지 않는다.
// 본문의 "A님 · B님"은 이때 실제 이름(또는 "나 · 상대")으로 바꿔 넣는다. 이름 · 생년월일 원문은 AI에 보내지 않았다.
import { cardOf } from "../../compat/simple.ts";
import type { CompatResult } from "../../saju/interpret/compat.ts";
import { COMPAT_NOTES, COMPAT_PROMPT_VERSION, COMPAT_REPORT_KIND, COMPAT_SECTIONS, COMPAT_TIMING_BUILT } from "./plan.ts";
import type { CompatDraftV1, CompatReport } from "./types.ts";

export type CompatAssembleMeta = { provider: string; model: string; at: string; placeholder?: boolean };

/** 본문의 두 사람 이름 자리를 실제 이름으로 — 이름 뒤의 " 님"은 띄어 쓴다 */
export function nameText(text: string, names: { a: string; b: string }): string {
  return text.replace(/A님/g, `${names.a} 님`).replace(/B님/g, `${names.b} 님`);
}

export function assembleCompatReport(draft: CompatDraftV1, result: CompatResult, names: { a: string; b: string }, meta: CompatAssembleMeta): CompatReport {
  const card = cardOf(result, names);
  const n = (t: string) => nameText(t, names);
  return {
    kind: COMPAT_REPORT_KIND,
    ruleVersion: result.version,
    promptVersion: COMPAT_PROMPT_VERSION,
    names,
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
    sections: COMPAT_SECTIONS.map((plan) => {
      const s = draft.sections.find((x) => x.id === plan.id)!;
      return { id: plan.id, topic: plan.topic, headline: n(s.headline), paragraphs: s.paragraphs.map(n) };
    }),
    actions: draft.actions.map((a) => ({ title: n(a.title), detail: n(a.detail), area: a.area })),
    notes: {
      cautions: card.cautions,
      items: [COMPAT_NOTES.noResponses, ...(COMPAT_TIMING_BUILT ? [] : [COMPAT_NOTES.timing]), COMPAT_NOTES.noInnerMind, COMPAT_NOTES.rule],
      page: COMPAT_NOTES.page,
    },
    ...(meta.placeholder ? { placeholder: true as const } : {}),
    generated: { provider: meta.provider, model: meta.model, at: meta.at },
  };
}
