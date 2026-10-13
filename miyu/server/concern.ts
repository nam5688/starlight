import "server-only";
import type { IssuingAvailability } from "@/lib/services/concern-service";
import { reportGenerator } from "./services";

/**
 * 고민 반영 리포트를 지금 발급할 수 있는 환경인가 — 고민을 해석에 반영하는 AI 생성기가 연결돼 있어야 한다.
 * 개발용 규칙 생성기는 고민을 반영하지 못하므로, 그때는 결제를 시작하지 않고 화면에서 사유와 함께 막는다.
 */
export function issuingAvailability(): IssuingAvailability {
  const generator = reportGenerator();
  return generator.generateConcern && generator.usesContext ? { enabled: true } : { enabled: false, reason: "ai-not-connected" };
}
