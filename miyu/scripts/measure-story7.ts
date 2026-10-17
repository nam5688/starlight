// 실행: node scripts/measure-story7.ts [--write] [--inputs <폴더>]
// 7개 대주제 초안과 지금 story-v1(영역 셋)의 근거 배분 · 반복 압력을 가상 인물 10명의 실제 근거 목록으로 센다(AI 호출 없음). --write면 docs/story-7-sections-measure.md를 만든다.
// 6장(글 수준 비교)은 docs/samples/story7-proxy/의 시험용 대리 작성기 글(실제 서비스 AI가 아님)이 있을 때만 붙는다. --inputs <폴더>는 그 글을 쓸 때 건넨 지시문 · 자료를 같은 코드로 다시 만든다(호출 없음).
// 가상 인물의 응답은 문항 번호로 규칙대로 만든 값이며 실제 사람이 아니다 — 근거 개수의 분포를 보는 용도이지 실제 이용자의 분포가 아니다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildEvidence } from "../lib/report/ai/generator.ts";
import { buildPersonas } from "../lib/report/ai/compare-personas.ts";
import { referenceFor } from "../lib/report/ai/compare-plan.ts";
import { checkStory7Format, citationAreas, measureLayout, owners7, piecesOfStory7, piecesOfStoryV1, sajuCoverage, slotsOf7, slotsOfAreas, textRepetition, type Story7Draft, type TextPiece } from "../lib/report/reading/story7-measure.ts";
import { STORY7_SYSTEM_PROMPT, buildStory7UserMessage } from "../lib/report/reading/story7-prompt.ts";
import { STORY7_SECTIONS } from "../lib/report/reading/story7-plan.ts";
import { findMotifSpread } from "../lib/report/reading/story-motif.ts";
import { validateStoryDraft, visibleStoryTexts } from "../lib/report/reading/story-validate.ts";
import type { StoryDraftV1 } from "../lib/report/reading/types.ts";

const root = join(import.meta.dirname, "..");
const ref = referenceFor(new Date("2026-10-17T00:00:00+09:00"));
const personas = buildPersonas(10);

const inputsAt = process.argv.indexOf("--inputs");
if (inputsAt >= 0) {
  const dir = process.argv[inputsAt + 1];
  if (!dir) throw new Error("--inputs 뒤에 폴더를 적어 주세요.");
  for (const id of ["P01", "P03"]) {
    const ev = buildEvidence(personas.find((x) => x.id === id)!.input, ref);
    mkdirSync(join(dir, `${id}-s7`), { recursive: true });
    writeFileSync(join(dir, `${id}-s7`, "instructions.txt"), `# 작성 지시문\n\n${STORY7_SYSTEM_PROMPT}\n\n# 자료\n\n${buildStory7UserMessage(ev, ref.iso)}\n`);
  }
  console.log(`${dir} 에 7개 대주제 지시문 · 자료 2건을 만들었습니다(지금 구조 지시문은 \`lib/report/reading/story-prompt.ts\`의 STORY_SYSTEM_PROMPT + buildStoryUserMessage(evidence, iso, null)).`);
  process.exit(0);
}

const lines: string[] = [];
const push = (s = "") => lines.push(s);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const f1 = (n: number) => n.toFixed(1);

push("# 7개 대주제 vs 지금 story-v1 — 근거 배분 · 반복 압력 측정 (자동 생성)");
push();
push("> `node scripts/measure-story7.ts --write`로 만든다. 가상 인물 10명(실제 사람이 아님, 응답은 문항 번호로 규칙대로 만든 값)의 근거 목록으로 **근거 배분**을 센 것이다. 글이 아니라 배분의 어림이며, 글에서 반복이 실제로 줄었는지는 6장의 글 비교(대리 작성기)와 사람이 읽는 평가가 따로 본다. AI 호출 0회.");
push();

