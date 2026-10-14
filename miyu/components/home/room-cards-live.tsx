import { connection } from "next/server";
import { chatConnected } from "@/server/chat";
import { RoomCards } from "./room-cards";

/** 자유 질문 AI가 연결돼 있는지는 요청 때마다 환경에서 읽는다 — 홈 전체를 요청마다 새로 그리지 않고 이 구역만 */
export async function RoomCardsLive() {
  await connection();
  return <RoomCards chatReady={chatConnected()} />;
}
