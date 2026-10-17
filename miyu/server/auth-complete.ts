import "server-only";
import { submitAssessment } from "@/lib/services/assessment-service";
import { getMemberStatus } from "@/lib/services/member-service";
import { consentPath } from "./member";
import { clearPendingSubmission, readPendingSubmission } from "./pending-submission";
import { evaluateReferralSignup, registerReferralSignup } from "./referral";
import { pathAfterSave } from "./room-choice";
import { sajuEngine, writeRepository } from "./services";

/**
 * 로그인을 마친 회원이 어디로 가는지 정하고, 필요한 마무리를 한다 — 카카오 로그인(/auth/callback)과 이메일 로그인이 같은 규칙을 쓴다.
 * 1) 신규 회원이거나 약관이 바뀌었으면 가입 동의 화면으로 (보관한 검사 결과는 동의 후 저장)
 * 2) 로그인 전에 보관한 검사 결과가 있으면 이 회원번호로 저장하고 결과 화면(또는 홈에서 고른 상담방)으로
 * 3) 그 밖에는 next
 * 돌려주는 값은 같은 사이트 안의 경로다.
 */
export async function pathAfterLogin(userId: string, next: string, via: string): Promise<string> {
  const repo = writeRepository();
  let status: Awaited<ReturnType<typeof getMemberStatus>>;
  try {
    // 테이블보다 먼저 가입한 회원처럼 프로필이 빠져 있으면 여기서 채운다 (이미 있으면 그대로)
    await repo.ensureProfile(userId);
    status = await getMemberStatus(repo, userId);
  } catch (e) {
    // 테이블이 없거나 권한이 없는 경우 — 내용은 서버 기록에만 남기고 화면에는 안내만 한다
    console.error(`[${via}] 회원 정보 준비 실패`, e instanceof Error ? e.message : e);
    return "/auth/error?reason=db";
  }
  if (status.needsConsent) return consentPath(next);
  // 추천 링크로 가입했다면 추천 가입으로 등록한다(보상은 확정 조건을 모두 갖춘 뒤에만 — 로그인은 막지 않는다)
  await registerReferralSignup(userId);

  const pending = await readPendingSubmission();
  if (pending) {
    await clearPendingSubmission();
    const saved = await submitAssessment({ repo, saju: sajuEngine }, { userId, channel: "web", info: pending.info, answers: pending.answers, today: new Date() });
    if (saved.ok) await evaluateReferralSignup(userId);
    return saved.ok ? pathAfterSave(saved.assessment.id) : "/auth/error?reason=save";
  }
  return next;
}
