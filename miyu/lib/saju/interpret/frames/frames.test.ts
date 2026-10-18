// 실행: npm test — 명리 조합 해석 프레임(연애 · 재물 · 과거 회고, 2026-10-18). 새 AI 호출 · DB · 결제 없음.
// 지키는 것: ① 프레임은 서로 다른 사실 둘 이상이 겹칠 때만 발동한다 ② 응답은 프레임의 있고 없음을 바꾸지 않는다 ③ 성별 · 시각 · 대운이 없으면 지어내지 않는다
//           ④ 과거는 현재 나이 이전 · 나이 하한 이후의 가능성으로만 ⑤ 키워드는 문장이 아니고 판정 이름 · 사건 단정이 없다 ⑥ 발동한 계산값을 다시 세어 맞춘다
import assert from "node:assert/strict";
import { test } from "node:test";
import { getBranchTenGod, getTenGod } from "manseryeok";
import type { SajuOk } from "../../engine.ts";
import { calculateSaju } from "../../manseryeok-engine.ts";
import { yearGanji } from "../../yearly.ts";
import { branchRelations } from "../relations.ts";
import { GROUP_OF, type Group } from "../structure.ts";
import { DATA_NOTES } from "./data.ts";
import { AHEAD_YEARS } from "./select.ts";
import { buildCards, evaluateFrames, FRAME_HIT_RATE, FRAMES, frameCardsOf, renderCard, surveyAxesOf } from "./index.ts";

type Stem = Parameters<typeof getTenGod>[0];
type Branch = Parameters<typeof getBranchTenGod>[1];
const REF = { year: 2026, month: 10 };

const make = (y: number, m: number, d: number, time: string | null, gender: "male" | "female" | null): SajuOk => {
  const s = calculateSaju({ year: y, month: m, day: d, calendar: "solar", isLeapMonth: false, birthTime: time, ...(gender ? { gender } : {}) });
  assert.equal(s.status, "ok");
  return s as SajuOk;
};

/** 고정 가상 인물 다섯 — 출생 날짜는 설명을 위한 임의 값이고 실제 사람이 아니다(응답 축은 미리 정한 값) */
const PEOPLE = [
  { n: "A", saju: make(1979, 12, 8, "09:30", "male"), survey: { anxiety: "high" } as Record<string, "high" | "low"> },
  { n: "B", saju: make(1984, 5, 21, "14:10", "female"), survey: { avoidance: "high", caution: "high" } as Record<string, "high" | "low"> },
  { n: "C", saju: make(1991, 9, 3, null, "female"), survey: { novelty: "high", caution: "low" } as Record<string, "high" | "low"> },
  { n: "D", saju: make(1996, 2, 14, "06:20", "male"), survey: { anxiety: "low", avoidance: "low", persistence: "high" } as Record<string, "high" | "low"> },
  { n: "E", saju: make(2001, 7, 27, "18:50", "female"), survey: { sensitivity: "high", jp: "high" } as Record<string, "high" | "low"> },
];

let seed = 20261018;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const randomCharts = (n: number): SajuOk[] => {
  const out: SajuOk[] = [];
  while (out.length < n) {
    const y = 1960 + Math.floor(rnd() * 47), m = 1 + Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 28);
    out.push(make(y, m, d, rnd() < 0.2 ? null : "12:00", rnd() < 0.5 ? "female" : "male"));
  }
  return out;
};
const SAMPLE = randomCharts(400);

// ───────────── 목록 · 내용 ─────────────

test("프레임 20개: 연애 6 · 재물 8 · 과거 회고 6, ID는 겹치지 않고 명중률 표에 모두 있다", () => {
  assert.equal(FRAMES.length, 20);
  assert.equal(new Set(FRAMES.map((f) => f.id)).size, 20);
  assert.deepEqual(["love", "wealth", "past"].map((a) => FRAMES.filter((f) => f.area === a).length), [6, 8, 6]);
  for (const f of FRAMES) assert.ok(f.id in FRAME_HIT_RATE, `${f.id}: 명중률 표에 없음`);
});

const SENTENCE_END = /(요|다|죠|니다)\s*$/;
const FORBIDDEN = /격국|용신|희신|기신|신살|십이운성|사망|이혼|폭력|학대|질병|파산|반드시|틀림없이|확률|%/;

