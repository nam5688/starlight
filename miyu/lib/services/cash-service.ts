// 미유캐시 — 충전 주문 시작과 잔액 · 내역 조회. 충전은 개인 통합 리포트와 같은 결제 흐름(주문 → 토스 결제 → 서버 승인 확인)을 그대로 쓰고,
// 결제 승인이 확인되면 DB(orders_cash_change 트리거)가 같은 처리 안에서 지갑에 캐시를 넣는다. 서비스는 지갑에 직접 쓰지 않는다.
// 금액 · 보너스는 서버가 견적(lib/commerce/cash.ts)으로 정하고 브라우저가 보낸 값은 믿지 않는다.

import { createOrderNumber } from "../commerce/order.ts";
import { createCashNonce, productIdFor, quoteCharge, questionsLeft, type CashQuote } from "../commerce/cash.ts";
import { isCashProduct } from "../config/product.ts";
import type { GateReason } from "./capacity-service.ts";
import type { SaleGateCheck } from "./order-service.ts";
import type { Acquisition, CashLedgerRecord, MiyuRepository, OrderRecord, PaymentEnv } from "./ports.ts";

export type StartCashChargeResult =
  | { kind: "order"; order: OrderRecord; quote: CashQuote }
  /** 충전할 수 없는 개수(10의 배수가 아니거나 범위 밖) */
  | { kind: "invalid-amount" }
  /** 지금은 새 구매를 받지 않음(AI 용량 · 하루 예산) — 질문을 이어 갈 수 없는 때 미리 충전받지 않는다 */
  | { kind: "sales-closed"; reason: GateReason | null }
  /** 지갑을 쓸 수 없는 DB(13번 변경 전) — 결제가 승인돼도 캐시를 넣을 수 없으므로 주문을 만들지 않는다 */
  | { kind: "unavailable" }
  | { kind: "not-found" };

/**
 * 충전 결제 시작. 충전 주문은 본인의 검사 결과 하나에 붙인다(주문 표가 검사 결과 번호를 요구한다) — 충전한 캐시는 결과와 무관하게 회원 지갑에 쌓인다.
 * 이 결과에 남아 있던 충전 대기 주문은 새 결제 요청으로 대체한다(결제창을 닫고 다시 누른 경우).
 */
export async function startCashCharge(
  deps: { repo: MiyuRepository; now: () => Date; newOrderNumber?: (now: Date) => string; nonce?: () => string; gate?: SaleGateCheck },
  input: { userId: string; assessmentId: string; cash: unknown; paymentEnv?: PaymentEnv; acquisition?: Acquisition | null },
): Promise<StartCashChargeResult> {
  const { repo } = deps;
  const assessment = await repo.getAssessment(input.assessmentId);
  if (!assessment || assessment.userId !== input.userId) return { kind: "not-found" };
  const quote = quoteCharge(input.cash);
  if (!quote) return { kind: "invalid-amount" };
  // 결제가 승인돼도 지갑에 넣을 수 없으면 돈만 빠진다 — 지갑 표(13번 DB 변경)가 있을 때만 주문을 만든다
  if (!(await walletReady(repo, input.userId))) return { kind: "unavailable" };

  if (deps.gate) {
    try {
      const g = await deps.gate("start");
      if (!g.open) return { kind: "sales-closed", reason: g.reason };
    } catch {
      // 확인 자체가 실패하면 판매를 막지 않는다 (다른 상품과 같은 규칙)
    }
  }

  const orders = await repo.listOrdersForAssessment(assessment.id);
  for (const pending of orders.filter((o) => o.status === "pending" && isCashProduct(o.productId))) {
    const canceled = await repo.updateOrder(pending.id, ["pending"], { status: "canceled", failureCode: "SUPERSEDED", failureMessage: "새 결제 요청으로 대체됨" });
    if (canceled) await repo.addPaymentEvent({ orderId: pending.id, source: "checkout", status: "SUPERSEDED", detail: {} });
  }

  const makeNumber = deps.newOrderNumber ?? ((now: Date) => createOrderNumber(now));
  const nonce = deps.nonce ?? createCashNonce;
  for (let attempt = 0; attempt < 3; attempt++) {
    const inserted = await repo.insertOrder({
      orderNumber: makeNumber(deps.now()),
      userId: input.userId,
      assessmentId: assessment.id,
      productId: productIdFor(quote, nonce()),
      amount: quote.priceKrw,
      paymentEnv: input.paymentEnv ?? "test",
      acquisition: input.acquisition ?? null,
    });
    if (inserted.ok) return { kind: "order", order: inserted.value, quote };
  }
  throw new Error("충전 주문을 만들지 못했습니다.");
}

export const CASH_KIND_LABEL: Record<CashLedgerRecord["kind"], string> = {
  charge: "충전",
  bonus: "보너스",
  spend: "질문에 사용",
  spend_restore: "질문 복구 (답을 받지 못함)",
  clawback: "결제 취소로 회수",
};

/** 지갑을 쓸 수 있는가 — 표가 없으면(DB 변경 13번 전) false */
export async function walletReady(repo: MiyuRepository, userId: string): Promise<boolean> {
  try {
    await repo.getCashBalance(userId);
    return true;
  } catch {
    return false;
  }
}

export type CashView = {
  /** 지갑을 쓸 수 있는가 (false면 충전 · 사용 모두 막힌다) */
  ready: boolean;
  balance: number;
  /** 지금 잔액으로 물어볼 수 있는 횟수 */
  questions: number;
  /** 최근 내역 (최근 것부터) */
  ledger: { id: number; kind: CashLedgerRecord["kind"]; label: string; amount: number; at: string }[];
};

/** 지갑 잔액과 최근 내역 — 본인 것만(조회는 로그인 사용자 저장소의 접근 정책으로도 막힌다). 표가 없으면(13번 변경 전) 0으로 본다 */
export async function getCashView(repo: MiyuRepository, userId: string, limit = 30): Promise<CashView> {
  let balance = 0;
  let rows: CashLedgerRecord[] = [];
  let ready = true;
  try {
    [balance, rows] = await Promise.all([repo.getCashBalance(userId), repo.listCashLedger(userId, limit)]);
  } catch {
    // 13번 DB 변경 전에는 지갑이 없다 — 화면은 0으로 보이고 충전은 막힌다
    ready = false;
  }
  return {
    ready,
    balance,
    questions: questionsLeft(balance),
    ledger: rows.map((r) => ({ id: r.id, kind: r.kind, label: CASH_KIND_LABEL[r.kind], amount: r.amount, at: r.createdAt })),
  };
}
