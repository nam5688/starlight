// 실행: npm test — 자기 이해 풀이(비교용 v0)의 형식 검사 · 생성기 · 비교 실행기 연결. 실제 AI를 부르지 않는다 (모의 모델).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BudgetGuard, DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE } from "../ai/budget.ts";
import { buildPersonas } from "../ai/compare-personas.ts";
import { planStage, referenceFor, runStage, type CompareCandidate } from "../ai/compare-plan.ts";
import { buildEvidence } from "../ai/generator.ts";
import { createPhilosophicalGenerator } from "../ai/philosophy-generator.ts";
import { PHILOSOPHY_SYSTEM_PROMPT, buildPhilosophyUserMessage } from "./prompt.ts";
import { composeMockPhilosophicalDraft, createMockPhilosophyModel } from "./mock-model.ts";
import { checkPhilosophicalDepth } from "./depth.ts";
import { isPhilosophicalReport } from "./types.ts";
import { validatePhilosophicalDraft } from "./validate.ts";
import type { AiUsageSample } from "../generator.ts";

const NOW = new Date("2026-10-12T03:00:00Z");
const noSleep = async () => {};
const [P01, P02] = buildPersonas(2);
const ref = referenceFor(NOW);
const evidenceOf = (p: typeof P01) => buildEvidence(p.input, ref);
const draftOf = (p: typeof P01) => composeMockPhilosophicalDraft(buildPhilosophyUserMessage(evidenceOf(p), ref.iso, p.input.context));

test("지시문: 이름 · 생년월일 원문을 보내지 않고, 고민이 없으면 고민 항목을 쓰지 않게 하며, 쓰지 않을 것을 밝힌다", () => {
  for (const p of [P01, P02]) {
    const user = buildPhilosophyUserMessage(evidenceOf(p), ref.iso, p.input.context);
    assert.ok(!user.includes(p.input.nickname), "닉네임을 보내지 않는다");
    assert.ok(!user.includes(p.input.birthText), "생년월일 원문을 보내지 않는다");
    assert.equal(user.includes('"context"'), Boolean(p.input.context));
  }
  for (const rule of ["정확히 3개", "가설", "하나의 결론으로 억지로 맞추지 않는다", "결정을 대신 내리지 않는다", "지어낸 배경", "알려 주신 내용에 없다", "context가 없으면", "period.label에 없는 해"]) assert.ok(PHILOSOPHY_SYSTEM_PROMPT.includes(rule), rule);
});

test("검사: 모의 초안은 고민이 있는 인물(P01)과 없는 인물(P02) 모두 형식을 통과하고, 고민이 없으면 선택지 · 결정 안내가 없다", () => {
  for (const p of [P01, P02]) {
    const v = validatePhilosophicalDraft(draftOf(p), evidenceOf(p), { hasConcern: Boolean(p.input.context) });
    assert.deepEqual(v.ok ? [] : v.errors, [], p.id);
  }
  const d2 = draftOf(P02);
  assert.equal(d2.choices, undefined);
  assert.equal(d2.noVerdict, undefined);
  assert.ok(draftOf(P01).choices!.length >= 2);
});

