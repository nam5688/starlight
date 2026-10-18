// 실행: npm test — 명리 조합 해석 프레임을 story-7 AI 근거에 연결한 것(운영자 2026-10-18)을 확인한다. 새 AI 호출 · DB · 결제 없음.
// 지키는 것: ① 쓰지 않기로 한 프레임(자체조합)은 근거가 되지 않는다 ② 지난 · 지금 · 앞으로의 대운 · 세운이 정확한 만 나이 범위로 전달된다 ③ 응답은 근거의 있고 없음과 fact를 바꾸지 않는다
//           ④ 프레임 이야기는 한 장에만 배정되고 같은 시기가 두 번 쓰이지 않는다 ⑤ 프레임이 없는 곳은 위치와 운으로 읽는 기본 풀이가 대신하고 없는 조합을 꾸미지 않는다
//           ⑥ 만 19세 미만은 배우자 · 결혼 · 연애 풀이가 연령대에 맞게 줄어든다 ⑦ 지난 시기를 사실처럼 쓰거나 근거 밖의 나이를 쓰면 검사가 막는다 ⑧ 다른 형식(story-v1 · reading-v1)의 근거는 그대로다
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPersonas } from "../../../report/ai/compare-personas.ts";
import { buildEvidence } from "../../../report/ai/generator.ts";
import type { Evidence } from "../../../report/evidence.ts";
import { story7Evidence } from "../../../report/reading/story7-evidence.ts";
import { composeMockStory7 } from "../../../report/reading/story7-mock-model.ts";
import { buildStory7UserMessage } from "../../../report/reading/story7-prompt.ts";
import { validateStory7Draft } from "../../../report/reading/story7-validate.ts";
import { stripAllowedAges } from "../../../report/reading/validate.ts";
import type { Story7DraftV1 } from "../../../report/reading/types.ts";
import type { SajuOk } from "../../engine.ts";
import { calculateSaju } from "../../manseryeok-engine.ts";
import { RULE_META } from "../rule-meta.ts";
import { adaptEvidenceForAudience } from "./audience.ts";
import { FRAMES, frameCardsOf, RESPONSE_MARK } from "./index.ts";
import { PAST_TOTAL_MAX } from "./select.ts";

const REF = { year: 2026, month: 10 };
const make = (y: number, m: number, d: number, time: string | null, gender: "male" | "female"): SajuOk => {
  const s = calculateSaju({ year: y, month: m, day: d, calendar: "solar", isLeapMonth: false, birthTime: time, gender });
  assert.equal(s.status, "ok");
  return s as SajuOk;
};
const PEOPLE = [
  { n: "A", saju: make(1979, 12, 8, "09:30", "male") },
  { n: "B", saju: make(1984, 5, 21, "14:10", "female") },
  { n: "C", saju: make(1991, 9, 3, null, "female") },
  { n: "D", saju: make(1996, 2, 14, "06:20", "male") },
  { n: "E", saju: make(2001, 7, 27, "18:50", "female") },
];
let seed = 20261018;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const SAMPLE: SajuOk[] = [];
while (SAMPLE.length < 300) SAMPLE.push(make(1960 + Math.floor(rnd() * 47), 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28), rnd() < 0.2 ? null : "12:00", rnd() < 0.5 ? "female" : "male"));

const ageAt = (by: number, bm: number, y: number, m: number) => y - by - (m < bm ? 1 : 0);

// ───────────── ① 제외한 프레임 ─────────────

test("근거가 불분명한 프레임(자체조합)은 쓰지 않고 이유를 남긴다: W5 · R1 · R2", () => {
  const held = FRAMES.filter((f) => f.grade === "자체조합").map((f) => f.id);
  assert.deepEqual(held, ["W5", "R1", "R2"]);
  for (const f of FRAMES) assert.ok(f.gradeNote.length >= 20, `${f.id}: 근거 수준의 이유`);
  for (const s of SAMPLE.slice(0, 80)) {
    const r = frameCardsOf(s, { reference: REF });
    for (const id of held) {
      assert.ok(!r.evaluation.hits.some((h) => h.frame.id === id), `${id}가 발동함`);
      assert.ok(r.evaluation.held.some((h) => h.frameId === id && /근거가 불분명/.test(h.reason)), `${id}: 제외 사유`);
    }
    assert.ok(!r.evidence.some((e) => /^saju\.frame\.(?:W5|R1|R2)(?:\.|$)/.test(e.id)));
  }
});

