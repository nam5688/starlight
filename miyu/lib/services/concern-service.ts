// 내 고민 자세히 알려주기 — 나의 고민 기록소의 상태 계산 · 새 리포트 발급 시작 · 고민 기록 지우기.
//
// 원칙
// - 고민을 쓰고 · 고치고 · 저장하는 것(context-service)은 리포트를 만들지 않는다. 저장과 발급은 따로다.
// - 발급은 "그 순간의 고민"을 고민 기록(저장본)으로 남기고, 그 기록에 묶인 별도의 주문 · 리포트를 만든다.
//   이후 고민을 고쳐도 기록 · 이미 발급한 리포트는 바뀌지 않고, 기존 개인 통합 리포트도 덮어쓰지 않는다.
// - 같은 저장본(작성 시점)에는 기록이 하나, 기록마다 결제 완료 · 대기 주문이 하나뿐이다(DB 고유 조건). 두 번 눌러도 한 건만 발급된다.
// - 발급 권한은 개인 통합 리포트 구매 권한과 따로 본다 (개인 통합 주문과 상품 번호가 다르다).

import { CONCERN_REPORT, concernProductId, parseConcernProductId } from "../config/product.ts";
import { createOrderNumber } from "../commerce/order.ts";
import { sameConcern, concernInputOf, type ConcernRecord } from "../personalization/concern.ts";
import type { PersonalContext } from "../personalization/context.ts";
import { salesClosedMessage, type GateReason } from "./capacity-service.ts";
import { generationOf, type Generation } from "./my-service.ts";
import type { SaleGateCheck } from "./order-service.ts";
import type { Acquisition, AssessmentRecord, MiyuRepository, OrderRecord, PaymentEnv, ReportRecord } from "./ports.ts";
import { currentPersonalReport } from "./report-service.ts";

/** 새 리포트를 발급할 수 있는 환경인가 — 고민을 해석에 반영하는 AI 생성기가 연결돼 있어야 한다 (개발용 규칙 생성기는 고민을 반영하지 못한다) */
export type IssuingAvailability = { enabled: true } | { enabled: false; reason: "ai-not-connected" };

export const ISSUING_UNAVAILABLE_MESSAGE: Record<Extract<IssuingAvailability, { enabled: false }>["reason"], string> = {
  "ai-not-connected": "고민을 반영하는 리포트는 AI 연결이 끝난 뒤에 발급할 수 있어요. 지금은 고민을 적고 저장해 둘 수 있습니다.",
};

/** 같은 저장본에서 결제 시작을 두 번 눌러도 새 주문을 만들지 않는 시간 (더블 클릭 · 새로고침) */
const REUSE_PENDING_MS = 15_000;

export type ConcernEntryState = "generating" | "ready" | "failed" | "refunded";

/** 고민 기록 + 그 기록으로 발급한 리포트 한 건 (기록소 목록의 한 칸) */
export type ConcernEntry = {
  record: ConcernRecord;
  orderNumber: string;
  /** 결제를 승인한 시각 (발급일) */
  issuedAt: string;
  state: ConcernEntryState;
  /** 지금 적어 둔 고민과 같은 내용 */
  isCurrent: boolean;
};

export type IssueState =
  /** 작성 기록 없음 */
  | { kind: "no-concern" }
  /** 개인 통합 리포트를 아직 구매하지 않음 (기존 구매자 전용) */
  | { kind: "not-purchased" }
  /** 개인 통합 리포트가 아직 준비되지 않음 — 이미 준 내용과 달라야 하므로 준비 뒤에 발급한다 */
  | { kind: "base-not-ready"; status: ReportRecord["status"] | null }
  | { kind: "unavailable"; reason: Extract<IssuingAvailability, { enabled: false }>["reason"] }
  | { kind: "can-issue"; priceKrw: number }
  /** 지금의 고민으로 이미 발급함 → 그 리포트 보러가기 */
  | { kind: "issued"; recordId: string; generation: Generation };

export type ConcernWorkspace = {
  assessment: AssessmentRecord;
  context: PersonalContext | null;
  /** 발급한 기록 (최근 발급이 먼저) — 결제 전 임시 저장본은 담지 않는다 */
  entries: ConcernEntry[];
  issue: IssueState;
};

async function ownedAssessment(repo: MiyuRepository, userId: string, assessmentId: string) {
  const assessment = await repo.getAssessment(assessmentId);
  return assessment && assessment.userId === userId ? assessment : null;
}

