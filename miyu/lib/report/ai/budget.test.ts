// 실행: npm test — AI 호출 예산 하드스톱. 실제 AI를 부르지 않는다 (가짜 모델만 사용).
import assert from "node:assert/strict";
import { test } from "node:test";
import { BudgetExceededError, BudgetGuard, costKrw, estimateInputTokens, withBudget, worstCaseKrw, type ModelPrice } from "./budget.ts";
import { ModelCallError, type ModelRequest, type ModelResult, type TextModel } from "./model.ts";

const PRICE: ModelPrice = { inputUsdPerMTok: 2, outputUsdPerMTok: 10 };
const SETTINGS = { fxKrwPerUsd: 1600, surcharge: 1.1 };
const REQUEST: ModelRequest = { system: "가".repeat(100), messages: [{ role: "user", content: "나".repeat(200) }], maxOutputTokens: 16000 };

type Behavior = { usage?: { inputTokens: number; outputTokens: number } | null; error?: ModelCallError | Error };
function fake(provider: string, behavior: Behavior = { usage: { inputTokens: 10_000, outputTokens: 6000 } }) {
  const m = {
    provider,
    model: `${provider}-model`,
    calls: 0,
    async complete(): Promise<ModelResult> {
      m.calls++;
      if (behavior.error) throw behavior.error;
      return { text: "{}", model: m.model, ...(behavior.usage === null ? {} : { usage: behavior.usage ?? { inputTokens: 10_000, outputTokens: 6000 } }) };
    },
  };
  return m satisfies TextModel & { calls: number };
}
const worstOf = (req: ModelRequest = REQUEST) =>
  worstCaseKrw(PRICE, { inputTokens: estimateInputTokens([req.system, ...req.messages.map((x) => x.content)]), maxOutputTokens: req.maxOutputTokens }, SETTINGS);

test("비용 계산: 입력 · 출력 단가 × 환율 × 여유율", () => {
  // (10,000 × $2 + 6,000 × $10) / 100만 = $0.08 → 1,600원 × 1.1
  assert.ok(Math.abs(costKrw(PRICE, { inputTokens: 10_000, outputTokens: 6000 }, SETTINGS) - 0.08 * 1600 * 1.1) < 1e-9);
  assert.equal(costKrw(PRICE, { inputTokens: 0, outputTokens: 0 }, SETTINGS), 0);
});

test("입력 토큰 추정은 보수적이다 — 한글은 글자당 2토큰, 영문 · 숫자는 0.5토큰, 메시지마다 64토큰", () => {
  assert.equal(estimateInputTokens(["가나다"]), 6 + 64);
  assert.equal(estimateInputTokens(["abcd"]), 2 + 64);
  assert.equal(estimateInputTokens(["가", "a"]), 2 + 64 + 1 + 64);
});

test("한도를 넘길 호출은 제공사에 보내지 않는다 (모델 호출 0번, 청구 0원)", async () => {
  const model = fake("a");
  const guard = new BudgetGuard({ capKrw: Math.floor(worstOf()) - 1, ...SETTINGS });
  await assert.rejects(withBudget(model, guard, PRICE).complete(REQUEST), (e: unknown) => e instanceof BudgetExceededError && e.code === "BUDGET_EXCEEDED" && e.retryable === false);
  assert.equal(model.calls, 0);
  assert.equal(guard.spentKrw, 0);
  assert.equal(guard.snapshot().refusedCalls, 1);
});

test("한도에 딱 맞으면 호출하고, 실제 사용량으로 정산한다", async () => {
  const model = fake("a");
  const guard = new BudgetGuard({ capKrw: Math.ceil(worstOf()), ...SETTINGS });
  await withBudget(model, guard, PRICE).complete(REQUEST);
  assert.equal(model.calls, 1);
  assert.ok(Math.abs(guard.spentKrw - 0.08 * 1600 * 1.1) < 1e-6, `실제 비용 ${guard.spentKrw}`);
  assert.equal(guard.reservedKrw, 0);
});

test("사용량을 모르면(응답에 usage 없음 · 시간 초과 · 알 수 없는 오류) 예약한 최악 비용을 쓴다. 제공사에 닿지 않은 오류만 0원", async () => {
  const worst = worstOf();
  const cases: [string, Behavior, number][] = [
    ["usage 없음", { usage: null }, worst],
    ["시간 초과", { error: new ModelCallError("시간 초과", { retryable: true, code: "TIMEOUT" }) }, worst],
    ["알 수 없는 오류", { error: new Error("모름") }, worst],
    ["속도 제한(닿지 않음)", { error: new ModelCallError("속도 제한", { retryable: true, code: "RATE_LIMITED" }) }, 0],
    ["인증 오류(닿지 않음)", { error: new ModelCallError("인증", { retryable: false, code: "AUTH" }) }, 0],
  ];
  for (const [name, behavior, expected] of cases) {
    const guard = new BudgetGuard({ capKrw: 100_000, ...SETTINGS });
    await withBudget(fake("a", behavior), guard, PRICE).complete(REQUEST).catch(() => undefined);
    assert.ok(Math.abs(guard.spentKrw - expected) < 1e-6, `${name}: ${guard.spentKrw} ≠ ${expected}`);
    assert.equal(guard.reservedKrw, 0, name);
  }
});

