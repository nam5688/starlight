// Supabase(Postgres) 저장소 — 서비스의 MiyuRepository 구현.
// Next.js에 의존하지 않는다. 어떤 클라이언트를 넘기느냐로 권한이 달라진다.
// - 로그인한 사용자 클라이언트: DB 접근 정책(RLS) 때문에 본인 행만 읽을 수 있고, 쓰기는 거부된다
// - 서버 비밀키 클라이언트: 쓰기용. 서비스가 소유자를 직접 확인한 뒤에만 쓴다

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsentRecord } from "../../membership/terms.ts";
import type {
  AssessmentRecord,
  InsertResult,
  MiyuRepository,
  OrderRecord,
  ReportRecord,
  ReportStatusRecord,
} from "../../services/ports.ts";

type Row = Record<string, unknown>;

const UNIQUE_VIOLATION = "23505";

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
