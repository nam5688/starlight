// 토스 결제위젯(결제수단 · 약관 화면) 준비 과정 — 채널 독립 코드(React · 토스 SDK를 불러오지 않는다. SDK는 호출하는 쪽이 넘겨 준다).
//
// 왜 따로 뒀나 (2026-10-19 테스트 결제 막힘 조사): 신규 pending 주문(MEU-20261019-UR4R3747X2, 9,900원)의 결제 화면에서 결제수단 · 약관 iframe이 뜬 뒤 약 60초 만에 "결제 화면을 불러오지 못했어요"가 나왔고
// 같은 주문을 다시 열어도 같았다. 예전 화면은 오류를 그대로 버려서(catch에 빈 값) 어느 단계에서 어떤 오류가 났는지 남지 않았다. 원인은 확정하지 않았다 —
// 이 모듈은 (1) 단계마다 시간을 재고 (2) 토스가 돌려준 오류 코드를 잃지 않으며 (3) 30초 안에 준비되지 않으면 스스로 멈추고 (4) 다시 시도할 수 있게 하고 (5) 개인정보 없이 운영 기록으로 남길 수 있는 모양으로 정리한다.
// 토스 호스팅 SDK(js.tosspayments.com/v2/standard)는 화면(iframe)과 주고받는 요청의 기본 대기 시간이 60초이고 그 오류 코드는 REQUEST_TIMEOUT이다(SDK 파일에서 확인) —
// 이 모듈의 제한 시간(30초)은 그보다 먼저 사용자에게 알리고 다시 시도하게 하기 위한 값이다.

export const WIDGET_PHASES = ["sdk", "init", "amount", "render", "pay"] as const;
export type WidgetPhase = (typeof WIDGET_PHASES)[number];

export const WIDGET_BROWSERS = ["kakaotalk", "naver", "instagram", "facebook", "line", "other-webview", "standard"] as const;
export type WidgetBrowser = (typeof WIDGET_BROWSERS)[number];

/** 이 시간 안에 결제수단 · 약관 화면이 준비되지 않으면 스스로 멈추고 다시 시도하게 한다 */
export const WIDGET_READY_TIMEOUT_MS = 30_000;
/** 한 번 화면을 여는 동안 운영 기록으로 보내는 보고의 상한 (다시 시도를 계속 눌러도 기록이 쌓이지 않게) */
export const WIDGET_REPORT_LIMIT = 3;

/**
 * 결제하기를 누른 뒤 이 시간이 지나도 결제 창으로 넘어가지 않으면 "넘어가지 않았다"고 알리고 버튼을 다시 연다(운영자 2026-10-20: 모바일에서 결제 버튼을 눌러도 아무 일이 없었다).
 * 결제 승인은 이 화면이 정하지 않는다 — 넘어가지 않았다면 결제는 시작되지 않았고 금액은 빠져나가지 않았다.
 */
export const PAY_STALL_MS = 20_000;
export const PAY_STALL_CODE = "PAY_NO_REDIRECT";
export const PAY_STALL_MESSAGE = "결제 창이 열리지 않았어요. 결제는 되지 않았고 금액이 빠져나가지 않았어요. 카드 앱이 따로 열려 있거나 팝업이 막혀 있는지 확인한 뒤 다시 눌러 주세요. 계속되면 이 화면의 주문번호로 문의해 주세요.";

/** 구매자가 직접 한 행동(창 닫기 · 약관 미동의 등)이라 막힘으로 기록하지 않는 코드 */
export const USER_ACTION_CODES: ReadonlySet<string> = new Set([
  "USER_CANCEL",
  "CANCELED",
  "PAY_PROCESS_CANCELED",
  "NEED_AGREEMENT_WITH_REQUIRED_TERMS",
  "NEED_AGREEMENT_WITH_TERMS",
  "NOT_SELECTED_PAYMENT_METHOD",
]);

