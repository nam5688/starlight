// 실행: npm test — 생활 행동 질문 독립 설계 초안: 구조 · 균형 · 채점 규칙 · 금지 표현
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIFE_AREAS,
  LIFE_CLEAR_DISTANCE,
  LIFE_HOLD_TEXT,
  LIFE_ITEMS,
  LIFE_ITEMS_PER_AREA,
  LIFE_NONE_TEXT,
  LIFE_OPTIONS,
  LIFE_UNCLEAR_TEXT,
  itemPosition,
  lifeItemsInOrder,
  lifeScoringText,
  readLifeAreas,
  type LifeValue,
} from "./life-behavior-v1.ts";
import { ASSESSMENT_MODULES } from "../modules/index.ts";

const answersOf = (fn: (id: string) => LifeValue) => Object.fromEntries(LIFE_ITEMS.map((i) => [i.id, fn(i.id)]));
const all = (v: LifeValue) => answersOf(() => v);

test("영역 12개 × 문항 3개 = 36개이고 문항마다 영역 · 장면 · 이유가 있다", () => {
  assert.equal(LIFE_AREAS.length, 12);
  assert.equal(LIFE_ITEMS.length, 12 * LIFE_ITEMS_PER_AREA);
  for (const a of LIFE_AREAS) {
    const items = LIFE_ITEMS.filter((i) => i.area === a.id);
    assert.equal(items.length, LIFE_ITEMS_PER_AREA, a.id);
    assert.equal(new Set(items.map((i) => i.scene)).size, LIFE_ITEMS_PER_AREA, `${a.id}: 서로 다른 장면 3개`);
    assert.ok(a.name.length >= 3, `${a.id}: 이름이 비었다`);
    for (const f of [a.asks, a.a, a.b, a.notThis, a.overlap]) assert.ok(f.length >= 6, `${a.id}: 빈 칸`);
    assert.notEqual(a.a, a.b);
  }
  assert.equal(new Set(LIFE_ITEMS.map((i) => i.id)).size, LIFE_ITEMS.length);
  for (const i of LIFE_ITEMS) assert.ok(i.note.length >= 10 && i.statement.length >= 15, i.id);
});

test("영역 안에서 '자주'가 가리키는 방식이 섞여 있어, 아무 문항에나 같은 답을 골라도 뚜렷한 방향이 되지 않는다", () => {
  for (const a of LIFE_AREAS) {
    const dirs = new Set(LIFE_ITEMS.filter((i) => i.area === a.id).map((i) => i.agree));
    assert.equal(dirs.size, 2, `${a.id}: 방향이 한쪽뿐이다`);
  }
  // 선택지를 전부 같은 것으로 골라도(1~4 어느 쪽이든) 영역마다 2:1 방향이라 평균이 가운데 쪽으로 모여 뚜렷한 방향이 되지 않는다
  for (const v of [1, 2, 3, 4] as const) {
    for (const r of readLifeAreas(all(v))) assert.equal(r.kind, "unclear", `전부 ${v}번을 골라도 ${r.area}는 뚜렷한 방향이 아니어야 한다`);
  }
});

test("채점: 문항의 방향을 뒤집어 영역의 A 방식 쪽 위치(0~100)로 옮긴다", () => {
  const a = LIFE_ITEMS.find((i) => i.agree === "a")!;
  const b = LIFE_ITEMS.find((i) => i.agree === "b")!;
  assert.equal(itemPosition(a, 1), 0);
  assert.equal(itemPosition(a, 4), 100);
  assert.equal(itemPosition(b, 1), 100);
  assert.equal(itemPosition(b, 4), 0);
  assert.equal(itemPosition(a, null), null);
  assert.equal(LIFE_OPTIONS.length, 4);
  assert.ok(LIFE_NONE_TEXT.length > 3);
});

