// 실행: npm test — 사주 궁합 리포트(compat-v1): 근거(엔진의 compat.*)가 지시문 · 요청에 그대로 가는지, 지시문이 시기 · 판정 · 속마음 · 관계 종류 · 응답을 쓰지 말라고 하는지,
// 형식 검사가 이 규칙들을 실제로 막는지, 조립이 무료 간단 궁합과 같은 커플 유형 · 지수를 쓰는지, 쓰기(고쳐 쓰기 · 실패)가 되는지 확인한다.
// 모의 작성기의 글은 자리 표시이며 좋은 글이 아니다 — 이 시험은 규칙이 지켜지는지 보는 것이고, 실제 AI가 쓴 글의 품질이나 궁합 풀이의 정확도를 보증하지 않는다.
import assert from "node:assert/strict";
import test from "node:test";
import { cardOf } from "../../compat/simple.ts";
import type { SajuOk } from "../../saju/engine.ts";
import { compatOf } from "../../saju/interpret/compat.ts";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { ModelCallError, type ModelRequest, type ModelResult, type TextModel } from "../ai/model.ts";
import { assembleCompatReport, nameText } from "./assemble.ts";
import { composeMockCompat } from "./mock-model.ts";
import { COMPAT_LIMITS, COMPAT_NOTES, COMPAT_SECTIONS, COMPAT_TIMING_BUILT } from "./plan.ts";
import { buildCompatUserMessage, COMPAT_PROMPT_MARK, COMPAT_PROMPT_VERSION, COMPAT_SYSTEM_PROMPT } from "./prompt.ts";
import type { CompatDraftV1 } from "./types.ts";
import { validateCompatDraft } from "./validate.ts";
import { CompatWriteError, createCompatWriter } from "./writer.ts";

const person = (year: number, month: number, day: number, birthTime: string | null = "09:30"): SajuOk => {
  const r = calculateSaju({ year, month, day, calendar: "solar", isLeapMonth: false, birthTime, gender: "female" });
  assert.equal(r.status, "ok");
  return r as SajuOk;
};
const PAIRS: [SajuOk, SajuOk][] = [
  [person(1996, 3, 29), person(1994, 11, 2)],
  [person(1990, 5, 17), person(1991, 8, 8, null)],
  [person(2001, 1, 9), person(1999, 12, 24)],
];
const result = compatOf(...PAIRS[0]);
const mockMessage = (r = result) => buildCompatUserMessage(r.evidence, r.cautions);
const draftOf = (r = result) => composeMockCompat(mockMessage(r));
const clone = (d: CompatDraftV1) => JSON.parse(JSON.stringify(d)) as CompatDraftV1;
const errorsOf = (d: unknown, r = result) => {
  const v = validateCompatDraft(d, r.evidence);
  return v.ok ? [] : v.errors;
};
/** 첫 영역의 마지막 문단을 바꿔 본다 — 첫 문단은 용어 금지 · 내용 규칙이 따로 있어 두 번째 문단을 쓴다 */
const withParagraph = (text: string): CompatDraftV1 => {
  const d = clone(draftOf());
  d.sections[1].paragraphs[1] = text;
  return d;
};

test("모의 작성기의 초안은 세 쌍의 사주 모두에서 형식 검사를 통과하고 조립된다(자리 표시 글일 뿐이다)", () => {
  for (const [a, b] of PAIRS) {
    const r = compatOf(a, b);
    const d = composeMockCompat(buildCompatUserMessage(r.evidence, r.cautions));
    const v = validateCompatDraft(d, r.evidence);
    assert.ok(v.ok, v.ok ? "" : v.errors.join("\n"));
    assert.equal(d.sections.length, 5);
    assert.deepEqual(d.sections.map((s) => s.id), COMPAT_SECTIONS.map((s) => s.id));
  }
});

test("요청 근거: 궁합 엔진이 계산한 compat.* 근거가 그대로 가고, 두 사람을 A님 · B님으로만 부르며, 이름 · 생년월일 원문이 없다", () => {
  const msg = mockMessage();
  const payload = JSON.parse(msg.slice(msg.indexOf("{")));
  assert.deepEqual(payload.people, ["A님", "B님"]);
  assert.deepEqual(payload.evidence.map((e: { id: string }) => e.id), result.evidence.map((e) => e.id));
  assert.ok(payload.evidence.every((e: { id: string }) => e.id.startsWith("compat.")));
  assert.ok(!/1996|1994|03-29|11-02/.test(msg), "생년월일 형태가 없다");
  // 무료 간단 궁합과 같은 결과 — 유형 · 지수 근거가 요청에도 들어 있다
  const type = payload.evidence.find((e: { id: string }) => e.id === "compat.type");
  const score = payload.evidence.find((e: { id: string }) => e.id === "compat.score");
  assert.ok(type.fact.includes(result.coupleType.name));
  assert.ok(score.fact.includes(`궁합 지수 ${result.score}`));
});

