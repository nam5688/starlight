// 운영자 본인 입력 실제 AI 시험에서 받은 글을 **AI를 다시 부르지 않고** 같은 검사로 다시 확인한다(호출 0회 · 비용 0원 · 키 필요 없음).
// 쓰는 때: 실행 결과가 "형식 검사 불통과 · JSON 형식이 아님"일 때 — 글이 정말 깨졌는지, 끝의 닫는 괄호만 빠졌는지, 닫은 뒤의 검사 결과가 어떤지 본다.
//
// 사용 (miyu 폴더, PowerShell):
//   node scripts/recheck-own-draft.ts pilot-data\ai-compare\story7-own-20261017-171215 --birth-time-unknown
//   · 결과 폴더의 attempts/round1.txt(AI 원문)와 input.json(그때의 입력)을 읽는다. 원문 파일은 고치지 않는다.
//   · --birth-time-unknown: 그 실행을 같은 옵션으로 했다면 똑같이 적는다(근거 목록이 같아야 같은 검사가 된다).
//   · --round N: 몇 번째 시도의 글을 볼지(기본 마지막 시도).
// 만드는 파일(결과 폴더 안): recheck.md(다시 검사한 결과 · 읽기 전 지표) · readable-rechecked.md(읽는 순서로 풀어 쓴 글, 내용은 그대로).
// 이 검사는 글을 받은 뒤에 한 것이다 — 닫는 괄호를 보충한 글이 검사를 통과해도 "AI가 형식 검사를 통과했다"는 뜻이 아니고, 생성기가 저장한 리포트도 아니다.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describeOwnInput, ownReportInput, parseOwnCapture, reviewOwnDraft } from "../lib/report/ai/own-run.ts";
import { extractJsonLoose } from "../lib/report/ai/generator.ts";
import { ISSUE_CLASS_LABEL, groupReadingIssues, type IssueClass } from "../lib/report/reading/issue-class.ts";
import { renderStory7DraftMarkdown } from "../lib/report/reading/render-draft.ts";
import { normalizeStory7Draft, validateStory7Draft } from "../lib/report/reading/story7-validate.ts";
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

let draft: unknown;
let closed = 0;
try {
  const loose = extractJsonLoose(text);
  draft = loose.value;
  closed = loose.closedBrackets;
} catch (e) {
  log(`\n## 1. JSON 읽기\n- **읽지 못했습니다**: ${e instanceof Error ? e.message : "알 수 없음"}`);
  log("- 닫는 괄호만 보충해서는 읽을 수 없는 글입니다(끊긴 문자열 · 쉼표 · 짝이 맞지 않는 괄호 등). 글 전체를 다시 받아야 합니다 — 새 호출은 운영자가 승인한 범위 안에서만 합니다.");
  writeFileSync(join(dir, "recheck.md"), out.join("\n") + "\n");
  process.exit(0);
}
log("\n## 1. JSON 읽기");
log(closed === 0 ? "- 그대로 읽힘(보충 없음)" : `- 끝의 닫는 괄호 ${closed}개(\`]\` · \`}\`)가 빠져 있어 보충해서 읽었습니다 — **글자는 하나도 바꾸거나 지우지 않았습니다**. 이 보충은 글을 받은 뒤의 처리이며, 장 · 문단 · 근거가 빠진 글이라면 아래 2번 검사가 그대로 걸러냅니다.`);

// 생성기가 검사 직전에 하는 위치 · 문단 나눔 보정(글자는 바꾸지 않는다)을 같은 함수로 적용한다 — 조언 행동(actions)이 7번 장 안에 들어 있던 글이면 바깥으로 옮긴다
const nestedActions = Boolean(draft && typeof draft === "object" && !Array.isArray((draft as { actions?: unknown }).actions) && Array.isArray((draft as { sections?: { no?: unknown; actions?: unknown }[] }).sections) && (draft as { sections: { no?: unknown; actions?: unknown }[] }).sections.some((s) => Number(s?.no) === 7 && Array.isArray(s?.actions)));
draft = normalizeStory7Draft(draft);
if (nestedActions) log("- 조언 행동(actions)이 7번 장 안에 들어 있어(지시문은 sections 바깥이라고 적었습니다) **위치만** 바깥으로 옮겼습니다 — 행동의 글자 · 근거는 그대로입니다.");

const v = validateStory7Draft(draft, described.evidence, { hasContext: false });
log("\n## 2. 형식 · 근거 · 문체 검사 (생성기가 저장 여부를 정하는 것과 같은 검사)");
if (v.ok) log("- **통과**");
else {
  const g = groupReadingIssues(v.errors);
  log(`- **불통과** — ${v.errors.length}건`);
  for (const k of Object.keys(g) as IssueClass[]) {
    log(`- ${ISSUE_CLASS_LABEL[k]}: ${g[k].length}건`);
    for (const e of g[k]) log(`  - ${e}`);
  }
  log("\n※ 오탐일 수 있는지는 글을 읽은 사람이 판단합니다(검사 문구가 가리키는 문장을 읽어 보세요). 지난 시험에서는 검사가 틀린 경우가 많았습니다.");
}

let metrics: string;
try {
  metrics = reviewOwnDraft(draft, described.evidence);
} catch (e) {
  metrics = `# 읽기 전 보조 지표\n\n- 만들지 못했습니다(${e instanceof Error ? e.message : "알 수 없는 오류"}). 위 2번 검사 결과와 원문을 보세요.\n`;
}
writeFileSync(join(dir, "recheck.md"), out.join("\n") + "\n\n" + metrics);
try {
  writeFileSync(join(dir, "readable-rechecked.md"), `> 닫는 괄호를 보충해 읽을 수 있게 한 글입니다(내용은 그대로 · 보충한 괄호 ${closed}개). 생성기가 저장한 리포트가 아닙니다.\n\n${renderStory7DraftMarkdown(draft as Story7DraftV1)}`);
} catch (e) {
  console.error(`경고: 읽는 순서로 풀어 쓴 글을 만들지 못했습니다(${e instanceof Error ? e.message : "알 수 없는 오류"}). 원문은 그대로입니다.`);
}
console.log(`\n저장한 파일(결과 폴더 안): recheck.md(위 검사 + 읽기 전 지표) · readable-rechecked.md(읽는 순서로 풀어 쓴 글)`);
console.log("읽기: 메모장으로 열어도 되고, npm.cmd run dev 를 켠 뒤 /dev/live 에서도 원문을 볼 수 있습니다. AI는 호출하지 않았고 비용은 0원입니다.");
