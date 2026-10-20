// 입력 임시 보관 — 새로고침 · 앱 전환(카카오 로그인 등) · 뒤로 가기로 입력이 사라지지 않게, 이 브라우저 탭(sessionStorage)에만 보관한다.
// 서버로 보내지 않고, 탭을 닫으면 지워진다. 결과를 저장하면 지운다. 오래된 것(6시간)과 형식이 맞지 않는 것은 버린다.

import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { SCENE_IDS } from "../assessment/situational/reading.ts";
import type { Answers } from "../assessment/types.ts";
import { EMPTY_BASIC_INFO, type BasicInfo } from "./basic-info.ts";

export const DRAFT_KEY = "meu-analyze-draft";
export const DRAFT_VERSION = 1;
export const DRAFT_MAX_AGE_MS = 6 * 3600_000;

/** 어느 질문에 답하던 중이었나 — 표시가 없는 예전 보관값은 22문항이다 */
export type DraftAssessment = "situational-28" | "likert-22";

export type Draft = { v: number; savedAt: number; step: number; info: BasicInfo; answers: Answers; assessment: DraftAssessment };

const KNOWN_ITEMS = new Set(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => i.id)));
const KNOWN_SCENES = new Set(SCENE_IDS);

/** 무엇이든 입력했는지 (빈 상태는 보관하지 않는다) */
export function hasContent(info: BasicInfo, answers: Answers): boolean {
  const touched = (Object.keys(EMPTY_BASIC_INFO) as (keyof BasicInfo)[]).some((k) => info[k] !== EMPTY_BASIC_INFO[k]);
  return touched || Object.keys(answers).length > 0;
}

export function serializeDraft(input: { step: number; info: BasicInfo; answers: Answers; assessment?: DraftAssessment }, now: number): string {
  return JSON.stringify({ v: DRAFT_VERSION, savedAt: now, step: input.step, info: input.info, answers: input.answers, assessment: input.assessment ?? "likert-22" } satisfies Draft);
}

/**
 * 저장된 문자열을 검사해 안전한 값만 돌려준다. 맞지 않으면 null.
 * assessment는 지금 화면이 보여 주는 질문 — 다른 질문에 답하던 보관값의 응답은 서로 환산하지 않고 버린다(기본 정보는 살리고 첫 질문 단계로 돌아간다).
 */
export function parseDraft(raw: string | null, now: number, maxStep: number, assessment: DraftAssessment = "likert-22"): Draft | null {
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

  const stored: DraftAssessment = d.assessment === "situational-28" ? "situational-28" : "likert-22";
  const answers: Answers = {};
  const rawAnswers = (typeof d.answers === "object" && d.answers !== null ? d.answers : {}) as Record<string, unknown>;
  // 같은 질문의 응답만 복원한다 — 문항 id · 값의 범위(22문항 1~5 · 28문항 선택지 1~4)가 그 질문에 맞아야 한다
  if (stored === assessment) {
    const known = assessment === "situational-28" ? KNOWN_SCENES : KNOWN_ITEMS;
    const max = assessment === "situational-28" ? 4 : 5;
    for (const [id, v] of Object.entries(rawAnswers)) {
      if (known.has(id) && typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max) answers[id] = v;
    }
  }

  const rawStep = typeof d.step === "number" && Number.isInteger(d.step) ? Math.min(Math.max(d.step, 0), maxStep) : 0;
  // 다른 질문에 답하던 보관값은 응답이 사라졌으니 첫 질문 단계(기본 정보 다음)까지만 돌아온다
  const step = stored === assessment ? rawStep : Math.min(rawStep, 1);
  const draft: Draft = { v: DRAFT_VERSION, savedAt: d.savedAt, step, info: info as BasicInfo, answers, assessment };
  return hasContent(draft.info, draft.answers) ? draft : null;
}
