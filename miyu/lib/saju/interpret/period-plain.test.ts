import assert from "node:assert/strict";
import test from "node:test";
import { ALL_PERIOD_PLAIN, periodLine, periodPlain, yearTitle } from "./period-plain.ts";
import { GROUP_THEME_SHORT, type Group } from "./rules.ts";

const GROUPS: Group[] = ["비겁", "식상", "재성", "관성", "인성"];

test("시기 쉬운 설명: 천간 · 지지 그룹 25가지 모두 제목 · 생활 의미 · 예시가 있고, 순서가 바뀌어도 같다", () => {
  for (const a of GROUPS) {
    for (const b of GROUPS) {
      const p = periodPlain(a, b);
      assert.ok(p.title && p.meaning && p.example, `${a}+${b}`);
      assert.deepEqual(periodPlain(b, a), p, `${a}+${b} 순서가 달라도 같은 설명`);
    }
  }
  assert.equal(new Set(ALL_PERIOD_PLAIN.map((p) => p.title)).size, 15, "15가지(같은 그룹 5 + 조합 10)가 서로 다른 제목");
});

test("시기 쉬운 설명: 운영자가 정한 식상 + 재성 설명이 그대로이고, 제목 → 생활 의미 → 예시 순서 형식을 지킨다", () => {
  const p = periodPlain("식상", "재성");
  assert.equal(p.title, "생각을 실제 결과로 만들어 가는 시기");
  assert.equal(p.meaning, "배운 것을 일에 써 보거나, 내 의견을 말하고, 만든 결과물을 보여 주는 일이 중요한 주제로 해석돼요.");
  assert.equal(p.example, "예를 들면 공부한 내용을 프로젝트로 만들어 보거나, 생각만 하던 제안을 직접 꺼내는 모습이에요. 성과가 저절로 생긴다는 뜻은 아니에요.");
  for (const x of ALL_PERIOD_PLAIN) {
    assert.match(x.title, /시기$/, x.title);
    assert.match(x.meaning, /주제로 해석돼요\.$/, x.meaning);
    assert.match(x.example, /^예를 들면 .+모습이에요\. .+(뜻은 아니에요|뜻하지는 않아요)\.$/, x.example);
  }
  // 카드에 한 번에 보이는 길이 — 제목은 두 줄 안, 뜻은 한두 줄, 예시는 두 문장
  for (const x of ALL_PERIOD_PLAIN) assert.ok(x.title.length <= 24 && x.meaning.length <= 90 && x.example.length <= 110, `${x.title}: 카드에 비해 길다 (${x.title.length}/${x.meaning.length}/${x.example.length})`);
  assert.equal(yearTitle(p), "생각을 실제 결과로 만들어 가는 해");
  assert.equal(periodLine("2024-08", "2034-07"), "2024.08–2034.07 · 사주에서 보는 10년 시기");
});

test("시기 쉬운 설명: 해석 키워드 나열 · 사주 용어 · 점수 · 나이 · 사건 예언이 없다 (생활의 말만 쓴다)", () => {
  const raw = Object.values(GROUP_THEME_SHORT);
  for (const x of ALL_PERIOD_PLAIN) {
    const all = `${x.title} ${x.meaning} ${x.example}`;
    for (const k of raw) assert.ok(!all.includes(k), `해석 키워드를 그대로 옮겼다: ${k}`);
    assert.doesNotMatch(all, /비겁|식상|재성|관성|인성|십신|대운|세운|일간|원국|오행/, `사주 용어: ${all}`);
    assert.doesNotMatch(all, /\d+\s*%|\d+\s*점|\d+살|\d+대/, `숫자 표현: ${all}`);
    assert.doesNotMatch(all, /(?:것이|거예요|될 거|하게 될|생겨요)\s*[.]?$/, all);
    assert.doesNotMatch(all, /반드시|틀림없이|확실히|제일|가장/, `단정: ${all}`);
    assert.doesNotMatch(all, /습니다|합니다|입니다/, `합쇼체: ${all}`);
  }
});
