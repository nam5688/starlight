// 서비스가 바깥(DB·결제사)과 주고받는 약속.
// 웹(Next.js + Supabase + 토스페이먼츠)뿐 아니라 이후 다른 채널도 같은 서비스를 구현체만 바꿔 쓴다.

import type { Answers } from "../assessment/types.ts";
import type { GatewayPayment, OrderStatus } from "../commerce/order.ts";
import type { ReportStatus } from "../commerce/report.ts";
import type { ConsentRecord, ConsentType } from "../membership/terms.ts";
import type { ConcernRecord, ConcernRecordSummary, NewConcernRecord } from "../personalization/concern.ts";
import type { PersonalContext, PersonalContextInput } from "../personalization/context.ts";
import type { AnyReportContent } from "../report/generator.ts";
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
  /** cash-balance: 결제해 두고 쓰지 않은 질문(장부 잔액)이 남아 있다 (다 쓰거나 환불 문의를 마친 뒤에 탈퇴) */
  | { ok: false; reason: "pending-order" | "report-in-progress" | "cash-balance" | "not-found" };

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
  /** v1(FullReport, 개발용 규칙) · v2(PersonalReportV2, AI 서술 + 근거) · 고민 반영(ConcernReportV1) */
  content: AnyReportContent | null;
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
export type ReportStatusRecord = Pick<ReportRecord, "id" | "orderId" | "assessmentId" | "status" | "generator" | "generatorVersion" | "readyAt">;

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
export type MetricsOrder = Pick<OrderRecord, "id" | "userId" | "assessmentId" | "productId" | "status" | "amount" | "paymentEnv" | "createdAt" | "approvedAt"> & { acquisition: Acquisition | null };
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

/** 미유캐시 거래 내역 — charge 충전 · bonus 보너스 · spend 질문에 사용 · spend_restore 사용 되돌림 · clawback 결제 취소로 회수. 질문 내용은 담지 않는다 */
export type CashLedgerKind = "charge" | "bonus" | "spend" | "spend_restore" | "clawback";
export type CashLedgerRecord = { id: number; kind: CashLedgerKind; amount: number; orderId: string | null; shortfall: number; createdAt: string };

/** 대화(상담방) 저장 — 회원 · 검사 결과 · 방마다 한 줄. 눌렀던 행동 목록과 자유 질문 · 답만 담고 리포트 글은 담지 않는다 */
export type TalkRoomRecord = { assessmentId: string; roomKey: string; userId: string; actions: unknown[]; updatedAt: string; /** 행동 목록에서 어디까지 요약했는가 — 다음 저장은 여기부터 요약한다 */ savedUpto: number };

/**
 * 채팅 요약 — 방에서 [저장하기]를 누르거나 대화를 끝낼 때의 "그때까지 나눈 질문과 답" 줄임. 만든 뒤 고치지 않는다.
 * visible: true = 회원이 직접 저장한 요약(MY에서 본인이 본다) · false = 저장하지 않고 끝낸 대화의 참고 기록(회원 화면에는 보이지 않고 다음 질문에서 AI가 참고한다).
 * room은 방 이름이고 날짜별 방(오늘의 한 장)도 날짜 없이 daily로 묶는다. items는 lib/report/chat/summary.ts의 SummaryItems(읽을 때 모양을 다시 확인한다).
 */
