// 실행: npm test — "풀어보기" 화면에 채점 방향 · 관점 이름 · 문항의 의도(운영자 설명)가 들어 있지 않은지 확인한다.
// 처음 풀 때 점수 방향이 보이면 답이 유도된다. 숨기는 것이 아니라 화면 · 코드에 아예 싣지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DRAFT_ITEMS, NA_OPTION_TEXT, PERSPECTIVE_IDS, PERSPECTIVES } from "./situational-draft.ts";
import { takeData, takeFragment, takeStandalone } from "./take-page.ts";

test("풀어보기 화면에는 질문 30개와 선택지 글 전부와 '해당 없음'이 순서대로 있다", () => {
  const page = takeFragment();
  const data = takeData();
  assert.equal(data.items.length, 30);
  assert.deepEqual(data.items.map((i) => i.id), DRAFT_ITEMS.map((i) => i.id));
  for (const item of DRAFT_ITEMS) {
    const shown = data.items.find((i) => i.id === item.id)!;
    assert.equal(shown.stem, item.stem);
    assert.deepEqual(shown.options.map((o) => o.text), item.options.map((o) => o.text), `${item.id} 선택지 순서`);
  }
  assert.equal(data.na, NA_OPTION_TEXT);
  assert.ok(page.includes(NA_OPTION_TEXT.slice(0, 10)));
});

test("채점 방향 · 관점 이름 · 문항의 의도 · 점수 관련 낱말이 화면 어디에도 없다", () => {
  for (const html of [takeFragment(), takeStandalone()]) {
    for (const id of PERSPECTIVE_IDS) {
      const p = PERSPECTIVES[id];
      for (const text of [p.name, p.high, p.low, p.purpose]) assert.ok(!html.includes(text), `관점 설명이 들어 있음: ${text}`);
      assert.doesNotMatch(html, new RegExp(`["'>\\s(]${id}["'<\\s):,]`), `관점 번호 ${id}`);
    }
    for (const item of DRAFT_ITEMS) assert.ok(!html.includes(item.purpose), `${item.id} 문항의 의도가 들어 있음`);
    for (const word of ["기여값", "점수 방향", "높은 쪽", "낮은 쪽", "\"w\":", "weights", "perspective", "scoreDraft", "contribution"]) {
      assert.ok(!html.includes(word), `금지 낱말: ${word}`);
    }
  }
});

test("공식 검사 이름 · 정확도 · 진단 표현을 쓰지 않고, 정답이 없음 · 공식 검사가 아님 · 브라우저에만 저장됨을 밝힌다", () => {
  const html = takeFragment();
  assert.doesNotMatch(html, /MBTI|TCI|애착검사|정확도|적중|검증된/);
  assert.match(html, /정답이 없습니다/);
  assert.match(html, /공식 심리검사나 진단이 아닙니다/);
  assert.match(html, /이 브라우저에만 저장/);
  assert.match(html, /채점 방향과 운영자 설명이 없는 화면/);
});

test("검토 모드의 의견 항목: 정답이 뻔함 · 둘 이상 나 같음 · 뜻을 모름 · 고르고 싶은 답이 없음 + 괜찮음 · 고쳐야 함 · 빼기", () => {
  const html = takeFragment();
  for (const text of ["정답이 뻔해 보였어요", "둘 이상이 다 나 같았어요", "뜻을 모르겠어요", "고르고 싶은 답이 없었어요", "괜찮음", "고쳐야 함", "빼기"]) assert.ok(html.includes(text), text);
});

test("외부 주소로 보내거나 불러오지 않는다 (답은 이 브라우저에만 남는다)", () => {
  const html = takeStandalone();
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|<script[^>]+src=|<link[^>]+href=|https?:\/\//);
});

test("검토 모드에 인터뷰 칸이 있다: 질문을 어떻게 이해했는지 · 왜 이 답을 골랐는지 · 같은 행동을 다른 이유로도 할 수 있는지 — 복사할 글에도 들어가고, 실명 · 연락처를 적지 말라고 알린다", () => {
  const html = takeFragment();
  for (const text of ["이 질문을 어떻게 이해했나요?", "왜 이 답을 골랐나요?", "같은 행동을 다른 이유로도 할 수 있나요?", "질문을 이해한 방식 · 고른 이유", "실명 · 연락처는 적지 마세요", "시범용"]) assert.ok(html.includes(text), text);
  // 인터뷰 칸도 채점 방향 · 관점 이름을 싣지 않는다 (위 테스트가 전체 화면을 검사한다)
  assert.doesNotMatch(html, /\bunscored\b|reason:/);
});
