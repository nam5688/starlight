// 실행: npm test — 상황형 28문항(situational-v2)의 원본 보존을 확인한다(docs/assessment-situational-v2-provenance.md).
//  · 운영자가 보낸 "장면 / 고른 선택지" 28줄(문서 3절)이 저장소 초안의 장면 · 선택지와 글자까지 같다 — 초안의 선택지 112개 중 하나라도 바뀌면 이 시험이 깨진다.
//  · 운영자가 고른 28개는 각 장면 선택지 4개 중 정확히 하나다.
//  · 선택지에 점수 · 가중치 · 유형 · 방향 필드가 없다(채점은 원본에 없었고 만들지 않았다) · 어디에도 연결되지 않았고, 고른 답이 검사 응답 · 기본 답으로 쓰이지 않는다.
// 비용 0. 문항의 좋고 나쁨 · 신뢰도 · 타당도를 확인하는 시험이 아니다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { SITUATIONAL_V2_ITEMS } from "./situational-v2-draft.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const doc = readFileSync(join(root, "docs", "assessment-situational-v2-provenance.md"), "utf8");
const block = doc.split("<!-- operator-picks:begin -->")[1]?.split("<!-- operator-picks:end -->")[0] ?? "";
const picks = block
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const m = /^(\d+)\.\s*(.*?)\s+\/\s+(.*)$/.exec(l);
    assert.ok(m, `운영자 글 줄을 읽지 못했다: ${l}`);
    return { n: Number(m[1]), scene: m[2].trim(), pick: m[3].trim() };
  });
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

test("운영자가 보낸 28줄이 문서에 그대로 있고 번호가 1~28이다", () => {
  assert.equal(picks.length, 28);
  assert.deepEqual(picks.map((p) => p.n), Array.from({ length: 28 }, (_, i) => i + 1));
});

test("장면 문장 28개가 저장소 초안과 같고, 고른 28개는 각 장면 선택지 4개 중 정확히 하나다", () => {
  picks.forEach((p, i) => {
    const item = SITUATIONAL_V2_ITEMS[i];
    assert.equal(norm(p.scene), norm(item.scene), `${i + 1}번 장면 문장이 다르다`);
    const hits = item.options.filter((o) => norm(o) === norm(p.pick));
    assert.equal(hits.length, 1, `${i + 1}번: 고른 답이 선택지 4개 중 정확히 하나가 아니다 — ${p.pick}`);
  });
});

test("초안 원문 지문 고정: 장면 28개 + 선택지 112개의 글자가 2026-10-20에 채팅 기록 원문(2026-10-17 11:01:25Z)과 대조했을 때와 같다", () => {
  // 채팅 기록의 28장면 × 4선택지를 이 초안과 글자 단위로 한 번 대조해 112개가 모두 같음을 확인했다(문서 1절). 그 뒤로 문장이 하나라도 바뀌면 이 지문이 달라진다.
  const all = SITUATIONAL_V2_ITEMS.flatMap((i) => [i.scene, ...i.options]).join("\n");
  const total = [...all].length;
  assert.equal(SITUATIONAL_V2_ITEMS.flatMap((i) => i.options).length, 112);
  let h = 0;
  for (const ch of all) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  assert.equal(total, FINGERPRINT.chars, "글자 수가 달라졌다 — 원문이 바뀌었는지 확인");
  assert.equal(h, FINGERPRINT.hash, "문장 지문이 달라졌다 — 원문이 바뀌었는지 확인");
});

test("채점 원본이 없다는 사실이 원본 데이터에 그대로다: 점수 · 가중치 · 유형 · 방향 필드가 없다(읽는 규칙은 이 데이터 파일이 아니라 28문항 읽기 모듈 lib/assessment/situational/reading.ts에 따로 있다)", () => {
  for (const it of SITUATIONAL_V2_ITEMS) assert.deepEqual(Object.keys(it).sort(), ["id", "options", "part", "scene"], it.id);
  const text = JSON.stringify(SITUATIONAL_V2_ITEMS);
  for (const word of ["score", "weight", "dimension", "direction", "점수", "가중치", "불안형", "회피형"]) assert.ok(!text.includes(word), `데이터에 ${word}`);
});

test("운영자가 고른 28개는 예시 입력일 뿐 어디서도 기본 답으로 쓰이지 않고, 원문 데이터를 불러오는 곳은 28문항 읽기 모듈 · 질문 화면 · 문서 생성기뿐이며 예전 22문항 검사 모듈은 28문항을 모른다", () => {
  const importers: string[] = [];
  const pickUses: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === "pilot-data" || name === "docs") continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !name.startsWith("situational-v2-") && !/\.test\.ts$/.test(name)) {
        const text = readFileSync(path, "utf8");
        if (/situational-v2-draft/.test(text)) importers.push(path.slice(root.length + 1));
        if (/operator-picks|OPERATOR_PICKS/.test(text)) pickUses.push(path.slice(root.length + 1));
      }
    }
  };
  for (const d of ["app", "components", "server", "lib", "scripts"]) walk(join(root, d));
  assert.deepEqual(importers.sort(), ["components/analyze/analyze-flow.tsx", "components/analyze/scene-step.tsx", "lib/assessment/situational/reading.ts", "lib/assessment/situational/render.ts"]);
  assert.deepEqual(pickUses, [], "운영자가 고른 28개 응답은 예시 입력이라 코드에서 읽지 않는다");
  for (const f of ["mbti.ts", "temperament.ts", "relationship.ts", "index.ts"]) assert.ok(!/situational/.test(readFileSync(join(root, "lib", "assessment", "modules", f), "utf8")), f);
});

const FINGERPRINT = { chars: 2955, hash: 4243384941 };
