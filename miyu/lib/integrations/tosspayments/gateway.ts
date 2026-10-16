// 토스페이먼츠 결제 승인·조회 API 연결 (서버 전용 — 시크릿 키 사용).
// Next.js에 의존하지 않으므로 다른 채널의 서버에서도 그대로 쓸 수 있다.
// 참고: https://docs.tosspayments.com/reference

import type { GatewayPayment, GatewayPaymentStatus } from "../../commerce/order.ts";
import type { GatewayResult, PaymentGateway } from "../../services/ports.ts";

export const TOSS_API_BASE_URL = "https://api.tosspayments.com";

export type TossGatewayOptions = {
  secretKey: string;
  /** 테스트에서만 바꾼다 (기본: 토스페이먼츠 API) */
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export function createTossPaymentGateway(options: TossGatewayOptions): PaymentGateway {
  const baseUrl = (options.baseUrl ?? TOSS_API_BASE_URL).replace(/\/$/, "");
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  // 시크릿 키 뒤에 ':'을 붙여 base64로 인코딩한 Basic 인증
  const authorization = `Basic ${btoa(`${options.secretKey}:`)}`;

  async function call(path: string, init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string }): Promise<GatewayResult> {
    const headers: Record<string, string> = { Authorization: authorization };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch {
      return { ok: false, code: "NETWORK_ERROR", message: "결제사에 연결하지 못했습니다.", retryable: true };
    }

    let json: Record<string, unknown> = {};
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      // 본문이 JSON이 아니면 아래에서 HTTP 상태로 판단한다
    }

    if (!response.ok) {
      return {
        ok: false,
        code: typeof json.code === "string" ? json.code : `HTTP_${response.status}`,
        message: typeof json.message === "string" ? json.message : "결제 처리 중 오류가 발생했습니다.",
        retryable: response.status >= 500 || response.status === 429,
      };
    }
    const payment = toGatewayPayment(json);
    if (!payment) {
      return { ok: false, code: "INVALID_RESPONSE", message: "결제사 응답을 해석하지 못했습니다.", retryable: true };
    }
    return { ok: true, payment };
  }

  return {
    provider: "tosspayments",
    confirm({ paymentKey, orderId, amount }) {
      return call("/v1/payments/confirm", {
        method: "POST",
        body: { paymentKey, orderId, amount },
        // 같은 결제를 다시 승인 요청해도 한 번만 처리되도록 멱등키를 붙인다
        idempotencyKey: `meu-confirm-${paymentKey}`.slice(0, 300),
      });
    },
    getPayment(paymentKey) {
      return call(`/v1/payments/${encodeURIComponent(paymentKey)}`, { method: "GET" });
    },
    getPaymentByOrderId(orderNumber) {
      return call(`/v1/payments/orders/${encodeURIComponent(orderNumber)}`, { method: "GET" });
    },
  };
}

const STATUSES: readonly GatewayPaymentStatus[] = [
  "READY",
  "IN_PROGRESS",
  "WAITING_FOR_DEPOSIT",
  "DONE",
  "CANCELED",
  "PARTIAL_CANCELED",
  "ABORTED",
  "EXPIRED",
];

/**
 * 지금까지 취소된 누적 금액 — 결제사 cancels 배열 중 완료(cancelStatus DONE 또는 값 없음)된 것의 cancelAmount 합.
 * 남은 취소 가능 금액(balanceAmount)으로 센 값(총액 − 잔액)과 다르면 **작은 쪽**을 쓴다(질문을 더 적게 회수하는 쪽 — 확인이 필요하면 운영자가 본다).
 */
function canceledTotal(json: Record<string, unknown>, totalAmount: number, balanceAmount: number): number {
  const fromBalance = Math.max(0, totalAmount - balanceAmount);
  if (!Array.isArray(json.cancels) || json.cancels.length === 0) return fromBalance;
  let sum = 0;
  for (const c of json.cancels as Record<string, unknown>[]) {
    if (!c || typeof c.cancelAmount !== "number") continue;
    if (c.cancelStatus !== undefined && c.cancelStatus !== null && c.cancelStatus !== "DONE") continue;
    sum += c.cancelAmount;
  }
  return Math.min(sum, fromBalance);
}

/** 필요한 값만 꺼낸다 (카드 번호 등 결제수단 상세는 저장하지 않는다) */
export function toGatewayPayment(json: Record<string, unknown>): GatewayPayment | null {
  const status = json.status as GatewayPaymentStatus;
  if (
    typeof json.paymentKey !== "string" ||
    typeof json.orderId !== "string" ||
    typeof json.totalAmount !== "number" ||
    !STATUSES.includes(status)
  ) {
    return null;
  }
  const balanceAmount = typeof json.balanceAmount === "number" ? json.balanceAmount : json.totalAmount;
  return {
    paymentKey: json.paymentKey,
    orderId: json.orderId,
    status,
    totalAmount: json.totalAmount,
    balanceAmount,
    canceledAmount: canceledTotal(json, json.totalAmount, balanceAmount),
    method: typeof json.method === "string" ? json.method : null,
    approvedAt: typeof json.approvedAt === "string" ? json.approvedAt : null,
    mId: typeof json.mId === "string" ? json.mId : null,
  };
}
