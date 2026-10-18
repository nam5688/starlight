// 궁합 실제 AI 글 검토 지표 — 순수 계산(AI 미사용). 실제 AI가 쓴 사주 궁합 · 리포트 궁합 글을 사람이 읽기 전에 **수치로 볼 수 있는 것**만 센다.
// 운영자 지시(2026-10-17): 반복 문장 · 각 장의 새로운 정보량 · 명리 근거 · 성격 · 기질 · 애착 반영 · 없는 사건 단정 · 실용적인 조언 · 유료 상품으로서의 만족도를 본다.
// 이 중 만족도 · 말을 바꿔 되풀이한 문장 · 근거를 제대로 해석했는가는 낱말로 셀 수 없다 — 이 지표는 읽기 전의 보조이고 합격 판정이 아니다(docs/real-ai-evaluation-rubric.md).
import type { Evidence } from "../evidence.ts";
import { findRepeatedPhrasesIn } from "../reading/repeat.ts";
import { echoedMeaningsIn, repeatedOpeners, unfoundedEventIn, validateCompatDraft } from "./validate.ts";

export type LiveReviewShape = {
  headline: string;
  sections: { id: string; headline: string; paragraphs: string[]; evidence?: string[] }[];
  steps: Record<string, { title: string; detail: string; say: string; evidence?: string[] }[]>;
};

export type SectionMetric = { id: string; paragraphs: number; chars: number; /** 다른 영역 · 행동에 없는 낱말 짝의 몫(0~1) — 낮을수록 같은 말의 되풀이 */ novelty: number; evidence: string[] };

export type LiveReview = {
  chars: number;
  sections: SectionMetric[];
  /** 영역 · 행동 사이에 12자 이상 같은 구절이 되풀이된 곳 */
  repeatedPhrases: { phrase: string; where: [string, string] }[];
  /** 같은 다섯 글자로 여는 문단 */
  repeatedOpeners: { opener: string; count: number }[];
  /** 영역끼리 낱말 짝이 가장 많이 겹친 두 영역(겹침 0~1) */
  maxSectionOverlap: { a: string; b: string; overlap: number } | null;
  /** 입력받지 않은 사건을 사실처럼 쓴 문장 */
  eventAssertions: { where: string; text: string }[];
  /** 근거의 응답 풀이 문구를 그대로 옮긴 곳(리포트 궁합) */
  meaningEchoes: { where: string; run: string }[];
  /** 근거 사용 — 글이 인용한 근거 ID 수 · 한 근거를 여러 영역이 쓴 수 · (리포트 궁합) 비교한 응답 근거 중 한 번도 인용하지 않은 것 */
  evidence: { distinctCited: number; reusedAcrossSections: string[]; pairUncited: string[]; pairCitedSections: number } | null;
  steps: { perGroup: Record<string, number>; withoutSay: number; withoutEvidence: number; /** A님 → B님과 B님 → A님 행동의 낱말 짝이 겹친 몫(높으면 같은 조언을 둘에게 한 것) */ aToBvsBToAOverlap: number | null; duplicateSays: number };
  /** 제품 검사(validateCompatDraft)가 지금 이 글에 내는 BLOCK 오류 — 실제 AI 글이 저장되려면 비어 있어야 한다 */
  productCheckErrors: string[] | null;
  /** 같은 검사의 경고(WARN: 설명 없는 용어 · 용어 개수 · 문단 문장 수) — 저장을 막지 않고 자동 재작성도 하지 않는다(운영자 정책 2026-10-17) */
  productCheckWarnings: string[] | null;
};

