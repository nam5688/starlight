// 실행: npm test — 운영자 본인 입력 실제 AI 시험(story-own)의 순수 부분. 실제 AI를 부르지 않는다(모의 모델 · 가짜 응답만).
import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_CANDIDATES, COMPARE_STAGES } from "../../config/ai-candidates.ts";
import { ownInputCaptureEnabled } from "../../config/own-input-guard.ts";
import { ASSESSMENT_MODULES } from "../../assessment/modules/index.ts";
import type { Answers } from "../../assessment/types.ts";
import type { BasicInfo } from "../../profile/basic-info.ts";
import { buildDevFreeSummary } from "../build-free-summary.ts";
import { BudgetGuard, DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE } from "./budget.ts";
import { buildEvidence } from "./generator.ts";
import { checkStageRestriction, planStage, promptsFor, referenceFor, runStage } from "./compare-plan.ts";
import { createMockModel } from "./mock-model.ts";
import { ModelCallError, type ModelResult, type TextModel } from "./model.ts";
import { composeMockStory7 } from "../reading/story7-mock-model.ts";
import { buildStory7UserMessage } from "../reading/story7-prompt.ts";
import { describeOwnInput, ownPersona, ownReportInput, parseOwnCapture, reviewOwnDraft } from "./own-run.ts";

const NOW = new Date("2026-10-17T03:00:00Z");
const SETTINGS = { fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE };
// 실제 사람이 아닌 시험용 입력
const INFO: BasicInfo = { nickname: "시험닉네임", calendar: "solar", isLeapMonth: false, birthYear: "1994", birthMonth: "11", birthDay: "7", birthTime: "08:40", birthTimeUnknown: false, knownMbti: "INFJ", regionProvince: "인천", regionDistrict: "연수구", gender: "female" };
const items = ASSESSMENT_MODULES.flatMap((m) => m.items);
const ANSWERS: Answers = Object.fromEntries(items.map((it, i) => [it.id, ((i * 2 + 1) % 5) + 1]));
const CAPTURE = { info: INFO, answers: ANSWERS, capturedAt: "2026-10-17T00:00:00.000Z" };

test("입력 파일: 기본 정보 + 22개 응답이 모두 있어야 읽고, 응답이 빠졌으면 제품 검증이 막는다", async () => {
  assert.ok(parseOwnCapture(CAPTURE));
  assert.equal(parseOwnCapture({ info: INFO }), null);
  assert.equal(parseOwnCapture(null), null);
  const missing = { ...ANSWERS };
  delete missing[items[0].id];
  const partial = parseOwnCapture({ info: INFO, answers: missing });
  if (partial) {
    const r = await ownReportInput(partial, NOW);
    assert.equal(r.ok, false, "한 문항이라도 비면 실제 호출 전에 막힌다");
  }
});

test("리포트 입력: 제품이 검사를 저장할 때와 같은 길 — 응답이 점수 · 경향 · 근거로 그대로 이어지고, 답이 바뀌면 바뀐다", async () => {
  const built = await ownReportInput(CAPTURE, NOW);
  assert.ok(built.ok);
  if (!built.ok) return;
  assert.deepEqual(built.input.summary, buildDevFreeSummary(ANSWERS), "요약은 응답에서 제품과 같은 함수로 계산된다");
  assert.equal(built.input.knownMbti, "INFJ");
  assert.equal(built.input.gender, "female");
  assert.equal(built.input.saju.status, "ok");
  assert.equal(built.input.context, null);

  // 한 문항만 반대로 바꿔도(전부 1 ↔ 5로 뒤집어) 응답에서 읽은 근거가 달라진다
  const flipped: Answers = Object.fromEntries(Object.entries(ANSWERS).map(([k, v]) => [k, 6 - v]));
  const other = await ownReportInput({ ...CAPTURE, answers: flipped }, NOW);
  assert.ok(other.ok);
  if (!other.ok) return;
  const ref = referenceFor(NOW);
  const surveyOf = (i: typeof built.input) => buildEvidence(i, ref).filter((e) => e.source === "survey").map((e) => `${e.id}|${e.fact}`).join("\n");
  assert.notEqual(surveyOf(built.input), surveyOf(other.input), "응답이 바뀌면 AI가 받는 응답 근거가 바뀐다");
});

