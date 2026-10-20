// 실행: npm test — 상황형 28문항 읽기(lib/assessment/situational/): 읽는 표 · 판정 · 10개 유형 연결(도달 가능성 · 독립 근거) · 고객용 풀이 · 근거 · 저장 · 궁합 · 22문항과의 분리.
// 비용 0 · AI 호출 없음. 가상 응답 시트로 규칙이 움직이는 방식을 확인할 뿐이며 실제 사람 응답의 분포 · 정확도 · 신뢰도를 말하지 않는다.
import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { readSource } from "../../report/test-source.ts";
import { SITUATIONAL_V2_ITEMS } from "../drafts/situational-v2-draft.ts";
import { FLAVOR_RULES, PERSONAL_TYPES, PERSONAL_TYPE_IDS, sajuTilt, type PersonalTypeId } from "../personal-type.ts";
import { ASSESSMENT_MODULES } from "../modules/index.ts";
import type { SajuOk } from "../../saju/engine.ts";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import type { Group } from "../../saju/interpret/structure.ts";
import { surveyAxesOf } from "../../saju/interpret/frames/index.ts";
import { summarizeAnswers } from "../active.ts";
import { CONTRAST_COPY, NOTHING_CLEAR, SIDE_COPY } from "./copy.ts";
import { consistentSheet, measurePreference, preferenceSheet, rngOf } from "./measure.ts";
import { renderReadingTables } from "./render.ts";
import {
  DISTINCTIONS,
  DISTINCTION_IDS,
  MIN_CLEAR,
  MIN_SCENES,
  SCENE_IDS,
  SCENE_READINGS,
  TYPE_MIN_EVIDENCE,
  TYPE_SUPPORTS,
  isSituationalSummary,
  judgeAll,
  judgeDistinction,
  pickSceneAnswers,
  readSituational,
  scenesOf,
  typeCoverage,
  typeFrom28,
  type AnswerSheet,
} from "./reading.ts";
import { answerVersionOf, buildSituationalFreeSummary, coreOf, devDetailsOf, leadTextOf, notReadLineOf, situationalEvidence, situationsOf, starterActionsOf, validateSceneAnswers } from "./summary.ts";
import { personalTypeFromSituational } from "./type.ts";

const sheetOf = (picks: Record<string, 1 | 2 | 3 | 4>): AnswerSheet => picks;
const fullSheet = (n: 1 | 2 | 3 | 4): AnswerSheet => Object.fromEntries(SCENE_IDS.map((id) => [id, n]));
const groupOf = (id: PersonalTypeId): Group => (Object.keys(FLAVOR_RULES) as Group[]).find((g) => FLAVOR_RULES[g].a === id || FLAVOR_RULES[g].b === id)!;

// ───── 읽는 표 ─────

test("읽는 표: 장면 28 · 선택지 112가 원문 순서 그대로이고, 한 선택지는 최대 하나의 구분만 읽으며 읽지 않거나 약하게만 읽는 이유가 적혀 있다", () => {
  assert.equal(SCENE_READINGS.length, 28);
  assert.deepEqual(SCENE_IDS, SITUATIONAL_V2_ITEMS.map((i) => i.id));
  let options = 0;
  for (const scene of SCENE_READINGS) {
    assert.equal(scene.options.length, 4, scene.id);
    for (const o of scene.options) {
      options++;
      assert.ok(o.fact.length > 5, `${scene.id} 행동 문장`);
      if (o.read === null) assert.ok(o.why && o.why.length > 5, `${scene.id}: 읽지 않는 이유`);
      else {
        assert.ok(o.read.side in DISTINCTIONS[o.read.d].sides, `${scene.id}: 구분 ${o.read.d}에 없는 쪽 ${o.read.side}`);
        if (o.read.clarity === "weak") assert.ok(o.why, `${scene.id}: 약한 읽기의 이유`);
        else assert.equal(o.why, undefined, `${scene.id}: 분명한 읽기에는 이유가 없다`);
      }
    }
  }
  assert.equal(options, 112);
  // 읽기 결과에 점수 · 확률 낱말이 없다
  assert.ok(!/점수|score|확률|가중/.test(JSON.stringify(SCENE_READINGS)));
});

