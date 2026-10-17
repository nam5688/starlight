import assert from "node:assert/strict";
import test from "node:test";
import { saleOpenFor } from "./sale-switch.ts";

test("판매 스위치: 코드 상수가 꺼져 있고 덮어쓰기가 없으면 닫혀 있다", () => {
  assert.equal(saleOpenFor("report-compat", { liveMode: false }), false);
  assert.equal(saleOpenFor("saju-compat", { list: "", liveMode: false }), false);
  assert.equal(saleOpenFor("saju-compat", { list: null, liveMode: false }), false);
});

test("판매 스위치: 테스트 결제 모드에서만 환경변수로 연다 — 적은 상품만 열린다", () => {
  assert.equal(saleOpenFor("report-compat", { list: "report-compat", liveMode: false }), true);
  assert.equal(saleOpenFor("saju-compat", { list: "report-compat", liveMode: false }), false);
  assert.equal(saleOpenFor("saju-compat", { list: " saju-compat , report-compat ", liveMode: false }), true);
});

test("판매 스위치: 실결제 모드에서는 환경변수를 적어도 열리지 않는다", () => {
  assert.equal(saleOpenFor("report-compat", { list: "report-compat,saju-compat", liveMode: true }), false);
  assert.equal(saleOpenFor("saju-compat", { list: "saju-compat", liveMode: true }), false);
});
