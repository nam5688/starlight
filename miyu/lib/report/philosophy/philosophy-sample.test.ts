// 실행: npm test — 같은 가상 인물(하린)의 "기존 풀이"와 "자기 이해 풀이(수정안)" 예시가 근거 · 표현 · 구체성 검사를 지키는지,
// 말만 추상적으로 길어진 것이 아닌지를 어림으로 확인한다. 두 예시는 실제 AI 출력이 아니라 같은 근거 목록으로 쓴 글이며,
// 이 검사는 좋은 글을 보증하지 않는다 (가려 읽는 사람의 평가가 따로 있다).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../../assessment/modules/index.ts";
import { EMPTY_BASIC_INFO } from "../../profile/basic-info.ts";
import type { PersonalContextInput } from "../../personalization/context.ts";
import { manseryeokEngine } from "../../saju/manseryeok-engine.ts";
import { submitAssessment } from "../../services/assessment-service.ts";
import { createMemoryRepository } from "../../services/testing/memory-repository.ts";
import { buildEvidence } from "../ai/generator.ts";
import { checkConcernDepth } from "../concern/depth.ts";
import { personalV2Texts } from "../concern/texts.ts";
import type { ConcernDraftV1 } from "../concern/types.ts";
import { validateConcernDraft } from "../concern/validate.ts";
import { FORBIDDEN } from "../v2/validate.ts";
import { QUANTITY } from "../v2/depth.ts";
import { concernBlocks, containedShare, groundingOf, noveltyAgainst, readingBlocks, type PhilosophicalReading } from "./compare.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const read = <T,>(name: string) => JSON.parse(readFileSync(new URL(`../../../docs/samples/${name}`, import.meta.url), "utf8")) as T;

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

type ExistingSample = { concern: PersonalContextInput; draft: ConcernDraftV1 };
type RevisedSample = { concern: PersonalContextInput; reading: PhilosophicalReading };

async function load() {
  const evidence = await persona();
  const existing = read<ExistingSample>("concern-existing-format-haerin.json");
  const revised = read<RevisedSample>("philosophical-reading-haerin.json");
  const base = read<Record<string, unknown>>("target-report-haerin.json");
  const baseText = personalV2Texts({ ...base, kind: "personal-v2" } as never).all.join(" ");
  return { evidence, existing, revised, baseText };
}

test("기존 형식 예시(고민 반영 리포트 지시문대로 쓴 글)는 지금 제품의 형식 · 근거 · 내용 차이 검사를 통과한다 — 비교 대상이 허수아비가 아니다", async () => {
  const { evidence, existing, baseText } = await load();
  const v = validateConcernDraft(existing.draft, evidence);
  assert.deepEqual(v.ok ? [] : v.errors, []);
  const depth = checkConcernDepth({ draft: existing.draft, concern: existing.concern, baseTexts: [baseText] });
  assert.deepEqual(depth.errors, []);
  assert.deepEqual(depth.warnings, []);
});

test("자기 이해 풀이(수정안): 모든 문단이 계산된 근거 안에서 쓰였고, 사주 근거가 중심이며 응답과 함께 쓰였다", async () => {
  const { evidence, revised } = await load();
  const known = new Map(evidence.map((e) => [e.id, e]));
  const blocks = readingBlocks(revised.reading);
  for (const b of blocks) {
    assert.ok(b.evidence.length > 0, `근거 없는 덩어리: ${b.text.slice(0, 30)}`);
    for (const id of b.evidence) assert.ok(known.has(id), `없는 근거 ID ${id}`);
    assert.ok(!b.evidence.every((id) => known.get(id)?.uncertain), "확실하지 않은 근거만 사용");
  }
  const withSaju = blocks.filter((b) => b.evidence.some((id) => known.get(id)?.source === "saju")).length;
  assert.ok(withSaju / blocks.length >= 0.8, `사주 근거를 단 덩어리 ${withSaju}/${blocks.length}`);
  const g = groundingOf(blocks, revised.concern, evidence);
  assert.ok(g.mixedShare >= 0.8, `사주 · 응답을 함께 단 몫 ${g.mixedShare.toFixed(2)}`);
});

test("자기 이해 풀이(수정안): 지어낸 어린 시절 · 상처 · 사건 예언 · 결정 대신 내리기가 없고, 알려 준 이야기를 사주로 알아맞힌 것처럼 쓰지 않는다", async () => {
  const { revised } = await load();
  const r = revised.reading;
  const all = readingBlocks(r).map((b) => b.text).concat(r.headline, r.noVerdict ?? "");
  for (const t of all) for (const f of FORBIDDEN) assert.doesNotMatch(t, f.re, `${f.why}: ${t.slice(0, 40)}`);
  const text = all.join("\n");
  assert.doesNotMatch(text, /어린 시절|트라우마|상처|부모님|어머니|아버지|전생|영혼|본질|운명|진정한 자아|내면 깊/, "지어낸 배경 · 부풀린 추상어");
  assert.doesNotMatch(text, /(옮기세요|남으세요|옮기는 게 맞|옮기는 것이 맞|남는 것이 맞|남는 게 맞)/, "결정을 대신 내리지 않는다");
  assert.doesNotMatch(text, /사주(에|로|가)[^.!?]{0,30}(새 팀|프로젝트|일주일|옮기)/, "알려 준 이야기를 사주가 보여 준 것처럼 쓰지 않는다");
  assert.match(r.intro.text, /알아맞힌 것이 아닙니다/);
  assert.match(r.noVerdict ?? "", /정하지 않습니다/);
  // 고민의 사실(새 팀 · 프로젝트 · 일주일째 · 아는 사람)을 말하는 해석 문단은 알려 준 내용임을 밝힌다
  for (const b of [...r.values, ...r.conflicts]) {
    if (/새 팀|프로젝트|일주일|아는 사람|제안/.test(b.text)) assert.match(b.text, /알려 주신|하신/, `알려 준 내용임을 밝히지 않음: ${b.title}`);
  }
  // 시기는 계산된 해의 주제만
  assert.match(r.flow.text, /계산된 흐름/);
  assert.match(r.flow.text, /일어난다는 뜻은 아닙니다/);
});

