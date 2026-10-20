import "server-only";
import { saleOpenFor, type PaidCompat } from "@/lib/config/sale-switch";
import { paymentConfig } from "./env";

/**
 * 사주 궁합 · 리포트 궁합이 지금 판매 중인가 — 실결제 스위치는 코드(`saleOpen`, 꺼짐)이고, **시험 결제 모드에서는 코드의 `testModeOpen`으로 열린다**(운영자 2026-10-20).
 * 시험 결제 모드에서만 `MIYU_TEST_OPEN_SALES`(더 열기) · `MIYU_TEST_CLOSE_SALES`(닫기)가 들린다. 결제가 테스트 모드가 아니면(실결제 모드 · 결제 설정 전) 어느 것도 듣지 않는다.
 */
export function saleOpenOf(sale: PaidCompat): boolean {
  const config = paymentConfig();
  return saleOpenFor(sale, { list: process.env.MIYU_TEST_OPEN_SALES, closeList: process.env.MIYU_TEST_CLOSE_SALES, liveMode: config.ok ? config.liveMode : true });
}
