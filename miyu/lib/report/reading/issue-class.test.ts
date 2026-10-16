// 실행: npm test — 검사 오류 문구의 성격 분류(issue-class.ts). 내용 오류와 형식 · 가독성 · 내용 품질을 같은 실패로 묶지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyReadingIssue, groupReadingIssues } from "./issue-class.ts";

test("내용 오류: 근거 없는 판정 · 계산과 반대 · 계산되지 않은 해 · 없는 근거 · 나이 · 예언 · 확정 · 보장 · 원인 단정 · 지어낸 응답", () => {
  for (const m of [
    "blocks.values.details[0]: 근거 목록에 없는 판정(월령) — 이 사람의 월령은 근거 목록이 없어서 쓸 수 없습니다.",
    "blocks.values.details[0]: 근거 없는 판정(신약) — 강약은 후보이고 요소가 한쪽으로 모였을 때만 말할 수 있습니다.",
    "blocks.values.details[0]: 계산된 월령과 반대(득령) — 근거 사실은 월령을 얻지 못한 실령입니다.",
    "blocks.values.details[0]: 계산된 강약 후보와 반대(신강) — 근거 사실은 힘을 덜 받는 쪽입니다.",
    "flow.summary: 계산되지 않은 해 2031",
    "flow.years[0]: 계산된 해가 아닙니다 (2040). 2026 · 2027만 쓸 수 있습니다.",
    "blocks.love.sections[0].body: 없는 근거 ID saju.fake",
    "blocks.love.sections[0].body: 나이를 쓰지 않습니다.",
    "blocks.love.sections[0].body: 쓰지 않는 표현 (중대한 선택을 확정해 말하는 표현)",
    "blocks.love.sections[0].body: 쓰지 않는 표현 (운을 바꾼다는 보장 · 행운의 숫자 · 날짜)",
    "blocks.love.sections[0].body: 원인을 하나로 좁혀 말하지 않습니다 (\"~때문이에요\" 대신 \"~일 수 있어요\").",
    "flow.scenarios[1].then: 확률이 아닌 가능성으로 써 주세요 (\"~할 수 있어요\").",
    "INVENTED blocks.love.reactionFlow.steps[1].text: 답을 받지 못한 장면에서의 이 사람의 반응을 사실처럼 썼습니다.",
    "UNCITED blocks.love.sections[1].body: 응답으로 읽은 행동을 근거 ID를 달지 않고 썼습니다.",
  ]) assert.equal(classifyReadingIssue(m), "content", m);
});

test("형식 · 가독성: 용어 설명 · 용어 나열 · 문장 수 · 글자 수 · 개수 · 구조는 내용 오류와 따로 센다", () => {
  for (const m of [
    'blocks.tendency.summary: 설명 없는 사주 용어(일간) — "…일간이 기토…" 처음 쓸 때 바로 뒤에 "일간(쉬운 풀이)"나 앞에 풀이를 쓰고 …',
    "blocks.values.details[0]: 한 문장에 사주 용어가 4개(관성 · 일간 · 월령 · 실령) — 용어를 나열하지 말고 한 문장에 2개까지만",
    "blocks.love(가까운 관계).sections[1].tryIt: 3문장 (2문장 이하로 묶어 주세요)",
    "headline: 길이 45자 (10~40자)",
    "flow.periods: 5개 (1~4개)",
    "blocks.love.sections: 소단락 제목이 겹칩니다.",
    "cards.strength(내가 강한 포인트): 카드가 없습니다.",
    "headline: 해석 키워드 나열(\"성과 · 수입\")을 그대로 옮기지 않습니다",
    "headline: JSON 형식이 아닙니다.",
  ]) assert.equal(classifyReadingIssue(m), "format", m);
});

test("내용 품질: 반복 · 재진술 · 응답 읽어 주기 · 선택지 문장 옮기기 · 답을 나열한 제목", () => {
  for (const m of [
    "blocks.love.sections[0].body: 같은 문장이 반복됩니다 (blocks.love.sections[1].body와 같음)",
    "같은 표현이 여러 곳에 되풀이돼요: ‘상황이 바뀌면 방향을 빠르게’ (blocks.tendency.summary · blocks.values.details[0]).",
    "blocks.tendency.summary: 응답을 그대로 읽어 주는 말(\"라고 답\")을 쓰지 않습니다",
    "blocks.love.summary: 요약이 제목을 그대로 되풀이합니다.",
    "blocks.strength-burden.traits: 예시가 같은 장면입니다.",
    "ECHO blocks.love.sections[0].body: 고른 선택지 문장을 그대로 옮겼습니다",
    "TITLE blocks.love.headline: 제목이 고른 답 3개를 나열합니다",
    "FLAT_EITHER blocks.love.sections[2].body: 두 가능성을 늘어놓고 갈라 주는 조건 없이 끝납니다",
  ]) assert.equal(classifyReadingIssue(m), "quality", m);
});

test("모르는 오류 문구는 내용 오류로 본다 — 가볍게 취급하지 않는다. 묶기는 세 갈래로 나뉜다", () => {
  assert.equal(classifyReadingIssue("처음 보는 새 오류 문구"), "content");
  const g = groupReadingIssues(["flow.periods: 5개 (1~4개)", "headline: 길이 45자 (10~40자)", "flow.summary: 계산되지 않은 해 2031", "같은 문장이 반복됩니다 (a와 같음)"]);
  assert.deepEqual({ content: g.content.length, format: g.format.length, quality: g.quality.length }, { content: 1, format: 2, quality: 1 });
});
