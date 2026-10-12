import "server-only";
import { after } from "next/server";
import { newErrorId } from "@/lib/ops/redact";
import type { OrderRecord } from "@/lib/services/ports";
import { reconcileBatch, reconcileOrder, type ReconcileOptions, type ReconcileOutcome, type ReconcileSummary } from "@/lib/services/reconcile-service";
import { paymentConfig } from "./env";
import { alert, logError, recordOps } from "./ops";
import { queueAndScheduleReport, runReportInline } from "./report-jobs";
import { now, paymentGateway, writeRepository } from "./services";

// 결제사 기록과 우리 주문을 대조해 맞춘다 (lib/services/reconcile-service.ts).
// 실행 방법: ① 정기 실행 주소(/api/cron/reconcile) ② 관리자 화면 버튼 ③ 고객이 MY · 결과 · 주문 화면을 열 때 본인 대기 주문만

/**
 * 리포트 준비 방식
 * - schedule: 요청(서버 함수 · 화면)에서 부른 경우 — 응답 뒤 백그라운드로 예약한다
 * - inline: 이미 응답 뒤 백그라운드이거나 정기 점검인 경우 — 예약하지 않고 그 자리에서 생성까지 끝낸다
 */
export type ReportMode = "schedule" | "inline";

function deps(mode: ReportMode = "schedule") {
  return {
    repo: writeRepository(),
    gateway: paymentGateway(),
    now,
    // 결제가 확인되면 리포트를 준비한다 (대기열 등록 + 생성)
    onPaid: async (order: OrderRecord) => {
      if (mode === "inline") await runReportInline(order);
      else await queueAndScheduleReport(order);
    },
  };
}

/** 결과를 운영 기록으로 남기고, 사람이 봐야 하는 것만 알린다 */
async function report(outcome: ReconcileOutcome): Promise<void> {
  const o = outcome.order;
  switch (outcome.kind) {
    case "paid":
      await recordOps({ kind: "reconcile.paid", severity: "warn", orderNumber: o.orderNumber, message: "결제사 승인 기록을 확인해 주문을 결제 완료로 맞췄습니다 (리포트 준비 시작)" });
      return;
    case "refunded":
      await recordOps({ kind: "reconcile.refunded", severity: "warn", orderNumber: o.orderNumber, message: "결제사에서 취소된 결제를 확인해 주문을 환불됨으로 맞췄습니다 (열람 권한 회수)" });
      return;
    case "closed":
      await recordOps({ kind: "reconcile.closed", severity: "info", orderNumber: o.orderNumber, message: `결제가 끝나지 않은 주문을 정리했습니다 (${outcome.reason})` });
      return;
    case "anomaly": {
      const errorId = newErrorId();
      await alert({
        kind: "reconcile.anomaly",
        severity: outcome.code === "DUPLICATE_PAYMENT" || outcome.code === "PAID_BUT_NOT_AT_GATEWAY" ? "error" : "warn",
        title: `결제 확인이 필요합니다 (${outcome.code})`,
        orderNumber: o.orderNumber,
        errorId,
        dedupeKey: `anomaly:${o.orderNumber}:${outcome.code}`,
        lines: [outcome.message, "환불은 토스페이먼츠 관리자에서 직접 실행합니다 (미유는 환불을 실행하지 않습니다)"],
      });
      return;
    }
    case "error": {
      // 결제사 조회 실패가 오래 이어질 때만 알린다 (일시 장애는 다음 확인에서 풀린다)
      const ageMin = (now().getTime() - new Date(o.createdAt).getTime()) / 60_000;
      if (ageMin >= 30) {
        await alert({ kind: "reconcile.error", severity: "warn", title: `결제사 조회가 계속 실패합니다 (${outcome.code})`, orderNumber: o.orderNumber, dedupeKey: `reconcile-error:${o.orderNumber}`, lines: [`주문 후 ${Math.round(ageMin)}분 경과`] });
      }
      return;
    }
    default:
      return;
  }
}

/** 모든 대기 주문 · 최근 결제 완료 주문을 대조한다 (정기 실행 · 관리자 버튼) */
export async function reconcileAllNow(options: ReconcileOptions = {}, mode: ReportMode = "schedule"): Promise<ReconcileSummary> {
  if (!paymentConfig().ok) return { checked: 0, outcomes: [], counts: { paid: 0, refunded: 0, closed: 0, waiting: 0, ok: 0, anomaly: 0, error: 0 } };
  const summary = await reconcileBatch(deps(mode), options);
  for (const outcome of summary.outcomes) await report(outcome);
  return summary;
}

/** 주문 하나를 지금 대조한다 (관리자 · 본인 주문 화면의 확인 버튼). minAge 0으로 바로 확인 */
export async function reconcileOneNow(order: OrderRecord): Promise<ReconcileOutcome> {
  const outcome = await reconcileOrder(deps(), order, { pendingMinAgeMs: 0 });
  await report(outcome);
  return outcome;
}

/**
 * 고객이 화면을 열 때, 본인의 오래된 대기 주문만 응답 뒤 백그라운드에서 대조한다.
 * 결제가 승인됐는데 돌아오지 못한 고객이 MY를 열면 자동으로 맞춰진다. 실패해도 화면에는 영향이 없다.
 * userId는 로그인 확인을 마친 회원 번호만 넘긴다 (after 안에서는 로그인 쿠키를 읽을 수 없어 서버 저장소로 본인 주문만 조회한다).
 */
// 같은 회원이 화면을 계속 열어도 1분에 한 번만 대조한다 (DB · 결제사 조회 부담을 줄인다)
const lastUserRun = new Map<string, number>();
// (자동 검증에서는 RECONCILE_USER_INTERVAL_SECONDS=0으로 끈다)
const USER_INTERVAL_MS = (() => {
  const raw = Number(process.env.RECONCILE_USER_INTERVAL_SECONDS ?? "60");
  return (Number.isFinite(raw) && raw >= 0 ? raw : 60) * 1000;
})();

export function reconcileUserInBackground(userId: string): void {
  if (!paymentConfig().ok) return;
  const t = now().getTime();
  if (t - (lastUserRun.get(userId) ?? 0) < USER_INTERVAL_MS) return;
  lastUserRun.set(userId, t);
  if (lastUserRun.size > 5000) lastUserRun.clear();
  after(async () => {
    try {
      const orders = await writeRepository().listOrdersForUser(userId);
      for (const order of orders.filter((o) => o.userId === userId && o.status === "pending").slice(0, 3)) {
        try {
          await report(await reconcileOrder(deps("inline"), order));
        } catch (e) {
          logError("reconcile.user", e);
        }
      }
    } catch (e) {
      logError("reconcile.user", e);
    }
  });
}
