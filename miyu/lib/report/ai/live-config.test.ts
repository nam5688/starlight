// 실행: npm test — 실제 AI 시험의 공통 승인 설정 규칙(리포트 생성 + 채팅 질문, 운영자 승인 2026-10-15: 5,000원). 실제 호출은 없다.
import assert from "node:assert/strict";
import test from "node:test";
import { AI_CANDIDATES, LIVE_TEST_APPROVAL, LIVE_TEST_LIMITS, REPORT_AI_MODEL } from "../../config/ai-candidates.ts";
import { resolveChatAi } from "../chat/ai-config.ts";
import { MAX_OUTPUT_TOKENS } from "./compare-plan.ts";
import { REPORT_AI_LIMITS, resolveLiveApproval, resolveReportAnthropic } from "./live-config.ts";

const reader = (values: Record<string, string>) => (name: string) => values[name] ?? "";
const KEY = "fake-key-for-test-only-must-never-be-printed";
const APPROVED = { AI_APPROVED_KRW: "5000", AI_APPROVED_CALLS: "40", AI_APPROVED_FROM: "2026-10-16", AI_APPROVED_THROUGH: "2026-10-18" };
const REPORT = { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY, ...APPROVED };

test("운영자 승인 5,000원이 코드 상한이고, 모델 · 가격은 후보 A 한 곳에서 온다", () => {
  assert.equal(LIVE_TEST_APPROVAL.approvedKrw, 5000);
  assert.equal(LIVE_TEST_LIMITS.maxCapKrw, LIVE_TEST_APPROVAL.approvedKrw);
  assert.equal(REPORT_AI_MODEL, AI_CANDIDATES[0]);
  const live = resolveLiveApproval(reader(APPROVED));
  assert.ok(live.ok);
  assert.equal(live.value.model, AI_CANDIDATES[0].modelId);
  assert.deepEqual(live.value.pricing.price, AI_CANDIDATES[0].price);
  assert.deepEqual(live.value.approval, { capKrw: 5000, maxCalls: 40, from: "2026-10-16", through: "2026-10-18" });
});

test("승인 값을 하나도 적지 않으면 present=false, 적다 말았으면 present=true로 이유를 알린다 (아무것도 호출하지 않는다)", () => {
  const none = resolveLiveApproval(reader({}));
  assert.ok(!none.ok && none.present === false);
  for (const name of Object.keys(APPROVED)) {
    const r = resolveLiveApproval(reader({ ...APPROVED, [name]: "" }));
    assert.ok(!r.ok && r.present === true, name);
    assert.match(r.reason, /AI_APPROVED_KRW/);
  }
});

test("상한(5,000원 · 60회 · 7일)을 넘기거나 모양이 틀린 값, 실제 제공사 주소를 바꾸려는 값은 거절한다", () => {
  const overs: Record<string, string>[] = [
    { AI_APPROVED_KRW: String(LIVE_TEST_LIMITS.maxCapKrw + 1) },
    { AI_APPROVED_CALLS: String(LIVE_TEST_LIMITS.maxCalls + 1) },
    { AI_APPROVED_THROUGH: "2026-11-30" },
    { AI_APPROVED_KRW: "abc" },
    { AI_APPROVED_FROM: "내일" },
    { AI_FX_KRW_PER_USD: "0" },
    { AI_BASE_URL: "https://example.com" },
  ];
  for (const over of overs) assert.equal(resolveLiveApproval(reader({ ...APPROVED, ...over })).ok, false, JSON.stringify(over));
  const local = resolveLiveApproval(reader({ ...APPROVED, AI_BASE_URL: "http://127.0.0.1:54600", AI_FX_KRW_PER_USD: "1500" }));
  assert.ok(local.ok && local.value.baseUrl === "http://127.0.0.1:54600" && local.value.pricing.fxKrwPerUsd === 1500);
});

test("리포트 생성: 키와 승인이 모두 있어야 실제 호출을 열고, 오류 문구에는 키 값이 들어가지 않는다", () => {
  const ok = resolveReportAnthropic(reader(REPORT));
  assert.ok(ok.kind === "anthropic" && ok.model === AI_CANDIDATES[0].modelId && ok.apiKey === KEY);
  assert.equal(resolveReportAnthropic(reader({ ...REPORT, ANTHROPIC_API_KEY: "" })).kind, "invalid");
  for (const name of Object.keys(APPROVED)) {
    const r = resolveReportAnthropic(reader({ ...REPORT, [name]: "" }));
    assert.equal(r.kind, "invalid", name);
    assert.ok(!JSON.stringify(r).includes(KEY));
  }
  assert.ok(!JSON.stringify(resolveReportAnthropic(reader({ ...REPORT, AI_APPROVED_KRW: "999999" }))).includes(KEY));
});

test("리포트 한 건의 모델 설정은 비교 실행에서 실제로 통과한 값과 같다 (최대 출력 · 생각 강도)", () => {
  assert.equal(REPORT_AI_LIMITS.maxOutputTokens, MAX_OUTPUT_TOKENS);
  assert.equal(REPORT_AI_LIMITS.effort, "medium");
  assert.ok(REPORT_AI_LIMITS.callTimeoutMs >= 300_000, "한 번의 긴 응답을 기다릴 수 있다");
});

test("채팅은 공통 승인(AI_APPROVED_*)을 적었다면 그것을 쓰고, 적다 만 경우에는 옛 채팅 승인으로 넘어가지 않으며, 하나도 안 적었을 때만 옛 방식이다", () => {
  const chat = { AI_CHAT_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY };
  const shared = resolveChatAi(reader({ ...chat, ...APPROVED }), null);
  assert.ok(shared.kind === "anthropic" && shared.shared === true && shared.approval.capKrw === 5000);
  // 옛 값이 같이 있어도 공통 승인이 먼저다
  const both = resolveChatAi(reader({ ...chat, ...APPROVED, AI_CHAT_APPROVED_KRW: "600", AI_CHAT_APPROVED_CALLS: "14", AI_CHAT_APPROVED_FROM: "2026-10-14", AI_CHAT_APPROVED_THROUGH: "2026-10-15" }), null);
  assert.ok(both.kind === "anthropic" && both.shared === true && both.approval.capKrw === 5000);
  // 공통 승인을 적다 말았다면 옛 값이 있어도 몰래 넘어가지 않는다
  const partial = resolveChatAi(reader({ ...chat, AI_APPROVED_KRW: "5000", AI_CHAT_APPROVED_KRW: "600", AI_CHAT_APPROVED_CALLS: "14", AI_CHAT_APPROVED_FROM: "2026-10-14", AI_CHAT_APPROVED_THROUGH: "2026-10-15" }), null);
  assert.equal(partial.kind, "invalid");
  // 공통 승인을 하나도 안 적었다면 옛 채팅 전용 승인(상한 1,500원)
  const legacy = resolveChatAi(reader({ ...chat, AI_CHAT_APPROVED_KRW: "600", AI_CHAT_APPROVED_CALLS: "14", AI_CHAT_APPROVED_FROM: "2026-10-14", AI_CHAT_APPROVED_THROUGH: "2026-10-15" }), null);
  assert.ok(legacy.kind === "anthropic" && legacy.shared === false && legacy.approval.capKrw === 600);
});
