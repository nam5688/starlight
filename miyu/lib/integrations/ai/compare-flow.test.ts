// 실행: npm test — 제공사 연결 코드 + 비교 실행기 + 예산 관리기 + 승인 기록이 한 줄로 이어질 때의 동작을 가짜 fetch로 확인한다 (실제 호출 없음).
import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_CANDIDATES } from "../../config/ai-candidates.ts";
import { BudgetGuard, DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE } from "../../report/ai/budget.ts";
import { buildPersonas } from "../../report/ai/compare-personas.ts";
import { runStage, type CompareCandidate } from "../../report/ai/compare-plan.ts";
import { isReadingReport } from "../../report/generator.ts";
import { composeMockReading } from "../../report/reading/mock-model.ts";
import { renderReadingMarkdown } from "../../report/reading/render-text.ts";
import { sampleReport } from "../../samples/sample-report.ts";
import { sampleReadingReport } from "../../samples/sample-reading-report.ts";
import { createAnthropicModel, createOpenAiModel } from "./providers.ts";

const SETTINGS = { fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE };
const NOW = new Date("2026-10-12T03:00:00Z");

/** 제공사 응답 모양을 흉내 내는 가짜 fetch — 요청에 들어 있는 지시 자료로 모의 초안을 만들어 돌려준다 */
function providerFetch(kind: "anthropic" | "openai") {
  const state = { calls: 0, bodies: [] as string[] };
  const fetch = async (_url: string, init: { body: string }) => {
    state.calls++;
    state.bodies.push(init.body);
    const body = JSON.parse(init.body) as { messages?: { content: string }[]; input?: { content: string }[] };
    const user = (body.messages ?? body.input)![0].content;
    const text = JSON.stringify(composeMockReading(user));
    const json = kind === "anthropic" ? { content: [{ type: "text", text }], usage: { input_tokens: 15000, output_tokens: 8000 } } : { output: [{ type: "message", content: [{ type: "output_text", text }] }], usage: { input_tokens: 15000, output_tokens: 8000 } };
    return { ok: true, status: 200, json: async () => json };
  };
  return { fetch, state };
}

function candidates() {
  const a = providerFetch("anthropic");
  const b = providerFetch("openai");
  const list: CompareCandidate[] = [
    { key: "A", price: AI_CANDIDATES[0].price, model: createAnthropicModel({ apiKey: "k-a", model: AI_CANDIDATES[0].modelId, fetch: a.fetch as never }) },
    { key: "B", price: AI_CANDIDATES[1].price, model: createOpenAiModel({ apiKey: "k-b", model: AI_CANDIDATES[1].modelId, fetch: b.fetch as never }) },
  ];
  return { list, a, b };
}

test("승인 기록이 없으면 제공사 연결 코드가 있어도 요청을 한 번도 보내지 않는다", async () => {
  const { list, a, b } = candidates();
  const guard = new BudgetGuard({ capKrw: 3000, ...SETTINGS });
  await assert.rejects(runStage({ stage: { name: "stage-1", capKrw: 3000 }, personas: buildPersonas(2), candidates: list, guard, approval: null, now: NOW, blindSeed: 1, sleep: async () => {} }), /승인 기록이 없어/);
  assert.equal(a.state.calls + b.state.calls, 0);
});

test("승인 후: 두 후보 · 두 인물 4건이 읽기 구조로 생성되고, 요청에는 이름 · 생년월일 원문이 없으며, 비용은 한도 안이다", async () => {
  const { list, a, b } = candidates();
  const guard = new BudgetGuard({ capKrw: 3000, ...SETTINGS });
  const personas = buildPersonas(2);
  const res = await runStage({ stage: { name: "stage-1", capKrw: 3000 }, personas, candidates: list, guard, approval: { stage: "stage-1", approvedCapKrw: 3000, approvedOn: "2026-10-13" }, now: NOW, blindSeed: 20261013, sleep: async () => {} });
  assert.equal(res.runs.length, 4);
  assert.ok(res.runs.every((r) => r.status === "ok" && r.report && isReadingReport(r.report) && r.calls === 1 && r.firstPassValid === true));
  assert.equal(a.state.calls, 2);
  assert.equal(b.state.calls, 2);
  assert.ok(res.spentKrw > 0 && res.spentKrw <= 3000);
  for (const body of [...a.state.bodies, ...b.state.bodies]) {
    for (const p of personas) assert.ok(!body.includes(p.input.nickname), "이름 원문은 보내지 않는다");
    assert.doesNotMatch(body, /가상인물\d|\d{4}년 \d{1,2}월/);
  }
  // 가려진 글: 후보 이름 · 모델 ID가 글에 들어가지 않는다
  for (const r of res.runs) {
    const md = renderReadingMarkdown(r.report as never);
    assert.doesNotMatch(md, /claude|gpt|anthropic|openai|Sonnet/i);
    // 대표 경향 이름(~형)은 화면과 같게 맨 위에 보이고, 같은 인물이면 후보와 상관없이 같은 값이다
    const tendency = (r.report as { base?: { tendency: { name: string } } }).base?.tendency.name;
    assert.ok(tendency && md.includes(`**나의 대표 경향** ${tendency}`), "평가용 글에도 대표 경향(~형)이 있다");
  }
  // 모의 글이므로 내용 검사는 "모의 생성 표시"로 실패해야 한다 (판매할 수 없는 글을 통과시키지 않는다)
  assert.ok(res.runs.every((r) => r.depth && !r.depth.pass && r.depth.fails.includes("placeholder")));
});

