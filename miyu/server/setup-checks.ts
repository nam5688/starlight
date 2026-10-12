// 설정 점검 화면(/setup)의 판정 규칙. 값 자체는 다루지 않고 "입력됨/비어 있음/형식 확인 필요"만 낸다.
// Next.js에 의존하지 않는다 — 단위 테스트에서 직접 불러온다.

export type FieldState = "set" | "empty" | "check";
export type FieldCheck = { name: string; state: FieldState; hint?: string };

export type StepState = "done" | "todo" | "blocked";
export type SetupStep = { id: StepId; title: string; state: StepState; detail: string };

export type StepId = "supabase-env" | "database" | "kakao" | "url-config" | "login-save" | "toss-keys" | "test-payment";

/**
 * Supabase 실제 연결 결과 (null = 값이 덜 들어가 확인하지 않음)
 * - unreachable: 주소로 연결할 수 없음 / bad-publishable: 공개용 키가 맞지 않음 / bad-secret: 비밀키가 맞지 않음
 */
export type Connection = "ok" | "unreachable" | "bad-publishable" | "bad-secret" | null;

export const CONNECTION_TEXT: Record<Exclude<Connection, null>, string> = {
  ok: "연결됨 — 주소 · 공개용 키 · 비밀키를 실제로 확인했습니다.",
  unreachable: "주소로 연결할 수 없습니다. NEXT_PUBLIC_SUPABASE_URL 이 Project URL과 같은지, 프로젝트가 아직 만들어지는 중은 아닌지 확인해 주세요.",
  "bad-publishable": "공개용 키가 이 프로젝트의 키와 맞지 않습니다. NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 를 다시 복사해 넣어 주세요.",
  "bad-secret": "비밀키가 이 프로젝트의 키와 맞지 않습니다. SUPABASE_SECRET_KEY 를 다시 복사해 넣어 주세요.",
};

/**
 * 테이블 확인 결과
 * - ok: 있고 서버 비밀키로 읽힌다 / missing: 없다 / no-access: 있지만 권한이 없다 / error: 그 밖의 조회 실패
 */
export type TableState = "ok" | "missing" | "no-access" | "error";

export const TABLE_STATE_TEXT: Record<TableState, string> = { ok: "있음", missing: "없음", "no-access": "권한 없음", error: "확인 실패" };

/** PostgREST · Postgres 오류 코드로 테이블 상태를 판정한다 */
export function tableStateOf(error: { code?: string | null; status?: number } | null): TableState {
  if (!error) return "ok";
  if (error.code === "PGRST205" || error.code === "42P01") return "missing";
  if (error.code === "42501" || error.status === 401 || error.status === 403) return "no-access";
  return "error";
}

/** 서버가 확인한 사실들. 값은 담지 않는다. */
export type SetupFacts = {
  env: FieldCheck[];
  /** Supabase 값 세 개가 모두 형식에 맞게 들어 있음 */
  supabaseReady: boolean;
  connection: Connection;
  /** 테이블 이름 → 상태 (연결 전이면 비움) */
  tables: Record<string, TableState>;
  /** 로그인한 적은 있지만 프로필이 없는 회원 수 (확인 못 하면 null) */
  missingProfiles?: number | null;
  kakaoEnabled: boolean | null;
  completedLogins: number | null;
  savedAssessments: number | null;
  paymentReady: boolean;
  paymentReason: string | null;
  paidOrders: number | null;
  readyReports: number | null;
};

export const INIT_TABLES = ["profiles", "assessments", "user_regions", "orders", "payment_events", "reports"];
export const CONSENT_TABLES = ["user_consents"];
/** 선택 기능용 테이블 — 없어도 다른 단계는 막지 않고, 상태와 안내만 보여 준다 */
export const OPTIONAL_TABLES: Record<string, string> = {
  personal_contexts: "‘나를 더 반영하기’를 쓰려면 SQL Editor에서 5번 파일(20261015000000_personal_context.sql)을 실행합니다.",
  ops_events: "운영 기록 · 알림 · 결제 재확인 기록을 남기려면 SQL Editor에서 6번 파일(20261016000000_ops_events.sql)을 실행합니다.",
};

const SUPABASE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