// ───────────── ② 정확한 만 나이 범위 ─────────────

test("지난 · 지금 · 앞으로의 대운 · 세운이 정확한 만 나이 범위로 전달된다(출생 연-월과 시기 연-월로 독립 계산)", () => {
  let checked = 0;
  for (const s of SAMPLE) {
    const by = s.solarDate.year, bm = s.solarDate.month;
    const r = frameCardsOf(s, { reference: REF });
    assert.equal(r.ctx.age, ageAt(by, bm, REF.year, REF.month), "현재 만 나이");
    for (const e of r.evidence) {
      if (!e.period || !e.ageWindows) continue;
      const [fy, fm] = [Number(e.period.from.slice(0, 4)), Number(e.period.from.slice(5, 7))];
      const [ty, tm] = [Number(e.period.to.slice(0, 4)), Number(e.period.to.slice(5, 7))];
      const w = e.ageWindows[0];
      const past = /^(?:지난|지금까지 지나온) /.test(e.fact);
      if (!/base-past/.test(e.id)) {
        // 시작 나이는 시기가 시작하는 달의 만 나이(나이 하한 때문에 올라갈 수는 있다), 끝 나이는 시기가 끝나는 달의 만 나이(지난 시기는 지금 나이까지)
        assert.ok(w.from >= ageAt(by, bm, fy, fm), `${e.id}: 시작 ${w.from} < ${ageAt(by, bm, fy, fm)}`);
        assert.equal(w.to, past ? Math.min(ageAt(by, bm, ty, tm), r.ctx.age) : ageAt(by, bm, ty, tm), `${e.id}: 끝 나이`);
        assert.match(e.fact, new RegExp(`만 ${w.from}${w.from === w.to ? "" : `~${w.to}`}세 무렵`), `${e.id}: 사실 문장의 나이 범위`);
      }
      assert.ok(w.from <= w.to && w.to <= r.ctx.age + 20, `${e.id}: 나이 범위`); // 앞으로의 대운은 열 해 안에 시작해 열 해 이어진다
      // 지난 시기는 아직 오지 않은 나이 · 해를 말하지 않는다
      if (past) {
        assert.ok(w.to <= r.ctx.age, `${e.id}: 지난 시기가 지금 나이를 넘음`);
        assert.ok(e.period.to <= `${REF.year}-${String(REF.month).padStart(2, "0")}`, `${e.id}: 지난 시기의 끝이 지금을 넘음`);
      }
      checked++;
    }
  }
  assert.ok(checked > 400, `확인한 시기 근거 ${checked}개`);
});

test("과거 시기 근거는 연애 만 16세 · 재물 만 17세 · 과거 회고 프레임별 나이 하한 이후이다", () => {
  const minAge: Record<string, number> = Object.fromEntries(FRAMES.filter((f) => f.minAge).map((f) => [f.id, f.minAge!]));
  for (const s of SAMPLE) {
    for (const e of frameCardsOf(s, { reference: REF }).evidence) {
      const m = /^saju\.frame\.([LWR]\d)\./.exec(e.id);
      if (!m || !e.ageWindows) continue;
      assert.ok(e.ageWindows[0].from >= (minAge[m[1]] ?? 0), `${e.id}: ${e.ageWindows[0].from} < ${minAge[m[1]]}`);
    }
  }
});

// ───────────── ③ 응답 불변 ─────────────