test("프레임 내용: 질문 · 전통 해석 · 두 얼굴 · 과거 장면 · 현재 · 미래 · 설문 연결 · 적용 제한이 모두 있고, 키워드는 문장이 아니며 금지 어휘가 없다", () => {
  for (const f of FRAMES) {
    assert.ok(f.question.length > 10, `${f.id}: 질문`);
    assert.ok(f.tradition.length > 20, `${f.id}: 전통 해석`);
    assert.ok(f.meaning.length >= 2 && f.meaning.length <= 8, `${f.id}: 의미 키워드 2~8개`);
    for (const faces of [f.faces, ...Object.values(f.facesBy ?? {})]) {
      assert.ok(faces.bright.length >= 2 && faces.hard.length >= 2, `${f.id}: 좋은 면 · 어려운 면 후보가 각각 둘 이상`);
    }
    assert.ok(f.pastScenes.length >= 1 && f.present.length >= 1 && f.future.length >= 1, `${f.id}: 과거 · 현재 · 미래`);
    assert.ok(f.hooks.length >= 1, `${f.id}: 설문 연결`);
    assert.ok(f.limits.length >= 1 && f.overlaps.length >= 1, `${f.id}: 적용 제한 · 중복 관계`);
    const keywords = [...f.meaning, ...f.faces.bright, ...f.faces.hard, ...Object.values(f.facesBy ?? {}).flatMap((x) => [...x.bright, ...x.hard]), ...f.pastScenes, ...f.present, ...f.future];
    for (const k of keywords) {
      assert.ok(!SENTENCE_END.test(k), `${f.id}: 키워드가 문장처럼 끝남 — ${k}`);
      assert.ok(k.length <= 36, `${f.id}: 키워드가 너무 김 — ${k}`);
      assert.ok(!FORBIDDEN.test(k), `${f.id}: 금지 어휘 — ${k}`);
    }
    assert.ok(!FORBIDDEN.test(f.tradition), `${f.id}: 전통 해석에 금지 어휘`);
    // 과거 장면은 사건 단정이 아니라 가능성 · 시기 · 순간으로 끝난다
    for (const s of f.pastScenes) assert.match(s, /(가능성|시기|순간)$/, `${f.id}: 과거 장면은 가능성으로 — ${s}`);
    // 시기 프레임은 나이 하한이 있다
    if (f.kind === "timing") assert.ok((f.minAge ?? 0) >= 7, `${f.id}: 시기 프레임의 나이 하한`);
  }
});

// ───────────── 발동 규칙 ─────────────

test("단일 신호 금지: 발동한 프레임은 계산 사실을 둘 이상 갖는다", () => {
  for (const s of SAMPLE.slice(0, 200)) {
    const ev = frameCardsOf(s, { reference: REF }).evaluation;
    for (const h of ev.hits) assert.ok(h.hit.facts.length >= 2, `${h.frame.id}: 사실이 ${h.hit.facts.length}개`);
  }
});

test("응답 불변: 응답을 바꿔도 발동한 프레임 · 시기 · 선택된 이야기는 그대로이고 바뀌는 것은 앞세울 얼굴과 연결 표시뿐이다", () => {
  const variants: Record<string, "high" | "low">[] = [{}, { anxiety: "high", avoidance: "high", caution: "high" }, { anxiety: "low", avoidance: "low", novelty: "high", sensitivity: "high", persistence: "low", jp: "low", ei: "high" }];
  for (const p of PEOPLE) {
    const runs = variants.map((survey) => frameCardsOf(p.saju, { reference: REF, survey }));
    const key = (r: (typeof runs)[number]) =>
      JSON.stringify({
        hits: r.evaluation.hits.map((h) => [h.frame.id, h.hit.facts, (h.hit.instances ?? []).map((i) => i.id)]),
        love: [r.selection.love?.structure?.core.frame.id, r.selection.love?.past?.instance.id, r.selection.love?.ahead?.instance.id],
        wealth: [r.selection.wealth?.structure?.core.frame.id, r.selection.wealth?.past?.instance.id, r.selection.wealth?.ahead?.instance.id],
        past: r.selection.past.picks.map((x) => x.instance.id),
        cards: r.cards.cards.map((c) => [c.id, c.frameIds, c.facts]),
      });
    assert.equal(key(runs[1]), key(runs[0]), `${p.n}: 응답에 따라 사주 근거가 바뀌었다`);
    assert.equal(key(runs[2]), key(runs[0]), `${p.n}: 응답에 따라 사주 근거가 바뀌었다`);
  }
  // 응답이 실제로 바꾸는 것: 앞세우는 얼굴 · 연결 표시
  const b = PEOPLE[1].saju;
  const none = frameCardsOf(b, { reference: REF, survey: {} }).cards.cards.find((c) => c.id === "ch3-love-structure")!;
  const avoid = frameCardsOf(b, { reference: REF, survey: { avoidance: "high" } }).cards.cards.find((c) => c.id === "ch3-love-structure")!;
  assert.equal(none.response, null);
  assert.equal(none.lead, "bright");
  assert.equal(avoid.response?.mode, "match");
  assert.equal(avoid.lead, "hard");
});

