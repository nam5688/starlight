// 의미 검토 — 코드 검사(answer-use.ts)가 못 보는 것을 사람 또는 검토용 AI가 보게 하는 질문지와 결과 해석. 이 파일은 검토 요청을 만들고 결과를 읽을 뿐 AI를 부르지 않는다.
//
// 세 겹으로 본다(운영자 2026-10-16): ① 코드 검사(answer-use.ts · validate.ts) — 찾을 수 있는 표지를 센다, 정밀도 우선 ② 의미 검토(이 파일) — 제목 · 문장이 답 요약인지 결론인지, 지어낸 응답이 있는지,
// 새로 알게 해 주는지를 문장 단위로 판정 ③ 사람이 읽는 평가 — 마지막 판단과 "미유다운지". 코드 검사를 통과해도 ②③이 없으면 좋은 글이라고 말하지 않는다.
// 통과 · 실패(지어내지 않았는가)와 품질(새로 알게 해 주는가)은 검토 결과에서도 따로 나온다.
//
// 지금은 실제 서비스에 연결하지 않았다. 검토용 AI를 부르려면 비용이라서 운영자 승인이 따로 필요하다 — 시험에서는 대리 검토기(AI 하위 작업자)가 이 질문지로 읽은 결과를 저장해 두고 이 파일이 해석한다.
import type { ReadingDraftV1 } from "./types.ts";
import { titleSlots } from "./answer-use.ts";
import { visibleTexts } from "./validate.ts";

export const SEMANTIC_REVIEW_VERSION = "reading-review-0.1";

/** 문장 하나에 내리는 판정 */
export const VERDICTS = {
  conclusion: "풀이가 내린 결론 — 근거를 이어 읽어 새로 알려 주는 문장",
  "answer-summary": "답 요약 — 고른 답(응답 근거의 사실)을 줄이거나 말만 바꿔 되풀이한 문장",
  "answer-list": "답 나열 — 서로 다른 장면의 답을 이어 붙인 문장",
  generic: "범용 — 누구에게나 해당해 이 사람의 근거와 이어지지 않는 문장",
  "invented-response": "지어낸 응답 — 근거 목록에 없는 장면에서 이 사람이 한 행동 · 반응을 사실처럼 쓴 문장",
  "flat-hedge": "얼버무림 — 두 가능성을 늘어놓고 가르는 조건 없이 끝낸 문장",
} as const;
export type Verdict = keyof typeof VERDICTS;

export type ReviewItem = { where: string; verdict: Verdict; note: string };
export type SemanticReview = {
  items: ReviewItem[];
  /** 지어내지 않았는가(통과 · 실패) — invented-response가 하나라도 있으면 fail */
  integrity: "pass" | "fail";
  /** 새로 알게 해 주는가(별도 기준) */
  newUnderstanding: "yes" | "partly" | "no";
  summary: string;
};

export const SEMANTIC_REVIEW_SYSTEM = `너는 리포트 검토자다. 글을 고치지 않고 판정만 한다.
입력: (1) 근거 목록에서 응답 근거 문장(사용자가 고른 답의 사실) (2) 응답 근거가 없는 장면 목록(읽을 수 없었던 구분) (3) 검토할 글 조각(위치 where + 문장).
조각마다 판정을 하나 고른다:
- conclusion: 풀이가 내린 결론. 사주에서 읽은 성향과 고른 답을 이어 이 사람에게 무엇이 반복되는지 · 어떤 부담 · 선택으로 이어지는지 · 어떤 조건에서 달라지는지를 새로 알려 준다.
- answer-summary: 고른 답을 줄이거나 말만 바꿔 되풀이한다(사주 쪽 이유 · 결과가 없다).
- answer-list: 서로 다른 장면의 답 둘 이상을 이어 붙였다.
- generic: 누구에게나 해당한다.
- invented-response: 응답 근거가 없는 장면(2번)에서의 이 사람의 행동 · 반응을 사실처럼 썼다. "~기 쉬워요 · ~수 있어요" 같은 조건형은 사주에서 읽은 경향으로 허용되므로 이 판정을 하지 않는다. 사실처럼 단정했을 때만 한다.
- flat-hedge: 두 가능성을 늘어놓고 어떤 때 어느 쪽인지 가르는 조건 없이 끝낸다.
지켜야 할 것: 제목(headline · 소단락 title · 카드 keyword)은 특히 엄격하게 본다 — 제목이 답 요약 · 답 나열이면 그렇게 판정한다. 판정마다 이유(note)를 한 문장으로 쓴다. 애매하면 더 약한 쪽(conclusion이 아닌 쪽)으로 판정하고 이유에 애매하다고 적는다.
출력은 JSON 하나: {"items":[{"where":string,"verdict":"conclusion|answer-summary|answer-list|generic|invented-response|flat-hedge","note":string}],"newUnderstanding":"yes|partly|no","summary":string}
newUnderstanding은 글 전체가 고른 답을 되풀이하는 데 그치지 않고 새로 알려 주는 것이 있는지에 대한 판단이다(통과 · 실패와 별개). summary는 두 문장 이내.`;

export type ReviewInput = {
  /** 응답 근거 문장 (근거 목록에서 survey 근거의 fact) */
  answerFacts: string[];
  /** 응답 근거가 없는 장면 이름 */
  unreadScenes: string[];
  /** 검토할 조각 */
  slots: { where: string; text: string }[];
};

/** 제목 자리는 모두, 나머지는 반응 단계 · 소단락 풀이 · 결론처럼 읽히는 첫 문장만 — 검토 요청이 너무 길어지지 않게 한다 */
export function reviewSlots(d: ReadingDraftV1): { where: string; text: string }[] {
  const titles = titleSlots(d);
  const bodies = visibleTexts(d).filter((t) => /\.sections\[\d+\]\.body$|\.reactionFlow\.(?:when|helpful)$|\.reactionFlow\.steps\[\d+\]\.text$|\.summary$|\.watch$/.test(t.where) && !t.where.startsWith("flow"));
  return [...titles, ...bodies];
}

export function buildReviewUserMessage(input: ReviewInput): string {
  return JSON.stringify({ answerFacts: input.answerFacts, unreadScenes: input.unreadScenes, slots: input.slots }, null, 1);
}

const isVerdict = (v: unknown): v is Verdict => typeof v === "string" && v in VERDICTS;

/** 검토 결과 JSON을 읽는다 — 형식이 어긋나면 null (판정을 지어내지 않는다) */
export function parseReview(text: string, slots: { where: string }[]): SemanticReview | null {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  let raw: { items?: unknown; newUnderstanding?: unknown; summary?: unknown };
  try {
    raw = JSON.parse(text.slice(s, e + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(raw.items)) return null;
  const known = new Set(slots.map((x) => x.where));
  const items: ReviewItem[] = [];
  for (const it of raw.items as { where?: unknown; verdict?: unknown; note?: unknown }[]) {
    if (typeof it?.where !== "string" || !known.has(it.where) || !isVerdict(it.verdict)) return null;
    items.push({ where: it.where, verdict: it.verdict, note: typeof it.note === "string" ? it.note : "" });
  }
  // 검토하지 않은 조각이 있으면 완전한 검토가 아니다
  if (items.length < slots.length) return null;
  const nu = raw.newUnderstanding;
  if (nu !== "yes" && nu !== "partly" && nu !== "no") return null;
  return {
    items,
    integrity: items.some((i) => i.verdict === "invented-response") ? "fail" : "pass",
    newUnderstanding: nu,
    summary: typeof raw.summary === "string" ? raw.summary : "",
  };
}
