// 결제 재확인 — 우리 주문 기록과 결제사 기록을 주문번호로 대조해 맞춘다.
//
// 막으려는 상황
// - 결제사는 승인했는데 우리 서버 응답 · DB 저장이 실패했거나, 고객이 창을 닫거나 인터넷이 끊겨 돌아오지 못함
// - 웹훅이 오지 않았거나 늦게 · 중복으로 · 순서가 바뀌어 옴
// - 결제사에서 취소(환불)했는데 우리 주문은 아직 결제 완료로 남아 있음
//
// 원칙
// - 결제사의 실제 기록만 믿는다. 알림 내용이나 고객 화면의 이동 결과로 결제 성공 · 실패를 단정하지 않는다.
// - 결제사 조회가 실패(장애 · 연결 끊김)하면 "확인 중"으로 두고 다음에 다시 한다. 실패나 취소로 바꾸지 않는다.
// - 결제사에 해당 주문의 결제가 아예 없고 충분한 시간이 지난 경우에만 "미완료"로 정리한다.
// - 같은 대조를 여러 번 해도 결과가 같다 (중복 반영 · 중복 리포트 없음).
// - 실제 환불은 하지 않는다. 결제사에서 이미 취소된 것을 주문에 맞출 뿐이다.
// - 질문 3개 묶음의 **부분 취소**는 결제사의 누적 취소액을 묶음 장부에 반영해 남은 질문을 회수한다(웹훅을 놓쳤거나 늦게 와도 이 대조가 맞춘다).

import type { GatewayPayment } from "../commerce/order.ts";
import { isCashProduct } from "../config/product.ts";
import { applyPayment, refundAttention } from "./order-service.ts";
import type { CashRefundResult, MiyuRepository, OrderRecord, PaymentGateway } from "./ports.ts";

export const RECONCILE_DEFAULTS = {
  /** 결제 진행 중일 수 있으니 주문이 이 시간 지난 뒤부터 확인한다 */
  pendingMinAgeMs: 2 * 60_000,
  /** 결제사에 결제 기록이 없고 이 시간이 지나면 미완료로 정리한다 (결제 인증 후 승인 유효시간보다 충분히 길게) */
  abandonedAfterMs: 60 * 60_000,
  /** 결제 완료 주문을 이 기간만큼 거슬러 올라가 결제사 기록과 맞는지 확인한다 */
  paidLookbackMs: 7 * 24 * 3600_000,
  batchLimit: 50,
} as const;

export type ReconcileOptions = Partial<typeof RECONCILE_DEFAULTS>;

export type ReconcileOutcome =
  /** 결제사는 승인했는데 우리 주문이 대기였음 → 결제 완료로 맞춤 (리포트 준비 필요). refund: 그 결제가 이미 일부 취소돼 있어 묶음 장부에 함께 반영한 경우 */
  | { kind: "paid"; order: OrderRecord; transitioned?: boolean; refund?: Extract<CashRefundResult, { status: "applied" }> }
  /** 결제사의 부분 취소(질문 묶음 일부 환불)를 묶음 장부에 반영함 → 남은 질문 회수 (주문은 결제 완료 그대로) */
  | { kind: "partial-refund"; order: OrderRecord; refund: Extract<CashRefundResult, { status: "applied" }> }
  /** 결제사에서 취소됨 → 주문을 환불됨으로 맞춤 (열람 권한 회수) */
  | { kind: "refunded"; order: OrderRecord }
  /** 결제가 끝나지 않은 채 정리됨 */
  | { kind: "closed"; order: OrderRecord; reason: string }
  /** 아직 판단할 수 없음 (결제 진행 중 · 너무 이른 시간 · 결제사 기록 아직 없음) — 다음에 다시 확인 */
  | { kind: "waiting"; order: OrderRecord; reason: string }
  /** 이미 결제사 기록과 맞음 */
  | { kind: "ok"; order: OrderRecord }
  /** 사람이 확인해야 함 (금액 · 주문 불일치, 부분 취소, 결제사에 기록 없음 등) */
  | { kind: "anomaly"; order: OrderRecord; code: string; message: string }
  /** 결제사 조회 실패 (장애 · 연결 끊김) — 단정하지 않고 다음에 다시 확인 */
  | { kind: "error"; order: OrderRecord; code: string };