test("AI 요청: 이름 · 생년월일 · 지역은 가지 않고, 입력 확인 글의 근거 id는 실제 요청에 들어 있는 것과 같다", async () => {
  const built = await ownReportInput(CAPTURE, NOW);
  assert.ok(built.ok);
  if (!built.ok) return;
  const d = describeOwnInput({ input: built.input, capture: CAPTURE, now: NOW });
  const ref = referenceFor(NOW);
  const [system, user] = promptsFor("story-v1", d.evidence, ref.iso, built.input.context);
  for (const secret of ["시험닉네임", "1994", "연수구", "인천", "08:40"]) {
    assert.ok(!system.includes(secret) && !user.includes(secret), `요청에 "${secret}"이 들어 있다`);
  }
  // 입력 확인 글이 보여 주는 근거는 요청에 가는 근거와 정확히 같다(같은 함수로 센다)
  for (const e of d.evidence) {
    assert.ok(user.includes(e.id), `${e.id}가 요청에 없다`);
    assert.ok(d.markdown.includes(`\`${e.id}\``), `${e.id}가 입력 확인 글에 없다`);
  }
  // 22개 답이 모두 문항 · 답과 함께 보인다
  for (const it of items) assert.ok(d.markdown.includes(it.text.replace(/\|/g, "/")), `문항이 빠졌다: ${it.id}`);
  assert.equal((d.markdown.match(/^\| \d+ \|/gm) ?? []).length, 22);
  // 사주 근거 · 응답 근거 · 입력한 MBTI가 따로 보이고, 가지 않는 것이 적혀 있다
  assert.match(d.markdown, /가지 않는 것/);
  assert.ok(d.evidence.some((e) => e.source === "saju") && d.evidence.some((e) => e.source === "survey") && d.evidence.some((e) => e.source === "self"));
});

test("승인 범위: story-own은 본인 입력 한 건 · story-v1 · 후보 A · 이미 쓴 금액 필수 · 호출 최대 1회의 최악(상한 이내)이며, P01 재시험은 막힌다", async () => {
  const own = COMPARE_STAGES.find((s) => s.name === "story-own")!;
  const p01 = COMPARE_STAGES.find((s) => s.name === "story-p01")!;
  assert.equal(own.capKrw, 6000);
  assert.equal(own.restrict?.runCeilingKrw, 1234.04);
  assert.equal(own.restrict?.persona, "OWN");
  const built = await ownReportInput(CAPTURE, NOW);
  assert.ok(built.ok);
  if (!built.ok) return;
  const A = AI_CANDIDATES.find((c) => c.key === "A")!;
  const plan = planStage({ stage: "story-own", capKrw: 3532, personas: [ownPersona(built.input)], candidates: [{ key: "A", price: A.price }], settings: SETTINGS, now: NOW, variant: "story-v1" });
  const ok = { variant: "story-v1", only: "A", persona: "OWN", alreadySpentGiven: true, twoRoundWorstKrw: plan.firstCallWorstKrw, execute: true } as const;
  assert.deepEqual(checkStageRestriction(own, { ...ok, execute: false }), [], "드라이런은 계속 볼 수 있다");
  assert.ok(plan.firstCallWorstKrw < 700, `한 번 호출의 최악 ${plan.firstCallWorstKrw}`);
  assert.ok(checkStageRestriction(own, { ...ok, persona: "P01" }).length > 0, "다른 인물은 안 된다");
  assert.ok(checkStageRestriction(own, { ...ok, variant: "reading-v1" }).length > 0);
  assert.ok(checkStageRestriction(own, { ...ok, only: "B" }).length > 0);
  assert.ok(checkStageRestriction(own, { ...ok, alreadySpentGiven: false }).length > 0, "이미 쓴 금액을 적지 않으면 막힌다");
  assert.ok(checkStageRestriction(own, { ...ok, twoRoundWorstKrw: 1234.05 }).length > 0, "상한을 넘으면 막힌다");
  // 2026-10-17 운영자 PC에서 승인된 한 건을 실행했다 — 같은 승인으로는 실제 호출을 거절한다(새 실행은 운영자가 다시 승인해 runsApproved를 올린 뒤에만)
  assert.equal(own.restrict?.runsDone, 1);
  assert.ok(checkStageRestriction(own, ok).some((m) => /이미 실행/.test(m)), "승인된 한 건을 쓰고 나면 새 실행은 막힌다");
  assert.deepEqual(checkStageRestriction({ restrict: { ...own.restrict!, runsDone: 0 } }, ok), [], "승인된 실행이 남아 있으면 통과한다");
  // 같은 승인 한 건을 본인 입력으로 옮겼으므로 P01 재시험은 더 하지 못한다
  assert.ok(checkStageRestriction(p01, { variant: "story-v1", only: "A", persona: "P01", alreadySpentGiven: true, twoRoundWorstKrw: 1000, execute: true }).some((m) => /이미 실행/.test(m)));
});