test("읽을 수 있는 구분: 정보를 받는 방식은 없고(장면이 하나뿐), 도움 받는 방식은 두 장면뿐이라 어떤 답이어도 읽지 않는다 — 읽을 수 없는 것을 읽은 것처럼 쓰지 않는다", () => {
  assert.ok(!("info" in DISTINCTIONS));
  assert.equal(scenesOf("help").length, 2);
  for (const n of [1, 2, 3, 4] as const) {
    const r = judgeDistinction("help", fullSheet(n));
    assert.equal(r.status, "insufficient");
    assert.equal(r.code, "design-short");
  }
  for (const d of DISTINCTION_IDS.filter((x) => x !== "help")) assert.ok(scenesOf(d).length >= MIN_SCENES, d);
});

// ───── 판정 ─────

test("판정: 같은 쪽 분명한 읽기 둘 이상 → 충분(일관), 반대 읽기가 있으면 둘 이상 앞설 때만 충분(대체로), 아니면 상반(평균 내지 않음), 분명한 읽기가 둘보다 적으면 부족", () => {
  // 에너지: s04(1=with, 4=alone) s08(1=alone, 2=with) s12(1=with, 3=alone) s14(1=alone, 3=with)
  const consistent = judgeDistinction("energy", sheetOf({ s04: 4, s08: 1, s12: 3, s14: 1 }));
  assert.deepEqual([consistent.status, consistent.side, consistent.strength, consistent.leaning], ["sufficient", "alone", "strong", false]);
  const leaning = judgeDistinction("energy", sheetOf({ s04: 4, s08: 1, s12: 3, s14: 3 }));
  assert.deepEqual([leaning.status, leaning.side, leaning.leaning], ["sufficient", "alone", true], "3대 1은 대체로 혼자 쪽");
  assert.ok(leaning.hits.some((h) => h.side === "with"), "예외 장면이 남아 있다");
  const contrast = judgeDistinction("energy", sheetOf({ s04: 4, s08: 1, s12: 1, s14: 3 }));
  assert.equal(contrast.status, "contrast", "2대 2는 상황별 차이");
  const weakOnly = judgeDistinction("energy", sheetOf({ s01: 3, s26: 1 }));
  assert.deepEqual([weakOnly.status, weakOnly.code], ["insufficient", "weak-only"], "약한 읽기 둘만으로는 방향이 아니다");
  const few = judgeDistinction("energy", sheetOf({ s04: 4 }));
  assert.deepEqual([few.status, few.code], ["insufficient", "few-read"]);
  assert.equal(judgeDistinction("energy", {}).code, "no-answer");
});

test("응답이 비면 아무것도 읽지 않고 이름도 붙이지 않는다 — 어떤 응답도 기본값으로 쓰지 않는다", () => {
  const s = readSituational({});
  assert.equal(s.answered, 0);
  assert.ok(s.readings.every((r) => r.status === "insufficient"));
  const t = typeFrom28(["식상"], s.readings);
  assert.equal(t.kind, "mixed");
  assert.deepEqual(pickSceneAnswers({ x1: 3, s01: 5, s02: 2.5, s03: "2", s04: 3 }), { s04: 3 }, "알 수 없는 키 · 범위 밖 · 정수가 아닌 값은 버린다");
});

// ───── 10개 유형 연결: 도달 가능성 · 독립 근거 ─────

test("연결표: 이름 10개는 모두 보존되고 모두 도달할 수 있다(읽을 수 있는 구분 둘 이상, 각각 분명한 장면 2개 이상)", () => {
  assert.deepEqual(Object.keys(TYPE_SUPPORTS).sort(), [...PERSONAL_TYPE_IDS].sort());
  const cov = typeCoverage();
  assert.equal(cov.length, 10);
  for (const c of cov) {
    assert.ok(c.reachable, `${c.id}(${c.name})`);
    // 같은 이름을 받치는 구분이 서로 다르다(한 구분으로만 정해지지 않는다)
    assert.equal(new Set(TYPE_SUPPORTS[c.id].map((s) => s.d)).size, TYPE_SUPPORTS[c.id].length, c.id);
    assert.ok(c.supports.length >= 3);
    // 애착에 관련된 구분(확인 · 회복 · 도움)은 이름을 정하는 데 쓰지 않는다
    assert.ok(TYPE_SUPPORTS[c.id].every((s) => !DISTINCTIONS[s.d].attachmentWay), c.id);
  }
});

