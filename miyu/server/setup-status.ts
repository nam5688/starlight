import "server-only";
import { isAuthConfigured, paymentConfig, supabaseEnv } from "./env";
import { buildSteps, checkEnv, CONSENT_TABLES, INIT_TABLES, tableStateOf, type Connection, type SetupFacts, type TableState } from "./setup-checks";
import { createAdminSupabase } from "./supabase";

// 개발용 설정 점검. 값은 읽어서 판정만 하고 화면·로그에는 내보내지 않는다.

type Admin = ReturnType<typeof createAdminSupabase>;

// 주의: head(HEAD 요청)로 확인하면 안 된다. 없는 테이블에 HEAD를 보내면 본문 없는 404가 오고,
// Supabase 클라이언트는 이를 "오류 없음(204)"으로 바꿔 돌려준다 → 없는 테이블이 "있음"으로 보였던 원인.
// 0행만 요청하는 GET으로 확인해 오류 코드(PGRST205 · 42501 등)를 그대로 받는다.
async function tableState(admin: Admin, table: string): Promise<TableState> {
  const { error, status } = await admin.from(table).select("*").limit(0);
  return tableStateOf(error ? { code: error.code, status } : null);
}

async function count(admin: Admin, table: string, filter?: [string, string]): Promise<number | null> {
  let query = admin.from(table).select("*", { count: "exact" }).limit(0);
  if (filter) query = query.eq(filter[0], filter[1]);
  const { count: n, error } = await query;
  return error ? null : (n ?? 0);
}

/** 로그인한 적이 있는 회원 수 − 프로필 수 (테이블보다 먼저 가입한 회원 확인용) */
async function missingProfiles(admin: Admin): Promise<number | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  const profiles = await count(admin, "profiles");
  if (error || profiles === null) return null;
  const total = (data as { total?: number }).total;
  return typeof total === "number" ? Math.max(0, total - profiles) : null;
}

/**
 * 실제 연결 확인. 공개 설정 정보(주소 + 공개용 키)와 관리자 회원 목록 1건(비밀키)을 요청해 본다.
 * 테이블이 없어도 확인할 수 있고, 카카오 로그인이 켜져 있는지도 함께 알 수 있다.
 */
async function probeSupabase(url: string, publishableKey: string, admin: Admin): Promise<{ connection: Connection; kakao: boolean | null }> {
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 401 || res.status === 403) return { connection: "bad-publishable", kakao: null };
    if (!res.ok) return { connection: "unreachable", kakao: null };
    const body = (await res.json()) as { external?: Record<string, boolean> };
    const kakao = body.external?.kakao === true;

    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return { connection: error.status === 401 || error.status === 403 ? "bad-secret" : "unreachable", kakao };
    return { connection: "ok", kakao };
  } catch {
    return { connection: "unreachable", kakao: null };
  }
}

export async function getSetupStatus() {
  const env = checkEnv((name) => (process.env[name] ?? "").trim());
  const supabaseFields = env.filter((e) => e.name.includes("SUPABASE"));
  const supabaseReady = isAuthConfigured() && supabaseFields.every((e) => e.state === "set");
  const payment = paymentConfig();

  const facts: SetupFacts = {
    env,
    supabaseReady,
    connection: null,
    tables: {},
    kakaoEnabled: null,
    completedLogins: null,
    savedAssessments: null,
    paymentReady: payment.ok && !payment.liveMode,
    // Supabase가 아직이면 결제 단계는 뒤로 미뤄지므로 결제 쪽 이유만 적는다
    paymentReason: payment.ok
      ? payment.liveMode
        ? "실결제 모드가 켜져 있습니다. 운영자 승인 전에는 PAYMENTS_LIVE_MODE=false 로 둡니다"
        : null
      : isAuthConfigured()
        ? payment.reason
        : null,
    paidOrders: null,
    readyReports: null,
  };

  const admin = supabaseReady ? createAdminSupabase() : null;
  if (admin) {
    const { url, publishableKey } = supabaseEnv();
    const probe = await probeSupabase(url, publishableKey, admin);
    facts.connection = probe.connection;
    facts.kakaoEnabled = probe.kakao;
  }

  if (admin && facts.connection === "ok") {
    const tables = [...INIT_TABLES, ...CONSENT_TABLES];
    const states = await Promise.all(tables.map((t) => tableState(admin, t)));
    tables.forEach((t, i) => (facts.tables[t] = states[i]));

    if (states.every((s) => s === "ok")) {
      facts.missingProfiles = await missingProfiles(admin);
      [facts.completedLogins, facts.savedAssessments, facts.paidOrders, facts.readyReports] = await Promise.all([
        count(admin, "user_consents", ["consent_type", "terms"]),
        count(admin, "assessments"),
        count(admin, "orders", ["status", "paid"]),
        count(admin, "reports", ["status", "ready"]),
      ]);
    }
  }

  const supabaseUrl = supabaseEnv().url;
  return {
    env,
    connection: facts.connection,
    steps: buildSteps(facts),
    tables: facts.tables,
    missingProfiles: facts.missingProfiles ?? null,
    counts: {
      completedLogins: facts.completedLogins,
      savedAssessments: facts.savedAssessments,
      paidOrders: facts.paidOrders,
      readyReports: facts.readyReports,
    },
    supabaseCallbackUrl: supabaseUrl && !supabaseUrl.startsWith("http://") ? `${supabaseUrl}/auth/v1/callback` : null,
  };
}