test("관련 없는 응답은 억지로 넣지 않는다: 프레임의 설문 연결에 없는 축은 연결 표시가 null이다", () => {
  const c = frameCardsOf(PEOPLE[1].saju, { reference: REF, survey: { ei: "low", tf: "high" } });
  for (const card of c.cards.cards) assert.equal(card.response, null, `${card.id}: 관련 없는 응답을 연결함`);
});

test("성별이 없으면 연애 프레임과 시기 프레임(대운이 없다)은 발동하지 않고 이유를 남긴다 — 성별 없이 읽히는 재물 구조 프레임만 남는다", () => {
  const s = make(1990, 3, 15, "10:00", null);
  const r = frameCardsOf(s, { reference: REF });
  assert.ok(!r.evaluation.hits.some((h) => h.frame.area === "love"));
  assert.ok(r.evaluation.unavailable.some((u) => u.frameId === "L1" && /성별/.test(u.reason)));
  assert.equal(r.selection.love, null);
  assert.ok(r.cards.skipped.some((x) => /성별/.test(x.reason)));
  // 대운은 성별이 있어야 계산되므로 시기 프레임(W8 · R1~R6)도 발동하지 않는다 — 거짓 시기를 만들지 않는다
  assert.ok(r.evaluation.unavailable.some((u) => u.frameId === "W8" && /대운/.test(u.reason)));
  assert.ok(r.evaluation.hits.every((h) => h.frame.kind === "structure" && h.frame.area === "wealth"), "성별 없이 읽히는 것은 재물 구조 프레임뿐");
  assert.deepEqual(r.selection.past.picks, []);
});

test("시각을 모르면 시주를 쓴 사실이 없다", () => {
  for (const s of SAMPLE.filter((x) => x.hourPillarOmitted).slice(0, 80)) {
    const r = frameCardsOf(s, { reference: REF });
    assert.equal(r.ctx.hourKnown, false);
    for (const h of r.evaluation.hits) {
      assert.ok(!h.hit.uses.includes("hour"), `${h.frame.id}: 시주를 사용`);
      for (const f of h.hit.facts) assert.ok(!/시지|시간 /.test(f), `${h.frame.id}: 시주를 말함 — ${f}`);
    }
  }
});

test("절기 경계 · 야자시 관법으로 흔들리는 기둥에 기댄 프레임은 근거에서 빼고 이유를 남긴다", () => {
  const a = frameCardsOf(PEOPLE[0].saju, { reference: REF });
  assert.deepEqual(a.ctx.uncertain, ["hour"]);
  assert.ok(a.evaluation.excluded.length >= 1);
  for (const h of a.evaluation.hits) if (!h.hit.instances) assert.ok(!h.hit.uses.includes("hour"));
});

// ───────────── 과거 · 시기 ─────────────

