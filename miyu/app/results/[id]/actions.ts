"use server";

import { notFound, redirect } from "next/navigation";
import { startCheckout } from "@/lib/services/order-service";
import type { ReportStatus } from "@/lib/commerce/report";
import { canRetryReport, getResultView } from "@/lib/services/report-service";
import { paymentConfig, paymentEnvOf } from "@/server/env";
import { claimAndSchedule } from "@/server/report-jobs";
import { now, readRepository, writeRepository } from "@/server/services";
import { getMember } from "@/server/member";

/** 결제하기: 서버가 가격으로 새 주문을 만들고 결제 화면으로 보낸다 */
export async function startCheckoutAction(assessmentId: string) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect(`/results/${assessmentId}`);
  const userId = member.userId;
  const config = paymentConfig();
  if (!config.ok) redirect(`/results/${assessmentId}`);

  const result = await startCheckout({ repo: writeRepository(), now }, { userId, assessmentId, paymentEnv: paymentEnvOf(config) });
  if (result.kind === "not-found") notFound();
  if (result.kind === "already-paid") redirect(`/results/${assessmentId}`);
  redirect(`/checkout/${result.order.orderNumber}`);
}

/** 리포트 다시 만들기: 결제가 확인된 주문만, 완성되지 않은 경우에만. 생성은 백그라운드에서 한다 */
export async function retryReportAction(assessmentId: string) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect(`/results/${assessmentId}`);
  const view = await getResultView(writeRepository(), { userId: member.userId, assessmentId });
  if (!view) notFound();
  if (view.paidOrder && view.report?.status !== "ready") {
    await claimAndSchedule(view.paidOrder, { retryFailed: true });
  }
  redirect(`/results/${assessmentId}`);
}

export type ReportStatusResult = { status: ReportStatus | null; canRetry: boolean };

/**
 * 결과 화면의 생성 상태 확인 (몇 초마다). 대기 중이거나 멈춘 작업이 있으면 여기서 이어받는다
 * — 결제 직후의 백그라운드 작업이 서버 재시작 등으로 끊겨도 고객이 다시 결제할 필요가 없다.
 */
export async function reportStatusAction(assessmentId: string): Promise<ReportStatusResult> {
  const member = await getMember();
  if (!member || member.needsConsent) return { status: null, canRetry: false };
  const view = await getResultView(await readRepository(), { userId: member.userId, assessmentId });
  if (!view?.paidOrder) return { status: null, canRetry: false };
  let report = view.report;
  if (!report || report.status === "queued" || report.status === "generating") {
    report = (await claimAndSchedule(view.paidOrder)) ?? report;
  }
  return { status: report?.status ?? null, canRetry: canRetryReport(report) };
}