const words = (t: string) => t.replace(/["'“”‘’.,·!?()\[\]]/g, " ").split(/\s+/).filter(Boolean);
const bigrams = (t: string): Set<string> => {
  const w = words(t);
  const out = new Set<string>();
  for (let i = 0; i + 1 < w.length; i++) out.add(`${w[i]} ${w[i + 1]}`);
  return out;
};
const union = (sets: Set<string>[]) => new Set(sets.flatMap((s) => [...s]));
const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((x) => b.has(x)).length;
  const un = new Set([...a, ...b]).size;
  return un === 0 ? 0 : inter / un;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

export function reviewLive(shape: LiveReviewShape, opts: { evidence?: Evidence[]; pair?: boolean } = {}): LiveReview {
  const texts: { where: string; text: string }[] = [{ where: "headline", text: shape.headline }];
  for (const s of shape.sections) {
    texts.push({ where: `sections.${s.id}.headline`, text: s.headline });
    s.paragraphs.forEach((p, i) => texts.push({ where: `sections.${s.id}.paragraphs[${i}]`, text: p }));
  }
  const groupIds = Object.keys(shape.steps);
  const stepTexts = (g: string) => (shape.steps[g] ?? []).map((a) => `${a.title} ${a.detail} ${a.say}`);
  for (const g of groupIds) stepTexts(g).forEach((t, i) => texts.push({ where: `steps.${g}[${i}]`, text: t }));

  // 영역별 새로운 정보량 — 그 영역의 낱말 짝 중 다른 영역 · 행동 어디에도 없는 몫
  const sectionSets = shape.sections.map((s) => bigrams(s.paragraphs.join(" ")));
  const stepSet = union(groupIds.flatMap((g) => stepTexts(g).map(bigrams)));
  const sections: SectionMetric[] = shape.sections.map((s, i) => {
    const mine = sectionSets[i]!;
    const others = union([...sectionSets.filter((_, j) => j !== i), stepSet]);
    const fresh = [...mine].filter((x) => !others.has(x)).length;
    return { id: s.id, paragraphs: s.paragraphs.length, chars: s.paragraphs.join("").length, novelty: mine.size === 0 ? 0 : r2(fresh / mine.size), evidence: s.evidence ?? [] };
  });
  let maxOverlap: LiveReview["maxSectionOverlap"] = null;
  for (let i = 0; i < shape.sections.length; i++)
    for (let j = i + 1; j < shape.sections.length; j++) {
      const o = r2(jaccard(sectionSets[i]!, sectionSets[j]!));
      if (!maxOverlap || o > maxOverlap.overlap) maxOverlap = { a: shape.sections[i]!.id, b: shape.sections[j]!.id, overlap: o };
    }

  const eventAssertions = texts.flatMap((t) => {
    const hit = unfoundedEventIn(t.text);
    return hit ? [{ where: t.where, text: hit }] : [];
  });
  const meaningEchoes = opts.pair && opts.evidence ? echoedMeaningsIn(texts, opts.evidence) : [];

  // 근거 사용(글이 근거 ID를 달고 있을 때만)
  const hasIds = shape.sections.some((s) => s.evidence && s.evidence.length > 0);
  let evidence: LiveReview["evidence"] = null;
  if (hasIds) {
    const use = new Map<string, Set<string>>();
    for (const s of shape.sections) for (const id of new Set(s.evidence ?? [])) use.set(id, (use.get(id) ?? new Set()).add(s.id));
    for (const g of groupIds) for (const a of shape.steps[g] ?? []) for (const id of new Set(a.evidence ?? [])) use.set(id, (use.get(id) ?? new Set()).add(`steps.${g}`));
    const pairIds = (opts.evidence ?? []).map((e) => e.id).filter((id) => id.startsWith("pair.") && id !== "pair.mbti");
    const pairCitedSections = new Set(shape.sections.filter((s) => (s.evidence ?? []).some((id) => pairIds.includes(id))).map((s) => s.id)).size;
    evidence = {
      distinctCited: use.size,
      reusedAcrossSections: [...use].filter(([, where]) => [...where].filter((w) => !w.startsWith("steps.")).length > 1).map(([id]) => id),
      pairUncited: pairIds.filter((id) => !use.has(id)),
      pairCitedSections,
    };
  }

  const aToB = stepTexts("aToB");
  const bToA = stepTexts("bToA");
  const says = groupIds.flatMap((g) => (shape.steps[g] ?? []).map((a) => a.say.trim()));
  const steps: LiveReview["steps"] = {
    perGroup: Object.fromEntries(groupIds.map((g) => [g, (shape.steps[g] ?? []).length])),
    withoutSay: groupIds.flatMap((g) => shape.steps[g] ?? []).filter((a) => !a.say?.trim()).length,
    withoutEvidence: hasIds ? groupIds.flatMap((g) => shape.steps[g] ?? []).filter((a) => !(a.evidence && a.evidence.length > 0)).length : 0,
    aToBvsBToAOverlap: aToB.length && bToA.length ? r2(jaccard(union(aToB.map(bigrams)), union(bToA.map(bigrams)))) : null,
    duplicateSays: says.length - new Set(says).size,
  };

  let productCheckErrors: string[] | null = null;
  let productCheckWarnings: string[] | null = null;
  if (opts.evidence && hasIds) {
    const v = validateCompatDraft(shape, opts.evidence, { pair: opts.pair === true });
    productCheckErrors = v.ok ? [] : v.errors;
    productCheckWarnings = v.warnings;
  }

  return {
    chars: texts.reduce((n, t) => n + t.text.length, 0),
    sections,
    repeatedPhrases: findRepeatedPhrasesIn(texts),
    repeatedOpeners: repeatedOpeners(texts),
    maxSectionOverlap: maxOverlap,
    eventAssertions,
    meaningEchoes,
    evidence,
    steps,
    productCheckErrors,
    productCheckWarnings,
  };
}

/** 사람이 읽기 쉬운 표 — scripts/review-live-result.ts가 찍는다 */
export function renderLiveReview(r: LiveReview): string {
  const L: string[] = [];
  L.push(`글자 수 약 ${r.chars.toLocaleString("ko-KR")}자`);
  L.push("", "| 영역 | 문단 | 글자 | 새 정보량(다른 곳에 없는 낱말 짝의 몫) | 인용한 근거 |", "| --- | --- | --- | --- | --- |");
  for (const s of r.sections) L.push(`| ${s.id} | ${s.paragraphs} | ${s.chars} | ${s.novelty} | ${s.evidence.join(", ") || "-"} |`);
  L.push("", `- 같은 구절 되풀이: ${r.repeatedPhrases.length}곳${r.repeatedPhrases.length ? ` — ${r.repeatedPhrases.slice(0, 5).map((p) => `"${p.phrase}"(${p.where.join(" ↔ ")})`).join(" · ")}` : ""}`);
  L.push(`- 같은 말로 여는 문단: ${r.repeatedOpeners.length}묶음${r.repeatedOpeners.length ? ` — ${r.repeatedOpeners.map((o) => `"${o.opener}…" ${o.count}개`).join(" · ")}` : ""}`);
  L.push(`- 영역끼리 가장 겹친 쌍: ${r.maxSectionOverlap ? `${r.maxSectionOverlap.a} ↔ ${r.maxSectionOverlap.b} (겹침 ${r.maxSectionOverlap.overlap})` : "-"}`);
  L.push(`- 입력받지 않은 사건을 사실처럼 쓴 문장: ${r.eventAssertions.length}곳${r.eventAssertions.length ? ` — ${r.eventAssertions.map((e) => `${e.where} "${e.text}"`).join(" · ")}` : ""}`);
  L.push(`- 응답 풀이 문구를 그대로 옮긴 곳: ${r.meaningEchoes.length}곳${r.meaningEchoes.length ? ` — ${r.meaningEchoes.map((e) => `${e.where} "${e.run}…"`).join(" · ")}` : ""}`);
  if (r.evidence) L.push(`- 근거: 서로 다른 근거 ${r.evidence.distinctCited}개 인용 · 여러 영역이 같이 쓴 근거 ${r.evidence.reusedAcrossSections.length}개${r.evidence.reusedAcrossSections.length ? `(${r.evidence.reusedAcrossSections.join(", ")})` : ""} · 비교한 응답 근거 중 인용하지 않은 것 ${r.evidence.pairUncited.length}개${r.evidence.pairUncited.length ? `(${r.evidence.pairUncited.join(", ")})` : ""} · 응답 근거를 인용한 영역 ${r.evidence.pairCitedSections}개`);
  L.push(`- 행동: ${Object.entries(r.steps.perGroup).map(([g, n]) => `${g} ${n}개`).join(" · ")} · 건넬 말 없음 ${r.steps.withoutSay} · 근거 없는 행동 ${r.steps.withoutEvidence} · 같은 건넬 말 ${r.steps.duplicateSays} · A님 → B님과 B님 → A님 행동의 겹침 ${r.steps.aToBvsBToAOverlap ?? "-"}`);
  L.push(`- 제품 검사(저장 기준): ${r.productCheckErrors === null ? "근거 ID가 없는 글이라 이 도구에서는 돌리지 않았어요" : r.productCheckErrors.length === 0 ? "BLOCK 없음(통과 — 판매 합격은 아님)" : `BLOCK ${r.productCheckErrors.length}건 — ${r.productCheckErrors.slice(0, 6).join(" / ")}`}`);
  if (r.productCheckWarnings && r.productCheckWarnings.length > 0) L.push(`- 경고(WARN ${r.productCheckWarnings.length}건 — 설명 없는 용어 · 용어 개수 · 문단 문장 수, 저장을 막지 않고 자동 재작성도 하지 않아요): ${r.productCheckWarnings.slice(0, 6).join(" / ")}`);
  return L.join("\n");
}