function guardAndCandidate(model: TextModel) {
  const A = AI_CANDIDATES.find((c) => c.key === "A")!;
  return { guard: new BudgetGuard({ capKrw: 1234.04, ...SETTINGS }), candidates: [{ key: "A", model, price: A.price }] };
}

test("호출 한 번: 형식 검사에 걸리는 글을 받아도 다시 쓰지 않고(호출 1회), 걸린 글의 원문 전문을 그대로 남긴다", async () => {
  const built = await ownReportInput(CAPTURE, NOW);
  assert.ok(built.ok);
  if (!built.ok) return;
  const model = createMockModel({ invalidTimes: 5 }); // 형식에 맞지 않는 글만 돌려준다
  const { guard, candidates } = guardAndCandidate(model);
  const result = await runStage({ stage: { name: "story-own", capKrw: 6000 }, personas: [ownPersona(built.input)], candidates, guard, approval: { stage: "story-own", approvedCapKrw: 6000, approvedOn: "2026-10-17" }, now: NOW, variant: "story-v1", blindSeed: 1, repairRepeats: false, maxRepairs: 0, maxRetries: 0, sleep: async () => {} });
  assert.equal(model.calls, 1, "자동 재작성 없음 — 호출은 한 번뿐");
  const run = result.runs[0]!;
  assert.equal(run.status, "failed");
  assert.equal(run.calls, 1);
  assert.equal(run.attempts.length, 1);
  assert.equal(run.attempts[0].text, '{"headline": "짧음"}', "걸린 글의 원문이 그대로 남는다");
  assert.ok(run.attempts[0].errors.length > 0);
});

test("호출 한 번: 제공사 일시 오류도 다시 시도하지 않고, 통과한 글은 그대로 조립된다", async () => {
  const built = await ownReportInput(CAPTURE, NOW);
  assert.ok(built.ok);
  if (!built.ok) return;
  const fail = createMockModel({ failTimes: 5 });
  const a = guardAndCandidate(fail);
  const r1 = await runStage({ stage: { name: "story-own", capKrw: 6000 }, personas: [ownPersona(built.input)], candidates: a.candidates, guard: a.guard, approval: { stage: "story-own", approvedCapKrw: 6000, approvedOn: "2026-10-17" }, now: NOW, variant: "story-v1", blindSeed: 1, maxRepairs: 0, maxRetries: 0, sleep: async () => {} });
  assert.equal(fail.calls, 1, "일시 오류에도 두 번째 호출을 하지 않는다");
  assert.equal(r1.runs[0]!.status, "failed");

  const ok = createMockModel();
  const b = guardAndCandidate(ok);
  const r2 = await runStage({ stage: { name: "story-own", capKrw: 6000 }, personas: [ownPersona(built.input)], candidates: b.candidates, guard: b.guard, approval: { stage: "story-own", approvedCapKrw: 6000, approvedOn: "2026-10-17" }, now: NOW, variant: "story-v1", blindSeed: 1, maxRepairs: 0, maxRetries: 0, sleep: async () => {} });
  assert.equal(ok.calls, 1);
  const run = r2.runs[0]!;
  assert.equal(run.status, "ok");
  assert.equal(run.attempts.at(-1)?.accepted, true, "통과한 응답의 원문도 남는다");
  assert.equal((run.report as { layout?: string } | null)?.layout, "story");
});

