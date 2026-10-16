// 장면 질문의 답을 리포트 AI의 근거 목록으로 바꾸는 코드(scenario-evidence.ts)의 시험.
// 확인하는 것: ① 조합 의미만이 아니라 실제 장면 · 고른 답 · 해석 후보 · 적용 조건 · 붙이면 안 되는 해석이 함께 넘어간다
// ② 읽을 수 없는 구분(거의 없었어요 · 선택지 없음 · 미응답)은 근거를 만들지 않는다 — 임의 성향으로 채우지 않는다
// ③ 같은 사주 + 다른 응답 · 다른 사주 + 같은 응답 · 일부 응답만 변경에서 바뀌는 근거가 바뀌어야 하는 곳뿐이다 ④ 지금 22문항의 응답 근거는 섞이지 않는다.
import assert from "node:assert/strict";
import test from "node:test";
import { buildReadingUserMessage, READING_SYSTEM_PROMPT } from "../../report/reading/prompt.ts";
import { SCORE_TEXT } from "../../report/reading/plan.ts";
import { SCENARIO_CASES, scenarioCaseEvidence, SCENARIO_REFERENCE_DATE } from "./scenario-cases.ts";
import { scenarioEvidence, withScenarioEvidence } from "./scenario-evidence.ts";
import { SCENE_BY_ID, THREAD_BY_ID } from "./scenario-v1.ts";

const caseOf = (key: string) => SCENARIO_CASES.find((c) => c.key === key)!;

test("근거 하나 = 구분 하나: 두 답의 사실 · 각 답이 보여 주는 방식 · 해석 후보 · 쓰는 조건 · 사주 짝 · 붙이면 안 되는 해석 · 쓰는 법이 함께 들어 있다", () => {
  const ev = scenarioEvidence(caseOf("X").answers);
  assert.deepEqual(ev.map((e) => e.id), ["scene.D1", "scene.D2", "scene.D3", "scene.D4", "scene.D5"]);
  for (const e of ev) {
    assert.equal(e.source, "survey");
    assert.equal(e.strength, "moderate");
    const thread = THREAD_BY_ID[e.id.slice(6) as "D1"];
    // 실제 장면 두 곳의 이름과 사실이 들어 있다 — 조합 이름이 아니라 장면이다
    for (const sid of thread.scenes) assert.ok(e.fact.includes(`[${SCENE_BY_ID[sid].label}]`), `${e.id}: 장면 ${sid}`);
    for (const part of ["각 답이 그 장면에서 보여 주는 방식", "해석 후보", "쓰는 조건", "사주와 짝지을 때", "붙이면 안 되는 해석", "쓰는 법"]) assert.ok(e.cue.includes(part), `${e.id}: "${part}"가 없다`);
    // 점수 · 유형 이름 · 퍼센트가 없다
    assert.doesNotMatch(`${e.fact} ${e.cue}`, SCORE_TEXT, e.id);
    assert.doesNotMatch(`${e.fact} ${e.cue}`, /[A-Z]{4}\b|안정형|불안형|회피형|확인추구형|거리유지형/, `${e.id}: 유형 이름`);
  }
});

test("읽을 수 없는 구분은 근거를 만들지 않는다 — 거의 없었어요 · 선택지 없음 · 미응답을 성향으로 채우지 않는다", () => {
  const h = scenarioEvidence(caseOf("H").answers);
  // H: D1(S2 거의 없었어요) · D2(S3 선택지 없음) · D4(S7 거의 없었어요) · D5(S9 선택지 없음)는 읽지 않고 D3(S5 · S6 둘 다 답)만 읽는다
  assert.deepEqual(h.map((e) => e.id), ["scene.D3"]);
  assert.deepEqual(scenarioEvidence({}), [], "아무것도 답하지 않으면 근거가 없다");
  assert.deepEqual(scenarioEvidence({ S1: "a", S2: undefined, S3: "x", S4: "y" }).map((e) => e.id), [], "한 장면만 답한 구분은 읽지 않는다");
  // 미응답 구분의 낱말이 다른 구분의 근거로 새지 않는다
  const text = JSON.stringify(h);
  assert.doesNotMatch(text, /D1|D2|D4|D5/, "읽지 않은 구분의 이름이 근거에 섞였다");
});

test("지금 22문항의 응답 근거(source survey)는 장면 근거로 바뀌고, 사주 근거와 본인이 입력한 MBTI는 그대로 남는다", () => {
  const base = scenarioCaseEvidence(caseOf("X"));
  assert.ok(base.some((e) => e.source === "saju"));
  assert.ok(base.some((e) => e.source === "self"), "본인이 입력한 MBTI 근거는 남는다");
  const surveyIds = base.filter((e) => e.source === "survey").map((e) => e.id);
  assert.deepEqual(surveyIds, ["scene.D1", "scene.D2", "scene.D3", "scene.D4", "scene.D5"], "22문항 응답 근거(survey.*)가 섞이면 같은 답을 두 번 읽는다");
  const merged = withScenarioEvidence([{ id: "survey.caution.high", source: "survey", topics: ["love"], strength: "strong", fact: "x", cue: "y" }], { S5: "a", S6: "a" });
  assert.ok(!merged.some((e) => e.id === "survey.caution.high"));
  assert.deepEqual(merged.map((e) => e.id), ["scene.D3"]);
});

