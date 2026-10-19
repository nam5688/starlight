import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { TENDENCY_NAMES, TENDENCY_PHRASES, tendencyPhrase } from "../../assessment/dev-rules.ts";
import { PERSONAL_TYPE } from "../../config/product.ts";
import { SAMPLE_TYPE_TITLE } from "../../samples/sample-report.ts";
import { legacyTypeTitle, personalTypeTitle, resolveTypeTitle, type TypeTitle } from "../type-title.ts";
import { renderReadingMarkdown, typeTitleLine } from "./render-text.ts";
import type { IntegratedReadingReport } from "./types.ts";

// 유형 이름(~형) 회귀 시험 — 화면에는 있는데 읽기용 글(readable.md)에서만 이름이 빠져 "유형명이 사라졌다"로 보였다.
// 기준: 이름(~형) → 바로 아래 한 줄 → 핵심 해석 순서가 화면과 읽기용 글에서 같다.
// 2026-10-19: 개인 유형(10개 + 혼합 경향)이 켜져 있는 동안 화면 · 읽기용 글은 그 사람의 사주 + 응답으로 계산한 이름(TypeTitle)만 보이고, 옛 후보 이름 4개(`dev-rules.ts`)는 같은 자리에 보이지 않는다.

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

const NEW_TITLE: TypeTitle = { name: "신중 몰입형", line: "생각이 서면 깊이 파고드는 사람", kind: "type", note: "진단이나 평생 유형이 아니에요." };

test("개인 유형 표시가 켜져 있다(운영자 승인 2026-10-19) — 옛 후보 이름을 따로 넘기지 않으면 어느 화면에도 옛 이름이 보이지 않는다", () => {
  assert.equal(PERSONAL_TYPE.visible, true);
  assert.equal(resolveTypeTitle(undefined, "안정지향형"), null, "스위치가 켜져 있으면 저장된 옛 후보 이름을 읽지 않는다");
  assert.equal(resolveTypeTitle(NEW_TITLE, "안정지향형"), NEW_TITLE, "넘겨 준 새 유형이 우선");
  assert.equal(resolveTypeTitle(null, "안정지향형"), null, "계산할 수 없어 null이면 이름이 없다 — 옛 이름으로 대신 채우지 않는다");
  assert.ok(!renderReadingMarkdown(base("안정지향형")).includes("안정지향형"), "읽기용 글에도 옛 후보 이름이 새어 나오지 않는다");
  assert.ok(!renderReadingMarkdown(base("안정지향형")).includes("대표 경향"));
});

test("읽기용 글: 나의 유형 이름 → 한 줄 → 핵심 해석 순서로 나온다 (새 유형 · 예시 인물 · 옛 후보 4개 모두)", () => {
  const md = renderReadingMarkdown(base("안정지향형"), { typeTitle: NEW_TITLE });
  const at = md.indexOf("**나의 유형** 신중 몰입형 — 생각이 서면 깊이 파고드는 사람");
  assert.ok(at >= 0 && md.indexOf("**핵심 해석**") > at, "새 유형: 이름과 한 줄이 같은 줄, 핵심 해석은 그 아래");
  assert.ok(!md.includes("안정지향형"), "새 유형이 있으면 옛 이름은 한 글자도 없다");
  assert.ok(SAMPLE_TYPE_TITLE, "예시 인물(서윤)도 자기 가상 원국 + 응답으로 계산한 유형이 있다");
  assert.ok(renderReadingMarkdown(base(null), { typeTitle: SAMPLE_TYPE_TITLE }).includes(`**나의 유형** ${SAMPLE_TYPE_TITLE!.name}`));
  // 옛 모양(스위치를 끄고 되돌릴 때)은 예전 그대로 — 이름 → 설명 → 핵심 해석
  for (const [id, name] of Object.entries(TENDENCY_NAMES)) {
    const phrase = TENDENCY_PHRASES[id as keyof typeof TENDENCY_PHRASES];
    const old = renderReadingMarkdown(base(name), { typeTitle: legacyTypeTitle(name) });
    const o = old.indexOf(`**나의 대표 경향** ${name} — ${phrase}`);
    assert.ok(o >= 0 && old.indexOf("**핵심 해석**") > o, `${name}: 옛 모양도 이름과 한 줄이 같은 줄에 있다`);
  }
});

test("읽기용 글: 이름이 없으면 줄이 없고, 설명 문구를 모르는 옛 이름도 이름은 지우지 않는다(스위치를 끄고 되돌릴 때의 모양)", () => {
  assert.equal(typeTitleLine(null), null);
  assert.ok(!renderReadingMarkdown(base(null)).includes("나의 유형"));
  assert.ok(typeTitleLine(legacyTypeTitle("처음 보는형"))!.includes("**나의 대표 경향** 처음 보는형 (응답을 보고"), "설명 문구를 모르는 이름도 이름은 나온다");
  assert.equal(tendencyPhrase("처음 보는형"), null);
  const mixed = personalTypeTitle(null);
  assert.equal(mixed, null, "사주가 계산되지 않은 입력은 이름을 만들지 않는다");
});

