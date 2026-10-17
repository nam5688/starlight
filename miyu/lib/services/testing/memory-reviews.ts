// 시험용 후기 저장소(메모리) — DB 변경 25번의 표 · 함수 · 탈퇴 트리거와 같은 규칙을 흉내 낸다. 서비스 시험은 DB 없이 이것으로 하고, SQL 자체는 supabase/tests/reviews.db.test.ts가 실제 Postgres로 확인한다.
// 메모리 저장소(createMemoryRepository)의 탈퇴 처리에 훅(withdrawHooks)으로 반응한다 — DB의 "프로필 탈퇴 표시" 트리거와 같은 자리다.

import type { PublicReview, ReviewAdminAction } from "../../commerce/reviews.ts";
import type { AdminApplyResult, AdminReviewRow, ChatSubject, InsertReviewResult, ReviewAdminLogRecord, ReviewEdit, ReviewRecord, ReviewRepository, ReviewStatRow } from "../review-ports.ts";
import type { createMemoryRepository } from "./memory-repository.ts";

type Mem = ReturnType<typeof createMemoryRepository>;

/** DB의 review_admin_log 검사와 같은 표 — 사유 분류는 조치에 맞는 것만 */
const ALLOWED_REASONS: Record<ReviewAdminAction, readonly string[]> = {
  hide: ["privacy", "abuse", "fake_or_ad", "report", "other"],
  delete: ["privacy", "abuse", "fake_or_ad", "report", "other"],
  unhide: ["wrongly_hidden", "resolved", "other"],
  feature: ["specific", "helpful", "balance", "other"],
  unfeature: ["replaced", "criteria", "other"],
  dismiss_reports: ["no_violation", "other"],
};

type Report = { id: number; reviewId: string; reporterKey: string; reason: string; createdAt: string; handledAt: string | null; handledAction: string | null };

