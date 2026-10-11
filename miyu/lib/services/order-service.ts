// 주문·결제 흐름. 금액과 주문 소유자는 항상 서버 기록으로 확인하고,
// 결제사 승인 확인이 끝난 뒤에만 구매 권한(paid)을 준다.

import {
  createOrderNumber,
  orderStatusFor,
  USER_CANCEL_CODES,
  type GatewayPayment,
  type OrderStatus,
} from "../commerce/order.ts";
import { PERSONAL_REPORT } from "../config/product.ts";
import type { MiyuRepository, OrderRecord, PaymentEventSource, PaymentGateway } from "./ports.ts";

export type StartCheckoutResult =
  | { kind: "order"; order: OrderRecord }
  | { kind: "already-paid"; order: OrderRecord }
  | { kind: "not-found" };

/**
 * 결제 시작. 결제를 누를 때마다 새 주문번호를 만들고, 남아 있던 대기 주문은 취소 처리한다.
 * (같은 검사에 대기 주문은 하나만 — DB 고유 조건으로도 막는다)
 */
export async function startCheckout(
  deps: { repo: MiyuRepository; now: () => Date; newOrderNumber?: (now: Date) => string },
  input: { userId: string; assessmentId: string },
): Promise<StartCheckoutResult> {
  const { repo } = deps;
  const assessment = await repo.getAssessment(input.assessmentId);
  if (!assessment || assessment.userId !== input.userId) return { kind: "not-found" };

  const orders = await repo.listOrdersForAssessment(assessment.id);
  const paid = orders.find((o) => o.status === "paid" && o.productId === PERSONAL_REPORT.id);
  if (paid) return { kind: "already-paid", order: paid };

  for (const pending of orders.filter((o) => o.status === "pending")) {
    const canceled = await repo.updateOrder(pending.id, ["pending"], {
      status: "canceled",
      failureCode: "SUPERSEDED",
      failureMessage: "새 결제 요청으로 대체됨",
    });
    if (canceled) {
      await repo.addPaymentEvent({ orderId: pending.id, source: "checkout", status: "SUPERSEDED", detail: {} });
    }
  }

  const makeNumber = deps.newOrderNumber ?? ((now: Date) => createOrderNumber(now));
  const inserted = await repo.insertOrder({
    orderNumber: makeNumber(deps.now()),
    userId: input.userId,
    assessmentId: assessment.id,
    productId: PERSONAL_REPORT.id,
    amount: PERSONAL_REPORT.priceKrw,
  });
  if (inserted.ok) return { kind: "order", order: inserted.value };

  // 동시에 두 번 눌러 다른 요청이 먼저 만든 경우: 그 주문을 쓴다
  const latest = await repo.listOrdersForAssessment(assessment.id);
  const existing = latest.find((o) => o.status === "pending") ?? latest.find((o) => o.status === "paid");
  if (!existing) throw new Error("주문을 만들지 못했습니다.");
  return existing.status === "paid" ? { kind: "already-paid", order: existing } : { kind: "order", order: existing };
}

export type ConfirmPaymentResult =
  | { kind: "paid"; order: OrderRecord }
  /** 결제사 응답을 받지 못해 결과를 아직 모름 — 주문은 대기 상태로 두고 웹훅·재확인으로 맞춘다 */
  | { kind: "checking"; order: OrderRecord }
  | { kind: "rejected"; code: string; message: string; order: OrderRecord | null }
  | { kind: "not-found" };

/** 결제 성공 주소로 돌아온 뒤 서버에서 승인 */
export async function confirmPayment(
  deps: { repo: MiyuRepository; gateway: PaymentGateway },
  input: { userId: string; orderNumber: string; paymentKey: string; amount: number },
): Promise<ConfirmPaymentResult> {
  const { repo, gateway } = deps;
  const order = await repo.getOrderByNumber(input.orderNumber);
  if (!order || order.userId !== input.userId) return { kind: "not-found" };

  if (order.status === "paid") {
    return order.paymentKey === input.paymentKey
      ? { kind: "paid", order }
      : { kind: "rejected", code: "ALREADY_PAID", message: "이미 결제가 완료된 주문입니다.", order };
  }
  if (order.status !== "pending") {
    return { kind: "rejected", code: "ORDER_NOT_PAYABLE", message: "결제할 수 없는 주문입니다. 다시 결제해 주세요.", order };
  }
  // 주소에 담긴 금액이 서버 주문 금액과 다르면 승인하지 않는다 (승인하지 않은 결제는 자동 만료)
  if (!Number.isInteger(input.amount) || input.amount !== order.amount) {
    await repo.addPaymentEvent({
      orderId: order.id,
      source: "confirm",
      status: "AMOUNT_MISMATCH",
      detail: { requested: input.amount, expected: order.amount },
    });
    return { kind: "rejected", code: "AMOUNT_MISMATCH", message: "결제 금액이 주문 금액과 다릅니다.", order };
  }

  let result = await gateway.confirm({ paymentKey: input.paymentKey, orderId: order.orderNumber, amount: order.amount });
  if (!result.ok && result.code === "ALREADY_PROCESSED_PAYMENT") {
    result = await gateway.getPayment(input.paymentKey);
  }

  if (result.ok) {
    const applied = await applyPayment(repo, order, result.payment, "confirm");
    if (applied.kind === "paid") return applied;
    if (applied.kind === "updated") {
      return { kind: "rejected", code: `PAYMENT_${result.payment.status}`, message: "결제가 완료되지 않았습니다.", order: applied.order };
    }
    return { kind: "rejected", code: applied.code, message: applied.message, order: applied.order };
  }

  await repo.addPaymentEvent({ orderId: order.id, source: "confirm", status: result.code, detail: { retryable: result.retryable } });
  if (result.retryable) return { kind: "checking", order };

  const failed = await repo.updateOrder(order.id, ["pending"], {
    status: "failed",
    failureCode: result.code,
    failureMessage: result.message,
  });
  return { kind: "rejected", code: result.code, message: result.message, order: failed ?? order };
}

