import { NextResponse, type NextRequest } from "next/server";
import { talkRoomPath } from "@/components/talk/room-paths";
import { isAuthConfigured } from "@/server/env";
import { getMember } from "@/server/member";
import { clearRoomChoice, isRoomId, rememberRoomChoice } from "@/server/room-choice";
import { readRepository } from "@/server/services";
import { getSiteUrl } from "@/server/session";

/**
 * 홈의 상담 카드 입구(/go/방이름) — 고른 방을 기억하고 무료 분석으로 보낸다.
 * 이미 분석한 회원이면 가장 최근 분석의 그 방으로 바로 간다(무료 맛보기 또는 내 리포트의 방). 분석을 마치면(검사 · 로그인 뒤) 기억해 둔 방으로 이어진다(server/room-choice.ts).
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/go/[room]">) {
  const { room } = await ctx.params;
  const site = await getSiteUrl();
  const to = (path: string) => NextResponse.redirect(new URL(path, site));
  if (!isRoomId(room)) return to("/analyze");

  if (isAuthConfigured()) {
    try {
      const member = await getMember();
      if (member && !member.needsConsent) {
        const latest = (await (await readRepository()).listAssessments(member.userId))[0];
        if (latest) {
          await clearRoomChoice();
          return to(talkRoomPath(latest.id, room));
        }
      }
    } catch {
      // 회원 · 분석 확인에 실패하면 처음 방문처럼 무료 분석으로 보낸다
    }
  }
  await rememberRoomChoice(room);
  return to("/analyze");
}
