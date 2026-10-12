// AI 리포트 생성기 — 계산 결과에서 근거를 뽑고, 모델이 근거 안에서 쓰게 하고, 형식을 검사해 통과한 것만 돌려준다.
// - 일시 오류(속도 제한 · 장애)는 잠시 뒤 다시 부른다
// - 형식 검사에 실패하면 문제 목록을 주고 한 번 다시 쓰게 한다
// - 그래도 실패하면 오류를 던진다 → reports에 failed로 남고 고객은 "다시 만들기"를 누를 수 있다

import { sajuEvidence, SAJU_RULE_VERSION } from "../../saju/interpret/rules.ts";
import { describePolicy } from "../../saju/policy.ts";
import { sajuSection } from "../../saju/display.ts";
import type { Evidence } from "../evidence.ts";
import type { ReportGenerator, ReportInput } from "../generator.ts";
import { surveyEvidence, SURVEY_RULE_VERSION } from "../survey-evidence.ts";
import { buildRepairMessage, buildUserMessage, PROMPT_VERSION, SYSTEM_PROMPT } from "../v2/prompt.ts";
import type { PersonalReportV2, ReportDraftV2 } from "../v2/types.ts";
import { validateDraft } from "../v2/validate.ts";
import { ModelCallError, type ModelMessage, type TextModel } from "./model.ts";

export type AiGeneratorOptions = {
  model: TextModel;
  /** 시기 해석 기준 날짜 */
  now?: () => Date;
  maxRepairs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  maxOutputTokens?: number;
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

export function buildEvidence(input: ReportInput, reference: { year: number; month: number }): Evidence[] {
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
  };
}

export function createAiReportGenerator(opts: AiGeneratorOptions): ReportGenerator {
  const { model } = opts;
  const now = opts.now ?? (() => new Date());
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxRepairs = opts.maxRepairs ?? 1;
  const maxRetries = opts.maxRetries ?? 2;

  async function call(messages: ModelMessage[]) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await model.complete({ system: SYSTEM_PROMPT, messages, maxOutputTokens: opts.maxOutputTokens ?? 16000 });
      } catch (e) {
        if (e instanceof ModelCallError && e.retryable && attempt < maxRetries) {
          await sleep(2000 * 3 ** attempt);
          continue;
        }
        throw e;
      }
    }
  }

  return {
    name: `ai:${model.provider}`,
    version: `${model.model}|${PROMPT_VERSION}|${SAJU_RULE_VERSION}`,
    async generate(input) {
      const ref = seoulYm(now());
      const evidence = buildEvidence(input, ref);
      const messages: ModelMessage[] = [{ role: "user", content: buildUserMessage(evidence, ref.iso) }];

      let lastErrors: string[] = [];
      for (let round = 0; round <= maxRepairs; round++) {
        const result = await call(messages);
        let parsed: unknown;
        try {
          parsed = extractJson(result.text);
        } catch {
          lastErrors = ["JSON 형식이 아닙니다. JSON 객체 하나만 출력해 주세요."];
          messages.push({ role: "assistant", content: result.text.slice(0, 20000) }, { role: "user", content: buildRepairMessage(lastErrors) });
          continue;
        }
        const checked = validateDraft(parsed, evidence);
        if (checked.ok) {
          const report: PersonalReportV2 = {
            kind: "personal-v2",
            source: input.summary.source,
            personName: input.nickname,
            saju: sajuSection(input.saju),
            evidence,
            basis: {
              ruleVersions: [SAJU_RULE_VERSION, SURVEY_RULE_VERSION, PROMPT_VERSION],
              referenceDate: ref.iso,
              lines: input.saju.status === "ok" ? [`만세력 엔진 ${input.saju.engine.name} ${input.saju.engine.version}`, ...describePolicy(input.saju.options)] : [],
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
