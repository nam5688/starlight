import "server-only";
import { REPORT_DELAY_ALERT_MS, REPORT_GENERATING_STALE_MS } from "@/lib/commerce/report";
import { alert } from "./ops";
import { runReportInline } from "./report-jobs";
import { now, writeRepository } from "./services";

/** 생성에 실패했거나 오래 걸리는 리포트를 찾아 운영자에게 알린다 (같은 문제는 6시간에 한 번). 개수를 돌려준다 */
export async function sweepReports(): Promise<{ failed: number; delayed: number }> {
  const repo = writeRepository();
  const before = new Date(now().getTime() - REPORT_DELAY_ALERT_MS).toISOString();
  const [failed, delayed] = await Promise.all([
    repo.listProblemReports({ statuses: ["failed"], limit: 50 }),
    repo.listProblemReports({ statuses: ["queued", "generating"], updatedBefore: before, limit: 50 }),
  ]);
  for (const [list, label, key] of [
    [failed, "리포트 생성 실패", "failed"],
    [delayed, "리포트 생성 지연", "delayed"],
  ] as const) {
    for (const r of list) {
      const order = await repo.getOrderById(r.orderId);
      if (!order || order.status !== "paid") continue; // 환불된 주문 등은 알리지 않는다
      await alert({
        kind: `report.${key}`,
        severity: key === "failed" ? "error" : "warn",
        title: `${label} (시도 ${r.attempts}회)`,
        orderNumber: order.orderNumber,
        dedupeKey: `report-${key}:${order.orderNumber}`,
        lines: r.lastError ? [`마지막 오류: ${r.lastError.slice(0, 120)}`] : [],
      });
    }
  }
  return { failed: failed.length, delayed: delayed.length };
}

/** 한 번의 정기 점검에서 이어서 만들 리포트 수 상한 (생성이 오래 걸려도 점검이 끝나도록) */
const DRAIN_LIMIT = 3;

/**
 * 고객이 결과 화면을 열지 않아도 대기 중이거나 멈춘 리포트를 이어서 만든다 (결제 직후 백그라운드 작업이 끊긴 경우 등).
 * 결제가 확인된 주문만, 시도 횟수 상한 안에서만 (claimReport 규칙). 실패한 리포트는 여기서 다시 만들지 않는다 — 운영자 확인 대상.
 */
export async function drainQueuedReports(): Promise<{ attempted: number }> {
  const repo = writeRepository();
  const t = now().getTime();
  const [queued, stuck] = await Promise.all([
    repo.listProblemReports({ statuses: ["queued"], updatedBefore: new Date(t - 60_000).toISOString(), limit: DRAIN_LIMIT }),
    repo.listProblemReports({ statuses: ["generating"], updatedBefore: new Date(t - REPORT_GENERATING_STALE_MS).toISOString(), limit: DRAIN_LIMIT }),
  ]);
  let attempted = 0;
  for (const r of [...queued, ...stuck].slice(0, DRAIN_LIMIT)) {
    const order = await repo.getOrderById(r.orderId);
    if (!order || order.status !== "paid") continue;
    attempted++;
    await runReportInline(order);
  }
  return { attempted };
}