export type ChatSummaryRecord = { id: string; userId: string; assessmentId: string; room: string; visible: boolean; items: unknown; createdAt: string };

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

  /** 내 고민 자세히 알려주기 — 검사 결과 하나에 하나. 쓰기 · 지우기는 서비스에서 소유자를 확인한 뒤에만 */
  getContext(assessmentId: string): Promise<PersonalContext | null>;
  listContexts(userId: string): Promise<PersonalContextSummary[]>;
  upsertContext(context: NewPersonalContext): Promise<PersonalContext>;
  deleteContext(assessmentId: string): Promise<void>;

  /**
   * 고민 기록 — 고민 반영 리포트를 발급할 때 "그때의 고민"을 저장해 둔 것. 만든 뒤에는 고치지 않고, 고객이 내용을 지울 수만 있다.
   * 같은 검사 결과의 같은 작성 시점(writtenAt)에는 (내용을 지운 기록을 빼고) 하나만 생긴다 (같은 저장본으로 두 번 발급을 시작해도 기록은 하나).
   * 테이블이 없으면(DB 변경 11번 전) 조회는 빈 값, 저장은 오류(코드 42P01).
   */
  insertConcernRecord(record: NewConcernRecord): Promise<InsertResult<ConcernRecord>>;
  getConcernRecord(id: string): Promise<ConcernRecord | null>;
  /** 이 검사 결과의 고민 기록 — 최근 것이 먼저 */
  listConcernRecords(assessmentId: string): Promise<ConcernRecord[]>;
  /** 이 회원의 고민 기록 목록 (적은 내용은 담지 않는다) */
  listConcernRecordSummaries(userId: string): Promise<ConcernRecordSummary[]>;
  /** 내용만 지운다 (기록 자리와 주제 · 작성 시점 · 발급한 리포트는 남는다). 이미 지웠으면 그대로 */
  scrubConcernRecord(id: string, at: string): Promise<void>;

  /**
   * 대화(채팅방) 저장 — 쓰기 · 지우기는 서비스에서 소유자를 확인한 뒤에만. 테이블이 없으면(DB 변경 12번 전) 조회는 빈 값, 쓰기는 오류(코드 42P01).
   * roomKey는 방 이름이고 오늘의 한 장 방은 daily:YYYY-MM-DD 로 날짜별로 나뉜다.
   */
  getTalkRoom(assessmentId: string, roomKey: string): Promise<TalkRoomRecord | null>;
  /** 이 검사 결과에서 저장된 대화가 있는 방 이름들 */
  listTalkRoomKeys(assessmentId: string): Promise<string[]>;
  upsertTalkRoom(input: { assessmentId: string; userId: string; roomKey: string; actions: unknown[] }): Promise<void>;
  deleteTalkRoom(assessmentId: string, roomKey: string): Promise<void>;
  /** roomKey가 prefix로 시작하고 keepKey보다 앞서는 방을 지운다 (지난 날짜의 오늘의 한 장 정리) */
  deleteTalkRoomsBefore(assessmentId: string, prefix: string, keepKey: string): Promise<void>;
  /**
   * 채팅 요약 — 테이블이 없으면(DB 변경 14번 전) 조회는 빈 값, 쓰기는 오류(코드 42P01).
   * claimTalkRoomSegment: 이 방의 요약 위치(saved_upto)가 from일 때만 to로 옮긴다 — 저장 버튼을 두 번 눌러도 같은 대화가 두 번 요약되지 않게 하는 한 번만 성공하는 자리 잡기. 옮겼으면 true, 이미 다른 요청이 옮겼거나 방이 없으면 false.
   * releaseTalkRoomSegment: 요약을 만들지 못했을 때 위치를 되돌린다(to일 때만 from으로).
   */
  claimTalkRoomSegment(assessmentId: string, roomKey: string, from: number, to: number): Promise<boolean>;
  releaseTalkRoomSegment(assessmentId: string, roomKey: string, from: number, to: number): Promise<void>;
  insertChatSummary(input: { userId: string; assessmentId: string; room: string; visible: boolean; items: unknown }): Promise<ChatSummaryRecord>;
  /** 이 회원의 채팅 요약 — 최근 것이 먼저. visibleOnly면 직접 저장한 것만(MY 화면) */
  listChatSummaries(userId: string, opts: { visibleOnly: boolean; limit?: number }): Promise<ChatSummaryRecord[]>;
  /** 이 검사 결과의 이 방 요약(직접 저장한 것 + 참고 기록) — 최근 것이 먼저. 다음 질문에서 AI가 참고한다 */
  listRoomChatSummaries(userId: string, assessmentId: string, room: string, limit: number): Promise<ChatSummaryRecord[]>;
  countVisibleChatSummaries(userId: string): Promise<number>;
  /** 요약 하나를 지운다 (내 것만, 지웠으면 true) */
  deleteChatSummary(userId: string, id: string): Promise<boolean>;
  /** 이 회원의 채팅 요약을 모두 지운다 (직접 저장한 것과 참고 기록 모두) — 지운 개수 */
  deleteChatSummaries(userId: string): Promise<number>;
  /** 보관 기간이 지난 참고 기록(visible = false, before보다 앞서 만든 것)을 모든 회원에 걸쳐 지운다 — 지운 개수. 직접 저장한 요약은 건드리지 않는다 */
  deleteExpiredHiddenChatSummaries(before: string): Promise<number>;
  /** 이 방의 참고 기록(visible = false)을 최근 keep개만 남기고 지운다 */
  trimHiddenChatSummaries(userId: string, assessmentId: string, room: string, keep: number): Promise<void>;
  /** 자유 질문 횟수 기록 — 질문 내용은 담지 않는다. 테이블이 없으면 조회 · 쓰기 모두 오류(코드 42P01) */
  addChatQuestion(input: { userId: string; assessmentId: string; roomKey: string }): Promise<void>;
  countChatQuestionsSince(userId: string, since: string): Promise<number>;
  /** 이 방(roomKey)에서 이 회원이 지금까지 한 질문 수 — 방마다 무료 질문 수를 세는 데 쓴다. 테이블이 없으면 오류(코드 42P01) */
  countChatQuestionsInRoom(userId: string, roomKey: string): Promise<number>;

  /**
   * 미유캐시 — 서버만 쓴다(충전은 결제 완료 처리 안에서 DB가 한다). 테이블 · 함수가 없으면(DB 변경 13번 전) 오류(코드 42P01)를 던진다.
   * - getCashBalance: 지갑이 없으면 0
   * - spendCash: 잔액이 충분하면 차감하고 새 잔액을, 모자라면 아무것도 바꾸지 않고 null. 같은 참조번호(ref)로 두 번 차감할 수 없다
   * - restoreCashSpend: 그 참조번호의 차감을 한 번만 되돌려 새 잔액을 돌려준다 (되돌릴 차감이 없거나 이미 되돌렸으면 null)
   */
  getCashBalance(userId: string): Promise<number>;
  listCashLedger(userId: string, limit: number): Promise<CashLedgerRecord[]>;
  spendCash(input: { userId: string; amount: number; ref: string }): Promise<number | null>;
  restoreCashSpend(input: { userId: string; ref: string }): Promise<number | null>;

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
