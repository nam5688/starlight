import "server-only";
import type { PaidCompat } from "@/lib/config/sale-switch";
import { compatReadinessOf, type CompatReadiness } from "@/lib/compat/readiness";
import { saleOpenOf } from "./sale-switch";
import { reportGenerator } from "./services";

/**
 * 사주 궁합 · 리포트 궁합이 지금 받을 수 있는 상태인가 — 판매 스위치(`saleOpenOf`)와 풀이를 쓰는 AI 연결(`reportGenerator`)을 요청할 때 함께 확인한다.
 * 홈 · /compat · /pair가 같은 값을 보여 "지금 이용 가능"과 "준비 중"이 어긋나지 않게 한다. AI 설정 · 결제 가드는 바꾸지 않는다.
 */
export function compatReadinessFor(sale: PaidCompat): CompatReadiness {
  const generator = reportGenerator();
  const generatorReady = Boolean(sale === "saju-compat" ? generator.generateCompat : generator.generatePair);
  return compatReadinessOf({ saleOpen: saleOpenOf(sale), generatorReady });
}