type Deps = {
  repo: MiyuRepository;
  gateway: PaymentGateway;
  now: () => Date;
  /** 결제가 확인되어 주문이 결제 완료로 바뀐 직후 부른다 (리포트 준비 등). 실패해도 대조 결과는 그대로 */
  onPaid?: (order: OrderRecord) => Promise<void>;
};

const IN_FLIGHT: readonly GatewayPayment["status"][] = ["READY", "IN_PROGRESS", "WAITING_FOR_DEPOSIT"];

async function safeEvent(repo: MiyuRepository, order: OrderRecord, status: string, detail: Record<string, unknown> = {}) {
  try {
    await repo.addPaymentEvent({ orderId: order.id, source: "reconcile", status, detail });
  } catch {
    // 기록 실패가 대조를 막지 않는다
  }
}

export async function reconcileOrder(deps: Deps, order: OrderRecord, options: ReconcileOptions = {}): Promise<ReconcileOutcome> {
  const o = { ...RECONCILE_DEFAULTS, ...options };
  const { repo, gateway } = deps;
  const age = deps.now().getTime() - new Date(order.createdAt).getTime();

  if (order.status === "pending") {
    if (age < o.pendingMinAgeMs) return { kind: "waiting", order, reason: "TOO_EARLY" };
    const found = await gateway.getPaymentByOrderId(order.orderNumber);
    if (!found.ok) {
      if (found.code === "NOT_FOUND_PAYMENT") {
        if (age < o.abandonedAfterMs) return { kind: "waiting", order, reason: "NO_PAYMENT_YET" };
        const closed = await repo.updateOrder(order.id, ["pending"], {
          status: "canceled",
          failureCode: "ABANDONED",
          failureMessage: "결제가 완료되지 않아 정리됨",
        });
        if (closed) await safeEvent(repo, closed, "ABANDONED", { ageMinutes: Math.round(age / 60_000) });
        return { kind: "closed", order: closed ?? order, reason: "ABANDONED" };
      }
      return { kind: "error", order, code: found.code };
    }
    const payment = found.payment;
    if (IN_FLIGHT.includes(payment.status)) return { kind: "waiting", order, reason: payment.status };

    if (payment.status === "CANCELED") {
      // 결제된 적이 없는 주문의 결제가 결제사에서 취소됨 → 환불이 아니라 미완료 취소로 정리한다
      if (payment.orderId !== order.orderNumber || payment.totalAmount !== order.amount) {
        await safeEvent(repo, order, "PAYMENT_MISMATCH", { gatewayAmount: payment.totalAmount, orderAmount: order.amount });
        return { kind: "anomaly", order, code: "PAYMENT_MISMATCH", message: "결제사 기록의 주문번호 또는 금액이 주문과 다릅니다." };
      }
      const closed = await repo.updateOrder(order.id, ["pending"], { status: "canceled", failureCode: "CANCELED", failureMessage: "결제사에서 취소된 결제" });
      if (closed) await safeEvent(repo, closed, "CANCELED", { gatewayStatus: payment.status });
      return { kind: "closed", order: closed ?? order, reason: "CANCELED" };
    }

    const applied = await applyPayment(repo, order, payment, "reconcile");
    if (applied.kind === "paid") {
      try {
        await deps.onPaid?.(applied.order);
      } catch {
        // 리포트 준비는 결과 화면의 상태 확인이 이어받는다
      }
      const att = applied.refund ? refundAttention(applied.refund) : null;
      if (att) return { kind: "anomaly", order: applied.order, ...att };
      return { kind: "paid", order: applied.order, transitioned: applied.transitioned, ...(applied.refund?.status === "applied" ? { refund: applied.refund } : {}) };
    }
    if (applied.kind === "updated") {
      return applied.order.status === "refunded" ? { kind: "refunded", order: applied.order } : { kind: "closed", order: applied.order, reason: payment.status };
    }
    return { kind: "anomaly", order: applied.order, code: applied.code, message: applied.message };
  }

  if (order.status === "paid") {
    // 결제 완료 주문: 결제사 기록이 아직 승인 상태이고 주문과 맞는지 확인한다 (결제사에서 취소했는데 알림을 놓친 경우 등)
    const found = order.paymentKey ? await gateway.getPayment(order.paymentKey) : await gateway.getPaymentByOrderId(order.orderNumber);
    if (!found.ok) {
      if (found.code === "NOT_FOUND_PAYMENT") {
        await safeEvent(repo, order, "PAID_BUT_NOT_AT_GATEWAY");
        return { kind: "anomaly", order, code: "PAID_BUT_NOT_AT_GATEWAY", message: "결제 완료로 기록됐지만 결제사에서 결제를 찾지 못했습니다." };
      }
      return { kind: "error", order, code: found.code };
    }
    const payment = found.payment;
    if (payment.orderId !== order.orderNumber || payment.totalAmount !== order.amount) {
      await safeEvent(repo, order, "PAYMENT_MISMATCH", { gatewayAmount: payment.totalAmount, orderAmount: order.amount });
      return { kind: "anomaly", order, code: "PAYMENT_MISMATCH", message: "결제사 기록의 주문번호 또는 금액이 주문과 다릅니다." };
    }
    if (payment.status === "DONE") return { kind: "ok", order };
    if (payment.status === "PARTIAL_CANCELED" && isCashProduct(order.productId)) {
      // 질문 묶음의 부분 취소 — 결제사의 누적 취소액을 묶음 장부에 반영한다(이미 반영했다면 "already"라 ok)
      const applied = await applyPayment(repo, order, payment, "reconcile");
      if (applied.kind === "paid" && applied.refund) {
        const att = refundAttention(applied.refund);
        if (att) return { kind: "anomaly", order: applied.order, ...att };
        return applied.refund.status === "applied" ? { kind: "partial-refund", order: applied.order, refund: applied.refund } : { kind: "ok", order: applied.order };
      }
      return { kind: "anomaly", order: applied.order, code: "REFUND_NOT_APPLIED", message: "결제사에서 일부 취소됐지만 묶음 장부에 반영하지 못했습니다." };
    }
    if (payment.status === "CANCELED") {
      const applied = await applyPayment(repo, order, payment, "reconcile");
      if (applied.kind === "updated" && applied.order.status === "refunded") return { kind: "refunded", order: applied.order };
      return { kind: "anomaly", order: applied.order, code: "REFUND_NOT_APPLIED", message: "결제사에서 취소됐지만 주문에 반영하지 못했습니다." };
    }
    await safeEvent(repo, order, `UNEXPECTED_${payment.status}`);
    return { kind: "anomaly", order, code: `UNEXPECTED_${payment.status}`, message: `결제사 상태가 ${payment.status}입니다. 부분 취소 등은 운영자가 확인해야 합니다.` };
  }

  return { kind: "ok", order };
}

