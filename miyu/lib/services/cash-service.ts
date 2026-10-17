// 유료 질문 — 질문 3개 묶음(2,500원) 결제 주문 시작과 결제한 질문 조회. 결제는 개인 통합 리포트와 같은 흐름(주문 → 토스 결제 → 서버 승인 확인)을 그대로 쓰고,
// 결제 승인이 확인되면 DB(orders_cash_change 트리거)가 같은 처리 안에서 장부에 질문 3개(9단위)를 넣는다. 서비스는 장부에 직접 쓰지 않는다.
// 금액은 서버가 정하고(lib/commerce/cash.ts) 브라우저가 보낸 값은 믿지 않는다. 낱개 결제 · 충전 금액 입력 · 보너스 · 지갑 화면은 없다(운영자 2026-10-15).

import { createOrderNumber } from "../commerce/order.ts";
import { canAffordQuestion, createQuestionNonce, questionProductId, questionQuote, questionsLeft, type QuestionQuote } from "../commerce/cash.ts";
import { hasSupportContact } from "../config/business.ts";
import { isCashProduct, MIYU_CASH, questionPackSalesOpen } from "../config/product.ts";
import type { GateReason } from "./capacity-service.ts";
import { gatePurchase, gateQuestion, type AskDeps, type AskInput, type AskResult, type PurchaseInput } from "./chat-service.ts";
import type { SaleGateCheck } from "./order-service.ts";
import type { Acquisition, CashLedgerRecord, MiyuRepository, OrderRecord, PaymentEnv } from "./ports.ts";

export type StartQuestionPaymentResult =
  /** 결제 없이 물을 수 있다 — 이 방의 무료 질문이 남았거나 이미 결제한 질문이 남아 있다 (바로 질문을 보낸다) */
  | { kind: "ask" }
  /** 결제 주문을 만들었다 — 결제 화면으로 보낸다 */
  | { kind: "order"; order: OrderRecord; quote: QuestionQuote }
  /** 질문을 받을 수 없다 — 힘든 글의 안내 · 글자 수 · 잠긴 방 같은 이유 (결제하지 않는다) */
  | { kind: "refused"; result: AskResult }
  /** 지금은 새 구매를 받지 않음(AI 용량 · 하루 예산) — 답할 수 없을 때 미리 결제받지 않는다 */
  | { kind: "sales-closed"; reason: GateReason | null }
  /** 장부를 쓸 수 없는 DB(13번 변경 전) — 결제가 승인돼도 질문을 넣을 수 없으므로 주문을 만들지 않는다 */
  | { kind: "unavailable" }
  /** 실결제 모드인데 이용 기준(환불 · 유효기간 · 탈퇴 · 서비스 종료)이 확정되지 않았거나 고객 문의 채널이 없다 — 주문을 만들지 않는다(돈이 빠지지 않는다). 테스트 결제는 막지 않는다 */
  | { kind: "policy-pending" }
  | { kind: "not-found" };

/**
 * 질문 3개 묶음 결제 시작(운영자 2026-10-16: 무료 질문을 다 쓰면 입력칸이 구매 버튼으로 바뀌고, 그전에는 입력창 위에 작은 구매 버튼이 있다 — 둘 다 **질문 없이** 구매를 시작한다).
 * 질문 글(`question`)이 없으면 방 · 이어 갈 수 있는지 · 하루 예산만 확인하고(`gatePurchase`) 주문을 만든다. 무료 질문이 남아 있어도 살 수 있다(결제한 질문은 무료 질문을 다 쓴 뒤에 쓰인다).
 * 질문 글이 함께 오면(예전 화면이 열려 있는 경우) **질문을 받을 수 있는지(무료 질문 수 · 글자 수 · 위기 표현 · 잠긴 방 · 하루 예산)를 답할 때와 같은 규칙으로 먼저 확인한 뒤에만** 주문을 만든다 —
 * 마음이 많이 힘든 글은 결제 없이 안내로 끝나고, 무료 질문이 남았다면 결제 없이 묻게 한다.
 * 어느 쪽이든 결제한 질문이 하나라도 남아 있으면 새로 결제받지 않는다(그래서 쓰지 않은 질문은 최대 2개까지 남는다).
 * 질문 글은 확인에만 쓰고 저장하지 않는다.
 * 주문은 본인의 검사 결과 하나에 붙고(주문 표가 검사 결과 번호를 요구한다), 이 결과에 남아 있던 질문 결제 대기 주문은 새 결제 요청으로 대체한다(결제창을 닫고 다시 누른 경우).
 */
