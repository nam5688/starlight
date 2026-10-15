// 유료 질문 — 질문 한 개당 결제 주문 시작과 결제한 질문 조회. 결제는 개인 통합 리포트와 같은 흐름(주문 → 토스 결제 → 서버 승인 확인)을 그대로 쓰고,
// 결제 승인이 확인되면 DB(orders_cash_change 트리거)가 같은 처리 안에서 장부에 질문 한 개를 넣는다. 서비스는 장부에 직접 쓰지 않는다.
// 금액은 서버가 정하고(lib/commerce/cash.ts) 브라우저가 보낸 값은 믿지 않는다. 충전 · 보너스 · 지갑 화면은 없다(운영자 2026-10-15).

import { createOrderNumber } from "../commerce/order.ts";
import { canAffordQuestion, createQuestionNonce, questionProductId, questionQuote, questionsLeft, type QuestionQuote } from "../commerce/cash.ts";
import { isCashProduct } from "../config/product.ts";
import type { GateReason } from "./capacity-service.ts";
import { gateQuestion, type AskDeps, type AskInput, type AskResult } from "./chat-service.ts";
import type { SaleGateCheck } from "./order-service.ts";
import type { Acquisition, CashLedgerRecord, MiyuRepository, OrderRecord, PaymentEnv } from "./ports.ts";

export type StartQuestionPaymentResult =
  /** 결제 없이 물을 수 있다 — 이 방의 무료 질문이 남았거나 이미 결제한 질문이 있다 (바로 질문을 보낸다) */
  | { kind: "ask" }
  /** 결제 주문을 만들었다 — 결제 화면으로 보낸다 */
  | { kind: "order"; order: OrderRecord; quote: QuestionQuote }
  /** 질문을 받을 수 없다 — 힘든 글의 안내 · 글자 수 · 잠긴 방 같은 이유 (결제하지 않는다) */
  | { kind: "refused"; result: AskResult }
  /** 지금은 새 구매를 받지 않음(AI 용량 · 하루 예산) — 답할 수 없을 때 미리 결제받지 않는다 */
  | { kind: "sales-closed"; reason: GateReason | null }
  /** 장부를 쓸 수 없는 DB(13번 변경 전) — 결제가 승인돼도 질문을 넣을 수 없으므로 주문을 만들지 않는다 */
  | { kind: "unavailable" }
  | { kind: "not-found" };

/**
 * 질문 결제 시작. **질문을 받을 수 있는지(무료 질문 수 · 글자 수 · 위기 표현 · 잠긴 방 · 하루 예산)를 답할 때와 같은 규칙으로 먼저 확인한 뒤에만** 주문을 만든다 —
 * 마음이 많이 힘든 글은 결제 없이 안내로 끝나고, 무료 질문이 남았거나 결제한 질문이 이미 있으면 새로 결제받지 않는다(보관은 질문 한 개까지).
 * 질문 글은 확인에만 쓰고 저장하지 않는다(결제를 다녀오는 동안은 브라우저에만 남는다).
 * 주문은 본인의 검사 결과 하나에 붙고(주문 표가 검사 결과 번호를 요구한다), 이 결과에 남아 있던 질문 결제 대기 주문은 새 결제 요청으로 대체한다(결제창을 닫고 다시 누른 경우).
 */
export async function startQuestionPayment(
  deps: AskDeps & { newOrderNumber?: (now: Date) => string; nonce?: (room: string) => string; saleGate?: SaleGateCheck },
  input: AskInput & { paymentEnv?: PaymentEnv; acquisition?: Acquisition | null },
): Promise<StartQuestionPaymentResult> {
  const { repo } = deps;
  const gate = await gateQuestion(deps, input);
  if (!gate.ok) return { kind: "refused", result: gate.result };
  if (gate.inQuota) return { kind: "ask" };
  const assessment = await repo.getAssessment(input.assessmentId);
  if (!assessment || assessment.userId !== input.userId) return { kind: "not-found" };

  // 결제가 승인돼도 장부에 넣을 수 없으면 돈만 빠진다 — 장부 표(13번 DB 변경)가 있을 때만 주문을 만든다
  let balance: number;
  try {
    balance = await repo.getCashBalance(input.userId);
  } catch {
    return { kind: "unavailable" };
  }
  // 결제한 질문이 이미 남아 있으면(답을 받지 못했거나 결제 뒤 돌아오지 못했을 때) 새로 결제받지 않고 그 질문으로 묻는다
  if (canAffordQuestion(balance)) return { kind: "ask" };

  if (deps.saleGate) {
    try {
      const g = await deps.saleGate("start");
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

  const quote = questionQuote();
  const makeNumber = deps.newOrderNumber ?? ((now: Date) => createOrderNumber(now));
  const nonce = deps.nonce ?? createQuestionNonce;
  for (let attempt = 0; attempt < 3; attempt++) {
    const inserted = await repo.insertOrder({
      orderNumber: makeNumber(deps.now()),
      userId: input.userId,
      assessmentId: assessment.id,
      productId: questionProductId(nonce(gate.loaded.room)),
      amount: quote.priceKrw,
      paymentEnv: input.paymentEnv ?? "test",
      acquisition: input.acquisition ?? null,
    });
    if (inserted.ok) return { kind: "order", order: inserted.value, quote };
  }
  throw new Error("질문 결제 주문을 만들지 못했습니다.");
}

export const CASH_KIND_LABEL: Record<CashLedgerRecord["kind"], string> = {
  charge: "질문 결제",
  bonus: "보너스 (예전 방식)",
  spend: "질문에 사용",
  spend_restore: "질문 복구 (답을 받지 못함)",
  clawback: "결제 취소로 회수",
};

/** 장부를 쓸 수 있는가 — 표가 없으면(DB 변경 13번 전) false */
export async function walletReady(repo: MiyuRepository, userId: string): Promise<boolean> {
  try {
    await repo.getCashBalance(userId);
    return true;
  } catch {
    return false;
  }
}

export type CashView = {
  /** 장부를 쓸 수 있는가 (false면 유료 질문이 닫힌다) */
  ready: boolean;
  /** 장부 단위 잔액 (결제한 질문이 없으면 0) */
  balance: number;
  /** 결제하고 아직 쓰지 않은 질문 수 */
  questions: number;
  /** 최근 내역 (최근 것부터) */
  ledger: { id: number; kind: CashLedgerRecord["kind"]; label: string; amount: number; at: string }[];
};

/** 결제한 질문과 최근 내역 — 본인 것만(조회는 로그인 사용자 저장소의 접근 정책으로도 막힌다). 표가 없으면(13번 변경 전) 0으로 본다 */
export async function getCashView(repo: MiyuRepository, userId: string, limit = 30): Promise<CashView> {
  let balance = 0;
  let rows: CashLedgerRecord[] = [];
  let ready = true;
  try {
    [balance, rows] = await Promise.all([repo.getCashBalance(userId), repo.listCashLedger(userId, limit)]);
  } catch {
    // 13번 DB 변경 전에는 장부가 없다 — 유료 질문은 닫힌다
    ready = false;
  }
  return {
    ready,
    balance,
    questions: questionsLeft(balance),
    ledger: rows.map((r) => ({ id: r.id, kind: r.kind, label: CASH_KIND_LABEL[r.kind], amount: r.amount, at: r.createdAt })),
  };
}
