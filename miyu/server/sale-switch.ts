import "server-only";
import { saleOpenFor, type PaidCompat } from "@/lib/config/sale-switch";
import { paymentConfig } from "./env";

/**
 * 사주 궁합 · 리포트 궁합이 지금 판매 중인가 — 코드의 판매 스위치가 기본이고, 로컬 · 스테이징 시험에서만 `MIYU_TEST_OPEN_SALES`로 덮어쓸 수 있다.
 * 결제가 테스트 모드가 아니면(실결제 모드 · 결제 설정 전) 덮어쓰기는 듣지 않는다.
 */
export function saleOpenOf(sale: PaidCompat): boolean {
  const config = paymentConfig();
  return saleOpenFor(sale, { list: process.env.MIYU_TEST_OPEN_SALES, liveMode: config.ok ? config.liveMode : true });
}