export type WidgetEnv = {
  browser: WidgetBrowser;
  secureContext: boolean;
  /** 이 사이트의 저장소(localStorage)를 쓸 수 있는가 — 앱 안 브라우저 · 추적 방지 설정에서 막힐 수 있다 */
  storage: "ok" | "blocked";
  cookies: boolean;
  online: boolean;
  /** 이 화면(iframe 안이 아니라 최상위 창)인가 */
  topLevel: boolean;
  /** 같은 결제 화면 칸이 문서에 몇 개 있는가 — 2 이상이면 지난 화면이 숨겨진 채 남아 있다(Next.js의 이전 화면 보존) */
  containers: number;
  visibility: "visible" | "hidden" | "prerender" | "unknown";
};

export type WidgetIssue = {
  phase: WidgetPhase;
  /** 토스 SDK의 오류 코드(예: INVALID_VARIANT_KEY · REQUEST_TIMEOUT) 또는 이 모듈의 코드(CLIENT_TIMEOUT · SDK_LOAD_FAILED) */
  code: string;
  /** 오류 문구(짧게 자르고 줄바꿈 제거 — 키 · 연락처 가리기는 서버가 한 번 더 한다) */
  message: string;
  elapsedMs: number;
  /** 몇 번째 시도인가 (1부터) */
  attempt: number;
  env: WidgetEnv;
};

/** 위젯 준비 단계에서 난 오류 — 어느 단계에서 어떤 코드로 몇 ms 만에 났는지를 들고 있다 */
export class WidgetSessionError extends Error {
  readonly phase: WidgetPhase;
  readonly code: string;
  readonly elapsedMs: number;
  constructor(phase: WidgetPhase, code: string, message: string, elapsedMs: number) {
    super(message);
    this.name = "WidgetSessionError";
    this.phase = phase;
    this.code = code;
    this.elapsedMs = elapsedMs;
  }
}

const CODE_SHAPE = /^[A-Z][A-Z0-9_]{1,59}$/;

/** 던져진 값에서 오류 코드를 읽는다 — 토스 SDK 오류의 code 문자열을 그대로, 없으면 UNKNOWN */
export function errorCodeOf(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === "string" && CODE_SHAPE.test(code)) return code;
  // 코드가 없으면 오류 종류 이름(ScriptLoadFailedError → SCRIPT_LOAD_FAILED_ERROR)으로 — 아무 정보가 없는 기본 이름 Error는 UNKNOWN
  const name = (e as { name?: unknown } | null)?.name;
  const named = typeof name === "string" && name !== "Error" ? name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase() : "";
  return CODE_SHAPE.test(named) ? named : "UNKNOWN";
}