test("읽는 규칙: 3문항 모두 답해야 읽고(해당 없음이 있으면 보류), 가운데에서 20 이상이면 뚜렷한 방향, 아니면 뚜렷하지 않음 — 세 단계로 나누지 않는다", () => {
  const first = LIFE_AREAS[0]!;
  const ids = LIFE_ITEMS.filter((i) => i.area === first.id).map((i) => i.id);
  // A 방식 쪽으로 일관되게: A문항은 4, B문항은 1
  const strongA = answersOf((id) => (LIFE_ITEMS.find((i) => i.id === id)!.agree === "a" ? 4 : 1));
  const rA = readLifeAreas(strongA).find((r) => r.area === first.id)!;
  assert.equal(rA.kind, "clear");
  assert.ok(rA.kind === "clear" && rA.pole === "a" && rA.position === 100 && rA.text === first.a);
  // B 방식 쪽
  const strongB = answersOf((id) => (LIFE_ITEMS.find((i) => i.id === id)!.agree === "a" ? 1 : 4));
  const rB = readLifeAreas(strongB).find((r) => r.area === first.id)!;
  assert.ok(rB.kind === "clear" && rB.pole === "b" && rB.position === 0 && rB.text === first.b);
  // 하나라도 해당 없음이면 보류
  const withNone = { ...strongA, [ids[0]!]: null };
  const held = readLifeAreas(withNone).find((r) => r.area === first.id)!;
  assert.equal(held.kind, "hold");
  assert.equal(held.text, LIFE_HOLD_TEXT);
  assert.equal(held.answered, 2);
  // 가운데(전부 2~3)는 뚜렷하지 않음
  const mid = readLifeAreas(all(3)).find((r) => r.area === first.id)!;
  assert.equal(mid.kind, "unclear");
  assert.equal(mid.text, LIFE_UNCLEAR_TEXT);
  // 경계: 3문항 평균이 가운데에서 20 미만이면 뚜렷하지 않고, 20 이상이면 뚜렷하다
  assert.equal(LIFE_CLEAR_DISTANCE, 20);
  for (const r of readLifeAreas(strongA)) assert.ok(r.kind === "clear" || r.kind === "unclear");
  // 다른 영역은 영향을 받지 않는다
  const other = readLifeAreas(withNone).find((r) => r.area === LIFE_AREAS[1]!.id)!;
  assert.equal(other.kind, "clear");
});

test("영역을 합친 점수 · 유형 이름은 만들지 않는다 (읽기 결과는 영역별 배열뿐)", () => {
  const r = readLifeAreas(all(3));
  assert.equal(r.length, 12);
  for (const x of r) assert.deepEqual(Object.keys(x).sort(), x.kind === "hold" ? ["answered", "area", "kind", "text"] : x.kind === "unclear" ? ["answered", "area", "kind", "position", "text"] : ["answered", "area", "kind", "pole", "position", "text"]);
});

test("화면 순서: 같은 영역 문항이 붙어 나오지 않고 36개가 모두 한 번씩 나온다", () => {
  const order = lifeItemsInOrder();
  assert.equal(order.length, 36);
  assert.equal(new Set(order.map((i) => i.id)).size, 36);
  for (let i = 1; i < order.length; i++) assert.notEqual(order[i]!.area, order[i - 1]!.area);
});

test("채점 방향 글은 문항 정의에서 만들어진다", () => {
  for (const i of LIFE_ITEMS) {
    const area = LIFE_AREAS.find((a) => a.id === i.area)!;
    const t = lifeScoringText(i);
    assert.ok(t.includes(i.agree === "a" ? area.a : area.b) && t.includes(i.agree === "a" ? area.b : area.a), i.id);
  }
});

test("문항은 행동을 묻는 글이다: 공식 검사 이름 · 진단 · 정확도 표현 · 좋고 나쁨 단정이 없다", () => {
  const text = [...LIFE_ITEMS.flatMap((i) => [i.statement, i.note]), ...LIFE_AREAS.flatMap((a) => [a.name, a.asks, a.a, a.b, a.notThis])].join("\n");
  for (const bad of [/MBTI|TCI|애착 ?검사|ECR|IPIP|빅 ?파이브|Big ?Five/i, /진단|우울|불안 ?장애|중독|병적/, /정확도|검증(됐|된)|신뢰도/, /내향|외향|감각형|직관형|사고형|감정형/]) {
    assert.ok(!bad.test(text), `문항 · 정의에 쓰면 안 되는 표현: ${bad}`);
  }
  // overlap 칸에는 일반 개념 이름만 — 특정 검사의 척도 이름 · 문항을 인용하지 않는다
  const overlap = LIFE_AREAS.map((a) => a.overlap).join("\n");
  for (const bad of [/MBTI|TCI|ECR|IPIP|자극 ?추구|위험 ?회피|보상 ?의존|인내력|자율성|연대감|자기초월/]) assert.ok(!bad.test(overlap), `${bad}`);
});

test("문항은 모두 지난 한두 달의 행동(과거형 해요체)이고 지금 화면의 22문항 문장을 그대로 쓰지 않는다", () => {
  const live = new Set(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => i.text)));
  for (const i of LIFE_ITEMS) {
    assert.ok(/(요|어요|았어요|였어요)\.$/.test(i.statement), `${i.id}: 해요체 과거형으로 끝나야 한다`);
    assert.ok(!live.has(i.statement), `${i.id}: 지금 문항을 그대로 옮기지 않는다`);
  }
});
