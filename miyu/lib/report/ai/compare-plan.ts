// AI 품질 비교 실행기 — 단계별 승인 · 예산 하드스톱 · 가린 이름(블라인드)으로 같은 입력을 두 후보에 넣는다.
// - planStage: 호출하지 않고 단계의 예상 · 최악 비용을 계산한다 (드라이런). 모델을 부르지 않는다.
// - runStage: 운영자의 단계별 승인 기록이 있고 예산 한도가 승인 금액 이하일 때만 실행한다. 모든 호출은 BudgetGuard를 거친다.
// 제공사 구현체(실제 호출)는 이 파일에 없다. 승인 전에는 모의 모델 · 가짜 서버로만 검사한다.
import { buildUserMessage, SYSTEM_PROMPT } from "../v2/prompt.ts";
import { isPersonalV2, isReadingReport, type AiUsageSample, type ReportContent } from "../generator.ts";
import { checkReadingDepth, crossPersonOverlapReading } from "../reading/depth.ts";
import { buildReadingUserMessage, READING_SYSTEM_PROMPT } from "../reading/prompt.ts";
import { buildStoryUserMessage, STORY_SYSTEM_PROMPT } from "../reading/story-prompt.ts";
import { checkDepth, crossPersonOverlap } from "../v2/depth.ts";
import { checkPhilosophicalDepth, crossOverlapBlocks } from "../philosophy/depth.ts";
import { readingBlocks } from "../philosophy/compare.ts";
import { buildPhilosophyUserMessage, PHILOSOPHY_SYSTEM_PROMPT } from "../philosophy/prompt.ts";
import { isPhilosophicalReport, type PhilosophicalReportV0 } from "../philosophy/types.ts";
import { buildEvidence, createAiReportGenerator } from "./generator.ts";
import { createPhilosophicalGenerator } from "./philosophy-generator.ts";
import { BudgetExceededError, BudgetGuard, costKrw, estimateInputTokens, withBudget, worstCaseKrw, type BudgetSettings, type ModelPrice } from "./budget.ts";
import type { Persona } from "./compare-personas.ts";
import type { TextModel } from "./model.ts";

/**
 * 무엇을 쓰게 하는가 — reading-v1: 지금 제품의 개인 통합 리포트(읽기 구조, 기본), personal-v2: 이전 AI 형식(비교 · 호환용),
 * philosophical-v0: 자기 이해 풀이 비교용 지시문(제품 미연결), story-v1: 영역별 이야기(2026-10-16 비교용 후보 — 칸을 채우지 않고 영역마다 하나의 이야기)
 */
export type CompareVariant = "reading-v1" | "story-v1" | "personal-v2" | "philosophical-v0";

/** 변형마다 AI에게 보내는 지시문 · 사용자 메시지 (비용 추정과 입력 토큰 보정에 같은 값을 쓴다) */
export function promptsFor(variant: CompareVariant, evidence: ReturnType<typeof buildEvidence>, iso: string, context: Persona["input"]["context"]): [string, string] {
  if (variant === "philosophical-v0") return [PHILOSOPHY_SYSTEM_PROMPT, buildPhilosophyUserMessage(evidence, iso, context)];
  if (variant === "personal-v2") return [SYSTEM_PROMPT, buildUserMessage(evidence, iso, context)];
  if (variant === "story-v1") return [STORY_SYSTEM_PROMPT, buildStoryUserMessage(evidence, iso, context)];
  return [READING_SYSTEM_PROMPT, buildReadingUserMessage(evidence, iso, context)];
}

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
/**
 * 비교 실행에서 쓰는 출력 토큰 최대치. 두 회사 모두 생각 · 추론 토큰이 최대 출력에 합산된다(공식 문서) — 16,000으로는 글이 중간에 잘릴 위험이 있어 24,000으로 올렸다.
 * 비용은 실제로 쓴 만큼만 나가고 한도(승인 금액)는 그대로이며, 최대치는 호출 전에 최악 비용을 잡는 데만 쓴다.
 */
