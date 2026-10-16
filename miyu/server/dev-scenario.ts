import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { labAnsweredCount, labEvidence, labThreads, savedCaseFor, type LabInput, type LabThread } from "@/lib/assessment/drafts/scenario-lab";
import { scenarioCaseEvidence } from "@/lib/assessment/drafts/scenario-cases";
import { withScenarioEvidence } from "@/lib/assessment/drafts/scenario-evidence";
import { scenarioAnswerUse } from "@/lib/assessment/drafts/scenario-use";
import { createSupabaseRepository } from "@/lib/integrations/supabase/repository";
import { buildEvidence } from "@/lib/report/ai/generator";
import { buildPersonas } from "@/lib/report/ai/compare-personas";
import type { AiUsageSample, ReportInput } from "@/lib/report/generator";
import { answerUseChecker, checkAnswerUse, sourceMix, type SourceMix } from "@/lib/report/reading/answer-use";
import { assembleReading } from "@/lib/report/reading/assemble";
import { checkReadingDepth } from "@/lib/report/reading/depth";
import { READING_PROMPT_VERSION } from "@/lib/report/reading/prompt";
import { findRepeatedPhrases } from "@/lib/report/reading/repeat";
import type { IntegratedReadingReport, ReadingDraftV1 } from "@/lib/report/reading/types";
import { validateReadingDraft } from "@/lib/report/reading/validate";
import { SAJU_RULE_VERSION } from "@/lib/saju/interpret/rules";
import { calculateSaju } from "@/lib/saju/manseryeok-engine";
import { sampleReport } from "@/lib/samples/sample-report";
import { estimateCostKrw } from "@/lib/services/capacity-service";
import { SURVEY_RULE_VERSION } from "@/lib/report/survey-evidence";
import { aiConfig, capacityConfig } from "./env";
import { liveReportGenerator } from "./live-ai";
import { createAdminSupabase } from "./supabase";

// 장면 질문 테스트 화면(/dev/scenario)의 서버 쪽 — 이 PC의 개발 화면에서만 쓴다(화면이 production에서 notFound, 여기서도 한 번 더 막는다).
// 저장하지 않는다(회원 결과 · 주문 · 리포트 어느 표에도 쓰지 않는다). 쓰는 것: 가상 인물 또는 직접 넣은 생일(그 자리에서 사주만 계산하고 버린다).
// 실제 AI는 ① 운영자가 .env.local에 승인 값(AI_PROVIDER=anthropic + AI_APPROVED_*)을 적었고 ② 이 시험을 위한 별도 스위치 DEV_SCENARIO_LIVE=yes까지 적었을 때만 호출한다.
// 호출은 운영 리포트와 같은 생성기(liveReportGenerator — 같은 승인 가드 · 모델 설정 · 형식 검사 · 고쳐 쓰기)를 쓰고, 근거를 장면 질문의 근거로 바꿔 끼우고 응답 사용 검사를 더한 것만 다르다.

export type LabStatus = { live: boolean; reason: string };

export function labStatus(): LabStatus {
  const ai = aiConfig();
  if (ai.kind !== "anthropic") return { live: false, reason: ai.kind === "invalid" ? ai.reason : "실제 AI가 연결되어 있지 않아요 (.env.local에 AI_PROVIDER=anthropic과 승인 금액 · 호출 수 · 기간을 직접 적어야 해요)" };
  if ((process.env.DEV_SCENARIO_LIVE ?? "").trim() !== "yes") {
    return { live: false, reason: "장면 질문 시험의 실제 AI 호출은 별도 승인이 필요해요 — 승인한 뒤 .env.local에 DEV_SCENARIO_LIVE=yes를 직접 적으면 열려요 (이전 5,000원 승인에 자동으로 포함되지 않아요)" };
  }
  return { live: true, reason: "" };
}

export type LabRound = { round: number; errors: string[] };

export type LabResult = {
  /** live-ai: 실제 서비스 AI가 쓴 글 · saved-proxy: 저장된 시험 글(시험용 대리 작성기, 실제 서비스 AI 아님) · evidence-only: 글 없음 */
  mode: "live-ai" | "saved-proxy" | "evidence-only";
  note: string;
  promptVersion: string;
  answered: number;
  threads: LabThread[];
  evidence: { id: string; fact: string; cue: string }[];
  rounds: LabRound[];
  /** 지어내지 않았는가(통과 · 실패) — 비어 있으면 통과 */
  integrity: string[];
  /** 새로 알게 해 주는가(별도 기준) */
  quality: string[];
  repeats: string[];
  depthFlags: string[];
  sourceMix: SourceMix[];
  usage: { calls: number; inputTokens: number; outputTokens: number; costKrw: number | null; outcomes: string[] } | null;
  report: IntegratedReadingReport | null;
  error: string | null;
};

