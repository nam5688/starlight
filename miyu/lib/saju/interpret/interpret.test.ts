// 실행: npm test — 해석 근거 추출 규칙 v0 (예시 원국: 1994-11-07 08:40 양력, 여성 — 제안서 예시와 같은 인물)
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SajuOk } from "../engine.ts";
import { calculateSaju } from "../manseryeok-engine.ts";
import { branchRelations, stemRelation } from "./relations.ts";
import { sajuEvidence } from "./rules.ts";

const chart = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" }) as SajuOk;
const items = sajuEvidence(chart, { reference: { year: 2026, month: 10 }, gender: "female" });
const byId = (id: string) => items.find((e) => e.id === id);

test("관계표: 합 · 반합 · 충 · 형을 계산한다 (한 쌍에 여러 관계 가능)", () => {
  assert.deepEqual(stemRelation("정", "임"), { kind: "천간합", a: "정", b: "임", forms: "목" });
  assert.equal(stemRelation("갑", "정"), null);
  assert.deepEqual(branchRelations("진", "술").map((r) => r.kind), ["충"]);
  assert.deepEqual(branchRelations("유", "진").map((r) => r.kind), ["육합"]);
  assert.deepEqual(branchRelations("오", "술").map((r) => r.kind), ["반합"]);
  assert.deepEqual(branchRelations("신", "진").map((r) => r.kind), [], "왕지(자)가 없으면 반합이 아니다");
  assert.deepEqual(branchRelations("축", "미").map((r) => r.kind), ["충", "형"]);
  assert.deepEqual(branchRelations("술", "미").map((r) => r.kind), ["형"]);
});

test("원국 근거: 일간 · 오행 · 십신 분포 · 조합 · 배우자 자리", () => {
  assert.match(byId("saju.daymaster")!.fact, /정화\(丁\)/);
  assert.ok(byId("saju.element.목.many"));
  assert.ok(byId("saju.element.토.many"));
  assert.ok(byId("saju.element.수.none"));
  assert.match(byId("saju.tengod.인성.many")!.fact, /^인성 3자리/);
  assert.match(byId("saju.tengod.식상.many")!.fact, /상관 · 상관 · 상관/);
  assert.ok(byId("saju.combo.sanggwan-paein"));
  assert.match(byId("saju.spouse-palace")!.fact, /유\(酉\) — 편재/);
  assert.ok(byId("saju.tengod.관성.none"));
  assert.match(byId("saju.spouse-star")!.fact, /관성\) 0자리/);
});

test("원국 안의 관계: 진술 충 · 진유 육합, 공망 진", () => {
  assert.ok(byId("saju.relation.month-hour.충"));
  assert.ok(byId("saju.relation.year-hour.충"));
  assert.ok(byId("saju.relation.day-hour.육합"));
  assert.match(byId("saju.void")!.fact, /시주에 해당/);
});

test("시기 근거: 현재 대운 신미(재성 · 식상)와 원국 술미 형, 2026 병오의 오술 반합", () => {
  const current = byId("saju.daeun.current")!;
  assert.match(current.fact, /현재 대운 신미\(辛未\) 2024-08~2034-07 — 천간 편재, 지지 식신/);
  assert.equal(current.period?.from, "2024-08");
  assert.ok(byId("saju.daeun.current.year.형"));
  assert.ok(byId("saju.daeun.next"), "다음 대운도 함께");
  assert.match(byId("saju.seun.2026")!.fact, /병오 — 천간 겁재, 지지 비견/);
  assert.ok(byId("saju.seun.2026.month.반합"));
  assert.ok(byId("saju.seun.2027.month.형"));
  assert.ok(byId("saju.seun.2028"));
});

test("근거 ID는 겹치지 않고, 모든 근거에 사실과 해석 단서가 있다", () => {
  const ids = items.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const e of items) {
    assert.ok(e.fact.length > 3 && e.cue.length > 10, e.id);
    assert.ok(!/정확도|반드시|100%|확실히|운명/.test(e.cue), `${e.id}: 단정 표현`);
  }
});

