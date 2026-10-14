// AI 품질 비교 실행 — 가상 인물로 두 후보에 같은 입력을 넣고, 이름을 가린(X · Y) 글과 평가표를 파일로 만든다.
//
// 승인 전에는 아무것도 부르지 않는다:
//  · 기본(옵션 없음)은 호출 없는 계산(드라이런)만 한다 — 모델 · 예상 비용 · 필요한 설정을 보여 준다.
//  · 실제 호출은 --execute 와 함께 운영자가 승인한 금액 · 날짜(--approved-cap-krw · --approved-on)를 직접 적어야 시작한다.
//    승인 기록이 단계 · 한도와 맞지 않거나, 키가 없거나, 한도가 승인 금액보다 크면 첫 호출 전에 멈춘다.
//  · 모든 호출은 예산 관리기(BudgetGuard)가 최악 비용을 먼저 잡아, 승인한 한도를 넘길 호출은 제공사에 보내지 않는다.
//
// 실행 (miyu 폴더, PowerShell — 키는 .env.local 에만 두고 채팅 · 화면에 붙여넣지 않는다):
//   node --env-file=.env.local scripts/run-ai-compare.ts              # 드라이런 (호출 없음) — 키가 들어갔는지(있음 · 없음)도 보여 준다
//   --rehearsal                                                       # 리허설: 네트워크 · 키 · 비용 없이 같은 흐름(생성 → 파일 저장 → 화면용 원본)을 모의 글로 끝까지 돈다. 결과 폴더 이름이 rehearsal-로 시작한다
//   --rehearsal-fail                                                  # 리허설 + 일부러 검사에 걸리는 글: 실패했을 때 이유 · 글이 저장되고 화면에 나오는지 시험 (호출 없음)
//   --persona P01                                                     # 가상 인물 한 명만 (원인을 볼 때 비용을 줄인다)
//   --already-spent-krw 621                                           # 같은 단계에서 이미 쓴 금액(원). 승인 총액(3,000원)에서 빼고 남은 만큼만 하드스톱 한도로 쓴다
//   --only A                                                          # 한 모델만(A=Claude, B=GPT). 그 모델의 키만 있으면 되고 비용은 절반 정도이며, 이름을 가린 비교는 아니다
//   node --env-file=.env.local scripts/run-ai-compare.ts --stage stage-1 --execute --approved-cap-krw 3000 --approved-on 2026-10-13
//
// 키(.env.local): ANTHROPIC_API_KEY (후보 A) · OPENAI_API_KEY (후보 B). 값은 이 스크립트가 출력하지 않는다.
// 결과 폴더: pilot-data/ai-compare/<단계>-<시각>/ (저장소에 올라가지 않는 폴더)
//   reports/<인물>-X.json · -Y.json : 실제 미유 리포트 화면(개발용 /dev/compare)이 읽는 원본
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
import { composeMockReading } from "../lib/report/reading/mock-model.ts";
import { renderReadingMarkdown } from "../lib/report/reading/render-text.ts";
import { sampleReadingReport } from "../lib/samples/sample-reading-report.ts";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const stageName = arg("--stage") ?? "stage-1";
const variant = (arg("--variant") ?? "reading-v1") as CompareVariant;
if (!["reading-v1", "personal-v2"].includes(variant)) throw new Error("--variant 은 reading-v1(기본) 또는 personal-v2만 쓸 수 있습니다.");
const rehearsalFail = args.includes("--rehearsal-fail"); // 리허설에서 일부러 검사에 걸리는 글을 돌려줘 실패 경로(이유 · 글 저장 · 화면 안내)를 시험한다
const rehearsal = args.includes("--rehearsal") || rehearsalFail;
const only = arg("--only");
if (only !== undefined && only !== "A" && only !== "B") throw new Error("--only 는 A(Claude) 또는 B(GPT)만 쓸 수 있습니다.");
const stage = COMPARE_STAGES.find((s) => s.name === stageName);
if (!stage) throw new Error(`알 수 없는 단계: ${stageName} (${COMPARE_STAGES.map((s) => s.name).join(" · ")})`);
const won = (x: number) => `${Math.round(x).toLocaleString("ko-KR")}원`;
const now = new Date();
const settings = { fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE };
const personaArg = arg("--persona");
const personas = buildPersonas(stage.personaCount).filter((p) => !personaArg || p.id === personaArg);
if (personas.length === 0) throw new Error(`--persona ${personaArg} 인물이 없습니다 (${buildPersonas(stage.personaCount).map((p) => p.id).join(" · ")}).`);
// 같은 단계에서 이미 쓴 금액 — 승인 총액에서 빼고 남은 만큼만 쓴다 (한 번에 3,000원씩 다시 승인되는 것처럼 쓰지 않게)
const alreadySpent = Number(arg("--already-spent-krw") ?? 0);
if (!Number.isFinite(alreadySpent) || alreadySpent < 0 || alreadySpent >= stage.capKrw) throw new Error(`--already-spent-krw 는 0 이상, ${stage.capKrw}원 미만의 숫자여야 합니다.`);
const remainingCap = stage.capKrw - alreadySpent;
const chosen = AI_CANDIDATES.filter((c) => !only || c.key === only);
const solo = chosen.length === 1;