test("응답을 바꿔도 근거의 ID · 사실 · 시기는 같고 바뀌는 것은 cue 끝의 '응답 연결' 문장뿐이다", () => {
  const sets: Record<string, "high" | "low">[] = [{}, { avoidance: "high" }, { avoidance: "low", anxiety: "high" }, { caution: "high", sensitivity: "high" }, { novelty: "high", persistence: "low" }];
  for (const p of PEOPLE) {
    const base = frameCardsOf(p.saju, { reference: REF, survey: sets[0] }).evidence;
    for (const sv of sets.slice(1)) {
      const other = frameCardsOf(p.saju, { reference: REF, survey: sv }).evidence;
      assert.deepEqual(other.map((e) => e.id), base.map((e) => e.id), `${p.n}: 근거 ID가 응답으로 달라짐`);
      assert.deepEqual(other.map((e) => e.fact), base.map((e) => e.fact), `${p.n}: 사실이 응답으로 달라짐`);
      assert.deepEqual(other.map((e) => e.period), base.map((e) => e.period));
      assert.deepEqual(other.map((e) => e.ageWindows), base.map((e) => e.ageWindows));
      assert.deepEqual(other.map((e) => e.cue.split(RESPONSE_MARK)[0]), base.map((e) => e.cue.split(RESPONSE_MARK)[0]), `${p.n}: 응답 연결 앞의 단서가 달라짐`);
    }
  }
});

// ───────────── ④ 한 장에만 배정 · 시기 중복 없음 ─────────────

test("프레임 근거는 한 장에만 배정되고(3 연애 · 5 재물 · 6 시기) 같은 시기 · 같은 사실이 두 번 건네지지 않는다", () => {
  for (const s of SAMPLE) {
    const evidence = frameCardsOf(s, { reference: REF }).evidence;
    const mine = story7Evidence(evidence);
    const frameIds = evidence.map((e) => e.id).filter((id) => id.startsWith("saju.frame."));
    for (const id of frameIds) {
      const owners = Object.entries(mine.saju).filter(([, ids]) => ids.includes(id)).map(([no]) => Number(no));
      assert.equal(owners.length, 1, `${id}: 소유한 장 ${owners.join(",")}`);
      const expected = /^saju\.frame\.(?:L[1-5]|base-love|base-peer|audience)/.test(id) ? 3 : /^saju\.frame\.(?:W[1-7]|base-wealth)/.test(id) ? 5 : 6;
      assert.equal(owners[0], expected, `${id}: 장 배정`);
    }
    // 같은 시기(세운 연도 · 대운 간지)는 한 근거에만 — 연애 · 재물 · 과거 회고가 같은 시기를 두 번 쓰지 않는다
    const slugs = frameIds.map((id) => /^saju\.frame\.[LWR]\d\.(.+)$/.exec(id)?.[1]).filter((x): x is string => Boolean(x));
    assert.equal(new Set(slugs).size, slugs.length, `같은 시기가 두 번: ${slugs.join(",")}`);
    const facts = evidence.filter((e) => e.id.startsWith("saju.frame.")).map((e) => e.fact);
    assert.equal(new Set(facts).size, facts.length, "같은 사실이 두 번 건네짐");
  }
});

// ───────────── ⑤ 기본 풀이 ─────────────

