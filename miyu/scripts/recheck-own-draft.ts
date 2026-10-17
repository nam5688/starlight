// 운영자 본인 입력 실제 AI 시험에서 받은 글을 **AI를 다시 부르지 않고** 같은 검사로 다시 확인한다(호출 0회 · 비용 0원 · 키 필요 없음).
// 쓰는 때: 실행 결과가 "형식 검사 불통과"일 때, 또는 검사 기준(BLOCK / WARN)을 바꾼 뒤 같은 글을 새 기준으로 다시 볼 때.
//
// 사용 (miyu 폴더, PowerShell):
//   node scripts/recheck-own-draft.ts <결과 폴더 경로> --birth-time-unknown
//   · 결과 폴더의 attempts/round1.txt(AI 원문)와 input.json(그때의 입력)을 읽는다. 원문 파일은 고치지 않는다.
//   · --birth-time-unknown: 그 실행을 같은 옵션으로 했다면 똑같이 적는다(근거 목록이 같아야 같은 검사가 된다).
//   · --round N: 몇 번째 시도의 글을 볼지(기본 마지막 시도).
// 만드는 파일(결과 폴더 안): recheck.md(이 화면과 같은 검사 결과 + 읽기 전 지표) · readable-rechecked.md(읽는 순서로 풀어 쓴 글, 내용은 그대로).
//
// 검사 결과는 두 가지다(운영자 정책 2026-10-17): BLOCK = 저장하지 않고 고쳐 쓰게 하는 오류(계산 · 근거 인용 · 없는 시주 확정 풀이 · 사건 단정 · 장 누락 · 형식 오류),
// WARN = 읽기 쉬운 정도의 알림(설명 없는 용어 · 용어 개수 · 문단 문장 수) — 저장을 막지 않고 자동 재작성도 하지 않으며 글은 그대로 둔다.
// 이 검사는 글을 받은 뒤에 한 것이다 — BLOCK이 없어도 "유료 판매 합격"이 아니고 생성기가 저장한 리포트도 아니다. 사주 내용이 모두 맞는다는 뜻도 아니다(사람이 읽어야 한다).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describeOwnInput, ownReportInput, parseOwnCapture, reviewOwnDraft } from "../lib/report/ai/own-run.ts";
import { closeMissingBrackets, extractJsonLoose } from "../lib/report/ai/generator.ts";
import { ISSUE_CLASS_LABEL, groupReadingIssues, type IssueClass } from "../lib/report/reading/issue-class.ts";
import { renderStory7DraftMarkdown } from "../lib/report/reading/render-draft.ts";
import { HOUR_TOPIC } from "../lib/report/reading/hour-scope.ts";
import { STORY7_SECTIONS } from "../lib/report/reading/story7-plan.ts";
import { normalizeStory7Draft, story7Paragraphs, validateStory7Draft, visibleStory7Texts } from "../lib/report/reading/story7-validate.ts";
import type { Story7DraftV1 } from "../lib/report/reading/types.ts";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dir = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--round");
const birthTimeUnknown = args.includes("--birth-time-unknown");

function stop(message: string): never {
  console.error(`\n중단: ${message}\nAI를 호출하지 않았습니다(이 스크립트는 호출하지 않습니다).`);
  process.exit(1);
}
if (!dir) stop("결과 폴더 경로가 필요합니다(예: pilot-data\\ai-compare\\story7-own-20261017-171215).");

const attemptsDir = join(dir, "attempts");
if (!existsSync(attemptsDir)) stop(`${attemptsDir} 폴더가 없습니다. 결과 폴더 경로를 확인해 주세요.`);
const rounds = readdirSync(attemptsDir).filter((f) => /^round\d+\.txt$/.test(f)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
if (rounds.length === 0) stop("attempts 폴더에 roundN.txt 원문이 없습니다.");
const roundFile = arg("--round") ? `round${arg("--round")}.txt` : rounds[rounds.length - 1];
if (!rounds.includes(roundFile)) stop(`${roundFile} 원문이 없습니다(있는 것: ${rounds.join(", ")}).`);
const text = readFileSync(join(attemptsDir, roundFile), "utf8");

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(join(dir, "input.json"), "utf8"));
} catch {
  stop(`${join(dir, "input.json")}을 읽지 못했습니다(그 실행의 입력 사본입니다).`);
}
const capture0 = parseOwnCapture(raw);
if (!capture0) stop("input.json의 모양이 올바르지 않습니다.");
const capture = birthTimeUnknown ? { ...capture0, info: { ...capture0.info, birthTimeUnknown: true, birthTime: "" } } : capture0;