export const MAX_OUTPUT_TOKENS = 24_000;
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
export function planStage(opts: { stage: string; capKrw: number; personas: Persona[]; candidates: Pick<CompareCandidate, "key" | "price">[]; settings: Pick<BudgetSettings, "fxKrwPerUsd" | "surcharge">; now: Date; variant?: CompareVariant }): StagePlan {
  const ref = referenceFor(opts.now);
  const rows: PlanRow[] = [];
  for (const p of opts.personas) {
    const evidence = buildEvidence(p.input, ref);
    const [system, user] = promptsFor(opts.variant ?? "reading-v1", evidence, ref.iso, p.input.context);
    const inputTokens = estimateInputTokens([system, user]);
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
  /** 실패했을 때 생성기가 남긴 오류 문구 (키 · 요청 본문 · 응답 본문은 들어가지 않는다 — 형식 검사에 걸린 이유 몇 개). 성공이면 null */
  errorMessage: string | null;
  /**
   * 검사에 걸린 응답마다 걸린 이유 전체와 그 글 (읽기 구조만, 가상 인물의 글). 실패 원인을 보려는 진단용이다 —
   * 글 내용이 들어 있으므로 cost-and-checks.json에는 이유(errors)만 싣고 글(text)은 따로 저장한다.
   */
  attempts: { round: number; errors: string[]; text: string }[];
  report: ReportContent | PhilosophicalReportV0 | null;
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
  /** 쓰게 할 리포트의 종류 (기본: 개인 통합 리포트 읽기 구조) */
  variant?: CompareVariant;
  blindSeed: number;
  /** 제공사 오류 재시도 사이의 대기 (테스트에서는 즉시) */
  sleep?: (ms: number) => Promise<void>;
  callTimeoutMs?: number;
  /** 같은 표현이 여러 곳에 되풀이되면 한 번 고쳐 쓰게 한다 (읽기 구조 · 기본은 끔 — 켜도 최악 비용은 "모두 고쳐 쓰기까지 가는 경우"에 이미 들어 있다) */
  repairRepeats?: boolean;
}): Promise<StageResult> {
  checkApproval(opts.stage, opts.guard, opts.approval);
  const variant = opts.variant ?? "reading-v1";
  // 후보가 둘이면 인물마다 X · Y에 무작위로 가린다. 한 모델만 실행하면(--only) 가린 비교가 아니며 모든 글이 X다
  const blindKey =
    opts.candidates.length === 1
      ? Object.fromEntries(opts.personas.map((p) => [p.id, { X: opts.candidates[0].key, Y: opts.candidates[0].key }]))
      : assignBlind(opts.personas.map((p) => p.id), opts.candidates.map((c) => c.key), opts.blindSeed);
  const runs: CompareRun[] = [];
  let stoppedByBudget = false;
  const ratios: number[] = [];

  for (const persona of opts.personas) {
    for (const candidate of opts.candidates) {
      const blind = (Object.entries(blindKey[persona.id]).find(([, key]) => key === candidate.key)?.[0] ?? "X") as "X" | "Y";
      if (stoppedByBudget) {
        runs.push({ persona: persona.id, candidate: candidate.key, blind, status: "skipped-budget", firstPassValid: null, calls: 0, inputTokens: 0, outputTokens: 0, costKrw: 0, latencyMs: 0, errorCode: "BUDGET_EXCEEDED", errorMessage: null, attempts: [], report: null, depth: null });
        continue;
      }
      const spentBefore = opts.guard.spentKrw;
      const usage: AiUsageSample[] = [];
      const generatorOptions = {
        model: withBudget(candidate.model, opts.guard, candidate.price),
        now: () => opts.now,
        sleep: opts.sleep,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        callTimeoutMs: opts.callTimeoutMs,
      };
      const generator = variant === "philosophical-v0" ? createPhilosophicalGenerator(generatorOptions) : createAiReportGenerator({ ...generatorOptions, format: variant, repairRepeats: opts.repairRepeats });
      const started = Date.now();
      let report: ReportContent | PhilosophicalReportV0 | null = null;
      let errorCode: string | null = null;
      let errorMessage: string | null = null;
      const attempts: CompareRun["attempts"] = [];
      try {
        report = await generator.generate(persona.input, { onUsage: (u) => usage.push(u), onAttempt: (a) => attempts.push(a) });
      } catch (e) {
        if (e instanceof BudgetExceededError) {
          stoppedByBudget = true;
          errorCode = "BUDGET_EXCEEDED";
        } else errorCode = e instanceof Error && "code" in e ? String((e as { code: unknown }).code) : "FAILED";
        if (e instanceof Error) errorMessage = e.message.slice(0, 600);
      }
      const first = usage.find((u) => u.outcome !== "error" && u.outcome !== "timeout");
      const inputTokens = usage.reduce((n, u) => n + (u.inputTokens ?? 0), 0);
      const outputTokens = usage.reduce((n, u) => n + (u.outputTokens ?? 0), 0);
      if (first?.inputTokens) {
        const ref = referenceFor(opts.now);
        const est = estimateInputTokens(promptsFor(variant, buildEvidence(persona.input, ref), ref.iso, persona.input.context));
        ratios.push(first.inputTokens / est);
      }
      let depth: CompareRun["depth"] = null;
      if (report && isPhilosophicalReport(report)) {
        const d = checkPhilosophicalDepth({ draft: report, evidence: report.evidence, concern: persona.input.context });
        depth = { pass: d.pass, fails: d.fails, warns: d.warns, conditionRatio: d.metrics.conditionShare, selfOverlapMax: d.metrics.selfOverlapMax };
      } else if (report && isReadingReport(report)) {
        const d = checkReadingDepth({ draft: report });
        depth = { pass: d.pass, fails: d.flags.filter((f) => f.severity === "fail").map((f) => f.id), warns: d.flags.filter((f) => f.severity === "warn").map((f) => f.id), conditionRatio: d.metrics.conditionRatio, selfOverlapMax: d.metrics.selfOverlapMax };
      } else if (report && isPersonalV2(report)) {
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
        errorMessage,
        attempts,
        report,
        depth,
      });
    }
  }
  const crossPersonOverlapBy: Record<string, number | null> = {};
  for (const c of opts.candidates) {
    const values: number[] = [];
    if (variant === "philosophical-v0") {
      const blocks = runs.filter((r) => r.candidate === c.key && r.report && isPhilosophicalReport(r.report)).map((r) => readingBlocks(r.report as PhilosophicalReportV0));
      for (let i = 0; i < blocks.length; i++) for (let j = 0; j < blocks.length; j++) if (i !== j) values.push(crossOverlapBlocks(blocks[i], blocks[j]));
    } else if (variant === "reading-v1" || variant === "story-v1") {
      const reports = runs.filter((r) => r.candidate === c.key && r.report && !isPhilosophicalReport(r.report) && isReadingReport(r.report)).map((r) => r.report as Extract<ReportContent, { kind: "integrated-reading" }>);
      for (let i = 0; i < reports.length; i++) for (let j = 0; j < reports.length; j++) if (i !== j) values.push(crossPersonOverlapReading(reports[i], reports[j]));
    } else {
      const reports = runs.filter((r) => r.candidate === c.key && r.report && !isPhilosophicalReport(r.report) && isPersonalV2(r.report)).map((r) => r.report as Extract<ReportContent, { kind: "personal-v2" }>);
      for (let i = 0; i < reports.length; i++) for (let j = 0; j < reports.length; j++) if (i !== j) values.push(crossPersonOverlap(reports[i], reports[j]));
    }
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
