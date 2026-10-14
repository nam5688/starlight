import type { RoomId } from "@/lib/report/reading/talk-room";

/** 예시(가상 인물 서윤) 채팅방의 주소 — 기본 방은 /report/sample/talk, 나머지는 /report/sample/talk/방이름 */
export const sampleRoomPath = (room: RoomId) => (room === "main" ? "/report/sample/talk" : `/report/sample/talk/${room}`);

/** 내 리포트 채팅방의 주소 */
export const talkRoomPath = (id: string, room: RoomId) => (room === "main" ? `/results/${id}/talk` : `/results/${id}/talk/${room}`);