// ── 0. 대주제 표 ──
push("## 0. 7개 대주제 한눈에 (story7-plan.ts에서 만든 표)");
push();
push("| 대주제 | 종류 | 다루는 것 | 이 장만의 질문 | 사주 근거 | 응답 근거(22문항) | 지금 story-v1의 어디서 오나 |");
push("| --- | --- | --- | --- | --- | --- | --- |");
const reSrc = (rs: RegExp[]) => rs.map((r) => r.source.replace(/\\\./g, ".").replace(/^\^/, "").replace(/\$$/, "")).join(" · ") || "—";
for (const s of STORY7_SECTIONS) {
  const resp = s.prefer.source === "^$" ? "—" : s.prefer.source.replace(/^\^survey\\\./, "survey.").replace(/\\\./g, ".");
  push(`| ${s.no} ${s.title} | ${s.kind === "owner" ? "근거 소유" : "앞 장을 엮음"} | ${s.includes.join(" · ")}${s.parts ? ` (소제목 ${s.parts.join(" / ")})` : ""} | ${s.question} | ${reSrc(s.sajuOwns)} | ${resp} | ${s.from.join(" · ")} |`);
}
push();

// ── 1. 응답 근거 배분 ──
push("## 1. 응답 근거를 장에 나눌 때 — 지금 영역 셋 vs 7개 대주제");
push();
push("같은 배정 알고리즘(`personalEvidenceFor`와 같은 결과를 시험이 확인)으로 응답 근거(MBTI 제외)를 소유자 한 곳에 먼저 나누고, 소유한 근거가 최소 요구보다 모자란 장은 맞닿는 주제의 다른 장 근거를 **빌려** 온다. 빌린 근거는 두 장에서 쓰이므로 \"같은 근거를 다시 풀어야 하는 자리\"다.");
push();
push("| 인물 | 응답 근거 수 | 영역 셋: 최소 요구 · 빌림 · 못 채움 | 7개 대주제: 최소 요구 · 빌림 · 못 채움 · 소유 0인 장 | MBTI를 쓸 수 있는 장(영역 / 7개) |");
push("| --- | --- | --- | --- | --- |");
const areaRows = personas.map((p) => measureLayout(buildEvidence(p.input, ref), slotsOfAreas()));
const s7Rows = personas.map((p) => measureLayout(buildEvidence(p.input, ref), slotsOf7()));
personas.forEach((p, i) => {
  const a = areaRows[i];
  const t = s7Rows[i];
  push(`| ${p.id} | ${a.pool} | ${a.need} · ${a.borrowTotal} · ${a.unmetSlots} | ${t.need} · ${t.borrowTotal} · ${t.unmetSlots} · ${t.starvedSlots} | ${a.mbtiEligible} / ${t.mbtiEligible} |`);
});
push();
push(`- 응답 근거 수: 평균 ${f1(avg(areaRows.map((r) => r.pool)))}개(최소 ${Math.min(...areaRows.map((r) => r.pool))} · 최대 ${Math.max(...areaRows.map((r) => r.pool))}) — 뚜렷한 쪽(35 이하 · 65 이상)만 근거가 되므로 사람마다 다르다.`);
push(`- **영역 셋**: 최소 요구 합 ${areaRows[0].need}개, 빌림 평균 ${f1(avg(areaRows.map((r) => r.borrowTotal)))}개, 요구를 못 채우는 인물 ${areaRows.filter((r) => r.unmetSlots > 0).length}명.`);
push(`- **7개 대주제**: 최소 요구 합 ${s7Rows[0].need}개, 빌림 평균 ${f1(avg(s7Rows.map((r) => r.borrowTotal)))}개, 요구를 못 채우는 인물 ${s7Rows.filter((r) => r.unmetSlots > 0).length}명, 소유 근거가 하나도 없는 장 평균 ${f1(avg(s7Rows.map((r) => r.starvedSlots)))}개.`);
push();
push("### 7개 대주제별 — 응답 근거를 소유한 평균 개수(인물 10명) · 하나도 못 가진 인물 수");
push();
push("| 대주제 | 소유 평균 | 소유 0인 인물 | 빌려야 하는 인물 | 최소 요구 |");
push("| --- | --- | --- | --- | --- |");
slotsOf7().forEach((slot, k) => {
  const sec = STORY7_SECTIONS[k];
  if (slot.personalMin === 0) return;
  const owned = s7Rows.map((r) => r.perSlot[k].owned);
  const borrow = s7Rows.filter((r) => r.perSlot[k].borrowed > 0).length;
  push(`| ${sec.no} ${sec.title} | ${f1(avg(owned))} | ${owned.filter((n) => n === 0).length} | ${borrow} | ${slot.personalMin} |`);
});
push();

