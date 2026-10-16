// 초대 링크 · 초대 할인 규칙 — 채널 독립 코드(React · Next · 외부 SDK를 쓰지 않는다).
// 링크에는 이름 · 생년월일 · 회원번호가 없고 무작위 토큰(24자)뿐이다. 할인 대상인지 · 한도 · 첫 구매 여부는 서버(DB)가 정하고, 여기는 토큰 모양과 안내 문구만 둔다.

export const INVITE_TOKEN_LENGTH = 24;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/;

/** 무작위 토큰 24자(18바이트 → base64url). 웹 표준 crypto를 쓴다(Node · 브라우저 모두 있다) */
export function createInviteToken(bytes: (n: number) => Uint8Array = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))): string {
  const raw = bytes(18);
  let bin = "";
  for (const b of raw) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const isInviteToken = (v: unknown): v is string => typeof v === "string" && TOKEN_PATTERN.test(v);

/** 할인 확인 결과 — ok: 지금 이 사람이 이 링크로 할인받을 수 있다(remaining: 초대한 사람의 남은 자리) / 아니면 이유 */
export type InviteDiscountReason = "invalid" | "not-deep" | "self" | "inviter-not-paid" | "already-used" | "not-first" | "cap" | "order-mismatch";
export type InviteDiscountCheck = { ok: true; remaining: number } | { ok: false; reason: InviteDiscountReason };

/** 이유 → 고객에게 보이는 말. 한도 · 이미 사용은 "정가로 받을 수 있다"는 안내까지 붙인다 */
export const INVITE_REASON_TEXT: Record<InviteDiscountReason, string> = {
  invalid: "열 수 없는 초대 링크예요. 링크를 다시 확인해 주세요.",
  "not-deep": "이 링크로는 초대 가격을 받을 수 없어요.",
  self: "내가 만든 초대 링크예요. 친구에게 보내 주세요.",
  "inviter-not-paid": "지금은 이 링크의 초대 가격을 확인할 수 없어요.",
  "already-used": "초대 가격은 한 번만 받을 수 있어요. 이미 사용하셨어요.",
  "not-first": "초대 가격은 심층 리포트를 처음 받을 때만 적용돼요.",
  cap: "이 링크의 초대 가격 자리가 모두 찼어요. 지금은 정가로 받을 수 있어요.",
  "order-mismatch": "이 주문에는 초대 가격을 적용할 수 없어요.",
};
