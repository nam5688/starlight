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

/** 스스로를 해치는 생각이 담긴 글 — 운세 풀이로 답하지 않고, 고정 안내만 보인다 (AI를 부르지 않는다) */
const CRISIS = /죽고\s*싶|죽어\s*버리|자살|목숨을?\s*끊|스스로\s*(생을|목숨)|극단적\s*선택|사라지고\s*싶|살기\s*싫|살고\s*싶지\s*않|자해|손목을?\s*그/;

export const isCrisisQuestion = (text: string) => CRISIS.test(text);

/** 마음이 많이 힘든 글에 보이는 고정 안내 — 풀이로 답하지 않고, 곁의 사람과 전문 상담으로 이어 준다 */
export const CRISIS_REPLY: string[] = [
  "많이 힘든 이야기로 읽혀서, 운세 풀이로 답하지 않을게요. 지금 마음이 어떤지가 먼저예요.",
  "혼자 견디지 않았으면 해요. 곁에 믿을 수 있는 사람에게 지금 바로 이야기해 주세요. 자살예방 상담전화 109(24시간)에서도 전문 상담사와 이야기할 수 있어요. 위급하면 119에 연락해 주세요.",
];
