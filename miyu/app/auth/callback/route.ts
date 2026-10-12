import { NextResponse, type NextRequest } from "next/server";
import { submitAssessment } from "@/lib/services/assessment-service";
import { getMemberStatus } from "@/lib/services/member-service";
import { isAuthConfigured } from "@/server/env";
import { consentPath } from "@/server/member";
import { clearPendingSubmission, readPendingSubmission } from "@/server/pending-submission";
import { sajuEngine, writeRepository } from "@/server/services";
import { getSiteUrl, safeNextPath } from "@/server/session";
import { createServerSupabase } from "@/server/supabase";

/**
 * 카카오 로그인 후 돌아오는 미유 사이트의 로그인 완료 주소 (/auth/callback).
 * Supabase 대시보드의 Redirect URLs에 등록하는 주소가 이것이다.
 * (카카오 디벨로퍼스에는 Supabase의 callback 주소를 등록한다 — 다른 주소)
 *
 * 1) 인증 코드를 세션으로 바꾼다
 * 2) 신규 회원이거나 약관이 바뀌었으면 가입 동의 화면으로 보낸다 (보관한 검사 결과는 동의 후 저장)
 * 3) 로그인 전에 보관한 검사 결과가 있으면 이 회원번호로 저장하고 결과 화면으로 보낸다
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // 서버 내부 주소(localhost 등)가 아니라 서비스 주소로 돌려보낸다 — 쿠키가 같은 주소에 남아야 한다
  const site = await getSiteUrl();
  const to = (path: string) => NextResponse.redirect(new URL(path, site));

  if (!isAuthConfigured()) return to("/auth/error?reason=not-configured");
  if (searchParams.get("error")) return to("/auth/error?reason=denied");

  const code = searchParams.get("code");
  if (!code) return to("/auth/error?reason=missing-code");

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return to("/auth/error?reason=exchange");

  const next = safeNextPath(searchParams.get("next"));
  const repo = writeRepository();
  let status: Awaited<ReturnType<typeof getMemberStatus>>;
  try {
    // 테이블보다 먼저 가입한 회원처럼 프로필이 빠져 있으면 여기서 채운다 (이미 있으면 그대로)
    await repo.ensureProfile(data.user.id);
    status = await getMemberStatus(repo, data.user.id);
  } catch (e) {
    // 테이블이 없거나 권한이 없는 경우 — 내용은 서버 기록에만 남기고 화면에는 안내만 한다
    console.error("[auth/callback] 회원 정보 준비 실패", e instanceof Error ? e.message : e);
    return to("/auth/error?reason=db");
  }
  if (status.needsConsent) return to(consentPath(next));

  const pending = await readPendingSubmission();
  if (pending) {
    await clearPendingSubmission();
    const saved = await submitAssessment(
      { repo, saju: sajuEngine },
      { userId: data.user.id, channel: "web", info: pending.info, answers: pending.answers, today: new Date() },
    );
    return saved.ok ? to(`/results/${saved.assessment.id}`) : to("/auth/error?reason=save");
  }

  return to(next);
}
