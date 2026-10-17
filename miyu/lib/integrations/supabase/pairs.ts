// 리포트 궁합의 쌍 Supabase 저장소 — PairRepository 구현. 서버 비밀키 클라이언트로만 쓴다(브라우저 권한으로는 이 표 · 함수에 접근할 수 없다).
// DB 변경 24번이 없으면(표 · 함수 없음) 코드 42P01로 통일해 던진다 — 호출한 쪽이 "준비 중"으로 다루고 기존 화면은 그대로 동작한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JoinPairResult, NewPair, PairChangeResult, PairRecord, PairRepository, PairStatus } from "../../services/pair-ports.ts";
import type { InsertResult } from "../../services/ports.ts";

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };

const MISSING = new Set(["PGRST202", "42883", "PGRST205", "42P01"]);
const UNIQUE_VIOLATION = "23505";

function fail(context: string, error: DbError, status?: number): never {
  const missing = (error.code && MISSING.has(error.code)) || (status === 404 && !error.code);
  const e = new Error(`${context}: ${missing ? "리포트 궁합 표 · 함수가 없습니다 (DB 변경 24번 필요)" : error.message}`) as Error & { code?: string };
  e.code = missing ? "42P01" : error.code;
  throw e;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const nstr = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function toPair(r: Row): PairRecord {
  return {
    id: str(r.id),
    token: str(r.token),
    aUserId: str(r.a_user_id),
    aAssessmentId: str(r.a_assessment_id),
    aConsentAt: str(r.a_consent_at),
    aConsentVersion: str(r.a_consent_version),
    aWithdrawnAt: nstr(r.a_withdrawn_at),
    bUserId: nstr(r.b_user_id),
    bAssessmentId: nstr(r.b_assessment_id),
    bConsentAt: nstr(r.b_consent_at),
    bConsentVersion: nstr(r.b_consent_version),
    bWithdrawnAt: nstr(r.b_withdrawn_at),
    status: (r.status as PairStatus) ?? "invited",
    unlinkedAt: nstr(r.unlinked_at),
    unlinkedBy: nstr(r.unlinked_by),
    expiresAt: str(r.expires_at),
    createdAt: str(r.created_at),
  };
}

export function createSupabasePairRepository(db: SupabaseClient): PairRepository {
  const byId = async (id: string): Promise<PairRecord | null> => {
    const { data, error, status } = await db.from("pairs").select().eq("id", id).maybeSingle();
    if (error) {
      if (error.code === "22P02") return null;
      fail("쌍 조회", error, status);
    }
    return data ? toPair(data) : null;
  };

  return {
    async createPair(p: NewPair): Promise<InsertResult<PairRecord>> {
      const { data, error, status } = await db
        .from("pairs")
        .insert({ id: p.id, token: p.token, a_user_id: p.aUserId, a_assessment_id: p.aAssessmentId, a_consent_at: p.aConsentAt, a_consent_version: p.aConsentVersion, expires_at: p.expiresAt })
        .select()
        .single();
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "conflict" };
        fail("쌍 만들기", error, status);
      }
      return { ok: true, value: toPair(data) };
    },
    getPair: byId,
    async getPairByToken(token) {
      const { data, error, status } = await db.from("pairs").select().eq("token", token).maybeSingle();
      if (error) fail("쌍 조회(링크)", error, status);
      return data ? toPair(data) : null;
    },
    async listPairsForUser(userId) {
      const { data, error, status } = await db.from("pairs").select().or(`a_user_id.eq.${userId},b_user_id.eq.${userId}`).order("created_at", { ascending: false }).limit(50);
      if (error) fail("내 쌍 목록", error, status);
      return (data ?? []).map(toPair);
    },
    async joinPair(input): Promise<JoinPairResult> {
      const { data, error, status } = await db.rpc("pair_join", { p_token: input.token, p_user: input.userId, p_assessment: input.assessmentId, p_consent_version: input.consentVersion });
      if (error) fail("쌍 연결", error, status);
      const r = data as { status?: string; pair?: string } | null;
      if (r?.status === "joined" && r.pair) {
        const pair = await byId(r.pair);
        if (pair) return { ok: true, pair };
        return { ok: false, reason: "not-found" };
      }
      const reason = r?.status as Exclude<JoinPairResult, { ok: true }>["reason"] | undefined;
      return { ok: false, reason: reason && ["not-found", "closed", "expired", "taken", "self", "bad-assessment"].includes(reason) ? reason : "not-found" };
    },
    async withdrawConsent(input): Promise<PairChangeResult> {
      const { data, error, status } = await db.rpc("pair_withdraw_consent", { p_pair: input.pairId, p_user: input.userId });
      if (error) fail("동의 철회", error, status);
      const r = data as { status?: string } | null;
      if (r?.status === "withdrawn") {
        const pair = await byId(input.pairId);
        return pair ? { ok: true, pair } : { ok: false, reason: "not-found" };
      }
      return { ok: false, reason: r?.status === "not-member" ? "not-member" : "not-found" };
    },
    async unlinkPair(input): Promise<PairChangeResult> {
      const { data, error, status } = await db.rpc("pair_unlink", { p_pair: input.pairId, p_user: input.userId });
      if (error) fail("연결 해제", error, status);
      const r = data as { status?: string } | null;
      if (r?.status === "unlinked") {
        const pair = await byId(input.pairId);
        return pair ? { ok: true, pair } : { ok: false, reason: "not-found" };
      }
      return { ok: false, reason: r?.status === "not-member" ? "not-member" : "not-found" };
    },
  };
}