test("호출 한 번: 승인 가드가 최악 비용이 한도를 넘는 호출은 제공사에 보내지 않는다", async () => {
  const built = await ownReportInput(CAPTURE, NOW);
  assert.ok(built.ok);
  if (!built.ok) return;
  let sent = 0;
  const model: TextModel = {
    provider: "x",
    model: "claude-sonnet-5-5",
    async complete(): Promise<ModelResult> {
      sent++;
      throw new ModelCallError("호출되면 안 된다", { retryable: false, code: "SHOULD_NOT_CALL" });
    },
  };
  const A = AI_CANDIDATES.find((c) => c.key === "A")!;
  const guard = new BudgetGuard({ capKrw: 100, ...SETTINGS }); // 호출 1회 최악(약 570원)보다 작은 한도
  const result = await runStage({ stage: { name: "story-own", capKrw: 6000 }, personas: [ownPersona(built.input)], candidates: [{ key: "A", model, price: A.price }], guard, approval: { stage: "story-own", approvedCapKrw: 6000, approvedOn: "2026-10-17" }, now: NOW, variant: "story-v1", blindSeed: 1, maxRepairs: 0, maxRetries: 0, sleep: async () => {} });
  assert.equal(sent, 0, "제공사에 요청이 나가지 않았다");
  assert.equal(result.stoppedByBudget, true);
});

test("읽기 전 지표: 검사에 걸린 글에도 만들어지고, story 모양이 아닌 글에는 지표를 만들지 못했다고 알린다", async () => {
  const built = await ownReportInput(CAPTURE, NOW);
  assert.ok(built.ok);
  if (!built.ok) return;
  const evidence = buildEvidence(built.input, referenceFor(NOW));
  assert.match(reviewOwnDraft({ headline: "짧음" }, evidence), /story-v1\) 모양이 아니라/);
  const m = reviewOwnDraft({ areas: [{ id: "core", title: "t", paragraphs: ["가나다라마바사 아자차카타파하."], evidence: [evidence[0].id] }], headline: "h", flow: { title: "x", paragraphs: [], evidence: [] }, actions: [] }, evidence);
  assert.match(m, /형식 · 근거 검사/);
  assert.match(m, /영역마다 이어 쓴 근거/);
});

test("본인 입력 내보내기는 켠 사람이 직접 적고 개발 서버일 때만 켜진다 — 운영 · Vercel에서는 값을 적어도 꺼져 있다", () => {
  assert.equal(ownInputCaptureEnabled({}), false);
  assert.equal(ownInputCaptureEnabled({ NODE_ENV: "development" }), false, "값을 적지 않으면 꺼짐");
  assert.equal(ownInputCaptureEnabled({ MIYU_OWN_INPUT_CAPTURE: "yes", NODE_ENV: "development" }), true);
  assert.equal(ownInputCaptureEnabled({ MIYU_OWN_INPUT_CAPTURE: "true", NODE_ENV: "development" }), false, "yes만 켠다");
  assert.equal(ownInputCaptureEnabled({ MIYU_OWN_INPUT_CAPTURE: "yes", NODE_ENV: "production" }), false);
  assert.equal(ownInputCaptureEnabled({ MIYU_OWN_INPUT_CAPTURE: "yes", NODE_ENV: "development", VERCEL: "1" }), false);
  assert.equal(ownInputCaptureEnabled({ MIYU_OWN_INPUT_CAPTURE: "yes", NODE_ENV: "development", VERCEL_ENV: "preview" }), false);
});

// ───── 7개 대주제(story-7) 본인 입력 시험 — 승인 범위 · 입력 확인 · 호출 한 번 · 읽기 전 지표 ─────

