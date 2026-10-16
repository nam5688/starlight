// Supabase(Postgres) 저장소 — 서비스의 MiyuRepository 구현.
// Next.js에 의존하지 않는다. 어떤 클라이언트를 넘기느냐로 권한이 달라진다.
// - 로그인한 사용자 클라이언트: DB 접근 정책(RLS) 때문에 본인 행만 읽을 수 있고, 쓰기는 거부된다
// - 서버 비밀키 클라이언트: 쓰기용. 서비스가 소유자를 직접 확인한 뒤에만 쓴다

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InviteDiscountCheck, InviteDiscountReason } from "../../commerce/invite.ts";
import type { ConsentRecord } from "../../membership/terms.ts";
import type { ConcernRecord } from "../../personalization/concern.ts";
import type { PersonalContext } from "../../personalization/context.ts";
import type {
  AssessmentRecord,
  CashLedgerRecord,
  CashRefundResult,
  ChatReservation,
  TasteReportRecord,
  TasteReservation,
  FunnelEventName,
  InsertResult,
  InviteRecord,
  MiyuRepository,
  OpsEventRecord,
  OrderRecord,
  QuestionPackRecord,
  ReportRecord,
  ReportStatusRecord,
  TalkRoomRecord,
  ChatSummaryRecord,
} from "../../services/ports.ts";

type Row = Record<string, unknown>;

const UNIQUE_VIOLATION = "23505";
/** 함수가 아직 없음 (PostgREST · Postgres) — DB 변경 전에는 예전 방식으로 동작하게 한다 */
const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);
const isMissingFunction = (error: { code?: string | null } | null | undefined) => Boolean(error?.code && MISSING_FUNCTION.has(error.code));
/** 테이블이 아직 없음 (PostgREST · Postgres) — 선택 기능은 꺼진 것으로 보고 기존 화면은 그대로 동작하게 한다 */
const MISSING_TABLE = new Set(["PGRST205", "42P01"]);
export const isMissingTableError = (error: { code?: string | null } | null | undefined) => Boolean(error?.code && MISSING_TABLE.has(error.code));

/** Supabase는 한 번에 최대 1,000행만 돌려준다 — 더 필요하면 나눠서 가져온다 (집계용 목록, 상한 limit) */
const PAGE = 1000;
type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;
async function fetchPages<T>(context: string, limit: number, page: (from: number, to: number) => PageResult<T>, tolerateMissing = false): Promise<T[]> {
  const rows: T[] = [];
  while (rows.length < limit) {
    const from = rows.length;
    const to = Math.min(from + PAGE, limit) - 1;
    const { data, error } = await page(from, to);
    if (error) {
      if (tolerateMissing && isMissingTableError(error)) return rows;
      fail(context, error);
    }
    const got = data?.length ?? 0;
    rows.push(...(data ?? []));
    if (got < to - from + 1) break; // 마지막 쪽
  }
  return rows;
}

function fail(context: string, error: { message: string; code?: string }): never {
  const e = new Error(`${context}: ${error.message}`) as Error & { code?: string };
  e.code = error.code;
  throw e;
}

function toTalkRoom(r: Row): TalkRoomRecord {
  return { assessmentId: r.assessment_id as string, roomKey: r.room_key as string, userId: r.user_id as string, actions: Array.isArray(r.actions) ? (r.actions as unknown[]) : [], updatedAt: r.updated_at as string, savedUpto: Number(r.saved_upto ?? 0) };
}

function toChatSummary(r: Row): ChatSummaryRecord {
  return { id: r.id as string, userId: r.user_id as string, assessmentId: r.assessment_id as string, room: r.room as string, visible: Boolean(r.visible), items: r.items, createdAt: r.created_at as string };
}

/** 14번 DB 변경 전 — 표(chat_summaries)나 열(talk_rooms.saved_upto)이 없다. 호출한 쪽이 "준비 중"으로 다루도록 코드 42P01로 통일한다 */
/** 18번 DB 변경 전 — 초대 표 · 함수가 없다. 호출한 쪽이 "준비 중"으로 다루도록 코드 42P01로 통일한다 */
function inviteNotReady(what: string, error: { message: string; code?: string }, status?: number): { message: string; code?: string } {
  const missing = isMissingTableError(error) || isMissingFunction(error) || (status === 404 && !error.code);
  return missing ? { code: "42P01", message: `${what}가 없습니다 (DB 변경 18번 필요)` } : error;
}
function summaryNotReady(what: string, error: { message: string; code?: string }, status?: number): { message: string; code?: string } {
  const missing = isMissingTableError(error) || ["42703", "PGRST204", "PGRST205"].includes(error.code ?? "") || (status === 404 && !error.code);
  return missing ? { code: "42P01", message: `${what}가 없습니다 (DB 변경 14번 필요)` } : error;
}

/** 17번 DB 변경 전 — 표(taste_reports)나 함수가 없다. 호출한 쪽이 "준비 중"으로 다루도록 코드 42P01로 통일한다 */
function tasteNotReady(what: string, error: { message: string; code?: string }, status?: number): { message: string; code?: string } {
  const missing = isMissingTableError(error) || isMissingFunction(error) || (status === 404 && !error.code);
  return missing ? { code: "42P01", message: `${what}가 없습니다 (DB 변경 17번 필요)` } : error;
}

