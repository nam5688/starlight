// 서비스가 바깥(DB·결제사)과 주고받는 약속.
// 웹(Next.js + Supabase + 토스페이먼츠)뿐 아니라 이후 다른 채널도 같은 서비스를 구현체만 바꿔 쓴다.

import type { Answers } from "../assessment/types.ts";
import type { GatewayPayment, OrderStatus } from "../commerce/order.ts";
import type { ReportStatus } from "../commerce/report.ts";
import type { ConsentRecord, ConsentType } from "../membership/terms.ts";
import type { PersonalContext, PersonalContextInput } from "../personalization/context.ts";
import type { ReportContent } from "../report/generator.ts";
import type { DataSource, FreeSummary } from "../report/types.ts";
import type { SajuResult } from "../saju/engine.ts";

export type Channel = "web";

export type ProfileRecord = {
  userId: string;
  nickname: string | null;
  /** 결제사에 넘기는 구매자 식별값 (회원번호와 별도의 무작위 값) */
  paymentCustomerKey: string;
};

export type AssessmentRecord = {
  id: string;
  userId: string;
  channel: Channel;
  nickname: string;
  calendar: "solar" | "lunar";
  isLeapMonth: boolean;
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  /** "HH:MM", 모르면 null */
  birthTime: string | null;
  knownMbti: string | null;
  answers: Answers;
  contentVersion: string;
  source: DataSource;
  summary: FreeSummary;
  saju: SajuResult;
  createdAt: string;
};
export type NewAssessment = Omit<AssessmentRecord, "id" | "createdAt">;

export type OrderRecord = {
  id: string;
  orderNumber: string;
  userId: string;
  assessmentId: string;
  productId: string;
  amount: number;
  status: OrderStatus;
  paymentKey: string | null;
  method: string | null;
  approvedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  /** 결제 환경 — test: 내 상점 테스트 키, test-docs: 토스 문서 예제용 공용 테스트 키, live: 실결제 */
  paymentEnv: PaymentEnv;
  /** 결제를 시작할 때의 유입 출처 (7번 이후 마이그레이션 전에 만든 주문에는 없다) */
  acquisition?: Acquisition | null;
  createdAt: string;
  updatedAt: string;
};
export type PaymentEnv = "test" | "test-docs" | "live";
/** 처음 들어온 출처 (광고 · 채널 비교용). 값이 없으면 null */
export type Acquisition = { source: string | null; medium: string | null; campaign: string | null };
export type WithdrawDataResult =
  | { ok: true; counts: Record<string, number> }
  | { ok: false; reason: "pending-order" | "report-in-progress" | "not-found" };

export type NewOrder = Pick<OrderRecord, "orderNumber" | "userId" | "assessmentId" | "productId" | "amount" | "paymentEnv"> & { acquisition?: Acquisition | null };
export type OrderPatch = Partial<
  Pick<OrderRecord, "status" | "paymentKey" | "method" | "approvedAt" | "failureCode" | "failureMessage">
>;

export type ReportRecord = {
  id: string;
  userId: string;
  orderId: string;
  assessmentId: string;
  status: ReportStatus;
  /** v1(FullReport, 개발용 규칙) 또는 v2(PersonalReportV2, AI 서술 + 근거) */
  content: ReportContent | null;
  generator: string | null;
  generatorVersion: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  readyAt: string | null;
};
export type NewReport = Pick<ReportRecord, "userId" | "orderId" | "assessmentId" | "status" | "attempts">;
export type ReportPatch = Partial<
  Pick<ReportRecord, "status" | "content" | "generator" | "generatorVersion" | "attempts" | "lastError" | "readyAt">
>;
/** 목록용 — 리포트 본문은 담지 않는다 */
export type ReportStatusRecord = Pick<ReportRecord, "id" | "orderId" | "assessmentId" | "status">;

/** AI 호출 한 번의 사용 기록 (서버 전용 · 쌓기만 한다). 요청 · 응답 내용은 담지 않는다 */
export type AiUsageInput = {
  reportId: string | null;
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  /** 단가가 설정돼 있을 때만 (원). 설정 전이면 null */
  estCostKrw: number | null;
  latencyMs: number;
  outcome: "ok" | "invalid" | "timeout" | "error";
  errorCode: string | null;
};
export type AiUsageRecord = AiUsageInput & { id: number; createdAt: string };

/** 화면에서 보내는 방문 단계 — 결제 시작 · 승인 · 리포트 완성은 orders · reports에서 센다 */
export const FUNNEL_EVENT_NAMES = ["visit", "analyze_start", "analyze_complete", "preview_view", "report_view"] as const;
export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];
/** 이름 · 생년월일 · 응답 · 고민 · 리포트 내용은 담지 않는다 */
export type FunnelEventInput = { anonId: string; name: FunnelEventName; path: string | null; src: string | null; medium: string | null; campaign: string | null; referrerHost: string | null };
export type FunnelEventRecord = FunnelEventInput & { id: number; createdAt: string };

