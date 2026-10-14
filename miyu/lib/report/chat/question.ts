// 자유 질문 입력 정리 — 글자 수 · 제어 문자 · 개인정보(연락처 · 이메일 · 주민번호 · 카드 · 계좌)를 가리고, 마음이 많이 힘든 글은 AI에 보내지 않는다.
import { redactPersonalInfo } from "../../personalization/context.ts";
import { FREE_QUESTION_MAX } from "../reading/talk-room.ts";

export type CleanQuestion = { ok: true; text: string; redactions: number } | { ok: false; reason: "empty" | "too-long" };

export function cleanQuestion(raw: unknown): CleanQuestion {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const text = raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > FREE_QUESTION_MAX) return { ok: false, reason: "too-long" };
  const r = redactPersonalInfo(text);
  return { ok: true, text: r.text, redactions: r.count };
}

/**
 * 마음이 힘든 글의 구분 — 일반적인 슬픔 · 외로움 · 이별 · 연애 고민은 위기가 아니다(그것까지 막으면 상담이 되지 않는다).
 * - hard: 스스로를 해치겠다는 뜻 · 방법 · 계획이 분명한 표현 → 운세 풀이로 답하지 않고 AI를 부르지 않는다(고정 안내만)
 * - soft: "죽고 싶다 · 사라지고 싶다"처럼 힘든 마음의 표현일 수도, 말버릇일 수도 있는 것 → AI가 답하되 마음을 먼저 받아 주고, 답 뒤에 곁의 사람 · 상담전화 안내를 덧붙인다
 * - none: 그 밖의 모든 고민 (우울해요 · 외로워요 · 헤어져서 힘들어요 · 불안해요 포함)
 * 낱말로 센 어림이며 위기 판정이 아니다 — 실제 위기를 놓칠 수 있고 말버릇을 위기로 볼 수도 있다. 기준은 운영자(필요하면 전문가)가 확인한다.
 */
export type CrisisLevel = "none" | "soft" | "hard";
const HARD = /자살|자해|목숨을?\s*(끊|버리)|스스로\s*(생을|목숨)|극단적\s*선택|죽을\s*방법|죽는\s*방법|유서|투신|목을?\s*매|손목을?\s*(그|긋)|죽으려(고|고\s*(해|했))|죽어\s*버(리겠|리려|릴|렸)|죽을\s*(거|것)\s*(같|이)|약을?\s*(다\s*)?(먹고|털어)\s*(죽|자살)/;
const SOFT = /죽고\s*싶|죽어\s*버리고\s*싶|사라지고\s*싶|없어지고\s*싶|살기\s*싫|살고\s*싶지\s*않|살아\s*있고\s*싶지|다\s*끝내고\s*싶|모든\s*게\s*의미\s*없/;

export function crisisLevel(text: string): CrisisLevel {
  if (HARD.test(text)) return "hard";
  return SOFT.test(text) ? "soft" : "none";
}

/** 스스로를 해치겠다는 분명한 표현이 담긴 글 — 운세 풀이로 답하지 않고 고정 안내만 보인다 (AI를 부르지 않는다) */
export const isCrisisQuestion = (text: string) => crisisLevel(text) === "hard";

/** 분명한 위기 표현에 보이는 고정 안내 — 풀이로 답하지 않고, 곁의 사람과 전문 상담으로 이어 준다 */
export const CRISIS_REPLY: string[] = [
  "많이 힘든 이야기로 읽혀서, 운세 풀이로 답하지 않을게요. 지금 마음이 어떤지가 먼저예요.",
  "혼자 견디지 않았으면 해요. 곁에 믿을 수 있는 사람에게 지금 바로 이야기해 주세요. 자살예방 상담전화 109(24시간)에서도 전문 상담사와 이야기할 수 있어요. 위급하면 119에 연락해 주세요.",
];

/** 힘든 마음의 표현(soft)이 있는 글에는 AI의 답 뒤에 한 문단을 덧붙인다 — 답을 막지 않고 곁의 사람 · 상담전화를 알린다 */
export const CARE_NOTE = "많이 힘든 마음이 느껴져요. 혼자 견디지 말고, 곁의 믿을 수 있는 사람에게도 이야기해 보세요. 자살예방 상담전화 109(24시간)에서도 이야기할 수 있어요.";
