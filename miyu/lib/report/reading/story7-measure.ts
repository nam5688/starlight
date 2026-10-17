// 7개 대주제 초안(story7-plan.ts)과 지금 story-v1(영역 셋)의 **구조적 반복 압력**을 같은 방식으로 센다 — 순수 계산, AI 호출 없음.
// 센 것: 응답 근거(survey · self)를 장에 나눌 때 장마다 몇 개를 가져가는지 · 근거가 모자라 다른 장의 근거를 **빌려 써야 하는** 수(= 같은 근거를 두 장에서 다시 쓰게 되는 수).
// 지금 story-v1의 배정 함수(`personalEvidenceFor`)와 같은 알고리즘이며(시험이 같은 결과를 내는지 확인), 7개 대주제에는 같은 규칙을 그대로 적용한다.
// 한계: 이것은 글이 아니라 **근거 배분**의 어림이다 — 근거를 빌려 쓰면 반드시 반복이라는 뜻이 아니고, 빌리지 않아도 같은 낱말로 번질 수 있으며(모티프), 글에서 실제로 줄었는지는 글을 쓴 뒤 같은 검사(repeat · motif)로 비교해야 한다.
import type { Evidence, Topic } from "../evidence.ts";
import { findRepeatedPhrasesIn } from "./repeat.ts";
import { COMMON_STEMS } from "./story-motif.ts";
import { MONEY_WORDS, PERIOD_TALK, STORY_AREAS } from "./story-plan.ts";
import { visibleStoryTexts } from "./story-validate.ts";
import { countSentences } from "./validate.ts";
import { STORY7_SECTIONS, type Story7Section } from "./story7-plan.ts";
import type { StoryDraftV1 } from "./types.ts";

export type Slot = { key: string; prefer: RegExp; personalTopics: Topic[]; borrowTopics: Topic[]; personalMin: number };

export const slotsOfAreas = (): Slot[] => STORY_AREAS.map((a) => ({ key: a.id, prefer: a.prefer, personalTopics: a.personalTopics, borrowTopics: a.personalTopics, personalMin: a.personalMin }));
export const slotsOf7 = (sections: Story7Section[] = STORY7_SECTIONS): Slot[] =>
  sections.map((s) => ({ key: String(s.no), prefer: s.prefer, personalTopics: s.personalTopics, borrowTopics: s.borrowTopics, personalMin: s.personalMin }));

export type Assignment = {
  owned: Record<string, string[]>;
  borrowed: Record<string, string[]>;
  /** 입력한 MBTI를 쓸 수 있는 장 */
  mbti: string[];
};

/** `story-prompt.ts`의 `personalEvidenceFor`와 같은 배정 — 소유(owned) · 빌림(borrowed)을 나눠 돌려준다 */
export function assignPersonal(evidence: Evidence[], slots: Slot[]): Assignment {
  const personal = evidence.filter((e) => (e.source === "survey" || e.source === "self") && !e.uncertain);
  const matches = (e: Evidence, topics: Topic[]) => e.topics.some((t) => topics.includes(t));
  const owned: Record<string, string[]> = Object.fromEntries(slots.map((s) => [s.key, [] as string[]]));
  const borrowed: Record<string, string[]> = Object.fromEntries(slots.map((s) => [s.key, [] as string[]]));
  const candidates = (e: Evidence) => {
    const preferred = slots.filter((s) => matches(e, s.personalTopics) && s.prefer.test(e.id)).map((s) => s.key);
    return preferred.length > 0 ? preferred : slots.filter((s) => matches(e, s.personalTopics)).map((s) => s.key);
  };
  const rest = personal.filter((e) => e.id !== "self.mbti").map((e) => ({ e, cand: candidates(e) })).filter((x) => x.cand.length > 0);
  rest.sort((x, y) => x.cand.length - y.cand.length);
  for (const { e, cand } of rest) {
    const pick = cand.reduce((best, key) => (owned[key].length < owned[best].length ? key : best), cand[0]);
    owned[pick].push(e.id);
  }
  for (const s of slots) {
    const own = owned[s.key].length;
    if (own >= s.personalMin) continue;
    const borrow = personal.filter((e) => e.id !== "self.mbti" && matches(e, s.borrowTopics) && !owned[s.key].includes(e.id)).slice(0, s.personalMin - own);
    borrowed[s.key].push(...borrow.map((e) => e.id));
  }
  const mbtiEvidence = personal.find((e) => e.id === "self.mbti");
  const mbti = mbtiEvidence ? slots.filter((s) => matches(mbtiEvidence, [...s.personalTopics, ...s.borrowTopics])).map((s) => s.key) : [];
  return { owned, borrowed, mbti };
}

