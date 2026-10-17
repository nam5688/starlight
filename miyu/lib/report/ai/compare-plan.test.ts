// 실행: npm test — AI 품질 비교 실행기(단계별 승인 · 예산 하드스톱 · 가린 이름). 실제 AI를 부르지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_CANDIDATES, COMPARE_STAGES } from "../../config/ai-candidates.ts";
import { BudgetGuard, DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE, type ModelPrice } from "./budget.ts";
import { buildPersonas } from "./compare-personas.ts";
import { assignBlind, checkApproval, checkStageRestriction, planStage, runStage, type CompareApproval, type CompareCandidate } from "./compare-plan.ts";
import { composeMockReading } from "../reading/mock-model.ts";
import { composeMockDraft } from "./mock-model.ts";
import { ModelCallError, type ModelResult, type TextModel } from "./model.ts";

const NOW = new Date("2026-10-12T03:00:00Z");
const SETTINGS = { fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE };
const PRICE: ModelPrice = { inputUsdPerMTok: 2, outputUsdPerMTok: 10 };
const noSleep = async () => {};

/** 모의 초안을 돌려주는 가짜 후보 — 첫 응답을 형식 오류로 만들 수 있다 */
function candidate(key: string, opts: { invalidFirst?: boolean; usage?: { inputTokens: number; outputTokens: number } } = {}): CompareCandidate & { model: TextModel & { calls: number } } {
  let invalid = opts.invalidFirst ?? false;
  const model = {
    provider: `prov-${key}`,
    model: `model-${key}`,
    calls: 0,
    async complete(req: { messages: { content: string }[] }): Promise<ModelResult> {
      model.calls++;
      if (invalid) {
        invalid = false;
        return { text: '{"headline":"짧음"}', model: model.model, usage: opts.usage ?? { inputTokens: 20_000, outputTokens: 500 } };
      }
      const user = req.messages[0].content;
      return { text: JSON.stringify(user.startsWith("다음 자료로 개인 통합 리포트 JSON") ? composeMockReading(user) : composeMockDraft(user)), model: model.model, usage: opts.usage ?? { inputTokens: 20_000, outputTokens: 9_000 } };
    },
  };
  return { key, model, price: PRICE };
}
const approval = (stage = "stage-1", cap = 3000): CompareApproval => ({ stage, approvedCapKrw: cap, approvedOn: "2026-10-13" });

test("가상 인물: 일간이 서로 다르고, 앞 2명은 내 고민 자세히 알려주기 있음 · 없음이 한 명씩이며, 실제 고객 정보가 없다", () => {
  const personas = buildPersonas(10);
  assert.equal(personas.length, 10);
  const stems = personas.map((p) => (p.input.saju.status === "ok" ? p.input.saju.dayMaster.stem : "?"));
  assert.equal(new Set(stems).size, 10, `일간 ${stems.join(",")}`);
  assert.deepEqual(personas.slice(0, 2).map((p) => p.input.context !== null), [true, false]);
  assert.equal(personas.filter((p) => p.input.context).length, 4);
  assert.ok(personas.some((p) => p.note.includes("태어난 시각 모름")) && personas.some((p) => p.note.includes("태어난 시각 있음")), "시각이 있는 경우와 모르는 경우가 모두 섞임");
  for (const p of personas) assert.match(p.input.nickname, /^가상인물\d+$/);
  // 1단계 인물은 2단계에도 그대로 들어간다 (같은 입력)
  assert.deepEqual(buildPersonas(2).map((p) => p.id), personas.slice(0, 2).map((p) => p.id));
});

