// 실행: npm test — 리포트 궁합 D6 검증(2026-10-17, 운영자 지시 "새 문항을 추가하지 말고, 기존에 두 사람이 각각 작성한 유효 응답을 실제 리포트 궁합 생성에 반영"):
// 두 사람이 이미 저장한 응답(기존 22문항에서 나온 기질 · 관계 · 행동 방식 요약과 입력한 MBTI)이 AI 요청에 실제로 들어가는지, 답이 바뀌면 근거가 바뀌는지,
// 뚜렷하지 않은 영역은 만들어 채우지 않는지, 응답을 그대로 재진술한 글 · 답하지 않은 영역의 근거를 쓴 글이 검사에서 막히는지 확인한다.
// 한계: 이 시험은 모의 모델(실제 AI 아님)로 요청 · 검사를 확인한다 — 실제 AI가 두 사람의 차이 · 공통점 · A님 조언 · B님 조언을 읽을 만하게 썼는지는 실제 시험(운영자 PC)의 글 전문으로만 알 수 있다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPersonas } from "../ai/compare-personas.ts";
import { createAiReportGenerator } from "../ai/generator.ts";
import { createMockModel } from "../ai/mock-model.ts";
import type { ModelRequest, ModelResult, TextModel } from "../ai/model.ts";
import { compatOf } from "../../saju/interpret/compat.ts";
import { compatTimingOf } from "../../saju/interpret/compat-timing.ts";
import type { SajuOk } from "../../saju/engine.ts";
import type { PairInput, PairPerson } from "../generator.ts";
import { pairEvidenceOf } from "./pair-evidence.ts";
import { pairSectionsFor } from "./plan.ts";
import { echoedMeaningsIn, PAIR_MEANING_ECHO_MAX, validateCompatDraft } from "./validate.ts";

const personas = buildPersonas(4);
const person = (i: number): PairPerson => {
  const p = personas[i]!;
  return { saju: p.input.saju as SajuOk, summary: structuredClone(p.input.summary), knownMbti: p.input.knownMbti };
};
const REF = { year: 2026, month: 10 };
const responses = (p: PairPerson) => ({ summary: p.summary, mbti: p.knownMbti });
const evidenceOf = (a: PairPerson, b: PairPerson) => {
  const pairs = pairEvidenceOf(responses(a), responses(b));
  return { pairs, all: [...compatOf(a.saju, b.saju).evidence, ...compatTimingOf(a.saju, b.saju, REF).evidence, ...pairs.evidence] };
};

/** 생성기에 실제로 가는 요청과 모델이 돌려준 글을 그대로 받아 두는 모델 */
async function generateRecorded(input: PairInput) {
  const mock = createMockModel();
  const seen: { system: string; user: string; raw: string }[] = [];
  const recorder: TextModel = {
    provider: mock.provider,
    model: mock.model,
    async complete(req: ModelRequest): Promise<ModelResult> {
      const result = await mock.complete(req);
      seen.push({ system: req.system, user: req.messages.map((m) => m.content).join("\n"), raw: result.text });
      return result;
    },
  };
  const report = await createAiReportGenerator({ model: recorder, now: () => new Date("2026-10-17T00:00:00Z"), sleep: async () => {} }).generatePair!(input);
  return { report, seen };
}
const requestEvidence = (user: string) => (JSON.parse(user.slice(user.indexOf("\n") + 1)) as { evidence: { id: string; fact: string }[] }).evidence;

test("D6: 저장된 두 사람의 응답에서 읽힌 영역이 AI 요청에 그대로 들어간다 — 영역마다 A님 · B님 각자의 응답 풀이가 따로 있다", async () => {
  const a = person(0);
  const b = person(1);
  const { pairs } = evidenceOf(a, b);
  assert.ok(pairs.compared.length >= 3, `비교된 영역이 있어야 응답 영역이 생긴다(${pairs.compared.join(", ")})`);
  const { report, seen } = await generateRecorded({ a, b, reference: REF });
  const sent = requestEvidence(seen[0]!.user);
  const sentPair = sent.filter((e) => e.id.startsWith("pair.") && e.id !== "pair.mbti").map((e) => e.id);
  assert.deepEqual(sentPair.sort(), pairs.compared.map((id) => `pair.${id}`).sort(), "요청에 간 응답 근거는 두 사람이 모두 뚜렷하게 답한 영역과 정확히 같다(더도 덜도 아니다)");
  // 각 근거에는 A님의 풀이와 B님의 풀이가 따로 적혀 있어 A님에게 필요한 조언 · B님에게 필요한 조언을 각자 근거에서 끌어낼 수 있다
  for (const e of sent.filter((x) => x.id.startsWith("pair.") && x.id !== "pair.mbti")) {
    assert.match(e.fact, /A님의 응답에서 나타난 경향은 "[^"]+", B님은 "[^"]+"/, e.id);
    assert.match(e.fact, /같은 쪽|서로 다른 쪽/, `${e.id}: 공통점 · 차이가 분명하다`);
  }
  // 글 쪽: 응답 영역 · A님→B님 · B님→A님 · 함께 세 묶음이 만들어진다
  assert.ok(report.sections.some((s) => s.id === "response"), "응답 영역이 있다");
  assert.deepEqual(Object.keys(report.steps).sort(), ["aToB", "bToA", "together"]);
  // 이름 · 생년월일 · 점수 숫자는 AI에 가지 않는다
  assert.ok(!/\d+\s*점/.test(seen[0]!.user), "요청에 점수 숫자가 없다");
  assert.ok(!/\b(19|20)\d{2}-\d{2}-\d{2}\b/.test(seen[0]!.user), "요청에 생년월일 원문이 없다");
});