// 그 실행의 기준 날짜(폴더 이름의 시각) — 없으면 지금
const stamp = dir.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})[\\/]?$/);
const now = stamp ? new Date(`${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`) : new Date();
const built = await ownReportInput(capture, now);
if (!built.ok) stop(built.message);
const described = describeOwnInput({ input: built.input, capture, now, variant: "story-7" });

const out: string[] = [];
const log = (s = "") => {
  out.push(s);
  console.log(s);
};
log("# 저장된 글 다시 검사 (AI 호출 0회 · 비용 0원)");
log(`- 결과 폴더: ${dir} · 원문: ${roundFile} (${text.length.toLocaleString("ko-KR")}자) · 근거 ${described.evidence.length}개 · 출생 시각 ${capture.info.birthTimeUnknown ? "미상(시주 없음)" : "있음"}`);

// ───── 1. JSON 출력 안정성(별도 검사) ─────
log("\n## 1. JSON 출력 안정성 (별도 검사 — 글 내용 검사와 따로 본다)");
const start = text.indexOf("{");
const end = text.lastIndexOf("}");
let strictError: string | null = null;
if (start < 0 || end <= start) strictError = "JSON 객체를 찾지 못했습니다.";
else {
  try {
    JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    strictError = e instanceof Error ? e.message : "알 수 없는 오류";
  }
}
log(strictError ? `- 원문을 그대로 JSON으로 읽을 수 있나요? **아니요** — ${strictError}` : "- 원문을 그대로 JSON으로 읽을 수 있나요? **예**(보충 · 위치 보정 없이 읽힘)");

let draft: unknown;
let closedBrackets = 0;
try {
  const loose = extractJsonLoose(text);
  draft = loose.value;
  closedBrackets = loose.closedBrackets;
} catch (e) {
  log(`- 닫는 괄호만 보충해서는 **읽을 수 없는 글**입니다(${e instanceof Error ? e.message : "알 수 없음"}) — 끊긴 문자열 · 쉼표 · 짝이 맞지 않는 괄호 등 실제 내용이 빠진 경우입니다. 글 전체를 다시 받아야 합니다(새 호출은 운영자가 승인한 범위 안에서만 합니다).`);
  writeFileSync(join(dir, "recheck.md"), out.join("\n") + "\n");
  process.exit(0);
}
if (strictError && closedBrackets > 0) {
  const addedTail = closeMissingBrackets(text.slice(start).replace(/\s*```\s*$/, "").trimEnd())?.text.slice(text.slice(start).replace(/\s*```\s*$/, "").trimEnd().length) ?? "";
  log(`- 원인 분류: **복구 가능한 단순 형식 오류** — 끝의 닫는 괄호 ${closedBrackets}개가 빠졌습니다. 보충한 글자는 \`${addedTail}\` 뿐이고 원문 앞부분은 한 글자도 바꾸지 않았습니다. 장 · 문단 · 근거가 빠진 것이 아니라 아래 3번 점검으로 확인합니다.`);
} else if (strictError) {
  log("- 원인 분류: 괄호 보충으로 설명되지 않는 오류입니다.");
}
const stringsOf = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(stringsOf) : v && typeof v === "object" ? Object.values(v).flatMap(stringsOf) : []);
const before = stringsOf(draft).sort();
const nestedActions = Boolean(draft && typeof draft === "object" && !Array.isArray((draft as { actions?: unknown }).actions) && Array.isArray((draft as { sections?: { no?: unknown; actions?: unknown }[] }).sections) && (draft as { sections: { no?: unknown; actions?: unknown }[] }).sections.some((s) => Number(s?.no) === 7 && Array.isArray(s?.actions)));
draft = normalizeStory7Draft(draft);
const after = stringsOf(draft).sort();
log(nestedActions ? "- 조언 행동(actions) 위치: 지시문은 sections 바깥이라고 적었는데 **7번 장 안**에 들어 있었습니다 → **위치만** 바깥으로 옮겼습니다(안전하게 정규화 가능)." : "- 조언 행동(actions) 위치: 정상(sections 바깥)");
log(`- 글자 보존 확인: 복구 · 위치 보정 전후의 모든 문장이 ${before.length === after.length && before.every((x, i) => x === after[i]) ? "**같습니다**(문장 수 " + after.length + "개 — 명리 내용 · 문장을 바꾸지 않았습니다)" : "**다릅니다** — 이 스크립트의 오류입니다. 결과를 믿지 말고 알려 주세요"}.`);

