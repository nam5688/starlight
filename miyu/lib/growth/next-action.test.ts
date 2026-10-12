// 실행: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { nextActionForResult } from "./next-action.ts";

test("무료 요약만 본 고객: 개인 통합 리포트 하나만 제안", () => {
  const a = nextActionForResult({ purchase: "none", reportStatus: null });
  assert.equal(a.kind, "buy-report");
  assert.equal(a.allowRelatedOffer, false);
});

test("결제 후 리포트 완성: 구매 결과 열기 (관련 제안은 내용 옆에서만 허용)", () => {
  const a = nextActionForResult({ purchase: "paid", reportStatus: "ready" });
  assert.equal(a.kind, "open-report");
  assert.equal(a.allowRelatedOffer, true);
});

test("결제는 됐지만 생성 실패·누락: 다시 결제가 아니라 생성 복구, 추가 판매 없음", () => {
  for (const reportStatus of ["failed", null] as const) {
    const a = nextActionForResult({ purchase: "paid", reportStatus });
    assert.equal(a.kind, "recover-report");
    assert.equal(a.allowRelatedOffer, false);
  }
  assert.equal(nextActionForResult({ purchase: "paid", reportStatus: "generating" }).kind, "wait-report");
});

test("환불된 주문: 환불 안내", () => {
  assert.equal(nextActionForResult({ purchase: "refunded", reportStatus: null }).kind, "refund-info");
});