test("지시문: 사주 궁합의 일(풀이 · 장면 · 조율 · 방향)과 쓰지 않는 것(판정 · 속마음 · 관계 종류 · 시기 · 상품 안내 · 응답 · 점수)을 함께 말한다", () => {
  assert.ok(COMPAT_SYSTEM_PROMPT.startsWith(COMPAT_PROMPT_MARK));
  for (const must of ["A님", "B님", "해요체", "쓰지 않는 것은 이 네 가지를 해치는 것", "누구 탓", "evidence", "~로 읽혀요", "관계의 종류를 단정하지", "속마음", "천생연분", "점수 숫자", "커플 유형 이름을 본문에서 되풀이하지", "두 사람의 시기", "두 사람의 응답은 이 풀이에 없다", "구매 안내는 화면이 한다", "JSON 객체 하나만", "첫 문단은 용어 없이", "서로에게 건넬 수 있는 짧은 말 한 문장", "그 모양이 읽히지 않았다는 뜻", "누가 누구를 키우는지의 방향이 없다", "strength가 weak인 근거", "세 영역 이상에서 되풀이하지 않는다", "우선 참고(목록에 있는 것만)", "영역마다 한두 개만", "0단계\"(compat.type)여도 근거에 작은 충"]) {
    assert.ok(COMPAT_SYSTEM_PROMPT.includes(must), must);
  }
  for (const s of COMPAT_SECTIONS) assert.ok(COMPAT_SYSTEM_PROMPT.includes(`- ${s.id} (${s.topic}`), s.id);
  assert.equal(COMPAT_PROMPT_VERSION, "compat-v1-prompt-0.2");
  assert.equal(COMPAT_TIMING_BUILT, false, "두 사람의 시기는 아직 계산하지 않았다 — 계산하면 이 시험 · 지시문 · 검사 · 화면 안내를 함께 바꾼다");
});

test("검사: 통과하는 글(조건형 · 두 분 · 장면)과 걸러야 할 글 — 관계 판정 · 속마음 · 관계 종류 · 시기 · 점수 · 한 글자 이름 · 첫 문단 용어", () => {
  const good = "A님 쪽이 먼저 움직이고 B님 쪽이 한 번 더 확인하는 흐름으로 읽혀요. 약속을 잡을 때 두 분의 속도가 달라서 답을 기다리는 시간이 길게 느껴질 수 있어요.";
  assert.deepEqual(errorsOf(withParagraph(good)), []);

  const bad: [string, RegExp][] = [
    ["두 분은 천생연분이라서 어떤 일이 있어도 이어질 수 있어요. 서로가 정말 잘 맞는 조합으로 읽혀요.", /좋고 나쁨|운명/],
    ["A님은 사실 마음속으로 B님이 부담스럽다고 느끼는 면이 있을 수 있어요. 그래서 거리를 두려는 쪽으로 읽혀요.", /속마음/],
    ["A님은 B님의 남자친구라서 연락이 늦으면 서운함이 쌓이기 쉬운 쪽으로 읽혀요. 그럴 때 한 번 말해 보면 좋아요.", /관계 종류/],
    ["올해 안에 두 분의 관계가 한 번 크게 깊어지는 시기가 올 수 있어요. 그 시기에 속도를 맞춰 보면 좋아요.", /시기/],
    ["두 분의 궁합 점수는 높아서 85점 정도로 볼 수 있어요. 그래서 대체로 편안하게 이어지기 쉬워요.", /점수/],
    ["A는 먼저 움직이는 쪽이고 B는 확인하는 쪽으로 읽혀요. 두 분이 약속을 정할 때 속도가 달라 보일 수 있어요.", /한 글자/],
  ];
  for (const [text, re] of bad) {
    const e = errorsOf(withParagraph(text)).join("\n");
    assert.match(e, re, text);
  }
  // 첫 문단에 사주 용어를 쓰면 막는다
  const termFirst = clone(draftOf());
  termFirst.sections[0].paragraphs[0] = "A님과 B님의 일간은 서로 돕는 관계로 읽혀요. 두 분이 함께 있을 때 한쪽이 다른 쪽을 받쳐 주는 장면이 자주 있을 수 있어요.";
  assert.match(errorsOf(termFirst).join("\n"), /첫 문단에는 사주 용어/);
});

