// 실행: npm test — 리포트 궁합 지시문: 사주 궁합 지시문은 리포트 궁합을 더하면서 글자 하나도 바뀌지 않았고, 리포트 궁합 지시문은 응답 비교 규칙을 더한 별도 판이다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Evidence } from "../evidence.ts";
import { PAIR_PROMPT_VERSION, PAIR_SECTIONS, COMPAT_SECTIONS } from "./plan.ts";
import { buildCompatUserMessage, buildPairUserMessage, COMPAT_PROMPT_MARK, COMPAT_PROMPT_VERSION, COMPAT_SYSTEM_PROMPT, PAIR_PROMPT_MARK, PAIR_SYSTEM_PROMPT } from "./prompt.ts";

const SAVED = readFileSync(new URL("../../../docs/samples/prompts/compat-v1-prompt-0.3.txt", import.meta.url), "utf8");

const ev = (id: string, fact: string): Evidence => ({ id, source: id.startsWith("pair.") ? "survey" : "saju", topics: ["relationship"], strength: "moderate", fact, cue: "읽는 방식입니다." });

test("사주 궁합 지시문(0.3)은 리포트 궁합을 더하기 전과 글자 하나도 다르지 않다 — 보관본과 같다", () => {
  assert.equal(COMPAT_PROMPT_VERSION, "compat-v1-prompt-0.3");
  assert.equal(COMPAT_SYSTEM_PROMPT, SAVED);
});

test("리포트 궁합 지시문은 별도 판이다 — 표지 · 버전이 다르고 응답 비교 규칙이 들어 있다", () => {
  assert.notEqual(PAIR_SYSTEM_PROMPT, COMPAT_SYSTEM_PROMPT);
  assert.notEqual(PAIR_PROMPT_VERSION, COMPAT_PROMPT_VERSION);
  assert.ok(PAIR_SYSTEM_PROMPT.startsWith(PAIR_PROMPT_MARK));
  assert.ok(COMPAT_SYSTEM_PROMPT.startsWith(COMPAT_PROMPT_MARK));
  assert.ok(!PAIR_SYSTEM_PROMPT.includes(COMPAT_PROMPT_MARK), "가짜 AI 서버가 두 요청을 헷갈리지 않는다");
  assert.ok(PAIR_SYSTEM_PROMPT.includes("pair."), "응답 비교 근거(pair.*)를 설명한다");
  assert.ok(!COMPAT_SYSTEM_PROMPT.includes("pair."), "사주 궁합 지시문에는 응답 비교가 없다");
  // 사주 궁합 지시문의 모든 공통 규칙(해내야 하는 것 · 근거 · 지수를 쓰는 법 · 쓰지 않는 것)은 리포트 궁합에도 있다
  for (const line of ["[이 글이 해내야 하는 것", "[근거 — 사용자 메시지의 evidence 목록 안에서만]", "[궁합 지수와 커플 유형을 쓰는 법]", "[쓰지 않는 것]", "[말투와 모양]", "[출력]"]) {
    assert.ok(PAIR_SYSTEM_PROMPT.includes(line), `${line}이 리포트 궁합에도 있어야 한다`);
  }
});

test("리포트 궁합 지시문은 애착 유형 이름 · 응답 읽어 주기 · 상대의 원래 답 노출 · 응답으로 사주를 덮어쓰기를 막는다", () => {
  for (const rule of ["애착 유형 이름", "원래 답을 상대가 알 수 있게 쓰지 않는다", "덮어쓰지 않는다", "근거에 없는 영역의 응답을 지어내지 않으며", "한쪽만 뚜렷하게 답해 비교하지 않은 영역은 쓰지 않는다"]) {
    assert.ok(PAIR_SYSTEM_PROMPT.includes(rule), `${rule}`);
  }
});

test("리포트 궁합 영역에는 응답 영역(response)이 더해지고, 사주 궁합 영역에는 없다", () => {
  assert.ok(PAIR_SECTIONS.some((s) => s.id === "response"));
  assert.ok(!COMPAT_SECTIONS.some((s) => (s.id as string) === "response"));
});

test("리포트 궁합 요청에는 A님 · B님만 있고 mode가 pair이며, 사주 궁합 요청과 모양이 갈라진다", () => {
  const evidence = [ev("compat.day", "두 일간은 서로 다른 오행이에요"), ev("pair.anxiety", "관계 불안: A님은 높은 쪽, B님은 낮은 쪽 — 서로 다른 쪽")];
  const pair = buildPairUserMessage(evidence);
  const saju = buildCompatUserMessage(evidence);
  assert.ok(pair.startsWith("다음 자료로 리포트 궁합 풀이 JSON을 써 주세요."));
  assert.ok(saju.startsWith("다음 자료로 사주 궁합 풀이 JSON을 써 주세요."));
  const body = JSON.parse(pair.slice(pair.indexOf("\n") + 1));
  assert.equal(body.mode, "pair");
  assert.deepEqual(body.people, ["A님", "B님"]);
  assert.ok(body.sections.some((s: { id: string }) => s.id === "response"), "비교한 응답 근거가 있으면 응답 영역을 요청한다");
  const sajuBody = JSON.parse(saju.slice(saju.indexOf("\n") + 1));
  assert.equal(sajuBody.mode, undefined);
  assert.ok(!sajuBody.sections.some((s: { id: string }) => s.id === "response"));
  // 비교한 응답 근거가 없으면 응답 영역을 요청하지 않는다
  const onlySaju = JSON.parse(buildPairUserMessage([ev("compat.day", "x")]).split("\n").slice(1).join("\n"));
  assert.ok(!onlySaju.sections.some((s: { id: string }) => s.id === "response"));
});
