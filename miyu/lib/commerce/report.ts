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
