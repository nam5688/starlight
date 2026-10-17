// 실행: npm test — ME:U 럭키 지수(lucky.ts): 사주 원국만으로 같은 값이 나오는지, 점수가 점수표의 합으로 설명되는지, 고정 문구가 "운이 나쁘다"로 읽히지 않는지,
// 분포가 한쪽으로 몰리지 않는지(가정: 생년월일 균등), 규칙 이력이 검토 전으로 있는지 확인한다. 점수표는 미유가 정한 설계 가설이며 이 시험은 어떤 사주가 실제로 운이 좋다는 보증이 아니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JARGON } from "../../report/reading/plan.ts";
import type { SajuOk } from "../engine.ts";
import { calculateSaju } from "../manseryeok-engine.ts";
import {
  LUCKY_BANDS, LUCKY_FALLBACK_LINE, LUCKY_METHOD, LUCKY_NOTE, LUCKY_RULES, LUCKY_SCALE, LUCKY_STRONGEST, LUCKY_STRONGEST_LINE, LUCKY_SUB_IDS, LUCKY_SUB_TEXT, LUCKY_TOTAL_BANDS,
  LUCKY_TOTAL_STRETCH, LUCKY_TOTAL_TEXT, LUCKY_VERSION, luckyIndexOf, luckyMaterial,
} from "./lucky.ts";
import { LUCKY_RULE_META } from "./rule-meta.ts";

const person = (year: number, month: number, day: number, birthTime: string | null = "09:30"): SajuOk => {
  const r = calculateSaju({ year, month, day, calendar: "solar", isLeapMonth: false, birthTime, gender: "female" });
  assert.equal(r.status, "ok");
  return r as SajuOk;
};

let seed = 11;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const randomPerson = () => person(int(1950, 2005), int(1, 12), int(1, 28), rnd() < 0.15 ? null : `${String(int(0, 23)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}`);
const crowd: SajuOk[] = Array.from({ length: 2500 }, randomPerson);

test("하위 지수 네 개의 이름이 정해진 대로이고, 같은 사주는 언제나 같은 값이며 사주(원국)만 입력으로 받는다", () => {
  assert.deepEqual(LUCKY_SUB_IDS, ["people", "chance", "wealth", "recovery"]);
  assert.deepEqual(LUCKY_SUB_IDS.map((id) => LUCKY_RULES[id].name), ["귀인 · 사람복", "기회 연결", "재물 흐름", "회복 · 반전"]);
  const s = person(1993, 7, 14);
  const a = luckyIndexOf(s);
  assert.deepEqual(a, luckyIndexOf(s));
  assert.equal(luckyIndexOf.length, 1, "응답 · MBTI · 시기를 받는 자리가 없다(사주 하나만)");
  assert.equal(a.version, LUCKY_VERSION);
  assert.match(LUCKY_VERSION, /draft/);
});

test("점수: 모두 0~100의 정수이고 점수표 합(raw)을 눈금에 옮긴 값과 같으며, 총점은 네 지수의 평균을 늘린 값이다", () => {
  for (const s of crowd.slice(0, 600)) {
    const r = luckyIndexOf(s);
    assert.equal(r.subs.length, 4);
    for (const sub of r.subs) {
      assert.ok(Number.isInteger(sub.score) && sub.score >= 0 && sub.score <= 100);
      const raw = sub.items.reduce((a, b) => a + b.points, 0);
      assert.equal(sub.raw, raw);
      const { floor, span } = LUCKY_SCALE[sub.id];
      assert.equal(sub.score, Math.round(floor + span * Math.max(0, Math.min(1, raw / LUCKY_RULES[sub.id].max))));
      assert.ok(sub.items.every((i) => i.points !== 0), "적용된 항목만 남긴다");
    }
    const mean = r.subs.reduce((a, b) => a + b.score, 0) / 4;
    const { center, factor, min, max } = LUCKY_TOTAL_STRETCH;
    assert.equal(r.total, Math.max(min, Math.min(max, Math.round(center + (mean - center) * factor))));
  }
});

