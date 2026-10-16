import "server-only";
import { createAnthropicModel } from "@/lib/integrations/ai/providers";
import { createMockLocalModel } from "@/lib/integrations/ai/mock-local";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { TASTE_LIMITS } from "@/lib/report/taste/plan";
import { tasteAnswersOf } from "@/lib/report/taste/input";
import { createTasteWriter, type TasteWriter } from "@/lib/report/taste/writer";
import type { TasteDeps, TasteLoad } from "@/lib/services/taste-service";
import { chatAiConfig } from "./env";
import { chatCapacity, guardedAnthropicModel } from "./chat";
import { roomModelFor, viewTier, type ResultView } from "./talk-model";
import { now, writeRepository } from "./services";

// 승인 가드는 프로세스 안에서 센 값을 가진다 — 요청마다 새로 만들면 그 값이 사라지므로 설정이 같은 동안 하나를 계속 쓴다
let cached: { key: string; writer: TasteWriter } | null = null;

/**
 * 맛보기 리포트를 쓰는 AI — 자유 질문과 같은 AI 설정(AI_CHAT_PROVIDER)과 같은 승인 · 같은 장부를 쓴다. 연결된 AI가 없으면 null(맛보기 리포트는 "준비 중").
 * - 로컬 가짜 AI(AI_PROVIDER=mock-local): 비용 없음
 * - 실제 Anthropic(AI_CHAT_PROVIDER=anthropic): 운영자가 환경변수에 적은 승인 금액 · 호출 수 · 기간 안에서만 호출한다(승인 가드가 호출마다 확인, 지키지 못하면 제공사에 요청이 나가지 않는다)
 */
export function tasteWriter(): TasteWriter | null {
  const cfg = chatAiConfig();
  if (cfg.kind === "mock-local") return createTasteWriter({ model: createMockLocalModel({ baseUrl: cfg.baseUrl }) });
  if (cfg.kind !== "anthropic") return null;
  const key = `${cfg.shared}|${cfg.model}|${cfg.approval.capKrw}|${cfg.approval.maxCalls}|${cfg.approval.from}|${cfg.approval.through}|${cfg.pricing.fxKrwPerUsd}|${cfg.baseUrl ?? ""}`;
  if (cached?.key === key) return cached.writer;
  const raw = createAnthropicModel({ apiKey: cfg.apiKey, model: cfg.model, effort: "low", timeoutMs: TASTE_LIMITS.callTimeoutMs, ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}) });
  const writer = createTasteWriter({ model: guardedAnthropicModel(cfg, raw) });
  cached = { key, writer };
  return writer;
}

/** 맛보기 리포트를 받을 수 있게 AI가 연결돼 있는가 */
export const tasteConnected = () => tasteWriter() !== null;

/** 서버가 저장된 결과에서 AI가 읽을 근거(무료 미리보기가 이미 공개한 사주 · 응답 문구 + 실제 응답)를 다시 만든다 — 브라우저가 보낸 글을 믿지 않는다 */
export function tasteInputOf(view: ResultView): TasteLoad {
  if (view.paidOrder || viewTier(view) === "paid") return { ok: false, reason: "owned" };
  const model = roomModelFor(view, { paid: { state: "ready" }, free: { state: "ready", free: true } }).model;
  const profile = model.tasteProfile;
  if (!profile) return { ok: false, reason: "not-found" };
  return { ok: true, input: { profile, answers: tasteAnswersOf(view.assessment.answers, ASSESSMENT_MODULES) } };
}

export function tasteDeps(loadInput: TasteDeps["loadInput"]): TasteDeps {
  return { repo: writeRepository(), writer: tasteWriter(), now, capacity: chatCapacity(), loadInput };
}
