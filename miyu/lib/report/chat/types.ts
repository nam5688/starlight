// 자유 질문(채팅에서 직접 적는 질문) 답변의 타입 — 채널 독립 코드.
// AI에는 이름 · 생년월일 원문을 보내지 않는다: 저장된 리포트의 풀이 글(이름은 "이 분"으로 바꾼다) · 그 방의 모드 · 고른 답 · 질문만 보낸다.

/** AI가 읽는 근거 — 저장된 리포트(또는 코드가 계산한 풀이)의 글이다. 새 사실을 더하지 않는다 */
export type ChatContext = {
  /** 지금 들어와 있는 방 (예: 연애 · 연애박사 미유) */
  room: { label: string; mode: string };
  /** 먼저 묻는 질문에서 고른 답 — 풀이를 어떻게 읽을지 알려 주는 용도 */
  intake: { question: string; answer: string } | null;
  /** 지금 이야기 중인 풀이 — 없으면 overview만 쓴다 */
  topic: { title: string; headline: string; summary: string[]; detail: string[] } | null;
  /** 분석 카드의 한 줄 요약 (풀이가 없는 방은 장점 · 어려운 점 · 시기까지) */
  overview: { headline: string; tendency: string | null; strength: string | null; caution: string | null; flow: string | null };
  /** "상황에 따라 달라요"를 누른 뒤의 질문인지 — 그 상황에 맞춰 풀이를 다시 읽는다 */
  followUp: boolean;
};

/** 이 방에서 앞서 나눈 질문과 답 (최근 몇 개) — 이어지는 질문이 이전 말을 이어받게 한다 */
export type ChatExchange = { q: string; a: string };

export type ChatAsk = {
  context: ChatContext;
  question: string;
  recent: ChatExchange[];
  /** 시기 해석 기준 날짜 (한국, YYYY-MM-DD) */
  referenceDate: string;
};

export type ChatAnswer = { paragraphs: string[] };