export function createMemoryReviews(mem: Mem, now: () => Date = () => new Date()) {
  const reviews = new Map<string, ReviewRecord>();
  const reports: Report[] = [];
  const log: ReviewAdminLogRecord[] = [];
  let seq = 0;
  let tick = 0;
  const uid = () => `20000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const stamp = () => new Date(now().getTime() + ++tick).toISOString();
  const time = (iso: string | null) => (iso ? Date.parse(iso) : 0);

  // 탈퇴하면 이 회원의 후기(묘비 · 이력 · 신고 포함)를 지운다
  mem.withdrawHooks.push((userId) => {
    for (const [id, r] of [...reviews]) {
      if (r.userId !== userId) continue;
      reviews.delete(id);
      for (let i = log.length - 1; i >= 0; i--) if (log[i].reviewId === id) log.splice(i, 1);
      for (let i = reports.length - 1; i >= 0; i--) if (reports[i].reviewId === id) reports.splice(i, 1);
    }
  });

  const isPublic = (r: ReviewRecord) => r.status === "published" && r.publicConsent;
  const toPublic = (r: ReviewRecord): PublicReview => ({ id: r.id, kind: r.kind, rating: r.rating, body: r.body, disclosure: r.disclosure, freeTrial: r.freeTrial, createdAt: r.createdAt, updatedAt: r.updatedAt, featured: r.featured, featuredAt: r.featuredAt });
  const newest = (a: ReviewRecord, b: ReviewRecord) => time(b.createdAt) - time(a.createdAt) || (a.id < b.id ? 1 : -1);
  const touch = (r: ReviewRecord) => {
    r.updatedAt = stamp();
  };
  const consentFields = (r: ReviewRecord, consent: boolean, version: string) => {
    r.publicConsent = consent;
    r.consentedAt = consent ? stamp() : null;
    r.consentNoticeVersion = version;
  };
  /** 공개 중 · 나만 보기는 동의에 따라 상태가 바뀌고, 운영자가 숨긴 후기는 숨김을 유지한다 */
  const applyLive = (r: ReviewRecord, consent: boolean) => {
    if (r.status === "published" || r.status === "private") r.status = consent ? "published" : "private";
  };

  const repo: ReviewRepository = {
    async getReviewByKey(userId, kind, subjectRef) {
      return [...reviews.values()].find((r) => r.userId === userId && r.kind === kind && r.subjectRef === subjectRef) ?? null;
    },
    async getReview(id) {
      return reviews.get(id) ?? null;
    },
    async listUserReviews(userId) {
      return [...reviews.values()].filter((r) => r.userId === userId).sort(newest);
    },
    async insertReview(input): Promise<InsertReviewResult> {
      if ([...reviews.values()].some((r) => r.userId === input.userId && r.kind === input.kind && r.subjectRef === input.subjectRef)) return { ok: false, reason: "exists" };
      const id = uid();
      const at = stamp();
      const r: ReviewRecord = {
        id,
        userId: input.userId,
        kind: input.kind,
        subjectRef: input.subjectRef,
        rating: input.rating,
        body: input.body,
        publicConsent: input.publicConsent,
        status: input.publicConsent ? "published" : "private",
        disclosure: input.disclosure,
        freeTrial: input.freeTrial,
        rewardState: input.rewardState,
        rewardCredits: 0,
        rewardOpKey: input.rewardState === "pending" ? `review:${id}` : null,
        rewardedAt: null,
        consentedAt: input.publicConsent ? at : null,
        consentNoticeVersion: input.consentNoticeVersion,
        featured: false,
        featuredAt: null,
        hiddenReason: null,
        hiddenAt: null,
        deletedBy: null,
        deletedAt: null,
        createdAt: at,
        updatedAt: at,
      };
      reviews.set(id, r);
      return { ok: true, review: { ...r } };
    },
    async updateReview(input: ReviewEdit) {
      const r = reviews.get(input.id);
      if (!r || r.userId !== input.userId || r.status === "deleted") return null;
      r.rating = input.rating;
      r.body = input.body;
      consentFields(r, input.publicConsent, input.consentNoticeVersion);
      applyLive(r, input.publicConsent);
      touch(r);
      return { ...r };
    },
    async reviveReview(input: ReviewEdit) {
      const r = reviews.get(input.id);
      if (!r || r.userId !== input.userId || r.status !== "deleted" || r.deletedBy !== "user") return null;
      r.rating = input.rating;
      r.body = input.body;
      consentFields(r, input.publicConsent, input.consentNoticeVersion);
      r.status = input.publicConsent ? "published" : "private";
      r.deletedBy = null;
      r.deletedAt = null;
      touch(r);
      return { ...r };
    },
    async deleteReview({ id, userId }) {
      const r = reviews.get(id);
      if (!r || r.userId !== userId || r.status === "deleted") return null;
      r.status = "deleted";
      r.body = "";
      r.publicConsent = false;
      r.consentedAt = null;
      r.featured = false;
      r.featuredAt = null;
      r.deletedBy = "user";
      r.deletedAt = stamp();
      touch(r);
      return { ...r };
    },
    async setPublicConsent({ id, userId, publicConsent, consentNoticeVersion }) {
      const r = reviews.get(id);
      if (!r || r.userId !== userId || r.status === "deleted") return null;
      consentFields(r, publicConsent, consentNoticeVersion);
      applyLive(r, publicConsent);
      touch(r);
      return { ...r };
    },
    async settleReward({ id, state, credits, opKey }) {
      const r = reviews.get(id);
      if (!r || (r.rewardState !== "pending" && r.rewardState !== "failed")) return false;
      r.rewardState = state;
      r.rewardCredits = state === "granted" ? credits : 0;
      r.rewardOpKey = opKey;
      r.rewardedAt = state === "granted" ? stamp() : null;
      touch(r);
      return true;
    },
    async listRewardRetry({ userId, limit }) {
      return [...reviews.values()]
        .filter((r) => (r.rewardState === "pending" || r.rewardState === "failed") && (!userId || r.userId === userId))
        .sort((a, b) => time(a.createdAt) - time(b.createdAt))
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },

    async listPublicReviews({ kinds, limit, offset }) {
      const all = [...reviews.values()].filter((r) => isPublic(r) && (!kinds || kinds.length === 0 || kinds.includes(r.kind))).sort(newest);
      return { rows: all.slice(offset, offset + limit).map(toPublic), total: all.length };
    },
    async listHomeCandidates({ recent }) {
      const pub = [...reviews.values()].filter(isPublic);
      const featured = pub.filter((r) => r.featured).sort((a, b) => time(b.featuredAt) - time(a.featuredAt)).slice(0, 50);
      const latest = [...pub].sort(newest).slice(0, recent);
      const byId = new Map<string, PublicReview>();
      for (const r of [...featured, ...latest]) byId.set(r.id, toPublic(r));
      return [...byId.values()];
    },
    async countPublicReviews() {
      return [...reviews.values()].filter(isPublic).length;
    },

    async submitReport({ reviewId, reporterKey, reason }) {
      const r = reviews.get(reviewId);
      if (!r || !isPublic(r)) return "not-public";
      if (reports.some((x) => x.reviewId === reviewId && x.reporterKey === reporterKey)) return "duplicate";
      reports.push({ id: reports.length + 1, reviewId, reporterKey, reason, createdAt: stamp(), handledAt: null, handledAction: null });
      return "reported";
    },

    async adminListReviews({ status, kind, reportedOnly, limit, offset }) {
      const open = (id: string) => reports.filter((x) => x.reviewId === id && !x.handledAt).length;
      const all = [...reviews.values()].filter((r) => (!status || r.status === status) && (!kind || r.kind === kind) && (!reportedOnly || open(r.id) > 0)).sort(newest);
      const rows: AdminReviewRow[] = all.slice(offset, offset + limit).map((r) => ({ review: { ...r }, openReports: open(r.id) }));
      return { rows, total: all.length };
    },
    async adminApply({ reviewId, action, reasonCode, memo, adminId }): Promise<AdminApplyResult> {
      const r = reviews.get(reviewId);
      if (!r) return { ok: false, reason: "not-found" };
      // 이력 검사(DB의 review_admin_log 제약)와 같다 — 맞지 않으면 아무것도 바꾸지 않는다
      const m = (memo ?? "").trim();
      if (!ALLOWED_REASONS[action].includes(reasonCode) || m.length > 120 || (reasonCode === "other" && m.length < 2)) return { ok: false, reason: "invalid-reason" };
      const openReports = reports.filter((x) => x.reviewId === r.id && !x.handledAt);
      if (action === "hide") {
        if (r.status !== "published" && r.status !== "private") return { ok: false, reason: "invalid-state" };
        r.status = "hidden";
        r.hiddenReason = reasonCode;
        r.hiddenAt = stamp();
      } else if (action === "unhide") {
        if (r.status !== "hidden") return { ok: false, reason: "invalid-state" };
        r.status = r.publicConsent ? "published" : "private";
        r.hiddenReason = null;
        r.hiddenAt = null;
      } else if (action === "delete") {
        if (r.status === "deleted") return { ok: false, reason: "invalid-state" };
        r.status = "deleted";
        r.body = "";
        r.publicConsent = false;
        r.consentedAt = null;
        r.featured = false;
        r.featuredAt = null;
        r.deletedBy = "admin";
        r.deletedAt = stamp();
        r.hiddenReason = reasonCode;
        r.hiddenAt = r.hiddenAt ?? stamp();
      } else if (action === "feature") {
        if (!isPublic(r) || r.featured) return { ok: false, reason: "invalid-state" };
        r.featured = true;
        r.featuredAt = stamp();
      } else if (action === "unfeature") {
        if (!r.featured) return { ok: false, reason: "invalid-state" };
        r.featured = false;
        r.featuredAt = null;
      } else if (action === "dismiss_reports") {
        if (openReports.length === 0) return { ok: false, reason: "invalid-state" };
      } else {
        return { ok: false, reason: "invalid-state" };
      }
      touch(r);
      log.push({ id: log.length + 1, reviewId: r.id, adminId, action, reasonCode, memo: m || null, createdAt: stamp() });
      if (action === "hide" || action === "delete" || action === "dismiss_reports") for (const x of openReports) Object.assign(x, { handledAt: stamp(), handledAction: action });
      return { ok: true, review: { ...r } };
    },
    async listAdminLog({ reviewId, limit }) {
      return log.filter((l) => !reviewId || l.reviewId === reviewId).sort((a, b) => b.id - a.id).slice(0, limit);
    },

    async listReviewStats({ limit }) {
      return [...reviews.values()]
        .sort(newest)
        .slice(0, limit)
        .map((r): ReviewStatRow => ({ userId: r.userId, kind: r.kind, subjectRef: r.subjectRef, status: r.status, publicConsent: r.publicConsent, featured: r.featured, rating: r.rating, rewardState: r.rewardState, rewardCredits: r.rewardCredits, createdAt: r.createdAt }));
    },
    async listAnsweredChatSubjects({ userId, since, limit }) {
      const groups = new Map<string, ChatSubject>();
      for (const q of [...mem.chatQuestions].sort((a, b) => time(a.createdAt) - time(b.createdAt))) {
        if (userId && q.userId !== userId) continue;
        const key = `${q.userId}|${q.assessmentId}`;
        const g = groups.get(key);
        if (g) g.answers += 1;
        else groups.set(key, { userId: q.userId, assessmentId: q.assessmentId, firstAnswerAt: q.createdAt, answers: 1 });
      }
      const all = [...groups.values()];
      return (since ? all.filter((g) => time(g.firstAnswerAt) >= time(since)) : all).slice(0, limit);
    },
  };

  return { repo, reviews, reports, log };
}