test("과거 시기는 현재 나이 이전 · 나이 하한 이후이고, 앞으로 시기는 열 해 안이다", () => {
  for (const s of SAMPLE.slice(0, 250)) {
    const r = frameCardsOf(s, { reference: REF });
    const age = r.ctx.age;
    for (const h of r.evaluation.hits) {
      for (const i of h.hit.instances ?? []) {
        if (["R1", "R2", "R3", "R4", "R5", "R6"].includes(h.frame.id)) {
          assert.ok(i.ageFrom >= (h.frame.minAge ?? 0) - 0, `${i.id}: 나이 하한 위반 ${i.ageFrom}`);
          assert.ok(i.ageTo <= age, `${i.id}: 현재 나이를 넘는 과거 ${i.ageTo} > ${age}`);
        }
        if ((h.frame.id === "L6" || h.frame.id === "W8") && i.unit.position === "past") assert.ok(i.ageFrom >= h.frame.minAge!, `${i.id}: 나이 하한 위반`);
      }
    }
    for (const a of [r.selection.love?.ahead, r.selection.wealth?.ahead]) {
      if (!a) continue;
      assert.notEqual(a.instance.unit.position, "past");
      assert.ok(Number(a.instance.unit.from.slice(0, 4)) - REF.year <= AHEAD_YEARS, `앞으로 시기가 너무 멀다: ${a.instance.id}`);
    }
    for (const p of r.selection.past.picks) assert.equal(p.instance.unit.position === "future", false, "과거 회고에 아직 오지 않은 시기");
  }
});

test("같은 시기를 두 장에 쓰지 않는다(연애 · 재물 · 과거 회고 사이)", () => {
  for (const s of SAMPLE.slice(0, 300)) {
    const r = frameCardsOf(s, { reference: REF });
    const used: string[] = [];
    for (const a of [r.selection.love, r.selection.wealth]) {
      if (!a) continue;
      for (const p of [a.past, a.ahead]) if (p) used.push(p.instance.unit.label);
    }
    for (const p of r.selection.past.picks) used.push(p.instance.unit.label);
    assert.equal(new Set(used).size, used.length, `시기가 겹침: ${used.join(", ")}`);
  }
});

test("사주 근거가 없는 과거 회고는 보편 경험으로만 연결하고 사주 기반으로 표시하지 않는다(나이가 어리면 아예 쓰지 않는다)", () => {
  const young = frameCardsOf(make(2008, 6, 10, "10:00", "female"), { reference: REF });
  assert.equal(young.selection.past.basis, "universal");
  assert.deepEqual(young.selection.past.universal, []);
  assert.ok(!young.cards.cards.some((c) => c.chapter === 6), "만 18세에게 지어낸 과거 회고를 쓰지 않는다");
  for (const h of young.evaluation.hits) for (const i of h.hit.instances ?? []) assert.ok(i.ageFrom >= (h.frame.minAge ?? 0));
  const found = SAMPLE.map((s) => frameCardsOf(s, { reference: REF })).find((r) => r.selection.past.basis === "universal" && r.ctx.age >= 20);
  if (found) {
    const card = found.cards.cards.find((c) => c.chapter === 6)!;
    assert.ok(card.past.every((p) => p.basis === "universal"));
    assert.equal(card.trace[0].basis, "universal");
  }
});

// ───────────── 계산값을 다시 세어 맞춘다 ─────────────

const groupOf = (tg: string) => GROUP_OF[tg] as Group;
/** 원국에서 그룹별 자리 수(일간 제외 천간 + 지지 본기) — 프레임 코드와 별개로 센다 */
function recount(s: SajuOk): Record<Group, number> {
  const out: Record<Group, number> = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
  for (const p of s.pillars) {
    if (p.key !== "day") out[groupOf(getTenGod(s.dayMaster.stem as Stem, p.stem as Stem))]++;
    out[groupOf(getBranchTenGod(s.dayMaster.stem as Stem, p.branch as Branch))]++;
  }
  return out;
}
const kindsOf = (a: string, b: string) => branchRelations(a, b).map((r) => r.kind as string);
/** 십성 이름별 자리 수(일간 제외 천간 + 지지 본기) — 프레임 코드와 별개로 센다 */
function recountGods(s: SajuOk): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of s.pillars) {
    if (p.key !== "day") { const g = getTenGod(s.dayMaster.stem as Stem, p.stem as Stem); out[g] = (out[g] ?? 0) + 1; }
    const b = getBranchTenGod(s.dayMaster.stem as Stem, p.branch as Branch);
    out[b] = (out[b] ?? 0) + 1;
  }
  return out;
}
const heOrCh = (k: string[]) => k.some((x) => ["육합", "반합", "충", "형"].includes(x));

