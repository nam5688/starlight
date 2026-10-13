// 실행: npm test — 디자인 토큰의 글자 · 바탕 조합이 읽을 수 있는 대비(4.5 이상)인지 확인한다.
// 색을 바꿀 때 작은 글씨가 흐려지는 것을 막으려는 검사이며, 화면이 예쁜지는 사람이 본다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `토큰 --color-${name}이 없다`);
  return m[1];
};
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("토큰 대비: 본문 · 보조 글자는 흰 면 · 페이지 · 연한 면 위에서 4.5 이상이다", () => {
  for (const fg of ["ink", "ink-2", "ink-3"]) for (const bg of ["canvas", "page", "mist"]) assert.ok(ratio(token(fg), token(bg)) >= 4.5, `${fg} on ${bg} ${ratio(token(fg), token(bg)).toFixed(2)}`);
});

test("토큰 대비: 포인트 · 강점 · 주의 색 글자는 흰 면 · 페이지 · 자기 연한 바탕 위에서 4.5 이상이고, 버튼 글자(흰색)도 4.5 이상이다", () => {
  for (const [fg, soft] of [["accent", "accent-soft"], ["positive", "positive-soft"], ["caution", "caution-soft"]] as const) {
    for (const bg of ["canvas", "page", soft]) assert.ok(ratio(token(fg), token(bg)) >= 4.5, `${fg} on ${bg} ${ratio(token(fg), token(bg)).toFixed(2)}`);
  }
  for (const bg of ["accent", "accent-strong"]) assert.ok(ratio("#ffffff", token(bg)) >= 4.5, `흰색 on ${bg}`);
  assert.ok(ratio(token("danger"), token("canvas")) >= 4.5, "입력 오류 색");
});

test("토큰 규칙: 주의 색은 빨간색 계열이 아니고(경고처럼 보이지 않게), 강점 · 주의 · 포인트 색이 서로 다르다", () => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(token("caution").slice(i, i + 2), 16));
  assert.ok(!(r > 170 && g < 90 && b < 90), "주의 색이 붉다");
  assert.equal(new Set([token("accent"), token("positive"), token("caution")]).size, 3);
});
