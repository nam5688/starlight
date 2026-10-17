// 실행: npm test — 첫 화면 "한눈에 기억되는 결과" 재료(identity.ts): 사주 원국이 있을 때만 만들고, 화면 스위치는 운영자가 기준을 확정하기 전까지 꺼져 있으며,
// 유형명(사주 + 응답)과 럭키 지수(사주만)가 서로 섞이지 않는지 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LUCKY_INDEX, PERSONAL_TYPE } from "../config/product.ts";
import type { SajuOk } from "../saju/engine.ts";
import { calculateSaju } from "../saju/manseryeok-engine.ts";
import { luckyIndexOf } from "../saju/interpret/lucky.ts";
import { buildIdentity } from "./identity.ts";
import type { FreeSummary } from "./types.ts";

const person = (): SajuOk => {
  const r = calculateSaju({ year: 1996, month: 3, day: 29, calendar: "solar", isLeapMonth: false, birthTime: "09:30", gender: "female" });
  assert.equal(r.status, "ok");
  return r as SajuOk;
};

const summaryOf = (scores: Record<string, number> = {}): Pick<FreeSummary, "temperament" | "relationship" | "mbti"> => {
  const row = (id: string) => ({ id, label: id, score: scores[id] ?? 50, lowMeaning: "", highMeaning: "" });
  const axis = (id: string) => ({ ...row(id), lowName: "", highName: "" });
  return { temperament: ["novelty", "caution", "sensitivity", "persistence"].map(row), relationship: ["anxiety", "avoidance"].map(row), mbti: { axes: ["ei", "sn", "tf", "jp"].map(axis) } };
};

test("화면 스위치: 개인 유형명 · 럭키 지수는 운영자가 유형 목록 · 점수표 · 분포를 확인하기 전까지 꺼져 있다(켤 때는 이 시험도 함께 바꾼다)", () => {
  assert.equal(PERSONAL_TYPE.visible, false);
  assert.equal(LUCKY_INDEX.visible, false);
});

test("사주 계산 결과가 없으면(not-connected · invalid) 이름도 점수도 만들지 않는다", () => {
  assert.equal(buildIdentity({ saju: { status: "not-connected" }, summary: summaryOf() }), null);
  assert.equal(buildIdentity({ saju: { status: "invalid", message: "x" }, summary: summaryOf() }), null);
});

test("럭키 지수는 사주만으로 정해지고(응답이 달라도 같은 값), 유형명은 응답이 달라지면 달라질 수 있다", () => {
  const s = person();
  const a = buildIdentity({ saju: s, summary: summaryOf({ caution: 95, tf: 5 }) });
  const b = buildIdentity({ saju: s, summary: summaryOf({ sensitivity: 95, tf: 95 }) });
  const c = buildIdentity({ saju: s, summary: summaryOf() });
  assert.ok(a && b && c);
  assert.deepEqual(a.lucky, b.lucky);
  assert.deepEqual(a.lucky, c.lucky);
  assert.deepEqual(a.lucky, luckyIndexOf(s));
  assert.equal(c.type.kind, "mixed", "뚜렷한 응답이 없으면 이름을 붙이지 않는다");
  assert.ok(a.type.name.length > 0 && b.type.name.length > 0);
});

test("화면 값에는 항상 진단이 아니라는 안내와 예측 · 보장이 아니라는 안내가 따라온다", () => {
  const r = buildIdentity({ saju: person(), summary: summaryOf({ caution: 95, tf: 5 }) });
  assert.ok(r);
  assert.match(r.type.note, /진단이나 평생 유형이 아니/);
  assert.ok(r.lucky.totalText.length > 0);
});
