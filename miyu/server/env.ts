import "server-only";
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

export type AiConfig =
  /** AI 연결 전 — 개발용 규칙 생성기를 쓴다 */
  | { kind: "none" }
  /** 로컬 검증용 가짜 AI 서버 (127.0.0.1 / localhost만) — 비용 없음 */
  | { kind: "mock-local"; baseUrl: string }
  /** 설정에 이름은 있지만 아직 만들지 않은 제공사 · 잘못된 값 — 개발용 생성기로 두고 /setup에 이유를 보여준다 */
  | { kind: "invalid"; reason: string };

/**
 * 리포트 AI 설정. 실제 유료 제공사(Anthropic · OpenAI · Google 등)는 운영자가 고른 뒤에 추가한다.
 * - AI_PROVIDER 비움 → 개발용 규칙 생성기
 * - AI_PROVIDER=mock-local + AI_MOCK_URL=http://127.0.0.1:포트 → 로컬 가짜 AI 서버로 v2 리포트 흐름 검증
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
  return { kind: "invalid", reason: `AI 제공사 ${provider}는 아직 연결하지 않았습니다 (선택 · 승인 후 추가)` };
}
