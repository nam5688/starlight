// 외부 서비스·모듈별 진행 단계. 화면의 "N단계" 표시에 쓴다.
// 실제 연결 여부는 서버 환경변수로 판단한다 (server/env.ts의 isAuthConfigured, paymentConfig).

export type IntegrationKey =
  | "kakaoLogin"
  | "reportStorage"
  | "sajuEngine"
  | "reportGeneration"
  | "payments"
  | "telegram";

export const INTEGRATIONS: Record<IntegrationKey, { label: string; stage: number }> = {
  kakaoLogin: { label: "카카오 로그인", stage: 2 },
  reportStorage: { label: "결과 저장", stage: 2 },
  sajuEngine: { label: "만세력 계산", stage: 2 },
  reportGeneration: { label: "리포트 생성(AI 해석)", stage: 3 },
  payments: { label: "토스페이먼츠 결제", stage: 3 },
  telegram: { label: "텔레그램 운영 알림", stage: 4 },
};
