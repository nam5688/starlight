// 실제 AI 시험의 공통 설정 규칙 — 리포트 생성과 채팅 질문이 **하나의 승인**(AI_APPROVED_*)을 나눠 쓴다(운영자 승인 2026-10-15: 5,000원).
// 환경변수를 읽는 함수(read)만 받아 판단한다(채널 독립 · 네트워크 없음). 서버(server/env.ts)가 process.env로 부른다. 키 값은 어디에도 돌려주지 않는다.
//
//  리포트: AI_PROVIDER=anthropic → 실제 호출. 아래가 모두 있어야 한다(하나라도 없거나 상한을 넘으면 호출하지 않는다):
//    ANTHROPIC_API_KEY · AI_APPROVED_KRW(승인 금액) · AI_APPROVED_CALLS(승인 호출 수) · AI_APPROVED_FROM / AI_APPROVED_THROUGH(승인 기간, 한국 날짜 YYYY-MM-DD)
//    선택: AI_FX_KRW_PER_USD(환율 가정, 기본 1,600) · AI_BASE_URL(로컬 시험 서버 http://127.0.0.1:포트 — 실제 Anthropic 주소를 바꿀 수 없게 로컬 주소만 받는다)
//  채팅: AI_CHAT_PROVIDER=anthropic도 같은 AI_APPROVED_*를 쓴다(채팅 전용 AI_CHAT_APPROVED_*는 AI_APPROVED_*를 하나도 적지 않았을 때만 옛 방식으로 읽는다).
//  호출한 금액 · 호출 수는 두 곳(리포트 + 채팅)이 한 장부로 센다 — 승인 금액은 둘을 합친 한도다.
import { LIVE_TEST_LIMITS, REPORT_AI_MODEL } from "../../config/ai-candidates.ts";
import { checkApprovalShape, type ChatApproval, type ChatPricing } from "../chat/approval.ts";
import { DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE } from "./budget.ts";

/** 리포트 한 건을 만들 때의 모델 설정 — 비교 실행(compare-plan)에서 실제로 통과한 값과 같게 둔다(테스트가 같은지 확인) */
export const REPORT_AI_LIMITS = { maxOutputTokens: 24_000, callTimeoutMs: 300_000, effort: "medium" } as const;

export type LiveApproval = { approval: ChatApproval; pricing: ChatPricing; model: string; baseUrl?: string };
export type LiveApprovalResult =
  | { ok: true; value: LiveApproval }
  /** present: AI_APPROVED_* 중 하나라도 적었는가 — 적었는데 모자라면 채팅이 옛 방식으로 몰래 넘어가지 않게 이유를 그대로 돌려준다 */
  | { ok: false; present: boolean; reason: string };

const NAMES = ["AI_APPROVED_KRW", "AI_APPROVED_CALLS", "AI_APPROVED_FROM", "AI_APPROVED_THROUGH"] as const;

export function resolveLiveApproval(read: (name: string) => string): LiveApprovalResult {
  const raw = { krw: read(NAMES[0]), calls: read(NAMES[1]), from: read(NAMES[2]), through: read(NAMES[3]) };
  const present = Boolean(raw.krw || raw.calls || raw.from || raw.through);
  if (!raw.krw || !raw.calls || !raw.from || !raw.through) {
    return { ok: false, present, reason: "승인 금액 · 호출 수 · 기간(AI_APPROVED_KRW · CALLS · FROM · THROUGH)을 직접 적기 전에는 호출하지 않아요" };
  }
  const approval: ChatApproval = { capKrw: Number(raw.krw), maxCalls: Number(raw.calls), from: raw.from, through: raw.through };
  const issue = checkApprovalShape(approval, LIVE_TEST_LIMITS);
  if (issue) return { ok: false, present, reason: issue };
  const fxRaw = read("AI_FX_KRW_PER_USD");
  const fx = fxRaw ? Number(fxRaw) : DEFAULT_FX_KRW_PER_USD;
  if (!Number.isFinite(fx) || fx <= 0) return { ok: false, present, reason: "AI_FX_KRW_PER_USD는 0보다 큰 숫자여야 해요" };
  const baseUrl = read("AI_BASE_URL");
  if (baseUrl && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(baseUrl)) return { ok: false, present, reason: "AI_BASE_URL은 로컬 주소(http://127.0.0.1:포트)만 쓸 수 있어요" };
  return { ok: true, value: { approval, pricing: { price: REPORT_AI_MODEL.price, fxKrwPerUsd: fx, surcharge: DEFAULT_SURCHARGE }, model: REPORT_AI_MODEL.modelId, ...(baseUrl ? { baseUrl } : {}) } };
}

/** 리포트 생성의 실제 Anthropic 설정 (AI_PROVIDER=anthropic) */
export type ReportAnthropicConfig = { kind: "anthropic"; apiKey: string; model: string; approval: ChatApproval; pricing: ChatPricing; baseUrl?: string } | { kind: "invalid"; reason: string };

export function resolveReportAnthropic(read: (name: string) => string): ReportAnthropicConfig {
  const apiKey = read("ANTHROPIC_API_KEY");
  if (!apiKey) return { kind: "invalid", reason: "ANTHROPIC_API_KEY가 비어 있어요 (.env.local에 직접 입력)" };
  const live = resolveLiveApproval(read);
  if (!live.ok) return { kind: "invalid", reason: live.reason };
  return { kind: "anthropic", apiKey, model: live.value.model, approval: live.value.approval, pricing: live.value.pricing, ...(live.value.baseUrl ? { baseUrl: live.value.baseUrl } : {}) };
}
