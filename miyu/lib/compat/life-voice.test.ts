// 실행: npm test — 궁합 고객용 서술의 생활 말 표(life-voice.ts). 비용 0 — 엔진 계산과 고정 문구만 쓴다(실제 AI · 결제 · DB 없음).
// 확인하는 것: ① 엔진이 내보내는 읽힌 점 문장이 모두 생활 말로 옮겨지는가(엔진 문장이 바뀌면 걸린다) ② 20개 유형 설명 · 장면 · 읽힌 점에 용어만 바꾼 추상 문장 · 속마음 · 지나간 경험 단정 · 연애 / 결혼 말(친구 · 기타) · 상대 마음 확정(썸)이 없는가
// ③ 잘 맞는 쪽 신호와 차이가 나타나는 쪽 신호가 함께 있을 때 어느 쪽도 잘려 나가지 않는가 ④ 같은 사이를 골라도 두 사람의 사주가 다르면 다른 글이 나오는가. 규칙은 설계 가설이며 좋은 글의 보증이 아니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SajuOk } from "../saju/engine.ts";
import { COUPLE_TYPES, compatOf, type CompatResult } from "../saju/interpret/compat.ts";
import { calculateSaju } from "../saju/manseryeok-engine.ts";
import {
  ALL_SCENE_SIGNALS,
  COUPLE_EXPLAIN_LIFE,
  ENGINE_HIGHLIGHT_TEXTS,
  PACE_LIFE,
  PART_LABEL_LIFE,
  SCENE_VALENCE,
  SCENES_PER_SIDE,
  allSceneSignalsOf,
  lifeHighlightOf,
  sceneSignalsOf,
  sceneTextOf,
  type SceneSignal,
} from "./life-voice.ts";
import { COMPAT_RELATIONSHIPS, MARRIAGE_FUTURE, OTHER_KIND, ROMANCE_TALK, SOME_CERTAIN, relationFrameOf, type CompatRelationship } from "./relationship.ts";
import { cardOf, withRelation } from "./simple.ts";

let seed = 20261019;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pool: SajuOk[] = [];
while (pool.length < 400) {
  const r = calculateSaju({ year: int(1950, 2005), month: int(1, 12), day: int(1, 28), calendar: "solar", isLeapMonth: false, birthTime: rnd() < 0.15 ? null : `${String(int(0, 23)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}`, gender: "male" });
  if (r.status === "ok") pool.push(r);
}
const results: CompatResult[] = [];
for (let i = 0; i < 3000; i++) results.push(compatOf(pool[int(0, pool.length - 1)]!, pool[int(0, pool.length - 1)]!));
const names = { a: "슬기", b: "남수" };

/** 고객이 읽는 모든 생활 말 문장 */
const allLifeTexts = (): string[] => [
  ...Object.values(COUPLE_EXPLAIN_LIFE).flat(),
  ...Object.values(PACE_LIFE),
  ...ENGINE_HIGHLIGHT_TEXTS.map((t) => lifeHighlightOf(t)!),
  ...COMPAT_RELATIONSHIPS.flatMap((rel) => ALL_SCENE_SIGNALS.map((s) => sceneTextOf(rel, s))),
];

test("엔진이 내보내는 읽힌 점 문장은 모두 생활 말로 옮겨진다 — 못 알아보는 문장이 없고, 표의 문장은 모두 엔진이 실제로 내보낸다", () => {
  const seen = new Set<string>();
  for (const r of results) {
    for (const t of [...r.highlights.good, ...r.highlights.care]) {
      assert.ok(lifeHighlightOf(t), `생활 말이 없는 엔진 문장: ${t}`);
      seen.add(t);
    }
  }
  for (const t of ENGINE_HIGHLIGHT_TEXTS) assert.ok(seen.has(t), `표에는 있는데 엔진이 내보내지 않는 문장(엔진이 바뀌었나): ${t}`);
  assert.equal(lifeHighlightOf("엔진에 없는 문장"), null, "못 알아보면 지어내지 않는다");
});

