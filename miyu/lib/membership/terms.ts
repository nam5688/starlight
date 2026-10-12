// 회원 가입 동의 항목. 약관 내용이 바뀌면 TERMS_VERSION을 올린다 → 기존 회원도 다시 동의해야 이용할 수 있다.
// 약관·개인정보 처리방침 본문은 출시 전 법률 검토로 확정한다 (현재 초안).

export const TERMS_VERSION = "2026-10-draft-1";

export type ConsentType = "age_14" | "terms" | "privacy" | "marketing";

export type ConsentItem = {
  type: ConsentType;
  required: boolean;
  label: string;
  detail?: string;
  /** 본문 링크 */
  href?: string;
};

export const CONSENT_ITEMS: readonly ConsentItem[] = [
  { type: "age_14", required: true, label: "만 14세 이상입니다" },
  { type: "terms", required: true, label: "서비스 이용약관 동의", href: "/terms" },
  {
    type: "privacy",
    required: true,
    label: "개인정보 수집·이용 동의",
    detail: "카카오 회원번호·닉네임, 생년월일·출생시간, 검사 응답과 결과, 주문 기록을 분석 제공과 결과 보관에 사용합니다.",
    href: "/privacy",
  },
  {
    type: "marketing",
    required: false,
    label: "새 상품·할인 소식 받기",
    detail: "미유의 새 분석 상품과 할인 소식을 카카오톡·이메일로 받습니다. MY에서 언제든 끌 수 있습니다.",
  },
];

export type ConsentRecord = { type: ConsentType; version: string; agreed: boolean; createdAt: string };

/** 항목별 가장 최근 기록만 남긴다 (기록은 지우지 않고 쌓는다). 시각이 같으면 목록에서 뒤에 오는 기록이 최신. */
export function latestConsents(records: readonly ConsentRecord[]): Partial<Record<ConsentType, ConsentRecord>> {
  const out: Partial<Record<ConsentType, ConsentRecord>> = {};
  for (const r of records) {
    const current = out[r.type];
    if (!current || r.createdAt >= current.createdAt) out[r.type] = r;
  }
  return out;
}

/** 현재 버전의 필수 항목에 모두 동의했는지 */
export function hasRequiredConsents(records: readonly ConsentRecord[], version = TERMS_VERSION): boolean {
  const latest = latestConsents(records);
  return CONSENT_ITEMS.filter((i) => i.required).every((i) => {
    const r = latest[i.type];
    return r?.agreed === true && r.version === version;
  });
}

export function marketingAgreed(records: readonly ConsentRecord[]): boolean {
  return latestConsents(records).marketing?.agreed === true;
}
