"use server";

import { redirect } from "next/navigation";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { parseAnswers, validateAnswers } from "@/lib/assessment/scoring";
import type { Answers } from "@/lib/assessment/types";
import { genderOf, parseBasicInfo, validateBasicInfo, type BasicInfo } from "@/lib/profile/basic-info";
import { buildDevFreeSummary } from "@/lib/report/build-free-summary";
import { buildFreePreview, type FreePreview } from "@/lib/report/preview";
import { seoulReference } from "@/lib/report/reference";
import { birthDateError } from "@/lib/saju/manseryeok-engine";
import { submitAssessment } from "@/lib/services/assessment-service";
import { isAuthConfigured } from "@/server/env";
import { kakaoAuthorizeUrl } from "@/server/kakao";
import { savePendingSubmission } from "@/server/pending-submission";
import { evaluateReferralSignup, registerReferralSignup } from "@/server/referral";
import { pathAfterSave } from "@/server/room-choice";
import { sajuEngine, writeRepository } from "@/server/services";
import { consentPath, getMember } from "@/server/member";

/** 브라우저에는 무료로 공개하는 미리보기만 보낸다 — 잠긴 내용(전체 이름 · 나머지 요약 · 점수 · 상세 · 실천 제안)은 여기 없다 */
export type ScoreResult = { ok: true; preview: FreePreview } | { ok: false; message: string };

function birthInput(info: BasicInfo) {
  return {
    year: Number(info.birthYear),
    month: Number(info.birthMonth),
    day: Number(info.birthDay),
    calendar: info.calendar,
    isLeapMonth: info.calendar === "lunar" && info.isLeapMonth,
    birthTime: info.birthTimeUnknown ? null : info.birthTime,
    gender: genderOf(info),
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
 * 검사 응답을 서버에서 채점하고 사주를 계산해 무료 미리보기를 돌려준다 (저장하지 않음, 로그에도 남기지 않음).
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
  return { ok: true, preview: buildFreePreview({ summary: buildDevFreeSummary(answers), saju, reference: seoulReference(new Date()) }) };
}

export type SaveResult = { ok: false; message: string };

/**
 * 결과 저장. 로그인돼 있으면 바로 저장하고 결과 화면으로 이동한다.
 * 로그인 전이면 결과를 암호화 쿠키에 잠시 보관하고 카카오 로그인(또는 이메일 로그인 · 가입)으로 보낸다
 * (로그인 후 /auth/callback 또는 이메일 로그인 동작에서 저장).
 */
export async function saveResultAndContinue(input: { info: unknown; answers: unknown }, via: "kakao" | "email" = "kakao"): Promise<SaveResult> {
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
    await registerReferralSignup(member.userId);
    await evaluateReferralSignup(member.userId);
    redirect(await pathAfterSave(saved.assessment.id));
  }

  await savePendingSubmission(info, answers);
  // 이메일로 로그인 · 가입하는 경우 — 같은 보관 쿠키로 로그인을 마친 뒤 저장한다(server/auth-complete.ts)
  if (via === "email") redirect(`/auth/email?mode=signup&next=${encodeURIComponent("/my")}`);
  const url = await kakaoAuthorizeUrl("/my");
  if (!url) return { ok: false, message: "카카오 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  redirect(url);
}
