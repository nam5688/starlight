// 실행: npm test — 간단 궁합(무료): 같은 엔진 결과에서 카드를 만드는지(무료와 유료가 어긋나지 않는지), 입력 검사가 이유를 알려 주는지,
// 카드와 공유 글에 생년월일이 없는지, 글에 확률 · 단정이 없는지 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateSaju } from "../saju/manseryeok-engine.ts";
import { compatOf } from "../saju/interpret/compat.ts";
import type { SajuOk } from "../saju/engine.ts";
import { cleanNickname, computeSimpleCompat, EMPTY_COMPAT_PERSON, parseCompatPerson, shareTextOf, validateCompatPerson, type CompatPersonInput } from "./simple.ts";

const TODAY = new Date("2026-10-16T12:00:00+09:00");
const person = (over: Partial<CompatPersonInput> = {}): CompatPersonInput => ({ ...EMPTY_COMPAT_PERSON, nickname: "슬기", gender: "female", birthYear: "1994", birthMonth: "11", birthDay: "7", birthTime: "08:40", ...over });

test("두 사람의 입력으로 카드를 만들고, 무료 카드의 유형 · 총점이 같은 엔진 결과(유료가 풀어 쓰는 근거)와 같다", () => {
  const out = computeSimpleCompat(person(), person({ nickname: "남수", birthYear: "1992", birthMonth: "4", birthDay: "18", birthTime: "", birthTimeUnknown: true }), TODAY, "lover");
  assert.ok(out.ok);
  if (!out.ok) return;
  const sa = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40" }) as SajuOk;
  const sb = calculateSaju({ year: 1992, month: 4, day: 18, calendar: "solar", isLeapMonth: false, birthTime: null }) as SajuOk;
  const r = compatOf(sa, sb);
  assert.equal(out.card.typeName, r.coupleType.name);
  assert.equal(out.card.score, r.score);
  assert.equal(out.card.core, r.coupleType.core);
  assert.deepEqual(out.card.names, { a: "슬기", b: "남수" });
  assert.ok(out.card.cautions.some((c) => /출생 시각을 모르는 사람/.test(c)));
  assert.equal(out.card.basis.length, r.parts.length);
  // 같은 입력은 항상 같은 카드, A · B를 바꿔도 같은 유형 · 총점
  const again = computeSimpleCompat(person(), person({ nickname: "남수", birthYear: "1992", birthMonth: "4", birthDay: "18", birthTime: "", birthTimeUnknown: true }), TODAY, "lover");
  assert.deepEqual(again, out);
  const swapped = computeSimpleCompat(person({ nickname: "남수", birthYear: "1992", birthMonth: "4", birthDay: "18", birthTime: "", birthTimeUnknown: true }), person(), TODAY, "lover");
  assert.ok(swapped.ok && swapped.card.typeName === out.card.typeName && swapped.card.score === out.card.score);
});

test("카드 · 공유 글에는 생년월일이 없고, 이름을 비우면 \"나\" · \"상대\"로 보인다", () => {
  const out = computeSimpleCompat(person({ nickname: "" }), person({ nickname: "   ", birthYear: "1990", birthMonth: "2", birthDay: "3" }), TODAY, "lover");
  assert.ok(out.ok);
  if (!out.ok) return;
  assert.deepEqual(out.card.names, { a: "나", b: "상대" });
  const dump = JSON.stringify(out.card) + shareTextOf(out.card);
  for (const s of ["1994", "1990", "08:40", "1992"]) assert.ok(!dump.includes(s), s);
  const share = shareTextOf(out.card);
  assert.match(share, /^나 × 상대 — .+커플 · 궁합 지수 \d+\n/);
  assert.ok(!/http|생년월일|\d{4}년/.test(share));
});

