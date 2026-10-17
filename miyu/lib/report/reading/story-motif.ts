// 영역별 이야기(story-v1) 보강 — 2026-10-17 실제 AI 첫 글(P01)에서 드러난 두 가지를 코드로 다룬다. 호출 없이 고친 사후 수정이며 새 글이 통과한다는 증거가 아니다.
//
// ① 한 낱말이 제목 · 카드 · 여러 영역 · 행동에 번지는 반복("정리"가 글 전체에 20번) — 같은 문장을 되풀이하지 않아도 한 모티프가 글을 끌고 가면 읽는 사람에게는 반복이다.
//    `findMotifSpread`는 형식 오류가 아니라 **고쳐 쓰기를 부탁하는 반복**(repeat.ts와 같은 갈래)이다: 첫 시도에서 걸리면 한 번 고쳐 쓰게 하고, 마지막 시도에서는 그대로 받는다(잘 쓴 글을 이 때문에 버리지 않는다).
// ② 문단이 문장 수 한도(3)를 한 문장만 넘어 글 전체를 버리게 된 일 — `normalizeStoryDraft`는 넘친 문단을 **문장은 한 글자도 바꾸지 않고 문단 나눔만** 둘 이상으로 나눈다(안전하게 나눌 수 있을 때만).
//
// 한계: ①은 낱말의 앞 두 글자를 센 어림이다(같은 뜻의 다른 낱말로 바꿔 되풀이한 글은 못 잡고, 흔한 말은 목록으로 뺀다). 좋은 글의 보증이 아니며 읽어 보는 평가가 따로 본다.
import { countSentences } from "./validate.ts";
import { STORY_AREAS, STORY_LIMITS as S } from "./story-plan.ts";
import type { StoryDraftV1 } from "./types.ts";

// ── ① 모티프 번짐 ──

/**
 * 뜻 없이 흔하게 쓰이는 말의 앞 두 글자 — 모티프로 세지 않는다. 실제 글 · 대리 작성기 글 일곱 편에서 많이 나온 말만 뺐다(조사 · 어미 · 이어 주는 말 · 영역 이름처럼 어느 글에나 있는 것).
 * "확인 · 꺼내 · 정리 · 혼자 · 다듬"처럼 한 사람의 특징을 이끌 수 있는 말은 뺀 것이 아니라 센다.
 */
export const COMMON_STEMS = new Set([
  "있어", "있는", "있을", "있고", "없어", "없는", "먼저", "마음", "사람", "쪽이", "쪽으", "보여", "함께", "시간", "모습", "방식", "자리", "이어", "쉬워", "쉬운", "반응", "결과", "시기", "때는", "때가", "이런", "그런", "그래", "그러", "어떤", "하나", "한번", "조금", "계속", "오래", "자신", "스스", "중요", "필요", "편해", "편이", "정도", "가까", "관계", "상황", "경우", "이야", "이렇", "그리", "그때", "다만", "또는", "더해", "나타", "읽혀", "읽힐", "생각", "느껴", "느낄", "해요", "하는", "하면", "하지", "돼요", "되는", "되기", "수도", "같은", "다른", "서로", "아니", "이번", "지금", "앞으", "뒤에", "나에", "내가", "님은", "너무", "가장", "특히", "항상", "힘이", "힘을", "힘은",
]);

/** 이 말이 제목 · 카드와 세 영역 이상(핵심 · 가까운 관계 · 일과 재물 · 시기 가운데)에 나오고 이만큼 이상 쓰이면 번졌다고 본다 */
export const MOTIF_SPREAD = { minTotal: 8, minAreas: 3 } as const;

export type MotifSpread = { stem: string; total: number; where: string[] };

const blockOf = (where: string): string => {
  if (where === "headline" || where.startsWith("cards.")) return "head";
  const m = /^areas\.([\w-]+)\./.exec(where);
  if (m) return m[1];
  if (where.startsWith("flow")) return "flow";
  if (where.startsWith("focus")) return "focus";
  if (where.startsWith("actions")) return "actions";
  return where;
};

/**
 * 화면 글(visibleStoryTexts)에서 한 낱말이 제목 · 카드와 여러 영역에 번졌는지 찾는다.
 * 7개 대주제(story-7)는 글 조각 위치의 이름이 달라 `blocks`로 위치를 장 이름("head"는 제목 · 카드)으로 바꾸는 방법과 센 장 목록을 넘긴다.
 */
