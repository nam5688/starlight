"use server";

import { redirect } from "next/navigation";
import { adminResetReport } from "@/lib/services/admin-service";
import { isValidOrderNumber } from "@/lib/commerce/order";
import { getAdminMember } from "@/server/member";
import { recordOps, testTelegram } from "@/server/ops";
import { reconcileAllNow, reconcileOneNow } from "@/server/reconcile";
import { claimAndSchedule } from "@/server/report-jobs";
import { sweepReports } from "@/server/report-sweep";
import { writeRepository } from "@/server/services";
import { paymentConfig } from "@/server/env";

// 관리자 동작은 모두 서버에서 관리자 여부를 다시 확인하고, 운영 기록(ops_events)에 남긴다.
// 환불 실행 기능은 없다 — 환불은 토스페이먼츠 관리자에서 직접 한다.

const back = (q: string, note: string) => redirect(`/admin?q=${encodeURIComponent(q)}&note=${encodeURIComponent(note)}`);

async function adminOrder(formData: FormData) {
  const admin = await getAdminMember();
  if (!admin) redirect("/");
  const orderNumber = String(formData.get("orderNumber") ?? "");
  if (!isValidOrderNumber(orderNumber)) redirect("/admin");
  const order = await writeRepository().getOrderByNumber(orderNumber);
  if (!order) back(orderNumber, "주문을 찾을 수 없습니다.");
  return { admin, order: order! };
}

/** 결제사 기록과 주문 하나를 바로 맞춘다 */
export async function adminReconcileOrderAction(formData: FormData) {
  const { order } = await adminOrder(formData);
  if (!paymentConfig().ok) back(order.orderNumber, "결제 설정이 없어 결제사에 조회할 수 없습니다.");
  const outcome = await reconcileOneNow(order);
  await recordOps({ kind: "admin.reconcile", orderNumber: order.orderNumber, message: `운영자가 결제사와 대조: ${outcome.kind}` });
  back(order.orderNumber, `결제사 대조 결과: ${outcome.kind}`);
}

/** 결제가 확인된 주문의 리포트를 다시 만든다 (고객 재시도 상한과 별개) */
export async function adminRetryReportAction(formData: FormData) {
  const { order } = await adminOrder(formData);
  const result = await adminResetReport(writeRepository(), order);
  if (result === "reset") await claimAndSchedule(order, { retryFailed: true, ignoreCooldown: true });
  await recordOps({ kind: "admin.retry_report", orderNumber: order.orderNumber, message: `운영자가 리포트 재생성 요청: ${result}` });
  back(order.orderNumber, result === "reset" ? "리포트 생성을 다시 시작했습니다." : result === "ready" ? "이미 완성된 리포트입니다 (바꾸지 않았습니다)." : "결제가 확인되지 않은 주문입니다.");
}

/** 모든 대기 · 최근 결제 주문을 지금 대조하고, 지연 · 실패 리포트를 점검한다 */
export async function adminRunAllAction() {
  const admin = await getAdminMember();
  if (!admin) redirect("/");
  const summary = await reconcileAllNow();
  const reports = await sweepReports();
  await recordOps({ kind: "admin.run_all", message: `운영자가 전체 점검 실행: 주문 ${summary.checked}건, 실패 리포트 ${reports.failed}건, 지연 ${reports.delayed}건` });
  redirect(`/admin?note=${encodeURIComponent(`점검 완료: 주문 ${summary.checked}건 확인 (반영 ${summary.counts.paid + summary.counts.refunded + summary.counts.closed}, 확인 필요 ${summary.counts.anomaly}, 조회 실패 ${summary.counts.error})`)}`);
}

/**
 * 알림이 실제로 가는지 시험한다 (고객 정보 없음). 종류별 시험 메시지 5건을 텔레그램으로 직접 보내고,
 * 텔레그램이 받았는지를 서버 로그와 구분해서 알려 준다 — 텔레그램 키가 없으면 "연결 안 됨"이라고 분명히 말한다.
 */
export async function adminTestAlertAction() {
  const admin = await getAdminMember();
  if (!admin) redirect("/");
  const result = await testTelegram();
  const note = !result.configured
    ? "텔레그램이 연결되어 있지 않습니다 (TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID 없음). 지금은 알림이 서버 로그에만 남습니다."
    : result.failed
      ? `텔레그램 전송 실패 (${result.sent}건 보낸 뒤): ${result.failed.help}`
      : `텔레그램이 시험 메시지 ${result.sent}건을 받았습니다. 내 텔레그램에 [미유·테스트]로 시작하는 메시지가 도착했는지 확인하세요.`;
  redirect(`/admin?note=${encodeURIComponent(note)}`);
}