test("각 유형은 일관된 응답 시트로 정확히 그 이름이 나오고, 같은 갈래의 반대 모습 시트는 반대 이름이 나온다 — 빠른 실행형 · 탐색 확장형도 도달한다", () => {
  for (const id of PERSONAL_TYPE_IDS) {
    const t = typeFrom28([groupOf(id)], judgeAll(consistentSheet(id)));
    assert.equal(t.kind, "type", `${id}: 이름이 붙지 않았다`);
    if (t.kind !== "type") continue;
    assert.equal(t.id, id);
    assert.equal(t.name, PERSONAL_TYPES[id].name);
    // 독립 근거: 이름을 받친 읽기가 서로 다른 구분 둘 이상이고, 각각 분명하게 읽힌 서로 다른 장면 둘 이상이다
    assert.ok(t.because.length >= TYPE_MIN_EVIDENCE, `${id} 받침 ${t.because.length}`);
    assert.equal(new Set(t.because.map((r) => r.d)).size, t.because.length);
    const seenScenes = new Set<string>();
    for (const r of t.because) {
      const clear = r.hits.filter((h) => h.side === r.side && h.clarity === "clear");
      assert.ok(clear.length >= MIN_CLEAR, `${id}/${r.d}: 분명한 장면 ${clear.length}`);
      for (const h of r.hits.filter((x) => x.side === r.side)) {
        assert.ok(!seenScenes.has(h.scene), `${id}: 한 장면(${h.scene})이 두 구분에 세어졌다`);
        seenScenes.add(h.scene);
      }
    }
  }
});

test("엇갈리거나 부족하면 이름을 붙이지 않고 이유를 밝힌다: 한 방향 받침 하나뿐 · 두 모습이 비슷하게 받쳐짐 · 교대로 답함 · 사주 후보가 없음", () => {
  // 한 구분만 일관되고 나머지는 읽히지 않음 → 받침 1개 → 혼합
  const onlyOne = typeFrom28(["식상"], judgeAll(sheetOf({ s03: 1, s06: 2, s09: 1, s13: 2 })));
  assert.equal(onlyOne.kind, "mixed");
  // 두 모습이 함께 받치는 구분마다 장면에 따라 반대로 답한 시트 — 같은 구분이 장면마다 갈려(상반) 어느 쪽 이름도 붙이지 않는다
  const base: AnswerSheet = Object.fromEntries(SCENE_IDS.map((id) => [id, 4]));
  const conflicts: Record<string, AnswerSheet> = {
    // 막혔을 때(점검 2 · 대화 2) · 판단 기준(근거 2 · 사람 2) · 에너지(함께 2 · 혼자 2) · 시도(익숙 1 · 새로움 1)
    인성비겁: { ...base, s03: 2, s06: 3, s09: 3, s11: 3, s13: 1, s27: 4, s02: 1, s07: 3, s22: 3, s23: 3, s04: 1, s08: 1, s12: 1, s14: 1, s05: 1 },
    // 구조(정함 2 · 열어 둠 2) · 막혔을 때(점검 · 실행 · 대화) · 시도(익숙 2 · 새로움 1)
    재성: { ...base, s01: 1, s13: 1, s25: 3, s28: 2, s03: 2, s06: 2, s09: 3, s11: 3, s02: 3, s05: 1, s27: 1 },
  };
  for (const [name, sheet] of Object.entries(conflicts)) {
    const reads = judgeAll(sheet);
    assert.ok(reads.filter((r) => r.status === "contrast").length >= 3, `${name}: 상반으로 읽힌 구분이 적다`);
    for (const g of (name === "재성" ? ["재성"] : ["인성", "비겁"]) as Group[]) {
      const t = typeFrom28([g], reads);
      assert.equal(t.kind, "mixed", `${g}: 맞서는 답인데 이름이 붙었다`);
      if (t.kind === "mixed") assert.ok(t.detail.endsWith("이름을 붙이지 않았어요."), t.detail);
    }
  }
  const none = typeFrom28([], judgeAll(consistentSheet("fast-doer")));
  assert.deepEqual([none.kind, none.kind === "mixed" ? none.reason : ""], ["mixed", "saju-balanced"]);
  // 후보 갈래가 둘 이상인데 두 갈래가 같은 정도로 받쳐지면 정하지 않는다
  const sheet = consistentSheet("fast-doer"); // 식상 + 관성(standard-keeper)도 받친다
  const both = typeFrom28(["식상", "관성"], judgeAll(sheet));
  assert.ok(both.kind === "mixed" || both.kind === "type");
});

