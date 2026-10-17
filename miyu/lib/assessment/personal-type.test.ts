// 실행: npm test — 개인 유형명(personal-type.ts): 이름이 코드에 고정된 10개인지, 두 단계 분류(사주 갈래 → 응답으로 두 모습 가르기)가 약속대로 움직이는지,
// 근거가 부족하면 억지로 이름을 붙이지 않는지, 입력한 MBTI · 이름 · 생년월일이 결과에 영향을 주지 않는지, 고정 문구에 사주 용어 · 나쁘다는 표현 · 알파벳 코드가 없는지 확인한다.
// 규칙은 미유가 정한 설계 가설이며 이 시험은 유형이 맞다는 보증이 아니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JARGON } from "../report/reading/plan.ts";
import type { FreeSummary } from "../report/types.ts";
import type { SajuOk } from "../saju/engine.ts";
import { calculateSaju } from "../saju/manseryeok-engine.ts";
import { PERSONAL_TYPE_RULE_META } from "../saju/interpret/rule-meta.ts";
import {
  CANDIDATE_MIN_LEAD, FLAVOR_MIN_DIFF, FLAVOR_RULES, MIXED_TYPE, PERSONAL_TYPES, PERSONAL_TYPE_IDS, PERSONAL_TYPE_NOTE, PERSONAL_TYPE_VERSION, GROUP_PLAIN,
  personalTypeOf, personalTypeView, readFlavor, responseScores, sajuTilt,
} from "./personal-type.ts";

const person = (year: number, month: number, day: number, birthTime: string | null = "09:30"): SajuOk => {
  const r = calculateSaju({ year, month, day, calendar: "solar", isLeapMonth: false, birthTime, gender: "female" });
  assert.equal(r.status, "ok");
  return r as SajuOk;
};

/** 응답 점수를 정해 요약을 만든다 — 정하지 않은 행은 50(가운데) */
const summaryOf = (scores: Partial<Record<string, number>>, mbtiCode?: string): Pick<FreeSummary, "temperament" | "relationship" | "mbti"> => {
  const row = (id: string) => ({ id, label: id, score: scores[id] ?? 50, lowMeaning: "", highMeaning: "" });
  const axis = (id: string) => ({ ...row(id), lowName: "", highName: "" });
  return {
    temperament: ["novelty", "caution", "sensitivity", "persistence"].map(row),
    relationship: ["anxiety", "avoidance"].map(row),
    mbti: { ...(mbtiCode ? { code: mbtiCode } : {}), axes: ["ei", "sn", "tf", "jp"].map(axis) },
  };
};

const sample: SajuOk[] = [];
for (let y = 1960; y <= 2004; y += 4) for (const [m, d] of [[2, 9], [5, 21], [8, 3], [11, 17]]) sample.push(person(y, m, d, y % 8 === 0 ? null : "14:20"));

test("유형 이름: 10개가 코드에 고정돼 있고(8~12개) 이름 · id가 겹치지 않으며 '~형'으로 끝나고 알파벳 코드 · 동물 이름 · 감성 별명이 없다", () => {
  assert.equal(PERSONAL_TYPE_IDS.length, 10);
  assert.ok(PERSONAL_TYPE_IDS.length >= 8 && PERSONAL_TYPE_IDS.length <= 12);
  const names = PERSONAL_TYPE_IDS.map((id) => PERSONAL_TYPES[id].name);
  assert.equal(new Set(names).size, 10);
  for (const id of PERSONAL_TYPE_IDS) {
    const t = PERSONAL_TYPES[id];
    assert.equal(t.id, id);
    assert.match(t.name, /^[가-힣 ]+형$/);
    assert.doesNotMatch(t.name, /[A-Za-z]/);
    assert.doesNotMatch(t.name, /여우|고양이|강아지|토끼|곰|사자|호랑이|늑대|펭귄|동물/);
  }
  // 운영자가 예시로 준 8개 이름은 그대로 들어 있다
  for (const n of ["신중 몰입형", "빠른 실행형", "관계 조율형", "기준 중심형", "안정 구축형", "탐색 확장형", "독립 추진형", "유연 적응형"]) assert.ok(names.includes(n), n);
});

test("갈래마다 두 모습: 다섯 갈래 × 2 = 10유형이고 각 유형은 자기 갈래의 규칙에 한 번씩만 나온다", () => {
  const seen: string[] = [];
  for (const [group, rule] of Object.entries(FLAVOR_RULES)) {
    assert.equal(PERSONAL_TYPES[rule.a].group, group);
    assert.equal(PERSONAL_TYPES[rule.b].group, group);
    assert.notEqual(rule.a, rule.b);
    seen.push(rule.a, rule.b);
  }
  assert.equal(new Set(seen).size, 10);
});