test("D6: 답이 달라지면 근거가 달라지고(같은 쪽 ↔ 서로 다른 쪽), 바꾸지 않은 영역의 근거는 그대로다", () => {
  const a = person(0);
  const b = person(1);
  const before = pairEvidenceOf(responses(a), responses(b));
  const id = before.compared.find((x) => {
    const e = before.evidence.find((y) => y.id === `pair.${x}`);
    return e?.fact.includes("서로 다른 쪽");
  });
  assert.ok(id, "서로 다른 쪽으로 답한 영역이 있다");
  // B님의 그 영역 답만 A님과 같은 쪽으로 바꾼다 — 같은 행의 점수를 A님 점수로
  const rows = [...b.summary.temperament, ...b.summary.relationship, ...b.summary.mbti.axes];
  const rowA = [...a.summary.temperament, ...a.summary.relationship, ...a.summary.mbti.axes].find((r) => r.id === id)!;
  rows.find((r) => r.id === id)!.score = rowA.score;
  const after = pairEvidenceOf(responses(a), responses(b));
  const pick = (r: typeof before, who: string) => r.evidence.find((e) => e.id === `pair.${who}`)!;
  assert.ok(pick(after, id).fact.includes("같은 쪽"), "바꾼 영역은 이제 같은 쪽이다");
  assert.ok(!pick(after, id).fact.includes("서로 다른 쪽"));
  for (const other of before.compared.filter((x) => x !== id)) assert.equal(pick(after, other).fact, pick(before, other).fact, `${other}: 바꾸지 않은 영역의 근거는 그대로다`);
});

test("D6: 뚜렷하게 답하지 않은 영역은 비교하지도 지어내지도 않고, 비교할 영역이 하나도 없으면 응답 영역을 요청하지 않는다", async () => {
  const a = person(0);
  const b = person(1);
  const base = pairEvidenceOf(responses(a), responses(b));
  // B님이 한 영역을 뚜렷하지 않게(가운데) 답했다면 그 영역은 근거에서 빠지고 "비교하지 않은 영역"으로만 센다
  const rowsB = [...b.summary.temperament, ...b.summary.relationship, ...b.summary.mbti.axes];
  const target = base.compared[0]!;
  rowsB.find((r) => r.id === target)!.score = 50;
  const partial = pairEvidenceOf(responses(a), responses(b));
  assert.ok(!partial.compared.includes(target), "가운데로 답한 영역은 비교하지 않는다");
  assert.ok(partial.unclear.includes(target), "한쪽만 뚜렷하면 '비교하지 않은 영역'으로 센다");
  assert.ok(!partial.evidence.some((e) => e.id === `pair.${target}`));
  // 한 사람의 모든 응답이 뚜렷하지 않다면 응답 근거는 없고(입력한 MBTI 비교만 남을 수 있다) 응답 영역은 요청하지 않는다
  for (const r of rowsB) r.score = 50;
  const none = pairEvidenceOf(responses(a), responses(b));
  assert.deepEqual(none.compared, []);
  assert.ok(!none.evidence.some((e) => e.id.startsWith("pair.") && e.id !== "pair.mbti"));
  assert.ok(!pairSectionsFor(evidenceOf(a, b).all.filter((e) => !e.id.startsWith("pair.") || e.id === "pair.mbti")).some((s) => s.id === "response"), "비교할 응답이 없으면 응답 영역은 없다");
  // 그래도 생성은 사주 중심으로 끝까지 되고, 안내문은 코드가 채운다
  const { report } = await generateRecorded({ a, b, reference: REF });
  assert.ok(!report.sections.some((s) => s.id === "response"));
});

