// 운영자 본인 입력 실제 AI 시험 — 이 PC의 22문항 화면(/analyze)에서 운영자가 직접 답한 입력으로 실제 Claude(claude-sonnet-5-5)를 **한 번만** 부른다.
// 지시문(--variant): story-7(7개 고정 대주제, 기본 — 승인 단계 story7-own) 또는 story-v1(영역별 이야기 — 승인 단계 story-own, 이미 마침).
//
// 지키는 것(코드가 확인하고 어기면 호출하지 않는다):
//  · 호출은 첫 응답 1회뿐 — 형식 검사에 걸려도 자동으로 고쳐 쓰지 않고(maxRepairs 0), 제공사 일시 오류도 다시 시도하지 않는다(maxRetries 0). 걸린 글은 그대로 저장한다.
//  · 승인 범위(lib/config/ai-candidates.ts의 story7-own · story-own): 해당 지시문 · claude-sonnet-5-5 · 누적 6,000원(--already-spent-krw를 반드시 적는다) · 1회 상한 1,234.04원(재작성까지 가는 최악 비용을 반올림 없이 비교).
//  · 입력은 이 PC의 pilot-data/own-input 파일뿐 — 운영 DB에 저장하지 않고, 결과 폴더(pilot-data/ai-compare/story7-own-… · story-own-…)도 저장소에 올라가지 않는다.
//  · 키는 .env.local의 ANTHROPIC_API_KEY — 이 스크립트는 값을 출력하지 않는다.
//
// 사용 (miyu 폴더, PowerShell):
//   node --env-file=.env.local scripts/run-own-story.ts --already-spent-krw 3108            # 드라이런(호출 없음): 입력 확인 파일 만들기 + 비용 · 승인 범위 점검 (기본: --variant story-7)
//   node scripts/run-own-story.ts --rehearsal --already-spent-krw 3108                      # 리허설(모의 글 · 키 · 비용 없음): 같은 흐름 · 파일 · 화면을 끝까지 시험
//   node --env-file=.env.local scripts/run-own-story.ts --already-spent-krw 3108 --execute --approved-cap-krw 6000 --approved-on 2026-10-17   # 실제 호출 1회
//   --birth-time-unknown  같은 입력에서 출생 시각만 비워 시주 없이 읽는 경우(세 기둥)로 실행 — 드라이런 · 리허설 · 실행 모두 같은 옵션(입력 파일은 바뀌지 않는다)
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AI_CANDIDATES, COMPARE_STAGES } from "../lib/config/ai-candidates.ts";
import { createAnthropicModel } from "../lib/integrations/ai/providers.ts";
import { BudgetGuard, DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE } from "../lib/report/ai/budget.ts";
import { checkStageRestriction, planStage, runStage } from "../lib/report/ai/compare-plan.ts";
import { describeOwnInput, ownPersona, ownReportInput, parseOwnCapture, reviewOwnDraft } from "../lib/report/ai/own-run.ts";
import { createMockModel } from "../lib/report/ai/mock-model.ts";
import { isReadingReport } from "../lib/report/generator.ts";
import { renderStory7DraftMarkdown, renderStoryDraftMarkdown } from "../lib/report/reading/render-draft.ts";
import { renderReadingMarkdown } from "../lib/report/reading/render-text.ts";
import { typeTitleFor } from "../lib/report/type-title.ts";
import type { Story7DraftV1, StoryDraftV1 } from "../lib/report/reading/types.ts";
import { extractJson } from "../lib/report/ai/generator.ts";
import { normalizeStory7Draft } from "../lib/report/reading/story7-validate.ts";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const won = (x: number) => `${Math.round(x).toLocaleString("ko-KR")}원`;
const rehearsal = args.includes("--rehearsal");
const execute = args.includes("--execute");
const variant = (arg("--variant") ?? "story-7") as "story-v1" | "story-7";
if (variant !== "story-v1" && variant !== "story-7") {
  console.error(`\n중단: --variant 는 story-7 또는 story-v1 이어야 합니다(지금 ${String(variant)}).\n아무것도 호출하지 않았습니다.`);
  process.exit(1);
}
const stage = COMPARE_STAGES.find((s) => s.name === (variant === "story-7" ? "story7-own" : "story-own"))!;
const candidate = AI_CANDIDATES.find((c) => c.key === "A")!;
const now = new Date();
const settings = { fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE };
const inputPath = arg("--input") ?? join("pilot-data", "own-input", "latest.json");

function stop(message: string): never {
  console.error(`\n중단: ${message}\n아무것도 호출하지 않았습니다.`);
  process.exit(1);
}
if (rehearsal && execute) stop("--rehearsal 과 --execute 는 함께 쓰지 않습니다(리허설은 호출하지 않습니다).");

