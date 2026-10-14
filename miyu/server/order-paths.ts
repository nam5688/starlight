// 주문이 끝난 뒤 고객이 돌아갈 화면 — 개인 통합 리포트는 결과 화면(다시 받은 리포트는 그 주문의 리포트), 고민 반영 리포트는 나의 고민 기록소(결제 완료 뒤에는 그 기록의 리포트).
// (비밀값을 다루지 않는 순수 함수라 "server-only" 없이 두고 테스트한다)

import { parseConcernProductId, parsePersonalSeq } from "../lib/config/product.ts";

export function resultPathOf(order: { assessmentId: string; productId: string; orderNumber?: string }, opts: { paid?: boolean } = {}): string {
  const recordId = parseConcernProductId(order.productId);
  if (!recordId) {
    // 같은 결과로 다시 받은 리포트(2번째부터)는 그 주문의 리포트를 바로 연다 — 이미 받은 리포트가 먼저 보이지 않게
    const seq = parsePersonalSeq(order.productId);
    return seq !== null && seq > 1 && order.orderNumber ? `/results/${order.assessmentId}?r=${encodeURIComponent(order.orderNumber)}` : `/results/${order.assessmentId}`;
  }
  return opts.paid ? `/results/${order.assessmentId}/context/${recordId}` : `/results/${order.assessmentId}/context`;
}