test("카드가 보이는 읽힌 점 · 유형 설명 · 속도 · 계산 재료는 엔진 문장이 아니라 생활 말이다 — 점수 · 유형 이름 · 한 줄 · 핵심은 엔진 그대로", () => {
  for (const r of results.slice(0, 600)) {
    const c = cardOf(r, names);
    assert.equal(c.score, r.score);
    assert.equal(c.typeName, r.coupleType.name);
    assert.equal(c.typeLine, r.coupleType.line);
    assert.equal(c.core, r.coupleType.core);
    assert.deepEqual(c.explain, COUPLE_EXPLAIN_LIFE[r.coupleType.id]);
    assert.equal(c.pace, PACE_LIFE[r.levels.pace]);
    for (const t of [...c.good, ...c.care, ...c.explain, c.pace]) assert.doesNotMatch(t, /배우자 자리|같은 결이라|타고난 중심 성향|[고도]\s*읽혀요$/, t);
    assert.equal(c.good.length, r.highlights.good.slice(0, 2).length, "엔진이 읽은 개수와 같다");
    assert.equal(c.care.length, r.highlights.care.slice(0, 2).length);
    assert.deepEqual(c.basis.map((b) => b.direction), r.parts.map((p) => (p.points > 0 ? "잘 맞는 쪽으로 읽혀요" : p.points < 0 ? "차이가 보이는 쪽으로 읽혀요" : "한쪽으로 기울지 않아요")), "재료의 방향은 숨기지 않는다");
  }
  assert.equal(Object.keys(COUPLE_EXPLAIN_LIFE).length, 20);
  for (const t of COUPLE_TYPES) {
    const e = COUPLE_EXPLAIN_LIFE[t.id];
    assert.ok(e && e.length === 2, `${t.id} 설명`);
    for (const s of e) assert.match(s, /(?:요|예요|이에요)\.$/, s);
  }
  for (const id of ["day-stem", "day-branch", "cross-pull", "cross-clash", "element-fill", "element-overlap"]) assert.match(PART_LABEL_LIFE[id]!, /\(.+\)$/, "전통 해석의 이름은 괄호로 남는다(재료 공개)");
});

test("생활 말에 용어만 바꾼 추상 문장 · 명리 용어 · 속마음 · 지나간 경험 단정이 없다", () => {
  const ABSTRACT = /받쳐 주는 모양이라|짝처럼 맞물려|같은 쪽의 힘이 강해서|같은 지점에서 같이 (?:막|힘)|같은 결|결이 |성향이 (?:맞물|겹쳐)/;
  const JARGON = /일간|일지|월지|년지|월간|오행|십성|천간|(?<![가-힣])지지(?![가-힣])|상생|상극|육합|반합|비겁|식상|재성|관성|인성|배우자 자리/;
  // 실제 경험 · 감정 · 속마음 단정 — "다투는 일은 적은 편" "감정의 폭이 큰 편" "닿는 마음은 있는데"처럼 입력받지 않은 사실로 넓어지는 말
  const CLAIM = /다투는 일(?:은|이) 적|크게 다투|감정의 폭|닿는 마음은|속마음|사랑하|좋아하|마음이 (?:있|같)|서로 마음|서운했|싸웠|헤어/;
  for (const t of allLifeTexts()) {
    assert.doesNotMatch(t, ABSTRACT, `추상 문장: ${t}`);
    assert.doesNotMatch(t, JARGON, `명리 용어: ${t}`);
    assert.doesNotMatch(t, CLAIM, `경험 · 감정 단정: ${t}`);
    assert.doesNotMatch(t, /[A-Z]님|\b[AB]\b/, `자리표시자: ${t}`);
  }
});