/** 오류 문구: 줄바꿈 · 제어문자 제거, 160자까지 */
export function tidyMessage(e: unknown): string {
  const raw = typeof e === "string" ? e : e instanceof Error ? e.message : typeof (e as { message?: unknown } | null)?.message === "string" ? String((e as { message: string }).message) : "";
  return raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

/** 사용자 에이전트 문자열을 앱 안 브라우저 종류로만 분류한다 — 원문은 보내지 않는다 */
export function classifyBrowser(ua: string): WidgetBrowser {
  if (/KAKAOTALK/i.test(ua)) return "kakaotalk";
  if (/NAVER\(inapp|NAVER\/|naver/i.test(ua) && /inapp/i.test(ua)) return "naver";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook";
  if (/\bLine\//i.test(ua)) return "line";
  // 안드로이드 WebView(wv) · iOS의 Safari가 아닌 웹뷰
  if (/; wv\)/.test(ua) || (/iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari\//.test(ua))) return "other-webview";
  return "standard";
}

/** 고객에게 보이는 말 — 원인을 단정하지 않고 다음에 해 볼 것을 알린다 */
export function widgetIssueMessage(issue: Pick<WidgetIssue, "phase" | "code">): string {
  if (issue.phase === "sdk") return "결제 모듈을 불러오지 못했어요. 인터넷 연결을 확인하고, 광고 차단 기능이 켜져 있다면 잠시 꺼 두고 다시 불러와 주세요.";
  if (issue.code === "CLIENT_TIMEOUT" || issue.code === "REQUEST_TIMEOUT") return "결제 화면이 제때 열리지 않았어요. 아직 결제되지 않았어요. 다시 불러와 보고, 계속되면 주문번호와 함께 문의해 주세요.";
  if (issue.phase === "pay") return "결제를 진행하지 못했어요. 아직 결제되지 않았어요. 다시 시도해 주세요.";
  return "결제 화면을 불러오지 못했어요. 아직 결제되지 않았어요. 다시 불러와 주세요.";
}

const ENV_VISIBILITY = ["visible", "hidden", "prerender", "unknown"] as const;
const ENV_STORAGE = ["ok", "blocked"] as const;

const int = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null);

/**
 * 브라우저가 보낸 막힘 보고를 서버가 받아들이는 모양으로 정리한다 — 모르는 값이 있으면 null(기록하지 않는다).
 * 클라이언트가 보낸 값은 믿지 않는다: 모든 필드를 열거형 · 범위 · 길이로 다시 확인한다.
 */
export function normalizeWidgetIssue(raw: unknown): WidgetIssue | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const phase = (WIDGET_PHASES as readonly string[]).includes(r.phase as string) ? (r.phase as WidgetPhase) : null;
  const elapsedMs = int(r.elapsedMs, 0, 600_000);
  const attempt = int(r.attempt, 1, 50);
  const env = r.env as Record<string, unknown> | null;
  if (!phase || elapsedMs === null || attempt === null || !env || typeof env !== "object") return null;
  const browser = (WIDGET_BROWSERS as readonly string[]).includes(env.browser as string) ? (env.browser as WidgetBrowser) : null;
  const storage = (ENV_STORAGE as readonly string[]).includes(env.storage as string) ? (env.storage as "ok" | "blocked") : null;
  const visibility = (ENV_VISIBILITY as readonly string[]).includes(env.visibility as string) ? (env.visibility as WidgetEnv["visibility"]) : null;
  const containers = int(env.containers, 0, 50);
  if (!browser || !storage || !visibility || containers === null) return null;
  for (const k of ["secureContext", "cookies", "online", "topLevel"] as const) if (typeof env[k] !== "boolean") return null;
  const code = typeof r.code === "string" && CODE_SHAPE.test(r.code) ? r.code : "UNKNOWN";
  if (USER_ACTION_CODES.has(code)) return null;
  const message = typeof r.message === "string" ? tidyMessage(r.message) : "";
  return {
    phase,
    code,
    message,
    elapsedMs,
    attempt,
    env: { browser, secureContext: env.secureContext as boolean, storage, cookies: env.cookies as boolean, online: env.online as boolean, topLevel: env.topLevel as boolean, containers, visibility },
  };
}

/** 운영 알림 · 기록에 넣는 짧은 줄들(주문번호는 따로 붙는다) — 키 · 이름 · 생년월일 같은 것은 없다 */
export function widgetIssueLines(i: WidgetIssue): string[] {
  const e = i.env;
  return [
    `단계 ${i.phase} · 코드 ${i.code} · ${Math.round(i.elapsedMs / 100) / 10}초 · ${i.attempt}번째 시도`,
    `브라우저 ${e.browser} · 저장소 ${e.storage} · 쿠키 ${e.cookies ? "켜짐" : "꺼짐"} · 보안 연결 ${e.secureContext ? "예" : "아니오"} · 온라인 ${e.online ? "예" : "아니오"} · 최상위 창 ${e.topLevel ? "예" : "아니오"} · 결제 칸 ${e.containers}개 · 화면 ${e.visibility}`,
    ...(i.message ? [`문구 ${i.message}`] : []),
  ];
}

// ───────────────────────── 위젯 준비 ─────────────────────────

type Destroyable = { destroy: () => Promise<void> };
export type WidgetsLike = {
  setAmount: (amount: { currency: "KRW"; value: number }) => Promise<unknown>;
  renderPaymentMethods: (o: { selector: string; variantKey: string }) => Promise<Destroyable>;
  renderAgreement: (o: { selector: string; variantKey: string }) => Promise<Destroyable>;
};
export type SdkLike = { widgets: (o: { customerKey: string }) => WidgetsLike };

export type WidgetSession = {
  widgets: WidgetsLike;
  /** 그린 결제수단 · 약관 화면을 치운다 — 여러 번 불러도 되고 실패해도 던지지 않는다 */
  destroy: () => Promise<void>;
  /** 단계별로 걸린 시간(ms): sdk · init · amount · methods · agreement */
  timings: Record<string, number>;
};

export type WidgetSessionOptions = {
  loadSdk: (clientKey: string) => Promise<SdkLike>;
  clientKey: string;
  customerKey: string;
  amount: number;
  methodsSelector: string;
  agreementSelector: string;
  variantKey: string;
  timeoutMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** aborted가 true가 되면(화면이 사라졌거나 다시 시도) 결과를 쓰지 않고 그려진 것을 치운다 */
  signal?: { aborted: boolean };
};

/**
 * 결제수단 · 약관 화면을 준비한다. 성공하면 세션을, 실패하면 WidgetSessionError를 던진다.
 * - 어느 단계(sdk → init → amount → render)에서 났는지와 토스의 오류 코드를 잃지 않는다.
 * - timeoutMs(기본 30초) 안에 끝나지 않으면 CLIENT_TIMEOUT으로 멈추고, 그때까지 그려진 것은 치운다. 늦게 도착한 결과도 치운다.
 * - signal.aborted이면 ABORTED로 멈춘다(호출한 쪽이 무시한다).
 */
export async function startWidgetSession(o: WidgetSessionOptions): Promise<WidgetSession> {
  const now = o.now ?? (() => Date.now());
  const setT = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const t0 = now();
  const timings: Record<string, number> = {};
  let phase: WidgetPhase = "sdk";
  let finished = false;
  const rendered: Destroyable[] = [];
  const destroyAll = async () => {
    const list = rendered.splice(0);
    await Promise.all(list.map((w) => w.destroy().catch(() => undefined)));
  };
  const fail = (code: string, message: string) => new WidgetSessionError(phase, code, message, now() - t0);
  const wrap = (e: unknown) => (e instanceof WidgetSessionError ? e : fail(phase === "sdk" ? "SDK_LOAD_FAILED" : errorCodeOf(e), tidyMessage(e)));
  const keep = async <T extends Destroyable>(p: Promise<T>, label: string): Promise<T> => {
    const started = now();
    const w = await p;
    timings[label] = now() - started;
    // 이미 끝났거나(시간 초과 · 취소) 늦게 도착한 화면은 바로 치운다
    if (finished || o.signal?.aborted) {
      await w.destroy().catch(() => undefined);
      throw fail("ABORTED", "late");
    }
    rendered.push(w);
    return w;
  };

  let timer: unknown;
  const timeout = new Promise<never>((_, reject) => {
    timer = setT(() => reject(fail("CLIENT_TIMEOUT", `${(o.timeoutMs ?? WIDGET_READY_TIMEOUT_MS) / 1000}초 안에 준비되지 않음`)), o.timeoutMs ?? WIDGET_READY_TIMEOUT_MS);
  });

  const main = async (): Promise<WidgetSession> => {
    const s0 = now();
    const sdk = await o.loadSdk(o.clientKey);
    timings.sdk = now() - s0;
    if (o.signal?.aborted) throw fail("ABORTED", "aborted");
    phase = "init";
    const i0 = now();
    const widgets = sdk.widgets({ customerKey: o.customerKey });
    timings.init = now() - i0;
    phase = "amount";
    const a0 = now();
    await widgets.setAmount({ currency: "KRW", value: o.amount });
    timings.amount = now() - a0;
    if (o.signal?.aborted) throw fail("ABORTED", "aborted");
    phase = "render";
    await Promise.all([
      keep(widgets.renderPaymentMethods({ selector: o.methodsSelector, variantKey: o.variantKey }), "methods"),
      keep(widgets.renderAgreement({ selector: o.agreementSelector, variantKey: "AGREEMENT" }), "agreement"),
    ]);
    if (o.signal?.aborted) throw fail("ABORTED", "aborted");
    return { widgets, destroy: destroyAll, timings };
  };

  try {
    return await Promise.race([main(), timeout]);
  } catch (e) {
    finished = true;
    await destroyAll();
    throw wrap(e);
  } finally {
    finished = true;
    clearT(timer);
  }
}
