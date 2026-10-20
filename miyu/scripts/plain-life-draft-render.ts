// 무료 결과 문장 생활 말 시안의 전후 문서(docs/free-result-life-language-proposal-v1.md)를 코드에서 만든다.
// 시안은 연결하지 않은 초안이다 — 무료 결과 화면 · 저장된 결과 · 리포트 · AI 어디에도 쓰지 않는다. 예시 사주는 가상의 생년월일이다(실제 사람의 정보가 아니다).
// 실행: node scripts/plain-life-draft-render.ts   (miyu 폴더에서)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { calculateSaju } from "../lib/saju/manseryeok-engine.ts";
import { SAMPLE_BIRTH, renderLifeLanguageProposal } from "../lib/saju/plain-life-draft-render.ts";

const saju = calculateSaju({ ...SAMPLE_BIRTH });
if (saju.status !== "ok") throw new Error("예시 사주를 계산하지 못했다");
const text = renderLifeLanguageProposal(saju);
writeFileSync(join(import.meta.dirname, "..", "docs", "free-result-life-language-proposal-v1.md"), text.endsWith("\n") ? text : `${text}\n`);
console.log(`docs/free-result-life-language-proposal-v1.md ${text.length}자`);