/** 환경변수 형식 점검. 반환값에 실제 값은 넣지 않는다. */
export function checkEnv(read: (name: string) => string): FieldCheck[] {
  const field = (name: string, judge: (v: string) => string | null, note?: (v: string) => string | null): FieldCheck => {
    const value = read(name);
    if (!value) return { name, state: "empty" };
    const hint = judge(value);
    if (hint) return { name, state: "check", hint };
    const info = note?.(value);
    return info ? { name, state: "set", hint: info } : { name, state: "set" };
  };

  return [
    field("SITE_URL", (v) =>
      /^https?:\/\/[^/]+$/.test(v) ? null : "끝에 / 없이 주소만 넣어 주세요 (로컬은 http://localhost:3000)",
    ),
    field("NEXT_PUBLIC_SUPABASE_URL", (v) => {
      if (SUPABASE_URL.test(v) || LOCAL_URL.test(v)) return null;
      if (v.includes("/rest/v1") || v.endsWith("/")) return "끝의 /rest/v1 이나 / 없이 https://….supabase.co 까지만 넣어 주세요";
      return "https://프로젝트주소.supabase.co 형식인지 확인해 주세요";
    }),
    field("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", (v) => {
      if (v.startsWith("sb_secret_")) return "비밀키가 들어 있습니다. 이 칸에는 sb_publishable_ 로 시작하는 공개용 키를 넣어 주세요";
      return v.startsWith("sb_publishable_") || JWT.test(v) ? null : "sb_publishable_ 로 시작하는 키인지 확인해 주세요";
    }),
    field("SUPABASE_SECRET_KEY", (v) => {
      if (v.startsWith("sb_publishable_")) return "공개용 키가 들어 있습니다. 이 칸에는 sb_secret_ 로 시작하는 비밀키를 넣어 주세요";
      return v.startsWith("sb_secret_") || JWT.test(v) ? null : "sb_secret_ 로 시작하는 키인지 확인해 주세요";
    }),
    field("NEXT_PUBLIC_TOSS_CLIENT_KEY", (v) => {
      if (v.includes("_gsk_") || v.includes("_sk_")) return "시크릿 키가 들어 있습니다. 이 칸에는 test_gck_ 로 시작하는 클라이언트 키를 넣어 주세요";
      return v.startsWith("test_gck_") || v.startsWith("live_gck_") ? null : "결제위젯 클라이언트 키(test_gck_…)인지 확인해 주세요";
    }, (v) => (isTossDocsKey(v) ? DOCS_KEY_NOTE : null)),
    field("TOSS_SECRET_KEY", (v) => {
      if (v.includes("_gck_") || v.includes("_ck_")) return "클라이언트 키가 들어 있습니다. 이 칸에는 test_gsk_ 로 시작하는 시크릿 키를 넣어 주세요";
      return v.startsWith("test_gsk_") || v.startsWith("live_gsk_") ? null : "결제위젯 시크릿 키(test_gsk_…)인지 확인해 주세요";
    }),
  ];
}

/** 토스페이먼츠 문서 예제용 공용 테스트 키 (누구나 쓰는 키라 내 상점 관리자에는 결제내역이 남지 않는다) */
export function isTossDocsKey(key: string): boolean {
  return /^test_g?[cs]k_docs_/.test(key);
}

export const DOCS_KEY_NOTE =
  "토스페이먼츠 문서 예제용 공용 테스트 키입니다. 테스트 결제는 되지만 내 토스페이먼츠 상점 관리자에는 결제내역이 보이지 않습니다. 결제 확인은 미유 MY의 결제내역(주문 상세)에서 합니다. 내 테스트 키는 토스페이먼츠 전자결제 신청 후 발급됩니다.";