export function findMotifSpread(texts: { where: string; text: string }[], blocks?: { of: (where: string) => string; main: string[] }): MotifSpread[] {
  const stems = new Map<string, { n: number; blocks: Set<string> }>();
  for (const { where, text } of texts) {
    const block = blocks ? blocks.of(where) : blockOf(where);
    for (const w of text.match(/[가-힣]{2,}/g) ?? []) {
      const s = w.slice(0, 2);
      if (COMMON_STEMS.has(s)) continue;
      const e = stems.get(s) ?? { n: 0, blocks: new Set<string>() };
      e.n++;
      e.blocks.add(block);
      stems.set(s, e);
    }
  }
  const main = blocks ? blocks.main : [...STORY_AREAS.map((a) => a.id as string), "flow"];
  const out: MotifSpread[] = [];
  for (const [stem, e] of stems) {
    const inAreas = main.filter((b) => e.blocks.has(b));
    if (e.blocks.has("head") && inAreas.length >= MOTIF_SPREAD.minAreas && e.n >= MOTIF_SPREAD.minTotal) out.push({ stem, total: e.n, where: ["head", ...inAreas] });
  }
  return out.sort((a, b) => b.total - a.total);
}

/** 고쳐 쓰기를 부탁할 때 모델에게 보여 줄 문장 — 글 내용이 아니라 번진 낱말과 횟수만 */
export function motifMessages(spreads: MotifSpread[], limit = 2): string[] {
  return spreads.slice(0, limit).map((m) => `‘${m.stem}…’ 계열 낱말이 제목 · 카드와 ${m.where.length - 1}개 영역에 모두 나와 모두 ${m.total}번 쓰였어요. 한 가지 모티프가 글 전체를 끌고 가면 영역마다 같은 이야기로 읽혀요 — 한 영역에서만 중심으로 쓰고, 다른 영역은 그 영역에서만 새로 알 수 있는 연결과 다른 낱말로 바꿔 주세요(제목 · 카드도 같은 낱말을 쓰지 않게).`);
}

// ── ② 문단 나눔 보정 ──

const QUOTE = /"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’/g;

/** 문장으로 나눈다 — `countSentences`와 같은 규칙(따옴표 안의 마침표는 나누지 않는다)이라 `splitSentences(t).length === countSentences(t)`다 */
export function splitSentences(t: string): string[] {
  const masked = t.replace(QUOTE, (q) => q.replace(/[.!?]/g, "·"));
  const out: string[] = [];
  const re = /(?<=[.!?])\s+/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    out.push(t.slice(start, m.index));
    start = m.index + m[0].length;
  }
  out.push(t.slice(start));
  return out.filter(Boolean);
}

/** 문장 n개를 한 문단 한도(max) 이하로 고르게 나눈 묶음 크기 — 4 → 2+2, 5 → 3+2, 7 → 3+2+2 */
export function chunkSizes(n: number, max: number): number[] {
  const k = Math.ceil(n / max);
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * 문장 수 한도를 넘은 문단을 문단 나눔만 바꿔 둘 이상으로 나눈다. 문장은 그대로이고 순서도 그대로다.
 * 나눈 조각이 문단 최소 글자 수에 못 미치거나 영역의 문단 수 상한을 넘기면 그 영역은 건드리지 않는다(검사가 이유를 알려 준다).
 * 입력은 바꾸지 않고(새 객체), 모양이 맞지 않으면 그대로 돌려준다.
 */
export function normalizeStoryDraft<T>(raw: T): T {
  const d = raw as Partial<StoryDraftV1> | null;
  if (!d || typeof d !== "object") return raw;
  const fixParagraphs = (paragraphs: unknown, max: number): unknown => {
    if (!Array.isArray(paragraphs) || !paragraphs.every((p) => typeof p === "string")) return paragraphs;
    const next: string[] = [];
    for (const p of paragraphs as string[]) {
      const n = countSentences(p);
      if (n <= S.paragraph.sentencesMax) {
        next.push(p);
        continue;
      }
      const sentences = splitSentences(p);
      const parts: string[] = [];
      let at = 0;
      for (const size of chunkSizes(sentences.length, S.paragraph.sentencesMax)) {
        parts.push(sentences.slice(at, at + size).join(" "));
        at += size;
      }
      next.push(...(parts.every((x) => x.length >= S.paragraph.min && x.length <= S.paragraph.max) ? parts : [p]));
    }
    return next.length <= max ? next : paragraphs;
  };
  const areas = Array.isArray(d.areas)
    ? d.areas.map((a) => (a && typeof a === "object" && a.id in S.paragraphs ? { ...a, paragraphs: fixParagraphs(a.paragraphs, S.paragraphs[a.id].max) } : a))
    : d.areas;
  const flow = d.flow && typeof d.flow === "object" ? { ...d.flow, paragraphs: fixParagraphs(d.flow.paragraphs, S.paragraphs.flow.max) } : d.flow;
  return { ...d, areas, flow } as T;
}
