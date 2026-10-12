// MY 화면 자료 — 리포트별 이용 권한 · 생성 상태와 결제내역을 따로 보여준다.
// 결제 상태(orders)와 리포트 생성 상태(reports)는 섞지 않는다: 결제했지만 생성에 실패한 고객에게 다시 구매하라고 하지 않는다.

import type { OrderStatus } from "../commerce/order.ts";
import { PERSONAL_REPORT } from "../config/product.ts";
import type { DataSource } from "../report/types.ts";
import { formatAssessmentBirth } from "./assessment-service.ts";
import type { MiyuRepository, OrderRecord, PaymentEnv, PaymentEventRecord, ReportRecord } from "./ports.ts";
import { RECONCILE_DEFAULTS } from "./reconcile-service.ts";
import type { ContextTopic } from "../personalization/context.ts";

export type Entitlement = "free" | "purchased" | "refunded";
export type Generation = "none" | "in-progress" | "ready" | "failed";

export type MyReportCard = {
  assessmentId: string;
  productName: string;
  /** 분석 대상 (예: 지민 님 · 1995년 4월 12일 (양력) · 출생시간 모름) */
  subject: string;
  createdAt: string;
  /** 연간 · 오늘 운세처럼 기간이 있는 상품만 (개인 리포트는 null) */
  period: string | null;
  entitlement: Entitlement;
  generation: Generation;
  paidOrderNumber: string | null;
  source: DataSource;
  /** 나를 더 반영하기에 적은 주제 (적지 않았으면 null) */
  contextTopic: ContextTopic | null;
};

export type MyOrderRow = {
  orderNumber: string;
  productName: string;
  amount: number;
  status: OrderStatus;
  statusLabel: string;
  paymentEnv: PaymentEnv;
  /** 결제 승인 시각 (승인 전이면 null) */
  approvedAt: string | null;
  createdAt: string;
  assessmentId: string;
};

const PRODUCT_NAMES: Record<string, string> = { [PERSONAL_REPORT.id]: PERSONAL_REPORT.name };
export const productName = (id: string) => PRODUCT_NAMES[id] ?? id;

export const ENTITLEMENT_LABEL: Record<Entitlement, string> = {
  free: "무료 결과",
  purchased: "전체 리포트 구매 완료",
  refunded: "환불됨",
};

export const GENERATION_LABEL: Record<Generation, string> = {
  none: "",
  "in-progress": "생성 중",
  ready: "열람 가능",
  failed: "생성 실패",
};

export const PAYMENT_ENV_LABEL: Record<PaymentEnv, string> = {
  live: "",
  test: "테스트 결제",
  "test-docs": "테스트 결제 · 공용 예제 키",
};

/** 결제창을 연 뒤 이 시간 안에는 "결제 미완료"로 단정하지 않고 "확인 중"으로 보여준다 (reconcile 정리 시점과 같다) */
const PENDING_CHECKING_MS = RECONCILE_DEFAULTS.abandonedAfterMs;

export function orderStatusLabel(o: Pick<OrderRecord, "status" | "failureCode" | "createdAt">, now: Date = new Date()): string {
  switch (o.status) {
    case "paid":
      return "결제 완료";
    case "refunded":
      return "환불 완료";
    case "failed":
      return "결제 실패";
    case "canceled":
      if (o.failureCode === "SUPERSEDED") return "새 결제로 대체";
      return o.failureCode === "ABANDONED" ? "결제 미완료" : "결제 취소";
    case "pending":
      // 결제사 승인이 이미 났는데 우리가 아직 모르는 경우일 수 있다 — 한동안은 "확인 중"
      return now.getTime() - new Date(o.createdAt).getTime() < PENDING_CHECKING_MS ? "결제 확인 중" : "결제 미완료";
  }
}

export function generationOf(report: Pick<ReportRecord, "status"> | null | undefined): Generation {
  if (!report) return "none";
  if (report.status === "ready") return "ready";
  if (report.status === "failed") return "failed";
  return "in-progress";
}

