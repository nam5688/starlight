import "server-only";
import { createTossPaymentGateway } from "@/lib/integrations/tosspayments/gateway";
import { createSupabaseRepository } from "@/lib/integrations/supabase/repository";
import { devReportGenerator } from "@/lib/report/generate-dev-report";
import { sajuEngine } from "@/lib/saju/engine";
import { paymentConfig } from "./env";
import { createAdminSupabase, createServerSupabase } from "./supabase";

// 웹 채널에서 쓰는 구현체 묶음. 다른 채널은 같은 서비스(lib/services)에 다른 구현체를 넘긴다.

/** 쓰기용 저장소 (서버 비밀키). 서비스에서 소유자를 확인한 뒤에만 쓴다. */
export function writeRepository() {
  return createSupabaseRepository(createAdminSupabase());
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

/** 리포트 생성기 — AI 해석이 연결되면 여기서 바꾼다 */
export const reportGenerator = devReportGenerator;

export { sajuEngine };

export const now = () => new Date();
