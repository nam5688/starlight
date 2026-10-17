// 리포트 궁합(유료 2) — 초대 · 동의 · 연결 · 결제 · 만들 때 쓸 두 사람 · 열람 권한 · 해제 · 철회.
//
// 흐름: A가 내 검사 결과로 초대 링크를 만들고(A의 동의) → B가 링크로 들어와 자기 검사 결과를 골라 동의하면 연결 → 둘 중 한 사람이 한 번 결제 → 만들어지면 두 사람이 모두 같은 글을 읽는다.
// 원칙(운영자 확정 2026-10-17, docs/report-compat-v1.md):
// - 두 사람 모두 각자 분석을 끝냈고(검사 결과가 있고 사주가 계산돼 있다) 각자 직접 동의해야 연결된다. 개인 리포트 전체 · 문항별 답 · 비공개 상담 · 생년월일은 상대에게 보이지 않는다.
// - 결제는 쌍마다 한 번이다(상품 번호 `report-compat:<쌍 번호>`, DB 고유 조건). 주문은 결제한 사람의 검사 결과에 묶이고, 결제 상태와 생성 상태는 따로 본다.
// - **연결 해제**는 새로 만들지 않을 뿐 완성된 글의 열람은 두 사람 모두 그대로다. **동의 철회**는 그 사람의 자료를 새 생성에 더 쓰지 않고 철회한 사람의 열람을 끝낸다(상대는 유지 — 법률 검토 항목).
//   **환불**되면 두 사람 모두 열람이 막힌다. **탈퇴**는 그 사람의 쌍을 끊고 철회로 기록한다(결제자가 탈퇴하면 그 사람의 리포트 행이 지워져 상대도 읽을 수 없게 된다 — 법률 검토 항목).
// - 저장되는 글에는 이름 · 생년월일 · 응답 원문 · 점수가 없다. 화면이 읽는 사람에게 "A님 = 나 / B님 = 상대"를 알려 준다.
// - 판매 스위치(PAIR_COMPAT.saleOpen)와 AI 연결이 맞아야 새 초대 · 연결 · 결제가 시작된다. 이미 만들어진 쌍의 열람 · 해제 · 철회는 스위치와 관계없이 된다.

import { PAIR_COMPAT, isPairProduct, pairProductId, parsePairProductId } from "../config/product.ts";
import { createOrderNumber } from "../commerce/order.ts";
import { createInviteToken, isInviteToken } from "../commerce/invite.ts";
import { PAIR_CONSENT } from "../report/compat/pair-consent.ts";
import { isPairReport, type PairReport } from "../report/compat/types.ts";
import type { PairInput, PairPerson } from "../report/generator.ts";
import type { SajuOk } from "../saju/engine.ts";
import { gateOpen, type SaleGateCheck } from "./order-service.ts";
import type { GateReason } from "./capacity-service.ts";
import type { PairRecord, PairRepository } from "./pair-ports.ts";
import type { Acquisition, AssessmentRecord, MiyuRepository, OrderRecord, PaymentEnv } from "./ports.ts";

export { PAIR_CONSENT };

export type PairDeps = {
  repo: MiyuRepository;
  pairs: PairRepository;
  now: () => Date;
  newId?: () => string;
  newToken?: () => string;
  newOrderNumber?: (now: Date) => string;
  /** 새 초대 · 연결 · 결제를 받는 중인가(판매 스위치 + 시험용 덮어쓰기) — 기본은 PAIR_COMPAT.saleOpen */
  saleOpen?: boolean;
  /** 이 환경의 생성기가 리포트 궁합을 쓸 수 있는가(AI 연결) */
  generatorReady?: boolean;
  gate?: SaleGateCheck;
};

const isOpen = (d: PairDeps) => d.saleOpen ?? PAIR_COMPAT.saleOpen;
const DAY = 86_400_000;
const PENDING_BUSY_MS = 30 * 60_000;
/** 한 사람이 동시에 열어 둘 수 있는 초대(상대가 아직 들어오지 않은 쌍) 수 */
export const PAIR_MAX_OPEN_INVITES = 5;

