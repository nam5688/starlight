// 맛보기 리포트 쓰기 — 모델에 한 번 묻고, 검사(validate.ts)에 걸리면 이유를 알려 한 번 고쳐 쓰게 한다. 그래도 걸리면 실패로 돌려준다(잘못된 글을 보이지 않는다).
// 호출마다 사용 기록(ctx.onUsage)을 남기고 시간 제한을 둔다. 제공사를 직접 부르지 않는다 — TextModel 약속으로만.
import type { GenerateContext } from "../generator.ts";
import { createModelCaller } from "../ai/model-caller.ts";
import { ModelCallError, type ModelMessage, type TextModel } from "../ai/model.ts";
import { TASTE_LIMITS } from "./plan.ts";
import { buildTasteRepairMessage, buildTasteUserMessage, TASTE_PROMPT_VERSION, TASTE_SYSTEM_PROMPT } from "./prompt.ts";
import type { TasteInput, TasteReport } from "./types.ts";
import { validateTaste } from "./validate.ts";

export class TasteWriteError extends Error {
  readonly code: "INVALID" | "MODEL";
  readonly errors: string[];
  constructor(message: string, code: "INVALID" | "MODEL", errors: string[] = []) {
    super(message);
    this.code = code;
    this.errors = errors;
  }
}

export interface TasteWriter {
  /** 글을 쓴다. 모델 호출 · 검사에 실패하면 TasteWriteError를 던진다 */
  write(input: TasteInput, ctx?: GenerateContext): Promise<TasteReport>;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  /** 전체 시간 제한(밀리초) — 다시 쓰기 · 재시도를 포함한다 */
  readonly totalTimeoutMs: number;
}

export type TasteWriterOptions = {
  model: TextModel;
  /** 검사에 걸렸을 때 고쳐 쓰게 하는 횟수 (기본 1) */
  maxRepairs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  maxOutputTokens?: number;
  callTimeoutMs?: number;
  totalTimeoutMs?: number;
};

export function createTasteWriter(opts: TasteWriterOptions): TasteWriter {
  const caller = createModelCaller({ model: opts.model, maxRetries: opts.maxRetries ?? 1, sleep: opts.sleep, maxOutputTokens: opts.maxOutputTokens ?? TASTE_LIMITS.maxOutputTokens, callTimeoutMs: opts.callTimeoutMs ?? TASTE_LIMITS.callTimeoutMs });
  const maxRepairs = opts.maxRepairs ?? 1;
  const spec = { system: TASTE_SYSTEM_PROMPT, promptVersion: TASTE_PROMPT_VERSION };
  return {
    provider: opts.model.provider,
    model: opts.model.model,
    promptVersion: TASTE_PROMPT_VERSION,
    totalTimeoutMs: opts.totalTimeoutMs ?? TASTE_LIMITS.totalTimeoutMs,
    async write(input, ctx = {}) {
      const messages: ModelMessage[] = [{ role: "user", content: buildTasteUserMessage(input) }];
      let lastErrors: string[] = [];
      for (let round = 0; round <= maxRepairs; round++) {
        let call: Awaited<ReturnType<typeof caller.call>>;
        try {
          call = await caller.call(messages, ctx, spec);
        } catch (e) {
          // 첫 응답이 검사에 걸려 고쳐 쓰는 중에 호출이 실패했다면 모델이 이미 한 번 응답한 요청이다(비용이 들었다) — 호출 전 실패와 구분한다
          if (e instanceof ModelCallError) throw round > 0 ? new TasteWriteError("글이 검사를 통과하지 못했어요.", "INVALID", lastErrors) : new TasteWriteError("AI 호출에 실패했어요.", "MODEL");
          throw e;
        }
        const check = validateTaste(call.result.text);
        if (check.ok) {
          caller.recordResult(ctx, spec, call, "ok");
          return check.report;
        }
        caller.recordResult(ctx, spec, call, "invalid", "VALIDATION");
        lastErrors = check.errors;
        messages.push({ role: "assistant", content: call.result.text }, { role: "user", content: buildTasteRepairMessage(check.errors) });
      }
      throw new TasteWriteError("글이 검사를 통과하지 못했어요.", "INVALID", lastErrors);
    },
  };
}
