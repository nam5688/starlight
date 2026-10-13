// AI 품질 비교 실행 — 가상 인물로 두 후보에 같은 입력을 넣고, 이름을 가린(X · Y) 글과 평가표를 파일로 만든다.
//
// 승인 전에는 아무것도 부르지 않는다:
//  · 기본(옵션 없음)은 호출 없는 계산(드라이런)만 한다 — 모델 · 예상 비용 · 필요한 설정을 보여 준다.
//  · 실제 호출은 --execute 와 함께 운영자가 승인한 금액 · 날짜(--approved-cap-krw · --approved-on)를 직접 적어야 시작한다.
//    승인 기록이 단계 · 한도와 맞지 않거나, 키가 없거나, 한도가 승인 금액보다 크면 첫 호출 전에 멈춘다.
//  · 모든 호출은 예산 관리기(BudgetGuard)가 최악 비용을 먼저 잡아, 승인한 한도를 넘길 호출은 제공사에 보내지 않는다.
//
// 실행 (miyu 폴더, PowerShell — 키는 .env.local 에만 두고 채팅 · 화면에 붙여넣지 않는다):
//   node scripts/run-ai-compare.ts                                    # 드라이런 (호출 없음)
//   node --env-file=.env.local scripts/run-ai-compare.ts --stage stage-1 --execute --approved-cap-krw 3000 --approved-on 2026-10-13
//
// 키(.env.local): ANTHROPIC_API_KEY (후보 A) · OPENAI_API_KEY (후보 B). 값은 이 스크립트가 출력하지 않는다.
// 결과 폴더: pilot-data/ai-compare/<단계>-<시각>/ (저장소에 올라가지 않는 폴더)
//   blind/<인물>-X.md · -Y.md : 이름을 가린 글   evaluation-sheet.md : 채점표
//   key-open-after-scoring.json : X · Y가 어느 후보인지 (채점이 끝난 뒤에 연다)   cost-and-checks.json : 비용 · 토큰 · 검사 결과(글 내용 없음)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AI_CANDIDATES, COMPARE_STAGES } from "../lib/config/ai-candidates.ts";
import { createAnthropicModel, createOpenAiModel } from "../lib/integrations/ai/providers.ts";
import { BudgetGuard, DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE } from "../lib/report/ai/budget.ts";
import { buildPersonas } from "../lib/report/ai/compare-personas.ts";
import { type CompareCandidate, type CompareVariant, planStage, runStage } from "../lib/report/ai/compare-plan.ts";
import { isReadingReport } from "../lib/report/generator.ts";
import { renderReadingMarkdown } from "../lib/report/reading/render-text.ts";
import { sampleReadingReport } from "../lib/samples/sample-reading-report.ts";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const stageName = arg("--stage") ?? "stage-1";
const variant = (arg("--variant") ?? "reading-v1") as CompareVariant;
if (!["reading-v1", "personal-v2"].includes(variant)) throw new Error("--variant 은 reading-v1(기본) 또는 personal-v2만 쓸 수 있습니다.");
const stage = COMPARE_STAGES.find((s) => s.name === stageName);
if (!stage) throw new Error(`알 수 없는 단계: ${stageName} (${COMPARE_STAGES.map((s) => s.name).join(" · ")})`);
const won = (x: number) => `${Math.round(x).toLocaleString("ko-KR")}원`;
const now = new Date();
const settings = { fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE };
const personas = buildPersonas(stage.personaCount);

