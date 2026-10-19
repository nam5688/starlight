// MY 화면 자료 — 리포트별 이용 권한 · 생성 상태와 결제내역을 따로 보여준다.
// 결제 상태(orders)와 리포트 생성 상태(reports)는 섞지 않는다: 결제했지만 생성에 실패한 고객에게 다시 구매하라고 하지 않는다.

import { packRemaining } from "../commerce/cash.ts";
import type { OrderStatus } from "../commerce/order.ts";
import { isCompatProduct, isPersonalProduct, parseCashProductId, parseConcernProductId, parsePairProductId, parsePersonalSeq, PERSONAL_REPORT, productNameOf, REPORT_TIER_NAMES } from "../config/product.ts";
import type { DataSource } from "../report/types.ts";
import { formatAssessmentBirth } from "./assessment-service.ts";
import type { MiyuRepository, OrderRecord, PaymentEnv, PaymentEventRecord, ReportRecord, TranscriptInput } from "./ports.ts";
import { paidPersonalOrders, receivedAt } from "./purchases.ts";
import { RECONCILE_DEFAULTS } from "./reconcile-service.ts";
import { topicLabel, type ContextTopic } from "../personalization/context.ts";
import { sanitizeRoomActions, type RoomAction } from "../report/reading/talk-room.ts";
import type { TranscriptLine } from "../report/reading/talk-transcript.ts";

export type Entitlement = "free" | "purchased" | "refunded";
export type Generation = "none" | "in-progress" | "ready" | "failed";

/** 같은 결과로 받은 리포트 한 건 — 받은 리포트는 모두 기록으로 남고 다시 열어 볼 수 있다 */
export type MyReceivedReport = {
  orderNumber: string;
  /** 몇 번째로 받았는지 (1 = 첫 구매) */
  seq: number;
  /** 받은 날 (결제 승인 시각) */
  receivedAt: string;
  generation: Generation;
  /** 이 리포트를 만든 생성기 (예: dev-rules dev-0.1) — 완성된 뒤에만 */
  generatorLabel: string | null;
  /** 열 때 쓰는 주소 */
  href: string;
};

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
  /** 이 결과로 받은 리포트 전부 — 최근에 받은 것부터 (받은 것이 없으면 빈 목록) */
  received: MyReceivedReport[];
  source: DataSource;
  /** 내 고민 자세히 알려주기에 적은 주제 (적지 않았으면 null) */
  contextTopic: ContextTopic | null;
};

