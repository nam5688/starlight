// 나를 더 반영하기 (선택 입력) — 고객이 알려 준 지금의 고민 · 반복되는 상황 · 이전 풀이 소감 · 대화 일부.
// - 사주 계산은 바꾸지 않는다. 리포트를 만들 때 해석의 초점과 예시를 고르는 데만 쓴다
// - 근거(evidence)가 아니다. 알려 준 이야기를 사주로 알아맞힌 것처럼 쓰지 않는다
// - 전체 대화 기록 대신 짧은 요약과 필요한 부분만 받는다 (글자 수 제한)
// - 전화번호 · 이메일처럼 보이는 내용은 저장할 때 가린다
// - 광고 · 분석 도구로 보내지 않는다

export const CONTEXT_TOPICS = [
  { id: "love", label: "연애" },
  { id: "marriage", label: "결혼" },
  { id: "relationship", label: "가족 · 친구 · 대인관계" },
  { id: "work", label: "일 · 진로 · 이직" },
  { id: "money", label: "돈" },
  { id: "self", label: "나 자신 (성격 · 습관)" },
  { id: "other", label: "기타" },
] as const;

export type ContextTopic = (typeof CONTEXT_TOPICS)[number]["id"];

export const topicLabel = (id: ContextTopic) => CONTEXT_TOPICS.find((t) => t.id === id)?.label ?? id;

/** 주제별로 리포트에서 더 자세히 풀 부분 (AI 지시문에 함께 보낸다) */
export const TOPIC_FOCUS: Record<ContextTopic, string> = {
  love: "가까워지는 과정, 마음을 확인하고 표현하는 방식, 연애에서 반복되는 선택",
  marriage: "관계를 결정하는 과정, 함께 살 사람에게 중요한 기준, 결정을 미루거나 서두르게 되는 조건",
  relationship: "가까운 사람과의 거리 조절, 갈등이 생겼을 때의 반응, 기대와 서운함이 생기는 지점",
  work: "선택과 불확실성에 대한 반응, 일하는 방식이 살아나는 환경, 변화를 결정하는 기준",
  money: "돈을 대하는 기준, 위험을 감수하는 정도, 쓰고 모으는 선택이 갈리는 조건",
  self: "반복되는 습관이 생기는 조건, 에너지가 차고 빠지는 상황, 스스로를 평가하는 방식",
  other: "적어 주신 고민과 가장 가까운 성격 구조와 시기",
};

export const CONTEXT_FIELDS = [
  { id: "question", label: "지금 가장 궁금한 문제", limit: 300 },
  { id: "situation", label: "최근 반복되는 상황", limit: 300 },
  { id: "matched", label: "이전 풀이에서 맞았던 점", limit: 300 },
  { id: "differed", label: "이전 풀이에서 달랐던 점", limit: 300 },
  { id: "excerpt", label: "참고할 대화 (필요한 부분만)", limit: 1500 },
] as const;

export type ContextFieldId = (typeof CONTEXT_FIELDS)[number]["id"];

export type PersonalContextInput = { topic: ContextTopic } & Record<ContextFieldId, string>;

export type PersonalContext = PersonalContextInput & {
  assessmentId: string;
  userId: string;
  /** 리포트 해석에 쓰는 데 동의한 시각 (선택 항목 동의) */
  agreedAt: string;
  createdAt: string;
  updatedAt: string;
};

const REDACTIONS: { re: RegExp; label: string }[] = [
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, label: "[이메일 가림]" },
  { re: /\b\d{6}\s*-\s*[1-8]\d{6}\b/g, label: "[주민번호 가림]" },
  { re: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g, label: "[번호 가림]" },
  { re: /(?:\+?82[\s-]?)?0?1[016789][\s-]?\d{3,4}[\s-]?\d{4}\b/g, label: "[연락처 가림]" },
  { re: /\b0\d{1,2}[\s-]\d{3,4}[\s-]\d{4}\b/g, label: "[연락처 가림]" },
  { re: /\b\d{10,}\b/g, label: "[번호 가림]" },
];

/** 연락처 · 이메일 · 주민번호 · 카드 · 계좌처럼 보이는 내용을 가린다 */
export function redactPersonalInfo(text: string): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const { re, label } of REDACTIONS) {
    out = out.replace(re, () => {
      count++;
      return label;
    });
  }
  return { text: out, count };
}

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type NormalizedContext = { ok: true; value: PersonalContextInput; redactions: number } | { ok: false; errors: string[] };

/** 입력 확인 + 정리 + 개인정보 가리기. 주제는 꼭 고르고, 글은 모두 선택 */
export function normalizeContextInput(raw: Record<string, unknown>): NormalizedContext {
  const errors: string[] = [];
  const topic = CONTEXT_TOPICS.find((t) => t.id === raw.topic)?.id;
  if (!topic) errors.push("고민 주제를 골라 주세요.");
  let redactions = 0;
  const fields = {} as Record<ContextFieldId, string>;
  for (const f of CONTEXT_FIELDS) {
    const value = clean(raw[f.id]);
    if (value.length > f.limit) errors.push(`${f.label}은(는) ${f.limit}자까지 적을 수 있습니다 (지금 ${value.length}자).`);
    const r = redactPersonalInfo(value);
    redactions += r.count;
    fields[f.id] = r.text.slice(0, f.limit);
  }
  if (errors.length || !topic) return { ok: false, errors };
  return { ok: true, value: { topic, ...fields }, redactions };
}

/** 리포트에 "무엇을 반영했는지" 표시할 항목 이름 (내용은 담지 않는다) */
export function filledFields(ctx: PersonalContextInput): string[] {
  return CONTEXT_FIELDS.filter((f) => ctx[f.id].length > 0).map((f) => f.label);
}

/** AI에게 보내는 맥락 — 회원번호 · 검사 번호 없이, 적은 항목만 (저장 후에도 한 번 더 가린다) */
export function contextForPrompt(ctx: PersonalContextInput) {
  const text = (s: string) => redactPersonalInfo(s).text;
  return {
    topic: topicLabel(ctx.topic),
    focusGuide: TOPIC_FOCUS[ctx.topic],
    ...(ctx.question ? { question: text(ctx.question) } : {}),
    ...(ctx.situation ? { situation: text(ctx.situation) } : {}),
    ...(ctx.matched || ctx.differed
      ? { previousReading: { ...(ctx.matched ? { matched: text(ctx.matched) } : {}), ...(ctx.differed ? { differed: text(ctx.differed) } : {}) } }
      : {}),
    ...(ctx.excerpt ? { excerpt: text(ctx.excerpt) } : {}),
  };
}
