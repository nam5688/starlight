// 대화(상담방) 저장 — 로그인한 회원이 폰을 바꾸거나 다른 브라우저로 들어와도 대화를 이어 보게 한다.
// 저장하는 것은 눌렀던 행동 목록과 자유 질문 · 미유의 답뿐이다(리포트 글 · 이름 · 생년월일은 담지 않는다). 모든 함수는 먼저 검사 결과의 주인인지 확인한다.
// 회원은 방마다 "새로 시작하기"로 지울 수 있고, 탈퇴하면 함께 삭제된다(DB 함수 withdraw_member_data). 보관 기간은 초안이다 — docs/withdrawal-policy.md.
import { ACTION_LIMIT, sanitizeRoomActions, type RoomAction } from "../report/reading/talk-room.ts";
import type { MiyuRepository } from "./ports.ts";

/** 방 이름 — 오늘의 한 장 방은 날짜별로 나뉜다(daily:YYYY-MM-DD). DB 형식 검사와 같은 모양이다 */
export const TALK_ROOM_KEY = /^[a-z]{3,12}(:\d{4}-\d{2}-\d{2})?$/;
const DAILY_PREFIX = "daily:";
/** 한 방에 저장하는 크기 한도 (글자 수) — DB의 크기 검사(256KB)보다 작게 둔다 */
export const TALK_SAVE_MAX_CHARS = 120_000;

export type TalkSaveResult = { ok: true } | { ok: false; reason: "not-found" | "invalid" | "not-ready" };

const missingTable = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";

/** 검사 결과의 주인인지 — 대화 저장 · 자유 질문 모두 이 확인을 먼저 한다 */
export async function owns(repo: MiyuRepository, userId: string, assessmentId: string): Promise<boolean> {
  const a = await repo.getAssessment(assessmentId);
  return Boolean(a && a.userId === userId);
}

/** 저장된 대화(행동 목록). 없거나 내 검사 결과가 아니면 빈 목록 */
export async function loadTalkRoom(repo: MiyuRepository, input: { userId: string; assessmentId: string; roomKey: string }): Promise<RoomAction[]> {
  if (!TALK_ROOM_KEY.test(input.roomKey)) return [];
  if (!(await owns(repo, input.userId, input.assessmentId))) return [];
  const row = await repo.getTalkRoom(input.assessmentId, input.roomKey);
  return row && row.userId === input.userId ? sanitizeRoomActions(row.actions) : [];
}

/** 저장된 대화가 있는 방 이름들 (메뉴의 "이어 보기" 표시) */
export async function listSavedRoomKeys(repo: MiyuRepository, input: { userId: string; assessmentId: string }): Promise<string[]> {
  if (!(await owns(repo, input.userId, input.assessmentId))) return [];
  return repo.listTalkRoomKeys(input.assessmentId);
}

/** 대화를 저장한다 — 행동 목록의 모양을 다시 확인하고 한도를 지킨다. 목록이 비면 그 방의 저장을 지운다 */
export async function saveTalkRoom(repo: MiyuRepository, input: { userId: string; assessmentId: string; roomKey: string; actions: unknown }): Promise<TalkSaveResult> {
  if (!TALK_ROOM_KEY.test(input.roomKey)) return { ok: false, reason: "invalid" };
  if (!(await owns(repo, input.userId, input.assessmentId))) return { ok: false, reason: "not-found" };
  const actions = sanitizeRoomActions(input.actions);
  if (actions.length > ACTION_LIMIT || JSON.stringify(actions).length > TALK_SAVE_MAX_CHARS) return { ok: false, reason: "invalid" };
  try {
    if (actions.length === 0) {
      await repo.deleteTalkRoom(input.assessmentId, input.roomKey);
      return { ok: true };
    }
    await repo.upsertTalkRoom({ assessmentId: input.assessmentId, userId: input.userId, roomKey: input.roomKey, actions });
    // 오늘의 한 장은 날짜별 방이라 지난 날짜의 방은 함께 정리한다
    if (input.roomKey.startsWith(DAILY_PREFIX)) await repo.deleteTalkRoomsBefore(input.assessmentId, DAILY_PREFIX, input.roomKey);
    return { ok: true };
  } catch (e) {
    if (missingTable(e)) return { ok: false, reason: "not-ready" };
    throw e;
  }
}

/** 이 방의 저장된 대화를 지운다 ("이 채팅방 새로 시작하기") */
export async function resetTalkRoom(repo: MiyuRepository, input: { userId: string; assessmentId: string; roomKey: string }): Promise<TalkSaveResult> {
  if (!TALK_ROOM_KEY.test(input.roomKey)) return { ok: false, reason: "invalid" };
  if (!(await owns(repo, input.userId, input.assessmentId))) return { ok: false, reason: "not-found" };
  await repo.deleteTalkRoom(input.assessmentId, input.roomKey);
  return { ok: true };
}
