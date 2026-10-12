// 테스트용 메모리 저장소. DB 고유 조건과 상태 변경 규칙을 흉내 낸다.
// 운영 코드에서 쓰지 않는다.

import { canTransition } from "../../commerce/order.ts";
import type { ConsentRecord } from "../../membership/terms.ts";
import type { PersonalContext } from "../../personalization/context.ts";
import type {
  OpsEventRecord,
  PaymentEventSource,
  AssessmentRecord,
  MiyuRepository,
  OrderRecord,
  ProfileRecord,
  ReportRecord,
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
  const opsEvents: OpsEventRecord[] = [];
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
          (x) => x.id !== orderId && x.assessmentId === current.assessmentId && x.status === "paid",
        );
        if (otherPaid) throw Object.assign(new Error("duplicate paid order"), { code: "23505" });
      }
      const next = { ...current, ...patch, updatedAt: iso() };
      orders.set(orderId, next);
      return next;
    },
    async addPaymentEvent(event) {
      events.push({ orderId: event.orderId, source: event.source, status: event.status, detail: event.detail, createdAt: new Date(now().getTime() + ++tick).toISOString() });
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
    async listPaymentEvents(orderId) {
      return events.filter((e) => e.orderId === orderId).map(({ source, status, detail, createdAt }) => ({ source, status, detail, createdAt }));
    },
    async getReportByOrder(orderId) {
      return [...reports.values()].find((r) => r.orderId === orderId) ?? null;
    },
    async listReportStatuses(userId) {
      return [...reports.values()]
        .filter((r) => r.userId === userId)
        .map((r) => ({ id: r.id, orderId: r.orderId, assessmentId: r.assessmentId, status: r.status }));
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

  return { repo, profiles, regions, assessments, orders, reports, events, consents, contexts, opsEvents };
}
