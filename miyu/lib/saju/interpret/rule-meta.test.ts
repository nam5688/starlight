// 실행: npm test — 해석 규칙 이력(rule-meta.ts)이 실제로 나오는 모든 근거 ID를 덮고, 규칙마다 출처 · 조건 · 예외 · 검토 상태 · 버전이 적혀 있는지 확인한다.
// 규칙을 새로 만들거나 근거 ID 모양을 바꾸면서 이 기록을 빠뜨리면 여기서 걸린다. "검토 완료"로 적힌 규칙은 아직 없다(전문가 검토 전).
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPersonas } from "../../report/ai/compare-personas.ts";
import { referenceFor } from "../../report/ai/compare-plan.ts";
import { buildEvidence } from "../../report/ai/generator.ts";
import { calculateSaju } from "../manseryeok-engine.ts";
import type { SajuOk } from "../engine.ts";
import { sajuEvidence } from "./rules.ts";
import { RULE_META, RULE_META_VERSION, ruleFor } from "./rule-meta.ts";

/** 여러 날짜 · 성별 · 출생시간 유무로 나올 수 있는 근거 ID를 넓게 모은다 (계산은 엔진, 날짜는 고정이라 결과가 같다) */
function collectIds() {
  const ids = new Set<string>();
  const ref = { year: 2026, month: 10 };
  let n = 0;
  for (let t = Date.UTC(1950, 0, 3); t <= Date.UTC(2008, 11, 31); t += 83 * 86400000, n++) {
    const d = new Date(t);
    const r = calculateSaju({
      year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), calendar: "solar", isLeapMonth: false,
      birthTime: n % 4 === 3 ? null : `${String((n * 5) % 24).padStart(2, "0")}:${n % 2 ? "30" : "05"}`,
      gender: n % 2 ? "male" : "female",
    });
    if (r.status !== "ok") continue;
    for (const e of sajuEvidence(r as SajuOk, { reference: ref, gender: n % 5 === 0 ? null : n % 2 ? "male" : "female" })) ids.add(e.id);
  }
  const personas = buildPersonas(10);
  for (const p of personas) for (const e of buildEvidence(p.input, referenceFor(new Date("2026-10-12T03:00:00Z")))) ids.add(e.id);
  return [...ids];
}

test("규칙 이력: 실제로 나오는 모든 근거 ID가 규칙 하나에 대응하고, 한 ID에 규칙이 둘 이상 걸리지 않는다", () => {
  const ids = collectIds();
  assert.ok(ids.length > 150, `점검한 근거 ID ${ids.length}개`);
  for (const id of ids) {
    const hits = RULE_META.filter((r) => r.match.test(id));
    assert.equal(hits.length, 1, `${id}: 규칙 ${hits.length}개 (${hits.map((h) => h.id).join(",")})`);
  }
  assert.equal(ruleFor("saju.nonexistent.rule"), null);
});

test("규칙 이력: 규칙마다 출처 · 계산 · 해석 · 적용 조건 · 예외 · 검토 상태 · 버전이 있고, 아직 검토 완료로 적은 규칙은 없다", () => {
  assert.match(RULE_META_VERSION, /^saju-rule-meta-/);
  assert.equal(new Set(RULE_META.map((r) => r.id)).size, RULE_META.length, "규칙 번호 중복");
  for (const r of RULE_META) {
    for (const f of ["title", "calculation", "interpretation", "source", "version"] as const) assert.ok(r[f].length >= 3, `${r.id}.${f}`);
    assert.ok(r.conditions.length >= 1 && r.exceptions.length >= 1, `${r.id} 조건 · 예외`);
    assert.notEqual(r.review, "reviewed", `${r.id}: 전문가 검토 없이 검토 완료로 적을 수 없다`);
    if (r.kind === "saju") {
      assert.match(r.source, /문헌 근거는 확인하지 못했다/, `${r.id}: 출처가 문헌에서 확인된 것처럼 적히면 안 된다`);
      assert.equal(r.review, "unreviewed", r.id);
      assert.match(r.calculation, /교차 검증/, `${r.id}: 계산과 해석을 나눠 적는다`);
    } else {
      assert.ok(["dev-example", "unreviewed"].includes(r.review));
    }
  }
});

test("규칙 이력: 기록한 규칙이 모두 실제로 근거를 만든다 (낡은 기록이 남지 않는다)", () => {
  const ids = collectIds();
  const unused = RULE_META.filter((r) => !ids.some((id) => r.match.test(id))).map((r) => r.id);
  // 점검에 쓴 날짜 · 인물로 한 번도 나오지 않을 수 있는 드문 규칙은 허용하되, 대부분이 실제로 나와야 한다
  assert.ok(unused.length <= 3, `나오지 않는 규칙 ${unused.join(", ")}`);
});
