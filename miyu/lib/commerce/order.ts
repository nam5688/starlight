// 주문·결제 규칙 — 채널(웹, 이후 다른 채널)과 결제사에 관계없이 같은 규칙을 쓴다.

export type OrderStatus = "pending" | "paid" | "failed" | "canceled" | "refunded";

/**
 * 허용하는 상태 변경. DB 트리거(supabase/migrations)도 같은 규칙으로 막는다.
 * - failed/canceled → paid: 결제사 기록상 승인이 끝난 경우(응답 유실 등)를 맞추기 위한 예외
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["paid", "failed", "canceled"],
  failed: ["paid"],
  canceled: ["paid"],
  paid: ["refunded"],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** 결제사 규칙: 영문·숫자·-·_·= 로 이루어진 6~64자 */
const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9_=-]{6,64}$/;

export function isValidOrderNumber(value: string): boolean {
  return ORDER_NUMBER_PATTERN.test(value);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0·O·1·I 제외

/** 예: MEU-20261011-7K3QX9ZP2M — 날짜(UTC) + 추측하기 어려운 무작위 10자 */
export function createOrderNumber(
  now: Date,
  random: (bytes: Uint8Array) => Uint8Array = (b) => globalThis.crypto.getRandomValues(b),
): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const bytes = random(new Uint8Array(10));
  const suffix = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `MEU-${date}-${suffix}`;
}

/** 결제사 결제 상태 (토스페이먼츠 Payment.status와 같은 값) */
export type GatewayPaymentStatus =
  | "READY"
  | "IN_PROGRESS"
  | "WAITING_FOR_DEPOSIT"
  | "DONE"
  | "CANCELED"
  | "PARTIAL_CANCELED"
  | "ABORTED"
  | "EXPIRED";

/** 결제사 응답을 서비스에서 쓰는 형태로 줄인 것. 카드 번호 등은 담지 않는다. */
export type GatewayPayment = {
  paymentKey: string;
  orderId: string;
  status: GatewayPaymentStatus;
  totalAmount: number;
  balanceAmount: number;
  method: string | null;
  approvedAt: string | null;
  /** 결제를 처리한 상점 ID */
  mId: string | null;
};

/**
 * 결제사 상태 → 맞춰야 할 주문 상태. null이면 주문 상태를 바꾸지 않는다.
 * 부분 취소는 단일 상품이라 정상 흐름에서 생기지 않으므로 기록만 남기고 운영자가 확인한다.
 */
export function orderStatusFor(payment: GatewayPayment): OrderStatus | null {
  switch (payment.status) {
    case "DONE":
      return "paid";
    case "CANCELED":
      return "refunded";
    case "ABORTED":
    case "EXPIRED":
      return "failed";
    default:
      return null;
  }
}

/** 결제창에서 구매자가 직접 취소했을 때 결제사가 주는 코드 */
export const USER_CANCEL_CODES = ["PAY_PROCESS_CANCELED", "USER_CANCEL"];
