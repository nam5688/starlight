// 심층 리포트 구매 시작 버튼의 결과 — 결제 단계로 갈 수 있을 때만 이동하고, 못 가는 이유는 화면에 그대로 보인다(채널 독립 순수 규칙).
// 예전에는 상담방 · 구매 안내 화면의 "받기" 버튼이 같은 화면의 구매 영역(#r-purchase)으로 가는 링크였고, 구매를 시작하는 동작은 막혔을 때 같은 결과 화면으로 조용히 되돌아갔다
// (결제 연결 전 · 새 구매 중지 · 로그인 풀림 · 이미 결제함 · 삭제한 기록). 모바일에서는 다른 화면에서 온 #주소 이동이 구매 영역까지 내려가지 않아 "눌러도 아무 일도 없는" 것처럼 보였다.
// 이 규칙은 결제를 시작하는 서버 동작 하나가 돌려주는 값을 "이동 / 이유가 있는 멈춤"으로 정한다. 금액 · 소유자 · 판매 가능 여부는 서버가 확인하고 이 파일은 문구와 분류만 정한다.
import { salesClosedMessage, type GateReason } from "../services/capacity-service.ts";
import type { StartCheckoutResult } from "../services/order-service.ts";

export type PurchaseBlockReason =
  | "login"
  | "payments-not-ready"
  | "sales-closed"
  | "already-paid"
  | "record-deleted"
  | "report-not-ready"
  | "options"
  | "not-found"
  | "error";

export type PurchaseStartState =
  | { status: "idle" }
  | { status: "blocked"; reason: PurchaseBlockReason; message: string; link?: { href: string; label: string }; errorId?: string };

export const IDLE_PURCHASE_START: PurchaseStartState = { status: "idle" };

/** 결제를 시작하지 않았을 때 어느 경우에나 같이 알리는 말 — 카드에서 금액이 빠져나가지 않았다 */
const NOT_CHARGED = "결제는 시작되지 않았고 카드에서 금액이 빠져나가지 않았어요.";

export type BlockedOptions = { assessmentId?: string; gateReason?: GateReason | null; orderNumber?: string; errorId?: string; panelHref?: string };

export function blockedState(reason: PurchaseBlockReason, o: BlockedOptions = {}): PurchaseStartState {
  const resultHref = o.assessmentId ? `/results/${o.assessmentId}` : "/my";
  switch (reason) {
    case "login":
      return { status: "blocked", reason, message: "로그인이 풀렸어요. 로그인한 뒤 다시 눌러 주세요.", link: { href: "/my", label: "MY에서 로그인하기" } };
    case "payments-not-ready":
      return { status: "blocked", reason, message: `결제가 아직 준비되지 않았어요. ${NOT_CHARGED} 준비가 끝나면 이 버튼으로 받을 수 있어요.` };
    case "sales-closed":
      return { status: "blocked", reason, message: salesClosedMessage(o.gateReason ?? null) };
    case "already-paid":
      return { status: "blocked", reason, message: "이미 받은 리포트가 있어요. 새로 결제하지 않았어요.", link: { href: resultHref, label: "내 리포트 보기" } };
    case "record-deleted":
      return { status: "blocked", reason, message: `삭제한 기록이라 새로 받을 수 없어요. ${NOT_CHARGED}` };
    case "report-not-ready":
      return {
        status: "blocked",
        reason,
        message: "받은 리포트가 아직 준비 중이거나 만들지 못한 상태예요. 새로 결제하지 않고 그 리포트의 상태를 먼저 보여 드릴게요.",
        link: { href: o.orderNumber ? `${resultHref}?r=${encodeURIComponent(o.orderNumber)}` : resultHref, label: "리포트 상태 보기" },
      };
    case "options":
      return {
        status: "blocked",
        reason,
        message: "할인이나 혜택을 고를 수 있어요. 구매 영역에서 골라 주세요. 아직 결제하지 않았어요.",
        link: { href: o.panelHref ?? `${resultHref}#r-purchase`, label: "구매 영역으로 가기" },
      };
    case "not-found":
      return { status: "blocked", reason, message: `내 결과를 찾지 못했어요. ${NOT_CHARGED}`, link: { href: "/my", label: "MY로 가기" } };
    case "error":
      return {
        status: "blocked",
        reason,
        message: `결제를 시작하지 못했어요. 잠시 뒤에 다시 눌러 주세요. ${NOT_CHARGED}${o.errorId ? ` 계속되면 오류번호 ${o.errorId}를 알려 주세요.` : ""}`,
        ...(o.errorId ? { errorId: o.errorId } : {}),
      };
  }
}

export type PurchaseDecision = { kind: "go"; path: string } | { kind: "blocked"; state: PurchaseStartState };

/** 결제 시작 결과 → 이동할 곳 또는 멈춘 이유. 결제 주문이 만들어진 경우에만 결제 화면으로 간다 */
export function purchaseDecisionOf(result: StartCheckoutResult, assessmentId: string): PurchaseDecision {
  switch (result.kind) {
    case "order":
      return { kind: "go", path: `/checkout/${result.order.orderNumber}` };
    case "granted":
      // 이 버튼은 결제 없는 혜택 주문을 만들지 않는다 — 만들어졌다면 리포트 화면으로 보낸다
      return { kind: "go", path: `/results/${assessmentId}?r=${encodeURIComponent(result.order.orderNumber)}` };
    case "already-paid":
      return { kind: "blocked", state: blockedState("already-paid", { assessmentId }) };
    case "sales-closed":
      return { kind: "blocked", state: blockedState("sales-closed", { assessmentId, gateReason: result.reason }) };
    case "record-deleted":
      return { kind: "blocked", state: blockedState("record-deleted", { assessmentId }) };
    case "report-not-ready":
      return { kind: "blocked", state: blockedState("report-not-ready", { assessmentId, orderNumber: result.order.orderNumber }) };
    case "discount-denied":
      return { kind: "blocked", state: blockedState(result.reason === "error" ? "error" : "options", { assessmentId }) };
    case "not-found":
      return { kind: "blocked", state: blockedState("not-found", { assessmentId }) };
  }
}
