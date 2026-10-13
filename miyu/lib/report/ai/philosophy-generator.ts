// 자기 이해 풀이(비교용 v0) 생성기 — 개인 종합 리포트 생성기와 같은 방식(근거 목록 → 모델 → 형식 검사 → 한 번 고쳐 쓰기)이다.
// 제공사와 무관하게 TextModel 약속만 쓰고, AI 품질 비교 실행기(compare-plan.ts)가 예산 하드스톱(withBudget)으로 감싼 모델을 넘긴다.
// 제품의 구매 흐름(ReportGenerator)에는 연결하지 않았다 — 운영자가 구조를 확정한 뒤 연결한다.
import { filledFields, topicLabel } from "../../personalization/context.ts";
import { SAJU_RULE_VERSION } from "../../saju/interpret/rules.ts";
import type { GenerateContext, ReportInput } from "../generator.ts";
import { PHILOSOPHY_PROMPT_VERSION, PHILOSOPHY_SYSTEM_PROMPT, buildPhilosophyRepairMessage, buildPhilosophyUserMessage } from "../philosophy/prompt.ts";
import { PHILOSOPHICAL_KIND, type PhilosophicalDraftV0, type PhilosophicalReportV0 } from "../philosophy/types.ts";
import { validatePhilosophicalDraft } from "../philosophy/validate.ts";
import { SURVEY_RULE_VERSION } from "../survey-evidence.ts";
import { buildEvidence, extractJson, type AiGeneratorOptions } from "./generator.ts";
import { createModelCaller } from "./model-caller.ts";
import type { ModelMessage } from "./model.ts";

function seoulYm(d: Date) {
  const s = new Date(d.getTime() + 9 * 3600000);
  return { year: s.getUTCFullYear(), month: s.getUTCMonth() + 1, iso: s.toISOString().slice(0, 10) };
}

function fillName(draft: PhilosophicalDraftV0, name: string): PhilosophicalDraftV0 {
  // 글 안의 {name}을 이름으로 바꾼다 (이름에 따옴표 · 역슬래시가 있어도 JSON이 깨지지 않게 이스케이프)
  const escaped = JSON.stringify(name).slice(1, -1);
  return JSON.parse(JSON.stringify(draft).replaceAll("{name}", escaped)) as PhilosophicalDraftV0;
}

export type PhilosophicalGenerator = {
  readonly name: string;
  readonly version: string;
  generate(input: ReportInput, ctx?: GenerateContext): Promise<PhilosophicalReportV0>;
};

export function createPhilosophicalGenerator(opts: AiGeneratorOptions): PhilosophicalGenerator {
  const { model } = opts;
  const now = opts.now ?? (() => new Date());
  const maxRepairs = opts.maxRepairs ?? 1;
  const caller = createModelCaller({ model, maxRetries: opts.maxRetries ?? 2, sleep: opts.sleep, maxOutputTokens: opts.maxOutputTokens, callTimeoutMs: opts.callTimeoutMs });
  const spec = { system: PHILOSOPHY_SYSTEM_PROMPT, promptVersion: PHILOSOPHY_PROMPT_VERSION };

  return {
    name: `ai-philosophy:${model.provider}`,
    version: `${model.model}|${PHILOSOPHY_PROMPT_VERSION}|${SAJU_RULE_VERSION}`,
    async generate(input, ctx = {}) {
      const ref = seoulYm(now());
      const evidence = buildEvidence(input, ref);
      const context = input.context;
      const messages: ModelMessage[] = [{ role: "user", content: buildPhilosophyUserMessage(evidence, ref.iso, context) }];
      let lastErrors: string[] = [];
      for (let round = 0; round <= maxRepairs; round++) {
        const called = await caller.call(messages, ctx, spec);
        const { result } = called;
        const done = (outcome: "ok" | "invalid") => caller.recordResult(ctx, spec, called, outcome, "VALIDATION");
        let parsed: unknown;
        try {
          parsed = extractJson(result.text);
        } catch {
          done("invalid");
          lastErrors = ["JSON 형식이 아닙니다. JSON 객체 하나만 출력해 주세요."];
          messages.push({ role: "assistant", content: result.text.slice(0, 20000) }, { role: "user", content: buildPhilosophyRepairMessage(lastErrors) });
          continue;
        }
        const checked = validatePhilosophicalDraft(parsed, evidence, { hasConcern: Boolean(context) });
        done(checked.ok ? "ok" : "invalid");
        if (checked.ok) {
          return {
            kind: PHILOSOPHICAL_KIND,
            source: input.summary.source,
            personName: input.nickname,
            evidence,
            basis: {
              ruleVersions: [SAJU_RULE_VERSION, SURVEY_RULE_VERSION, PHILOSOPHY_PROMPT_VERSION],
              referenceDate: ref.iso,
              ...(context ? { concern: { topic: context.topic, topicLabel: topicLabel(context.topic), fields: filledFields(context) } } : {}),
            },
            ...fillName(checked.draft, input.nickname),
          };
        }
        lastErrors = checked.errors;
        messages.push({ role: "assistant", content: result.text.slice(0, 20000) }, { role: "user", content: buildPhilosophyRepairMessage(checked.errors) });
      }
      throw new Error(`자기 이해 풀이 검사 실패: ${lastErrors.slice(0, 3).join(" / ")}`);
    },
  };
}