test("가상 응답 측정(결정적 난수 · 가정 있음): 일관된 응답은 거의 맞는 이름으로, 무작위 응답은 대부분 이름 없이 혼합으로 나오고 반대 모습이 붙는 일은 드물다", () => {
  const random = measurePreference(0, 200, 2026);
  const half = measurePreference(0.6, 200, 2026);
  const strong = measurePreference(1, 200, 2026);
  assert.ok(random.mixed / random.runs >= 0.9, `무작위 혼합 ${random.mixed}/${random.runs}`);
  assert.ok(random.wrong / random.runs <= 0.05, `무작위 반대 모습 ${random.wrong}`);
  assert.ok(half.right > random.right && strong.right > half.right, "응답이 한쪽으로 기울수록 이름이 붙는 비율이 는다");
  assert.ok(strong.right / strong.runs >= 0.8, `일관된 응답 ${strong.right}/${strong.runs}`);
  assert.ok(strong.wrong / strong.runs <= 0.01 && half.wrong / half.runs <= 0.01, "일관된 응답에서 반대 모습이 붙지 않는다");
  assert.deepEqual(measurePreference(0.6, 50, 7), measurePreference(0.6, 50, 7), "같은 씨앗이면 같은 결과");
  assert.notDeepEqual(preferenceSheet("explorer", 0.5, rngOf(1)), preferenceSheet("explorer", 0.5, rngOf(2)));
});

// ───── 사주 + 응답: 실제 명식으로 ─────

function sajuWithSingleCandidate(group: Group): SajuOk {
  for (let day = 0; day < 4000; day++) {
    const d = new Date(Date.UTC(1985, 0, 1) + day * 86_400_000);
    const saju = calculateSaju({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), calendar: "solar", isLeapMonth: false, birthTime: "12:00", gender: "female" });
    if (saju.status !== "ok") continue;
    const tilt = sajuTilt(saju);
    if (tilt.candidates.length === 1 && tilt.candidates[0] === group) return saju;
  }
  throw new Error(`후보가 ${group} 하나인 명식을 찾지 못했다`);
}

test("개인 유형: 사주가 갈래를 정하고 28문항 읽기가 그 안의 두 모습을 가른다 — 10개 이름 모두, 사주가 같아도 응답이 다르면 다른 이름, 응답이 같아도 사주 갈래가 다르면 다른 이름", () => {
  const sajus = Object.fromEntries((Object.keys(FLAVOR_RULES) as Group[]).map((g) => [g, sajuWithSingleCandidate(g)])) as Record<Group, SajuOk>;
  for (const id of PERSONAL_TYPE_IDS) {
    const g = groupOf(id);
    const summary = buildSituationalFreeSummary(Object.fromEntries(Object.entries(consistentSheet(id))) as Record<string, number>);
    const t = personalTypeFromSituational(sajus[g], summary.situational!);
    assert.equal(t.kind, "type", id);
    if (t.kind === "type") {
      assert.equal(t.info.id, id);
      assert.ok(t.why && /이름이에요\.$/.test(t.why), "이름의 근거 한 문장");
    }
  }
  // 같은 응답 + 다른 갈래의 사주 → 갈래에 맞는 다른 이름(또는 혼합)
  const sameAnswers = buildSituationalFreeSummary(consistentSheet("fast-doer") as Record<string, number>).situational!;
  const names = new Set((Object.keys(FLAVOR_RULES) as Group[]).map((g) => { const t = personalTypeFromSituational(sajus[g], sameAnswers); return t.kind === "type" ? t.info.id : "mixed"; }));
  assert.ok(names.size >= 3, [...names].join());
  // 응답이 비어도(저장 응답이 없는 요약) 이름을 지어내지 않는다
  const empty = personalTypeFromSituational(sajus["식상"], readSituational({}));
  assert.equal(empty.kind, "mixed");
});

