// 실행: npm test — 심화 검사 설계안(7영역 · 세부 항목 25개)이 지금 초안과 어긋나지 않고, 공식 검사 이름 · 합산 점수를 쓰지 않는다
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEEP_DOMAINS, DEEP_SUB_COUNT, SECONDS_PER_QUESTION, TOTAL_QUESTION_BUDGET, deepRows, deepSummary, firstBundle, supplementList } from "./deep-design.ts";
import { ASSESSMENT_MODULES } from "../modules/index.ts";
import { MIN_INDICATORS, PERSPECTIVES, coverage } from "./situational-draft.ts";

test("설계안 구성: 7개 영역 · 세부 항목 25개, 영역 이름이 겹치지 않는다", () => {
  assert.equal(DEEP_DOMAINS.length, 7);
  assert.equal(DEEP_SUB_COUNT, 25);
  assert.equal(new Set(DEEP_DOMAINS.map((d) => d.name)).size, 7);
  assert.deepEqual(DEEP_DOMAINS.map((d) => d.subs.length), [3, 3, 3, 4, 4, 4, 4]);
});

test("지금 초안과의 연결: 관점이 있으면 실제로 있는 관점이고, 관점이 없으면 '없음'이다", () => {
  for (const d of DEEP_DOMAINS) {
    for (const s of d.subs) {
      if (s.perspective === null) assert.equal(s.fit, "없음", s.name);
      else {
        assert.ok(PERSPECTIVES[s.perspective], `${s.name}: 없는 관점 ${s.perspective}`);
        assert.notEqual(s.fit, "없음", s.name);
      }
      assert.ok(s.note.length > 0, `${s.name}: 이유가 비어 있다`);
    }
  }
});

test("읽을 수 있는 수: 지금 문항으로 '직접' 읽을 수 있는 세부 항목만 인정하고, 같은 관점을 두 번 인정하지 않는다", () => {
  const rows = deepRows();
  const readableIds = new Set(coverage().readable);
  for (const r of rows) {
    if (r.have >= MIN_INDICATORS) {
      assert.equal(r.fit, "직접", r.name);
      assert.ok(r.perspective && readableIds.has(r.perspective), r.name);
    }
    if (r.fit !== "직접") assert.equal(r.have, 0, `${r.name}: 직접이 아니면 문항으로 세지 않는다`);
    assert.equal(r.short, Math.max(0, MIN_INDICATORS - r.have));
  }
  const credited = rows.filter((r) => r.have > 0).map((r) => r.perspective);
  assert.equal(new Set(credited).size, credited.length, "한 관점의 문항을 두 세부 항목이 나눠 쓰지 않는다");
});

test("요약: 세부 항목 25개 × 3문항, 지금 읽을 수 있는 것과 더 써야 하는 문항 수가 표와 맞는다", () => {
  const rows = deepRows();
  const sum = deepSummary(rows);
  assert.equal(sum.subItems, 25);
  assert.equal(sum.fullItems, 25 * MIN_INDICATORS);
  assert.equal(sum.toWrite, rows.reduce((n, r) => n + r.short, 0));
  assert.equal(sum.perDomain.reduce((n, d) => n + d.toWrite, 0), sum.toWrite);
  assert.equal(supplementList(rows).length, sum.subItems - sum.readableNow);
  assert.equal(Object.values(sum.byFit).reduce((a, b) => a + b, 0), 25);
});

test("공식 검사의 이름 · 합산 점수 표현을 쓰지 않는다 (TCI · MBTI · 종합 점수 · 상위 %)", () => {
  const text = JSON.stringify(DEEP_DOMAINS);
  for (const banned of ["TCI", "MBTI", "ECR", "Big Five", "종합 점수", "총점", "상위", "백분위", "정확도"]) assert.ok(!text.includes(banned), banned);
});

test("첫 묶음: 지금 문항으로 읽을 수 없는 세부 항목 12개만 골라, 무료 분석과 합쳐 50~60문항 안이다 (운영자 요청 2026-10-15)", () => {
  const rows = deepRows();
  const bundle = firstBundle(rows);
  assert.equal(bundle.subs.length, 12);
  for (const r of bundle.subs) assert.ok(r.have < MIN_INDICATORS, `${r.name}: 지금 문항으로 이미 읽을 수 있으면 첫 묶음에 넣지 않는다`);
  assert.equal(bundle.items, 12 * MIN_INDICATORS);
  assert.equal(bundle.liveItems, ASSESSMENT_MODULES.reduce((n, m) => n + m.items.length, 0));
  assert.equal(bundle.total, bundle.liveItems + bundle.items);
  assert.deepEqual([bundle.liveItems, bundle.items, bundle.total], [22, 36, 58], "무료 22 + 심화 36 = 58문항 (무료 문항 수가 바뀌면 이 숫자를 다시 정한다)");
  assert.deepEqual(TOTAL_QUESTION_BUDGET, { min: 50, max: 60 });
  assert.ok(bundle.withinBudget);
  // 나머지 13개는 문항이 없다 — 같은 방식으로 더하면 범위를 넘는다는 것을 숨기지 않는다
  assert.equal(bundle.later.length, 13);
  assert.equal(bundle.later.length + bundle.subs.length, DEEP_SUB_COUNT);
  assert.ok(bundle.total + bundle.later.length * MIN_INDICATORS > TOTAL_QUESTION_BUDGET.max);
  assert.deepEqual(bundle.domainsWithoutItems, ["새로움과 행동"], "문항이 하나도 없는 영역은 '자료 없음'으로 두고 있는 것처럼 쓰지 않는다");
  // 시간은 문항당 10초로 센 어림이다
  assert.equal(SECONDS_PER_QUESTION, 10);
  assert.equal(bundle.deepMinutes, 6);
  assert.equal(bundle.totalMinutes, 10);
});
