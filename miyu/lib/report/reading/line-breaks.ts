// 읽기 구조 리포트의 줄바꿈 규칙 — 저장된 글은 바꾸지 않고, 화면에 보일 때 문장 단위로 블록을 나눈다 (운영자 2026-10-13, 가독성 지시 2026-10-19로 한 문장 한 블록이 기본이 됐다).
//  · 기본은 한 문장이 한 블록(한 줄 덩어리)이다.
//  · 이웃한 두 문장이 모두 짧을 때만 한 블록으로 묶고, 한 블록에 문장은 최대 두 개다(짧은 문장이 줄줄이 이어 붙어 덩어리가 되지 않게).
//  · 짧은 문장 + 긴 문장, 긴 문장 + 짧은 문장, 긴 문장 + 긴 문장은 블록을 나눈다.
// "짧다"는 모바일 한 줄(약 20자)에 들어가는 정도로 본다. 값은 이 한 곳에서만 고친다.
//
// 문장을 나눌 때 지키는 것(글자를 깨뜨리지 않는다):
//  · 따옴표 “ ” ‘ ’ " ' 와 괄호 ( ) [ ] 「 」 안의 마침표 · 물음표에서는 나누지 않는다 — 인용 · 덧붙인 설명이 한 덩어리로 남는다.
//  · 마침표 뒤에 따라붙는 닫는 따옴표 · 괄호는 앞 문장에 붙는다(줄이 닫는 따옴표로 시작하지 않는다).
//  · "2024.08" · "3.5" 처럼 숫자 사이의 점, 문단 앞 "1." 같은 번호는 문장 끝이 아니다.
export const SHORT_SENTENCE_MAX = 24;
/** 한 블록에 묶을 수 있는 문장 수의 상한 */
export const MAX_SENTENCES_PER_LINE = 2;

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "“": "”", "‘": "’", "「": "」", "『": "』", "（": "）" };
const CLOSING = new Set([...Object.values(PAIRS), '"', "'"]);
const END_MARKS = new Set([".", "!", "?", "。"]);
/** 끝에 닫는 따옴표가 붙은 문장 / 인용 바로 뒤에 붙어 문장을 이어 가는 말 */
const QUOTE_CLOSERS = /[”’"'」』][)\]]*$/;
const QUOTE_TAIL = /^(하고|하며|하면서|하곤|하는|하기|했던|했다고|한다고|라고|라며|라는|라니|이라고|이라는|이라니|라서)/;

/** 문장 나누기 — 마침표 · 물음표 · 느낌표(와 따라붙는 닫는 따옴표 · 괄호) 뒤의 공백에서 자른다. 따옴표 · 괄호 안에서는 자르지 않는다 */
export function splitSentences(text: string): string[] {
  const t = text.replace(/\r/g, "");
  const out: string[] = [];
  const stack: string[] = [];
  let cur = "";
  const push = () => {
    const s = cur.replace(/\s+/g, " ").trim();
    if (s) out.push(s);
    cur = "";
  };
  const track = (ch: string) => {
    const top = stack[stack.length - 1];
    if (ch === '"' || ch === "'") {
      if (top === ch) stack.pop();
      else stack.push(ch);
    } else if (PAIRS[ch] !== undefined) stack.push(PAIRS[ch]);
    else if (top !== undefined && ch === top) stack.pop();
    // 짝이 맞지 않은 여는 기호가 문단 전체를 한 덩어리로 묶지 않게 깊이를 제한한다
    if (stack.length > 4) stack.length = 0;
  };

  let i = 0;
  while (i < t.length) {
    const ch = t[i];
    cur += ch;
    track(ch);
    i += 1;
    if (ch === "\n") {
      // 줄바꿈은 따옴표 · 괄호 밖에서만 문장 경계다
      if (stack.length === 0) push();
      continue;
    }
    if (!END_MARKS.has(ch)) continue;
    // 숫자 사이의 점(2024.08 · 3.5)은 문장 끝이 아니다
    if (ch === "." && /\d/.test(t[i - 2] ?? "") && /\d/.test(t[i] ?? "")) continue;
    // 문장 끝에 따라붙는 닫는 따옴표 · 괄호는 앞 문장에 붙인다
    while (i < t.length && (CLOSING.has(t[i]) || END_MARKS.has(t[i]))) {
      cur += t[i];
      track(t[i]);
      i += 1;
    }
    const next = t[i];
    if (next !== undefined && !/\s/.test(next)) continue; // 뒤에 공백 없이 글이 이어지면 나누지 않는다
    if (stack.length > 0) continue; // 따옴표 · 괄호가 아직 열려 있다
    // 인용이 닫힌 바로 뒤에 인용을 받는 말(“…” 하고 · 라고 · 라는)이 이어지면 같은 문장이다
    if (QUOTE_CLOSERS.test(cur) && QUOTE_TAIL.test(t.slice(i).trimStart())) continue;
    if (/^\s*\d{1,2}\.$/.test(cur)) continue; // 문단 앞 번호("1.")
    push();
  }
  push();
  return out;
}

/** 화면에 한 블록씩 보일 덩어리 — 기본은 한 문장이고, 이웃한 두 문장이 모두 짧을 때만 둘을 묶는다(한 블록에 문장은 최대 두 개) */
export function lineGroups(text: string, shortMax: number = SHORT_SENTENCE_MAX): string[] {
  const lines: string[] = [];
  let inLine = 0;
  let prevShort = false;
  for (const sentence of splitSentences(text)) {
    const short = sentence.length <= shortMax;
    if (lines.length > 0 && prevShort && short && inLine < MAX_SENTENCES_PER_LINE) {
      lines[lines.length - 1] += ` ${sentence}`;
      inLine += 1;
    } else {
      lines.push(sentence);
      inLine = 1;
    }
    prevShort = short;
  }
  return lines;
}
