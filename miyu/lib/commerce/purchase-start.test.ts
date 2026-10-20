// 실행: npm test — 심층 리포트 구매 시작 버튼의 결과 분류(이동 / 이유가 있는 멈춤)를 확인한다(비용 0 — 순수 규칙, 결제 · DB · AI 없음).
// 모바일에서 "눌러도 아무 일도 없던" 문제의 한 갈래(구매를 시작하는 동작이 막혔을 때 같은 화면으로 조용히 되돌아가던 것)가 이제 이유가 보이는 멈춤인지 본다.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StartCheckoutResult } from "../services/order-service.ts";
import { blockedState, purchaseDecisionOf, type PurchaseBlockReason } from "./purchase-start.ts";

const ID = "11111111-2222-4333-8444-555555555555";
const ORDER = { orderNumber: "MEU-20261020-TESTORDER1" } as never;

test("결제 주문이 만들어졌을 때만 결제 화면으로 이동한다", () => {
  assert.deepEqual(purchaseDecisionOf({ kind: "order", order: ORDER } as StartCheckoutResult, ID), { kind: "go", path: "/checkout/MEU-20261020-TESTORDER1" });
});

test("결제 없이 끝난 혜택 주문은 리포트 화면으로 보낸다(결제 화면이 아니다)", () => {
  const d = purchaseDecisionOf({ kind: "granted", order: ORDER } as StartCheckoutResult, ID);
  assert.equal(d.kind, "go");
  assert.equal(d.kind === "go" && d.path.startsWith(`/results/${ID}?r=`), true);
});

test("막힌 모든 경우는 이동하지 않고 이유 문구를 돌려준다 — 조용한 되돌림이 없다", () => {
  const cases: [StartCheckoutResult, PurchaseBlockReason][] = [
    [{ kind: "already-paid", order: ORDER } as StartCheckoutResult, "already-paid"],
    [{ kind: "sales-closed", reason: "budget" } as StartCheckoutResult, "sales-closed"],
    [{ kind: "record-deleted" } as StartCheckoutResult, "record-deleted"],
    [{ kind: "report-not-ready", order: ORDER } as StartCheckoutResult, "report-not-ready"],
    [{ kind: "discount-denied", reason: "ineligible" } as unknown as StartCheckoutResult, "options"],
    [{ kind: "discount-denied", reason: "error" } as unknown as StartCheckoutResult, "error"],
    [{ kind: "not-found" } as StartCheckoutResult, "not-found"],
  ];
  for (const [result, reason] of cases) {
    const d = purchaseDecisionOf(result, ID);
    assert.equal(d.kind, "blocked", String(result.kind));
    if (d.kind !== "blocked" || d.state.status !== "blocked") continue;
    assert.equal(d.state.reason, reason);
    assert.ok(d.state.message.length > 10);
  }
});

test("결제를 시작하지 못한 이유 문구는 결제가 시작되지 않았고 카드에서 빠져나가지 않았다고 말한다(이미 받은 리포트 · 할인 선택 안내는 제외)", () => {
  const mustSayNotCharged: PurchaseBlockReason[] = ["payments-not-ready", "record-deleted", "not-found", "error"];
  for (const reason of mustSayNotCharged) {
    const s = blockedState(reason, { assessmentId: ID });
    assert.equal(s.status, "blocked");
    assert.match(s.status === "blocked" ? s.message : "", /시작되지 않았|빠져나가지 않았/);
  }
});

test("오류번호가 있으면 문구에 담기고 상태에도 남는다 · 이어 갈 곳이 필요한 경우 링크가 있다", () => {
  const e = blockedState("error", { assessmentId: ID, errorId: "ERR-ABCD1234" });
  assert.equal(e.status === "blocked" && e.errorId, "ERR-ABCD1234");
  assert.match(e.status === "blocked" ? e.message : "", /ERR-ABCD1234/);
  const paid = blockedState("already-paid", { assessmentId: ID });
  assert.equal(paid.status === "blocked" && paid.link?.href, `/results/${ID}`);
  const opts = blockedState("options", { assessmentId: ID, panelHref: "#r-purchase" });
  assert.equal(opts.status === "blocked" && opts.link?.href, "#r-purchase");
  const login = blockedState("login");
  assert.equal(login.status === "blocked" && login.link?.href, "/my");
});

test("판매 중지 문구는 용량 · 예산 사유별 안내를 그대로 쓴다(가드를 우회하지 않는다)", () => {
  const s = blockedState("sales-closed", { gateReason: "budget" });
  assert.equal(s.status, "blocked");
  assert.ok(s.status === "blocked" && s.message.length > 10);
});