test("드라이런: 모델을 부르지 않고, 예상 ≤ 첫 호출 최악 ≤ 두 번 호출 최악 순서로 계산한다", () => {
  const cands = [candidate("A"), candidate("B")];
  const personas = buildPersonas(2);
  const plan = planStage({ stage: "stage-1", capKrw: 3000, personas, candidates: cands, settings: SETTINGS, now: NOW });
  assert.equal(plan.rows.length, 4);
  assert.equal(cands[0].model.calls + cands[1].model.calls, 0);
  assert.ok(plan.expectedKrw > 0 && plan.expectedKrw < plan.firstCallWorstKrw && plan.firstCallWorstKrw < plan.twoRoundWorstKrw);
  for (const r of plan.rows) assert.ok(r.estInputTokens > 5000, "입력 추정이 지시문 + 근거 길이를 반영");
  // 같은 가격이면 두 후보의 비용 계산이 같다 (한쪽에 유리하지 않게)
  const byCand = (k: string) => plan.rows.filter((r) => r.candidate === k).reduce((n, r) => n + r.expectedKrw, 0);
  assert.ok(Math.abs(byCand("A") - byCand("B")) < 1e-6);
});

test("현재 단계 설정: 1단계는 평소 수준으로는 한도 안, 최악까지 가면 하드스톱이 지킨다", () => {
  const cands = AI_CANDIDATES.map((c) => ({ key: c.key, price: c.price }));
  const stage1 = COMPARE_STAGES[0];
  const plan = planStage({ stage: stage1.name, capKrw: stage1.capKrw, personas: buildPersonas(stage1.personaCount), candidates: cands, settings: SETTINGS, now: NOW });
  assert.equal(plan.rows.length, 4);
  assert.ok(plan.expectedFits, `평소 수준 ${Math.round(plan.expectedKrw)}원`);
  assert.ok(plan.firstCallWorstKrw < plan.capKrw, "최소한 모든 생성의 첫 호출은 한도 안에서 모두 가능");
  assert.ok(AI_CANDIDATES.every((c) => c.price.inputUsdPerMTok > 0 && c.price.outputUsdPerMTok > 0 && c.modelId && c.priceSource.startsWith("https://") && c.modelSource.startsWith("https://")));
  assert.deepEqual(AI_CANDIDATES.map((c) => c.key), ["A", "B"]);
});

test("승인 기록이 없거나 단계 · 금액이 맞지 않으면 실행하지 않고, 모델도 부르지 않는다", async () => {
  const stage = { name: "stage-1", capKrw: 3000 };
  const personas = buildPersonas(2);
  const run = (approvalArg: CompareApproval | null | undefined, guardCap = 3000) => {
    const cands = [candidate("A"), candidate("B")];
    const guard = new BudgetGuard({ capKrw: guardCap, ...SETTINGS });
    return { cands, p: runStage({ stage, personas, candidates: cands, guard, approval: approvalArg, now: NOW, blindSeed: 1, sleep: noSleep }) };
  };
  for (const [name, ap, cap] of [
    ["승인 없음", null, 3000],
    ["다른 단계 승인", approval("stage-2", 8000), 3000],
    ["승인 금액이 한도보다 작음", approval("stage-1", 2000), 3000],
    ["관리기 한도가 승인 금액보다 큼", approval("stage-1", 3000), 5000],
  ] as const) {
    const r = run(ap, cap);
    await assert.rejects(r.p, name);
    assert.equal(r.cands[0].model.calls + r.cands[1].model.calls, 0, `${name}: 모델 호출 없음`);
  }
  assert.doesNotThrow(() => checkApproval(stage, new BudgetGuard({ capKrw: 3000, ...SETTINGS }), approval()));
});

