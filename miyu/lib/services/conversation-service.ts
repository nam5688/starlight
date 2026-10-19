// 미유 대화기록 — MY에서 지난 상담을 찾고 이어 보는 목록. 방(상담 주제)마다 저장된 대화가 있는 곳을, 어느 분석 결과의 대화인지와 함께 보여 준다.
// 새로 저장하는 것은 없다: 이미 저장된 대화(talk_rooms)와 읽기용 대화 기록(talk_transcripts)에서 방 이름 · 마지막 시각만 읽는다. 내용(질문 · 답)은 이 목록에 싣지 않는다.
// 모든 읽기는 본인 검사 결과로 한정한다(owns 확인). 표가 아직 없는 DB(12번 전)이면 빈 목록이다.
import { ROOMS, type RoomId } from "../report/reading/talk-room.ts";
import type { MiyuRepository } from "./ports.ts";
import { owns } from "./talk-service.ts";

export type ConversationEntry = {
  assessmentId: string;
  /** 어느 분석 결과의 대화인가 (MY 카드와 같은 표시: 예 지민 님 · 1995년 4월 12일 (양력)) */
  subject: string;
  room: RoomId;
  label: string;
  mode: string;
  /** 마지막으로 대화를 저장한 시각 (읽기용 기록만 있으면 그 기록을 만든 시각) */
  updatedAt: string | null;
  /** 읽기만 되는 기록(리포트를 삭제한 결과의 지난 대화)인가 */
  readOnly: boolean;
};

const roomOf = (key: string): RoomId | null => {
  const id = key.split(":")[0] ?? "";
  return id in ROOMS ? (id as RoomId) : null;
};

/** 내 분석 결과들(subjects)의 대화방을 방마다 한 줄로 모아 최근 대화부터 돌려준다. 대화가 없으면 빈 목록 */
export async function listMyConversations(repo: MiyuRepository, userId: string, subjects: { assessmentId: string; subject: string }[]): Promise<ConversationEntry[]> {
  const out: ConversationEntry[] = [];
  for (const s of subjects) {
    try {
      if (!(await owns(repo, userId, s.assessmentId))) continue;
      const byRoom = new Map<RoomId, { updatedAt: string | null; readOnly: boolean }>();
      const put = (room: RoomId, at: string | null, readOnly: boolean) => {
        const prev = byRoom.get(room);
        // 같은 방은 저장된 대화(이어 갈 수 있음)를 우선하고, 시각은 더 늦은 쪽을 쓴다(날짜별 방 · 읽기용 기록 포함)
        const latest = [prev?.updatedAt ?? null, at].filter((t): t is string => Boolean(t)).sort().at(-1) ?? null;
        byRoom.set(room, { updatedAt: latest, readOnly: prev ? prev.readOnly && readOnly : readOnly });
      };
      for (const key of await repo.listTalkRoomKeys(s.assessmentId)) {
        const room = roomOf(key);
        if (!room) continue;
        const row = await repo.getTalkRoom(s.assessmentId, key);
        if (row && row.userId === userId) put(room, row.updatedAt, false);
      }
      for (const t of (await repo.listTalkTranscripts(s.assessmentId)).filter((x) => x.userId === userId)) {
        const room = roomOf(t.roomKey);
        if (room) put(room, t.createdAt, true);
      }
      for (const [room, v] of byRoom) out.push({ assessmentId: s.assessmentId, subject: s.subject, room, label: ROOMS[room].label, mode: ROOMS[room].mode, updatedAt: v.updatedAt, readOnly: v.readOnly });
    } catch {
      // 대화 저장 표가 없는 DB(12번 전) 등 — 이 결과의 대화는 건너뛰고 나머지를 보여 준다
    }
  }
  return out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}