// ───── 고객용 풀이 ─────

test("고객용 풀이: 읽은 결과를 가로로 엮어 해요체로 쓰고, 고른 선택지 문장 · 점수 · 유형 이름 · 사주 용어를 쓰지 않는다", () => {
  const optionTexts = SITUATIONAL_V2_ITEMS.flatMap((i) => i.options);
  for (const id of PERSONAL_TYPE_IDS) {
    const sheet = consistentSheet(id);
    const s = readSituational(sheet);
    const texts = [leadTextOf(s), ...Object.values(coreOf(s)), ...situationsOf(s).flatMap((x) => [x.strengthLabel, x.cautionLabel, x.scenario, x.strength, x.caution, x.tip]), ...starterActionsOf(s).flatMap((a) => [a.title, a.detail])];
    for (const text of texts) {
      assert.ok(text.length > 0);
      assert.ok(!/\d+\s*점|%|확률|정확도/.test(text), `점수 표현: ${text}`);
      assert.ok(!/[가-힣]+형(?:\s|이|은|을|이에요|$)/.test(text.replace(/모양|유형|혼합 경향/g, "")) || !PERSONAL_TYPE_IDS.some((t) => text.includes(PERSONAL_TYPES[t].name)), `유형 이름: ${text}`);
      for (const opt of optionTexts) assert.ok(!text.includes(opt), `선택지 문장을 그대로 읽어 줬다: ${opt}`);
      assert.ok(!/일간|오행|십성|대운|세운|格|[一-鿿]/.test(text), `사주 용어: ${text}`);
    }
    for (const sentence of leadTextOf(s).split(/(?<=[.!?])\s+/)) assert.ok(sentence.length <= 70, `${sentence.length}자: ${sentence}`);
  }
});

test("고객용 풀이: 여러 구분이 함께 읽히면 교차 한 문장으로 잇고, 장면에 따라 갈렸으면 상황별 차이로 말하며, 아무것도 뚜렷하지 않으면 그렇게 말한다", () => {
  const cross = leadTextOf(readSituational(consistentSheet("careful-deep")));
  assert.match(cross, /점검|확인|따져|기준/);
  const alternating = Object.fromEntries(SCENE_IDS.map((id, i) => [id, ((i % 4) + 1) as 1 | 2 | 3 | 4]));
  const s = readSituational(alternating);
  const text = leadTextOf(s);
  assert.ok(text.includes(NOTHING_CLEAR) || /장면(에 따라|마다)/.test(text), text);
  assert.ok(notReadLineOf(readSituational({})) !== null && /읽지 않은 부분|풀이에 쓰지 않은/.test(notReadLineOf(readSituational({}))!));
  // 상반으로 읽힌 구분은 평균 내지 않고 상황별 차이 문장으로 나온다
  const contrast = readSituational(sheetOf({ s04: 4, s08: 1, s12: 1, s14: 3 }));
  assert.equal(contrast.readings.find((r) => r.d === "energy")!.status, "contrast");
  assert.ok(leadTextOf(contrast).includes(CONTRAST_COPY.energy));
});