test("같은 사주 + 다른 응답: 사주 근거는 그대로이고 장면 근거만 달라진다", () => {
  const x = scenarioCaseEvidence(caseOf("X"));
  const y = scenarioCaseEvidence(caseOf("Y"));
  const sajuOf = (list: typeof x) => JSON.stringify(list.filter((e) => e.source !== "survey"));
  assert.equal(sajuOf(x), sajuOf(y), "같은 사주 · 같은 MBTI의 근거가 바뀌었다");
  const differing = ["scene.D1", "scene.D2", "scene.D3", "scene.D4", "scene.D5"].filter((id) => x.find((e) => e.id === id)!.fact !== y.find((e) => e.id === id)!.fact);
  // Y는 S7(평소처럼)과 S10(부담이 몰림)이 X와 같다 — 그래도 짝이 달라진 구분(D4 · D5)의 근거 문장은 같은 답이 다르게 읽힌다
  assert.deepEqual(differing, ["scene.D1", "scene.D2", "scene.D3", "scene.D4", "scene.D5"].filter((id) => id !== ""), "다섯 구분 모두 한 장면 이상 달라졌다");
  const d4x = x.find((e) => e.id === "scene.D4")!;
  const d4y = y.find((e) => e.id === "scene.D4")!;
  assert.notEqual(d4x.cue, d4y.cue, "같은 S7 답이 S8 답에 따라 다르게 읽혀야 한다");
  assert.ok(d4x.fact.includes(SCENE_BY_ID.S7.options.find((o) => o.id === "a")!.plain), "같은 S7 답의 사실은 두 사례에 모두 있다");
  assert.ok(d4y.fact.includes(SCENE_BY_ID.S7.options.find((o) => o.id === "a")!.plain));
});

test("일부 응답만 변경(X → Z, S8 하나): 연락 · 기대 구분(D4)의 근거만 달라지고 나머지 네 구분은 그대로다", () => {
  const x = scenarioCaseEvidence(caseOf("X"));
  const z = scenarioCaseEvidence(caseOf("Z"));
  const changed = x.filter((e) => JSON.stringify(e) !== JSON.stringify(z.find((f) => f.id === e.id))).map((e) => e.id);
  assert.deepEqual(changed, ["scene.D4"]);
});

test("다른 사주 + 같은 응답(X → W): 장면 근거는 같고 사주 근거가 달라진다", () => {
  const x = scenarioCaseEvidence(caseOf("X"));
  const w = scenarioCaseEvidence(caseOf("W"));
  const sceneOf = (list: typeof x) => JSON.stringify(list.filter((e) => e.id.startsWith("scene.")));
  assert.equal(sceneOf(x), sceneOf(w), "같은 응답의 장면 근거는 사주와 무관하게 같아야 한다 — 사주를 응답으로 바꾸지 않는다");
  const sajuIds = (list: typeof x) => list.filter((e) => e.source === "saju").map((e) => e.id + e.fact).join("|");
  assert.notEqual(sajuIds(x), sajuIds(w), "다른 사주인데 사주 근거가 같다");
});

test("리포트 AI의 사용자 메시지에 장면 근거가 그대로 실리고, 지시문은 응답을 읽어 주지 않는 규칙 · 응답 없는 주제를 사주로 완결하는 규칙을 담는다", () => {
  const msg = buildReadingUserMessage(scenarioCaseEvidence(caseOf("X")), SCENARIO_REFERENCE_DATE);
  const payload = JSON.parse(msg.slice(msg.indexOf("{")));
  const scenes = payload.evidence.filter((e: { id: string }) => e.id.startsWith("scene."));
  assert.equal(scenes.length, 5);
  assert.ok(scenes.every((e: { cue: string }) => e.cue.includes("붙이면 안 되는 해석") && e.cue.includes("쓰는 법")));
  assert.ok(!payload.evidence.some((e: { id: string }) => e.id.startsWith("survey.")), "22문항 응답 근거가 섞였다");
  assert.match(READING_SYSTEM_PROMPT, /응답을 그대로 읽어 주지 않는다/);
  assert.match(READING_SYSTEM_PROMPT, /사주 근거만으로 풀이를 끝까지 쓴다/);
  // 읽지 않은 구분(H)의 메시지에는 그 구분의 근거 자체가 없다 — "없다"고 쓸 거리가 없다
  const hMsg = buildReadingUserMessage(scenarioCaseEvidence(caseOf("H")), SCENARIO_REFERENCE_DATE);
  const hScenes = JSON.parse(hMsg.slice(hMsg.indexOf("{"))).evidence.filter((e: { id: string }) => e.id.startsWith("scene."));
  assert.deepEqual(hScenes.map((e: { id: string }) => e.id), ["scene.D3"]);
});
