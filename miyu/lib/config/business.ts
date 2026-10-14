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
