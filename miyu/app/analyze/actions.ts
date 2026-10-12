"use server";

import { redirect } from "next/navigation";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { parseAnswers, validateAnswers } from "@/lib/assessment/scoring";
import type { Answers } from "@/lib/assessment/types";
import { parseBasicInfo, validateBasicInfo, type BasicInfo } from "@/lib/profile/basic-info";
import { buildDevFreeSummary } from "@/lib/report/build-free-summary";
import type { FreeSummary } from "@/lib/report/types";
import type { SajuResult } from "@/lib/saju/engine";
import { birthDateError } from "@/lib/saju/manseryeok-engine";
import { submitAssessment } from "@/lib/services/assessment-service";
import { isAuthConfigured } from "@/server/env";
import { kakaoAuthorizeUrl } from "@/server/kakao";
import { savePendingSubmission } from "@/server/pending-submission";
import { sajuEngine, writeRepository } from "@/server/services";
import { consentPath, getMember } from "@/server/member";

export type ScoreResult = { ok: true; summary: FreeSummary; saju: SajuResult } | { ok: false; message: string };

function birthInput(info: BasicInfo) {
  return {
    year: Number(info.birthYear),
    month: Number(info.birthMonth),
    day: Number(info.birthDay),
    calendar: info.calendar,
    isLeapMonth: info.calendar === "lunar" && info.isLeapMonth,
    birthTime: info.birthTimeUnknown ? null : info.birthTime,
  };
}

/** 기본 정보 단계: 존재하지 않는 음력 날짜(없는 윤달 · 30일) · 미래 날짜를 미리 알려준다 */
export async function checkBirthAction(input: unknown): Promise<string | null> {
  const info = parseBasicInfo(input);
  if (!info) return "입력 형식이 올바르지 않습니다.";
  const basic = Object.values(validateBasicInfo(info, new Date()))[0];
  return basic ?? birthDateError(birthInput(info), new Date());
}

/**
 * 검사 응답을 서버에서 채점하고 사주를 계산해 무료 요약을 돌려준다 (저장하지 않음, 로그에도 남기지 않음).
 */
export async function scoreDevAnswers(input: { info: unknown; answers: unknown }): Promise<ScoreResult> {
  const info = parseBasicInfo(input?.info);
  const answers = parseAnswers(input?.answers);
  if (!info || !answers) return { ok: false, message: "응답 형식이 올바르지 않습니다." };
  const check = validateAnswers(ASSESSMENT_MODULES, answers);
  if (!check.ok) {
    return { ok: false, message: "답하지 않았거나 올바르지 않은 문항이 있습니다. 응답을 다시 확인해 주세요." };
  }
  const saju = await sajuEngine.calculate(birthInput(info));
  if (saju.status === "invalid") return { ok: false, message: saju.message };
  return { ok: true, summary: buildDevFreeSummary(answers), saju };
}

export type SaveResult = { ok: false; message: string };

/**
 * 결과 저장. 로그인돼 있으면 바로 저장하고 결과 화면으로 이동한다.
 * 로그인 전이면 결과를 암호화 쿠키에 잠시 보관하고 카카오 로그인으로 보낸다
 * (로그인 후 /auth/callback에서 저장).
 */
export async function saveResultAndContinue(input: { info: unknown; answers: unknown }): Promise<SaveResult> {
  if (!isAuthConfigured()) return { ok: false, message: "로그인이 아직 설정되지 않았습니다." };

  const info = parseBasicInfo(input?.info);
  const answers: Answers | null = parseAnswers(input?.answers);
  if (!info || !answers) return { ok: false, message: "입력 형식이 올바르지 않습니다." };
  const infoError = Object.values(validateBasicInfo(info, new Date()))[0];
  if (infoError) return { ok: false, message: infoError };
  if (!validateAnswers(ASSESSMENT_MODULES, answers).ok) {
    return { ok: false, message: "답하지 않은 문항이 있습니다." };
  }

  const member = await getMember();
  if (member?.needsConsent) {
    // 로그인은 됐지만 가입 동의 전: 결과를 보관하고 동의 화면으로 (동의 후 저장)
    await savePendingSubmission(info, answers);
    redirect(consentPath("/my"));
  }
  if (member) {
    const saved = await submitAssessment(
      { repo: writeRepository(), saju: sajuEngine },
      { userId: member.userId, channel: "web", info, answers, today: new Date() },
    );
    if (!saved.ok) return { ok: false, message: saved.message };
    redirect(`/results/${saved.assessment.id}`);
  }

  await savePendingSubmission(info, answers);
  const url = await kakaoAuthorizeUrl("/my");
  if (!url) return { ok: false, message: "카카오 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  redirect(url);
}
