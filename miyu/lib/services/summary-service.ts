// 채팅 요약 저장 — 채팅방의 [저장하기] · 대화 종료 · MY의 "저장한 채팅 요약 보기" · 다음 질문에서 참고하는 이전 이야기.
// 규칙: 요약은 코드가 규칙대로 줄인다(lib/report/chat/summary.ts, AI 미사용). 저장마다 "이전 저장 이후의 대화"만 담는다(talk_rooms.saved_upto).
// 대화를 끝낼 때 저장하지 않으면 요약은 회원에게 보이지 않는 참고 기록(visible = false)으로만 남아 다음 질문에서 AI가 이전 이야기를 참고하는 데 쓰이고,
// 회원은 MY에서 모두 지울 수 있다. 모든 함수는 먼저 검사 결과의 주인인지 확인한다. 표가 없으면(DB 변경 14번 전) not-ready로 돌려준다.
import { memoryPairs, parseSummaryItems, SUMMARY_LIMITS, summarizeActions, isEmptySummary, type SummaryItems, type SummaryQa } from "../report/chat/summary.ts";
import { ACTION_LIMIT, ROOM_ORDER, ROOMS, sanitizeRoomActions, type RoomId } from "../report/reading/talk-room.ts";
import type { TalkModel } from "../report/reading/talk.ts";
import type { MiyuRepository } from "./ports.ts";
import { owns, TALK_ROOM_KEY, TALK_SAVE_MAX_CHARS } from "./talk-service.ts";

export type SummaryFailure = "not-found" | "invalid" | "empty" | "limit" | "not-ready" | "already";
export type SaveSummaryResult = { ok: true; id: string } | { ok: false; reason: SummaryFailure };
/** saved: 회원이 볼 수 있게 저장됐는가 (이미 앞서 저장해 새로 담을 것이 없을 때도 true) */
export type CloseRoomResult = { ok: true; saved: boolean } | { ok: false; reason: SummaryFailure };

/** 고객에게 보이는 안내 — 이유별 한 줄 */
export const SUMMARY_MESSAGES: Record<SummaryFailure, string> = {
  "not-found": "저장할 대화를 찾지 못했어요.",
  invalid: "저장할 수 없는 대화예요. 잠시 뒤 다시 시도해 주세요.",
  empty: "아직 저장할 새 대화가 없어요. 이야기를 조금 더 나눈 뒤 저장해 주세요.",
  limit: `저장한 요약이 ${SUMMARY_LIMITS.visiblePerUser}개예요. MY의 저장한 채팅 요약에서 지운 뒤 다시 저장해 주세요.`,
  "not-ready": "채팅 요약 저장을 준비하고 있어요. 아직 저장할 수 없어요.",
  already: "방금 저장한 대화예요. 이어서 이야기를 나눈 뒤 다시 저장해 주세요.",
};

const missingTable = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";

/** 방 이름(날짜별 방 포함)에서 방을 알아낸다 — 방 이름이 정한 방과 다르면 undefined */
function roomOfKey(roomKey: string, room: string): RoomId | undefined {
  const base = roomKey.split(":")[0];
  return base === room && room in ROOMS ? (room as RoomId) : undefined;
}

type SegmentInput = { userId: string; assessmentId: string; roomKey: string; room: string; actions: unknown; model: TalkModel };

/** 검사 · 소유자 확인과 행동 목록 정리 — 저장 · 종료가 같이 쓴다 */
async function prepare(repo: MiyuRepository, input: SegmentInput) {
  if (!TALK_ROOM_KEY.test(input.roomKey)) return { ok: false as const, reason: "invalid" as const };
  const room = roomOfKey(input.roomKey, input.room);
  if (!room) return { ok: false as const, reason: "invalid" as const };
  if (!(await owns(repo, input.userId, input.assessmentId))) return { ok: false as const, reason: "not-found" as const };
  const actions = sanitizeRoomActions(input.actions);
  if (actions.length > ACTION_LIMIT || JSON.stringify(actions).length > TALK_SAVE_MAX_CHARS) return { ok: false as const, reason: "invalid" as const };
  return { ok: true as const, room, actions };
}

