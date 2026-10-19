// 실행: npm test — 리포트 궁합 지시문: 사주 궁합 지시문(0.6)과 리포트 궁합 지시문(0.4)은 보관본과 같고(2026-10-19 고객용 서술 개편), 리포트 궁합 지시문은 응답 비교 규칙과 6번 장(서로에게 어떤 사람일까?)을 더한 별도 판이다.
// 이전 판(0.5 · 0.3 — 명리 용어를 풀이와 함께 충분히 쓰던 판, 0.4 — 새 구성 이전의 다섯 영역 + 시기 + 응답 구성)은 보관만 한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Evidence } from "../evidence.ts";
import { readSource } from "../test-source.ts";
import { PAIR_PROMPT_VERSION, PAIR_SECTIONS, COMPAT_SECTIONS } from "./plan.ts";
import { buildCompatUserMessage, buildPairUserMessage, COMPAT_PROMPT_MARK, COMPAT_PROMPT_VERSION, COMPAT_SYSTEM_PROMPT, PAIR_PROMPT_MARK, PAIR_SYSTEM_PROMPT } from "./prompt.ts";

const SAVED = readSource(new URL("../../../docs/samples/prompts/compat-v1-prompt-0.6.txt", import.meta.url));
const SAVED_PAIR = readSource(new URL("../../../docs/samples/prompts/pair-v1-prompt-0.4.txt", import.meta.url));
const SAVED_PREV = readSource(new URL("../../../docs/samples/prompts/compat-v1-prompt-0.5.txt", import.meta.url));
const SAVED_PREV_PAIR = readSource(new URL("../../../docs/samples/prompts/pair-v1-prompt-0.3.txt", import.meta.url));
const SAVED_OLD = readSource(new URL("../../../docs/samples/prompts/compat-v1-prompt-0.4.txt", import.meta.url));

const ev = (id: string, fact: string): Evidence => ({ id, source: id.startsWith("pair.") ? "survey" : "saju", topics: ["relationship"], strength: "moderate", fact, cue: "읽는 방식입니다." });

test("사주 궁합 지시문(0.6) · 리포트 궁합 지시문(0.4)은 보관본(docs/samples/prompts)과 글자 하나도 다르지 않고, 이전 판(0.5 · 0.3 · 0.4)은 보관만 한다", () => {
  assert.equal(COMPAT_PROMPT_VERSION, "compat-v1-prompt-0.6");
  assert.equal(PAIR_PROMPT_VERSION, "pair-v1-prompt-0.4");
  assert.equal(COMPAT_SYSTEM_PROMPT, SAVED);
  assert.equal(PAIR_SYSTEM_PROMPT, SAVED_PAIR);
  assert.ok(SAVED_OLD.includes("compat.timing") && SAVED_OLD !== COMPAT_SYSTEM_PROMPT, "이전 판 보관본은 남아 있고 지금 지시문과 다르다");
  assert.ok(SAVED_PREV.includes("명리 풀이가 이 글의 중심이다") && SAVED_PREV_PAIR.includes("명리 풀이가 이 글의 중심이다"), "0.5 · 0.3은 명리 용어를 풀이와 함께 충분히 쓰던 판이다");
  assert.notEqual(SAVED_PREV, COMPAT_SYSTEM_PROMPT);
  assert.notEqual(SAVED_PREV_PAIR, PAIR_SYSTEM_PROMPT);
});

