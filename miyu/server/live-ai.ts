import "server-only";
import { REPORT_GENERATION } from "@/lib/config/product";
import { createAnthropicModel } from "@/lib/integrations/ai/providers";
import { createSupabaseRepository } from "@/lib/integrations/supabase/repository";
import type { TextModel } from "@/lib/report/ai/model";
import { createAiReportGenerator, type AiGeneratorOptions } from "@/lib/report/ai/generator";
import { REPORT_AI_LIMITS } from "@/lib/report/ai/live-config";
import { createApprovalLedger, tallyUsage, withChatApproval, type ChatApproval, type ChatPricing } from "@/lib/report/chat/approval";
import type { ReportGenerator } from "@/lib/report/generator";
import type { AiConfig } from "./env";
import { createAdminSupabase } from "./supabase";

// 실제 AI(Anthropic) 연결 — 리포트 생성과 채팅 질문이 **하나의 승인**(AI_APPROVED_*)과 **하나의 장부**를 나눠 쓴다(운영자 승인 2026-10-15: 5,000원).
// 호출마다 승인 가드(lib/report/chat/approval.ts)가 기간 · 최악 비용 · 호출 수 · 지금까지 쓴 금액을 확인해 어기면 제공사에 요청을 보내지 않는다.
// 이 파일은 services.ts(리포트)와 chat.ts(채팅)가 함께 부르므로 services.ts를 불러오지 않는다(순환 방지) — 사용 기록은 서버 비밀키 저장소로 직접 읽는다.

/** 사용 기록을 읽는 최대 줄 수 — 시험 기간(며칠)의 호출은 이보다 훨씬 적다. 넘으면 읽지 못한 것으로 보고 호출하지 않는다 */
const USAGE_ROWS_MAX = 2000;

/** 리포트 + 채팅이 나눠 쓰는 장부 — 프로세스 안에서 센 값(local)을 가지므로 요청마다 새로 만들지 않는다 */
const sharedLedger = createApprovalLedger();

type Approved = { approval: ChatApproval; pricing: ChatPricing };

/**
 * 모델 연결을 공통 승인 가드로 감싼다 — 리포트와 채팅이 같은 장부를 쓰고, 지금까지 쓴 금액은 이 제공사의 모든 사용 기록(리포트 · 채팅)에서 센다.
 * 채팅 전용 옛 승인(AI_CHAT_APPROVED_*)은 채팅 지시문 기록만 세므로 server/chat.ts가 따로 감싼다.
 */
export function approvedLiveModel(raw: TextModel, cfg: Approved): TextModel {
  return withChatApproval(raw, {
    approval: cfg.approval,
    pricing: cfg.pricing,
    now: () => new Date(),
    ledger: sharedLedger,
    loadSpend: async (sinceIso, unknownRowKrw) => {
      const rows = await createSupabaseRepository(createAdminSupabase()).listAiUsageSince(sinceIso, USAGE_ROWS_MAX);
      if (rows.length >= USAGE_ROWS_MAX) throw new Error("사용 기록이 너무 많아 합계를 낼 수 없어요");
      return tallyUsage(rows, raw, { surcharge: cfg.pricing.surcharge, unknownRowKrw, promptPrefix: "" });
    },
  });
}

/** 리포트 생성기 (AI_PROVIDER=anthropic) — 비교 실행에서 통과한 설정(읽기 구조 · 반복 고쳐 쓰기)과 같게 만든다. 내용 차이 검사는 보고만 한다(enforceDepth 끔) */
export function liveReportGenerator(ai: Extract<AiConfig, { kind: "anthropic" }>, extras: Pick<AiGeneratorOptions, "adaptEvidence" | "extraChecks"> = {}, format: "reading-v1" | "story-v1" = REPORT_GENERATION.format): ReportGenerator {
  const raw = createAnthropicModel({ apiKey: ai.apiKey, model: ai.model, effort: REPORT_AI_LIMITS.effort, timeoutMs: REPORT_AI_LIMITS.callTimeoutMs, ...(ai.baseUrl ? { baseUrl: ai.baseUrl } : {}) });
  return createAiReportGenerator({
    model: approvedLiveModel(raw, ai),
    format,
    maxOutputTokens: REPORT_AI_LIMITS.maxOutputTokens,
    callTimeoutMs: REPORT_AI_LIMITS.callTimeoutMs,
    repairRepeats: true,
    enforceDepth: false,
    // 장면 질문 테스트 화면(/dev/scenario)만 쓴다 — 응답 근거를 바꿔 끼우고 응답 사용 검사를 더한다. 기본은 없다(운영 경로는 그대로)
    ...extras,
  });
}
