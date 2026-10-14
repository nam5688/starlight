import "server-only";
import { createAnthropicModel } from "@/lib/integrations/ai/providers";
import { createMockLocalModel } from "@/lib/integrations/ai/mock-local";
import { tallyUsage, withChatApproval } from "@/lib/report/chat/approval";
import { createChatAnswerer, type ChatAnswerer } from "@/lib/report/chat/answer";
import { CHAT_LIMITS } from "@/lib/report/chat/plan";
import type { TalkChat } from "@/lib/report/reading/talk";
import type { CapacityConfig } from "@/lib/services/capacity-service";
import { COUNT_ALL_SINCE } from "@/lib/services/chat-service";
import { capacityConfig, chatAiConfig, chatConfig } from "./env";
import { now, writeRepository } from "./services";

/** 사용 기록을 읽는 최대 줄 수 — 시험 기간(며칠)의 채팅 호출은 이보다 훨씬 적다. 넘으면 읽지 못한 것으로 보고 호출하지 않는다 */
const USAGE_ROWS_MAX = 2000;

// 승인 가드는 프로세스 안에서 센 값(local ledger)을 가진다 — 요청마다 새로 만들면 그 값이 사라지므로 설정이 같은 동안 하나를 계속 쓴다
let cached: { key: string; answerer: ChatAnswerer } | null = null;

/**
 * 자유 질문에 답하는 AI — 자유 질문 AI 설정(server/env.ts chatAiConfig)에 따라 고른다. 연결된 AI가 없으면 null(자유 질문은 "준비 중").
 * - 로컬 가짜 AI(AI_PROVIDER=mock-local): 비용 없음
 * - 실제 Anthropic(AI_CHAT_PROVIDER=anthropic): 운영자가 .env.local에 적은 승인 금액 · 호출 수 · 기간 안에서만 호출한다(승인 가드가 호출마다 확인, 지키지 못하면 제공사에 요청이 나가지 않는다)
 */
export function chatAnswerer(): ChatAnswerer | null {
  const cfg = chatAiConfig();
  if (cfg.kind === "mock-local") return createChatAnswerer({ model: createMockLocalModel({ baseUrl: cfg.baseUrl }) });
  if (cfg.kind !== "anthropic") return null;
  const key = `${cfg.model}|${cfg.approval.capKrw}|${cfg.approval.maxCalls}|${cfg.approval.from}|${cfg.approval.through}|${cfg.pricing.fxKrwPerUsd}|${cfg.baseUrl ?? ""}`;
  if (cached?.key === key) return cached.answerer;
  const raw = createAnthropicModel({ apiKey: cfg.apiKey, model: cfg.model, effort: "low", timeoutMs: CHAT_LIMITS.thinkingCallTimeoutMs, ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}) });
  const model = withChatApproval(raw, {
    approval: cfg.approval,
    pricing: cfg.pricing,
    now,
    loadSpend: async (sinceIso, unknownRowKrw) => {
      const rows = await writeRepository().listAiUsageSince(sinceIso, USAGE_ROWS_MAX);
      if (rows.length >= USAGE_ROWS_MAX) throw new Error("사용 기록이 너무 많아 합계를 낼 수 없어요");
      return tallyUsage(rows, raw, { surcharge: cfg.pricing.surcharge, unknownRowKrw });
    },
  });
  const answerer = createChatAnswerer({
    model,
    maxOutputTokens: CHAT_LIMITS.thinkingMaxOutputTokens,
    callTimeoutMs: CHAT_LIMITS.thinkingCallTimeoutMs,
    totalTimeoutMs: CHAT_LIMITS.thinkingTotalTimeoutMs,
  });
  cached = { key, answerer };
  return answerer;
}

/**
 * 사용 기록의 비용 계산에 쓰는 설정 — 실제 Anthropic이면 모델 단가(달러) × 환율을 원 / 100만 토큰으로 바꿔 채운다(그래야 호출마다 비용이 사용 기록에 남고 승인 가드가 합계를 센다).
 * 운영자가 AI_PRICE_*를 직접 적었다면 그 값을 먼저 쓴다.
 */
export function chatCapacity(): CapacityConfig {
  const base = capacityConfig();
  const cfg = chatAiConfig();
  if (cfg.kind !== "anthropic") return base;
  return {
    ...base,
    priceInputKrwPerMTok: base.priceInputKrwPerMTok ?? cfg.pricing.price.inputUsdPerMTok * cfg.pricing.fxKrwPerUsd,
    priceOutputKrwPerMTok: base.priceOutputKrwPerMTok ?? cfg.pricing.price.outputUsdPerMTok * cfg.pricing.fxKrwPerUsd,
  };
}

/**
 * 자유 질문 · 이야기 이어 가기의 상태.
 * - 리포트를 받은 분(paid): AI가 연결돼 있으면 열린다(하루 횟수 한도)
 * - 무료 맛보기(free): 로그인한 분께 무료 질문 2번(AI_CHAT_FREE_LIMIT, 기본 2)을 열어 주고, 쓰고 나면 "리포트를 받으면 열려요"로 잠긴다(3번째부터는 리포트).
 *   방의 무료 풀이에 내 자료로 읽은 내용이 없으면 그 방의 무료 질문은 열지 않는다(roomModelFor의 noMaterial)
 * 연결 전에는 "준비 중"으로 밝힌다(작동하는 것처럼 보이지 않게 한다). 12번 DB 변경 전이라 횟수를 셀 수 없을 때도 준비 중이다.
 */
export async function chatStateFor(tier: "paid" | "free", userId: string): Promise<TalkChat> {
  const answerer = chatAnswerer();
  const cfg = chatConfig();
  if (!answerer) return { state: "pending" };
  if (tier === "paid") return cfg.dailyLimit > 0 ? { state: "ready" } : { state: "pending" };
  if (cfg.freeLimit <= 0) return { state: "locked" };
  try {
    const used = await writeRepository().countChatQuestionsSince(userId, COUNT_ALL_SINCE);
    return used >= cfg.freeLimit ? { state: "locked", used: true } : { state: "ready", free: true, left: cfg.freeLimit - used };
  } catch {
    return { state: "pending" };
  }
}
