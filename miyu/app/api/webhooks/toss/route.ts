import { syncPayment } from "@/lib/services/order-service";
import { paymentConfig } from "@/server/env";
import { newErrorId } from "@/lib/ops/redact";
import { alert, notifyOrderEvent, notifyPartialRefund } from "@/server/ops";
import { queueAndScheduleReport } from "@/server/report-jobs";
import { paymentGateway, writeRepository } from "@/server/services";

/**
 * 토스페이먼츠 웹훅 (개발자센터 > 웹훅에 이 주소를 등록: https://<도메인>/api/webhooks/toss, 이벤트는 `PAYMENT_STATUS_CHANGED`).
 * 알림 내용은 믿지 않고 결제사에 결제를 다시 조회해 주문을 맞춘다(조회한 Payment 객체의 status · totalAmount · balanceAmount · cancels[].cancelAmount를 쓴다).
 * 10초 안에 200으로 응답해야 하며, 일시적인 오류면 500을 돌려 재전송을 받는다.
 *
 * **받는 이벤트는 `PAYMENT_STATUS_CHANGED`뿐이다.** `CANCEL_STATUS_CHANGED`는 공식 문서상 중국 · 동남아 해외 간편결제(비동기 승인) 전용이고 국내 결제(카드 등)에는 오지 않으므로
 * 국내 카드 취소를 그 이벤트에 기대지 않는다 — 다른 이벤트는 받아도 무시한다(2026-10-16 공식 문서 확인).
 * 국내 카드의 **부분 취소에 어떤 웹훅이 오는지는 공식 문서에 없다.** 그래서 웹훅이 오지 않아도 맞는 구조다: 토스에서 취소한 뒤 운영자가 /admin의 "결제사와 대조해 맞추기"를 누르거나,
 * 정기 점검(최근 7일 결제)이 결제사를 다시 조회해 같은 결과로 맞춘다. 구매자가 결제창을 닫으면 웹훅이 오지 않는다는 점도 공식 문서에 있어 결제 승인 확인 · 정기 점검이 함께 막는다.
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
  if (body?.eventType !== "PAYMENT_STATUS_CHANGED" || typeof paymentKey !== "string") {
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
    if (result.kind === "updated" && result.to === "partial-refunded" && result.refund) await notifyPartialRefund(result.order, result.refund);
    if (result.kind === "attention") {
      // 부분 취소를 질문 묶음에 반영하지 못했다 — 같은 알림을 다시 받아도 결과가 같으므로 200으로 받고(재전송 불필요) 운영자에게 알린다
      await alert({
        kind: "reconcile.anomaly",
        severity: "error",
        title: `결제 기록 불일치 — 확인 필요 (${result.code})`,
        orderNumber: result.order.orderNumber,
        errorId: newErrorId(),
        dedupeKey: `anomaly:${result.order.orderNumber}:${result.code}`,
        lines: [result.message, "환불은 토스페이먼츠 관리자에서 직접 실행합니다 (미유는 환불을 실행하지 않습니다)"],
      });
    }
    return Response.json({ ok: true, result: result.kind });
  } catch {
    return new Response("retry", { status: 500 });
  }
}
