// 실행: npm test — 인연의 경향(partner.ts)과 오늘의 한 장(day-plain.ts)이 계산 결과에서만 정해지고, 금지선(구체적 나이 · 직업 · 날짜 · 좋고 나쁜 날)을 넘지 않는지 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateSaju } from "../manseryeok-engine.ts";
import type { SajuOk } from "../engine.ts";
import { DAY_AREAS, DAY_NOTES, DAY_RULE_VERSION, dayKey, dayReading, seoulDate } from "./day-plain.ts";
import { PARTNER_NOTES, PARTNER_RULE_VERSION, partnerBasis, partnerReading, type AgeTilt } from "./partner.ts";
import { DAY_RULE_META, PARTNER_RULE_META } from "./rule-meta.ts";
import { spousePalace, type Group } from "./rules.ts";

function chart(y: number, m: number, d: number, gender: "male" | "female" | null = "female", birthTime: string | null = "12:00"): SajuOk {
  const r = calculateSaju({ year: y, month: m, day: d, calendar: "solar", isLeapMonth: false, birthTime, gender });
  assert.equal(r.status, "ok");
  return r as SajuOk;
}

const SAMPLES: [number, number, number][] = [[1990, 1, 1], [1984, 8, 23], [2001, 11, 5], [1976, 4, 30], [1996, 5, 20], [1993, 9, 14], [1988, 2, 29], [2003, 7, 7]];

test("인연의 경향: 일지의 십신 그룹이 분위기 · 나이 차의 큰 방향을 정하고, 같은 입력은 같은 결과다", () => {
  const seen = new Set<Group>();
  const expectTilt: Record<Group, AgeTilt> = { 인성: "elder", 관성: "elder", 비겁: "peer", 식상: "younger", 재성: "younger" };
  for (let k = 0; k < 90; k++) {
    const day = new Date(Date.UTC(1996, 2, 1 + k));
    const c = chart(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), "female");
    const palace = spousePalace(c);
    const a = partnerReading(c);
    assert.deepEqual(a, partnerReading(c));
    assert.equal(a.palace.group, palace.group);
    assert.equal(a.ageTilt.tilt, expectTilt[palace.group]);
    seen.add(palace.group);
  }
  assert.equal(seen.size, 5, "다섯 그룹이 모두 나오는 입력으로 확인했다");
});

test("인연의 경향: 문장은 단정하지 않고 구체적인 나이 · 직업 · 날짜 · 통계를 말하지 않는다 (큰 방향 + 작은 안내)", () => {
  const texts: string[] = [];
  for (const [y, m, d] of SAMPLES) {
    for (const g of ["female", "male", null] as const) {
      const r = partnerReading(chart(y, m, d, g));
      texts.push(r.mood.title, r.mood.line, r.ageTilt.label, r.ageTilt.line, r.longTerm.headline, r.longTerm.line, ...(r.star ? [r.star.line] : []));
    }
  }
  for (const t of texts) {
    assert.doesNotMatch(t, /\d+\s*살|\d+\s*세|\d{4}년|\d+월|직업|연봉|의사|회사원|공무원|선생|예술가/, `구체적인 나이 · 직업 · 날짜: ${t}`);
    assert.doesNotMatch(t, /반드시|틀림없|100%\s*(맞|정확합니다)|꼭 만나|결혼하게|헤어지게|확률|통계적으로/, `단정: ${t}`);
    assert.doesNotMatch(t, /일간|일지|십신|관성|재성|인성|식상|비겁|배우자 별|천간|지지/, `사주 용어가 본문에: ${t}`);
  }
  // 안내 문구(PARTNER_NOTES)는 "말하지 않는다"는 선을 밝히는 글이라 나이 · 직업이 나올 수 있다 — 단정 표현만 확인한다
  for (const t of Object.values(PARTNER_NOTES)) assert.doesNotMatch(t, /반드시|틀림없|꼭 만나|결혼하게|헤어지게|확률|통계적으로/, t);
  assert.match(PARTNER_NOTES.limit, /100% 정확하거나 검증된 사실이 아니에요/);
  assert.match(PARTNER_NOTES.scope, /정확한 나이 · 직업 · 마음, 만나는 날짜는 말하지 않고/);
  assert.match(PARTNER_NOTES.noStats, /통계나 조사 결과를 쓰지 않았어요/);
});

test("인연의 경향: 성별을 입력했을 때만 배우자 별을 보고, 개수는 원국을 직접 센 값과 같다", () => {
  const f = chart(1990, 1, 1, "female");
  const m = chart(1990, 1, 1, "male");
  const n = chart(1990, 1, 1, null);
  assert.equal(partnerReading(n).star, null);
  assert.equal(partnerReading(f).star?.group, "관성");
  assert.equal(partnerReading(m).star?.group, "재성");
  const count = (c: SajuOk, group: string) => c.pillars.flatMap((p) => [p.tenGod.stem, p.tenGod.branch]).filter((t) => ({ 편관: "관성", 정관: "관성", 편재: "재성", 정재: "재성" } as Record<string, string>)[t] === group).length;
  assert.equal(partnerReading(f).star?.count, count(f, "관성"));
  assert.equal(partnerReading(m).star?.count, count(m, "재성"));
  const basis = partnerBasis(n);
  assert.ok(basis.unknown.some((u) => /성별 정보가 없어/.test(u)));
  assert.ok(basis.unknown.some((u) => /통계나 조사로 확인된 것이 아니에요/.test(u)));
  assert.ok(basis.computed[0].includes("일지"));
});

