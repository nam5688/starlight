import { NextResponse, type NextRequest } from "next/server";
import { isAuthConfigured } from "@/server/env";
import { getMember } from "@/server/member";
import { isRoomId, rememberRoomChoice } from "@/server/room-choice";
import { readRepository } from "@/server/services";
import { getSiteUrl } from "@/server/session";
import { talkRoomPath } from "@/components/talk/room-paths";

/**
 * 홈의 상담 카드 입구(/go/방이름) — 운영자 2026-10-15:
 *  - 분석 기록(무료든 유료든)이 있는 회원은 바로 그 상담방으로 간다(가장 최근 분석의 방. 가입 동의가 남았다면 방 화면이 동의 화면으로 보낸다).
 *  - 분석 기록이 없으면 "무료 리포트가 필요해요!" 안내(/go/방이름/need)를 보인다. 그 안내의 [무료 리포트 만들기]가 `?start=1`로 들어와 고른 방을 기억하고 무료 분석으로 보낸다.
 *  - 분석을 마친 직후에는 기억해 둔 방이 열린다(server/room-choice.ts의 pathAfterSave).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/go/[room]">) {
  const { room } = await ctx.params;
  const site = await getSiteUrl();
  const to = (path: string) => NextResponse.redirect(new URL(path, site));
  if (!isRoomId(room)) return to("/analyze");

  // 안내 화면의 [무료 리포트 만들기] — 고른 방을 기억하고 무료 분석으로
  if (request.nextUrl.searchParams.get("start") === "1") {
    await rememberRoomChoice(room);
    return to("/analyze");
  }

  if (isAuthConfigured()) {
    try {
      const member = await getMember();
      if (member) {
        const mine = await (await readRepository()).listAssessments(member.userId);
        // 리포트를 삭제하지 않은 가장 최근 분석을 먼저 — 삭제한 기록밖에 없어도 채팅방은 그대로 열린다
        const latest = mine.find((a) => !a.recordDeletedAt) ?? mine[0];
        if (latest) return to(talkRoomPath(latest.id, room));
      }
    } catch {
      // 회원 · 분석 확인에 실패하면 분석 기록이 없는 것처럼 안내 화면으로 보낸다
    }
  }
  return to(`/go/${room}/need`);
}
