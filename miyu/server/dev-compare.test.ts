// 실행: npm test — 개발용 AI 비교 결과 읽기(server/dev-compare.ts)가 경로 조작을 막는지 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readRunReport } from "./dev-compare.ts";

test("비교 결과 읽기: 폴더 · 파일 이름 형식이 아니면 파일을 읽지 않는다", async () => {
  for (const [run, item] of [
    ["../..", "P01-X"],
    ["stage-1-20261013", "../../package"],
    ["stage-1-20261013", "P01-Z"],
    ["stage-1-20261013", "P01-X.json"],
    ["a/b", "P01-X"],
    ["", "P01-X"],
  ] as const) assert.equal(await readRunReport(run, item), null, `${run} ${item}`);
});

test("비교 결과 읽기: 형식이 맞아도 없는 결과는 null이다 (오류를 던지지 않는다)", async () => {
  assert.equal(await readRunReport("stage-1-없는-실행", "P01-X"), null);
  assert.equal(await readRunReport("stage-9-20990101", "P01-X"), null);
});