export type ReconcileSummary = {
  checked: number;
  outcomes: ReconcileOutcome[];
  counts: Record<ReconcileOutcome["kind"], number>;
};

/** 대조가 필요한 주문(오래 대기 중인 주문 + 최근 결제 완료 주문)을 모두 확인한다. 한 건이 실패해도 나머지를 계속한다. */
export async function reconcileBatch(deps: Deps, options: ReconcileOptions = {}): Promise<ReconcileSummary> {
  const o = { ...RECONCILE_DEFAULTS, ...options };
  const now = deps.now().getTime();
  const orders = await deps.repo.listOrdersForReconcile({
    pendingCreatedBefore: new Date(now - o.pendingMinAgeMs).toISOString(),
    paidSince: new Date(now - o.paidLookbackMs).toISOString(),
    limit: o.batchLimit,
  });
  const outcomes: ReconcileOutcome[] = [];
  for (const order of orders) {
    try {
      outcomes.push(await reconcileOrder(deps, order, options));
    } catch {
      outcomes.push({ kind: "error", order, code: "RECONCILE_EXCEPTION" });
    }
  }
  const counts = { paid: 0, "partial-refund": 0, refunded: 0, closed: 0, waiting: 0, ok: 0, anomaly: 0, error: 0 } satisfies Record<ReconcileOutcome["kind"], number>;
  for (const r of outcomes) counts[r.kind]++;
  return { checked: orders.length, outcomes, counts };
}
