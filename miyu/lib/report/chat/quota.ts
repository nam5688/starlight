// 방마다 무료 질문 수와 방의 열림 — 무료 리포트(무료) 회원은 네 개 방만 열리고 방마다 무료 질문 수가 다르며,
// 심층 리포트(개인 통합 리포트) 회원은 모든 방이 열리고 방마다 무료 질문 3번이다. 무료 질문을 다 쓰면 질문 3개 묶음 결제로 이어 간다.
// 값은 lib/config/product.ts의 CHAT_ROOMS 한 곳에서 정한다. 채널 독립 코드다.
import { CHAT_ROOMS } from "../../config/product.ts";

export type ChatTier = "free" | "paid";

export type RoomPolicy = {
  /** 이 등급으로 이 방에 들어갈 수 있는가 (false면 심층 리포트로만 열리는 방) */
  open: boolean;
  /** 방마다 무료 질문 수 (0이면 질문이 없다) */
  freeQuestions: number;
  /** 무료 질문을 다 쓴 뒤 질문 3개 묶음 결제로 이어서 물을 수 있는가 */
  cashAllowed: boolean;
  /** 무료 리포트로는 더 이어 갈 수 없고 심층 리포트가 필요한 방 (닫힌 방 · 질문이 없는 방) */
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

/** 무료 리포트(무료)로 열리는 방인가 */
export const isSimpleRoom = (room: string) => CHAT_ROOMS.simple[room] !== undefined;

/** 무료 리포트로 열리는 방을 보이는 순서 — 운영자(2026-10-15): 나를 알아보기 · 오늘의 운세 · 고민해결소 · 연애 (강조해서 위쪽에) */
const SIMPLE_SHOW_ORDER = ["main", "daily", "concern", "love"] as const;

/**
 * 방 목록을 둘로 나눈다 — 무료 리포트로 무료로 이야기할 수 있는 방(위쪽, 강조)과 심층 리포트로만 열리는 방("심층 리포트로는 아래 상담도 가능해요!").
 * roomOrder는 전체 방 순서이고, 무료 리포트 방은 위의 순서를 따른다(정책에 방이 더해지면 뒤에 붙는다).
 */
export function roomSections<T extends string>(roomOrder: readonly T[]): { simple: T[]; deepOnly: T[] } {
  const inOrder = roomOrder.filter((r) => isSimpleRoom(r));
  const known = SIMPLE_SHOW_ORDER.filter((r): r is (typeof SIMPLE_SHOW_ORDER)[number] & T => (inOrder as string[]).includes(r));
  const rest = inOrder.filter((r) => !(known as string[]).includes(r));
  return { simple: [...known, ...rest], deepOnly: roomOrder.filter((r) => !isSimpleRoom(r)) };
}

/**
 * 방 카드에 쓰는 한 줄 — 방마다 무료 질문이 몇 번인지. chatReady가 false(자유 질문 AI가 연결되지 않음)면 질문을 약속하지 않고 "준비 중"으로 밝힌다.
 * 오늘의 운세 방은 날짜별 방이라 하루마다 그 횟수다.
 */
export function roomQuestionNote(tier: ChatTier, room: string, chatReady: boolean): string {
  const policy = roomPolicy(tier, room);
  if (!policy.open) return "심층 리포트로 열려요";
  if (!chatReady) return "질문 기능은 준비 중이에요";
  if (policy.freeQuestions === 0) return "질문은 없어요 · 자세한 이야기는 심층 리포트에서";
  const unit = room === "daily" ? "하루 무료 질문" : "무료 질문";
  return tier === "paid" ? `${unit} ${policy.freeQuestions}번 · 더 묻고 싶으면 질문 3개 묶음 결제` : `${unit} ${policy.freeQuestions}번`;
}