test("시기 프레임 L6 · W8: 발동한 시기마다 간지 · 십성 · 합충 관계를 독립 계산으로 다시 맞춘다", () => {
  let checked = 0;
  for (const s of SAMPLE.slice(0, 150)) {
    const r = frameCardsOf(s, { reference: REF });
    const dm = s.dayMaster.stem;
    const dayBranch = s.pillars.find((p) => p.key === "day")!.branch;
    const monthBranch = s.pillars.find((p) => p.key === "month")!.branch;
    const star: Group | null = s.gender === "female" ? "관성" : s.gender === "male" ? "재성" : null;
    for (const h of r.evaluation.hits) {
      if (h.frame.id !== "L6" && h.frame.id !== "W8") continue;
      const target = h.frame.id === "L6" ? star : "재성";
      const against = h.frame.id === "L6" ? dayBranch : monthBranch;
      for (const i of h.hit.instances ?? []) {
        const u = i.unit;
        // 간지: 대운은 엔진의 대운표, 세운은 그 해 한가운데 날짜의 연주
        if (u.kind === "luck") assert.ok(s.luck!.periods.some((p) => p.stem === u.stem && p.branch === u.branch && p.from === u.from && p.to === u.to), `${i.id}: 대운표에 없음`);
        else {
          const y = Number(u.from.slice(0, 4));
          const yp = make(y, 7, 1, "12:00", null).pillars.find((p) => p.key === "year")!;
          assert.deepEqual([u.stem, u.branch], [yp.stem, yp.branch], `${i.id}: 세운 간지`);
          assert.deepEqual([u.stem, u.branch], [yearGanji(y).stem, yearGanji(y).branch]);
        }
        const gs = groupOf(getTenGod(dm as Stem, u.stem as Stem)), gb = groupOf(getBranchTenGod(dm as Stem, u.branch as Branch));
        assert.ok(gs === target || gb === target, `${i.id}: 시기에 ${target}가 없다`);
        assert.ok(heOrCh(kindsOf(u.branch, against)), `${i.id}: 지지 관계가 없다`);
        checked++;
      }
    }
  }
  assert.ok(checked > 200, `확인한 시기 ${checked}개`);
});

test("구조 프레임 L1 · W2 · W4 · W7 · R3: 조건을 다시 세어 발동과 같은지 맞춘다(발동 ⇔ 조건, 흔들리는 기둥이 없을 때)", () => {
  let n = 0;
  for (const s of SAMPLE) {
    const r = frameCardsOf(s, { reference: REF });
    if (r.ctx.uncertain.length) continue;
    const c = recount(s);
    const has = (id: string) => r.evaluation.hits.some((h) => h.frame.id === id);
    assert.equal(has("W2"), c.비겁 >= 3 && c.재성 >= 1 && c.관성 <= 1, `W2 ${JSON.stringify(c)}`);
    assert.equal(has("W7"), c.인성 >= 3 && c.재성 <= 1 && c.식상 <= 1, `W7 ${JSON.stringify(c)}`);
    // W5는 근거가 불분명해(자체조합) 쓰지 않는다 — 조건이 맞아도 발동하지 않는다
    assert.equal(has("W5"), false, `W5 ${JSON.stringify(c)}`);
    if (s.gender) {
      const star: Group = s.gender === "female" ? "관성" : "재성";
      const dayBranch = s.pillars.find((p) => p.key === "day")!.branch;
      const others = s.pillars.filter((p) => p.key !== "day");
      const starOnStem = others.some((p) => groupOf(getTenGod(s.dayMaster.stem as Stem, p.stem as Stem)) === star);
      const rels = others.map((p) => kindsOf(dayBranch, p.branch));
      const he = rels.some((k) => k.includes("육합") || k.includes("반합"));
      const ch = rels.some((k) => k.includes("충") || k.includes("형"));
      assert.equal(has("L1"), starOnStem && he && !ch, "L1");
      assert.equal(has("L3"), ch && c[star] <= 1, "L3");
      const g = recountGods(s);
      const [a, b] = s.gender === "female" ? ["정관", "편관"] : ["정재", "편재"];
      assert.equal(has("L4"), c[star] >= 2 && (g[a] ?? 0) > 0 && (g[b] ?? 0) > 0, "L4");
      const l5 = s.gender === "female" ? (g["상관"] ?? 0) >= 1 && c.관성 >= 1 && c.식상 >= 2 : (g["겁재"] ?? 0) >= 1 && c.비겁 >= 3 && c.재성 >= 1;
      assert.equal(has("L5"), l5, "L5");
    }
    n++;
  }
  assert.ok(n > 300, `검사한 명식 ${n}개`);
});

