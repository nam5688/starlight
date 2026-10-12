import { syncPayment } from "@/lib/services/order-service";
import { paymentConfig } from "@/server/env";
import { notifyOrderEvent } from "@/server/ops";
import { queueAndScheduleReport } from "@/server/report-jobs";
import { paymentGateway, writeRepository } from "@/server/services";

/**
 * 토스페이먼츠 웹훅 (개발자센터 > 웹훅에 이 주소를 등록: https://<도메인>/api/webhooks/toss).
 * 알림 내용은 믿지 않고 결제사에 결제를 다시 조회해 주문을 맞춘다.
 * 10초 안에 200으로 응답해야 하며, 일시적인 오류면 500을 돌려 재전송을 받는다.
 */
export async function POST(request: Request) {
  if (!paymentConfig().ok) return new Response("not configured", { status: 503 });

  let body: { eventType?: unknown; data?: { paymentKey?: unknown } };
  try {
    body = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const paymentKey = body?.data?.paymentKey;
  if (
    (body?.eventType !== "PAYMENT_STATUS_CHANGED" && body?.eventType !== "CANCEL_STATUS_CHANGED") ||
    typeof paymentKey !== "string"
  ) {
    return Response.json({ ok: true, ignored: true });
  }

  const repo = writeRepository();
  try {
    const result = await syncPayment({ repo, gateway: paymentGateway() }, { paymentKey: paymentKey.slice(0, 200) });
    if (result.kind !== "ignored" && result.order.status === "paid") {
      // 승인 응답이 유실돼 웹훅으로 결제가 확인된 경우에도 리포트를 준비한다 (응답 뒤 백그라운드 — 10초 제한 안에 응답)
      await queueAndScheduleReport(result.order);
    }
    if (result.kind === "updated" && (result.to === "paid" || result.to === "refunded")) await notifyOrderEvent(result.to, result.order);
    return Response.json({ ok: true, result: result.kind });
  } catch {
    return new Response("retry", { status: 500 });
  }
}
