// 실행: npm test — 간단 궁합 공유 카드(이미지) 배치: 이름 · 커플 유형 · 지수 · 핵심 · 안내가 들어가고 생년월일이 어디에도 없으며, 글이 카드 폭을 넘지 않고, 지수가 확률이 아니라는 안내가 항상 있는지 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CardOp } from "../report/reading/talk-card.ts";
import { COMPAT_CARD_DISCLAIMER, COMPAT_CARD_INVITE, layoutCompatCard } from "./share-card.ts";
import { computeSimpleCompat, shareTextOf, type CompatPersonInput } from "./simple.ts";

const person = (nickname: string, y: string, m: string, d: string, time = "09:30"): CompatPersonInput => ({ nickname, calendar: "solar", isLeapMonth: false, birthYear: y, birthMonth: m, birthDay: d, birthTime: time, birthTimeUnknown: false });
const measure = (text: string, size: number, weight: number) => [...text].length * size * (weight >= 700 ? 0.62 : 0.56);
const texts = (ops: CardOp[]) => ops.filter((o): o is Extract<CardOp, { type: "text" }> => o.type === "text");

const outcome = computeSimpleCompat(person("슬기", "1996", "3", "29"), person("남수", "1994", "11", "2"), new Date("2026-10-17T00:00:00+09:00"));
assert.ok(outcome.ok);
const card = outcome.card;

test("공유 카드: 이름 · 커플 유형 · 궁합 지수 · 핵심 한 줄 · 재미 · 참고용 안내가 들어간다", () => {
  const { ops } = layoutCompatCard(card, { measure });
  const all = texts(ops).map((t) => t.text).join("\n");
  assert.ok(all.includes("슬기 × 남수"));
  assert.ok(all.includes(card.typeName));
  assert.ok(texts(ops).some((t) => t.text === String(card.score) && t.size >= 100), "지수는 큰 숫자");
  for (const line of card.core.split(" ")) assert.ok(all.includes(line), `핵심 문장의 낱말 ${line}`);
  assert.ok(all.includes("재미 · 참고용"));
  assert.ok(all.includes("확률이나 정확도가 아니라"), "지수가 확률 · 정확도가 아니라는 안내");
  assert.ok(all.includes(COMPAT_CARD_INVITE));
  assert.match(COMPAT_CARD_DISCLAIMER, /생년월일은 이 이미지에 담기지 않아요/);
});

test("공유 카드에는 생년월일 · 출생시각이 어디에도 없다(입력한 연 · 월 · 일 · 시각 값, 사주 글자)", () => {
  const { ops } = layoutCompatCard(card, { measure });
  const all = texts(ops).map((t) => t.text).join("\n");
  for (const v of ["1996", "1994", "09:30", "03-29", "11-02", "1996.", "3월 29일", "11월 2일"]) assert.ok(!all.includes(v), `${v}`);
  assert.doesNotMatch(all, /[0-9]{4}[-./년]/);
  // 공유 글(텍스트)과 같은 정보만: 이름 · 유형 · 지수
  assert.ok(shareTextOf(card).includes(card.typeName));
});

test("배치: 글은 카드 폭 안에 있고 바탕이 맨 앞이며 높이가 글 아래까지 이어지고, 같은 입력은 같은 배치다", () => {
  const a = layoutCompatCard(card, { measure });
  const b = layoutCompatCard(card, { measure });
  assert.deepEqual(a, b);
  assert.equal(a.ops[0].type, "rect");
  const first = a.ops[0] as Extract<CardOp, { type: "rect" }>;
  assert.equal(first.w, a.width);
  assert.equal(first.h, a.height);
  for (const t of texts(a.ops)) {
    const w = measure(t.text, t.size, t.weight);
    if (t.align === "right") assert.ok(t.x - w >= 0, t.text);
    else assert.ok(t.x + w <= a.width + 1, `${t.text}: ${t.x + w} > ${a.width}`);
    assert.ok(t.y + t.size <= a.height, t.text);
  }
  assert.ok(a.ops.some((o) => o.type === "mark"), "미유 캐릭터 자리");
});

test("공유 카드는 서로 다른 입력에서 서로 다른 유형 · 지수를 그린다(고정 그림이 아니다)", () => {
  const other = computeSimpleCompat(person("하늘", "1990", "5", "17"), person("도윤", "1991", "8", "8"), new Date("2026-10-17T00:00:00+09:00"));
  assert.ok(other.ok);
  const x = texts(layoutCompatCard(card, { measure }).ops).map((t) => t.text).join("|");
  const y = texts(layoutCompatCard(other.card, { measure }).ops).map((t) => t.text).join("|");
  assert.notEqual(x, y);
});
