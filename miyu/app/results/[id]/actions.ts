"use server";

import { notFound, redirect } from "next/navigation";
import { startCheckout } from "@/lib/services/order-service";
import { ensureReport, getResultView } from "@/lib/services/report-service";
import { paymentConfig, paymentEnvOf } from "@/server/env";
import { now, reportGenerator, writeRepository } from "@/server/services";
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

/** 리포트 다시 만들기: 결제가 확인된 주문만, 완성되지 않은 경우에만 */
export async function retryReportAction(assessmentId: string) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect(`/results/${assessmentId}`);
  const userId = member.userId;
  const repo = writeRepository();
  const view = await getResultView(repo, { userId, assessmentId });
  if (!view) notFound();
  if (view.paidOrder && view.report?.status !== "ready") {
    await ensureReport({ repo, generator: reportGenerator, now }, view.paidOrder);
  }
  redirect(`/results/${assessmentId}`);
}
