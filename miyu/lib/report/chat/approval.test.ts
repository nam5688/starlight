import assert from "node:assert/strict";
import test from "node:test";
import { ModelCallError, type ModelRequest, type ModelResult, type TextModel } from "../ai/model.ts";
import { ChatApprovalError, approvalSince, checkApprovalShape, createApprovalLedger, seoulDate, tallyUsage, withChatApproval, type ChatApproval, type Spend, type UsageRow } from "./approval.ts";

const PRICING = { price: { inputUsdPerMTok: 2, outputUsdPerMTok: 10 }, fxKrwPerUsd: 1600, surcharge: 1.1 };
const APPROVAL: ChatApproval = { capKrw: 300, maxCalls: 5, from: "2026-10-15", through: "2026-10-16" };
const NOW = new Date("2026-10-15T03:00:00Z"); // 한국 12시
const REQUEST: ModelRequest = { system: "시스템", messages: [{ role: "user", content: "질문" }], maxOutputTokens: 1000 };

function fakeModel(behaviour: (n: number) => ModelResult | Error) {
  let n = 0;
  const model: TextModel & { calls: number } = {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    get calls() {
      return n;
    },
    async complete() {
      const r = behaviour(++n);
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return model;
}
const ok = (inputTokens = 1000, outputTokens = 500): ModelResult => ({ text: "답", model: "claude-sonnet-5-5", usage: { inputTokens, outputTokens } });
const empty = async (): Promise<Spend> => ({ calls: 0, spentKrw: 0 });
const guard = (model: TextModel, over: Partial<Parameters<typeof withChatApproval>[1]> = {}) => withChatApproval(model, { approval: APPROVAL, pricing: PRICING, now: () => NOW, loadSpend: empty, ...over });

test("한국 날짜 · 승인 기간 시작 시각", () => {
  assert.equal(seoulDate(new Date("2026-10-14T15:00:00Z")), "2026-10-15");
  assert.equal(seoulDate(new Date("2026-10-14T14:59:00Z")), "2026-10-14");
  assert.equal(approvalSince({ from: "2026-10-15" }), "2026-10-14T15:00:00.000Z");
});

test("승인 값의 모양 검사: 금액 · 호출 수 · 기간 상한을 넘기면 이유를 돌려준다", () => {
  const limits = { maxCapKrw: 1500, maxCalls: 40, maxDays: 3 };
  assert.equal(checkApprovalShape(APPROVAL, limits), null);
  assert.match(checkApprovalShape({ ...APPROVAL, capKrw: 0 }, limits) ?? "", /금액/);
  assert.match(checkApprovalShape({ ...APPROVAL, capKrw: 1501 }, limits) ?? "", /1,500원/);
  assert.match(checkApprovalShape({ ...APPROVAL, maxCalls: 41 }, limits) ?? "", /40회/);
  assert.match(checkApprovalShape({ ...APPROVAL, maxCalls: 2.5 }, limits) ?? "", /호출 수/);
  assert.match(checkApprovalShape({ ...APPROVAL, from: "10월 15일" }, limits) ?? "", /YYYY-MM-DD/);
  assert.match(checkApprovalShape({ ...APPROVAL, through: "2026-10-14" }, limits) ?? "", /빠를 수 없/);
  assert.match(checkApprovalShape({ ...APPROVAL, through: "2026-10-20" }, limits) ?? "", /3일/);
});

test("승인 범위 안의 호출은 통과하고 제공사 응답을 그대로 돌려준다", async () => {
  const model = fakeModel(() => ok());
  const r = await guard(model).complete(REQUEST);
  assert.equal(r.text, "답");
  assert.equal(model.calls, 1);
});

test("승인 기간 전 · 후에는 제공사를 부르지 않는다", async () => {
  for (const [now, reason] of [
    [new Date("2026-10-14T14:00:00Z"), "not-started"],
    [new Date("2026-10-16T15:00:00Z"), "expired"],
  ] as const) {
    const model = fakeModel(() => ok());
    await assert.rejects(guard(model, { now: () => now }).complete(REQUEST), (e: unknown) => e instanceof ChatApprovalError && e.reason === reason && e.code === "BUDGET_EXCEEDED" && !e.retryable);
    assert.equal(model.calls, 0);
  }
});

test("최악 비용이 남은 승인 금액을 넘으면 제공사를 부르지 않는다", async () => {
  const model = fakeModel(() => ok());
  const big: ModelRequest = { ...REQUEST, maxOutputTokens: 20_000 }; // 최악 비용 ≈ 약 360원 > 승인 300원
  await assert.rejects(guard(model).complete(big), (e: unknown) => e instanceof ChatApprovalError && e.reason === "cap");
  assert.equal(model.calls, 0);
  // 이미 쓴 금액이 있으면 작은 요청도 막힌다
  await assert.rejects(guard(model, { loadSpend: async () => ({ calls: 1, spentKrw: 299 }) }).complete(REQUEST), (e: unknown) => e instanceof ChatApprovalError && e.reason === "cap");
  assert.equal(model.calls, 0);
});

test("승인 호출 수를 모두 쓰면 제공사를 부르지 않는다", async () => {
  const model = fakeModel(() => ok());
  await assert.rejects(guard(model, { loadSpend: async () => ({ calls: 5, spentKrw: 10 }) }).complete(REQUEST), (e: unknown) => e instanceof ChatApprovalError && e.reason === "calls");
  assert.equal(model.calls, 0);
});

test("지금까지 쓴 금액을 읽지 못하면 부르지 않는다 (모르는 채로 쓰지 않는다)", async () => {
  const model = fakeModel(() => ok());
  await assert.rejects(
    guard(model, {
      loadSpend: async () => {
        throw new Error("db down");
      },
    }).complete(REQUEST),
    (e: unknown) => e instanceof ChatApprovalError && e.reason === "unreadable",
  );
  assert.equal(model.calls, 0);
});

test("기록 저장이 늦어도 이 프로세스가 센 호출은 다음 확인에 반영된다 (호출 수 5회 한도)", async () => {
  const model = fakeModel(() => ok());
  const g = guard(model); // loadSpend는 항상 0 — 저장이 아직 안 된 상황
  for (let i = 0; i < 5; i++) await g.complete(REQUEST);
  await assert.rejects(g.complete(REQUEST), (e: unknown) => e instanceof ChatApprovalError && e.reason === "calls");
  assert.equal(model.calls, 5);
});

test("사용량을 모르는 응답(시간 초과 등)은 최악 비용으로 센다", async () => {
  const model = fakeModel((n) => (n === 1 ? new ModelCallError("시간 초과", { retryable: true, code: "TIMEOUT" }) : ok()));
  // 최악 비용 ≈ (입력 추정 ~150토큰 × 2 + 출력 1000 × 10) × 1600 × 1.1 / 1e6 ≈ 18원 — 승인 20원이면 한 번 실패한 뒤에는 두 번째 최악 비용이 들어가지 못한다
  const g = guard(model, { approval: { ...APPROVAL, capKrw: 30 } });
  await assert.rejects(g.complete(REQUEST), /시간 초과/);
  await assert.rejects(g.complete(REQUEST), (e: unknown) => e instanceof ChatApprovalError && e.reason === "cap");
  assert.equal(model.calls, 1);
});

test("청구되지 않는 오류(속도 제한 · 인증 · 잘못된 요청)는 호출 수 · 금액에 세지 않는다", async () => {
  for (const code of ["RATE_LIMITED", "AUTH", "BILLING", "INVALID_REQUEST"]) {
    const model = fakeModel((n) => (n <= 5 ? new ModelCallError("실패", { retryable: false, code }) : ok()));
    const g = guard(model, { approval: { ...APPROVAL, capKrw: 30, maxCalls: 2 } });
    for (let i = 0; i < 5; i++) await assert.rejects(g.complete(REQUEST));
    await g.complete(REQUEST); // 5번 실패해도 승인 호출 수(2회) · 금액(30원)이 줄지 않았다
    assert.equal(model.calls, 6, code);
  }
});

test("동시에 들어온 호출도 같은 잔액을 보고 함께 통과하지 못한다", async () => {
  let release: () => void = () => {};
  const hold = new Promise<void>((r) => (release = r));
  let started = 0;
  const model: TextModel = {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    async complete() {
      started++;
      await hold;
      return ok();
    },
  };
  // 최악 비용 ≈ 18원씩, 승인 40원 → 동시에 3개가 와도 2개까지만 예약된다
  const g = guard(model, { approval: { ...APPROVAL, capKrw: 40 } });
  const calls = [g.complete(REQUEST), g.complete(REQUEST), g.complete(REQUEST)].map((p) => p.then(() => "ok", (e: unknown) => (e instanceof ChatApprovalError ? e.reason : "other")));
  await new Promise((r) => setTimeout(r, 20));
  release();
  const results = await Promise.all(calls);
  assert.deepEqual(results.sort(), ["cap", "ok", "ok"]);
  assert.equal(started, 2);
});

test("저장된 사용 기록 집계: 이 제공사 · 채팅 지시문의 기록만, 청구되지 않는 오류 제외, 금액을 모르면 최악 비용", () => {
  const rows: UsageRow[] = [
    { provider: "anthropic", promptVersion: "chat-v1-prompt-0.2", estCostKrw: 10, errorCode: null },
    { provider: "anthropic", promptVersion: "chat-v1-prompt-0.2", estCostKrw: null, errorCode: "TIMEOUT" },
    { provider: "anthropic", promptVersion: "chat-v1-prompt-0.2", estCostKrw: null, errorCode: "BUDGET_EXCEEDED" },
    { provider: "anthropic", promptVersion: "chat-v1-prompt-0.2", estCostKrw: null, errorCode: "AUTH" },
    { provider: "anthropic", promptVersion: "reading-v1-prompt-0.6", estCostKrw: 500, errorCode: null },
    { provider: "mock-local", promptVersion: "chat-v1-prompt-0.2", estCostKrw: 500, errorCode: null },
  ];
  const t = tallyUsage(rows, { provider: "anthropic" }, { surcharge: 1.1, unknownRowKrw: 20 });
  assert.equal(t.calls, 2);
  assert.ok(Math.abs(t.spentKrw - (11 + 20)) < 1e-9);
});

test("리포트와 채팅이 한 장부를 나눠 쓰면 서로의 호출을 함께 센다 — 호출 수 · 금액 한도는 둘을 합친 값이다", async () => {
  const ledger = createApprovalLedger();
  const report = fakeModel(() => ok(1000, 500));
  const chat = fakeModel(() => ok(1000, 500));
  const common = { approval: { ...APPROVAL, maxCalls: 2 }, ledger };
  const gReport = guard(report, common);
  const gChat = guard(chat, common);
  await gReport.complete(REQUEST);
  await gChat.complete(REQUEST);
  // 호출 수 2회를 리포트 1 + 채팅 1로 모두 썼으므로 어느 쪽도 더 부르지 못한다
  await assert.rejects(() => gReport.complete(REQUEST), (e) => e instanceof ChatApprovalError && e.reason === "calls");
  await assert.rejects(() => gChat.complete(REQUEST), (e) => e instanceof ChatApprovalError && e.reason === "calls");
  assert.equal(report.calls + chat.calls, 2);
  // 장부를 나누지 않은 경우(각자의 장부)에는 서로의 호출이 보이지 않는다 — 옛 채팅 전용 승인의 동작
  const separate = guard(fakeModel(() => ok()), { approval: { ...APPROVAL, maxCalls: 1 } });
  await separate.complete(REQUEST);
  await assert.rejects(() => separate.complete(REQUEST), (e) => e instanceof ChatApprovalError && e.reason === "calls");
});

test("공통 승인의 집계는 리포트 · 채팅 지시문의 기록을 모두 센다 (promptPrefix 빈 값), 옛 채팅 승인은 채팅 기록만 센다", () => {
  const rows: UsageRow[] = [
    { provider: "anthropic", promptVersion: "reading-v1-prompt-0.6", estCostKrw: 300, errorCode: null },
    { provider: "anthropic", promptVersion: "chat-v1-prompt-0.4", estCostKrw: 10, errorCode: null },
    { provider: "anthropic", promptVersion: "reading-v1-prompt-0.6", estCostKrw: null, errorCode: "RATE_LIMITED" },
    { provider: "mock-local", promptVersion: "reading-v1-prompt-0.6", estCostKrw: 999, errorCode: null },
  ];
  const all = tallyUsage(rows, { provider: "anthropic" }, { surcharge: 1, unknownRowKrw: 20, promptPrefix: "" });
  assert.equal(all.calls, 2);
  assert.equal(all.spentKrw, 310);
  const chatOnly = tallyUsage(rows, { provider: "anthropic" }, { surcharge: 1, unknownRowKrw: 20 });
  assert.equal(chatOnly.calls, 1);
  assert.equal(chatOnly.spentKrw, 10);
});
