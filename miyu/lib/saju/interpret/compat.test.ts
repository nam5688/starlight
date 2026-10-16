// 실행: npm test — 사주 궁합 엔진(compat.ts): 커플 유형 20가지의 구분표가 모든 입력을 정확히 한 유형으로 보내는지, A · B 순서와 상관없이 같은 결과인지,
// 총점이 재료의 합으로 설명되는지, 글에 확률 · 단정 · 속마음이 없는지, 근거 목록이 규칙 이력과 맞는지 확인한다. 규칙은 검증된 사실이 아니라 전통 해석을 단순화한 초안이며, 이 시험은 좋은 궁합 판정의 보증이 아니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SajuOk } from "../engine.ts";
import { calculateSaju } from "../manseryeok-engine.ts";
import { COMPAT_EXPLAIN, COMPAT_RULE_VERSION, COUPLE_TYPES, SCORE_MEANINGS, compatOf, coupleTypeOf, scoreMeaningOf, type CompatResult } from "./compat.ts";
import { COMPAT_RULE_META } from "./rule-meta.ts";

const person = (year: number, month: number, day: number, birthTime: string | null = "09:30"): SajuOk => {
  const r = calculateSaju({ year, month, day, calendar: "solar", isLeapMonth: false, birthTime, gender: "female" });
  assert.equal(r.status, "ok");
  return r as SajuOk;
};

/** 일간이 stem인 날을 찾는다(해당 달에서 순서대로) */
const findByDayStem = (stem: string, startYear = 1990): SajuOk => {
  for (let d = 0; d < 400; d++) {
    const date = new Date(Date.UTC(startYear, 0, 1 + d));
    const p = person(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    if (p.dayMaster.stem === stem) return p;
  }
  throw new Error(`일간 ${stem}을 찾지 못했습니다`);
};

// ───── 구분표 ─────

test("커플 유형 20가지: 이름 · id가 겹치지 않고, 구분표(끌림 3 × 부딪힘 3 × 속도 4 × 일간 사이 3)가 모든 입력을 정확히 한 유형으로 보내며 20가지가 모두 나온다", () => {
  assert.equal(COUPLE_TYPES.length, 20);
  assert.equal(new Set(COUPLE_TYPES.map((t) => t.id)).size, 20);
  assert.equal(new Set(COUPLE_TYPES.map((t) => t.name)).size, 20);
  const seen = new Set<string>();
  for (const pull of [0, 1, 2] as const) for (const friction of [0, 1, 2] as const) for (const pace of ["go-go", "careful-careful", "mixed", "even"] as const) for (const dayElement of ["same", "generate", "control"] as const) {
    const t = coupleTypeOf({ pull, friction, pace, dayElement, pullPoints: 0, frictionPoints: 0 });
    assert.ok(COUPLE_TYPES.includes(t));
    seen.add(t.id);
  }
  assert.equal(seen.size, 20, "20가지 모두 어떤 입력에서는 나온다");
});

test("커플 유형의 글: 해요체 · 두 문장 · 확률 · 단정 · 속마음 · 사건이 없고, 잘 맞을 때와 조율이 필요할 때가 함께 있다", () => {
  const bad = /확률|퍼센트|%|반드시|운명|결혼하게|헤어지|이별|속마음|최악|궁합이 나쁘|안 맞|불행|이혼/;
  for (const t of COUPLE_TYPES) {
    for (const text of [t.name, t.line, ...t.explain, t.core]) assert.ok(!bad.test(text), `${t.name}: ${text}`);
    assert.match(t.line, /(?:요|예요|이에요)\.$/, t.line);
    assert.equal(t.explain.length, 2);
    for (const text of t.explain) assert.match(text, /(?:요|예요|이에요)\.$/, `${t.name}: ${text}`);
    assert.match(t.name, /커플$/);
    // 이모지 · 이름이 아닌 장식을 쓰지 않는다
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(`${t.name}${t.line}${t.explain.join("")}${t.core}`), t.name);
  }
});

test("점수 구간의 뜻: 모든 점수가 한 구간이고, 높고 낮음을 좋고 나쁨으로 말하지 않는다", () => {
  for (let s = 0; s <= 100; s++) assert.ok(scoreMeaningOf(s).length > 10);
  const bad = /나쁜|최악|위험|실패|안 맞|불행|헤어/;
  for (const m of SCORE_MEANINGS) assert.ok(!bad.test(m.text), m.text);
  assert.equal(new Set(SCORE_MEANINGS.map((m) => m.min)).size, SCORE_MEANINGS.length);
  assert.equal(SCORE_MEANINGS.at(-1)!.min, 0);
});

// ───── 계산 ─────

