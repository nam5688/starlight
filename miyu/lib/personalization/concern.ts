// 고민 기록 — 고민을 반영한 리포트를 발급할 때 "그때의 고민"을 그대로 저장해 둔 것 (저장본).
// - 현재 고민(personal_contexts)은 언제든 고칠 수 있지만, 기록은 고쳐지지 않는다. 그래서 이후에 고민을 고쳐도 과거 리포트가 근거로 삼은 고민은 그대로 남는다.
// - 리포트 본문에는 고민 내용을 다시 담지 않고(주제 · 적은 항목 이름 · 기록 번호 · 작성 시점만), 내용은 이 기록에서 본인만 볼 수 있다.
// - 고객이 직접 내용을 지울 수 있다 (지우면 내용은 비고, 기록 자리와 주제 · 시점은 남는다).

import { CONTEXT_FIELDS, redactPersonalInfo, type ContextFieldId, type ContextTopic, type PersonalContextInput } from "./context.ts";

export type ConcernRecord = PersonalContextInput & {
  id: string;
  userId: string;
  assessmentId: string;
  /** 이 고민을 마지막으로 쓰거나 고친 시점 (현재 고민의 수정 시각) */
  writtenAt: string;
  /** 리포트 해석에 쓰는 데 동의한 시각 */
  agreedAt: string;
  /** 발급을 시작해 이 기록을 만든 시점 */
  createdAt: string;
  /** 고객이 내용을 지운 시점 (지우지 않았으면 null) */
  scrubbedAt: string | null;
};
export type NewConcernRecord = PersonalContextInput & Pick<ConcernRecord, "userId" | "assessmentId" | "writtenAt" | "agreedAt">;
/** 목록용 — 적은 내용은 담지 않는다 */
export type ConcernRecordSummary = Pick<ConcernRecord, "id" | "assessmentId" | "topic" | "writtenAt" | "createdAt" | "scrubbedAt">;

/** 두 고민이 같은 내용인가 (주제와 적은 글, 앞뒤 공백 · 줄바꿈 차이는 무시). 한 글자라도 고치면 다른 고민이다 */
export function sameConcern(a: PersonalContextInput, b: PersonalContextInput): boolean {
  const norm = (s: string) => s.replace(/\r\n?/g, "\n").trim();
  return a.topic === b.topic && CONTEXT_FIELDS.every((f) => norm(a[f.id]) === norm(b[f.id]));
}

/** 고민 입력 값만 뽑는다 (기록 · 현재 고민 어느 쪽이든) */
export function concernInputOf(c: PersonalContextInput): PersonalContextInput {
  return { topic: c.topic, question: c.question, situation: c.situation, matched: c.matched, differed: c.differed, excerpt: c.excerpt };
}

const PARTICLES = [
  "으로는", "에서는", "이라는", "이라고", "에게서", "한테서", "이었는데", "인데도", "이에요", "예요",
  "에서", "으로", "에게", "한테", "까지", "부터", "이나", "라고", "하고", "해서", "하면", "인데", "에는", "이고", "처럼", "보다", "마다",
  "은", "는", "이", "가", "을", "를", "에", "의", "도", "로", "와", "과", "만", "고", "며",
];
/** 고민 글에서 낱말을 골라낼 때 제외하는 흔한 말 */
const STOPWORDS = new Set([
  "그리고", "그런데", "그래서", "하지만", "그러나", "그냥", "정말", "너무", "계속", "조금", "자주", "항상", "가끔", "요즘", "지금", "이번", "어떻게", "무엇", "어떤", "무슨",
  "때문", "생각", "마음", "같아요", "있어요", "없어요", "싶어요", "하고", "해요", "돼요", "되는", "하는", "있는", "없는", "같은", "이런", "저런", "그런", "것이", "거예요", "궁금해요", "모르겠어요",
]);

function stripParticle(word: string): string {
  for (const p of PARTICLES) if (word.length - p.length >= 2 && word.endsWith(p)) return word.slice(0, -p.length);
  return word;
}

/**
 * 고객이 쓴 고민에서 해석이 다뤄야 할 핵심 낱말을 어림으로 골라낸다 (2글자 이상, 조사 · 흔한 말 제외).
 * 지금 고민(question · situation)에서 먼저 고르고, 이전 풀이에서 맞았던/달랐던 점(matched · differed)은 보조로 쓴다.
 * 대화 일부(excerpt)는 길어서 핵심 낱말에서 뺀다. 개인정보처럼 가려진 부분은 제외한다.
 */
export function concernTerms(ctx: PersonalContextInput): string[] {
  const core: ContextFieldId[] = ["question", "situation", "matched", "differed"];
  const text = core.map((f) => redactPersonalInfo(ctx[f]).text.replace(/\[[^\]]*가림\]/g, " ")).join(" ");
  const seen = new Set<string>();
  for (const raw of text.split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2) continue;
    const word = stripParticle(raw);
    if (word.length < 2 || STOPWORDS.has(word) || STOPWORDS.has(raw) || /^\d+$/.test(word)) continue;
    seen.add(word);
  }
  return [...seen];
}

export type { ContextTopic };
