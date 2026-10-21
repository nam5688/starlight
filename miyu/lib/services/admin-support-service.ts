// 운영자 문의 대응 — 최근 주문 목록 · 질문 결제 장부 확인 · 결제사 확인 뒤 질문 수동 반영 · 저장된 리포트 읽기 전용 보기.
// 원칙
// - 주문 상태를 손으로 "결제 완료"로 바꾸지 않는다. 결제 여부는 결제사 조회(결제 대조)로만 맞추고, 수동 반영은 결제 완료로 확인된 질문 결제 주문에만 한다.
// - 질문 · 대화 · 고민 · 응답 내용은 다루지 않는다. 리포트 본문은 운영자가 문의에 답하려고 열 때만 읽고(화면은 따로, 열람 기록을 남긴다) 이 목록 · 장부 확인에는 없다.

import { isCashProduct } from "../config/product.ts";
import { nextRefundSteps, packRemaining, packShortfall, questionsLeft } from "../commerce/cash.ts";
import { isValidOrderNumber } from "../commerce/order.ts";
import { REPORT_SLA_MS } from "../commerce/report.ts";
import { isReadingReport, type AnyReportContent } from "../report/generator.ts";
import { renderReadingMarkdown } from "../report/reading/render-text.ts";
import { assessmentTypeTitle, type TypeTitle } from "../report/type-title.ts";
import type { AdminOrderRow } from "./admin-service.ts";
import { orderStatusLabel, productName } from "./my-service.ts";
import type { MiyuRepository, OrderRecord } from "./ports.ts";
import type { ReconcileOutcome } from "./reconcile-service.ts";

const MISSING = "42P01";
const isMissing = (e: unknown) => (e as { code?: string } | null)?.code === MISSING;

// ─────────────────────────────────────────────
// 질문 결제 장부 확인 (읽기만)
// ─────────────────────────────────────────────

export type QuestionLedgerState = {
  /** 장부를 읽을 수 있는가 (false면 DB 변경 13번 전) */
  ready: boolean;
  /** 이 주문으로 장부에 질문이 들어갔는가 (최근 내역 안에서 확인 — 아니라고 나와도 수동 반영 함수가 한 번 더 확인한다) */
  credited: boolean;
  creditedAt: string | null;
  /** 이 회원이 지금 쓸 수 있는 결제한 질문 수 */
  questionsLeft: number;
  /**
   * 이 주문(묶음)의 장부 — DB 16번 이후에 결제된 묶음만(없으면 null). 사용 · 환불 수량, 누적 환불액,
   * nextRefunds는 남은 질문을 환불할 때 토스 관리자의 "취소 금액"에 **이번에** 넣을 값(누적표 − 이미 환불한 누적액 — 합이 결제액을 넘지 않는다).
   */
  pack: {
    questions: number;
    used: number;
    refundedQuestions: number;
    refundedKrw: number;
    remaining: number;
    shortfall: number;
    nextRefunds: { questions: number; cancelNow: number; cumulative: number }[];
  } | null;
};

/** 질문 결제 주문 하나가 장부에 반영됐는지 본다. 질문 결제 주문이 아니면 null */
export async function questionLedgerState(repo: MiyuRepository, order: OrderRecord): Promise<QuestionLedgerState | null> {
  if (!isCashProduct(order.productId)) return null;
  try {
    const [balance, rows] = await Promise.all([repo.getCashBalance(order.userId), repo.listCashLedger(order.userId, 200)]);
    const row = rows.find((r) => r.orderId === order.id && (r.kind === "charge" || r.kind === "bonus"));
    let pack: QuestionLedgerState["pack"] = null;
    try {
      const p = await repo.getQuestionPack(order.id);
      if (p) {
        pack = {
          questions: p.questions,
          used: p.used,
          refundedQuestions: p.refundedQuestions,
          refundedKrw: p.refundedKrw,
          remaining: packRemaining(p),
          shortfall: packShortfall(p),
          // 이미 결제가 취소된(환불됨) 주문은 더 환불할 수 없다
          nextRefunds: order.status === "paid" ? nextRefundSteps(p) : [],
        };
      }
    } catch {
      // 16번 DB 변경 전에는 묶음 장부가 없다
    }
    return { ready: true, credited: Boolean(row), creditedAt: row?.createdAt ?? null, questionsLeft: questionsLeft(balance), pack };
  } catch {
    return { ready: false, credited: false, creditedAt: null, questionsLeft: 0, pack: null };
  }
}

// ─────────────────────────────────────────────
// 결제사 확인 뒤 질문 수동 반영
// ─────────────────────────────────────────────

