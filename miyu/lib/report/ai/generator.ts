// AI 리포트 생성기 — 계산 결과에서 근거를 뽑고, 모델이 근거 안에서 쓰게 하고, 형식을 검사해 통과한 것만 돌려준다.
// - 일시 오류(속도 제한 · 장애)는 잠시 뒤 다시 부른다
// - 형식 검사에 실패하면 문제 목록을 주고 한 번 다시 쓰게 한다
// - 그래도 실패하면 오류를 던진다 → reports에 failed로 남고 고객은 "다시 만들기"를 누를 수 있다

import { sajuEvidence, SAJU_RULE_VERSION } from "../../saju/interpret/rules.ts";
import { filledFields, topicLabel } from "../../personalization/context.ts";
import { buildReportExtras } from "../extras.ts";
import { describePolicy } from "../../saju/policy.ts";
import { sajuSection } from "../../saju/display.ts";
import type { Evidence } from "../evidence.ts";
import { checkConcernDepth } from "../concern/depth.ts";
import { alreadyProvidedOf, buildConcernRepairMessage, buildConcernUserMessage, CONCERN_PROMPT_VERSION, CONCERN_SYSTEM_PROMPT } from "../concern/prompt.ts";
import type { ConcernDraftV1, ConcernReportV1 } from "../concern/types.ts";
import { validateConcernDraft } from "../concern/validate.ts";
import type { ConcernInput, GenerateContext, ReportGenerator, ReportInput } from "../generator.ts";
import { assembleReading } from "../reading/assemble.ts";
import { assembleStory, storyDepthSource } from "../reading/story-assemble.ts";
import { STORY_FORMAT } from "../reading/story-plan.ts";
import { buildStoryRepairMessage, buildStoryUserMessage, STORY_PROMPT_VERSION, STORY_SYSTEM_PROMPT } from "../reading/story-prompt.ts";
import { validateStoryDraft, visibleStoryTexts } from "../reading/story-validate.ts";
import { checkReadingDepth } from "../reading/depth.ts";
import { buildReadingRepairMessage, buildReadingUserMessage, READING_PROMPT_VERSION, READING_SYSTEM_PROMPT } from "../reading/prompt.ts";
import { findRepeatedPhrases, findRepeatedPhrasesIn, repeatMessages, type RepeatedPhrase } from "../reading/repeat.ts";
import type { IntegratedReadingReport, ReadingDraftV1, StoryDraftV1 } from "../reading/types.ts";
import { plainPeriodLabel, validateReadingDraft } from "../reading/validate.ts";
import { surveyEvidence, SURVEY_RULE_VERSION } from "../survey-evidence.ts";
import { buildRepairMessage, buildUserMessage, PROMPT_VERSION, SYSTEM_PROMPT } from "../v2/prompt.ts";
import type { PersonalReportV2, ReportDraftV2 } from "../v2/types.ts";
import { validateDraft } from "../v2/validate.ts";
import { createModelCaller } from "./model-caller.ts";
import type { ModelMessage, TextModel } from "./model.ts";