/** 이 검사 결과로 궁합을 만들 수 있는가 — 사주가 계산돼 있고 탈퇴로 비워지지 않았다 */
const usable = (a: AssessmentRecord | null | undefined): a is AssessmentRecord => !!a && a.contentVersion !== "withdrawn" && (a.saju as { status?: string })?.status === "ok" && !!a.summary;

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";

export type CreateInviteResult =
  | { kind: "created"; pair: PairRecord }
  | { kind: "not-open" }
  | { kind: "ai-not-connected" }
  | { kind: "not-found" }
  | { kind: "no-consent" }
  | { kind: "no-saju" }
  | { kind: "too-many" }
  | { kind: "db-not-ready" };

/** A가 내 검사 결과로 초대 링크를 만든다 — A의 동의(체크)가 있어야 한다 */
export async function createPairInvite(deps: PairDeps, input: { userId: string; assessmentId: string; consent: boolean }): Promise<CreateInviteResult> {
  if (!isOpen(deps)) return { kind: "not-open" };
  if (deps.generatorReady === false) return { kind: "ai-not-connected" };
  const assessment = await deps.repo.getAssessment(input.assessmentId);
  if (!assessment || assessment.userId !== input.userId) return { kind: "not-found" };
  if (!usable(assessment)) return { kind: "no-saju" };
  if (input.consent !== true) return { kind: "no-consent" };
  try {
    const mine = await deps.pairs.listPairsForUser(input.userId);
    const open = mine.filter((p) => p.aUserId === input.userId && p.status === "invited" && new Date(p.expiresAt).getTime() > deps.now().getTime());
    if (open.length >= PAIR_MAX_OPEN_INVITES) return { kind: "too-many" };
    const now = deps.now();
    for (let i = 0; i < 3; i++) {
      const r = await deps.pairs.createPair({
        id: (deps.newId ?? (() => globalThis.crypto.randomUUID()))(),
        token: (deps.newToken ?? (() => createInviteToken()))(),
        aUserId: input.userId,
        aAssessmentId: assessment.id,
        aConsentAt: now.toISOString(),
        aConsentVersion: PAIR_COMPAT.consentVersion,
        expiresAt: new Date(now.getTime() + PAIR_COMPAT.inviteDays * DAY).toISOString(),
      });
      if (r.ok) return { kind: "created", pair: r.value };
    }
    return { kind: "db-not-ready" };
  } catch (e) {
    if (isMissingTable(e)) return { kind: "db-not-ready" };
    throw e;
  }
}

export type InvitePeek =
  | { kind: "open"; inviterNickname: string; expiresAt: string; myAssessment: { id: string; nickname: string } | null }
  | { kind: "mine"; pairId: string }
  | { kind: "joined"; pairId: string }
  | { kind: "taken" | "expired" | "closed" | "not-found" | "not-open" | "db-not-ready" };

/** 링크를 연 사람(B)에게 보일 상태 — 초대한 사람의 닉네임 말고는 아무것도 알려 주지 않는다 */
export async function peekPairInvite(deps: PairDeps, input: { token: string; userId: string }): Promise<InvitePeek> {
  if (!isInviteToken(input.token)) return { kind: "not-found" };
  try {
    const pair = await deps.pairs.getPairByToken(input.token);
    if (!pair) return { kind: "not-found" };
    if (pair.aUserId === input.userId) return { kind: "mine", pairId: pair.id };
    if (pair.bUserId === input.userId) return { kind: "joined", pairId: pair.id };
    if (pair.bUserId) return { kind: "taken" };
    if (pair.status === "unlinked" || pair.aWithdrawnAt) return { kind: "closed" };
    if (new Date(pair.expiresAt).getTime() <= deps.now().getTime()) return { kind: "expired" };
    if (!isOpen(deps)) return { kind: "not-open" };
    const a = await deps.repo.getAssessment(pair.aAssessmentId);
    const mine = await latestUsableAssessment(deps.repo, input.userId);
    return { kind: "open", inviterNickname: a && usable(a) ? a.nickname : "상대", expiresAt: pair.expiresAt, myAssessment: mine ? { id: mine.id, nickname: mine.nickname } : null };
  } catch (e) {
    if (isMissingTable(e)) return { kind: "db-not-ready" };
    throw e;
  }
}

