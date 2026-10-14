// 실행: npm test — 월 단위 달력(months.ts)이 월운 간지 · 원국 관계 · 단계 규칙을 맞게 계산하는지, 같은 입력이 같은 결과인지, 규칙 이력이 빠짐없는지 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateSaju } from "../manseryeok-engine.ts";
import type { SajuOk } from "../engine.ts";
import { MONTH_LEVEL_LABEL, MONTH_NOTES, MONTH_RULE_VERSION, monthCalendar, monthsAtLevel } from "./months.ts";
import { branchRelations } from "./relations.ts";
import { MONTH_RULE_META } from "./rule-meta.ts";

function chart(y: number, m: number, d: number, gender: "male" | "female" | null = "female", birthTime: string | null = "12:00"): SajuOk {
  const r = calculateSaju({ year: y, month: m, day: d, calendar: "solar", isLeapMonth: false, birthTime, gender });
  assert.equal(r.status, "ok");
  return r as SajuOk;
}

test("월 단위 달력: 2026년(병오년) 열두 달의 월운 간지와 절기 시작일이 맞다", () => {
  const cal = monthCalendar(chart(1996, 5, 20), { year: 2026, gender: "female" });
  assert.deepEqual(cal.months.map((m) => m.ganji), ["경인", "신묘", "임진", "계사", "갑오", "을미", "병신", "정유", "무술", "기해", "경자", "신축"]);
  assert.deepEqual(cal.months.map((m) => m.termName).slice(0, 3), ["입춘", "경칩", "청명"]);
  assert.equal(cal.months[0].startsOn, "2026-02-04");
  assert.equal(cal.months[0].startMonth, 2);
  assert.equal(cal.months[11].startMonth, 1); // 소한(다음 해 1월 초)
  assert.deepEqual(cal.months.map((m) => m.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test("월 단위 달력: 달 지지와 일지의 육합 · 충 표시가 관계표(relations.ts) 판정과 모든 달에서 같다", () => {
  for (const [y, mo, d] of [[1990, 1, 1], [1984, 8, 23], [2001, 11, 5], [1976, 4, 30]] as const) {
    const base = chart(y, mo, d);
    const dayBranch = base.pillars.find((p) => p.key === "day")!.branch;
    const cal = monthCalendar(base, { year: 2026, gender: null });
    for (const m of cal.months) {
      const kinds = branchRelations(m.ganji.slice(1), dayBranch).map((r) => r.kind);
      const codes = m.love.tags.map((t) => t.code);
      assert.equal(codes.includes("palace-union"), kinds.includes("육합"), `${m.ganji} vs ${dayBranch}`);
      assert.equal(codes.includes("palace-change"), kinds.includes("충"), `${m.ganji} vs ${dayBranch}`);
      assert.equal(codes.includes("palace-weak"), kinds.includes("반합") || kinds.includes("형"), `${m.ganji} vs ${dayBranch}`);
    }
    assert.equal(cal.usedSpouseStar, false);
  }
});

test("월 단위 달력: 일지가 술이면 묘월은 육합(묶임), 진월은 충(변화), 축 · 미월은 약한 표시(단계에 세지 않음)", () => {
  // 일지가 술(戌)인 날을 찾는다 (임술일 등) — 2026년 달력에서 묘 · 진 · 축 · 미월이 각각 어떻게 표시되는지 본다
  let found: SajuOk | null = null;
  for (let d = 1; d <= 60 && !found; d++) {
    const c = chart(1996, 3, d, null);
    if (c.pillars.find((p) => p.key === "day")?.branch === "술") found = c;
  }
  assert.ok(found, "일지가 술인 날을 찾지 못함");
  const cal = monthCalendar(found, { year: 2026, gender: null });
  const byBranch = (b: string) => cal.months.find((m) => m.ganji.endsWith(b))!;
  assert.deepEqual(byBranch("묘").love.tags.map((t) => t.code), ["palace-union"]);
  assert.deepEqual(byBranch("진").love.tags.map((t) => t.code), ["palace-change"]);
  for (const b of ["축", "미"]) {
    const m = byBranch(b);
    assert.ok(m.love.tags.every((t) => t.weak), `${b}월은 약한 표시만`);
    assert.ok(m.love.tags.length >= 1 && m.love.level === "calm", `${b}월 단계 ${m.love.level}`);
  }
  // 성별이 없으면 배우자 별 표시는 없다
  assert.ok(cal.months.every((m) => m.love.tags.every((t) => t.code !== "spouse-star")));
});

test("월 단위 달력: 점수 규칙 — 2점 이상 큰 달, 1점 조금 움직이는 달, 0점 차분한 달 (가까운 관계 · 재물을 따로 센다)", () => {
  for (const g of ["male", "female"] as const) {
    const cal = monthCalendar(chart(1988, 9, 14, g), { year: 2027, gender: g });
    for (const m of cal.months) {
      const lovePts = m.love.tags.filter((t) => !t.weak).length;
      assert.equal(m.love.level, lovePts >= 2 ? "high" : lovePts === 1 ? "mid" : "calm");
      assert.equal(m.money.level, m.money.tags.length >= 2 ? "high" : m.money.tags.length === 1 ? "mid" : "calm");
      for (const t of [...m.love.tags, ...m.money.tags]) {
        assert.ok(t.plain.length > 5 && t.detail.length > 5);
        // 읽는 사람 화면용 문구에는 사주 용어를 쓰지 않는다 (용어는 detail에만)
        assert.doesNotMatch(t.plain, /일지|일간|천간|지지|원국|오행|비겁|식상|관성|인성|재성|충|형|합/, t.plain.replace(/는 주제|주제/, ""));
      }
    }
  }
});

test("월 단위 달력: 배우자 별은 성별이 있을 때만 — 여성은 관성, 남성은 재성이 월 천간 · 지지에 있는 달", () => {
  const f = monthCalendar(chart(1992, 3, 3, "female"), { year: 2026, gender: "female" });
  const m = monthCalendar(chart(1992, 3, 3, "male"), { year: 2026, gender: "male" });
  assert.equal(f.usedSpouseStar, true);
  assert.equal(m.usedSpouseStar, true);
  for (const c of [f, m]) assert.ok(c.months.some((x) => x.love.tags.some((t) => t.code === "spouse-star")), "한 해에 배우자 별이 들어오는 달이 하나도 없다");
  // 같은 원국이어도 성별이 다르면 별 기준이 달라 표시되는 달이 달라질 수 있다 (관성 vs 재성)
  const fStar = f.months.filter((x) => x.love.tags.some((t) => t.code === "spouse-star")).map((x) => x.index);
  const mStar = m.months.filter((x) => x.love.tags.some((t) => t.code === "spouse-star")).map((x) => x.index);
  assert.notDeepEqual(fStar, mStar);
});

test("월 단위 달력: 같은 입력은 항상 같은 결과이고, 요약 도우미는 단계가 같은 달을 순서대로 돌려준다", () => {
  const c = chart(1990, 7, 7);
  const a = monthCalendar(c, { year: 2026, gender: "female" });
  const b = monthCalendar(c, { year: 2026, gender: "female" });
  assert.deepEqual(a, b);
  const highs = monthsAtLevel(a, "love", "high");
  assert.deepEqual(highs.map((m) => m.index), [...highs.map((m) => m.index)].sort((x, y) => x - y));
  assert.equal(MONTH_LEVEL_LABEL.high, "움직임이 큰 달");
});

test("월 단위 달력: 일주가 달라질 수 있는 출생이면 dayUncertain을 알리고, 안내 문구는 해요체이며 한계를 밝힌다", () => {
  // 밤 11시~자정(자시 관법에 따라 일주가 달라지는 구간)
  const r = calculateSaju({ year: 1995, month: 6, day: 10, calendar: "solar", isLeapMonth: false, birthTime: "23:40", gender: "female" });
  assert.equal(r.status, "ok");
  const cal = monthCalendar(r as SajuOk, { year: 2026, gender: "female" });
  assert.equal(cal.dayUncertain, true);
  const calm = monthCalendar(chart(1995, 6, 10, "female", "12:00"), { year: 2026, gender: "female" });
  assert.equal(calm.dayUncertain, false);
  for (const text of Object.values(MONTH_NOTES)) assert.match(text, /요\.$/, text);
  assert.match(MONTH_NOTES.limit, /검증된 사실이 아니에요/);
});

test("월 단위 규칙 이력: 규칙마다 출처 · 계산 · 해석 · 조건 · 예외 · 검토 상태 · 버전이 있고 검토 완료로 적은 것이 없다", () => {
  assert.match(MONTH_RULE_VERSION, /^saju-month-rules-/);
  assert.equal(new Set(MONTH_RULE_META.map((r) => r.id)).size, MONTH_RULE_META.length);
  assert.equal(MONTH_RULE_META.length, 5);
  for (const r of MONTH_RULE_META) {
    for (const f of ["title", "calculation", "interpretation", "source", "version"] as const) assert.ok(r[f].length >= 3, `${r.id}.${f}`);
    assert.ok(r.conditions.length >= 1 && r.exceptions.length >= 3, r.id);
    assert.equal(r.review, "unreviewed", r.id);
    assert.match(r.source, /문헌 근거는 확인하지 못했다/, r.id);
    assert.ok(r.exceptions.some((e) => /사건 · 날짜/.test(e)), `${r.id}: 사건 예언 금지 예외`);
  }
});
