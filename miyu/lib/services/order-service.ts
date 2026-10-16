// 주문·결제 흐름. 금액과 주문 소유자는 항상 서버 기록으로 확인하고,
// 결제사 승인 확인이 끝난 뒤에만 구매 권한(paid)을 준다.

import {
  canceledAmountOf,
  createOrderNumber,
  orderStatusFor,
  USER_CANCEL_CODES,
  type GatewayPayment,
  type OrderStatus,
} from "../commerce/order.ts";
import { isInviteToken } from "../commerce/invite.ts";
import { INVITE_DISCOUNT, isCashProduct, isPersonalProduct, PERSONAL_REPORT, personalProductId } from "../config/product.ts";
import { salesClosedMessage, type GateReason, type SaleGate } from "./capacity-service.ts";
import type { Acquisition, CashRefundResult, MiyuRepository, OrderRecord, PaymentEnv, PaymentEventSource, PaymentGateway } from "./ports.ts";
import { nextPersonalSeq, paidPersonalOrders } from "./purchases.ts";

/** 새 구매를 받아도 되는지 확인하는 함수 (용량 · 예산). 확인 자체가 실패하면 판매를 막지 않는다 */
export type SaleGateCheck = (stage: "start" | "confirm") => Promise<SaleGate>;

async function gateOpen(gate: SaleGateCheck | undefined, stage: "start" | "confirm"): Promise<{ open: true } | { open: false; reason: GateReason | null }> {
  if (!gate) return { open: true };
  try {
    const g = await gate(stage);
    return g.open ? { open: true } : { open: false, reason: g.reason };
  } catch {
    return { open: true };
  }
}

export type StartCheckoutResult =
  /** discounted: 초대 할인(5,900원)이 확정된 주문 */
  | { kind: "order"; order: OrderRecord; discounted?: boolean }
  | { kind: "already-paid"; order: OrderRecord }
  /** 다시 받기를 눌렀지만 가장 최근에 받은 리포트가 아직 완성되지 않았다(만드는 중이거나 실패) — 새로 결제하지 않고 그 리포트의 상태를 안내한다 */
  | { kind: "report-not-ready"; order: OrderRecord }
  /** 지금은 새 구매를 받지 않음 (리포트 준비 용량 · 하루 예산). 결제는 시작하지 않는다 */
  | { kind: "sales-closed"; reason: GateReason | null }
  | { kind: "not-found" };

/**
 * 결제 시작. 결제를 누를 때마다 새 주문번호를 만들고, 남아 있던 대기 주문은 취소 처리한다.
 * (같은 검사에 같은 상품의 대기 주문은 하나만 — DB 고유 조건으로도 막는다)
 *
 * 같은 검사 결과로 리포트를 이미 받았다면 기본은 "이미 결제함"으로 돌려보낸다(실수로 두 번 결제하지 않게).
 * `again`을 켠 경우에만(고객이 "같은 결과로 새 리포트 받기"를 직접 눌렀을 때) 다음 번째 주문(상품 번호 `…:r2`, `…:r3`)을 새로 만든다 —
 * 이전에 받은 리포트 · 주문은 그대로 남고, 새 주문마다 리포트가 따로 만들어진다. 가장 최근 리포트가 아직 완성되지 않았다면 새로 결제하지 않는다.
 */
