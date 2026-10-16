// 사업자 정보 — 전자상거래법상 사이트 하단에 표시해야 하는 항목. 운영자가 직접 알려 준 값 그대로이며(2026-10-15) 바꿀 때는 여기서만 바꾼다.
// 값은 공개해도 되는 사업자 등록 정보만 담는다. 비밀값 · 연락처 개인 번호는 넣지 않는다.

export const BUSINESS_INFO = {
  /** 하단 저작권 줄 — 운영자가 적어 준 표기 그대로 */
  copyright: "© PEEKY｜ ME:U",
  tradeName: "슬링샵",
  representative: "박슬기",
  address: "인천 남동구 장아산로158 112.503",
  businessNumber: "317-17-01749",
  mailOrderNumber: "2023-인천남동구-1765",
  privacyOfficer: "박슬기",
} as const;

/** 하단에 보이는 항목 이름 · 값 (이 순서로 " | "로 이어 보인다) */
export const BUSINESS_FIELDS: readonly { label: string; value: string }[] = [
  { label: "상호", value: BUSINESS_INFO.tradeName },
  { label: "대표자", value: BUSINESS_INFO.representative },
  { label: "소재지", value: BUSINESS_INFO.address },
  { label: "사업자등록번호", value: BUSINESS_INFO.businessNumber },
  { label: "통신판매신고번호", value: BUSINESS_INFO.mailOrderNumber },
  { label: "개인정보관리책임자", value: BUSINESS_INFO.privacyOfficer },
];

/**
 * 고객 문의 채널 — **운영자(박슬기)가 정해 알려 준 값만** 적는다(2026-10-16): 카카오톡 채널 "미유톡"의 상담톡(CS 전용). 이메일 · 전화는 정해지지 않아 비워 둔다 — 지어내서 채우지 않는다.
 * 사이트 하단 · 약관 9조 · 유료 질문 환불 안내에 그대로 보인다. 응대 시간은 운영자가 알려 주기 전까지 적지 않는다.
 * 문의 채널이 비어 있으면 실결제 질문 판매를 열지 않는다(환불을 요청할 곳이 없으면 판매하지 않는다 — lib/config/product.ts의 questionPackSalesOpen).
 */
export const SUPPORT_CONTACT: { email: string | null; channelName: string | null; channelUrl: string | null; hours: string | null } = {
  email: null,
  channelName: "미유톡 (카카오톡 채널 · CS 전용 상담톡)",
  channelUrl: "http://pf.kakao.com/_xjxnqmX/chat",
  hours: null,
};

/** 문의 채널이 정해졌는가 — 이메일이나 채널(링크) 중 하나라도 있어야 한다 */
export const hasSupportContact = (c: typeof SUPPORT_CONTACT = SUPPORT_CONTACT): boolean => Boolean(c.email?.trim() || (c.channelName?.trim() && c.channelUrl?.trim()));

/** 화면에 보이는 한 줄 — 정해지지 않았으면 null (호출한 쪽이 "정하는 중" 문구를 보인다) */
export function supportContactLine(c: typeof SUPPORT_CONTACT = SUPPORT_CONTACT): string | null {
  if (!hasSupportContact(c)) return null;
  const parts = [c.email?.trim() ? `이메일 ${c.email.trim()}` : null, c.channelName?.trim() && c.channelUrl?.trim() ? `${c.channelName.trim()} ${c.channelUrl.trim()}` : null, c.hours?.trim() ? `응대 시간 ${c.hours.trim()}` : null];
  return parts.filter(Boolean).join(" · ");
}

/** 문의 채널이 아직 없을 때 보이는 문구 */
export const SUPPORT_CONTACT_PENDING = "고객 문의 채널은 운영자가 정하는 중입니다. 정해지면 이 자리와 사이트 하단에 적습니다.";