test("승인 후 실행: 인물 2명 × 후보 2개 = 4건이 모두 생성되고, 비용 합계 · 가린 이름 · 추정 보정값이 기록된다", async () => {
  const cands = [candidate("A"), candidate("B")];
  const guard = new BudgetGuard({ capKrw: 3000, ...SETTINGS });
  const personas = buildPersonas(2);
  const result = await runStage({ stage: { name: "stage-1", capKrw: 3000 }, personas, candidates: cands, guard, approval: approval(), now: NOW, blindSeed: 42, sleep: noSleep });
  assert.equal(result.runs.length, 4);
  assert.ok(result.runs.every((r) => r.status === "ok" && r.calls === 1 && r.firstPassValid === true && r.report !== null));
  assert.equal(cands[0].model.calls, 2);
  assert.equal(cands[1].model.calls, 2);
  const sum = result.runs.reduce((n, r) => n + r.costKrw, 0);
  assert.ok(Math.abs(sum - result.spentKrw) < 1e-6);
  assert.ok(result.spentKrw > 0 && result.spentKrw <= 3000);
  assert.equal(result.stoppedByBudget, false);
  // 인물마다 X · Y가 서로 다른 후보다
  for (const p of personas) assert.deepEqual(Object.values(result.blindKey[p.id]).sort(), ["A", "B"]);
  for (const r of result.runs) assert.equal(result.blindKey[r.persona][r.blind], r.candidate);
  assert.ok(result.estimateRatio !== null && result.estimateRatio > 0);
  // 내용 차이 검사: 모의 글은 통과하지 못한다 (근거 문장을 이어 붙인 글) — 결과에 이유가 남는다
  for (const r of result.runs) {
    assert.ok(r.depth && r.depth.pass === false && r.depth.fails.includes("placeholder"), `${r.persona}${r.candidate}: ${JSON.stringify(r.depth)}`);
  }
  assert.ok(result.crossPersonOverlap.A !== null && result.crossPersonOverlap.A > 0, "서로 다른 인물의 글이 얼마나 같은 말인지 후보별로 기록");
});

test("형식 검사에 실패해 고쳐 쓰면 호출 두 번이 모두 비용에 들어가고, 첫 시도 통과는 false로 기록된다", async () => {
  const cands = [candidate("A", { invalidFirst: true }), candidate("B")];
  const guard = new BudgetGuard({ capKrw: 3000, ...SETTINGS });
  const result = await runStage({ stage: { name: "stage-1", capKrw: 3000 }, personas: buildPersonas(1), candidates: cands, guard, approval: approval(), now: NOW, blindSeed: 1, sleep: noSleep });
  const a = result.runs.find((r) => r.candidate === "A")!;
  assert.equal(a.status, "ok");
  assert.equal(a.calls, 2);
  assert.equal(a.firstPassValid, false);
  const b = result.runs.find((r) => r.candidate === "B")!;
  assert.equal(b.calls, 1);
  assert.equal(b.firstPassValid, true);
  assert.ok(a.costKrw > b.costKrw);
});

test("하드스톱: 예산이 모자라면 남은 생성은 호출하지 않고 멈추며, 쓴 비용은 한도를 넘지 않는다", async () => {
  const cands = [candidate("A"), candidate("B")];
  const personas = buildPersonas(2);
  const plan = planStage({ stage: "stage-1", capKrw: 3000, personas, candidates: cands, settings: SETTINGS, now: NOW });
  // 첫 호출의 최악 비용 1.3건 정도만 들어갈 한도
  const cap = Math.ceil(plan.rows[0].firstCallWorstKrw * 1.3);
  const guard = new BudgetGuard({ capKrw: cap, ...SETTINGS });
  const result = await runStage({ stage: { name: "stage-1", capKrw: cap }, personas, candidates: cands, guard, approval: approval("stage-1", cap), now: NOW, blindSeed: 1, sleep: noSleep });
  assert.equal(result.stoppedByBudget, true);
  assert.equal(result.runs[0].status, "ok");
  assert.ok(result.runs.slice(1).every((r) => r.status === "skipped-budget" || r.status === "failed"));
  assert.ok(result.runs.some((r) => r.status === "skipped-budget"));
  assert.ok(result.spentKrw <= cap, `쓴 비용 ${result.spentKrw} ≤ 한도 ${cap}`);
  assert.equal(cands[0].model.calls + cands[1].model.calls, 1, "한도를 넘길 호출은 제공사로 나가지 않았다");
});