/** 가장 최근에 받은 사용 가능한 검사 결과 — 상대가 따로 고르지 않으면 이것으로 연결한다 */
export async function latestUsableAssessment(repo: MiyuRepository, userId: string): Promise<AssessmentRecord | null> {
  const all = await repo.listAssessments(userId);
  return all.filter((a) => a.userId === userId && usable(a)).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))[0] ?? null;
}

export type JoinResult =
  | { kind: "joined"; pair: PairRecord }
  | { kind: "not-open" }
  | { kind: "no-consent" }
  | { kind: "no-assessment" }
  | { kind: "self" | "taken" | "expired" | "closed" | "not-found" | "bad-assessment" | "db-not-ready" };

/** B가 링크로 들어와 동의하고 연결한다 — B의 동의(체크)가 있어야 하고 B의 검사 결과(사주가 계산된 것)가 있어야 한다 */
export async function joinPairInvite(deps: PairDeps, input: { token: string; userId: string; consent: boolean; assessmentId?: string | null }): Promise<JoinResult> {
  if (!isOpen(deps)) return { kind: "not-open" };
  if (!isInviteToken(input.token)) return { kind: "not-found" };
  if (input.consent !== true) return { kind: "no-consent" };
  const mine = input.assessmentId ? await deps.repo.getAssessment(input.assessmentId) : await latestUsableAssessment(deps.repo, input.userId);
  if (!mine) return { kind: "no-assessment" };
  if (mine.userId !== input.userId || !usable(mine)) return { kind: "bad-assessment" };
  try {
    const r = await deps.pairs.joinPair({ token: input.token, userId: input.userId, assessmentId: mine.id, consentVersion: PAIR_COMPAT.consentVersion });
    return r.ok ? { kind: "joined", pair: r.pair } : { kind: r.reason };
  } catch (e) {
    if (isMissingTable(e)) return { kind: "db-not-ready" };
    throw e;
  }
}

/** 이 쌍의 결제 주문들 — 주문은 결제한 사람의 검사 결과 번호에 묶여 있으므로 두 사람의 검사 결과에서 모두 찾는다 */
async function pairOrders(repo: MiyuRepository, pair: PairRecord): Promise<OrderRecord[]> {
  const ids = [pair.aAssessmentId, pair.bAssessmentId].filter((x): x is string => !!x);
  const productId = pairProductId(pair.id);
  const lists = await Promise.all(ids.map((id) => repo.listOrdersForAssessment(id)));
  return lists.flat().filter((o) => o.productId === productId);
}

