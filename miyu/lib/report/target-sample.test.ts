// 실행: npm test — 유료 리포트 "목표 수준 예시"(docs/samples/target-report-haerin.json)가 제품의 형식 · 근거 · 표현 검사를 통과하는지 확인한다.
// 이 예시는 제품이 만든 결과가 아니라, 같은 근거 목록으로 쓴 글의 깊이를 보여 주는 기준선이다 (실제 AI 비교 생성의 목표).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { EMPTY_BASIC_INFO } from "../profile/basic-info.ts";
import { manseryeokEngine } from "../saju/manseryeok-engine.ts";
import { submitAssessment } from "../services/assessment-service.ts";
import { createMemoryRepository } from "../services/testing/memory-repository.ts";
import { buildEvidence } from "./ai/generator.ts";
import type { ReportDraftV2 } from "./v2/types.ts";
import { validateDraft } from "./v2/validate.ts";

const USER = "11111111-1111-4111-8111-111111111111";

async function persona() {
  const now = () => new Date("2026-10-12T00:00:00Z");
  const mem = createMemoryRepository(now);
  await mem.repo.ensureProfile(USER);
  const items = ASSESSMENT_MODULES.flatMap((m) => m.items);
  const answers = Object.fromEntries(items.map((i, n) => [i.id, n % 2 ? 2 : 5]));
  const r = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: USER, channel: "web", info: { ...EMPTY_BASIC_INFO, nickname: "하린", birthYear: "2001", birthMonth: "7", birthDay: "29", birthTime: "06:10", knownMbti: "INFJ" }, answers, today: now() });
  if (!r.ok) throw new Error("save");
  return buildEvidence({ nickname: "하린", knownMbti: "INFJ", birthText: "", summary: r.assessment.summary, saju: r.assessment.saju, gender: "female", context: null } as never, { year: 2026, month: 10 });
}

test("목표 수준 예시(가상 인물 하린): 실제 엔진 계산에서 나온 근거 안에서만 쓰였고 제품의 검사를 통과한다", async () => {
  const draft = JSON.parse(readFileSync(new URL("../../docs/samples/target-report-haerin.json", import.meta.url), "utf8")) as ReportDraftV2;
  const result = validateDraft(draft, await persona());
  assert.deepEqual(result.ok ? [] : result.errors, []);
});

test("목표 수준 예시: 점수 숫자 · 구체적 날짜 · 사건 예언 없이, 사주 근거와 응답 근거가 함께 쓰이고 시기는 계산된 해만 쓴다", async () => {
  const draft = JSON.parse(readFileSync(new URL("../../docs/samples/target-report-haerin.json", import.meta.url), "utf8")) as ReportDraftV2;
  const evidence = await persona();
  const source = new Map(evidence.map((e) => [e.id, e.source]));
  const body = JSON.stringify(draft);
  assert.doesNotMatch(body, /\b88\b|\b67\b/, "응답 점수 숫자를 본문에 쓰지 않는다");
  assert.doesNotMatch(body, /\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/, "특정 날짜 없음");
  assert.doesNotMatch(body, /결혼|이별|이직하게|직업|나이/, "상대 · 사건 예언 없음");
  for (const section of draft.sections) for (const p of section.paragraphs) {
    const kinds = new Set(p.evidence.map((id) => source.get(id)));
    assert.ok(kinds.has("saju") || kinds.has("survey"), `${section.id} 문단에 근거 출처가 있다`);
  }
  assert.deepEqual(draft.timeline.map((t) => t.period), ["2026년 병오", "2027년 정미", "2028년 무신"]);
  const mixed = draft.sections.flatMap((s) => s.paragraphs).filter((p) => p.evidence.some((id) => source.get(id) === "saju") && p.evidence.some((id) => source.get(id) === "survey")).length;
  assert.ok(mixed >= 5, `사주와 응답을 함께 근거로 쓴 문단 ${mixed}개`);
});