test("한도가 모자라면 남은 요청은 보내지 않는다 (승인한 금액을 넘기지 않는다)", async () => {
  const { list, a, b } = candidates();
  const guard = new BudgetGuard({ capKrw: 400, ...SETTINGS });
  const res = await runStage({ stage: { name: "stage-1", capKrw: 400 }, personas: buildPersonas(2), candidates: list, guard, approval: { stage: "stage-1", approvedCapKrw: 400, approvedOn: "2026-10-13" }, now: NOW, blindSeed: 1, sleep: async () => {} });
  assert.ok(res.stoppedByBudget);
  assert.ok(res.spentKrw <= 400);
  assert.ok(a.state.calls + b.state.calls < 4);
  assert.ok(res.runs.some((r) => r.status === "skipped-budget"));
});

test("검사에 걸려 실패하면 걸린 이유와 그때의 글이 남는다 — 돈을 쓰고도 왜 실패했는지 모르는 일이 없게 (이유 문구에는 키 · 요청 본문이 없다)", async () => {
  const bad = '{"headline":"너무 짧은 제목","blocks":[]}';
  const f = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: bad }], usage: { input_tokens: 15000, output_tokens: 3000 } }) });
  const list: CompareCandidate[] = [{ key: "A", price: AI_CANDIDATES[0].price, model: createAnthropicModel({ apiKey: "k-secret-NOT-REAL", model: AI_CANDIDATES[0].modelId, fetch: f as never }) }];
  const guard = new BudgetGuard({ capKrw: 3000, ...SETTINGS });
  const res = await runStage({ stage: { name: "stage-1", capKrw: 3000 }, personas: buildPersonas(1), candidates: list, guard, approval: { stage: "stage-1", approvedCapKrw: 3000, approvedOn: "2026-10-13" }, now: NOW, blindSeed: 1, sleep: async () => {} });
  const run = res.runs[0];
  assert.equal(run.status, "failed");
  assert.equal(run.calls, 2, "처음 응답 + 고쳐 쓴 응답");
  assert.equal(run.attempts.length, 2);
  assert.ok(run.attempts.every((a) => a.errors.length > 0 && a.text === bad));
  assert.match(run.errorMessage ?? "", /리포트 형식 검사 실패/);
  assert.doesNotMatch(`${run.errorMessage} ${JSON.stringify(run.attempts.map((a) => a.errors))}`, /k-secret/);
  assert.ok(run.costKrw > 0, "응답은 받았으므로 비용은 기록된다");
});

test("블라인드 평가용 글: 예시 리포트를 마크다운으로 옮기면 본문만 담고(분석 근거 · 내부 근거 ID 없음) 모든 주제와 행동이 들어 있다", () => {
  const md = renderReadingMarkdown(sampleReadingReport, { tendencyName: sampleReport.tendency.name });
  assert.match(md, /^# 서윤 님의 개인 통합 리포트/);
  assert.ok(md.includes(`**나의 대표 경향** ${sampleReport.tendency.name}`), "예시도 대표 경향(~형)을 맨 위에 보인다");
  for (const b of sampleReadingReport.blocks) assert.ok(md.includes(b.headline), b.headline);
  for (const a of sampleReadingReport.actions) assert.ok(md.includes(a.detail));
  assert.doesNotMatch(md, /\b(saju|survey|self)\.[\w.가-힣-]+/);
  assert.doesNotMatch(md, /분석 근거|전통 해석 규칙/);
  assert.ok(!md.includes("\n\n\n"));
});