/** 내 고민 반영 리포트 한 건 — 발급일 · 고민 주제로 이전 리포트와 새 리포트를 구분해 보여 준다 */
export type MyConcernCard = {
  recordId: string;
  assessmentId: string;
  subject: string;
  topic: ContextTopic;
  topicLabel: string;
  /** 반영한 고민을 쓴 시점 */
  writtenAt: string;
  /** 발급일 (결제 승인 시각) */
  issuedAt: string;
  entitlement: "purchased" | "refunded";
  generation: Generation;
  orderNumber: string;
  /** 고객이 고민 기록의 내용을 지움 (리포트는 남아 있다) */
  contentScrubbed: boolean;
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

export const productName = productNameOf;

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

/** 받은 리포트 한 건을 화면 줄로 — MY와 결과 화면이 같이 쓴다 */
export function receivedRowOf(
  order: OrderRecord,
  report: Pick<ReportRecord, "status" | "generator" | "generatorVersion"> | null | undefined,
  assessmentId: string,
): MyReceivedReport {
  const generation = generationOf(report);
  return {
    orderNumber: order.orderNumber,
    seq: parsePersonalSeq(order.productId) ?? 1,
    receivedAt: receivedAt(order),
    generation,
    generatorLabel: generation === "ready" && report?.generator ? `${report.generator}${report.generatorVersion ? ` ${report.generatorVersion}` : ""}` : null,
    href: `/results/${assessmentId}?r=${encodeURIComponent(order.orderNumber)}`,
  };
}

/** 삭제한 기록 — 리포트 · 맛보기 글은 지웠지만 대화는 이어지는 검사 결과(채팅방은 이 번호로 계속 열린다) */
export type MyDeletedRecord = {
  assessmentId: string;
  /** 분석 대상 (예: 지민 님 · 1995년 4월 12일 (양력)) — 본인 MY에서 어느 기록인지 알아보게 한다 */
  subject: string;
  /** 삭제한 시각 */
  deletedAt: string;
  /** 이 기록에 저장된 대화방 수 */
  chatRooms: number;
};

/**
 * MY 화면 자료. `cards`는 "내 리포트" 목록에 보이는 삭제하지 않은 결과, `deletedRecords`는 회원이 "기록 삭제"한 결과다.
 * 삭제한 결과의 리포트 · 맛보기 글은 지워졌고 결과 화면 · 구매 안내에도 다시 나오지 않지만, 채팅방 · 질문권 · 주문 · 결제 기록은 그대로다.
 * `deleteAvailable`이 false이면 삭제 열이 아직 없는 DB(28번 전)이므로 화면이 삭제 버튼을 보이지 않는다.
 */
export type MyPage = { cards: MyReportCard[]; deletedRecords: MyDeletedRecord[]; deleteAvailable: boolean; concerns: MyConcernCard[]; orders: MyOrderRow[] };

export async function getMyPage(repo: MiyuRepository, userId: string, now: Date = new Date()): Promise<MyPage> {
  const [assessments, orders, reports, contexts, records] = await Promise.all([
    repo.listAssessments(userId),
    repo.listOrdersForUser(userId),
    repo.listReportStatuses(userId),
    repo.listContexts(userId),
    repo.listConcernRecordSummaries(userId),
  ]);
  const mineOrders = orders.filter((o) => o.userId === userId);
  const mine = assessments.filter((a) => a.userId === userId);

  const cards = mine
    .filter((a) => !a.recordDeletedAt)
    .map((a): MyReportCard => {
      const related = mineOrders.filter((o) => o.assessmentId === a.id && isPersonalProduct(o.productId));
      const receivedOrders = paidPersonalOrders(related);
      const received = receivedOrders.map((o) => receivedRowOf(o, reports.find((x) => x.orderId === o.id), a.id));
      // 카드의 상태는 가장 최근에 완성된 리포트를 기준으로 한다 (새로 받는 리포트를 만드는 중이어도 이미 받은 리포트는 열 수 있다)
      const current = received.find((x) => x.generation === "ready") ?? received[0];
      const paid = current ? receivedOrders.find((o) => o.orderNumber === current.orderNumber) : undefined;
      const entitlement: Entitlement = paid ? "purchased" : related.some((o) => o.status === "refunded") ? "refunded" : "free";
      return {
        assessmentId: a.id,
        // 결제하지 않은 무료 결과는 무료 리포트, 구매 · 환불된 건은 심층 리포트 (이름은 REPORT_TIER_NAMES · PERSONAL_REPORT 한 곳)
        productName: entitlement === "free" ? REPORT_TIER_NAMES.simple : PERSONAL_REPORT.name,
        subject: `${a.nickname} 님 · ${formatAssessmentBirth(a)}`,
        createdAt: a.createdAt,
        period: null,
        entitlement,
        generation: current ? current.generation : "none",
        paidOrderNumber: paid?.orderNumber ?? null,
        received,
        source: a.source,
        contextTopic: contexts.find((c) => c.assessmentId === a.id)?.topic ?? null,
      };
    });

  // 고민 반영 리포트 — 결제 완료 · 환불된 기록만 (결제 전 임시 저장본은 보이지 않는다)
  const subjectOf = new Map(assessments.map((a) => [a.id, `${a.nickname} 님 · ${formatAssessmentBirth(a)}`]));
  const concerns: MyConcernCard[] = [];
  for (const r of records) {
    const mine = mineOrders.filter((o) => parseConcernProductId(o.productId) === r.id);
    const paid = mine.find((o) => o.status === "paid");
    const order = paid ?? mine.find((o) => o.status === "refunded");
    if (!order) continue;
    concerns.push({
      recordId: r.id,
      assessmentId: r.assessmentId,
      subject: subjectOf.get(r.assessmentId) ?? "",
      topic: r.topic,
      topicLabel: topicLabel(r.topic),
      writtenAt: r.writtenAt,
      issuedAt: order.approvedAt ?? order.createdAt,
      entitlement: paid ? "purchased" : "refunded",
      generation: paid ? generationOf(reports.find((x) => x.orderId === paid.id)) : "none",
      orderNumber: order.orderNumber,
      contentScrubbed: r.scrubbedAt !== null,
    });
  }
  concerns.sort((x, y) => y.issuedAt.localeCompare(x.issuedAt));

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

  // 삭제한 기록 — 채팅방이 몇 개 남아 있는지 센다(이어 가는 중인 방 + 읽기용 대화 기록이 있는 방. 읽지 못하면 0으로 보고 화면은 그대로 열린다)
  // 삭제 범위 확대(29번)로 삭제를 마친 기록은 채팅방 · 대화까지 지웠으므로 이 목록에 없다(열 것이 남아 있지 않다 — 주문 · 결제 기록은 아래 결제내역에 그대로 있다)
  const deletedRecords: MyDeletedRecord[] = [];
  for (const a of mine.filter((x) => x.recordDeletedAt && !x.recordPurgedAt)) {
    const live = await repo.listTalkRoomKeys(a.id).catch(() => [] as string[]);
    const archived = (await repo.listTalkTranscripts(a.id).catch(() => [])).map((t) => t.roomKey);
    deletedRecords.push({ assessmentId: a.id, subject: `${a.nickname} 님 · ${formatAssessmentBirth(a)}`, deletedAt: a.recordDeletedAt as string, chatRooms: new Set([...live, ...archived]).size });
  }
  deletedRecords.sort((x, y) => y.deletedAt.localeCompare(x.deletedAt));

  return { cards, deletedRecords, deleteAvailable: mine.some((a) => a.recordDeletedAt !== undefined), concerns, orders: rows };
}

export type DeleteRecordResult =
  /** deleted-all: 삭제 범위 확대(29번) — 리포트 · 맛보기 · 고민에 더해 채팅방 · 대화 · 요약도 지웠다. deleted: 예전 범위(28번) — 채팅방은 읽기용 기록으로 남는다 */
  | { kind: "deleted" | "deleted-all" | "unchanged" | "busy" }
  /** 대화를 읽기용 기록으로 옮기지 못해 삭제하지 않았다(아무것도 지우지 않음) */
  | { kind: "transcript-failed" }
  /** 없거나 본인 것이 아님 — 둘을 구분해 알리지 않는다 */
  | { kind: "not-found" }
  /** 삭제 열 · 함수가 아직 없는 DB(28번 전) */
  | { kind: "db-not-ready" };

/** 삭제 결과를 MY 화면 맨 위에 알리는 말 — 주소의 notice 값이 이 목록에 있을 때만 쓴다(없는 값은 보이지 않는다) */
export const DELETE_NOTICE: Record<DeleteRecordResult["kind"], { tone: "ok" | "warn"; text: string }> = {
  deleted: { tone: "ok", text: "기록을 삭제했어요. 리포트 글은 지워졌고, 채팅방 · 남은 질문권 · 주문 기록은 그대로예요." },
  "deleted-all": { tone: "ok", text: "기록을 삭제했어요. 리포트 글과 이 기록의 채팅방 · 지난 대화 · 저장한 요약은 지워졌고, 남은 질문권 · 주문 · 결제 기록은 그대로예요." },
  unchanged: { tone: "ok", text: "이미 삭제한 기록이에요. 바뀐 것은 없어요." },
  busy: { tone: "warn", text: "지금 리포트를 만들거나 결제 · 질문을 처리하고 있어서 삭제하지 않았어요. 잠시 뒤에 다시 눌러 주세요." },
  "transcript-failed": { tone: "warn", text: "지난 대화를 읽기용 기록으로 옮기지 못해서 삭제하지 않았어요. 아무것도 지우지 않았으니 잠시 뒤에 다시 눌러 주세요." },
  "not-found": { tone: "warn", text: "삭제할 기록을 찾지 못했어요." },
  "db-not-ready": { tone: "warn", text: "기록 삭제를 아직 쓸 수 없어요. 아무것도 지우지 않았어요." },
};

/** 주소에서 읽은 notice 값 → 안내 (모르는 값은 null) */
export const deleteNoticeOf = (v: unknown) => (typeof v === "string" && Object.hasOwn(DELETE_NOTICE, v) ? DELETE_NOTICE[v as DeleteRecordResult["kind"]] : null);

/** 대화방 하나를 "화면에 이미 표시된 말"로 옮긴다 — 서버가 저장된 리포트로 기존 렌더러를 돌려 만든다(AI를 부르지 않는다). 옮기지 못하면 던진다 */
export type RenderRoom = (input: { roomKey: string; actions: RoomAction[] }) => Promise<TranscriptLine[]>;

/** 동시 대화로 방이 바뀌어 다시 읽어야 할 때 다시 시도하는 횟수 */
const DELETE_RETRIES = 3;

/**
 * 본인 검사 결과의 리포트 기록을 삭제한다(되돌릴 수 없다). 리포트 본문 · 맛보기 글 · 고민 입력은 지우고, 계정 · 주문 · 결제 · 환불 기록 · 질문권 · 채팅 질문 횟수 · 분석 원자료는 남긴다.
 * 대화는 삭제 전에 화면에 이미 표시된 말만 읽기용 대화 기록으로 옮겨 남긴다(renderRoom) — 리포트 전체 본문이 아니고 새로 쓴 글도 없다. 옮기지 못하면 아무것도 지우지 않는다.
 * 소유자는 여기서 확인하고, 저장소(DB 함수)가 회원번호와 번호의 짝을 한 번 더 확인한다. 같은 요청을 여러 번(동시에도) 보내도 한 번만 지운다.
 * 진행 중인 리포트 생성 · 결제 대기 주문 · 방금 오간 질문이 있으면 지우지 않고 busy, 읽은 뒤 대화방이 바뀌었으면(동시 대화) 다시 읽어 옮긴 뒤 시도한다.
 */
export async function deleteReportRecord(repo: MiyuRepository, input: { userId: string; assessmentId: string }, deps: { renderRoom: RenderRoom }): Promise<DeleteRecordResult> {
  const assessment = await repo.getAssessment(input.assessmentId);
  if (!assessment || assessment.userId !== input.userId) return { kind: "not-found" };
  if (assessment.recordDeletedAt) return { kind: "unchanged" };
  // 삭제 범위 확대(DB 29번): 함수가 있으면 대화까지 한 번에 지운다 — 읽기용 대화 기록으로 옮기는 단계가 없으므로 renderRoom은 쓰지 않는다. 없는 DB에서는 아래 예전 범위(28번)로 이어 간다
  if (await repo.purgeAvailable().catch(() => false)) {
    try {
      const result = await repo.purgeAssessmentRecord(input.userId, input.assessmentId);
      return result === "deleted" ? { kind: "deleted-all" } : result === "not-found" ? { kind: "not-found" } : { kind: result };
    } catch (e) {
      // 확인과 호출 사이에 함수가 사라졌거나(29번 되돌림) 열이 없는 경우만 예전 범위로 — 그 밖의 오류는 아무것도 지우지 않은 채 그대로 알린다
      if ((e as { code?: string } | null)?.code !== "PURGE_UNAVAILABLE") throw e;
    }
  }
  try {
    for (let attempt = 0; attempt < DELETE_RETRIES; attempt++) {
      const transcripts: TranscriptInput[] = [];
      for (const roomKey of await repo.listTalkRoomKeys(input.assessmentId)) {
        const row = await repo.getTalkRoom(input.assessmentId, roomKey);
        if (!row || row.userId !== input.userId) continue;
        let lines: TranscriptLine[];
        try {
          lines = await deps.renderRoom({ roomKey, actions: sanitizeRoomActions(row.actions) });
        } catch {
          return { kind: "transcript-failed" };
        }
        transcripts.push({ roomKey, updatedAt: row.updatedAt, lines });
      }
      const result = await repo.deleteAssessmentRecord(input.userId, input.assessmentId, transcripts);
      if (result === "stale") continue;
      return result === "not-found" ? { kind: "not-found" } : { kind: result };
    }
    return { kind: "busy" };
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "42P01") return { kind: "db-not-ready" };
    throw e;
  }
}

