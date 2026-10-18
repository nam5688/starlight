// 궁합 실제 AI 시험 — 사주 궁합 · 리포트 궁합을 가상 인물로 실제 AI에 한 건씩 쓰게 하고, 원문 · 검사 결과 · 비용을 파일로 남긴다.
//
// 승인 전에는 아무것도 부르지 않는다:
//  · 기본(옵션 없음)은 호출 없는 계산(드라이런)만 한다 — 모델 · 입력 크기 · 최악 비용 · 승인 범위를 보여 준다.
//  · 실제 호출은 --execute 와 함께 운영자가 승인한 금액 · 날짜(--approved-cap-krw · --approved-on)를 직접 적어야 시작한다.
//    승인된 실행 횟수가 0이거나 모두 마쳤거나, 1회 상한이 정해지지 않았거나, 최악 비용이 상한을 넘으면 첫 호출 전에 멈춘다(드라이런에서도 이유가 보인다).
//  · 모든 호출은 예산 관리기(BudgetGuard)가 최악 비용을 먼저 잡아, 승인한 한도를 넘길 호출은 제공사에 보내지 않는다.
//
// 실행 (miyu 폴더, PowerShell — 키는 .env.local 에만 두고 채팅 · 화면에 붙여넣지 않는다):
//   node --env-file=.env.local scripts/run-compat-live.ts --stage compat-saju-p1 --already-spent-krw 2468            # 드라이런 (호출 없음)
//   node scripts/run-compat-live.ts --stage compat-pair-p1 --already-spent-krw 2468 --rehearsal                      # 리허설: 키 · 비용 없이 모의 글로 같은 흐름(생성 → 파일 저장)을 시험한다 (호출 없음)
//   node --env-file=.env.local scripts/run-compat-live.ts --stage compat-saju-p1 --already-spent-krw 2468 --execute --approved-cap-krw <승인 총액> --approved-on <승인한 날>
//
// 결과 폴더: pilot-data/ai-compare/<단계>-<시각>/ (저장소에 올라가지 않는 폴더)
//   attempts/round<N>.txt : 모델이 돌려준 원문(검사에 걸린 것 포함) · report.json : 검사를 통과해 조립된 리포트 · readable.md : 읽는 순서로 푼 글 · cost-and-checks.json : 호출 수 · 토큰 · 비용 · 걸린 이유(글 내용 없음)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AI_CANDIDATES, COMPAT_LIVE_STAGES } from "../lib/config/ai-candidates.ts";
import { createAnthropicModel } from "../lib/integrations/ai/providers.ts";
import { BudgetGuard, DEFAULT_FX_KRW_PER_USD, DEFAULT_SURCHARGE, withBudget } from "../lib/report/ai/budget.ts";
import { createAiReportGenerator } from "../lib/report/ai/generator.ts";
import type { ModelRequest, ModelResult, TextModel } from "../lib/report/ai/model.ts";
import { createMockModel } from "../lib/report/ai/mock-model.ts";
import { checkCompatLiveRestriction, estimateLiveRun, liveCompatInput, livePairInput } from "../lib/report/compat/live-plan.ts";
import { CompatWriteError } from "../lib/report/compat/writer.ts";
import type { CompatReport, PairReport } from "../lib/report/compat/types.ts";
import type { AiUsageSample } from "../lib/report/generator.ts";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const stage = COMPAT_LIVE_STAGES.find((s) => s.name === arg("--stage"));
if (!stage) throw new Error(`--stage 는 ${COMPAT_LIVE_STAGES.map((s) => s.name).join(" · ")} 중 하나여야 합니다.`);
const rehearsal = args.includes("--rehearsal");
const execute = args.includes("--execute");
if (rehearsal && execute) {
  console.error("중단: --rehearsal 과 --execute 는 함께 쓰지 않습니다 (리허설은 호출하지 않습니다).");
  process.exit(1);
}
const won = (x: number) => `${Math.round(x).toLocaleString("ko-KR")}원`;
const candidate = AI_CANDIDATES[0];
const settings = { fxKrwPerUsd: DEFAULT_FX_KRW_PER_USD, surcharge: DEFAULT_SURCHARGE };
const alreadySpent = Number(arg("--already-spent-krw") ?? 0);
if (!Number.isFinite(alreadySpent) || alreadySpent < 0 || alreadySpent >= stage.capKrw) throw new Error(`--already-spent-krw 는 0 이상, ${stage.capKrw}원 미만의 숫자여야 합니다.`);
const remainingCap = stage.capKrw - alreadySpent;