test("검사: 영역 순서 · 문단 수 · 없는 근거 · 근거 되풀이(세 영역까지) · 행동 개수와 영역", () => {
  const d1 = clone(draftOf());
  d1.sections = [d1.sections[1], d1.sections[0], ...d1.sections.slice(2)];
  assert.match(errorsOf(d1).join("\n"), /순서로 5개/);

  const d2 = clone(draftOf());
  d2.sections[2].evidence = ["compat.없는근거"];
  assert.match(errorsOf(d2).join("\n"), /없는 근거 ID/);

  const d3 = clone(draftOf());
  for (const s of d3.sections) s.evidence = [result.evidence[0].id];
  assert.match(errorsOf(d3).join("\n"), new RegExp(`${COMPAT_LIMITS.evidenceReuseMax}개 영역까지만`));

  const d4 = clone(draftOf());
  d4.actions = d4.actions.slice(0, 2);
  assert.match(errorsOf(d4).join("\n"), /actions: 2개/);

  const d5 = clone(draftOf());
  d5.actions[0].area = "overview" as never;
  assert.match(errorsOf(d5).join("\n"), /area: fit · friction · love · long/);
});

test("조립: 커플 유형 · 지수 · 계산 재료는 무료 간단 궁합(cardOf)과 같은 결과이고, 이름 자리가 바뀌며, 모의 글은 판매할 수 없다고 표시된다", () => {
  const names = { a: "슬기", b: "남수" };
  const d = clone(draftOf());
  d.sections[1].paragraphs[1] = "A님 쪽이 먼저 움직이고 B님 쪽이 한 번 더 확인하는 흐름으로 읽혀요. 약속을 잡을 때 두 분의 속도가 달라서 답을 기다리는 시간이 길게 느껴질 수 있어요.";
  const report = assembleCompatReport(d, result, names, { provider: "mock", model: "mock", at: "2026-10-16T00:00:00Z", placeholder: true });
  const card = cardOf(result, names);
  assert.equal(report.summary.typeName, card.typeName);
  assert.equal(report.summary.score, card.score);
  assert.equal(report.summary.core, card.core);
  assert.deepEqual(report.summary.parts, card.basis);
  assert.equal(report.summary.scoreNotProbability, card.notes.scoreNotProbability);
  assert.equal(report.ruleVersion, result.version);
  assert.ok(report.sections[1].paragraphs[1].startsWith("슬기 님 쪽이 먼저 움직이고 남수 님 쪽이"));
  assert.ok(!/[AB]님/.test(JSON.stringify(report)), "A님 · B님 자리가 남지 않는다");
  assert.equal(report.placeholder, true);
  assert.deepEqual(report.sections.map((s) => s.id), COMPAT_SECTIONS.map((s) => s.id));
  // 안내는 코드가 채운다: 응답을 쓰지 않았다 · 시기를 계산하지 않았다 · 속마음을 알 수 없다 · 규칙은 검토 전 초안
  assert.ok(report.notes.items.includes(COMPAT_NOTES.noResponses) && report.notes.items.includes(COMPAT_NOTES.timing) && report.notes.items.includes(COMPAT_NOTES.noInnerMind) && report.notes.items.includes(COMPAT_NOTES.rule));
  assert.equal(nameText("A님과 B님", names), "슬기 님과 남수 님");
});

test("쓰기: 첫 글이 검사에 걸리면 이유와 함께 한 번 고쳐 쓰고, 계속 걸리면 INVALID, 호출이 실패하면 MODEL(일시 오류는 한 번 다시)", async () => {
  const input = { evidence: result.evidence, cautions: result.cautions };
  const good = JSON.stringify(draftOf());
  const calls: ModelRequest[] = [];
  const flaky: TextModel = {
    provider: "mock",
    model: "flaky",
    async complete(req) {
      calls.push(req);
      return { text: calls.length === 1 ? "```json\n{\"headline\":\"짧아요\"}\n```" : good, model: "flaky", usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  const usage: string[] = [];
  const draft = await createCompatWriter({ model: flaky, sleep: async () => {} }).write(input, { onUsage: (u) => usage.push(`${u.outcome}:${u.promptVersion}`) });
  assert.equal(draft.sections.length, 5);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].messages.length === 3 && calls[1].messages[2].content.includes("검사를 통과하지 못했습니다"), "나쁜 글과 이유가 함께 간다");
  assert.deepEqual(usage, [`invalid:${COMPAT_PROMPT_VERSION}`, `ok:${COMPAT_PROMPT_VERSION}`]);

  const bad: TextModel = { provider: "mock", model: "bad", complete: async (): Promise<ModelResult> => ({ text: "글이에요", model: "bad" }) };
  await assert.rejects(createCompatWriter({ model: bad, sleep: async () => {} }).write(input), (e: unknown) => e instanceof CompatWriteError && e.code === "INVALID" && e.errors.length > 0);

  let n = 0;
  const down: TextModel = {
    provider: "mock",
    model: "down",
    async complete() {
      n++;
      throw new ModelCallError("연결 실패", { retryable: true, code: "NETWORK_ERROR" });
    },
  };
  await assert.rejects(createCompatWriter({ model: down, sleep: async () => {} }).write(input), (e: unknown) => e instanceof CompatWriteError && e.code === "MODEL");
  assert.equal(n, 2, "일시 오류는 한 번 다시 시도");
});
