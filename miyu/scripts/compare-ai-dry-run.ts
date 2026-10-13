// AI 품질 비교의 비용 계획을 계산해 보여 준다 (드라이런) — 어떤 AI도 부르지 않고, 키도 필요 없다.
// 가상 인물의 실제 지시문 · 근거 목록 길이로 입력 토큰을 추정하고, 환율 · 여유율 가정과 재시도(고쳐 쓰기)를 포함해 단계별 비용을 낸다.
// 실행: node scripts/compare-ai-dry-run.ts [--variant philosophical-v0]   (miyu 폴더에서)
//   --variant philosophical-v0 : 비교용 "자기 이해 풀이" 지시문의 길이로 계산한다 (기본은 개인 종합 리포트 v2 지시문)
import { AI_CANDIDATES, COMPARE_STAGES } from "../lib/config/ai-candidates.ts";
import { buildEvidence } from "../lib/report/ai/generator.ts";
import { costKrw, DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE, estimateInputTokens } from "../lib/report/ai/budget.ts";
import { buildPersonas } from "../lib/report/ai/compare-personas.ts";
import { MAX_OUTPUT_TOKENS, planStage, referenceFor, TYPICAL_OUTPUT_TOKENS } from "../lib/report/ai/compare-plan.ts";
import { type CompareVariant, promptsFor } from "../lib/report/ai/compare-plan.ts";

const argVariant = process.argv.includes("--variant") ? process.argv[process.argv.indexOf("--variant") + 1] : "personal-v2";
if (argVariant !== "personal-v2" && argVariant !== "philosophical-v0") throw new Error(`알 수 없는 --variant: ${argVariant}`);
const variant: CompareVariant = argVariant;
const won = (x: number) => `${Math.round(x).toLocaleString("ko-KR")}원`;
const now = new Date("2026-10-12T03:00:00Z");
const settings = { fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE };
const cands = AI_CANDIDATES.map((c) => ({ key: c.key, price: c.price }));

console.log("# AI 품질 비교 비용 계획 (드라이런 — 호출 없음, 예산 미승인)\n");
console.log(`- 지시문: ${variant === "philosophical-v0" ? "자기 이해 풀이(비교용 v0)" : "개인 종합 리포트 v2(기존)"}`);
console.log(`- 환율 ${DEFAULT_FX_KRW_PER_USD.toLocaleString("ko-KR")}원/달러 (가정값, 2026-10 실제 환율은 확인하지 않음) · 부가세 등 여유율 ${Math.round((DEFAULT_SURCHARGE - 1) * 100)}%`);
for (const c of AI_CANDIDATES) console.log(`- 후보 ${c.key}: ${c.company} \`${c.modelId}\` 입력 $${c.price.inputUsdPerMTok} / 출력 $${c.price.outputUsdPerMTok} (100만 토큰당) — 확인일 ${c.checkedAt}`);

const personas = buildPersonas(10);
const ref = referenceFor(now);
console.log("\n## 가상 인물 10명의 실제 입력 크기\n");
console.log("| 인물 | 설명 | 지시문 글자 | 근거 목록 글자 | 입력 토큰 추정(보수적) |");
console.log("| --- | --- | --- | --- | --- |");
const inputs: number[] = [];
for (const p of personas) {
  const [system, user] = promptsFor(variant, buildEvidence(p.input, ref), ref.iso, p.input.context);
  const tokens = estimateInputTokens([system, user]);
  inputs.push(tokens);
  console.log(`| ${p.id} | ${p.note} | ${system.length.toLocaleString("ko-KR")} | ${user.length.toLocaleString("ko-KR")} | ${tokens.toLocaleString("ko-KR")} |`);
}
const maxIn = Math.max(...inputs);
const minIn = Math.min(...inputs);

console.log("\n## 생성 1건 비용 시나리오 (후보 둘 다 같은 단가)\n");
console.log("| 시나리오 | 입력 토큰 | 출력 토큰 | 호출 | 비용 |");
console.log("| --- | --- | --- | --- | --- |");
const price = AI_CANDIDATES[0].price;
const rows: [string, number, number, number, number][] = [
  ["적게 (입력이 실제로 추정의 절반, 출력 6천)", Math.round(minIn / 2), 6000, 0, 0],
  ["평소 (추정 입력 · 출력 1만)", minIn, TYPICAL_OUTPUT_TOKENS, 0, 0],
  ["많이 (가장 큰 입력 · 출력 최대)", maxIn, MAX_OUTPUT_TOKENS, 0, 0],
];
for (const [name, i, o] of rows) console.log(`| ${name} | ${i.toLocaleString("ko-KR")} | ${o.toLocaleString("ko-KR")} | 1회 | ${won(costKrw(price, { inputTokens: i, outputTokens: o }, settings))} |`);
const repairIn = maxIn + MAX_OUTPUT_TOKENS + 1300;
console.log(`| 많이 + 형식 검사 실패로 고쳐 쓰기 1회 | ${maxIn.toLocaleString("ko-KR")} + ${repairIn.toLocaleString("ko-KR")} | ${(MAX_OUTPUT_TOKENS * 2).toLocaleString("ko-KR")} | 2회 | ${won(costKrw(price, { inputTokens: maxIn, outputTokens: MAX_OUTPUT_TOKENS }, settings) + costKrw(price, { inputTokens: repairIn, outputTokens: MAX_OUTPUT_TOKENS }, settings))} |`);

console.log("\n## 환율 가정에 따른 차이 (평소 시나리오 1건)\n");
console.log("| 환율 | 1건 | 4건(1단계) | 20건(2단계) |");
console.log("| --- | --- | --- | --- |");
for (const fx of [1400, 1600, 1800]) {
  const one = costKrw(price, { inputTokens: minIn, outputTokens: TYPICAL_OUTPUT_TOKENS }, { fxKrwPerUsd: fx, surcharge: DEFAULT_SURCHARGE });
  console.log(`| ${fx.toLocaleString("ko-KR")}원 | ${won(one)} | ${won(one * 4)} | ${won(one * 20)} |`);
}

for (const stage of COMPARE_STAGES) {
  const plan = planStage({ stage: stage.name, capKrw: stage.capKrw, personas: buildPersonas(stage.personaCount), candidates: cands, settings, now, variant });
  console.log(`\n## ${stage.label}\n`);
  console.log(`- 하드스톱 한도(승인 요청 금액): **${won(stage.capKrw)}**`);
  console.log(`- 평소 수준 예상: ${won(plan.expectedKrw)} (${plan.expectedFits ? "한도 안" : "한도 초과"})`);
  console.log(`- 모든 생성이 첫 호출만 쓰는 최악(출력 최대): ${won(plan.firstCallWorstKrw)}`);
  console.log(`- 모든 생성이 고쳐 쓰기까지 두 번 호출하는 최악: ${won(plan.twoRoundWorstKrw)} (${plan.worstFits ? "한도 안" : "한도를 넘음 — 이 경우 하드스톱이 남은 생성을 중단하고 한도를 지킨다"})`);
}
console.log("\n호출 전 확인: 모든 호출은 BudgetGuard가 최악 비용을 예약해 한도를 넘길 호출을 제공사에 보내지 않는다. 실제 호출 코드(제공사 연결)는 아직 만들지 않았다.");
