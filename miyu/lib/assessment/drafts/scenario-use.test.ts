// 응답 사용 검사(lib/report/reading/answer-use.ts)의 시험 — 장면 질문의 입력(scenario-use.ts · scenario-cues.ts)으로 확인한다.
//
// 운영자 지적(2026-10-16): 잘못된 풀이(지어낸 응답 · 선택지 재진술 · 답을 요약한 제목)가 현재 제품 검사를 통과했다.
// 이 시험은 ① 실제로 통과했던 나쁜 글을 **고정**해 이제는 걸리는지 ② 고친 글 · 정상 사주 글이 **막히지 않는지**(과잉 차단 방지) ③ 통과 · 실패(지어냄)와 품질(새로 알게 함)이 따로 나오는지를 본다.
// 저장된 글(docs/samples/scenario-generation/)은 실제 서비스 AI가 아니라 시험용 대리 작성기(AI 하위 작업자)가 쓴 것이다.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { SAMPLE_READING_DRAFT } from "../../samples/sample-reading-draft.ts";
import { answerUseChecker, checkAnswerUse, FLAT_EITHER, sourceMix, titleSlots } from "../../report/reading/answer-use.ts";
import type { ReadingDraftV1 } from "../../report/reading/types.ts";
import { validateReadingDraft } from "../../report/reading/validate.ts";
import { OPTION_CUES } from "./scenario-cues.ts";
import { SCENARIO_CASES, scenarioCaseEvidence, type ScenarioCase } from "./scenario-cases.ts";
import { scenarioAnswerUse } from "./scenario-use.ts";
import { SCENES } from "./scenario-v1.ts";

const DIR = new URL("../../../docs/samples/scenario-generation/", import.meta.url);
const load = (key: string): ReadingDraftV1 => JSON.parse(readFileSync(new URL(`${key}.json`, DIR), "utf8")) as ReadingDraftV1;
const caseOf = (key: string): ScenarioCase => SCENARIO_CASES.find((c) => c.key === key)!;
const inputOf = (key: string) => scenarioAnswerUse(caseOf(key).answers);
const check = (draftKey: string, caseKey = draftKey.split(".")[0]!) => checkAnswerUse(load(draftKey), inputOf(caseKey));
const loveFlow = (d: ReadingDraftV1) => d.blocks.find((b) => b.id === "love")!.reactionFlow!;

test("선택지마다 알아보는 표현(cue)이 있고, 자기 선택지의 글을 알아보며 같은 장면의 다른 선택지의 글은 알아보지 않는다", () => {
  for (const s of SCENES) {
    for (const o of s.options) {
      const cues = OPTION_CUES[`${s.id}.${o.id}`];
      assert.ok(cues && cues.length > 0, `${s.id}.${o.id}: cue가 없다`);
      assert.ok([o.text, o.plain, o.shows].some((t) => cues.some((re) => re.test(t))), `${s.id}.${o.id}: 자기 선택지의 글을 알아보지 못한다`);
      for (const other of s.options) {
        if (other.id === o.id) continue;
        assert.ok(![other.text, other.plain].some((t) => cues.some((re) => re.test(t))), `${s.id}.${o.id}의 cue가 ${other.id}의 글을 알아본다 — 장면 안에서 선택지를 가르지 못한다`);
      }
    }
  }
});

test("읽힌 구분의 선택지만 '고른 것'으로 센다 — 한 장면만 답한 구분 · 거의 없었어요 · 선택지 없음 · 미응답은 근거를 만들지 않으므로 고른 것으로 세지 않는다", () => {
  const h = inputOf("H");
  const chosen = h.options.filter((o) => o.chosen).map((o) => o.scene);
  assert.deepEqual(chosen.sort(), ["S5", "S6"]);
  assert.deepEqual(h.threads.filter((t) => t.readable).map((t) => t.id), ["D3"]);
  assert.equal(inputOf("X").threads.every((t) => t.readable), true);
});

// ───────────── 나쁜 글 고정 ─────────────

