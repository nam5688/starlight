// 글 안의 {name} 자리표시자를 닉네임으로 채운다 — 의존하는 파일이 없는 순수 함수다(조립 · 읽기용 풀어 쓰기가 같이 쓴다).
// 모델은 실제 이름을 받지 않고 {name}만 쓴다(운영자 조율 2026-10-18: 이름 미제공 시 {name} 또는 빈 "님"이 화면에 남지 않게).
//  · 이름이 있으면: {name}을 이름으로 바꾼다(따옴표 · 역슬래시가 있어도 JSON이 깨지지 않게 이스케이프).
//  · 이름이 비어 있으면: "{name} 님은" 같은 호칭을 통째로 지운다("신중한 편이에요"처럼 이름을 빼도 문장이 성립하게 쓰라고 지시문이 안내한다). "{name} 님만 · 님도"는 "본인만 · 본인도"로 바꾼다. 남은 {name}도 지운다.
// JSON 문자열을 받아 JSON 문자열을 돌려준다(글자 속 {name}만 건드린다).

/** 이름이 있을 때의 호칭("○○ 님")과 없을 때의 빈 호칭 — 코드가 붙이는 고정 문구가 같이 쓴다 */
export const honorific = (name: string): string => (name.trim() ? `${name.trim()} 님` : "");

export function fillNameInJson(json: string, name: string): string {
  const n = name.trim();
  if (n) return json.replaceAll("{name}", JSON.stringify(n).slice(1, -1));
  // "님만 · 님도"는 조사가 뜻을 담고 있어 그냥 지우면 문장 뜻이 바뀐다("{name} 님만 아는 일" → "아는 일") — "본인만 · 본인도"로 바꾼다. 나머지 조사(은 · 는 · 이 · 가 · 을 · 를 · 의 · 께서)는 호칭과 함께 지운다
  return json
    .replace(/\{name\}\s*님(만|도)/g, "본인$1")
    .replace(/\{name\}\s*님(?:께서|[은는이가을를의께과와])?\s*/g, "")
    .replace(/\{name\}\s*/g, "");
}
