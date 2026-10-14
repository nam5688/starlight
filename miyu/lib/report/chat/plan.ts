// 자유 질문 답변의 한도 — 지시문 · 검사 · 화면이 같은 값을 쓴다. 저장 한도(talk-room.ts의 FREE_ANSWER_*)보다 작아야 하며 chat.test.ts가 확인한다.

export const CHAT_LIMITS = {
  paragraphs: { min: 1, max: 4 },
  paragraph: { min: 8, max: 320, sentencesMax: 3 },
  /** 답 전체의 글자 수 */
  total: 1100,
  /** 모델이 쓸 수 있는 최대 출력 (토큰) */
  maxOutputTokens: 1500,
  /** 모델 호출 한 번의 제한 시간 (밀리초) */
  callTimeoutMs: 30_000,
  /** 질문 한 번에 걸리는 전체 시간 (밀리초) — 다시 쓰기 · 재시도를 포함한다 */
  totalTimeoutMs: 60_000,
  /** 이어지는 질문에 함께 보내는 앞선 질문 · 답 개수와 글자 수 */
  recent: { count: 2, chars: 400 },
} as const;