const SAVED_DIR = join(process.cwd(), "docs", "samples", "scenario-generation");
const REFERENCE = { year: 2026, month: 10, iso: "2026-10-16" };

function reportInputOf(input: LabInput): ReportInput {
  const p = input.person;
  if (p.kind === "p01") {
    const persona = buildPersonas(2)[0]!;
    return { nickname: "시험", knownMbti: input.mbti ?? "INFJ", birthText: "(가상 인물 · 저장하지 않음)", summary: persona.input.summary, saju: persona.input.saju, gender: persona.input.gender, context: null };
  }
  const own = p.kind === "own" ? p : { year: 1994, month: 11, day: 7, time: "08:40" as string | null, gender: "female" as const };
  const saju = calculateSaju({ year: own.year, month: own.month, day: own.day, calendar: "solar", isLeapMonth: false, birthTime: own.time ?? undefined, gender: own.gender } as never);
  if (saju.status !== "ok") throw new Error("사주를 계산하지 못했어요 — 날짜를 확인해 주세요");
  return { nickname: "시험", knownMbti: input.mbti, birthText: p.kind === "own" ? "(직접 입력 · 저장하지 않음)" : "(가상 인물 · 저장하지 않음)", summary: sampleReport, saju, gender: own.gender, context: null };
}

async function readSaved(name: string): Promise<ReadingDraftV1 | null> {
  try {
    return JSON.parse(await readFile(join(SAVED_DIR, `${name}.json`), "utf8")) as ReadingDraftV1;
  } catch {
    return null;
  }
}

/** 최종 글에 제품 검사를 다시 대 본 결과 — 화면에 그대로 보인다(숨기지 않는다) */
function finalChecks(draft: ReadingDraftV1, input: LabInput, evidenceList: ReturnType<typeof scenarioCaseEvidence>) {
  const use = scenarioAnswerUse(input.answers);
  const r = checkAnswerUse(draft, use);
  return {
    integrity: r.integrity,
    quality: r.quality,
    repeats: findRepeatedPhrases(draft).map((x) => `“${x.phrase}” (${x.where[0]} · ${x.where[1]})`),
    depthFlags: checkReadingDepth({ draft: draft as never }).flags.map((f) => `[${f.severity}] ${f.message}`),
    sourceMix: sourceMix(draft, evidenceList, use),
  };
}

const empty = (input: LabInput, mode: LabResult["mode"], note: string): LabResult => ({
  mode,
  note,
  promptVersion: READING_PROMPT_VERSION,
  answered: labAnsweredCount(input.answers),
  threads: labThreads(input.answers),
  evidence: labEvidence(input.answers),
  rounds: [],
  integrity: [],
  quality: [],
  repeats: [],
  depthFlags: [],
  sourceMix: [],
  usage: null,
  report: null,
  error: null,
});

/** 저장된 시험 글 — 같은 가상 인물 · 같은 응답일 때만. 고치기 전 글이 새 검사에 걸린 이유도 함께 보인다 */
async function savedResult(input: LabInput): Promise<LabResult> {
  const c = savedCaseFor(input);
  if (!c) return { ...empty(input, "evidence-only", "저장된 시험 글은 서윤 · 다른 사주(P01)에 기준 · 다른 · 일부 없는 응답 그대로일 때만 볼 수 있어요. 지금 고른 조합의 글은 실제 AI를 연결해야 만들 수 있어요."), error: null };
  const fixed = await readSaved(`${c.key}.fixed`);
  const original = await readSaved(c.key);
  const draft = fixed ?? original;
  if (!draft) return { ...empty(input, "evidence-only", "저장된 시험 글을 찾지 못했어요."), error: "저장된 글 없음" };
  const evidence = scenarioCaseEvidence(c);
  const use = scenarioAnswerUse(input.answers);
  const rounds: LabRound[] = [];
  if (fixed && original) {
    const before = validateReadingDraft(original, evidence, { hasContext: false, extra: answerUseChecker(use) });
    rounds.push({ round: 0, errors: before.ok ? [] : before.errors });
  }
  const person = reportInputOf(input);
  const report = assembleReading({ draft, evidence, input: person, reference: REFERENCE, promptVersion: READING_PROMPT_VERSION, ruleVersions: [SAJU_RULE_VERSION, SURVEY_RULE_VERSION, READING_PROMPT_VERSION] });
  return {
    ...empty(input, "saved-proxy", `저장된 시험 글(${c.key} · ${c.title}) — 실제 서비스 AI가 아니라 시험용 대리 작성기(AI 하위 작업자)가 제품 지시문과 같은 근거 목록으로 쓴 글이에요. ${fixed ? "새 검사(응답 사용 검사)에 걸린 글을 검사 오류를 받고 한 번 고쳐 쓴 뒤의 글이고, 고치기 전에 걸린 이유는 아래 \"생성 과정\"에 있어요." : ""}`),
    rounds,
    ...finalChecks(draft, input, evidence),
    report,
  };
}