test("원국 재료: 시각을 몰라도 일곱 자리로 환산해 세고(갈래별 합 7), 합 · 충 개수는 원국 지지 쌍(최대 6)을 넘지 않는다", () => {
  for (const s of crowd.slice(0, 400)) {
    const m = luckyMaterial(s);
    const total = Object.values(m.cnt).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 7) < 1e-9, `갈래별 합 ${total}`);
    assert.ok(m.combineAll <= 6 && m.clashAll <= 6);
    assert.ok(m.combineDay <= m.combineAll && m.clashDay <= m.clashAll);
    assert.equal(m.hourKnown, s.pillars.some((p) => p.key === "hour"));
  }
});

test("고정 문구: 구간별 문구에 사주 용어 · 숫자 · '운이 나쁘다'가 없고, 낮은 구간은 행동으로 흐름을 만드는 쪽으로 쓴다", () => {
  const texts = [
    ...LUCKY_SUB_IDS.flatMap((id) => Object.values(LUCKY_SUB_TEXT[id])),
    ...Object.values(LUCKY_STRONGEST_LINE), ...Object.values(LUCKY_TOTAL_TEXT), LUCKY_FALLBACK_LINE, LUCKY_NOTE, ...LUCKY_METHOD,
  ];
  for (const t of texts) {
    assert.doesNotMatch(t, JARGON, t);
    assert.doesNotMatch(t, /운이 나쁘(?!다고 운이)|불운|흉|재수 없|망|실패할|저주/, t);
    assert.doesNotMatch(t, /[🍀✨⭐🌟]/u, t);
  }
  for (const id of LUCKY_SUB_IDS) assert.match(LUCKY_SUB_TEXT[id].low, /행동|내가 먼저|스스로|챙길|관리/, `${id} low`);
  assert.equal(LUCKY_TOTAL_TEXT.low, "운이 먼저 굴러오기보다, 행동으로 흐름을 만드는 힘이 중요한 타입이에요.");
});

test("지수 옆 안내: 예측 · 보장이 아니고 성공 확률 · 정확도 · 사람의 가치가 아니며 전문가 검토 전 초안이라고 적혀 있고, 재료와 방향은 점수표 숫자 없이 설명한다", () => {
  assert.match(LUCKY_NOTE, /예측이 아니며 결과를 보장하지 않아요/);
  assert.match(LUCKY_NOTE, /성공 확률이나 정확도, 사람의 가치/);
  assert.match(LUCKY_NOTE, /전문가 검토 전 초안/);
  assert.match(LUCKY_NOTE, /점수가 낮다고 운이 나쁜 것도 아니에요/);
  assert.ok(LUCKY_METHOD.some((m) => /응답 · MBTI/.test(m) && /넣지 않아요/.test(m)), "응답 · MBTI를 넣지 않는다고 밝힌다");
  for (const m of LUCKY_METHOD) assert.doesNotMatch(m, /[0-9]/, "점수표의 숫자는 싣지 않는다");
});

test("가장 강한 럭키 포인트: 최고가 기준 이상이고 둘째와 차이가 날 때만 말하고, 아니면 '고른 구조' 문구를 쓴다", () => {
  let strongest = 0, fallback = 0;
  for (const s of crowd.slice(0, 800)) {
    const r = luckyIndexOf(s);
    const sorted = [...r.subs].sort((a, b) => b.score - a.score);
    if (r.strongest) {
      strongest++;
      assert.equal(r.fallbackLine, null);
      assert.ok(sorted[0].score >= LUCKY_STRONGEST.minScore && sorted[0].score - sorted[1].score >= LUCKY_STRONGEST.minLead);
      assert.equal(r.strongest.id, sorted[0].id);
      assert.equal(r.strongest.line, LUCKY_STRONGEST_LINE[sorted[0].id]);
    } else {
      fallback++;
      assert.equal(r.fallbackLine, LUCKY_FALLBACK_LINE);
    }
  }
  assert.ok(strongest > 0 && fallback > 0);
});

