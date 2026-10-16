// 실행: npm test — Vercel 설정(vercel.json)이 이 앱의 정기 점검 주소와 맞고, Hobby 요금제에서도 배포가 실패하지 않는 모양인지 확인한다.
// (Vercel 공식 문서, 2026-10-16: Hobby는 하루 한 번보다 자주 도는 표현이면 배포가 실패한다 · 정기 실행은 Production 배포의 주소를 부른다 · 시간대는 항상 UTC)
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { crons?: { path: string; schedule: string }[] };

test("vercel.json의 정기 실행은 실제 있는 주소(/api/cron/reconcile)를 가리킨다", () => {
  assert.ok(config.crons && config.crons.length >= 1);
  for (const c of config.crons ?? []) {
    assert.ok(c.path.startsWith("/api/"), c.path);
    const file = new URL(`../app${c.path}/route.ts`, import.meta.url);
    assert.ok(existsSync(file), `${c.path}에 해당하는 route.ts가 없다`);
  }
  assert.ok(config.crons?.some((c) => c.path === "/api/cron/reconcile"));
});

test("정기 실행 시각은 하루 한 번(분 · 시가 숫자, 나머지는 *)이라 Hobby에서도 배포가 실패하지 않는다 — 더 자주 돌리려면 Pro로 바꾸고 이 시험을 고친다", () => {
  for (const c of config.crons ?? []) {
    const [minute, hour, dom, month, dow] = c.schedule.split(/\s+/);
    assert.equal(c.schedule.split(/\s+/).length, 5, c.schedule);
    assert.match(minute, /^\d{1,2}$/, `분은 숫자 하나: ${c.schedule}`);
    assert.match(hour, /^\d{1,2}$/, `시는 숫자 하나: ${c.schedule}`);
    assert.deepEqual([dom, month, dow], ["*", "*", "*"], `날 · 달 · 요일은 *: ${c.schedule}`);
  }
});
