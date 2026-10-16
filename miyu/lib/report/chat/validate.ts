// 자유 질문 답변 검사 — 저장 · 표시하는 것은 이 검사를 통과한 글뿐이다.
// 개인 통합 리포트와 같은 금지 규칙(단정 · 진단 · 사건 예언 · 사주 용어 · 점수 · 나이 · 원인 좁히기)에 채팅 전용 규칙(속마음 단정 · 결정 대신 내리기 · 투자 권유 · 합쇼체)을 더했다.
// 낱말 · 표지를 센 어림이며 좋은 글의 보증이 아니다.
import { FORBIDDEN, sentences } from "../v2/validate.ts";
import { AGE_TEXT, CAUSE_NARROWING, JARGON, RAW_THEME_TEXT, SCORE_TEXT } from "../reading/plan.ts";
import { CHAT_LIMITS as L } from "./plan.ts";

export type ChatCheck = { ok: true; paragraphs: string[] } | { ok: false; errors: string[] };

/** 부정 안내("알 수 없어요 · 아니에요")는 허용하려고 뒤에 오는 부정 표현을 따로 본다 */
const NEG = "(?![^.!?]{0,14}(수 있|알 수 없|모르|않|아니|없))";

const RULES: { re: RegExp; why: string }[] = [
  { re: new RegExp(`(상대|그 사람|그분|그 친구|걔|그 애)(은|는|이|가)?\\s*[^.!?]{0,18}(마음이 (식|변)|속으로|생각하고 있|좋아하고 있|싫어하고 있|떠나려|바람)${NEG}`), why: "상대의 속마음 단정" },
  { re: /(헤어지|이혼|퇴사|그만두|결혼|이직|사직|손절)\s*(하세요|세요|하는 게 (좋|맞)|는 게 (좋|맞)|해야 (해요|돼요)|하셔야|하셔도)/, why: "결정을 대신 내리는 말" },
  { re: /(투자|대출|주식|코인|펀드)[^.!?]{0,14}(하세요|하셔도|해도 (좋|돼)|사세요|추천|권해|유리)|수익[^.!?]{0,8}(보장|난다|날 거)/, why: "투자 · 대출 권유 또는 수입 보장" },
  { re: /(약을|약은)\s*(드세요|먹어|끊)|치료(하세요|받지 않아도)|병원에 (안 가|가지 않)/, why: "치료 · 약에 대한 지시" },
  { re: /(영험|신통|점괘|신기가|영적 능력|예지)/, why: "영적 · 예측 능력이 있는 것처럼 쓰는 표현" },
  { re: /(?:입니다|합니다|습니다|됩니다|십니다)[.!?]?(?:\s|$)/, why: "합쇼체 끝맺음 (해요체로 씁니다)" },
  { re: /[*#`]|^\s*[-•·]\s|^\s*\d+[.)]\s|^\s*\{|\}\s*$/m, why: "마크다운 · 목록 · JSON 표시" },
  { re: /\p{Extended_Pictographic}/u, why: "이모지" },
];

const paragraphsOf = (text: string): string[] => {
  const t = text.replace(/\r\n?/g, "\n").trim();
  const blocks = /\n\s*\n/.test(t) ? t.split(/\n\s*\n/) : t.split("\n");
  return blocks.map((p) => p.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
};

export function validateChatAnswer(raw: string): ChatCheck {
  const errors: string[] = [];
  const paragraphs = paragraphsOf(raw);
  if (paragraphs.length < L.paragraphs.min || paragraphs.length > L.paragraphs.max) errors.push(`문단은 ${L.paragraphs.min}~${L.paragraphs.max}개로 써 주세요 (지금 ${paragraphs.length}개).`);
  const total = paragraphs.join("").length;
  if (total > L.total) errors.push(`답 전체는 ${L.total}자 이하로 써 주세요 (지금 ${total}자).`);
  paragraphs.forEach((p, i) => {
    if (p.length < L.paragraph.min || p.length > L.paragraph.max) errors.push(`${i + 1}번째 문단은 ${L.paragraph.min}~${L.paragraph.max}자로 써 주세요 (지금 ${p.length}자).`);
    if (sentences(p).length > L.paragraph.sentencesMax) errors.push(`${i + 1}번째 문단은 ${L.paragraph.sentencesMax}문장 이하로 써 주세요.`);
  });

  errors.push(...contentIssues(paragraphs.join("\n")));
  return errors.length > 0 ? { ok: false, errors: [...new Set(errors)] } : { ok: true, paragraphs };
}

/**
 * 글의 내용 규칙 — 단정 · 진단 · 사건 예언 · 속마음 · 결정 대신 내리기 · 투자 · 사주 용어 · 점수 · 나이 · 원인 좁히기 · 합쇼체 · 마크다운 · 이모지.
 * 자유 질문 답과 맛보기 리포트가 같은 규칙을 쓴다(분량 · 문단 규칙은 각자 따로 검사한다).
 */
export function contentIssues(text: string): string[] {
  const errors: string[] = [];
  for (const f of FORBIDDEN) if (f.re.test(text)) errors.push(`쓸 수 없는 표현: ${f.why}`);
  for (const r of RULES) if (r.re.test(text)) errors.push(`쓸 수 없는 표현: ${r.why}`);
  if (JARGON.test(text)) errors.push("사주 용어(일간 · 대운 같은 말)는 쓰지 않고 쉬운 말로 풀어 써 주세요.");
  if (SCORE_TEXT.test(text)) errors.push("점수 · 퍼센트 · 확률은 쓰지 않습니다.");
  if (AGE_TEXT.test(text)) errors.push("나이를 말하는 표현은 쓰지 않습니다.");
  if (RAW_THEME_TEXT.test(text)) errors.push("시기 해석 키워드를 그대로 옮기지 않고 쉬운 말로 풀어 써 주세요.");
  if (CAUSE_NARROWING.test(text)) errors.push("원인을 하나로 좁히지 않고 \"~일 수 있어요\"로 써 주세요.");
  return errors;
}