function toTaste(r: Row): TasteReportRecord {
  return {
    userId: r.user_id as string,
    assessmentId: r.assessment_id as string,
    status: r.status === "ready" ? "ready" : "pending",
    content: r.content ?? null,
    generator: (r.generator as string | null) ?? null,
    generatorVersion: (r.generator_version as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

function toInvite(r: Row): InviteRecord {
  return {
    id: r.id as string,
    token: r.token as string,
    inviterUserId: r.inviter_user_id as string,
    assessmentId: r.assessment_id as string,
    inviterTier: r.inviter_tier === "free" ? "free" : "deep",
    createdAt: r.created_at as string,
  };
}

function toInviteCheck(data: unknown): InviteDiscountCheck {
  const r = (data ?? {}) as Row;
  if (r.ok === true) return { ok: true, remaining: Number(r.remaining ?? 0) };
  const reason = String(r.reason ?? "");
  const known: InviteDiscountReason[] = ["invalid", "not-deep", "self", "inviter-not-paid", "already-used", "not-first", "cap", "order-mismatch"];
  return { ok: false, reason: (known as string[]).includes(reason) ? (reason as InviteDiscountReason) : "invalid" };
}

function toAssessment(r: Row): AssessmentRecord {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    channel: r.channel as AssessmentRecord["channel"],
    nickname: r.nickname as string,
    calendar: r.birth_calendar as AssessmentRecord["calendar"],
    isLeapMonth: r.birth_is_leap_month as boolean,
    birthYear: r.birth_year as number,
    birthMonth: r.birth_month as number,
    birthDay: r.birth_day as number,
    birthTime: r.birth_time ? String(r.birth_time).slice(0, 5) : null,
    knownMbti: (r.known_mbti as string | null) ?? null,
    answers: r.answers as AssessmentRecord["answers"],
    contentVersion: r.content_version as string,
    source: r.source as AssessmentRecord["source"],
    summary: r.summary as AssessmentRecord["summary"],
    saju: r.saju as AssessmentRecord["saju"],
    createdAt: r.created_at as string,
  };
}

function toOrder(r: Row): OrderRecord {
  return {
    id: r.id as string,
    orderNumber: r.order_number as string,
    userId: r.user_id as string,
    assessmentId: r.assessment_id as string,
    productId: r.product_id as string,
    amount: r.amount as number,
    status: r.status as OrderRecord["status"],
    paymentKey: (r.payment_key as string | null) ?? null,
    method: (r.method as string | null) ?? null,
    approvedAt: (r.approved_at as string | null) ?? null,
    failureCode: (r.failure_code as string | null) ?? null,
    failureMessage: (r.failure_message as string | null) ?? null,
    // 4번째 마이그레이션 전의 DB에서도 읽을 수 있게 기본값을 둔다
    paymentEnv: ((r.payment_env as string | undefined) ?? "test") as OrderRecord["paymentEnv"],
    acquisition: toAcquisition(r),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/** 8번 마이그레이션 전의 DB에는 열이 없다 */
function toAcquisition(r: Row): OrderRecord["acquisition"] {
  const source = (r.acq_source as string | null | undefined) ?? null;
  const medium = (r.acq_medium as string | null | undefined) ?? null;
  const campaign = (r.acq_campaign as string | null | undefined) ?? null;
  return source || medium || campaign ? { source, medium, campaign } : null;
}

function toReport(r: Row): ReportRecord {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    orderId: r.order_id as string,
    assessmentId: r.assessment_id as string,
    status: r.status as ReportRecord["status"],
    content: (r.content as ReportRecord["content"]) ?? null,
    generator: (r.generator as string | null) ?? null,
    generatorVersion: (r.generator_version as string | null) ?? null,
    attempts: r.attempts as number,
    lastError: (r.last_error as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    readyAt: (r.ready_at as string | null) ?? null,
  };
}

/** camelCase 패치 → DB 컬럼 */
function toContext(r: Row): PersonalContext {
  return {
    assessmentId: r.assessment_id as string,
    userId: r.user_id as string,
    topic: r.topic as PersonalContext["topic"],
    question: (r.question as string) ?? "",
    situation: (r.situation as string) ?? "",
    matched: (r.matched as string) ?? "",
    differed: (r.differed as string) ?? "",
    excerpt: (r.excerpt as string) ?? "",
    agreedAt: r.agreed_at as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toConcernRecord(r: Row): ConcernRecord {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    assessmentId: r.assessment_id as string,
    topic: r.topic as ConcernRecord["topic"],
    question: (r.question as string) ?? "",
    situation: (r.situation as string) ?? "",
    matched: (r.matched as string) ?? "",
    differed: (r.differed as string) ?? "",
    excerpt: (r.excerpt as string) ?? "",
    writtenAt: r.written_at as string,
    agreedAt: r.agreed_at as string,
    createdAt: r.created_at as string,
    scrubbedAt: (r.scrubbed_at as string | null) ?? null,
  };
}

function toOps(r: Row): OpsEventRecord {
  return {
    id: r.id as number,
    createdAt: r.created_at as string,
    kind: r.kind as string,
    severity: r.severity as OpsEventRecord["severity"],
    orderNumber: (r.order_number as string | null) ?? null,
    errorId: (r.error_id as string | null) ?? null,
    dedupeKey: (r.dedupe_key as string | null) ?? null,
    message: r.message as string,
    detail: (r.detail as Record<string, unknown>) ?? {},
  };
}

function columns(patch: Record<string, unknown>, map: Record<string, string>): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && map[key]) out[map[key]] = value;
  }
  return out;
}

const ORDER_COLUMNS: Record<string, string> = {
  status: "status",
  paymentKey: "payment_key",
  method: "method",
  approvedAt: "approved_at",
  failureCode: "failure_code",
  failureMessage: "failure_message",
};

const REPORT_COLUMNS: Record<string, string> = {
  status: "status",
  content: "content",
  generator: "generator",
  generatorVersion: "generator_version",
  attempts: "attempts",
  lastError: "last_error",
  readyAt: "ready_at",
};

export function createSupabaseRepository(db: SupabaseClient): MiyuRepository {
  async function readProfile(userId: string) {
    const { data, error } = await db
      .from("profiles")
      .select("id, nickname, payment_customer_key")
      .eq("id", userId)
      .maybeSingle();
    if (error) fail("프로필 조회", error);
    if (!data) return null;
    return { userId: data.id as string, nickname: data.nickname as string | null, paymentCustomerKey: data.payment_customer_key as string };
  }

  return {
    async listConsents(userId): Promise<ConsentRecord[]> {
      const { data, error } = await db
        .from("user_consents")
        .select("consent_type, version, agreed, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) fail("동의 기록 조회", error);
      return (data ?? []).map((r) => ({ type: r.consent_type, version: r.version, agreed: r.agreed, createdAt: r.created_at }));
    },

    async addConsents(userId, consents) {
      const { error } = await db
        .from("user_consents")
        .insert(consents.map((c) => ({ user_id: userId, consent_type: c.type, version: c.version, agreed: c.agreed })));
      if (error) fail("동의 기록 저장", error);
    },

    getProfile: readProfile,

    async ensureProfile(userId) {
      const existing = await readProfile(userId);
      if (existing) return existing;
      const { error } = await db.from("profiles").upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
      if (error) fail("프로필 보완", error);
      const created = await readProfile(userId);
      if (!created) throw new Error("프로필 보완 실패: 저장 후 다시 읽지 못했습니다.");
      return created;
    },

    async withdrawMemberData(userId) {
      const { data, error } = await db.rpc("withdraw_member_data", { p_user_id: userId });
      if (error) {
        const msg = error.message ?? "";
        if (msg.includes("withdraw_blocked_pending_order")) return { ok: false, reason: "pending-order" };
        if (msg.includes("withdraw_blocked_report_in_progress")) return { ok: false, reason: "report-in-progress" };
        if (msg.includes("withdraw_blocked_cash_balance")) return { ok: false, reason: "cash-balance" };
        if (msg.includes("withdraw_not_found")) return { ok: false, reason: "not-found" };
        if (["PGRST202", "42883"].includes(error.code ?? "")) throw new Error("회원 탈퇴 처리 실패: DB 변경 10번(회원 탈퇴)을 먼저 적용해야 합니다.");
        fail("회원 탈퇴 처리", error);
      }
      const counts: Record<string, number> = {};
      for (const [k, v] of Object.entries((data ?? {}) as Record<string, unknown>)) counts[k] = Number(v) || 0;
      return { ok: true, counts };
    },

    async updateProfileNickname(userId, nickname) {
      const { error } = await db.from("profiles").update({ nickname }).eq("id", userId);
      if (error) fail("닉네임 저장", error);
    },

    async saveRegion(userId, region) {
      const { error } = await db
        .from("user_regions")
        .upsert({ user_id: userId, province: region.province, district: region.district || null });
      if (error) fail("지역 저장", error);
    },

    async insertAssessment(a) {
      const { data, error } = await db
        .from("assessments")
        .insert({
          user_id: a.userId,
          channel: a.channel,
          nickname: a.nickname,
          birth_calendar: a.calendar,
          birth_is_leap_month: a.isLeapMonth,
          birth_year: a.birthYear,
          birth_month: a.birthMonth,
          birth_day: a.birthDay,
          birth_time: a.birthTime,
          known_mbti: a.knownMbti,
          answers: a.answers,
          content_version: a.contentVersion,
          source: a.source,
          summary: a.summary,
          saju: a.saju,
        })
        .select()
        .single();
      if (error) fail("검사 결과 저장", error);
      return toAssessment(data);
    },

    async getAssessment(id) {
      const { data, error } = await db.from("assessments").select().eq("id", id).maybeSingle();
      if (error) {
        if (error.code === "22P02") return null; // uuid 형식이 아닌 주소
        fail("검사 결과 조회", error);
      }
      return data ? toAssessment(data) : null;
    },

    async listAssessments(userId) {
      const { data, error } = await db
        .from("assessments")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) fail("검사 목록 조회", error);
      return (data ?? []).map(toAssessment);
    },

    async getOrderByNumber(orderNumber) {
      const { data, error } = await db.from("orders").select().eq("order_number", orderNumber).maybeSingle();
      if (error) fail("주문 조회", error);
      return data ? toOrder(data) : null;
    },

    async listOrdersForAssessment(assessmentId) {
      const { data, error } = await db
        .from("orders")
        .select()
        .eq("assessment_id", assessmentId)
        .order("created_at", { ascending: false });
      if (error) fail("주문 목록 조회", error);
      return (data ?? []).map(toOrder);
    },

    async listOrdersForUser(userId) {
      const { data, error } = await db
        .from("orders")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) fail("주문 목록 조회", error);
      return (data ?? []).map(toOrder);
    },

    async insertOrder(o): Promise<InsertResult<OrderRecord>> {
      const base = {
        order_number: o.orderNumber,
        user_id: o.userId,
        assessment_id: o.assessmentId,
        product_id: o.productId,
        amount: o.amount,
        payment_env: o.paymentEnv,
      };
      const acq = o.acquisition;
      const withAcq = acq && (acq.source || acq.medium || acq.campaign) ? { ...base, acq_source: acq.source, acq_medium: acq.medium, acq_campaign: acq.campaign } : base;
      let { data, error } = await db.from("orders").insert(withAcq).select().single();
      // 8번 마이그레이션 전의 DB(출처 열 없음)에서도 결제는 막히지 않게, 출처만 빼고 다시 만든다
      if (error && withAcq !== base && (error.code === "42703" || error.code === "PGRST204" || /acq_(source|medium|campaign)/.test(error.message ?? ""))) {
        ({ data, error } = await db.from("orders").insert(base).select().single());
      }
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "conflict" };
        fail("주문 생성", error);
      }
      return { ok: true, value: toOrder(data) };
    },

    async updateOrder(id, from, patch) {
      const { data, error } = await db
        .from("orders")
        .update(columns(patch, ORDER_COLUMNS))
        .eq("id", id)
        .in("status", [...from])
        .select()
        .maybeSingle();
      if (error) fail("주문 변경", error);
      return data ? toOrder(data) : null;
    },

    async addPaymentEvent(event) {
      const { error } = await db.from("payment_events").insert({
        order_id: event.orderId,
        source: event.source,
        status: event.status,
        detail: event.detail,
      });
      if (error) fail("결제 기록 저장", error);
    },

    async addFunnelEvent(e) {
      const { error } = await db.from("funnel_events").insert({
        anon_id: e.anonId,
        name: e.name,
        path: e.path,
        src: e.src,
        medium: e.medium,
        campaign: e.campaign,
        referrer_host: e.referrerHost,
      });
      if (error && !isMissingTableError(error)) fail("방문 단계 기록", error);
    },

    async listFunnelEventsSince(since, limit) {
      const data = await fetchPages("방문 단계 조회", limit, (from, to) => db.from("funnel_events").select().gte("created_at", since).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to), true);
      return data.map((r) => ({
        id: r.id as number,
        createdAt: r.created_at as string,
        anonId: r.anon_id as string,
        name: r.name as FunnelEventName,
        path: (r.path as string | null) ?? null,
        src: (r.src as string | null) ?? null,
        medium: (r.medium as string | null) ?? null,
        campaign: (r.campaign as string | null) ?? null,
        referrerHost: (r.referrer_host as string | null) ?? null,
      }));
    },

    async listOrdersForMetrics(since, limit) {
      const data = await fetchPages("주문 집계 조회", limit, (from, to) => db.from("orders").select().gte("created_at", since).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to));
      return data.map((r) => {
        const o = toOrder(r);
        return { id: o.id, userId: o.userId, assessmentId: o.assessmentId, productId: o.productId, status: o.status, amount: o.amount, paymentEnv: o.paymentEnv, createdAt: o.createdAt, approvedAt: o.approvedAt, acquisition: o.acquisition ?? null };
      });
    },

    async listReportsForMetrics(since, limit) {
      const data = await fetchPages("리포트 집계 조회", limit, (from, to) => db.from("reports").select("id, order_id, status, created_at, ready_at").gte("created_at", since).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to));
      return data.map((r) => ({ id: r.id as string, orderId: r.order_id as string, status: r.status as ReportRecord["status"], createdAt: r.created_at as string, readyAt: (r.ready_at as string | null) ?? null }));
    },

    async countAssessmentsAllSince(since) {
      const { count, error } = await db.from("assessments").select("id", { count: "exact" }).gte("created_at", since).limit(1);
      if (error) fail("검사 수 조회", error);
      return count ?? 0;
    },

    async upsertFeedback(f) {
      const { error } = await db.from("report_feedback").upsert({ report_id: f.reportId, user_id: f.userId, rating: f.rating }, { onConflict: "report_id" });
      if (error) fail("만족도 저장", error);
    },

    async getFeedback(reportId) {
      const { data, error } = await db.from("report_feedback").select().eq("report_id", reportId).maybeSingle();
      if (error) {
        if (isMissingTableError(error)) return null;
        fail("만족도 조회", error);
      }
      return data ? { reportId: data.report_id as string, userId: data.user_id as string, rating: data.rating as number, createdAt: data.created_at as string, updatedAt: data.updated_at as string } : null;
    },

    async listFeedbackSince(since, limit) {
      const data = await fetchPages("만족도 집계 조회", limit, (from, to) => db.from("report_feedback").select().gte("created_at", since).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to), true);
      return data.map((r) => ({ reportId: r.report_id as string, userId: r.user_id as string, rating: r.rating as number, createdAt: r.created_at as string, updatedAt: r.updated_at as string }));
    },

    async countAssessmentsSince(userId, since) {
      const { count, error } = await db.from("assessments").select("id", { count: "exact", head: false }).eq("user_id", userId).gte("created_at", since).limit(1);
      if (error) fail("검사 수 조회", error);
      return count ?? 0;
    },

    async addAiUsage(u) {
      const { error } = await db.from("ai_usage").insert({
        report_id: u.reportId,
        provider: u.provider.slice(0, 60),
        model: u.model.slice(0, 100),
        prompt_version: u.promptVersion.slice(0, 100),
        input_tokens: u.inputTokens,
        output_tokens: u.outputTokens,
        est_cost_krw: u.estCostKrw,
        latency_ms: Math.max(0, Math.round(u.latencyMs)),
        outcome: u.outcome,
        error_code: u.errorCode?.slice(0, 60) ?? null,
      });
      if (error && !isMissingTableError(error)) fail("AI 사용 기록 저장", error);
    },

    async listAiUsageSince(since, limit) {
      const data = await fetchPages("AI 사용 기록 조회", limit, (from, to) => db.from("ai_usage").select().gte("created_at", since).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to), true);
      return data.map((r) => ({
        id: r.id as number,
        createdAt: r.created_at as string,
        reportId: (r.report_id as string | null) ?? null,
        provider: r.provider as string,
        model: r.model as string,
        promptVersion: r.prompt_version as string,
        inputTokens: (r.input_tokens as number | null) ?? null,
        outputTokens: (r.output_tokens as number | null) ?? null,
        estCostKrw: r.est_cost_krw === null || r.est_cost_krw === undefined ? null : Number(r.est_cost_krw),
        latencyMs: r.latency_ms as number,
        outcome: r.outcome as "ok" | "invalid" | "timeout" | "error",
        errorCode: (r.error_code as string | null) ?? null,
      }));
    },

    async sumAiCostSince(since) {
      // DB에서 합산한다 (행 수 제한에 걸리지 않게). 함수가 아직 없으면(9번 마이그레이션 전) 나눠서 가져와 더한다
      const { data, error } = await db.rpc("ai_cost_since", { p_since: since });
      if (!error && data !== null && data !== undefined) return Number(data);
      if (error && !["PGRST202", "42883", "PGRST205", "42P01"].includes(error.code ?? "")) fail("AI 비용 합계 조회", error);
      const rows = await fetchPages<{ est_cost_krw: number | string | null }>("AI 비용 합계 조회", 100_000, (from, to) => db.from("ai_usage").select("est_cost_krw").gte("created_at", since).order("id", { ascending: false }).range(from, to), true);
      return rows.reduce((n, r) => n + (r.est_cost_krw === null ? 0 : Number(r.est_cost_krw)), 0);
    },

    async countActiveGenerations(staleBefore) {
      const { count, error } = await db.from("reports").select("id", { count: "exact" }).eq("status", "generating").gte("updated_at", staleBefore).limit(1);
      if (error) fail("생성 중 리포트 수 조회", error);
      return count ?? 0;
    },

    async countQueuedReports() {
      const { count, error } = await db.from("reports").select("id", { count: "exact" }).eq("status", "queued").limit(1);
      if (error) fail("대기 중 리포트 수 조회", error);
      return count ?? 0;
    },

    async addOpsEvent(e) {
      const { error } = await db.from("ops_events").insert({
        kind: e.kind.slice(0, 60),
        severity: e.severity ?? "info",
        order_number: e.orderNumber ?? null,
        error_id: e.errorId ?? null,
        dedupe_key: e.dedupeKey ?? null,
        message: e.message.slice(0, 500),
        detail: e.detail ?? {},
      });
      if (error && !isMissingTableError(error)) fail("운영 기록 저장", error);
    },

    async listOpsEvents(filter) {
      let q = db.from("ops_events").select().order("created_at", { ascending: false }).order("id", { ascending: false }).limit(filter.limit);
      if (filter.orderNumber) q = q.eq("order_number", filter.orderNumber);
      if (filter.errorId) q = q.eq("error_id", filter.errorId);
      if (filter.kinds?.length) q = q.in("kind", filter.kinds);
      if (filter.since) q = q.gte("created_at", filter.since);
      const { data, error } = await q;
      if (error) {
        if (isMissingTableError(error)) return [];
        fail("운영 기록 조회", error);
      }
      return (data ?? []).map(toOps);
    },

    async hasOpsEventSince(dedupeKey, since) {
      const { data, error } = await db.from("ops_events").select("id").eq("dedupe_key", dedupeKey).gte("created_at", since).limit(1);
      if (error) {
        if (isMissingTableError(error)) return false;
        fail("운영 기록 조회", error);
      }
      return (data ?? []).length > 0;
    },

    async listOrdersForReconcile(opts) {
      const [pending, paid] = await Promise.all([
        db.from("orders").select().eq("status", "pending").lt("created_at", opts.pendingCreatedBefore).order("created_at", { ascending: true }).limit(opts.limit),
        db.from("orders").select().eq("status", "paid").gte("approved_at", opts.paidSince).order("approved_at", { ascending: false }).limit(opts.limit),
      ]);
      if (pending.error) fail("재확인 대상 조회", pending.error);
      if (paid.error) fail("재확인 대상 조회", paid.error);
      return [...(pending.data ?? []), ...(paid.data ?? [])].slice(0, opts.limit).map(toOrder);
    },

    async listOrdersWithOpenPacks({ userId, limit }) {
      // 묶음 장부(question_packs)에서 남은 질문이 있는 줄을 찾는다 — 열의 값끼리 비교하는 조건은 쓸 수 없어 읽어 온 뒤 거른다
      let packs = db.from("question_packs").select("order_id, questions, used, refunded_questions").order("purchased_at", { ascending: false }).limit(userId ? 200 : 1000);
      if (userId) packs = packs.eq("user_id", userId);
      const { data, error } = await packs;
      if (error) {
        if (isMissingTableError(error)) return []; // 16번 전
        fail("남은 질문이 있는 묶음 조회", error);
      }
      const ids = (data ?? [])
        .filter((r) => Number(r.questions) - Number(r.used) - Number(r.refunded_questions) > 0)
        .reverse() // 오래된 순
        .slice(0, limit)
        .map((r) => r.order_id as string);
      if (ids.length === 0) return [];
      const orders = await db.from("orders").select().in("id", ids).eq("status", "paid").order("approved_at", { ascending: true });
      if (orders.error) fail("남은 질문이 있는 묶음의 주문 조회", orders.error);
      return (orders.data ?? []).map(toOrder);
    },

    async listRecentOrders(limit) {
      const { data, error } = await db.from("orders").select().order("created_at", { ascending: false }).limit(limit);
      if (error) fail("최근 주문 조회", error);
      return (data ?? []).map(toOrder);
    },

    async getOrderById(id) {
      const { data, error } = await db.from("orders").select().eq("id", id).maybeSingle();
      if (error) {
        if (error.code === "22P02") return null;
        fail("주문 조회", error);
      }
      return data ? toOrder(data) : null;
    },

    async listProblemReports(opts) {
      let q = db
        .from("reports")
        .select("id, order_id, assessment_id, status, attempts, last_error, created_at, updated_at")
        .in("status", [...opts.statuses])
        .order("updated_at", { ascending: true })
        .limit(opts.limit);
      if (opts.updatedBefore) q = q.lt("updated_at", opts.updatedBefore);
      const { data, error } = await q;
      if (error) fail("문제 리포트 조회", error);
      return (data ?? []).map((r) => ({
        id: r.id as string,
        orderId: r.order_id as string,
        assessmentId: r.assessment_id as string,
        status: r.status as ReportRecord["status"],
        attempts: r.attempts as number,
        lastError: (r.last_error as string | null) ?? null,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      }));
    },

    async getContext(assessmentId) {
      const { data, error } = await db.from("personal_contexts").select().eq("assessment_id", assessmentId).maybeSingle();
      if (error) {
        if (error.code === "22P02" || isMissingTableError(error)) return null;
        fail("반영 정보 조회", error);
      }
      return data ? toContext(data) : null;
    },

    async listContexts(userId) {
      const { data, error } = await db.from("personal_contexts").select("assessment_id, topic, updated_at").eq("user_id", userId);
      if (error) {
        if (isMissingTableError(error)) return [];
        fail("반영 정보 목록 조회", error);
      }
      return (data ?? []).map((r) => ({ assessmentId: r.assessment_id as string, topic: r.topic as PersonalContext["topic"], updatedAt: r.updated_at as string }));
    },

    async upsertContext(c) {
      const { data, error, status } = await db
        .from("personal_contexts")
        .upsert({
          assessment_id: c.assessmentId,
          user_id: c.userId,
          topic: c.topic,
          question: c.question,
          situation: c.situation,
          matched: c.matched,
          differed: c.differed,
          excerpt: c.excerpt,
          agreed_at: c.agreedAt,
        })
        .select()
        .single();
      if (error) {
        // 테이블이 없을 때 저장(.single)은 상태 404에 빈 오류가 온다 (조회 · 삭제는 42P01 코드가 있다)
        fail("반영 정보 저장", status === 404 && !error.code ? { code: "42P01", message: "personal_contexts 테이블이 없습니다" } : error);
      }
      return toContext(data);
    },

    async deleteContext(assessmentId) {
      const { error } = await db.from("personal_contexts").delete().eq("assessment_id", assessmentId);
      if (error) fail("반영 정보 삭제", error);
    },

    async insertConcernRecord(c): Promise<InsertResult<ConcernRecord>> {
      const { data, error, status } = await db
        .from("concern_records")
        .insert({
          assessment_id: c.assessmentId,
          user_id: c.userId,
          topic: c.topic,
          question: c.question,
          situation: c.situation,
          matched: c.matched,
          differed: c.differed,
          excerpt: c.excerpt,
          written_at: c.writtenAt,
          agreed_at: c.agreedAt,
        })
        .select()
        .single();
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "conflict" };
        // 테이블이 없을 때 저장(.single)은 상태 404에 빈 오류가 온다
        fail("고민 기록 저장", status === 404 && !error.code ? { code: "42P01", message: "concern_records 테이블이 없습니다" } : error);
      }
      return { ok: true, value: toConcernRecord(data) };
    },

    async getConcernRecord(id) {
      const { data, error } = await db.from("concern_records").select().eq("id", id).maybeSingle();
      if (error) {
        if (error.code === "22P02" || isMissingTableError(error)) return null;
        fail("고민 기록 조회", error);
      }
      return data ? toConcernRecord(data) : null;
    },

    async listConcernRecords(assessmentId) {
      const { data, error } = await db.from("concern_records").select().eq("assessment_id", assessmentId).order("created_at", { ascending: false }).order("id", { ascending: false });
      if (error) {
        if (error.code === "22P02" || isMissingTableError(error)) return [];
        fail("고민 기록 목록 조회", error);
      }
      return (data ?? []).map(toConcernRecord);
    },

    async listConcernRecordSummaries(userId) {
      const { data, error } = await db
        .from("concern_records")
        .select("id, assessment_id, topic, written_at, created_at, scrubbed_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (error) {
        if (isMissingTableError(error)) return [];
        fail("고민 기록 요약 조회", error);
      }
      return (data ?? []).map((r) => ({
        id: r.id as string,
        assessmentId: r.assessment_id as string,
        topic: r.topic as ConcernRecord["topic"],
        writtenAt: r.written_at as string,
        createdAt: r.created_at as string,
        scrubbedAt: (r.scrubbed_at as string | null) ?? null,
      }));
    },

    async scrubConcernRecord(id, at) {
      // 지우는 것만 허용하는 DB 규칙(트리거)에 맞춰, 글을 비우고 지운 시각을 적는다 (이미 지웠으면 바뀌는 행이 없다)
      const { error, status } = await db
        .from("concern_records")
        .update({ question: "", situation: "", matched: "", differed: "", excerpt: "", scrubbed_at: at })
        .eq("id", id)
        .is("scrubbed_at", null);
      if (error) {
        // 테이블이 없을 때 수정은 상태 404에 빈 오류가 온다 (조회는 PGRST205 코드가 있다)
        if (isMissingTableError(error) || (status === 404 && !error.code)) return;
        fail("고민 기록 내용 지우기", error);
      }
    },

    async getTalkRoom(assessmentId, roomKey) {
      const { data, error } = await db.from("talk_rooms").select().eq("assessment_id", assessmentId).eq("room_key", roomKey).maybeSingle();
      if (error) {
        if (isMissingTableError(error)) return null;
        fail("대화 조회", error);
      }
      return data ? toTalkRoom(data as Row) : null;
    },
    async listTalkRoomKeys(assessmentId) {
      const { data, error } = await db.from("talk_rooms").select("room_key").eq("assessment_id", assessmentId);
      if (error) {
        if (isMissingTableError(error)) return [];
        fail("대화 목록 조회", error);
      }
      return (data ?? []).map((r) => (r as Row).room_key as string);
    },
    async upsertTalkRoom(input) {
      const { error, status } = await db
        .from("talk_rooms")
        .upsert({ assessment_id: input.assessmentId, user_id: input.userId, room_key: input.roomKey, actions: input.actions, version: 2 }, { onConflict: "assessment_id,room_key" });
      if (error) fail("대화 저장", status === 404 && !error.code ? { code: "42P01", message: "talk_rooms 테이블이 없습니다" } : error);
    },
    async deleteTalkRoom(assessmentId, roomKey) {
      const { error } = await db.from("talk_rooms").delete().eq("assessment_id", assessmentId).eq("room_key", roomKey);
      if (error && !isMissingTableError(error)) fail("대화 삭제", error);
    },
    async deleteTalkRoomsBefore(assessmentId, prefix, keepKey) {
      const { error } = await db.from("talk_rooms").delete().eq("assessment_id", assessmentId).like("room_key", `${prefix}%`).lt("room_key", keepKey);
      if (error && !isMissingTableError(error)) fail("지난 대화 정리", error);
    },
    async claimTalkRoomSegment(assessmentId, roomKey, from, to) {
      const { data, error, status } = await db.from("talk_rooms").update({ saved_upto: to }).eq("assessment_id", assessmentId).eq("room_key", roomKey).eq("saved_upto", from).select("room_key");
      if (error) fail("채팅 요약 위치 잡기", summaryNotReady("talk_rooms.saved_upto 열", error, status));
      return (data ?? []).length > 0;
    },
    async releaseTalkRoomSegment(assessmentId, roomKey, from, to) {
      const { error } = await db.from("talk_rooms").update({ saved_upto: from }).eq("assessment_id", assessmentId).eq("room_key", roomKey).eq("saved_upto", to);
      if (error && !isMissingTableError(error)) fail("채팅 요약 위치 되돌리기", error);
    },
    async insertChatSummary(input) {
      const { data, error, status } = await db
        .from("chat_summaries")
        .insert({ user_id: input.userId, assessment_id: input.assessmentId, room: input.room, visible: input.visible, items: input.items })
        .select()
        .single();
      if (error || !data) fail("채팅 요약 저장", summaryNotReady("chat_summaries 테이블", error ?? { message: "저장된 줄이 돌아오지 않았습니다" }, status));
      return toChatSummary(data as Row);
    },
    async listChatSummaries(userId, opts) {
      let q = db.from("chat_summaries").select().eq("user_id", userId);
      if (opts.visibleOnly) q = q.eq("visible", true);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(opts.limit ?? 500);
      if (error) {
        if (isMissingTableError(error)) return [];
        fail("채팅 요약 목록 조회", error);
      }
      return (data ?? []).map((r) => toChatSummary(r as Row));
    },
    async listRoomChatSummaries(userId, assessmentId, room, limit) {
      const { data, error } = await db.from("chat_summaries").select().eq("user_id", userId).eq("assessment_id", assessmentId).eq("room", room).order("created_at", { ascending: false }).limit(limit);
      if (error) {
        if (isMissingTableError(error)) return [];
        fail("방별 채팅 요약 조회", error);
      }
      return (data ?? []).map((r) => toChatSummary(r as Row));
    },
    async countVisibleChatSummaries(userId) {
      const { count, error } = await db.from("chat_summaries").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("visible", true);
      if (error) {
        if (isMissingTableError(error)) return 0;
        fail("채팅 요약 개수 조회", error);
      }
      return count ?? 0;
    },
    async deleteChatSummary(userId, id) {
      const { data, error } = await db.from("chat_summaries").delete().eq("user_id", userId).eq("id", id).select("id");
      if (error) {
        if (isMissingTableError(error)) return false;
        fail("채팅 요약 삭제", error);
      }
      return (data ?? []).length > 0;
    },
    async deleteChatSummaries(userId) {
      const { count, error } = await db.from("chat_summaries").delete({ count: "exact" }).eq("user_id", userId);
      if (error) {
        if (isMissingTableError(error)) return 0;
        fail("채팅 요약 모두 삭제", error);
      }
      return count ?? 0;
    },
    async deleteExpiredHiddenChatSummaries(before) {
      const { count, error } = await db.from("chat_summaries").delete({ count: "exact" }).eq("visible", false).lt("created_at", before);
      if (error) {
        if (isMissingTableError(error)) return 0;
        fail("지난 참고 기록 정리", error);
      }
      return count ?? 0;
    },
    async trimHiddenChatSummaries(userId, assessmentId, room, keep) {
      const { data, error } = await db.from("chat_summaries").select("id").eq("user_id", userId).eq("assessment_id", assessmentId).eq("room", room).eq("visible", false).order("created_at", { ascending: false }).range(keep, keep + 199);
      if (error) {
        if (isMissingTableError(error)) return;
        fail("참고 기록 정리 조회", error);
      }
      const ids = (data ?? []).map((r) => (r as Row).id as string);
      if (ids.length === 0) return;
      const del = await db.from("chat_summaries").delete().eq("user_id", userId).in("id", ids);
      if (del.error && !isMissingTableError(del.error)) fail("참고 기록 정리", del.error);
    },
    async addChatQuestion(input) {
      const { error, status } = await db.from("chat_questions").insert({ user_id: input.userId, assessment_id: input.assessmentId, room_key: input.roomKey });
      if (error) fail("자유 질문 횟수 기록", status === 404 && !error.code ? { code: "42P01", message: "chat_questions 테이블이 없습니다" } : error);
    },
    async countChatQuestionsSince(userId, since) {
      const { count, error } = await db.from("chat_questions").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
      if (error) fail("자유 질문 횟수 조회", error);
      return count ?? 0;
    },
    async countChatQuestionsInRoom(userId, roomKey) {
      // DB 변경 16번 이후: 확정된 질문 + 10분 안의 예약만 센다 (함수가 없으면 예전처럼 줄 수를 센다)
      const viaFn = await db.rpc("count_chat_questions_in_room", { p_user_id: userId, p_room_key: roomKey });
      if (!viaFn.error) return Number(viaFn.data ?? 0);
      if (!isMissingFunction(viaFn.error) && !isMissingTableError(viaFn.error)) fail("방별 질문 횟수 조회", viaFn.error);
      const { count, error } = await db.from("chat_questions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("room_key", roomKey);
      if (error) fail("방별 질문 횟수 조회", error);
      return count ?? 0;
    },
    async reserveChatQuestion({ userId, assessmentId, roomKey, max }): Promise<ChatReservation | null> {
      const { data, error } = await db.rpc("reserve_chat_question", { p_user_id: userId, p_assessment_id: assessmentId, p_room_key: roomKey, p_max: max });
      if (error) {
        // 16번 전: 예전 방식(답을 받은 뒤에 센다) — 한도 확인은 호출한 쪽의 줄 수 확인에 맡긴다
        if (isMissingFunction(error)) return { id: null };
        fail("무료 질문 자리 예약", error);
      }
      return data === null || data === undefined ? null : { id: Number(data) };
    },
    async confirmChatQuestion(reservation, input) {
      if (reservation.id === null) {
        const { error, status } = await db.from("chat_questions").insert({ user_id: input.userId, assessment_id: input.assessmentId, room_key: input.roomKey });
        if (error) fail("자유 질문 횟수 기록", status === 404 && !error.code ? { code: "42P01", message: "chat_questions 테이블이 없습니다" } : error);
        return;
      }
      const { error } = await db.rpc("confirm_chat_question", { p_id: reservation.id, p_user_id: input.userId, p_assessment_id: input.assessmentId, p_room_key: input.roomKey });
      if (error) fail("자유 질문 횟수 확정", error);
    },
    async releaseChatQuestion(reservation, input) {
      if (reservation.id === null) return;
      const { error } = await db.rpc("release_chat_question", { p_id: reservation.id, p_user_id: input.userId });
      if (error) fail("무료 질문 자리 풀기", error);
    },

    // 맛보기 리포트 — 표 · 함수가 없으면(DB 변경 17번 전) 코드 42P01로 통일해 던진다 (호출한 쪽이 "준비 중"으로 다룬다)
    async getTasteReport(userId) {
      const { data, error, status } = await db.from("taste_reports").select("user_id, assessment_id, status, content, generator, generator_version, created_at").eq("user_id", userId).maybeSingle();
      if (error) fail("맛보기 리포트 조회", tasteNotReady("taste_reports 테이블", error, status));
      return data ? toTaste(data as Row) : null;
    },
    async reserveTasteReport({ userId, assessmentId }): Promise<TasteReservation> {
      const { data, error } = await db.rpc("reserve_taste_report", { p_user_id: userId, p_assessment_id: assessmentId });
      if (error) fail("맛보기 리포트 자리 예약", tasteNotReady("reserve_taste_report 함수", error));
      const r = (data ?? {}) as Row;
      if (r.state === "reserved") return { state: "reserved" };
      if (r.state === "busy") return { state: "busy" };
      if (r.state === "ready") {
        return {
          state: "ready",
          record: {
            userId,
            assessmentId: r.assessmentId as string,
            status: "ready",
            content: r.content ?? null,
            generator: (r.generator as string | null) ?? null,
            generatorVersion: (r.generatorVersion as string | null) ?? null,
            createdAt: r.createdAt as string,
          },
        };
      }
      fail("맛보기 리포트 자리 예약", { message: "알 수 없는 예약 결과입니다" });
    },
    async saveTasteReport({ userId, assessmentId, content, generator, generatorVersion }) {
      const { error } = await db.rpc("save_taste_report", { p_user_id: userId, p_assessment_id: assessmentId, p_content: content, p_generator: generator, p_generator_version: generatorVersion });
      if (error) fail("맛보기 리포트 저장", tasteNotReady("save_taste_report 함수", error));
    },
    async releaseTasteReport({ userId, assessmentId }) {
      const { error } = await db.rpc("release_taste_report", { p_user_id: userId, p_assessment_id: assessmentId });
      if (error) fail("맛보기 리포트 자리 풀기", tasteNotReady("release_taste_report 함수", error));
    },

    // 초대 링크 · 초대 할인 — 표 · 함수가 없으면(DB 변경 18번 전) 코드 42P01로 통일해 던진다
    async createInvite({ userId, assessmentId, token, tier }) {
      const found = await db.from("invites").select().eq("assessment_id", assessmentId).maybeSingle();
      if (found.error) fail("초대 링크 조회", inviteNotReady("invites 테이블", found.error, found.status));
      if (found.data) {
        if ((found.data as Row).inviter_user_id !== userId) fail("초대 링크 만들기", { message: "다른 회원의 결과입니다" });
        return toInvite(found.data as Row);
      }
      const { data, error, status } = await db.from("invites").insert({ token, inviter_user_id: userId, assessment_id: assessmentId, inviter_tier: tier }).select().single();
      if (error) {
        // 동시에 두 번 눌러 다른 요청이 먼저 만들었다면 그 링크를 쓴다
        if (error.code === "23505") {
          const again = await db.from("invites").select().eq("assessment_id", assessmentId).maybeSingle();
          if (again.data && (again.data as Row).inviter_user_id === userId) return toInvite(again.data as Row);
        }
        fail("초대 링크 만들기", inviteNotReady("invites 테이블", error, status));
      }
      return toInvite(data as Row);
    },
    async getInviteByAssessment(userId, assessmentId) {
      const { data, error, status } = await db.from("invites").select().eq("assessment_id", assessmentId).eq("inviter_user_id", userId).maybeSingle();
      if (error) fail("초대 링크 조회", inviteNotReady("invites 테이블", error, status));
      return data ? toInvite(data as Row) : null;
    },
    async getInviteByToken(token) {
      const { data, error, status } = await db.from("invites").select().eq("token", token).maybeSingle();
      if (error) fail("초대 링크 조회", inviteNotReady("invites 테이블", error, status));
      return data ? toInvite(data as Row) : null;
    },
    async inviteDiscountStatus({ token, inviteeUserId, cap }) {
      const { data, error } = await db.rpc("invite_discount_status", { p_token: token, p_invitee: inviteeUserId, p_cap: cap });
      if (error) fail("초대 할인 확인", inviteNotReady("invite_discount_status 함수", error));
      return toInviteCheck(data);
    },
    async claimInviteDiscount({ token, inviteeUserId, orderId, cap }) {
      const { data, error } = await db.rpc("claim_invite_discount", { p_token: token, p_invitee: inviteeUserId, p_order: orderId, p_cap: cap });
      if (error) fail("초대 할인 확정", inviteNotReady("claim_invite_discount 함수", error));
      return toInviteCheck(data);
    },
    async countInviteDiscountsUsed(inviterUserId) {
      const { data, error, status } = await db.from("invite_discounts").select("order_id, orders!inner(status, created_at)").eq("inviter_user_id", inviterUserId);
      if (error) fail("초대 할인 수 조회", inviteNotReady("invite_discounts 테이블", error, status));
      const hourAgo = Date.now() - 3600_000;
      return ((data ?? []) as unknown as { orders: { status: string; created_at: string } | { status: string; created_at: string }[] }[]).filter((r) => {
        const o = Array.isArray(r.orders) ? r.orders[0] : r.orders;
        return o && (o.status === "paid" || (o.status === "pending" && new Date(o.created_at).getTime() > hourAgo));
      }).length;
    },

    // 미유캐시 — 표 · 함수가 없으면(DB 변경 13번 전) 코드 42P01로 통일해 던진다 (호출한 쪽이 "캐시 준비 중"으로 다룬다)
    async getCashBalance(userId) {
      const { data, error } = await db.from("cash_wallets").select("balance").eq("user_id", userId).maybeSingle();
      if (error) fail("미유캐시 잔액 조회", isMissingTableError(error) ? { code: "42P01", message: "cash_wallets 테이블이 없습니다" } : error);
      return Number((data as { balance?: number } | null)?.balance ?? 0);
    },
    async listCashLedger(userId, limit) {
      const { data, error } = await db.from("cash_ledger").select("id, kind, amount, order_id, shortfall, created_at").eq("user_id", userId).order("id", { ascending: false }).limit(limit);
      if (error) fail("미유캐시 내역 조회", isMissingTableError(error) ? { code: "42P01", message: "cash_ledger 테이블이 없습니다" } : error);
      return (data ?? []).map((r) => ({ id: Number(r.id), kind: r.kind as CashLedgerRecord["kind"], amount: Number(r.amount), orderId: (r.order_id as string | null) ?? null, shortfall: Number(r.shortfall ?? 0), createdAt: r.created_at as string }));
    },
    async spendCash({ userId, amount, ref }) {
      const { data, error } = await db.rpc("spend_cash", { p_user_id: userId, p_amount: amount, p_ref: ref });
      if (error) fail("미유캐시 차감", ["PGRST202", "42883"].includes(error.code ?? "") || isMissingTableError(error) ? { code: "42P01", message: "spend_cash 함수가 없습니다 (DB 변경 13번 필요)" } : error);
      return data === null || data === undefined ? null : Number(data);
    },
    async restoreCashSpend({ userId, ref }) {
      const { data, error } = await db.rpc("restore_cash_spend", { p_user_id: userId, p_ref: ref });
      if (error) fail("미유캐시 되돌림", ["PGRST202", "42883"].includes(error.code ?? "") || isMissingTableError(error) ? { code: "42P01", message: "restore_cash_spend 함수가 없습니다 (DB 변경 13번 필요)" } : error);
      return data === null || data === undefined ? null : Number(data);
    },
    async getQuestionPack(orderId): Promise<QuestionPackRecord | null> {
      const { data, error } = await db
        .from("question_packs")
        .select("order_id, user_id, questions, price_krw, used, refunded_questions, refunded_krw, purchased_at")
        .eq("order_id", orderId)
        .maybeSingle();
      if (error) {
        if (isMissingTableError(error)) return null; // 16번 전
        fail("질문 묶음 장부 조회", error);
      }
      if (!data) return null;
      const r = data as Row;
      return {
        orderId: r.order_id as string,
        userId: r.user_id as string,
        questions: Number(r.questions),
        priceKrw: Number(r.price_krw),
        used: Number(r.used),
        refundedQuestions: Number(r.refunded_questions),
        refundedKrw: Number(r.refunded_krw),
        purchasedAt: r.purchased_at as string,
      };
    },
    async applyCashRefund({ orderId, canceledTotal }): Promise<CashRefundResult> {
      const { data, error } = await db.rpc("apply_cash_refund", { p_order_id: orderId, p_canceled_total: canceledTotal });
      if (error) {
        if (isMissingFunction(error) || isMissingTableError(error)) return { status: "unavailable" };
        fail("질문 묶음 환불 반영", error);
      }
      const r = (data ?? {}) as { status?: string; questions?: number; refunded_krw?: number; clawed?: number; shortfall?: number; allowed?: number[] };
      switch (r.status) {
        case "applied":
          return { status: "applied", questions: Number(r.questions), refundedKrw: Number(r.refunded_krw), clawed: Number(r.clawed), shortfall: Number(r.shortfall) };
        case "already":
          return { status: "already", questions: Number(r.questions), refundedKrw: Number(r.refunded_krw) };
        case "no_pack":
          return { status: "no-pack" };
        case "invalid_amount":
          return { status: "invalid-amount", allowed: (r.allowed ?? []).map(Number) };
        case "amount_mismatch":
          return { status: "amount-mismatch", allowed: (r.allowed ?? []).map(Number), refundedKrw: Number(r.refunded_krw ?? 0) };
        default:
          throw new Error("질문 묶음 환불 반영: 알 수 없는 결과");
      }
    },
    async adminCreditQuestion(orderId) {
      const { data, error } = await db.rpc("admin_credit_question", { p_order_id: orderId });
      if (error) {
        if (error.code === "22P02") return "not-found";
        fail("질문 수동 반영", ["PGRST202", "42883"].includes(error.code ?? "") || isMissingTableError(error) ? { code: "42P01", message: "admin_credit_question 함수가 없습니다 (DB 변경 15번 필요)" } : error);
      }
      const result = String(data ?? "");
      if (result === "credited" || result === "already" || result === "not_paid" || result === "not_cash" || result === "not_found") return result.replace("_", "-") as "credited" | "already" | "not-paid" | "not-cash" | "not-found";
      throw new Error("질문 수동 반영: 알 수 없는 결과");
    },

    async listPaymentEvents(orderId) {
      const { data, error } = await db
        .from("payment_events")
        .select("source, status, detail, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) fail("결제 기록 조회", error);
      return (data ?? []).map((e) => ({ source: e.source, status: e.status, detail: (e.detail ?? {}) as Record<string, unknown>, createdAt: e.created_at }));
    },

    async getReportByOrder(orderId) {
      const { data, error } = await db.from("reports").select().eq("order_id", orderId).maybeSingle();
      if (error) fail("리포트 조회", error);
      return data ? toReport(data) : null;
    },

    async listReportStatuses(userId): Promise<ReportStatusRecord[]> {
      const { data, error } = await db
        .from("reports")
        .select("id, order_id, assessment_id, status, generator, generator_version, ready_at")
        .eq("user_id", userId);
      if (error) fail("리포트 목록 조회", error);
      return (data ?? []).map((r) => ({
        id: r.id,
        orderId: r.order_id,
        assessmentId: r.assessment_id,
        status: r.status,
        generator: (r.generator as string | null) ?? null,
        generatorVersion: (r.generator_version as string | null) ?? null,
        readyAt: (r.ready_at as string | null) ?? null,
      }));
    },

    async insertReport(r): Promise<InsertResult<ReportRecord>> {
      const { data, error } = await db
        .from("reports")
        .insert({
          user_id: r.userId,
          order_id: r.orderId,
          assessment_id: r.assessmentId,
          status: r.status,
          attempts: r.attempts,
        })
        .select()
        .single();
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "conflict" };
        fail("리포트 생성", error);
      }
      return { ok: true, value: toReport(data) };
    },

    async updateReport(id, from, patch, expectedAttempts) {
      let query = db
        .from("reports")
        .update(columns(patch, REPORT_COLUMNS))
        .eq("id", id)
        .in("status", [...from]);
      if (expectedAttempts !== undefined) query = query.eq("attempts", expectedAttempts);
      const { data, error } = await query.select().maybeSingle();
      if (error) fail("리포트 변경", error);
      return data ? toReport(data) : null;
    },
  };
}
