// 저장된 리포트(report.json)를 **AI를 부르지 않고(호출 0 · 비용 0원 · 키 불필요)** 읽는 순서의 글로 다시 내보낸다 — 새 파일 readable-display.md 하나만 만든다.
// 쓰는 때: 읽기용 글(readable.md)에 화면과 달리 대표 경향 이름(~형)이 빠져 있던 옛 파일을 새 표시 기준으로 다시 읽고 싶을 때.
//   · 결과 폴더의 report.json만 읽는다. attempts/round*.txt(AI 원문) · report.json · readable.md · input.json 등 기존 파일은 고치지도 덮어쓰지도 않는다.
//   · 형식 검사에 걸려 report.json이 없는 폴더는 이 스크립트가 아니라 `recheck-own-draft.ts`(원문에서 풀어 쓰기)를 쓴다.
//
// 사용 (miyu 폴더, PowerShell):
//   node scripts/export-readable-display.ts <결과 폴더 경로>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isReadingReport } from "../lib/report/generator.ts";
import { renderReadingMarkdown } from "../lib/report/reading/render-text.ts";

const dir = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!dir) {
  console.error("사용: node scripts/export-readable-display.ts <결과 폴더 경로>");
  process.exit(2);
}
const file = join(dir, "report.json");
if (!existsSync(file)) {
  console.error(`중단: ${file} 이 없습니다 — 형식 검사에 걸려 저장되지 않은 글이면 scripts/recheck-own-draft.ts 를 쓰세요. 아무 파일도 만들지 않았습니다.`);
  process.exit(1);
}
let report: unknown;
try {
  report = JSON.parse(readFileSync(file, "utf8"));
} catch {
  console.error("중단: report.json 을 읽지 못했습니다(JSON이 아닙니다). 아무 파일도 만들지 않았습니다.");
  process.exit(1);
}
if (!isReadingReport(report)) {
  console.error("중단: report.json 이 개인 통합 리포트 모양이 아닙니다. 아무 파일도 만들지 않았습니다.");
  process.exit(1);
}
const out = join(dir, "readable-display.md");
writeFileSync(out, `> 저장된 리포트(report.json)를 읽는 순서로 풀어 쓴 새 파일입니다. 글은 한 글자도 고치지 않았고, 대표 경향 이름(~형)과 한 줄 특징이 화면과 같은 순서로 맨 위에 있습니다. AI 원문(attempts) · report.json · readable.md는 건드리지 않았습니다.\n\n${renderReadingMarkdown(report)}`);
console.log(`만든 파일: ${out}`);
console.log("AI는 호출하지 않았고 비용은 0원입니다. 기존 파일은 바꾸지 않았습니다.");
