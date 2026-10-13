// AI 모델 호출 한 번의 공통 처리 — 개인 종합 리포트와 고민 반영 리포트가 함께 쓴다.
// 일시 오류는 잠시 뒤 다시 부르고(2초 → 6초), 호출마다 시간 제한 · 사용 기록을 남긴다 (실패한 호출도 — 비용과 장애를 보기 위해).

import type { AiUsageSample, GenerateContext } from "../generator.ts";
import { ModelCallError, type ModelMessage, type ModelResult, type TextModel } from "./model.ts";

export type ModelCallerOptions = {
  model: TextModel;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  maxOutputTokens?: number;
  /** 모델 호출 한 번의 제한 시간 (넘으면 일시 오류로 보고 다시 시도) */
  callTimeoutMs?: number;
};

export type ModelCaller = {
  call(messages: ModelMessage[], ctx: GenerateContext, spec: { system: string; promptVersion: string }): Promise<{ result: ModelResult; started: number }>;
  /** 응답을 받은 뒤 형식 검사 결과(통과 · 실패)를 사용 기록으로 남긴다 */
  recordResult(ctx: GenerateContext, spec: { promptVersion: string }, call: { result: ModelResult; started: number }, outcome: "ok" | "invalid", errorCode?: string): void;
};

export function createModelCaller(opts: ModelCallerOptions): ModelCaller {
  const { model } = opts;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxRetries = opts.maxRetries ?? 2;

  return {
    async call(messages, ctx, spec) {
      const sample = (extra: { outcome: "ok" | "invalid" | "timeout" | "error"; errorCode: string | null; started: number; usage?: { inputTokens: number; outputTokens: number } }) =>
        ctx.onUsage?.({
          provider: model.provider,
          model: model.model,
          promptVersion: spec.promptVersion,
          inputTokens: extra.usage?.inputTokens ?? null,
          outputTokens: extra.usage?.outputTokens ?? null,
          latencyMs: Date.now() - extra.started,
          outcome: extra.outcome,
          errorCode: extra.errorCode,
        } satisfies AiUsageSample);
      for (let attempt = 0; ; attempt++) {
        if (ctx.signal?.aborted) throw new ModelCallError("생성 시간이 초과되어 중단했습니다.", { retryable: false, code: "ABORTED" });
        const started = Date.now();
        // 호출 한 번의 제한 시간 + 바깥에서 오는 중단 신호를 합친다
        const own = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          own.abort();
        }, opts.callTimeoutMs ?? 120_000);
        const signal = ctx.signal ? AbortSignal.any([own.signal, ctx.signal]) : own.signal;
        try {
          const result = await model.complete({ system: spec.system, messages, maxOutputTokens: opts.maxOutputTokens ?? 16000, signal });
          return { result, started };
        } catch (raw) {
          const aborted = ctx.signal?.aborted === true;
          const timeout = timedOut && !aborted;
          const e = raw instanceof ModelCallError ? raw : new ModelCallError(timeout ? "AI 응답 시간이 초과되었습니다." : aborted ? "생성 시간이 초과되어 중단했습니다." : "AI 호출 오류", { retryable: timeout, code: timeout ? "TIMEOUT" : aborted ? "ABORTED" : "UNKNOWN" });
          sample({ outcome: timeout || aborted ? "timeout" : "error", errorCode: timeout ? "TIMEOUT" : e.code, started });
          if (e.retryable && !aborted && attempt < maxRetries) {
            await sleep(2000 * 3 ** attempt);
            continue;
          }
          throw e;
        } finally {
          clearTimeout(timer);
        }
      }
    },
    recordResult(ctx, spec, call, outcome, errorCode) {
      ctx.onUsage?.({
        provider: model.provider,
        model: model.model,
        promptVersion: spec.promptVersion,
        inputTokens: call.result.usage?.inputTokens ?? null,
        outputTokens: call.result.usage?.outputTokens ?? null,
        latencyMs: Date.now() - call.started,
        outcome,
        errorCode: outcome === "ok" ? null : (errorCode ?? "VALIDATION"),
      });
    },
  };
}