test("하드스톱: 고쳐 쓰는 두 번째 호출이 한도를 넘기면 그 호출은 하지 않고 실패로 기록한다", async () => {
  const cands = [candidate("A", { invalidFirst: true }), candidate("B")];
  const personas = buildPersonas(1);
  const plan = planStage({ stage: "stage-1", capKrw: 3000, personas, candidates: cands, settings: SETTINGS, now: NOW });
  const first = plan.rows[0].firstCallWorstKrw;
  // 첫 호출은 가능하지만 두 번째(입력이 더 큼)는 최악 비용이 남은 예산을 넘는 한도
  const cap = Math.ceil(first + 20);
  const guard = new BudgetGuard({ capKrw: cap, ...SETTINGS });
  const result = await runStage({ stage: { name: "stage-1", capKrw: cap }, personas, candidates: cands, guard, approval: approval("stage-1", cap), now: NOW, blindSeed: 1, sleep: noSleep });
  const a = result.runs.find((r) => r.candidate === "A")!;
  assert.equal(a.status, "failed");
  assert.equal(a.errorCode, "BUDGET_EXCEEDED");
  assert.equal(cands[0].model.calls, 1, "고쳐 쓰는 호출은 제공사로 나가지 않았다");
  assert.ok(result.spentKrw <= cap);
  assert.equal(result.stoppedByBudget, true);
});

test("제공사 오류(속도 제한)는 청구 없이 재시도되고, 시간 초과는 최악 비용으로 계산된다", async () => {
  let rateLimited = 1;
  const flaky: CompareCandidate & { model: { calls: number } } = {
    key: "A",
    price: PRICE,
    model: {
      provider: "prov-A",
      model: "model-A",
      calls: 0,
      async complete(req: { messages: { content: string }[] }) {
        flaky.model.calls++;
        if (rateLimited-- > 0) throw new ModelCallError("속도 제한", { retryable: true, code: "RATE_LIMITED" });
        const user = req.messages[0].content;
        return { text: JSON.stringify(user.startsWith("다음 자료로 개인 통합 리포트 JSON") ? composeMockReading(user) : composeMockDraft(user)), model: "model-A", usage: { inputTokens: 20_000, outputTokens: 9_000 } };
      },
    },
  };
  const guard = new BudgetGuard({ capKrw: 3000, ...SETTINGS });
  const result = await runStage({ stage: { name: "stage-1", capKrw: 3000 }, personas: buildPersonas(1), candidates: [flaky, candidate("B")], guard, approval: approval(), now: NOW, blindSeed: 1, sleep: noSleep });
  const a = result.runs.find((r) => r.candidate === "A")!;
  assert.equal(a.status, "ok");
  assert.equal(flaky.model.calls, 2);
  const expected = (20_000 * 2 + 9_000 * 10) / 1_000_000 * SETTINGS.fxKrwPerUsd * SETTINGS.surcharge;
  assert.ok(Math.abs(a.costKrw - expected) < 1e-6, `속도 제한은 0원, 성공한 한 번만 ${expected}원 (실제 ${a.costKrw})`);
});

test("가린 이름: 같은 씨앗이면 같고, 씨앗이 다르면 배정이 달라지며, 인물마다 후보가 하나씩 X · Y를 받는다", () => {
  const ids = Array.from({ length: 10 }, (_, i) => `P${i + 1}`);
  const a = assignBlind(ids, ["A", "B"], 7);
  assert.deepEqual(a, assignBlind(ids, ["A", "B"], 7));
  assert.notDeepEqual(a, assignBlind(ids, ["A", "B"], 8));
  const xIsA = ids.filter((id) => a[id].X === "A").length;
  assert.ok(xIsA >= 2 && xIsA <= 8, `A가 X인 인물 ${xIsA}명 — 한쪽으로 쏠리지 않음`);
  assert.throws(() => assignBlind(ids, ["A"], 1));
});

