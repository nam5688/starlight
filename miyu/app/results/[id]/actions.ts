"use server";

import { notFound, redirect } from "next/navigation";
import { startCheckout } from "@/lib/services/order-service";
import { REPORT_SLA_MS, type ReportStatus } from "@/lib/commerce/report";
import { canRetryReport, getResultView } from "@/lib/services/report-service";
import { paymentConfig, paymentEnvOf } from "@/server/env";
import { readAcquisition } from "@/server/acquisition";
import { saleGateCheck } from "@/server/capacity";
import { claimAndSchedule } from "@/server/report-jobs";
import { now, readRepository, writeRepository } from "@/server/services";
import { getMember } from "@/server/member";

async function checkout(assessmentId: string, again: boolean) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect(`/results/${assessmentId}`);
  const userId = member.userId;
  const config = paymentConfig();
  if (!config.ok) redirect(`/results/${assessmentId}`);

  const result = await startCheckout({ repo: writeRepository(), now, gate: saleGateCheck }, { userId, assessmentId, paymentEnv: paymentEnvOf(config), acquisition: await readAcquisition(), again });
  if (result.kind === "not-found") notFound();
  // 이미 결제했거나, 지금은 새 구매를 받지 않는 경우: 결과 화면이 상태에 맞는 안내를 보여 준다 (결제는 시작하지 않았다)
  if (result.kind === "already-paid" || result.kind === "sales-closed") redirect(`/results/${assessmentId}`);
  // 가장 최근에 받은 리포트가 아직 완성되지 않았다면 새로 결제하지 않고 그 리포트의 상태(만드는 중 · 실패 · 다시 만들기)를 보여 준다
  if (result.kind === "report-not-ready") redirect(`/results/${assessmentId}?r=${encodeURIComponent(result.order.orderNumber)}`);
  redirect(`/checkout/${result.order.orderNumber}`);
}

/** 결제하기: 서버가 가격으로 새 주문을 만들고 결제 화면으로 보낸다 */
export async function startCheckoutAction(assessmentId: string) {
  await checkout(assessmentId, false);
}

/**
 * 같은 결과로 새 리포트 받기: 이미 받은 리포트는 그대로 두고 새 주문(9,900원)을 만든다.
 * 새 결제가 승인되면 지금의 생성기로 새 리포트가 따로 만들어지고, 받은 리포트는 모두 MY에 남는다.
 */
export async function startRepurchaseAction(assessmentId: string) {
  await checkout(assessmentId, true);
}

async function retry(assessmentId: string, orderNumber: string | null) {
  const member = await getMember();
  const back = orderNumber ? `/results/${assessmentId}?r=${encodeURIComponent(orderNumber)}` : `/results/${assessmentId}`;
  if (!member || member.needsConsent) redirect(back);
  const view = await getResultView(writeRepository(), { userId: member.userId, assessmentId, orderNumber });
  if (!view) notFound();
  if (view.paidOrder && view.report?.status !== "ready") {
    await claimAndSchedule(view.paidOrder, { retryFailed: true });
  }
  redirect(back);
}

/** 리포트 다시 만들기: 결제가 확인된 주문만, 완성되지 않은 경우에만. 생성은 백그라운드에서 한다 */
export async function retryReportAction(assessmentId: string) {
  await retry(assessmentId, null);
}

/** 같은 결과로 받은 리포트 중 그 주문의 리포트를 다시 만들기 (다시 결제하지 않는다) */
export async function retryReceivedReportAction(assessmentId: string, orderNumber: string) {
  await retry(assessmentId, orderNumber);
}

export type ReportStatusResult = {
  status: ReportStatus | null;
  canRetry: boolean;
  /** 순서를 기다리는 이유 — capacity: 동시에 만드는 수가 한도에 참 */
  waiting: "capacity" | "cooldown" | null;
  /** 생성이 오래 걸리는 중 (REPORT_SLA_MS 초과) — 결제는 정상이며 기다리거나 환불을 문의할 수 있다고 안내 */
  delayed: boolean;
};

/**
 * 결과 화면의 생성 상태 확인 (몇 초마다). 대기 중이거나 멈춘 작업이 있으면 여기서 이어받는다
 * — 결제 직후의 백그라운드 작업이 서버 재시작 등으로 끊겨도 고객이 다시 결제할 필요가 없다.
 */
export async function reportStatusAction(assessmentId: string, orderNumber?: string): Promise<ReportStatusResult> {
  const none: ReportStatusResult = { status: null, canRetry: false, waiting: null, delayed: false };
  const member = await getMember();
  if (!member || member.needsConsent) return none;
  const view = await getResultView(await readRepository(), { userId: member.userId, assessmentId, orderNumber });
  if (!view?.paidOrder) return none;
  let report = view.report;
  let waiting: ReportStatusResult["waiting"] = null;
  if (!report || report.status === "queued" || report.status === "generating") {
    const claimed = await claimAndSchedule(view.paidOrder);
    report = claimed.report ?? report;
    waiting = claimed.waiting ?? null;
  }
  const inProgress = report?.status === "queued" || report?.status === "generating";
  const delayed = Boolean(inProgress && report && now().getTime() - new Date(report.createdAt).getTime() > REPORT_SLA_MS);
  return { status: report?.status ?? null, canRetry: canRetryReport(report), waiting, delayed };
}
