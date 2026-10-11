// 상품 정보. 가격은 가안이며 여기서만 바꾼다.
// 결제 연결 단계(3단계)에서는 서버가 이 값(또는 DB)을 기준으로 금액을 확인하고,
// 브라우저가 보낸 금액은 믿지 않는다.

export const PERSONAL_REPORT = {
  id: "personal-integrated-report",
  name: "개인 통합 리포트",
  priceKrw: 9900,
  /** 화면에 함께 표시하는 가격 상태 */
  priceNote: "가안",
} as const;

export function formatKrw(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}