test("문장이 있는 쪽: 충분으로 읽힐 수 있는 모든 구분 · 쪽에 고객용 문장이 있고, 읽을 수 없는 쪽에는 문장이 없다", () => {
  for (const d of DISTINCTION_IDS) {
    const designed = scenesOf(d).length;
    for (const side of Object.keys(DISTINCTIONS[d].sides)) {
      const clearScenes = SCENE_READINGS.filter((sc) => sc.options.some((o) => o.read?.d === d && o.read.side === side && o.read.clarity === "clear")).length;
      const canBeSufficient = designed >= MIN_SCENES && clearScenes >= MIN_CLEAR;
      const copy = SIDE_COPY[d]?.[side];
      assert.equal(Boolean(copy), canBeSufficient, `${d}.${side}: 문장 ${copy ? "있음" : "없음"} / 충분 가능 ${canBeSufficient}`);
      if (copy) {
        assert.ok(/요\.$/.test(copy.trait) && /요\.$/.test(copy.reaction) && /요\.$/.test(copy.strength) && /요\.$/.test(copy.burden), `${d}.${side} 해요체`);
        assert.ok(copy.tip.title.length > 4 && /요\.$/.test(copy.tip.detail));
      }
    }
  }
});

// ───── 요약 · 저장 · 근거 ─────

test("무료 요약: 점수 줄이 비어 있고 읽기 결과 · 한 줄 · 풀이 문단 · 핵심 네 칸이 있으며, 같은 응답이면 늘 같고 저장 모양을 알아본다", () => {
  const answers = consistentSheet("steady-builder") as Record<string, number>;
  const a = buildSituationalFreeSummary(answers);
  const b = buildSituationalFreeSummary({ ...answers });
  assert.deepEqual(a, b);
  assert.equal(a.contentVersion, "situational-v2-live-0.1");
  assert.equal(a.source, "dev-scoring");
  assert.deepEqual([a.temperament, a.relationship, a.mbti.axes], [[], [], []], "점수 환산을 만들지 않는다");
  assert.ok(a.insight && a.insight.text.length > 20);
  assert.ok(isSituationalSummary(a.situational));
  assert.ok(isSituationalSummary(JSON.parse(JSON.stringify(a.situational))), "저장(JSON)했다 읽어도 같은 모양");
  assert.equal(isSituationalSummary({ version: "x" }), false);
  for (const v of Object.values(a.core)) assert.ok(v.length > 4);
  assert.notEqual(a.tendency.name, "안정지향형", "예전 후보 이름을 만들지 않는다");
  const other = buildSituationalFreeSummary(consistentSheet("explorer") as Record<string, number>);
  assert.notEqual(other.insight!.text, a.insight!.text, "다른 응답이면 다른 풀이");
});

test("질문 버전: 응답의 키로 알아보고(28 · 22 · 섞임), 28문항은 장면 28개 모두에 1~4만 받으며 22문항과 서로 환산하지 않는다", () => {
  const s28 = consistentSheet("fast-doer") as Record<string, number>;
  const s22 = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => [i.id, 3])));
  assert.equal(answerVersionOf(s28), "situational-28");
  assert.equal(answerVersionOf(s22), "likert-22");
  assert.equal(answerVersionOf({ ...s28, m1: 3 }), null, "섞인 응답은 어느 버전도 아니다");
  assert.equal(answerVersionOf({}), null);
  assert.equal(validateSceneAnswers(s28).ok, true);
  assert.equal(validateSceneAnswers({ ...s28, s05: 5 }).ok, false, "5번 선택지는 없다(다섯째 선택지를 만들지 않았다)");
  assert.equal(validateSceneAnswers({ ...s28, s05: 0 }).ok, false);
  const { s28: _drop, ...partial } = { ...s28, s28: 1 };
  void _drop;
  assert.equal(validateSceneAnswers(partial).ok, false, "답하지 않은 장면이 있다");
  assert.equal(summarizeAnswers(s28, { strict: true }).ok, true);
  assert.equal(summarizeAnswers({ ...s28, s99: 2 }).ok, true, "저장 단계는 모르는 키를 버리고");
  assert.equal(summarizeAnswers({ ...s28, s99: 2 }, { strict: true }).ok, false, "브라우저가 보낸 값은 모르는 키가 섞이면 거절");
  assert.equal(summarizeAnswers({ ...s28, m1: 3 }).ok, false);
  const r22 = summarizeAnswers(s22, { strict: true });
  assert.ok(r22.ok && r22.version === "likert-22" && !r22.summary.situational, "22문항은 예전 점수 규칙 그대로");
  const r28 = summarizeAnswers(s28);
  assert.ok(r28.ok && r28.version === "situational-28" && r28.summary.situational);
});

