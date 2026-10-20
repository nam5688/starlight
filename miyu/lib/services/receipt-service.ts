// 구매자가 자기 결제의 영수증을 여는 길 — 결제사(토스페이먼츠)가 준 공식 영수증 주소만 본인 주문에 한해 돌려준다.
// 규칙: ① 로그인한 구매자의 주문만(남의 주문 · 없는 주문은 구분 없이 not-found) ② 결제가 승인된 적 있는 주문만 ③ 결제사 기록(주문번호 조회)을 지금 다시 읽어
// 주문번호 · 금액이 우리 주문과 같을 때만 ④ 주소는 공식 도메인 검사(officialReceiptUrl)를 통과한 것만. 결제키 · 카드 정보는 이 서비스의 결과에 들어가지 않고 저장하지도 않는다. 영수증을 우리가 만들지 않는다.
import { officialReceiptUrl, receiptEligible } from "../commerce/receipt.ts";
import type { MiyuRepository, PaymentGateway } from "./ports.ts";

export type ReceiptResult =
  | { kind: "ok"; url: string }
  /** 없는 주문이거나 본인 주문이 아니다 — 둘을 구분해 알리지 않는다 */
  | { kind: "not-found" }
  /** 결제가 승인된 적 없는 주문(대기 · 실패 · 만료) */
  | { kind: "no-payment" }
  | { kind: "unavailable"; reason: "lookup-failed" | "mismatch" | "no-receipt" };

const PAID_STATUSES = new Set(["DONE", "CANCELED", "PARTIAL_CANCELED"]);

export async function receiptFor(deps: { repo: MiyuRepository; gateway: PaymentGateway }, input: { userId: string; orderNumber: string }): Promise<ReceiptResult> {
  const order = await deps.repo.getOrderByNumber(input.orderNumber);
  if (!order || order.userId !== input.userId) return { kind: "not-found" };
  if (!receiptEligible(order.status)) return { kind: "no-payment" };
  const result = await deps.gateway.getPaymentByOrderId(order.orderNumber).catch(() => null);
  if (!result || !result.ok) return { kind: "unavailable", reason: "lookup-failed" };
  const payment = result.payment;
  // 결제사 기록이 이 주문의 것이 아니면(주문번호 · 금액 불일치, 승인된 적 없는 상태) 영수증을 열지 않는다
  if (payment.orderId !== order.orderNumber || payment.totalAmount !== order.amount || !PAID_STATUSES.has(payment.status)) return { kind: "unavailable", reason: "mismatch" };
  // 결제사 응답을 읽는 쪽(gateway)이 이미 검사했지만, 어떤 결제 연결이든 검사되지 않은 주소가 구매자에게 가지 않도록 여기서 한 번 더 같은 검사를 한다
  const url = officialReceiptUrl(payment.receiptUrl);
  if (!url) return { kind: "unavailable", reason: "no-receipt" };
  return { kind: "ok", url };
}