test("한 모델만 실행(--only): 인물마다 한 건씩 생성하고 모든 글이 X이며, 비용은 한도 안이다", async () => {
  const solo = candidate("A");
  const guard = new BudgetGuard({ capKrw: 3000, ...SETTINGS });
  const res = await runStage({ stage: { name: "stage-1", capKrw: 3000 }, personas: buildPersonas(2), candidates: [solo], guard, approval: approval(), now: NOW, blindSeed: 1, sleep: noSleep });
  assert.equal(res.runs.length, 2);
  assert.ok(res.runs.every((r) => r.status === "ok" && r.blind === "X" && r.candidate === "A" && r.calls === 1));
  assert.equal(solo.model.calls, 2);
  assert.ok(res.spentKrw > 0 && res.spentKrw <= 3000);
  const plan = planStage({ stage: "stage-1", capKrw: 3000, personas: buildPersonas(2), candidates: [{ key: "A", price: PRICE }], settings: SETTINGS, now: NOW });
  const both = planStage({ stage: "stage-1", capKrw: 3000, personas: buildPersonas(2), candidates: [{ key: "A", price: PRICE }, { key: "B", price: PRICE }], settings: SETTINGS, now: NOW });
  assert.equal(plan.rows.length, 2);
  assert.ok(Math.abs(plan.expectedKrw * 2 - both.expectedKrw) < 1e-6, "한 모델 비용은 두 모델의 절반");
});

test("좁은 승인 단계(story-p01): 변형 · 모델 · 인물 · 이미 쓴 금액 · 최악 비용 상한을 어기면 이유가 나오고, 맞으면 통과한다", () => {
  const stage = COMPARE_STAGES.find((s) => s.name === "story-p01");
  assert.ok(stage?.restrict, "story-p01 단계가 있고 제한이 있다");
  assert.equal(stage.capKrw, 4000, "총 승인 한도 4,000원(누적 사용액 포함)");
  assert.equal(stage.personaCount, 1);
  assert.equal(stage.restrict.runCeilingKrw, 1230, "운영자가 2026-10-17에 1,204원 → 1,230원으로 다시 승인(1,222.04원을 반올림해 통과시키지 않는다)");
  const ok = { variant: "story-v1", only: "A", persona: "P01", alreadySpentGiven: true, twoRoundWorstKrw: 1230 };
  assert.deepEqual(checkStageRestriction(stage, ok), [], "범위 안이고 상한과 같으면 통과");
  const has = (patch: object, word: string) => assert.ok(checkStageRestriction(stage, { ...ok, ...patch }).some((m) => m.includes(word)), word);
  has({ variant: "reading-v1" }, "story-v1");
  has({ only: undefined }, "후보 A");
  has({ only: "B" }, "후보 A");
  has({ persona: undefined }, "P01");
  has({ persona: "P02" }, "P01");
  has({ alreadySpentGiven: false }, "--already-spent-krw");
  has({ twoRoundWorstKrw: 1230.01 }, "상한"); // 반올림 없이 그대로 비교한다
  // 승인받은 1건을 마쳤으면(2026-10-17 실행) 드라이런은 되고 실제 호출(--execute)은 거절한다 — 새 실행은 운영자가 다시 승인해 runsApproved를 올린 뒤에만
  assert.equal(stage.restrict.runsApproved, 1);
  assert.equal(stage.restrict.runsDone, 1);
  assert.deepEqual(checkStageRestriction(stage, { ...ok, execute: false }), [], "드라이런은 계속 볼 수 있다");
  has({ execute: true }, "이미 실행했습니다");
  assert.deepEqual(checkStageRestriction({ restrict: { ...stage.restrict, runsDone: 0 } }, { ...ok, execute: true }), [], "남은 승인 실행이 있으면 실제 호출 확인은 통과한다");
  assert.deepEqual(checkStageRestriction(stage, { ...ok, twoRoundWorstKrw: 1222.04 }), [], "지금의 최악 1,222.04원은 상한 1,230원 안");
  // 제한이 없는 단계는 이 확인을 하지 않는다
  assert.deepEqual(checkStageRestriction({}, { variant: "x", only: undefined, persona: undefined, alreadySpentGiven: false, twoRoundWorstKrw: 99999 }), []);
  // 기존 1 · 2단계는 제한이 없어 지금까지의 동작이 그대로다
  assert.ok(COMPARE_STAGES.filter((s) => s.name !== "story-p01").every((s) => s.restrict === undefined));
});
