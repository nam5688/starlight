// 검사 결과 저장 — 응답 검증 → 서버 채점 → 사주 엔진 → 저장.
// 브라우저가 보낸 점수는 받지 않고, 응답 원본으로 항상 다시 계산한다.

import { ASSESSMENT_MODULES } from "../assessment/modules/index.ts";
import { validateAnswers } from "../assessment/scoring.ts";
import type { Answers } from "../assessment/types.ts";
import { MBTI_TYPES, PROVINCES, validateBasicInfo, type BasicInfo } from "../profile/basic-info.ts";
import { buildDevFreeSummary } from "../report/build-free-summary.ts";
import type { SajuEngine } from "../saju/engine.ts";
import type { AssessmentRecord, Channel, MiyuRepository } from "./ports.ts";

export type SubmitAssessmentResult =
  | { ok: true; assessment: AssessmentRecord }
  | { ok: false; message: string };

export async function submitAssessment(
  deps: { repo: MiyuRepository; saju: SajuEngine },
  input: { userId: string; channel: Channel; info: BasicInfo; answers: Answers; today: Date },
): Promise<SubmitAssessmentResult> {
  const { info } = input;
  const infoErrors = Object.values(validateBasicInfo(info, input.today));
  if (infoErrors.length > 0) return { ok: false, message: infoErrors[0] };

  const answers = pickKnownAnswers(input.answers);
  if (!validateAnswers(ASSESSMENT_MODULES, answers).ok) {
    return { ok: false, message: "답하지 않았거나 올바르지 않은 문항이 있습니다." };
  }

  const birthTime = info.birthTimeUnknown ? null : info.birthTime;
  const isLeapMonth = info.calendar === "lunar" && info.isLeapMonth;
  const knownMbti = (MBTI_TYPES as readonly string[]).includes(info.knownMbti) ? info.knownMbti : null;
  const year = Number(info.birthYear);
  const month = Number(info.birthMonth);
  const day = Number(info.birthDay);

  const summary = buildDevFreeSummary(answers);
  const saju = await deps.saju.calculate({ year, month, day, calendar: info.calendar, isLeapMonth, birthTime });

  const assessment = await deps.repo.insertAssessment({
    userId: input.userId,
    channel: input.channel,
    nickname: info.nickname.trim(),
    calendar: info.calendar,
    isLeapMonth,
    birthYear: year,
    birthMonth: month,
    birthDay: day,
    birthTime,
    knownMbti,
    answers,
    contentVersion: summary.contentVersion,
    source: summary.source,
    summary,
    saju,
  });

  await deps.repo.updateProfileNickname(input.userId, assessment.nickname);

  // 지역은 성향 분석과 분리해 따로 저장한다 (향후 장소 추천용)
  const province = (PROVINCES as readonly string[]).includes(info.regionProvince) ? info.regionProvince : "";
  if (province) {
    await deps.repo.saveRegion(input.userId, { province, district: info.regionDistrict.trim().slice(0, 20) });
  }

  return { ok: true, assessment };
}

/** 알려진 문항 id의 응답만 남긴다 (모르는 키는 저장하지 않는다) */
function pickKnownAnswers(raw: Answers): Answers {
  const known = new Set(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i) => i.id)));
  const out: Answers = {};
  for (const [id, value] of Object.entries(raw ?? {})) {
    if (known.has(id)) out[id] = value;
  }
  return out;
}

export function formatAssessmentBirth(a: Pick<AssessmentRecord, "calendar" | "isLeapMonth" | "birthYear" | "birthMonth" | "birthDay" | "birthTime">): string {
  const cal = a.calendar === "solar" ? "양력" : a.isLeapMonth ? "음력 윤달" : "음력";
  return `${a.birthYear}년 ${a.birthMonth}월 ${a.birthDay}일 (${cal}) · ${a.birthTime ?? "출생시간 모름"}`;
}
