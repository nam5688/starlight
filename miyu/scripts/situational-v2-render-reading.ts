// 상황형 28문항 읽기 설계 초안의 검토용 표 · 예시 결과(docs/assessment-situational-v2-reading-tables.md)를 코드에서 만든다.
// 연결하지 않은 초안이다 — 화면 · 저장 · 점수 · 리포트 · 운영 DB · AI 어디에도 쓰지 않는다. 운영자 예시 입력은 provenance 문서의 operator-picks 블록을 한 번 읽어 예시 D에만 쓴다.
// 실행: node scripts/situational-v2-render-reading.ts   (miyu 폴더에서)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderReadingTables } from "../lib/assessment/drafts/situational-v2-reading-render.ts";

const root = join(import.meta.dirname, "..");
const provenance = readFileSync(join(root, "docs", "assessment-situational-v2-provenance.md"), "utf8");
const text = renderReadingTables(provenance);
writeFileSync(join(root, "docs", "assessment-situational-v2-reading-tables.md"), text.endsWith("\n") ? text : `${text}\n`);
console.log(`docs/assessment-situational-v2-reading-tables.md ${text.length}자`);