// ── 2. 사주 근거 ──
push("## 2. 사주 근거를 소유하는 대주제 — 이 사람의 그 장에 자기 근거가 있는가");
push();
push("| 대주제 | 소유 근거 평균 | 하나도 없는 인물 | **사주도 응답도 소유 0인 인물**(그 장을 풀 자기 근거가 아예 없다) | 비고 |");
push("| --- | --- | --- | --- | --- |");
const sajuRows = personas.map((p) => sajuCoverage(buildEvidence(p.input, ref)));
const sajuNote: Record<number, string> = {
  1: "일간 · 오행 · 구조(월령 · 통근 · 강약 후보) — 모든 사람에게 있음",
  3: "배우자 별 · 배우자 자리 + 일지가 낀 합 · 충(엔진이 일지를 낀 합 · 충에만 `relationship` 주제를 붙인다)",
  4: "인성 · 비겁 십성 + 일지를 뺀 합 · 충 — **신살(귀인)은 계산하지 않음, 가족 자리(년주 · 월주) 해석 규칙 없음**",
  5: "식상 · 관성 · 재성 십성 + 조합(재물 근거는 이 가운데 일부)",
  6: "대운 · 세운",
};
for (const s of STORY7_SECTIONS.filter((x) => x.sajuOwns.length > 0)) {
  const counts = sajuRows.map((row) => row.find((r) => r.no === s.no)?.count ?? 0);
  const k = STORY7_SECTIONS.indexOf(s);
  const both = s.personalMin > 0 ? counts.filter((n, i) => n === 0 && s7Rows[i].perSlot[k].owned === 0).length : null;
  push(`| ${s.no} ${s.title} | ${f1(avg(counts))} | ${counts.filter((n) => n === 0).length} | ${both === null ? "—(응답을 소유하지 않는 장)" : both} | ${sajuNote[s.no] ?? ""} |`);
}
push();

// ── 3. 근거 소유자가 처음부터 겹치는 근거 ──
push("## 3. 처음부터 소유자가 둘 이상인 근거(가상 인물 10명의 근거 목록 합)");
push();
const multi = new Map<string, { owners: number[]; n: number }>();
for (const p of personas) {
  for (const e of buildEvidence(p.input, ref)) {
    if (e.uncertain) continue;
    const o = owners7(e);
    if (o.length < 2) continue;
    const k = e.id.replace(/\.(\d{4})(\..*)?$/, ".YYYY");
    const row = multi.get(k) ?? { owners: o, n: 0 };
    row.n++;
    multi.set(k, row);
  }
}
if (multi.size === 0) push("- 없음");
else {
  push("| 근거 모양 | 소유 장 | 나온 횟수 |");
  push("| --- | --- | --- |");
  for (const [k, v] of [...multi].sort((a, b) => b[1].n - a[1].n)) push(`| \`${k}\` | ${v.owners.join(" · ")} | ${v.n} |`);
}
push();
push("사주 근거는 소유자가 한 곳으로 정리됐다(십성은 분포 모양을 1번이, 뜻을 3 · 4 · 5번이 나눠 갖지 않고 구조 모양만 1번이 쓰도록 했다). 응답 근거는 같은 모양이 두세 장의 후보이며(위 표), 배정 알고리즘이 한 곳에 먼저 나눈다.");
push();