test("검사: 사람이 쓴 목표 수준 풀이(가상 인물 하린)는 통과하고, 구조를 어기면 이유와 함께 막는다", () => {
  const ok = JSON.parse(readFileSync(new URL("../../../docs/samples/philosophical-reading-haerin.json", import.meta.url), "utf8")).reading;
  const ev = evidenceOf(P01);
  // 하린의 근거와 P01의 근거가 다르므로 근거 ID 오류만 확인한다 (구조 오류는 없어야 한다)
  const r = validatePhilosophicalDraft(ok, ev, { hasConcern: true });
  const errors = r.ok ? [] : r.errors;
  assert.ok(errors.every((e) => /없는 근거 ID|사주 근거와 응답 근거/.test(e)), errors.join(" / "));

  const base = draftOf(P01);
  const bad = (mutate: (d: ReturnType<typeof draftOf>) => void, hasConcern = true, ev2 = ev) => {
    const d = structuredClone(base);
    mutate(d);
    const v = validatePhilosophicalDraft(d, ev2, { hasConcern });
    return v.ok ? "" : v.errors.join(" / ");
  };
  assert.match(bad((d) => d.values.pop()), /values: 2개/);
  assert.match(bad((d) => (d.values[0].text += " 어린 시절에 상처를 받았던 일이 영향을 줍니다.")), /지어낸 배경/);
  assert.match(bad((d) => (d.disagreement.text = "원국과 응답이 다릅니다. 어느 쪽도 틀리지 않습니다 그 차이를 설명하는 글입니다.")), /합치지 않는다는 말/);
  assert.match(bad((d) => (d.questionsActions[0].question = "무엇을 확인할까요")), /물음표/);
  assert.match(bad((d) => (d.questionsActions[0].action = "마음을 편하게 가지고 잘 지내 보세요 오래오래")), /시점이나 분량/);
  assert.match(bad((d) => (d.flow.text += " 2031년에는 큰 변화가 생깁니다.")), /계산된 시기에 없는 해/);
  assert.match(bad((d) => (d.flow.text = d.flow.text.replace("어떤 일이 일어난다는 뜻은 아닙니다", ""))), /예언하지 않는다는 말/);
  assert.match(bad((d) => (d.conflicts[0].evidence = [d.conflicts[0].evidence[0]])), /사주 근거와 응답 근거를 함께/);
  assert.match(bad((d) => (d.questionsActions[1].action = "이번 주 안에 옮기는 게 맞습니다 라고 정한 뒤 적어 둡니다")), /결정을 대신/);
  assert.match(bad((d) => delete d.choices), /choices/);
  // 고민이 없는 인물에게 고민 항목 · "알려 주신" 금지
  const base2 = draftOf(P02);
  const ev2 = evidenceOf(P02);
  const v2 = (mutate: (d: typeof base2) => void) => {
    const d = structuredClone(base2);
    mutate(d);
    const v = validatePhilosophicalDraft(d, ev2, { hasConcern: false });
    return v.ok ? "" : v.errors.join(" / ");
  };
  assert.match(v2((d) => (d.choices = [{ option: "선택지 하나를 쓴다", protects: "지키는 것을 쓴다 열 글자", costs: "내려놓는 것을 쓴다 열 글자", check: "이 조건이 갖춰질 때 부담이 줄어듭니다 알려 주신 내용에 없습니다", evidence: [d.intro.evidence[0]] }])), /choices: 알려 준 고민이 없으므로/);
  assert.match(v2((d) => (d.values[0].text += " 알려 주신 고민을 보면 걱정이 많습니다.")), /알려 주신/);
  assert.match(v2((d) => (d.noVerdict = "이 풀이는 어느 쪽이 맞는지 정하지 않습니다 정하는 일은 본인의 몫입니다")), /noVerdict/);
});

test("생성기: 모의 모델로 두 인물의 풀이를 만들고, 형식 오류는 한 번 고쳐 쓰며(호출 2번), 사용 기록 · 이름 채우기 · 고민 표시가 맞다", async () => {
  const usage: AiUsageSample[] = [];
  const model = createMockPhilosophyModel({ invalidTimes: 1 });
  const gen = createPhilosophicalGenerator({ model, now: () => NOW, sleep: noSleep });
  const report = await gen.generate(P01.input, { onUsage: (u) => usage.push(u) });
  assert.ok(isPhilosophicalReport(report));
  assert.equal(model.calls, 2);
  assert.deepEqual(usage.map((u) => u.outcome), ["invalid", "ok"]);
  assert.equal(report.personName, P01.input.nickname);
  assert.ok(report.noVerdict?.includes(P01.input.nickname) && !JSON.stringify(report).includes("{name}"));
  assert.equal(report.basis.concern?.topic, "love");
  assert.ok(!JSON.stringify(report.basis).includes(P01.input.context!.question), "리포트에 고민 내용을 담지 않는다");
  const r2 = await createPhilosophicalGenerator({ model: createMockPhilosophyModel(), now: () => NOW, sleep: noSleep }).generate(P02.input);
  assert.equal(r2.basis.concern, undefined);
  // 두 번 모두 형식 오류면 저장하지 않고 실패한다
  await assert.rejects(() => createPhilosophicalGenerator({ model: createMockPhilosophyModel({ invalidTimes: 5 }), now: () => NOW, sleep: noSleep }).generate(P01.input), /자기 이해 풀이 검사 실패/);
});