test("프레임이 없는 곳은 기본 풀이 근거가 대신하고, 있는 곳에는 만들지 않으며, 없는 조합을 꾸미지 않는다", () => {
  let love = 0, wealth = 0, past = 0;
  const loveFacts = new Set<string>();
  for (const s of SAMPLE) {
    const r = frameCardsOf(s, { reference: REF });
    const ids = r.evidence.map((e) => e.id);
    const hasLoveStructure = ids.some((id) => /^saju\.frame\.L[1-5]$/.test(id));
    const hasWealthStructure = ids.some((id) => /^saju\.frame\.W[1-7]$/.test(id));
    assert.equal(ids.includes("saju.frame.base-love"), !hasLoveStructure, "연애 기본 풀이는 구조 프레임이 없을 때만");
    assert.equal(ids.includes("saju.frame.base-wealth"), !hasWealthStructure, "재물 기본 풀이는 구조 프레임이 없을 때만");
    const pastPicks = r.selection.past.picks.length;
    assert.equal(ids.includes("saju.frame.base-past"), pastPicks < 2 && r.ctx.luck.some((u) => u.position === "past" && u.ageTo >= 7), "지난 대운 개요는 과거 회고 시기가 둘 미만일 때");
    for (const e of r.evidence.filter((x) => x.id.startsWith("saju.frame.base-"))) {
      assert.equal(e.strength, "weak");
      assert.match(e.cue, /발동하지 않았어요|하나만 발동했어요/, `${e.id}: 조합이 없다는 사실을 밝힌다`);
      assert.ok(!/격국|용신|희신|기신|신살/.test(e.fact + e.cue));
    }
    if (!hasLoveStructure) { love++; loveFacts.add(r.evidence.find((e) => e.id === "saju.frame.base-love")!.fact); }
    if (!hasWealthStructure) wealth++;
    if (ids.includes("saju.frame.base-past")) past++;
  }
  assert.ok(love > 20 && wealth > 20, `기본 풀이를 쓴 명식: 연애 ${love} · 재물 ${wealth} · 과거 ${past}`);
  // 기본 풀이도 명식마다 다르다(위치 · 일지 · 대운이 달라서)
  assert.ok(loveFacts.size / love > 0.8, `연애 기본 풀이 사실의 다양성 ${loveFacts.size}/${love}`);
});

// ───────────── ⑥ 미성년 분기 ─────────────

const MINOR = {
  child: make(2012, 3, 3, "10:00", "male"),
  teen: make(2009, 3, 3, "10:00", "female"),
};

test("읽는 사람의 연령대: 만 19세 이상 adult · 만 16~18세 teen · 만 16세 미만 child", () => {
  const ages = (s: SajuOk) => frameCardsOf(s, { reference: REF }).ctx;
  assert.equal(ages(MINOR.child).audience, "child");
  assert.equal(ages(MINOR.teen).audience, "teen");
  assert.equal(ages(make(2007, 10, 1, null, "male")).audience, "adult"); // 만 19세 생일이 지난 달
  assert.equal(ages(make(2007, 11, 1, null, "male")).audience, "teen"); // 만 18세
  assert.equal(ages(make(2010, 10, 1, null, "male")).audience, "teen"); // 만 16세
  assert.equal(ages(make(2010, 11, 1, null, "male")).audience, "child"); // 만 15세
});

test("만 16세 미만: 연애 · 재물 프레임 없이 또래 관계 기본 풀이와 연령대 안내만 건네고 배우자 · 결혼 · 연애 말이 근거에 없다", () => {
  const r = frameCardsOf(MINOR.child, { reference: REF });
  assert.ok(!r.evidence.some((e) => /^saju\.frame\.(?:L|W)\d/.test(e.id)), "연애 · 재물 프레임이 건네짐");
  assert.ok(r.evidence.some((e) => e.id === "saju.frame.audience.child"));
  assert.ok(r.evidence.some((e) => e.id === "saju.frame.base-peer"));
  assert.ok(!r.evidence.some((e) => e.id === "saju.frame.base-love" || e.id === "saju.frame.base-wealth"));
  assert.equal(r.selection.love, null);
  assert.equal(r.selection.wealth, null);
});

