import assert from "node:assert/strict";
import test from "node:test";
import { AI_CANDIDATES, CHAT_AI_MODEL, CHAT_TEST_LIMITS, STAGE1_LEDGER } from "../../config/ai-candidates.ts";
import { resolveChatAi } from "./ai-config.ts";

const reader = (values: Record<string, string>) => (name: string) => values[name] ?? "";
const KEY = "fake-key-for-test-only-must-never-be-printed";
const READY = { AI_CHAT_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY, AI_CHAT_APPROVED_KRW: "800", AI_CHAT_APPROVED_CALLS: "12", AI_CHAT_APPROVED_FROM: "2026-10-15", AI_CHAT_APPROVED_THROUGH: "2026-10-16" };

test("설정이 비어 있으면 연결 없음(준비 중), 로컬 모의 AI만 있으면 그것을 쓴다 — 실제 호출은 없다", () => {
  assert.deepEqual(resolveChatAi(reader({}), null), { kind: "none" });
  assert.deepEqual(resolveChatAi(reader({}), { baseUrl: "http://127.0.0.1:54600" }), { kind: "mock-local", baseUrl: "http://127.0.0.1:54600" });
  // 키만 있고 제공사를 고르지 않았다면 호출하지 않는다
  assert.deepEqual(resolveChatAi(reader({ ANTHROPIC_API_KEY: KEY }), null), { kind: "none" });
});

test("anthropic을 골라도 키 · 승인 금액 · 호출 수 · 기간 중 하나라도 비어 있으면 호출하지 않는다", () => {
  assert.equal(resolveChatAi(reader(READY), null).kind, "anthropic");
  for (const missing of ["ANTHROPIC_API_KEY", "AI_CHAT_APPROVED_KRW", "AI_CHAT_APPROVED_CALLS", "AI_CHAT_APPROVED_FROM", "AI_CHAT_APPROVED_THROUGH"]) {
    const r = resolveChatAi(reader({ ...READY, [missing]: "" }), null);
    assert.equal(r.kind, "invalid", missing);
  }
});

test("승인 상한(금액 · 호출 수 · 기간)을 넘기는 값은 거절한다 — 남은 1단계 승인 금액 안에서만", () => {
  assert.ok(CHAT_TEST_LIMITS.maxCapKrw <= STAGE1_LEDGER.approvedKrw - STAGE1_LEDGER.spentKrw, "상한이 남은 승인 금액을 넘지 않는다");
  const overs: Record<string, string>[] = [{ AI_CHAT_APPROVED_KRW: String(CHAT_TEST_LIMITS.maxCapKrw + 1) }, { AI_CHAT_APPROVED_CALLS: String(CHAT_TEST_LIMITS.maxCalls + 1) }, { AI_CHAT_APPROVED_THROUGH: "2026-10-30" }, { AI_CHAT_APPROVED_KRW: "abc" }, { AI_CHAT_FX_KRW_PER_USD: "0" }];
  for (const over of overs) {
    assert.equal(resolveChatAi(reader({ ...READY, ...over }), null).kind, "invalid", JSON.stringify(over));
  }
  assert.equal(resolveChatAi(reader({ ...READY, AI_CHAT_PROVIDER: "openai" }), null).kind, "invalid");
  // 시험용 주소는 로컬만 — 실제 제공사 주소를 다른 곳으로 바꿀 수 없다
  assert.equal(resolveChatAi(reader({ ...READY, AI_CHAT_BASE_URL: "https://example.com" }), null).kind, "invalid");
  const local = resolveChatAi(reader({ ...READY, AI_CHAT_BASE_URL: "http://127.0.0.1:54600" }), null);
  assert.ok(local.kind === "anthropic" && local.baseUrl === "http://127.0.0.1:54600");
});

test("설정 오류 문구에는 키 값이 들어가지 않고, 모델 · 가격은 코드의 한 곳(후보 A)에서 온다", () => {
  const bads: Record<string, string>[] = [{ AI_CHAT_APPROVED_KRW: "999999" }, { AI_CHAT_APPROVED_CALLS: "" }, { AI_CHAT_APPROVED_FROM: "내일" }, { AI_CHAT_FX_KRW_PER_USD: "x" }];
  for (const bad of bads) {
    const r = resolveChatAi(reader({ ...READY, ...bad }), null);
    assert.equal(r.kind, "invalid");
    assert.ok(!JSON.stringify(r).includes(KEY));
  }
  const ok = resolveChatAi(reader(READY), null);
  assert.ok(ok.kind === "anthropic");
  assert.equal(ok.model, AI_CANDIDATES[0].modelId);
  assert.equal(CHAT_AI_MODEL, AI_CANDIDATES[0]);
  assert.deepEqual(ok.pricing.price, AI_CANDIDATES[0].price);
  assert.equal(ok.pricing.fxKrwPerUsd, 1600);
  assert.equal(ok.approval.capKrw, 800);
});