test("승인 범위: story7-own은 story-7 · 본인 입력 · 후보 A · 총 6,000원 그대로 · 3차(지시문 0.5) 한 건은 운영자 승인(2026-10-18)으로 1회 상한 700원(644원에서 재승인) — 승인된 3회 중 2회를 마쳤고 호출 1회의 최악은 상한 안이다", async () => {
  const own = COMPARE_STAGES.find((s) => s.name === "story7-own")!;
  assert.equal(own.capKrw, 6000, "기존 승인 총액 그대로");
  assert.equal(own.restrict?.runCeilingKrw, 700, "3차 승인(2026-10-18) 재승인: 이번 호출 상한 700원(처음 644원 — 드라이런 최악 648.2원이 넘어 운영자가 다시 정했다)");
  assert.equal(own.restrict?.variant, "story-7");
  assert.equal(own.restrict?.persona, "OWN");
  assert.equal(own.restrict?.runsApproved, 3, "1차 · 2차를 마쳤고 3차 한 건을 운영자가 신규 호출로 승인했다(2026-10-18)");
  assert.equal(own.restrict?.runsDone, 2, "3차는 아직 실행하지 않았다(운영자 PC에서 운영자가 직접 실행한다)");
  assert.match(own.restrict?.lastRun ?? "", /269원/);
  assert.match(own.restrict?.lastRun ?? "", /3,108원/);
  const built = await ownReportInput(CAPTURE, NOW);
  assert.ok(built.ok);
  if (!built.ok) return;
  const A = AI_CANDIDATES.find((c) => c.key === "A")!;
  const plan = planStage({ stage: "story7-own", capKrw: 6000 - 3108, personas: [ownPersona(built.input)], candidates: [{ key: "A", price: A.price }], settings: SETTINGS, now: NOW, variant: "story-7" });
  const ok = { variant: "story-7", only: "A", persona: "OWN", alreadySpentGiven: true, twoRoundWorstKrw: plan.firstCallWorstKrw, execute: true } as const;
  // 이 시험 입력(시험용 고정 응답)의 최악 — 운영자 본인 입력의 값은 운영자 PC의 0원 드라이런이 보여 준다(644원을 넘으면 실행하지 않는다)
  assert.ok(plan.firstCallWorstKrw < 700, `호출 1회의 최악 ${plan.firstCallWorstKrw}`);
  // 운영자 본인 입력의 드라이런 최악(648.2원)은 처음 상한 644원을 넘어 거절됐고 700원 재승인 안에서는 통과한다
  assert.deepEqual(checkStageRestriction(own, { ...ok, twoRoundWorstKrw: 648.2 }), [], "본인 입력의 드라이런 최악 648.2원은 700원 상한 안이다");
  // 승인이 남아 있으면(2/3) 범위 안에서 실제 호출이 통과하고, 상한은 반올림 없이 그대로 비교한다
  assert.deepEqual(checkStageRestriction(own, { ...ok, twoRoundWorstKrw: 699.99 }), [], "승인 범위 안이면 통과한다");
  assert.deepEqual(checkStageRestriction(own, { ...ok, twoRoundWorstKrw: 700 }), [], "상한과 같으면 통과한다");
  assert.ok(checkStageRestriction(own, { ...ok, twoRoundWorstKrw: 700.01 }).length > 0, "상한을 0.01원만 넘어도 막힌다 — 실행하지 않고 운영자에게 알린다");
  assert.ok(checkStageRestriction(own, { ...ok, variant: "story-v1" }).length > 0, "다른 지시문은 안 된다");
  assert.ok(checkStageRestriction(own, { ...ok, persona: "P01" }).length > 0, "다른 인물은 안 된다");
  assert.ok(checkStageRestriction(own, { ...ok, only: "B" }).length > 0);
  assert.ok(checkStageRestriction(own, { ...ok, alreadySpentGiven: false }).length > 0, "이미 쓴 금액을 적지 않으면 막힌다");
  // 승인된 3회를 모두 쓰고 나면 실제 호출은 거절되고, 드라이런은 계속 볼 수 있다 — 새 실행은 운영자가 다시 승인해 runsApproved를 올린 뒤에만
  const spent = { restrict: { ...own.restrict!, runsDone: 3 } };
  assert.ok(checkStageRestriction(spent, ok).some((m) => /이미 실행/.test(m)), "승인된 3회를 쓰고 나면 새 실행은 막힌다");
  assert.deepEqual(checkStageRestriction(spent, { ...ok, execute: false }), [], "드라이런은 계속 볼 수 있다");
});

