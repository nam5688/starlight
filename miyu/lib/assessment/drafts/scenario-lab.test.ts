// 장면 질문 테스트 화면(/dev/scenario)의 규칙과, 운영 생성기에 더한 선택 자리(adaptEvidence · extraChecks)의 시험 — 가짜 모델만 쓴다(유료 호출 없음).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { sampleReport } from "../../samples/sample-report.ts";
import { createAiReportGenerator } from "../../report/ai/generator.ts";
import type { TextModel } from "../../report/ai/model.ts";
import { isReadingReport, type ReportInput } from "../../report/generator.ts";
import { answerUseChecker } from "../../report/reading/answer-use.ts";
import { parseReview, reviewSlots, SEMANTIC_REVIEW_SYSTEM, VERDICTS } from "../../report/reading/semantic-review.ts";
import type { ReadingDraftV1 } from "../../report/reading/types.ts";
import { labEvidence, labThreads, LAB_PRESETS, parseLabInput, savedCaseFor } from "./scenario-lab.ts";
import { SCENARIO_CASES } from "./scenario-cases.ts";
import { withScenarioEvidence } from "./scenario-evidence.ts";
import { scenarioAnswerUse } from "./scenario-use.ts";

const DIR = new URL("../../../docs/samples/scenario-generation/", import.meta.url);
const load = (key: string) => JSON.parse(readFileSync(new URL(`${key}.json`, DIR), "utf8")) as ReadingDraftV1;
const caseOf = (key: string) => SCENARIO_CASES.find((c) => c.key === key)!;

test("입력 확인: 알 수 없는 장면 · 답은 조용히 바꾸지 않고 거절한다 · 비운 장면은 답하지 않음으로 다룬다", () => {
  const ok = parseLabInput({ person: { kind: "seoyun" }, mbti: "infj", answers: { S1: "b", S2: "", S3: "x", S4: "y" } });
  assert.ok(ok.ok);
  assert.ok(ok.ok && ok.value.mbti === "INFJ" && ok.value.answers.S1 === "b" && ok.value.answers.S2 === undefined && ok.value.answers.S3 === "x");
  assert.equal(parseLabInput({ person: { kind: "seoyun" }, answers: { S11: "a" } }).ok, false);
  assert.equal(parseLabInput({ person: { kind: "seoyun" }, answers: { S1: "e" } }).ok, false);
  assert.equal(parseLabInput({ person: { kind: "seoyun" }, mbti: "ABCD", answers: {} }).ok, false);
  assert.equal(parseLabInput({ person: { kind: "other" }, answers: {} }).ok, false);
  const own = parseLabInput({ person: { kind: "own", year: "1990", month: "5", day: "12", time: "", gender: "male" }, answers: {} });
  assert.ok(own.ok && own.value.person.kind === "own");
  for (const bad of [{ year: "1800", month: "5", day: "1" }, { year: "1990", month: "13", day: "1" }, { year: "1990", month: "5", day: "40" }]) {
    assert.equal(parseLabInput({ person: { kind: "own", ...bad, gender: "male" }, answers: {} }).ok, false);
  }
  assert.equal(parseLabInput({ person: { kind: "own", year: "1990", month: "5", day: "12", time: "25:00", gender: "male" }, answers: {} }).ok, false);
  assert.equal(parseLabInput({ person: { kind: "own", year: "1990", month: "5", day: "12", time: "", gender: "" }, answers: {} }).ok, false, "성별 필수");
});

test("읽힌 구분 요약: 두 장면 모두 고르면 읽히고, 한 장면이라도 비면 읽지 않으며 어느 장면이 비었는지 알려 준다", () => {
  const t = labThreads(caseOf("H").answers);
  assert.deepEqual(t.filter((x) => x.status === "read").map((x) => x.id), ["D3"]);
  const d1 = t.find((x) => x.id === "D1")!;
  assert.equal(d1.status, "hold");
  assert.equal(d1.missing.length, 1, "S2만 비었다");
  assert.ok(labEvidence(caseOf("H").answers).every((e) => e.id === "scene.D3"), "읽히지 않은 구분의 근거는 만들지 않는다");
  assert.equal(labEvidence(caseOf("X").answers).length, 5);
});

