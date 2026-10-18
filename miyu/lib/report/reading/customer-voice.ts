// 고객이 읽는 글에 명리 말이 새어 나왔는지 세는 경고(WARN) 지표 — 운영자 조율(2026-10-18, D-A): 본문 · 제목은 사람의 성향 · 경험 · 관계 · 기회 이야기로 바로 시작하고,
// 한자 · 간지 · 십성 · 지장간 · 통근 · 월령 · 합충형해 같은 전문용어는 본문에서 뺀다(내부 근거는 그대로 보존한다 — 이 검사는 근거를 바꾸지 않고 글만 본다).
//  · WARN만 한다: 저장을 막지 않고 고쳐 쓰기도 부탁하지 않는다(기존 용어 WARN 정책과 같다). BLOCK 정책은 하나도 낮추지 않았다.
//  · "물의 기운" 같은 오행의 한글 이름은 6번 개운 문단의 색 · 방향 · 숫자 · 장소 안내를 이어 주는 데만 허용한다 — 다른 장에서는 해설의 주인공이 되므로 경고한다.
// 낱말 · 패턴을 센 어림이다 — 표에 없는 말로 명리 설명을 풀어 쓴 문장 · 용어를 쓰지 않았지만 풀이 과정을 설명하는 문장은 못 센다(사람이 읽는 평가가 본다).
import { distinctTerms } from "./terms.ts";

const HANJA = /[一-鿿]/;
/** 일주 · 월주 · 년주 이름 — "정축일" "을해월"처럼 천간 + 지지 뒤에 일 · 월 · 년 · 주 · 생이 붙은 꼴만 센다("기사"처럼 일상어와 겹치는 말을 걸지 않으려고) */
const GANJI_NAME = /(?:갑|을|병|정|무|기|경|신|임|계)(?:자|축|인|묘|진|사|오|미|신|유|술|해)(?=일|월|년|주|생)/;
const PILLAR_WORD = /(?<![가-힣])(?:일|월|년)주(?![가-힣])/;
const ELEMENT_TALK = /(?:나무|불|흙|쇠|물)의 기운/;

/** 본문에 새어 나온 명리 말 목록(없으면 빈 배열) */
export function customerVoiceLeaks(text: string, o: { allowElementTalk?: boolean } = {}): string[] {
  const out = distinctTerms(text);
  if (HANJA.test(text)) out.push("한자");
  const ganji = GANJI_NAME.exec(text);
  if (ganji) out.push(`${ganji[0]}(간지 이름)`);
  if (PILLAR_WORD.test(text)) out.push("일주·월주·년주");
  if (!o.allowElementTalk) {
    const el = ELEMENT_TALK.exec(text);
    if (el) out.push(`${el[0]}(오행 해설)`);
  }
  return [...new Set(out)];
}

/** 경고 문구 — warn-policy.ts의 TERM_WARNING이 첫머리 "본문에 명리 용어("로 WARN임을 알아본다 */
export const customerVoiceMessage = (where: string, found: string[]): string =>
  `${where}: 본문에 명리 용어(${found.join(" · ")})가 있어요 — 고객이 읽는 글은 사람의 성향 · 경험 · 관계 이야기로 쓰고, 명리 말은 표현 예시의 생활 말로 옮기세요. 내부 근거는 그대로 두고 문장만 바꾸면 돼요(경고만 하고 저장은 막지 않습니다).`;
