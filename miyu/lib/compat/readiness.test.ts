// 실행: npm test — 사주 궁합 · 리포트 궁합의 "지금 이용 가능 / 준비 중" 표시가 판매 스위치와 풀이 AI 연결을 함께 따르는지 확인한다(비용 0 — 순수 규칙).
import assert from "node:assert/strict";
import { test } from "node:test";
import { compatReadinessOf } from "./readiness.ts";

test("판매가 열려 있고 AI가 연결됐을 때만 '지금 이용 가능'이고 안내 문구가 없다", () => {
  const r = compatReadinessOf({ saleOpen: true, generatorReady: true });
  assert.deepEqual(r, { state: "open", open: true, badge: "지금 이용 가능", note: null });
});

test("판매 스위치가 닫혀 있으면 AI 연결과 상관없이 준비 중", () => {
  for (const generatorReady of [true, false]) {
    const r = compatReadinessOf({ saleOpen: false, generatorReady });
    assert.equal(r.open, false);
    assert.equal(r.state, "switch-closed");
    assert.equal(r.badge, "준비 중");
  }
});

test("판매가 열려 있어도 AI가 연결되지 않았으면 '지금 이용 가능'이라 하지 않고 이유와 결제 미시작을 알린다 — AI를 켜거나 가드를 우회하지 않는다", () => {
  const r = compatReadinessOf({ saleOpen: true, generatorReady: false });
  assert.equal(r.state, "ai-off");
  assert.equal(r.open, false);
  assert.equal(r.badge, "준비 중");
  assert.match(r.note ?? "", /AI/);
  assert.match(r.note ?? "", /결제는 시작되지 않/);
  assert.match(r.note ?? "", /빠져나가지 않/);
});

test("네 조합에서 open은 두 조건의 곱과 정확히 같다", () => {
  for (const saleOpen of [true, false]) {
    for (const generatorReady of [true, false]) {
      assert.equal(compatReadinessOf({ saleOpen, generatorReady }).open, saleOpen && generatorReady);
    }
  }
});
