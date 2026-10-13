// 실제 AI 제공사 연결(Anthropic · OpenAI) — AI 품질 비교용 어댑터. TextModel 약속만 지키고, 제공사 SDK 없이 HTTPS 요청만 쓴다(새 의존 패키지 없음).
// 이 파일의 코드는 운영자가 단계별 예산을 승인하기 전에는 부르지 않는다 — 비교 실행기(report/ai/compare-plan.ts)가 BudgetGuard로 감싼 모델만 넘기고,
// 승인 기록 없이는 scripts/run-ai-compare.ts가 시작하지 않는다. 테스트는 가짜 fetch만 쓴다(실제 네트워크 호출 없음).
// 비밀키는 이 파일 밖(환경변수)에서 받아 요청 머리글에만 넣는다. 오류 문구 · 기록에는 키 · 요청 본문 · 응답 본문을 넣지 않는다.
//
// 확인한 것과 못 한 것(2026-10-13):
//  · Anthropic: 요청 형식(POST /v1/messages · x-api-key · anthropic-version · thinking.adaptive · output_config.effort)은 공식 문서(제공된 API 안내)에서 확인했다.
//  · OpenAI: 모델 문서(gpt-6.1-sol)에서 Responses API 지원 · reasoning.effort(기본 medium)를, 이전 안내 문서에서 instructions · input · store를 확인했다.
//    max_output_tokens · usage.input_tokens/output_tokens · 응답 status는 문서 본문을 읽지 못했고 이 API의 오래된 필드명을 쓴다 — 첫 승인 호출에서 실제 응답으로 확인한다.
//    사용량을 읽지 못하면 비용은 최악 비용으로 계산된다(BudgetGuard) — 한도를 넘지 않는다.
import { ModelCallError, type ModelRequest, type ModelResult, type TextModel } from "../../report/ai/model.ts";

export type Effort = "low" | "medium" | "high";
type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

type CommonOptions = {
  apiKey: string;
  model: string;
  /** 생각 · 추론 강도 — 후보 사이에서 같은 조건으로 맞춘다 (비교 계획: 중간) */
  effort?: Effort;
  /** 시험용: 가짜 fetch */
  fetch?: FetchFn;
  baseUrl?: string;
  timeoutMs?: number;
};

/** 제공사 응답 코드 → 오류. 응답 본문은 읽지 않는다(문구에 넣지 않음). 429 · 인증 · 요청 오류는 모델 생성에 닿지 않았으므로 청구 없음으로 본다 */
export function providerError(provider: string, status: number): ModelCallError {
  if (status === 429) return new ModelCallError(`${provider} 속도 제한 (429)`, { retryable: true, code: "RATE_LIMITED" });
  if (status === 401 || status === 403) return new ModelCallError(`${provider} 인증 실패 (${status}) — 키 또는 권한을 확인하세요`, { retryable: false, code: "AUTH" });
  if (status === 400 || status === 404 || status === 413 || status === 422) return new ModelCallError(`${provider} 요청 오류 (${status})`, { retryable: false, code: "INVALID_REQUEST" });
  // 5xx · 529(과부하): 다시 하면 될 수 있다. 생성에 닿았는지 알 수 없으므로 청구 없음으로 보증하지 않는다
  return new ModelCallError(`${provider} 일시 오류 (${status})`, { retryable: status >= 500, code: `HTTP_${status}` });
}

async function post(provider: string, url: string, headers: Record<string, string>, body: unknown, opts: CommonOptions, request: ModelRequest) {
  const doFetch: FetchFn = opts.fetch ?? ((u, init) => fetch(u, init) as never);
  let res: Awaited<ReturnType<FetchFn>>;
  try {
    res = await doFetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: request.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 180_000) });
  } catch (e) {
    // 시간 제한 · 중단은 호출한 쪽(model-caller)이 구분하도록 그대로 넘긴다
    if (request.signal?.aborted) throw e;
    throw new ModelCallError(`${provider}에 연결하지 못했습니다.`, { retryable: true, code: "NETWORK_ERROR" });
  }
  if (!res.ok) throw providerError(provider, res.status);
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ModelCallError(`${provider} 응답을 읽지 못했습니다.`, { retryable: false, code: "INVALID_RESPONSE" });
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

function usageOf(u: unknown, inKey: string, outKey: string): ModelResult["usage"] {
  const o = (u ?? {}) as Record<string, unknown>;
  const i = num(o[inKey]);
  const out = num(o[outKey]);
  return i !== null && out !== null ? { inputTokens: i, outputTokens: out } : undefined;
}

/** Anthropic Messages API — 생각은 적응형, 강도는 effort. 잘린 응답(max_tokens)은 사용량과 함께 그대로 돌려줘 비용을 정확히 센다(형식 검사에서 실패 처리) */
export function createAnthropicModel(opts: CommonOptions): TextModel {
  const url = `${(opts.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "")}/v1/messages`;
  return {
    provider: "anthropic",
    model: opts.model,
    async complete(request) {
      const body = await post(
        "Anthropic",
        url,
        { "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
        {
          model: opts.model,
          max_tokens: request.maxOutputTokens,
          system: request.system,
          messages: request.messages,
          thinking: { type: "adaptive" },
          output_config: { effort: opts.effort ?? "medium" },
        },
        opts,
        request,
      );
      const blocks = Array.isArray(body.content) ? (body.content as { type?: unknown; text?: unknown }[]) : null;
      if (!blocks) throw new ModelCallError("Anthropic 응답 형식 오류", { retryable: false, code: "INVALID_RESPONSE" });
      const text = blocks.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text as string).join("");
      return { text, model: typeof body.model === "string" ? body.model : opts.model, usage: usageOf(body.usage, "input_tokens", "output_tokens") };
    },
  };
}

/** OpenAI Responses API — 추론 강도는 reasoning.effort, 저장하지 않는다(store: false). 말하는 글만 모은다 */
export function createOpenAiModel(opts: CommonOptions): TextModel {
  const url = `${(opts.baseUrl ?? "https://api.openai.com").replace(/\/$/, "")}/v1/responses`;
  return {
    provider: "openai",
    model: opts.model,
    async complete(request) {
      const body = await post(
        "OpenAI",
        url,
        { Authorization: `Bearer ${opts.apiKey}` },
        {
          model: opts.model,
          instructions: request.system,
          input: request.messages.map((m) => ({ role: m.role, content: m.content })),
          max_output_tokens: request.maxOutputTokens,
          reasoning: { effort: opts.effort ?? "medium" },
          store: false,
        },
        opts,
        request,
      );
      const items = Array.isArray(body.output) ? (body.output as { type?: unknown; content?: unknown }[]) : null;
      if (!items) throw new ModelCallError("OpenAI 응답 형식 오류", { retryable: false, code: "INVALID_RESPONSE" });
      const text = items
        .filter((it) => it.type === "message" && Array.isArray(it.content))
        .flatMap((it) => it.content as { type?: unknown; text?: unknown }[])
        .filter((c) => c.type === "output_text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("");
      return { text, model: typeof body.model === "string" ? body.model : opts.model, usage: usageOf(body.usage, "input_tokens", "output_tokens") };
    },
  };
}