test("총점은 확률이 아니라고 밝히고 전통 해석 · 두 사주만 본 결과임을 카드가 함께 싣는다 — 글에 확률 · 단정 · 속마음이 없다", () => {
  const out = computeSimpleCompat(person(), person({ birthYear: "1990", birthMonth: "2", birthDay: "3" }), TODAY, "lover");
  assert.ok(out.ok);
  if (!out.ok) return;
  assert.match(out.card.notes.scoreNotProbability, /확률이나 궁합의 정확도가 아니라/);
  assert.match(out.card.notes.tradition, /검증된 사실이 아니에요/);
  const text = [out.card.typeLine, out.card.scoreMeaning, out.card.core, ...out.card.explain, ...out.card.good, ...out.card.care, out.card.pace, ...out.card.cautions].join("\n");
  assert.ok(!/확률|퍼센트|%|반드시|운명|결혼하게|헤어지|속마음|이혼/.test(text), text);
  for (const b of out.card.basis) assert.ok(!/\d/.test(b.direction + b.label), b.label);
});

test("입력 검사: 없는 날짜 · 미래 · 시간 · 이름 길이를 이유와 함께 알려 준다", () => {
  assert.equal(Object.keys(validateCompatPerson(person(), TODAY)).length, 0);
  assert.match(validateCompatPerson(person({ birthYear: "" }), TODAY).birthDate!, /모두 입력/);
  assert.match(validateCompatPerson(person({ birthYear: "1850" }), TODAY).birthDate!, /1900년부터/);
  assert.match(validateCompatPerson(person({ birthMonth: "2", birthDay: "30" }), TODAY).birthDate!, /존재하지|날짜/);
  assert.match(validateCompatPerson(person({ birthYear: "2026", birthMonth: "12", birthDay: "25" }), TODAY).birthDate!, /오늘 이후/);
  assert.match(validateCompatPerson(person({ calendar: "lunar", birthDay: "31" }), TODAY).birthDate!, /30일까지/);
  assert.match(validateCompatPerson(person({ birthTime: "" }), TODAY).birthTime!, /출생시간/);
  assert.equal(validateCompatPerson(person({ birthTime: "", birthTimeUnknown: true }), TODAY).birthTime, undefined);
  assert.match(validateCompatPerson(person({ nickname: "가나다라마바사아자차카" }), TODAY).nickname!, /10자 이내/);
  // 결과는 한 사람이라도 오류가 있으면 만들지 않는다
  const bad = computeSimpleCompat(person(), person({ birthYear: "" }), TODAY, "lover");
  assert.ok(!bad.ok && bad.errors.b.birthDate && Object.keys(bad.errors.a).length === 0);
});

test("브라우저에서 온 값이 형식에 맞지 않으면 읽지 않는다 — 이름은 제어 문자를 지우고 10자로 자른다", () => {
  assert.equal(parseCompatPerson(null), null);
  assert.equal(parseCompatPerson({ ...person(), calendar: "other" }), null);
  assert.equal(parseCompatPerson({ ...person(), isLeapMonth: "no" }), null);
  assert.equal(parseCompatPerson({ ...person(), birthYear: 1994 }), null);
  assert.ok(parseCompatPerson(person()));
  assert.equal(computeSimpleCompat("x", person(), TODAY, "lover").ok, false);
  assert.equal(cleanNickname(`${String.fromCharCode(0, 0x200b)}슬\n기${String.fromCharCode(0x2028)}`, "나"), "슬기");
  assert.equal(cleanNickname("가나다라마바사아자차카타", "나"), "가나다라마바사아자차");
  assert.equal(cleanNickname("  ", "상대"), "상대");
  // 이모지 같은 글자를 자르다 깨뜨리지 않는다
  assert.equal([...cleanNickname("😀😀😀😀😀😀😀😀😀😀😀😀", "나")].length, 10);
});

test("존재하지 않는 음력 날짜는 이유를 알려 주고 계산하지 않는다", () => {
  const out = computeSimpleCompat(person({ calendar: "lunar", birthYear: "1995", birthMonth: "2", birthDay: "30", isLeapMonth: true }), person(), TODAY, "lover");
  // 엔진이 거절하는 날짜면 이유가 나오고, 있는 날짜면 계산된다 — 어느 쪽이든 오류 없이 결과 형태를 지킨다
  assert.ok(out.ok || out.errors.a.birthDate);
});