// 1) 입력 읽기 — 이 PC의 파일(운영자가 /analyze에서 직접 푼 것)
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(inputPath, "utf8"));
} catch {
  stop(`입력 파일(${inputPath})을 읽지 못했습니다. 먼저 .env.local에 MIYU_OWN_INPUT_CAPTURE=yes를 적고 npm.cmd run dev로 http://localhost:3000/analyze 에서 22문항에 끝까지 답해 결과(무료 요약) 화면까지 가야 파일이 만들어집니다.`);
}
const capture0 = parseOwnCapture(raw);
if (!capture0) stop("입력 파일의 모양이 올바르지 않습니다(기본 정보 · 22개 응답). /analyze에서 다시 끝까지 답해 주세요.");
// --birth-time-unknown: 같은 입력에서 출생 시각만 비워 시주 없이(세 기둥으로) 읽는 경우를 시험한다 — 입력 파일은 바꾸지 않고 이 실행에서만 비운다(2026-10-17, 출생시간 미상 처리 확인용)
const birthTimeUnknown = args.includes("--birth-time-unknown");
const capture = birthTimeUnknown ? { ...capture0, info: { ...capture0.info, birthTimeUnknown: true, birthTime: "" } } : capture0;
const built = await ownReportInput(capture, now);
if (!built.ok) stop(built.message);
const persona = ownPersona(built.input);

// 2) 비용 · 승인 범위
const alreadySpent = Number(arg("--already-spent-krw") ?? 0);
if (!Number.isFinite(alreadySpent) || alreadySpent < 0 || alreadySpent >= stage.capKrw) stop(`--already-spent-krw 는 0 이상, ${stage.capKrw}원 미만의 숫자여야 합니다.`);
const remainingCap = stage.capKrw - alreadySpent;
const plan = planStage({ stage: stage.name, capKrw: remainingCap, personas: [persona], candidates: [{ key: candidate.key, price: candidate.price }], settings, now, variant });
// 이 시험은 호출을 한 번만 하므로(재작성 · 재시도 없음) 이 실행이 쓸 수 있는 최악 비용은 "첫 호출의 최악"이다 — 승인의 1회 상한(1,234.04원, 재작성까지 가는 최악 기준)보다 작은 값이라 승인 범위 안이다.
// 참고로 재작성까지 가는 최악도 아래에 함께 보여 준다(운영자가 읽은 뒤 두 번째 호출을 따로 정할 때의 기준).
const issues = checkStageRestriction(stage, { variant, only: "A", persona: "OWN", alreadySpentGiven: arg("--already-spent-krw") !== undefined, twoRoundWorstKrw: plan.firstCallWorstKrw, execute });

// 3) 입력 확인 파일 — 호출 전에 항상 만든다(드라이런에서도). 이 파일의 내용이 AI에 가는 것과 같은 함수로 만들어진다
const described = describeOwnInput({ input: built.input, capture, now, variant });
const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
const dir = join("pilot-data", "ai-compare", `${rehearsal ? "rehearsal-" : ""}${stage.name}-${stamp}`);
const checkFile = join("pilot-data", "own-input", "input-check.md");
mkdirSync(join("pilot-data", "own-input"), { recursive: true });
writeFileSync(checkFile, described.markdown);

console.log(`# ${variant} 운영자 본인 입력 실제 AI 시험 (호출 1회 · 재작성 자동 실행 없음)`);
console.log(`- 모델: ${candidate.company} ${candidate.modelId}(후보 A, 생각 강도 중간) · 지시문: ${variant}${variant === "story-7" ? "(7개 고정 대주제)" : "(영역별 이야기)"}`);
console.log(`- 입력: ${inputPath}${capture.capturedAt ? ` (${capture.capturedAt}에 푼 응답)` : ""} · 근거 ${described.evidence.length}개 · 입력 ≈ ${described.estInputTokens.toLocaleString("ko-KR")}토큰(어림)`);
console.log(`- 입력 확인 파일: ${checkFile} ← **AI에 가는 근거를 한 개씩 볼 수 있습니다. 실행 전에 열어서 확인해 주세요.**`);
console.log(`- 예상 비용(평소 수준, 재지 않은 어림): ${won(plan.expectedKrw)} · 호출 1회 최악: ${won(plan.firstCallWorstKrw)} · (참고) 재작성까지 가는 최악 ${won(plan.twoRoundWorstKrw)} — 이 시험은 재작성을 하지 않습니다`);
console.log(`- 한도: 승인 총액 ${won(stage.capKrw)} − 이미 쓴 ${won(alreadySpent)} = 남은 ${won(remainingCap)} · 1회 상한 ${stage.restrict!.runCeilingKrw.toLocaleString("ko-KR")}원 (환율 ${settings.fxKrwPerUsd.toLocaleString("ko-KR")}원/달러 · 여유율 ${Math.round((settings.surcharge - 1) * 100)}% 가정)`);
console.log(`- 승인 범위: ${stage.restrict!.variant} · 후보 ${stage.restrict!.only} · 본인 입력 1건 · 승인된 실행 ${stage.restrict!.runsDone}/${stage.restrict!.runsApproved}회 마침`);
if (issues.length > 0) {
  console.error("\n승인 범위 확인 — 실행할 수 없습니다:");
  for (const i of issues) console.error(`- ${i}`);
  console.error("아무것도 호출하지 않았습니다.");
  process.exit(1);
}
console.log(`- 키 입력 확인: ANTHROPIC_API_KEY ${process.env.ANTHROPIC_API_KEY ? "있음" : "없음"}${process.env.ANTHROPIC_API_KEY ? "" : " (아직 넣지 않았거나 --env-file=.env.local 없이 실행했습니다)"}`);

