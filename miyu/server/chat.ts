import "server-only";
import { createMockLocalModel } from "@/lib/integrations/ai/mock-local";
import { createChatAnswerer, type ChatAnswerer } from "@/lib/report/chat/answer";
import type { TalkChat } from "@/lib/report/reading/talk";
import { aiConfig, chatConfig } from "./env";

/**
 * 자유 질문에 답하는 AI — AI 설정(server/env.ts aiConfig)에 따라 고른다. 연결된 AI가 없으면 null(자유 질문은 "준비 중").
 * 실제 AI 제공사 연결 · 유료 호출은 운영자 승인 뒤에 aiConfig에 제공사를 더하며, 이 함수는 그때 같은 방식으로 답변기를 만든다.
 */
export function chatAnswerer(): ChatAnswerer | null {
  const ai = aiConfig();
  if (ai.kind === "mock-local") return createChatAnswerer({ model: createMockLocalModel({ baseUrl: ai.baseUrl }) });
  return null;
}

/**
 * 자유 질문 · 이야기 이어 가기의 상태 — 무료 맛보기(리포트를 받기 전)는 잠겨 있고, 리포트를 받은 분은 AI가 연결돼 있을 때만 열린다.
 * 연결 전에는 "준비 중"으로 밝힌다(작동하는 것처럼 보이지 않게 한다).
 */
export function chatStateFor(tier: "paid" | "free"): TalkChat {
  if (tier === "free") return { state: "locked" };
  return chatAnswerer() && chatConfig().dailyLimit > 0 ? { state: "ready" } : { state: "pending" };
}
