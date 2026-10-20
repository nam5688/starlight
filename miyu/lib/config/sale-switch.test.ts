import assert from "node:assert/strict";
import test from "node:test";
import { PAIR_COMPAT, SAJU_COMPAT } from "./product.ts";
import { saleOpenFor } from "./sale-switch.ts";

test("판매 스위치: 실결제 스위치(saleOpen)는 꺼져 있고 시험 결제 열림(testModeOpen)만 켜져 있다 — 운영자 2026-10-20", () => {
  assert.equal(SAJU_COMPAT.saleOpen, false);
  assert.equal(PAIR_COMPAT.saleOpen, false);
  assert.equal(SAJU_COMPAT.testModeOpen, true);
  assert.equal(PAIR_COMPAT.testModeOpen, true);
});

test("판매 스위치: 시험 결제 모드에서는 환경변수가 없어도 두 상품이 열려 있다", () => {
  assert.equal(saleOpenFor("report-compat", { liveMode: false }), true);
  assert.equal(saleOpenFor("saju-compat", { list: "", liveMode: false }), true);
  assert.equal(saleOpenFor("saju-compat", { list: null, liveMode: false }), true);
});

test("판매 스위치: 시험 결제 모드에서 MIYU_TEST_CLOSE_SALES에 적은 상품만 닫힌다 — 닫기가 열기보다 앞선다", () => {
  assert.equal(saleOpenFor("saju-compat", { closeList: "saju-compat", liveMode: false }), false);
  assert.equal(saleOpenFor("report-compat", { closeList: "saju-compat", liveMode: false }), true);
  assert.equal(saleOpenFor("report-compat", { closeList: " saju-compat , report-compat ", liveMode: false }), false);
  assert.equal(saleOpenFor("saju-compat", { list: "saju-compat", closeList: "saju-compat", liveMode: false }), false);
});

test("판매 스위치: 실결제 모드(또는 결제 설정 전)에서는 어떤 환경변수를 적어도 열리지 않는다", () => {
  assert.equal(saleOpenFor("report-compat", { liveMode: true }), false);
  assert.equal(saleOpenFor("saju-compat", { liveMode: true }), false);
  assert.equal(saleOpenFor("report-compat", { list: "report-compat,saju-compat", liveMode: true }), false);
  assert.equal(saleOpenFor("saju-compat", { list: "saju-compat", liveMode: true }), false);
});
