// 실행: npm test — 장면 질문 두 사람 비교 근거(pair-scene-evidence.ts): 두 사람 모두 두 장면에 답했을 때만 읽는지, 닿음 · 엇갈림이 두 방향으로 맞게 읽히는지, A · B 순서를 바꿔도 같은 상태인지,
// 속마음 · 점수 · 좋고 나쁨이 없는지, 모든 답 조합이 읽히는지 확인한다. 규칙은 설계 가설이며 이 시험은 좋은 궁합 판정의 보증이 아니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { COUPLE_SCENE_BY_ID, COUPLE_THREADS, type CoupleAnswers } from "../../assessment/drafts/couple-scenes-v1.ts";
import { JARGON } from "../reading/plan.ts";
import { PAIR_SCENE_RULE_META } from "../../saju/interpret/rule-meta.ts";
import { PAIR_SCENE_RULE_VERSION, pairSceneEvidenceOf } from "./pair-scene-evidence.ts";

/** 모든 장면에 같은 선택지 id로 답한 사람 */
const all = (id: "a" | "b" | "c" | "d"): CoupleAnswers => Object.fromEntries(Object.keys(COUPLE_SCENE_BY_ID).map((s) => [s, id]));

test("두 사람이 모든 장면에 답하면 일곱 영역 근거가 순서대로 나오고(pair.scene.K1~K7) 읽지 않은 영역이 없다", () => {
  const r = pairSceneEvidenceOf(all("a"), all("b"));
  assert.deepEqual(r.evidence.map((e) => e.id), ["K1", "K2", "K3", "K4", "K5", "K6", "K7"].map((k) => `pair.scene.${k}`));
  assert.equal(r.compared.length, 7);
  assert.deepEqual(r.held, []);
  assert.equal(PAIR_SCENE_RULE_VERSION.includes("draft"), true);
});

test("한 영역의 두 장면 중 하나라도 답하지 않았거나 '거의 없었어요 · 맞는 선택지 없음'이면 그 영역은 읽지 않는다(없는 응답을 만들지 않는다)", () => {
  const a = all("a");
  const b: CoupleAnswers = { ...all("b"), K1a: "x", K2b: "y", K3a: undefined };
  const r = pairSceneEvidenceOf(a, b);
  assert.deepEqual(r.held.map((h) => h.thread).sort(), ["K1", "K2", "K3"]);
  assert.deepEqual(r.compared.sort(), ["K4", "K5", "K6", "K7"]);
  assert.equal(r.evidence.length, 4);
  for (const h of r.held) assert.equal(h.reason, "missing");
  // 아무 답도 없으면 근거가 하나도 없다
  assert.equal(pairSceneEvidenceOf({}, {}).evidence.length, 0);
});

test("cross 영역: A는 말로 건네고 말에서 크게 느끼고, B는 행동으로 건네고 행동에서 크게 느끼면 두 방향 모두 '다른 방식'이고 서로가 해 볼 것과 건넬 말이 들어간다", () => {
  const A: CoupleAnswers = { K1a: "a", K1b: "a" };
  const B: CoupleAnswers = { K1a: "b", K1b: "b" };
  const e = pairSceneEvidenceOf(A, B).evidence[0];
  assert.match(e.fact, /두 방향 모두 다른 방식/);
  assert.match(e.fact, /A님은/);
  assert.match(e.cue, /A님이 B님에게 해 볼 수 있는 것/);
  assert.match(e.cue, /B님이 A님에게 해 볼 수 있는 것/);
  assert.ok(e.cue.includes(COUPLE_SCENE_BY_ID.K1b.options[1].partnerCanTry), "A가 B에게: B가 크게 느끼는 방식(행동)으로 건네는 법");
  assert.ok(e.cue.includes(COUPLE_SCENE_BY_ID.K1a.options[1].partnerCanTry), "B가 A에게: A가 건넨 마음(말)을 알아봐 주는 법");
  assert.ok(e.cue.includes(COUPLE_SCENE_BY_ID.K1b.options[1].sayToThem));
  assert.match(e.cue, /마음이 없어서가 아니라|누가 맞고 틀린 것이 아니라/);
});

test("cross 영역: 건네는 방식과 크게 느끼는 방식이 서로 닿으면 '둘 다 닿는 방식'이고 엇갈림 제안은 붙지 않으며, 같이 해 볼 행동은 항상 붙는다", () => {
  const A: CoupleAnswers = { K1a: "a", K1b: "b" };
  const B: CoupleAnswers = { K1a: "b", K1b: "a" };
  const e = pairSceneEvidenceOf(A, B).evidence[0];
  assert.match(e.fact, /둘 다 닿는 방식/);
  assert.doesNotMatch(e.cue, /해 볼 수 있는 것:/);
  assert.match(e.cue, /같이 해 볼 행동:/);
  // 한쪽 방향만 닿는 경우
  const half = pairSceneEvidenceOf({ K1a: "a", K1b: "a" }, { K1a: "c", K1b: "a" }).evidence[0];
  assert.match(half.fact, /한쪽 방향만 닿는 방식/);
});

