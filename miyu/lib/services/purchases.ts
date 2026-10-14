// 같은 검사 결과에 붙은 개인 통합 리포트 주문 — 한 사람이 같은 결과로 리포트를 여러 번 받을 수 있다(운영자 2026-10-15).
// 받은 리포트는 모두 기록으로 남고 이미 받은 리포트는 바뀌지 않는다. 순수 함수만 둔다(저장소를 부르지 않는다).

import { isPersonalProduct, parsePersonalSeq } from "../config/product.ts";
import type { OrderRecord } from "./ports.ts";

/** 받은 시점(결제 승인 시각, 없으면 주문 시각) */
export const receivedAt = (o: Pick<OrderRecord, "approvedAt" | "createdAt">) => o.approvedAt ?? o.createdAt;

const time = (iso: string) => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** 결제가 끝난 개인 통합 리포트 주문 — 최근에 받은 것부터 (시각은 표기 방식(+09:00 · Z)이 달라도 같은 기준으로 비교한다) */
export function paidPersonalOrders(orders: readonly OrderRecord[]): OrderRecord[] {
  return orders
    .filter((o) => o.status === "paid" && isPersonalProduct(o.productId))
    .sort((a, b) => time(receivedAt(b)) - time(receivedAt(a)) || time(b.createdAt) - time(a.createdAt));
}

/** 다음에 받는 리포트가 몇 번째인지 — 이미 결제됐거나 환불된 주문의 가장 큰 번째 + 1 (아직 받은 것이 없으면 1) */
export function nextPersonalSeq(orders: readonly OrderRecord[]): number {
  let max = 0;
  for (const o of orders) {
    if (o.status !== "paid" && o.status !== "refunded") continue;
    max = Math.max(max, parsePersonalSeq(o.productId) ?? 0);
  }
  return max + 1;
}