/** 결제 실패 주소로 돌아온 경우: 대기 주문을 취소·실패로 정리한다 */
export async function markCheckoutFailed(
  deps: { repo: MiyuRepository },
  input: { userId: string; orderNumber: string; code: string; message: string },
): Promise<OrderRecord | null> {
  const order = await deps.repo.getOrderByNumber(input.orderNumber);
  if (!order || order.userId !== input.userId || order.status !== "pending") return null;
  const status: OrderStatus = USER_CANCEL_CODES.includes(input.code) ? "canceled" : "failed";
  const updated = await deps.repo.updateOrder(order.id, ["pending"], {
    status,
    failureCode: input.code.slice(0, 100),
    failureMessage: input.message.slice(0, 300),
  });
  if (updated) {
    await deps.repo.addPaymentEvent({ orderId: order.id, source: "fail_redirect", status: input.code.slice(0, 100), detail: {} });
  }
  return updated;
}

export type SyncResult =
  | { kind: "updated"; order: OrderRecord }
  | { kind: "unchanged"; order: OrderRecord }
  | { kind: "ignored"; reason: string };

/**
 * 웹훅 등으로 결제 상태가 바뀌었다는 알림을 받았을 때.
 * 알림 내용은 믿지 않고, 결제사에 결제를 다시 조회한 결과로만 주문을 맞춘다.
 * 결제사 조회가 일시적으로 실패하면 오류를 던져 웹훅 재전송을 받는다.
 */
export async function syncPayment(
  deps: { repo: MiyuRepository; gateway: PaymentGateway },
  input: { paymentKey: string },
): Promise<SyncResult> {
  const result = await deps.gateway.getPayment(input.paymentKey);
  if (!result.ok) {
    if (result.retryable) throw new Error(`결제 조회 실패: ${result.code}`);
    return { kind: "ignored", reason: result.code };
  }
  const order = await deps.repo.getOrderByNumber(result.payment.orderId);
  if (!order) return { kind: "ignored", reason: "UNKNOWN_ORDER" };

  const applied = await applyPayment(deps.repo, order, result.payment, "webhook");
  if (applied.kind === "paid") return { kind: order.status === "paid" ? "unchanged" : "updated", order: applied.order };
  if (applied.kind === "updated") return { kind: "updated", order: applied.order };
  return { kind: "unchanged", order: applied.order };
}

type ApplyResult =
  | { kind: "paid"; order: OrderRecord }
  | { kind: "updated"; order: OrderRecord }
  | { kind: "unchanged"; order: OrderRecord; code: string; message: string };

/** 결제사 기록을 주문에 반영한다. 같은 내용을 여러 번 반영해도 결과가 같다. */
async function applyPayment(
  repo: MiyuRepository,
  order: OrderRecord,
  payment: GatewayPayment,
  source: PaymentEventSource,
): Promise<ApplyResult> {
  const detail = { method: payment.method, approvedAt: payment.approvedAt, totalAmount: payment.totalAmount };
  if (payment.orderId !== order.orderNumber || payment.totalAmount !== order.amount) {
    await repo.addPaymentEvent({ orderId: order.id, source, status: "PAYMENT_MISMATCH", detail: { ...detail, status: payment.status } });
    return { kind: "unchanged", order, code: "PAYMENT_MISMATCH", message: "결제 정보가 주문과 맞지 않습니다. 고객센터로 문의해 주세요." };
  }
  await repo.addPaymentEvent({ orderId: order.id, source, status: payment.status, detail });

  const target = orderStatusFor(payment);
  if (target === "paid") {
    if (order.status === "paid") return { kind: "paid", order };
    let updated: OrderRecord | null;
    try {
      updated = await repo.updateOrder(order.id, ["pending", "failed", "canceled"], {
        status: "paid",
        paymentKey: payment.paymentKey,
        method: payment.method,
        approvedAt: payment.approvedAt,
        failureCode: null,
        failureMessage: null,
      });
    } catch {
      // 같은 검사에 이미 결제된 다른 주문이 있으면 DB가 막는다 → 운영자 확인(환불) 대상
      await repo.addPaymentEvent({ orderId: order.id, source, status: "DUPLICATE_PAYMENT", detail });
      return { kind: "unchanged", order, code: "DUPLICATE_PAYMENT", message: "이미 결제된 주문이 있습니다. 고객센터로 문의해 주세요." };
    }
    if (updated) return { kind: "paid", order: updated };
    const fresh = (await repo.getOrderByNumber(order.orderNumber)) ?? order;
    return fresh.status === "paid"
      ? { kind: "paid", order: fresh }
      : { kind: "unchanged", order: fresh, code: "ORDER_NOT_PAYABLE", message: "결제할 수 없는 주문입니다." };
  }
  if (target === "refunded") {
    const updated = await repo.updateOrder(order.id, ["paid"], { status: "refunded" });
    return updated ? { kind: "updated", order: updated } : { kind: "unchanged", order, code: "NO_CHANGE", message: "" };
  }
  if (target === "failed") {
    const updated = await repo.updateOrder(order.id, ["pending"], { status: "failed", failureCode: payment.status });
    return updated ? { kind: "updated", order: updated } : { kind: "unchanged", order, code: "NO_CHANGE", message: "" };
  }
  return { kind: "unchanged", order, code: "NO_CHANGE", message: "" };
}
