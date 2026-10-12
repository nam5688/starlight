// 설정 점검 화면(/setup)의 판정 규칙. 값 자체는 다루지 않고 "입력됨/비어 있음/형식 확인 필요"만 낸다.
// Next.js에 의존하지 않는다 — 단위 테스트에서 직접 불러온다.

export type FieldState = "set" | "empty" | "check";
export type FieldCheck = { name: string; state: FieldState; hint?: string };

export type StepState = "done" | "todo" | "blocked";
export type SetupStep = { id: StepId; title: string; state: StepState; detail: string };

export type StepId = "supabase-env" | "database" | "kakao" | "url-config" | "login-save" | "toss-keys" | "test-payment";

/** 서버가 확인한 사실들. 값은 담지 않는다. */
export type SetupFacts = {
  env: FieldCheck[];
  supabaseReady: boolean;
  /** 테이블 이름 → 있음 여부 (확인하지 못했으면 비움) */
  tables: Record<string, boolean>;
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

const SUPABASE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

/** 환경변수 형식 점검. 반환값에 실제 값은 넣지 않는다. */
export function checkEnv(read: (name: string) => string): FieldCheck[] {
  const field = (name: string, judge: (v: string) => string | null): FieldCheck => {
    const value = read(name);
    if (!value) return { name, state: "empty" };
    const hint = judge(value);
    return hint ? { name, state: "check", hint } : { name, state: "set" };
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
    }),
    field("TOSS_SECRET_KEY", (v) => {
      if (v.includes("_gck_") || v.includes("_ck_")) return "클라이언트 키가 들어 있습니다. 이 칸에는 test_gsk_ 로 시작하는 시크릿 키를 넣어 주세요";
      return v.startsWith("test_gsk_") || v.startsWith("live_gsk_") ? null : "결제위젯 시크릿 키(test_gsk_…)인지 확인해 주세요";
    }),
  ];
}

/** 해야 할 순서대로 단계를 판정한다. 앞 단계가 안 끝났으면 뒤 단계는 blocked. */
export function buildSteps(f: SetupFacts): SetupStep[] {
  const missing = (names: string[]) => names.filter((t) => f.tables[t] !== true);
  const initMissing = missing(INIT_TABLES);
  const consentMissing = missing(CONSENT_TABLES);
  const dbReady = f.supabaseReady && initMissing.length === 0 && consentMissing.length === 0;

  const raw: Array<{ id: StepId; title: string; done: boolean; needs: StepId[]; detail: string }> = [
    {
      id: "supabase-env",
      title: "Supabase 프로젝트 주소와 키 입력",
      done: f.supabaseReady,
      needs: [],
      detail: "miyu 폴더의 .env.local 파일에 Supabase 프로젝트 주소 · 공개용 키 · 비밀키를 넣고 개발 서버를 다시 켭니다. 아래 표에서 입력 상태를 확인할 수 있습니다.",
    },
    {
      id: "database",
      title: "DB 테이블 만들기",
      done: dbReady,
      needs: ["supabase-env"],
      detail:
        initMissing.length > 0
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

  const done = new Map(raw.map((s) => [s.id, s.done]));
  return raw.map((s) => ({
    id: s.id,
    title: s.title,
    detail: s.detail,
    state: s.done ? "done" : s.needs.every((n) => done.get(n)) ? "todo" : "blocked",
  }));
}

/** 지금 할 일: 순서상 처음으로 끝나지 않은 단계 */
export function currentStep(steps: SetupStep[]): SetupStep | null {
  return steps.find((s) => s.state !== "done") ?? null;
}
