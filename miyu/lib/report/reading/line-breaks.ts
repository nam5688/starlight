// 읽기 구조 리포트의 줄바꿈 규칙 — 저장된 글은 바꾸지 않고, 화면에 보일 때 문장 길이로 줄을 나눈다 (운영자 2026-10-13).
//  · 짧은 문장 + 짧은 문장 → 이어서 (한 줄로 흐른다)
//  · 짧은 문장 + 긴 문장, 긴 문장 + 짧은 문장, 긴 문장 + 긴 문장 → 줄을 바꾼다
// "짧다"는 모바일 한 줄(약 20자)에 들어가는 정도로 본다. 값은 이 한 곳에서만 고친다.
export const SHORT_SENTENCE_MAX = 24;

/** 문장 나누기 — 마침표 · 물음표 · 느낌표 뒤의 공백에서 자른다 ("2024.08부터"처럼 뒤에 공백이 없는 점은 자르지 않는다) */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** 화면에 한 줄씩 보일 덩어리 — 이웃한 두 문장이 모두 짧을 때만 이어 붙인다 */
export function lineGroups(text: string, shortMax: number = SHORT_SENTENCE_MAX): string[] {
  const lines: string[] = [];
  let prevShort = false;
  for (const sentence of splitSentences(text)) {
    const short = sentence.length <= shortMax;
    if (lines.length > 0 && prevShort && short) lines[lines.length - 1] += ` ${sentence}`;
    else lines.push(sentence);
    prevShort = short;
  }
  return lines;
}