const plan = planStage({ stage: stage.name, capKrw: stage.capKrw, personas, candidates: AI_CANDIDATES.map((c) => ({ key: c.key, price: c.price })), settings, now, variant });
console.log(`# ${stage.label}`);
console.log(`- 지시문: ${variant === "reading-v1" ? "개인 통합 리포트(읽기 구조, 지금 제품 형식)" : "개인 종합 리포트 v2(이전 형식)"}`);
for (const c of AI_CANDIDATES) console.log(`- 후보 ${c.key}: ${c.company} ${c.modelId} (입력 $${c.price.inputUsdPerMTok} · 출력 $${c.price.outputUsdPerMTok} / 100만 토큰) — 생각 · 추론 강도 중간`);
console.log(`- 예상 비용(평소 수준): ${won(plan.expectedKrw)} · 모든 생성이 한 번에 끝나는 최악: ${won(plan.firstCallWorstKrw)} · 모두 고쳐 쓰기까지 가는 최악: ${won(plan.twoRoundWorstKrw)}`);
console.log(`- 하드스톱 한도: ${won(stage.capKrw)} (환율 ${settings.fxKrwPerUsd.toLocaleString("ko-KR")}원/달러 · 여유율 ${Math.round((settings.surcharge - 1) * 100)}% 가정 — 실제 청구는 제공사 콘솔에서 확인)`);

if (!args.includes("--execute")) {
  console.log("\n호출하지 않았습니다 (승인 전 드라이런). 실행하려면 운영자가 승인한 뒤 --execute 와 승인 금액 · 날짜를 직접 적어야 합니다.");
  process.exit(0);
}

// ── 여기부터는 운영자가 승인한 뒤에만 ──
const approvedCap = Number(arg("--approved-cap-krw"));
const approvedOn = arg("--approved-on");
if (!Number.isFinite(approvedCap) || !approvedOn || !/^\d{4}-\d{2}-\d{2}$/.test(approvedOn)) {
  console.error("\n중단: 실제 호출에는 운영자가 승인한 금액과 날짜를 함께 적어야 합니다 (--approved-cap-krw 3000 --approved-on 2026-10-13). 아무것도 호출하지 않았습니다.");
  process.exit(1);
}
const keys = { A: process.env.ANTHROPIC_API_KEY, B: process.env.OPENAI_API_KEY } as const;
console.log(`\n키 설정: 후보 A(ANTHROPIC_API_KEY) ${keys.A ? "있음" : "없음"} · 후보 B(OPENAI_API_KEY) ${keys.B ? "있음" : "없음"}`);
if (!keys.A || !keys.B) {
  console.error("중단: 두 후보의 키가 모두 필요합니다. .env.local 에 직접 입력한 뒤 다시 실행하세요. 아무것도 호출하지 않았습니다.");
  process.exit(1);
}

const candidates: CompareCandidate[] = AI_CANDIDATES.map((c) => ({
  key: c.key,
  price: c.price,
  model: c.key === "A" ? createAnthropicModel({ apiKey: keys.A!, model: c.modelId, effort: "medium" }) : createOpenAiModel({ apiKey: keys.B!, model: c.modelId, effort: "medium" }),
}));
const guard = new BudgetGuard({ capKrw: stage.capKrw, ...settings });
const blindSeed = Number(approvedOn.replaceAll("-", ""));

