// AI 품질 비교 실행기 — 단계별 승인 · 예산 하드스톱 · 가린 이름(블라인드)으로 같은 입력을 두 후보에 넣는다.
// - planStage: 호출하지 않고 단계의 예상 · 최악 비용을 계산한다 (드라이런). 모델을 부르지 않는다.
// - runStage: 운영자의 단계별 승인 기록이 있고 예산 한도가 승인 금액 이하일 때만 실행한다. 모든 호출은 BudgetGuard를 거친다.
// 제공사 구현체(실제 호출)는 이 파일에 없다. 승인 전에는 모의 모델 · 가짜 서버로만 검사한다.
import { buildUserMessage, SYSTEM_PROMPT } from "../v2/prompt.ts";
import { isPersonalV2, type AiUsageSample, type ReportContent } from "../generator.ts";
import { checkDepth, crossPersonOverlap } from "../v2/depth.ts";
import { buildEvidence, createAiReportGenerator } from "./generator.ts";
import { BudgetExceededError, BudgetGuard, costKrw, estimateInputTokens, withBudget, worstCaseKrw, type BudgetSettings, type ModelPrice } from "./budget.ts";
import type { Persona } from "./compare-personas.ts";
import type { TextModel } from "./model.ts";

export type CompareCandidate = { key: string; model: TextModel; price: ModelPrice };

export type CompareApproval = {
  /** 승인한 단계 이름 (stage-1 · stage-2) */
  stage: string;
  /** 운영자가 승인한 총 한도 (원) */
  approvedCapKrw: number;
  /** 승인한 날 (YYYY-MM-DD) */
  approvedOn: string;
};

/** 출력 토큰의 평소 수준 — 이전 계획의 6,000~14,000토큰 중간값. 비용 "예상"에만 쓴다 (한도는 최대치로 지킨다) */
export const TYPICAL_OUTPUT_TOKENS = 10_000;
/** 생성기가 쓰는 출력 토큰 최대치 (lib/report/ai/generator.ts의 기본값과 같다) */
export const MAX_OUTPUT_TOKENS = 16_000;
/** 형식 검사에 실패해 한 번 고쳐 쓸 때 붙는 안내문 추정 (글자) */
const REPAIR_NOTE_CHARS = 600;

export type PlanRow = {
  persona: string;
  candidate: string;
  estInputTokens: number;
  /** 입력 추정 + 평소 출력 — 한 번 호출 */
  expectedKrw: number;
  /** 한 번 호출의 최악 (최대 출력 모두 사용) */
  firstCallWorstKrw: number;
  /** 형식 검사 실패로 고쳐 쓰기까지 두 번 호출했을 때의 최악 (제공사 오류 재시도 제외) */
  twoRoundWorstKrw: number;
};

export type StagePlan = {
  stage: string;
  rows: PlanRow[];
  expectedKrw: number;
  firstCallWorstKrw: number;
  twoRoundWorstKrw: number;
  capKrw: number;
  /** 한도 안에 모든 생성이 평소 수준으로 끝나는가 */
  expectedFits: boolean;
  /** 한도 안에 모든 생성이 최악(두 번 호출)으로도 끝나는가 — 아니어도 하드스톱이 한도를 지킨다 (일부 생성이 중단될 뿐) */
  worstFits: boolean;
};

export function referenceFor(now: Date) {
  const s = new Date(now.getTime() + 9 * 3600000);
  return { year: s.getUTCFullYear(), month: s.getUTCMonth() + 1, iso: s.toISOString().slice(0, 10) };
}

