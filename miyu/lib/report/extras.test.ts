// 실행: npm test — 규칙 기반 구성 요소의 표현 · 구조 검사
import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { calculateSaju } from "../saju/manseryeok-engine.ts";
import type { SajuOk } from "../saju/engine.ts";
import { itemSuggestions } from "../saju/items.ts";
import { plainSajuReading } from "../saju/plain.ts";
import { buildDevFreeSummary } from "./build-free-summary.ts";
import { buildReportExtras } from "./extras.ts";
import { buildSituations, SITUATION_PLAN } from "./situations.ts";

const A = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: "08:40", gender: "female" }) as SajuOk;
const NO_HOUR = calculateSaju({ year: 1994, month: 11, day: 7, calendar: "solar", isLeapMonth: false, birthTime: null }) as SajuOk;
const FORBIDDEN = /정확도|적중률|100\s*%|틀림없|반드시|운명입니다|\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|결혼하게 될|후회하게|불행해질/;
const answers = (f: (i: number) => number) => Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((item, i) => [item.id, f(i)])));

function allText(x: unknown): string[] {
  if (typeof x === "string") return [x];
  if (Array.isArray(x)) return x.flatMap(allText);
  if (x && typeof x === "object") return Object.values(x).flatMap(allText);
  return [];
}

test("원국 쉬운 풀이: 오행 각각의 뜻 · 많음/없음 풀이가 있고, 출생시간을 모르면 글자 수가 6이다", () => {
  const p = plainSajuReading(A);
  assert.equal(p.charCount, 8);
  assert.equal(plainSajuReading(NO_HOUR).charCount, 6);
  assert.deepEqual(p.elements.map((e) => e.element), ["목", "화", "토", "금", "수"]);
  assert.ok(p.elements.every((e) => e.force && e.hanja));
  const level = Object.fromEntries(p.elements.map((e) => [e.element, e.level]));
  assert.deepEqual(level, { 목: "many", 화: "few", 토: "many", 금: "few", 수: "none" });
  assert.match(p.headline, /^촛불처럼 한곳을 오래 비추는 섬세한 사람 — 원국에는 목\(나무\)·토\(흙\) 기운이 많고 수\(물\) 기운이 없는 구성입니다\.$/);
  assert.equal(p.dayMaster.label, "정화(丁)");
  assert.ok(p.everyday.length >= 3 && p.everyday[0].startsWith("수(물) 기운이 없어요"));
  assert.ok(p.elements.find((e) => e.element === "수")!.plain.length > 20);
  assert.equal(p.elements.find((e) => e.element === "토")!.plain.includes("지키고"), true);
});

test("보완 아이템: 없거나 적은 기운(수 · 화 · 금)만, 고르게 있으면 가장 적은 기운", () => {
  const items = itemSuggestions(A);
  assert.deepEqual(items.items.map((i) => `${i.element}${i.count}`), ["화1", "금1", "수0"]);
  assert.ok(items.items.every((i) => i.colors.length && i.materials.length && i.place && i.habits.length));
  assert.match(items.limits, /효과를 보장하지 않으며/);
  assert.match(items.intro, /없거나 적게/);
  const even: SajuOk = { ...A, elementCounts: { 목: 2, 화: 2, 토: 2, 금: 1, 수: 1 } };
  assert.deepEqual(itemSuggestions(even).items.map((i) => i.element), ["금", "수"]);
  const flat: SajuOk = { ...A, elementCounts: { 목: 2, 화: 2, 토: 2, 금: 2, 수: 2 } };
  assert.equal(itemSuggestions(flat).items.length, 5, "모두 같으면 모두 나열하지 않고 가장 적은 기운들");
});

test("상황별: 5가지 상황 모두 잘하는 점 · 주의할 점 · 장면 · 해볼 것이 있고, 응답이 달라지면 내용이 달라진다", () => {
  const sets = [(i: number) => (i % 5) + 1, () => 5, () => 1, (i: number) => (i % 2 ? 5 : 1), (i: number) => (i < 8 ? 5 : 2)];
  const seen = new Set<string>();
  for (const f of sets) {
    const sit = buildSituations(buildDevFreeSummary(answers(f)));
    assert.deepEqual(sit.map((s) => s.id), SITUATION_PLAN.map((s) => s.id));
    for (const s of sit) {
      for (const k of ["strengthLabel", "cautionLabel", "scenario", "strength", "caution", "tip"] as const) assert.ok(s[k].length >= 8, `${s.id}.${k}`);
      assert.match(s.scenario, /이 경향 때문일 수 있어요/, "단정하지 않는 장면 표현");
      assert.doesNotMatch(allText(s).join(" "), /\d{2,3}점|\b\d{2}\b(?=\s*\()/, "점수 숫자를 문장에 쓰지 않는다");
    }
    seen.add(JSON.stringify(sit));
  }
  assert.ok(seen.size >= 4, "응답에 따라 다르게 나온다");
});

test("구성 요소 전체: 금지 표현(정확도 · 단정 · 날짜 예언 · 사건 예언 · 불안 자극)이 없고, 나이 · 직업 · 만날 날짜 예측을 하지 않는다", () => {
  for (const f of [(i: number) => (i % 5) + 1, () => 5, () => 1]) {
    const e = buildReportExtras({ summary: buildDevFreeSummary(answers(f)), saju: A, reference: { year: 2026, month: 10 } });
    const text = allText(e).join("\n");
    assert.doesNotMatch(text, FORBIDDEN);
    assert.doesNotMatch(text, /\d{1,2}\s*(살|세)에|직업은|만나게 될/);
    assert.match(e.partner!.limits, /나이 · 직업 · 만나는 날짜는 계산하거나 예측하지 않습니다/);
    // 색 · 소재를 사야 한다고 권하지 않는다
    assert.doesNotMatch(allText(e.items).join(" "), /구매하|사세요|쇼핑/);
  }
});

test("개인 질문: 원국에서 나온 질문 3~5개, 질문마다 쉬운 말 답과 근거, 일상어로 읽을 수 있다", () => {
  const e = buildReportExtras({ summary: buildDevFreeSummary(answers((i) => (i % 5) + 1)), saju: A, reference: { year: 2026, month: 10 } });
  assert.ok(e.questions.length >= 3 && e.questions.length <= 5);
  assert.match(e.questions[0].question, /^원국에 관성\(官星\)이 없다는데/);
  assert.match(e.questions[0].answer, /^관성은 나를 다스리는 기운으로/);
  assert.equal(new Set(e.questions.map((q) => q.id)).size, e.questions.length);
  assert.ok(e.questions.every((q) => q.basis.length > 3 && q.answer.length > 40));
  // 시기 질문은 사건이 아니라 주제
  const seun = e.questions.find((q) => q.id.startsWith("saju.seun"));
  if (seun) assert.match(seun.answer, /사건이나 날짜를 알려 주는 것이 아니라/);
});

test("어울리는 관계 조건: 배우자 자리와 응답에서 3가지 편안한 조건 · 맞추기 어려운 모습 · 일지와 닿는 해만", () => {
  const e = buildReportExtras({ summary: buildDevFreeSummary(answers((i) => (i % 5) + 1)), saju: A, reference: { year: 2026, month: 10 } });
  const partner = e.partner!;
  assert.equal(partner.fits.length, 3);
  assert.ok(partner.watch.length >= 1);
  assert.ok(partner.timing.years.every((y) => y.year >= 2026 && y.year <= 2028));
  assert.match(partner.timing.note, /예언하는 것이 아니라|직접 맞닿는 해는 없습니다/);
});
