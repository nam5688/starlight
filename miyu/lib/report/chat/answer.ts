// 자유 질문 답변 생성 — 모델에 한 번 묻고, 검사(validate.ts)에 걸리면 이유를 알려 한 번 고쳐 쓰게 한다. 그래도 걸리면 실패로 돌려준다(잘못된 글을 보이지 않는다).
// 호출마다 사용 기록(ctx.onUsage)을 남기고 시간 제한을 둔다. 제공사를 직접 부르지 않는다 — TextModel 약속으로만.
import type { GenerateContext } from "../generator.ts";
import { createModelCaller } from "../ai/model-caller.ts";
import { ModelCallError, type ModelMessage, type TextModel } from "../ai/model.ts";
import { CHAT_LIMITS as L } from "./plan.ts";
import { buildChatRepairMessage, buildChatUserMessage, CHAT_PROMPT_VERSION, CHAT_SYSTEM_PROMPT } from "./prompt.ts";
import type { ChatAnswer, ChatAsk } from "./types.ts";
import { validateChatAnswer } from "./validate.ts";

export class ChatAnswerError extends Error {
  readonly code: "INVALID" | "MODEL";
  readonly errors: string[];
  constructor(message: string, code: "INVALID" | "MODEL", errors: string[] = []) {
    super(message);
    this.code = code;
    this.errors = errors;
  }
}

export interface ChatAnswerer {
  /** 답을 만든다. 모델 호출 · 검사에 실패하면 ChatAnswerError를 던진다 */
  answer(ask: ChatAsk, ctx?: GenerateContext): Promise<ChatAnswer>;
  readonly provider: string;
  readonly model: string;
  /** 질문 한 번에 걸리는 전체 시간 (밀리초) — 없으면 CHAT_LIMITS.totalTimeoutMs */
  readonly totalTimeoutMs?: number;
}

export type ChatAnswererOptions = {
  model: TextModel;
  /** 검사에 걸렸을 때 고쳐 쓰게 하는 횟수 (기본 1) */
  maxRepairs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  /** 모델이 쓸 수 있는 최대 출력 (토큰). 생각하는 데 쓰는 토큰이 같이 들어가는 모델은 CHAT_LIMITS.maxOutputTokens보다 넉넉히 준다 */
  maxOutputTokens?: number;
  /** 모델 호출 한 번의 제한 시간 · 질문 한 번의 전체 시간 (밀리초) */
  callTimeoutMs?: number;
  totalTimeoutMs?: number;
};

export function createChatAnswerer(opts: ChatAnswererOptions): ChatAnswerer {
  const caller = createModelCaller({ model: opts.model, maxRetries: opts.maxRetries ?? 1, sleep: opts.sleep, maxOutputTokens: opts.maxOutputTokens ?? L.maxOutputTokens, callTimeoutMs: opts.callTimeoutMs ?? L.callTimeoutMs });
  const maxRepairs = opts.maxRepairs ?? 1;
  const spec = { system: CHAT_SYSTEM_PROMPT, promptVersion: CHAT_PROMPT_VERSION };
  return {
    provider: opts.model.provider,
    model: opts.model.model,
    totalTimeoutMs: opts.totalTimeoutMs,
    async answer(ask, ctx = {}) {
      const messages: ModelMessage[] = [{ role: "user", content: buildChatUserMessage(ask) }];
      let lastErrors: string[] = [];
      for (let round = 0; round <= maxRepairs; round++) {
        let call: Awaited<ReturnType<typeof caller.call>>;
        try {
          call = await caller.call(messages, ctx, spec);
        } catch (e) {
          // 첫 응답이 검사에 걸려 고쳐 쓰는 중에 호출이 실패했다면, 모델이 이미 한 번 응답한 질문이다(비용이 들었다) — 호출 전에 실패한 질문과 달리 INVALID로 센다
          if (e instanceof ModelCallError) throw round > 0 ? new ChatAnswerError("답이 검사를 통과하지 못했어요.", "INVALID", lastErrors) : new ChatAnswerError("AI 호출에 실패했어요.", "MODEL");
          throw e;
        }
        const check = validateChatAnswer(call.result.text);
        if (check.ok) {
          caller.recordResult(ctx, spec, call, "ok");
          return { paragraphs: check.paragraphs };
        }
        caller.recordResult(ctx, spec, call, "invalid", "VALIDATION");
        lastErrors = check.errors;
        messages.push({ role: "assistant", content: call.result.text }, { role: "user", content: buildChatRepairMessage(check.errors) });
      }
      throw new ChatAnswerError("답이 검사를 통과하지 못했어요.", "INVALID", lastErrors);
    },
  };
}