/** 해야 할 순서대로 단계를 판정한다. 앞 단계가 안 끝났으면 뒤 단계는 blocked. */
export function buildSteps(f: SetupFacts): SetupStep[] {
  const notOk = (names: string[]) => names.filter((t) => f.tables[t] !== "ok");
  const initMissing = notOk(INIT_TABLES);
  const consentMissing = notOk(CONSENT_TABLES);
  const noAccess = [...INIT_TABLES, ...CONSENT_TABLES].filter((t) => f.tables[t] === "no-access" || f.tables[t] === "error");
  const connected = f.supabaseReady && f.connection === "ok";
  const dbReady = connected && initMissing.length === 0 && consentMissing.length === 0;

  const raw: Array<{ id: StepId; title: string; done: boolean; needs: StepId[]; detail: string }> = [
    {
      id: "supabase-env",
      title: "Supabase 주소 · 키 입력과 연결 확인",
      done: connected,
      needs: [],
      detail:
        f.supabaseReady && f.connection && f.connection !== "ok"
          ? `${CONNECTION_TEXT[f.connection]} 고친 뒤 개발 서버를 다시 켭니다.`
          : "miyu 폴더의 .env.local 파일에 Supabase 프로젝트 주소 · 공개용 키 · 비밀키를 넣고 개발 서버를 다시 켭니다. 아래 표에서 입력 상태를 확인할 수 있습니다.",
    },
    {
      id: "database",
      title: "DB 테이블 만들기",
      done: dbReady,
      needs: ["supabase-env"],
      detail:
        noAccess.length > 0
          ? `표는 확인되지만 서버 비밀키로 읽지 못했습니다 (${noAccess.join(", ")}). SUPABASE_SECRET_KEY가 Secret key인지 확인하고, 계속되면 아래 DB 상태를 알려주세요.`
          : initMissing.length > 0
            ? "Supabase SQL Editor에서 1번 파일(20261011000000_init.sql)부터 실행합니다."
            : consentMissing.length > 0
              ? "Supabase SQL Editor에서 2번 파일(20261012000000_consents.sql)을 실행합니다."
              : "필요한 테이블이 모두 있습니다.",
    },
    {
      id: "kakao",
      title: "카카오 로그인 켜기",
      done: f.kakaoEnabled === true,
      needs: ["supabase-env"],
      detail: "카카오디벨로퍼스에 아래 ① 주소를 등록하고, Supabase Providers > Kakao 를 켭니다.",
    },
    {
      id: "url-config",
      title: "로그인 완료 주소 등록",
      done: (f.completedLogins ?? 0) > 0,
      needs: ["database", "kakao"],
      detail: "Supabase URL Configuration 에 아래 ② 주소를 등록합니다. 로그인 후 약관 동의까지 마치면 완료로 표시됩니다.",
    },
    {
      id: "login-save",
      title: "카카오 로그인과 결과 저장 확인",
      done: (f.completedLogins ?? 0) > 0 && (f.savedAssessments ?? 0) > 0,
      needs: ["url-config"],
      detail: "검사를 끝내고 '카카오로 로그인하고 저장'을 눌러, MY에 결과가 보이는지 확인합니다.",
    },
    {
      id: "toss-keys",
      title: "토스페이먼츠 테스트 키 입력",
      done: f.paymentReady,
      needs: ["login-save"],
      detail: f.paymentReady
        ? "토스페이먼츠 결제위젯 테스트 키가 들어 있습니다."
        : `${f.paymentReason ? `${f.paymentReason}. ` : ""}토스페이먼츠 개발자센터의 결제위젯 테스트 키(test_gck_ / test_gsk_)를 .env.local 에 넣습니다.`,
    },
    {
      id: "test-payment",
      title: "테스트 결제와 리포트 확인",
      done: (f.paidOrders ?? 0) > 0 && (f.readyReports ?? 0) > 0,
      needs: ["toss-keys"],
      detail: "결과 화면에서 테스트 결제를 하고, 리포트가 열리는지 확인합니다. 실제 돈은 나가지 않습니다.",
    },
  ];

  // 앞 단계가 모두 끝나야 그 단계도 끝난 것으로 본다 (예: 연결이 깨지면 뒤 단계는 모두 "앞 단계 후")
  const done = new Map<StepId, boolean>();
  for (const s of raw) done.set(s.id, s.done && s.needs.every((n) => done.get(n)));
  return raw.map((s) => ({
    id: s.id,
    title: s.title,
    detail: s.detail,
    state: done.get(s.id) ? "done" : s.needs.every((n) => done.get(n)) ? "todo" : "blocked",
  }));
}

/** 지금 할 일: 순서상 처음으로 끝나지 않은 단계 */
export function currentStep(steps: SetupStep[]): SetupStep | null {
  return steps.find((s) => s.state !== "done") ?? null;
}