test("안내(caveat): 시각을 모르면 시주 없이 계산했다고, 절기 · 자시 경계에 걸리면 달라질 수 있다고 알려 준다", () => {
  const unknown = luckyIndexOf(person(1990, 5, 5, null));
  assert.ok(unknown.caveat, "시각을 모르면 안내가 붙는다");
  const withCaveat = crowd.filter((s) => luckyIndexOf(s).caveat).length;
  assert.ok(withCaveat > 0 && withCaveat < crowd.length);
  assert.match(luckyIndexOf(person(1990, 5, 5, null)).caveat ?? "", /시주 없이|달라질 수 있어요/);
});

test("분포: 하위 지수는 낮음 · 높음 구간이 각각 8~40%이고 총점도 한가운데로 몰리지 않는다(가정: 생년월일 균등 · 15%는 시각 모름 — 실제 이용자 분포가 아니다)", () => {
  const results = crowd.map(luckyIndexOf);
  for (const id of LUCKY_SUB_IDS) {
    const low = results.filter((r) => r.subs.find((s) => s.id === id)!.band === "low").length / results.length;
    const high = results.filter((r) => r.subs.find((s) => s.id === id)!.band === "high").length / results.length;
    assert.ok(low >= 0.08 && low <= 0.4, `${id} low ${(low * 100).toFixed(1)}%`);
    assert.ok(high >= 0.08 && high <= 0.4, `${id} high ${(high * 100).toFixed(1)}%`);
    const scores = results.map((r) => r.subs.find((s) => s.id === id)!.score).sort((a, b) => a - b);
    assert.ok(scores[Math.floor(scores.length * 0.95)] - scores[Math.floor(scores.length * 0.05)] >= 25, `${id} 폭`);
  }
  const totals = results.map((r) => r.total).sort((a, b) => a - b);
  assert.ok(totals[Math.floor(totals.length * 0.95)] - totals[Math.floor(totals.length * 0.05)] >= 25, "총점 5%~95% 폭이 25 이상");
  const bandShare = (b: string) => results.filter((r) => r.totalBand === b).length / results.length;
  assert.ok(bandShare("low") >= 0.08 && bandShare("high") >= 0.08, "총점도 낮음 · 높음이 각각 8% 이상");
  assert.ok(LUCKY_BANDS.low < LUCKY_BANDS.high && LUCKY_TOTAL_BANDS.low < LUCKY_TOTAL_BANDS.high);
  assert.ok(Math.max(...totals) <= 99 && Math.min(...totals) >= 20);
});

test("규칙 이력: 다섯 규칙이 모두 검토 전(unreviewed)이고 예외에 '성공 확률이 아니다 · 사주만으로 계산 · 신살 · 격국 · 용신 안 씀'이 적혀 있으며 전문가 감수라고 쓰지 않는다", () => {
  assert.equal(LUCKY_RULE_META.length, 5);
  for (const m of LUCKY_RULE_META) {
    assert.equal(m.review, "unreviewed");
    const joined = m.exceptions.join(" ");
    assert.match(joined, /성공 확률 · 정확도 · 사람의 가치가 아니다/);
    assert.match(joined, /사주 원국에서만/);
    assert.match(joined, /신살/);
    assert.doesNotMatch(m.source + m.interpretation, /전문가 감수|검증됨/);
    assert.ok(m.source.includes("문헌에서 확인한 것이 아니다") || m.source.includes("문헌"), "문헌 근거를 확인하지 못했다고 적는다");
  }
  for (const id of LUCKY_SUB_IDS) assert.ok(LUCKY_RULE_META.some((m) => m.match.test(`lucky.${id}`)));
  assert.ok(LUCKY_RULE_META.some((m) => m.match.test("lucky.total")));
});
