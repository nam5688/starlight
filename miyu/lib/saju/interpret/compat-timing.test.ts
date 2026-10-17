// 실행: npm test — 사주 궁합의 시기 근거(compat-timing.ts): 두 사람 각자의 계산된 대운 · 세운을 나란히 놓는 범위만 만드는지, 성별이 없으면 대운 근거를 만들지 않고(held) 세운만 남는지,
// 관계가 좋아지거나 나빠지는 때 · 추천 날짜 · 맞물리는 해를 말하지 않는지, 출생 정보가 흔들리면 uncertain으로 표시하는지, 규칙 이력과 맞는지 확인한다.
// 규칙은 전통 해석(십신 그룹이 읽는 주제)을 단순화한 초안이며 이 시험은 시기 해석이 맞는다는 보증이 아니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SajuOk } from "../engine.ts";
import { calculateSaju } from "../manseryeok-engine.ts";
import { compatTimingOf, COMPAT_TIMING_VERSION } from "./compat-timing.ts";
import { COMPAT_TIMING_RULE_META } from "./rule-meta.ts";

const REF = { year: 2026, month: 10 };
const person = (year: number, month: number, day: number, birthTime: string | null = "09:30", gender: "male" | "female" | null = "female"): SajuOk => {
  const r = calculateSaju({ year, month, day, calendar: "solar", isLeapMonth: false, birthTime, gender });
  assert.equal(r.status, "ok");
  return r as SajuOk;
};

test("두 사람의 성별이 있으면 대운과 세운 근거를 만들고, 각자의 기간 · 주제가 사실 문장에 들어 있다", () => {
  const r = compatTimingOf(person(1996, 3, 29), person(1994, 11, 2), REF);
  assert.deepEqual(r.evidence.map((e) => e.id), ["compat.timing.luck", "compat.timing.year"]);
  assert.deepEqual(r.held, []);
  const luck = r.evidence[0];
  assert.match(luck.fact, /A님: \d{4}-\d{2}~\d{4}-\d{2}/);
  assert.match(luck.fact, /B님: \d{4}-\d{2}~\d{4}-\d{2}/);
  assert.match(luck.fact, /겹치는 주제|겹치는 주제 없음/);
  assert.equal(luck.strength, "weak");
  assert.equal(luck.source, "saju");
  assert.ok(luck.period && luck.period.from <= luck.period.to);
  const year = r.evidence[1];
  assert.match(year.fact, /2026년 세운 [가-힣]{2}/);
  assert.equal(year.period?.label.startsWith("2026년"), true);
});

test("성별이 없으면 대운 근거를 만들지 않고(held) 세운 근거만 남는다 — 없는 대운을 만들지 않는다", () => {
  const r = compatTimingOf(person(1996, 3, 29, "09:30", null), person(1994, 11, 2), REF);
  assert.deepEqual(r.evidence.map((e) => e.id), ["compat.timing.year"]);
  assert.deepEqual(r.held, [{ id: "luck", reason: "no-luck" }]);
});

test("A · B 이름은 바뀌지 않고, 생년월일 형태가 근거에 없으며, 관계의 좋고 나쁨 · 추천 날짜 · 맞물리는 해를 말하지 않는다(안내만 있다)", () => {
  const r = compatTimingOf(person(1990, 5, 17), person(1991, 8, 8, null), REF);
  for (const e of r.evidence) {
    const text = `${e.fact} ${e.cue}`;
    assert.ok(!/1990-05|1991-08|05-17|08-08/.test(text), "생년월일 형태가 없다");
    assert.match(e.cue, /좋아지거나 나빠지는 때를 말하지 않습니다/);
    assert.match(e.cue, /추천 날짜가 아니고/);
    assert.ok(!/맞물리는 해|겹치는 해|추천하는 날/.test(e.fact), "계산하지 않은 것을 사실로 적지 않는다");
    assert.ok(/A님/.test(e.fact) && /B님/.test(e.fact));
  }
});

test("출생 시각이 날짜 경계에 걸려 일주가 흔들리면 시기 근거를 uncertain으로 표시한다", () => {
  const shaky = person(1990, 5, 17, "23:40");
  const flagged = shaky.notes.some((n) => n.pillars.includes("day" as never));
  const r = compatTimingOf(shaky, person(1994, 11, 2), REF);
  assert.equal(r.evidence.every((e) => Boolean(e.uncertain) === flagged), true);
});

test("규칙 이력이 근거 ID를 덮고, 검토 전 초안으로 남아 있다", () => {
  assert.ok(COMPAT_TIMING_VERSION.endsWith("-draft"));
  assert.equal(COMPAT_TIMING_RULE_META.length, 1);
  const meta = COMPAT_TIMING_RULE_META[0];
  assert.equal(meta.review, "unreviewed");
  for (const id of ["compat.timing.luck", "compat.timing.year"]) assert.ok(meta.match.test(id), id);
  assert.ok(!meta.match.test("compat.timing.month"), "달 단위 근거는 만들지 않았다");
});
