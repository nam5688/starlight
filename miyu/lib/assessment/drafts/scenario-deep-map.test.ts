// 장면 질문 5개 구분과 심화 후보 36문항의 대조(scenario-deep-map.ts)의 시험.
import assert from "node:assert/strict";
import test from "node:test";
import { DEEP_ITEMS, DEEP_SUB_DEFS } from "./deep-questions.ts";
import { DEEP_GAPS, DEEP_MAP, DEEP_MAP_SUMMARY } from "./scenario-deep-map.ts";
import { SCENE_BY_ID } from "./scenario-v1.ts";

test("36문항이 하나도 빠지지 않고 정확히 한 번씩 대조된다", () => {
  assert.equal(DEEP_MAP.length, 36);
  assert.deepEqual([...DEEP_MAP.map((r) => r.id)].sort(), DEEP_ITEMS.map((i) => i.id).sort());
  for (const r of DEEP_MAP) {
    const item = DEEP_ITEMS.find((i) => i.id === r.id)!;
    assert.equal(r.sub, DEEP_SUB_DEFS[item.sub as keyof typeof DEEP_SUB_DEFS].name, `${r.id}: 세부 항목 이름이 다르다`);
    assert.ok(r.reason.length >= 20, `${r.id}: 이유가 짧다`);
  }
});

test("대체는 같은 순간을 묻는 장면 질문이 있고, 유지는 장면 질문을 붙이지 않는다 — 형식이 아니라 장면으로 판단한다", () => {
  for (const r of DEEP_MAP) {
    if (r.relation === "대체") {
      assert.ok(r.scene && r.thread, `${r.id}: 대체인데 장면 질문이 없다`);
      assert.equal(SCENE_BY_ID[r.scene!].thread, r.thread, `${r.id}: 장면과 구분이 맞지 않는다`);
    } else {
      assert.equal(r.scene, undefined, `${r.id}`);
      assert.equal(r.thread, undefined, `${r.id}`);
    }
    assert.doesNotMatch(r.reason, /동의하는 형식|동의형이라/, `${r.id}: 형식만으로 판단했다`);
  }
  assert.equal(DEEP_MAP_SUMMARY.replaced, 11);
  assert.equal(DEEP_MAP_SUMMARY.kept, 25);
});

test("문항 수 맞추기를 하지 않는다: 58문항 구조를 적용하지 않고, 대체로 3개 미만이 된 세부 항목을 숨기지 않고 밝힌다", () => {
  const under = DEEP_MAP_SUMMARY.remaining.filter((s) => s.replaced > 0 && s.kept < 3).map((s) => s.sub);
  // 갈등에서 의견을 말함 · 갈등 뒤 회복 · 마음을 드러내는 편안함은 전부, 행동을 조절함 · 성취하고 싶은 마음은 하나씩 대체돼 3개 미만이 된다
  assert.deepEqual([...under].sort(), ["갈등 뒤 회복", "갈등에서 의견을 말함", "마음을 드러내는 편안함", "성취하고 싶은 마음", "행동을 조절함"].sort());
  assert.ok(DEEP_GAPS.length >= 3);
  assert.ok(DEEP_GAPS.every((g) => g.why.length >= 20));
});