export type AiGeneratorOptions = {
  model: TextModel;
  /** 시기 해석 기준 날짜 */
  now?: () => Date;
  maxRepairs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  maxOutputTokens?: number;
  /** 모델 호출 한 번의 제한 시간 (넘으면 일시 오류로 보고 다시 시도) */
  callTimeoutMs?: number;
  /**
   * 개인 통합 리포트의 형식 — 기본은 읽기 구조(reading-v1: 결론 → 짧은 요약 → 쉬운 예시 → 접힌 풀이 · 근거, 예시 화면과 같은 구성).
   * story-v1은 영역마다 하나의 이야기를 끝까지 쓰는 형식(2026-10-16, 반복을 만드는 칸의 나눔을 바꾼 비교용 후보 — 기본으로 바꾸는 것은 운영자 결정, 같은 저장 모양에 layout "story"로 구분).
   * personal-v2는 이전 형식이며 비교 · 호환용이다.
   */
  format?: "reading-v1" | "story-v1" | "personal-v2";
  /**
   * 형식 검사를 통과해도 내용 차이 검사(reading/depth.ts)에서 걸리면 한 번 고쳐 쓰게 하고 그래도 안 되면 실패로 남긴다 (읽기 구조만).
   * 낱말 · 표지를 센 어림이어서 기본은 끄고(보고만), 실제 AI를 연결할 때 운영자가 켠다. 모의 글은 이 검사를 통과할 수 없다.
   */
  enforceDepth?: boolean;
  /**
   * 형식 검사를 통과했어도 같은 표현이 여러 곳에 되풀이되면(reading/repeat.ts) 한 번 고쳐 쓰게 한다 (읽기 구조만).
   * enforceDepth와 달리 **실패로 만들지 않는다** — 고쳐 쓴 글이 형식 검사에서 떨어지거나 마지막 시도에서도 반복이 남으면 받아 두는 쪽을 쓴다.
   * 고쳐 쓰기가 한 번 더 들어 비용이 늘 수 있어(이미 잡아 둔 최악 비용 안) 기본은 끈다.
   */
  repairRepeats?: boolean;
  /**
   * 읽기 구조 초안에 더하는 확인(응답 지어내기 · 선택지 옮기기 · 답을 나열한 제목 — reading/answer-use.ts의 answerUseChecker).
   * 돌려준 문장은 형식 오류와 같이 다루어 고쳐 쓰게 한다. 기본은 없다 — 지금 22문항 경로는 쓰지 않고 장면 질문을 연결할 때만 켠다.
   */
  extraChecks?: (draft: ReadingDraftV1) => string[];
  /**
   * 사주 · 응답 근거 목록을 만든 직후 근거를 바꾸는 자리(읽기 구조만) — 장면 질문의 근거로 바꿔 끼울 때 쓴다(개발용 테스트 화면 전용).
   * 기본은 없다 — 지금 22문항 경로는 쓰지 않는다. 바꾼 근거가 지시문 · 검사 · 저장 형식에 그대로 쓰이므로 실제 생성과 같은 경로로 시험할 수 있다.
   */
  adaptEvidence?: (evidence: Evidence[], input: ReportInput) => Evidence[];
};

/** 모델 응답에서 JSON 객체를 꺼낸다 (앞뒤 설명 · 코드 블록이 붙어도) */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON을 찾지 못했습니다.");
  return JSON.parse(text.slice(start, end + 1));
}

/** 한국 날짜 기준 연 · 월 */
function seoulYm(d: Date) {
  const s = new Date(d.getTime() + 9 * 3600000);
  return { year: s.getUTCFullYear(), month: s.getUTCMonth() + 1, iso: s.toISOString().slice(0, 10) };
}

export function buildEvidence(input: Pick<ReportInput, "saju" | "gender" | "summary" | "knownMbti">, reference: { year: number; month: number }): Evidence[] {
  if (input.saju.status !== "ok") throw new Error("사주 계산 결과가 없어 리포트를 만들 수 없습니다.");
  return [...sajuEvidence(input.saju, { reference, gender: input.gender ?? null }), ...surveyEvidence(input.summary, input.knownMbti)];
}

function fillName(draft: ReportDraftV2, name: string): ReportDraftV2 {
  const fix = (s: string) => s.replaceAll("{name}", name);
  return {
    headline: fix(draft.headline),
    summary: draft.summary.map((p) => ({ ...p, text: fix(p.text) })),
    sections: draft.sections.map((s) => ({ ...s, paragraphs: s.paragraphs.map((p) => ({ ...p, text: fix(p.text) })) })),
    timeline: draft.timeline.map((t) => ({ ...t, theme: fix(t.theme), opportunity: fix(t.opportunity), caution: fix(t.caution) })),
    differences: draft.differences.map((p) => ({ ...p, text: fix(p.text) })),
    actions: draft.actions.map((a) => ({ ...a, situation: fix(a.situation), action: fix(a.action) })),
    ...(draft.focus?.length ? { focus: draft.focus.map((p) => ({ ...p, text: fix(p.text) })) } : {}),
  };
}