export async function startQuestionPayment(
  deps: AskDeps & { newOrderNumber?: (now: Date) => string; nonce?: (room: string) => string; saleGate?: SaleGateCheck; /** 테스트용: 실결제 판매를 열어도 되는지(기본은 이용 기준 확정 + 문의 채널이 있을 때만) */ liveSalesOpen?: boolean },
  input: (PurchaseInput & { question?: undefined } | AskInput) & { paymentEnv?: PaymentEnv; acquisition?: Acquisition | null },
): Promise<StartQuestionPaymentResult> {
  const { repo } = deps;
  let room: string;
  if (input.question === undefined) {
    const gate = await gatePurchase(deps, input);
    if (!gate.ok) return { kind: "refused", result: gate.result };
    room = gate.loaded.room;
  } else {
    const gate = await gateQuestion(deps, input as AskInput);
    if (!gate.ok) return { kind: "refused", result: gate.result };
    if (gate.inQuota) return { kind: "ask" };
    room = gate.loaded.room;
  }
  const assessment = await repo.getAssessment(input.assessmentId);
  if (!assessment || assessment.userId !== input.userId) return { kind: "not-found" };

  // 결제가 승인돼도 장부에 넣을 수 없으면 돈만 빠진다 — 장부 표(13번 DB 변경)가 있을 때만 주문을 만든다
  let balance: number;
  try {
    balance = await repo.getCashBalance(input.userId);
  } catch {
    return { kind: "unavailable" };
  }
  // 결제한 질문이 하나라도 남아 있으면(묶음에서 아직 쓰지 않았거나, 답을 받지 못했거나, 결제 뒤 돌아오지 못했을 때) 새로 결제받지 않고 그 질문으로 묻는다
  if (canAffordQuestion(balance)) return { kind: "ask" };

  // 실결제인데 이용 기준이 확정되지 않았거나 환불을 요청할 문의 채널이 없으면 결제를 시작하지 않는다 (테스트 결제는 그대로 열려 있다)
  if (input.paymentEnv === "live" && !(deps.liveSalesOpen ?? questionPackSalesOpen(MIYU_CASH.policyDecided, hasSupportContact()))) return { kind: "policy-pending" };

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
      productId: questionProductId(nonce(room)),
      amount: quote.priceKrw,
      paymentEnv: input.paymentEnv ?? "test",
      acquisition: input.acquisition ?? null,
    });
    if (inserted.ok) return { kind: "order", order: await keepNewestPending(repo, assessment.id, inserted.value), quote };
  }
  throw new Error("질문 결제 주문을 만들지 못했어요.");
}

/**
 * 같은 결과에 질문 결제 대기 주문이 둘 이상 남지 않게 한다 — 두 번 누르거나 탭 두 개에서 동시에 시작해도 가장 늦게 만든 주문 하나만 결제할 수 있고,
 * 어느 요청이 먼저 끝났든 모두 그 주문으로 보낸다(그래서 같은 묶음을 두 번 결제하는 길을 줄인다). 이미 결제를 시작한 주문(대기가 아닌 것)은 건드리지 않는다.
 */
async function keepNewestPending(repo: MiyuRepository, assessmentId: string, mine: OrderRecord): Promise<OrderRecord> {
  const pendings = (await repo.listOrdersForAssessment(assessmentId)).filter((o) => o.status === "pending" && isCashProduct(o.productId));
  const newest = pendings.reduce<OrderRecord>((best, o) => (o.createdAt > best.createdAt || (o.createdAt === best.createdAt && o.id > best.id) ? o : best), mine);
  for (const o of pendings) {
    if (o.id === newest.id) continue;
    const canceled = await repo.updateOrder(o.id, ["pending"], { status: "canceled", failureCode: "SUPERSEDED", failureMessage: "새 결제 요청으로 대체됨" });
    if (canceled) await repo.addPaymentEvent({ orderId: o.id, source: "checkout", status: "SUPERSEDED", detail: {} });
  }
  return newest;
}

export const CASH_KIND_LABEL: Record<CashLedgerRecord["kind"], string> = {
  charge: "질문 결제 (묶음)",
  bonus: "보너스 (예전 방식)",
  spend: "질문에 사용",
  spend_restore: "질문 복구 (답을 받지 못함)",
  clawback: "결제 취소로 회수",
  refund_claw: "환불로 남은 질문 회수",
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
  /** 장부 단위 잔액 (결제한 질문이 없으면 0, 묶음 하나는 9단위) */
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
