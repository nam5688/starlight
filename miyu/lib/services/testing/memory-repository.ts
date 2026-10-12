// 테스트용 메모리 저장소. DB 고유 조건과 상태 변경 규칙을 흉내 낸다.
// 운영 코드에서 쓰지 않는다.

import { canTransition } from "../../commerce/order.ts";
import type { ConsentRecord } from "../../membership/terms.ts";
import type {
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
  const events: { orderId: string; source: string; status: string | null }[] = [];
  const consents = new Map<string, ConsentRecord[]>();
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
        createdAt: iso(),
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
      events.push({ orderId: event.orderId, source: event.source, status: event.status });
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

  return { repo, profiles, regions, assessments, orders, reports, events, consents };
}