test("고정 문구: 한 줄 · 강점 · 부담 문장에 사주 용어 · '나쁘다' · 진단 표현 · 숫자가 없고, 부담은 조절이 필요한 모습으로 쓴다", () => {
  const texts = [
    ...PERSONAL_TYPE_IDS.flatMap((id) => [PERSONAL_TYPES[id].line, PERSONAL_TYPES[id].whenStrength, PERSONAL_TYPES[id].whenBurden]),
    MIXED_TYPE.line, MIXED_TYPE.note, PERSONAL_TYPE_NOTE, ...Object.values(GROUP_PLAIN),
  ];
  for (const t of texts) {
    assert.doesNotMatch(t, JARGON, t);
    assert.doesNotMatch(t, /나쁜|나쁘|단점|결함|문제가 있|진단이에요|[0-9]/, t);
  }
  for (const id of PERSONAL_TYPE_IDS) assert.match(PERSONAL_TYPES[id].whenBurden, /수 있어요|쉬워요|생겨요/);
  assert.match(PERSONAL_TYPE_NOTE, /진단이나 평생 유형이 아니/);
  assert.match(PERSONAL_TYPE_NOTE, /전문가 검토 전/);
});

test("사주 갈래: 같은 사주는 같은 결과이고, 후보는 가장 많은 갈래(2 이상)이며 하나뿐이면 dominant다", () => {
  for (const s of sample) {
    const a = sajuTilt(s);
    const b = sajuTilt(s);
    assert.deepEqual(a, b);
    if (a.reason === "ok") {
      const top = Math.max(...Object.values(a.counts));
      assert.ok(top >= 2);
      assert.ok(a.candidates.length >= 1);
      for (const g of a.candidates) assert.equal(a.counts[g], top);
      assert.equal(a.dominant, a.candidates.length === 1 ? a.candidates[0] : null);
    } else {
      assert.deepEqual(a.candidates, []);
      assert.equal(a.dominant, null);
    }
  }
});

test("응답으로 모습 가르기: 뚜렷한 응답이 없으면 정하지 않고(no-data), 기울기가 작으면 정하지 않고(unclear), 충분히 기울면 한쪽을 고른다", () => {
  // 인성 갈래: A 신중 몰입 = 신중함 높음 + 판단 기준 낮음(논리 먼저), B 섬세 공감 = 민감함 높음 + 판단 기준 높음(관계 먼저)
  assert.equal(readFlavor("인성", responseScores(summaryOf({}))).reason, "no-data");
  assert.equal(readFlavor("인성", responseScores(summaryOf({ caution: 65 }))).reason, "unclear", "한쪽이 뚜렷해도 기울기가 20 미만이면 정하지 않는다");
  assert.equal(readFlavor("인성", responseScores(summaryOf({ caution: 70 }))).winner, "a", "기울기가 정확히 20이면 정한다");
  const a = readFlavor("인성", responseScores(summaryOf({ caution: 90, tf: 10 })));
  assert.equal(a.winner, "a");
  assert.ok((a.diff ?? 0) >= FLAVOR_MIN_DIFF);
  const b = readFlavor("인성", responseScores(summaryOf({ sensitivity: 90, tf: 90 })));
  assert.equal(b.winner, "b");
  // 둘이 같이 높으면(신중하면서 민감) 서로 상쇄돼 정하지 않는다
  assert.equal(readFlavor("인성", responseScores(summaryOf({ caution: 90, sensitivity: 90 }))).winner, null);
});

test("갈래의 두 모습은 같은 응답의 반대쪽이어서 한 응답이 양쪽에 같은 방향으로 들어가지 않는다", () => {
  for (const [group, rule] of Object.entries(FLAVOR_RULES)) {
    for (const pa of rule.aParts) for (const pb of rule.bParts) if (pa.row === pb.row) assert.notEqual(pa.toward, pb.toward, `${group}: ${pa.row}`);
  }
});

test("유형 결정: 사주 방향이 정해지고 응답이 기울면 이름이 붙고, 응답이 비어 있으면 혼합 경향이며, 사주 후보가 같은 응답으로 두 갈래를 가를 때는 더 또렷한 쪽만 고른다", () => {
  let typed = 0, mixedMissing = 0;
  for (const s of sample) {
    const tilt = sajuTilt(s);
    const empty = personalTypeOf({ saju: s, summary: summaryOf({}) });
    if (tilt.candidates.length) {
      assert.equal(empty.kind, "mixed");
      if (empty.kind === "mixed") assert.equal(empty.reason, "response-missing");
      mixedMissing++;
      // 뚜렷한 응답을 모든 응답에 넣어 보면(신중 · 논리 · 혼자 · 구체 · 계획) 후보 갈래에 따라 이름이 붙는 경우가 있다
      const strong = personalTypeOf({ saju: s, summary: summaryOf({ caution: 95, tf: 5, avoidance: 95, ei: 95, persistence: 95, sn: 5, novelty: 5, jp: 5, sensitivity: 5 }) });
      if (strong.kind === "type") {
        assert.ok(tilt.candidates.includes(strong.info.group));
        typed++;
      }
    } else {
      assert.equal(empty.kind, "mixed");
      if (empty.kind === "mixed") assert.ok(empty.reason === "saju-balanced" || empty.reason === "month-uncertain");
    }
  }
  assert.ok(mixedMissing > 0 && typed > 0, "시험 표본에서 두 경우가 모두 나온다");
});

