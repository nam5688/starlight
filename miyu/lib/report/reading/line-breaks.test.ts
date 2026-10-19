// 실행: npm test — 읽기 구조 리포트의 줄바꿈 규칙(짧은 + 짧은 = 이어서, 긴 문장이 끼면 줄바꿈)을 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleReadingReport } from "../../samples/sample-reading-report.ts";
import { readFileSync } from "node:fs";
import { lineGroups, MAX_SENTENCES_PER_LINE, SHORT_SENTENCE_MAX, splitSentences } from "./line-breaks.ts";

const SHORT_A = "이 부분은 짧게 읽힙니다.";
const SHORT_B = "그래서 이어서 읽습니다.";
const LONG_A = "새로운 일 앞에서 위험과 변수를 먼저 살펴보고, 익숙한 방식을 선호하는 편입니다.";
const LONG_B = "충분히 알아본 뒤에 움직이는 모습으로 나타날 수 있습니다.";

test("운영자 예시 1: 긴 문장 + 긴 문장은 줄을 바꾼다", () => {
  assert.deepEqual(lineGroups(`${LONG_A} ${LONG_B}`), [LONG_A, LONG_B]);
});

test("운영자 예시 2: 짧은 문장 + 긴 문장은 줄을 바꾼다", () => {
  const short = "중요하게 여기는 것은 두 가지로 읽힙니다.";
  const long = "내놓는 결과가 충분히 다듬어져 있는지, 가까운 사람과 서로의 마음이 확인되는지입니다.";
  assert.ok(short.length <= SHORT_SENTENCE_MAX && long.length > SHORT_SENTENCE_MAX);
  assert.deepEqual(lineGroups(`${short} ${long}`), [short, long]);
});

test("짧은 문장 + 짧은 문장은 한 줄로 이어 붙인다", () => {
  assert.ok(SHORT_A.length <= SHORT_SENTENCE_MAX && SHORT_B.length <= SHORT_SENTENCE_MAX);
  assert.deepEqual(lineGroups(`${SHORT_A} ${SHORT_B}`), [`${SHORT_A} ${SHORT_B}`]);
});

test("긴 문장 + 짧은 문장도 줄을 바꾼다", () => {
  assert.deepEqual(lineGroups(`${LONG_A} ${SHORT_A}`), [LONG_A, SHORT_A]);
});

test("세 문장은 이웃한 쌍마다 같은 규칙을 적용한다", () => {
  assert.deepEqual(lineGroups(`${SHORT_A} ${SHORT_B} ${LONG_A}`), [`${SHORT_A} ${SHORT_B}`, LONG_A]);
  assert.deepEqual(lineGroups(`${LONG_A} ${SHORT_A} ${SHORT_B}`), [LONG_A, `${SHORT_A} ${SHORT_B}`]);
  assert.deepEqual(lineGroups(`${SHORT_A} ${LONG_A} ${SHORT_B}`), [SHORT_A, LONG_A, SHORT_B]);
});

test("한 문장 · 빈 글 · 점이 들어간 숫자는 그대로 둔다", () => {
  assert.deepEqual(lineGroups(LONG_A), [LONG_A]);
  assert.deepEqual(lineGroups(""), []);
  assert.deepEqual(lineGroups("   "), []);
  const date = "2024.08부터 2034.07까지, 지금은 그 앞부분을 지나고 있습니다.";
  assert.deepEqual(splitSentences(date), [date]);
});

test("글자는 하나도 바뀌지 않는다 — 줄을 합쳐 읽으면 원문과 같다 (저장된 글을 바꾸지 않는다)", () => {
  const all: string[] = [];
  for (const b of sampleReadingReport.blocks) all.push(b.summary, b.example ?? "", ...b.details, b.watch ?? "", b.caveat ?? "");
  all.push(sampleReadingReport.flow.summary, sampleReadingReport.flow.cardText);
  const squash = (s: string) => s.replace(/\s+/g, "");
  for (const t of all.filter(Boolean)) assert.equal(squash(lineGroups(t).join(" ")), squash(t));
});

test("예시 리포트의 첫 문단: 긴 두 문장은 두 줄이 된다", () => {
  const summary = sampleReadingReport.blocks[0].summary;
  const lines = lineGroups(summary);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.length > SHORT_SENTENCE_MAX));
});

// ───── 가독성 지시(2026-10-19): 한 문장 한 블록이 기본, 짧은 문장만 최대 두 개 묶기, 따옴표 · 괄호 · 숫자는 깨지지 않게 ─────

const S1 = "처음엔 조용해 보여요.";
const S2 = "속은 꽤 바빠요.";
const S3 = "그래도 티를 안 내요.";
const S4 = "혼자 정리하는 편이에요.";

test("짧은 문장이 줄줄이 이어져도 한 블록에는 문장이 최대 둘이다 — 셋째부터는 새 블록", () => {
  for (const x of [S1, S2, S3, S4]) assert.ok(x.length <= SHORT_SENTENCE_MAX, x);
  assert.equal(MAX_SENTENCES_PER_LINE, 2);
  assert.deepEqual(lineGroups(`${S1} ${S2} ${S3} ${S4}`), [`${S1} ${S2}`, `${S3} ${S4}`]);
  assert.deepEqual(lineGroups(`${S1} ${S2} ${S3}`), [`${S1} ${S2}`, S3]);
  for (const g of lineGroups(`${S1} ${S2} ${S3} ${S4} ${S1} ${S2} ${S3}`)) assert.ok(splitSentences(g).length <= 2);
});

