// 실행: npm test — 사주 궁합 · 리포트 궁합 검사 강화(2026-10-17, 실제 AI 첫 시험 전): 같은 구절 되풀이 · 같은 틀로 여는 문단 · 입력받지 않은 사건 단정 · 시기에 좋고 나쁨 매기기.
// 이 검사는 저장된 대리 작성기 글(C1 · C2)을 본 뒤에 강화했다(사후 수정) — 새 글이 통과한다는 증거가 아니고, 말을 바꿔 되풀이한 문장 · 말을 바꾼 사건 단정은 못 찾는다(사람이 읽는 평가가 본다).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { calculateSaju } from "../../saju/manseryeok-engine.ts";
import { compatOf } from "../../saju/interpret/compat.ts";
import { compatTimingOf } from "../../saju/interpret/compat-timing.ts";
import { COMPAT_OPENER_MAX, repeatedOpeners, TIMING_VERDICT, unfoundedEventIn, validateCompatDraft } from "./validate.ts";

type Birth = [number, number, number, string | null];
const PAIRS: Record<string, [Birth, Birth]> = {
  C1: [[1996, 3, 29, "09:30"], [1994, 11, 2, "09:30"]],
  C2: [[1990, 5, 17, "09:30"], [1991, 8, 8, null]],
  C3: [[2001, 1, 9, "09:30"], [1999, 12, 24, "09:30"]],
};
const sajuOf = ([year, month, day, birthTime]: Birth) => {
  const r = calculateSaju({ year, month, day, calendar: "solar", isLeapMonth: false, birthTime, gender: "female" });
  if (r.status !== "ok") throw new Error("사주 계산 실패");
  return r;
};
const check = (id: keyof typeof PAIRS) => {
  const [a, b] = PAIRS[id];
  const sa = sajuOf(a);
  const sb = sajuOf(b);
  const evidence = [...compatOf(sa, sb).evidence, ...compatTimingOf(sa, sb, { year: 2026, month: 10 }).evidence];
  const raw = JSON.parse(readFileSync(new URL(`../../../docs/samples/compat-v1-proxy/prompt-0.3/${id}-first-response.json`, import.meta.url), "utf8"));
  return validateCompatDraft(raw, evidence);
};

test("입력받지 않은 사건을 사실처럼 쓴 문장은 걸리고, 조건 · 추측으로 쓴 공감은 걸리지 않는다", () => {
  for (const t of ["두 분은 얼마 전에 크게 다퉜어요.", "처음 만났을 때 서로 끌렸어요.", "한 번 헤어진 뒤에 다시 만났어요.", "연락이 끊긴 적이 있어요.", "그동안 많이 참아 왔어요."]) assert.ok(unfoundedEventIn(t), t);
  for (const t of ["다퉜던 때가 있었을 수 있어요.", "처음 만났을 때 서로 끌렸을 거예요.", "연락이 끊기면 서운해지기 쉬워요.", "서로 다투게 되면 한쪽이 먼저 멈추기 쉬워요.", "싸운 뒤에 한쪽이 먼저 말을 꺼내면 풀리기 쉬운 짝으로 읽혀요."]) assert.equal(unfoundedEventIn(t), null, t);
});

test("시기에 좋고 나쁨을 매기거나 한쪽 시기가 더 낫다고 쓴 말은 걸리고, 시기의 주제가 겹치는지 다른지만 쓴 말은 걸리지 않는다", () => {
  for (const t of ["A님의 시기가 B님보다 더 좋아요.", "지금은 관계 운이 좋은 때예요.", "두 분의 시기가 좋아서 풀리는 때예요.", "B님의 대운이 더 유리해요.", "막히는 시기를 지나고 있어요."]) assert.ok(TIMING_VERDICT.test(t), t);
  for (const t of ["두 분이 지나는 시기의 주제가 서로 달라서 같은 일을 다르게 느낄 수 있어요.", "A님은 관계를 정리하는 쪽, B님은 새로 시작하는 쪽 주제가 겹쳐 읽혀요."]) assert.ok(!TIMING_VERDICT.test(t), t);
});

test("같은 다섯 글자로 여는 문단이 한도를 넘으면 걸린다", () => {
  const same = Array.from({ length: COMPAT_OPENER_MAX + 1 }, (_, i) => ({ where: `sections.fit.paragraphs[${i}]`, text: `두 분이 함께 있을 때 ${i}번째 장면이에요.` }));
  assert.equal(repeatedOpeners(same).length, 1);
  assert.equal(repeatedOpeners(same.slice(0, COMPAT_OPENER_MAX)).length, 0);
  const varied = ["두 분이 함께 있으면", "연락이 늦어질 때는", "결정을 미루게 되는 날엔", "집안일을 나눌 때에는"].map((text, i) => ({ where: `sections.fit.paragraphs[${i}]`, text }));
  assert.equal(repeatedOpeners(varied).length, 0);
  // 문단이 아닌 조각(headline · steps)은 세지 않는다
  assert.equal(repeatedOpeners(same.map((x) => ({ ...x, where: "headline" }))).length, 0);
});

test("저장된 대리 작성기 글(prompt-0.3)에 강화한 검사를 적용하면 C1 · C2는 구절 되풀이로 걸리고 C3만 통과한다 — 사후 수정의 기록", () => {
  const c1 = check("C1");
  const c2 = check("C2");
  const c3 = check("C3");
  assert.equal(c1.ok, false);
  assert.equal(c2.ok, false);
  if (!c1.ok) assert.ok(c1.errors.some((e) => e.includes("되풀이")), "C1의 이유는 구절 되풀이");
  if (!c2.ok) assert.ok(c2.errors.some((e) => e.includes("되풀이")), "C2의 이유는 구절 되풀이");
  // 미유 문체 검사(2026-10-17)를 더한 뒤: C3의 구절 되풀이 검사 결과는 그대로이고, 건넬 말 속의 "당신"(문체 검사의 호칭 규칙) 한 곳에만 걸린다 — 저장된 글은 고치지 않았다
  assert.equal(c3.ok, false);
  if (!c3.ok) {
    assert.ok(c3.errors.every((e) => e.includes("당신 · 귀하")), "C3의 이유는 문체 검사의 호칭 규칙뿐");
    assert.ok(!c3.errors.some((e) => e.includes("되풀이")));
  }
});