test("내용 차이 검사: 모의 글은 모의 생성 표시 때문에 통과하지 못하고, 사주 근거가 빠지면 사주 중심 검사에서 걸린다", () => {
  const d = draftOf(P01);
  const res = checkPhilosophicalDepth({ draft: d, evidence: evidenceOf(P01), concern: P01.input.context });
  assert.equal(res.pass, false);
  assert.ok(res.fails.includes("placeholder"));
  // 근거를 모두 응답 근거로 바꾸면 사주 중심 검사에서 걸린다
  const survey = evidenceOf(P01).find((e) => e.source !== "saju")!.id;
  const swapped = structuredClone(d);
  const all = [swapped.intro, ...swapped.values, ...swapped.conflicts, swapped.disagreement, swapped.flow];
  for (const b of all) b.evidence = [survey];
  for (const s of swapped.strengthCost) s.evidence = [survey];
  for (const c of swapped.choices ?? []) c.evidence = [survey];
  for (const q of swapped.questionsActions) q.evidence = [survey];
  assert.ok(checkPhilosophicalDepth({ draft: swapped, evidence: evidenceOf(P01), concern: P01.input.context }).fails.includes("saju-center"));
});

test("비교 실행기(자기 이해 풀이): 드라이런은 새 지시문 길이로 비용을 계산하고, 승인 · 예산 하드스톱 아래에서 4건을 만들며, 결과를 X · Y로 가린다", async () => {
  const price = { inputUsdPerMTok: 2, outputUsdPerMTok: 10 };
  const settings = { fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE };
  const personas = [P01, P02];
  const cands: CompareCandidate[] = ["A", "B"].map((key) => ({ key, model: createMockPhilosophyModel(), price }));
  const plan = planStage({ stage: "stage-1", capKrw: 3000, personas, candidates: cands, settings, now: NOW, variant: "philosophical-v0" });
  const old = planStage({ stage: "stage-1", capKrw: 3000, personas, candidates: cands, settings, now: NOW });
  assert.equal(plan.rows.length, 4);
  assert.ok(plan.rows[0].estInputTokens !== old.rows[0].estInputTokens, "개인 종합 지시문과 입력 크기가 다르다");
  assert.ok(plan.expectedKrw < plan.firstCallWorstKrw && plan.firstCallWorstKrw < plan.twoRoundWorstKrw);
  const guard = new BudgetGuard({ capKrw: 3000, fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE });
  const result = await runStage({
    stage: { name: "stage-1", capKrw: 3000 },
    personas,
    candidates: cands,
    guard,
    approval: { stage: "stage-1", approvedCapKrw: 3000, approvedOn: "2026-10-13" },
    now: NOW,
    variant: "philosophical-v0",
    blindSeed: 7,
    sleep: noSleep,
  });
  assert.equal(result.runs.length, 4);
  assert.ok(result.runs.every((r) => r.status === "ok" && r.report && isPhilosophicalReport(r.report) && r.firstPassValid === true), JSON.stringify(result.runs.map((r) => [r.status, r.errorCode])));
  assert.ok(result.runs.every((r) => r.depth && !r.depth.pass), "모의 글은 내용 차이 검사를 통과하지 못한다");
  assert.ok(result.spentKrw > 0 && result.spentKrw <= 3000);
  assert.ok(result.estimateRatio !== null);
  // 승인 기록 없이는 실행하지 않는다
  await assert.rejects(() => runStage({ stage: { name: "stage-1", capKrw: 3000 }, personas, candidates: cands, guard, approval: null, now: NOW, variant: "philosophical-v0", blindSeed: 1 }), /승인 기록이 없어/);
});