test("명중률 표: 새로 센 값과 표의 값이 크게 다르지 않다(구조 · 과거 프레임, ±0.10)", () => {
  const rate: Record<string, number> = {};
  const N = SAMPLE.length;
  const rs = SAMPLE.map((s) => frameCardsOf(s, { reference: REF }).evaluation);
  for (const f of FRAMES) rate[f.id] = rs.filter((e) => e.hits.some((h) => h.frame.id === f.id)).length / N;
  // 쓰지 않는 프레임(자체조합 W5 · R1 · R2)은 한 번도 나오지 않는다
  for (const f of FRAMES.filter((x) => x.grade === "자체조합")) assert.equal(rate[f.id], 0, `${f.id}: 쓰지 않는 프레임이 발동함`);
  for (const f of FRAMES.filter((x) => x.grade !== "자체조합")) assert.ok(Math.abs(rate[f.id] - FRAME_HIT_RATE[f.id]) <= 0.1, `${f.id}: 표 ${FRAME_HIT_RATE[f.id]} · 센 값 ${rate[f.id].toFixed(2)}`);
  // 시기 프레임을 뺀 구조 프레임은 거의 모두에게 나오지 않는다(변별력)
  for (const f of FRAMES.filter((x) => x.kind === "structure")) assert.ok(rate[f.id] < 0.6, `${f.id}: 너무 흔함 ${rate[f.id].toFixed(2)}`);
});

// ───────────── 카드 · 추적 · 다양성 ─────────────

test("고정 가상 인물 다섯: 발동 프레임과 선택된 이야기 — 다섯 명의 이야기가 서로 다르다", () => {
  const got = PEOPLE.map((p) => {
    const r = frameCardsOf(p.saju, { reference: REF, survey: p.survey });
    const sel = r.selection;
    return {
      n: p.n,
      hits: r.evaluation.hits.map((h) => h.frame.id).join(","),
      love: [sel.love?.structure?.core.frame.id ?? "-", sel.love?.structure?.side?.frame.id ?? "-", sel.love?.past?.instance.id ?? "-", sel.love?.ahead?.instance.id ?? "-"].join(" "),
      wealth: [sel.wealth?.structure?.core.frame.id ?? "-", sel.wealth?.structure?.side?.frame.id ?? "-", sel.wealth?.past?.instance.id ?? "-", sel.wealth?.ahead?.instance.id ?? "-"].join(" "),
      past: sel.past.picks.map((x) => x.instance.id).join(" + ") || "(보편)",
      cards: r.cards.cards.map((c) => c.id).join(","),
    };
  });
  assert.deepEqual(got, [
    { n: "A", hits: "L6,W8,R4,R5,R6", love: "- - L6:luck:계유 대운 -", wealth: "- - W8:luck:임신 대운 -", past: "R6:갑술 대운", cards: "ch3-love-timing,ch5-wealth-timing,ch6-past" },
    { n: "B", hits: "L2,L3,L6,W1,W8,R4,R5", love: "L3 L2 L6:year:2005년 을유 -", wealth: "W1 - W8:year:2019년 기해 W8:year:2028년 무신", past: "R5:병인 대운", cards: "ch3-love-structure,ch3-love-timing,ch5-wealth-structure,ch5-wealth-timing,ch6-past" },
    { n: "C", hits: "L6,W1,W8,R4,R5,R6", love: "- - L6:year:2012년 임진 -", wealth: "W1 - W8:year:2020년 경자 W8:luck:경자 대운", past: "R4:무술 대운", cards: "ch3-love-timing,ch5-wealth-structure,ch5-wealth-timing,ch6-past" },
    { n: "D", hits: "L2,L4,L6,W1,W8,R3,R4,R5", love: "L4 L2 L6:year:2022년 임인 -", wealth: "W1 - W8:year:2025년 을사 W8:luck:갑오 대운", past: "R3:임진 대운", cards: "ch3-love-structure,ch3-love-timing,ch5-wealth-structure,ch5-wealth-timing,ch6-past" },
    { n: "E", hits: "L4,L6,W3,W8,R3,R5", love: "L4 - L6:luck:정유 대운 L6:year:2027년 정미", wealth: "W3 - W8:year:2023년 계묘 -", past: "R3:무술 대운", cards: "ch3-love-structure,ch3-love-timing,ch5-wealth-structure,ch5-wealth-timing,ch6-past" },
  ]);
  // 다섯 명의 (연애 · 재물 · 과거) 선택이 모두 다르다
  assert.equal(new Set(got.map((g) => `${g.love}|${g.wealth}|${g.past}`)).size, 5);
  // 시각을 모르는 C는 시주 근거가 없고, 시주가 흔들리는 A는 시주에 기댄 프레임을 뺐다
  const c = frameCardsOf(PEOPLE[2].saju, { reference: REF });
  assert.equal(c.ctx.hourKnown, false);
});

