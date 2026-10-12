// 서비스가 바깥(DB·결제사)과 주고받는 약속.
// 웹(Next.js + Supabase + 토스페이먼츠)뿐 아니라 이후 다른 채널도 같은 서비스를 구현체만 바꿔 쓴다.

import type { Answers } from "../assessment/types.ts";
import type { GatewayPayment, OrderStatus } from "../commerce/order.ts";
import type { ReportStatus } from "../commerce/report.ts";
import type { ConsentRecord, ConsentType } from "../membership/terms.ts";
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
  createdAt: string;
  updatedAt: string;
};
export type PaymentEnv = "test" | "test-docs" | "live";
export type NewOrder = Pick<OrderRecord, "orderNumber" | "userId" | "assessmentId" | "productId" | "amount" | "paymentEnv">;
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

export type PaymentEventSource = "confirm" | "webhook" | "fail_redirect" | "checkout";

/** 결제 처리 기록 (주문 상세 · 운영 추적용). detail에는 카드 번호 등 결제수단 상세가 없다 */
export type PaymentEventRecord = {
  source: PaymentEventSource;
  status: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type InsertResult<T> = { ok: true; value: T } | { ok: false; reason: "conflict" };

export interface MiyuRepository {
  /** 동의 기록 (지우지 않고 쌓는다) */
  listConsents(userId: string): Promise<ConsentRecord[]>;
  addConsents(userId: string, consents: { type: ConsentType; version: string; agreed: boolean }[]): Promise<void>;

  getProfile(userId: string): Promise<ProfileRecord | null>;
  /** 프로필이 없으면 만들고(이미 있으면 그대로) 돌려준다 — 테이블보다 먼저 가입한 회원 보완용 */
  ensureProfile(userId: string): Promise<ProfileRecord>;
  updateProfileNickname(userId: string, nickname: string): Promise<void>;
  saveRegion(userId: string, region: { province: string; district: string }): Promise<void>;

  insertAssessment(assessment: NewAssessment): Promise<AssessmentRecord>;
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

  /** 서버 전용 (브라우저 권한으로는 읽을 수 없다) — 주문 소유자를 확인한 뒤에만 쓴다 */
  listPaymentEvents(orderId: string): Promise<PaymentEventRecord[]>;
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
}
