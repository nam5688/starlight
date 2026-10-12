// 운영 알림 — 같은 문제로 알림이 반복되지 않게 하고, 알림이 실패해도 결제 · 리포트 제공에는 영향을 주지 않는다.
// 알림 내용에는 주문번호 · 오류 식별번호 · 종류만 넣는다 (고객 이름 · 생년월일 · 답변 · 분석 내용 · 키 금지).

import type { MiyuRepository, OpsSeverity } from "../services/ports.ts";
import { redactSecrets } from "./redact.ts";

export type Alert = {
  /** 예: payment.approved · payment.refunded · reconcile.anomaly · report.failed · sales.paused · server.error */
  kind: string;
  /** info는 처리할 문제가 아닌 알림(결제 승인 완료 · 환불 완료) */
  severity: OpsSeverity;
  /** 한 줄 요약 (고객 정보 없이) */
  title: string;
  orderNumber?: string | null;
  errorId?: string | null;
  /** 같은 값이면 dedupeMs 안에서는 한 번만 보낸다 */
  dedupeKey: string;
  /** 이 알림만 중복 방지 기간을 따로 정한다 (결제 승인 완료처럼 주문당 한 번만 보낼 알림) */
  dedupeMs?: number;
  /** 짧은 보조 줄 (선택) */
  lines?: string[];
};

export interface Notifier {
  /** 보냈으면 true. 실패해도 던지지 않는다 */
  send(text: string): Promise<boolean>;
}

export type RaiseResult = "sent" | "deduped" | "failed";

export const ALERT_DEDUPE_MS = 6 * 3600_000;
/** 주문당 한 번만 보내는 알림 — 사실상 영구 */
export const ALERT_ONCE_MS = 10 * 365 * 24 * 3600_000;

/**
 * 알림 문구: 종류 · 주문번호 · 오류 식별번호 중심, 가려서 만든다.
 * 결제 실서비스(PAYMENTS_LIVE_MODE)가 아닌 환경의 알림은 `[미유·테스트]`로 시작해 실제 운영 알림과 섞이지 않게 한다.
 */
export function alertText(alert: Alert, options: { adminPath?: string; test?: boolean } = {}): string {
  const adminPath = options.adminPath ?? "/admin";
  const level = alert.severity === "error" ? "오류" : alert.severity === "warn" ? "주의" : "";
  const tag = options.test ? "[미유·테스트]" : level ? `[미유 ${level}]` : "[미유]";
  const head = `${tag}${options.test && level ? ` ${level} ·` : ""} ${alert.title}`;
  const ids = [alert.orderNumber ? `주문번호 ${alert.orderNumber}` : null, alert.errorId ? `오류번호 ${alert.errorId}` : null].filter(Boolean).join(" · ");
  return redactSecrets([head, ids, ...(alert.lines ?? []), `관리자 화면 ${adminPath}`].filter(Boolean).join("\n")).slice(0, 900);
}

/** 운영 기록을 남기고(항상), 새로운 문제일 때만 알림을 보낸다 */
export async function raiseAlert(
  deps: { repo: MiyuRepository; notifier: Notifier; now: () => Date; dedupeMs?: number; test?: boolean },
  alert: Alert,
): Promise<RaiseResult> {
  const since = new Date(deps.now().getTime() - (alert.dedupeMs ?? deps.dedupeMs ?? ALERT_DEDUPE_MS)).toISOString();
  let duplicate = false;
  try {
    duplicate = await deps.repo.hasOpsEventSince(alert.dedupeKey, since);
  } catch {
    // 기록 조회 실패 시에는 알림을 보내는 쪽을 택한다 (놓치는 것보다 중복이 낫다)
  }
  try {
    await deps.repo.addOpsEvent({
      kind: alert.kind,
      severity: alert.severity,
      orderNumber: alert.orderNumber ?? null,
      errorId: alert.errorId ?? null,
      dedupeKey: alert.dedupeKey,
      message: redactSecrets(alert.title).slice(0, 500),
      detail: { lines: (alert.lines ?? []).map((l) => redactSecrets(l).slice(0, 200)).slice(0, 5) },
    });
  } catch {
    // 기록 실패가 알림을 막지 않는다
  }
  if (duplicate) return "deduped";
  try {
    return (await deps.notifier.send(alertText(alert, { test: deps.test }))) ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
