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
import { checkReadingDepth } from "../reading/depth.ts";
import { buildReadingRepairMessage, buildReadingUserMessage, READING_PROMPT_VERSION, READING_SYSTEM_PROMPT } from "../reading/prompt.ts";
import { validateReadingDraft } from "../reading/validate.ts";
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
   * personal-v2는 이전 형식이며 비교 · 호환용이다.
   */
  format?: "reading-v1" | "personal-v2";
  /**
   * 형식 검사를 통과해도 내용 차이 검사(reading/depth.ts)에서 걸리면 한 번 고쳐 쓰게 하고 그래도 안 되면 실패로 남긴다 (읽기 구조만).
   * 낱말 · 표지를 센 어림이어서 기본은 끄고(보고만), 실제 AI를 연결할 때 운영자가 켠다. 모의 글은 이 검사를 통과할 수 없다.
   */
  enforceDepth?: boolean;
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
    timeline: draft.timeline.map((t) => ({ ...t, theme: fix(t.theme), opportunity: fix(t.opportunity), caution: fix(t.caution) })),
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
  const spec = format === "reading-v1" ? { system: READING_SYSTEM_PROMPT, promptVersion: READING_PROMPT_VERSION } : { system: SYSTEM_PROMPT, promptVersion: PROMPT_VERSION };
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
      const evidence = buildEvidence(input, ref);
      const context = input.context;
      if (format === "reading-v1") {
        const messages: ModelMessage[] = [{ role: "user", content: buildReadingUserMessage(evidence, ref.iso, context) }];
        let lastReadingErrors: string[] = [];
        for (let round = 0; round <= maxRepairs; round++) {
          const called = await call(messages, ctx);
          const { result } = called;
          const done = (outcome: "ok" | "invalid") => caller.recordResult(ctx, spec, called, outcome, "VALIDATION");
          const retry = (errors: string[]) => {
            lastReadingErrors = errors;
            messages.push({ role: "assistant", content: result.text.slice(0, 20000) }, { role: "user", content: buildReadingRepairMessage(errors) });
          };
          let parsed: unknown;
          try {
            parsed = extractJson(result.text);
          } catch {
            done("invalid");
            retry(["JSON 형식이 아닙니다. JSON 객체 하나만 출력해 주세요."]);
            continue;
          }
          const checked = validateReadingDraft(parsed, evidence, { hasContext: Boolean(context) });
          if (!checked.ok) {
            done("invalid");
            retry(checked.errors);
            continue;
          }
          // 형식은 맞아도 조건 없는 단정 · 범용 문장 · 겹치는 말이 많으면 한 번 고쳐 쓰게 한다 (켜 둔 경우만)
          if (opts.enforceDepth) {
            const depth = checkReadingDepth({ draft: checked.draft });
            if (!depth.pass) {
              done("invalid");
              retry(depth.flags.filter((f) => f.severity === "fail").map((f) => f.message));
              continue;
            }
          }
          done("ok");
          return assembleReading({
            draft: checked.draft,
            evidence,
            input,
            reference: ref,
            promptVersion: READING_PROMPT_VERSION,
            ruleVersions: [SAJU_RULE_VERSION, SURVEY_RULE_VERSION, READING_PROMPT_VERSION],
          });
        }
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