export type LayoutMeasure = {
  /** 응답 근거 개수(MBTI · 불확실 제외) */
  pool: number;
  /** 모든 장의 최소 요구 합 */
  need: number;
  perSlot: { key: string; owned: number; borrowed: number; min: number; unmet: number }[];
  /** 다른 장에도 있는 근거를 다시 써야 하는 수 */
  borrowTotal: number;
  /** 최소 요구를 빌려서도 못 채운 장 수 */
  unmetSlots: number;
  /** 소유한 근거가 하나도 없어 빌려야만 하는 장 수(최소 요구가 있는 장 중) */
  starvedSlots: number;
  mbtiEligible: number;
};

export function measureLayout(evidence: Evidence[], slots: Slot[]): LayoutMeasure {
  const a = assignPersonal(evidence, slots);
  const pool = evidence.filter((e) => (e.source === "survey" || e.source === "self") && !e.uncertain && e.id !== "self.mbti").length;
  const perSlot = slots.map((s) => {
    const owned = a.owned[s.key].length;
    const borrowed = a.borrowed[s.key].length;
    return { key: s.key, owned, borrowed, min: s.personalMin, unmet: Math.max(0, s.personalMin - owned - borrowed) };
  });
  return {
    pool,
    need: slots.reduce((n, s) => n + s.personalMin, 0),
    perSlot,
    borrowTotal: perSlot.reduce((n, p) => n + p.borrowed, 0),
    unmetSlots: perSlot.filter((p) => p.unmet > 0).length,
    starvedSlots: perSlot.filter((p) => p.min > 0 && p.owned === 0).length,
    mbtiEligible: a.mbti.length,
  };
}

/** 7개 대주제 가운데 사주 근거를 소유하는 장이 자기 근거를 몇 개 갖는가 — 0이면 그 사람의 그 장은 사주 근거 없이 써야 한다 */
export function sajuCoverage(evidence: Evidence[], sections: Story7Section[] = STORY7_SECTIONS): { no: number; count: number }[] {
  const saju = evidence.filter((e) => e.source === "saju" && !e.uncertain);
  return sections.filter((s) => s.sajuOwns.length > 0).map((s) => ({ no: s.no, count: saju.filter((e) => s.sajuOwns.some((re) => re.test(e.id))).length }));
}

/** 근거 하나를 "소유"하는 대주제 번호(사주는 sajuOwns, 응답은 prefer + 주제) — 소유자가 둘 이상이면 처음부터 겹치는 근거다 */
export function owners7(e: Evidence, sections: Story7Section[] = STORY7_SECTIONS): number[] {
  if (e.source === "saju") return sections.filter((s) => s.sajuOwns.some((re) => re.test(e.id))).map((s) => s.no);
  return sections.filter((s) => s.prefer.test(e.id) && e.topics.some((t) => s.personalTopics.includes(t))).map((s) => s.no);
}

// ── 글 수준 비교(대리 작성기로 쓴 글 두 구조를 같은 지표로) ──

/** 글 조각: block은 비교 단위(영역 · 장), where는 조각 위치(repeat.ts가 쓴다) */
export type TextPiece = { block: string; where: string; text: string };

/** story-v1 초안의 화면 글을 영역 단위로 나눈다 — 고민(focus)은 7개 대주제 입력에서도 뺐으므로 비교에서 뺀다(입력에서도 고민을 뺐다) */
export function piecesOfStoryV1(d: StoryDraftV1): TextPiece[] {
  return visibleStoryTexts({ ...d, focus: undefined }).map((t) => {
    const m = /^areas\.([\w-]+)\./.exec(t.where);
    const block = t.where === "headline" || t.where.startsWith("cards.") ? "head" : m ? m[1] : t.where.startsWith("flow") ? "flow" : t.where.startsWith("actions") ? "actions" : t.where;
    return { block, where: t.where, text: t.text };
  });
}

