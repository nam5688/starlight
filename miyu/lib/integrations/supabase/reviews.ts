// 이용 후기(리뷰) Supabase 저장소 — ReviewRepository 구현.
// 서버 비밀키 클라이언트로만 쓴다(브라우저 권한으로는 운영자 이력 · 신고 · 다른 사람의 후기에 접근할 수 없다). 서비스가 소유자를 확인한 뒤에만 부른다.
// DB 변경 25번이 없으면(표 · 함수 없음) 코드 42P01로 통일해 던진다 — 호출한 쪽이 "후기 준비 중"으로 다루고 기존 화면은 그대로 동작한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicReview, ReviewAdminAction, ReviewKind, ReviewStatus } from "../../commerce/reviews.ts";
import type { AdminApplyResult, AdminReviewRow, ChatSubject, InsertReviewResult, ReviewAdminLogRecord, ReviewEdit, ReviewRecord, ReviewRepository, ReviewStatRow } from "../../services/review-ports.ts";

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };

const MISSING = new Set(["PGRST202", "42883", "PGRST205", "42P01"]);
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const UNDEFINED_COLUMN = new Set(["42703", "PGRST204"]);

function fail(context: string, error: DbError, status?: number): never {
  const missing = (error.code && MISSING.has(error.code)) || (status === 404 && !error.code);
  const e = new Error(`${context}: ${missing ? "후기 표 · 함수가 없습니다 (DB 변경 25번 필요)" : error.message}`) as Error & { code?: string };
  e.code = missing ? "42P01" : error.code;
  throw e;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const nstr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const int = (v: unknown): number => Number(v ?? 0) || 0;

function toReview(r: Row): ReviewRecord {
  return {
    id: str(r.id),
    userId: str(r.user_id),
    kind: r.kind as ReviewKind,
    subjectRef: str(r.subject_ref),
    rating: int(r.rating),
    body: str(r.body),
    publicConsent: Boolean(r.public_consent),
    status: r.status as ReviewStatus,
    disclosure: r.disclosure as ReviewRecord["disclosure"],
    freeTrial: Boolean(r.free_trial),
    rewardState: r.reward_state as ReviewRecord["rewardState"],
    rewardCredits: int(r.reward_credits),
    rewardOpKey: nstr(r.reward_op_key),
    rewardedAt: nstr(r.rewarded_at),
    consentedAt: nstr(r.consented_at),
    consentNoticeVersion: nstr(r.consent_notice_version),
    featured: Boolean(r.featured),
    featuredAt: nstr(r.featured_at),
    hiddenReason: nstr(r.hidden_reason),
    hiddenAt: nstr(r.hidden_at),
    deletedBy: (r.deleted_by as "user" | "admin" | null) ?? null,
    deletedAt: nstr(r.deleted_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

/** 공개 조회에 쓰는 열 — 회원번호 · 운영자 조치 · 보상 기록은 내보내지 않는다 */
const PUBLIC_COLS = "id, kind, rating, body, disclosure, free_trial, created_at, updated_at, featured, featured_at";

function toPublic(r: Row): PublicReview {
  return { id: str(r.id), kind: r.kind as ReviewKind, rating: int(r.rating), body: str(r.body), disclosure: r.disclosure as PublicReview["disclosure"], freeTrial: Boolean(r.free_trial), createdAt: str(r.created_at), updatedAt: str(r.updated_at), featured: Boolean(r.featured), featuredAt: nstr(r.featured_at) };
}

const PAGE = 1000;

export function createSupabaseReviewRepository(db: SupabaseClient): ReviewRepository {
  const editFields = (e: Pick<ReviewEdit, "rating" | "body" | "publicConsent" | "consentNoticeVersion">) => ({
    rating: e.rating,
    body: e.body,
    public_consent: e.publicConsent,
    consented_at: e.publicConsent ? new Date().toISOString() : null,
    consent_notice_version: e.consentNoticeVersion,
  });

  /** 글 · 별점 · 공개 동의를 고친다 — 공개 중 · 나만 보기는 동의에 따라 상태가 바뀌고, 운영자가 숨긴 후기는 숨김을 유지한다(두 조건 갱신 중 맞는 쪽 하나만 일어난다) */
  async function editLive(id: string, userId: string, fields: Row, publicConsent: boolean): Promise<ReviewRecord | null> {
    const live = await db.from("reviews").update({ ...fields, status: publicConsent ? "published" : "private" }).eq("id", id).eq("user_id", userId).in("status", ["published", "private"]).select();
    if (live.error) fail("후기 수정", live.error, live.status);
    if ((live.data ?? []).length > 0) return toReview(live.data![0] as Row);
    const hidden = await db.from("reviews").update(fields).eq("id", id).eq("user_id", userId).eq("status", "hidden").select();
    if (hidden.error) fail("후기 수정", hidden.error, hidden.status);
    return (hidden.data ?? []).length > 0 ? toReview(hidden.data![0] as Row) : null;
  }

  async function rows(context: string, limit: number, page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: DbError | null; status?: number }>): Promise<Row[]> {
    const out: Row[] = [];
    while (out.length < limit) {
      const from = out.length;
      const to = Math.min(from + PAGE, limit) - 1;
      const { data, error, status } = await page(from, to);
      if (error) fail(context, error, status);
      out.push(...(data ?? []));
      if ((data?.length ?? 0) < to - from + 1) break;
    }
    return out;
  }

  return {
    async getReviewByKey(userId, kind, subjectRef) {
      const { data, error, status } = await db.from("reviews").select().eq("user_id", userId).eq("kind", kind).eq("subject_ref", subjectRef).maybeSingle();
      if (error) fail("후기 조회", error, status);
      return data ? toReview(data as Row) : null;
    },
    async getReview(id) {
      const { data, error, status } = await db.from("reviews").select().eq("id", id).maybeSingle();
      if (error) fail("후기 조회", error, status);
      return data ? toReview(data as Row) : null;
    },
    async listUserReviews(userId) {
      const { data, error, status } = await db.from("reviews").select().eq("user_id", userId).order("created_at", { ascending: false }).limit(500);
      if (error) fail("내 후기 조회", error, status);
      return (data ?? []).map((r) => toReview(r as Row));
    },
    async insertReview(input): Promise<InsertReviewResult> {
      const now = new Date().toISOString();
      // 후기 번호를 먼저 정해 보상 멱등 키(review:<후기 번호>)를 같은 저장에 함께 남긴다 — 지급을 시작했다면 확정 전에 멈춰도 같은 키로 다시 맞출 수 있다
      const id = globalThis.crypto.randomUUID();
      const { data, error, status } = await db
        .from("reviews")
        .insert({
          id,
          user_id: input.userId,
          kind: input.kind,
          subject_ref: input.subjectRef,
          rating: input.rating,
          body: input.body,
          public_consent: input.publicConsent,
          status: input.publicConsent ? "published" : "private",
          disclosure: input.disclosure,
          free_trial: input.freeTrial,
          reward_state: input.rewardState,
          reward_op_key: input.rewardState === "pending" ? `review:${id}` : null,
          consented_at: input.publicConsent ? now : null,
          consent_notice_version: input.consentNoticeVersion,
        })
        .select()
        .single();
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "exists" };
        fail("후기 저장", error, status);
      }
      return { ok: true, review: toReview(data as Row) };
    },
    async updateReview(input) {
      return editLive(input.id, input.userId, editFields(input), input.publicConsent);
    },
    async reviveReview(input) {
      const fields = { ...editFields(input), status: input.publicConsent ? "published" : "private", deleted_by: null, deleted_at: null };
      const { data, error, status } = await db.from("reviews").update(fields).eq("id", input.id).eq("user_id", input.userId).eq("status", "deleted").eq("deleted_by", "user").select();
      if (error) fail("후기 다시 쓰기", error, status);
      return (data ?? []).length > 0 ? toReview(data![0] as Row) : null;
    },
    async deleteReview({ id, userId }) {
      const { data, error, status } = await db
        .from("reviews")
        .update({ status: "deleted", body: "", public_consent: false, consented_at: null, featured: false, featured_at: null, deleted_by: "user", deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId)
        .neq("status", "deleted")
        .select();
      if (error) fail("후기 삭제", error, status);
      return (data ?? []).length > 0 ? toReview(data![0] as Row) : null;
    },
    async setPublicConsent({ id, userId, publicConsent, consentNoticeVersion }) {
      const fields = { public_consent: publicConsent, consented_at: publicConsent ? new Date().toISOString() : null, consent_notice_version: consentNoticeVersion };
      return editLive(id, userId, fields, publicConsent);
    },
    async settleReward({ id, state, credits, opKey }) {
      const { data, error, status } = await db
        .from("reviews")
        .update({ reward_state: state, reward_credits: state === "granted" ? credits : 0, reward_op_key: opKey, rewarded_at: state === "granted" ? new Date().toISOString() : null })
        .eq("id", id)
        .in("reward_state", ["pending", "failed"])
        .select("id");
      if (error) fail("후기 보상 확정", error, status);
      return (data ?? []).length > 0;
    },
    async listRewardRetry({ userId, limit }) {
      let q = db.from("reviews").select().in("reward_state", ["pending", "failed"]).order("created_at", { ascending: true }).limit(limit);
      if (userId) q = q.eq("user_id", userId);
      const { data, error, status } = await q;
      if (error) fail("보상 확인이 필요한 후기 조회", error, status);
      return (data ?? []).map((r) => toReview(r as Row));
    },

    async listPublicReviews({ kinds, limit, offset }) {
      let q = db.from("reviews").select(PUBLIC_COLS, { count: "exact" }).eq("status", "published").eq("public_consent", true).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);
      if (kinds && kinds.length > 0) q = q.in("kind", [...kinds]);
      const { data, error, count, status } = await q;
      if (error) fail("공개 후기 조회", error, status);
      return { rows: (data ?? []).map((r) => toPublic(r as unknown as Row)), total: count ?? 0 };
    },
    async listHomeCandidates({ recent }) {
      const base = () => db.from("reviews").select(PUBLIC_COLS).eq("status", "published").eq("public_consent", true);
      const [featured, latest] = await Promise.all([base().eq("featured", true).order("featured_at", { ascending: false }).limit(50), base().order("created_at", { ascending: false }).order("id", { ascending: false }).limit(recent)]);
      if (featured.error) fail("메인 후기 조회", featured.error, featured.status);
      if (latest.error) fail("메인 후기 조회", latest.error, latest.status);
      const byId = new Map<string, PublicReview>();
      for (const r of [...(featured.data ?? []), ...(latest.data ?? [])]) byId.set(str((r as unknown as Row).id), toPublic(r as unknown as Row));
      return [...byId.values()];
    },
    async countPublicReviews() {
      const { count, error, status } = await db.from("reviews").select("id", { count: "exact", head: true }).eq("status", "published").eq("public_consent", true);
      if (error) fail("공개 후기 수 조회", error, status);
      return count ?? 0;
    },

    async submitReport({ reviewId, reporterKey, reason }) {
      const { data, error, status } = await db.rpc("submit_review_report", { p_review: reviewId, p_reporter: reporterKey, p_reason: reason });
      if (error) fail("후기 신고", error, status);
      return data === "reported" ? "reported" : data === "duplicate" ? "duplicate" : "not-public";
    },

    async adminListReviews({ status: st, kind, reportedOnly, limit, offset }) {
      let ids: string[] | null = null;
      if (reportedOnly) {
        const open = await db.from("review_reports").select("review_id").is("handled_at", null).limit(200);
        if (open.error) fail("신고 조회", open.error, open.status);
        ids = [...new Set((open.data ?? []).map((r) => str((r as Row).review_id)))];
        if (ids.length === 0) return { rows: [], total: 0 };
      }
      let q = db.from("reviews").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);
      if (st) q = q.eq("status", st);
      if (kind) q = q.eq("kind", kind);
      if (ids) q = q.in("id", ids);
      const { data, error, count, status } = await q;
      if (error) fail("후기 목록 조회", error, status);
      const list = (data ?? []).map((r) => toReview(r as Row));
      const counts = new Map<string, number>();
      if (list.length > 0) {
        const open = await db.from("review_reports").select("review_id").in("review_id", list.map((r) => r.id)).is("handled_at", null);
        if (open.error) fail("신고 조회", open.error, open.status);
        for (const r of open.data ?? []) counts.set(str((r as Row).review_id), (counts.get(str((r as Row).review_id)) ?? 0) + 1);
      }
      const out: AdminReviewRow[] = list.map((review) => ({ review, openReports: counts.get(review.id) ?? 0 }));
      return { rows: out, total: count ?? 0 };
    },
    async adminApply({ reviewId, action, reasonCode, memo, adminId }): Promise<AdminApplyResult> {
      const { data, error, status } = await db.rpc("review_admin_apply", { p_review: reviewId, p_action: action, p_reason: reasonCode, p_memo: memo, p_admin: adminId });
      if (error) {
        if (error.code === CHECK_VIOLATION) return { ok: false, reason: "invalid-reason" };
        fail("후기 운영 조치", error, status);
      }
      const r = (data ?? {}) as Row;
      if (r.ok !== true) return { ok: false, reason: r.reason === "not-found" ? "not-found" : "invalid-state" };
      const fresh = await db.from("reviews").select().eq("id", reviewId).maybeSingle();
      if (fresh.error) fail("후기 조회", fresh.error, fresh.status);
      return fresh.data ? { ok: true, review: toReview(fresh.data as Row) } : { ok: false, reason: "not-found" };
    },
    async listAdminLog({ reviewId, limit }) {
      let q = db.from("review_admin_log").select().order("id", { ascending: false }).limit(limit);
      if (reviewId) q = q.eq("review_id", reviewId);
      const { data, error, status } = await q;
      if (error) fail("운영자 조치 이력 조회", error, status);
      return (data ?? []).map((r): ReviewAdminLogRecord => ({ id: int((r as Row).id), reviewId: str((r as Row).review_id), adminId: str((r as Row).admin_id), action: (r as Row).action as ReviewAdminAction, reasonCode: str((r as Row).reason_code), memo: nstr((r as Row).memo), createdAt: str((r as Row).created_at) }));
    },

    async listReviewStats({ limit }) {
      const data = await rows("후기 집계 조회", limit, (from, to) => db.from("reviews").select("user_id, kind, subject_ref, status, public_consent, featured, rating, reward_state, reward_credits, created_at").order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: DbError | null; status?: number }>);
      return data.map(
        (r): ReviewStatRow => ({ userId: str(r.user_id), kind: r.kind as ReviewKind, subjectRef: str(r.subject_ref), status: r.status as ReviewStatus, publicConsent: Boolean(r.public_consent), featured: Boolean(r.featured), rating: int(r.rating), rewardState: r.reward_state as ReviewRecord["rewardState"], rewardCredits: int(r.reward_credits), createdAt: str(r.created_at) }),
      );
    },
    async listAnsweredChatSubjects({ userId, since, limit }) {
      // 16번 이후에는 질문 자리 예약(state = reserved)이 같은 표에 있다 — 답을 받은 것(done)만 센다. 16번 전에는 state 열이 없어 모두 답을 받은 것이다
      const run = (withState: boolean) =>
        rows("답을 받은 질문 조회", limit, (from, to) => {
          let q = db.from("chat_questions").select("user_id, assessment_id, created_at").order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to);
          if (userId) q = q.eq("user_id", userId);
          if (withState) q = q.eq("state", "done");
          return q as unknown as PromiseLike<{ data: Row[] | null; error: DbError | null; status?: number }>;
        });
      let data: Row[];
      try {
        data = await run(true);
      } catch (e) {
        if (!UNDEFINED_COLUMN.has((e as { code?: string }).code ?? "")) throw e;
        data = await run(false);
      }
      const groups = new Map<string, ChatSubject>();
      for (const r of data) {
        const key = `${str(r.user_id)}|${str(r.assessment_id)}`;
        const g = groups.get(key);
        if (g) g.answers += 1;
        else groups.set(key, { userId: str(r.user_id), assessmentId: str(r.assessment_id), firstAnswerAt: str(r.created_at), answers: 1 });
      }
      const all = [...groups.values()];
      return since ? all.filter((g) => Date.parse(g.firstAnswerAt) >= Date.parse(since)) : all;
    },
  };
}