test("입력 확인 글(story-7): 같은 근거 · 지시문으로 만들고 어떤 지시문인지 밝힌다", async () => {
  const built = await ownReportInput(CAPTURE, NOW);
  assert.ok(built.ok);
  if (!built.ok) return;
  const d = describeOwnInput({ input: built.input, capture: CAPTURE, now: NOW, variant: "story-7" });
  assert.match(d.markdown, /story-7\(7개 고정 대주제/);
  const [system, user] = promptsFor("story-7", d.evidence, referenceFor(NOW).iso, built.input.context);
  assert.equal(d.systemChars, system.length);
  assert.equal(d.userChars, user.length);
  for (const e of d.evidence) assert.ok(user.includes(e.id), e.id);
  const old = describeOwnInput({ input: built.input, capture: CAPTURE, now: NOW });
  assert.match(old.markdown, /story-v1\(영역별 이야기\)/);
});

test("호출 한 번(story-7): 통과한 글은 7개 대주제로 조립되고, 걸린 글은 다시 쓰지 않고 원문 전문을 남긴다", async () => {
  const built = await ownReportInput(CAPTURE, NOW);
  assert.ok(built.ok);
  if (!built.ok) return;
  const ok = createMockModel();
  const a = guardAndCandidate(ok);
  const r1 = await runStage({ stage: { name: "story7-own", capKrw: 6000 }, personas: [ownPersona(built.input)], candidates: a.candidates, guard: a.guard, approval: { stage: "story7-own", approvedCapKrw: 6000, approvedOn: "2026-10-17" }, now: NOW, variant: "story-7", blindSeed: 1, maxRepairs: 0, maxRetries: 0, sleep: async () => {} });
  assert.equal(ok.calls, 1);
  const run = r1.runs[0]!;
  assert.equal(run.status, "ok");
  assert.equal((run.report as { layout?: string } | null)?.layout, "story7");
  assert.equal(run.attempts.at(-1)?.accepted, true);

  const bad = createMockModel({ invalidTimes: 5 });
  const b = guardAndCandidate(bad);
  const r2 = await runStage({ stage: { name: "story7-own", capKrw: 6000 }, personas: [ownPersona(built.input)], candidates: b.candidates, guard: b.guard, approval: { stage: "story7-own", approvedCapKrw: 6000, approvedOn: "2026-10-17" }, now: NOW, variant: "story-7", blindSeed: 1, maxRepairs: 0, maxRetries: 0, sleep: async () => {} });
  assert.equal(bad.calls, 1, "자동 재작성 없음 — 호출은 한 번뿐");
  assert.equal(r2.runs[0]!.status, "failed");
  assert.equal(r2.runs[0]!.attempts[0].text, '{"headline": "짧음"}', "걸린 글의 원문이 그대로 남는다");
});

test("읽기 전 지표(story-7): sections 모양이면 7개 대주제 지표를 만들고 합격 판정이라 하지 않는다 — 걸린 글에도 만들어진다", async () => {
  const built = await ownReportInput(CAPTURE, NOW);
  assert.ok(built.ok);
  if (!built.ok) return;
  const evidence = buildEvidence(built.input, referenceFor(NOW));
  const draft = composeMockStory7(buildStory7UserMessage(evidence, "2026-10-17", null));
  const m = reviewOwnDraft(draft, evidence);
  assert.match(m, /7개 대주제 \(코드 · 합격 판정 아님\)/);
  assert.match(m, /\| 5 일과 재물 \| 근거를 소유 \|/);
  assert.match(m, /같은 응답 근거를 두 장 이상이 인용한 곳/);
  assert.match(m, /재물 소제목: /);
  assert.match(m, /글 전문을 직접 읽고 판단/);
  // 형식이 어긋난 글(장이 하나뿐)도 지표를 만들고 이유를 알려 준다
  const broken = reviewOwnDraft({ headline: "h", sections: [draft.sections[0]], actions: [] }, evidence);
  assert.match(broken, /형식 · 근거 검사/);
  assert.match(broken, /\(없음\)/);
});
