import "server-only";
import { REPORT_GENERATION_TIMEOUT_LIVE_MS, REPORT_GENERATION_TIMEOUT_MAX_MS } from "@/lib/commerce/report";
import { resolveReportAnthropic, type ReportAnthropicConfig } from "@/lib/report/ai/live-config";
import { resolveChatAi, type ChatAiConfig } from "@/lib/report/chat/ai-config";
import type { CapacityConfig } from "@/lib/services/capacity-service";
import { DEFAULT_EXTRA_QUESTIONS, type ChatServiceConfig } from "@/lib/services/chat-service";
import type { PaymentEnv } from "@/lib/services/ports";
import { isTossDocsKey } from "./setup-checks";

// 웹 채널 서버 설정. 값은 .env.local(로컬) 또는 Vercel 환경변수에서 읽는다.
// 값이 없으면 해당 기능은 "설정 전"으로 표시되고 동작하지 않는다.

function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function supabaseEnv() {
  return {
    url: read("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    secretKey: read("SUPABASE_SECRET_KEY"),
  };
}

/** 카카오 로그인·저장에 필요한 Supabase 값이 모두 있는지 */
export function isAuthConfigured(): boolean {
  const e = supabaseEnv();
  return Boolean(e.url && e.publishableKey && e.secretKey);
}

export type PaymentConfig =
  | { ok: true; clientKey: string; secretKey: string; liveMode: boolean; apiBaseUrl: string | undefined }
  | { ok: false; reason: string };

/**
 * 토스페이먼츠 결제 설정 확인.
 * - 주문서형(결제위젯) 키를 쓴다: 클라이언트 키 *_gck_, 시크릿 키 *_gsk_
 * - PAYMENTS_LIVE_MODE=true가 아니면 테스트 키(test_)만 허용한다 → 운영자 승인 전 실결제 차단
 */
export function paymentConfig(): PaymentConfig {
  if (!isAuthConfigured()) return { ok: false, reason: "로그인 설정 전" };
  const clientKey = read("NEXT_PUBLIC_TOSS_CLIENT_KEY");
  const secretKey = read("TOSS_SECRET_KEY");
  if (!clientKey || !secretKey) return { ok: false, reason: "결제 키 설정 전" };

  const liveMode = read("PAYMENTS_LIVE_MODE") === "true";
  const prefix = liveMode ? "live_" : "test_";
  if (!clientKey.startsWith(`${prefix}gck_`) || !secretKey.startsWith(`${prefix}gsk_`)) {
    return {
      ok: false,
      reason: liveMode ? "실결제 모드에는 live_gck_ / live_gsk_ 키가 필요합니다" : "테스트 모드에는 test_gck_ / test_gsk_ 키만 쓸 수 있습니다",
    };
  }

  // 결제사 API 주소는 로컬 검증에서만 바꿀 수 있다
  const apiBaseUrl = read("TOSS_API_BASE_URL") || undefined;
  if (apiBaseUrl && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(apiBaseUrl)) {
    return { ok: false, reason: "TOSS_API_BASE_URL은 로컬 검증용으로만 쓸 수 있습니다" };
  }
  return { ok: true, clientKey, secretKey, liveMode, apiBaseUrl };
}

/** 주문에 남길 결제 환경 (실결제 / 내 상점 테스트 키 / 토스 문서 예제용 공용 테스트 키) */
export function paymentEnvOf(config: Extract<PaymentConfig, { ok: true }>): PaymentEnv {
  if (config.liveMode) return "live";
  return isTossDocsKey(config.clientKey) || isTossDocsKey(config.secretKey) ? "test-docs" : "test";
}

/**
 * 운영 알림용 텔레그램 값 — 둘 다 있을 때만 보낸다 (없으면 서버 로그에만 남긴다).
 * TELEGRAM_API_BASE_URL은 로컬 검증용 가짜 텔레그램 서버(127.0.0.1 / localhost)에만 쓸 수 있고, 그 밖의 주소는 무시한다.
 */
export function telegramEnv(): { botToken: string; chatId: string; apiBase?: string } | null {
  const botToken = read("TELEGRAM_BOT_TOKEN");
  const chatId = read("TELEGRAM_CHAT_ID");
  if (!botToken || !chatId) return null;
  const override = read("TELEGRAM_API_BASE_URL");
  try {
    const url = override ? new URL(override) : null;
    if (url && (url.hostname === "127.0.0.1" || url.hostname === "localhost")) return { botToken, chatId, apiBase: url.origin };
  } catch {
    // 잘못된 값은 무시하고 실제 텔레그램 주소를 쓴다
  }
  return { botToken, chatId };
}

/** 관리자 화면에 들어갈 수 있는 회원번호(Supabase user id) 목록 — 비어 있으면 관리자 화면은 열리지 않는다 */
export function adminUserIds(): string[] {
  return read("ADMIN_USER_IDS")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

/** 정기 실행(재확인 작업) 주소의 인증값 — 비어 있으면 정기 실행 주소는 닫혀 있다 */
export function cronSecret(): string {
  return read("CRON_SECRET");
}

export type AiConfig =
  /** AI 연결 전 — 개발용 규칙 생성기를 쓴다 */
  | { kind: "none" }
  /** 로컬 검증용 가짜 AI 서버 (127.0.0.1 / localhost만) — 비용 없음 */
  | { kind: "mock-local"; baseUrl: string }
  /** 실제 Anthropic — 운영자가 .env.local에 승인 금액 · 호출 수 · 기간(AI_APPROVED_*)을 직접 적었을 때만. 호출마다 승인 가드가 확인한다(server/live-ai.ts) */
  | Extract<ReportAnthropicConfig, { kind: "anthropic" }>
  /** 설정에 이름은 있지만 아직 만들지 않은 제공사 · 잘못된 값 · 승인 값이 빠짐 — 개발용 생성기로 두고 /setup에 이유를 보여준다 */
  | { kind: "invalid"; reason: string };

/**
 * 리포트 AI 설정. 규칙과 환경변수 이름은 lib/report/ai/live-config.ts에 있다.
 * - AI_PROVIDER 비움 → 개발용 규칙 생성기
 * - AI_PROVIDER=mock-local + AI_MOCK_URL=http://127.0.0.1:포트 → 로컬 가짜 AI 서버로 v2 리포트 흐름 검증
 * - AI_PROVIDER=anthropic → 실제 Claude (ANTHROPIC_API_KEY + AI_APPROVED_KRW · CALLS · FROM · THROUGH를 직접 적어야 하고, 하나라도 없으면 개발용 생성기로 두고 호출하지 않는다)
 */
export function aiConfig(): AiConfig {
  const provider = read("AI_PROVIDER");
  if (!provider) return { kind: "none" };
  if (provider === "mock-local") {
    const baseUrl = read("AI_MOCK_URL");
    if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(baseUrl)) {
      return { kind: "invalid", reason: "AI_MOCK_URL은 로컬 주소(http://127.0.0.1:포트)만 쓸 수 있습니다" };
    }
    return { kind: "mock-local", baseUrl };
  }
  if (provider === "anthropic") return resolveReportAnthropic(read);
  return { kind: "invalid", reason: `AI 제공사 ${provider}는 아직 연결하지 않았습니다 (anthropic만 있어요)` };
}

function readInt(name: string, fallback: number): number {
  const raw = read(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function readPrice(name: string): number | null {
  const raw = read(name);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * 생성 용량 · 비용 한도 (lib/services/capacity-service.ts).
 * AI를 연결하기 전(개발용 규칙 생성기)에는 한도를 걸지 않는다. AI를 연결하면 기본값이 적용되고 환경변수로 조절한다.
 * - AI_MAX_CONCURRENT: 동시에 생성하는 최대 수 (기본 3)
 * - AI_SALE_QUEUE_LIMIT: 대기 + 생성 중인 리포트가 이 수 이상이면 새 결제를 시작하지 못하게 함 (기본 10)
 * - AI_DAILY_BUDGET_KRW: 하루 AI 예산(원). 0 또는 비움 = 제한 없음
 * - AI_EST_COST_KRW_PER_REPORT: 리포트 한 건의 예상 비용(원) — 대기 중인 건을 예산에 미리 반영
 * - AI_GENERATION_TIMEOUT_SECONDS: 리포트 한 번의 생성 시도에 허용하는 시간(초, 기본 240 · 실제 AI 연결 시 480). 생성 중 상태가 멈춘 것으로 보는 600초보다 1분 짧게(최대 540)만 설정할 수 있다
 * - AI_PRICE_INPUT_KRW_PER_MTOK · AI_PRICE_OUTPUT_KRW_PER_MTOK: 토큰 단가(원 / 100만 토큰). 제공사를 정한 뒤 공식 가격표 값을 넣는다
 */
export function capacityConfig(): CapacityConfig {
  const ai = aiConfig();
  const live = ai.kind === "anthropic";
  const connected = live || ai.kind === "mock-local";
  // 실제 AI는 가격표(달러) × 환율로 호출마다 비용을 기록한다(그래야 승인 가드와 하루 예산이 합계를 센다). 운영자가 AI_PRICE_*를 직접 적었다면 그 값이 먼저다
  const fx = live ? ai.pricing.fxKrwPerUsd : 0;
  const timeoutSec = readInt("AI_GENERATION_TIMEOUT_SECONDS", 0);
  return {
    maxConcurrent: connected ? readInt("AI_MAX_CONCURRENT", 3) : readInt("AI_MAX_CONCURRENT", 0),
    saleQueueLimit: connected ? readInt("AI_SALE_QUEUE_LIMIT", 10) : readInt("AI_SALE_QUEUE_LIMIT", 0),
    dailyBudgetKrw: readInt("AI_DAILY_BUDGET_KRW", 0),
    estCostKrwPerReport: readInt("AI_EST_COST_KRW_PER_REPORT", live ? 350 : 0),
    priceInputKrwPerMTok: readPrice("AI_PRICE_INPUT_KRW_PER_MTOK") ?? (live ? ai.pricing.price.inputUsdPerMTok * fx : null),
    priceOutputKrwPerMTok: readPrice("AI_PRICE_OUTPUT_KRW_PER_MTOK") ?? (live ? ai.pricing.price.outputUsdPerMTok * fx : null),
    // 0이면 기본값(실제 AI는 8분, 그 밖은 4분). 멈춤 판단(10분)보다 1분 짧게만 허용한다 (그래야 시간 초과가 먼저 실패로 기록된다)
    generationTimeoutMs: timeoutSec > 0 ? Math.min(timeoutSec * 1000, REPORT_GENERATION_TIMEOUT_MAX_MS) : live ? REPORT_GENERATION_TIMEOUT_LIVE_MS : 0,
  };
}

/**
 * 자유 질문(채팅에서 직접 적는 질문) 설정
 * - 방마다 무료 질문 수 · 간단/심층 리포트별 열리는 방은 lib/config/product.ts의 CHAT_ROOMS 한 곳에서 정한다 (환경변수가 아니다).
 * - AI_CHAT_EXTRA_QUESTIONS: **시험 중에만** 열린 방마다 무료 질문을 이만큼 더 준다 (기본 0). 시험이 끝나면 비운다.
 * 질문마다 AI 호출 비용이 든다. 하루 AI 예산(AI_DAILY_BUDGET_KRW)에 닿아도 새 질문만 멈춘다. 무료 질문을 다 쓰면 질문 한 개당 결제(300원)로 이어 간다.
 */
export function chatConfig(): ChatServiceConfig {
  return { extraQuestions: readInt("AI_CHAT_EXTRA_QUESTIONS", DEFAULT_EXTRA_QUESTIONS) };
}

/**
 * 자유 질문의 AI 설정 (리포트 AI 설정 AI_PROVIDER와 따로). 규칙과 환경변수 이름은 lib/report/chat/ai-config.ts에 있다.
 * 요약: 비움 → (AI_PROVIDER=mock-local이면 가짜 AI 서버, 아니면) 연결 없음 / anthropic → 승인 금액 · 호출 수 · 기간을 운영자가 직접 적어야 한다(없으면 호출하지 않는다). 키 값은 어디에도 출력하지 않는다.
 */
export function chatAiConfig(): ChatAiConfig {
  const ai = aiConfig();
  return resolveChatAi(read, ai.kind === "mock-local" ? { baseUrl: ai.baseUrl } : null);
}

/** 공개 주소 — 검색 · 공유용 주소(sitemap · robots · 공유 이미지)의 기준. 배포 전에는 로컬 주소 */
export function siteUrl(): string {
  const raw = read("SITE_URL");
  return /^https?:\/\/[^/]+$/.test(raw) ? raw : "http://localhost:3000";
}
