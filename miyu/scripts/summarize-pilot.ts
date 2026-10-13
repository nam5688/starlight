// 시범 인터뷰 · 시범 응답 정리 — pilot-data/ 폴더의 글(풀어보기 화면의 "검토 내용 복사"로 만든 글, 사람마다 파일 하나)을 읽어 요약한다.
// 실행: node scripts/summarize-pilot.ts [폴더]   (miyu 폴더에서, 기본 pilot-data)
// pilot-data/는 저장소에 올라가지 않는다(.gitignore). 실제 사람의 응답은 운영 DB · 분석 도구에 넣지 않는다.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseReview, renderPilotSummary, summarizePilot } from "../lib/assessment/drafts/pilot-summary.ts";

const dir = process.argv[2] ?? "pilot-data";
if (!existsSync(dir)) {
  console.log(`${dir}/ 폴더가 없습니다. 만들고, 시범 참여자마다 "검토 내용 복사"로 만든 글을 파일 하나(.txt)로 저장하세요. 이 폴더는 저장소에 올라가지 않습니다.`);
  process.exit(0);
}
const files = readdirSync(dir).filter((f) => /\.(txt|md)$/i.test(f) && f !== "summary.md").sort();
if (!files.length) {
  console.log(`${dir}/에 .txt 파일이 없습니다.`);
  process.exit(0);
}
const reviews = files.map((f) => {
  const r = parseReview(readFileSync(join(dir, f), "utf8"));
  if (!r.version) console.warn(`경고: ${f} — 문항 버전 줄을 찾지 못했습니다(복사한 글이 맞는지 확인).`);
  return r;
});
const summary = renderPilotSummary(summarizePilot(reviews));
writeFileSync(join(dir, "summary.md"), summary);
console.log(summary);
console.log(`→ ${join(dir, "summary.md")}에도 저장했습니다 (저장소에 올라가지 않는 폴더).`);