function fillConcernName(draft: ConcernDraftV1, name: string): ConcernDraftV1 {
  const fix = (s: string) => s.replaceAll("{name}", name);
  return {
    headline: fix(draft.headline),
    understanding: draft.understanding.map((p) => ({ ...p, text: fix(p.text) })),
    pattern: draft.pattern.map((p) => ({ ...p, text: fix(p.text) })),
    situations: draft.situations.map((x) => ({ ...x, situation: fix(x.situation), reading: fix(x.reading), suggestion: fix(x.suggestion) })),
    timeline: draft.timeline.map((t) => ({ ...t, period: plainPeriodLabel(t.period), theme: fix(t.theme), opportunity: fix(t.opportunity), caution: fix(t.caution) })),
    differences: draft.differences.map((p) => ({ ...p, text: fix(p.text) })),
    actions: draft.actions.map((a) => ({ ...a, situation: fix(a.situation), action: fix(a.action) })),
  };
}

export function createAiReportGenerator(opts: AiGeneratorOptions): ReportGenerator {
  const { model } = opts;
  const now = opts.now ?? (() => new Date());
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxRepairs = opts.maxRepairs ?? 1;
  const maxRetries = opts.maxRetries ?? 2;

  const format = opts.format ?? "reading-v1";
  const caller = createModelCaller({ model, maxRetries, sleep, maxOutputTokens: opts.maxOutputTokens, callTimeoutMs: opts.callTimeoutMs });
  const spec =
    format === "reading-v1"
      ? { system: READING_SYSTEM_PROMPT, promptVersion: READING_PROMPT_VERSION }
      : format === STORY_FORMAT
        ? { system: STORY_SYSTEM_PROMPT, promptVersion: STORY_PROMPT_VERSION }
        : { system: SYSTEM_PROMPT, promptVersion: PROMPT_VERSION };
  /** 호출 한 번 (일시 오류 재시도 · 사용 기록은 model-caller) */
  const call = (messages: ModelMessage[], ctx: GenerateContext) => caller.call(messages, ctx, spec);
  const concernSpec = { system: CONCERN_SYSTEM_PROMPT, promptVersion: CONCERN_PROMPT_VERSION };

  return {
    name: `ai:${model.provider}`,
    version: `${model.model}|${spec.promptVersion}|${SAJU_RULE_VERSION}`,
    usesContext: true,
    async generateConcern(input: ConcernInput, ctx: GenerateContext = {}): Promise<ConcernReportV1> {
      const ref = input.reference ? { ...input.reference, iso: seoulYm(now()).iso } : seoulYm(now());
      const evidence = buildEvidence(input, ref);
      const messages: ModelMessage[] = [
        {
          role: "user",
          content: buildConcernUserMessage({
            evidence,
            referenceDate: ref.iso,
            concern: input.concern,
            alreadyProvided: input.base ? alreadyProvidedOf(input.base, input.nickname) : null,
            previousConcerns: input.previous.map((p) => ({ topic: p.topic, headline: p.headline })),
          }),
        },
      ];
      const baseTexts = input.base?.all ?? [];
      const previousTexts = input.previous.map((p) => p.texts);

      let lastErrors: string[] = [];
      for (let round = 0; round <= maxRepairs; round++) {
        const called = await caller.call(messages, ctx, concernSpec);
        const { result } = called;
        const done = (outcome: "ok" | "invalid") => caller.recordResult(ctx, concernSpec, called, outcome, "VALIDATION");
        const retry = (errors: string[]) => {
          lastErrors = errors;
          messages.push({ role: "assistant", content: result.text.slice(0, 20000) }, { role: "user", content: buildConcernRepairMessage(errors) });
        };
        let parsed: unknown;
        try {
          parsed = extractJson(result.text);
        } catch {
          done("invalid");
          retry(["JSON 형식이 아닙니다. JSON 객체 하나만 출력해 주세요."]);
          continue;
        }
        const checked = validateConcernDraft(parsed, evidence);
        if (!checked.ok) {
          done("invalid");
          retry(checked.errors);
          continue;
        }
        // 형식은 맞아도 고민이 반영되지 않았거나 이미 준 리포트와 같은 글이면 저장하지 않는다 (글자 수가 아니라 내용을 본다)
        const depth = checkConcernDepth({ draft: checked.draft, concern: input.concern, baseTexts, previousTexts });
        if (!depth.pass) {
          done("invalid");
          retry(depth.errors);
          continue;
        }
        done("ok");
        return {
          kind: "concern-v1",
          source: input.summary.source,
          personName: input.nickname,
          evidence,
          basis: {
            ruleVersions: [SAJU_RULE_VERSION, SURVEY_RULE_VERSION, CONCERN_PROMPT_VERSION],
            referenceDate: ref.iso,
            lines: input.saju.status === "ok" ? [`만세력 엔진 ${input.saju.engine.name} ${input.saju.engine.version}`, ...describePolicy(input.saju.options)] : [],
            concern: {
              recordId: input.snapshot.recordId,
              topic: input.concern.topic,
              topicLabel: topicLabel(input.concern.topic),
              fields: filledFields(input.concern),
              writtenAt: input.snapshot.writtenAt,
            },
            quality: { warnings: depth.warnings, coverage: Number(depth.metrics.coverage.toFixed(2)), novelty: Number(depth.metrics.novelty.toFixed(2)) },
          },
          ...fillConcernName(checked.draft, input.nickname),
        };
      }
      throw new Error(`고민 리포트 검사 실패: ${lastErrors.slice(0, 3).join(" / ")}`);
    },
    async generate(input, ctx = {}) {
      const ref = seoulYm(now());
      const baseEvidence = buildEvidence(input, ref);
      const evidence = format === "reading-v1" && opts.adaptEvidence ? opts.adaptEvidence(baseEvidence, input) : baseEvidence;
      const context = input.context;
      if (format === "reading-v1" || format === STORY_FORMAT) {
        // 두 형식은 같은 순서로 쓴다: 초안 → 형식 검사 → (켜 둔 경우) 내용 검사 · 반복 확인 → 조립. 달라지는 것(자료 · 검사 · 조립)만 이 꾸러미에 둔다.
        const story = format === STORY_FORMAT;
        type AnyDraft = ReadingDraftV1 | StoryDraftV1;
        const kit: {
          message: string;
          repair: (errors: string[]) => string;
          validate: (parsed: unknown) => { ok: true; draft: AnyDraft } | { ok: false; errors: string[] };
          depthErrors: (draft: AnyDraft) => string[];
          repeats: (draft: AnyDraft) => RepeatedPhrase[];
          assemble: (draft: AnyDraft) => IntegratedReadingReport;
          promptVersion: string;
        } = story
          ? {
              message: buildStoryUserMessage(evidence, ref.iso, context),
              repair: buildStoryRepairMessage,
              validate: (parsed) => validateStoryDraft(parsed, evidence, { hasContext: Boolean(context) }),
              depthErrors: (draft) => {
                const depth = checkReadingDepth({ draft: storyDepthSource(draft as StoryDraftV1) });
                return depth.pass ? [] : depth.flags.filter((f) => f.severity === "fail").map((f) => f.message);
              },
              repeats: (draft) => findRepeatedPhrasesIn(visibleStoryTexts(draft as StoryDraftV1)),
              assemble: (draft) => assembleStory({ draft: draft as StoryDraftV1, evidence, input, reference: ref, promptVersion: STORY_PROMPT_VERSION, ruleVersions: [SAJU_RULE_VERSION, SURVEY_RULE_VERSION, STORY_PROMPT_VERSION] }),
              promptVersion: STORY_PROMPT_VERSION,
            }
          : {
              message: buildReadingUserMessage(evidence, ref.iso, context),
              repair: buildReadingRepairMessage,
              validate: (parsed) => validateReadingDraft(parsed, evidence, { hasContext: Boolean(context), extra: opts.extraChecks }),
              depthErrors: (draft) => {
                const depth = checkReadingDepth({ draft: draft as ReadingDraftV1 });
                return depth.pass ? [] : depth.flags.filter((f) => f.severity === "fail").map((f) => f.message);
              },
              repeats: (draft) => findRepeatedPhrases(draft as ReadingDraftV1),
              assemble: (draft) => assembleReading({ draft: draft as ReadingDraftV1, evidence, input, reference: ref, promptVersion: READING_PROMPT_VERSION, ruleVersions: [SAJU_RULE_VERSION, SURVEY_RULE_VERSION, READING_PROMPT_VERSION] }),
              promptVersion: READING_PROMPT_VERSION,
            };
        const messages: ModelMessage[] = [{ role: "user", content: kit.message }];
        let lastReadingErrors: string[] = [];
        // 형식은 맞지만 같은 표현이 되풀이돼 고쳐 쓰기를 부탁한 첫 초안 — 고쳐 쓴 글이 형식 검사에서 떨어지면 이것을 쓴다
        let softFallback: AnyDraft | null = null;
        for (let round = 0; round <= maxRepairs; round++) {
          const called = await call(messages, ctx);
          const { result } = called;
          const done = (outcome: "ok" | "invalid") => caller.recordResult(ctx, spec, called, outcome, "VALIDATION");
          const retry = (errors: string[]) => {
            lastReadingErrors = errors;
            ctx.onAttempt?.({ round, errors, text: result.text });
            messages.push({ role: "assistant", content: result.text.slice(0, 20000) }, { role: "user", content: kit.repair(errors) });
          };
          let parsed: unknown;
          try {
            parsed = extractJson(result.text);
          } catch {
            done("invalid");
            retry(["JSON 형식이 아닙니다. JSON 객체 하나만 출력해 주세요."]);
            continue;
          }
          const checked = kit.validate(parsed);
          if (!checked.ok) {
            done("invalid");
            retry(checked.errors);
            continue;
          }
          // 형식은 맞아도 조건 없는 단정 · 범용 문장 · 겹치는 말이 많으면 한 번 고쳐 쓰게 한다 (켜 둔 경우만)
          if (opts.enforceDepth) {
            const depthErrors = kit.depthErrors(checked.draft);
            if (depthErrors.length > 0) {
              done("invalid");
              retry(depthErrors);
              continue;
            }
          }
          // 같은 표현이 여러 곳에 되풀이되면 한 번 고쳐 쓰게 한다 (켜 둔 경우만, 마지막 시도에서는 그대로 받는다)
          if (opts.repairRepeats && round < maxRepairs) {
            const repeats = kit.repeats(checked.draft);
            if (repeats.length > 0) {
              softFallback ??= checked.draft;
              done("ok");
              retry(repeatMessages(repeats));
              continue;
            }
          }
          done("ok");
          return kit.assemble(checked.draft);
        }
        if (softFallback) return kit.assemble(softFallback);
        throw new Error(`리포트 형식 검사 실패: ${lastReadingErrors.slice(0, 3).join(" / ")}`);
      }
      const messages: ModelMessage[] = [{ role: "user", content: buildUserMessage(evidence, ref.iso, context) }];

      let lastErrors: string[] = [];
      for (let round = 0; round <= maxRepairs; round++) {
        const called = await call(messages, ctx);
        const { result } = called;
        const done = (outcome: "ok" | "invalid") => caller.recordResult(ctx, spec, called, outcome, "VALIDATION");
        let parsed: unknown;
        try {
          parsed = extractJson(result.text);
        } catch {
          done("invalid");
          lastErrors = ["JSON 형식이 아닙니다. JSON 객체 하나만 출력해 주세요."];
          messages.push({ role: "assistant", content: result.text.slice(0, 20000) }, { role: "user", content: buildRepairMessage(lastErrors) });
          continue;
        }
        const checked = validateDraft(parsed, evidence, { hasContext: Boolean(context) });
        done(checked.ok ? "ok" : "invalid");
        if (checked.ok) {
          const report: PersonalReportV2 = {
            kind: "personal-v2",
            source: input.summary.source,
            personName: input.nickname,
            saju: sajuSection(input.saju),
            evidence,
            base: input.summary,
            extras: buildReportExtras({ summary: input.summary, saju: input.saju, reference: ref }),
            basis: {
              ruleVersions: [SAJU_RULE_VERSION, SURVEY_RULE_VERSION, PROMPT_VERSION],
              referenceDate: ref.iso,
              lines: input.saju.status === "ok" ? [`만세력 엔진 ${input.saju.engine.name} ${input.saju.engine.version}`, ...describePolicy(input.saju.options)] : [],
              ...(context
                ? { context: { topic: context.topic, topicLabel: topicLabel(context.topic), fields: filledFields(context), updatedAt: context.updatedAt ?? null } }
                : {}),
            },
            ...fillName(checked.draft, input.nickname),
          };
          return report;
        }
        lastErrors = checked.errors;
        messages.push({ role: "assistant", content: result.text.slice(0, 20000) }, { role: "user", content: buildRepairMessage(lastErrors) });
      }
      throw new Error(`리포트 형식 검사 실패: ${lastErrors.slice(0, 3).join(" / ")}`);
    },
  };
}