test("저장된 시험 글 찾기: 같은 가상 인물 · 같은 응답일 때만 있다 — 직접 입력한 생일에는 없다", () => {
  for (const p of LAB_PRESETS) {
    const c = savedCaseFor({ person: { kind: "seoyun" }, mbti: "INFJ", answers: caseOf(p.key).answers });
    assert.equal(c?.key, p.key === "X" ? "X" : p.key, p.key);
  }
  assert.equal(savedCaseFor({ person: { kind: "seoyun" }, mbti: "INFJ", answers: { ...caseOf("X").answers, S8: "a" } })?.key, "Z");
  assert.equal(savedCaseFor({ person: { kind: "seoyun" }, mbti: "INFJ", answers: { ...caseOf("X").answers, S8: "b" } }), null);
  assert.equal(savedCaseFor({ person: { kind: "p01" }, mbti: "INFJ", answers: caseOf("W").answers })?.key, "W");
  assert.equal(savedCaseFor({ person: { kind: "own", year: 1990, month: 5, day: 12, time: null, gender: "male" }, mbti: "INFJ", answers: caseOf("X").answers }), null);
});

// ───────────── 운영 생성기의 선택 자리: 근거 바꿔 끼우기 · 응답 사용 검사 ─────────────

const SAJU = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" });
const person = (): ReportInput => ({ nickname: "서윤", knownMbti: "INFJ", birthText: "가상", summary: sampleReport, saju: SAJU, gender: "female", context: null });
const NOW = () => new Date("2026-10-16T03:00:00Z");
const scripted = (texts: string[]): TextModel & { seen: string[] } => {
  const m = {
    provider: "mock",
    model: "mock-0",
    seen: [] as string[],
    async complete(req: { messages: { role: string; content: string }[] }) {
      const i = m.seen.length;
      m.seen.push(req.messages.map((x) => x.content).join("\n"));
      return { text: texts[Math.min(i, texts.length - 1)]!, model: "mock-0", usage: { inputTokens: 0, outputTokens: 0 } };
    },
  };
  return m as never;
};

test("생성기에 응답 사용 검사를 켜면 지어낸 글이 고쳐 쓰기로 돌아가고, 켜지 않으면(기본) 예전처럼 그대로 받는다 — 근거 바꿔 끼우기만 켠 경우", async () => {
  const bad = JSON.stringify(load("H.v0.9"));
  const good = JSON.stringify(load("H"));
  const answers = caseOf("H").answers;
  // 근거만 바꿔 끼우고 응답 사용 검사는 켜지 않은 경우(이전 상태): 지어낸 글이 형식 검사를 통과해 그대로 받아들여진다 — 운영자가 지적한 상태
  const plain = scripted([bad]);
  const r0 = await createAiReportGenerator({ model: plain, now: NOW, sleep: async () => {}, adaptEvidence: (ev) => withScenarioEvidence(ev, answers) }).generate(person());
  assert.ok(isReadingReport(r0));
  assert.equal(plain.seen.length, 1);
  // 켠 경로: 첫 글은 INVENTED로 걸려 고쳐 쓰기가 한 번 간다 → 두 번째 글이 받아들여진다
  const model = scripted([bad, good]);
  const gen = createAiReportGenerator({ model, now: NOW, sleep: async () => {}, adaptEvidence: (ev) => withScenarioEvidence(ev, answers), extraChecks: answerUseChecker(scenarioAnswerUse(answers)) });
  const r = await gen.generate(person());
  assert.ok(isReadingReport(r));
  assert.equal(model.seen.length, 2, "고쳐 쓰기 한 번");
  assert.match(model.seen[0]!, /scene\.D3/, "첫 호출에 장면 근거가 실렸다");
  assert.doesNotMatch(model.seen[0]!, /survey\./, "22문항 응답 근거는 빠졌다");
  assert.match(model.seen[1]!, /INVENTED/, "고쳐 쓰기 요청에 걸린 이유가 실렸다");
  assert.ok(r.blocks.find((b) => b.id === "love")!.reactionFlow!.when === load("H").blocks.find((b) => b.id === "love")!.reactionFlow!.when, "고쳐 쓴 두 번째 글이 저장됐다");
});

