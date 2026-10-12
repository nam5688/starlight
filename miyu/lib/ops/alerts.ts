// 운영 알림 — 같은 문제로 알림이 반복되지 않게 하고, 알림이 실패해도 결제 · 리포트 제공에는 영향을 주지 않는다.
// 알림 내용에는 주문번호 · 오류 식별번호 · 종류만 넣는다 (고객 이름 · 생년월일 · 답변 · 분석 내용 · 키 금지).

import type { MiyuRepository, OpsSeverity } from "../services/ports.ts";
import { redactSecrets } from "./redact.ts";

export type Alert = {
  /** 예: reconcile.anomaly · confirm.save_failed · report.failed · server.error */
  kind: string;
  severity: Exclude<OpsSeverity, "info">;
  /** 한 줄 요약 (고객 정보 없이) */
  title: string;
  orderNumber?: string | null;
  errorId?: string | null;
  /** 같은 값이면 dedupeMs 안에서는 한 번만 보낸다 */
  dedupeKey: string;
  /** 짧은 보조 줄 (선택) */
  lines?: string[];
};

export interface Notifier {
  /** 보냈으면 true. 실패해도 던지지 않는다 */
  send(text: string): Promise<boolean>;
}

export type RaiseResult = "sent" | "deduped" | "failed";

export const ALERT_DEDUPE_MS = 6 * 3600_000;

/** 알림 문구: 종류 · 주문번호 · 오류 식별번호 중심, 가려서 만든다 */
export function alertText(alert: Alert, adminPath = "/admin"): string {
  const head = `[미유 ${alert.severity === "error" ? "오류" : "주의"}] ${alert.title}`;
  const ids = [alert.orderNumber ? `주문번호 ${alert.orderNumber}` : null, alert.errorId ? `오류번호 ${alert.errorId}` : null].filter(Boolean).join(" · ");
  return redactSecrets([head, ids, ...(alert.lines ?? []), `관리자 화면 ${adminPath}`].filter(Boolean).join("\n")).slice(0, 900);
}

/** 운영 기록을 남기고(항상), 새로운 문제일 때만 알림을 보낸다 */
export async function raiseAlert(
  deps: { repo: MiyuRepository; notifier: Notifier; now: () => Date; dedupeMs?: number },
  alert: Alert,
): Promise<RaiseResult> {
  const since = new Date(deps.now().getTime() - (deps.dedupeMs ?? ALERT_DEDUPE_MS)).toISOString();
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
    return (await deps.notifier.send(alertText(alert))) ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