test("진행 중인 호출의 예약도 한도에 포함된다 — 동시에 두 개를 보내면 둘째가 거절된다", async () => {
  const guard = new BudgetGuard({ capKrw: Math.ceil(worstOf() * 1.5), ...SETTINGS });
  const first = guard.reserve("a", "a", PRICE, { inputTokens: 1000, maxOutputTokens: 16000 });
  assert.throws(() => guard.reserve("b", "a", PRICE, { inputTokens: 1000, maxOutputTokens: 16000 }), BudgetExceededError);
  guard.settle(first, { inputTokens: 1000, outputTokens: 1000 });
  // 정산 후에는 남은 예산이 늘어 다시 예약할 수 있다
  assert.doesNotThrow(() => guard.reserve("c", "a", PRICE, { inputTokens: 1000, maxOutputTokens: 16000 }));
});

test("회사별 한도: 한 회사가 전체 예산을 다 쓰지 못한다", () => {
  const w = worstCaseKrw(PRICE, { inputTokens: 1000, maxOutputTokens: 16000 }, SETTINGS);
  const guard = new BudgetGuard({ capKrw: w * 10, perProviderCapKrw: w * 2.5, ...SETTINGS });
  guard.settle(guard.reserve("a1", "a", PRICE, { inputTokens: 1000, maxOutputTokens: 16000 }), "unknown");
  guard.settle(guard.reserve("a2", "a", PRICE, { inputTokens: 1000, maxOutputTokens: 16000 }), "unknown");
  assert.throws(() => guard.reserve("a3", "a", PRICE, { inputTokens: 1000, maxOutputTokens: 16000 }), (e: unknown) => e instanceof BudgetExceededError && e.reason === "provider-cap");
  assert.doesNotThrow(() => guard.reserve("b1", "b", PRICE, { inputTokens: 1000, maxOutputTokens: 16000 }));
});

test("실제 비용이 예약한 최악보다 크면(추정이 틀림) 이후 호출을 모두 멈춘다", () => {
  const guard = new BudgetGuard({ capKrw: 100_000, ...SETTINGS });
  const r = guard.reserve("a", "a", PRICE, { inputTokens: 1000, maxOutputTokens: 1000 });
  guard.settle(r, { inputTokens: 50_000, outputTokens: 1000 });
  assert.ok(guard.halted);
  assert.throws(() => guard.reserve("b", "a", PRICE, { inputTokens: 10, maxOutputTokens: 10 }), (e: unknown) => e instanceof BudgetExceededError && e.reason === "halted");
});

test("같은 예약을 두 번 정산하지 않는다", () => {
  const guard = new BudgetGuard({ capKrw: 10_000, ...SETTINGS });
  const r = guard.reserve("a", "a", PRICE, { inputTokens: 100, maxOutputTokens: 100 });
  guard.settle(r, "not-billed");
  assert.throws(() => guard.settle(r, "unknown"));
});

test("어떤 순서로 호출해도 정산된 비용 + 예약이 한도를 넘지 않는다 (무작위 5,000회)", () => {
  let seed = 12345;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const guard = new BudgetGuard({ capKrw: 5000, ...SETTINGS });
  const open: ReturnType<BudgetGuard["reserve"]>[] = [];
  for (let i = 0; i < 5000; i++) {
    if (open.length && rand() < 0.5) {
      const r = open.splice(Math.floor(rand() * open.length), 1)[0];
      const kind = rand();
      // 실제 사용은 예약한 최악 이하 (추정이 맞는 경우)
      guard.settle(r, kind < 0.2 ? "unknown" : kind < 0.3 ? "not-billed" : { inputTokens: Math.floor(rand() * 2000), outputTokens: Math.floor(rand() * 16000) });
    } else {
      try {
        open.push(guard.reserve(`c${i}`, rand() < 0.5 ? "a" : "b", PRICE, { inputTokens: Math.floor(rand() * 20_000), maxOutputTokens: Math.floor(rand() * 16000) + 1 }));
      } catch (e) {
        assert.ok(e instanceof BudgetExceededError);
      }
    }
    assert.ok(guard.spentKrw + guard.reservedKrw <= 5000 + 1e-6, `한도 초과 ${guard.spentKrw + guard.reservedKrw}`);
  }
  assert.ok(guard.snapshot().refusedCalls > 0 && guard.snapshot().settledCalls > 0);
});

test("설정 검사: 한도 · 환율은 0보다 커야 하고, 여유율은 1 이상이어야 한다", () => {
  assert.throws(() => new BudgetGuard({ capKrw: 0, ...SETTINGS }));
  assert.throws(() => new BudgetGuard({ capKrw: 100, fxKrwPerUsd: 0, surcharge: 1.1 }));
  assert.throws(() => new BudgetGuard({ capKrw: 100, fxKrwPerUsd: 1600, surcharge: 0.9 }));
});