test("만 16~18세: 연애 구조 L2~L5만(결혼 · 배우자 확정 풀이와 인연 시기 풀이 제한), 배우자 말을 가까운 관계 말로 바꾼다", () => {
  let any = 0;
  for (const [y, m, d, g] of [[2009, 3, 3, "female"], [2009, 8, 19, "male"], [2008, 12, 30, "female"], [2009, 5, 5, "male"], [2008, 11, 11, "male"], [2009, 1, 9, "female"]] as const) {
    const s = make(y, m, d, "10:00", g);
    const r = frameCardsOf(s, { reference: REF });
    assert.equal(r.ctx.audience, "teen");
    assert.ok(r.evidence.some((e) => e.id === "saju.frame.audience.teen"));
    assert.ok(!r.evidence.some((e) => /^saju\.frame\.(?:L1|L6)/.test(e.id)), "L1 · L6은 만 19세 이상만");
    for (const e of r.evidence.filter((x) => !x.id.startsWith("saju.frame.audience."))) assert.ok(!/배우자|결혼|연인/.test(e.fact + e.cue), `${e.id}: 어른의 관계 말`); // 연령대 안내는 쓰지 말 것을 알리는 말이라 제외
    any += r.evidence.filter((e) => /^saju\.frame\.L[2-5]$/.test(e.id)).length;
  }
  assert.ok(any > 0, "만 16~18세에게 건네진 연애 구조 프레임이 하나도 없다");
});

test("만 19세 미만의 기존 근거에서 배우자 별 · 인연의 경향(나이 방향)은 빠지고 배우자 말은 가까운 관계 말로 바뀐다 · 성인은 그대로", () => {
  const p = buildPersonas(10)[1];
  for (const [label, saju] of [["child", MINOR.child], ["teen", MINOR.teen]] as const) {
    const ev = buildEvidence({ ...p.input, saju, gender: label === "child" ? "male" : "female" }, REF, { fortune: true });
    assert.ok(!ev.some((e) => e.id === "saju.spouse-star" || e.id === "saju.partner"), `${label}: 배우자 별 · 인연의 경향이 남음`);
    for (const e of ev.filter((x) => !x.id.startsWith("saju.frame.audience."))) assert.ok(!/배우자|결혼|연인/.test(e.fact + e.cue), `${label} ${e.id}: ${(e.fact + e.cue).match(/배우자|결혼|연인/)?.[0]}`);
    assert.ok(ev.some((e) => e.id === "saju.spouse-palace"), `${label}: 일지(가까운 관계의 자리) 풀이는 남는다`);
  }
  const adult = buildEvidence(p.input, REF, { fortune: true });
  assert.ok(adult.some((e) => e.id === "saju.partner") && adult.some((e) => e.id === "saju.spouse-star"));
  assert.deepEqual(adaptEvidenceForAudience(adult, "adult"), adult);
});

test("만 19세 미만도 모의 작성기 글이 형식 검사를 통과하고(장 배정이 비지 않는다), 어른의 관계 말을 쓰면 막힌다", () => {
  const p = buildPersonas(10)[1];
  for (const [label, saju, gender] of [["child", MINOR.child, "male"], ["teen", MINOR.teen, "female"]] as const) {
    const ev = buildEvidence({ ...p.input, saju, gender }, REF, { fortune: true });
    const draft = composeMockStory7(buildStory7UserMessage(ev, "2026-10-18", null));
    const ok = validateStory7Draft(draft, ev);
    assert.ok(ok.ok, `${label}: ${ok.ok ? "" : ok.errors.join(" / ")}`);
    const bad: Story7DraftV1 = JSON.parse(JSON.stringify(draft));
    bad.sections[2].paragraphs![0] = "[모의 생성] 이 사람은 언젠가 결혼해서 좋은 배우자를 만날 가능성이 있어요. 가까운 사이에서 마음을 천천히 여는 편이라 오래 이어질 수 있어요.";
    const res = validateStory7Draft(bad, ev);
    assert.ok(!res.ok && res.errors.some((e) => /만 19세 미만/.test(e)), `${label}: 어른의 관계 말이 통과함`);
  }
});

// ───────────── ⑦ 검사 규칙 ─────────────

test("근거가 허용한 나이 범위 안의 표현만 지우고 범위 밖의 나이 · 우리말 나이는 남긴다", () => {
  const w = [{ from: 21, to: 25 }];
  assert.equal(stripAllowedAges("만 22~24세 무렵 이야기예요", w).trim(), "무렵 이야기예요");
  assert.match(stripAllowedAges("만 30세 무렵 이야기예요", w), /30세/);
  assert.match(stripAllowedAges("만 22~30세 무렵", w), /30세/);
  assert.equal(stripAllowedAges("20대 초반 무렵", w).trim(), "무렵"); // 20대 초반(20~23)이 21~25와 겹침
  assert.match(stripAllowedAges("30대 중반 무렵", w), /30대/);
  assert.match(stripAllowedAges("스물두 살 무렵", w), /스물/);
});

