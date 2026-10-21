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
// - 남은 질문이 있는 묶음은 결제한 지 7일이 지나도 계속 확인한다(`listOrdersWithOpenPacks`). 호스팅의 정기 실행이 하루 한 번뿐이어도 환불된 질문이 쓰이지 않도록,
//   질문을 쓰기 직전에도 그 회원의 남은 묶음을 같은 방식으로 다시 확인한다(`reconcileOpenPacksOfUser`).

import type { GatewayPayment } from "../commerce/order.ts";
import { isCashProduct, isCompatProduct } from "../config/product.ts";
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
  /**
   * 결제한 지 오래돼도 남은 질문이 있는 묶음은 나이와 상관없이 이만큼까지 다시 확인한다 (결제사에서 나중에 부분 취소될 수 있다).
   * 오래된 묶음부터 이 개수까지만 보므로 남은 질문이 있는 묶음이 이보다 많으면 뒤쪽은 다음 점검으로 밀린다 — 질문을 쓰기 직전의 확인(회원 단위)은 이 한도와 상관없이 항상 한다.
   * 결제사 조회 한 번이 0.3초쯤이라 200건이면 1분 안쪽이다(실제 소요는 재지 못했다).
   */
  openPackLimit: 200,
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
  /**
   * 이미 맞음. payment가 있으면 결제사에 실제로 물어 맞았다는 증거(결제사 상태 · 금액 · 잔액 · 어느 경로로 조회했는지)이고, **없으면 결제사에 묻지 않은 결과**다
   * (결제 완료 · 대기가 아닌 주문 — 환불 완료 · 취소 · 실패 — 은 이미 정리된 상태라 조회하지 않고 이 값으로 끝난다). 관리자 안내용이며 판단에는 쓰지 않는다 — 안내는 payment가 있을 때만 "결제사 기록과 맞음"이라고 말한다
   */
  | { kind: "ok"; order: OrderRecord; payment?: { status: string; totalAmount: number; balanceAmount: number; via: "paymentKey" | "orderId" } }
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
        if (closed && isCompatProduct(closed.productId)) await repo.scrubCompatRequest(closed.id).catch(() => false);
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
      if (closed && isCompatProduct(closed.productId)) await repo.scrubCompatRequest(closed.id).catch(() => false);
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
    if (payment.status === "DONE") return { kind: "ok", order, payment: { status: payment.status, totalAmount: payment.totalAmount, balanceAmount: payment.balanceAmount, via: order.paymentKey ? "paymentKey" : "orderId" } };
    if (payment.status === "PARTIAL_CANCELED" && isCashProduct(order.productId)) {
      // 질문 묶음의 부분 취소 — 결제사의 누적 취소액을 묶음 장부에 반영한다(이미 반영했다면 "already"라 ok)
      const applied = await applyPayment(repo, order, payment, "reconcile");
      if (applied.kind === "paid" && applied.refund) {
        const att = refundAttention(applied.refund);
        if (att) return { kind: "anomaly", order: applied.order, ...att };
        return applied.refund.status === "applied"
          ? { kind: "partial-refund", order: applied.order, refund: applied.refund }
          : { kind: "ok", order: applied.order, payment: { status: payment.status, totalAmount: payment.totalAmount, balanceAmount: payment.balanceAmount, via: order.paymentKey ? "paymentKey" : "orderId" } };
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
  // 결제한 지 7일이 지났어도 남은 질문이 있는 묶음은 계속 본다 — 이미 위 목록에 들어 있는 주문은 다시 세지 않는다
  const seen = new Set(orders.map((x) => x.id));
  const openPacks = (await deps.repo.listOrdersWithOpenPacks({ limit: o.openPackLimit }).catch(() => [])).filter((x) => !seen.has(x.id));
  const targets = [...orders, ...openPacks];
  const outcomes: ReconcileOutcome[] = [];
  for (const order of targets) {
    try {
      outcomes.push(await reconcileOrder(deps, order, options));
    } catch {
      outcomes.push({ kind: "error", order, code: "RECONCILE_EXCEPTION" });
    }
  }
  const counts = { paid: 0, "partial-refund": 0, refunded: 0, closed: 0, waiting: 0, ok: 0, anomaly: 0, error: 0 } satisfies Record<ReconcileOutcome["kind"], number>;
  for (const r of outcomes) counts[r.kind]++;
  return { checked: targets.length, outcomes, counts };
}

/**
 * 질문을 쓰기 직전 확인 — 이 회원의 남은 질문이 있는 묶음을 결제사 기록으로 다시 확인해 부분 · 전액 취소를 장부에 먼저 반영한다.
 * 결제사에서 환불한 질문을 고객이 아직 쓰지 못하게 막는 마지막 안전장치이며, 고객이 화면을 다시 열지 않았거나 호스팅의 정기 실행이 아직 오지 않았어도 동작한다.
 * 결제사 조회가 실패한 묶음은 error로 돌려준다(막을지는 부르는 쪽이 정한다 — 질문 답변은 막지 않고 운영 기록만 남긴다).
 */
export async function reconcileOpenPacksOfUser(deps: Deps, userId: string, options: ReconcileOptions = {}): Promise<ReconcileOutcome[]> {
  const o = { ...RECONCILE_DEFAULTS, ...options };
  const orders = await deps.repo.listOrdersWithOpenPacks({ userId, limit: o.openPackLimit });
  const outcomes: ReconcileOutcome[] = [];
  for (const order of orders.filter((x) => x.userId === userId)) {
    try {
      outcomes.push(await reconcileOrder(deps, order, options));
    } catch {
      outcomes.push({ kind: "error", order, code: "RECONCILE_EXCEPTION" });
    }
  }
  return outcomes;
}
