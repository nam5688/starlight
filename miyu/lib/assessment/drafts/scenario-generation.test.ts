// 장면 질문의 실제 생성 경로 시험(scenario-cases.ts의 사례)을 제품 검사로 확인한다.
// docs/samples/scenario-generation/에 저장된 글은 **실제 서비스 AI가 아니라 시험용 대리 작성기(AI 하위 작업자)**가 제품 지시문과 사례의 근거 목록으로 쓴 것이다.
// 이 시험은 제품 검사(형식 · 쉬운 말 · 금지 표현 · 응답 읽어 주기 · 자료 없음 문장 · 반복)를 통과하는지와, 사례 사이의 차이가 근거에서 오는지를 확인한다.
// 글자 겹침 비율에는 기준값을 두지 않는다 — 같은 입력을 독립으로 두 번 쓴 글(R)도 크게 다르기 때문이다(문서의 "바닥" 참고). 글이 좋은지는 확인하지 못한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkReadingDepth } from "../../report/reading/depth.ts";
import { ANSWER_ECHO, NO_DATA_TEXT } from "../../report/reading/plan.ts";
import { findRepeatedPhrases } from "../../report/reading/repeat.ts";
import type { ReadingDraftV1 } from "../../report/reading/types.ts";
import { validateReadingDraft } from "../../report/reading/validate.ts";
import { allText, diffParts, echoedOptionTexts, partTexts, pickByPath, sceneCitations } from "./scenario-generation-compare.ts";
import { CASE_RECORDS, FINDINGS } from "./scenario-generation-notes.ts";
import { SCENARIO_CASES, scenarioCaseEvidence } from "./scenario-cases.ts";
import { SCENES } from "./scenario-v1.ts";

const DIR = new URL("../../../docs/samples/scenario-generation/", import.meta.url);
const load = (key: string): ReadingDraftV1 => JSON.parse(readFileSync(new URL(`${key}.json`, DIR), "utf8")) as ReadingDraftV1;
const KEYS = SCENARIO_CASES.map((c) => c.key);
const drafts = Object.fromEntries(KEYS.map((k) => [k, load(k)])) as Record<(typeof KEYS)[number], ReadingDraftV1>;
const evidenceOf = (key: string) => scenarioCaseEvidence(SCENARIO_CASES.find((c) => c.key === key)!);
const changedParts = (a: ReadingDraftV1, b: ReadingDraftV1) => diffParts(a, b).filter((d) => !d.same).map((d) => d.part);

test("사례마다 저장된 글과 쓴 방식 기록이 있다", () => {
  for (const key of KEYS) {
    assert.ok(CASE_RECORDS[key], `${key}: 쓴 방식 기록이 없다`);
    assert.ok(drafts[key], `${key}: 글이 없다`);
  }
});

test("저장된 글은 모두 제품 검사(형식 · 근거 · 쉬운 말 · 금지 표현)를 통과한다", () => {
  for (const key of KEYS) {
    const r = validateReadingDraft(drafts[key], evidenceOf(key), { hasContext: false });
    assert.ok(r.ok, `${key}: ${r.ok ? "" : r.errors.join(" / ")}`);
  }
});

test("저장된 글에는 고른 선택지를 읽어 주는 말 · 자료 없음 문장 · 정해진 유형 이름 · 선택지 문장이 없다", () => {
  const optionTexts = SCENES.flatMap((s) => s.options.map((o) => o.text));
  for (const key of KEYS) {
    const text = allText(drafts[key]);
    assert.doesNotMatch(text, ANSWER_ECHO, `${key}: 응답을 읽어 주는 말`);
    assert.doesNotMatch(text, NO_DATA_TEXT, `${key}: 자료 없음 문장`);
    assert.doesNotMatch(text, /(?:안정|불안|회피|혼란|몰입|독립)형/, `${key}: 정해진 유형 이름`);
    assert.deepEqual(echoedOptionTexts(text, optionTexts), [], `${key}: 선택지 문장을 그대로 옮겼다`);
  }
});

test("수정한 세 조합이 글에서 지켜졌다: 접는 이유를 \"기준에 못 미쳐서\"로 읽지 않고(C5.5) 담담함의 원인을 \"말할 수 있어서\"로 확정하지 않는다(C4.1)", () => {
  for (const key of KEYS) {
    const text = allText(drafts[key]);
    assert.doesNotMatch(text, /기준에 (?:못 미|미치)/, `${key}: C5.5 — 기준 미달로 읽었다`);
    assert.doesNotMatch(text, /담담[^.。]{0,25}(?:말할 수 있어서|말로 꺼낼 수 있어서|말할 길이 있어서)/, `${key}: C4.1 — 담담함의 원인을 확정했다`);
  }
});