test("같은 두 사람은 A · B 순서를 바꿔도 총점 · 끌림 · 부딪힘 · 속도 · 커플 유형이 같다(여러 쌍)", () => {
  const dates: [number, number, number][] = [[1994, 11, 7], [1988, 3, 21], [2001, 8, 15], [1979, 12, 30], [1996, 5, 5], [1985, 1, 9], [2003, 7, 28], [1991, 10, 3]];
  const people = dates.map(([y, m, d], i) => person(y, m, d, i % 3 === 0 ? null : `${String(5 + i * 2).padStart(2, "0")}:10`));
  for (let i = 0; i < people.length; i++) for (let j = 0; j < people.length; j++) {
    const x = compatOf(people[i], people[j]);
    const y = compatOf(people[j], people[i]);
    assert.equal(x.score, y.score, `${i}-${j}`);
    assert.equal(x.coupleType.id, y.coupleType.id);
    assert.deepEqual(x.levels, y.levels);
  }
});

test("같은 입력은 항상 같은 결과다 — 규칙 버전이 남는다", () => {
  const a = person(1994, 11, 7);
  const b = person(1992, 4, 18);
  assert.deepEqual(compatOf(a, b), compatOf(a, b));
  assert.equal(compatOf(a, b).version, COMPAT_RULE_VERSION);
});

test("총점은 재료 점수의 합으로 설명된다(바탕 60 + 합계 × 1.4, 0~100) — 같은 계산이 근거 목록에 그대로 있다", () => {
  const a = person(1994, 11, 7);
  const b = person(1992, 4, 18);
  const r = compatOf(a, b);
  const total = r.parts.reduce((s, p) => s + p.points, 0);
  assert.equal(r.score, Math.max(0, Math.min(100, 60 + Math.round((total * 14) / 10))));
  assert.ok(r.score >= 0 && r.score <= 100 && Number.isInteger(r.score));
  const scoreEv = r.evidence.find((e) => e.id === "compat.score")!;
  assert.ok(scoreEv.fact.includes(`궁합 지수 ${r.score}`));
  for (const p of r.parts) assert.ok(scoreEv.fact.includes(`${p.label} ${p.points > 0 ? "+" : ""}${p.points}`), p.label);
  const type = r.evidence.find((e) => e.id === "compat.type")!;
  assert.ok(type.fact.includes(r.coupleType.name), "유료가 인용하는 유형 이름이 무료에서 본 것과 같다");
});

test("일간이 천간합인 두 사람(갑 · 기)은 일간 재료가 +10이고 근거에 천간합이 적힌다", () => {
  const gap = findByDayStem("갑");
  const gi = findByDayStem("기");
  const r = compatOf(gap, gi);
  const part = r.parts.find((p) => p.id === "day-stem")!;
  assert.equal(part.points, 10);
  const ev = r.evidence.find((e) => e.id === "compat.day-stem")!;
  assert.match(ev.fact, /천간합/);
  assert.ok(r.highlights.good.some((g) => /짝을 이루는 관계/.test(g)));
});

test("같은 오행의 일간 · 상생 · 상극 사이는 재료가 +3 · +5 · -4다", () => {
  const gap = findByDayStem("갑"); // 목
  const eul = findByDayStem("을"); // 목 — 같은 오행
  const byeong = findByDayStem("병"); // 화 — 목이 화를 낳는 상생
  const gyeong = findByDayStem("경"); // 금 — 금이 목을 극하는 상극
  assert.equal(compatOf(gap, eul).parts.find((p) => p.id === "day-stem")!.points, 3);
  assert.equal(compatOf(gap, byeong).parts.find((p) => p.id === "day-stem")!.points, 5);
  assert.equal(compatOf(gap, gyeong).parts.find((p) => p.id === "day-stem")!.points, -4);
  assert.equal(compatOf(gap, gyeong).levels.dayElement, "control");
});

test("출생 시각을 모르는 사람이 있으면 안내가 붙고 계산은 그대로 된다", () => {
  const r = compatOf(person(1994, 11, 7, null), person(1992, 4, 18));
  assert.ok(r.cautions.some((c) => /출생 시각을 모르는 사람은 시주 없이/.test(c)));
  assert.equal(r.a.hourKnown, false);
  assert.equal(r.b.hourKnown, true);
  assert.ok(r.coupleType.name.endsWith("커플"));
});

test("근거 목록: 모두 saju 근거이고 id가 compat.으로 시작하며 겹치지 않고, 사람 이름 대신 A님 · B님을 쓴다 — 규칙 이력(COMPAT_RULE_META)에 모두 있다", () => {
  const r = compatOf(person(1994, 11, 7), person(1992, 4, 18));
  assert.ok(r.evidence.length >= 5);
  assert.equal(new Set(r.evidence.map((e) => e.id)).size, r.evidence.length);
  for (const e of r.evidence) {
    assert.equal(e.source, "saju");
    assert.match(e.id, /^compat\./);
    assert.ok(COMPAT_RULE_META.some((m) => m.match.test(e.id)), `${e.id}에 맞는 규칙 이력이 없다`);
    assert.ok(/A님|B님/.test(e.fact + e.cue) || e.id === "compat.type" || e.id === "compat.score", e.id);
  }
  // 규칙 이력은 출처 · 조건 · 예외 · 검토 상태를 갖고 검증됐다고 쓰지 않는다
  for (const m of COMPAT_RULE_META) {
    assert.equal(m.review, "unreviewed");
    assert.ok(m.conditions.length > 0 && m.exceptions.length >= 4 && m.source.length > 10, m.id);
    assert.ok(m.exceptions.some((x) => /확률/.test(x)), `${m.id}: 확률이 아니라는 예외`);
    assert.ok(!/검증됨|전문가 감수/.test(m.interpretation + m.source), m.id);
  }
  // 규칙 이력의 모든 항목이 실제 근거에서 나온다(각 규칙의 근거 하나 이상)
  const wide = [compatOf(person(1994, 11, 7), person(1992, 4, 18)), compatOf(person(1990, 2, 3), person(1990, 8, 8)), compatOf(person(1985, 5, 5), person(2000, 12, 12)), compatOf(person(1979, 3, 3), person(1996, 7, 20))];
  const ids = new Set(wide.flatMap((x) => x.evidence.map((e) => e.id)));
  for (const m of COMPAT_RULE_META) assert.ok([...ids].some((id) => m.match.test(id)), `${m.id}: 근거가 한 번도 나오지 않았다`);
});