test("고객용 서술(0.6 · 0.4): '명리 용어를 풀이와 함께 충분히 쓰기' 목표가 두 지시문 · 모든 장 질문에서 사라졌고, 두 사람의 모습 → 나타나는 상황 → 해 볼 행동 순서와 용어만 바꾼 추상 문장 금지가 들어 있다", () => {
  for (const prompt of [COMPAT_SYSTEM_PROMPT, PAIR_SYSTEM_PROMPT]) {
    assert.ok(!prompt.includes("명리 풀이가 이 글의 중심이다"));
    assert.ok(!/풀이를 붙여 충분히|풀이와 함께 써서 설명|명리 용어를 풀이와 함께|처음 쓸 때 바로 괄호/.test(prompt), "용어를 풀이와 함께 충분히 쓰라는 문구가 남아 있으면 안 된다");
    for (const must of ["[고객이 읽는 글 — 풀이는 사주로 하고, 글은 두 사람의 이야기로 쓴다]", "본문에는 이 말도 한자도 쓰지 않고", "용어만 바꿔 쓰지 않는다", "상생 = 한 사람이 더 챙기고 한 사람이 더 기대는 모양", "근거가 말하지 않는 두 사람의 구체적인 성격 · 습관 · 마음은 만들지 않는다", "이 지시문의 예시 문장을 그대로 옮기지 않는다", "두 사람의 모습 → 나타나는 상황 → 해 볼 행동"]) assert.ok(prompt.includes(must), must);
  }
  // 장마다 묻는 질문도 용어 해설이 아니라 사람의 모습으로 — 두 상품이 같은 질문이다
  for (const s of COMPAT_SECTIONS) assert.ok(!/명리 용어|풀이와 함께/.test(s.ask), `${s.id}: ${s.ask.slice(0, 40)}`);
  assert.ok(COMPAT_SECTIONS.find((s) => s.id === "harmony")!.ask.includes("사람의 방식으로 풀고"));
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
  for (const line of ["[이 글이 해내야 하는 것", "[근거 — 사용자 메시지의 evidence 안에서만]", "[궁합 지수와 커플 유형]", "[장마다 쓰는 법]", "[전통 해석과 개운법 — 쓴다]", "[쓰지 않는 것]", "[말투와 모양]", "[출력]"]) {
    assert.ok(PAIR_SYSTEM_PROMPT.includes(line), `${line}이 리포트 궁합에도 있어야 한다`);
  }
});

test("리포트 궁합 지시문은 애착 유형 이름 · 응답 읽어 주기 · 상대의 원래 답 노출 · 응답으로 사주를 덮어쓰기를 막는다", () => {
  for (const rule of ["애착 유형 이름", "점수 · 선택지 · 원래 답 옮기기를 쓰지 않고", "덮어쓰지 않고", "사주 풀이를 대체하지 않는다", "목록에 없는 영역을 비교하지 않는다", "한쪽만 뚜렷하게 답해 비교하지 않은 영역은 쓰지 않는다", "6번 view는 비교한 응답이 없어도 쓰되 그때는 사주만으로 쓴다"]) {
    assert.ok(PAIR_SYSTEM_PROMPT.includes(rule), `${rule}`);
  }
});

test("리포트 궁합은 일곱 장(6번 view = 서로에게 어떤 사람일까?)이고, 사주 궁합은 같은 장에서 6번만 뺀 여섯 장이다", () => {
  assert.deepEqual(PAIR_SECTIONS.map((s) => s.id), ["overview", "harmony", "fit", "friction", "love", "view", "advice"]);
  assert.deepEqual(COMPAT_SECTIONS.map((s) => s.id), ["overview", "harmony", "fit", "friction", "love", "advice"]);
  assert.equal(PAIR_SECTIONS.find((s) => s.id === "view")!.pairOnly, true);
  // 리포트 궁합 = 사주 궁합 풀이 + 응답 비교 — 나머지 여섯 장은 같은 질문이다
  for (const s of COMPAT_SECTIONS) assert.equal(PAIR_SECTIONS.find((x) => x.id === s.id)!.ask, s.ask, s.id);
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
  assert.equal(body.sections.length, 7, "리포트 궁합은 일곱 장");
  assert.ok(body.sections.some((s: { id: string }) => s.id === "view"), "6번 장(서로에게 어떤 사람일까?)을 요청한다");
  const sajuBody = JSON.parse(saju.slice(saju.indexOf("\n") + 1));
  assert.equal(sajuBody.mode, undefined);
  assert.equal(sajuBody.sections.length, 6);
  assert.ok(!sajuBody.sections.some((s: { id: string }) => s.id === "view"));
  // 비교한 응답 근거가 없어도 6번 장은 요청한다(사주만으로 쓴다 — 응답을 지어내지 않는다)
  const onlySaju = JSON.parse(buildPairUserMessage([ev("compat.day", "x")]).split("\n").slice(1).join("\n"));
  assert.ok(onlySaju.sections.some((s: { id: string }) => s.id === "view"));
});