const ordersOfRecord = (orders: OrderRecord[], recordId: string) => orders.filter((o) => parseConcernProductId(o.productId) === recordId);

/**
 * 지금의 고민에 해당하는 기록 — 같은 저장본(작성 시점)이거나 같은 내용 (한 글자라도 고치면 다른 고민).
 * 이미 발급한 기록(결제 완료)이 있으면 그것을 먼저 돌려준다 (지운 기록이어도 같은 저장본이면 다시 결제하지 않는다).
 * 발급하지 않은 기록은 내용을 지우지 않은 것만 다시 쓴다.
 */
export function recordForCurrentConcern(records: ConcernRecord[], orders: OrderRecord[], context: PersonalContext): { record: ConcernRecord; paid: OrderRecord | undefined } | null {
  const matches = (r: ConcernRecord) => r.writtenAt === context.updatedAt || (!r.scrubbedAt && sameConcern(r, context));
  const paidOf = (r: ConcernRecord) => ordersOfRecord(orders, r.id).find((o) => o.status === "paid");
  const issued = records.find((r) => matches(r) && paidOf(r));
  if (issued) return { record: issued, paid: paidOf(issued) };
  const open = records.find((r) => !r.scrubbedAt && matches(r));
  return open ? { record: open, paid: undefined } : null;
}

/** 개인 통합 리포트 — 구매한 주문과 그 리포트 상태 */
async function personalState(repo: MiyuRepository, orders: OrderRecord[]) {
  const current = await currentPersonalReport(repo, orders);
  return { paid: current?.order ?? null, report: current?.report ?? null };
}

export async function getConcernWorkspace(
  repo: MiyuRepository,
  input: { userId: string; assessmentId: string; issuing: IssuingAvailability },
): Promise<ConcernWorkspace | null> {
  const assessment = await ownedAssessment(repo, input.userId, input.assessmentId);
  if (!assessment) return null;
  const [context, orders, records, reportStatuses] = await Promise.all([
    repo.getContext(assessment.id),
    repo.listOrdersForAssessment(assessment.id),
    repo.listConcernRecords(assessment.id),
    repo.listReportStatuses(input.userId),
  ]);
  const current = context ? recordForCurrentConcern(records, orders, context) : null;

  const entries: ConcernEntry[] = [];
  for (const record of records) {
    const mine = ordersOfRecord(orders, record.id);
    const paid = mine.find((o) => o.status === "paid");
    const refunded = mine.find((o) => o.status === "refunded");
    const order = paid ?? refunded;
    if (!order) continue; // 결제 전 임시 저장본
    const report = paid ? reportStatuses.find((r) => r.orderId === paid.id) : undefined;
    const gen = generationOf(report);
    entries.push({
      record,
      orderNumber: order.orderNumber,
      issuedAt: order.approvedAt ?? order.createdAt,
      state: !paid ? "refunded" : gen === "ready" ? "ready" : gen === "failed" ? "failed" : "generating",
      isCurrent: Boolean(paid && current?.paid && current.record.id === record.id),
    });
  }
  entries.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

  let issue: IssueState;
  if (!context) {
    issue = { kind: "no-concern" };
  } else {
    const currentEntry = current?.paid ? entries.find((e) => e.record.id === current.record.id && e.state !== "refunded") : undefined;
    if (currentEntry) {
      issue = { kind: "issued", recordId: currentEntry.record.id, generation: currentEntry.state === "ready" ? "ready" : currentEntry.state === "failed" ? "failed" : "in-progress" };
    } else {
      const base = await personalState(repo, orders);
      if (!base.paid) issue = { kind: "not-purchased" };
      else if (base.report?.status !== "ready") issue = { kind: "base-not-ready", status: base.report?.status ?? null };
      else if (!input.issuing.enabled) issue = { kind: "unavailable", reason: input.issuing.reason };
      else issue = { kind: "can-issue", priceKrw: CONCERN_REPORT.priceKrw };
    }
  }
  return { assessment, context, entries, issue };
}

export type StartConcernCheckoutResult =
  | { kind: "order"; order: OrderRecord; record: ConcernRecord }
  /** 이 고민으로 이미 발급함 — 결제하지 않고 그 리포트로 안내 */
  | { kind: "already-issued"; order: OrderRecord; record: ConcernRecord }
  | { kind: "no-concern" }
  | { kind: "not-purchased" }
  | { kind: "base-not-ready" }
  | { kind: "unavailable"; reason: Extract<IssuingAvailability, { enabled: false }>["reason"] | "not-ready" }
  /** 지금은 새 구매를 받지 않음 (리포트 준비 용량 · 하루 예산). 결제는 시작하지 않는다 */
  | { kind: "sales-closed"; reason: GateReason | null; message: string }
  | { kind: "not-found" };