if (!execute && !rehearsal) {
  console.log("\n호출하지 않았습니다 (드라이런). 입력 확인 파일을 읽고 이상이 없으면, 운영자가 승인한 금액 · 날짜를 직접 적어 --execute 로 실행합니다.");
  process.exit(0);
}

// 4) 여기부터 호출(리허설은 모의 모델 — 키 · 네트워크 · 비용 없음)
const approvedCap = rehearsal ? stage.capKrw : Number(arg("--approved-cap-krw"));
const approvedOn = rehearsal ? now.toISOString().slice(0, 10) : arg("--approved-on");
if (!Number.isFinite(approvedCap) || !approvedOn || !/^\d{4}-\d{2}-\d{2}$/.test(approvedOn)) stop("실제 호출에는 운영자가 승인한 금액과 날짜를 함께 적어야 합니다 (--approved-cap-krw 6000 --approved-on 2026-10-17).");
if (!rehearsal) {
  if (approvedCap !== stage.capKrw) stop(`승인 금액은 ${stage.capKrw}원(누적 총액)으로 적어야 합니다(지금 ${approvedCap}원).`);
  const ageDays = (now.getTime() - new Date(`${approvedOn}T00:00:00+09:00`).getTime()) / 86_400_000;
  if (!(ageDays >= 0 && ageDays <= 7)) stop(`승인일(${approvedOn})이 오늘부터 7일 안이 아닙니다. 운영자가 다시 승인해야 합니다.`);
  if (!process.env.ANTHROPIC_API_KEY) stop("ANTHROPIC_API_KEY가 필요합니다. .env.local에 직접 입력한 뒤 --env-file=.env.local 로 다시 실행하세요.");
}

const model = rehearsal ? createMockModel() : createAnthropicModel({ apiKey: process.env.ANTHROPIC_API_KEY!, model: candidate.modelId, effort: "medium" });
// 한 번 실행의 상한도 하드스톱으로 쓴다 — 총액 잔액이 더 커도 상한을 넘기는 호출은 제공사에 보내지 않는다
const guard = new BudgetGuard({ capKrw: Math.min(remainingCap, stage.restrict!.runCeilingKrw), ...settings });
console.log(rehearsal ? "\n리허설: 모의 글로 같은 흐름을 시험합니다(실제 AI 글이 아닙니다)." : "\n실제 호출을 시작합니다(1회). 보통 몇 분 걸립니다 — 창을 닫지 마세요.");