test("유형 설명 · 속도 · 읽힌 점은 썸 · 친구 · 기타에도 그대로 보이므로 연애 · 결혼 · 상대 마음 확정이 없다 — 사이별 장면은 그 사이의 금지 표현도 없다", () => {
  const shared = [...Object.values(COUPLE_EXPLAIN_LIFE).flat(), ...Object.values(PACE_LIFE), ...ENGINE_HIGHLIGHT_TEXTS.map((t) => lifeHighlightOf(t)!)];
  for (const t of shared) {
    assert.doesNotMatch(t, ROMANCE_TALK, `연애 · 결혼 말: ${t}`);
    assert.doesNotMatch(t, SOME_CERTAIN, `마음 확정: ${t}`);
    assert.doesNotMatch(t, OTHER_KIND, `관계 이름: ${t}`);
    assert.doesNotMatch(t, MARRIAGE_FUTURE, `앞날 판정: ${t}`);
  }
  for (const signal of ALL_SCENE_SIGNALS) {
    for (const rel of ["friend", "other"] as const) assert.doesNotMatch(sceneTextOf(rel, signal), ROMANCE_TALK, `${rel} ${signal}`);
    assert.doesNotMatch(sceneTextOf("other", signal), OTHER_KIND, `other ${signal}`);
    assert.doesNotMatch(sceneTextOf("some", signal), SOME_CERTAIN, `some ${signal}`);
    for (const rel of ["engaged", "married"] as const) assert.doesNotMatch(sceneTextOf(rel, signal), MARRIAGE_FUTURE, `${rel} ${signal}`);
  }
  // 화면에 실제로 나오는 카드 글 전체(제목 · 풀이 · 장면 · 읽힌 점 · 설명)도 사이별로 한 번 더 확인한다
  for (const r of results.slice(0, 300)) {
    for (const rel of COMPAT_RELATIONSHIPS) {
      const card = withRelation(cardOf(r, names), rel, r.levels, r.parts);
      const text = JSON.stringify(card.relation) + card.good.join(" ") + card.care.join(" ") + card.explain.join(" ") + card.pace;
      if (rel === "friend" || rel === "other") assert.doesNotMatch(text, ROMANCE_TALK, `${rel}: ${text.slice(0, 80)}`);
      if (rel === "some") assert.doesNotMatch(text, SOME_CERTAIN, rel);
      if (rel === "other") assert.doesNotMatch(text, OTHER_KIND, rel);
      if (rel === "engaged" || rel === "married") assert.doesNotMatch(text, MARRIAGE_FUTURE, rel);
    }
  }
});

test("같은 신호의 장면은 사이마다 다른 글이다 — 여섯 사이가 한 문장을 돌려 쓰지 않고, 장면마다 해 볼 수 있는 제안이 하나는 있다", () => {
  for (const signal of ALL_SCENE_SIGNALS) {
    const texts = COMPAT_RELATIONSHIPS.map((rel) => sceneTextOf(rel, signal));
    assert.equal(new Set(texts).size, texts.length, `${signal}: 사이마다 문장이 달라야 한다`);
    for (const t of texts) assert.match(t, /(?:요|예요|이에요)\.$/, t);
    // 읽힌 모양(1문장) + 해 볼 수 있는 제안(1문장 이상) — 모양만 말하고 끝나지 않는다. 제안 문장은 권하는 어미로 끝난다
    for (const t of texts) {
      const sentences = t.split(/(?<=\.)\s+/);
      assert.ok(sentences.length >= 2, `한 문장뿐인 장면: ${t}`);
      assert.match(sentences.at(-1)!, /보세요|좋아요|주세요|두세요|써 보|해 보|풀려요|편해요|쉬워요|오래 가요|줄어요|볼 만해요|열려요|단단해져요|맞춰 가요|봐요/, `끝 문장이 제안이 아니다: ${t}`);
    }
  }
  // 사용자가 짚은 예시 문장(보완 근거가 있을 때의 장면)은 이 한 칸에만 쓰고 다른 신호 · 사이에 복사하지 않았다
  const example = "함께 계획할 때 서로의 생각을 이어 가기 수월한 편이에요.";
  const used = COMPAT_RELATIONSHIPS.flatMap((rel) => ALL_SCENE_SIGNALS.filter((s) => sceneTextOf(rel, s).includes(example)).map((s) => `${rel}:${s}`));
  assert.deepEqual(used, ["lover:fill"]);
});

