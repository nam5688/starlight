// 실행: npm test — 읽기 구조 리포트의 줄바꿈 규칙(짧은 + 짧은 = 이어서, 긴 문장이 끼면 줄바꿈)을 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleReadingReport } from "../../samples/sample-reading-report.ts";
import { lineGroups, SHORT_SENTENCE_MAX, splitSentences } from "./line-breaks.ts";

const SHORT_A = "이 부분은 짧게 읽힙니다.";
const SHORT_B = "그래서 이어서 읽습니다.";
const LONG_A = "새로운 일 앞에서 위험과 변수를 먼저 살펴보고, 익숙한 방식을 선호하는 편입니다.";
const LONG_B = "충분히 알아본 뒤에 움직이는 모습으로 나타날 수 있습니다.";

test("운영자 예시 1: 긴 문장 + 긴 문장은 줄을 바꾼다", () => {
  assert.deepEqual(lineGroups(`${LONG_A} ${LONG_B}`), [LONG_A, LONG_B]);
});

test("운영자 예시 2: 짧은 문장 + 긴 문장은 줄을 바꾼다", () => {
  const short = "중요하게 여기는 것은 두 가지로 읽힙니다.";
  const long = "내놓는 결과가 충분히 다듬어져 있는지, 가까운 사람과 서로의 마음이 확인되는지입니다.";
  assert.ok(short.length <= SHORT_SENTENCE_MAX && long.length > SHORT_SENTENCE_MAX);
  assert.deepEqual(lineGroups(`${short} ${long}`), [short, long]);
});

test("짧은 문장 + 짧은 문장은 한 줄로 이어 붙인다", () => {
  assert.ok(SHORT_A.length <= SHORT_SENTENCE_MAX && SHORT_B.length <= SHORT_SENTENCE_MAX);
  assert.deepEqual(lineGroups(`${SHORT_A} ${SHORT_B}`), [`${SHORT_A} ${SHORT_B}`]);
});

test("긴 문장 + 짧은 문장도 줄을 바꾼다", () => {
  assert.deepEqual(lineGroups(`${LONG_A} ${SHORT_A}`), [LONG_A, SHORT_A]);
});

test("세 문장은 이웃한 쌍마다 같은 규칙을 적용한다", () => {
  assert.deepEqual(lineGroups(`${SHORT_A} ${SHORT_B} ${LONG_A}`), [`${SHORT_A} ${SHORT_B}`, LONG_A]);
  assert.deepEqual(lineGroups(`${LONG_A} ${SHORT_A} ${SHORT_B}`), [LONG_A, `${SHORT_A} ${SHORT_B}`]);
  assert.deepEqual(lineGroups(`${SHORT_A} ${LONG_A} ${SHORT_B}`), [SHORT_A, LONG_A, SHORT_B]);
});

test("한 문장 · 빈 글 · 점이 들어간 숫자는 그대로 둔다", () => {
  assert.deepEqual(lineGroups(LONG_A), [LONG_A]);
  assert.deepEqual(lineGroups(""), []);
  assert.deepEqual(lineGroups("   "), []);
  const date = "2024.08부터 2034.07까지, 지금은 그 앞부분을 지나고 있습니다.";
  assert.deepEqual(splitSentences(date), [date]);
});

test("글자는 하나도 바뀌지 않는다 — 줄을 합쳐 읽으면 원문과 같다 (저장된 글을 바꾸지 않는다)", () => {
  const all: string[] = [];
  for (const b of sampleReadingReport.blocks) all.push(b.summary, b.example ?? "", ...b.details, b.watch ?? "", b.caveat ?? "");
  all.push(sampleReadingReport.flow.summary, sampleReadingReport.flow.cardText);
  const squash = (s: string) => s.replace(/\s+/g, "");
  for (const t of all.filter(Boolean)) assert.equal(squash(lineGroups(t).join(" ")), squash(t));
});

test("예시 리포트의 첫 문단: 긴 두 문장은 두 줄이 된다", () => {
  const summary = sampleReadingReport.blocks[0].summary;
  const lines = lineGroups(summary);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.length > SHORT_SENTENCE_MAX));
});