test("D6: 두 사람이 모두 뚜렷하게 답한 영역이 같은 쪽이 하나도 없으면 공통점 근거도 없다 — 공통점은 같은 쪽 영역에서만 말할 수 있다", () => {
  const a = person(0);
  const c = person(2);
  const r = pairEvidenceOf(responses(a), responses(c));
  // 이 쌍은 비교된 영역이 모두 서로 다른 쪽이다(측정으로 확인한 사실 — 쌍마다 다르다)
  const same = r.evidence.filter((e) => e.id !== "pair.mbti" && e.fact.includes("같은 쪽"));
  const diff = r.evidence.filter((e) => e.id !== "pair.mbti" && e.fact.includes("서로 다른 쪽"));
  assert.equal(same.length, 0);
  assert.ok(diff.length > 0);
});

test("D6: 응답 풀이 문구를 그대로 옮긴 글(재진술)은 한도를 넘으면 걸리고, 장면으로 바꿔 쓴 글은 걸리지 않는다", () => {
  const a = person(0);
  const b = person(1);
  const { all } = evidenceOf(a, b);
  const copied = [
    { where: "sections.response.paragraphs[0]", text: "A님은 다른 사람의 반응과 인정에 크게 영향을 받습니다, 두 분은 서로 달라요." },
    { where: "sections.response.paragraphs[1]", text: "B님은 가까워지고 기대는 것이 비교적 편합니다, 그래서 거리 두는 날에 놀라요." },
  ];
  assert.equal(echoedMeaningsIn(copied, all).length, 2);
  assert.ok(echoedMeaningsIn(copied, all).length > PAIR_MEANING_ECHO_MAX);
  const rewritten = [
    { where: "sections.response.paragraphs[0]", text: "A님은 칭찬이든 무반응이든 상대의 한마디가 하루 기분을 크게 바꾸기 쉬운 쪽이고, B님은 같은 말에도 한 발 떨어져 듣는 편이에요." },
    { where: "sections.response.paragraphs[1]", text: "연락이 뜸한 날 A님은 혼자 시간을 더 챙기고 싶고, B님은 오히려 가까이 붙어 있고 싶어지는 방향으로 움직이기 쉬워요." },
  ];
  assert.equal(echoedMeaningsIn(rewritten, all).length, 0);
  // 한 번쯤은 허용한다
  assert.equal(echoedMeaningsIn(copied.slice(0, 1), all).length <= PAIR_MEANING_ECHO_MAX, true);
});

test("D6: 모의 글에서 시작해, 응답 재진술 · 애착 유형 이름 · 답하지 않은 영역의 근거 인용 · 입력받지 않은 사건 단정은 리포트 궁합 검사에서 각각 걸린다", async () => {
  const a = person(0);
  const b = person(1);
  const { seen } = await generateRecorded({ a, b, reference: REF });
  const { all, pairs } = evidenceOf(a, b);
  const raw = JSON.parse(seen[0]!.raw);
  const start = validateCompatDraft(raw, all, { pair: true });
  assert.equal(start.ok, true, `출발점인 모의 글은 통과한다 ← ${start.ok ? "" : start.errors.slice(0, 4).join(" | ")}`);
  const mutate = (fn: (d: typeof raw) => void) => {
    const d = structuredClone(raw);
    fn(d);
    const r = validateCompatDraft(d, all, { pair: true });
    return r.ok ? [] : r.errors;
  };
  const has = (errors: string[], word: string) => assert.ok(errors.some((e) => e.includes(word)), `${word} ← ${errors.slice(0, 2).join(" | ")}`);
  const response = (d: typeof raw) => d.sections.find((s: { id: string }) => s.id === "response");
  // 1) 응답을 읽어 주는 말투
  has(mutate((d) => (response(d).paragraphs[0] += " A님은 불안이 높다고 답하셨어요.")), "답");
  // 2) 애착 유형 이름
  has(mutate((d) => (response(d).paragraphs[0] += " A님은 불안형 사람이라서 확인을 원해요.")), "애착");
  // 3) 두 사람이 모두 뚜렷하게 답하지 않은 영역의 근거를 인용(없는 근거 ID — 답하지 않은 상황을 근거로 삼을 수 없다)
  const unanswered = pairs.unclear[0];
  assert.ok(unanswered, "비교하지 않은 영역이 있다");
  has(mutate((d) => response(d).evidence.push(`pair.${unanswered}`)), "없는 근거 ID");
  // 4) 입력받지 않은 사건 단정
  has(mutate((d) => (response(d).paragraphs[1] += " 두 분은 지난달에 크게 다퉜어요.")), "사건");
  // 5) 응답 영역이 입력한 MBTI 비교만 근거로 삼음
  has(mutate((d) => (response(d).evidence = ["pair.mbti"])), "응답 영역");
});