test("사주가 갈래를 정하면 응답이 같을 때 같은 이름이 나오고, 같은 응답이라도 사주 갈래가 다르면 이름이 달라질 수 있다(응답만으로 이름을 붙이지 않는다)", () => {
  const summary = summaryOf({ caution: 95, tf: 5, persistence: 95, sn: 5, avoidance: 95, ei: 95 });
  const names = new Set<string>();
  for (const s of sample) {
    const a = personalTypeOf({ saju: s, summary });
    const b = personalTypeOf({ saju: s, summary });
    assert.deepEqual(a, b);
    if (a.kind === "type") names.add(a.info.name);
  }
  assert.ok(names.size >= 3, `같은 응답에서도 사주에 따라 여러 이름이 나온다: ${[...names].join(", ")}`);
});

test("입력한 MBTI · 응답의 예전 코드는 분류에 쓰이지 않는다(선택 입력이고 자기 인식 참고값이다)", () => {
  for (const s of sample) {
    const base = summaryOf({ caution: 90, tf: 10, sensitivity: 20 });
    const a = personalTypeOf({ saju: s, summary: base });
    const b = personalTypeOf({ saju: s, summary: { ...base, mbti: { ...base.mbti, code: "ENFP" } } });
    const c = personalTypeOf({ saju: s, summary: { ...base, mbti: { ...base.mbti, code: "ISTJ" } } });
    assert.deepEqual(a, b);
    assert.deepEqual(a, c);
  }
});

test("화면 값: 유형이면 이름 · 한 줄 · 강점일 때 · 부담일 때가 있고, 혼합 경향이면 이름을 억지로 붙이지 않고 사주에서 두드러진 쪽을 쉬운 말로 덧붙이며, 항상 진단이 아니라는 안내가 있다", () => {
  for (const s of sample) {
    const t = personalTypeOf({ saju: s, summary: summaryOf({ caution: 95, tf: 5, avoidance: 95, ei: 95, persistence: 95, sn: 5 }) });
    const v = personalTypeView(t);
    assert.match(v.note, /진단이나 평생 유형이 아니/);
    if (t.kind === "type") {
      assert.equal(v.name, t.info.name);
      assert.ok(v.strength && v.burden);
    } else {
      assert.equal(v.name, MIXED_TYPE.name);
      assert.equal(v.strength, null);
      assert.doesNotMatch(v.note, JARGON);
    }
  }
  assert.ok(CANDIDATE_MIN_LEAD > 0);
});

test("분포: 무작위 사주 · 무작위 응답에서 이름이 한두 개로 쏠리지 않고, 혼합 경향이 대부분을 차지하지 않는다(가정: 생년월일 균등 · 응답 균등 — 실제 이용자 분포가 아니다)", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const counts = new Map<string, number>();
  let mixed = 0;
  const N = 1500;
  for (let i = 0; i < N; i++) {
    const s = person(int(1950, 2005), int(1, 12), int(1, 28), rnd() < 0.15 ? null : `${String(int(0, 23)).padStart(2, "0")}:00`);
    const scores = Object.fromEntries(["novelty", "caution", "sensitivity", "persistence", "anxiety", "avoidance", "ei", "sn", "tf", "jp"].map((id) => [id, [0, 13, 25, 38, 50, 63, 75, 88, 100][int(0, 8)]]));
    const t = personalTypeOf({ saju: s, summary: summaryOf(scores) });
    if (t.kind === "type") counts.set(t.info.id, (counts.get(t.info.id) ?? 0) + 1);
    else mixed++;
  }
  assert.equal(counts.size, 10, "10개 이름이 모두 나온다");
  for (const [id, n] of counts) assert.ok(n / N < 0.2, `${id}가 ${((n / N) * 100).toFixed(1)}%로 쏠림`);
  assert.ok(mixed / N < 0.5, `혼합 경향이 ${((mixed / N) * 100).toFixed(1)}%`);
});

test("규칙 이력: 갈래 · 모습 두 규칙이 검토 전(unreviewed)으로 있고 출처에 문헌을 확인하지 못했다고 적혀 있으며 버전이 있다", () => {
  assert.equal(PERSONAL_TYPE_RULE_META.length, 2);
  assert.match(PERSONAL_TYPE_VERSION, /draft/);
  for (const m of PERSONAL_TYPE_RULE_META) {
    assert.equal(m.review, "unreviewed");
    assert.ok(m.conditions.length > 0 && m.exceptions.length > 0);
    assert.doesNotMatch(m.source, /전문가 감수|검증됨/);
  }
  assert.ok(PERSONAL_TYPE_RULE_META[0].source.includes("확인하지 못했다"));
});