test("인연의 경향 규칙 이력: 출처 · 조건 · 예외가 있고, 구체적인 나이 · 직업 · 날짜를 말하지 않는다는 예외가 모두 적혀 있다", () => {
  assert.match(PARTNER_RULE_VERSION, /^saju-partner-rules-/);
  assert.equal(PARTNER_RULE_META.length, 4);
  assert.equal(new Set(PARTNER_RULE_META.map((r) => r.id)).size, 4);
  for (const r of PARTNER_RULE_META) {
    for (const f of ["title", "calculation", "interpretation", "source", "version"] as const) assert.ok(r[f].length >= 3, `${r.id}.${f}`);
    assert.equal(r.review, "unreviewed", r.id);
    assert.match(r.source, /문헌 근거는 확인하지 못했다/, r.id);
    assert.ok(r.exceptions.some((e) => /나이 · 직업 · 마음 · 만나는 날짜/.test(e)), `${r.id}: 구체적 나이 · 직업 · 날짜 금지 예외`);
    assert.ok(r.exceptions.some((e) => /통계 · 조사 결과를 쓴 것처럼/.test(e)), `${r.id}: 통계 금지 예외`);
  }
});

test("오늘의 한 장: 같은 날 같은 원국이면 같은 결과이고, 날짜가 바뀌면 일진이 바뀐다", () => {
  const c = chart(1996, 5, 20);
  const a = dayReading(c, { year: 2026, month: 10, day: 15 });
  assert.deepEqual(a, dayReading(c, { year: 2026, month: 10, day: 15 }));
  const days = new Set<string>();
  for (let d = 1; d <= 60; d++) days.add(dayReading(c, { year: 2026, month: 10, day: ((d - 1) % 28) + 1 }).ganji);
  assert.ok(days.size >= 20, `일진이 날마다 바뀐다: ${days.size}`);
  assert.equal(a.ganji.length, 2);
  assert.equal(a.basis.computed.length, 3);
  assert.match(a.basis.computed[0], /2026\.10\.15/);
});

test("오늘의 한 장: 다섯 그룹이 모두 나오고, 영역별 한 줄이 네 가지 있으며, 합 · 충은 오늘 지지와 내 일지의 관계 그대로다", () => {
  const groups = new Set<Group>();
  let union = 0;
  let clash = 0;
  for (const [y, m, d] of SAMPLES) {
    const c = chart(y, m, d, "female");
    for (let k = 1; k <= 40; k++) {
      const r = dayReading(c, { year: 2026, month: 10, day: ((k - 1) % 28) + 1 });
      groups.add(r.stemGroup);
      assert.deepEqual(Object.keys(r.tips).sort(), DAY_AREAS.map((a) => a.id).sort());
      if (r.relation?.kind === "union") union++;
      if (r.relation?.kind === "clash") clash++;
      assert.match(r.basis.computed[2], r.relation ? (r.relation.kind === "union" ? /육합/ : /충/) : /합 · 충 없음/);
    }
  }
  assert.equal(groups.size, 5);
  assert.ok(union > 0 && clash > 0, `합 ${union} · 충 ${clash}`);
});

test("오늘의 한 장: 좋은 날 · 나쁜 날을 가르지 않고 예언 · 점수 · 사주 용어 · 구체적 사건이 없다", () => {
  const texts: string[] = [];
  for (const [y, m, d] of SAMPLES) {
    const r = dayReading(chart(y, m, d), { year: 2026, month: 10, day: 15 });
    texts.push(r.title, r.meaning, ...(r.relation ? [r.relation.line] : []), ...Object.values(r.tips));
  }
  for (const t of texts) {
    assert.doesNotMatch(t, /대길|흉|길한|운이 좋|운이 나|재수|행운|불운|조심하세요!|반드시|꼭 .*(생겨|일어)|\d+점|\d+%/, `예언 · 점수 · 길흉: ${t}`);
    assert.doesNotMatch(t, /일간|일지|십신|관성|재성|인성|식상|비겁|천간|지지|일진/, `사주 용어가 본문에: ${t}`);
  }
  for (const t of Object.values(DAY_NOTES)) assert.doesNotMatch(t, /대길|흉|운이 좋|운이 나|재수|행운|불운|반드시/, t);
  assert.match(DAY_NOTES.limit, /100% 정확하거나 검증된 사실이 아니에요/);
  assert.match(DAY_NOTES.limit, /좋고 나쁜 날을 가르는 것도 아니에요/);
  assert.match(DAY_NOTES.closing, /내일 새로운 한 장/);
});

test("오늘의 한 장: 한국 날짜 계산과 날짜 키, 규칙 이력", () => {
  assert.deepEqual(seoulDate(new Date("2026-10-14T16:00:00Z")), { year: 2026, month: 10, day: 15 });
  assert.deepEqual(seoulDate(new Date("2026-10-14T14:59:00Z")), { year: 2026, month: 10, day: 14 });
  assert.equal(dayKey({ year: 2026, month: 3, day: 5 }), "2026-03-05");
  assert.match(DAY_RULE_VERSION, /^saju-day-rules-/);
  assert.equal(DAY_RULE_META.length, 2);
  for (const r of DAY_RULE_META) {
    assert.equal(r.review, "unreviewed", r.id);
    assert.ok(r.exceptions.some((e) => /오늘 무슨 일이 생긴다고 말하는 데 쓰지 않는다/.test(e)), r.id);
    assert.ok(r.exceptions.some((e) => /좋은 날 · 나쁜 날을 가르거나/.test(e)), r.id);
  }
});
