"use server";

import { isCashProduct, parseConcernProductId } from "@/lib/config/product";
import { newErrorId, safeErrorMessage } from "@/lib/ops/redact";
import { confirmPayment, markCheckoutFailed } from "@/lib/services/order-service";
import { paymentConfig } from "@/server/env";
import { saleGateCheck } from "@/server/capacity";
import { alert, logError, notifyOrderEvent } from "@/server/ops";
import { queueAndScheduleReport } from "@/server/report-jobs";
import { paymentGateway, writeRepository } from "@/server/services";
import { getMember } from "@/server/member";
import { resultPathOf } from "@/server/order-paths";

/** resultPath: 이 주문이 끝난 뒤 돌아갈 화면 (개인 통합 리포트는 결과 화면, 고민 반영 리포트는 나의 고민 기록소 · 그 기록의 리포트) */
export type ConfirmOutcome =
  | { kind: "paid"; assessmentId: string; resultPath: string }
  /** 결과를 아직 모름 — 다시 결제하지 말고 기다리거나 다시 확인. orderNumber · errorId는 문의할 때 알려 주는 번호 */
  | { kind: "checking"; assessmentId: string | null; resultPath: string | null; orderNumber: string | null; errorId: string | null }
  /** charged: 결제사에서 승인된 결제일 수 있음 (중복 결제 등) — "청구되지 않습니다"라고 안내하면 안 된다 */
  | { kind: "rejected"; message: string; assessmentId: string | null; resultPath: string | null; orderNumber: string | null; charged: boolean }
  | { kind: "login" };

/** 결제사에서는 승인됐을 수 있는데 우리 주문에 반영하지 못한 거절 사유 */
const MAY_BE_CHARGED = new Set(["DUPLICATE_PAYMENT", "PAYMENT_MISMATCH"]);

/** 결제 성공 주소에서 호출: 서버가 주문 금액·소유자를 확인하고 결제사에 승인 요청 */
export async function confirmPaymentAction(input: { orderId: string; paymentKey: string; amount: number }): Promise<ConfirmOutcome> {
  if (!paymentConfig().ok) return { kind: "rejected", message: "결제가 아직 설정되지 않았습니다.", assessmentId: null, resultPath: null, orderNumber: null, charged: false };
  const member = await getMember();
  if (!member || member.needsConsent) return { kind: "login" };
  const userId = member.userId;
  if (typeof input?.orderId !== "string" || typeof input?.paymentKey !== "string" || typeof input?.amount !== "number") {
    return { kind: "rejected", message: "결제 정보가 올바르지 않습니다.", assessmentId: null, resultPath: null, orderNumber: null, charged: false };
  }
  const orderNumber = input.orderId.slice(0, 64);

  try {
    const repo = writeRepository();
    const result = await confirmPayment(
      { repo, gateway: paymentGateway(), gate: saleGateCheck },
      { userId, orderNumber: input.orderId, paymentKey: input.paymentKey.slice(0, 200), amount: input.amount },
    );

    switch (result.kind) {
      case "paid":
        // 리포트는 백그라운드에서 만든다 — 결제 결과 화면을 기다리게 하지 않고, 실패해도 결제에 영향이 없다
        await queueAndScheduleReport(result.order);
        // 서버가 결제를 확인해 주문을 결제 완료로 바꾼 요청에서만 알린다 (이미 완료된 주문을 다시 열 때는 알리지 않는다)
        if (result.transitioned) await notifyOrderEvent("paid", result.order);
        return { kind: "paid", assessmentId: result.order.assessmentId, resultPath: resultPathOf(result.order, { paid: true }) };
      case "checking": {
        let errorId: string | null = null;
        if (result.reason === "save-failed") {
          // 결제사는 승인했는데 우리 저장이 실패한 가장 위험한 경우 — 운영자에게 바로 알린다 (재확인 작업이 맞춘다)
          errorId = newErrorId();
          await alert({
            kind: "confirm.save_failed",
            severity: "error",
            title: "결제사는 승인했지만 주문 저장에 실패했습니다 (재확인으로 맞출 예정)",
            orderNumber: result.order.orderNumber,
            errorId,
            dedupeKey: `confirm-save-failed:${result.order.orderNumber}`,
          });
        }
        return { kind: "checking", assessmentId: result.order.assessmentId, resultPath: resultPathOf(result.order), orderNumber: result.order.orderNumber, errorId };
      }
      case "rejected": {
        const charged = MAY_BE_CHARGED.has(result.code);
        if (charged) {
          await alert({
            kind: "confirm.rejected_charged",
            severity: "error",
            title: `승인된 결제를 주문에 반영하지 못했습니다 (${result.code})`,
            orderNumber: result.order?.orderNumber ?? orderNumber,
            dedupeKey: `confirm-rejected:${orderNumber}:${result.code}`,
            lines: ["환불은 토스페이먼츠 관리자에서 직접 실행합니다 (미유는 환불을 실행하지 않습니다)"],
          });
        }
        return { kind: "rejected", message: result.message, assessmentId: result.order?.assessmentId ?? null, resultPath: result.order ? resultPathOf(result.order) : null, orderNumber: result.order?.orderNumber ?? orderNumber, charged };
      }
      case "not-found":
        return { kind: "rejected", message: "주문을 찾을 수 없습니다.", assessmentId: null, resultPath: null, orderNumber: null, charged: false };
    }
  } catch (e) {
    // 예기치 못한 오류: 결제 결과를 모르므로 실패로 단정하지 않고 "확인 중"으로 돌려 준다 (재확인이 결제사 기록으로 맞춘다)
    const errorId = newErrorId();
    logError(`payments.confirm ${errorId}`, e);
    await alert({
      kind: "confirm.exception",
      severity: "error",
      title: `결제 승인 처리 중 예기치 못한 오류: ${safeErrorMessage(e, 120)}`,
      orderNumber,
      errorId,
      dedupeKey: `confirm-exception:${orderNumber}`,
    });
    return { kind: "checking", assessmentId: null, resultPath: null, orderNumber, errorId };
  }
}

/** 결제 실패 주소에서 호출: 대기 중인 주문을 취소·실패로 정리한다 */
export async function recordPaymentFailureAction(input: { orderId: string; code: string; message: string }): Promise<{ assessmentId: string | null; resultPath: string | null; concern: boolean; cash: boolean }> {
  const none = { assessmentId: null, resultPath: null, concern: false, cash: false };
  if (!paymentConfig().ok) return none;
  const member = await getMember();
  if (!member || member.needsConsent || typeof input?.orderId !== "string") return none;
  const userId = member.userId;
  const repo = writeRepository();
  await markCheckoutFailed(
    { repo },
    { userId, orderNumber: input.orderId, code: String(input.code ?? ""), message: String(input.message ?? "") },
  );
  const order = await repo.getOrderByNumber(input.orderId);
  if (!order || order.userId !== userId) return none;
  const resultPath = resultPathOf(order);
  return { assessmentId: order.assessmentId, resultPath, concern: parseConcernProductId(order.productId) !== null, cash: isCashProduct(order.productId) };
}
