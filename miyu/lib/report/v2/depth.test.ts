// 실행: npm test — 유료 리포트 "내용 차이" 검사기. 길이가 아니라 조건 · 구체성 · 중복 · 무료와의 차이를 보는지 확인한다.
// 이 검사는 낱말 · 표지를 세는 어림이라, 통과해도 좋은 글이라는 뜻이 아니다 (가려 읽는 평가가 따로 있다).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../../assessment/modules/index.ts";
import { EMPTY_BASIC_INFO } from "../../profile/basic-info.ts";
import { manseryeokEngine } from "../../saju/manseryeok-engine.ts";
import { submitAssessment } from "../../services/assessment-service.ts";
import { createMemoryRepository } from "../../services/testing/memory-repository.ts";
import { buildEvidence } from "../ai/generator.ts";
import { buildPersonas } from "../ai/compare-personas.ts";
import { composeMockDraft } from "../ai/mock-model.ts";
import type { Evidence } from "../evidence.ts";
import { checkDepth, crossPersonOverlap, DEPTH_THRESHOLDS } from "./depth.ts";
import { buildUserMessage } from "./prompt.ts";
import type { ReportDraftV2 } from "./types.ts";
import { validateDraft } from "./validate.ts";

const USER = "11111111-1111-4111-8111-111111111111";

async function persona(): Promise<Evidence[]> {
  const now = () => new Date("2026-10-12T00:00:00Z");
  const mem = createMemoryRepository(now);
  await mem.repo.ensureProfile(USER);
  const items = ASSESSMENT_MODULES.flatMap((m) => m.items);
  const answers = Object.fromEntries(items.map((i, n) => [i.id, n % 2 ? 2 : 5]));
  const r = await submitAssessment({ repo: mem.repo, saju: manseryeokEngine }, { userId: USER, channel: "web", info: { ...EMPTY_BASIC_INFO, gender: "female" as const, nickname: "하린", birthYear: "2001", birthMonth: "7", birthDay: "29", birthTime: "06:10", knownMbti: "INFJ" }, answers, today: now() });
  if (!r.ok) throw new Error("save");
  return buildEvidence({ nickname: "하린", knownMbti: "INFJ", birthText: "", summary: r.assessment.summary, saju: r.assessment.saju, gender: "female", context: null } as never, { year: 2026, month: 10 });
}
const target = (): ReportDraftV2 => JSON.parse(readFileSync(new URL("../../../docs/samples/target-report-haerin.json", import.meta.url), "utf8")) as ReportDraftV2;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const failIds = (r: ReturnType<typeof checkDepth>) => r.flags.filter((f) => f.severity === "fail").map((f) => f.id);

test("목표 수준 예시는 내용 차이 검사를 통과한다 (조건 · 사주 중심 · 구체적 행동 · 무료가 약속한 내용 모두)", async () => {
  const res = checkDepth({ draft: target(), evidence: await persona() });
  assert.deepEqual(failIds(res), [], res.flags.map((f) => f.message).join("\n"));
  assert.equal(res.pass, true);
  assert.ok(Object.values(res.promises).every(Boolean), JSON.stringify(res.promises));
  assert.ok(res.metrics.conditionRatio >= DEPTH_THRESHOLDS.conditionRatioMin);
  assert.ok(res.metrics.selfOverlapMax < DEPTH_THRESHOLDS.selfOverlapMax);
});

test("모의 모델의 글(근거 문장을 이어 붙인 것)은 형식 검사는 통과해도 내용 차이 검사는 통과하지 못한다", async () => {
  const evidence = await persona();
  const mock = composeMockDraft(buildUserMessage(evidence, "2026-10-12", null));
  assert.equal(validateDraft(mock, evidence).ok, true, "형식 검사는 통과");
  const res = checkDepth({ draft: mock, evidence });
  assert.equal(res.pass, false);
  for (const id of ["placeholder", "condition", "self-overlap"]) assert.ok(failIds(res).includes(id), `${id} 걸림: ${failIds(res).join(",")}`);
});

test("범용 문장(누구에게나 해당하는 말)으로 채우면 걸린다 — 근거 ID를 달아도 마찬가지", async () => {
  const evidence = await persona();
  const draft = clone(target());
  const barnum = [
    "당신은 겉으로는 밝아 보이지만 속으로는 고민이 많은 사람입니다. 인정받고 싶은 마음이 크고 스스로에게 엄격한 편입니다.",
    "누구나 그렇듯 내면에는 아무에게도 말하지 못한 잠재력이 있습니다. 때로는 대담하지만 때로는 조심스럽습니다.",
  ];
  draft.sections.forEach((s) => s.paragraphs.forEach((p, i) => (p.text = barnum[i % 2])));
  const res = checkDepth({ draft, evidence });
  assert.equal(res.pass, false);
  assert.ok(failIds(res).includes("generic"), failIds(res).join(","));
  assert.ok(failIds(res).includes("condition"));
});

