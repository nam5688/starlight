// 실행: npm test — 궁합 장면 질문 초안(couple-scenes-v1.ts): 영역 7묶음 · 장면 14개의 구조, 선택지에 좋고 나쁨이 없는지, 결과를 직접 묻는 문장이 없는지, 개인용 장면(S5~S8)을 복사하지 않고 그대로 쓰는지 확인한다.
// 이 시험은 질문이 사람을 잘 가른다는 보증이 아니다(실제 사람의 시범 인터뷰 전의 설계 초안).
import assert from "node:assert/strict";
import { test } from "node:test";
import { JARGON } from "../../report/reading/plan.ts";
import { COUPLE_AREAS, COUPLE_NONE_OPTIONS, COUPLE_SCENES, COUPLE_SCENE_BY_ID, COUPLE_SCENE_VERSION, COUPLE_THREADS, COUPLE_THREAD_BY_ID, coupleOption } from "./couple-scenes-v1.ts";
import { SCENE_BY_ID } from "./scenario-v1.ts";

test("구조: 영역 묶음 7개 · 장면 14개이고 묶음마다 서로 다른 장면 둘, 장면마다 선택지 4개(a~d)가 있으며 이름표가 겹치지 않는다", () => {
  assert.equal(COUPLE_THREADS.length, 7);
  assert.equal(COUPLE_SCENES.length, 14);
  assert.match(COUPLE_SCENE_VERSION, /draft/);
  for (const t of COUPLE_THREADS) {
    assert.equal(new Set(t.scenes).size, 2, t.id);
    for (const sid of t.scenes) {
      const s = COUPLE_SCENE_BY_ID[sid];
      assert.ok(s, sid);
      assert.equal(s.thread, t.id);
      assert.deepEqual(s.options.map((o) => o.id), ["a", "b", "c", "d"]);
      assert.equal(new Set(s.options.map((o) => o.tag)).size, 4, `${sid} 이름표`);
      assert.equal(new Set(s.options.map((o) => o.text)).size, 4, `${sid} 선택지 문장`);
    }
  }
  assert.equal(COUPLE_THREAD_BY_ID.K1.kind, "cross");
  assert.equal(new Set(COUPLE_SCENES.map((s) => s.id)).size, 14);
});

test("cross 영역(K1 · K2 · K3 · K5): 한 장면은 받고 싶은 것(need) · 한 장면은 하는 것(give)이고 두 장면의 선택지 이름표가 같다 — same 영역(K4 · K6 · K7)은 두 장면 모두 내 반응(same)이다", () => {
  for (const t of COUPLE_THREADS) {
    const [s1, s2] = t.scenes.map((id) => COUPLE_SCENE_BY_ID[id]);
    if (t.kind === "cross") {
      assert.deepEqual([s1.role, s2.role].sort(), ["give", "need"], t.id);
      assert.deepEqual(s1.options.map((o) => o.tag), s2.options.map((o) => o.tag), `${t.id} 두 장면의 이름표 순서가 같다`);
    } else {
      assert.equal(s1.role, "same", t.id);
      assert.equal(s2.role, "same", t.id);
    }
  }
});

test("운영자가 정한 8개 영역을 모두 맡는 묶음이 있다(애정 표현 · 연락 · 서운함 · 갈등 회복 · 혼자 시간 · 원하는 확인 · 계획 · 약속 · 도움 주고받기)", () => {
  assert.equal(COUPLE_AREAS.length, 8);
  const areas = COUPLE_AREAS.map((a) => a.area).join(" | ");
  for (const w of ["애정 표현", "연락", "서운", "갈등 후 회복", "혼자", "확인", "계획", "도움"]) assert.ok(areas.includes(w), w);
  for (const a of COUPLE_AREAS) assert.ok(COUPLE_THREAD_BY_ID[a.thread], a.area);
});

