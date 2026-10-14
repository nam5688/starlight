// 입력 임시 보관 — 새로고침 · 앱 전환(카카오 로그인 등) · 뒤로 가기로 입력이 사라지지 않게, 이 브라우저 탭(sessionStorage)에만 보관한다.
// 서버로 보내지 않고, 탭을 닫으면 지워진다. 결과를 저장하면 지운다. 오래된 것(6시간)과 형식이 맞지 않는 것은 버린다.

import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import type { Answers } from "../assessment/types.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "./basic-info.ts";

export const DRAFT_KEY = "meu-analyze-draft";
export const DRAFT_VERSION = 1;
export const DRAFT_MAX_AGE_MS = 6 * 3600_000;

export type Draft = { v: number; savedAt: number; step: number; info: BasicInfo; answers: Answers };

const KNOWN_ITEMS = new Set(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => i.id)));

/** 무엇이든 입력했는지 (빈 상태는 보관하지 않는다) */
export function hasContent(info: BasicInfo, answers: Answers): boolean {
  const touched = (Object.keys(EMPTY_BASIC_INFO) as (keyof BasicInfo)[]).some((k) => info[k] !== EMPTY_BASIC_INFO[k]);
  return touched || Object.keys(answers).length > 0;
}

export function serializeDraft(input: { step: number; info: BasicInfo; answers: Answers }, now: number): string {
  return JSON.stringify({ v: DRAFT_VERSION, savedAt: now, step: input.step, info: input.info, answers: input.answers } satisfies Draft);
}

/** 저장된 문자열을 검사해 안전한 값만 돌려준다. 맞지 않으면 null */
export function parseDraft(raw: string | null, now: number, maxStep: number): Draft | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.v !== DRAFT_VERSION || typeof d.savedAt !== "number" || now - d.savedAt > DRAFT_MAX_AGE_MS || d.savedAt > now + 60_000) return null;

  const rawInfo = (typeof d.info === "object" && d.info !== null ? d.info : {}) as Record<string, unknown>;
  const info = { ...EMPTY_BASIC_INFO } as Record<string, unknown>;
  for (const key of Object.keys(EMPTY_BASIC_INFO) as (keyof BasicInfo)[]) {
    const v = rawInfo[key];
    // 기본값과 같은 종류(문자열 · 불리언)의 값만 받는다
    if (typeof v === typeof EMPTY_BASIC_INFO[key]) info[key] = typeof v === "string" ? v.slice(0, 100) : v;
  }

  if (info.gender !== "male" && info.gender !== "female") info.gender = "";

  const answers: Answers = {};
  const rawAnswers = (typeof d.answers === "object" && d.answers !== null ? d.answers : {}) as Record<string, unknown>;
  for (const [id, v] of Object.entries(rawAnswers)) {
    if (KNOWN_ITEMS.has(id) && typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5) answers[id] = v;
  }

  const step = typeof d.step === "number" && Number.isInteger(d.step) ? Math.min(Math.max(d.step, 0), maxStep) : 0;
  const draft: Draft = { v: DRAFT_VERSION, savedAt: d.savedAt, step, info: info as BasicInfo, answers };
  return hasContent(draft.info, draft.answers) ? draft : null;
}