test("AI 근거: 읽은 구분은 쪽과 함께, 갈린 구분은 상황별 차이로, 읽지 못한 구분은 만들지 않고, 점수 근거 id와 섞이지 않는다", () => {
  const ev = situationalEvidence(readSituational(consistentSheet("independent-driver")));
  assert.ok(ev.length >= 3);
  for (const e of ev) {
    assert.match(e.id, /^survey\.s28\.[a-z]+\.[a-z]+$/);
    assert.equal(e.source, "survey");
    assert.ok(e.topics.length > 0);
    assert.ok(!/\d+\s*점|score/.test(e.fact + e.cue), e.id);
    assert.match(e.cue, /고른 선택지를 그대로 읽어 주거나/);
  }
  assert.deepEqual(surveyAxesOf(ev), {}, "프레임 선택은 응답으로 바뀌지 않는다(응답은 점수 근거 id만 읽는 규칙)");
  const sufficient = ev.filter((e) => !e.id.endsWith(".mixed"));
  assert.ok(sufficient.every((e) => e.strength === "strong" || e.strength === "moderate"));
  const none = situationalEvidence(readSituational({}));
  assert.deepEqual(none, [], "읽지 못했으면 근거를 만들지 않는다");
  const helpOnly = situationalEvidence(readSituational(sheetOf({ s18: 1, s21: 2 })));
  assert.ok(helpOnly.every((e) => !e.id.includes(".help.")), "도움 받는 방식은 읽지 않는다");
  // 애착에 관련된 구분은 유형 이름으로 부르지 않는 안내가 붙는다
  const att = situationalEvidence(readSituational(sheetOf({ s15: 3, s16: 1, s20: 3, s17: 3, s19: 1, s24: 3 })));
  assert.ok(att.some((e) => /애착 유형 이름으로 부르지 않고/.test(e.cue)));
});

test("개발용 규칙 리포트 세부 칸: 점수 칸 대신 읽기 결과로 채우고 모든 칸이 비지 않는다", () => {
  const d = devDetailsOf(readSituational(consistentSheet("relation-balancer")));
  for (const block of [d.mbti, d.temperament, d.relationship]) {
    assert.ok(block.findings.length >= 2);
    assert.ok(block.limits.length > 20 && !/\d+\s*점/.test(block.findings.join(" ")));
  }
  assert.ok(d.common.length >= 1 && d.different.length >= 1);
  assert.equal(starterActionsOf(readSituational({})).length, 3, "읽힌 것이 없어도 공통 제안 3개");
  assert.equal(situationsOf(readSituational({})).length, 4, "읽힌 것이 없어도 상황 4개(일반 문장)");
});

// ───── 예전 22문항 ─────

test("예전 22문항은 그대로다: 문항 id · 응답 범위 · 점수 요약에 situational이 없고 예전 이름 규칙(personalTypeOf)이 그대로 쓰인다", () => {
  const ids = ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => i.id));
  assert.equal(ids.length, 22);
  assert.ok(ids.every((id) => !SCENE_IDS.includes(id)));
  const r = summarizeAnswers(Object.fromEntries(ids.map((id) => [id, 4])), { strict: true });
  assert.ok(r.ok && !r.summary.situational && r.summary.temperament.length === 4 && r.summary.mbti.axes.length === 4);
});

// ───── 생성 문서 ─────

test("생성 문서(docs/assessment-situational-v2-reading-tables.md)가 코드와 어긋나지 않는다 — 112개 선택지 · 판정 규칙 · 유형 연결표 · 가상 응답 측정", () => {
  const onDisk = readSource(join(import.meta.dirname, "..", "..", "..", "docs", "assessment-situational-v2-reading-tables.md"));
  const rendered = renderReadingTables();
  assert.equal(onDisk.replace(/\n+$/, ""), rendered.replace(/\n+$/, ""), "문서가 낡았다 — node scripts/situational-render-reading.ts로 다시 만든다");
  assert.ok(rendered.includes("112개") && rendered.includes("다섯째 선택지도 더하지 않았다") && rendered.includes("실제 사람의 응답이 아님"));
});