let result;
try {
  result = await runStage({ stage: { name: stage.name, capKrw: stage.capKrw }, personas, candidates, guard, approval: { stage: stage.name, approvedCapKrw: approvedCap, approvedOn }, now, variant, blindSeed });
} catch (e) {
  console.error(`중단: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
  process.exit(1);
}

const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
const dir = join("pilot-data", "ai-compare", `${stage.name}-${stamp}`);
mkdirSync(join(dir, "blind"), { recursive: true });

for (const run of result.runs) {
  if (!run.report || !isReadingReport(run.report)) continue;
  writeFileSync(join(dir, "blind", `${run.persona}-${run.blind}.md`), renderReadingMarkdown(run.report));
}
writeFileSync(join(dir, "reference-사람이-쓴-예시.md"), `> 사람이 쓴 목표 수준 예시입니다 (가상 인물 서윤). 채점할 때 기준으로 함께 읽으세요 — 두 후보 중 하나가 아닙니다.\n\n${renderReadingMarkdown(sampleReadingReport)}`);

const rows = personas.flatMap((p) => ["X", "Y"].map((b) => `| ${p.id} | ${b} |  |  |  |  |  |  |  |`)).join("\n");
writeFileSync(
  join(dir, "evaluation-sheet.md"),
  `# 채점표 — ${stage.label}

후보 이름은 가려져 있습니다 (X · Y). 채점이 끝나기 전에는 \`key-open-after-scoring.json\` 을 열지 않습니다.
사람이 쓴 예시(\`reference-사람이-쓴-예시.md\`)를 먼저 읽고 기준으로 삼습니다. **${stage.personaCount * 2}건으로는 순위를 정하지 않습니다** — 작동하는지 · 비용이 예상대로인지 · 명백한 결함이 있는지만 봅니다.

## 먼저 확인 (있으면 그 후보는 지시문을 고쳐 다시 확인)

- [ ] 지어낸 사건 · 날짜 · 직업 · 나이가 있는가
- [ ] 알려 준 고민을 사주로 알아맞힌 것처럼 쓴 문장이 있는가
- [ ] 상대의 마음 · 나이 · 직업 · 만날 날짜를 쓴 곳이 있는가
- [ ] 본문에 사주 용어(일간 · 대운 등) · 점수 · 퍼센트가 나오는가

## 1~5점 (인물마다 X · Y)

| 인물 | 글 | 구체성 | 조건 · 상황 | 근거 일치 | 새로 알게 된 것 | 한국어 자연스러움 | 읽기 쉬움 | 구매 판단 | 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

- 구체성: 이름을 가려도 이 사람의 이야기로 읽히는가 · 조건 · 상황: "~할 때 / ~하면 / 다만" 같은 조건 · 예외가 있는가
- 근거 일치: 문단이 말하는 범위가 그 근거(분석 근거를 펼쳐 볼 수 있다면)와 맞는가 · 새로 알게 된 것: 무료 미리보기에서 얻지 못한 것이 있는가
- 한국어 자연스러움: 번역투 · 반복 · 어색한 문장 · **읽기 쉬움(새 항목)**: 결론 → 짧은 요약 → 쉬운 예시 순서로 읽히는가, 문장이 짧고 쉬운가
- 구매 판단: 읽고 나서 9,900원을 낼 만했는가 / 더 알고 싶은가

합격 기준은 \`docs/ai-quality-comparison-plan.md\` 6장(결과를 보기 전에 고정한 값)을 따릅니다. 읽기 쉬움은 새 읽기 구조를 위해 더한 항목이라 기존 합격 기준(4.0)에는 넣지 않고 기록만 합니다.
`,
);
writeFileSync(join(dir, "key-open-after-scoring.json"), JSON.stringify(result.blindKey, null, 2));
writeFileSync(
  join(dir, "cost-and-checks.json"),
  JSON.stringify(
    {
      stage: result.stage,
      variant,
      spentKrw: Math.round(result.spentKrw * 100) / 100,
      stoppedByBudget: result.stoppedByBudget,
      estimateRatio: result.estimateRatio,
      crossPersonOverlap: result.crossPersonOverlap,
      runs: result.runs.map(({ report: _report, ...rest }) => ({ ...rest, hasReport: _report !== null })),
    },
    null,
    2,
  ),
);

const ok = result.runs.filter((r) => r.status === "ok").length;
console.log(`\n완료: 생성 ${ok}/${result.runs.length}건 · 쓴 비용 ${won(result.spentKrw)} (한도 ${won(stage.capKrw)})${result.stoppedByBudget ? " · 예산 하드스톱으로 일부 중단" : ""}`);
for (const r of result.runs) console.log(`- ${r.persona} ${r.blind}: ${r.status}${r.errorCode ? ` (${r.errorCode})` : ""} · 호출 ${r.calls}회 · 첫 시도 형식 통과 ${r.firstPassValid === null ? "-" : r.firstPassValid ? "예" : "아니오"} · ${won(r.costKrw)}`);
console.log(`\n결과 폴더: ${dir}\n채점이 끝나기 전에는 key-open-after-scoring.json 을 열지 마세요.`);