const est = await estimateLiveRun(stage.kind, candidate.price, settings);
console.log(`# ${stage.label}`);
console.log(`- 모델: ${candidate.company} ${candidate.modelId} (입력 $${candidate.price.inputUsdPerMTok} · 출력 $${candidate.price.outputUsdPerMTok} / 100만 토큰) — 생각 강도 중간 · 가상 인물만(실제 고객 정보 없음)`);
console.log(`- 요청 크기: 지시문 ${est.systemChars.toLocaleString("ko-KR")}자 + 근거 ${est.userChars.toLocaleString("ko-KR")}자 ≈ 입력 ${est.inputTokens.toLocaleString("ko-KR")}토큰(보수적 추정)`);
console.log(`- 예상 비용: 평소 수준(재지 않은 어림) ${won(est.typicalKrw)} · 첫 호출 하나의 최악 ${won(est.firstWorstKrw)} · 생성 + 고쳐 쓰기 1회까지 가는 최악 ${won(est.twoRoundWorstKrw)}`);
console.log(`- 하드스톱 한도: ${won(Math.min(remainingCap, stage.restrict.runCeilingKrw > 0 ? stage.restrict.runCeilingKrw : remainingCap))} (승인 총액 ${won(stage.capKrw)} − 이미 쓴 ${won(alreadySpent)}${stage.restrict.runCeilingKrw > 0 ? ` · 1회 상한 ${won(stage.restrict.runCeilingKrw)}` : ""}) (환율 ${settings.fxKrwPerUsd.toLocaleString("ko-KR")}원/달러 · 여유율 ${Math.round((settings.surcharge - 1) * 100)}% 가정 — 실제 청구는 제공사 콘솔에서 확인)`);
console.log(`- 승인 범위: 승인된 실행 ${stage.restrict.runsDone}/${stage.restrict.runsApproved}회 마침 · 1회 상한 ${stage.restrict.runCeilingKrw > 0 ? won(stage.restrict.runCeilingKrw) : "정해지지 않음"}`);

const issues = checkCompatLiveRestriction(stage, { alreadySpentGiven: arg("--already-spent-krw") !== undefined, twoRoundWorstKrw: est.twoRoundWorstKrw, execute });
console.log(`- 키 입력 확인: ANTHROPIC_API_KEY ${process.env.ANTHROPIC_API_KEY ? "있음" : "없음"}`);
if (issues.length > 0) {
  console[execute ? "error" : "log"](`\n승인 범위 확인 — ${execute ? "실행할 수 없습니다" : "지금은 실행할 수 없는 상태입니다(드라이런은 계속됩니다)"}:`);
  for (const i of issues) console[execute ? "error" : "log"](`- ${i}`);
  if (execute) {
    console.error("아무것도 호출하지 않았습니다.");
    process.exit(1);
  }
}
if (!execute && !rehearsal) {
  console.log("\n호출하지 않았습니다 (승인 전 드라이런). 실행하려면 운영자가 승인한 뒤 코드의 승인 값(`lib/config/ai-candidates.ts`의 COMPAT_LIVE_STAGES)을 정하고 --execute 와 승인 금액 · 날짜를 직접 적어야 합니다.");
  process.exit(0);
}

// ── 여기부터는 운영자가 승인한 뒤에만 (리허설은 키 · 네트워크 없이 모의 글로 같은 흐름만 시험한다) ──
const approvedOn = rehearsal ? "2026-10-17" : arg("--approved-on");
const approvedCap = rehearsal ? stage.capKrw : Number(arg("--approved-cap-krw"));
if (!rehearsal) {
  if (!Number.isFinite(approvedCap) || approvedCap !== stage.capKrw || !approvedOn || !/^\d{4}-\d{2}-\d{2}$/.test(approvedOn)) {
    console.error(`\n중단: 실제 호출에는 승인한 총액(${stage.capKrw}원과 같아야 함)과 날짜를 함께 적어야 합니다 (--approved-cap-krw ${stage.capKrw} --approved-on YYYY-MM-DD). 아무것도 호출하지 않았습니다.`);
    process.exit(1);
  }
  const age = (Date.now() - Date.parse(`${approvedOn}T00:00:00+09:00`)) / 86_400_000;
  if (!(age >= -1 && age <= 7)) {
    console.error("\n중단: 승인한 날짜가 오늘 기준 7일 안이 아닙니다. 아무것도 호출하지 않았습니다.");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\n중단: ANTHROPIC_API_KEY 가 필요합니다. .env.local 에 직접 입력한 뒤 --env-file=.env.local 로 다시 실행하세요. 아무것도 호출하지 않았습니다.");
    process.exit(1);
  }
} else {
  console.log("\n리허설: 네트워크 · 키 · 비용 없이 모의 글로 같은 흐름을 끝까지 시험합니다 (실제 AI 글이 아닙니다).");
}