export async function startCheckout(
  deps: { repo: MiyuRepository; now: () => Date; newOrderNumber?: (now: Date) => string; gate?: SaleGateCheck },
  input: { userId: string; assessmentId: string; paymentEnv?: PaymentEnv; acquisition?: Acquisition | null; again?: boolean; inviteToken?: string | null },
): Promise<StartCheckoutResult> {
  const { repo } = deps;
  const assessment = await repo.getAssessment(input.assessmentId);
  if (!assessment || assessment.userId !== input.userId) return { kind: "not-found" };

  const orders = await repo.listOrdersForAssessment(assessment.id);
  const received = paidPersonalOrders(orders);
  if (received.length > 0) {
    if (!input.again) return { kind: "already-paid", order: received[0] };
    const latestReport = await repo.getReportByOrder(received[0].id);
    if (latestReport?.status !== "ready") return { kind: "report-not-ready", order: received[0] };
  }

  // 용량이나 예산이 찼으면 결제를 시작하지 않는다 (기다리게 하지 않고 바로 알린다). 이미 진행 중인 주문은 건드리지 않는다
  const sale = await gateOpen(deps.gate, "start");
  if (!sale.open) return { kind: "sales-closed", reason: sale.reason };

  // 개인 통합 리포트의 대기 주문만 대체한다 (고민 반영 리포트 · 미유캐시의 대기 주문은 건드리지 않는다)
  for (const pending of orders.filter((o) => o.status === "pending" && isPersonalProduct(o.productId))) {
    const canceled = await repo.updateOrder(pending.id, ["pending"], {
      status: "canceled",
      failureCode: "SUPERSEDED",
      failureMessage: "새 결제 요청으로 대체됨",
    });
    if (canceled) {
      await repo.addPaymentEvent({ orderId: pending.id, source: "checkout", status: "SUPERSEDED", detail: {} });
    }
  }

  const productId = personalProductId(received.length > 0 ? nextPersonalSeq(orders) : 1);
  const makeNumber = deps.newOrderNumber ?? ((now: Date) => createOrderNumber(now));
  const newOrder = (amount: number) => ({
    orderNumber: makeNumber(deps.now()),
    userId: input.userId,
    assessmentId: assessment.id,
    productId,
    amount,
    paymentEnv: input.paymentEnv ?? "test",
    acquisition: input.acquisition ?? null,
  });

  // 초대 할인(운영자 2026-10-16): 첫 구매이고 초대 링크로 들어왔으며 서버가 할인 대상이라고 확인했을 때만 5,900원 주문을 만들고, 만든 뒤 DB에서 한도 · 첫 구매를 한 번 더 확정한다.
  // 할인은 편의다 — 확인 · 확정이 어떤 이유로든 실패하면 정가 주문으로 이어 가고 구매를 막지 않는다.
  const inviteToken = received.length === 0 && isInviteToken(input.inviteToken) ? input.inviteToken : null;
  if (inviteToken) {
    const cap = INVITE_DISCOUNT.maxPerInviter;
    let eligible = false;
    try {
      eligible = (await repo.inviteDiscountStatus({ token: inviteToken, inviteeUserId: input.userId, cap })).ok;
    } catch {
      eligible = false;
    }
    if (eligible) {
      const discounted = await repo.insertOrder(newOrder(INVITE_DISCOUNT.priceKrw));
      if (discounted.ok) {
        let claimed = false;
        try {
          claimed = (await repo.claimInviteDiscount({ token: inviteToken, inviteeUserId: input.userId, orderId: discounted.value.id, cap })).ok;
        } catch {
          claimed = false;
        }
        if (claimed) {
          await repo.addPaymentEvent({ orderId: discounted.value.id, source: "checkout", status: "INVITE_DISCOUNT", detail: {} }).catch(() => {});
          return { kind: "order", order: discounted.value, discounted: true };
        }
        // 확정하지 못했다: 할인 주문은 취소하고(결제되지 않게) 정가 주문으로 이어 간다
        const canceled = await repo.updateOrder(discounted.value.id, ["pending"], { status: "canceled", failureCode: "DISCOUNT_DENIED", failureMessage: "초대 할인을 확정하지 못해 취소됨" });
        if (canceled) await repo.addPaymentEvent({ orderId: discounted.value.id, source: "checkout", status: "DISCOUNT_DENIED", detail: {} });
      }
      // 같은 검사에 이미 대기 주문이 있어 만들지 못한 경우(동시에 두 번 누름)는 아래 정가 경로의 충돌 처리가 기존 주문을 돌려준다
    }
  }

  const inserted = await repo.insertOrder(newOrder(PERSONAL_REPORT.priceKrw));
  if (inserted.ok) return { kind: "order", order: inserted.value };

  // 동시에 두 번 눌러 다른 요청이 먼저 만든 경우: 그 주문을 쓴다
  const latest = await repo.listOrdersForAssessment(assessment.id);
  const same = latest.filter((o) => o.productId === productId);
  const existing = same.find((o) => o.status === "pending") ?? same.find((o) => o.status === "paid");
  if (!existing) throw new Error("주문을 만들지 못했습니다.");
  return existing.status === "paid" ? { kind: "already-paid", order: existing } : { kind: "order", order: existing };
}

