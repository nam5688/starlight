// 같은 본인 입력으로 받은 두 번의 실제 AI 글(story-7)을 같은 기준으로 나란히 본다 — AI를 호출하지 않는다(0원, 운영자 2026-10-18).
// 결과 폴더 두 개(이전 · 새 글)의 attempts/roundN.txt 원문을 읽고, 같은 검사 · 같은 지표(lib/report/reading/compare-runs.ts)로 비교표(compare-with-<이전 폴더>.md)를 새 폴더에 쓴다.
// 이 결과 폴더는 저장소에 올라가지 않는다(pilot-data) — 개인정보가 외부에 공개되지 않는다.
//
// 실행 (miyu 폴더, PowerShell):
//   node scripts/compare-own-runs.ts <이전 결과 폴더> <새 결과 폴더> --birth-time-unknown
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describeOwnInput, ownReportInput, parseOwnCapture } from "../lib/report/ai/own-run.ts";
import { extractJsonLoose } from "../lib/report/ai/generator.ts";
import { renderRunComparison, runMetrics } from "../lib/report/reading/compare-runs.ts";
import { normalizeStory7Draft } from "../lib/report/reading/story7-validate.ts";
import type { Story7DraftV1 } from "../lib/report/reading/types.ts";

const args = process.argv.slice(2);
const dirs = args.filter((a) => !a.startsWith("--"));
const birthTimeUnknown = args.includes("--birth-time-unknown");

function stop(message: string): never {
  console.error(`\n중단: ${message}\nAI를 호출하지 않았습니다(이 스크립트는 호출하지 않습니다).`);
  process.exit(1);
}
if (dirs.length !== 2) stop("결과 폴더 두 개가 필요합니다: node scripts/compare-own-runs.ts <이전 결과 폴더> <새 결과 폴더> --birth-time-unknown");
const [oldDir, newDir] = dirs;

function latestRound(dir: string): string {
  const attempts = join(dir, "attempts");
  if (!existsSync(attempts)) stop(`${attempts} 폴더가 없습니다. 결과 폴더 경로를 확인해 주세요.`);
  const rounds = readdirSync(attempts).filter((f) => /^round\d+\.txt$/.test(f)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (rounds.length === 0) stop(`${attempts}에 roundN.txt 원문이 없습니다.`);
  return readFileSync(join(attempts, rounds[rounds.length - 1]), "utf8");
}
function draftOf(dir: string): Story7DraftV1 {
  try {
    return normalizeStory7Draft(extractJsonLoose(latestRound(dir)).value) as Story7DraftV1;
  } catch (e) {
    stop(`${dir}의 원문을 읽지 못했습니다(${e instanceof Error ? e.message : "알 수 없음"}). 끝의 닫는 괄호만 빠진 글이 아니라 내용이 빠진 글입니다.`);
  }
}

// 두 글 모두 새 글의 입력 · 근거 목록으로 같은 검사를 한다(같은 기준)
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(join(newDir, "input.json"), "utf8"));
} catch {
  stop(`${join(newDir, "input.json")}을 읽지 못했습니다(그 실행의 입력 사본입니다).`);
}
const capture0 = parseOwnCapture(raw);
if (!capture0) stop("input.json의 모양이 올바르지 않습니다.");
const capture = birthTimeUnknown ? { ...capture0, info: { ...capture0.info, birthTimeUnknown: true, birthTime: "" } } : capture0;
const stamp = newDir.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})[\\/]?$/);
const now = stamp ? new Date(`${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`) : new Date();
const built = await ownReportInput(capture, now);
if (!built.ok) stop(built.message);
const described = describeOwnInput({ input: built.input, capture, now, variant: "story-7" });

const base = (d: string) => d.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? d;
const a = { label: base(oldDir), metrics: runMetrics(draftOf(oldDir), described.evidence) };
const b = { label: base(newDir), metrics: runMetrics(draftOf(newDir), described.evidence) };
const md = renderRunComparison(a, b);
console.log(md);
const file = join(newDir, `compare-with-${a.label}.md`);
writeFileSync(file, md);
console.log(`\n저장했습니다: ${file}  (저장소에 올라가지 않는 폴더입니다 · AI 호출 0회)`);