test("사용 검사를 켜도 계속 걸리면 저장하지 않는다(실패로 남는다)", async () => {
  const bad = JSON.stringify(load("H.v0.9"));
  const answers = caseOf("H").answers;
  const gen = createAiReportGenerator({ model: scripted([bad, bad]), now: NOW, sleep: async () => {}, adaptEvidence: (ev) => withScenarioEvidence(ev, answers), extraChecks: answerUseChecker(scenarioAnswerUse(answers)) });
  await assert.rejects(() => gen.generate(person()), /검사 실패/);
});

// ───────────── 의미 검토 ─────────────

const REVIEW_DIR = new URL("review/", DIR);
const review = (file: string, draftKey: string) => {
  const slots = reviewSlots(load(draftKey));
  return parseReview(readFileSync(new URL(`${file}.result.json`, REVIEW_DIR), "utf8"), slots);
};

test("의미 검토: 질문지는 판정 여섯 가지를 모두 정의하고, 저장된 검토 결과(시험용 대리 검토기)를 읽어 통과/실패와 새로 알게 함을 따로 낸다", () => {
  for (const v of Object.keys(VERDICTS)) assert.ok(SEMANTIC_REVIEW_SYSTEM.includes(v), v);
  const bad = review("H.v0.9", "H.v0.9");
  assert.ok(bad && bad.integrity === "fail", "지어낸 응답이 있는 글은 실패");
  assert.ok(bad.items.some((i) => i.verdict === "invented-response" && /reactionFlow/.test(i.where)));
  const fixed = review("X.fixed", "X.fixed");
  assert.ok(fixed && fixed.integrity === "pass");
  assert.ok(["yes", "partly", "no"].includes(fixed.newUnderstanding));
});

test("의미 검토가 코드 검사보다 더 보는 것을 고정한다 — 코드 검사를 통과한 글(X.fixed)에서도 검토기는 답 요약 · 나열을 찾는다(코드 검사만으로는 \"좋은 글\"이라 말하지 않는 이유)", () => {
  const fixedDraft = load("X.fixed");
  assert.deepEqual(answerUseChecker(scenarioAnswerUse(caseOf("X").answers))(fixedDraft), [], "코드 검사는 통과한다");
  const r = review("X.fixed", "X.fixed")!;
  const summaries = r.items.filter((i) => i.verdict === "answer-summary" || i.verdict === "answer-list");
  assert.ok(summaries.length >= 3, `검토기가 찾은 답 요약 · 나열 ${summaries.length}곳`);
  assert.ok(r.items.some((i) => i.where === "headline" && i.verdict === "answer-summary"), "맨 위 핵심 문장은 코드 검사가 못 본 답 요약이다");
});

test("의미 검토는 형식이 어긋나면 판정을 지어내지 않는다(null)", () => {
  const slots = reviewSlots(load("X"));
  assert.equal(parseReview("판정할 수 없어요", slots), null);
  assert.equal(parseReview(JSON.stringify({ items: [{ where: "headline", verdict: "conclusion", note: "" }], newUnderstanding: "yes", summary: "" }), slots), null, "조각을 빠뜨리면 완전한 검토가 아니다");
  assert.equal(parseReview(JSON.stringify({ items: slots.map((s) => ({ where: s.where, verdict: "great", note: "" })), newUnderstanding: "yes", summary: "" }), slots), null, "알 수 없는 판정");
});