test("고정(나쁜 글 1) 지시문 0.9로 쓴 H: 연락 장면을 '거의 없었어요'로 답했는데 반응 단계에 반응을 채워 넣었다 — 이전 제품 검사는 통과했고 이제는 지어낸 응답(INVENTED)으로 걸린다", () => {
  const bad = load("H.v0.9");
  assert.equal(validateReadingDraft(bad, scenarioCaseEvidence(caseOf("H")), { hasContext: false }).ok, true, "이전 제품 검사(extra 없이)는 이 글을 통과시켰다");
  const r = check("H.v0.9", "H");
  assert.ok(r.integrity.some((e) => e.startsWith("INVENTED") && /머릿속이 바빠져요/.test(e)), r.integrity.join("\n"));
  assert.ok(r.integrity.some((e) => /이유를 헤아려요/.test(e)));
  // 같은 입력으로 0.10으로 쓴 글은 걸리지 않는다
  assert.deepEqual(check("H").integrity, []);
  // 확장: 연락 장면을 상황으로 삼은 반응 단계는 조건형이 아니면 걸리고, 조건형이면 통과한다(사주로 읽은 경향은 조건형으로 쓸 수 있다)
  const hedged = load("H.v0.9");
  loveFlow(hedged).steps[1]!.text = "확인할 근거가 없으면 머릿속이 바빠질 수 있어요";
  loveFlow(hedged).steps[2]!.text = "보낸 말을 다시 읽고 이유를 헤아리기 쉬워요";
  const r2 = checkAnswerUse(hedged, inputOf("H"));
  assert.deepEqual(r2.integrity.filter((e) => /reactionFlow\.steps\[[12]\]/.test(e)), [], "조건형은 막지 않는다");
});

test("고정(나쁜 글 2) Y의 반응 단계 '도움이 되는 것'에 고른 선택지 문장 그대로(\"내가 느낀 점을 먼저 말로 꺼내요\")가 들어 있다 — 이전 제품 검사는 통과했고 이제는 ECHO로 걸린다", () => {
  const bad = load("Y");
  loveFlow(bad).steps[3]!.text = "내가 느낀 점을 먼저 말로 꺼내요";
  assert.equal(validateReadingDraft(bad, scenarioCaseEvidence(caseOf("Y")), { hasContext: false }).ok, true, "이전 제품 검사는 통과시켰다");
  const r = checkAnswerUse(bad, inputOf("Y"));
  assert.ok(r.integrity.some((e) => e.startsWith("ECHO") && /reactionFlow\.steps\[3\]/.test(e) && /S8/.test(e)), r.integrity.join("\n"));
  // 끝맺음만 바꾼 문장("~꺼내는 편이에요")도 거의 그대로이므로 걸린다
  const near = load("Y");
  loveFlow(near).steps[3]!.text = "내가 느낀 점을 먼저 말로 꺼내는 편이에요";
  assert.ok(checkAnswerUse(near, inputOf("Y")).integrity.some((e) => e.startsWith("ECHO")), "끝맺음만 바꾼 문장도 걸린다");
  // 고쳐 쓴 지금의 글은 걸리지 않는다
  assert.deepEqual(check("Y").integrity, []);
});

test("고정(나쁜 글 3) 제목이 고른 답을 나열한다 — X · Z의 성향 제목(S1 + S2), W의 성향 제목, Y의 연애 제목(S5 + S8): 이전 제품 검사는 통과했고 이제는 TITLE(품질)로 걸린다", () => {
  for (const key of ["X", "Z", "W"]) {
    const r = check(key);
    assert.ok(r.quality.some((e) => e.startsWith("TITLE") && /blocks\.tendency\.headline/.test(e) && /S1 · S2/.test(e)), `${key}: ${r.quality.join("\n")}`);
    assert.deepEqual(r.integrity, [], `${key}: 지어내지는 않았다 — 품질 문제와 통과/실패 문제는 따로 나온다`);
  }
  const y = check("Y");
  assert.ok(y.quality.some((e) => e.startsWith("TITLE") && /blocks\.love\.headline/.test(e) && /S5 · S8/.test(e)), y.quality.join("\n"));
});