test("선택지마다 사실 · 보여 주는 방식 · 조건형 읽기 · 상대가 해 볼 것 · 건넬 말 한 문장이 모두 있고, 읽기는 '~수 있어요'로 끝나 속마음을 사실로 말하지 않는다", () => {
  for (const s of COUPLE_SCENES) {
    for (const o of s.options) {
      for (const k of ["text", "tag", "plain", "shows", "readThisAs", "partnerCanTry", "sayToThem"] as const) assert.ok(o[k] && o[k].trim().length > 0, `${s.id}.${o.id}.${k}`);
      assert.match(o.readThisAs, /수 있어요$/, `${s.id}.${o.id} readThisAs`);
      assert.ok([...o.sayToThem].length <= 60, `${s.id}.${o.id} sayToThem 길이`);
      assert.ok(o.sayToThem.split(/[.?!]\s/).length <= 3, `${s.id}.${o.id} sayToThem은 짧은 말`);
    }
  }
});

test("선택지 · 질문에 좋고 나쁨 · 결과를 미리 말하는 표현 · 사주 용어 · 공식 검사 이름이 없다", () => {
  const texts = COUPLE_SCENES.flatMap((s) => [s.ask, s.label, s.difference, ...s.options.flatMap((o) => [o.text, o.plain, o.shows, o.readThisAs, o.partnerCanTry])]);
  for (const t of texts) {
    assert.doesNotMatch(t, JARGON, t);
    assert.doesNotMatch(t, /더 좋은|더 나은|올바른|바람직|옳은|정답은 아니|나쁜 방법|잘못된|건강한 방식|미성숙/, t);
    assert.doesNotMatch(t, /MBTI|애착 유형|애착형|사랑의 언어|TCI|불안형|회피형|안정형|집착형/, t);
    assert.doesNotMatch(t, /마음이 식|관심이 없(?!다는)|싫어하는 것|무시하는|이기적|의존적/, t);
  }
  // 질문이 결과를 직접 묻지 않는다("나는 ~한 편이다 / ~형인가요")
  for (const s of COUPLE_SCENES) assert.doesNotMatch(s.ask, /편인가요|성향인가요|형인가요|스타일인가요|타입인가요/, s.ask);
});

test("개인용 장면 질문의 장면(S5 · S6 · S7 · S8)은 문장 · 선택지 · 이름표를 복사하지 않고 그대로 가져온다(어긋나지 않는다)", () => {
  for (const id of ["S5", "S6", "S7", "S8"] as const) {
    const mine = COUPLE_SCENE_BY_ID[id];
    const orig = SCENE_BY_ID[id];
    assert.equal(mine.ask, orig.ask);
    assert.deepEqual(mine.options.map((o) => [o.id, o.text, o.tag, o.plain, o.shows]), orig.options.map((o) => [o.id, o.text, o.tag, o.plain, o.shows]));
  }
});

test("묶음마다 붙이면 안 되는 결론 · 닿음 · 엇갈림 · 같이 해 볼 행동이 있고, 엇갈림 문장이 속마음을 단정하지 않으며 어느 한쪽을 고치라고 하지 않는다", () => {
  for (const t of COUPLE_THREADS) {
    assert.ok(t.notThis.length >= 3, `${t.id} notThis`);
    assert.ok(t.together.length > 10);
    assert.match(t.gapNote, /수 있어요/);
    assert.match(t.gapNote, /누가 맞고 틀린 것이 아니라|마음이 없어서가 아니라/, `${t.id} gapNote는 방식의 차이로 쓴다`);
    assert.doesNotMatch(t.gapNote + t.matchNote + t.together, /고쳐야|바꿔야|문제는 당신|잘못/, t.id);
    assert.match(t.overlap, /가져오지 않았/, `${t.id} overlap은 닮은 점을 숨기지 않고 가져오지 않은 것을 밝힌다`);
  }
});

test("선택지 고르기 도우미: 거의 없었어요(x) · 맞는 선택지 없음(y) · 미응답은 읽지 않는다", () => {
  assert.equal(COUPLE_NONE_OPTIONS.length, 2);
  assert.equal(coupleOption("K1a", "x"), undefined);
  assert.equal(coupleOption("K1a", "y"), undefined);
  assert.equal(coupleOption("K1a", undefined), undefined);
  assert.equal(coupleOption("K1a", "a")?.tag, "words");
  assert.equal(coupleOption("없는장면", "a"), undefined);
});
