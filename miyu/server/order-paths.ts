// 주문이 끝난 뒤 고객이 돌아갈 화면 — 개인 통합 리포트는 결과 화면, 고민 반영 리포트는 나의 고민 기록소(결제 완료 뒤에는 그 기록의 리포트).
// (비밀값을 다루지 않는 순수 함수라 "server-only" 없이 두고 테스트한다)

import { parseConcernProductId } from "../lib/config/product.ts";

export function resultPathOf(order: { assessmentId: string; productId: string }, opts: { paid?: boolean } = {}): string {
  const recordId = parseConcernProductId(order.productId);
  if (!recordId) return `/results/${order.assessmentId}`;
  return opts.paid ? `/results/${order.assessmentId}/context/${recordId}` : `/results/${order.assessmentId}/context`;
}