export async function getMyPage(repo: MiyuRepository, userId: string, now: Date = new Date()): Promise<{ cards: MyReportCard[]; orders: MyOrderRow[] }> {
  const [assessments, orders, reports, contexts] = await Promise.all([
    repo.listAssessments(userId),
    repo.listOrdersForUser(userId),
    repo.listReportStatuses(userId),
    repo.listContexts(userId),
  ]);
  const mineOrders = orders.filter((o) => o.userId === userId);

  const cards = assessments
    .filter((a) => a.userId === userId)
    .map((a): MyReportCard => {
      const related = mineOrders.filter((o) => o.assessmentId === a.id);
      const paid = related.find((o) => o.status === "paid");
      const report = paid ? reports.find((r) => r.orderId === paid.id) : undefined;
      return {
        assessmentId: a.id,
        productName: PERSONAL_REPORT.name,
        subject: `${a.nickname} 님 · ${formatAssessmentBirth(a)}`,
        createdAt: a.createdAt,
        period: null,
        entitlement: paid ? "purchased" : related.some((o) => o.status === "refunded") ? "refunded" : "free",
        generation: paid ? generationOf(report) : "none",
        paidOrderNumber: paid?.orderNumber ?? null,
        source: a.source,
        contextTopic: contexts.find((c) => c.assessmentId === a.id)?.topic ?? null,
      };
    });

  const rows = mineOrders
    .map(
      (o): MyOrderRow => ({
        orderNumber: o.orderNumber,
        productName: productName(o.productId),
        amount: o.amount,
        status: o.status,
        statusLabel: orderStatusLabel(o, now),
        paymentEnv: o.paymentEnv,
        approvedAt: o.approvedAt,
        createdAt: o.createdAt,
        assessmentId: o.assessmentId,
      }),
    )
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt));

  return { cards, orders: rows };
}

export type OrderTrace = {
  order: MyOrderRow & { method: string | null; failureMessage: string | null };
  /** 결제 승인 후에만 리포트 열람 권한이 생긴다 */
  entitled: boolean;
  generation: Generation;
  events: { at: string; source: string; status: string | null; statusLabel: string | null; method?: string; mId?: string; approvedAt?: string }[];
};

/** 결제 처리 기록의 상태 코드를 사람이 읽는 말로 (코드는 함께 남겨 추적에 쓴다) */
export const EVENT_STATUS_LABEL: Record<string, string> = {
  DONE: "승인 완료",
  CANCELED: "결제사에서 취소됨",
  PARTIAL_CANCELED: "부분 취소",
  ABORTED: "승인 실패",
  EXPIRED: "결제 시간 만료",
  AMOUNT_MISMATCH: "금액이 주문과 달라 승인하지 않음",
  PAYMENT_MISMATCH: "결제 정보가 주문과 달라 반영하지 않음",
  DUPLICATE_PAYMENT: "이미 결제된 주문이 있어 반영하지 않음",
  SUPERSEDED: "새 결제 요청으로 대체",
  PAY_PROCESS_CANCELED: "결제창에서 결제를 취소함",
  PAY_PROCESS_ABORTED: "결제가 중단됨",
  REJECT_CARD_COMPANY: "카드사에서 거절",
  NETWORK_ERROR: "결제사 응답을 받지 못함 (확인 중)",
  ABANDONED: "결제사에 결제 기록이 없어 미완료로 정리",
  IN_PROGRESS: "결제사에서 진행 중",
  PAID_BUT_NOT_AT_GATEWAY: "결제 완료로 기록됐지만 결제사에서 찾지 못함 (운영자 확인)",
};

export const SOURCE_LABEL: Record<PaymentEventRecord["source"], string> = {
  checkout: "결제 시작",
  confirm: "승인 요청",
  webhook: "결제사 알림",
  fail_redirect: "결제창에서 돌아옴",
  reconcile: "결제사 기록과 대조",
  admin: "운영자 확인",
};

/**
 * 주문번호 기준 추적 — 주문 상태 · 결제 처리 기록 · 리포트 제공 권한을 함께 본다.
 * readRepo로 소유자를 확인한 뒤에만 서버 저장소(serverRepo)에서 결제 기록을 읽는다.
 */
export async function traceOrder(
  readRepo: MiyuRepository,
  serverRepo: MiyuRepository,
  input: { userId: string; orderNumber: string; now?: Date },
): Promise<OrderTrace | null> {
  const order = await readRepo.getOrderByNumber(input.orderNumber);
  if (!order || order.userId !== input.userId) return null;
  const [events, report] = await Promise.all([serverRepo.listPaymentEvents(order.id), readRepo.getReportByOrder(order.id)]);
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    order: {
      orderNumber: order.orderNumber,
      productName: productName(order.productId),
      amount: order.amount,
      status: order.status,
      statusLabel: orderStatusLabel(order, input.now),
      paymentEnv: order.paymentEnv,
      approvedAt: order.approvedAt,
      createdAt: order.createdAt,
      assessmentId: order.assessmentId,
      method: order.method,
      failureMessage: order.failureMessage,
    },
    entitled: order.status === "paid",
    generation: order.status === "paid" ? generationOf(report) : "none",
    events: events.map((e) => ({
      at: e.createdAt,
      source: SOURCE_LABEL[e.source] ?? e.source,
      status: e.status,
      statusLabel: e.status ? (EVENT_STATUS_LABEL[e.status] ?? null) : null,
      method: str(e.detail.method),
      mId: str(e.detail.mId),
      approvedAt: str(e.detail.approvedAt),
    })),
  };
}
