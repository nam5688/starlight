import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TENDENCY_NAMES, TENDENCY_PHRASES, tendencyPhrase } from "../../assessment/dev-rules.ts";
import { renderReadingMarkdown } from "./render-text.ts";
import type { IntegratedReadingReport } from "./types.ts";

// 유형 이름(~형) 누락 회귀 시험 — 화면에는 있는데 읽기용 글(readable.md)에서만 이름이 빠져 "유형명이 사라졌다"로 보였다.
// 기준: 이름(~형) → 바로 아래 한 줄 특징 → 핵심 해석 순서가 화면과 읽기용 글에서 같다. 새 유형을 지어내지 않고 기존 4개 후보 이름만 쓴다(`dev-rules.ts`).

const base = (name: string | null) =>
  ({
    kind: "integrated-reading",
    layout: "story7",
    personName: "시험",
    headline: "넓게 받아들이고 책임이 분명할 때 움직이는 사람",
    summary: [],
    blocks: [],
    actions: [],
    flow: { id: "flow", topic: "t", headline: "h", summary: "s", years: [], periods: [], scenarios: [], caveat: "", cardText: "", scenarioNote: "", statistics: "", basis: { computed: [], tradition: [], answers: [], unknown: [] }, evidence: [] },
    timeline: [],
    timelineReference: { year: 2026, month: 10 },
    ...(name ? { base: { tendency: { name } } } : {}),
  }) as unknown as IntegratedReadingReport;

test("읽기용 글: 저장된 리포트의 유형 이름 → 한 줄 특징 → 핵심 해석 순서로 나온다 (기존 4개 후보 이름 모두)", () => {
  for (const [id, name] of Object.entries(TENDENCY_NAMES)) {
    const md = renderReadingMarkdown(base(name));
    const phrase = TENDENCY_PHRASES[id as keyof typeof TENDENCY_PHRASES];
    const at = md.indexOf(`**나의 대표 경향** ${name} — ${phrase}`);
    assert.ok(at >= 0, `${name}: 이름과 한 줄 특징이 같은 줄에 있다`);
    assert.ok(md.indexOf("**핵심 해석**") > at, `${name}: 핵심 해석은 그 아래에 온다`);
  }
});

test("읽기용 글: 화면과 같은 값 — 직접 넘긴 이름이 저장된 값보다 먼저, 이름을 모르는 값이어도 이름은 지우지 않고 설명만 뺀다, 이름이 없으면 줄이 없다", () => {
  assert.ok(renderReadingMarkdown(base("안정지향형"), { tendencyName: "확인추구형" }).includes("**나의 대표 경향** 확인추구형 — "));
  const unknown = renderReadingMarkdown(base("처음 보는형"));
  assert.ok(unknown.includes("**나의 대표 경향** 처음 보는형 (응답을 보고"), "설명 문구를 모르는 이름도 이름은 나온다");
  assert.equal(tendencyPhrase("처음 보는형"), null);
  assert.ok(!renderReadingMarkdown(base(null)).includes("나의 대표 경향"));
});

test("화면: 이름 표시가 한 줄 특징(설명 문구)의 유무에 달려 있지 않다 — 설명을 못 찾아도 이름은 보인다", () => {
  const src = readFileSync(new URL("../../../components/report/reading-report-view.tsx", import.meta.url), "utf8");
  assert.match(src, /\{tendencyTitle && \(\s*<div className="mt-2\.5">/, "이름 블록은 이름이 있을 때 보인다");
  assert.ok(!/\{tendency && tendencyTitle && \(/.test(src), "예전 조건(설명이 있어야 이름도 보임)으로 돌아가지 않았다");
  assert.match(src, /\{tendency && <p className="mt-2 inline-flex/, "한 줄 특징은 이름 바로 아래에 있다");
});

test("원문에서 풀어 쓴 글(readable-rechecked)에도 같은 순서: 이름 → 한 줄 특징 → 핵심 해석(제목)", async () => {
  const { renderStory7DraftMarkdown } = await import("./render-draft.ts");
  const draft = { headline: "넓게 받아들이는 사람", cards: { strength: { keyword: "a", note: "b" }, caution: { keyword: "c", note: "d" } }, sections: [], actions: [] } as never;
  const md = renderStory7DraftMarkdown(draft, { tendencyName: "안정지향형" });
  const at = md.indexOf("**나의 대표 경향** 안정지향형 — 익숙한 방식에서 편안함을 느끼는 편");
  assert.ok(at >= 0 && md.indexOf("# 넓게 받아들이는 사람") > at);
  assert.ok(!renderStory7DraftMarkdown(draft).includes("나의 대표 경향"), "이름을 모르면 줄이 없다");
});

test("새 표시용 내보내기(export-readable-display.ts)는 새 파일 하나만 만들고 AI 원문 · 저장된 리포트 · 기존 읽기용 글을 건드리지 않는다", async () => {
  const { mkdtempSync, writeFileSync, readFileSync: read, readdirSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "export-readable-"));
  const raw = '{"sections":[{"no":1}]}';
  writeFileSync(join(dir, "report.json"), JSON.stringify(base("안정지향형")));
  writeFileSync(join(dir, "readable.md"), "옛 읽기용 글(이름 없음)");
  const rawFile = join(dir, "round1.txt");
  writeFileSync(rawFile, raw);
  const before = Object.fromEntries(readdirSync(dir).map((f) => [f, read(join(dir, f), "utf8")]));
  const script = new URL("../../../scripts/export-readable-display.ts", import.meta.url).pathname;
  execFileSync(process.execPath, [script, dir], { stdio: "pipe" });
  const after = readdirSync(dir).sort();
  assert.deepEqual(after, [...Object.keys(before), "readable-display.md"].sort(), "새 파일 하나만 늘었다");
  for (const [f, text] of Object.entries(before)) assert.equal(read(join(dir, f), "utf8"), text, `${f}은 그대로다`);
  assert.match(read(join(dir, "readable-display.md"), "utf8"), /\*\*나의 대표 경향\*\* 안정지향형 — 익숙한 방식에서 편안함을 느끼는 편/);
  // report.json이 없으면 아무것도 만들지 않고 멈춘다
  const empty = mkdtempSync(join(tmpdir(), "export-readable-empty-"));
  assert.throws(() => execFileSync(process.execPath, [script, empty], { stdio: "pipe" }));
  assert.deepEqual(readdirSync(empty), []);
});
