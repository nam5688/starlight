import { NextResponse, type NextRequest } from "next/server";
import { isAuthConfigured } from "@/server/env";
import { getMember } from "@/server/member";
import { isRoomId, rememberRoomChoice } from "@/server/room-choice";
import { readRepository } from "@/server/services";
import { getSiteUrl } from "@/server/session";

/**
 * 홈의 상담 카드 입구(/go/방이름) — 고른 방을 기억하고 무료 분석으로 보낸다.
 * 이미 분석한 회원이면 가장 최근 분석의 결과 화면(무료 리포트)으로 간다. 분석을 마치면(검사 · 로그인 뒤)도 결과 화면이 먼저이고, 기억해 둔 방은 거기서 "이어서 이야기하기" 바로가기로 보인다(server/room-choice.ts).
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
          // 이미 분석한 회원도 무료 리포트(결과 화면)를 먼저 보고, 거기서 방을 고른다. 고른 방은 "이어서 이야기하기" 바로가기로 보인다
          await rememberRoomChoice(room);
          return to(`/results/${latest.id}`);
        }
      }
    } catch {
      // 회원 · 분석 확인에 실패하면 처음 방문처럼 무료 분석으로 보낸다
    }
  }
  await rememberRoomChoice(room);
  return to("/analyze");
}