function sampleWithPast() {
  for (const p of buildPersonas(10)) {
    const ev = buildEvidence(p.input, REF, { fortune: true });
    const past = ev.find((e) => e.ageWindows && /^saju\.frame\.(?:L6|W8|R\d)\./.test(e.id) && /^지난 /.test(e.fact));
    if (past) return { ev, past, draft: composeMockStory7(buildStory7UserMessage(ev, "2026-10-18", null)) };
  }
  throw new Error("지난 시기 근거가 있는 인물이 없다");
}

test("6번 장에서만 근거의 나이 범위 안에서 나이를 말할 수 있고, 범위 밖이거나 다른 장이면 막힌다", () => {
  const { ev, past, draft } = sampleWithPast();
  const w = past.ageWindows![0];
  const withText = (no: number, text: string) => {
    const d: Story7DraftV1 = JSON.parse(JSON.stringify(draft));
    const s = d.sections.find((x) => x.no === no)!;
    if (s.parts) s.parts[0].paragraphs[0] = text;
    else s.paragraphs![0] = text;
    return d;
  };
  const inside = `[모의 생성] 만 ${w.from}~${w.to}세 무렵에는 이 주제가 두드러졌을 수 있어요. 그때 마음이 흔들렸을 가능성이 있어요. 전통에서는 이런 시기를 그렇게 읽어요.`;
  const r6 = validateStory7Draft(withText(6, inside), ev);
  assert.ok(!r6.ok === false || r6.errors.every((e) => !/나이/.test(e)), `범위 안의 나이가 막힘: ${r6.ok ? "" : r6.errors.join(" / ")}`);
  const outside = `[모의 생성] 만 ${w.to + 20}세 무렵에는 이 주제가 두드러졌을 수 있어요. 그때 마음이 흔들렸을 가능성이 있어요. 전통에서는 이런 시기를 그렇게 읽어요.`;
  const r6b = validateStory7Draft(withText(6, outside), ev);
  assert.ok(!r6b.ok && r6b.errors.some((e) => /나이 범위 밖/.test(e)), "범위 밖의 나이가 통과함");
  const r3 = validateStory7Draft(withText(3, inside), ev);
  assert.ok(!r3.ok && r3.errors.some((e) => /나이를 쓰지 않습니다/.test(e)), "3번 장의 나이가 통과함");
});

test("지난 시기에 있었던 일을 사실처럼 쓰면 막히고 가능성으로 쓰면 통과한다", () => {
  const { ev, past, draft } = sampleWithPast();
  const w = past.ageWindows![0];
  const withText = (text: string) => {
    const d: Story7DraftV1 = JSON.parse(JSON.stringify(draft));
    d.sections.find((x) => x.no === 6)!.paragraphs![0] = text;
    return d;
  };
  const fact = validateStory7Draft(withText(`[모의 생성] 만 ${w.from}세 무렵 연인과 헤어졌어요. 그 뒤로 한동안 거리를 두고 지냈어요. 전통 해석과는 별개로 이 시기가 마음에 남았어요.`), ev);
  assert.ok(!fact.ok && fact.errors.some((e) => /실제로 있었던 일은 입력받은 것이 없어요/.test(e)), "사실처럼 쓴 지난 일이 통과함");
  const maybe = validateStory7Draft(withText(`[모의 생성] 만 ${w.from}세 무렵에는 관계에서 헤어졌을 수 있어요. 그렇게 읽히는 시기라는 뜻이고 실제로 어땠는지는 알 수 없어요. 전통에서는 이런 시기를 이렇게 읽어요.`), ev);
  assert.ok(maybe.ok || maybe.errors.every((e) => !/실제로 있었던 일은 입력받은 것이 없어요/.test(e)), `가능성 문장이 막힘: ${maybe.ok ? "" : maybe.errors.join(" / ")}`);
});

