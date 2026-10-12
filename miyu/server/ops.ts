import "server-only";
import { combineNotifiers, createLogNotifier, createTelegramNotifier, TELEGRAM_REASON_HELP } from "@/lib/integrations/telegram/notifier";
import { alertText, ALERT_ONCE_MS, raiseAlert, type Alert, type Notifier, type RaiseResult } from "@/lib/ops/alerts";
import { redactSecrets, safeErrorMessage } from "@/lib/ops/redact";
import { PERSONAL_REPORT } from "@/lib/config/product";
import type { OpsEventInput, OrderRecord } from "@/lib/services/ports";
import { paymentConfig, telegramEnv } from "./env";
import { now, writeRepository } from "./services";

/** 알림을 보낼 곳: 텔레그램 키가 있으면 텔레그램 + 서버 로그, 없으면 서버 로그만 (외부 서비스에는 키를 넣기 전까지 접속하지 않는다) */
export function notifier(): Notifier {
  const tg = telegramEnv();
  return tg ? combineNotifiers(createTelegramNotifier(tg), createLogNotifier()) : createLogNotifier();
}

/** 운영 기록 — 실패해도 호출한 흐름(결제 · 리포트)에는 영향을 주지 않는다. 내용은 가려서 저장한다 */
export async function recordOps(event: OpsEventInput): Promise<void> {
  try {
    await writeRepository().addOpsEvent({ ...event, message: redactSecrets(event.message).slice(0, 500) });
  } catch (e) {
    console.error("[ops] 기록 저장 실패", safeErrorMessage(e));
  }
}

/** 실결제(PAYMENTS_LIVE_MODE)가 아닌 환경의 알림은 `[미유·테스트]`로 표시한다 */
export function isTestEnvironment(): boolean {
  const cfg = paymentConfig();
  return !(cfg.ok && cfg.liveMode);
}

/** 기록을 남기고, 새로운 문제일 때만 알린다 */
export async function alert(a: Alert): Promise<RaiseResult> {
  try {
    return await raiseAlert({ repo: writeRepository(), notifier: notifier(), now, test: isTestEnvironment() }, a);
  } catch (e) {
    console.error("[ops] 알림 실패", safeErrorMessage(e));
    return "failed";
  }
}

/** 서버 로그용 — 비밀키 · 토큰 · 연락처는 가리고 메시지만 남긴다 */
export function logError(where: string, error: unknown): void {
  console.error(`[${where}]`, safeErrorMessage(error));
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/**
 * 결제 승인 완료 · 환불 완료 알림. 주문이 **서버 확인으로 실제로 바뀐 순간**에만 부른다
 * (결제창에서 돌아왔다는 것만으로는 부르지 않고, 이미 알린 주문은 주문번호 기준으로 다시 보내지 않는다).
 * 고객 이름 · 생년월일 · 응답 · 고민은 담지 않는다 — 주문번호 · 금액 · 상품 이름만.
 */
export async function notifyOrderEvent(kind: "paid" | "refunded", order: OrderRecord): Promise<void> {
  const productName = order.productId === PERSONAL_REPORT.id ? PERSONAL_REPORT.name : order.productId;
  await alert(
    kind === "paid"
      ? {
          kind: "payment.approved",
          severity: "info",
          title: `결제 승인 완료 · ${productName} ${won(order.amount)}`,
          orderNumber: order.orderNumber,
          dedupeKey: `payment.approved:${order.orderNumber}`,
          dedupeMs: ALERT_ONCE_MS,
          lines: [`결제 환경 ${order.paymentEnv === "live" ? "실결제" : "테스트"}`],
        }
      : {
          kind: "payment.refunded",
          severity: "info",
          title: `환불 완료 · ${productName} ${won(order.amount)} (결제사 취소를 확인해 열람 권한 회수)`,
          orderNumber: order.orderNumber,
          dedupeKey: `payment.refunded:${order.orderNumber}`,
          dedupeMs: ALERT_ONCE_MS,
          lines: [`결제 환경 ${order.paymentEnv === "live" ? "실결제" : "테스트"}`],
        },
  );
}

export type NotificationTestResult =
  | { configured: false }
  | { configured: true; sent: number; failed: { reason: string; help: string } | null };

/** 알림 시험 문구 — 종류별 모양을 보여 준다. 실제 주문이 아니며 `[미유·테스트]` 표시가 붙는다 */
const SAMPLE_ALERTS: Alert[] = [
  { kind: "test.payment.approved", severity: "info", title: "결제 승인 완료 · 개인 통합 리포트 9,900원 (시험 — 실제 주문 아님)", orderNumber: "MEU-TEST-0000000001", dedupeKey: "", lines: ["결제 환경 테스트"] },
  { kind: "test.payment.refunded", severity: "info", title: "환불 완료 · 개인 통합 리포트 9,900원 (시험 — 실제 주문 아님)", orderNumber: "MEU-TEST-0000000002", dedupeKey: "" },
  { kind: "test.reconcile.anomaly", severity: "error", title: "결제 기록 불일치 — 확인 필요 (시험 — 실제 주문 아님)", orderNumber: "MEU-TEST-0000000003", dedupeKey: "", lines: ["환불은 토스페이먼츠 관리자에서 직접 실행합니다 (미유는 환불을 실행하지 않습니다)"] },
  { kind: "test.report.failed", severity: "error", title: "리포트 생성 실패 (시험 — 실제 주문 아님)", orderNumber: "MEU-TEST-0000000004", dedupeKey: "" },
  { kind: "test.budget", severity: "warn", title: "AI 예산 한도 — 하루 예산에 가까워 새 구매를 멈췄습니다 (시험)", dedupeKey: "" },
];

/**
 * 텔레그램 연결 시험 — 알림 종류별 시험 메시지 5건을 텔레그램으로 직접 보내고, 텔레그램이 받았는지(실패 이유 포함)를 알려 준다.
 * 서버 로그로만 남는 경우와 구분하기 위해 텔레그램 결과를 따로 돌려준다. 받았는지 최종 확인은 내 텔레그램 화면에서 한다.
 */
export async function testTelegram(): Promise<NotificationTestResult> {
  const tg = telegramEnv();
  if (!tg) return { configured: false };
  const telegram = createTelegramNotifier(tg);
  let sent = 0;
  for (const a of SAMPLE_ALERTS) {
    const result = await telegram.check(alertText({ ...a, dedupeKey: "test" }, { test: true }));
    if (!result.ok) return { configured: true, sent, failed: { reason: result.reason, help: TELEGRAM_REASON_HELP[result.reason] } };
    sent += 1;
  }
  try {
    await writeRepository().addOpsEvent({ kind: "admin.test_alert", severity: "info", message: `텔레그램 시험 메시지 ${sent}건 전달됨`, detail: {} });
  } catch {
    // 시험 기록이 저장되지 않아도 결과는 그대로 보여 준다
  }
  return { configured: true, sent, failed: null };
}
