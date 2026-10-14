// 미유캐시 규칙 — 충전 금액 · 보너스 계산과 질문에 드는 캐시. 채널(웹)과 결제사에 관계없이 같은 규칙을 쓴다.
// 값(1캐시의 값 · 단위 · 보너스 구간)은 lib/config/product.ts의 MIYU_CASH 한 곳에서만 바꾼다.

import { cashProductId, MIYU_CASH } from "../config/product.ts";

export type CashQuote = {
  /** 충전하는 캐시 (10의 배수) */
  cash: number;
  /** 보너스로 더 얹는 캐시 (소수점 버림) */
  bonus: number;
  /** 지갑에 들어가는 합계 */
  total: number;
  /** 보너스 비율(%) — 보너스가 없으면 0 */
  bonusPct: number;
  /** 결제 금액 (원) */
  priceKrw: number;
  /** 합계로 물어볼 수 있는 횟수 (남는 캐시는 다음 충전에 이어서 쓴다) */
  questions: number;
};

/** 충전 캐시에 붙는 보너스 — 가장 높은 구간 하나만 적용하고 소수점은 버린다 */
export function bonusFor(cash: number): { bonus: number; pct: number } {
  let pct = 0;
  for (const tier of MIYU_CASH.bonusTiers) if (cash >= tier.minCash && tier.ratePct > pct) pct = tier.ratePct;
  return { bonus: Math.floor((cash * pct) / 100), pct };
}

/** 충전 가능한 개수인가: 정수 · 10의 배수 · 최소 ~ 최대 범위 */
export function isChargeable(cash: unknown): cash is number {
  return typeof cash === "number" && Number.isInteger(cash) && cash % MIYU_CASH.unit === 0 && cash >= MIYU_CASH.minCash && cash <= MIYU_CASH.maxCash;
}

/** 충전 견적 — 충전할 수 없는 개수면 null. 화면 · 주문 생성이 같은 계산을 쓴다 */
export function quoteCharge(cash: unknown): CashQuote | null {
  if (!isChargeable(cash)) return null;
  const { bonus, pct } = bonusFor(cash);
  const total = cash + bonus;
  return { cash, bonus, total, bonusPct: pct, priceKrw: cash * MIYU_CASH.krwPerCash, questions: Math.floor(total / MIYU_CASH.perQuestion) };
}

/** 빠른 선택 견적 목록 */
export const chargePackages = (): CashQuote[] => MIYU_CASH.packages.map((c) => quoteCharge(c)).filter((q): q is CashQuote => q !== null);

/** 지금 잔액으로 물어볼 수 있는 횟수 */
export const questionsLeft = (balance: number) => Math.max(0, Math.floor(balance / MIYU_CASH.perQuestion));

/** 질문 한 번을 캐시로 물을 수 있는 잔액인가 */
export const canAffordQuestion = (balance: number) => balance >= MIYU_CASH.perQuestion;

/** 주문을 만들 때 쓰는 상품 번호 — 견적에서 충전 캐시 · 보너스를 정해 번호에 적는다 */
export const productIdFor = (quote: CashQuote, nonce: string) => cashProductId({ cash: quote.cash, bonus: quote.bonus, nonce });

const NONCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 주문마다 다른 임의 번호 (영문 · 숫자 10자) */
export function createCashNonce(random: (bytes: Uint8Array) => Uint8Array = (b) => globalThis.crypto.getRandomValues(b)): string {
  return Array.from(random(new Uint8Array(10)), (b) => NONCE_ALPHABET[b % NONCE_ALPHABET.length]).join("");
}