test("성별이 없으면 대운 · 배우자 별 근거를 만들지 않는다", () => {
  const noGender = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40" }) as SajuOk;
  const list = sajuEvidence(noGender, { reference: { year: 2026, month: 10 } });
  assert.ok(!list.some((e) => e.id.startsWith("saju.daeun")));
  assert.ok(!list.some((e) => e.id === "saju.spouse-star"));
  assert.ok(list.some((e) => e.id === "saju.seun.2026"), "세운은 성별 없이도");
});

test("근거 문장의 조사는 받침에 맞춘다 (수가 없음 · 인과 원국)", () => {
  assert.equal(byId("saju.element.수.none")!.fact, "원국 글자에 수가 없음 (지장간 제외)");
  const b = calculateSaju({ year: 1992, month: 6, day: 21, calendar: "solar", isLeapMonth: false, birthTime: "15:10", gender: "female" }) as SajuOk;
  const list = sajuEvidence(b, { reference: { year: 2026, month: 10 }, gender: "female" });
  assert.match(list.find((e) => e.id === "saju.daeun.next.year.충")!.fact, /지지 인과 원국 년주의 충/);
  assert.match(list.find((e) => e.id === "saju.element.목.none")!.fact, /목이 없음/);
  for (const e of [...items, ...list]) assert.doesNotMatch(e.fact, /(수|화|토|오|묘|사|미|유|해|자)이 없음|(인|진|신|술|축)와 /, e.id);
});

test("대운 타임라인: 기준 월이 속한 대운을 가운데로 이전 · 다음 대운이 이어지고, 현재 대운은 기간 안의 위치만 가진다 (근거 목록의 대운과 같은 기간)", async () => {
  const { luckTimeline, GROUP_THEME_SHORT } = await import("./rules.ts");
  const { calculateSaju } = await import("../manseryeok-engine.ts");
  const r = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" });
  assert.equal(r.status, "ok");
  const saju = r as import("../engine.ts").SajuOk;
  const ref = { year: 2026, month: 10 };
  const slots = luckTimeline(saju, ref);
  assert.deepEqual(slots.map((s) => s.role), ["previous", "current", "next"]);
  const [prev, cur, next] = slots;
  const monthsOf = (t: string) => Number(t.slice(0, 4)) * 12 + Number(t.slice(5, 7)) - 1;
  assert.equal(monthsOf(prev.to) + 1, monthsOf(cur.from), "이전 대운 끝 다음 달이 현재 대운 시작");
  assert.equal(monthsOf(cur.to) + 1, monthsOf(next.from), "현재 대운 끝 다음 달이 다음 대운 시작");
  assert.ok(cur.progress !== undefined && cur.progress > 0 && cur.progress < 1, "현재 위치는 0과 1 사이");
  assert.equal(prev.progress, undefined);
  assert.equal(next.progress, undefined);
  for (const s of slots) {
    assert.ok(s.themes.length >= 1 && s.themes.length <= 2);
    for (const t of s.themes) assert.ok(Object.values(GROUP_THEME_SHORT).includes(t));
  }
  // 근거 목록(sajuEvidence)의 현재 · 다음 대운과 같은 기간이다
  const ev = sajuEvidence(saju, { reference: ref, gender: "female" });
  const curEv = ev.find((e) => e.id === "saju.daeun.current")!;
  const nextEv = ev.find((e) => e.id === "saju.daeun.next")!;
  assert.deepEqual([curEv.period?.from, curEv.period?.to], [cur.from, cur.to]);
  assert.deepEqual([nextEv.period?.from, nextEv.period?.to], [next.from, next.to]);
  // 성별이 없으면 대운을 만들지 않는다
  const noGender = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: null as never });
  if (noGender.status === "ok") assert.deepEqual(luckTimeline(noGender as import("../engine.ts").SajuOk, ref), []);
});
