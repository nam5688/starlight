// AI 모델 연결 약속 — 제공사(Anthropic · OpenAI · Google 등)와 무관하다.
// 실제 제공사 구현체는 선택 · 승인 후 연동 폴더(integrations)의 ai 아래에 추가한다.

export type ModelMessage = { role: "user" | "assistant"; content: string };

export type ModelRequest = {
  system: string;
  messages: ModelMessage[];
  maxOutputTokens: number;
};

export type ModelResult = {
  text: string;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
};

/** retryable: 잠시 뒤 다시 하면 될 수 있는 오류 (속도 제한 · 일시 장애 · 시간 초과) */
export class ModelCallError extends Error {
  readonly retryable: boolean;
  readonly code: string;
  constructor(message: string, opts: { retryable: boolean; code: string }) {
    super(message);
    this.retryable = opts.retryable;
    this.code = opts.code;
  }
}

export interface TextModel {
  readonly provider: string;
  readonly model: string;
  complete(request: ModelRequest): Promise<ModelResult>;
}
