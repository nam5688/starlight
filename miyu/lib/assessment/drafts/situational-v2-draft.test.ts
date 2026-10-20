// 실행: npm test — 28문항 상황형 후보(situational-v2-draft)의 구조와 "아무 곳에도 연결하지 않았다"는 것을 확인한다. 질문의 좋고 나쁨 · 신뢰도 · 타당도를 확인하는 시험이 아니다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { SITUATIONAL_V2_ITEMS, SITUATIONAL_V2_PARTS, SITUATIONAL_V2_VERSION } from "./situational-v2-draft.ts";

test("구조: 28문항 · 네 묶음에 각 7문항 · 선택지 4개씩 · 같은 문항 안에서 선택지가 겹치지 않는다", () => {
  assert.equal(SITUATIONAL_V2_ITEMS.length, 28);
  assert.equal(new Set(SITUATIONAL_V2_ITEMS.map((i) => i.id)).size, 28);
  assert.deepEqual(SITUATIONAL_V2_PARTS.map((p) => SITUATIONAL_V2_ITEMS.filter((i) => i.part === p.id).length), [7, 7, 7, 7]);
  for (const it of SITUATIONAL_V2_ITEMS) {
    assert.equal(it.options.length, 4, it.id);
    assert.equal(new Set(it.options).size, 4, `${it.id}: 선택지가 겹친다`);
    for (const o of it.options) assert.ok(o.trim().length >= 6, `${it.id}: 선택지가 너무 짧다`);
  }
});

test("선택지에는 점수 · 유형 이름 · 방향 표시가 없다 — 읽는 규칙은 문서의 제안일 뿐 데이터에 넣지 않았다", () => {
  const text = JSON.stringify(SITUATIONAL_V2_ITEMS);
  for (const word of ["불안형", "회피형", "안정형", "점수", "score", "weight", "직접 가산"]) assert.ok(!text.includes(word), `데이터에 ${word}`);
  for (const it of SITUATIONAL_V2_ITEMS) assert.deepEqual(Object.keys(it).sort(), ["id", "options", "part", "scene"]);
});

test("연결 지점은 정해져 있다: 이 원문 데이터를 불러오는 곳은 28문항 읽기 모듈 · 질문 화면 · 문서 생성기뿐이고(원문은 그대로, 읽는 규칙은 읽기 모듈이 따로 가진다) 그 밖의 서버 · 저장 · 리포트 · 검사 모듈은 불러오지 않는다", () => {
  const root = join(import.meta.dirname, "..", "..", "..");
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === "pilot-data" || name === "docs") continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !name.startsWith("situational-v2-") && !/\.test\.ts$/.test(name) && readFileSync(path, "utf8").includes("situational-v2-draft")) hits.push(path.slice(root.length + 1));
    }
  };
  for (const d of ["app", "components", "server", "lib", "scripts"]) walk(join(root, d));
  assert.deepEqual(hits.sort(), ["components/analyze/analyze-flow.tsx", "components/analyze/scene-step.tsx", "lib/assessment/situational/reading.ts", "lib/assessment/situational/render.ts"], "원문 데이터를 불러오는 파일이 정해진 곳과 다르다");
  assert.match(SITUATIONAL_V2_VERSION, /draft/);
});
