// 실행: npm test — 궁합 실제 AI 시험의 계획: 호출 없이 입력 크기와 최악 비용을 재고, 승인이 없으면(승인된 실행 0회 · 상한 없음) 실행을 거절한다.
// 이 시험은 실제 AI를 부르지 않는다(모의 모델로 요청의 크기만 잰다). 비용은 환율 · 여유율 가정으로 센 어림이다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_CANDIDATES, COMPAT_LIVE_STAGES, type CompatLiveStageDef } from "../../config/ai-candidates.ts";
import { DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE } from "../ai/budget.ts";
import { checkCompatLiveRestriction, estimateLiveRun, liveCompatInput, livePairInput } from "./live-plan.ts";
import { pairEvidenceOf } from "./pair-evidence.ts";

const settings = { fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE };
const price = AI_CANDIDATES[0].price;

test("입력 크기와 최악 비용: 사주 궁합 · 리포트 궁합 모두 호출 없이 잰다 — 고쳐 쓰기까지 가면 첫 호출의 두 배쯤이고 리포트 궁합이 더 크다", async () => {
  const saju = await estimateLiveRun("saju", price, settings);
  const pair = await estimateLiveRun("pair", price, settings);
  for (const e of [saju, pair]) {
    assert.ok(e.inputTokens > 5000 && e.inputTokens < 60_000, `입력 토큰 ${e.inputTokens}`);
    assert.ok(e.firstWorstKrw > 0 && e.twoRoundWorstKrw > e.firstWorstKrw * 1.5, "고쳐 쓰기까지 가는 최악은 첫 호출보다 훨씬 크다");
    assert.ok(e.typicalKrw < e.firstWorstKrw, "평소 수준은 최악보다 작다");
  }
  assert.ok(pair.inputTokens > saju.inputTokens, "리포트 궁합은 응답 비교 근거와 지시문이 더 길다");
  assert.ok(pair.systemChars > saju.systemChars);
});

test("입력은 가상 인물이다 — 두 사람의 사주가 계산돼 있고 리포트 궁합에는 두 사람의 응답 요약이 있다", () => {
  const c = liveCompatInput();
  assert.equal(c.a.status, "ok");
  assert.equal(c.b.status, "ok");
  const p = livePairInput();
  assert.ok(p.a.summary.temperament.length > 0 && p.b.summary.relationship.length > 0);
  assert.deepEqual(c.reference, { year: 2026, month: 10 });
  // 이 두 인물은 뚜렷하게 답한 영역이 겹쳐서 리포트 궁합의 응답 영역(response)이 실제로 만들어진다 — 모의 글이 그 영역까지 검사를 통과하는지도 이 입력으로 시험된다
  const cmp = pairEvidenceOf({ summary: p.a.summary, mbti: p.a.knownMbti }, { summary: p.b.summary, mbti: p.b.knownMbti });
  assert.ok(cmp.comparedLabels.length > 0);
});

test("승인 값: 운영자가 정한 총액 · 1회 상한(사주 궁합 635원 · 리포트 궁합 680.15원)과 승인 횟수를 코드가 그대로 지킨다", () => {
  const byName = Object.fromEntries(COMPAT_LIVE_STAGES.map((s) => [s.name, s]));
  assert.equal(byName["compat-saju-p1"].restrict.runCeilingKrw, 635);
  assert.equal(byName["compat-pair-p1"].restrict.runCeilingKrw, 680.15);
  for (const stage of COMPAT_LIVE_STAGES) {
    assert.equal(stage.capKrw, 6000, `${stage.name}: 총 승인 한도 6,000원(누적 2,468원 포함)`);
    assert.equal(stage.restrict.runsApproved, 1, `${stage.name}: 승인된 실행 1회(호출 최대 2회)`);
    assert.equal(stage.restrict.runsDone, 0, `${stage.name}: 아직 실행하지 않았다`);
    const dry = checkCompatLiveRestriction(stage, { alreadySpentGiven: true, twoRoundWorstKrw: 700, execute: false });
    assert.ok(dry.every((i) => i.includes("넘습니다")), "드라이런은 상한 초과만 알린다");
    // 1회 상한은 반올림 없이 그대로 비교한다 — 상한과 같으면 통과, 0.01원이라도 넘으면 거절
    const ceiling = stage.restrict.runCeilingKrw;
    assert.deepEqual(checkCompatLiveRestriction(stage, { alreadySpentGiven: true, twoRoundWorstKrw: ceiling, execute: true }), []);
    assert.ok(checkCompatLiveRestriction(stage, { alreadySpentGiven: true, twoRoundWorstKrw: ceiling + 0.01, execute: true }).some((i) => i.includes("넘습니다")));
  }
});

test("승인이 없는 단계(승인 0회 · 상한 0원)는 --execute를 거절하고 드라이런은 막지 않는다", () => {
  const none: CompatLiveStageDef = { ...COMPAT_LIVE_STAGES[0], restrict: { runCeilingKrw: 0, runsApproved: 0, runsDone: 0 } };
  assert.deepEqual(checkCompatLiveRestriction(none, { alreadySpentGiven: true, twoRoundWorstKrw: 700, execute: false }), [], "드라이런은 막지 않는다");
  const run = checkCompatLiveRestriction(none, { alreadySpentGiven: true, twoRoundWorstKrw: 700, execute: true });
  assert.ok(run.some((i) => i.includes("승인이 없습니다")), "실행은 거절된다");
  assert.ok(run.some((i) => i.includes("상한")), "1회 상한도 정해지지 않았다");
});

test("승인된 단계: 상한을 넘는 최악 비용 · 이미 쓴 금액 누락 · 승인된 횟수를 모두 마친 경우를 거절하고, 모두 맞으면 통과한다", () => {
  const stage: CompatLiveStageDef = { ...COMPAT_LIVE_STAGES[0], restrict: { runCeilingKrw: 700, runsApproved: 1, runsDone: 0 } };
  assert.deepEqual(checkCompatLiveRestriction(stage, { alreadySpentGiven: true, twoRoundWorstKrw: 635, execute: true }), []);
  assert.ok(checkCompatLiveRestriction(stage, { alreadySpentGiven: true, twoRoundWorstKrw: 700.01, execute: true }).some((i) => i.includes("넘습니다")), "상한은 반올림 없이 그대로 비교한다");
  assert.deepEqual(checkCompatLiveRestriction(stage, { alreadySpentGiven: true, twoRoundWorstKrw: 700, execute: true }), [], "상한과 같으면 통과");
  assert.ok(checkCompatLiveRestriction(stage, { alreadySpentGiven: false, twoRoundWorstKrw: 635, execute: true }).some((i) => i.includes("--already-spent-krw")));
  const done: CompatLiveStageDef = { ...stage, restrict: { ...stage.restrict, runsDone: 1, lastRun: "2026-10-20 · 호출 1회 · 130원" } };
  assert.ok(checkCompatLiveRestriction(done, { alreadySpentGiven: true, twoRoundWorstKrw: 635, execute: true }).some((i) => i.includes("다시 승인")));
});
