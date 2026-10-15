// 회원 탈퇴 — 무엇이 지워지고 무엇이 남는지의 안내 문구와 보관 기간 (정책 확정 전 초안: docs/withdrawal-policy.md).
// 실제 삭제는 DB 함수 withdraw_member_data(supabase/migrations/20261020000000_account_withdrawal.sql, 11번에서 고민 기록 삭제 추가)가 한다.
// 이 목록과 DB 함수의 처리가 같은지는 DB 테스트(supabase/tests/db.test.ts)가 확인한다.

/** 확인 문구 — 입력창에 그대로 적어야 탈퇴가 진행된다 */
export const WITHDRAWAL_CONFIRM_WORD = "탈퇴";

/** 거래 기록 보관 기간(년). 전자상거래법 시행령의 "대금결제 및 재화 등의 공급에 관한 기록" 기준으로 가정한 값이며, 법률 검토 후 확정한다 */
export const TRANSACTION_RETENTION_YEARS = 5;

export const WITHDRAWAL_DELETED: readonly string[] = [
  "검사 결과: 닉네임 · 생년월일 · 출생시간 · MBTI · 검사 응답 · 사주 계산 결과",
  "구매한 리포트의 내용 (탈퇴 후에는 다시 볼 수 없고 복구할 수 없습니다)",
  "내 고민 자세히 알려주기에 적은 고민 · 상황 · 대화 일부와, 새 리포트를 발급할 때 남긴 고민 기록(그때 적은 내용)",
  "리포트 만족도, 거주 · 활동 지역, 닉네임",
  "카카오 로그인 연결 정보 (같은 카카오 계정으로 다시 가입하면 새 계정이 만들어집니다)",
];

export const WITHDRAWAL_KEPT: readonly string[] = [
  `주문 · 결제 기록: 주문번호 · 금액 · 결제 시각 · 결제 승인 / 취소 기록. 이름 · 생년월일 · 응답은 포함되지 않으며, 법령이 정한 기간(${TRANSACTION_RETENTION_YEARS}년 가정) 동안 보관한 뒤 삭제합니다.`,
  "가입 동의 기록: 동의한 항목 · 약관 버전 · 시각",
  "유료 질문 결제 · 사용 내역(거래 기록, 질문 내용은 담지 않음) — 결제해 두고 쓰지 않은 질문이 없을 때만 탈퇴할 수 있습니다",
];

export type WithdrawalBlocker = "pending-order" | "report-in-progress" | "cash-balance";

export const WITHDRAWAL_BLOCKER_TEXT: Record<WithdrawalBlocker, string> = {
  "pending-order": "결제 결과를 확인하고 있는 주문이 있습니다. 결제 확인이 끝난 뒤(보통 몇 분, 최대 1시간)에 다시 탈퇴해 주세요.",
  "report-in-progress": "리포트를 만들고 있는 중입니다. 완성된 뒤에 다시 탈퇴해 주세요.",
  "cash-balance": "결제해 두고 아직 쓰지 않은 질문이 있어 지금은 탈퇴할 수 없습니다(임시 처리입니다). 질문에 모두 쓰거나, 환불이 필요하면 운영자에게 환불을 요청한 뒤에 탈퇴해 주세요. 쓰지 않은 질문의 환불 · 정산과 탈퇴 방법은 확정 전 초안이며, 확정되면 환불을 신청하고 바로 탈퇴할 수 있게 바꿉니다.",
};
