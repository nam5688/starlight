// 리포트 생성 상태 — 결제 상태와 따로 관리한다.

export type ReportStatus = "queued" | "generating" | "ready" | "failed";

/** 생성 중 상태가 이 시간보다 오래되면 멈춘 것으로 보고 다시 시도할 수 있다 (AI 생성은 1~2분 걸릴 수 있다) */
export const REPORT_GENERATING_STALE_MS = 5 * 60 * 1000;

/** 자동·수동 재시도 상한. 넘으면 운영자가 확인한다 (재처리 또는 환불). */
export const REPORT_MAX_ATTEMPTS = 5;

/** 대기 · 생성 중인 리포트가 이 시간을 넘기면 운영자에게 알린다 (고객 화면의 지연 안내 기준은 REPORT_SLA_MS) */
export const REPORT_DELAY_ALERT_MS = 15 * 60_000;
/** 이 시간을 넘기면 고객 화면에 "지연 중, 기다리거나 환불 문의" 안내를 함께 보여 준다 */
export const REPORT_SLA_MS = 30 * 60_000;

/**
 * 한 번의 생성 시도에 허용하는 시간. 생성 중 상태가 멈춘 것으로 보는 시간(REPORT_GENERATING_STALE_MS)보다 짧아야 한다.
 * 넘기면 실패로 남기고(완성으로 저장하지 않음) 고객은 다시 만들기를 누를 수 있다.
 */
export const REPORT_GENERATION_TIMEOUT_MS = 4 * 60_000;
/** "다시 만들기"를 이어서 누를 수 있는 최소 간격 (연타 · 반복 호출 비용 방지) */
export const REPORT_RETRY_COOLDOWN_MS = 60_000;
/** 한 회원이 하루(24시간)에 저장할 수 있는 검사 결과 수 (무료 생성 남용 방지) */
export const ASSESSMENT_DAILY_LIMIT = 10;
