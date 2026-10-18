// 경고(WARN)와 BLOCK을 가르는 표지 — 개인 심층 리포트와 궁합 풀이가 같은 문구를 쓴다(운영자 정책 2026-10-17). 검사가 문구를 바꾸면 이 시험이 걸린다.
import assert from "node:assert/strict";
import test from "node:test";
import { isTermWarning, splitWarnings } from "./warn-policy.ts";

test("경고로 가르는 문구: 설명 없는 용어 · 한 문장 / 한 문단 / 첫 문단 용어 개수 · 문단 문장 수", () => {
  for (const w of [
    "sections.1.paragraphs[1]: 설명 없는 사주 용어(재성) — \"…재성 쪽이라…\" 처음 쓸 때 바로 뒤에 풀이를 붙여 주세요.",
    "sections.6.paragraphs[0]: 한 문장에 사주 용어가 4개(식신 · 편인 · 천간 · 지지) — 3개까지만",
    "sections.1(나는 어떤 사람일까?).paragraphs[1]: 한 문단에 사주 용어가 5개(비겁 · 식상) — 4개까지만",
    "sections.4(인간관계와 인연): 첫 문단에 사주 용어(비겁 · 인성 · 겁재 · 천간)가 4개 — 2개까지만",
    "sections.6(앞으로의 운과 변화).paragraphs[1]: 6문장 (4문장 이하로 묶어 주세요)",
  ]) assert.ok(isTermWarning(w), w);
});

test("BLOCK으로 남는 문구: 계산 · 근거 · 판정 · 시주 확정 풀이 · 사건 · 이름 · 구성 · 형식", () => {
  for (const b of [
    "sections.1.evidence: 없는 근거 ID saju.element.목.none",
    "sections.2.paragraphs[0]: 근거 목록에 없는 판정(용신) — 이 사람의 용신은(는) 엔진이 계산하지 않아 쓸 수 없습니다.",
    "sections.1.paragraphs[0]: 출생 시각을 몰라 시주로 읽는 풀이(\"시주에\")는 쓰지 않아요",
    "sections.3.paragraphs[0]: 입력받지 않은 두 사람의 사건(\"헤어졌\")을 아는 사실처럼 쓰지 않습니다",
    "headline: 이름을 쓰지 않습니다",
    "sections: 7개 순서로 7개 장이 있어야 해요",
    "JSON 형식이 아닙니다. JSON 객체 하나만 출력해 주세요.",
    "sections.6.paragraphs[0]: 계산되지 않은 해 2032",
    "sections.5: 개운 풀이(행운의 색 · 방향 · 숫자 · 장소)에서 방향(북쪽)이 근거와 다릅니다",
  ]) assert.ok(!isTermWarning(b), b);
});

test("가르기: 같은 문구는 하나로 묶고 순서를 지킨다", () => {
  const r = splitWarnings(["없는 근거 ID a", "한 문단에 사주 용어가 5개(a)", "한 문단에 사주 용어가 5개(a)", "계산되지 않은 해 2032", "3문장 (4문장 이하로 묶어 주세요)".replace("3문장", "5문장")]);
  assert.deepEqual(r.blocks, ["없는 근거 ID a", "계산되지 않은 해 2032"]);
  assert.deepEqual(r.warnings, ["한 문단에 사주 용어가 5개(a)", "5문장 (4문장 이하로 묶어 주세요)"]);
});