// ───── 2. 검사 — BLOCK / WARN ─────
const v = validateStory7Draft(draft, described.evidence, { hasContext: false });
log("\n## 2. 형식 · 근거 · 문체 검사 — BLOCK(저장하지 않음) / WARN(저장을 막지 않는 경고)");
if (v.ok) log("- **BLOCK 없음** — 계산 · 근거 인용 · 시주 확정 풀이 · 사건 단정 · 장 구성 검사를 통과했습니다.");
else {
  const g = groupReadingIssues(v.errors);
  log(`- **BLOCK ${v.errors.length}건** — 저장하지 않고 고쳐 쓰게 하는 오류입니다:`);
  for (const k of Object.keys(g) as IssueClass[]) {
    if (g[k].length === 0) continue;
    log(`  - ${ISSUE_CLASS_LABEL[k]}: ${g[k].length}건`);
    for (const e of g[k]) log(`    - ${e}`);
  }
}
const kindOf = (w: string) => (/설명 없는 사주 용어/.test(w) ? "설명 없는 용어" : /문장 \(/.test(w) ? "문단 문장 수" : "용어 개수 · 나열");
const byKind = new Map<string, string[]>();
for (const w of v.warnings) byKind.set(kindOf(w), [...(byKind.get(kindOf(w)) ?? []), w]);
if (v.warnings.length === 0) log("- WARN 없음");
else {
  log(`- **WARN ${v.warnings.length}건** — 읽기 쉬운 정도의 알림입니다. 저장을 막지 않고 **자동 재작성도 하지 않으며** 글은 그대로 둡니다. 용어가 풀이 흐름 안에서 이해되는지는 읽는 사람이 판단하세요.`);
  for (const [kind, list] of byKind) {
    log(`  - ${kind}: ${list.length}건`);
    for (const w of list) log(`    - ${w}`);
  }
}
log("- ※ 이 결과는 **유료 판매 합격 판정이 아닙니다**. BLOCK이 없어도 사주 내용이 모두 맞다는 뜻이 아니며, 자동 검사가 못 잡는 오류는 글을 읽어야 압니다.");

// ───── 3. 이전 보고와 새 기준의 대응 · 검사 오류 해소 ─────
const oldHourTopic = /자녀|자식|말년|노년|노후|시주(?:에|의|로|와|에서)/;
const resolvedByFix = visibleStory7Texts(draft as Story7DraftV1).filter((p) => oldHourTopic.test(p.text) && !HOUR_TOPIC.test(p.text)).length;
log("\n## 3. 이전 기준(모두 불합격)과 새 기준의 대응");
log("| 구분 | 건수 |");
log("| --- | --- |");
log(`| BLOCK 유지(계산 · 근거 · 시주 확정 풀이 · 사건 단정 · 구성) | ${v.ok ? 0 : v.errors.length} |`);
log(`| WARN으로 낮춤(설명 없는 용어 · 용어 개수 · 문단 문장 수) | ${v.warnings.length} |`);
log(`| 검사 오류로 해소("시주에 있을 수 있어요" 같은 범위 안내를 시주 풀이로 잘못 막던 것) | ${resolvedByFix} |`);
log(`| 이전 방식으로 센 불합격 합계 | ${(v.ok ? 0 : v.errors.length) + v.warnings.length + resolvedByFix} |`);
log("- 이전 보고의 건수는 문단 나눔 보정(4문장을 넘은 문단을 문장은 그대로 두고 둘로 나눔)을 거친 값입니다. 지금은 **원문 보존**을 위해 나누지 않으므로 '문단 문장 수' 경고가 그만큼 늘어 합계가 1~2건 다를 수 있습니다.");

// ───── 4. 읽기 안내 ─────
const d = draft as Story7DraftV1;
const evById = new Map(described.evidence.map((e) => [e.id, e]));
log("\n## 4. 읽기 안내 — 자동 검사가 못 잡는 것은 글을 읽어야 압니다");
log("| 장 | 문단 | 글자 | 연결한 사주 근거 | 연결한 응답 · 입력 근거 |");
log("| --- | --- | --- | --- | --- |");
const cited = new Set<string>();
for (const plan of STORY7_SECTIONS) {
  const s = d.sections?.find((x) => Number(x?.no) === plan.no);
  if (!s) {
    log(`| ${plan.no} ${plan.title} | (없음) | | | |`);
    continue;
  }
  const ps = story7Paragraphs(s);
  const ids = Array.isArray(s.evidence) ? s.evidence : [];
  ids.forEach((id) => cited.add(id));
  const of = (src: "saju" | "survey" | "self") => ids.filter((id) => evById.get(id)?.source === src);
  log(`| ${plan.no} ${plan.title} | ${ps.length} | ${ps.join("").length} | ${of("saju").length}개 | ${[...of("survey"), ...of("self")].join(" · ") || "-"} |`);
}
(d.actions ?? []).forEach((a) => (a.evidence ?? []).forEach((id) => cited.add(id)));
const unused = described.evidence.filter((e) => !e.uncertain && !cited.has(e.id));
const group = (id: string) => (id.startsWith("survey.") ? "응답 경향" : id.startsWith("self.") ? "입력 정보" : id.replace(/^saju\.(daeun|seun)\..*/, "saju.$1").replace(/^(saju\.[a-z-]+)(\..*)?$/, "$1"));
const unusedGroups = new Map<string, number>();
for (const e of unused) unusedGroups.set(group(e.id), (unusedGroups.get(group(e.id)) ?? 0) + 1);
log(`\n- 근거 ${described.evidence.filter((e) => !e.uncertain).length}개 중 글에 연결하지 않은 것 ${unused.length}개(묶음별: ${[...unusedGroups].map(([k, n]) => `${k} ${n}`).join(" · ") || "없음"}) — 연결하지 않은 근거가 글에 꼭 필요했는지는 읽으면서 판단하세요.`);
log("- 읽을 때 볼 것(단어 반복 횟수로 판단하지 않습니다):");
log("  1. 명리 풀이의 깊이 — 1 · 2번: 일간 · 오행 · 십성 · 월령 · 통근이 \"그래서 이런 사람\"이라는 결론으로 이어지는가. 용어는 풀이 속에서 결론을 이해할 수 있으면 충분합니다.");
log("  2. 새로 알려 주는 정보 — 장마다 앞 장에 없던 사주 정보가 있는가(1 일간 · 오행 · 십성 / 2 매력 · 쓴소리 / 3 연애운 · 잘 맞는 상대 / 4 인복 · 육친 / 5 직업 · 재물 / 6 대운 · 세운 · 개운 / 7 조언).");
log("  3. 연애 · 일 · 재물 — 3번 · 5번(일 / 재물): 근거(배우자 자리 · 인연의 경향 · 일의 계열 · 재물)를 풀어 구체적인 장면 · 방향으로 이어지는가. 재물은 돈 이야기가 실제로 있는가.");
log("  4. 전통 개운법 — 6번 마지막 문단: 방향 · 색 · 숫자 · 장소가 근거(saju.fortify)의 기운과 같은가(코드가 BLOCK으로 확인), 효과를 보장하는 말이 없는가, 읽는 사람이 해 볼 만한가.");
log("  5. 성격 · 기질 · 애착 — 위 표의 응답 근거가 연결된 장에서 사주 풀이를 구체화하는가(응답을 그대로 읽어 주지 않는가), 사주 모습과 응답이 다르면 상황별 차이로 설명하는가.");
log("  6. 사주 사실 — 글에 나온 간지(대운 · 세운) · 십성 · 합 · 충 · 형이 이 사람의 근거 문장과 맞는지(근거 문장은 pilot-data\\own-input\\input-check.md 5번).");

let metrics: string;
try {
  metrics = reviewOwnDraft(draft, described.evidence);
} catch (e) {
  metrics = `# 읽기 전 보조 지표\n\n- 만들지 못했습니다(${e instanceof Error ? e.message : "알 수 없는 오류"}). 위 검사 결과와 원문을 보세요.\n`;
}
writeFileSync(join(dir, "recheck.md"), out.join("\n") + "\n\n" + metrics);
try {
  writeFileSync(join(dir, "readable-rechecked.md"), `> 이 글은 AI가 쓴 원문(${roundFile})에서 닫는 괄호${closedBrackets > 0 ? ` ${closedBrackets}개` : ""}를 보충하고 조언 행동의 위치만 바로잡아 읽는 순서로 풀어 쓴 것입니다. 문장은 한 글자도 바꾸지 않았고, 생성기가 저장한 리포트가 아닙니다(유료 판매 합격도 아닙니다).\n\n${renderStory7DraftMarkdown(d)}`);
} catch (e) {
  console.error(`경고: 읽는 순서로 풀어 쓴 글을 만들지 못했습니다(${e instanceof Error ? e.message : "알 수 없는 오류"}). 원문은 그대로입니다.`);
}
console.log(`\n저장한 파일(결과 폴더 안): readable-rechecked.md(읽는 순서로 풀어 쓴 글 — 먼저 읽으세요) · recheck.md(위 검사 결과 + 읽기 전 지표)`);
console.log("읽는 방법(PowerShell): notepad <결과 폴더>\\readable-rechecked.md   (또는 npm.cmd run dev 를 켠 뒤 /dev/live 에서 원문 · 입력 확인 · 지표)");
console.log("AI는 호출하지 않았고 비용은 0원입니다.");
