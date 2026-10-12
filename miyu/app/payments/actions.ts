"use server";

import { confirmPayment, markCheckoutFailed } from "@/lib/services/order-service";
import { ensureReport } from "@/lib/services/report-service";
import { paymentConfig } from "@/server/env";
import { now, paymentGateway, reportGenerator, writeRepository } from "@/server/services";
import { getMember } from "@/server/member";

export type ConfirmOutcome =
  | { kind: "paid"; assessmentId: string }
  | { kind: "checking"; assessmentId: string }
  | { kind: "rejected"; message: string; assessmentId: string | null }
  | { kind: "login" };

/** 결제 성공 주소에서 호출: 서버가 주문 금액·소유자를 확인하고 결제사에 승인 요청 */
export async function confirmPaymentAction(input: { orderId: string; paymentKey: string; amount: number }): Promise<ConfirmOutcome> {
  if (!paymentConfig().ok) return { kind: "rejected", message: "결제가 아직 설정되지 않았습니다.", assessmentId: null };
  const member = await getMember();
  if (!member || member.needsConsent) return { kind: "login" };
  const userId = member.userId;
  if (typeof input?.orderId !== "string" || typeof input?.paymentKey !== "string" || typeof input?.amount !== "number") {
    return { kind: "rejected", message: "결제 정보가 올바르지 않습니다.", assessmentId: null };
  }

  const repo = writeRepository();
  const result = await confirmPayment(
    { repo, gateway: paymentGateway() },
    { userId, orderNumber: input.orderId, paymentKey: input.paymentKey.slice(0, 200), amount: input.amount },
  );

  switch (result.kind) {
    case "paid":
      try {
        // 리포트 생성 실패는 결제 결과에 영향을 주지 않는다 (결과 화면에서 다시 만들기 가능)
        await ensureReport({ repo, generator: reportGenerator, now }, result.order);
      } catch {
        /* reports 표에 실패가 남거나, 결과 화면에서 다시 시도한다 */
      }
      return { kind: "paid", assessmentId: result.order.assessmentId };
    case "checking":
      return { kind: "checking", assessmentId: result.order.assessmentId };
    case "rejected":
      return { kind: "rejected", message: result.message, assessmentId: result.order?.assessmentId ?? null };
    case "not-found":
      return { kind: "rejected", message: "주문을 찾을 수 없습니다.", assessmentId: null };
  }
}

/** 결제 실패 주소에서 호출: 대기 중인 주문을 취소·실패로 정리한다 */
export async function recordPaymentFailureAction(input: { orderId: string; code: string; message: string }): Promise<{ assessmentId: string | null }> {
  if (!paymentConfig().ok) return { assessmentId: null };
  const member = await getMember();
  if (!member || member.needsConsent || typeof input?.orderId !== "string") return { assessmentId: null };
  const userId = member.userId;
  const repo = writeRepository();
  await markCheckoutFailed(
    { repo },
    { userId, orderNumber: input.orderId, code: String(input.code ?? ""), message: String(input.message ?? "") },
  );
  const order = await repo.getOrderByNumber(input.orderId);
  return { assessmentId: order && order.userId === userId ? order.assessmentId : null };
}