test("긴 문장은 항상 자기 블록이고, 짧은 문장은 짝이 있을 때만 묶인다(한 문장 한 블록이 기본)", () => {
  assert.deepEqual(lineGroups(LONG_A), [LONG_A]);
  assert.deepEqual(lineGroups(`${S1} ${LONG_A} ${S2}`), [S1, LONG_A, S2]);
  assert.deepEqual(lineGroups(`${S1} ${S2} ${LONG_B} ${S3} ${S4}`), [`${S1} ${S2}`, LONG_B, `${S3} ${S4}`]);
});

test("따옴표 · 괄호 안의 마침표에서는 문장을 나누지 않고, 닫는 따옴표 · 괄호는 앞 문장에 붙는다", () => {
  const q = "그때 속으로 “이 정도면 충분하지. 더는 안 해도 돼.” 하고 넘기곤 했을 수 있어요.";
  assert.deepEqual(splitSentences(q), [q], "큰따옴표 안에서 나누지 않는다");
  const paren = "마음이 먼저 닫힐 수 있어요(상대 탓이 아니라 속도가 다른 거예요. 그래서 더 길게 느껴져요). 그러면 숨을 고르세요.";
  assert.deepEqual(splitSentences(paren), ["마음이 먼저 닫힐 수 있어요(상대 탓이 아니라 속도가 다른 거예요. 그래서 더 길게 느껴져요).", "그러면 숨을 고르세요."]);
  const closing = "“괜찮아.” 그렇게 말하고 돌아섰어요. 다음 문장이에요.";
  const parts = splitSentences(closing);
  assert.deepEqual(parts, ["“괜찮아.”", "그렇게 말하고 돌아섰어요.", "다음 문장이에요."], "닫는 따옴표는 앞 문장에 붙는다");
  assert.ok(parts.every((x) => !/^[”’)\]」』]/.test(x)), `줄이 닫는 기호로 시작하지 않는다: ${parts.join(" | ")}`);
  assert.deepEqual(splitSentences("정말요?! 그럼요. 네."), ["정말요?!", "그럼요.", "네."], "?!는 한 덩어리");
  assert.deepEqual(splitSentences("그가 말했어요. “정말 그럴까요?” 하고요."), ["그가 말했어요.", "“정말 그럴까요?” 하고요."]);
  assert.deepEqual(splitSentences("‘좋아요.’ 라고 했어요. 끝."), ["‘좋아요.’ 라고 했어요.", "끝."]);
});

test("숫자 · 날짜 · 번호의 점은 문장 끝이 아니다 — 연도 · 소수 · 기간 표기가 줄 사이에서 깨지지 않는다", () => {
  const t = "2022.12부터 2032.11까지 이어지는 시기예요. 만 26.5세 무렵처럼 읽지는 않아요. 3.5배라는 말도 쓰지 않아요.";
  assert.deepEqual(splitSentences(t), ["2022.12부터 2032.11까지 이어지는 시기예요.", "만 26.5세 무렵처럼 읽지는 않아요.", "3.5배라는 말도 쓰지 않아요."]);
  assert.deepEqual(splitSentences("1. 첫째는 이거예요. 2. 둘째는 저거예요."), ["1. 첫째는 이거예요.", "2. 둘째는 저거예요."], "문단 앞 번호가 혼자 한 줄이 되지 않는다");
  for (const g of lineGroups("2027년은 맡은 일을 책임지는 해예요. 만 36~46세 무렵에는 관계 주제가 두드러질 수 있어요.")) assert.ok(!/^\d{1,2}\.$/.test(g));
});

test("글자는 하나도 바뀌지 않는다 — 따옴표 · 괄호 · 숫자가 들어 있는 글도 블록을 합치면 원문과 같다", () => {
  const texts = [
    "그때 속으로 “이 정도면 충분하지. 더는 안 해도 돼.” 하고 넘기곤 했을 수 있어요. 지금도 그래요(2026년 기준). 마음이 급해지면 [잠깐 멈춤]부터 해 보세요.",
    "만 16~26세 무렵에는 배움과 도움이 채워지는 시기였을 수 있어요. 2012.12부터 2022.11까지예요. 정말요?! 네.",
    `${S1} ${S2} ${S3} ${S4}`,
  ];
  const squash = (x: string) => x.replace(/\s+/g, "");
  for (const t of texts) assert.equal(squash(lineGroups(t).join(" ")), squash(t));
});

test("화면: Prose는 블록마다 줄을 나누고 블록 사이에 작은 여백을 둔다(문단 안의 줄바꿈만, 글자는 그대로)", () => {
  const src = readFileSync(new URL("../../../components/ui/prose.tsx", import.meta.url), "utf8");
  assert.match(src, /className=\{i > 0 \? "mt-1\.5 block" : "block"\}/);
  assert.match(src, /lines\.length <= 1/);
  // 읽기 부품(reading-parts)은 같은 Prose를 다시 내보낼 뿐 다른 구현을 두지 않는다
  const parts = readFileSync(new URL("../../../components/report/reading-parts.tsx", import.meta.url), "utf8");
  assert.match(parts, /export \{ Prose \} from "@\/components\/ui\/prose"/);
  const free = readFileSync(new URL("../../../components/report/free-preview-body.tsx", import.meta.url), "utf8");
  assert.ok((free.match(/<Prose /g) ?? []).length >= 4, "무료 리포트 본문의 긴 문단도 같은 규칙으로 나눈다");
});
