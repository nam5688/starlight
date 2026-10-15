// 자유 질문의 AI 설정 규칙 — 환경변수를 읽는 함수(read)만 받아 판단한다(채널 독립 · 네트워크 없음). 서버(server/env.ts)가 process.env로 부른다.
//  - AI_CHAT_PROVIDER 비움 → 리포트용 가짜 AI(AI_PROVIDER=mock-local)가 있으면 그것, 아니면 연결 없음("준비 중")
//  - AI_CHAT_PROVIDER=anthropic → 실제 호출. 아래가 모두 있어야 한다(하나라도 없거나 상한을 넘으면 호출하지 않는다):
//      ANTHROPIC_API_KEY · 승인 금액 · 호출 수 · 기간 — **공통 승인(AI_APPROVED_KRW · CALLS · FROM · THROUGH, 리포트 생성과 한 장부로 센다, 상한 5,000원)을 적었다면 그것을 쓰고**,
//      하나도 적지 않았을 때만 채팅 전용 옛 값(AI_CHAT_APPROVED_KRW · CALLS · FROM · THROUGH, 상한 1,500원 · 승인 기간 3일)을 읽는다.
//    선택: AI_CHAT_FX_KRW_PER_USD(환율 가정, 기본 1,600) · AI_CHAT_BASE_URL(로컬 시험 서버 http://127.0.0.1:포트 — 실제 Anthropic 주소를 바꿀 수 없게 로컬 주소만 받는다)
//  모델 · 가격은 lib/config/ai-candidates.ts의 한 곳에서 정한다. 이 파일은 키 값을 어디에도 돌려주지 않는다(설정 객체 안에서만 호출 코드로 간다).
import { CHAT_AI_MODEL, CHAT_TEST_LIMITS } from "../../config/ai-candidates.ts";
import { DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE } from "../ai/budget.ts";
import { resolveLiveApproval } from "../ai/live-config.ts";
import { checkApprovalShape, type ChatApproval, type ChatPricing } from "./approval.ts";

export type ChatAiConfig =
  /** 연결된 AI 없음 — 자유 질문은 "준비 중" */
  | { kind: "none" }
  /** 로컬 검증용 가짜 AI 서버 — 비용 없음 */
  | { kind: "mock-local"; baseUrl: string }
  /** 실제 Anthropic — 운영자가 승인 금액 · 호출 수 · 기간을 직접 적었을 때만(approval.ts가 호출마다 지킨다) */
  | { kind: "anthropic"; apiKey: string; model: string; approval: ChatApproval; pricing: ChatPricing; baseUrl?: string; shared: boolean }
  /** 설정이 빠졌거나 잘못됨 — 자유 질문은 "준비 중", 이유는 /setup에 보인다 (키 · 값은 출력하지 않는다) */
  | { kind: "invalid"; reason: string };

export function resolveChatAi(read: (name: string) => string, mockLocal: { baseUrl: string } | null): ChatAiConfig {
  const provider = read("AI_CHAT_PROVIDER");
  if (!provider) return mockLocal ? { kind: "mock-local", baseUrl: mockLocal.baseUrl } : { kind: "none" };
  if (provider !== "anthropic") return { kind: "invalid", reason: `자유 질문 AI 제공사 ${provider}는 연결하지 않았어요 (anthropic만 있어요)` };
  const apiKey = read("ANTHROPIC_API_KEY");
  if (!apiKey) return { kind: "invalid", reason: "ANTHROPIC_API_KEY가 비어 있어요 (.env.local에 직접 입력)" };
  // 공통 승인(리포트 + 채팅이 한 장부로 쓰는 5,000원 시험)을 적었다면 그것이 먼저다 — 적다 만 경우에는 옛 방식으로 몰래 넘어가지 않고 이유를 알린다
  const live = resolveLiveApproval(read);
  if (live.ok) {
    const v = live.value;
    return { kind: "anthropic", apiKey, model: v.model, approval: v.approval, pricing: v.pricing, shared: true, ...(v.baseUrl ? { baseUrl: v.baseUrl } : {}) };
  }
  if (live.present) return { kind: "invalid", reason: live.reason };
  const raw = { krw: read("AI_CHAT_APPROVED_KRW"), calls: read("AI_CHAT_APPROVED_CALLS"), from: read("AI_CHAT_APPROVED_FROM"), through: read("AI_CHAT_APPROVED_THROUGH") };
  if (!raw.krw || !raw.calls || !raw.from || !raw.through) {
    return { kind: "invalid", reason: "승인 금액 · 호출 수 · 기간(AI_APPROVED_KRW · CALLS · FROM · THROUGH)을 직접 적기 전에는 호출하지 않아요" };
  }
  const approval: ChatApproval = { capKrw: Number(raw.krw), maxCalls: Number(raw.calls), from: raw.from, through: raw.through };
  const issue = checkApprovalShape(approval, CHAT_TEST_LIMITS);
  if (issue) return { kind: "invalid", reason: issue };
  const fxRaw = read("AI_CHAT_FX_KRW_PER_USD");
  const fx = fxRaw ? Number(fxRaw) : DEFAULT_FX_KRW_PER_USD;
  if (!Number.isFinite(fx) || fx <= 0) return { kind: "invalid", reason: "AI_CHAT_FX_KRW_PER_USD는 0보다 큰 숫자여야 해요" };
  const baseUrl = read("AI_CHAT_BASE_URL");
  if (baseUrl && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(baseUrl)) return { kind: "invalid", reason: "AI_CHAT_BASE_URL은 로컬 주소(http://127.0.0.1:포트)만 쓸 수 있어요" };
  return { kind: "anthropic", apiKey, model: CHAT_AI_MODEL.modelId, approval, pricing: { price: CHAT_AI_MODEL.price, fxKrwPerUsd: fx, surcharge: DEFAULT_SURCHARGE }, shared: false, ...(baseUrl ? { baseUrl } : {}) };
}
