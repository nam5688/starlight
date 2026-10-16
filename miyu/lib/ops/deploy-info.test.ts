// 실행: npm test — 배포 정보 읽기와 관리자 점검 문구
import assert from "node:assert/strict";
import { test } from "node:test";
import { CRON_STALE_HOURS, DEPLOY_WHERE_LABEL, deployInfoFrom, deployNotes } from "./deploy-info.ts";

const SHA = "8128fababa678d7a5545c402b281148dc605b7e3";
const NOW = new Date("2026-10-16T12:00:00Z");

test("Vercel 시스템 환경변수에서 환경 · 브랜치 · 커밋 · GitHub 주소를 읽는다", () => {
  const info = deployInfoFrom({ VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "claude/miyu-claude-code-setup-klw8ms", VERCEL_GIT_COMMIT_SHA: SHA, VERCEL_GIT_REPO_OWNER: "nam5688", VERCEL_GIT_REPO_SLUG: "starlight" });
  assert.deepEqual(info, { where: "vercel-production", branch: "claude/miyu-claude-code-setup-klw8ms", commit: SHA, commitShort: "8128fab", commitUrl: `https://github.com/nam5688/starlight/commit/${SHA}` });
  assert.equal(deployInfoFrom({ VERCEL: "1", VERCEL_ENV: "preview" }).where, "vercel-preview");
  assert.equal(deployInfoFrom({ VERCEL: "1", VERCEL_ENV: "development" }).where, "vercel-development");
  assert.equal(deployInfoFrom({}).where, "local");
  assert.ok(Object.keys(DEPLOY_WHERE_LABEL).length === 4);
});

test("모양이 이상한 값은 읽지 않는다(화면에 그대로 싣지 않는다)", () => {
  const info = deployInfoFrom({ VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "a b<script>", VERCEL_GIT_COMMIT_SHA: "zzzz", VERCEL_GIT_REPO_OWNER: "x/y", VERCEL_GIT_REPO_SLUG: "z" });
  assert.deepEqual(info, { where: "vercel-production", branch: null, commit: null, commitShort: null, commitUrl: null });
});

test("점검 문구: 커밋을 읽지 못하면 시스템 환경변수 설정을 안내한다", () => {
  const notes = deployNotes(deployInfoFrom({ VERCEL: "1", VERCEL_ENV: "production" }), null, NOW);
  assert.ok(notes.some((n) => n.level === "warn" && n.text.includes("Enable access to System Environment Variables")));
});

test("점검 문구: main 브랜치 배포는 작업 브랜치가 맞는지 확인하라고 알리고, 작업 브랜치 배포에는 그 경고가 없다", () => {
  const main = deployNotes(deployInfoFrom({ VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_COMMIT_SHA: SHA }), new Date(NOW.getTime() - 3_600_000).toISOString(), NOW);
  assert.ok(main.some((n) => n.text.includes("기본 브랜치")));
  const work = deployNotes(deployInfoFrom({ VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "claude/x", VERCEL_GIT_COMMIT_SHA: SHA }), new Date(NOW.getTime() - 3_600_000).toISOString(), NOW);
  assert.ok(!work.some((n) => n.level === "warn"), JSON.stringify(work));
});

test("점검 문구: Preview는 정기 점검이 돌지 않는다고 알리고, Production은 마지막 실행이 없거나 오래됐으면 알린다", () => {
  const preview = deployNotes(deployInfoFrom({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_SHA: SHA }), null, NOW);
  assert.ok(preview.some((n) => n.text.includes("Production 배포에만")));
  const prod = deployInfoFrom({ VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "w", VERCEL_GIT_COMMIT_SHA: SHA });
  assert.ok(deployNotes(prod, null, NOW).some((n) => n.level === "warn" && n.text.includes("실행 기록이 아직 없습니다")));
  const old = new Date(NOW.getTime() - (CRON_STALE_HOURS + 2) * 3_600_000).toISOString();
  assert.ok(deployNotes(prod, old, NOW).some((n) => n.level === "warn" && n.text.includes("시간이 지났습니다")));
  const fresh = new Date(NOW.getTime() - 20 * 3_600_000).toISOString(); // 하루에 한 번 실행하는 Hobby에서도 정상
  assert.deepEqual(deployNotes(prod, fresh, NOW).map((n) => n.level), ["ok"]);
});

test("내 컴퓨터에서는 경고 없이 안내만 한다", () => {
  assert.deepEqual(deployNotes(deployInfoFrom({}), null, NOW).map((n) => n.level), ["ok"]);
});
