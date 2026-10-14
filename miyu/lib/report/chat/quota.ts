// 방마다 무료 질문 수와 방의 열림 — 간단 리포트(무료) 회원은 네 개 방만 열리고 방마다 무료 질문 수가 다르며,
// 심층 리포트(개인 통합 리포트) 회원은 모든 방이 열리고 방마다 무료 질문 3번이다. 무료 질문을 다 쓰면 미유캐시로 이어 간다.
// 값은 lib/config/product.ts의 CHAT_ROOMS 한 곳에서 정한다. 채널 독립 코드다.
import { CHAT_ROOMS } from "../../config/product.ts";

export type ChatTier = "free" | "paid";

export type RoomPolicy = {
  /** 이 등급으로 이 방에 들어갈 수 있는가 (false면 심층 리포트로만 열리는 방) */
  open: boolean;
  /** 방마다 무료 질문 수 (0이면 질문이 없다) */
  freeQuestions: number;
  /** 무료 질문을 다 쓴 뒤 미유캐시로 이어서 물을 수 있는가 */
  cashAllowed: boolean;
  /** 간단 리포트로는 더 이어 갈 수 없고 심층 리포트가 필요한 방 (닫힌 방 · 질문이 없는 방) */
  needsDeep: boolean;
};

/** extra: 시험 중에만 방마다 무료 질문을 더 주는 값 (기본 0) */
export function roomPolicy(tier: ChatTier, room: string, extra = 0): RoomPolicy {
  const more = Math.max(0, Math.floor(extra));
  if (tier === "paid") return { open: true, freeQuestions: CHAT_ROOMS.deepFreeQuestions + more, cashAllowed: true, needsDeep: false };
  const n = CHAT_ROOMS.simple[room];
  if (n === undefined) return { open: false, freeQuestions: 0, cashAllowed: false, needsDeep: true };
  if (n === 0) return { open: true, freeQuestions: 0, cashAllowed: false, needsDeep: true };
  return { open: true, freeQuestions: n + more, cashAllowed: true, needsDeep: false };
}

/** 간단 리포트(무료)로 열리는 방인가 */
export const isSimpleRoom = (room: string) => CHAT_ROOMS.simple[room] !== undefined;
