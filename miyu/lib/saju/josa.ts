// 받침에 따라 조사를 고른다 (수가 · 목이, 인과 · 오와). 간지 · 오행 이름처럼 바뀌는 단어 뒤에 쓴다.

const hasBatchim = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
};

export const iga = (word: string) => `${word}${hasBatchim(word) ? "이" : "가"}`;
export const wagwa = (word: string) => `${word}${hasBatchim(word) ? "과" : "와"}`;
