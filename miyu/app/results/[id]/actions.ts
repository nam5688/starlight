"use server";

import { notFound, redirect } from "next/navigation";
import type { PriceOptionKind } from "@/lib/commerce/benefits";
import { planCheckout, quoteForCheckout } from "@/lib/services/benefit-service";
import { startCheckout, type CheckoutPlan, type StartCheckoutResult } from "@/lib/services/order-service";
import { REPORT_SLA_MS, type ReportStatus } from "@/lib/commerce/report";
import { canRetryReport, getResultView } from "@/lib/services/report-service";
import { paymentConfig, paymentEnvOf } from "@/server/env";
import { readAcquisition } from "@/server/acquisition";
import { saleGateCheck } from "@/server/capacity";
import { peekInviteToken } from "@/server/invite";
import { claimAndSchedule, queueAndScheduleReport } from "@/server/report-jobs";
import { benefitRepository, now, readRepository, writeRepository } from "@/server/services";
import { getMember } from "@/server/member";

/** 결제 시작 결과를 화면 이동으로 바꾼다 — 예전 결제 시작과 혜택 계획 결제 시작이 같은 규칙을 쓴다 */
async function goAfterStart(assessmentId: string, result: StartCheckoutResult, back: string): Promise<never> {
  if (result.kind === "not-found") notFound();
  // 이미 결제했거나, 지금은 새 구매를 받지 않는 경우: 결과 화면이 상태에 맞는 안내를 보여 준다 (결제는 시작하지 않았다)
  if (result.kind === "already-paid" || result.kind === "sales-closed") redirect(`/results/${assessmentId}`);
  // 삭제한 기록 — 결제를 시작하지 않았고, 결과 화면이 삭제한 기록이라고 안내한다
  if (result.kind === "record-deleted") redirect(`/results/${assessmentId}`);
  // 가장 최근에 받은 리포트가 아직 완성되지 않았다면 새로 결제하지 않고 그 리포트의 상태(만드는 중 · 실패 · 다시 만들기)를 보여 준다
  if (result.kind === "report-not-ready") redirect(`/results/${assessmentId}?r=${encodeURIComponent(result.order.orderNumber)}`);
  // 요청한 할인 · 혜택을 확정하지 못했다 — 결제는 시작하지 않았고 이유를 화면에 보여 준다(서버 오류는 "할인 불가"와 따로 안내한다)
  if (result.kind === "discount-denied") redirect(`${back}${back.includes("?") ? "&" : "?"}benefit=${result.reason === "error" ? "error" : "denied"}&reason=${encodeURIComponent(result.reason.slice(0, 40))}#r-purchase`);
  // 0원 혜택 주문(쿠폰 · 포인트 교환) — 결제 없이 구매 권한이 생겼으므로 바로 리포트 생성을 예약한다
  if (result.kind === "granted") {
    await queueAndScheduleReport(result.order);
    redirect(`/results/${assessmentId}?r=${encodeURIComponent(result.order.orderNumber)}`);
  }
  redirect(`/checkout/${result.order.orderNumber}`);
}

async function checkout(assessmentId: string, again: boolean) {
  const member = await getMember();
  if (!member || member.needsConsent) redirect(`/results/${assessmentId}`);
  const userId = member.userId;
  const config = paymentConfig();
  if (!config.ok) redirect(`/results/${assessmentId}`);

  const result = await startCheckout({ repo: writeRepository(), now, gate: saleGateCheck }, { userId, assessmentId, paymentEnv: paymentEnvOf(config), acquisition: await readAcquisition(), again, inviteToken: again ? null : await peekInviteToken() });
  return goAfterStart(assessmentId, result, `/results/${assessmentId}`);
}

const PRICE_KINDS: readonly PriceOptionKind[] = ["list", "referral", "coupon", "referral+coupon", "points"];