test("고정(나쁜 글 4) 운영자가 든 \"편안해서인지 기대를 접어 둔 것인지 그날그날 달라질 수 있어요\"는 FLAT_EITHER로 걸리고, 가르는 조건을 한 가지 주면 통과한다", () => {
  const x = check("X");
  assert.ok(x.quality.some((e) => e.startsWith("FLAT_EITHER") && /reactionFlow\.helpful/.test(e)), x.quality.join("\n"));
  const flat = "겉으로 담담해 보이는 모습이 편안해서인지 기대를 접어 둔 것인지는 그날그날 달라질 수 있어요";
  assert.match(flat, FLAT_EITHER);
  const withCondition = "겉으로 담담해 보이는 모습이 편안해서인지 기대를 접어 둔 것인지는, 같은 일이 다시 생겼을 때 마음이 가벼운지 무거운지를 보면 가려져요";
  const base = load("X");
  loveFlow(base).helpful = flat;
  assert.ok(checkAnswerUse(base, inputOf("X")).quality.some((e) => e.startsWith("FLAT_EITHER")));
  loveFlow(base).helpful = withCondition;
  assert.ok(!checkAnswerUse(base, inputOf("X")).quality.some((e) => e.startsWith("FLAT_EITHER")), "가르는 조건이 있는 문장은 막지 않는다");
});

test("제품 검사의 두 번째 줄(extra): 이전에는 통과한 나쁜 글이 막히고 품질 검사는 따로 끌 수 있다", () => {
  const ev = scenarioCaseEvidence(caseOf("H"));
  const bad = load("H.v0.9");
  assert.equal(validateReadingDraft(bad, ev, { hasContext: false }).ok, true);
  const r = validateReadingDraft(bad, ev, { hasContext: false, extra: answerUseChecker(inputOf("H")) });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.startsWith("INVENTED")));
  // Y: 제목 나열(품질)만 있다 — 품질을 끄면 통과, 켜면 막힌다
  const evY = scenarioCaseEvidence(caseOf("Y"));
  assert.equal(validateReadingDraft(load("Y"), evY, { hasContext: false, extra: answerUseChecker(inputOf("Y"), { quality: false }) }).ok, true);
  assert.equal(validateReadingDraft(load("Y"), evY, { hasContext: false, extra: answerUseChecker(inputOf("Y")) }).ok, false);
  // 형식 오류가 있으면 extra는 부르지 않는다(오류가 겹쳐 쌓이지 않게)
  const broken = load("Y");
  broken.headline = "";
  const rb = validateReadingDraft(broken, evY, { hasContext: false, extra: answerUseChecker(inputOf("Y")) });
  assert.ok(!rb.ok && !rb.errors.some((e) => /^(?:TITLE|ECHO|INVENTED)/.test(e)));
});

// ───────────── 과잉 차단 방지 ─────────────

test("막지 않아야 하는 글: 0.10으로 쓴 H · V · R과 사람이 쓴 서윤 예시(사주 중심의 정상적인 글)는 지어냄 검사에 걸리지 않는다", () => {
  for (const key of ["H", "V", "R"]) assert.deepEqual(check(key).integrity, [], key);
  for (const key of ["X", "Y", "H"]) {
    const r = checkAnswerUse(SAMPLE_READING_DRAFT, inputOf(key));
    assert.deepEqual(r.integrity, [], `서윤 예시 vs ${key}: ${r.integrity.join(" / ")}`);
    assert.deepEqual(r.quality, [], `서윤 예시 vs ${key}: ${r.quality.join(" / ")}`);
  }
});

test("막지 않아야 하는 글: 응답으로 장면을 구체화하는 설명(고른 행동을 풀이 안에서 풀어 쓴 문장)은 고른 답을 거의 그대로 옮긴 것으로 세지 않는다", () => {
  // W의 연애 소단락은 "마음이 어느 정도 정리된 뒤에야 이야기를 꺼내는 편이라, 호감이 생겨도 …"로 S4의 선택을 풀이 안에서 설명한다 — 정상이다
  const w = check("W");
  assert.deepEqual(w.integrity, []);
  const text = JSON.stringify(load("W").blocks.find((b) => b.id === "love")!.sections);
  assert.match(text, /정리된 뒤에야 이야기를 꺼내는 편이라/);
});

