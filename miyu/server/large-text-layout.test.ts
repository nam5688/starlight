// 글자를 크게 키웠을 때 입력 묶음이 화면 밖으로 밀려나지 않게 하는 두 가지 규칙의 회귀 시험 (반응형 모의 검사에서 발견, 2026-10-19)
//  1) fieldset의 기본 최소 폭(min-content)을 0으로 푼다  2) 생년월일 한 줄(년 · 월 · 일)의 칸 폭은 minmax(0, …)라서 내용 폭 때문에 넓어지지 않는다
// 정적 점검이다: 실제 기기의 글자 크기 설정에서 어떻게 보이는지는 보증하지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readSource } from "../lib/report/test-source.ts";

const read = (p: string) => readSource(new URL(`../${p}`, import.meta.url));

test("전역 CSS: fieldset의 최소 폭을 0으로 푼다 (글자 확대에서 질문 묶음이 화면 밖으로 밀리지 않게)", () => {
  assert.match(read("app/globals.css"), /fieldset\s*\{\s*min-width:\s*0;\s*\}/);
});

test("생년월일 한 줄 · 지역 선택 줄의 칸은 minmax(0, …)로 줄어들 수 있다 — 분석 · 간단 궁합 입력", () => {
  for (const file of ["components/analyze/basic-info-step.tsx", "components/compat/person-fields.tsx"]) {
    const src = read(file);
    assert.match(src, /grid-cols-\[minmax\(0,1\.3fr\)_minmax\(0,1fr\)_minmax\(0,1fr\)\]/, `${file}: 년 · 월 · 일 칸`);
    assert.doesNotMatch(src, /grid-cols-\[1\.3fr_1fr_1fr\]/, `${file}: 내용 폭에 끌려 넓어지는 옛 칸 정의가 없다`);
  }
  assert.match(read("components/analyze/basic-info-step.tsx"), /grid grid-cols-\[minmax\(0,1fr\)\] gap-2 sm:grid-cols-2/, "시 · 도 / 시 · 군 · 구 줄");
});