/**
 * 지금까지의 대화를 요약해 저장한다 ([저장하기]) — 이전 저장 이후의 대화만 요약하고, 같은 대화가 두 번 요약되지 않는다.
 * 대화 자체(행동 목록)도 함께 서버에 저장해 둔다(저장 버튼 직전의 변경이 아직 올라가지 않았을 수 있다).
 */
export async function saveRoomSummary(repo: MiyuRepository, input: SegmentInput): Promise<SaveSummaryResult> {
  const p = await prepare(repo, input);
  if (!p.ok) return p;
  const { room, actions } = p;
  if (actions.length === 0) return { ok: false, reason: "empty" };
  try {
    if ((await repo.countVisibleChatSummaries(input.userId)) >= SUMMARY_LIMITS.visiblePerUser) return { ok: false, reason: "limit" };
    await repo.upsertTalkRoom({ assessmentId: input.assessmentId, userId: input.userId, roomKey: input.roomKey, actions });
    const row = await repo.getTalkRoom(input.assessmentId, input.roomKey);
    const claimedFrom = row?.savedUpto ?? 0;
    const items = summarizeActions(input.model, room, actions, claimedFrom);
    if (isEmptySummary(items)) return { ok: false, reason: "empty" };
    if (!(await repo.claimTalkRoomSegment(input.assessmentId, input.roomKey, claimedFrom, actions.length))) return { ok: false, reason: "already" };
    try {
      const saved = await repo.insertChatSummary({ userId: input.userId, assessmentId: input.assessmentId, room, visible: true, items });
      return { ok: true, id: saved.id };
    } catch (e) {
      // 요약을 만들지 못했으면 위치를 되돌려 다음 저장이 같은 대화를 다시 담게 한다
      await repo.releaseTalkRoomSegment(input.assessmentId, input.roomKey, claimedFrom, actions.length).catch(() => undefined);
      throw e;
    }
  } catch (e) {
    if (missingTable(e)) return { ok: false, reason: "not-ready" };
    throw e;
  }
}

/**
 * 대화를 끝낸다 — 이 방의 대화를 지우고 새 대화로 시작하게 한다. keep이 true이면 마지막 저장 이후의 대화를 요약해 저장하고(회원이 볼 수 있다),
 * false이면 저장하지 않고 끝내되 같은 대화의 요약을 보이지 않는 참고 기록으로 남긴다(다음 질문에서 AI가 참고하는 데만 쓴다 · 회원이 MY에서 지울 수 있다).
 * 저장하겠다고 했는데 저장하지 못하면(한도 · 준비 중) 대화를 지우지 않고 이유를 돌려준다.
 */
