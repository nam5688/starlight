// 로컬 검증용 가짜 AI 서버 연결 (http://127.0.0.1만 허용 — server/env.ts에서 확인).
// 실제 제공사 연결은 선택 · 승인 후 같은 TextModel 약속으로 추가한다.

import { ModelCallError, type ModelRequest, type ModelResult, type TextModel } from "../../report/ai/model.ts";

export function createMockLocalModel(opts: { baseUrl: string; model?: string; timeoutMs?: number }): TextModel {
  const model = opts.model ?? "mock-local";
  return {
    provider: "mock-local",
    model,
    async complete(request: ModelRequest): Promise<ModelResult> {
      let res: Response;
      try {
        res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/v1/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, ...request }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
        });
      } catch {
        throw new ModelCallError("AI 서버에 연결하지 못했습니다.", { retryable: true, code: "NETWORK_ERROR" });
      }
      if (!res.ok) {
        throw new ModelCallError(`AI 서버 오류 (${res.status})`, { retryable: res.status === 429 || res.status >= 500, code: `HTTP_${res.status}` });
      }
      const body = (await res.json()) as { text?: unknown; usage?: ModelResult["usage"] };
      if (typeof body.text !== "string") throw new ModelCallError("AI 응답 형식 오류", { retryable: true, code: "INVALID_RESPONSE" });
      return { text: body.text, model, usage: body.usage };
    },
  };
}