export type AdminCreditResult =
  /** 결제사 기록으로 결제 완료를 확인했고 질문을 한 개 넣었다 */
  | { kind: "credited" }
  /** 이미 질문이 들어가 있다 (이번 확인에서 결제 완료로 맞춰지며 자동으로 들어간 경우 포함) — 아무것도 더하지 않았다 */
  | { kind: "already"; autoCredited: boolean }
  /** 질문 결제 주문이 아니다 (리포트 주문 등) */
  | { kind: "not-question-order" }
  /** 결제사 기록으로 결제 완료를 확인하지 못했다 — 질문을 넣지 않았다 (대기 · 취소 · 금액 불일치 · 조회 실패) */
  | { kind: "not-verified"; outcome: ReconcileOutcome["kind"]; code?: string }
  /** 이 DB에는 아직 이 기능이 없다 (DB 변경 15번 전) */
  | { kind: "unavailable" };

/**
 * 결제는 됐는데 질문이 들어가지 않았다는 문의 — 결제사 기록을 먼저 확인하고(verify = 결제 대조), 결제 완료로 확인된 질문 결제 주문에만 질문을 넣는다.
 * 주문 상태는 이 함수가 바꾸지 않는다(대조가 결제사 기록으로 맞출 뿐이다). 같은 주문에는 한 번만 들어가고 결제가 취소되면 회수된다(DB 함수 admin_credit_question).
 */
export async function adminCreditQuestionOrder(deps: { repo: MiyuRepository; verify: (order: OrderRecord) => Promise<ReconcileOutcome> }, order: OrderRecord): Promise<AdminCreditResult> {
  if (!isCashProduct(order.productId)) return { kind: "not-question-order" };
  const before = await questionLedgerState(deps.repo, order);
  const outcome = await deps.verify(order);
  if ((outcome.kind !== "paid" && outcome.kind !== "ok") || outcome.order.status !== "paid") {
    return { kind: "not-verified", outcome: outcome.kind, code: "code" in outcome ? outcome.code : undefined };
  }
  let result: Awaited<ReturnType<MiyuRepository["adminCreditQuestion"]>>;
  try {
    result = await deps.repo.adminCreditQuestion(outcome.order.id);
  } catch (e) {
    if (isMissing(e)) return { kind: "unavailable" };
    throw e;
  }
  if (result === "credited") return { kind: "credited" };
  if (result === "already") {
    // 이번 대조가 결제 대기를 결제 완료로 맞추며 DB가 같은 처리 안에서 넣었으면 자동 반영이다
    return { kind: "already", autoCredited: outcome.kind === "paid" && outcome.transitioned !== false && !(before?.credited ?? false) };
  }
  return result === "not-cash" ? { kind: "not-question-order" } : { kind: "not-verified", outcome: outcome.kind };
}

// ─────────────────────────────────────────────
// 최근 주문 목록 — 누가(닉네임 · 회원번호 앞 8자) 무엇을 샀고 리포트는 어떤 상태인가
// ─────────────────────────────────────────────

export type AdminRecentOrder = AdminOrderRow & {
  /** 검사 때 적은 닉네임 (탈퇴하면 "탈퇴") */
  nickname: string;
  /** 회원번호 앞 8자 — 이름 · 연락처가 아니라 같은 사람인지만 가린다 */
  memberShort: string;
  /** 리포트 상품이면 리포트 상태, 질문 결제면 null */
  report: string | null;
  isQuestion: boolean;
};

const REPORT_STATE = { ready: "완성", queued: "대기 중", generating: "만드는 중", failed: "만들지 못함" } as const;

/**
 * 리포트 상태를 운영자 화면에 쓰는 말로 — 최근 주문 목록과 주문 상세가 **같은 함수**를 쓴다.
 * (2026-10-22 운영자 확인: 같은 주문이 목록에서는 "완성", 상세에서는 "생성 중 · 시도 1/5"로 나왔다. 상세 쪽 라벨 함수에 완성(ready) 분기가 없어
 * 완성된 리포트도 "생성 중"으로 떨어졌다. 화면마다 따로 말을 만들지 않고 여기 한 곳에서 정한다.)
 * pastSla는 만드는 중인 리포트가 고객 지연 안내 기준(30분)을 넘었는지다 — 완성 · 실패에는 쓰지 않는다.
 */
export function reportStateLabel(r: { status: keyof typeof REPORT_STATE; pastSla?: boolean }): string {
  if (r.status === "ready" || r.status === "failed") return REPORT_STATE[r.status];
  if (r.pastSla) return `${REPORT_STATE[r.status]} · 지연 (30분 넘음)`;
  return REPORT_STATE[r.status];
}

