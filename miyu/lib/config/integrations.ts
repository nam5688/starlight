// 외부 서비스 연결 상태. 화면은 이 값을 보고 "연결 전" 상태를 표시한다.
// 실제 연결 코드는 각 단계에서 lib/integrations/ 아래에 서비스별로 추가한다.

export type IntegrationKey =
  | "kakaoLogin"
  | "reportStorage"
  | "sajuEngine"
  | "reportGeneration"
  | "payments"
  | "telegram";

export const INTEGRATIONS: Record<IntegrationKey, { label: string; stage: number; connected: boolean }> = {
  kakaoLogin: { label: "카카오 로그인", stage: 2, connected: false },
  reportStorage: { label: "결과 저장", stage: 2, connected: false },
  sajuEngine: { label: "만세력 계산", stage: 2, connected: false },
  reportGeneration: { label: "리포트 생성(AI 해석)", stage: 3, connected: false },
  payments: { label: "토스페이먼츠 결제", stage: 3, connected: false },
  telegram: { label: "텔레그램 운영 알림", stage: 4, connected: false },
};