test("자기 이해 풀이(수정안): 다섯 부분이 모두 있고, 갈등은 하나의 결론으로 합치지 않으며, 선택지마다 지키는 것 · 내려놓는 것 · 확인할 것이 있고, 질문마다 시점이 보이는 행동이 있다", async () => {
  const { revised } = await load();
  const r = revised.reading;
  assert.ok(r.values.length >= 2 && r.values.length <= 3, "내가 중요하게 여기는 것");
  assert.ok(r.conflicts.length >= 2 && r.conflicts.length <= 3, "내 안의 갈등");
  assert.match(r.disagreement.text, /한 방향으로 모이지 않습니다/);
  assert.match(r.disagreement.text, /하나의 결론으로 합치지 않고/);
  assert.ok(r.strengthCost.length >= 2, "강점과 그 대가");
  for (const s of r.strengthCost) assert.ok(s.strength && s.cost && s.when && s.reading, "강점 · 대가 · 때 · 근거 문장");
  const choices = r.choices ?? [];
  assert.ok(choices.length >= 2 && choices.length <= 4, "이번 고민의 선택지");
  for (const c of choices) assert.ok(c.protects && c.costs && c.check, `${c.option} 지키는 것 · 내려놓는 것 · 확인할 것`);
  assert.ok(r.questionsActions.length >= 4, "돌아볼 질문과 행동");
  for (const q of r.questionsActions) {
    assert.match(q.question, /\?$/);
    assert.match(q.action, QUANTITY, `시점 · 분량이 없는 행동: ${q.action.slice(0, 30)}`);
  }
  // 갈등은 사주 근거와 응답 근거를 함께 단다 (서로 다른 출처가 한 문단 안에서 만난다)
  for (const c of r.conflicts) assert.ok(c.evidence.some((id) => id.startsWith("saju.")) && c.evidence.some((id) => id.startsWith("survey.")), `${c.title} 근거 출처`);
});

test("말만 추상적으로 길어진 것이 아니다: 길이는 기존 형식의 1.5배 이내이고, 상황 표지 없는 추상 문장이 없으며, 조건 · 구체적 행동 · 알려 준 내용 반영이 기존 이상이다", async () => {
  const { evidence, existing, revised, baseText } = await load();
  const eb = concernBlocks(existing.draft);
  const rb = readingBlocks(revised.reading);
  const ge = groundingOf(eb, existing.concern, evidence);
  const gr = groundingOf(rb, revised.concern, evidence);
  assert.ok(gr.chars <= ge.chars * 1.5, `길이 ${gr.chars} / ${ge.chars}`);
  assert.deepEqual(gr.ungroundedAbstract, [], "상황 · 출처 · 조건 · 분량 표지가 없는 추상적인 문장");
  assert.ok(gr.conditionShare >= 0.6, `조건 표지가 있는 덩어리 ${gr.conditionShare.toFixed(2)}`);
  assert.ok(gr.actionConcreteShare >= 2 / 3, `구체적인 행동 ${gr.actionConcreteShare.toFixed(2)}`);
  assert.ok(gr.anchoredSentenceShare >= ge.anchoredSentenceShare - 0.05, `상황 표지가 있는 문장 ${gr.anchoredSentenceShare.toFixed(2)} / ${ge.anchoredSentenceShare.toFixed(2)}`);
  assert.ok(gr.concernCoverage >= 0.35, `고민 낱말 반영 ${gr.concernCoverage.toFixed(2)}`);
  assert.ok(gr.selfOverlapMax < 0.35, `문단끼리 겹침 ${gr.selfOverlapMax.toFixed(2)}`);
  // 이미 준 개인 종합 리포트를 되풀이하지 않고, 기존 형식의 글을 말만 바꿔 늘린 것도 아니다
  assert.ok(noveltyAgainst(rb, baseText) >= 0.7, `개인 종합 리포트와 다른 말 ${noveltyAgainst(rb, baseText).toFixed(2)}`);
  assert.ok(containedShare(rb, baseText) <= 0.15, `개인 종합 리포트와 거의 같은 덩어리 ${containedShare(rb, baseText).toFixed(2)}`);
  assert.ok(containedShare(rb, eb.map((b) => b.text).join(" ")) <= 0.25, `기존 형식 글과 거의 같은 덩어리 ${containedShare(rb, eb.map((b) => b.text).join(" ")).toFixed(2)}`);
});
