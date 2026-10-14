// 자유 질문 답변의 한도 — 지시문 · 검사 · 화면이 같은 값을 쓴다. 저장 한도(talk-room.ts의 FREE_ANSWER_*)보다 작아야 하며 chat.test.ts가 확인한다.

export const CHAT_LIMITS = {
  paragraphs: { min: 1, max: 4 },
  paragraph: { min: 8, max: 320, sentencesMax: 3 },
  /** 답 전체의 글자 수 */
  total: 1100,
  /** 모델이 쓸 수 있는 최대 출력 (토큰) */
  maxOutputTokens: 1500,
  /**
   * 생각하는 데 토큰을 쓰는 모델(실제 Anthropic)에게 주는 최대 출력 — 생각 토큰이 같이 들어가므로 보이는 글만 쓰는 한도(maxOutputTokens)보다 넉넉하다.
   * 한국어 답 1,100자는 대략 1,100~1,700토큰이다. 너무 작으면 답이 잘려 검사에 걸리고(비용은 든다), 너무 크면 최악 비용이 커진다.
   */
  thinkingMaxOutputTokens: 2800,
  /** 생각하는 모델의 제한 시간 — 시간 초과로 끊긴 호출은 비용이 들었을 수 있어(최악 비용으로 센다) 너무 짧게 잡지 않는다 */
  thinkingCallTimeoutMs: 55_000,
  thinkingTotalTimeoutMs: 110_000,
  /** 모델 호출 한 번의 제한 시간 (밀리초) */
  callTimeoutMs: 30_000,
  /** 질문 한 번에 걸리는 전체 시간 (밀리초) — 다시 쓰기 · 재시도를 포함한다 */
  totalTimeoutMs: 60_000,
  /** 이어지는 질문에 함께 보내는 앞선 질문 · 답 개수와 글자 수 */
  recent: { count: 2, chars: 400 },
} as const;
