// 실제 AI 제공사 연결(Anthropic · OpenAI) — AI 품질 비교용 어댑터. TextModel 약속만 지키고, 제공사 SDK 없이 HTTPS 요청만 쓴다(새 의존 패키지 없음).
// 이 파일의 코드는 운영자가 단계별 예산을 승인하기 전에는 부르지 않는다 — 비교 실행기(report/ai/compare-plan.ts)가 BudgetGuard로 감싼 모델만 넘기고,
// 승인 기록 없이는 scripts/run-ai-compare.ts가 시작하지 않는다. 테스트는 가짜 fetch만 쓴다(실제 네트워크 호출 없음).
// 비밀키는 이 파일 밖(환경변수)에서 받아 요청 머리글에만 넣는다. 오류 문구 · 기록에는 키 · 요청 본문 · 응답 본문을 넣지 않는다.
//
// 공식 문서로 확인한 것 (2026-10-13, 유료 호출 없이 문서만):
//  · Anthropic(platform.claude.com/docs): 모델 ID claude-sonnet-5-5 · 입력 $2 / 출력 $10 (100만 토큰) · 기본 생각 적응형 · 기본 강도 high(우리는 medium을 명시) ·
//    요청 model · max_tokens · system · messages · thinking{type:"adaptive"} · output_config.effort(low~max) · 응답 content[](text · thinking) · usage.input_tokens/output_tokens ·
//    stop_reason(end_turn · max_tokens · refusal …) · 생각 토큰은 출력으로 과금되고 max_tokens에 합산된다. 헤더 x-api-key · anthropic-version: 2023-06-01은 공식 오류 문서의 예시에서 확인.
//  · OpenAI(developers.openai.com): 모델 gpt-6.1-sol은 Responses API 지원 · 입력 $2 / 출력 $10 · reasoning.effort(low · medium · high · xhigh · max, 기본 medium) ·
//    요청 instructions · input · max_output_tokens(보이는 글 + 추론 토큰 포함) · store · 응답 output[](message → content[] → output_text) · usage.input_tokens/output_tokens/
//    output_tokens_details.reasoning_tokens · status(completed · incomplete · failed …) · incomplete_details.reason(max_output_tokens …).
//  · 확인하지 못한 것: OpenAI의 오류 응답에서 실패한 요청의 청구 여부(문서에 없음 — 그래서 429 · 인증 · 요청 오류만 청구 없음으로 보고 서버 오류는 최악 비용으로 센다),
//    두 회사의 실제 응답이 이 코드와 한 글자도 다르지 않은지(첫 승인 호출의 결과로 확인 — 다르면 재시도 없이 멈춘다).
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

/**
 * 제공사 응답 코드 → 오류. 응답 본문은 읽지 않는다(문구에 넣지 않음).
 * 공식 오류 문서(Anthropic: 400 · 401 · 402 결제 · 403 · 404 · 413 · 429 · 500 · 504 · 529, OpenAI: 400 · 401 · 403 · 429 · 500 · 503)로 확인한 분류다.
 * 요청이 모델 생성에 닿지 않은 오류(속도 제한 · 인증 · 결제 · 잘못된 요청)는 청구 없음으로, 서버 오류 · 시간 초과(생성에 닿았을 수 있음)는 청구 없음으로 보증하지 않는다.
 */
export function providerError(provider: string, status: number): ModelCallError {
  // 429: 속도 제한이거나 사용 한도 · 잔액 문제다. 한도 문제는 다시 해도 같지만(재시도는 2번까지, 청구 없음) 원인을 안내한다
  if (status === 429) return new ModelCallError(`${provider} 속도 제한 또는 사용 한도 (429) — 계속 나오면 잔액과 월 사용 한도를 확인하세요`, { retryable: true, code: "RATE_LIMITED" });
  if (status === 401 || status === 403) return new ModelCallError(`${provider} 인증 실패 (${status}) — 키 · 권한 · 지역 제한을 확인하세요`, { retryable: false, code: "AUTH" });
  if (status === 402) return new ModelCallError(`${provider} 결제 설정 문제 (402) — 결제 수단과 잔액을 확인하세요`, { retryable: false, code: "BILLING" });
  // 408 · 5xx(500 · 503 · 504 · 529 과부하): 다시 하면 될 수 있다. 생성에 닿았는지 알 수 없다
  if (status === 408 || status >= 500) return new ModelCallError(`${provider} 일시 오류 (${status})`, { retryable: true, code: `HTTP_${status}` });
  // 그 밖의 4xx(400 · 404 · 409 · 413 · 422 …): 요청 자체의 문제 — 지출 한도에 닿아도 Anthropic은 400을 돌려준다
  return new ModelCallError(`${provider} 요청 오류 (${status}) — 모델 이름 · 요청 형식 · 사용 한도를 확인하세요`, { retryable: false, code: "INVALID_REQUEST" });
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