async function liveResult(input: LabInput): Promise<LabResult> {
  const ai = aiConfig();
  if (ai.kind !== "anthropic") throw new Error("실제 AI가 연결되어 있지 않아요");
  const person = reportInputOf(input);
  const use = scenarioAnswerUse(input.answers);
  const checker = answerUseChecker(use);
  let lastOk: ReadingDraftV1 | null = null;
  const rounds: LabRound[] = [];
  const samples: AiUsageSample[] = [];
  const generator = liveReportGenerator(ai, {
    adaptEvidence: (ev) => withScenarioEvidence(ev, input.answers),
    extraChecks: (d) => {
      const errs = checker(d);
      if (errs.length === 0) lastOk = d;
      return errs;
    },
  }, "reading-v1"); // 장면 질문 테스트 화면은 이전 읽기 구조(reading-v1)의 근거 바꿔 끼우기 · 응답 사용 검사를 쓴다 — 새 리포트 기본 형식(story-v1)과 따로 둔다
  let report: IntegratedReadingReport | null = null;
  let error: string | null = null;
  try {
    const out = await generator.generate(person, {
      signal: AbortSignal.timeout(280_000),
      onUsage: (u) => samples.push(u),
      onAttempt: (a) => {
        if (!a.accepted) rounds.push({ round: a.round, errors: a.errors });
      },
    });
    report = out as IntegratedReadingReport;
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 300) : "생성에 실패했어요";
  }
  // 사용 기록(토큰 수와 비용 어림만) — 승인 가드가 합계를 세므로 운영 리포트와 같은 표에 남긴다(글 · 질문 내용은 남기지 않는다)
  const cap = capacityConfig();
  const costs = samples.map((u) => estimateCostKrw(cap, u));
  try {
    const repo = createSupabaseRepository(createAdminSupabase());
    await Promise.all(samples.map((u, i) => repo.addAiUsage({ reportId: null, provider: u.provider, model: u.model, promptVersion: u.promptVersion, inputTokens: u.inputTokens, outputTokens: u.outputTokens, estCostKrw: costs[i] ?? null, latencyMs: u.latencyMs, outcome: u.outcome, errorCode: u.errorCode }).catch(() => {})));
  } catch {
    // 기록 실패가 시험 결과를 막지 않는다 — 다만 승인 합계에서 빠질 수 있다(화면에 알린다)
  }
  const usage = {
    calls: samples.length,
    inputTokens: samples.reduce((n, u) => n + (u.inputTokens ?? 0), 0),
    outputTokens: samples.reduce((n, u) => n + (u.outputTokens ?? 0), 0),
    costKrw: costs.every((c) => c !== null) ? Math.round(costs.reduce<number>((n, c) => n + (c ?? 0), 0)) : null,
    outcomes: samples.map((u) => u.outcome),
  };
  const evidenceList = withScenarioEvidence(buildEvidence(person, REFERENCE), input.answers);
  const draft = lastOk as ReadingDraftV1 | null;
  return {
    ...empty(input, "live-ai", `실제 AI(${ai.model})가 운영 리포트와 같은 생성기(같은 승인 가드 · 모델 설정 · 형식 검사 · 고쳐 쓰기)로 쓴 글이에요. 근거를 장면 질문의 근거로 바꿔 끼우고 응답 사용 검사를 더한 것만 달라요. 글이 좋은지는 이 화면이 판정하지 않아요 — 직접 읽어 보세요.`),
    rounds,
    ...(draft && report ? finalChecks(draft, input, evidenceList) : {}),
    usage,
    report,
    error,
  };
}

export async function runLab(input: LabInput, source: "saved" | "live"): Promise<LabResult> {
  if (process.env.NODE_ENV === "production") throw new Error("개발용 화면이에요");
  if (source === "saved") return savedResult(input);
  const status = labStatus();
  if (!status.live) throw new Error(status.reason);
  return liveResult(input);
}
