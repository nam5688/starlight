// 실행: npm test — 내 고민 자세히 알려주기 입력 규칙
import assert from "node:assert/strict";
import { test } from "node:test";
import { contextForPrompt, filledFields, normalizeContextInput, redactPersonalInfo } from "./context.ts";

test("입력 정리: 주제는 꼭 고르고, 글은 모두 선택이며, 앞뒤 공백 · 빈 줄 · 제어 문자를 정리한다", () => {
  const ok = normalizeContextInput({ topic: "marriage", question: "  결혼을 해도 될지\r\n\r\n\r\n\r\n궁금해요  ", situation: "\u0007" });
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(ok.value.question, "결혼을 해도 될지\n\n궁금해요");
  assert.equal(ok.value.situation, "");
  assert.equal(ok.value.excerpt, "");
  assert.deepEqual(filledFields(ok.value), ["지금 가장 궁금한 문제"]);

  const noTopic = normalizeContextInput({ question: "궁금해요" });
  assert.ok(!noTopic.ok && noTopic.errors.includes("고민 주제를 골라 주세요."));
  const badTopic = normalizeContextInput({ topic: "health" });
  assert.ok(!badTopic.ok);
});

test("글자 수: 항목마다 정한 길이를 넘으면 저장하지 않는다 (대화는 필요한 부분만 1,500자)", () => {
  const long = normalizeContextInput({ topic: "work", question: "가".repeat(301), excerpt: "나".repeat(1500) });
  assert.ok(!long.ok && long.errors.length === 1 && /300자까지/.test(long.errors[0]));
  const tooLongExcerpt = normalizeContextInput({ topic: "work", excerpt: "나".repeat(1501) });
  assert.ok(!tooLongExcerpt.ok && /1500자까지/.test(tooLongExcerpt.errors[0]));
});

test("개인정보 가리기: 휴대폰 · 일반 전화 · 이메일 · 주민번호 · 카드 · 긴 숫자를 가린다", () => {
  const cases: [string, string][] = [
    ["연락은 010-1234-5678로", "연락은 [연락처 가림]로"],
    ["01012345678 이에요", "[연락처 가림] 이에요"],
    ["+82 10 1234 5678", "[연락처 가림]"],
    ["회사 02-123-4567", "회사 [연락처 가림]"],
    ["메일 me.name+1@example.co.kr 로", "메일 [이메일 가림] 로"],
    ["번호 900101-1234567", "번호 [주민번호 가림]"],
    ["카드 1234 5678 9012 3456", "카드 [번호 가림]"],
    ["계좌 110123456789", "계좌 [번호 가림]"],
  ];
  for (const [input, expected] of cases) assert.equal(redactPersonalInfo(input).text, expected, input);
  // 날짜 · 나이 · 금액은 그대로
  const keep = "2026년 3월에 이직, 32살, 연봉 4500만 원, 3년 차";
  assert.deepEqual(redactPersonalInfo(keep), { text: keep, count: 0 });

  const saved = normalizeContextInput({ topic: "love", excerpt: "그 사람 번호 010 9876 5432 받았어" });
  assert.ok(saved.ok && saved.value.excerpt === "그 사람 번호 [연락처 가림] 받았어" && saved.redactions === 1);
});

test("AI 자료: 적은 항목만, 주제 이름과 더 자세히 풀 부분을 함께 보낸다 (회원번호 · 검사 번호 없음)", () => {
  const n = normalizeContextInput({ topic: "work", situation: "결정을 미뤄요", differed: "저는 충동적인 편" });
  assert.ok(n.ok);
  if (!n.ok) return;
  const block = contextForPrompt(n.value);
  assert.deepEqual(block, {
    topic: "일 · 진로 · 이직",
    focusGuide: "선택과 불확실성에 대한 반응, 일하는 방식이 살아나는 환경, 변화를 결정하는 기준",
    situation: "결정을 미뤄요",
    previousReading: { differed: "저는 충동적인 편" },
  });
  const marriage = contextForPrompt({ ...n.value, topic: "marriage" });
  assert.match(marriage.focusGuide, /관계를 결정하는 과정/);
});