export type OrderTrace = {
  order: MyOrderRow & { method: string | null; failureMessage: string | null };
  /** 결제 승인 후에만 리포트 열람 권한이 생긴다 (유료 질문 주문은 리포트가 아니라 cash를 본다) */
  entitled: boolean;
  /** 유료 질문(또는 예전 충전) 주문이면 — 주문에 적힌 단위와 장부에 실제로 들어간 · 회수된 양 (서버가 결제 승인을 확인한 뒤에만 들어간다) */
  cash: {
    cash: number;
    bonus: number;
    credited: number;
    clawedBack: number;
    shortfall: number;
    /** 묶음(주문)별 장부 — DB 16번 이후에 결제된 질문 묶음만. 사용 · 환불 수량과 누적 환불액 (부분 환불을 반영한 값) */
    pack: { questions: number; used: number; refundedQuestions: number; refundedKrw: number; remaining: number } | null;
  } | null;
  generation: Generation;
  /** 이 주문의 개인 · 고민 리포트가 속한 기록을 사용자가 직접 삭제했다 — 결제 기록은 그대로이고 리포트는 다시 열리지 않는다 */
  recordDeleted: boolean;
  /** 사주 궁합(유료) 주문이면 true — 리포트는 개인 통합 결과 화면이 아니라 궁합 리포트 화면에서 연다 */
  isCompat: boolean;
  /** 리포트 궁합(유료) 주문이면 그 쌍 번호 — 리포트는 쌍 화면에서 연다 */
  pairId: string | null;
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
  PARTIAL_REFUND_APPLIED: "부분 환불을 질문 묶음에 반영함 (남은 질문 회수)",
  PARTIAL_REFUND_MISMATCH: "취소 금액이 질문 개수에 맞지 않아 질문을 회수하지 않음 (운영자 확인)",
  PARTIAL_REFUND_INVALID: "취소 금액이 결제액 범위를 벗어나 반영하지 않음 (운영자 확인)",
  PARTIAL_REFUND_NO_PACK: "묶음 장부가 없는 예전 주문이라 부분 환불을 반영하지 못함 (운영자 확인)",
  PARTIAL_REFUND_NEEDS_DB16: "DB 변경 16번 전이라 부분 환불을 반영하지 못함 (운영자 확인)",
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
  const ownsReport = isPersonalProduct(order.productId) || parseConcernProductId(order.productId) !== null;
  const recordDeleted = ownsReport ? Boolean((await readRepo.getAssessment(order.assessmentId))?.recordDeletedAt) : false;
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
    cash: await cashTraceOf(readRepo, input.userId, order),
    generation: order.status === "paid" && !recordDeleted ? generationOf(report) : "none",
    recordDeleted,
    isCompat: isCompatProduct(order.productId),
    pairId: parsePairProductId(order.productId),
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

async function cashTraceOf(repo: MiyuRepository, userId: string, order: OrderRecord): Promise<OrderTrace["cash"]> {
  const parsed = parseCashProductId(order.productId);
  if (!parsed) return null;
  let rows: Awaited<ReturnType<MiyuRepository["listCashLedger"]>> = [];
  try {
    rows = (await repo.listCashLedger(userId, 200)).filter((r) => r.orderId === order.id);
  } catch {
    // 13번 DB 변경 전에는 지갑 내역이 없다
  }
  const credited = rows.filter((r) => r.kind === "charge" || r.kind === "bonus").reduce((n, r) => n + r.amount, 0);
  // 전액 취소(예전 방식 clawback) · 묶음별 환불(refund_claw)을 함께 센다
  const clawback = rows.filter((r) => r.kind === "clawback" || r.kind === "refund_claw");
  let pack: NonNullable<OrderTrace["cash"]>["pack"] = null;
  try {
    const p = await repo.getQuestionPack(order.id);
    if (p) pack = { questions: p.questions, used: p.used, refundedQuestions: p.refundedQuestions, refundedKrw: p.refundedKrw, remaining: packRemaining(p) };
  } catch {
    // 16번 DB 변경 전에는 묶음 장부가 없다
  }
  return { cash: parsed.cash, bonus: parsed.bonus, credited, clawedBack: -clawback.reduce((n, r) => n + r.amount, 0), shortfall: clawback.reduce((n, r) => n + r.shortfall, 0), pack };
}