const plan = planStage({ stage: stage.name, capKrw: remainingCap, personas, candidates: chosen.map((c) => ({ key: c.key, price: c.price })), settings, now, variant });
console.log(`# ${solo ? `${stage.label.split(":")[0]}: 가상 인물 ${personas.length}명 × ${chosen[0].company} 1개 = 생성 ${personas.length}건 (한 모델만 — 이름을 가린 비교가 아님)` : stage.label}`);
console.log(`- 비교 대상: **개인 통합 리포트**(9,900원 상품) — ${variant === "reading-v1" ? "읽기 구조(reading-v1, 지금 제품 형식)" : "이전 형식(personal-v2)"}. 고민 반영 리포트(4,900원)는 이 비교에 넣지 않았다(지시문이 아직 옛 규칙이라 검증하지 않음).`);
console.log("- 인물 1명은 '알려 준 고민'이 있어 개인 통합 리포트 안의 '알려 주신 고민까지 반영한 해석' 구역이 함께 나오지만, 그것이 고민 반영 리포트 상품은 아니다.");
for (const c of chosen) console.log(`- 후보 ${c.key}: ${c.company} ${c.modelId} (입력 $${c.price.inputUsdPerMTok} · 출력 $${c.price.outputUsdPerMTok} / 100만 토큰) — 생각 · 추론 강도 중간`);
console.log(`- 예상 비용(평소 수준): ${won(plan.expectedKrw)} · 모든 생성이 한 번에 끝나는 최악: ${won(plan.firstCallWorstKrw)} · 모두 고쳐 쓰기까지 가는 최악: ${won(plan.twoRoundWorstKrw)}`);
console.log(`- 하드스톱 한도: ${won(remainingCap)}${alreadySpent > 0 ? ` (승인 총액 ${won(stage.capKrw)} − 이미 쓴 ${won(alreadySpent)})` : ""} (환율 ${settings.fxKrwPerUsd.toLocaleString("ko-KR")}원/달러 · 여유율 ${Math.round((settings.surcharge - 1) * 100)}% 가정 — 실제 청구는 제공사 콘솔에서 확인)`);

// 키가 들어갔는지(있음 · 없음)만 보여 준다 — 값은 출력하지 않고, 이 확인으로는 어떤 호출도 하지 않는다. .env.local 을 읽으려면 node --env-file=.env.local 로 실행한다
console.log(`- 키 입력 확인: 후보 A(ANTHROPIC_API_KEY) ${process.env.ANTHROPIC_API_KEY ? "있음" : "없음"} · 후보 B(OPENAI_API_KEY) ${process.env.OPENAI_API_KEY ? "있음" : "없음"}${process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY ? "" : " (아직 키를 넣지 않았거나 --env-file=.env.local 없이 실행했습니다)"}`);