mkdirSync(join(dir, "attempts"), { recursive: true });
let result;
try {
  result = await runStage({
    stage: { name: stage.name, capKrw: stage.capKrw },
    personas: [persona],
    candidates: [{ key: "A", model, price: candidate.price }],
    guard,
    approval: { stage: stage.name, approvedCapKrw: approvedCap, approvedOn },
    now,
    variant,
    blindSeed: 1,
    callTimeoutMs: 300_000,
    repairRepeats: false,
    maxRepairs: 0,
    maxRetries: 0,
  });
} catch (e) {
  console.error(`중단: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
  process.exit(1);
}
const run = result.runs[0]!;

// 저장 1단계 — 돈을 쓰고 받은 원문부터 먼저(통과 여부와 무관하게). 이 뒤의 파일을 만들다 오류가 나도 글을 잃지 않는다
run.attempts.forEach((a, i) => writeFileSync(join(dir, "attempts", `round${i + 1}.txt`), a.text));
writeFileSync(join(dir, "input-check.md"), described.markdown);
copyFileSync(inputPath, join(dir, "input.json")); // 이 폴더도 저장소에 올라가지 않는다 — 무료 리포트를 같은 입력으로 나란히 보여 주려고 둔다
if (run.report && isReadingReport(run.report)) writeFileSync(join(dir, "report.json"), JSON.stringify(run.report));
writeFileSync(
  join(dir, "cost-and-checks.json"),
  JSON.stringify(
    {
      stage: stage.name,
      variant,
      model: candidate.modelId,
      rehearsal,
      calls: run.calls,
      spentKrw: Math.round(result.spentKrw * 100) / 100,
      alreadySpentKrw: alreadySpent,
      cumulativeSpentKrw: Math.round((alreadySpent + result.spentKrw) * 100) / 100,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      latencyMs: run.latencyMs,
      result: run.status === "ok" ? "ok" : "failed",
      firstPassValid: run.firstPassValid,
      failure: run.status === "ok" ? null : { code: run.errorCode, message: run.errorMessage, errors: run.attempts.flatMap((a) => a.errors).slice(0, 30) },
      warnings: run.attempts.flatMap((a) => a.warnings ?? []),
      depth: run.depth,
    },
    null,
    2,
  ),
);

// 저장 2단계 — 읽기용 파일(하나가 실패해도 원문은 이미 저장돼 있다)
const safely = (what: string, fn: () => void) => {
  try {
    fn();
  } catch (e) {
    console.error(`경고: ${what} 파일을 만들지 못했습니다(${e instanceof Error ? e.message : "알 수 없는 오류"}). 원문(attempts)은 저장돼 있습니다.`);
  }
};
const lastText = run.attempts[run.attempts.length - 1]?.text;
let draft: unknown = null;
try {
  // 닫는 괄호만 빠진 글은 보충해 읽고(글자는 그대로), 조언 행동이 7번 장 안에 있으면 바깥으로 옮긴다 — 생성기가 검사 직전에 하는 것과 같다
  draft = lastText ? normalizeStory7Draft(extractJson(lastText)) : null;
} catch {
  draft = null;
}
safely("읽는 순서로 풀어 쓴 글", () => {
  if (run.report && isReadingReport(run.report)) writeFileSync(join(dir, "readable.md"), renderReadingMarkdown(run.report, { typeTitle: typeTitleFor(built.input, built.input.summary.tendency.name) }));
  else if (draft && Array.isArray((draft as { sections?: unknown }).sections)) writeFileSync(join(dir, "readable.md"), `> 형식 검사에 걸려 저장되지 않은 글의 원문을 읽는 순서로 풀어 쓴 것입니다(내용은 그대로).\n\n${renderStory7DraftMarkdown(draft as Story7DraftV1, { name: capture.info.nickname, typeTitle: typeTitleFor(built.input, built.input.summary.tendency.name) })}`);
  else if (draft && Array.isArray((draft as { areas?: unknown }).areas)) writeFileSync(join(dir, "readable.md"), `> 형식 검사에 걸려 저장되지 않은 글의 원문을 읽는 순서로 풀어 쓴 것입니다(내용은 그대로).\n\n${renderStoryDraftMarkdown(draft as StoryDraftV1)}`);
  else writeFileSync(join(dir, "readable.md"), `> 모델이 돌려준 글을 읽는 순서로 풀어 쓰지 못했습니다(JSON 모양이 아님). attempts/round1.txt 원문을 직접 읽어 주세요.\n\n${lastText ?? ""}`);
});
safely("읽기 전 보조 지표", () => writeFileSync(join(dir, "metrics.md"), draft ? reviewOwnDraft(draft, described.evidence) : "# 읽기 전 보조 지표\n\n- 글이 없어 지표를 만들지 못했습니다.\n"));

console.log(`\n완료: ${run.status === "ok" ? "형식 검사 통과 · 글 저장됨" : "형식 검사 불통과 · 저장되지 않음(원문은 읽을 수 있습니다)"} · 호출 ${run.calls}회 · 쓴 비용 ${won(result.spentKrw)} · 누적 ${won(alreadySpent + result.spentKrw)} (승인 총액 ${won(stage.capKrw)})`);
const warned = run.attempts.flatMap((a) => a.warnings ?? []);
if (warned.length > 0) console.log(`경고(WARN) ${warned.length}건 — 저장을 막지 않는 읽기 쉬운 정도의 알림(용어 · 문단 길이)이라 자동으로 다시 쓰지 않았습니다. 목록은 metrics.md · cost-and-checks.json에 있습니다.`);
if (run.status !== "ok") console.log(`걸린 이유(검사 문구, 글 내용 아님): ${run.attempts.flatMap((a) => a.errors).slice(0, 6).join(" / ") || run.errorMessage || run.errorCode || "알 수 없음"}`);
const runId = dir.split(/[\\/]/).pop();
console.log(`\n결과 폴더: ${dir}\n읽기: npm.cmd run dev 를 켠 뒤 http://localhost:3000/dev/live/${runId}  (무료 리포트 · 심층 리포트 · 원문 전문 · 입력 확인 · 지표)\n재작성 · 다음 시험은 자동으로 하지 않았습니다 — 글을 읽고 판단한 뒤 알려 주세요.`);
