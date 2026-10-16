// 유료 질문 규칙 — 무료 질문을 다 쓴 뒤 질문 3개 묶음(2,500원, 부가세 포함)을 결제하는 값과 주문 번호. 채널(웹)과 결제사에 관계없이 같은 규칙을 쓴다.
// 값(묶음의 값 · 질문 수 · 장부 단위)은 lib/config/product.ts의 MIYU_CASH · QUESTION_PACK_* 한 곳에서만 바꾼다. 낱개 결제 · 충전 금액 입력 · 보너스는 없다(운영자 2026-10-15).

import { cashOrderKind, cashProductId, MIYU_CASH, parseCashProductId, QUESTION_PACK_PRICE_KRW, QUESTION_PACK_SIZE, QUESTION_PACK_UNITS } from "../config/product.ts";

/** 질문 3개 묶음 결제의 견적 — 서버가 주문 금액으로 쓰고, 화면은 같은 값을 보여 준다 */
export type QuestionQuote = {
  /** 결제 금액 (원, 부가세 포함) */
  priceKrw: number;
  /** 결제하면 생기는 질문 수 (3 — 낱개 결제는 없다) */
  questions: number;
  /** 결제하면 장부에 들어오는 단위 (질문 수 × 질문 한 번의 단위) */
  units: number;
};

export const questionQuote = (): QuestionQuote => ({ priceKrw: QUESTION_PACK_PRICE_KRW, questions: QUESTION_PACK_SIZE, units: QUESTION_PACK_UNITS });

/** 지금 장부로 물어볼 수 있는 질문 수 (결제하고 아직 쓰지 않은 질문) */
export const questionsLeft = (balance: number) => Math.max(0, Math.floor(balance / MIYU_CASH.perQuestion));

/** 결제한 질문이 남아 있는가 — 하나라도 남아 있으면 새로 결제받지 않고 그 질문으로 묻는다(그래서 쓰지 않은 질문은 최대 2개까지 남는다) */
export const canAffordQuestion = (balance: number) => balance >= MIYU_CASH.perQuestion;

const NONCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RANDOM_LENGTH = 10;
/** 번호 앞에 붙는 방 이름 — 소문자 영문(상담방 이름 규칙) */
const ROOM = /^[a-z]{2,20}$/;

function randomPart(random: (bytes: Uint8Array) => Uint8Array): string {
  return Array.from(random(new Uint8Array(RANDOM_LENGTH)), (b) => NONCE_ALPHABET[b % NONCE_ALPHABET.length]).join("");
}

/**
 * 질문 결제 주문의 임의 번호 — 방 이름(대문자) + 임의 10자 (영문 · 숫자만, DB 13번이 허용하는 6~32자 안).
 * 방 이름이 앞에 붙어 있어서 결제가 끝난 뒤 그 방으로 돌아올 수 있고, 주문마다 번호가 달라 같은 검사 결과에서 여러 번 결제해도 된다.
 */
export function createQuestionNonce(room: string, random: (bytes: Uint8Array) => Uint8Array = (b) => globalThis.crypto.getRandomValues(b)): string {
  if (!ROOM.test(room)) throw new Error("상담방 이름이 올바르지 않습니다.");
  return `${room.toUpperCase()}${randomPart(random)}`;
}

/** 질문 3개 묶음 결제 주문의 상품 번호 — `cash-charge:9:0:<방이름 + 임의 10자>` */
export const questionProductId = (nonce: string) => cashProductId({ cash: QUESTION_PACK_UNITS, bonus: 0, nonce });

/**
 * 상품 번호에서 질문 결제의 상담방 이름을 꺼낸다. 질문 3개 묶음 주문(또는 묶음 전 버전의 낱개 주문)이 아니거나(예전 선불 충전 주문 포함) 방 이름이 없으면 null.
 * 이 값은 돌아갈 화면을 고르는 데만 쓴다(권한 판단에는 쓰지 않는다).
 */
export function questionRoomOf(productId: string): string | null {
  const parsed = parseCashProductId(productId);
  if (!parsed || cashOrderKind(parsed) === "legacy") return null;
  const room = parsed.nonce.slice(0, parsed.nonce.length - RANDOM_LENGTH).toLowerCase();
  return ROOM.test(room) ? room : null;
}

// ───────────── 묶음(주문)별 환불 계산 — 누적 방식 (운영자 2026-10-15: 올림을 매번 하면 834 × 3 = 2,502원이 된다) ─────────────
// 환불액은 "누적 환불 질문 수 k"에 대해 올림(결제액 × k ÷ 묶음 질문 수)으로 정하고, 이번에 취소할 금액은 그 값에서 이미 환불한 누적액을 뺀 차이다.
// 그래서 1개씩 세 번 나눠 환불해도 834 + 833 + 833 = 2,500원이고, 한 번에 환불해도 같은 값이다. 토스의 누적 취소액이 결제액을 넘을 수 없다.
// DB의 question_refund_total(supabase/migrations/20261026000000_question_packs.sql)과 같은 식이며 db.test.ts가 둘을 비교한다.

/** 누적 환불 질문 수 k → 누적 환불액(원). 정수 올림 */
export const refundTotalFor = (priceKrw: number, questions: number, k: number): number => Math.floor((priceKrw * k + questions - 1) / questions);

/** 묶음 하나의 누적 환불액 표 — [k=1의 누적액, k=2의 누적액, …, 결제액] */
export const refundSchedule = (priceKrw: number, questions: number): number[] => Array.from({ length: questions }, (_, i) => refundTotalFor(priceKrw, questions, i + 1));

/** 토스의 누적 취소액이 몇 번째 누적 환불 질문 수에 해당하는가 — 표에 없는 금액이면 null (질문 수에 맞지 않는 취소) */
export function refundQuestionsFor(priceKrw: number, questions: number, canceledTotal: number): number | null {
  const i = refundSchedule(priceKrw, questions).indexOf(canceledTotal);
  return i < 0 ? null : i + 1;
}

/** 묶음 장부 한 줄 — DB question_packs와 같다 */
export type QuestionPackState = { questions: number; priceKrw: number; used: number; refundedQuestions: number; refundedKrw: number };

/** 이 묶음에서 아직 쓸 수 있는 질문 수 (환불로 정산한 질문과 쓴 질문을 뺀다) */
export const packRemaining = (p: Pick<QuestionPackState, "questions" | "used" | "refundedQuestions">): number => Math.max(0, p.questions - p.used - p.refundedQuestions);

/** 질문을 이미 썼는데 그 질문까지 환불해 버린 수 (회수하지 못한 몫, 동시에 쓴 경우 포함) */
export const packShortfall = (p: Pick<QuestionPackState, "questions" | "used" | "refundedQuestions">): number => Math.max(0, p.used + p.refundedQuestions - p.questions);

/**
 * 지금 남은 질문을 더 환불한다면 토스에서 이번에 취소할 금액 — 질문 1개 · 2개 · …(남은 만큼). cancelNow가 토스의 "취소 금액"에 넣을 값이고 cumulative가 그 뒤 누적 취소액이다.
 * 결제 승인이 확인된 주문의 묶음에만 쓴다(환불 가능 금액 안내용 — 환불을 실행하지는 않는다).
 */
export function nextRefundSteps(p: QuestionPackState): { questions: number; cancelNow: number; cumulative: number }[] {
  const left = packRemaining(p);
  return Array.from({ length: left }, (_, i) => {
    const k = p.refundedQuestions + i + 1;
    const cumulative = refundTotalFor(p.priceKrw, p.questions, k);
    return { questions: i + 1, cancelNow: cumulative - p.refundedKrw, cumulative };
  });
}