export type ConfirmPaymentResult =
  /** transitioned: 이번 요청이 주문을 결제 완료로 바꾼 경우만 true (이미 결제 완료였거나 동시에 다른 요청이 먼저 바꿨으면 false) — 승인 완료 알림은 이때만 보낸다 */
  | { kind: "paid"; order: OrderRecord; transitioned?: boolean }
  /**
   * 결제 결과를 아직 모름 — 주문은 대기 상태로 두고 재확인(결제사 주문번호 조회)으로 맞춘다. 고객에게는 다시 결제하라고 하지 않는다.
   * - gateway-unreachable: 결제사 응답을 받지 못함 (승인됐을 수도 있다)
   * - save-failed: 결제사는 승인했는데 우리 쪽 저장이 실패함 (운영자 알림 대상)
   */
  | { kind: "checking"; order: OrderRecord; reason: "gateway-unreachable" | "save-failed" }
  | { kind: "rejected"; code: string; message: string; order: OrderRecord | null }
  | { kind: "not-found" };

/** 결제 성공 주소로 돌아온 뒤 서버에서 승인 */
export async function confirmPayment(
  deps: { repo: MiyuRepository; gateway: PaymentGateway; gate?: SaleGateCheck },
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

  // 결제사에 승인을 요청하기 직전의 용량 · 예산 확인. 승인을 요청하지 않으면 카드에서 돈이 빠지지 않는다
  // (결제창에서 인증만 끝난 결제는 승인하지 않으면 시간이 지나 자동으로 만료된다)
  const sale = await gateOpen(deps.gate, "confirm");
  if (!sale.open) {
    await recordPaymentEvent(repo, { orderId: order.id, source: "confirm", status: "SALES_PAUSED", detail: { reason: sale.reason } });
    return { kind: "rejected", code: "SALES_PAUSED", message: salesClosedMessage(sale.reason), order };
  }

  let result = await gateway.confirm({ paymentKey: input.paymentKey, orderId: order.orderNumber, amount: order.amount });
  if (!result.ok && result.code === "ALREADY_PROCESSED_PAYMENT") {
    result = await gateway.getPayment(input.paymentKey);
  }

  if (result.ok) {
    let applied: ApplyResult;
    try {
      applied = await applyPayment(repo, order, result.payment, "confirm");
    } catch {
      // 결제사는 이미 승인했다. 저장 실패를 "결제 실패"로 알리거나 다시 결제하게 하지 않고, 확인 중으로 두고 재확인이 맞춘다.
      return { kind: "checking", order, reason: "save-failed" };
    }
    if (applied.kind === "paid") return applied;
    if (applied.kind === "updated") {
      return { kind: "rejected", code: `PAYMENT_${result.payment.status}`, message: "결제가 완료되지 않았습니다.", order: applied.order };
    }
    return { kind: "rejected", code: applied.code, message: applied.message, order: applied.order };
  }

  await repo.addPaymentEvent({ orderId: order.id, source: "confirm", status: result.code, detail: { retryable: result.retryable } });
  if (result.retryable) return { kind: "checking", order, reason: "gateway-unreachable" };

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
  /** to: 이번 알림 처리로 주문이 바뀐 상태 (partial-refunded: 주문은 결제 완료 그대로, 부분 취소를 묶음 장부에 반영함 — refund에 회수한 질문 수 · 누적 환불액) */
  | { kind: "updated"; order: OrderRecord; to?: "paid" | "refunded" | "failed" | "partial-refunded"; refund?: Extract<CashRefundResult, { status: "applied" }> }
  | { kind: "unchanged"; order: OrderRecord }
  /** 부분 취소를 장부에 반영하지 못했다 — 질문 수에 맞지 않는 취소 금액 · 묶음 장부가 없는 예전 주문 · DB 16번 전. 운영자가 확인해야 한다(재전송으로 풀리지 않는다) */
  | { kind: "attention"; order: OrderRecord; code: string; message: string }
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
  if (applied.kind === "paid" && applied.refund) {
    const att = refundAttention(applied.refund);
    if (att) return { kind: "attention", order: applied.order, ...att };
    if (applied.refund.status === "applied") return { kind: "updated", order: applied.order, to: "partial-refunded", refund: applied.refund };
  }
  if (applied.kind === "paid") return applied.transitioned ? { kind: "updated", order: applied.order, to: "paid" } : { kind: "unchanged", order: applied.order };
  if (applied.kind === "updated") return { kind: "updated", order: applied.order, to: applied.to };
  return { kind: "unchanged", order: applied.order };
}