test("카드: 근거 추적(규칙 버전 · 프레임 · 계산 사실 · 시기 · 근거 종류)이 모두 있고 시기는 '무렵'으로만 말한다", () => {
  for (const p of PEOPLE) {
    const { cards } = frameCardsOf(p.saju, { reference: REF, survey: p.survey });
    assert.ok(cards.cards.length >= 3, `${p.n}: 카드 ${cards.cards.length}개`);
    for (const card of cards.cards) {
      assert.ok(card.trace.length >= 1);
      for (const t of card.trace) {
        assert.equal(t.ruleVersion, "saju-frames-0.2-draft");
        assert.ok(t.facts.length >= 1 && t.frameId && t.frameName);
        assert.ok(t.basis === "chart" || t.basis === "universal");
        if (t.unit) {
          assert.match(t.unit.ages, /무렵/);
          assert.ok(t.unit.label && t.unit.from && t.unit.to && t.unit.relations);
        }
        if (card.response) assert.ok(t.responseEffect === "얼굴 순서만(앞세운 면)" || t.responseEffect === "차이 설명 표시" || t.responseEffect === "없음");
      }
      for (const t of [...card.past, ...card.future]) if (/만 \d/.test(t.window) || /년 무렵/.test(t.window)) assert.match(t.window, /무렵/);
      // 사람이 읽는 카드에 판정 이름 · 확정 표현이 없다
      assert.ok(!/격국|용신|희신|기신|신살|십이운성/.test(renderCard(card).replace(/적용 제한:.*$/m, "")), `${card.id}: 판정 이름`);
    }
    // 두 얼굴은 항상 둘 다 있다(구조 카드)
    for (const card of cards.cards.filter((c) => c.id.endsWith("structure"))) assert.ok(card.bright.length >= 2 && card.hard.length >= 2);
  }
});

test("근거가 없으면 카드를 만들지 않고 이유를 남긴다(거짓 근거를 만들지 않는다)", () => {
  const r = frameCardsOf(PEOPLE[0].saju, { reference: REF });
  assert.ok(!r.cards.cards.some((c) => c.id === "ch3-love-structure"));
  assert.ok(r.cards.skipped.some((x) => /연애 · 인연의 모양/.test(x.card) && x.reason.length > 5));
  const noLuck = buildCards(r.ctx, { love: null, wealth: null, past: { basis: "chart", picks: [], universal: [] } });
  assert.deepEqual(noLuck.cards, []);
});

test("AI 근거 변환: 근거마다 ID · 사실 · 단서가 있고 판정 이름이 없으며 시기 근거에는 기간과 만 나이 범위가 있다", () => {
  for (const p of PEOPLE) {
    const { evidence: ev } = frameCardsOf(p.saju, { reference: REF, survey: p.survey });
    assert.equal(new Set(ev.map((e) => e.id)).size, ev.length, `${p.n}: ID가 겹침`);
    for (const e of ev) {
      assert.match(e.id, /^saju\.frame\./);
      assert.equal(e.source, "saju");
      assert.ok(e.fact.length > 5 && e.cue.length > 20 && e.topics.length >= 1);
      assert.ok(!/격국|용신|희신|기신|신살|십이운성/.test(e.fact + e.cue));
      assert.notEqual(e.strength, "strong");
      if (/^saju\.frame\.(?:L6|W8|R\d)\./.test(e.id)) {
        assert.ok(e.period && e.ageWindows?.length === 1, `${e.id}: 기간 · 나이 범위`);
        assert.ok(e.ageWindows![0].from <= e.ageWindows![0].to, `${e.id}: 나이 범위 순서`);
      }
    }
    assert.ok(ev.some((e) => e.period), `${p.n}: 시기 근거에 기간이 없다`);
  }
  assert.deepEqual(surveyAxesOf([{ id: "survey.anxiety.high" }, { id: "survey.ei.low" }, { id: "saju.void" }, { id: "self.mbti" }]), { anxiety: "high", ei: "low" });
});