test("신호 고르기는 잘 맞는 쪽과 차이가 나타나는 쪽을 따로 센다 — 긍정 신호가 많아도 마찰 신호가, 마찰 신호가 많아도 맞는 신호가 잘려 나가지 않는다", () => {
  let both = 0;
  for (const r of results) {
    const all = allSceneSignalsOf(r.parts, r.levels.dayElement);
    const chosen = sceneSignalsOf(r.parts, r.levels.dayElement);
    assert.ok(chosen.every((s) => all.includes(s)), "읽히지 않은 신호는 나오지 않는다");
    const good = (list: SceneSignal[]) => list.filter((s) => SCENE_VALENCE[s] === "good");
    const care = (list: SceneSignal[]) => list.filter((s) => SCENE_VALENCE[s] === "care");
    assert.ok(good(chosen).length <= SCENES_PER_SIDE && care(chosen).length <= SCENES_PER_SIDE, "한쪽은 둘까지");
    if (good(all).length > 0) assert.ok(good(chosen).length >= 1, `맞는 신호가 모두 가려졌다: ${all.join(" · ")}`);
    if (care(all).length > 0) assert.ok(care(chosen).length >= 1, `차이 신호가 모두 가려졌다: ${all.join(" · ")}`);
    if (good(all).length > 0 && care(all).length > 0) both++;
  }
  assert.ok(both > 300, `긍정 · 마찰 신호가 함께 있는 쌍이 충분히 시험됐다(${both})`);

  // 만들어 낸 최악의 경우 — 예전 방식(일간 사이 하나 + 나머지 둘로 자르기)은 맞는 신호가 앞서면 마찰 신호가 둘 다 빠졌다
  const parts = [
    { id: "day-stem", points: 5, reason: "두 일간이 서로 돕는 상생 관계" },
    { id: "day-branch", points: 10, reason: "일지끼리 육합" },
    { id: "cross-pull", points: 6, reason: "2곳에서 합" },
    { id: "element-fill", points: 6, reason: "보완 2가지" },
    { id: "cross-clash", points: -6, reason: "1곳에서 충 · 형" },
    { id: "element-overlap", points: -3, reason: "목 기운이 둘 다 두드러짐" },
  ];
  const chosen = sceneSignalsOf(parts, "generate");
  assert.deepEqual(chosen, ["stem-generate", "branch-pull", "cross-clash", "overlap"], "맞는 쪽 둘 + 차이 쪽 둘");
  // 일지가 충 · 형인 쌍은 일지 마찰이 그 밖의 마찰보다 앞선다
  assert.deepEqual(sceneSignalsOf([{ id: "day-stem", points: -4, reason: "상극" }, { id: "day-branch", points: -9, reason: "일지끼리 충" }, { id: "cross-clash", points: -5, reason: "x" }, { id: "cross-pull", points: 4, reason: "x" }], "control"), ["cross-pull", "stem-control", "branch-clash"]);
});

test("같은 사이를 골라도 두 사람의 사주가 다르면 글이 다르다 — 장면과 풀이가 읽힌 신호의 조합을 따르고, 점수 · 유형은 사이로 바뀌지 않는다", () => {
  for (const rel of COMPAT_RELATIONSHIPS) {
    const distinct = new Set<string>();
    for (const r of results.slice(0, 600)) {
      const card = withRelation(cardOf(r, names), rel, r.levels, r.parts);
      const f = card.relation!.frame;
      distinct.add([f.fit, f.friction, f.understand, f.doNow.join("|"), f.goodScenes.join("|"), f.careScenes.join("|")].join("##"));
      assert.equal(card.score, r.score);
      assert.equal(card.typeName, r.coupleType.name);
    }
    assert.ok(distinct.size >= 40, `${rel}: 서로 다른 풀이 ${distinct.size}가지 / 600쌍`);
  }
  // 신호를 받지 못한 호출(예전 방식)은 장면이 없고 나머지 풀이는 그대로다
  const f = relationFrameOf("lover" as CompatRelationship, { pull: 1, friction: 1, pace: "mixed" });
  assert.deepEqual([f.goodScenes, f.careScenes], [[], []]);
});

test("같은 오행이 둘 다 두드러진다는 엔진 문장은 '힘이 강하다'가 아니라 같은 방식을 택하기 쉬운 일의 장면으로 옮긴다", () => {
  for (const [el, scene] of [["목", "새로 벌이고 키워 가는 일"], ["화", "생각과 마음을 바로 드러내는 일"], ["토", "정해 둔 대로 꾸준히 이어 가는 일"], ["금", "기준을 세워 매듭짓는 일"], ["수", "한 걸음 물러나 생각을 정리하는 일"]]) {
    const t = lifeHighlightOf(`${el} 기운이 둘 다 두드러져서 같은 곳에서 같이 막힐 수 있어요`);
    assert.ok(t && t.includes(scene), el);
    assert.doesNotMatch(t!, /힘이|기운|개수|많|적/, `${el}: 힘 · 개수 · 많고 적음으로 옮기지 않는다`);
  }
  const two = lifeHighlightOf("목 · 토 기운이 둘 다 두드러져서 같은 곳에서 같이 막힐 수 있어요");
  assert.ok(two && two.includes("새로 벌이고 키워 가는 일") && two.includes("정해 둔 대로 꾸준히 이어 가는 일"));
});
