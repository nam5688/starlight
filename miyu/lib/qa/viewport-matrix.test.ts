// 반응형 모의 검사의 화면 크기 표 점검 — 물리 해상도를 CSS 폭으로 가정하지 않았는지, 모든 크기가 "가정"으로 표시됐는지
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSUMED_DPRS, cssFromPhysical, DISPLAY_SPECS, quickMatrix, viewportMatrix } from "./viewport-matrix.ts";

test("공식 사양의 물리 해상도는 그대로 CSS 폭으로 쓰지 않고, 가정한 배율로 나눈 값만 쓴다", () => {
  const widths = new Set(viewportMatrix().map((v) => v.width));
  for (const spec of DISPLAY_SPECS) {
    // 물리 폭 · 높이 그대로(배율 1)를 CSS 크기로 쓰는 항목은 없다 — 1878px 폭 같은 값은 표에 없어야 한다
    assert.equal(widths.has(spec.physical.width), false, `${spec.label}: 물리 폭 ${spec.physical.width}를 그대로 쓰지 않는다`);
  }
  assert.equal(cssFromPhysical(1878, 3), 626);
  assert.equal(cssFromPhysical(2670, 3), 890);
  assert.equal(cssFromPhysical(1848, 2.5), 739);
  assert.equal(cssFromPhysical(1248, 3), 416);
  assert.ok(ASSUMED_DPRS.length >= 3, "배율을 하나로 못 박지 않는다");
});

test("모든 크기는 가정으로 표시되고 근거 문장이 있으며, 같은 id가 없다", () => {
  const all = viewportMatrix();
  assert.ok(all.every((v) => v.assumed === true && v.basis.length > 5));
  assert.equal(new Set(all.map((v) => v.id)).size, all.length);
  assert.ok(all.every((v) => v.width >= 200 && v.height >= 200));
});

test("사양에서 온 크기에는 배율이 가정이라는 말이 함께 적혀 있다", () => {
  for (const v of viewportMatrix().filter((x) => x.group === "folded" || x.group === "unfolded")) {
    if (v.orientation === "portrait" && /iphone-duo|fold8/.test(v.id)) assert.match(v.basis, /가정/, v.id);
  }
});

test("접힘(바깥) · 펼침(안쪽) · 세로 · 가로 · 분할 · 키보드 · 좁은 폭 스트레스가 모두 있다", () => {
  const all = viewportMatrix();
  for (const group of ["baseline", "stress", "folded", "unfolded", "split", "keyboard"] as const) assert.ok(all.some((v) => v.group === group), group);
  assert.ok(all.some((v) => v.orientation === "landscape" && v.group === "unfolded"));
  assert.ok(all.some((v) => v.width <= 300), "가장 좁은 폭을 본다");
  assert.ok(all.some((v) => v.width >= 900), "넓은 안쪽 화면을 본다");
  // 4:3에 가까운(거의 정사각형) 안쪽 화면
  assert.ok(all.some((v) => v.group === "unfolded" && Math.abs(v.height / v.width - 4 / 3) < 0.05 && v.orientation === "portrait"));
});

test("빠른 표는 전체 표의 부분집합이고 각 그룹을 대표한다", () => {
  const all = new Set(viewportMatrix().map((v) => v.id));
  const quick = quickMatrix();
  assert.ok(quick.every((v) => all.has(v.id)));
  for (const group of ["baseline", "stress", "folded", "unfolded", "split", "keyboard"] as const) assert.ok(quick.some((v) => v.group === group), group);
});
