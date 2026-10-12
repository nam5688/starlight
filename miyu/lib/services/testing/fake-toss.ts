// 테스트용 가짜 토스페이먼츠 — 실제 결제사처럼 결제 기록을 보관하고, 장애 상황을 흉내 낸다.
// 운영 코드에서 쓰지 않는다.

import type { GatewayPayment } from "../../commerce/order.ts";
import type { GatewayResult, PaymentGateway } from "../ports.ts";

export type ConfirmMode =
  /** 정상 승인 */
  | "ok"
  /** 결제사에서는 승인됐지만 응답이 오지 않음 (시간 초과 · 연결 끊김) — 가장 위험한 경우 */
  | "approve-then-lost"
  /** 요청이 결제사에 닿지 않음 */
  | "unreachable"
  /** 카드 거절 같은 확정 실패 */
  | "reject";

export function createFakeToss(now: () => Date = () => new Date()) {
  const byKey = new Map<string, GatewayPayment>();
  const calls = { confirm: 0, getPayment: 0, byOrder: 0 };
  const state = { confirmMode: "ok" as ConfirmMode, lookupDown: false, lookupDownAfterApprove: false };
  const authorized = new Map<string, { orderId: string; amount: number }>(); // 결제창에서 인증까지 끝난 결제 (아직 승인 전)

  const find = (orderId: string) => [...byKey.values()].find((p) => p.orderId === orderId) ?? null;
  const network = (): GatewayResult => ({ ok: false, code: "NETWORK_ERROR", message: "결제사에 연결하지 못했습니다.", retryable: true });
  const approve = (paymentKey: string, orderId: string, amount: number): GatewayPayment => {
    const existing = byKey.get(paymentKey);
    if (existing) return existing; // 같은 결제키는 한 번만 승인 (멱등)
    const p: GatewayPayment = {
      paymentKey,
      orderId,
      status: "DONE",
      totalAmount: amount,
      balanceAmount: amount,
      method: "카드",
      approvedAt: now().toISOString(),
      mId: "fake-merchant",
    };
    byKey.set(paymentKey, p);
    return p;
  };

  const gateway: PaymentGateway = {
    provider: "tosspayments",
    async confirm({ paymentKey, orderId, amount }) {
      calls.confirm++;
      if (state.confirmMode === "unreachable") return network();
      if (state.confirmMode === "reject") return { ok: false, code: "REJECT_CARD_PAYMENT", message: "한도 초과", retryable: false };
      const payment = approve(paymentKey, orderId, amount);
      if (state.confirmMode === "approve-then-lost") return network();
      return { ok: true, payment };
    },
    async getPayment(paymentKey) {
      calls.getPayment++;
      if (state.lookupDown) return network();
      const p = byKey.get(paymentKey);
      return p ? { ok: true, payment: p } : { ok: false, code: "NOT_FOUND_PAYMENT", message: "존재하지 않는 결제입니다.", retryable: false };
    },
    async getPaymentByOrderId(orderNumber) {
      calls.byOrder++;
      if (state.lookupDown) return network();
      const p = find(orderNumber);
      if (p) return { ok: true, payment: p };
      const auth = [...authorized.entries()].find(([, v]) => v.orderId === orderNumber);
      if (auth) {
        // 인증만 끝나고 승인 전: 결제사 기록은 IN_PROGRESS
        return {
          ok: true,
          payment: { paymentKey: auth[0], orderId: orderNumber, status: "IN_PROGRESS", totalAmount: auth[1].amount, balanceAmount: auth[1].amount, method: null, approvedAt: null, mId: "fake-merchant" },
        };
      }
      return { ok: false, code: "NOT_FOUND_PAYMENT", message: "존재하지 않는 결제입니다.", retryable: false };
    },
  };

  return {
    gateway,
    calls,
    state,
    byKey,
    /** 고객이 결제창에서 인증까지 마침 (승인 전) */
    authorize: (paymentKey: string, orderId: string, amount: number) => authorized.set(paymentKey, { orderId, amount }),
    /** 우리 서버가 모르는 사이에 결제사에서 승인됨 */
    approveBehindOurBack: (paymentKey: string, orderId: string, amount: number) => approve(paymentKey, orderId, amount),
    /** 결제사에서 취소(환불) */
    cancel: (paymentKey: string) => {
      const p = byKey.get(paymentKey);
      if (p) byKey.set(paymentKey, { ...p, status: "CANCELED", balanceAmount: 0 });
    },
    setStatus: (paymentKey: string, status: GatewayPayment["status"]) => {
      const p = byKey.get(paymentKey);
      if (p) byKey.set(paymentKey, { ...p, status });
    },
    find,
  };
}

export type FakeToss = ReturnType<typeof createFakeToss>;
