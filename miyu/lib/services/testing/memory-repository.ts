// 테스트용 메모리 저장소. DB 고유 조건과 상태 변경 규칙을 흉내 낸다.
// 운영 코드에서 쓰지 않는다.

import { canTransition } from "../../commerce/order.ts";
import { parseCashProductId } from "../../config/product.ts";
import type { ConsentRecord } from "../../membership/terms.ts";
import type { ConcernRecord } from "../../personalization/concern.ts";
import type { PersonalContext } from "../../personalization/context.ts";
import type {
  AiUsageRecord,
  CashLedgerRecord,
  FeedbackRecord,
  FunnelEventRecord,
  OpsEventRecord,
  PaymentEventSource,
  AssessmentRecord,
  MiyuRepository,
  OrderRecord,
  ProfileRecord,
  ReportRecord,
  TalkRoomRecord,
} from "../ports.ts";

export function createMemoryRepository(now: () => Date = () => new Date()) {
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const profiles = new Map<string, ProfileRecord>();
  const regions = new Map<string, { province: string; district: string }>();
  const assessments = new Map<string, AssessmentRecord>();
  const orders = new Map<string, OrderRecord>();
  const reports = new Map<string, ReportRecord>();
  const events: { orderId: string; source: PaymentEventSource; status: string | null; detail: Record<string, unknown>; createdAt: string }[] = [];
  const consents = new Map<string, ConsentRecord[]>();
  const contexts = new Map<string, PersonalContext>();
  const concernRecords = new Map<string, ConcernRecord>();
  const talkRooms = new Map<string, TalkRoomRecord>();
  const chatQuestions: { userId: string; assessmentId: string; roomKey: string; createdAt: string }[] = [];
  // 미유캐시 — DB의 지갑 · 내역 · 트리거(충전 · 회수) · 함수(차감 · 되돌림)를 흉내 낸다
  const wallets = new Map<string, number>();
  const ledger: (CashLedgerRecord & { userId: string; ref: string | null })[] = [];
  let ledgerSeq = 0;
  const addLedger = (row: { userId: string; kind: CashLedgerRecord["kind"]; amount: number; orderId?: string | null; ref?: string | null; shortfall?: number }): boolean => {
    // 같은 주문의 같은 종류 · 같은 참조번호의 같은 종류는 한 번만 (DB 고유 조건)
    if (row.orderId && ledger.some((l) => l.orderId === row.orderId && l.kind === row.kind)) return false;
    if (row.ref && ledger.some((l) => l.ref === row.ref && l.kind === row.kind)) return false;
    ledger.push({ id: ++ledgerSeq, userId: row.userId, kind: row.kind, amount: row.amount, orderId: row.orderId ?? null, ref: row.ref ?? null, shortfall: row.shortfall ?? 0, createdAt: new Date(now().getTime() + ledgerSeq).toISOString() });
    return true;
  };
  /** 주문 상태가 바뀔 때의 충전 · 회수 — DB 트리거(orders_cash_change)와 같은 규칙 */
  const onOrderChange = (before: OrderRecord, after: OrderRecord) => {
    const cash = parseCashProductId(after.productId);
    if (!cash || before.status === after.status) return;
    if (after.status === "paid") {
      if (!wallets.has(after.userId)) wallets.set(after.userId, 0);
      if (cash.cash > 0 && addLedger({ userId: after.userId, kind: "charge", amount: cash.cash, orderId: after.id })) wallets.set(after.userId, wallets.get(after.userId)! + cash.cash);
      if (cash.bonus > 0 && addLedger({ userId: after.userId, kind: "bonus", amount: cash.bonus, orderId: after.id })) wallets.set(after.userId, wallets.get(after.userId)! + cash.bonus);
    } else if (after.status === "refunded" && before.status === "paid") {
      const credited = ledger.filter((l) => l.orderId === after.id && (l.kind === "charge" || l.kind === "bonus")).reduce((s, l) => s + l.amount, 0);
      if (credited > 0) {
        const take = Math.min(wallets.get(after.userId) ?? 0, credited);
        if (addLedger({ userId: after.userId, kind: "clawback", amount: -take, orderId: after.id, shortfall: credited - take })) wallets.set(after.userId, (wallets.get(after.userId) ?? 0) - take);
      }
    }
  };
  const opsEvents: OpsEventRecord[] = [];
  const aiUsage: AiUsageRecord[] = [];
  const funnel: FunnelEventRecord[] = [];
  const feedback = new Map<string, FeedbackRecord>();
  let tick = 0;
  const iso = () => now().toISOString();

  const repo: MiyuRepository = {
    async listConsents(userId) {
      return [...(consents.get(userId) ?? [])];
    },
    async addConsents(userId, list) {
      // 같은 시각에 여러 번 기록해도 순서가 구분되도록 1ms씩 더한다
      const rows = list.map((c) => ({ ...c, createdAt: new Date(now().getTime() + ++tick).toISOString() }));
      consents.set(userId, [...(consents.get(userId) ?? []), ...rows]);
    },
    async getProfile(userId) {
      return profiles.get(userId) ?? null;
    },
    async ensureProfile(userId) {
      const p = profiles.get(userId) ?? { userId, nickname: null, paymentCustomerKey: `ck-${userId}` };
      profiles.set(userId, p);
      return p;
    },
    async withdrawMemberData(userId) {
      if (!profiles.has(userId)) return { ok: false, reason: "not-found" };
      const mine = (o: OrderRecord) => o.userId === userId;
      if ([...orders.values()].some((o) => mine(o) && o.status === "pending" && now().getTime() - new Date(o.createdAt).getTime() < 3600_000)) return { ok: false, reason: "pending-order" };
      if ([...reports.values()].some((r) => r.userId === userId && (r.status === "queued" || r.status === "generating"))) return { ok: false, reason: "report-in-progress" };
      if ((wallets.get(userId) ?? 0) > 0) return { ok: false, reason: "cash-balance" };
      const counts = { reports: 0, assessments_deleted: 0, assessments_emptied: 0, personal_contexts: 0, concern_records: 0, feedback: 0, regions: 0, talk_rooms: 0, chat_questions: 0 };
      for (const [k, f] of [...feedback]) {
        if (f.userId !== userId) continue;
        feedback.delete(k);
        counts.feedback++;
      }
      for (const [k, c] of [...contexts]) {
        if (c.userId !== userId) continue;
        contexts.delete(k);
        counts.personal_contexts++;
      }
      for (const [k, c] of [...concernRecords]) {
        if (c.userId !== userId) continue;
        concernRecords.delete(k);
        counts.concern_records++;
      }
      for (const [k, t] of [...talkRooms]) {
        if (t.userId !== userId) continue;
        talkRooms.delete(k);
        counts.talk_rooms++;
      }
      for (let i = chatQuestions.length - 1; i >= 0; i--) {
        if (chatQuestions[i].userId !== userId) continue;
        chatQuestions.splice(i, 1);
        counts.chat_questions++;
      }
      for (const [k, r] of [...reports]) {
        if (r.userId !== userId) continue;
        reports.delete(k);
        counts.reports++;
      }
      if (regions.delete(userId)) counts.regions++;
      const ordered = new Set([...orders.values()].filter(mine).map((o) => o.assessmentId));
      for (const [k, a] of [...assessments]) {
        if (a.userId !== userId) continue;
        if (!ordered.has(a.id)) {
          assessments.delete(k);
          counts.assessments_deleted++;
        } else if (a.nickname !== "탈퇴") {
          assessments.set(k, { ...a, nickname: "탈퇴", knownMbti: null, answers: {}, summary: {} as AssessmentRecord["summary"], saju: {} as AssessmentRecord["saju"], contentVersion: "withdrawn" });
          counts.assessments_emptied++;
        }
      }
      profiles.set(userId, { ...profiles.get(userId)!, nickname: null });
      return { ok: true, counts };
    },
    async updateProfileNickname(userId, nickname) {
      const p = profiles.get(userId) ?? { userId, nickname: null, paymentCustomerKey: `ck-${userId}` };
      profiles.set(userId, { ...p, nickname });
    },
    async saveRegion(userId, region) {
      regions.set(userId, region);
    },
    async insertAssessment(a) {
      const record = { ...a, id: id(), createdAt: iso() };
      assessments.set(record.id, record);
      return record;
    },
    async getAssessment(assessmentId) {
      return assessments.get(assessmentId) ?? null;
    },
    async listAssessments(userId) {
      return [...assessments.values()].filter((a) => a.userId === userId);
    },
    async getOrderByNumber(orderNumber) {
      return [...orders.values()].find((o) => o.orderNumber === orderNumber) ?? null;
    },
    async listOrdersForAssessment(assessmentId) {
      return [...orders.values()].filter((o) => o.assessmentId === assessmentId);
    },
    async listOrdersForUser(userId) {
      return [...orders.values()].filter((o) => o.userId === userId);
    },
    async insertOrder(o) {
      const all = [...orders.values()];
      const conflict =
        all.some((x) => x.orderNumber === o.orderNumber) ||
        all.some((x) => x.assessmentId === o.assessmentId && x.productId === o.productId && x.status === "pending");
      if (conflict) return { ok: false, reason: "conflict" };
      const record: OrderRecord = {
        ...o,
        id: id(),
        status: "pending",
        paymentKey: null,
        method: null,
        approvedAt: null,
        failureCode: null,
        failureMessage: null,
        acquisition: o.acquisition ?? null,
        // 같은 시각에 여러 주문을 만들어도 순서가 구분되도록 1ms씩 더한다
        createdAt: new Date(now().getTime() + ++tick).toISOString(),
        updatedAt: iso(),
      };
      orders.set(record.id, record);
      return { ok: true, value: record };
    },
    async updateOrder(orderId, from, patch) {
      const current = orders.get(orderId);
      if (!current || !from.includes(current.status)) return null;
      if (patch.status && patch.status !== current.status && !canTransition(current.status, patch.status)) {
        throw new Error(`허용되지 않는 주문 상태 변경: ${current.status} → ${patch.status}`);
      }
      if (patch.status === "paid") {
        const otherPaid = [...orders.values()].some(
          (x) => x.id !== orderId && x.assessmentId === current.assessmentId && x.productId === current.productId && x.status === "paid",
        );
        if (otherPaid) throw Object.assign(new Error("duplicate paid order"), { code: "23505" });
      }
      const next = { ...current, ...patch, updatedAt: iso() };
      orders.set(orderId, next);
      onOrderChange(current, next);
      return next;
    },
    async addPaymentEvent(event) {
      events.push({ orderId: event.orderId, source: event.source, status: event.status, detail: event.detail, createdAt: new Date(now().getTime() + ++tick).toISOString() });
    },
    async addFunnelEvent(e) {
      funnel.push({ ...e, id: funnel.length + 1, createdAt: new Date(now().getTime() + ++tick).toISOString() });
    },
    async listFunnelEventsSince(since, limit) {
      return funnel.filter((e) => e.createdAt >= since).sort((a, b) => b.id - a.id).slice(0, limit);
    },
    async listOrdersForMetrics(since, limit) {
      return [...orders.values()]
        .filter((o) => o.createdAt >= since)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map((o) => ({ id: o.id, userId: o.userId, assessmentId: o.assessmentId, productId: o.productId, status: o.status, amount: o.amount, paymentEnv: o.paymentEnv, createdAt: o.createdAt, approvedAt: o.approvedAt, acquisition: o.acquisition ?? null }));
    },
    async listReportsForMetrics(since, limit) {
      return [...reports.values()]
        .filter((r) => r.createdAt >= since)
        .slice(0, limit)
        .map((r) => ({ id: r.id, orderId: r.orderId, status: r.status, createdAt: r.createdAt, readyAt: r.readyAt }));
    },
    async countAssessmentsAllSince(since) {
      return [...assessments.values()].filter((a) => a.createdAt >= since).length;
    },
    async upsertFeedback(f) {
      const report = reports.get(f.reportId);
      // DB 트리거와 같은 규칙: 완성된 리포트의 주인만
      if (!report || report.userId !== f.userId || report.status !== "ready") throw new Error("feedback only for the owner of a ready report");
      const prev = feedback.get(f.reportId);
      const t = new Date(now().getTime() + ++tick).toISOString();
      feedback.set(f.reportId, { reportId: f.reportId, userId: f.userId, rating: f.rating, createdAt: prev?.createdAt ?? t, updatedAt: t });
    },
    async getFeedback(reportId) {
      return feedback.get(reportId) ?? null;
    },
    async listFeedbackSince(since, limit) {
      return [...feedback.values()].filter((f) => f.createdAt >= since).slice(0, limit);
    },
    async countAssessmentsSince(userId, since) {
      return [...assessments.values()].filter((a) => a.userId === userId && a.createdAt >= since).length;
    },
    async addAiUsage(u) {
      aiUsage.push({ ...u, id: aiUsage.length + 1, createdAt: new Date(now().getTime() + ++tick).toISOString() });
    },
    async listAiUsageSince(since, limit) {
      return aiUsage.filter((u) => u.createdAt >= since).sort((a, b) => b.id - a.id).slice(0, limit);
    },
    async sumAiCostSince(since) {
      return aiUsage.filter((u) => u.createdAt >= since).reduce((n, u) => n + (u.estCostKrw ?? 0), 0);
    },
    async countActiveGenerations(staleBefore) {
      return [...reports.values()].filter((r) => r.status === "generating" && r.updatedAt >= staleBefore).length;
    },
    async countQueuedReports() {
      return [...reports.values()].filter((r) => r.status === "queued").length;
    },
    async addOpsEvent(e) {
      opsEvents.push({
        id: opsEvents.length + 1,
        createdAt: new Date(now().getTime() + ++tick).toISOString(),
        kind: e.kind,
        severity: e.severity ?? "info",
        orderNumber: e.orderNumber ?? null,
        errorId: e.errorId ?? null,
        dedupeKey: e.dedupeKey ?? null,
        message: e.message.slice(0, 500),
        detail: e.detail ?? {},
      });
    },
    async listOpsEvents(f) {
      return opsEvents
        .filter((e) => (!f.orderNumber || e.orderNumber === f.orderNumber) && (!f.errorId || e.errorId === f.errorId) && (!f.kinds || f.kinds.includes(e.kind)) && (!f.since || e.createdAt >= f.since))
        .sort((a, b) => b.id - a.id)
        .slice(0, f.limit);
    },
    async hasOpsEventSince(key, since) {
      return opsEvents.some((e) => e.dedupeKey === key && e.createdAt >= since);
    },
    async listOrdersForReconcile(o) {
      const all = [...orders.values()];
      const pending = all.filter((x) => x.status === "pending" && x.createdAt < o.pendingCreatedBefore).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const paid = all.filter((x) => x.status === "paid" && (x.approvedAt ?? x.createdAt) >= o.paidSince);
      return [...pending, ...paid].slice(0, o.limit);
    },
    async listRecentOrders(limit) {
      return [...orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    },
    async getOrderById(orderId) {
      return orders.get(orderId) ?? null;
    },
    async listProblemReports(o) {
      return [...reports.values()]
        .filter((r) => o.statuses.includes(r.status) && (!o.updatedBefore || r.updatedAt < o.updatedBefore))
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
        .slice(0, o.limit)
        .map(({ id, orderId, assessmentId, status, attempts, lastError, createdAt, updatedAt }) => ({ id, orderId, assessmentId, status, attempts, lastError, createdAt, updatedAt }));
    },
    async getContext(assessmentId) {
      return contexts.get(assessmentId) ?? null;
    },
    async listContexts(userId) {
      return [...contexts.values()].filter((c) => c.userId === userId).map(({ assessmentId, topic, updatedAt }) => ({ assessmentId, topic, updatedAt }));
    },
    async upsertContext(c) {
      // DB 트리거와 같은 규칙: 검사 결과의 주인만
      if (assessments.get(c.assessmentId)?.userId !== c.userId) throw new Error("personal context owner mismatch");
      const prev = contexts.get(c.assessmentId);
      const record: PersonalContext = { ...c, createdAt: prev?.createdAt ?? iso(), updatedAt: new Date(now().getTime() + ++tick).toISOString() };
      contexts.set(c.assessmentId, record);
      return record;
    },
    async deleteContext(assessmentId) {
      contexts.delete(assessmentId);
    },
    async insertConcernRecord(c) {
      // DB와 같은 규칙: 검사 결과의 주인만, 같은 작성 시점의 기록은 하나만 (내용을 지운 기록은 제외)
      if (assessments.get(c.assessmentId)?.userId !== c.userId) throw new Error("concern record owner mismatch");
      if ([...concernRecords.values()].some((x) => x.assessmentId === c.assessmentId && x.writtenAt === c.writtenAt && !x.scrubbedAt)) return { ok: false, reason: "conflict" };
      const record: ConcernRecord = { ...c, id: id(), createdAt: new Date(now().getTime() + ++tick).toISOString(), scrubbedAt: null };
      concernRecords.set(record.id, record);
      return { ok: true, value: record };
    },
    async getConcernRecord(recordId) {
      return concernRecords.get(recordId) ?? null;
    },
    async listConcernRecords(assessmentId) {
      return [...concernRecords.values()].filter((c) => c.assessmentId === assessmentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async listConcernRecordSummaries(userId) {
      return [...concernRecords.values()]
        .filter((c) => c.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ id, assessmentId, topic, writtenAt, createdAt, scrubbedAt }) => ({ id, assessmentId, topic, writtenAt, createdAt, scrubbedAt }));
    },
    async scrubConcernRecord(recordId, at) {
      const c = concernRecords.get(recordId);
      if (!c || c.scrubbedAt) return;
      concernRecords.set(recordId, { ...c, question: "", situation: "", matched: "", differed: "", excerpt: "", scrubbedAt: at });
    },
    async getTalkRoom(assessmentId, roomKey) {
      return talkRooms.get(`${assessmentId}|${roomKey}`) ?? null;
    },
    async listTalkRoomKeys(assessmentId) {
      return [...talkRooms.values()].filter((t) => t.assessmentId === assessmentId).map((t) => t.roomKey);
    },
    async upsertTalkRoom(input) {
      if (assessments.get(input.assessmentId)?.userId !== input.userId) throw new Error("talk room owner mismatch");
      talkRooms.set(`${input.assessmentId}|${input.roomKey}`, { assessmentId: input.assessmentId, roomKey: input.roomKey, userId: input.userId, actions: input.actions, updatedAt: iso() });
    },
    async deleteTalkRoom(assessmentId, roomKey) {
      talkRooms.delete(`${assessmentId}|${roomKey}`);
    },
    async deleteTalkRoomsBefore(assessmentId, prefix, keepKey) {
      for (const [k, t] of [...talkRooms]) if (t.assessmentId === assessmentId && t.roomKey.startsWith(prefix) && t.roomKey < keepKey) talkRooms.delete(k);
    },
    async addChatQuestion(input) {
      chatQuestions.push({ ...input, createdAt: iso() });
    },
    async countChatQuestionsSince(userId, since) {
      return chatQuestions.filter((q) => q.userId === userId && q.createdAt >= since).length;
    },
    async countChatQuestionsInRoom(userId, roomKey) {
      return chatQuestions.filter((q) => q.userId === userId && q.roomKey === roomKey).length;
    },
    async getCashBalance(userId) {
      return wallets.get(userId) ?? 0;
    },
    async listCashLedger(userId, limit) {
      return ledger
        .filter((l) => l.userId === userId)
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map(({ id: lid, kind, amount, orderId, shortfall, createdAt }) => ({ id: lid, kind, amount, orderId, shortfall, createdAt }));
    },
    async spendCash({ userId, amount, ref }) {
      if (!Number.isInteger(amount) || amount <= 0) throw new Error("cash_invalid_amount");
      if (ledger.some((l) => l.ref === ref && l.kind === "spend")) throw Object.assign(new Error("duplicate cash spend"), { code: "23505" });
      const balance = wallets.get(userId);
      if (balance === undefined || balance < amount) return null;
      wallets.set(userId, balance - amount);
      addLedger({ userId, kind: "spend", amount: -amount, ref });
      return balance - amount;
    },
    async restoreCashSpend({ userId, ref }) {
      const spent = ledger.find((l) => l.userId === userId && l.ref === ref && l.kind === "spend");
      if (!spent) return null;
      if (!addLedger({ userId, kind: "spend_restore", amount: -spent.amount, ref })) return null;
      const next = (wallets.get(userId) ?? 0) - spent.amount;
      wallets.set(userId, next);
      return next;
    },
    async listPaymentEvents(orderId) {
      return events.filter((e) => e.orderId === orderId).map(({ source, status, detail, createdAt }) => ({ source, status, detail, createdAt }));
    },
    async getReportByOrder(orderId) {
      return [...reports.values()].find((r) => r.orderId === orderId) ?? null;
    },
    async listReportStatuses(userId) {
      return [...reports.values()]
        .filter((r) => r.userId === userId)
        .map((r) => ({ id: r.id, orderId: r.orderId, assessmentId: r.assessmentId, status: r.status, generator: r.generator, generatorVersion: r.generatorVersion, readyAt: r.readyAt }));
    },
    async insertReport(r) {
      if ([...reports.values()].some((x) => x.orderId === r.orderId)) return { ok: false, reason: "conflict" };
      const record: ReportRecord = {
        ...r,
        id: id(),
        content: null,
        generator: null,
        generatorVersion: null,
        lastError: null,
        createdAt: iso(),
        updatedAt: iso(),
        readyAt: null,
      };
      reports.set(record.id, record);
      return { ok: true, value: record };
    },
    async updateReport(reportId, from, patch, expectedAttempts) {
      const current = reports.get(reportId);
      if (!current || !from.includes(current.status)) return null;
      if (expectedAttempts !== undefined && current.attempts !== expectedAttempts) return null;
      if (current.status === "ready") throw new Error("완성된 리포트는 바꿀 수 없습니다.");
      const next = { ...current, ...patch, updatedAt: iso() };
      reports.set(reportId, next);
      return next;
    },
  };

  return { repo, profiles, regions, assessments, orders, reports, events, consents, contexts, concernRecords, talkRooms, chatQuestions, opsEvents, aiUsage, funnel, feedback, wallets, ledger };
}