/** 호출하지 않고 비용을 계산한다 (드라이런). 입력은 제품이 실제로 만드는 지시문 · 근거 목록 길이로 추정한다 */
export function planStage(opts: { stage: string; capKrw: number; personas: Persona[]; candidates: Pick<CompareCandidate, "key" | "price">[]; settings: Pick<BudgetSettings, "fxKrwPerUsd" | "surcharge">; now: Date }): StagePlan {
  const ref = referenceFor(opts.now);
  const rows: PlanRow[] = [];
  for (const p of opts.personas) {
    const evidence = buildEvidence(p.input, ref);
    const user = buildUserMessage(evidence, ref.iso, p.input.context);
    const inputTokens = estimateInputTokens([SYSTEM_PROMPT, user]);
    for (const c of opts.candidates) {
      const first = worstCaseKrw(c.price, { inputTokens, maxOutputTokens: MAX_OUTPUT_TOKENS }, opts.settings);
      // 두 번째 호출: 지시문 + 근거 + 첫 응답(최대 출력만큼) + 고치기 안내
      const repairInput = inputTokens + MAX_OUTPUT_TOKENS + estimateInputTokens(["가".repeat(REPAIR_NOTE_CHARS)]);
      const second = worstCaseKrw(c.price, { inputTokens: repairInput, maxOutputTokens: MAX_OUTPUT_TOKENS }, opts.settings);
      rows.push({
        persona: p.id,
        candidate: c.key,
        estInputTokens: inputTokens,
        expectedKrw: costKrw(c.price, { inputTokens, outputTokens: TYPICAL_OUTPUT_TOKENS }, opts.settings),
        firstCallWorstKrw: first,
        twoRoundWorstKrw: first + second,
      });
    }
  }
  const sum = (f: (r: PlanRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const expectedKrw = sum((r) => r.expectedKrw);
  const twoRoundWorstKrw = sum((r) => r.twoRoundWorstKrw);
  return {
    stage: opts.stage,
    rows,
    expectedKrw,
    firstCallWorstKrw: sum((r) => r.firstCallWorstKrw),
    twoRoundWorstKrw,
    capKrw: opts.capKrw,
    expectedFits: expectedKrw <= opts.capKrw,
    worstFits: twoRoundWorstKrw <= opts.capKrw,
  };
}

export type CompareRun = {
  persona: string;
  candidate: string;
  /** 가린 이름 — 인물마다 두 후보가 X · Y에 무작위로 배정된다 */
  blind: "X" | "Y";
  status: "ok" | "failed" | "skipped-budget";
  /** 형식 검사를 첫 호출에서 통과했는가 */
  firstPassValid: boolean | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** 이 생성에 쓴 비용 (원, 환율 · 여유율 가정 포함, 사용량을 모르는 호출은 최악 비용) */
  costKrw: number;
  latencyMs: number;
  errorCode: string | null;
  report: ReportContent | null;
  /** 내용 차이 검사 결과 (lib/report/v2/depth.ts) — 낱말 · 표지를 세는 어림이며 좋은 글이라는 보증이 아니다. 가려 읽는 평가가 따로 있다 */
  depth: { pass: boolean; fails: string[]; warns: string[]; conditionRatio: number; selfOverlapMax: number } | null;
};

export type StageResult = {
  stage: string;
  runs: CompareRun[];
  spentKrw: number;
  stoppedByBudget: boolean;
  budget: ReturnType<BudgetGuard["snapshot"]>;
  /** 인물별 X · Y가 어느 후보인지 — 평가가 끝나기 전에는 평가자에게 보이지 않는다 */
  blindKey: Record<string, Record<"X" | "Y", string>>;
  /** 후보별로, 서로 다른 인물의 리포트가 얼마나 같은 말인가 (0~1, 낮을수록 사람마다 다른 글). 인물이 2명 이상이고 생성에 성공했을 때만 */
  crossPersonOverlap: Record<string, number | null>;
  /** 입력 토큰 추정이 실제와 얼마나 달랐나 (실제 / 추정, 첫 호출 기준 평균). 1보다 크면 추정이 모자랐다 */
  estimateRatio: number | null;
};

/** 인물마다 후보를 X · Y에 무작위로 배정한다 (재현 가능한 씨앗) */
export function assignBlind(personaIds: string[], candidateKeys: string[], seed: number): Record<string, Record<"X" | "Y", string>> {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  if (candidateKeys.length !== 2) throw new Error("가린 비교는 후보 2개일 때만 쓸 수 있습니다.");
  return Object.fromEntries(personaIds.map((id) => (rand() < 0.5 ? [id, { X: candidateKeys[0], Y: candidateKeys[1] }] : [id, { X: candidateKeys[1], Y: candidateKeys[0] }])));
}

export function checkApproval(stage: { name: string; capKrw: number }, guard: BudgetGuard, approval: CompareApproval | null | undefined) {
  if (!approval) throw new Error("운영자의 예산 승인 기록이 없어 실행하지 않습니다.");
  if (approval.stage !== stage.name) throw new Error(`승인한 단계(${approval.stage})와 실행할 단계(${stage.name})가 다릅니다.`);
  if (!(approval.approvedCapKrw >= stage.capKrw)) throw new Error("승인한 금액이 이 단계의 한도보다 작습니다.");
  if (guard.settings.capKrw > approval.approvedCapKrw) throw new Error("예산 관리기의 한도가 승인한 금액보다 큽니다.");
}

export async function runStage(opts: {
  stage: { name: string; capKrw: number };
  personas: Persona[];
  candidates: CompareCandidate[];
  guard: BudgetGuard;
  approval: CompareApproval | null | undefined;
  now: Date;
  blindSeed: number;
  /** 제공사 오류 재시도 사이의 대기 (테스트에서는 즉시) */
  sleep?: (ms: number) => Promise<void>;
  callTimeoutMs?: number;
}): Promise<StageResult> {
  checkApproval(opts.stage, opts.guard, opts.approval);
  const blindKey = assignBlind(opts.personas.map((p) => p.id), opts.candidates.map((c) => c.key), opts.blindSeed);
  const runs: CompareRun[] = [];
  let stoppedByBudget = false;
  const ratios: number[] = [];

  for (const persona of opts.personas) {
    for (const candidate of opts.candidates) {
      const blind = (Object.entries(blindKey[persona.id]).find(([, key]) => key === candidate.key)?.[0] ?? "X") as "X" | "Y";
      if (stoppedByBudget) {
        runs.push({ persona: persona.id, candidate: candidate.key, blind, status: "skipped-budget", firstPassValid: null, calls: 0, inputTokens: 0, outputTokens: 0, costKrw: 0, latencyMs: 0, errorCode: "BUDGET_EXCEEDED", report: null, depth: null });
        continue;
      }
      const spentBefore = opts.guard.spentKrw;
      const usage: AiUsageSample[] = [];
      const generator = createAiReportGenerator({
        model: withBudget(candidate.model, opts.guard, candidate.price),
        now: () => opts.now,
        sleep: opts.sleep,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        callTimeoutMs: opts.callTimeoutMs,
      });
      const started = Date.now();
      let report: ReportContent | null = null;
      let errorCode: string | null = null;
      try {
        report = await generator.generate(persona.input, { onUsage: (u) => usage.push(u) });
      } catch (e) {
        if (e instanceof BudgetExceededError) {
          stoppedByBudget = true;
          errorCode = "BUDGET_EXCEEDED";
        } else errorCode = e instanceof Error && "code" in e ? String((e as { code: unknown }).code) : "FAILED";
      }
      const first = usage.find((u) => u.outcome !== "error" && u.outcome !== "timeout");
      const inputTokens = usage.reduce((n, u) => n + (u.inputTokens ?? 0), 0);
      const outputTokens = usage.reduce((n, u) => n + (u.outputTokens ?? 0), 0);
      if (first?.inputTokens) {
        const ref = referenceFor(opts.now);
        const est = estimateInputTokens([SYSTEM_PROMPT, buildUserMessage(buildEvidence(persona.input, ref), ref.iso, persona.input.context)]);
        ratios.push(first.inputTokens / est);
      }
      let depth: CompareRun["depth"] = null;
      if (report && isPersonalV2(report)) {
        const d = checkDepth({ draft: report, evidence: report.evidence, hasContext: Boolean(persona.input.context) });
        depth = { pass: d.pass, fails: d.flags.filter((f) => f.severity === "fail").map((f) => f.id), warns: d.flags.filter((f) => f.severity === "warn").map((f) => f.id), conditionRatio: d.metrics.conditionRatio, selfOverlapMax: d.metrics.selfOverlapMax };
      }
      runs.push({
        persona: persona.id,
        candidate: candidate.key,
        blind,
        status: report ? "ok" : stoppedByBudget && usage.length === 0 ? "skipped-budget" : "failed",
        firstPassValid: first ? first.outcome === "ok" : null,
        calls: usage.length,
        inputTokens,
        outputTokens,
        costKrw: opts.guard.spentKrw - spentBefore,
        latencyMs: Date.now() - started,
        errorCode,
        report,
        depth,
      });
    }
  }
  const crossPersonOverlapBy: Record<string, number | null> = {};
  for (const c of opts.candidates) {
    const reports = runs.filter((r) => r.candidate === c.key && r.report && isPersonalV2(r.report)).map((r) => r.report as Extract<ReportContent, { kind: "personal-v2" }>);
    const values: number[] = [];
    for (let i = 0; i < reports.length; i++) for (let j = 0; j < reports.length; j++) if (i !== j) values.push(crossPersonOverlap(reports[i], reports[j]));
    crossPersonOverlapBy[c.key] = values.length ? values.reduce((n, v) => n + v, 0) / values.length : null;
  }
  return {
    stage: opts.stage.name,
    runs,
    spentKrw: opts.guard.spentKrw,
    stoppedByBudget,
    budget: opts.guard.snapshot(),
    blindKey,
    crossPersonOverlap: crossPersonOverlapBy,
    estimateRatio: ratios.length ? ratios.reduce((n, v) => n + v, 0) / ratios.length : null,
  };
}
