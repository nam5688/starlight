// 실행: node scripts/compare-voice.ts [--list <P01|P03> <old|new>] [--write]
// 같은 가상 인물(P01 · P03)의 같은 근거로 예전 말투 지시문(story-7-prompt-0.1)과 새 말투 지시문(0.2)이 쓴 글을 **지금의 제품 검사 + 미유 문체 검사**에 넣어 센다(AI 호출 없음).
// 글은 docs/samples/story7-voice/{old,new}/<인물>-s7.json — 시험용 대리 작성기(AI 하위 작업자)가 쓴 첫 글이며 실제 서비스 AI의 글이 아니다. 표본은 인물 2 × 말투 2 × 1건이라 통계가 아니라 방향을 보는 용도다.
// --list는 해당 글의 문장을 줄 번호 없이 풀어 읽게 하고, --write는 결과표를 docs/samples/story7-voice/results.md로 쓴다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildEvidence } from "../lib/report/ai/generator.ts";
import { buildPersonas } from "../lib/report/ai/compare-personas.ts";
import { referenceFor } from "../lib/report/ai/compare-plan.ts";
import { story7VoiceReport, validateStory7Draft, visibleStory7Texts } from "../lib/report/reading/story7-validate.ts";
import { failsOf, repairsOf, reviewsOf } from "../lib/report/style/voice.ts";
import type { Story7DraftV1 } from "../lib/report/reading/types.ts";

const root = join(import.meta.dirname, "..");
const dir = join(root, "docs", "samples", "story7-voice");
const ref = referenceFor(new Date("2026-10-17T00:00:00+09:00"));
const personas = buildPersonas(10);
const IDS = ["P01", "P03"] as const;
const SIDES = ["old", "new"] as const;

const args = process.argv.slice(2);
const listAt = args.indexOf("--list");
const rows: string[] = [];
const push = (s = "") => rows.push(s);

const load = (side: string, id: string): unknown | null => {
  const p = join(dir, side, `${id}-s7.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
};

if (listAt >= 0) {
  const id = args[listAt + 1];
  const side = args[listAt + 2];
  const raw = load(side, id) as Story7DraftV1 | null;
  if (!raw) throw new Error("글이 없어요");
  for (const t of visibleStory7Texts(raw)) console.log(`[${t.where}] ${t.text}`);
  process.exit(0);
}

push("# 예전 말투(0.1) vs 새 말투(0.2) — 같은 근거 · 같은 구조 · 새 검사로 센 값");
push();
push("> `node scripts/compare-voice.ts --write`로 만든다. 글은 시험용 대리 작성기(AI 하위 작업자)가 쓴 첫 글 하나씩이며 실제 서비스 AI의 글이 아니다. 고쳐 쓰기 없음. 인물 2 × 말투 2 × 1건이라 통계가 아니라 방향을 보는 값이다.");
push();
push("| 글 | 제품 검사 | 글자 | 문장 | 합쇼체 | 추상어 합 | 대조 틀 합 | 가장 흔한 마무리 | 같은 시작 3회+ | 이름 호칭 | 실패 | 고쳐 쓰기 | 읽고 판단 |");
push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
const detail: string[] = [];
for (const id of IDS) {
  const persona = personas.find((x) => x.id === id)!;
  const ev = buildEvidence(persona.input, ref);
  for (const side of SIDES) {
    const raw = load(side, id);
    if (!raw) {
      push(`| ${id} ${side} | 글 없음 | | | | | | | | | | | |`);
      continue;
    }
    const draft = raw as Story7DraftV1;
    const v = validateStory7Draft(raw, ev);
    const vr = story7VoiceReport(draft, ev);
    const m = vr.metrics;
    const contrastTotal = Object.values(m.contrast).reduce((a, b) => a + b, 0);
    const openers = m.topOpeners.filter((o) => o.count >= 3);
    push(
      `| ${id} ${side === "old" ? "예전(0.1)" : "새(0.2)"} | ${v.ok ? "통과" : `불통과 ${v.errors.length}건`} | ${m.chars.toLocaleString("ko-KR")} | ${m.sentences} | ${m.formal} | ${m.abstractTotal} | ${contrastTotal} | ${m.topEnding.kind} ${m.topEnding.count}회(${Math.round(m.topEnding.share * 100)}%) | ${openers.length ? openers.map((o) => `"${o.opener}" ${o.count}`).join(", ") : "없음"} | ${m.nameCalls} | ${failsOf(vr).length} | ${repairsOf(vr).length} | ${reviewsOf(vr).length} |`,
    );
    detail.push(`### ${id} ${side === "old" ? "예전(0.1)" : "새(0.2)"}`);
    detail.push();
    detail.push(`- 추상어: ${Object.entries(m.abstractByWord).map(([w, n]) => `${w} ${n}`).join(" · ") || "없음"}`);
    detail.push(`- 대조 틀: ${Object.entries(m.contrast).map(([w, n]) => `${w} ${n}`).join(" · ") || "없음"}`);
    detail.push(`- 호칭 · 완곡어 · 합쇼체: 이름 ${m.nameCalls} · 완곡어(아마/어쩌면 등) ${m.hedgeWords} · 합쇼체 ${m.formal}`);
    if (!v.ok) {
      detail.push("- 제품 검사 이유:");
      for (const e of v.errors.slice(0, 12)) detail.push(`  - ${e.slice(0, 160)}`);
    }
    for (const [label, list] of [["실패", failsOf(vr)], ["고쳐 쓰기", repairsOf(vr)], ["읽고 판단", reviewsOf(vr)]] as const) {
      if (list.length === 0) continue;
      detail.push(`- ${label}:`);
      for (const f of list) {
        detail.push(`  - ${f.message}`);
        for (const e of (f.examples ?? []).slice(0, 2)) detail.push(`    · ${e.slice(0, 160)}`);
      }
    }
    detail.push();
  }
}
push();
push("## 검사별 자세한 결과");
push();
rows.push(...detail);
const out = rows.join("\n") + "\n";
if (args.includes("--write")) {
  writeFileSync(join(dir, "results.md"), out);
  console.log(`${join(dir, "results.md")} 를 썼어요.`);
} else console.log(out);