/** 결제 처리 기록은 최선으로 남긴다 — 기록 저장이 실패해도 주문 상태 반영(구매 권한)을 막지 않는다 */
async function recordPaymentEvent(repo: MiyuRepository, event: Parameters<MiyuRepository["addPaymentEvent"]>[0]): Promise<void> {
  try {
    await repo.addPaymentEvent(event);
  } catch {
    // 기록 실패는 운영 기록(ops_events)에서 따로 추적한다
  }
}

export type ApplyResult =
  /** transitioned: 이 호출이 주문을 결제 완료로 바꿨다 (이미 결제 완료였거나 동시에 다른 요청이 먼저 바꾼 경우는 false). refund: 부분 취소를 묶음 장부에 반영한 결과(질문 묶음 주문만) */
  | { kind: "paid"; order: OrderRecord; transitioned?: boolean; refund?: CashRefundResult }
  | { kind: "updated"; order: OrderRecord; to: "refunded" | "failed" }
  | { kind: "unchanged"; order: OrderRecord; code: string; message: string };

/** 부분 취소를 장부에 반영하지 못했을 때 운영자에게 알릴 이유 (반영했거나 이미 반영돼 있으면 null) */
export function refundAttention(refund: CashRefundResult): { code: string; message: string } | null {
  const won = (list: number[]) => list.map((n) => `${n.toLocaleString("ko-KR")}원`).join(" · ");
  switch (refund.status) {
    case "applied":
    case "already":
      return null;
    case "amount-mismatch":
      return { code: "PARTIAL_REFUND_MISMATCH", message: `결제사에서 취소된 누적 금액이 질문 개수에 맞지 않아 질문을 회수하지 않았습니다. 맞는 누적 취소 금액은 ${won(refund.allowed)}입니다 (이미 취소된 금액은 되돌릴 수 없으니 남은 질문을 어떻게 할지 운영자가 판단해 주세요).` };
    case "invalid-amount":
      return { code: "PARTIAL_REFUND_INVALID", message: "결제사의 취소 금액이 결제액 범위를 벗어나 반영하지 않았습니다." };
    case "no-pack":
      return { code: "PARTIAL_REFUND_NO_PACK", message: "이 주문은 묶음 장부가 없는 예전 주문이라 부분 취소를 질문에 반영하지 못했습니다. 남은 질문은 운영자가 직접 판단해 주세요." };
    case "unavailable":
      return { code: "PARTIAL_REFUND_NEEDS_DB16", message: "DB 변경 16번이 없어 부분 취소를 질문에 반영하지 못했습니다. 16번을 적용한 뒤 결제 재확인을 눌러 주세요." };
  }
}

/** 결제사 기록을 주문에 반영한다. 같은 내용을 여러 번 반영해도 결과가 같다. */
export async function applyPayment(
  repo: MiyuRepository,
  order: OrderRecord,
  payment: GatewayPayment,
  source: PaymentEventSource,
): Promise<ApplyResult> {
  const result = await applyPaymentStatus(repo, order, payment, source);
  // 질문 3개 묶음 주문의 부분 취소: 결제 완료로 맞춘 뒤(이미 결제 완료면 그대로) 결제사의 누적 취소액을 묶음 장부에 반영해 남은 질문을 회수한다.
  // 알림이 순서가 바뀌어 오거나 중복으로 와도 결제사를 다시 조회한 누적 값으로 반영하므로 결과가 같다(이미 반영한 금액은 "already").
  if (payment.status !== "PARTIAL_CANCELED" || !isCashProduct(order.productId) || result.kind !== "paid") return result;
  const canceledTotal = canceledAmountOf(payment);
  const refund = await repo.applyCashRefund({ orderId: result.order.id, canceledTotal });
  if (refund.status !== "already") {
    await recordPaymentEvent(repo, {
      orderId: order.id,
      source,
      status: refund.status === "applied" ? "PARTIAL_REFUND_APPLIED" : (refundAttention(refund)?.code ?? "PARTIAL_REFUND_UNHANDLED"),
      detail: { canceledTotal, ...(refund.status === "applied" ? { questions: refund.questions, refundedKrw: refund.refundedKrw, clawed: refund.clawed, shortfall: refund.shortfall } : {}) },
    });
  }
  return { ...result, refund };
}