export type Story7Section_ = { no: number; headline: string; paragraphs?: string[]; parts?: { title: string; paragraphs: string[] }[]; evidence: string[] };
export type Story7Draft = { headline: string; sections: Story7Section_[]; actions: { title: string; detail: string; evidence: string[] }[] };

/** 대주제 글의 문단들 — 소제목이 있는 장(5번)은 소제목별 문단을 이어서 */
export const paragraphsOfSection = (s: Story7Section_): string[] => (s.parts ? s.parts.flatMap((p) => p.paragraphs) : (s.paragraphs ?? []));

/** 7개 대주제 초안의 화면 글 — 7번 장의 actions는 7번 장에 넣는다 */
export function piecesOfStory7(d: Story7Draft): TextPiece[] {
  const out: TextPiece[] = [{ block: "head", where: "headline", text: d.headline }];
  for (const s of d.sections) {
    const b = `s${s.no}`;
    out.push({ block: b, where: `${b}.headline`, text: s.headline });
    if (s.parts) {
      s.parts.forEach((part, k) => part.paragraphs.forEach((p, i) => out.push({ block: b, where: `${b}.part${k}.p${i}`, text: p })));
    } else (s.paragraphs ?? []).forEach((p, i) => out.push({ block: b, where: `${b}.p${i}`, text: p }));
  }
  d.actions.forEach((a, i) => {
    out.push({ block: "s7", where: `s7.actions.${i}.title`, text: a.title });
    out.push({ block: "s7", where: `s7.actions.${i}.detail`, text: a.detail });
  });
  return out;
}

const contentStems = (text: string): Set<string> => {
  const out = new Set<string>();
  for (const w of text.match(/[가-힣]{2,}/g) ?? []) {
    const s = w.slice(0, 2);
    if (!COMMON_STEMS.has(s)) out.add(s);
  }
  return out;
};

export type TextRepetition = {
  blocks: number;
  chars: number;
  /** 서로 다른 두 글 조각에 12자 이상 같은 토막이 있는 쌍 수(repeat.ts) */
  repeatedPhrases: number;
  /** 가장 많은 블록에 걸친 낱말(앞 두 글자) 상위 — 블록 수 · 횟수 */
  topStems: { stem: string; blocks: number; total: number }[];
  /** 블록 쌍마다 낱말 겹침(더 작은 쪽 낱말 중 다른 쪽에도 있는 몫)의 평균과 최대 — 말을 바꿔 되풀이한 글도 어느 정도 잡히지만 같은 주제를 쓰면 높아지기도 하는 어림 */
  pairOverlapMean: number;
  pairOverlapMax: { a: string; b: string; value: number };
};

export function textRepetition(pieces: TextPiece[]): TextRepetition {
  const blocks = [...new Set(pieces.map((p) => p.block))];
  const byBlock = new Map(blocks.map((b) => [b, pieces.filter((p) => p.block === b).map((p) => p.text).join(" ")]));
  const stems = new Map<string, { blocks: Set<string>; total: number }>();
  for (const p of pieces) {
    for (const w of p.text.match(/[가-힣]{2,}/g) ?? []) {
      const s = w.slice(0, 2);
      if (COMMON_STEMS.has(s)) continue;
      const e = stems.get(s) ?? { blocks: new Set<string>(), total: 0 };
      e.blocks.add(p.block);
      e.total++;
      stems.set(s, e);
    }
  }
  const topStems = [...stems].filter(([, e]) => e.total >= 5).sort((a, b) => b[1].blocks.size - a[1].blocks.size || b[1].total - a[1].total).slice(0, 5).map(([stem, e]) => ({ stem, blocks: e.blocks.size, total: e.total }));
  const sets = blocks.map((b) => contentStems(byBlock.get(b) ?? ""));
  let sum = 0;
  let n = 0;
  let max = { a: "", b: "", value: 0 };
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const small = sets[i].size <= sets[j].size ? sets[i] : sets[j];
      const large = small === sets[i] ? sets[j] : sets[i];
      if (small.size < 8) continue;
      const v = [...small].filter((s) => large.has(s)).length / small.size;
      sum += v;
      n++;
      if (v > max.value) max = { a: blocks[i], b: blocks[j], value: v };
    }
  }
  return {
    blocks: blocks.length,
    chars: pieces.reduce((c, p) => c + p.text.length, 0),
    repeatedPhrases: findRepeatedPhrasesIn(pieces.map((p) => ({ where: p.where, text: p.text }))).length,
    topStems,
    pairOverlapMean: n ? sum / n : 0,
    pairOverlapMax: max,
  };
}

