import "server-only";
import { isAuthConfigured, paymentConfig, supabaseEnv } from "./env";
import { buildSteps, checkEnv, CONSENT_TABLES, INIT_TABLES, type SetupFacts } from "./setup-checks";
import { createAdminSupabase } from "./supabase";

// 개발용 설정 점검. 값은 읽어서 판정만 하고 화면·로그에는 내보내지 않는다.

type Admin = ReturnType<typeof createAdminSupabase>;

async function tableExists(admin: Admin, table: string): Promise<boolean> {
  const { error } = await admin.from(table).select("*", { count: "exact", head: true });
  return !error;
}

async function count(admin: Admin, table: string, filter?: [string, string]): Promise<number | null> {
  let query = admin.from(table).select("*", { count: "exact", head: true });
  if (filter) query = query.eq(filter[0], filter[1]);
  const { count: n, error } = await query;
  return error ? null : (n ?? 0);
}

/** Supabase에서 카카오 로그인이 켜져 있는지 (공개 설정 정보로 확인) */
async function kakaoEnabled(url: string, publishableKey: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { external?: Record<string, boolean> };
    return body.external?.kakao === true;
  } catch {
    return null;
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

  if (supabaseReady) {
    const { url, publishableKey } = supabaseEnv();
    const admin = createAdminSupabase();
    const tables = [...INIT_TABLES, ...CONSENT_TABLES];
    const [exists, kakao] = await Promise.all([
      Promise.all(tables.map((t) => tableExists(admin, t))),
      kakaoEnabled(url, publishableKey),
    ]);
    tables.forEach((t, i) => (facts.tables[t] = exists[i]));
    facts.kakaoEnabled = kakao;

    if (exists.every(Boolean)) {
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
    steps: buildSteps(facts),
    tables: facts.tables,
    counts: {
      completedLogins: facts.completedLogins,
      savedAssessments: facts.savedAssessments,
      paidOrders: facts.paidOrders,
      readyReports: facts.readyReports,
    },
    supabaseCallbackUrl: supabaseUrl && !supabaseUrl.startsWith("http://") ? `${supabaseUrl}/auth/v1/callback` : null,
  };
}