test("same 영역: 같은 장면에서 같은 답이면 '같은 방식', 다르면 '다른 방식'이고 두 장면을 따로 센다", () => {
  const same = pairSceneEvidenceOf({ K4a: "a", K4b: "a" }, { K4a: "a", K4b: "a" }).evidence.find((x) => x.id === "pair.scene.K4")!;
  assert.match(same.fact, /두 장면 모두 같은 방식/);
  assert.doesNotMatch(same.cue, /해 볼 수 있는 것:/);
  const mixed = pairSceneEvidenceOf({ K4a: "a", K4b: "a" }, { K4a: "a", K4b: "c" }).evidence.find((x) => x.id === "pair.scene.K4")!;
  assert.match(mixed.fact, /한 장면은 같고 한 장면은 다른 방식/);
  const diff = pairSceneEvidenceOf({ K4a: "a", K4b: "a" }, { K4a: "c", K4b: "c" }).evidence.find((x) => x.id === "pair.scene.K4")!;
  assert.match(diff.fact, /두 장면 모두 다른 방식/);
  assert.match(diff.cue, /해 볼 수 있는 것:/);
});

test("A · B 순서를 바꿔도 같은 상태로 읽힌다(닿음 · 엇갈림 · 같음 · 다름의 개수가 같다) — 모든 영역 · 모든 답 조합이 읽힌다", () => {
  const state = (fact: string) => /→ ([^→()]+) \(각자/.exec(fact)?.[1].trim();
  for (const t of COUPLE_THREADS) {
    const [s1, s2] = t.scenes;
    for (const a1 of ["a", "b", "c", "d"] as const) for (const a2 of ["a", "b", "c", "d"] as const) for (const b1 of ["a", "b", "c", "d"] as const) for (const b2 of ["a", "b", "c", "d"] as const) {
      const A: CoupleAnswers = { [s1]: a1, [s2]: a2 };
      const B: CoupleAnswers = { [s1]: b1, [s2]: b2 };
      const ab = pairSceneEvidenceOf(A, B).evidence.find((e) => e.id === `pair.scene.${t.id}`);
      const ba = pairSceneEvidenceOf(B, A).evidence.find((e) => e.id === `pair.scene.${t.id}`);
      assert.ok(ab && ba, `${t.id} ${a1}${a2}/${b1}${b2}`);
      assert.equal(state(ab.fact), state(ba.fact), `${t.id} ${a1}${a2}/${b1}${b2}`);
    }
  }
});

test("근거 문장: 점수 · 퍼센트 · 숫자 · 사주 용어 · 속마음 단정 · 좋고 나쁨이 없고 사람 이름 대신 A님 · B님을 쓰며 붙이면 안 되는 결론과 한계가 항상 있다", () => {
  const r = pairSceneEvidenceOf(all("a"), all("c"));
  const ids = new Set<string>();
  for (const e of r.evidence) {
    assert.ok(!ids.has(e.id));
    ids.add(e.id);
    assert.equal(e.source, "survey");
    assert.doesNotMatch(e.fact, /[0-9]/, e.fact);
    assert.doesNotMatch(e.fact + e.cue, JARGON);
    // "붙이면 안 되는 결론" 목록(쓰지 말아야 할 말을 적어 둔 곳)과 점수 없음 · 궁합 지수로 바꾸지 않는다는 안내 문장은 빼고 센다
    const text = (e.fact + e.cue.split("붙이면 안 되는 결론:")[0]).replace(/점수 없음/g, "");
    assert.doesNotMatch(text, /속마음은|사실은 .{0,12}(싫|식었|관심이 없)|점수|%|퍼센트|궁합 지수/, e.id);
    assert.doesNotMatch(e.fact + e.cue, /님는|님가|님를/, `${e.id} 조사`);
    assert.match(e.fact, /A님/);
    assert.match(e.fact, /B님/);
    assert.match(e.cue, /붙이면 안 되는 결론:/);
    assert.match(e.cue, /속마음을 알려 주는 근거가 아니고/);
    assert.match(e.cue, /같이 해 볼 행동:/);
  }
});

test("같은 입력은 언제나 같은 결과다", () => {
  const A = all("b");
  const B = all("d");
  assert.deepEqual(pairSceneEvidenceOf(A, B), pairSceneEvidenceOf(A, B));
});

test("규칙 이력(PAIR_SCENE_RULE_META): 두 규칙이 검토 전(unreviewed)이고 일곱 근거 id를 모두 덮으며 한 문항 유형화 · 속마음 단정 금지가 예외에 있다", () => {
  assert.equal(PAIR_SCENE_RULE_META.length, 2);
  for (const m of PAIR_SCENE_RULE_META) {
    assert.equal(m.review, "unreviewed");
    assert.equal(m.kind, "survey");
    assert.match(m.exceptions.join(" "), /속마음을 사실로 말하지 않는다/);
    assert.match(m.exceptions.join(" "), /한 문항으로 사람이나 영역을 정하지 않고/);
    assert.ok(m.source.includes("확인하지 못했다"));
  }
  for (const k of ["K1", "K2", "K3", "K4", "K5", "K6", "K7"]) assert.ok(PAIR_SCENE_RULE_META.some((m) => m.match.test(`pair.scene.${k}`)), k);
});
