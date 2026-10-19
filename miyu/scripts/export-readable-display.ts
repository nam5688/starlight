// 저장된 리포트(report.json)를 **AI를 부르지 않고(호출 0 · 비용 0원 · 키 불필요)** 읽는 순서의 글로 다시 내보낸다 — 새 파일 readable-display.md 하나만 만든다.
// 쓰는 때: 읽기용 글(readable.md)에 화면과 달리 대표 경향 이름(~형)이 빠져 있던 옛 파일을 새 표시 기준으로 다시 읽고 싶을 때.
//   · 결과 폴더의 report.json만 읽는다. attempts/round*.txt(AI 원문) · report.json · readable.md · input.json 등 기존 파일은 고치지도 덮어쓰지도 않는다.
//   · 형식 검사에 걸려 report.json이 없는 폴더는 이 스크립트가 아니라 `recheck-own-draft.ts`(원문에서 풀어 쓰기)를 쓴다.
//
// 이미 같은 이름의 파일이 있으면 **덮어쓰지 않고 멈춘다**(쓰기 방식이 "새로 만들 때만"이다 — 먼저 만든 readable-display.md도 지키고, 다른 이름을 고르는 길도 있다).
//
// 사용 (miyu 폴더, PowerShell):
//   node scripts/export-readable-display.ts <결과 폴더 경로>
//   node scripts/export-readable-display.ts <결과 폴더 경로> --out <새 파일 경로>   # 이미 readable-display.md가 있을 때 다른 이름으로
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isReadingReport } from "../lib/report/generator.ts";
import { renderReadingMarkdown } from "../lib/report/reading/render-text.ts";

const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const outArg = outFlag >= 0 ? args[outFlag + 1] : undefined;
const outValueAt = outFlag >= 0 ? outFlag + 1 : -1; // --out 뒤의 값은 결과 폴더로 읽지 않는다(--out이 없으면 -1이라 어느 인자도 빠지지 않는다)
const dir = args.find((a, i) => !a.startsWith("--") && i !== outValueAt);
if (!dir || (outFlag >= 0 && !outArg)) {
  console.error("사용: node scripts/export-readable-display.ts <결과 폴더 경로> [--out <새 파일 경로>]");
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
const out = outArg ?? join(dir, "readable-display.md");
const body = `> 저장된 리포트(report.json)를 읽는 순서로 풀어 쓴 새 파일입니다. 글은 한 글자도 고치지 않았고, 대표 경향 이름(~형)과 한 줄 특징이 화면과 같은 순서로 맨 위에 있습니다. AI 원문(attempts) · report.json · readable.md는 건드리지 않았습니다.\n\n${renderReadingMarkdown(report)}`;
try {
  // flag "wx": 파일이 이미 있으면 쓰지 않고 오류(EEXIST)로 멈춘다 — 존재 확인과 쓰기 사이에 끼어드는 틈 없이 한 번에
  writeFileSync(out, body, { flag: "wx" });
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === "EEXIST") {
    console.error(`중단: ${out} 이 이미 있어 덮어쓰지 않았습니다. 기존 파일은 그대로입니다. 다른 이름으로 만들려면 --out <새 파일 경로>를 쓰세요.`);
    process.exit(1);
  }
  throw e;
}
console.log(`만든 파일: ${out}`);
console.log("AI는 호출하지 않았고 비용은 0원입니다. 기존 파일은 바꾸지 않았습니다.");
