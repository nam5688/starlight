import "server-only";
import { ROOMS, replayRoom, type RoomId } from "@/lib/report/reading/talk-room";
import { transcriptOf } from "@/lib/report/reading/talk-transcript";
import { getResultView } from "@/lib/services/report-service";
import type { RenderRoom } from "@/lib/services/my-service";
import { writeRepository } from "./services";
import { roomModelFor } from "./talk-model";

const DAILY_KEY = /^daily:(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 리포트 기록을 삭제하기 전에 채팅방 하나를 "화면에 이미 표시된 말"로 옮기는 렌더러 — 저장된 행동 목록을 지금 저장된 리포트(또는 무료 맛보기)로 다시 그려
 * 그 방에 실제로 보였던 줄만 글로 만든다. 열어 보지 않은 풀이는 들어 있지 않고 AI를 부르지 않으며 새 글을 쓰지 않는다(replayRoom은 저장된 글 · 코드 계산 문구만 쓴다).
 * 삭제 서비스가 호출하므로 아직 삭제되지 않은 기록의 번호만 받는다. 그릴 수 없으면 던지고, 그러면 삭제는 하지 않는다.
 */
export function transcriptRenderer(input: { userId: string; assessmentId: string }): RenderRoom {
  return async ({ roomKey, actions }) => {
    if (actions.length === 0) return [];
    const daily = DAILY_KEY.exec(roomKey);
    const roomId = (daily ? "daily" : roomKey) as RoomId;
    if (!Object.hasOwn(ROOMS, roomId)) throw new Error("알 수 없는 대화방");
    const view = await getResultView(writeRepository(), { userId: input.userId, assessmentId: input.assessmentId });
    if (!view || view.deleted) throw new Error("대화를 옮길 기록이 없어요");
    // 오늘의 한 장은 날짜별 방이라 그 날짜 기준으로 다시 그린다(오늘 날짜로 그리면 다른 날의 풀이가 된다)
    const today = daily ? { year: Number(daily[1]), month: Number(daily[2]), day: Number(daily[3]) } : undefined;
    if (today && (today.month < 1 || today.month > 12 || today.day < 1 || today.day > 31)) throw new Error("날짜가 올바르지 않은 대화방");
    const { model } = roomModelFor(view, { paid: { state: "pending" }, free: { state: "pending" } }, roomId, { today });
    return transcriptOf(replayRoom(model, roomId, actions).lines, model);
  };
}
