import assert from "node:assert/strict";
import test from "node:test";
import { previewGuardOf } from "./preview-guard.ts";

test("미리보기 보호: 정식 배포 · 내 PC에서는 아무것도 막지 않는다", () => {
  assert.deepEqual(previewGuardOf({}), { active: false, blocksDatabase: false });
  assert.deepEqual(previewGuardOf({ VERCEL_ENV: "production" }), { active: false, blocksDatabase: false });
  assert.deepEqual(previewGuardOf({ VERCEL_ENV: "development" }), { active: false, blocksDatabase: false });
  // 정식 배포에서 미리보기 예외 값을 적어도 달라지는 것이 없다
  assert.deepEqual(previewGuardOf({ VERCEL_ENV: "production", PREVIEW_ALLOW_DATABASE: "yes" }), { active: false, blocksDatabase: false });
});

test("미리보기 보호: 미리보기 배포는 기본으로 DB를 막는다", () => {
  assert.deepEqual(previewGuardOf({ VERCEL_ENV: "preview" }), { active: true, blocksDatabase: true });
  assert.deepEqual(previewGuardOf({ VERCEL_ENV: " preview " }), { active: true, blocksDatabase: true });
});

test("미리보기 보호: DB는 PREVIEW_ALLOW_DATABASE=yes일 때만 연다 — 비슷한 값은 열지 않는다", () => {
  assert.equal(previewGuardOf({ VERCEL_ENV: "preview", PREVIEW_ALLOW_DATABASE: "yes" }).blocksDatabase, false);
  for (const v of ["", "true", "1", "YES", "y", "no"]) {
    assert.equal(previewGuardOf({ VERCEL_ENV: "preview", PREVIEW_ALLOW_DATABASE: v }).blocksDatabase, true, `"${v}"`);
  }
  // DB를 열어도 미리보기라는 사실은 그대로라 실결제 · 실제 AI 차단은 풀리지 않는다
  assert.equal(previewGuardOf({ VERCEL_ENV: "preview", PREVIEW_ALLOW_DATABASE: "yes" }).active, true);
});
