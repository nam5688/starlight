import "server-only";
import { createTossPaymentGateway } from "@/lib/integrations/tosspayments/gateway";
import { createSupabaseBenefitRepository } from "@/lib/integrations/supabase/benefits";
import { createSupabaseReviewRepository } from "@/lib/integrations/supabase/reviews";
import { createSupabasePairRepository } from "@/lib/integrations/supabase/pairs";
import { createSupabaseRepository } from "@/lib/integrations/supabase/repository";
import { createMockLocalModel } from "@/lib/integrations/ai/mock-local";
import { REPORT_GENERATION } from "@/lib/config/product";
import { createAiReportGenerator } from "@/lib/report/ai/generator";
import { devReportGenerator } from "@/lib/report/generate-dev-report";
import type { ReportGenerator } from "@/lib/report/generator";
import { manseryeokEngine } from "@/lib/saju/manseryeok-engine";
import { aiConfig, paymentConfig } from "./env";
import { liveReportGenerator } from "./live-ai";
import { createAdminSupabase, createServerSupabase } from "./supabase";

// 웹 채널에서 쓰는 구현체 묶음. 다른 채널은 같은 서비스(lib/services)에 다른 구현체를 넘긴다.

/** 쓰기용 저장소 (서버 비밀키). 서비스에서 소유자를 확인한 뒤에만 쓴다. */
export function writeRepository() {
  return createSupabaseRepository(createAdminSupabase());
}

/**
 * 혜택(포인트 · 질문권 · 쿠폰 · 추천) 쓰기용 저장소 (서버 비밀키). 지급 · 차감 · 확정은 모두 서버만 부르고, 서비스에서 소유자를 확인한 뒤에만 쓴다.
 * 혜택 표 · 함수가 아직 없는 DB(19~22번 전)에서는 호출이 42P01로 실패하고 서비스가 "준비 중"으로 처리한다.
 */
export function benefitRepository() {
  return createSupabaseBenefitRepository(createAdminSupabase());
}

/**
 * 이용 후기(리뷰) 쓰기 · 관리용 저장소 (서버 비밀키). 소유자 확인은 서비스(lib/services/review-service.ts)가 한다.
 * 후기 표 · 함수가 아직 없는 DB(25번 전)에서는 호출이 42P01로 실패하고 서비스가 "준비 중" · 빈 목록으로 처리한다.
 */
export function reviewRepository() {
  return createSupabaseReviewRepository(createAdminSupabase());
}

/**
 * 리포트 궁합(쌍 · 동의 · 연결) 쓰기용 저장소 (서버 비밀키). 쌍 표는 서버만 읽고 쓴다(브라우저에서는 볼 수 없다).
 * 24번 전의 DB에서는 호출이 42P01로 실패하고 서비스가 "준비 중"으로 처리한다.
 */
export function pairRepository() {
  return createSupabasePairRepository(createAdminSupabase());
}

/** 화면 조회용 저장소 (로그인한 사용자 권한, RLS 적용) */
export async function readRepository() {
  return createSupabaseRepository(await createServerSupabase());
}

export function paymentGateway() {
  const config = paymentConfig();
  if (!config.ok) throw new Error(`결제 설정 전: ${config.reason}`);
  return createTossPaymentGateway({ secretKey: config.secretKey, baseUrl: config.apiBaseUrl });
}

/**
 * 리포트 생성기 — AI 설정(server/env.ts aiConfig)에 따라 고른다.
 * 어떤 생성기로 만들었는지는 리포트에 이름 · 버전으로 함께 저장된다.
 */
export function reportGenerator(): ReportGenerator {
  const ai = aiConfig();
  if (ai.kind === "mock-local") return createAiReportGenerator({ model: createMockLocalModel({ baseUrl: ai.baseUrl }), format: REPORT_GENERATION.format });
  // 실제 Claude — 운영자가 승인 금액 · 호출 수 · 기간을 직접 적었을 때만(없으면 aiConfig가 invalid가 되어 개발용 생성기로 두고 호출하지 않는다)
  if (ai.kind === "anthropic") return liveReportGenerator(ai);
  return devReportGenerator;
}

/** 사주 계산 엔진 (manseryeok, 계산 기준은 lib/saju/policy.ts) */
export const sajuEngine = manseryeokEngine;

export const now = () => new Date();
