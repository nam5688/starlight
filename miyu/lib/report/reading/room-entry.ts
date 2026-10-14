// 상담방 입구 규칙 — 홈의 상담 카드를 눌렀을 때와 분석(무료 리포트)을 마친 직후에 어디로 보내는지 (운영자 2026-10-15)
//  - 분석 기록(무료든 유료든)이 있는 회원이 홈의 카드를 누르면 바로 그 상담방으로 간다.
//  - 분석 기록이 없으면 "무료 리포트가 필요해요!" 안내와 [무료 리포트 만들기]를 보인다.
//  - 분석을 마친 직후에는 홈에서 고른 방이 열린다. 단, 심층 리포트로만 열리는 방은 열자마자 구매 안내라서 내가 만든 무료 리포트(결과 화면)를 먼저 보여 준다.
// 채널 독립 코드다(React · Next · 브라우저 API를 쓰지 않는다). 쿠키 · 이동은 server/ · app/go/ 에 있다.
import { FREE_ANALYSIS_TIME, REPORT_TIER_NAMES } from "../../config/product.ts";
import { isSimpleRoom } from "../chat/quota.ts";
import { ROOMS, type RoomId } from "./talk-room.ts";

/** 분석을 마친 직후 바로 열어 줄 방 — 무료 리포트로 열리는 방만. 그 밖의 방이거나 고른 방이 없으면 null(결과 화면으로 간다) */
export function roomAfterAnalysis(room: RoomId | null): RoomId | null {
  return room && isSimpleRoom(room) ? room : null;
}

/** "무료 리포트가 필요해요!" 안내 화면의 고정 문구 — 방을 열려면 먼저 무료 분석이 필요하다는 것만 알린다 */
export const NEED_REPORT_COPY = {
  title: "무료 리포트가 필요해요!",
  lead: (room: RoomId) => `${ROOMS[room].label} 상담방에서 이야기하려면 먼저 무료 분석으로 내 리포트를 만들어야 해요. 생년월일을 넣고 질문에 답하면 돼요. 검사는 ${FREE_ANALYSIS_TIME} 걸려요.`,
  next: (room: RoomId) =>
    roomAfterAnalysis(room)
      ? `리포트가 만들어지면 ${ROOMS[room].label} 상담방으로 이어서 가요.`
      : `리포트가 만들어지면 먼저 보여 드려요. ${ROOMS[room].label} 상담방은 ${REPORT_TIER_NAMES.deep}로 열려요.`,
  start: "무료 리포트 만들기",
  home: "홈으로",
} as const;

/**
 * 구매한 리포트가 있는데 대화 방에서 풀이로 쓰지 못하는 이유 — pending: 아직 만드는 중 · failed: 만들지 못함 · old-format: 완성돼 있지만 예전 형식(읽기 구조가 아님).
 * 결과 화면은 예전 형식 리포트도 그대로 보여 주므로, 그 경우 "준비 중"이라고 알리면 오해가 된다. 구매한 리포트가 없으면 null. 구매했고 읽기 구조로 완성돼 있으면 풀이를 쓸 수 있으므로 null.
 */
export type OwnedState = "pending" | "failed" | "old-format";
export function ownedStateOf(input: { paid: boolean; status: "queued" | "generating" | "ready" | "failed" | null; hasContent: boolean; readingFormat: boolean }): OwnedState | null {
  if (!input.paid) return null;
  if (input.status === "failed") return "failed";
  if (input.status === "ready" && input.hasContent) return input.readingFormat ? null : "old-format";
  return "pending";
}
