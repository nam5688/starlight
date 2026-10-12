"use server";

import { paymentConfig } from "@/server/env";
import { getMember } from "@/server/member";
import { paymentGateway, readRepository } from "@/server/services";

export type RecheckResult =
  | { ok: true; status: string; method: string | null; approvedAt: string | null; totalAmount: number; mId: string | null; matches: boolean }
  | { ok: false; message: string };

/**
 * 결제사에 이 결제를 다시 조회한다 (읽기 전용 — 주문 상태는 바꾸지 않는다).
 * 결제가 토스페이먼츠에 실제로 있는지, 어느 상점(mId)으로 처리됐는지 확인하는 용도.
 */
export async function recheckPaymentAction(orderNumber: string): Promise<RecheckResult> {
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false, message: "로그인이 필요합니다." };
  const order = await (await readRepository()).getOrderByNumber(orderNumber);
  if (!order || order.userId !== member.userId) return { ok: false, message: "주문을 찾을 수 없습니다." };
  if (!order.paymentKey) return { ok: false, message: "결제사 승인 기록이 없는 주문입니다 (결제가 승인되지 않았습니다)." };
  if (!paymentConfig().ok) return { ok: false, message: "결제 설정이 없어 결제사에 조회할 수 없습니다." };

  const result = await paymentGateway().getPayment(order.paymentKey);
  if (!result.ok) return { ok: false, message: `결제사 조회 실패: ${result.message} (${result.code})` };
  const p = result.payment;
  return {
    ok: true,
    status: p.status,
    method: p.method,
    approvedAt: p.approvedAt,
    totalAmount: p.totalAmount,
    mId: p.mId,
    matches: p.orderId === order.orderNumber && p.totalAmount === order.amount,
  };
}