test("반복 표현과 내용 검사: 제품 검사가 잡는 반복이 없고 내용 검사를 통과한다(어림)", () => {
  for (const key of KEYS) {
    const rep = findRepeatedPhrases(drafts[key]);
    assert.equal(rep.length, 0, `${key}: 반복 ${rep.map((x) => x.phrase).join(" | ")}`);
    const depth = checkReadingDepth({ draft: drafts[key] as never });
    assert.ok(depth.pass, `${key}: ${depth.flags.map((f) => `${f.id}:${f.message}`).join(" / ")}`);
  }
});

test("장면 근거를 단 곳: 읽힌 구분의 근거만 달고, 읽을 수 없던 구분(H)의 근거는 쓰지 않는다", () => {
  for (const key of KEYS) {
    const known = new Set(evidenceOf(key).map((e) => e.id));
    for (const id of Object.values(sceneCitations(drafts[key])).flat()) assert.ok(known.has(id), `${key}: 없는 근거 ${id}`);
  }
  const h = new Set(Object.values(sceneCitations(drafts.H)).flat());
  for (const id of ["scene.D1", "scene.D2", "scene.D4", "scene.D5"]) assert.ok(!h.has(id), `H: ${id}`);
  assert.ok(h.has("scene.D3"), "H: 읽힌 구분(D3)의 근거를 풀이에 쓰지 않았다");
  for (const key of ["X", "Y", "W", "R"] as const) {
    const used = new Set(Object.values(sceneCitations(drafts[key])).flat());
    assert.ok(used.size >= 3, `${key}: 장면 근거를 ${used.size}개만 썼다`);
  }
});

test("읽을 수 없던 구분(H): 지시문 0.9로 쓴 글은 연락 장면의 반응을 채워 넣었고(발견 5), 0.10으로 쓴 글은 연락이 늦을 때의 반응을 쓰지 않는다", () => {
  const loveText = (d: ReadingDraftV1) => partTexts(d)["blocks.love"] ?? "";
  const v09 = load("H.v0.9");
  assert.match(loveText(v09), /머릿속이 바빠져요/, "발견 5의 인용이 글에 없다");
  assert.doesNotMatch(loveText(drafts.H), /(?:답장|답|연락)[^.。]{0,8}(?:늦|뜸|없)/, "H(0.10): 연락이 늦을 때의 반응을 썼다");
});

test("일부 응답만 변경(X → Z, S8 하나): 연애 부분만 달라지고 일 · 성향 · 시기 · 실천은 그대로다 — 고쳐 쓰기 규약의 결과", () => {
  const changed = changedParts(drafts.X, drafts.Z);
  assert.deepEqual(changed, ["blocks.love"]);
});

test("첫 반응만 변경(Y → V, S5 하나 · 혼자 정리할 시간은 같음 — C3.4): 의견이 갈린 뒤의 풀이만 달라진다", () => {
  assert.deepEqual(changedParts(drafts.Y, drafts.V), ["blocks.love"]);
  const section = (d: ReadingDraftV1) => d.blocks.find((b) => b.id === "love")!.sections![2]!;
  assert.notEqual(section(drafts.Y).body, section(drafts.V).body);
  assert.notEqual(section(drafts.Y).tryIt, section(drafts.V).tryIt, "해 볼 것까지 달라야 한다");
});

test("같은 사주 + 다른 응답(X → Y): 응답이 달라진 구분을 쓴 부분(연애 · 일 · 성향)의 풀이가 달라진다", () => {
  const changed = changedParts(drafts.X, drafts.Y);
  for (const part of ["blocks.tendency", "blocks.love", "blocks.work-money"]) assert.ok(changed.includes(part), `${part}이 같은 글이다`);
});

test("다른 사주 + 같은 응답(X → W): 같은 장면 근거를 받고 사주 쪽 중심이 달라진다", () => {
  const changed = changedParts(drafts.X, drafts.W);
  assert.ok(changed.includes("blocks.tendency"));
  const sajuIds = (d: ReadingDraftV1) => new Set(d.blocks.flatMap((b) => b.evidence).filter((id) => id.startsWith("saju.")));
  const x = sajuIds(drafts.X);
  const w = sajuIds(drafts.W);
  assert.ok([...x].some((id) => !w.has(id)) && [...w].some((id) => !x.has(id)), "사주 근거가 서로 겹치기만 한다");
});

test("같은 입력을 독립으로 다시 쓴 글(R)은 X와 같은 글이 아니다 — 글자 겹침만으로 \"응답이 바꾼 차이\"를 말할 수 없는 이유", () => {
  const diff = diffParts(drafts.X, drafts.R);
  assert.ok(diff.filter((d) => !d.same).length >= 5, "독립으로 쓴 글이 거의 같다");
});

test("비교 판단(FINDINGS)의 인용이 모두 저장된 글에 실제로 있다", () => {
  for (const f of FINDINGS) {
    for (const q of f.quotes) {
      const d = q.key === "H.v0.9" ? load("H.v0.9") : drafts[q.key as keyof typeof drafts];
      assert.ok(pickByPath(d, q.path), `${f.id} · ${q.key} ${q.path}: 글에 없다`);
    }
  }
});