// ───────────── ⑧ 연결 범위 · 규칙 이력 ─────────────

test("프레임 근거는 story-7(fortune 옵션)에만 연결된다 — 다른 형식의 근거 목록은 그대로다", () => {
  for (const p of buildPersonas(4)) {
    const plain = buildEvidence(p.input, REF);
    assert.ok(!plain.some((e) => e.id.startsWith("saju.frame.")), "다른 형식에 프레임 근거가 들어감");
    assert.ok(!plain.some((e) => e.ageWindows), "다른 형식에 나이 범위가 들어감");
    const story7 = buildEvidence(p.input, REF, { fortune: true });
    assert.ok(story7.some((e) => e.id.startsWith("saju.frame.")));
    // story-7 근거는 이전 근거에 더하기만 했다(adult)
    assert.deepEqual(story7.filter((e) => !e.id.startsWith("saju.frame.")).map((e) => e.id), buildEvidence(p.input, REF, { fortune: true }).filter((e) => !e.id.startsWith("saju.frame.")).map((e) => e.id));
    for (const e of plain) assert.ok(story7.some((x) => x.id === e.id), `${e.id}가 story-7 근거에서 빠짐`);
  }
});

test("프레임 근거 ID는 모두 규칙 이력 하나에 대응한다(만 19세 미만 포함)", () => {
  const ids = new Set<string>();
  for (const s of [...SAMPLE.slice(0, 120), MINOR.child, MINOR.teen]) for (const e of frameCardsOf(s, { reference: REF }).evidence) ids.add(e.id);
  for (const s of SAMPLE.slice(0, 30)) for (const e of frameCardsOf(s, { reference: { year: s.solarDate.year + 17, month: 6 } }).evidence) ids.add(e.id);
  for (const s of SAMPLE.slice(0, 30)) for (const e of frameCardsOf(s, { reference: { year: s.solarDate.year + 13, month: 6 } }).evidence) ids.add(e.id);
  assert.ok(ids.size > 30);
  for (const id of ids) {
    const hits = RULE_META.filter((r) => r.match.test(id));
    assert.equal(hits.length, 1, `${id}: 규칙 ${hits.map((h) => h.id).join(",")}`);
  }
  const used = new Set([...ids].map((id) => RULE_META.find((r) => r.match.test(id))!.id));
  for (const rule of ["frame-structure", "frame-timing", "frame-base", "frame-audience"]) assert.ok(used.has(rule), `${rule}: 나오지 않는 규칙`);
});

test("근거 목록 크기: 프레임 근거는 명식당 많아야 열 몇 개이고 근거 문장은 한 개에 1,200자를 넘지 않는다", () => {
  let max = 0;
  let longest = 0;
  for (const s of SAMPLE) {
    const ev: Evidence[] = frameCardsOf(s, { reference: REF }).evidence;
    max = Math.max(max, ev.length);
    for (const e of ev) longest = Math.max(longest, e.fact.length + e.cue.length);
  }
  assert.ok(max <= 14, `프레임 근거 최대 ${max}개`);
  assert.ok(longest <= 1200, `가장 긴 근거 ${longest}자`);
});

test("과거로 말하는 시기 근거는 명식당 상한(PAST_TOTAL_MAX)을 넘지 않는다", () => {
  assert.equal(PAST_TOTAL_MAX, 3);
  for (const s of SAMPLE) {
    const r = frameCardsOf(s, { reference: REF });
    const past = r.evidence.filter((e) => /^saju\.frame\.(?:L6|W8|R\d)\./.test(e.id) && /^(?:지난|지금까지 지나온) /.test(e.fact));
    assert.ok(past.length <= PAST_TOTAL_MAX, `${past.length}개: ${past.map((e) => e.id).join(", ")}`);
  }
});
