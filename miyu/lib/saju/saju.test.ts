// 실행: npm test — 사주 계산 기준(양력 · 음력 · 윤달 · 출생시간 모름 · 자시 · 절기 · 서머타임)
// 넓은 범위의 독립 교차 검증은 engine.check.ts (npm run test:saju)
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SajuOk, SajuOptions, SajuResult } from "./engine.ts";
import { calculateSaju, resolveSolarDate, seoulOffsetMinutes } from "./manseryeok-engine.ts";
import { SAJU_POLICY } from "./policy.ts";
import { dayGanji, monthPeriods, yearGanji } from "./yearly.ts";

const RAW_KST: SajuOptions = { dayBoundary: "midnight", longitude: null, equationOfTime: false, historicalClock: false };
const ok = (r: SajuResult): SajuOk => {
  assert.equal(r.status, "ok", r.status === "invalid" ? r.message : r.status);
  return r as SajuOk;
};
const gz = (r: SajuOk) => Object.fromEntries(r.pillars.map((p) => [p.key, p.stem + p.branch]));
const solar = (y: number, m: number, d: number, birthTime: string | null) => ({ year: y, month: m, day: d, calendar: "solar" as const, isLeapMonth: false, birthTime });

test("양력: 보정 없는 한국 시각으로 네 기둥 (라이브러리 문서 예시와 같음)", () => {
  const r = ok(calculateSaju(solar(1992, 10, 24, "05:30"), RAW_KST));
  assert.deepEqual(gz(r), { year: "임신", month: "경술", day: "계유", hour: "을묘" });
  assert.equal(r.pillars[0].stemHanja + r.pillars[0].branchHanja, "壬申");
  assert.equal(Object.values(r.elementCounts).reduce((a, b) => a + b, 0), 8);
  assert.equal(r.dayMaster.stem, "계");
  assert.equal(r.dayMaster.element, "수");
});

test("음력: 한국 음력을 양력으로 바꿔 같은 결과", () => {
  const r = ok(calculateSaju({ year: 1992, month: 9, day: 29, calendar: "lunar", isLeapMonth: false, birthTime: "05:30" }, RAW_KST));
  assert.deepEqual(r.solarDate, { year: 1992, month: 10, day: 24 });
  assert.equal(gz(r).day, "계유");
});

test("윤달: 있는 윤달은 계산하고, 없는 윤달 · 없는 날짜는 이유를 알려준다", () => {
  assert.deepEqual(resolveSolarDate({ year: 2020, month: 4, day: 1, calendar: "lunar", isLeapMonth: true }), { ok: true, date: { year: 2020, month: 5, day: 23 } });
  const noLeap = calculateSaju({ year: 2021, month: 4, day: 1, calendar: "lunar", isLeapMonth: true, birthTime: null });
  assert.equal(noLeap.status, "invalid");
  assert.match(noLeap.status === "invalid" ? noLeap.message : "", /2021년에는 음력 윤4월이 없습니다/);
  const day30 = calculateSaju({ year: 2021, month: 4, day: 30, calendar: "lunar", isLeapMonth: false, birthTime: null });
  assert.match(day30.status === "invalid" ? day30.message : "", /음력 2021년 4월은 29일까지/);
  assert.equal(calculateSaju(solar(2023, 2, 29, null)).status, "invalid");
});

test("출생시간 모름: 시주 없이 세 기둥, 임의 시간을 넣지 않는다", () => {
  const r = ok(calculateSaju(solar(1995, 4, 12, null)));
  assert.equal(r.hourPillarOmitted, true);
  assert.deepEqual(r.pillars.map((p) => p.key), ["year", "month", "day"]);
  assert.equal(Object.values(r.elementCounts).reduce((a, b) => a + b, 0), 6);
  assert.equal(r.birthTime, null);
  assert.ok(r.notes.some((n) => n.kind === "hour-unknown"));
});

test("출생시간 모름 + 절기가 바뀌는 날: 연주 · 월주 후보를 함께 남긴다 (2024 입춘)", () => {
  const r = ok(calculateSaju(solar(2024, 2, 4, null)));
  const note = r.notes.find((n) => n.kind === "jeolgi-day");
  assert.ok(note, "절입일 안내");
  assert.deepEqual(note.pillars.sort(), ["month", "year"]);
  // 입춘(17:27) 전이면 계묘년 을축월, 후면 갑진년 병인월
  const values = new Set([gz(r).year, note.alternative?.year]);
  assert.deepEqual(values, new Set(["계묘", "갑진"]));
});

