// 자유 질문(채팅에서 직접 적는 질문) 답변의 타입 — 채널 독립 코드.
// AI에는 이름 · 생년월일 원문을 보내지 않는다: 저장된 리포트의 풀이 글(이름은 "이 분"으로 바꾼다) · 그 방의 모드 · 고른 답 · 질문만 보낸다.

/** AI가 읽는 근거 — 저장된 리포트(또는 코드가 계산한 풀이)의 글이다. 새 사실을 더하지 않는다 */
export type ChatContext = {
  /** 지금 들어와 있는 방 (예: 연애 · 연애박사 미유) — focus는 이 방의 답변 초점(진로 방과 재무 방은 같은 풀이를 쓰므로 초점이 달라야 한다) */
  room: { label: string; mode: string; focus: string };
  /** 먼저 묻는 질문에서 고른 답 — 풀이를 어떻게 읽을지 알려 주는 용도 */
  intake: { question: string; answer: string } | null;
  /** 지금 이야기 중인 풀이 — 없으면 overview만 쓴다 */
  topic: { title: string; headline: string; summary: string[]; detail: string[] } | null;
  /** 분석 카드의 한 줄 요약 (풀이가 없는 방은 장점 · 어려운 점 · 시기까지) */
  overview: { headline: string; tendency: string | null; strength: string | null; caution: string | null; flow: string | null };
  /** "상황에 따라 달라요"를 누른 뒤의 질문인지 — 그 상황에 맞춰 풀이를 다시 읽는다 */
  followUp: boolean;
  /** 무료 맛보기(구매 전)의 글인가 — 보이는 맛보기 안에서만 답하고 깊은 풀이는 리포트에서 이어진다고 한 번만 알린다 */
  taste: boolean;
};

/** 이 방에서 앞서 나눈 질문과 답 (최근 몇 개) — 이어지는 질문이 이전 말을 이어받게 한다 */
export type ChatExchange = { q: string; a: string };

export type ChatAsk = {
  context: ChatContext;
  question: string;
  recent: ChatExchange[];
  /** 이전 대화(이 방에서 앞서 끝낸 대화)에서 나눈 질문과 답의 앞부분 — 요약에서 가져온 참고용이다. 사실로 단정하지 않고, 지금 질문과 이어질 때만 가볍게 쓴다 */
  memory?: ChatExchange[];
  /** 시기 해석 기준 날짜 (한국, YYYY-MM-DD) */
  referenceDate: string;
  /** 마음이 힘든 표현이 있는 글 — 풀이보다 마음을 먼저 받아 주는 답으로 쓴다(위기 표현은 아예 AI에 보내지 않는다) */
  care?: boolean;
};

export type ChatAnswer = { paragraphs: string[] };