export async function recentOrdersForAdmin(repo: MiyuRepository, now: Date, limit = 30): Promise<AdminRecentOrder[]> {
  const orders = await repo.listRecentOrders(limit);
  const names = new Map<string, string>();
  await Promise.all(
    [...new Set(orders.map((o) => o.assessmentId))].map(async (id) => {
      const a = await repo.getAssessment(id).catch(() => null);
      names.set(id, a?.nickname ?? "-");
    }),
  );
  return Promise.all(
    orders.map(async (o): Promise<AdminRecentOrder> => {
      const isQuestion = isCashProduct(o.productId);
      let report: string | null = null;
      if (!isQuestion) {
        if (o.status === "paid") {
          const r = await repo.getReportByOrder(o.id).catch(() => null);
          // 주문 상세(adminLookup)와 같은 기준으로 지연도 같이 보인다 — 만드는 중인 리포트가 30분을 넘으면 두 화면 모두 "지연"이라고 말한다
          const pastSla = r !== null && (r.status === "queued" || r.status === "generating") && now.getTime() - new Date(r.updatedAt).getTime() >= REPORT_SLA_MS;
          report = r ? reportStateLabel({ status: r.status, pastSla }) : "리포트 기록 없음";
        } else {
          report = "-";
        }
      }
      return {
        orderNumber: o.orderNumber,
        productName: productName(o.productId),
        amount: o.amount,
        status: o.status,
        statusLabel: orderStatusLabel(o, now),
        paymentEnv: o.paymentEnv,
        createdAt: o.createdAt,
        approvedAt: o.approvedAt,
        failureCode: o.failureCode,
        nickname: names.get(o.assessmentId) ?? "-",
        memberShort: o.userId.slice(0, 8),
        report,
        isQuestion,
      };
    }),
  );
}

// ─────────────────────────────────────────────
// 저장된 리포트 읽기 전용 보기 (운영자 문의 대응)
// ─────────────────────────────────────────────

export type AdminReportView =
  | { kind: "invalid" }
  | { kind: "not-found" }
  /** 질문 결제 · 환불 · 결제 대기 주문처럼 볼 리포트가 없다 */
  | { kind: "no-report"; order: AdminOrderRow; reason: string }
  | { kind: "ready"; order: AdminOrderRow; nickname: string; content: AnyReportContent; createdAt: string; generator: string | null; text: string | null; /** 고객에게 보이는 나의 유형(그 사람의 사주 + 응답으로 계산) — 읽기 전용 보기도 같은 값을 보인다 */ typeTitle: TypeTitle | null };

/**
 * 주문번호로 저장된 리포트를 읽기 전용으로 꺼낸다. 고객에게 보이는 것과 같은 저장본이며 새로 만들지 않는다.
 * text는 읽기 구조 리포트를 글로 옮긴 것(고객에게 붙여 넣어 보낼 때) — 다른 형식은 화면 캡처로 보낸다.
 * 채팅 대화 · 고민 기록은 가져오지 않는다.
 */
export async function adminReportView(repo: MiyuRepository, orderNumber: string, now: Date): Promise<AdminReportView> {
  if (!isValidOrderNumber(orderNumber)) return { kind: "invalid" };
  const order = await repo.getOrderByNumber(orderNumber);
  if (!order) return { kind: "not-found" };
  const row: AdminOrderRow = {
    orderNumber: order.orderNumber,
    productName: productName(order.productId),
    amount: order.amount,
    status: order.status,
    statusLabel: orderStatusLabel(order, now),
    paymentEnv: order.paymentEnv,
    createdAt: order.createdAt,
    approvedAt: order.approvedAt,
    failureCode: order.failureCode,
  };
  if (isCashProduct(order.productId)) return { kind: "no-report", order: row, reason: "질문 결제 주문이라 리포트가 없습니다." };
  if (order.status !== "paid") return { kind: "no-report", order: row, reason: `결제 완료 주문만 리포트를 엽니다 (지금 상태: ${row.statusLabel}).` };
  const report = await repo.getReportByOrder(order.id);
  if (!report || report.status !== "ready" || !report.content) {
    return { kind: "no-report", order: row, reason: report ? `리포트가 아직 완성되지 않았습니다 (${REPORT_STATE[report.status]}). 주문 조회 화면의 "리포트 다시 만들기"를 쓰세요.` : "리포트 기록이 없습니다. 주문 조회 화면의 \"리포트 다시 만들기\"를 쓰세요." };
  }
  const assessment = await repo.getAssessment(order.assessmentId);
  const content = report.content;
  const typeTitle = assessment ? assessmentTypeTitle(assessment) : null;
  return {
    kind: "ready",
    order: row,
    nickname: assessment?.nickname ?? "-",
    content,
    createdAt: report.createdAt,
    generator: report.generator ? `${report.generator} ${report.generatorVersion ?? ""}`.trim() : null,
    text: isReadingReport(content) ? renderReadingMarkdown(content, { typeTitle }) : null,
    typeTitle,
  };
}