const guardCap = stage.restrict.runCeilingKrw > 0 ? Math.min(remainingCap, stage.restrict.runCeilingKrw) : remainingCap;
const guard = new BudgetGuard({ capKrw: guardCap, ...settings });
const attempts: { round: number; text: string; inputTokens: number | null; outputTokens: number | null }[] = [];
const raw: TextModel = rehearsal ? createMockModel() : createAnthropicModel({ apiKey: process.env.ANTHROPIC_API_KEY as string, model: candidate.modelId, effort: "medium", timeoutMs: 300_000 });
// 원문을 먼저 남기는 기록기 — 돈을 쓰고 받은 응답은 검사에 걸려도 버리지 않는다
const recorded: TextModel = {
  provider: raw.provider,
  model: raw.model,
  async complete(request: ModelRequest): Promise<ModelResult> {
    const result = await raw.complete(request);
    attempts.push({ round: attempts.length + 1, text: result.text, inputTokens: result.usage?.inputTokens ?? null, outputTokens: result.usage?.outputTokens ?? null });
    return result;
  },
};
const generator = createAiReportGenerator({ model: withBudget(recorded, guard, candidate.price), now: () => new Date(`${approvedOn}T00:00:00+09:00`), callTimeoutMs: 300_000 });
const usage: AiUsageSample[] = [];
const warned: string[] = [];
const ctx = { onUsage: (u: AiUsageSample) => usage.push(u), onAttempt: (a: { warnings?: string[] }) => warned.push(...(a.warnings ?? [])) };

let report: CompatReport | PairReport | null = null;
let failure: { code: string; message: string; errors: string[] } | null = null;
try {
  report = stage.kind === "saju" ? await generator.generateCompat!(liveCompatInput(), ctx) : await generator.generatePair!(livePairInput(), ctx);
} catch (e) {
  failure = e instanceof CompatWriteError ? { code: e.code, message: e.message, errors: e.errors } : { code: "ERROR", message: e instanceof Error ? e.message : "알 수 없는 오류", errors: [] };
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
const dir = join("pilot-data", "ai-compare", `${rehearsal ? "rehearsal-" : ""}${stage.name}-${stamp}`);
mkdirSync(join(dir, "attempts"), { recursive: true });
// 저장 1단계 — 돈을 쓰고 받은 원본부터
for (const a of attempts) writeFileSync(join(dir, "attempts", `round${a.round}.txt`), a.text);
if (report) writeFileSync(join(dir, "report.json"), JSON.stringify(report, null, 2));
const spent = guard.spentKrw;
writeFileSync(
  join(dir, "cost-and-checks.json"),
  JSON.stringify(
    {
      stage: stage.name,
      model: raw.model,
      rehearsal,
      calls: attempts.length,
      spentKrw: Math.round(spent * 100) / 100,
      alreadySpentKrw: alreadySpent,
      estimate: est,
      usage: usage.map((u) => ({ promptVersion: u.promptVersion, inputTokens: u.inputTokens, outputTokens: u.outputTokens, outcome: u.outcome, errorCode: u.errorCode ?? null })),
      result: report ? "ok" : "failed",
      // 걸린 이유(검사 문구, 글 내용 아님)
      failure,
      // 경고(WARN) — 저장을 막지 않고 자동 재작성도 하지 않은 읽기 쉬운 정도의 알림(설명 없는 용어 · 용어 개수 · 문단 문장 수)
      warnings: warned,
    },
    null,
    2,
  ),
);
if (report) {
  const lines = [`# ${stage.label}`, `\n> ${report.generated.provider === "mock" ? "모의 작성기의 자리 표시 글입니다 — 실제 AI 글이 아닙니다." : `실제 AI(${report.generated.model})가 쓴 글입니다.`}\n`, `## ${report.headline}\n`];
  for (const s of report.sections) lines.push(`### ${s.topic} — ${s.headline}\n`, ...s.paragraphs.map((p) => `${p}\n`));
  lines.push("## 두 분이 해 볼 수 있는 것\n");
  for (const [g, list] of Object.entries(report.steps)) {
    lines.push(`### ${g}\n`);
    for (const a of list) lines.push(`- **${a.title}** — ${a.detail}\n  - 건넬 말: ${a.say}`);
    lines.push("");
  }
  writeFileSync(join(dir, "readable.md"), lines.join("\n"));
}

console.log(`\n완료: ${report ? "검사 통과" : "검사 불통과 · 저장하지 않는 결과"} · 호출 ${attempts.length}회 · 쓴 비용 ${won(spent)} (이번 실행 한도 ${won(guardCap)}${guard.halted ? " · 예산 하드스톱으로 중단" : ""})`);
if (warned.length > 0) console.log(`- 경고(WARN) ${warned.length}건 — 저장을 막지 않는 읽기 쉬운 정도의 알림이라 자동으로 다시 쓰지 않았습니다(cost-and-checks.json의 warnings). 경고가 없어도 있어도 유료 판매 합격은 아닙니다 — 글 전문을 읽고 운영자가 정합니다.`);
if (failure) console.log(`- 실패(${failure.code}): ${failure.message}${failure.errors.length ? ` — 걸린 항목 ${failure.errors.length}개: ${failure.errors.slice(0, 6).join(" / ")}${failure.errors.length > 6 ? " …" : ""}` : ""}`);
console.log(`결과 폴더: ${dir} (원문은 attempts 폴더 · 읽는 글은 readable.md — 글 전문과 cost-and-checks.json 을 채팅에 붙여 보고하면 됩니다, 키는 필요 없습니다)`);