async function applyPaymentStatus(
  repo: MiyuRepository,
  order: OrderRecord,
  payment: GatewayPayment,
  source: PaymentEventSource,
): Promise<ApplyResult> {
  // 주문번호 기준 추적용: 결제사 상점 ID(mId)를 함께 남긴다 (공용 예제 키로 결제하면 내 상점과 다른 ID가 남는다)
  const detail = { method: payment.method, approvedAt: payment.approvedAt, totalAmount: payment.totalAmount, mId: payment.mId };
  if (payment.orderId !== order.orderNumber || payment.totalAmount !== order.amount) {
    await recordPaymentEvent(repo, { orderId: order.id, source, status: "PAYMENT_MISMATCH", detail: { ...detail, status: payment.status } });
    return { kind: "unchanged", order, code: "PAYMENT_MISMATCH", message: "결제 정보가 주문과 맞지 않습니다. 고객센터로 문의해 주세요." };
  }
  await recordPaymentEvent(repo, { orderId: order.id, source, status: payment.status, detail });

  // 질문 묶음 주문의 부분 취소는 "결제는 됐고 일부가 환불된" 상태라 결제 완료로 본다(그 위에 환불을 반영하는 것은 applyPayment)
  const target = payment.status === "PARTIAL_CANCELED" && isCashProduct(order.productId) ? "paid" : orderStatusFor(payment);
  if (target === "paid") {
    // 이미 다른 결제키로 결제 완료된 주문에 또 다른 승인이 들어오면 같은 결제로 보지 않고 운영자 확인(환불) 대상으로 올린다
    const duplicate = async (): Promise<ApplyResult> => {
      await recordPaymentEvent(repo, { orderId: order.id, source, status: "DUPLICATE_PAYMENT", detail });
      return { kind: "unchanged", order, code: "DUPLICATE_PAYMENT", message: "이미 결제된 주문이 있습니다. 고객센터로 문의해 주세요." };
    };
    if (order.status === "paid") return order.paymentKey && order.paymentKey !== payment.paymentKey ? duplicate() : { kind: "paid", order };
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
    } catch (error) {
      // 같은 검사에 이미 결제된 다른 주문이 있으면 DB 고유 조건(23505)이 막는다 → 운영자 확인(환불) 대상.
      // 그 밖의 오류(DB 일시 장애 등)를 중복 결제로 오해하지 않고 그대로 올려, 호출한 쪽이 "확인 중"으로 처리한다.
      if ((error as { code?: string } | null)?.code !== "23505") throw error;
      return duplicate();
    }
    if (updated) return { kind: "paid", order: updated, transitioned: true };
    const fresh = (await repo.getOrderByNumber(order.orderNumber)) ?? order;
    if (fresh.status === "paid") {
      // 동시에 들어온 다른 요청이 먼저 반영한 경우: 같은 결제키면 같은 결제, 다르면 두 번 승인된 것
      return fresh.paymentKey === payment.paymentKey ? { kind: "paid", order: fresh } : duplicate();
    }
    return { kind: "unchanged", order: fresh, code: "ORDER_NOT_PAYABLE", message: "결제할 수 없는 주문입니다." };
  }
  if (target === "refunded") {
    const updated = await repo.updateOrder(order.id, ["paid"], { status: "refunded" });
    return updated ? { kind: "updated", order: updated, to: "refunded" } : { kind: "unchanged", order, code: "NO_CHANGE", message: "" };
  }
  if (target === "failed") {
    const updated = await repo.updateOrder(order.id, ["pending"], { status: "failed", failureCode: payment.status });
    return updated ? { kind: "updated", order: updated, to: "failed" } : { kind: "unchanged", order, code: "NO_CHANGE", message: "" };
  }
  return { kind: "unchanged", order, code: "NO_CHANGE", message: "" };
}
