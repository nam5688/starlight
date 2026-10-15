// 관리자 화면 자료 — 처리가 필요한 주문 · 리포트 · 운영 기록을 주문번호 / 오류 식별번호로 추적한다.
// 고객 이름 · 생년월일 · 답변 · 고민 · 리포트 본문은 다루지 않는다 (주문 · 결제 · 생성 상태와 운영 기록만).

import { REPORT_DELAY_ALERT_MS, REPORT_MAX_ATTEMPTS, REPORT_SLA_MS } from "../commerce/report.ts";
import { isValidOrderNumber } from "../commerce/order.ts";
import { ERROR_ID_PATTERN } from "../ops/redact.ts";
import { questionLedgerState, type QuestionLedgerState } from "./admin-support-service.ts";
import { EVENT_STATUS_LABEL, generationOf, orderStatusLabel, productName, SOURCE_LABEL, type Generation } from "./my-service.ts";
import type { MiyuRepository, OpsEventRecord, OrderRecord, PaymentEventRecord, ProblemReport } from "./ports.ts";
import { RECONCILE_DEFAULTS } from "./reconcile-service.ts";

export type AdminOrderRow = {
  orderNumber: string;
  productName: string;
  amount: number;
  status: OrderRecord["status"];
  statusLabel: string;
  paymentEnv: OrderRecord["paymentEnv"];
  createdAt: string;
  approvedAt: string | null;
  failureCode: string | null;
};

const orderRow = (o: OrderRecord, now: Date): AdminOrderRow => ({
  orderNumber: o.orderNumber,
  productName: productName(o.productId),
  amount: o.amount,
  status: o.status,
  statusLabel: orderStatusLabel(o, now),
  paymentEnv: o.paymentEnv,
  createdAt: o.createdAt,
  approvedAt: o.approvedAt,
  failureCode: o.failureCode,
});

export type AdminReportRow = {
  orderNumber: string;
  status: ProblemReport["status"];
  generation: Generation;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  updatedAt: string;
  /** 대기 · 생성이 오래 걸리는 중 (운영자 알림 기준을 넘음) */
  delayed: boolean;
  /** 고객 화면에 지연 안내가 나가는 기준(30분)을 넘음 */
  pastSla: boolean;
};

export type AdminOverview = {
  /** 결제창을 열고 아직 결과가 없는 주문 (2분 이상) */
  pendingOrders: AdminOrderRow[];
  /** 생성 실패 · 오래 걸리는 리포트 (결제가 확인된 주문만) */
  reports: AdminReportRow[];
  /** 최근 주의 · 오류 기록 */
  events: OpsEventRecord[];
  counts: { pendingOrders: number; failedReports: number; delayedReports: number; errors24h: number };
};

async function reportRow(repo: MiyuRepository, r: ProblemReport, now: Date): Promise<AdminReportRow | null> {
  const order = await repo.getOrderById(r.orderId);
  if (!order || order.status !== "paid") return null; // 환불 · 미결제 주문의 리포트는 처리 대상이 아니다
  const age = now.getTime() - new Date(r.updatedAt).getTime();
  const inProgress = r.status === "queued" || r.status === "generating";
  return {
    orderNumber: order.orderNumber,
    status: r.status,
    generation: generationOf(r),
    attempts: r.attempts,
    maxAttempts: REPORT_MAX_ATTEMPTS,
    lastError: r.lastError,
    updatedAt: r.updatedAt,
    delayed: inProgress && age >= REPORT_DELAY_ALERT_MS,
    pastSla: inProgress && age >= REPORT_SLA_MS,
  };
}

export async function getAdminOverview(repo: MiyuRepository, now: Date): Promise<AdminOverview> {
  const since24h = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const [reconcileList, failed, stale, events, errors] = await Promise.all([
    repo.listOrdersForReconcile({ pendingCreatedBefore: new Date(now.getTime() - RECONCILE_DEFAULTS.pendingMinAgeMs).toISOString(), paidSince: now.toISOString(), limit: 50 }),
    repo.listProblemReports({ statuses: ["failed"], limit: 50 }),
    repo.listProblemReports({ statuses: ["queued", "generating"], updatedBefore: new Date(now.getTime() - REPORT_DELAY_ALERT_MS).toISOString(), limit: 50 }),
    repo.listOpsEvents({ limit: 30, since: new Date(now.getTime() - 7 * 24 * 3600_000).toISOString() }),
    repo.listOpsEvents({ limit: 200, since: since24h }),
  ]);
  const reports = (await Promise.all([...failed, ...stale].map((r) => reportRow(repo, r, now)))).filter((r): r is AdminReportRow => r !== null);
  const pending = reconcileList.filter((o) => o.status === "pending");
  return {
    pendingOrders: pending.map((o) => orderRow(o, now)),
    reports,
    events: events.filter((e) => e.severity !== "info"),
    counts: {
      pendingOrders: pending.length,
      failedReports: reports.filter((r) => r.status === "failed").length,
      delayedReports: reports.filter((r) => r.delayed).length,
      errors24h: errors.filter((e) => e.severity === "error").length,
    },
  };
}