// ── 4. 저장된 글에서 지금 반복이 어디에 있었나 ──
push("## 4. 지금 story-v1의 저장된 글에서 근거가 어디에 인용됐나 (실제 AI 글 1편 + 대리 작성기 글 2편)");
push();
const saved: { label: string; path: string }[] = [
  { label: "실제 AI 원문(P01, 2026-10-17, 형식 검사 불통과)", path: "docs/samples/real-ai/story-0.2-P01-story-p01-20261017-020347/failed/P01-X-round2.json" },
  { label: "대리 작성기(P01, 1회 고쳐 쓴 뒤)", path: "docs/samples/story-v1-proxy/prompt-0.2/P01-after-one-rewrite.json" },
  { label: "대리 작성기(서윤 예시 첫 응답)", path: "docs/samples/story-v1-proxy/prompt-0.2/seoyun-first-response.json" },
];
for (const f of saved) {
  const draft = JSON.parse(readFileSync(join(root, f.path), "utf8")) as StoryDraftV1;
  const cites = citationAreas(draft);
  push(`### ${f.label}`);
  push();
  const multiCited = [...cites].filter(([, v]) => new Set(v.areas).size >= 2);
  push(`- 두 영역 이상에 인용된 근거: ${multiCited.length}개 — ${multiCited.map(([id, v]) => `\`${id}\`(${[...new Set(v.areas)].join("·")})`).join(", ") || "없음"}`);
  const spreads = findMotifSpread(visibleStoryTexts(draft));
  push(`- 제목 · 카드와 세 영역 이상에 번진 낱말: ${spreads.map((m) => `‘${m.stem}…’ ${m.total}번(${m.where.join("·")})`).join(", ") || "없음"}`);
  push();
}

// ── 5. 28문항 장면 배분 ──
push("## 5. 상황형 28문항 장면을 7개 대주제에 한 장면씩 나누면 (검토자 분류 · 28문항은 검증 전 초안)");
push();
push("| 대주제 | 앞세우는 장면 | 장면 수 | 구분 최소 3장면 |");
push("| --- | --- | --- | --- |");
for (const s of STORY7_SECTIONS) {
  const n = s.scenes.length;
  push(`| ${s.no} ${s.title} | ${s.scenes.join(" ") || "—(자기 장면 없음)"} | ${n} | ${n === 0 ? "—" : n >= 3 ? "충족" : "**모자람**"} |`);
}
push();
push(`- 28개 장면은 대주제 다섯 곳에 하나씩만 배분된다(합 ${STORY7_SECTIONS.reduce((n, s) => n + s.scenes.length, 0)}). 장면이 없는 장은 ${STORY7_SECTIONS.filter((s) => s.scenes.length === 0).map((s) => s.no).join(" · ")}번이다. **장면 수가 구분을 읽을 수 있다는 뜻은 아니다** — 구분마다 서로 다른 맥락 두 가지(일 · 친구 · 가까운 관계)에서 최소 3장면이 필요하고, 28문항은 사람 시험 전이라 자동으로 품질이 나아진다고 가정하지 않는다.`);
push();

// ── 6. 글 수준 비교 ──
const proxyDir = join(root, "docs", "samples", "story7-proxy");
const cases = ["P01", "P03"].flatMap((id) => (["v1", "s7"] as const).map((tag) => ({ id, tag, path: join(proxyDir, `${id}-${tag}.json`) }))).filter((c) => existsSync(c.path));
if (cases.length > 0) {
  push("## 6. 같은 입력으로 쓴 글 두 구조를 같은 지표로 (시험용 대리 작성기 · 각 1건)");
  push();
  push("> **실제 서비스 AI의 글이 아니다.** 같은 계열 모델(AI 하위 작업자)이 같은 날 같은 입력으로 구조만 달리해 한 번씩 쓴 글이다(고쳐 쓰기 없음, 고민(context) 없음). 지금 구조 글(`*-v1.json`)은 `story-v1-prompt-0.3`, 7개 대주제 글(`*-s7.json`)은 같은 지시문의 규칙 + 7개 대주제 규칙을 더한 비교용 지시문이다. 사람이 쓴 글이 아니고 표본이 인물 2명 × 구조 2개뿐이라 **줄었다는 증거가 아니라 방향을 보는 참고**이며 가려 읽는 사람의 평가를 대신하지 않는다.");
  push();
  push("| 인물 · 구조 | 형식 점검(걸린 수) | 단위 수 | 글자 수 | 인용한 서로 다른 근거 | 두 단위 이상에 인용된 근거 | 12자 이상 같은 토막 | 낱말이 가장 많이 번진 것(블록 수 · 횟수) | 장 쌍 낱말 겹침 평균 · 최대(제목 · 카드 제외) | 제목 · 카드와 본문의 겹침 최대 |");
  push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const c of cases) {
    const raw = JSON.parse(readFileSync(c.path, "utf8"));
    const ev = buildEvidence(personas.find((x) => x.id === c.id)!.input, ref);
    let pieces: TextPiece[];
    let format: string;
    const cites = new Map<string, Set<string>>();
    const cite = (id: string, block: string) => (cites.get(id) ?? cites.set(id, new Set()).get(id)!).add(block);
    if (c.tag === "v1") {
      const v = validateStoryDraft(raw, ev, { hasContext: false });
      format = v.ok ? "통과(0)" : `불통과(${v.errors.length})`;
      pieces = piecesOfStoryV1(raw);
      for (const a of raw.areas) for (const id of a.evidence) cite(id, a.id);
      for (const id of raw.flow.evidence) cite(id, "flow");
    } else {
      const errs = checkStory7Format(raw, ev);
      format = errs.length === 0 ? "통과(0)" : `불통과(${errs.length})`;
      pieces = piecesOfStory7(raw as Story7Draft);
      for (const sec of (raw as Story7Draft).sections) for (const id of sec.evidence) cite(id, `s${sec.no}`);
    }
    const m = textRepetition(pieces);
    const multiCount = [...cites].filter(([, b]) => b.size >= 2).length;
    const stems = m.topStems.slice(0, 3).map((t) => `‘${t.stem}…’ ${t.blocks}블록·${t.total}번`).join(", ");
    push(`| ${c.id} · ${c.tag === "v1" ? "지금 story-v1(영역 3 + 시기)" : "7개 대주제"} | ${format} | ${m.blocks} | ${m.chars.toLocaleString("ko-KR")} | ${cites.size} | ${multiCount} | ${m.repeatedPhrases} | ${stems || "—"} | ${m.pairOverlapMean.toFixed(2)} · ${m.pairOverlapMax.value.toFixed(2)}(${m.pairOverlapMax.a}↔${m.pairOverlapMax.b}) | ${m.headOverlapMax.value.toFixed(2)}(${m.headOverlapMax.block}) |`);
  }
  push();
  push("- 단위 수: story-v1은 제목+카드(head) · 영역 3 · 시기 · 행동(최대 6~7), 7개 대주제는 head + 7장. 낱말 겹침 · 인용 중복은 단위가 많을수록 쌍과 기회가 늘어 수치가 커지기 쉬워 평균과 함께 본다. 형식 점검은 두 구조가 서로 다른 검사(story-v1은 제품 검사, 7개 대주제는 지시문 한도만 본 최소 점검)라 숫자를 맞비교하지 않는다. \"인용한 서로 다른 근거\"는 정보량의 어림이다 — 근거를 많이 인용했다고 새로 알게 되는 것이 많다는 뜻은 아니다.");
  push();
  for (const c of cases.filter((x) => x.tag === "s7")) {
    const d = JSON.parse(readFileSync(c.path, "utf8")) as Story7Draft;
    push(`### ${c.id} 7개 대주제 글의 장별 분량`);
    push();
    push("| 대주제 | 문단 | 글자 | 인용한 근거 |");
    push("| --- | --- | --- | --- |");
    for (const sec of d.sections) {
      const ps = sec.parts ? sec.parts.flatMap((p) => p.paragraphs) : (sec.paragraphs ?? []);
      push(`| ${sec.no} ${STORY7_SECTIONS[sec.no - 1]?.title ?? ""} | ${ps.length} | ${ps.join("").length} | ${sec.evidence.length} |`);
    }
    push();
  }
}

const text = lines.join("\n") + "\n";
if (process.argv.includes("--write")) {
  writeFileSync(join(root, "docs", "story-7-sections-measure.md"), text);
  console.log("docs/story-7-sections-measure.md 를 만들었습니다.");
} else console.log(text);