const isMissingTable = (e: unknown) => ["PGRST205", "42P01"].includes((e as { code?: string } | null)?.code ?? "");

/**
 * 이 고민으로 새 리포트 발급을 시작한다 (결제 주문까지만 — 리포트는 결제 승인 뒤에 만든다).
 * 고민은 이 순간의 저장본을 기록으로 남기고, 같은 저장본이면 기록 · 주문을 다시 만들지 않는다.
 */
export async function startConcernCheckout(
  deps: { repo: MiyuRepository; now: () => Date; newOrderNumber?: (now: Date) => string; gate?: SaleGateCheck; issuing: IssuingAvailability },
  input: { userId: string; assessmentId: string; paymentEnv?: PaymentEnv; acquisition?: Acquisition | null },
): Promise<StartConcernCheckoutResult> {
  const { repo } = deps;
  const assessment = await ownedAssessment(repo, input.userId, input.assessmentId);
  if (!assessment) return { kind: "not-found" };

  const [context, orders, records] = await Promise.all([repo.getContext(assessment.id), repo.listOrdersForAssessment(assessment.id), repo.listConcernRecords(assessment.id)]);
  if (!context) return { kind: "no-concern" };

  // 이미 이 고민으로 발급했다면 어떤 이유로도 다시 결제하게 하지 않는다 (환경이 바뀌어도 열람은 가능해야 한다)
  const current = recordForCurrentConcern(records, orders, context);
  if (current?.paid) return { kind: "already-issued", order: current.paid, record: current.record };
  const existing = current?.record ?? null;

  const base = await personalState(repo, orders);
  if (!base.paid) return { kind: "not-purchased" };
  if (base.report?.status !== "ready") return { kind: "base-not-ready" };
  if (!deps.issuing.enabled) return { kind: "unavailable", reason: deps.issuing.reason };

  // 용량이나 예산이 찼으면 결제를 시작하지 않는다 (기다리게 하지 않고 바로 알린다)
  if (deps.gate) {
    let closed: { reason: GateReason | null } | null = null;
    try {
      const g = await deps.gate("start");
      if (!g.open) closed = { reason: g.reason };
    } catch {
      // 확인 자체가 실패하면 판매를 막지 않는다
    }
    if (closed) return { kind: "sales-closed", reason: closed.reason, message: salesClosedMessage(closed.reason) };
  }

  // 1) 이 순간의 고민을 기록으로 남긴다
  let record = existing;
  if (!record) {
    try {
      const inserted = await repo.insertConcernRecord({
        ...concernInputOf(context),
        userId: input.userId,
        assessmentId: assessment.id,
        writtenAt: context.updatedAt,
        agreedAt: context.agreedAt,
      });
      record = inserted.ok ? inserted.value : ((await repo.listConcernRecords(assessment.id)).find((r) => !r.scrubbedAt && r.writtenAt === context.updatedAt) ?? null);
    } catch (e) {
      if (isMissingTable(e)) return { kind: "unavailable", reason: "not-ready" };
      throw e;
    }
    if (!record) throw new Error("고민 기록을 만들지 못했습니다.");
    // 동시에 눌러 다른 요청이 먼저 만들고 결제까지 끝냈다면 그 발급을 보여 준다
    const latest = await repo.listOrdersForAssessment(assessment.id);
    const paid = ordersOfRecord(latest, record.id).find((o) => o.status === "paid");
    if (paid) return { kind: "already-issued", order: paid, record };
  }

  // 2) 결제 주문 — 같은 기록의 대기 주문은 하나. 방금 만든 주문이면 그대로 쓰고(더블 클릭), 오래된 것은 새 주문으로 대체한다
  const productId = concernProductId(record.id);
  const nowMs = deps.now().getTime();
  const pending = orders.filter((o) => o.productId === productId && o.status === "pending");
  const fresh = pending.find((o) => nowMs - new Date(o.createdAt).getTime() < REUSE_PENDING_MS);
  if (fresh) return { kind: "order", order: fresh, record };
  for (const old of pending) {
    const canceled = await repo.updateOrder(old.id, ["pending"], { status: "canceled", failureCode: "SUPERSEDED", failureMessage: "새 결제 요청으로 대체됨" });
    if (canceled) await repo.addPaymentEvent({ orderId: old.id, source: "checkout", status: "SUPERSEDED", detail: {} });
  }
  const makeNumber = deps.newOrderNumber ?? ((n: Date) => createOrderNumber(n));
  const inserted = await repo.insertOrder({
    orderNumber: makeNumber(deps.now()),
    userId: input.userId,
    assessmentId: assessment.id,
    productId,
    amount: CONCERN_REPORT.priceKrw,
    paymentEnv: input.paymentEnv ?? "test",
    acquisition: input.acquisition ?? null,
  });
  if (inserted.ok) return { kind: "order", order: inserted.value, record };

  // 동시에 두 번 눌러 다른 요청이 먼저 만든 경우: 그 주문을 쓴다
  const latest = (await repo.listOrdersForAssessment(assessment.id)).filter((o) => o.productId === productId);
  const paid = latest.find((o) => o.status === "paid");
  if (paid) return { kind: "already-issued", order: paid, record };
  const waiting = latest.find((o) => o.status === "pending");
  if (!waiting) throw new Error("주문을 만들지 못했습니다.");
  return { kind: "order", order: waiting, record };
}