export type AdminLookup =
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | { kind: "not-found"; query: string }
  /** 오류 식별번호로 찾음 — 같은 번호의 기록 (연결된 주문이 있으면 함께) */
  | { kind: "error-id"; query: string; events: OpsEventRecord[]; order: OrderTraceForAdmin | null }
  | { kind: "order"; order: OrderTraceForAdmin };

export type OrderTraceForAdmin = {
  order: AdminOrderRow;
  paymentEvents: { at: string; source: string; status: string | null; statusLabel: string | null; method?: string; mId?: string }[];
  report: AdminReportRow | null;
  /** 이 주문의 운영 기록 */
  events: OpsEventRecord[];
  /** 결제 완료인데 리포트가 없거나 실패 → 처리 필요 */
  needsReportAction: boolean;
  /** 질문 결제 주문이면 장부 반영 상태 (질문 · 대화 내용은 없다), 아니면 null */
  question: QuestionLedgerState | null;
};

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

async function traceForAdmin(repo: MiyuRepository, order: OrderRecord, now: Date): Promise<OrderTraceForAdmin> {
  const [events, report, opsEvents, question] = await Promise.all([
    repo.listPaymentEvents(order.id),
    repo.getReportByOrder(order.id),
    repo.listOpsEvents({ orderNumber: order.orderNumber, limit: 30 }),
    questionLedgerState(repo, order),
  ]);
  const row = report ? await reportRow(repo, report, now) : null;
  return {
    order: orderRow(order, now),
    paymentEvents: events.map((e: PaymentEventRecord) => ({
      at: e.createdAt,
      source: SOURCE_LABEL[e.source] ?? e.source,
      status: e.status,
      statusLabel: e.status ? (EVENT_STATUS_LABEL[e.status] ?? null) : null,
      method: str(e.detail.method),
      mId: str(e.detail.mId),
    })),
    report: row,
    events: opsEvents,
    needsReportAction: order.status === "paid" && !question && (!report || report.status === "failed" || (report.status !== "ready" && (row?.delayed ?? false))),
    question,
  };
}

/** 주문번호 또는 오류 식별번호(ERR-XXXXXXXX)로 찾는다 */
export async function adminLookup(repo: MiyuRepository, queryText: string, now: Date): Promise<AdminLookup> {
  const q = queryText.trim();
  if (!q) return { kind: "empty" };
  if (/^err-/i.test(q)) {
    const id = q.toUpperCase();
    if (!ERROR_ID_PATTERN.test(id)) return { kind: "invalid", message: "오류번호는 ERR- 뒤에 영문 대문자와 숫자 8자리입니다." };
    const events = await repo.listOpsEvents({ errorId: id, limit: 20 });
    if (!events.length) return { kind: "not-found", query: id };
    const orderNumber = events.find((e) => e.orderNumber)?.orderNumber;
    const order = orderNumber ? await repo.getOrderByNumber(orderNumber) : null;
    return { kind: "error-id", query: id, events, order: order ? await traceForAdmin(repo, order, now) : null };
  }
  if (!isValidOrderNumber(q)) return { kind: "invalid", message: "주문번호 또는 오류번호(ERR-…)를 입력해 주세요." };
  const order = await repo.getOrderByNumber(q);
  if (!order) return { kind: "not-found", query: q };
  return { kind: "order", order: await traceForAdmin(repo, order, now) };
}

/**
 * 운영자의 "리포트 다시 만들기" 준비 — 결제가 확인된 주문의 완성되지 않은 리포트를 대기 상태로 되돌린다.
 * 고객 재시도 상한(REPORT_MAX_ATTEMPTS)과 별개로 운영자가 처리한다. 완성된 리포트는 바꾸지 않는다.
 * 돌려주는 값이 true면 이어서 생성을 예약한다.
 */
export async function adminResetReport(repo: MiyuRepository, order: OrderRecord): Promise<"reset" | "ready" | "not-paid"> {
  if (order.status !== "paid") return "not-paid";
  const report = await repo.getReportByOrder(order.id);
  if (!report) return "reset"; // 리포트 행이 없으면 생성 흐름이 만든다
  if (report.status === "ready") return "ready";
  await repo.updateReport(report.id, ["queued", "generating", "failed"], { status: "queued", attempts: 0, lastError: null });
  return "reset";
}