/** 지표 집계용 — 개인을 구분하는 값은 회원번호뿐이며 화면에는 합계만 보인다 */
export type MetricsOrder = Pick<OrderRecord, "id" | "userId" | "assessmentId" | "status" | "amount" | "paymentEnv" | "createdAt" | "approvedAt"> & { acquisition: Acquisition | null };
export type MetricsReport = Pick<ReportRecord, "id" | "orderId" | "status" | "createdAt" | "readyAt">;
export type FeedbackRecord = { reportId: string; userId: string; rating: number; createdAt: string; updatedAt: string };

export type PaymentEventSource = "confirm" | "webhook" | "fail_redirect" | "checkout" | "reconcile" | "admin";

/** 결제 처리 기록 (주문 상세 · 운영 추적용). detail에는 카드 번호 등 결제수단 상세가 없다 */
export type PaymentEventRecord = {
  source: PaymentEventSource;
  status: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type InsertResult<T> = { ok: true; value: T } | { ok: false; reason: "conflict" };

export type OpsSeverity = "info" | "warn" | "error";
/** 운영 기록 입력 — 고객 이름 · 생년월일 · 답변 · 분석 내용 · 키 · 토큰은 담지 않는다 */
export type OpsEventInput = {
  kind: string;
  severity?: OpsSeverity;
  orderNumber?: string | null;
  errorId?: string | null;
  dedupeKey?: string | null;
  message: string;
  detail?: Record<string, unknown>;
};
export type OpsEventRecord = {
  id: number;
  createdAt: string;
  kind: string;
  severity: OpsSeverity;
  orderNumber: string | null;
  errorId: string | null;
  dedupeKey: string | null;
  message: string;
  detail: Record<string, unknown>;
};
/** 관리자 화면용 — 리포트 본문은 담지 않는다 */
export type ProblemReport = Pick<ReportRecord, "id" | "orderId" | "assessmentId" | "status" | "attempts" | "lastError" | "createdAt" | "updatedAt">;

export type NewPersonalContext = PersonalContextInput & Pick<PersonalContext, "assessmentId" | "userId" | "agreedAt">;
/** 목록용 — 적은 내용은 담지 않는다 */
export type PersonalContextSummary = Pick<PersonalContext, "assessmentId" | "topic" | "updatedAt">;

export interface MiyuRepository {
  /** 동의 기록 (지우지 않고 쌓는다) */
  listConsents(userId: string): Promise<ConsentRecord[]>;
  addConsents(userId: string, consents: { type: ConsentType; version: string; agreed: boolean }[]): Promise<void>;

  getProfile(userId: string): Promise<ProfileRecord | null>;
  /** 프로필이 없으면 만들고(이미 있으면 그대로) 돌려준다 — 테이블보다 먼저 가입한 회원 보완용 */
  ensureProfile(userId: string): Promise<ProfileRecord>;
  /**
   * 회원 탈퇴 — 그 회원의 개인정보를 삭제하고 주문 · 결제 기록만 남긴다 (한 번에 처리, 여러 번 불러도 같은 결과).
   * 진행 중인 결제 · 리포트 생성이 있으면 처리하지 않는다. 로그인 연결(Auth)은 이 함수가 다루지 않는다.
   */
  withdrawMemberData(userId: string): Promise<WithdrawDataResult>;
  updateProfileNickname(userId: string, nickname: string): Promise<void>;
  saveRegion(userId: string, region: { province: string; district: string }): Promise<void>;

  insertAssessment(assessment: NewAssessment): Promise<AssessmentRecord>;
  /** 이 시각 이후 이 회원이 저장한 검사 결과 수 (무료 생성 남용 방지) */
  countAssessmentsSince(userId: string, since: string): Promise<number>;
  getAssessment(id: string): Promise<AssessmentRecord | null>;
  listAssessments(userId: string): Promise<AssessmentRecord[]>;

  getOrderByNumber(orderNumber: string): Promise<OrderRecord | null>;
  listOrdersForAssessment(assessmentId: string): Promise<OrderRecord[]>;
  listOrdersForUser(userId: string): Promise<OrderRecord[]>;
  insertOrder(order: NewOrder): Promise<InsertResult<OrderRecord>>;
  /** 현재 상태가 from 중 하나일 때만 바꾼다. 바뀌지 않았으면 null */
  updateOrder(id: string, from: readonly OrderStatus[], patch: OrderPatch): Promise<OrderRecord | null>;
  addPaymentEvent(event: {
    orderId: string;
    source: PaymentEventSource;
    status: string | null;
    detail: Record<string, unknown>;
  }): Promise<void>;

  /** 나를 더 반영하기 — 검사 결과 하나에 하나. 쓰기 · 지우기는 서비스에서 소유자를 확인한 뒤에만 */
  getContext(assessmentId: string): Promise<PersonalContext | null>;
  listContexts(userId: string): Promise<PersonalContextSummary[]>;
  upsertContext(context: NewPersonalContext): Promise<PersonalContext>;
  deleteContext(assessmentId: string): Promise<void>;

  /** 서버 전용 (브라우저 권한으로는 읽을 수 없다) — 주문 소유자를 확인한 뒤에만 쓴다 */
  listPaymentEvents(orderId: string): Promise<PaymentEventRecord[]>;

  /** 운영 기록 (서버 전용). 테이블이 없으면(DB 변경 6번 전) 쓰기는 건너뛰고 조회는 빈 목록 */
  addOpsEvent(event: OpsEventInput): Promise<void>;
  listOpsEvents(filter: { orderNumber?: string; errorId?: string; kinds?: string[]; since?: string; limit: number }): Promise<OpsEventRecord[]>;
  /** 같은 dedupeKey의 기록이 since 이후에 있는지 (알림 중복 방지) */
  hasOpsEventSince(dedupeKey: string, since: string): Promise<boolean>;

  /** 재확인 대상: 일정 시간 넘게 "대기"인 주문 + 최근에 결제 완료된 주문 (결제사 기록과 어긋나는지 확인) */
  listOrdersForReconcile(opts: { pendingCreatedBefore: string; paidSince: string; limit: number }): Promise<OrderRecord[]>;
  /** 관리자 화면용 */
  listRecentOrders(limit: number): Promise<OrderRecord[]>;
  getOrderById(id: string): Promise<OrderRecord | null>;
  /** 방문 단계 기록 · 만족도 · 지표 집계 (서버 전용). 7~8번 마이그레이션 전에는 쓰기를 건너뛰고 조회는 빈 값 */
  addFunnelEvent(event: FunnelEventInput): Promise<void>;
  listFunnelEventsSince(since: string, limit: number): Promise<FunnelEventRecord[]>;
  listOrdersForMetrics(since: string, limit: number): Promise<MetricsOrder[]>;
  listReportsForMetrics(since: string, limit: number): Promise<MetricsReport[]>;
  countAssessmentsAllSince(since: string): Promise<number>;
  upsertFeedback(input: { reportId: string; userId: string; rating: number }): Promise<void>;
  getFeedback(reportId: string): Promise<FeedbackRecord | null>;
  listFeedbackSince(since: string, limit: number): Promise<FeedbackRecord[]>;
  /** AI 사용 기록 (서버 전용). 테이블이 없으면(DB 변경 7번 전) 쓰기는 건너뛰고 조회는 빈 값 */
  addAiUsage(usage: AiUsageInput): Promise<void>;
  listAiUsageSince(since: string, limit: number): Promise<AiUsageRecord[]>;
  /** 이 시각 이후 AI 예상 비용 합계 (원) — DB에서 합산한다 */
  sumAiCostSince(since: string): Promise<number>;
  /** 지금 생성 중인 리포트 수 (staleBefore보다 오래 멈춘 것은 제외) */
  countActiveGenerations(staleBefore: string): Promise<number>;
  /** 생성 순서를 기다리는 리포트 수 */
  countQueuedReports(): Promise<number>;
  listProblemReports(opts: { statuses: readonly ReportStatus[]; updatedBefore?: string; limit: number }): Promise<ProblemReport[]>;
  getReportByOrder(orderId: string): Promise<ReportRecord | null>;
  listReportStatuses(userId: string): Promise<ReportStatusRecord[]>;
  insertReport(report: NewReport): Promise<InsertResult<ReportRecord>>;
  /** 현재 상태가 from 중 하나이고 (주어지면) 시도 횟수가 같을 때만 바꾼다 */
  updateReport(
    id: string,
    from: readonly ReportStatus[],
    patch: ReportPatch,
    expectedAttempts?: number,
  ): Promise<ReportRecord | null>;
}

export type GatewayResult =
  | { ok: true; payment: GatewayPayment }
  | { ok: false; code: string; message: string; retryable: boolean };

export interface PaymentGateway {
  readonly provider: "tosspayments";
  /** 결제 승인. 같은 paymentKey로 다시 불러도 중복 승인되지 않아야 한다 */
  confirm(input: { paymentKey: string; orderId: string; amount: number }): Promise<GatewayResult>;
  getPayment(paymentKey: string): Promise<GatewayResult>;
  /**
   * 우리 주문번호로 결제사 기록을 찾는다. 결제 승인은 됐는데 우리 쪽 저장이 실패했거나 고객이 돌아오지 못한 경우를
   * 결제키 없이도 맞추기 위한 것이다. 결제사에 해당 주문의 결제가 없으면 code "NOT_FOUND_PAYMENT".
   */
  getPaymentByOrderId(orderNumber: string): Promise<GatewayResult>;
}