/** 이 쌍의 결제 완료 주문 — 쌍의 구성원에게만(만들기를 이어받거나 다시 만들 때 쓴다). 구성원이 아니거나 결제 전이면 null */
export async function paidPairOrder(deps: PairDeps, input: { pairId: string; userId: string }): Promise<OrderRecord | null> {
  try {
    const pair = await deps.pairs.getPair(input.pairId);
    if (!pair || (pair.aUserId !== input.userId && pair.bUserId !== input.userId)) return null;
    return (await pairOrders(deps.repo, pair)).find((o) => o.status === "paid") ?? null;
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}

export type PairRole = "a" | "b";
const roleOf = (pair: PairRecord, userId: string): PairRole | null => (pair.aUserId === userId ? "a" : pair.bUserId === userId ? "b" : null);

export type PairPurchase =
  | { state: "none" }
  /** 내가 결제를 시작해 결제창으로 가는 중(이어서 결제할 수 있다) */
  | { state: "mine-pending"; orderNumber: string }
  /** 상대가 결제를 진행 중 — 잠시 기다린다 */
  | { state: "other-pending" }
  | { state: "paid"; buyer: "me" | "other"; orderNumber: string | null }
  | { state: "refunded" };

export type PairReportState =
  | { state: "none" }
  | { state: "generating" }
  | { state: "failed" }
  /** 읽을 수 있다 */
  | { state: "ready"; report: PairReport }
  /** 읽을 수 없다 — 동의를 철회했거나(withdrawn) 환불됐다(refunded), 결제는 됐는데 글이 만들어지기 전에 연결이 끊겨 더 만들 수 없다(unfinished — 운영자가 환불 여부를 확인한다) */
  | { state: "blocked"; why: "withdrawn" | "refunded" | "unfinished" };

export type PairView = {
  kind: "ok";
  pairId: string;
  role: PairRole;
  /** 풀이 본문의 "A님"이 읽는 사람 본인인가 */
  youAre: "A님" | "B님";
  status: PairRecord["status"];
  expiresAt: string;
  /** 초대 링크 토큰 — 상대가 아직 들어오지 않았을 때 초대한 사람에게만 */
  token: string | null;
  otherNickname: string | null;
  myNickname: string | null;
  consent: { meAt: string | null; otherAt: string | null; meWithdrawn: boolean; otherWithdrawn: boolean };
  purchase: PairPurchase;
  report: PairReportState;
  /** 지금 할 수 있는 것 — 화면은 이것으로 버튼을 정한다(서버 동작은 다시 확인한다) */
  can: { pay: boolean; unlink: boolean; withdraw: boolean; retry: boolean };
  priceKrw: number;
  saleOpen: boolean;
} | { kind: "not-found" } | { kind: "db-not-ready" };

/** 이 사람이 완성된 글을 읽을 수 있는가 — 쌍의 구성원이고, 주문이 결제 완료(환불 아님)이며, 이 사람이 동의를 철회하지 않았다 */
export function canReadPairReport(pair: PairRecord, userId: string, order: OrderRecord | null): "ok" | "withdrawn" | "refunded" | "no-order" | "not-member" {
  const role = roleOf(pair, userId);
  if (!role) return "not-member";
  if (!order) return "no-order";
  if (order.status === "refunded") return "refunded";
  if (order.status !== "paid") return "no-order";
  if (role === "a" ? pair.aWithdrawnAt : pair.bWithdrawnAt) return "withdrawn";
  return "ok";
}

/** 쌍 한 건의 지금 상태 — 구성원만 볼 수 있다(아니면 not-found) */
export async function getPairView(deps: PairDeps, input: { pairId: string; userId: string }): Promise<PairView> {
  let pair: PairRecord | null;
  try {
    pair = await deps.pairs.getPair(input.pairId);
  } catch (e) {
    if (isMissingTable(e)) return { kind: "db-not-ready" };
    throw e;
  }
  if (!pair) return { kind: "not-found" };
  const role = roleOf(pair, input.userId);
  if (!role) return { kind: "not-found" };
  const mine = role === "a";
  const [a, b] = await Promise.all([deps.repo.getAssessment(pair.aAssessmentId), pair.bAssessmentId ? deps.repo.getAssessment(pair.bAssessmentId) : Promise.resolve(null)]);
  const nick = (x: AssessmentRecord | null) => (x && x.contentVersion !== "withdrawn" && x.nickname ? x.nickname : null);
  const orders = await pairOrders(deps.repo, pair);
  const paid = orders.find((o) => o.status === "paid");
  const refunded = orders.find((o) => o.status === "refunded");
  const myAssessmentId = mine ? pair.aAssessmentId : pair.bAssessmentId;
  const myPending = orders.find((o) => o.status === "pending" && o.assessmentId === myAssessmentId);
  const otherPending = orders.find((o) => o.status === "pending" && o.assessmentId !== myAssessmentId && deps.now().getTime() - new Date(o.createdAt).getTime() < PENDING_BUSY_MS);
  const buyerIsMe = (paid ?? refunded)?.assessmentId === myAssessmentId;

  const purchase: PairPurchase = paid
    ? { state: "paid", buyer: buyerIsMe ? "me" : "other", orderNumber: buyerIsMe ? paid.orderNumber : null }
    : refunded
      ? { state: "refunded" }
      : myPending
        ? { state: "mine-pending", orderNumber: myPending.orderNumber }
        : otherPending
          ? { state: "other-pending" }
          : { state: "none" };

  let report: PairReportState = { state: "none" };
  const reportOrder = paid ?? refunded ?? null;
  if (reportOrder) {
    const access = canReadPairReport(pair, input.userId, reportOrder);
    const rec = await deps.repo.getReportByOrder(reportOrder.id);
    if (access === "refunded") report = { state: "blocked", why: "refunded" };
    else if (access === "withdrawn") report = { state: "blocked", why: "withdrawn" };
    else if (rec?.status === "ready" && rec.content && isPairReport(rec.content)) report = { state: "ready", report: rec.content };
    else if (rec?.status === "failed") report = { state: "failed" };
    else if (paid) report = { state: "generating" };
  }

  const linked = pair.status === "linked" && !pair.aWithdrawnAt && !pair.bWithdrawnAt;
  // 결제는 됐는데 글이 만들어지기 전에 연결이 끊겼다 — 더 만들 수 없으므로 "만드는 중"으로 두지 않고 막는다(운영자가 환불 여부를 확인한다)
  if (paid && !linked && (report.state === "generating" || report.state === "failed")) report = { state: "blocked", why: "unfinished" };
  const meWithdrawn = Boolean(mine ? pair.aWithdrawnAt : pair.bWithdrawnAt);
  const canRetry = Boolean(paid) && report.state === "failed";
  return {
    kind: "ok",
    pairId: pair.id,
    role,
    youAre: mine ? "A님" : "B님",
    status: pair.status,
    expiresAt: pair.expiresAt,
    token: mine && pair.status === "invited" ? pair.token : null,
    otherNickname: nick(mine ? b : a),
    myNickname: nick(mine ? a : b),
    consent: { meAt: mine ? pair.aConsentAt : pair.bConsentAt, otherAt: mine ? pair.bConsentAt : pair.aConsentAt, meWithdrawn, otherWithdrawn: Boolean(mine ? pair.bWithdrawnAt : pair.aWithdrawnAt) },
    purchase,
    report,
    can: {
      pay: isOpen(deps) && deps.generatorReady !== false && linked && purchase.state !== "paid" && purchase.state !== "refunded" && purchase.state !== "other-pending",
      unlink: pair.status !== "unlinked",
      withdraw: !meWithdrawn,
      retry: canRetry,
    },
    priceKrw: PAIR_COMPAT.priceKrw,
    saleOpen: isOpen(deps),
  };
}

export type StartPairCheckoutResult =
  | { kind: "order"; order: OrderRecord }
  | { kind: "not-open" }
  | { kind: "ai-not-connected" }
  | { kind: "not-found" }
  | { kind: "not-linked" }
  | { kind: "already-paid" }
  | { kind: "refunded" }
  /** 상대가 지금 결제를 진행 중 — 잠시 뒤에 다시 */
  | { kind: "busy" }
  | { kind: "sales-closed"; reason: GateReason | null }
  | { kind: "db-not-ready" };

/** 쌍의 결제 시작 — 연결된(두 사람 모두 동의를 철회하지 않은) 쌍이고 아직 결제 완료 주문이 없을 때, 내 검사 결과에 묶인 주문을 만든다 */
export async function startPairCheckout(deps: PairDeps, input: { userId: string; pairId: string; paymentEnv?: PaymentEnv; acquisition?: Acquisition | null }): Promise<StartPairCheckoutResult> {
  if (!isOpen(deps)) return { kind: "not-open" };
  if (deps.generatorReady === false) return { kind: "ai-not-connected" };
  let pair: PairRecord | null;
  try {
    pair = await deps.pairs.getPair(input.pairId);
  } catch (e) {
    if (isMissingTable(e)) return { kind: "db-not-ready" };
    throw e;
  }
  if (!pair || !roleOf(pair, input.userId)) return { kind: "not-found" };
  if (pair.status !== "linked" || pair.aWithdrawnAt || pair.bWithdrawnAt || !pair.bAssessmentId) return { kind: "not-linked" };
  const myAssessmentId = pair.aUserId === input.userId ? pair.aAssessmentId : pair.bAssessmentId;
  // 두 사람의 검사 결과를 지금도 쓸 수 있는지(탈퇴로 비워지지 않았는지) 결제 전에 확인한다
  const [a, b] = await Promise.all([deps.repo.getAssessment(pair.aAssessmentId), deps.repo.getAssessment(pair.bAssessmentId)]);
  if (!usable(a) || !usable(b)) return { kind: "not-linked" };

  const orders = await pairOrders(deps.repo, pair);
  if (orders.some((o) => o.status === "paid")) return { kind: "already-paid" };
  if (orders.some((o) => o.status === "refunded")) return { kind: "refunded" };
  if (orders.some((o) => o.status === "pending" && o.assessmentId !== myAssessmentId && deps.now().getTime() - new Date(o.createdAt).getTime() < PENDING_BUSY_MS)) return { kind: "busy" };

  const sale = await gateOpen(deps.gate, "start");
  if (!sale.open) return { kind: "sales-closed", reason: sale.reason };

  // 내가 결제하지 않고 남긴 이전 대기 주문은 취소한다(대기 주문은 하나만)
  for (const pending of orders.filter((o) => o.status === "pending" && o.assessmentId === myAssessmentId)) {
    const canceled = await deps.repo.updateOrder(pending.id, ["pending"], { status: "canceled", failureCode: "SUPERSEDED", failureMessage: "새 결제 요청으로 대체됨" });
    if (canceled) await deps.repo.addPaymentEvent({ orderId: pending.id, source: "checkout", status: "SUPERSEDED", detail: {} }).catch(() => {});
  }
  const makeNumber = deps.newOrderNumber ?? ((now: Date) => createOrderNumber(now));
  const inserted = await deps.repo.insertOrder({
    orderNumber: makeNumber(deps.now()),
    userId: input.userId,
    assessmentId: myAssessmentId,
    productId: pairProductId(pair.id),
    amount: PAIR_COMPAT.priceKrw,
    paymentEnv: input.paymentEnv ?? "test",
    acquisition: input.acquisition ?? null,
  });
  if (!inserted.ok) {
    // 동시에 두 번 눌러 이미 대기 주문이 있다 — 그 주문을 쓴다
    const again = (await pairOrders(deps.repo, pair)).find((o) => o.status === "pending" && o.assessmentId === myAssessmentId);
    return again ? { kind: "order", order: again } : { kind: "busy" };
  }
  return { kind: "order", order: inserted.value };
}

export type PairChangeOutcome =
  | { kind: "done"; /** 결제는 됐는데 글이 아직 만들어지지 않았다 — 만들 수 없게 됐으니 운영자가 환불을 확인해야 한다 */ paidNotGenerated: boolean; /** 이미 만들어진 글이 있다 */ afterReport: boolean }
  | { kind: "not-found" }
  | { kind: "db-not-ready" };

async function change(deps: PairDeps, input: { userId: string; pairId: string }, withdraw: boolean): Promise<PairChangeOutcome> {
  try {
    const before = await deps.pairs.getPair(input.pairId);
    if (!before || !roleOf(before, input.userId)) return { kind: "not-found" };
    const r = withdraw ? await deps.pairs.withdrawConsent({ pairId: input.pairId, userId: input.userId }) : await deps.pairs.unlinkPair({ pairId: input.pairId, userId: input.userId });
    if (!r.ok) return { kind: "not-found" };
    const paid = (await pairOrders(deps.repo, before)).find((o) => o.status === "paid");
    const rec = paid ? await deps.repo.getReportByOrder(paid.id) : null;
    const done = rec?.status === "ready";
    return { kind: "done", paidNotGenerated: Boolean(paid) && !done, afterReport: Boolean(paid) && done };
  } catch (e) {
    if (isMissingTable(e)) return { kind: "db-not-ready" };
    throw e;
  }
}

/** 연결 해제 — 더 이상 새로 만들지 않는다. 완성된 글은 두 사람 모두 그대로 읽는다 */
export const unlinkPair = (deps: PairDeps, input: { userId: string; pairId: string }) => change(deps, input, false);
/** 동의 철회 — 내 자료를 새 궁합 생성에 더 쓰지 않는다(연결도 끊긴다). 완성된 글은 지우지 않고 철회한 사람의 열람만 끝난다 */
export const withdrawPairConsent = (deps: PairDeps, input: { userId: string; pairId: string }) => change(deps, input, true);

function personOf(a: AssessmentRecord): PairPerson {
  return { saju: a.saju as SajuOk, summary: a.summary, knownMbti: a.knownMbti };
}

/**
 * 리포트를 만들 때 쓸 두 사람 — 쌍이 연결돼 있고 두 사람 모두 동의를 철회하지 않았고 두 사람의 검사 결과가 남아 있어야 한다. 아니면 오류(생성은 실패로 남고 운영자가 확인한다).
 * 철회 · 해제 · 탈퇴한 사람의 자료는 여기서 걸러져 새 생성에 쓰이지 않는다.
 */
export async function pairInputFor(repo: MiyuRepository, pairs: PairRepository, order: OrderRecord, reference?: PairInput["reference"]): Promise<PairInput> {
  const pairId = parsePairProductId(order.productId);
  if (!pairId) throw new Error("리포트 궁합 주문이 아닙니다.");
  const pair = await pairs.getPair(pairId);
  if (!pair) throw new Error("리포트 궁합 쌍을 찾을 수 없습니다.");
  if (order.userId !== pair.aUserId && order.userId !== pair.bUserId) throw new Error("리포트 궁합 쌍의 구성원이 아닙니다.");
  if (pair.status !== "linked" || !pair.bAssessmentId) throw new Error("연결이 끊겨 리포트 궁합을 만들 수 없습니다.");
  if (pair.aWithdrawnAt || pair.bWithdrawnAt) throw new Error("동의가 철회돼 리포트 궁합을 만들 수 없습니다.");
  const [a, b] = await Promise.all([repo.getAssessment(pair.aAssessmentId), repo.getAssessment(pair.bAssessmentId)]);
  if (!usable(a) || !usable(b)) throw new Error("두 사람의 검사 결과를 쓸 수 없어 리포트 궁합을 만들 수 없습니다.");
  return { a: personOf(a), b: personOf(b), ...(reference ? { reference } : {}) };
}

export type MyPair = { pairId: string; role: PairRole; status: PairRecord["status"]; otherNickname: string | null; createdAt: string; report: "none" | "generating" | "failed" | "ready" | "blocked" };

/** MY — 내 리포트 궁합 목록(최근이 먼저) */
export async function listMyPairs(deps: PairDeps, userId: string): Promise<MyPair[]> {
  try {
    const pairs = await deps.pairs.listPairsForUser(userId);
    const out: MyPair[] = [];
    for (const p of pairs) {
      const v = await getPairView(deps, { pairId: p.id, userId });
      if (v.kind !== "ok") continue;
      out.push({ pairId: p.id, role: v.role, status: v.status, otherNickname: v.otherNickname, createdAt: p.createdAt, report: v.report.state === "ready" ? "ready" : v.report.state === "blocked" ? "blocked" : v.report.state === "failed" ? "failed" : v.report.state === "generating" ? "generating" : "none" });
    }
    return out;
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

export { isPairProduct };
