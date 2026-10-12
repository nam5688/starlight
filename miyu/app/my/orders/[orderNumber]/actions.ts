"use server";

import { paymentConfig } from "@/server/env";
import { getMember } from "@/server/member";
import { reconcileOneNow } from "@/server/reconcile";
import { readRepository } from "@/server/services";

export type RecheckResult =
  /** 맞춘 결과 — kind에 따라 안내 문구가 다르다. 주문 화면은 새로고침해 최신 상태를 보여준다 */
  | { ok: true; kind: "paid" | "refunded" | "closed" | "waiting" | "ok" | "anomaly" | "error"; message: string }
  | { ok: false; message: string };

// 같은 주문을 연타해도 결제사 조회가 한꺼번에 몰리지 않게 한다 (서버 한 대 기준 · 보조 장치)
const COOLDOWN_MS = 8_000;
const lastCheck = new Map<string, number>();

const MESSAGE: Record<string, string> = {
  paid: "결제사에서 승인된 기록을 확인해 주문에 반영했습니다. 리포트를 준비하고 있습니다. 다시 결제하지 않아도 됩니다.",
  refunded: "결제사에서 취소(환불)된 결제로 확인되어 주문을 환불 상태로 맞췄습니다.",
  closed: "결제사에 승인된 결제가 없어 이 주문을 미완료로 정리했습니다. 청구된 금액은 없습니다.",
  waiting: "결제사에서 아직 결과가 나오지 않았습니다. 잠시 뒤 다시 확인하세요. 승인되었다면 자동으로 반영되니 다시 결제하지 마세요.",
  ok: "결제사 기록과 이 주문이 일치합니다.",
  anomaly: "결제사 기록과 주문 사이에 확인이 필요한 차이가 있어 운영자에게 전달했습니다. 다시 결제하지 마세요.",
  error: "결제사 조회가 일시적으로 되지 않습니다. 결제 결과는 아직 알 수 없으며, 승인되었다면 확인되는 대로 반영됩니다. 다시 결제하지 마세요.",
};

/**
 * 결제사에 이 주문의 결제를 다시 조회하고, 결제사 기록에 맞게 주문을 바로잡는다.
 * 결제사의 실제 기록만 믿는다 (화면 이동 · 알림 · 고객 요청으로 결제 성공을 단정하지 않는다).
 */
export async function recheckPaymentAction(orderNumber: string): Promise<RecheckResult> {
  const member = await getMember();
  if (!member || member.needsConsent) return { ok: false, message: "로그인이 필요합니다." };
  // 소유자 확인은 로그인 사용자 권한(RLS)으로
  const order = await (await readRepository()).getOrderByNumber(orderNumber);
  if (!order || order.userId !== member.userId) return { ok: false, message: "주문을 찾을 수 없습니다." };
  if (!paymentConfig().ok) return { ok: false, message: "결제 설정이 없어 결제사에 조회할 수 없습니다." };

  const now = Date.now();
  const prev = lastCheck.get(order.orderNumber) ?? 0;
  if (now - prev < COOLDOWN_MS) return { ok: false, message: "방금 확인했습니다. 몇 초 뒤에 다시 눌러 주세요." };
  lastCheck.set(order.orderNumber, now);
  if (lastCheck.size > 500) lastCheck.clear();

  try {
    const outcome = await reconcileOneNow(order);
    return { ok: true, kind: outcome.kind, message: MESSAGE[outcome.kind] ?? MESSAGE.error };
  } catch {
    return { ok: true, kind: "error", message: MESSAGE.error };
  }
}