test("자시: 보정 후 밤 11시 이후는 다음 날 일주, 다른 관법 결과를 안내", () => {
  const late = ok(calculateSaju(solar(2024, 3, 10, "23:40"))); // 보정 후 23:10
  assert.equal(gz(late).day, "갑술");
  assert.equal(gz(late).hour, "갑자");
  const school = late.notes.find((n) => n.kind === "jasi-school");
  assert.equal(school?.alternative?.day, "계유");

  const before = ok(calculateSaju(solar(2024, 3, 10, "23:20"))); // 보정 후 22:50 → 해시, 당일
  assert.equal(gz(before).day, "계유");
  assert.equal(gz(before).hour, "계해");
});

test("지방시 보정: 07:20은 보정 후 06:50이라 묘시", () => {
  assert.equal(gz(ok(calculateSaju(solar(2000, 6, 1, "07:20")))).hour, "기묘");
  assert.equal(gz(ok(calculateSaju(solar(2000, 6, 1, "07:20"), RAW_KST))).hour, "경진");
});

test("경계 근처: 몇 분 차이로 시주가 바뀌면 안내한다", () => {
  const r = ok(calculateSaju(solar(2000, 6, 1, "07:35"))); // 보정 후 07:05 — 진시 시작 5분 뒤
  const near = r.notes.find((n) => n.kind === "near-boundary");
  assert.ok(near);
  assert.deepEqual(near.pillars, ["hour"]);
  assert.equal(near.alternative?.hour, "기묘");
  assert.match(near.message, /시주 기묘가 될 수 있습니다/, "받침 없는 간지 뒤에는 '가'");
  const calm = ok(calculateSaju(solar(2000, 6, 1, "08:30")));
  assert.ok(!calm.notes.some((n) => n.kind === "near-boundary"));
});

test("서머타임 · 과거 표준시: 당시 시계를 반영하고 안내한다", () => {
  assert.equal(seoulOffsetMinutes({ year: 1987, month: 7, day: 1, hour: 12, minute: 0 }), 600);
  assert.equal(seoulOffsetMinutes({ year: 1957, month: 1, day: 1, hour: 12, minute: 0 }), 510);
  assert.equal(seoulOffsetMinutes({ year: 2000, month: 1, day: 1, hour: 12, minute: 0 }), 540);
  const r = ok(calculateSaju(solar(1987, 7, 1, "11:30"))); // 시계 11:30 → 표준시 10:30 → 보정 10:00 → 사시
  assert.equal(gz(r).hour, "계사");
  assert.ok(r.notes.some((n) => n.kind === "historical-clock"));
});

test("대운: 성별이 있을 때만, 전통 규칙(양년 남 · 음년 여 순행)으로 10개", () => {
  assert.equal(ok(calculateSaju(solar(1995, 4, 12, "14:30"))).luck, null);
  const f = ok(calculateSaju({ ...solar(1995, 4, 12, "14:30"), gender: "female" })).luck!;
  assert.equal(f.forward, true, "을해년(음년) 여성은 순행");
  assert.equal(f.periods.length, 10);
  assert.equal(f.periods[0].stem + f.periods[0].branch, "신사", "월주 경진 다음");
  const m = ok(calculateSaju({ ...solar(1995, 4, 12, "14:30"), gender: "male" })).luck!;
  assert.equal(m.forward, false);
  assert.equal(m.periods[0].stem + m.periods[0].branch, "기묘", "월주 경진 이전");
  assert.match(f.periods[0].from, /^\d{4}-\d{2}$/);
});

test("기본 기준이 저장 결과에 함께 남는다 (나중에 기준이 바뀌어도 당시 계산을 알 수 있게)", () => {
  const r = ok(calculateSaju(solar(1995, 4, 12, "14:30")));
  assert.deepEqual(r.options, SAJU_POLICY);
  assert.equal(r.engine.name, "manseryeok");
});

test("세운 · 월운 · 일진은 날짜만으로 정해진다", () => {
  assert.equal(yearGanji(2026).stem + yearGanji(2026).branch, "병오");
  assert.equal(yearGanji(2027).stem + yearGanji(2027).branch, "정미");
  const months = monthPeriods(2026);
  assert.equal(months.length, 12);
  assert.equal(months[0].termName, "입춘");
  assert.equal(months[0].stem + months[0].branch, "경인");
  assert.equal(months[11].termName, "소한");
  const d = dayGanji({ year: 2026, month: 2, day: 17 });
  assert.equal(d.stem + d.branch, "임술");
});