/**
 * 가격 선택 결제(혜택 시스템): 고객이 고른 것은 "어떤 선택지인지"(kind)와 쿠폰 코드뿐이고, 금액 · 적격 여부는 서버가 매번 다시 만든 견적에서만 정한다.
 * - 요청한 할인이 맞지 않으면 사유와 정가를 보여 주고, 고객이 정가 확인(confirmListPrice)을 눌러야 정가 결제로 간다.
 * - 확인 중 서버 오류는 "할인 불가"가 아니라 오류로 안내하고 정가 주문을 자동으로 만들지 않는다.
 * - 0원이 되는 쿠폰 · 포인트 교환은 결제사를 거치지 않는 혜택 주문으로 처리하고(서버가 승인한 경우만), 그 밖의 주문은 예전과 같이 토스 결제로 간다.
 * - 혜택이 모두 꺼져 있거나 정가만 고른 평범한 경우에는 예전 결제 시작과 같게 동작한다(예전 초대 링크 할인 포함).
 */
export async function startBenefitCheckoutAction(formData: FormData) {
  const assessmentId = String(formData.get("assessmentId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(assessmentId)) notFound();
  const kindRaw = String(formData.get("kind") ?? "list") as PriceOptionKind;
  const kind: PriceOptionKind = PRICE_KINDS.includes(kindRaw) ? kindRaw : "list";
  const couponCode = String(formData.get("couponCode") ?? "").trim().toUpperCase().slice(0, 32);
  const confirmListPrice = formData.get("confirmListPrice") === "1";
  const again = formData.get("again") === "1";
  const query = new URLSearchParams();
  if (couponCode) query.set("coupon", couponCode);
  if (again) query.set("again", "1");
  // 구매 영역은 결과 화면 맨 아래라서 되돌아올 때 알림이 화면 밖에 있지 않게 구매 영역으로 바로 간다
  const back = `/results/${assessmentId}${query.size > 0 ? `?${query}` : ""}`;
  const backTo = (extra: string) => `${back}${back.includes("?") ? "&" : "?"}${extra}#r-purchase`;

  const member = await getMember();
  if (!member || member.needsConsent) redirect(`/results/${assessmentId}`);
  const userId = member.userId;
  const config = paymentConfig();
  const paymentEnv = config.ok ? paymentEnvOf(config) : ("test" as const);

  const deps = { repo: writeRepository(), benefits: benefitRepository(), now };
  const input = { userId, assessmentId, couponCode: couponCode || null, again };
  const quote = await quoteForCheckout(deps, input);
  if (quote.kind === "not-found") notFound();
  if (quote.kind === "error") redirect(backTo("benefit=error"));

  // 견적에 정가뿐인 평범한 경우(요청한 할인 없음 · 쓸 수 있는 할인 없음)는 예전 경로 그대로 — 예전 초대 링크 할인도 이 경로에서 적용된다.
  // 쓸 수 있는 혜택이 있는 화면에서 고객이 "정가"를 고른 경우는 예전 초대 가격이 몰래 섞이지 않도록 아래 가격 계획 경로로 간다
  if (kind === "list" && quote.quote.denied.length === 0 && quote.quote.options.length === 1) {
    if (!config.ok) redirect(`/results/${assessmentId}`);
    const result = await startCheckout({ repo: writeRepository(), now, gate: saleGateCheck }, { userId, assessmentId, paymentEnv, acquisition: await readAcquisition(), again, inviteToken: again ? null : await peekInviteToken() });
    return goAfterStart(assessmentId, result, back);
  }

  const planned = await planCheckout(deps, { ...input, choice: { kind, couponCode: couponCode || null, confirmListPrice } });
  if (planned.kind === "not-found") notFound();
  if (planned.kind === "error") redirect(backTo("benefit=error"));
  // 사유 · 정가 확인이 필요하거나 고를 선택지가 둘 이상이거나 견적에 없는 선택 — 화면이 같은 견적으로 다시 보여 준다(결제는 시작하지 않았다)
  if (planned.kind !== "plan") redirect(backTo(`benefit=${planned.kind === "needs-choice" ? "choose" : planned.kind === "needs-confirmation" ? "confirm" : "invalid"}`));
  const plan: CheckoutPlan = planned.plan;
  if (plan.mode === "pay" && !config.ok) redirect(`/results/${assessmentId}`);

  const result = await startCheckout({ repo: writeRepository(), now, gate: saleGateCheck }, { userId, assessmentId, paymentEnv, acquisition: await readAcquisition(), again, plan });
  return goAfterStart(assessmentId, result, back);
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
