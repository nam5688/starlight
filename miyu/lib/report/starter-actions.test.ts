// 실행: npm test — 실천 제안 3가지가 서로 같은 말을 되풀이하지 않는다 (운영자 피드백 2026-10-15: "실천 제안이 중복")
import assert from "node:assert/strict";
import { test } from "node:test";
import { STARTER_ACTIONS } from "./starter-actions.ts";

/** 글자 두 개씩 묶어 센 겹침 (띄어쓰기 · 문장부호는 뺀다) — 어림이며 좋은 글의 보증이 아니다 */
function grams(text: string): Set<string> {
  const t = text.replace(/[\s.,?!‘’“”"'·]/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}
function overlap(a: string, b: string): number {
  const x = grams(a);
  const y = grams(b);
  let shared = 0;
  for (const g of x) if (y.has(g)) shared++;
  return shared / Math.max(1, Math.min(x.size, y.size));
}

test("실천 제안: 같은 경향의 세 가지는 제목 · 내용이 서로 겹치지 않는다", () => {
  for (const [tendency, actions] of Object.entries(STARTER_ACTIONS)) {
    assert.equal(actions.length, 3, tendency);
    for (let i = 0; i < actions.length; i++) {
      for (let j = i + 1; j < actions.length; j++) {
        const title = overlap(actions[i].title, actions[j].title);
        assert.ok(title < 0.5, `${tendency} ${i + 1}번 · ${j + 1}번 제목이 겹칩니다 (${title.toFixed(2)})`);
        const body = overlap(`${actions[i].title} ${actions[i].detail}`, `${actions[j].title} ${actions[j].detail}`);
        assert.ok(body < 0.5, `${tendency} ${i + 1}번 · ${j + 1}번 내용이 겹칩니다 (${body.toFixed(2)})`);
      }
    }
  }
});

test("실천 제안: 제목이 모두 다르고, 점수 · 퍼센트 · 기간을 임의로 정하지 않는다", () => {
  const titles = Object.values(STARTER_ACTIONS).flatMap((a) => a.map((x) => x.title));
  assert.equal(new Set(titles).size, titles.length);
  for (const a of Object.values(STARTER_ACTIONS).flat()) {
    assert.ok(!/\d+\s*(%|퍼센트|점|일|주|개월|달)/.test(a.title + a.detail), a.title);
  }
});