test("길이를 늘려서는 통과하지 못한다 — 같은 말을 조금 바꿔 늘리면 중복으로, 조건 없는 긴 문단을 더하면 조건 부족으로 걸린다", async () => {
  const evidence = await persona();
  const base = checkDepth({ draft: target(), evidence });
  // 1) 문단을 거의 그대로 복사해 말만 조금 바꿈
  const padded = clone(target());
  for (const s of padded.sections) {
    const p = s.paragraphs[0];
    s.paragraphs.push({ text: p.text.replace(/^\S+\s\S+\s\S+/, "다시 말해 이 부분은"), evidence: p.evidence });
  }
  const r1 = checkDepth({ draft: padded, evidence });
  assert.ok(r1.metrics.totalChars > base.metrics.totalChars * 1.2, "글자 수는 늘었다");
  assert.ok(failIds(r1).includes("self-overlap"), failIds(r1).join(","));
  // 2) 조건 없이 길게 단정하는 문단을 여러 개 더함
  const long = clone(target());
  const filler = "원국의 기운이 이 사람의 성격을 이루는 바탕이 됩니다. 기운이 고르게 퍼져 있어 전체적으로 안정된 구조를 이루고 있으며, 그 구조가 삶의 여러 장면에 영향을 줍니다. 이러한 특징은 시간이 지나도 크게 변하지 않고 이어집니다. ";
  for (const s of long.sections) for (let i = 0; i < 3; i++) s.paragraphs.push({ text: filler.repeat(2).replace("원국의 기운이", ["원국의 기운이", "타고난 기질이", "사주의 균형이"][i]) + `(${i})`, evidence: s.paragraphs[0].evidence });
  const r2 = checkDepth({ draft: long, evidence });
  assert.ok(r2.metrics.totalChars > base.metrics.totalChars * 1.5);
  assert.equal(r2.pass, false, "길어졌다고 통과하지 않는다");
  // 3) 길이(글자 수)는 통과 기준에 쓰이지 않는다 — 짧은 목표 글도 통과한다
  const short = clone(target());
  short.sections.filter((s) => s.id !== "mechanics").forEach((s) => (s.paragraphs = s.paragraphs.slice(0, 1)));
  const shortRes = checkDepth({ draft: short, evidence });
  assert.ok(shortRes.metrics.totalChars < base.metrics.totalChars * 0.9, "글자 수는 줄었다");
  assert.deepEqual(failIds(shortRes), [], "짧아도 내용이 있으면 통과한다 — 길이는 기준이 아니다");
});

test("무료 미리보기와 같은 말을 되풀이하면 경고한다 (새로 알게 되는 내용 부족) — 경고만이고 실패는 아니다", async () => {
  const evidence = await persona();
  const draft = target();
  const free = [...draft.summary, ...draft.sections.flatMap((s) => s.paragraphs), ...draft.differences].map((p) => p.text);
  const same = checkDepth({ draft, evidence, freeTexts: free });
  assert.equal(same.metrics.novelty, 0);
  assert.ok(same.flags.some((f) => f.id === "novelty" && f.severity === "warn"));
  assert.equal(same.pass, true);
  const different = checkDepth({ draft, evidence, freeTexts: ["오늘 날씨가 맑아서 산책을 다녀왔습니다. 공원에는 사람이 많았고 아이들이 뛰어놀았습니다."] });
  assert.equal(different.metrics.novelty, 1);
  assert.ok(!different.flags.some((f) => f.id === "novelty"));
});

test("무료가 약속한 내용이 빠지면 실패한다 — 큰 흐름 · 상황별 차이 · 실천 제안", async () => {
  const evidence = await persona();
  const noFlow = clone(target());
  noFlow.timeline = [];
  assert.ok(failIds(checkDepth({ draft: noFlow, evidence })).includes("promise-flow"));
  const noDiff = clone(target());
  noDiff.differences = [];
  assert.ok(failIds(checkDepth({ draft: noDiff, evidence })).includes("promise-situationDifference"));
  const vague = clone(target());
  vague.actions = vague.actions.map((a) => ({ ...a, action: "마음을 편하게 가지려고 노력해 봅니다." }));
  const res = checkDepth({ draft: vague, evidence });
  assert.ok(failIds(res).includes("actions-concrete"), failIds(res).join(","));
  assert.ok(failIds(res).includes("actions-distinct") || !res.promises.applicableActions);
});

test("사주 중심: 사주 근거 없이 응답만 인용한 글은 실패하고, 응답 환산값 숫자는 경고한다", async () => {
  const evidence = await persona();
  const survey = evidence.filter((e) => e.source !== "saju").map((e) => e.id);
  assert.ok(survey.length > 0);
  const draft = clone(target());
  [...draft.summary, ...draft.sections.flatMap((s) => s.paragraphs)].forEach((p) => (p.evidence = [survey[0]]));
  assert.ok(failIds(checkDepth({ draft, evidence })).includes("saju-center"));
  const withScore = clone(target());
  withScore.summary[0].text += " 새로움 추구는 88점으로 나타났습니다.";
  const res = checkDepth({ draft: withScore, evidence });
  assert.ok(res.flags.some((f) => f.id === "score-numbers" && f.severity === "warn"));
  assert.equal(res.pass, true, "경고는 실패가 아니다");
});

test("사람 간 겹침: 같은 글끼리는 1, 전혀 다른 글끼리는 0, 같은 틀에 근거만 바꾼 모의 글끼리는 많이 겹친다", () => {
  const t = target();
  assert.equal(crossPersonOverlap(t, t), 1);
  const personas = buildPersonas(2).map((p) => {
    const ev = buildEvidence(p.input, { year: 2026, month: 10 });
    return composeMockDraft(buildUserMessage(ev, "2026-10-12", p.input.context));
  });
  assert.equal(crossPersonOverlap(t, personas[0]), 0);
  assert.ok(crossPersonOverlap(personas[0], personas[1]) > 0.3, "같은 틀로 이어 붙인 글은 사람이 바뀌어도 많이 겹친다");
  assert.equal(crossPersonOverlap({ ...t, summary: [], sections: [], differences: [] }, t), 0);
});