test("근거 문구에는 확률 · 속마음 · 사건 단정이 없고 \"합이 있어도 늘 편하지 않다\"는 단서가 있다", () => {
  const bad = /확률|퍼센트|반드시|운명|결혼하게|헤어지게|속마음|이혼/;
  for (const [x, y] of [[person(1994, 11, 7), person(1992, 4, 18)], [findByDayStem("갑"), findByDayStem("기")]] as const) {
    const r = compatOf(x, y);
    // "확률이나 정확도가 아니라"처럼 확률이 아니라고 밝히는 문장은 허용한다
    for (const e of r.evidence) assert.ok(!bad.test((e.fact + e.cue).replace(/확률이나 정확도가 아니라/g, "")), `${e.id}: ${e.cue}`);
    for (const t of [...r.highlights.good, ...r.highlights.care, r.highlights.pace, ...r.cautions]) assert.ok(!bad.test(t), t);
  }
  const r = compatOf(findByDayStem("갑"), findByDayStem("기"));
  assert.match(r.evidence.find((e) => e.id === "compat.day-stem")!.cue, /늘 편하다는 뜻은 아닙니다/);
});

test("화면 설명 문장: 총점은 확률이 아니라고 밝히고 전통 해석 · 두 사람의 사주만 본 결과임을 밝힌다", () => {
  assert.match(COMPAT_EXPLAIN.scoreNotProbability, /확률이나 궁합의 정확도가 아니라/);
  assert.match(COMPAT_EXPLAIN.tradition, /검증된 사실이 아니에요/);
  assert.match(COMPAT_EXPLAIN.tradition, /실제 성격이나 마음을 말해 주지는 않아요/);
  assert.match(COMPAT_EXPLAIN.scoreBasis, /배우자 자리/);
});

// ───── 분포 ─────

test("무작위 6,000쌍(고정 씨앗)에서 20가지 유형이 모두 나오고 총점이 넓게 퍼지며 A · B를 바꿔도 같다", () => {
  let seed = 424242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const pool: SajuOk[] = [];
  while (pool.length < 800) {
    const r = calculateSaju({ year: int(1950, 2005), month: int(1, 12), day: int(1, 28), calendar: "solar", isLeapMonth: false, birthTime: rnd() < 0.15 ? null : `${String(int(0, 23)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}`, gender: "male" });
    if (r.status === "ok") pool.push(r);
  }
  const types = new Map<string, number>();
  const scores: number[] = [];
  let asymmetric = 0;
  const results: CompatResult[] = [];
  for (let i = 0; i < 6000; i++) {
    const a = pool[int(0, pool.length - 1)];
    const b = pool[int(0, pool.length - 1)];
    const r = compatOf(a, b);
    results.push(r);
    if (i % 5 === 0) {
      const s = compatOf(b, a);
      if (s.score !== r.score || s.coupleType.id !== r.coupleType.id) asymmetric++;
    }
    types.set(r.coupleType.id, (types.get(r.coupleType.id) ?? 0) + 1);
    scores.push(r.score);
  }
  assert.equal(asymmetric, 0);
  assert.equal(types.size, 20, `나온 유형 ${types.size}/20`);
  // 어느 유형도 25%를 넘지 않는다(몇몇 유형으로 몰리지 않는다)
  for (const [id, n] of types) assert.ok(n / 6000 < 0.25, `${id} ${(n / 60).toFixed(1)}%`);
  scores.sort((x, y) => x - y);
  const q = (p: number) => scores[Math.floor(p * scores.length)];
  assert.ok(q(0.95) - q(0.05) >= 30, `5%~95% 폭 ${q(0.05)}~${q(0.95)}`);
  assert.ok(scores[0] < 40 && scores.at(-1)! > 85, "낮은 쪽 · 높은 쪽 끝이 모두 나온다");
  // 모든 결과에 근거가 있고 유형 · 총점 근거가 들어 있다
  for (const r of results.slice(0, 500)) assert.ok(r.evidence.some((e) => e.id === "compat.type") && r.evidence.some((e) => e.id === "compat.score"));
});