test("화면: 이름 표시가 한 줄(설명 문구)의 유무에 달려 있지 않고, 유형이 켜져 있으면 옛 대표 경향 이름 블록은 화면에 없다", () => {
  const src = readFileSync(new URL("../../../components/report/reading-report-view.tsx", import.meta.url), "utf8");
  assert.match(src, /\{title && \(\s*<div className="mt-2\.5">/, "이름 블록은 이름이 있을 때 보인다");
  assert.match(src, /\{title\.line && <p className="mt-2 inline-flex/, "한 줄은 이름 바로 아래에 있다");
  assert.ok(!/tendencyPhrase|report\.base\?\.tendency\.name \?\? /.test(src), "옛 대표 경향 설명 · 이름을 화면에서 직접 읽지 않는다 — 단일 입구(resolveTypeTitle)만 쓴다");
  const free = readFileSync(new URL("../../../components/report/free-preview-body.tsx", import.meta.url), "utf8");
  assert.match(free, /!PERSONAL_TYPE\.visible \?/, "무료 본문의 옛 대표 경향 이름 블록은 개인 유형이 꺼져 있을 때만 보인다");
});

test("원문에서 풀어 쓴 글(readable-rechecked)에도 같은 순서: 이름 → 한 줄 → 핵심 해석(제목)", async () => {
  const { renderStory7DraftMarkdown } = await import("./render-draft.ts");
  const draft = { headline: "넓게 받아들이는 사람", cards: { strength: { keyword: "a", note: "b" }, caution: { keyword: "c", note: "d" } }, sections: [], actions: [] } as never;
  const md = renderStory7DraftMarkdown(draft, { typeTitle: NEW_TITLE });
  const at = md.indexOf("**나의 유형** 신중 몰입형 — 생각이 서면 깊이 파고드는 사람");
  assert.ok(at >= 0 && md.indexOf("# 넓게 받아들이는 사람") > at);
  assert.ok(!renderStory7DraftMarkdown(draft).includes("나의 유형"), "이름을 모르면 줄이 없다");
});

/** 시험이 지어낸 가상 입력 폴더(실제 사람의 입력이 아니다) */
async function fakeCaptureDir(prefix: string, opts: { withInput: boolean }) {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { ASSESSMENT_MODULES } = await import("../../assessment/modules/index.ts");
  const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items).map((it, i) => [it.id, (i % 4) + 1]));
  const info = { nickname: "시험", calendar: "solar", isLeapMonth: false, birthYear: "1990", birthMonth: "5", birthDay: "5", birthTime: "12:00", birthTimeUnknown: false, knownMbti: "", regionProvince: "", regionDistrict: "", gender: "male" };
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(dir, "report.json"), JSON.stringify(base("안정지향형")));
  if (opts.withInput) writeFileSync(join(dir, "input.json"), JSON.stringify({ info, answers, capturedAt: null }));
  return dir;
}

test("새 표시용 내보내기(export-readable-display.ts)는 새 파일 하나만 만들고 AI 원문 · 저장된 리포트 · 기존 읽기용 글을 건드리지 않는다", async () => {
  const { mkdtempSync, writeFileSync, readFileSync: read, readdirSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await fakeCaptureDir("export-readable-", { withInput: true });
  const raw = '{"sections":[{"no":1}]}';
  writeFileSync(join(dir, "readable.md"), "옛 읽기용 글(이름 없음)");
  const rawFile = join(dir, "round1.txt");
  writeFileSync(rawFile, raw);
  const before = Object.fromEntries(readdirSync(dir).map((f) => [f, read(join(dir, f), "utf8")]));
  const script = fileURLToPath(new URL("../../../scripts/export-readable-display.ts", import.meta.url));
  execFileSync(process.execPath, [script, dir], { stdio: "pipe" });
  const after = readdirSync(dir).sort();
  assert.deepEqual(after, [...Object.keys(before), "readable-display.md"].sort(), "새 파일 하나만 늘었다");
  for (const [f, text] of Object.entries(before)) assert.equal(read(join(dir, f), "utf8"), text, `${f}은 그대로다`);
  const written = read(join(dir, "readable-display.md"), "utf8");
  assert.match(written, /\*\*나의 유형\*\* .+형|\*\*나의 유형\*\* 혼합 경향/, "입력 사본(input.json)으로 계산한 나의 유형 줄이 맨 위에 있다");
  assert.ok(!written.includes("안정지향형"), "report.json에 남은 옛 후보 이름은 읽기용 글에 나오지 않는다");
  // report.json이 없으면 아무것도 만들지 않고 멈춘다
  const empty = mkdtempSync(join(tmpdir(), "export-readable-empty-"));
  assert.throws(() => execFileSync(process.execPath, [script, empty], { stdio: "pipe" }));
  assert.deepEqual(readdirSync(empty), []);
});

test("새 표시용 내보내기는 이미 있는 파일을 덮어쓰지 않는다 — 다시 실행해도 먼저 만든 파일이 그대로이고, --out으로 다른 이름은 만들 수 있다", async () => {
  const { writeFileSync, readFileSync: read, readdirSync } = await import("node:fs");
  const { execFileSync, spawnSync } = await import("node:child_process");
  const { join } = await import("node:path");
  const script = fileURLToPath(new URL("../../../scripts/export-readable-display.ts", import.meta.url));
  const dir = await fakeCaptureDir("export-readable-keep-", { withInput: false });
  execFileSync(process.execPath, [script, dir], { stdio: "pipe" });
  const first = read(join(dir, "readable-display.md"), "utf8");
  // 운영자가 이미 읽고 있는 파일처럼 내용을 달리해 둔다 — 다시 실행해도 이 내용이 남아야 한다
  const mine = `${first}\n(운영자가 이미 읽은 파일)`;
  writeFileSync(join(dir, "readable-display.md"), mine);
  const again = spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
  assert.notEqual(again.status, 0, "이미 있으면 실패로 끝난다");
  assert.match(again.stderr, /이미 있어 덮어쓰지 않았습니다/);
  assert.equal(read(join(dir, "readable-display.md"), "utf8"), mine, "기존 파일은 한 글자도 바뀌지 않았다");
  assert.deepEqual(readdirSync(dir).sort(), ["readable-display.md", "report.json"], "다른 파일도 생기지 않았다");
  assert.ok(!first.includes("**나의 유형**") && !first.includes("안정지향형"), "입력 사본이 없으면 유형 줄이 빠지고 옛 이름으로 대신 채우지 않는다");
  assert.match(first, /입력 사본\(input\.json\)이 없어 나의 유형 줄이 없습니다/, "빠진 이유를 글 맨 위에 적는다");
  // 다른 이름은 새로 만들 수 있다
  const other = join(dir, "readable-display-2.md");
  execFileSync(process.execPath, [script, dir, "--out", other], { stdio: "pipe" });
  assert.equal(read(other, "utf8"), first, "새 이름의 파일이 만들어진다");
  assert.equal(read(join(dir, "readable-display.md"), "utf8"), mine, "그때도 기존 파일은 그대로");
  // --out이 이미 있는 파일(원문 · 저장된 리포트 포함)을 가리켜도 거절한다
  const reportBefore = read(join(dir, "report.json"), "utf8");
  const overReport = spawnSync(process.execPath, [script, dir, "--out", join(dir, "report.json")], { encoding: "utf8" });
  assert.notEqual(overReport.status, 0);
  assert.equal(read(join(dir, "report.json"), "utf8"), reportBefore, "저장된 리포트를 덮어쓰지 않는다");
});

test("개인 유형 계산 확인(own-identity.ts)은 읽기 전용이다 — 결과 폴더에 아무것도 만들지 않고, 10개 유형 이름 또는 혼합 경향 중 하나와 옛 후보 이름을 따로 보인다", async () => {
  const { mkdtempSync, writeFileSync, readFileSync: read, readdirSync } = await import("node:fs");
  const { spawnSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { ASSESSMENT_MODULES } = await import("../../assessment/modules/index.ts");
  const { PERSONAL_TYPES, MIXED_TYPE } = await import("../../assessment/personal-type.ts");
  // 시험이 지어낸 가상 입력(실제 사람의 입력이 아니다)
  const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items).map((it, i) => [it.id, (i % 4) + 1]));
  const info = { nickname: "시험", calendar: "solar", isLeapMonth: false, birthYear: "1990", birthMonth: "5", birthDay: "5", birthTime: "12:00", birthTimeUnknown: false, knownMbti: "", regionProvince: "", regionDistrict: "", gender: "male" };
  const dir = mkdtempSync(join(tmpdir(), "own-identity-"));
  writeFileSync(join(dir, "input.json"), JSON.stringify({ info, answers, capturedAt: null }));
  const script = fileURLToPath(new URL("../../../scripts/own-identity.ts", import.meta.url));
  const before = Object.fromEntries(readdirSync(dir).map((f) => [f, read(join(dir, f), "utf8")]));
  const run = spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const names = [...Object.values(PERSONAL_TYPES).map((t) => t.name), MIXED_TYPE.name];
  const result = /④ 결과: (.+?)(?:\s{2}|\n)/.exec(run.stdout)?.[1] ?? "";
  assert.ok(names.includes(result.trim()), `10개 유형 이름 또는 혼합 경향이어야 한다: ${result}`);
  assert.match(run.stdout, /⑤ 옛 후보 이름\(4개 중\): (확인추구형|거리유지형|안정지향형|탐색지향형) — .*화면 · 읽기용 글에는 보이지 않는다/);
  assert.match(run.stdout, /화면과 같은 계산/);
  assert.deepEqual(Object.fromEntries(readdirSync(dir).map((f) => [f, read(join(dir, f), "utf8")])), before, "폴더에 파일을 만들거나 고치지 않는다");
  const missing = spawnSync(process.execPath, [script, join(dir, "없는폴더")], { encoding: "utf8" });
  assert.notEqual(missing.status, 0);
});
