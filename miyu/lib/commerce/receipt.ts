// 결제 영수증 주소 검증 — 토스페이먼츠 결제 조회 응답의 receipt.url(공식 필드: "구매자에게 제공할 수 있는 결제수단별 영수증")만 구매자에게 보여 준다.
// 이 함수는 주소를 만들지 않는다(가짜 영수증 금지). 결제사 응답에서 온 값이 아래 조건을 모두 만족할 때만 그대로 돌려주고, 하나라도 어긋나면 null이다(닫는 쪽으로 실패한다).
//  · https 만 · 토스페이먼츠 공식 도메인(tosspayments.com 과 그 하위 도메인)만 · 주소 안에 아이디/비밀번호 · 특별한 포트 · 공백/제어문자 없음 · 길이 제한
//  · 도메인은 문자열이 아니라 해석한 호스트로 비교한다("tosspayments.com.evil.com", "evil-tosspayments.com", "https://evil.com\@dashboard.tosspayments.com" 같은 모양을 거절)
// 토스 문서(docs.tosspayments.com/reference)는 receipt.url의 호스트 예시를 싣지 않는다. 실제 응답이 다른 도메인이면 영수증 링크가 열리지 않고 "결제사에서 확인" 안내로 멈춘다(허용 목록을 넓히는 것은 운영자 확인 뒤).

/** 허용하는 공식 도메인 — 이 도메인 자체와 그 하위 도메인(점으로 구분되는 경계에서만) */
export const RECEIPT_OFFICIAL_DOMAIN = "tosspayments.com";
export const RECEIPT_URL_MAX_LENGTH = 2048;

export function officialReceiptUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > RECEIPT_URL_MAX_LENGTH) return null;
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) return null; // 공백 · 제어문자(줄바꿈으로 헤더를 끼워 넣는 모양 포함)
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port) return null; // https 기본 포트(443)만
  const host = url.hostname.toLowerCase();
  if (host !== RECEIPT_OFFICIAL_DOMAIN && !host.endsWith(`.${RECEIPT_OFFICIAL_DOMAIN}`)) return null;
  return url.href;
}

/** 영수증을 보여 줄 수 있는 주문 상태 — 결제가 승인된 적 있는 주문(결제 완료 · 환불됨)만. 대기 · 실패 · 만료 주문에는 결제사 영수증이 없다 */
export function receiptEligible(status: string): boolean {
  return status === "paid" || status === "refunded";
}

/** 영수증을 열 수 없을 때 안내하는 이유 — 화면이 주소의 ?receipt= 값으로 읽는다(알 수 없는 값은 무시한다) */
export const RECEIPT_NOTICES = {
  "no-payment": "결제가 승인된 주문에만 영수증이 있어요.",
  "lookup-failed": "지금은 결제사에서 영수증을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.",
  "no-receipt": "결제사가 이 결제의 영수증 주소를 주지 않았어요. 테스트 결제이거나 결제수단에 따라 없을 수 있어요. 필요하면 고객센터로 알려 주세요.",
  mismatch: "결제사 기록이 이 주문과 맞지 않아 영수증을 열지 않았어요. 운영자가 확인할게요.",
} as const;
export type ReceiptNoticeKey = keyof typeof RECEIPT_NOTICES;
export const receiptNoticeOf = (v: unknown): ReceiptNoticeKey | null => (typeof v === "string" && Object.hasOwn(RECEIPT_NOTICES, v) ? (v as ReceiptNoticeKey) : null);
