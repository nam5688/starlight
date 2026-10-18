// 출생 시각을 모르는 사람의 글 검사 — 근거 목록에 saju.hour.unknown이 있을 때만 쓴다(운영자 2026-10-17).
//  · 오행 · 십성이 "없다 · 적다"는 시주를 뺀 세 기둥 기준이다 — 사주 전체에 없다는 뜻으로 읽히게 쓰지 않는다(같은 문장이나 바로 앞 문장에 세 기둥 · 시주 제외 · 시각을 몰라 같은 범위 말이 있어야 한다).
//  · 시주로 읽는 풀이(자녀 · 말년 · 시주에 놓이는 것)와 신강 · 신약 판정은 쓰지 않는다 — 시주가 없으면 세력이 한 기둥 빠진 값이라 후보로만 두고 요소(월령 · 뿌리 · 세력)로 풀게 한다.
// 낱말 · 문장을 센 어림이다 — 범위 말을 붙였어도 실제로 범위를 지키는 풀이인지는 사람이 읽는 평가가 본다.
import { FAMILY_CLAIM } from "./story7-plan.ts";

type Piece = { where: string; text: string };

/** 시주를 뺀 세 기둥 기준이라는 범위를 밝히는 말 */
export const HOUR_SCOPE_MARK = /세 기둥|시주(?:를|는|가)?\s*(?:없|제외|뺀|몰라|모르)|시주에 있을 수|시[각간](?:을|은|이)?\s*(?:몰라|모르|없)|출생\s*시[각간](?:을|은|이)?\s*(?:몰라|모르|없)|여섯 글자|확인되는 범위|확인할 수 있는 범위/;

/** 오행 · 십성이 없거나 적다고 말하는 문장 — 오행 이름은 "기운 · 오행"이 붙을 때만 센다("그럴 수는 없어요" 같은 말을 걸지 않으려고) */
export const NONE_CLAIM = /(?:[목화토금수]\s*(?:\([^)]{1,8}\)\s*)?(?:기운|오행)|비겁|식상|재성|관성|인성)[^.!?]{0,16}(?:없(?:어|는|다|습니다|고|으|음)|0개|하나도|비어|비었|전혀|적(?:어요|은|게|다|습니다)|부족)/;

/**
 * 시주로 읽는 풀이 — 자녀 · 말년 · 시주에 놓이는 것(시주를 "몰라서 읽지 않았다"고 범위를 밝히는 "시주를 · 시주는 · 시주가"는 허용).
 * "시주에 있을 수 있어요"는 지시문이 범위를 밝히라고 알려 준 문구(HOUR_SCOPE_MARK)라 풀이로 세지 않는다 — 실제 AI 시험(2026-10-17)에서 지시문 그대로 쓴 이 문구를
 * 검사가 시주 풀이로 막은 모순을 고쳤다(시주에 놓인 것을 읽는 "시주에 놓인 ~ · 시주에 ~이 있어서"는 그대로 막는다).
 */
export const HOUR_TOPIC = /자녀|자식|말년|노년|노후|시주(?:에(?!(?:도)? 있을 수(?:도)? 있|(?:도)? 있을지도 (?:모|몰))|의|로|와|에서)/;

/** 신강 · 신약 판정 — 시주가 없으면 세력 요소가 한 기둥 빠진 값이라 부르지 않는다("신약 개발" 같은 일상어는 제외) */
export const STRENGTH_VERDICT = /신강|신약(?! ?(?:개발|연구|후보|회사|임상|시험))/;

/** "2032년 11월"처럼 연도와 월을 함께 쓴 말 */
export const DAEUN_MONTH_CLAIM = /\d{4}년\s?\d{1,2}월/;

/** 가족에게 있었던 일을 지나간 사실로 쓰는 말 — 입력받은 가족 정보는 없으므로 전통 해석 표지를 붙여도 지난 일로 단정하지 않는다(시주 유무와 상관없다) */
export const FAMILY_PAST = /받지 못했|받지 못한|받지 못하고|도움을 못 받|떨어져 지냈|떨어져 자랐|일찍 떠|돌아가셨|이혼|사별|불화가 있었|사이가 나빴|외면|버림받/;

const sentencesOf = (t: string) => t.match(/[^.!?。\n]+[.!?。]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [];

/** 출생 시각을 모를 때 글이 지켜야 할 범위 — 지키지 않은 곳마다 이유를 돌려준다 */
export function hourUnknownErrors(texts: Piece[]): string[] {
  const out: string[] = [];
  for (const { where, text } of texts) {
    const sentences = sentencesOf(text);
    sentences.forEach((sentence, i) => {
      if (NONE_CLAIM.test(sentence) && !HOUR_SCOPE_MARK.test(sentence) && !HOUR_SCOPE_MARK.test(sentences[i - 1] ?? "")) {
        out.push(`${where}: "${sentence.slice(0, 40)}…" — 출생 시각을 몰라 오행 · 십성의 "없음 · 적음"은 시주를 뺀 세 기둥 기준이에요. 사주 전체에 없는 것처럼 쓰지 말고 "세 기둥으로 보면 ~는 보이지 않아요(시주에 있을 수 있어요)"처럼 범위를 같은 문장이나 바로 앞 문장에 밝히세요.`);
      }
    });
    const topic = HOUR_TOPIC.exec(text);
    if (topic) out.push(`${where}: 출생 시각을 몰라 시주로 읽는 풀이("${topic[0]}")는 쓰지 않아요 — 자녀 · 말년 · 시주에 놓이는 것은 알 수 없어요. 연주 · 월주 · 일주로 읽을 수 있는 풀이만 쓰세요.`);
    // 대운이 바뀌는 달을 정확히 말하는 문장 — 출생 시각을 모르면 그 달이 몇 달 달라지므로 연도 "무렵"으로만 말한다(근거 문구에 적혀 있다)
    for (const sentence of sentences) {
      if (/대운/.test(sentence) && DAEUN_MONTH_CLAIM.test(sentence)) out.push(`${where}: "${sentence.slice(0, 40)}…" — 출생 시각을 몰라 대운이 바뀌는 달은 정할 수 없어요(시각에 따라 몇 달 달라져요). "2032년 무렵"처럼 연도로만 말하고 월은 쓰지 마세요.`);
    }
    const strength = STRENGTH_VERDICT.exec(text);
    if (strength) out.push(`${where}: 출생 시각을 몰라 강약을 "${strength[0]}"으로 부르지 않아요 — 세력이 한 기둥 빠진 값이라 시주에 따라 달라질 수 있어요. 월령을 얻었는지 · 뿌리가 있는지 같은 요소로 풀어 쓰세요.`);
  }
  return out;
}

/** 가족 문장에 지난 일을 사실처럼 쓴 곳 — 시주 유무와 상관없이 쓴다(운영자 2026-10-17: 없는 가족사를 사실처럼 만들지 않는다) */
export function familyPastErrors(texts: Piece[]): string[] {
  const out: string[] = [];
  for (const { where, text } of texts) {
    for (const sentence of sentencesOf(text)) {
      const family = FAMILY_CLAIM.exec(sentence);
      const past = FAMILY_PAST.exec(sentence);
      if (family && past) out.push(`${where}: "${sentence.slice(0, 40)}…" — 가족("${family[0]}")에게 있었던 일("${past[0]}")을 지난 사실처럼 쓰지 않아요 — 입력받은 가족 정보가 없어요. "전통에서는 ~쪽으로 읽어요 · ~기 쉬운 구조예요"처럼 사주에서 읽은 경향과 조건으로 쓰세요.`);
    }
  }
  return out;
}