if (!args.includes("--execute") && !rehearsal) {
  console.log("\n호출하지 않았습니다 (승인 전 드라이런). 실행하려면 운영자가 승인한 뒤 --execute 와 승인 금액 · 날짜를 직접 적어야 합니다.");
  process.exit(0);
}
if (rehearsal && args.includes("--execute")) {
  console.error("중단: --rehearsal 과 --execute 는 함께 쓰지 않습니다 (리허설은 호출하지 않습니다).");
  process.exit(1);
}
if (rehearsal && variant !== "reading-v1") {
  console.error("중단: 리허설은 reading-v1 지시문에서만 쓸 수 있습니다.");
  process.exit(1);
}

// ── 여기부터는 운영자가 승인한 뒤에만 (리허설은 네트워크 · 키 없이 모의 응답으로 같은 흐름만 시험한다) ──
const approvedCap = rehearsal ? stage.capKrw : Number(arg("--approved-cap-krw"));
const approvedOn = rehearsal ? "2026-10-13" : arg("--approved-on");
if (!Number.isFinite(approvedCap) || !approvedOn || !/^\d{4}-\d{2}-\d{2}$/.test(approvedOn)) {
  console.error("\n중단: 실제 호출에는 운영자가 승인한 금액과 날짜를 함께 적어야 합니다 (--approved-cap-krw 3000 --approved-on 2026-10-13). 아무것도 호출하지 않았습니다.");
  process.exit(1);
}
const keys = { A: process.env.ANTHROPIC_API_KEY, B: process.env.OPENAI_API_KEY } as const;
if (!rehearsal) console.log(`\n키 설정: 후보 A(ANTHROPIC_API_KEY) ${keys.A ? "있음" : "없음"} · 후보 B(OPENAI_API_KEY) ${keys.B ? "있음" : "없음"}`);
const missing = rehearsal ? [] : chosen.filter((c) => !keys[c.key]);
if (missing.length > 0) {
  console.error(`중단: ${missing.map((c) => `후보 ${c.key}(${c.key === "A" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"})`).join(" · ")}의 키가 필요합니다. .env.local 에 직접 입력한 뒤 다시 실행하세요.${solo ? "" : " 한 모델만 먼저 실행하려면 --only A 또는 --only B 를 붙입니다."} 아무것도 호출하지 않았습니다.`);
  process.exit(1);
}

/** 리허설용 가짜 fetch — 제공사 응답 모양으로 모의 글을 돌려준다 (네트워크를 쓰지 않는다) */
function rehearsalFetch(kind: "anthropic" | "openai") {
  return async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { messages?: { content: string }[]; input?: { content: string }[] };
    const text = rehearsalFail ? '{"headline":"일부러 검사에 걸리게 만든 모의 글","blocks":[]}' : JSON.stringify(composeMockReading((body.messages ?? body.input)![0].content));
    const usage = { input_tokens: 15000, output_tokens: 8000 };
    const json = kind === "anthropic" ? { content: [{ type: "text", text }], usage } : { output: [{ type: "message", content: [{ type: "output_text", text }] }], usage };
    return { ok: true, status: 200, json: async () => json };
  };
}
if (rehearsal) console.log("\n리허설: 네트워크 · 키 · 비용 없이 모의 글로 같은 흐름을 끝까지 시험합니다 (실제 AI 글이 아닙니다).");

const candidates: CompareCandidate[] = chosen.map((c) => ({
  key: c.key,
  price: c.price,
  model: c.key === "A" ? createAnthropicModel({ apiKey: keys.A ?? "rehearsal", model: c.modelId, effort: "medium", ...(rehearsal ? { fetch: rehearsalFetch("anthropic") as never } : {}) }) : createOpenAiModel({ apiKey: keys.B ?? "rehearsal", model: c.modelId, effort: "medium", ...(rehearsal ? { fetch: rehearsalFetch("openai") as never } : {}) }),
}));
const guard = new BudgetGuard({ capKrw: remainingCap, ...settings });
const blindSeed = Number(approvedOn.replaceAll("-", ""));

let result;
try {
  // 호출 한 번의 제한 시간: 긴 글 + 생각 · 추론 시간을 고려해 5분 (기본 2분이면 정상 응답도 시간 초과로 끊겨 비용만 나간다)
  result = await runStage({ stage: { name: stage.name, capKrw: stage.capKrw }, personas, candidates, guard, approval: { stage: stage.name, approvedCapKrw: approvedCap, approvedOn }, now, variant, blindSeed, callTimeoutMs: 300_000, repairRepeats: true });
} catch (e) {
  console.error(`중단: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
  process.exit(1);
}

const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
const dir = join("pilot-data", "ai-compare", `${rehearsal ? "rehearsal-" : ""}${stage.name}-${stamp}`);
mkdirSync(join(dir, "blind"), { recursive: true });
mkdirSync(join(dir, "reports"), { recursive: true });

// 저장 1단계 — 돈을 쓰고 받은 원본부터 먼저 남긴다 (이 뒤의 읽기용 파일을 만들다 오류가 나도 결과를 잃지 않게)
for (const run of result.runs) {
  if (!run.report || !isReadingReport(run.report)) continue;
  // 실제 미유 리포트 화면에서 읽기 위한 원본 (개발용 화면 /dev/compare 가 읽는다). 후보 이름은 담기지 않는다
  writeFileSync(join(dir, "reports", `${run.persona}-${run.blind}.json`), JSON.stringify(run.report));
}
writeFileSync(join(dir, "key-open-after-scoring.json"), JSON.stringify(result.blindKey, null, 2));
writeFileSync(
  join(dir, "cost-and-checks.json"),
  JSON.stringify(
    {
      stage: result.stage,
      variant,
      spentKrw: Math.round(result.spentKrw * 100) / 100,
      alreadySpentKrw: alreadySpent,
      remainingCapAtStartKrw: remainingCap,
      stoppedByBudget: result.stoppedByBudget,
      estimateRatio: result.estimateRatio,
      crossPersonOverlap: result.crossPersonOverlap,
      // 글 내용(attempts[].text)은 여기에 싣지 않는다 — 걸린 이유(errors)만. 글은 failed/ 폴더에 따로 둔다
      runs: result.runs.map(({ report, attempts, ...rest }) => ({ ...rest, attempts: attempts.map((a) => ({ round: a.round, errors: a.errors })), hasReport: report !== null })),
    },
    null,
    2,
  ),
);

// 저장 2단계 — 읽기 · 채점용 파일. 하나가 실패해도 이미 저장한 원본은 그대로이고 나머지를 계속 만든다
const safely = (what: string, fn: () => void) => {
  try {
    fn();
  } catch (e) {
    console.error(`경고: ${what} 파일을 만들지 못했습니다 (${e instanceof Error ? e.message : "알 수 없는 오류"}). 원본(reports 폴더 · cost-and-checks.json)은 저장돼 있습니다.`);
  }
};
safely("검사에 걸린 글", () => {
  // 실패 원인을 보려는 진단용 — 가상 인물의 글이다. 이 폴더는 저장소에 올라가지 않는다
  for (const run of result.runs) {
    for (const a of run.attempts) {
      mkdirSync(join(dir, "failed"), { recursive: true });
      writeFileSync(join(dir, "failed", `${run.persona}-${run.blind}-round${a.round + 1}.txt`), `# 검사에 걸린 이유\n${a.errors.map((e) => `- ${e}`).join("\n")}\n\n# 그때의 글\n${a.text}\n`);
    }
  }
});
safely("이름을 가린 글", () => {
  for (const run of result.runs) {
    if (!run.report || !isReadingReport(run.report)) continue;
    writeFileSync(join(dir, "blind", `${run.persona}-${run.blind}.md`), renderReadingMarkdown(run.report));
  }
});
safely("사람이 쓴 예시", () => writeFileSync(join(dir, "reference-사람이-쓴-예시.md"), `> 사람이 쓴 목표 수준 예시입니다 (가상 인물 서윤). 채점할 때 기준으로 함께 읽으세요 — 두 후보 중 하나가 아닙니다.\n\n${renderReadingMarkdown(sampleReadingReport)}`));
safely("채점표", () => {
const rows = personas.flatMap((p) => (solo ? ["X"] : ["X", "Y"]).map((b) => `| ${p.id} | ${b} |  |  |  |  |  |  |  |`)).join("\n");
writeFileSync(
  join(dir, "evaluation-sheet.md"),
  `# 채점표 — ${stage.label}

${solo ? `이번에는 한 모델(${chosen[0].company})만 실행했습니다. 이름을 가린 비교가 아니며 글은 모두 X입니다.` : "후보 이름은 가려져 있습니다 (X · Y). 채점이 끝나기 전에는 `key-open-after-scoring.json` 을 열지 않습니다."}
사람이 쓴 예시(\`reference-사람이-쓴-예시.md\`)를 먼저 읽고 기준으로 삼습니다. **${result.runs.length}건으로는 순위를 정하지 않습니다** — 작동하는지 · 비용이 예상대로인지 · 명백한 결함이 있는지만 봅니다.

## 먼저 확인 (있으면 그 후보는 지시문을 고쳐 다시 확인)

- [ ] 지어낸 사건 · 날짜 · 직업 · 나이가 있는가
- [ ] 알려 준 고민을 사주로 알아맞힌 것처럼 쓴 문장이 있는가
- [ ] 상대의 마음 · 나이 · 직업 · 만날 날짜를 쓴 곳이 있는가
- [ ] 본문에 사주 용어(일간 · 대운 등) · 점수 · 퍼센트가 나오는가

## 1~5점 (인물마다 ${solo ? "X" : "X · Y"})

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
});

const ok = result.runs.filter((r) => r.status === "ok").length;
console.log(`\n완료: 생성 ${ok}/${result.runs.length}건 · 쓴 비용 ${won(result.spentKrw)} (이번 실행 한도 ${won(remainingCap)})${result.stoppedByBudget ? " · 예산 하드스톱으로 일부 중단" : ""}`);
for (const r of result.runs) console.log(`- ${r.persona} ${r.blind}: ${r.status}${r.errorCode ? ` (${r.errorCode})` : ""} · 호출 ${r.calls}회 · 첫 시도 형식 통과 ${r.firstPassValid === null ? "-" : r.firstPassValid ? "예" : "아니오"} · ${won(r.costKrw)}`);
for (const r of result.runs.filter((x) => x.status === "failed")) {
  console.log(`\n[${r.persona} ${r.blind}] 실패 이유 (검사 문구, 글 내용 아님):`);
  r.attempts.forEach((a, i) => console.log(`  ${i + 1}번째 응답 — 걸린 항목 ${a.errors.length}개: ${a.errors.slice(0, 6).join(" / ")}${a.errors.length > 6 ? " …" : ""}`));
  if (r.attempts.length === 0 && r.errorMessage) console.log(`  ${r.errorMessage}`);
}
const runId = dir.split(/[\\/]/).pop();
console.log(`\n결과 폴더: ${dir}\n실제 미유 리포트 화면으로 읽기: 이 결과 폴더가 있는 miyu 폴더에서 npm.cmd run dev 를 켠 뒤(켜면 나오는 Local 주소의 번호를 쓴다) http://localhost:3000/dev/compare 목록을 열거나, 바로 ${personas.map((p) => `http://localhost:3000/dev/compare/${runId}/${p.id}-X`).join(" · ")}${solo ? "" : " (· -Y)"} 을 연다 (${solo ? "한 모델만 실행해 글은 모두 X" : "이름이 가려진 X · Y"})."${solo ? "" : "\n채점이 끝나기 전에는 key-open-after-scoring.json 을 열지 마세요."}`);
