import "server-only";
import { combineNotifiers, createLogNotifier, createTelegramNotifier } from "@/lib/integrations/telegram/notifier";
import { raiseAlert, type Alert, type Notifier, type RaiseResult } from "@/lib/ops/alerts";
import { redactSecrets, safeErrorMessage } from "@/lib/ops/redact";
import type { OpsEventInput } from "@/lib/services/ports";
import { telegramEnv } from "./env";
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

/** 기록을 남기고, 새로운 문제일 때만 알린다 */
export async function alert(a: Alert): Promise<RaiseResult> {
  try {
    return await raiseAlert({ repo: writeRepository(), notifier: notifier(), now }, a);
  } catch (e) {
    console.error("[ops] 알림 실패", safeErrorMessage(e));
    return "failed";
  }
}

/** 서버 로그용 — 비밀키 · 토큰 · 연락처는 가리고 메시지만 남긴다 */
export function logError(where: string, error: unknown): void {
  console.error(`[${where}]`, safeErrorMessage(error));
}