export async function closeRoom(repo: MiyuRepository, input: SegmentInput & { keep: boolean }): Promise<CloseRoomResult> {
  const p = await prepare(repo, input);
  if (!p.ok) return p;
  const { room, actions } = p;
  if (actions.length === 0) {
    await repo.deleteTalkRoom(input.assessmentId, input.roomKey);
    return { ok: true, saved: false };
  }
  let saved = false;
  try {
    if (input.keep && (await repo.countVisibleChatSummaries(input.userId)) >= SUMMARY_LIMITS.visiblePerUser) return { ok: false, reason: "limit" };
    await repo.upsertTalkRoom({ assessmentId: input.assessmentId, userId: input.userId, roomKey: input.roomKey, actions });
    const row = await repo.getTalkRoom(input.assessmentId, input.roomKey);
    const claimedFrom = row?.savedUpto ?? 0;
    const items = summarizeActions(input.model, room, actions, claimedFrom);
    if (isEmptySummary(items)) {
      // 새로 담을 대화가 없다 — 앞서 [저장하기]로 이미 저장했다면(claimedFrom > 0) 저장한 것으로 본다
      saved = input.keep && claimedFrom > 0;
    } else if (!(await repo.claimTalkRoomSegment(input.assessmentId, input.roomKey, claimedFrom, actions.length))) {
      // 같은 대화를 다른 요청이 방금 요약했다 — 다시 담지 않는다
      saved = input.keep;
    } else {
      try {
        await repo.insertChatSummary({ userId: input.userId, assessmentId: input.assessmentId, room, visible: input.keep, items });
        saved = input.keep;
        if (!input.keep) await repo.trimHiddenChatSummaries(input.userId, input.assessmentId, room, SUMMARY_LIMITS.hiddenPerRoom).catch(() => undefined);
      } catch (e) {
        await repo.releaseTalkRoomSegment(input.assessmentId, input.roomKey, claimedFrom, actions.length).catch(() => undefined);
        throw e;
      }
    }
  } catch (e) {
    if (!missingTable(e)) throw e;
    // 14번 DB 변경 전 — 저장하겠다고 했으면 지우지 않고 알린다. 저장하지 않고 끝내는 것은 기록 없이 끝낼 수 있다
    if (input.keep) return { ok: false, reason: "not-ready" };
  }
  await repo.deleteTalkRoom(input.assessmentId, input.roomKey);
  return { ok: true, saved };
}

export type SummaryEntry = { id: string; createdAt: string; items: SummaryItems };
export type SummaryGroup = { room: RoomId; label: string; mode: string; entries: SummaryEntry[] };

/** MY의 "저장한 채팅 요약" — 방(카테고리)별로 묶고, 방 안에서는 저장한 날짜가 최근인 것부터. 직접 저장한 것만 보인다 */
export async function listSavedSummaries(repo: MiyuRepository, userId: string): Promise<SummaryGroup[]> {
  const rows = await repo.listChatSummaries(userId, { visibleOnly: true });
  const groups: SummaryGroup[] = [];
  for (const room of ROOM_ORDER) {
    const entries = rows
      .filter((r) => r.room === room && r.visible)
      .map((r) => ({ id: r.id, createdAt: r.createdAt, items: parseSummaryItems(r.items) }))
      .filter((e) => !isEmptySummary(e.items));
    if (entries.length > 0) groups.push({ room, label: ROOMS[room].label, mode: ROOMS[room].mode, entries });
  }
  return groups;
}

/** 직접 저장한 요약 하나를 지운다 (내 것만) */
export async function deleteSavedSummary(repo: MiyuRepository, userId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false;
  return repo.deleteChatSummary(userId, id);
}

/** "이전 대화 기록 모두 지우기" — 직접 저장한 요약과 저장하지 않은 대화의 참고 기록을 모두 지운다. 지난 개수를 돌려준다 */
export async function deleteAllSummaries(repo: MiyuRepository, userId: string): Promise<number> {
  return repo.deleteChatSummaries(userId);
}

/**
 * 다음 질문에서 AI가 참고하는 이전 이야기 — 같은 검사 결과의 같은 방에서 이전에 나눈 질문과 답(직접 저장한 것과 저장하지 않은 것 모두). 방마다 새 대화로 시작하므로 다른 방의 이야기는 가져오지 않고,
 * 날짜별로 새로 시작하는 오늘의 운세 방은 쓰지 않는다. 참고 기록을 읽지 못해도 답을 막지 않는다(빈 목록).
 */
export async function memoryFor(repo: MiyuRepository, input: { userId: string; assessmentId: string; room: string }): Promise<SummaryQa[]> {
  if (input.room === "daily" || !(input.room in ROOMS)) return [];
  try {
    const rows = await repo.listRoomChatSummaries(input.userId, input.assessmentId, input.room, 6);
    return memoryPairs(rows.map((r) => parseSummaryItems(r.items)));
  } catch {
    return [];
  }
}