test("다양성: 무작위 명식 400명에서 선택된 이야기 지문(구조 · 과거 시기 · 앞으로 시기)이 거의 겹치지 않는다", () => {
  const rs = SAMPLE.map((s) => frameCardsOf(s, { reference: REF }));
  const sig = (r: (typeof rs)[number], k: "love" | "wealth") => {
    const a = r.selection[k];
    return a ? `${a.structure?.core.frame.id ?? "-"}/${a.past?.instance.id ?? "-"}/${a.ahead?.instance.id ?? "-"}` : "(없음)";
  };
  const same = (arr: string[]) => {
    let e = 0, n = 0;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) { n++; if (arr[i] === arr[j]) e++; }
    return e / n;
  };
  assert.ok(same(rs.map((r) => sig(r, "love"))) < 0.03, "연애 지문이 너무 자주 같다");
  assert.ok(same(rs.map((r) => sig(r, "wealth"))) < 0.03, "재물 지문이 너무 자주 같다");
  assert.ok(same(rs.map((r) => r.selection.past.picks.map((p) => p.instance.id).join("+"))) < 0.03, "과거 회고 지문이 너무 자주 같다");
  const per = rs.map((r) => r.evaluation.hits.length);
  assert.ok(per.reduce((a, b) => a + b, 0) / per.length >= 4, "명식당 평균 프레임이 4개 미만");
  // 같은 입력은 늘 같은 결과
  const again = frameCardsOf(SAMPLE[0], { reference: REF });
  assert.deepEqual(JSON.stringify(again.cards), JSON.stringify(rs[0].cards));
});

test("평가는 순수하다: 같은 계산 결과를 두 번 평가해도 같고 계산 결과를 바꾸지 않는다", () => {
  const s = SAMPLE[3];
  const before = JSON.stringify(s);
  const a = evaluateFrames(frameCardsOf(s, { reference: REF }).ctx);
  const b = evaluateFrames(frameCardsOf(s, { reference: REF }).ctx);
  assert.deepEqual(a.hits.map((h) => h.frame.id), b.hits.map((h) => h.frame.id));
  assert.equal(JSON.stringify(s), before);
});


test("발동 조건 · 쓰는 데이터: 프레임마다 조건 줄이 둘 이상이고 판정 이름이 없으며, 데이터 키는 모두 확보 상태 표(DATA_NOTES)에 있다", () => {
  for (const f of FRAMES) {
    assert.ok(f.condition.length >= 2, `${f.id}: 조건 줄`);
    for (const line of f.condition) assert.ok(!/격국|용신|희신|기신|신살|십이운성/.test(line), `${f.id}: 조건에 계산하지 않은 판정 이름`);
    assert.ok(f.data.length >= 1, `${f.id}: 데이터 키`);
    for (const k of f.data) assert.ok(k in DATA_NOTES, `${f.id}: 알 수 없는 데이터 키 ${k}`);
    if (f.needs.includes("gender")) assert.ok(f.data.includes("gender"), `${f.id}: 성별이 필요한데 데이터에 없음`);
    if (f.needs.includes("luck")) assert.ok(f.data.some((k) => k.startsWith("luck-")), `${f.id}: 대운이 필요한데 데이터에 없음`);
  }
});

test("확보 상태 표: 지난 대운 · 지난 세운은 엔진 ✔이고 AI에는 프레임이 고른 시기만 건네진다(△) — 전체 목록을 건넸다고 적지 않는다", () => {
  assert.equal(DATA_NOTES["luck-past"].engine, "✔");
  assert.equal(DATA_NOTES["luck-past"].ai, "△");
  assert.equal(DATA_NOTES["year-past"].ai, "△");
  assert.match(DATA_NOTES["luck-past"].note, /전체 목록을 건네지는 않는다/);
  // 과거 회고 프레임은 모두 지난 시기 데이터를 쓴다
  for (const f of FRAMES.filter((x) => x.area === "past")) assert.ok(f.data.includes("luck-past"), `${f.id}: 지난 대운을 쓰지 않음`);
});

