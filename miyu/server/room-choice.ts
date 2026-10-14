import "server-only";
import { cookies } from "next/headers";
import { ROOM_ORDER, type RoomId } from "@/lib/report/reading/talk-room";

/**
 * 홈에서 고른 상담 주제(방) 기억 — 검사 · 로그인을 거쳐도 고른 방으로 이어 가기 위한 쿠키. 방 이름만 담는다(개인정보 없음).
 * 24시간 뒤 사라지고, 쓰면 바로 지운다. 쿠키를 거부한 브라우저에서는 기억하지 못할 뿐 기본 화면으로 간다.
 */
export const ROOM_CHOICE_COOKIE = "miyu_room";
const MAX_AGE_SECONDS = 60 * 60 * 24;

export const isRoomId = (v: unknown): v is RoomId => typeof v === "string" && (ROOM_ORDER as readonly string[]).includes(v);

/** 기억해 둔 방 (지우지 않는다) — 화면에서 "고른 방으로 이어서" 링크를 보일 때 */
export async function peekRoomChoice(): Promise<RoomId | null> {
  const v = (await cookies()).get(ROOM_CHOICE_COOKIE)?.value;
  return isRoomId(v) ? v : null;
}

/** 방을 기억한다 (Route Handler · Server Action에서만) */
export async function rememberRoomChoice(room: RoomId): Promise<void> {
  (await cookies()).set(ROOM_CHOICE_COOKIE, room, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE_SECONDS });
}

/**
 * 검사 결과를 저장한 뒤 갈 곳 — 언제나 결과 화면(무료 리포트)이다(운영자 2026-10-15: 무료 리포트를 먼저 보고, 그 뒤에 상담방을 고른다).
 * 홈에서 방을 골랐다면 그 방은 기억해 두었다가 결과 화면에서 "OO 방으로 이어서 이야기하기" 바로가기로만 보인다(바로 그 방으로 보내지 않는다).
 */
export async function pathAfterSave(assessmentId: string): Promise<string> {
  return `/results/${assessmentId}`;
}
