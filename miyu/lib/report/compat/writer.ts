// 사주 궁합 풀이 쓰기 — 모델에 한 번 묻고, 검사(validate.ts)에 걸리면 이유를 알려 한 번 고쳐 쓰게 한다. 그래도 걸리면 실패로 돌려준다(잘못된 글을 보이지 않는다).
// 호출마다 사용 기록(ctx.onUsage)을 남기고 시간 제한을 둔다. 제공사를 직접 부르지 않는다 — TextModel 약속으로만.
// 아직 서비스에 연결하지 않았다(판매 · 저장 · 승인 가드 연결 전) — 개발용 화면과 시험에서만 쓴다.
import type { Evidence } from "../evidence.ts";
import type { GenerateContext } from "../generator.ts";
import { createModelCaller } from "../ai/model-caller.ts";
import { ModelCallError, type ModelMessage, type TextModel } from "../ai/model.ts";
import { buildCompatRepairMessage, buildCompatUserMessage, COMPAT_PROMPT_VERSION, COMPAT_SYSTEM_PROMPT } from "./prompt.ts";
import type { CompatDraftV1 } from "./types.ts";
import { validateCompatDraft } from "./validate.ts";

export const COMPAT_WRITE_LIMITS = { maxOutputTokens: 12_000, callTimeoutMs: 120_000, totalTimeoutMs: 300_000 } as const;

export class CompatWriteError extends Error {
  readonly code: "INVALID" | "MODEL";
  readonly errors: string[];
  constructor(message: string, code: "INVALID" | "MODEL", errors: string[] = []) {
    super(message);
    this.code = code;
    this.errors = errors;
  }
}

export type CompatWriterOptions = { model: TextModel; maxRepairs?: number; maxRetries?: number; sleep?: (ms: number) => Promise<void> };

export interface CompatWriter {
  write(input: { evidence: Evidence[]; cautions?: string[] }, ctx?: GenerateContext): Promise<CompatDraftV1>;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
}

export function createCompatWriter(opts: CompatWriterOptions): CompatWriter {
  const caller = createModelCaller({ model: opts.model, maxRetries: opts.maxRetries ?? 1, sleep: opts.sleep, maxOutputTokens: COMPAT_WRITE_LIMITS.maxOutputTokens, callTimeoutMs: COMPAT_WRITE_LIMITS.callTimeoutMs });
  const maxRepairs = opts.maxRepairs ?? 1;
  const spec = { system: COMPAT_SYSTEM_PROMPT, promptVersion: COMPAT_PROMPT_VERSION };
  return {
    provider: opts.model.provider,
    model: opts.model.model,
    promptVersion: COMPAT_PROMPT_VERSION,
    async write(input, ctx = {}) {
      const messages: ModelMessage[] = [{ role: "user", content: buildCompatUserMessage(input.evidence, input.cautions) }];
      let lastErrors: string[] = [];
      for (let round = 0; round <= maxRepairs; round++) {
        let call: Awaited<ReturnType<typeof caller.call>>;
        try {
          call = await caller.call(messages, ctx, spec);
        } catch (e) {
          // 고쳐 쓰는 중에 호출이 실패했다면 모델이 이미 한 번 응답한 요청이다(비용이 들었다) — 호출 전 실패와 구분한다
          if (e instanceof ModelCallError) throw round > 0 ? new CompatWriteError("글이 검사를 통과하지 못했어요.", "INVALID", lastErrors) : new CompatWriteError("AI 호출에 실패했어요.", "MODEL");
          throw e;
        }
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(call.result.text.slice(call.result.text.indexOf("{"), call.result.text.lastIndexOf("}") + 1));
        } catch {
          parsed = null;
        }
        const check = validateCompatDraft(parsed, input.evidence);
        if (check.ok) {
          caller.recordResult(ctx, spec, call, "ok");
          return check.draft;
        }
        caller.recordResult(ctx, spec, call, "invalid", "VALIDATION");
        lastErrors = check.errors;
        messages.push({ role: "assistant", content: call.result.text }, { role: "user", content: buildCompatRepairMessage(check.errors) });
      }
      throw new CompatWriteError("글이 검사를 통과하지 못했어요.", "INVALID", lastErrors);
    },
  };
}
