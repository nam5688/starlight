import { NextResponse, type NextRequest } from "next/server";
import { isInviteToken } from "@/lib/commerce/invite";
import { isAuthConfigured } from "@/server/env";
import { rememberInviteToken } from "@/server/invite";
import { getMember } from "@/server/member";
import { readRepository } from "@/server/services";
import { getSiteUrl } from "@/server/session";

/**
 * 초대 링크 화면의 [무료 분석 시작하기] — 링크를 기억한 뒤 무료 분석으로 보낸다(이미 분석 기록이 있는 회원은 가장 최근 결과 화면으로).
 * 기억하는 것은 링크의 무작위 토큰뿐이고, 초대 가격은 결과 화면에서 서버가 대상인지 확인한 뒤에만 보인다.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/invite/[token]/start">) {
  const { token } = await ctx.params;
  const site = await getSiteUrl();
  const to = (path: string) => NextResponse.redirect(new URL(path, site));
  if (!isInviteToken(token)) return to("/analyze");
  await rememberInviteToken(token);
  if (isAuthConfigured()) {
    try {
      const member = await getMember();
      if (member) {
        const latest = (await (await readRepository()).listAssessments(member.userId))[0];
        if (latest) return to(`/results/${latest.id}`);
      }
    } catch {
      // 확인에 실패하면 분석 기록이 없는 것처럼 무료 분석으로 보낸다
    }
  }
  return to("/analyze");
}
