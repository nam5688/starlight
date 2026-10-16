// 실행: npm test — 리포트 궁합의 두 사람 비교 근거: 두 사람 모두 뚜렷하게 답한 영역만 비교하고, 한쪽이 뚜렷하지 않으면 만들어 채우지 않으며, A · B 순서와 상관없이 같은 영역을 비교하고,
// 점수 숫자 · 알파벳 코드 · 애착 유형 이름이 근거 문장에 없는지 확인한다. 규칙은 설계 가설이며 이 시험은 좋은 궁합 판정의 보증이 아니다.
import assert from "node:assert/strict";
import test from "node:test";
import { PAIR_RULE_META } from "../../saju/interpret/rule-meta.ts";
import { sampleReport } from "../../samples/sample-report.ts";
import type { AxisRow, ScoreRow } from "../types.ts";
import { PAIR_RULE_VERSION, pairEvidenceOf, type PairResponses } from "./pair-evidence.ts";

const withScores = (scores: Record<string, number>): PairResponses => {
  const apply = <T extends ScoreRow | AxisRow>(rows: T[]): T[] => rows.map((r) => ({ ...r, score: scores[r.id] ?? 50 }));
  return { summary: { temperament: apply(sampleReport.temperament), relationship: apply(sampleReport.relationship), mbti: { axes: apply(sampleReport.mbti.axes) } }, mbti: null };
};
const ids = (r: ReturnType<typeof pairEvidenceOf>) => r.evidence.map((e) => e.id).sort();

test("두 사람 모두 뚜렷하게 답한 영역만 비교하고, 한쪽이 뚜렷하지 않으면 만들어 채우지 않는다", () => {
  const a = withScores({ novelty: 80, caution: 20, anxiety: 70, ei: 25 });
  const b = withScores({ novelty: 75, caution: 85, anxiety: 50, ei: 20 });
  const r = pairEvidenceOf(a, b);
  assert.deepEqual([...r.compared].sort(), ["caution", "ei", "novelty"]);
  assert.deepEqual(r.unclear, ["anxiety"], "한쪽만 뚜렷한 영역은 비교하지 않고 센다");
  assert.ok(!ids(r).includes("pair.anxiety"));
  const novelty = r.evidence.find((e) => e.id === "pair.novelty")!;
  assert.ok(novelty.fact.includes("같은 쪽") && novelty.cue.includes("같은 쪽으로 답했다면"));
  const caution = r.evidence.find((e) => e.id === "pair.caution")!;
  assert.ok(caution.fact.includes("서로 다른 쪽") && caution.cue.includes("반응의 차이"));
  assert.equal(pairEvidenceOf(withScores({}), withScores({})).evidence.length, 0, "둘 다 뚜렷하지 않으면 근거가 없다");
});

test("A · B 순서를 바꿔도 같은 영역을 같은 관계(같은 쪽 · 서로 다른 쪽)로 비교하고, 점수 숫자 · 알파벳 코드 · 애착 유형 이름이 없다", () => {
  const a = withScores({ novelty: 80, caution: 20, anxiety: 70, avoidance: 15, sensitivity: 90, ei: 25, tf: 80 });
  const b = withScores({ novelty: 75, caution: 85, anxiety: 88, avoidance: 20, sensitivity: 30, ei: 20, tf: 30 });
  const ab = pairEvidenceOf({ ...a, mbti: "INFP" }, { ...b, mbti: "ESTJ" });
  const ba = pairEvidenceOf({ ...b, mbti: "ESTJ" }, { ...a, mbti: "INFP" });
  assert.deepEqual(ids(ab), ids(ba));
  const relation = (r: ReturnType<typeof pairEvidenceOf>) => Object.fromEntries(r.evidence.map((e) => [e.id, e.fact.includes("서로 다른 쪽") ? "diff" : e.fact.includes("같은 쪽") ? "same" : "mbti"]));
  assert.deepEqual(relation(ab), relation(ba));
  for (const e of ab.evidence) {
    assert.ok(!/\d{2,3}/.test(e.fact), `점수 숫자 없음: ${e.id}`);
    assert.ok(!/(?<![A-Za-z])[EI][NS][TF][JP](?![A-Za-z])/i.test(e.fact + e.cue), `알파벳 코드 없음: ${e.id}`);
    assert.ok(!/안정형|불안형|회피형|혼란형|집착형/.test(e.fact + e.cue), "애착 유형 이름 없음");
    assert.ok(e.topics.length > 0 && ["strong", "moderate", "weak"].includes(e.strength) && e.strength !== "strong", "응답 비교는 strong이 되지 않는다");
  }
  assert.ok(ids(ab).includes("pair.mbti"));
});

test("입력한 MBTI는 두 사람 모두 네 글자로 알려 준 경우만 비교하고(선호 방향의 같은 곳 · 다른 곳), 한쪽만 있거나 형식이 틀리면 만들지 않는다", () => {
  const base = withScores({});
  const same = pairEvidenceOf({ ...base, mbti: "INFP" }, { ...base, mbti: "infp" });
  assert.match(same.evidence.find((e) => e.id === "pair.mbti")!.fact, /네 가지 선호 방향이 모두 같아요/);
  const diff = pairEvidenceOf({ ...base, mbti: "INFP" }, { ...base, mbti: "ESTJ" });
  assert.match(diff.evidence.find((e) => e.id === "pair.mbti")!.fact, /0곳이 같고 4곳이 달라요/);
  assert.equal(pairEvidenceOf({ ...base, mbti: "INFP" }, base).evidence.length, 0, "한쪽만 알려 준 MBTI는 비교하지 않는다");
  assert.equal(pairEvidenceOf({ ...base, mbti: "ABCD" }, { ...base, mbti: "INFP" }).evidence.length, 0);
  assert.equal(PAIR_RULE_VERSION, "pair-rules-0.1-draft");
});

test("두 사람 비교 근거는 모두 규칙 이력(PAIR_RULE_META)에 있고, 이력은 검토 전(unreviewed)이다", () => {
  const a = withScores({ novelty: 80, caution: 20, anxiety: 70, avoidance: 15, sensitivity: 90, ei: 25, sn: 30, tf: 80, jp: 20, persistence: 85 });
  const b = withScores({ novelty: 75, caution: 85, anxiety: 88, avoidance: 20, sensitivity: 30, ei: 20, sn: 70, tf: 30, jp: 15, persistence: 20 });
  const r = pairEvidenceOf({ ...a, mbti: "INFP" }, { ...b, mbti: "ESTJ" });
  assert.ok(r.evidence.length >= 8);
  for (const e of r.evidence) assert.ok(PAIR_RULE_META.some((m) => m.match.test(e.id) && m.kind === e.source), `${e.id}에 맞는 규칙 이력이 없다`);
  assert.ok(PAIR_RULE_META.every((m) => m.review === "unreviewed"));
});
