// 상황형 28문항 읽기 표 · 가상 응답 측정 문서(docs/assessment-situational-v2-reading-tables.md)를 코드에서 만든다.
// 실행: node scripts/situational-render-reading.ts   (miyu 폴더에서) — 파일 쓰기뿐이고 AI · 네트워크 · DB를 쓰지 않는다.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderReadingTables } from "../lib/assessment/situational/render.ts";

const root = join(import.meta.dirname, "..");
const text = renderReadingTables();
writeFileSync(join(root, "docs", "assessment-situational-v2-reading-tables.md"), text.endsWith("\n") ? text : `${text}\n`);
console.log(`docs/assessment-situational-v2-reading-tables.md ${text.length}자`);
