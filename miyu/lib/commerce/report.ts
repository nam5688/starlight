// 리포트 생성 상태 — 결제 상태와 따로 관리한다.

export type ReportStatus = "queued" | "generating" | "ready" | "failed";

/** 생성 중 상태가 이 시간보다 오래되면 멈춘 것으로 보고 다시 시도할 수 있다 */
export const REPORT_GENERATING_STALE_MS = 2 * 60 * 1000;

/** 자동·수동 재시도 상한. 넘으면 운영자가 확인한다 (재처리 또는 환불). */
export const REPORT_MAX_ATTEMPTS = 5;
