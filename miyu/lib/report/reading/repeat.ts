// 읽기 구조 리포트(AI 초안)에서 같은 표현이 여러 곳에 되풀이되는지 찾는다 — "한 주제에 한 번" 규칙을 글자 수준에서 확인하는 어림.
// 공백 · 문장부호를 뺀 글에서 REPEAT_MIN_CHARS자 이상 같은 토막이 서로 다른 두 글 조각에 나오면 반복으로 본다.
// 한계: 말만 바꿔 되풀이한 글(같은 뜻의 다른 표현)은 찾지 못한다. 어림이며 좋은 글의 보증이 아니다 — 그 부분은 가려 읽는 평가가 본다.
import type { ReadingDraftV1 } from "./types.ts";
import { visibleTexts } from "./validate.ts";

/** 이 글자 수(공백 · 문장부호 제외) 이상 같은 토막이 두 군데에 있으면 반복이다 (실제 AI 글에서 "상황이 바뀌면 방향을 빠르게"가 12자로 되풀이됐다) */
export const REPEAT_MIN_CHARS = 12;

export type RepeatedPhrase = { phrase: string; where: [string, string] };

type Entry = { where: string; text: string; norm: string; at: number[] };

function entryOf(where: string, text: string): Entry {
  const at: number[] = [];
  let norm = "";
  [...text].forEach((ch, i) => {
    if (/[\p{L}\p{N}]/u.test(ch)) {
      norm += ch;
      at.push(i);
    }
  });
  return { where, text, norm, at };
}

/** 시기 구역의 연도 · 기간 · 시나리오는 같은 주제를 층층이 풀어 쓰는 틀이라 서로 겹치는 것을 반복으로 세지 않는다 */
const sameFlow = (a: string, b: string) => a.startsWith("flow") && b.startsWith("flow");

export function findRepeatedPhrases(d: ReadingDraftV1, minChars: number = REPEAT_MIN_CHARS): RepeatedPhrase[] {
  const entries = visibleTexts(d).map((t) => entryOf(t.where, t.text));
  const seen = new Map<string, number>();
  const found = new Map<string, RepeatedPhrase>();
  entries.forEach((e, idx) => {
    for (let p = 0; p + minChars <= e.norm.length; p++) {
      const gram = e.norm.slice(p, p + minChars);
      const first = seen.get(gram);
      if (first === undefined) {
        seen.set(gram, idx);
        continue;
      }
      const other = entries[first];
      if (first === idx || sameFlow(other.where, e.where)) continue;
      const key = `${other.where}|${e.where}`;
      if (found.has(key)) continue;
      // 같은 토막을 양쪽에서 끝까지 늘려 읽을 수 있는 구절로 돌려준다
      const q = other.norm.indexOf(gram);
      let len = minChars;
      while (p + len < e.norm.length && q + len < other.norm.length && e.norm[p + len] === other.norm[q + len]) len++;
      const phrase = e.text.slice(e.at[p], e.at[p + len - 1] + 1).trim();
      found.set(key, { phrase, where: [other.where, e.where] });
    }
  });
  return [...found.values()];
}

/** 고쳐 쓰기를 부탁할 때 모델에게 보여 줄 문장 (글 내용이 아니라 반복된 구절과 위치만) */
export function repeatMessages(repeats: RepeatedPhrase[], limit = 4): string[] {
  return repeats.slice(0, limit).map((r) => `같은 표현이 여러 곳에 되풀이돼요: ‘${r.phrase}’ (${r.where[0]} · ${r.where[1]}). 한 곳에서만 쓰고, 다른 곳에서는 그 주제에서 새로 알 수 있는 것으로 바꿔 주세요.`);
}
