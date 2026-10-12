// 채점 방향을 숨긴 "풀어보기" 화면을 만든다 (lib/assessment/drafts/take-page.ts).
// 실행: node scripts/render-assessment-take.ts                       → docs/assessment-take.html (더블클릭으로 열 수 있는 단독 파일)
//       node scripts/render-assessment-take.ts --fragment <경로>      → 게시용 조각
import { writeFileSync } from "node:fs";
import { takeFragment, takeStandalone } from "../lib/assessment/drafts/take-page.ts";

const args = process.argv.slice(2);
const i = args.indexOf("--fragment");
if (i >= 0) {
  const html = takeFragment();
  writeFileSync(args[i + 1], html);
  console.log(`게시용 조각을 ${args[i + 1]}에 썼습니다 (${html.length.toLocaleString("ko-KR")}자).`);
} else {
  const html = takeStandalone();
  writeFileSync(new URL("../docs/assessment-take.html", import.meta.url), html);
  console.log(`docs/assessment-take.html을 썼습니다 (${html.length.toLocaleString("ko-KR")}자).`);
}