/**
 * 7개 대주제 글의 최소 형식 점검 — 제품 검사(story-validate)가 아니다. 7개 대주제 구조에는 제품 검사가 없으므로 지시문이 정한 한도(장 수 · 문단 수 · 글자 수 · 문장 수 · 시기 이야기는 6번 장에만)와
 * 근거 ID가 실제 목록에 있는지만 본다. 통과가 좋은 글이라는 뜻이 아니고, 걸린 것은 글을 고치지 않고 그대로 보고한다(한 번 쓴 글을 비교한다).
 */
export function checkStory7Format(raw: unknown, evidence: Evidence[]): string[] {
  const errors: string[] = [];
  const d = raw as Partial<Story7Draft> | null;
  if (!d || !Array.isArray(d.sections)) return ["sections 배열이 없다"];
  const ids = new Set(evidence.map((e) => e.id));
  if (d.sections.length !== 7) errors.push(`대주제가 ${d.sections.length}개다(7개여야 한다)`);
  d.sections.forEach((s, i) => {
    const sec = STORY7_SECTIONS[i];
    if (!sec || s.no !== sec.no) {
      errors.push(`${i + 1}번째 대주제의 no가 ${s?.no}다`);
      return;
    }
    const label = `${sec.no} ${sec.title}`;
    const paragraphs = paragraphsOfSection(s);
    if (sec.parts) {
      const titles = (s.parts ?? []).map((p) => p.title);
      if (JSON.stringify(titles) !== JSON.stringify(sec.parts)) errors.push(`${label}: 소제목이 ${JSON.stringify(titles)}다(${JSON.stringify(sec.parts)}여야 한다)`);
    }
    if (paragraphs.length < 1 || paragraphs.length > sec.maxParagraphs) errors.push(`${label}: 문단이 ${paragraphs.length}개(1~${sec.maxParagraphs})`);
    if (s.headline.length < 8 || s.headline.length > 34) errors.push(`${label}: 제목 ${s.headline.length}자(8~34)`);
    paragraphs.forEach((p, k) => {
      if (p.length < 60 || p.length > 380) errors.push(`${label} 문단 ${k + 1}: ${p.length}자(60~380)`);
      const n = countSentences(p);
      if (n > 3) errors.push(`${label} 문단 ${k + 1}: ${n}문장(3 이하)`);
      if (sec.no !== 6 && PERIOD_TALK.test(p)) errors.push(`${label} 문단 ${k + 1}: 6번 장 밖에서 시기를 말한다`);
    });
    for (const id of s.evidence ?? []) if (!ids.has(id)) errors.push(`${label}: 없는 근거 ID ${id}`);
    if (sec.no === 5) {
      const money = (s.parts ?? []).find((p) => p.title === "재물");
      if (!money || !money.paragraphs.some((p) => MONEY_WORDS.test(p))) errors.push(`${label}: 재물 소제목에 돈 이야기가 없다`);
    }
  });
  if (!Array.isArray(d.actions) || d.actions.length < 2 || d.actions.length > 3) errors.push(`actions가 ${d.actions?.length ?? 0}개다(2~3개여야 한다)`);
  return errors;
}

/** 저장된 story-v1 글에서 근거 ID가 어느 영역에 달렸는지 — 두 영역 이상에 인용된 근거를 찾는다(행동 칸은 따로 센다) */
export function citationAreas(draft: StoryDraftV1): Map<string, { areas: string[]; actions: number }> {
  const out = new Map<string, { areas: string[]; actions: number }>();
  const at = (id: string) => out.get(id) ?? out.set(id, { areas: [], actions: 0 }).get(id)!;
  for (const a of draft.areas) for (const id of a.evidence) at(id).areas.push(a.id);
  for (const id of draft.flow.evidence) at(id).areas.push("flow");
  for (const a of draft.actions) for (const id of a.evidence) at(id).actions++;
  return out;
}
