import { NextResponse, type NextRequest } from "next/server";
import { submitAssessment } from "@/lib/services/assessment-service";
import { isAuthConfigured } from "@/server/env";
import { clearPendingSubmission, readPendingSubmission } from "@/server/pending-submission";
import { sajuEngine, writeRepository } from "@/server/services";
import { getSiteUrl, safeNextPath } from "@/server/session";
import { createServerSupabase } from "@/server/supabase";

/**
 * 카카오 로그인 후 돌아오는 주소.
 * 1) 인증 코드를 세션으로 바꾼다
 * 2) 로그인 전에 보관한 검사 결과가 있으면 이 회원번호로 저장하고 결과 화면으로 보낸다
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

  const pending = await readPendingSubmission();
  if (pending) {
    await clearPendingSubmission();
    const saved = await submitAssessment(
      { repo: writeRepository(), saju: sajuEngine },
      { userId: data.user.id, channel: "web", info: pending.info, answers: pending.answers, today: new Date() },
    );
    return saved.ok ? to(`/results/${saved.assessment.id}`) : to("/auth/error?reason=save");
  }

  return to(safeNextPath(searchParams.get("next")));
}