test("막지 않아야 하는 글: 답을 받지 못한 장면의 이야기라도 사주에서 읽은 경향을 조건형으로 쓴 문장은 막지 않는다 · 읽은 구분의 행동은 근거를 달면 쓸 수 있다", () => {
  const d = load("H");
  const love = d.blocks.find((b) => b.id === "love")!;
  // 읽을 수 없는 구분(D4)의 행동: 조건형이면 통과
  love.sections![0]!.body += " 한 번 더 연락해서 확인하고 싶어질 수 있어요.";
  assert.deepEqual(checkAnswerUse(d, inputOf("H")).integrity, []);
  // 같은 문장을 단정으로 바꾸면 지어낸 응답
  love.sections![0]!.body = love.sections![0]!.body.replace("확인하고 싶어질 수 있어요.", "확인해요.");
  assert.ok(checkAnswerUse(d, inputOf("H")).integrity.some((e) => e.startsWith("INVENTED")));
  // 읽은 구분(D3 · H에서 읽힌다)의 행동: 근거(scene.D3)를 달았으면 쓸 수 있다
  const ok = load("H");
  const okLove = ok.blocks.find((b) => b.id === "love")!;
  assert.ok(okLove.evidence.includes("scene.D3"));
  okLove.sections![0]!.body += " 의견이 갈리면 근거부터 차분히 꺼내요.";
  assert.deepEqual(checkAnswerUse(ok, inputOf("H")).integrity, []);
  // 근거를 빼면 UNCITED
  okLove.evidence = okLove.evidence.filter((id) => id !== "scene.D3");
  assert.ok(checkAnswerUse(ok, inputOf("H")).integrity.some((e) => e.startsWith("UNCITED")));
});

test("짧은 선택지 글(12자 미만)은 일상 표현과 겹치기 쉬워 옮겨 쓴 것으로 세지 않는다(한계)", () => {
  const d = load("Y");
  d.blocks.find((b) => b.id === "love")!.sections![2]!.tryIt += " 혼자 정리할 시간이 필요해요.";
  assert.deepEqual(checkAnswerUse(d, inputOf("Y")).integrity, []);
});

// ───────────── 근거 구분 ─────────────

test("근거 구분: 주제 블록마다 사주 · 응답 · 입력 정보(MBTI) 근거를 나눠 보여 주고, 응답 근거를 달았지만 글에서 쓰지 않은 곳을 알린다", () => {
  const ev = scenarioCaseEvidence(caseOf("X"));
  const rows = sourceMix(load("X"), ev, inputOf("X"));
  assert.ok(rows.length >= 6);
  for (const r of rows.filter((x) => x.block.startsWith("blocks."))) assert.ok(r.saju >= 1, `${r.block}: 사주 근거가 없다`);
  assert.ok(rows.some((r) => r.response >= 1 && /사주 \+ 응답/.test(r.kind)));
  assert.ok(rows.every((r) => !/지어/.test(r.kind)));
  // 응답 근거만 달고 글에서는 그 장면을 쓰지 않은 블록은 citedButUnused에 나온다
  const d = load("X");
  d.blocks.find((b) => b.id === "tendency")!.evidence.push("scene.D3");
  const mixed = sourceMix(d, ev, inputOf("X")).find((r) => r.block === "blocks.tendency")!;
  assert.ok(mixed.citedButUnused.includes("scene.D3"));
});

test("제목 자리: headline · 주제 headline · 소단락 제목 · 카드 keyword만 제목으로 본다", () => {
  const slots = titleSlots(load("X")).map((s) => s.where);
  assert.ok(slots.includes("headline") && slots.includes("blocks.love.headline") && slots.includes("blocks.love.sections[0].title") && slots.includes("cards.strength.keyword"));
  assert.ok(!slots.some((w) => /\.body|\.summary|\.text|\.helpful/.test(w)));
});

test("고친 글이 있으면 통과한다 — 제품 검사(형식)와 지어냄 · 품질 검사 모두 (대리 작성기가 검사 오류를 받고 고쳐 쓴 글, docs/samples/scenario-generation/*.fixed.json)", () => {
  const fixed = SCENARIO_CASES.map((c) => c.key).filter((k) => existsSync(new URL(`${k}.fixed.json`, DIR)));
  for (const key of fixed) {
    const d = load(`${key}.fixed`);
    const r = validateReadingDraft(d, scenarioCaseEvidence(caseOf(key)), { hasContext: false, extra: answerUseChecker(inputOf(key)) });
    assert.ok(r.ok, `${key}.fixed: ${r.ok ? "" : r.errors.join(" / ")}`);
  }
});