// ── 기록 한 건 보기 (고민 기록 + 그 기록의 리포트)

export type ConcernRecordView = {
  assessment: AssessmentRecord;
  record: ConcernRecord;
  /** 결제를 마친 주문 (결제 전 · 환불이면 null) */
  paidOrder: OrderRecord | null;
  refunded: boolean;
  report: ReportRecord | null;
};

/** 본인 기록이 아니거나 이 검사 결과의 기록이 아니면 null */
export async function getConcernRecordView(repo: MiyuRepository, input: { userId: string; assessmentId: string; recordId: string }): Promise<ConcernRecordView | null> {
  const assessment = await ownedAssessment(repo, input.userId, input.assessmentId);
  if (!assessment) return null;
  const record = await repo.getConcernRecord(input.recordId);
  if (!record || record.userId !== input.userId || record.assessmentId !== assessment.id) return null;
  const orders = ordersOfRecord(await repo.listOrdersForAssessment(assessment.id), record.id);
  const paidOrder = orders.find((o) => o.status === "paid") ?? null;
  const refunded = !paidOrder && orders.some((o) => o.status === "refunded");
  const report = paidOrder ? await repo.getReportByOrder(paidOrder.id) : null;
  return { assessment, record, paidOrder, refunded, report };
}

export type ScrubResult = { kind: "scrubbed" } | { kind: "not-found" } | { kind: "report-not-finished" };

/**
 * 고객이 고민 기록의 내용을 지운다 (기록 자리 · 주제 · 작성 시점 · 이미 발급한 리포트는 남는다).
 * 리포트를 만드는 중이거나 만들기에 실패해 다시 시도해야 하는 동안에는 지우지 않는다 (재시도에 이 내용이 필요하다).
 */
export async function scrubRecordContent(repo: MiyuRepository, input: { userId: string; assessmentId: string; recordId: string; now: () => Date }): Promise<ScrubResult> {
  const view = await getConcernRecordView(repo, input);
  if (!view) return { kind: "not-found" };
  if (view.paidOrder && view.report?.status !== "ready") return { kind: "report-not-finished" };
  await repo.scrubConcernRecord(view.record.id, input.now().toISOString());
  return { kind: "scrubbed" };
}

/**
 * 지금의 고민을 고치거나 지웠을 때: 결제 없이 남은 임시 저장본(발급하지 않은 기록)의 내용을 지운다.
 * 결제 대기 · 결제 완료 · 환불된 주문이 있는 기록은 그대로 둔다 (대기 중인 결제는 그 순간의 고민을 기준으로 이어질 수 있다).
 */
export async function discardUnissuedRecords(repo: MiyuRepository, input: { assessmentId: string; now: () => Date }): Promise<number> {
  const [records, orders] = await Promise.all([repo.listConcernRecords(input.assessmentId), repo.listOrdersForAssessment(input.assessmentId)]);
  let n = 0;
  for (const r of records) {
    if (r.scrubbedAt) continue;
    const mine = ordersOfRecord(orders, r.id);
    if (mine.some((o) => o.status === "paid" || o.status === "pending" || o.status === "refunded")) continue;
    await repo.scrubConcernRecord(r.id, input.now().toISOString());
    n++;
  }
  return n;
}
