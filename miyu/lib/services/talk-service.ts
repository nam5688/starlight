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

export type TalkSaveResult = { ok: true } | { ok: false; reason: "not-found" | "invalid" | "not-ready" | "stale" };

const missingTable = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";

/**
 * 검사 결과의 주인인지 — 대화 저장 · 자유 질문 모두 이 확인을 먼저 한다.
 * "삭제 범위 확대"(DB 29번)로 삭제를 마친 기록(recordPurgedAt)은 채팅방 · 대화 · 요약까지 지운 것이라 대화에 관한 모든 읽기 · 쓰기에서 없는 기록으로 본다(DB 장치도 같은 쓰기를 막는다).
 */
export async function owns(repo: MiyuRepository, userId: string, assessmentId: string): Promise<boolean> {
  const a = await repo.getAssessment(assessmentId);
  return Boolean(a && a.userId === userId && !a.recordPurgedAt);
}

/** 내 검사 결과이면서 "기록 삭제"하지 않은 것 — 리포트 · 맛보기 · 초대처럼 삭제한 기록에서는 쓸 수 없는 기능이 쓴다(채팅은 삭제한 기록에서도 이어지므로 owns를 쓴다) */
export async function ownsActive(repo: MiyuRepository, userId: string, assessmentId: string): Promise<boolean> {
  const a = await repo.getAssessment(assessmentId);
  return Boolean(a && a.userId === userId && !a.recordDeletedAt);
}

/** 저장된 대화(행동 목록). 없거나 내 검사 결과가 아니면 빈 목록 */
export async function loadTalkRoom(repo: MiyuRepository, input: { userId: string; assessmentId: string; roomKey: string }): Promise<RoomAction[]> {
  if (!TALK_ROOM_KEY.test(input.roomKey)) return [];
  if (!(await owns(repo, input.userId, input.assessmentId))) return [];
  const row = await repo.getTalkRoom(input.assessmentId, input.roomKey);
  return row && row.userId === input.userId ? sanitizeRoomActions(row.actions) : [];
}

/** 저장된 대화가 있는 방 이름들 (메뉴의 "이어 보기" 표시) — 삭제한 기록은 읽기용 대화 기록이 있는 방도 포함한다 */
export async function listSavedRoomKeys(repo: MiyuRepository, input: { userId: string; assessmentId: string }): Promise<string[]> {
  if (!(await owns(repo, input.userId, input.assessmentId))) return [];
  const live = await repo.listTalkRoomKeys(input.assessmentId);
  const archived = (await repo.listTalkTranscripts(input.assessmentId).catch(() => [])).map((t) => t.roomKey);
  return [...new Set([...live, ...archived])];
}

/** 삭제한 기록의 읽기용 대화 기록(삭제 전에 화면에 이미 표시된 말) — 방 이름 순. 내 기록이 아니면 빈 목록 */
export async function loadTranscripts(repo: MiyuRepository, input: { userId: string; assessmentId: string }) {
  if (!(await owns(repo, input.userId, input.assessmentId))) return [];
  return (await repo.listTalkTranscripts(input.assessmentId)).filter((t) => t.userId === input.userId);
}

/**
 * 삭제한 기록의 방에서 "지금 대화가 어디서부터인지" 알려 주는 표지 — 읽기용 대화 기록이 있으면 그 저장 시각, 없으면 "none". 삭제하지 않은 기록은 null(표지를 쓰지 않는다).
 * 화면이 이 값을 받아 두었다가 저장할 때 돌려보낸다. 삭제 전에 열어 둔 화면(다른 탭)이 옛 대화 전체를 되돌려 쓰는 일을 막는 데 쓴다.
 */
export function roomEpochOf(deleted: boolean, transcripts: readonly { roomKey: string; createdAt: string }[], roomKey: string): string | null {
  return deleted ? (transcripts.find((t) => t.roomKey === roomKey)?.createdAt ?? "none") : null;
}

/** 대화를 저장한다 — 행동 목록의 모양을 다시 확인하고 한도를 지킨다. 목록이 비면 그 방의 저장을 지운다 */
export async function saveTalkRoom(repo: MiyuRepository, input: { userId: string; assessmentId: string; roomKey: string; actions: unknown; /** 삭제한 기록의 방에서만 쓴다 — 화면이 열릴 때 받은 표지(roomEpochOf) */ epoch?: unknown }): Promise<TalkSaveResult> {
  if (!TALK_ROOM_KEY.test(input.roomKey)) return { ok: false, reason: "invalid" };
  const assessment = await repo.getAssessment(input.assessmentId);
  if (!assessment || assessment.userId !== input.userId || assessment.recordPurgedAt) return { ok: false, reason: "not-found" };
  // 삭제한 기록: 삭제 전에 열어 둔 화면(표지가 없거나 다름)이 옛 대화 전체를 되돌려 쓰지 못하게 한다 — 옛 대화는 읽기용 대화 기록으로 옮겨져 있다
  if (assessment.recordDeletedAt) {
    const expected = roomEpochOf(true, await repo.listTalkTranscripts(input.assessmentId), input.roomKey);
    if (input.epoch !== expected) return { ok: false, reason: "stale" };
  }
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
