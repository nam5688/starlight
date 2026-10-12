// Supabase(Postgres) 저장소 — 서비스의 MiyuRepository 구현.
// Next.js에 의존하지 않는다. 어떤 클라이언트를 넘기느냐로 권한이 달라진다.
// - 로그인한 사용자 클라이언트: DB 접근 정책(RLS) 때문에 본인 행만 읽을 수 있고, 쓰기는 거부된다
// - 서버 비밀키 클라이언트: 쓰기용. 서비스가 소유자를 직접 확인한 뒤에만 쓴다

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsentRecord } from "../../membership/terms.ts";
import type { PersonalContext } from "../../personalization/context.ts";
import type {
  AssessmentRecord,
  InsertResult,
  MiyuRepository,
  OpsEventRecord,
  OrderRecord,
  ReportRecord,
  ReportStatusRecord,
} from "../../services/ports.ts";

type Row = Record<string, unknown>;

const UNIQUE_VIOLATION = "23505";
/** 테이블이 아직 없음 (PostgREST · Postgres) — 선택 기능은 꺼진 것으로 보고 기존 화면은 그대로 동작하게 한다 */
const MISSING_TABLE = new Set(["PGRST205", "42P01"]);
export const isMissingTableError = (error: { code?: string | null } | null | undefined) => Boolean(error?.code && MISSING_TABLE.has(error.code));

function fail(context: string, error: { message: string; code?: string }): never {
  const e = new Error(`${context}: ${error.message}`) as Error & { code?: string };
  e.code = error.code;
  throw e;
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
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
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
      const { data, error } = await db
        .from("orders")
        .insert({
          order_number: o.orderNumber,
          user_id: o.userId,
          assessment_id: o.assessmentId,
          product_id: o.productId,
          amount: o.amount,
          payment_env: o.paymentEnv,
        })
        .select()
        .single();
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
      const { data, error } = await db.from("ai_usage").select().gte("created_at", since).order("created_at", { ascending: false }).limit(limit);
      if (error) {
        if (isMissingTableError(error)) return [];
        fail("AI 사용 기록 조회", error);
      }
      return (data ?? []).map((r) => ({
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
        .select("id, order_id, assessment_id, status")
        .eq("user_id", userId);
      if (error) fail("리포트 목록 조회", error);
      return (data ?? []).map((r) => ({
        id: r.id,
        orderId: r.order_id,
        assessmentId: r.assessment_id,
        status: r.status,
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
