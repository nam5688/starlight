// 토스 결제위젯 준비 과정 — 가짜 SDK로 단계 · 오류 코드 · 시간 초과 · 취소 · 늦게 도착한 화면 정리를 확인한다(토스 서버 · 키 · 결제 없음).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyBrowser,
  errorCodeOf,
  normalizeWidgetIssue,
  startWidgetSession,
  tidyMessage,
  WIDGET_READY_TIMEOUT_MS,
  widgetIssueLines,
  widgetIssueMessage,
  WidgetSessionError,
  type SdkLike,
  type WidgetEnv,
} from "./widget-session.ts";

const ENV: WidgetEnv = { browser: "standard", secureContext: true, storage: "ok", cookies: true, online: true, topLevel: true, containers: 1, visibility: "visible" };
const ISSUE = { phase: "render", code: "REQUEST_TIMEOUT", message: "Request Timeout", elapsedMs: 60_100, attempt: 1, env: ENV };

class Fake {
  destroyed: string[] = [];
  calls: string[] = [];
  amount: unknown = null;
  selectors: Record<string, string> = {};
  /** 각 호출을 직접 끝내거나 실패시키는 열쇠 */
  gates: Record<string, { resolve: () => void; reject: (e: unknown) => void } | undefined> = {};
  failAt: Record<string, unknown> = {};
  hold: Set<string> = new Set();
  private widget(name: string) {
    return {
      destroy: async () => {
        this.destroyed.push(name);
      },
    };
  }
  private step<T>(name: string, value: () => T): Promise<T> {
    this.calls.push(name);
    if (name in this.failAt) return Promise.reject(this.failAt[name]);
    if (this.hold.has(name)) return new Promise<T>((resolve, reject) => (this.gates[name] = { resolve: () => resolve(value()), reject }));
    return Promise.resolve(value());
  }
  sdk(): SdkLike {
    return {
      widgets: ({ customerKey }) => {
        this.calls.push(`widgets:${customerKey}`);
        if ("init" in this.failAt) throw this.failAt.init;
        return {
          setAmount: async (a) => {
            this.amount = a;
            await this.step("amount", () => undefined);
          },
          renderPaymentMethods: (o) => {
            this.selectors.methods = `${o.selector}|${o.variantKey}`;
            return this.step("methods", () => this.widget("methods"));
          },
          renderAgreement: (o) => {
            this.selectors.agreement = `${o.selector}|${o.variantKey}`;
            return this.step("agreement", () => this.widget("agreement"));
          },
        };
      },
    };
  }
}

const base = (fake: Fake, over: Partial<Parameters<typeof startWidgetSession>[0]> = {}) => ({
  loadSdk: async () => {
    if ("sdk" in fake.failAt) throw fake.failAt.sdk;
    return fake.sdk();
  },
  clientKey: "test_gck_fake",
  customerKey: "cust-1",
  amount: 9900,
  methodsSelector: "#m",
  agreementSelector: "#a",
  variantKey: "DEFAULT",
  ...over,
});

/** 시간을 직접 흘리는 타이머 */
function manualTimers() {
  const pending = new Map<number, () => void>();
  let n = 0;
  return {
    setTimer: (fn: () => void) => {
      pending.set(++n, fn);
      return n;
    },
    clearTimer: (h: unknown) => void pending.delete(h as number),
    fireAll: () => [...pending.values()].forEach((fn) => fn()),
    count: () => pending.size,
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test("준비 성공: 금액 → 결제수단 · 약관을 그리고(약관은 AGREEMENT), 단계별 시간이 남고, destroy는 두 화면을 치우며 여러 번 불러도 된다", async () => {
  const fake = new Fake();
  const timers = manualTimers();
  let t = 0;
  const session = await startWidgetSession(base(fake, { setTimer: timers.setTimer, clearTimer: timers.clearTimer, now: () => (t += 5), variantKey: "CARD_ONLY" }));
  assert.deepEqual(fake.amount, { currency: "KRW", value: 9900 });
  assert.equal(fake.selectors.methods, "#m|CARD_ONLY");
  assert.equal(fake.selectors.agreement, "#a|AGREEMENT");
  assert.deepEqual(Object.keys(session.timings).sort(), ["agreement", "amount", "init", "methods", "sdk"]);
  assert.equal(timers.count(), 0, "성공하면 시간 초과 타이머가 남지 않는다");
  await session.destroy();
  await session.destroy();
  assert.deepEqual(fake.destroyed.sort(), ["agreement", "methods"], "두 번 불러도 한 번씩만 치운다");
});

test("실패는 단계와 토스의 오류 코드를 잃지 않는다: SDK 불러오기 · 초기화 · 금액 · 그리기", async () => {
  const cases: [string, Fake, string, string][] = [];
  const f1 = new Fake();
  f1.failAt.sdk = Object.assign(new Error("script load failed"), { name: "ScriptLoadFailedError" });
  cases.push(["sdk", f1, "sdk", "SDK_LOAD_FAILED"]);
  const f2 = new Fake();
  f2.failAt.init = Object.assign(new Error("키가 올바르지 않아요"), { code: "INVALID_CUSTOMER_KEY" });
  cases.push(["init", f2, "init", "INVALID_CUSTOMER_KEY"]);
  const f3 = new Fake();
  f3.failAt.amount = Object.assign(new Error("금액"), { code: "INVALID_AMOUNT_VALUE" });
  cases.push(["amount", f3, "amount", "INVALID_AMOUNT_VALUE"]);
  const f4 = new Fake();
  f4.failAt.methods = Object.assign(new Error("variantKey"), { code: "INVALID_VARIANT_KEY" });
  cases.push(["render", f4, "render", "INVALID_VARIANT_KEY"]);
  for (const [label, fake, phase, code] of cases) {
    const timers = manualTimers();
    await assert.rejects(startWidgetSession(base(fake, { setTimer: timers.setTimer, clearTimer: timers.clearTimer })), (e: unknown) => {
      assert.ok(e instanceof WidgetSessionError, label);
      assert.equal(e.phase, phase, label);
      assert.equal(e.code, code, label);
      return true;
    });
    assert.equal(timers.count(), 0, `${label}: 타이머를 정리한다`);
  }
});

test("그리는 중 한쪽이 실패하면 이미 그려진 다른 쪽 화면을 치운다", async () => {
  const fake = new Fake();
  fake.failAt.agreement = Object.assign(new Error("약관"), { code: "AGREEMENT_WIDGET_ALREADY_RENDERED" });
  await assert.rejects(startWidgetSession(base(fake)), (e: unknown) => e instanceof WidgetSessionError && e.code === "AGREEMENT_WIDGET_ALREADY_RENDERED");
  await tick();
  assert.deepEqual(fake.destroyed, ["methods"], "결제수단 화면은 치워졌다");
});

test("30초 안에 준비되지 않으면 CLIENT_TIMEOUT으로 멈추고, 늦게 도착한 화면도 치우며, 처리되지 않은 거절을 남기지 않는다", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (r: unknown) => unhandled.push(r);
  process.on("unhandledRejection", onUnhandled);
  try {
    const fake = new Fake();
    fake.hold.add("methods");
    const timers = manualTimers();
    const run = startWidgetSession(base(fake, { setTimer: timers.setTimer, clearTimer: timers.clearTimer, now: () => 0 }));
    const settled = run.then(
      () => "ok",
      (e: unknown) => e,
    );
    await tick();
    assert.ok(fake.gates.methods, "결제수단 그리기가 끝나지 않고 있다");
    assert.equal(timers.count(), 1);
    timers.fireAll(); // 30초가 지났다
    const err = (await settled) as WidgetSessionError;
    assert.ok(err instanceof WidgetSessionError);
    assert.deepEqual([err.phase, err.code], ["render", "CLIENT_TIMEOUT"]);
    assert.match(err.message, /30초/);
    // 시간 초과 뒤에 늦게 도착한 결제수단 화면은 치운다
    fake.gates.methods!.resolve();
    await tick();
    await tick();
    assert.deepEqual(fake.destroyed.sort(), ["agreement", "methods"]);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  assert.equal(WIDGET_READY_TIMEOUT_MS, 30_000);
});

test("화면이 사라지거나 다시 시도해 취소하면(signal) ABORTED로 멈추고 그려진 화면을 치운다", async () => {
  const fake = new Fake();
  fake.hold.add("amount");
  const signal = { aborted: false };
  const run = startWidgetSession(base(fake, { signal }));
  const settled = run.then(
    () => "ok",
    (e: unknown) => e,
  );
  await tick();
  signal.aborted = true;
  fake.gates.amount!.resolve();
  const err = (await settled) as WidgetSessionError;
  assert.ok(err instanceof WidgetSessionError);
  assert.equal(err.code, "ABORTED");
  assert.equal(fake.calls.includes("methods"), false, "취소된 뒤에는 결제수단을 그리지 않는다");
});

test("오류 코드 · 문구 · 브라우저 분류", () => {
  assert.equal(errorCodeOf(Object.assign(new Error("x"), { code: "INVALID_VARIANT_KEY" })), "INVALID_VARIANT_KEY");
  assert.equal(errorCodeOf(Object.assign(new Error("x"), { code: "bad code!" })), "UNKNOWN");
  assert.equal(errorCodeOf(new TypeError("x")), "TYPE_ERROR");
  assert.equal(errorCodeOf(null), "UNKNOWN");
  assert.equal(errorCodeOf("문자열"), "UNKNOWN");
  assert.equal(tidyMessage(new Error("a\nb\u0000c   d")), "a b c d");
  assert.equal(tidyMessage("x".repeat(500)).length, 160);
  assert.equal(tidyMessage(undefined), "");
  assert.equal(classifyBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 11.0.0"), "kakaotalk");
  assert.equal(classifyBrowser("Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.0)"), "naver");
  assert.equal(classifyBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0"), "instagram");
  assert.equal(classifyBrowser("Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130 Mobile Safari/537.36"), "other-webview");
  assert.equal(classifyBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"), "other-webview", "Safari/ 표시가 없는 iOS 웹뷰");
  assert.equal(classifyBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "standard");
  assert.equal(classifyBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"), "standard");
  // 고객 문구는 원인을 단정하지 않고 "아직 결제되지 않았어요"를 알린다
  for (const i of [{ phase: "sdk", code: "SDK_LOAD_FAILED" }, { phase: "render", code: "CLIENT_TIMEOUT" }, { phase: "render", code: "REQUEST_TIMEOUT" }, { phase: "render", code: "UNKNOWN" }, { phase: "pay", code: "UNKNOWN" }] as const) {
    const text = widgetIssueMessage(i);
    assert.doesNotMatch(text, /키|key|토스|서버 오류|ERR/i, JSON.stringify(i));
  }
  assert.match(widgetIssueMessage({ phase: "render", code: "CLIENT_TIMEOUT" }), /아직 결제되지 않았어요/);
});

test("막힘 보고는 서버가 모든 값을 다시 확인한다: 모르는 단계 · 범위 밖 숫자 · 환경 값이 틀리면 버리고, 구매자의 직접 행동은 기록하지 않고, 코드 모양이 틀리면 UNKNOWN", () => {
  const ok = normalizeWidgetIssue(ISSUE);
  assert.deepEqual(ok, ISSUE);
  assert.equal(normalizeWidgetIssue({ ...ISSUE, phase: "hack" }), null);
  assert.equal(normalizeWidgetIssue({ ...ISSUE, elapsedMs: -1 }), null);
  assert.equal(normalizeWidgetIssue({ ...ISSUE, elapsedMs: 1e9 }), null);
  assert.equal(normalizeWidgetIssue({ ...ISSUE, attempt: 0 }), null);
  assert.equal(normalizeWidgetIssue({ ...ISSUE, env: { ...ENV, browser: "<script>" } }), null);
  assert.equal(normalizeWidgetIssue({ ...ISSUE, env: { ...ENV, storage: "maybe" } }), null);
  assert.equal(normalizeWidgetIssue({ ...ISSUE, env: { ...ENV, cookies: "yes" } }), null);
  assert.equal(normalizeWidgetIssue({ ...ISSUE, env: { ...ENV, containers: 999 } }), null);
  assert.equal(normalizeWidgetIssue({ ...ISSUE, env: null }), null);
  assert.equal(normalizeWidgetIssue(null), null);
  assert.equal(normalizeWidgetIssue("문자열"), null);
  assert.equal(normalizeWidgetIssue({ ...ISSUE, code: "USER_CANCEL" }), null, "창을 닫은 것은 막힘이 아니다");
  assert.equal(normalizeWidgetIssue({ ...ISSUE, code: "NEED_AGREEMENT_WITH_REQUIRED_TERMS" }), null);
  assert.equal(normalizeWidgetIssue({ ...ISSUE, code: "lower case; drop table" })?.code, "UNKNOWN");
  assert.equal(normalizeWidgetIssue({ ...ISSUE, message: "줄\n바꿈 ".repeat(100) })?.message.length, 160);
  // 보고에는 정해진 필드만 남는다 — 낯선 필드(키 · 주소 따위)를 실어 보내도 버려진다
  const withExtra = normalizeWidgetIssue({ ...ISSUE, clientKey: "test_gck_secret", url: "https://x?paymentKey=abc", env: { ...ENV, ua: "Mozilla/5.0 원문" } });
  assert.deepEqual(Object.keys(withExtra!).sort(), ["attempt", "code", "elapsedMs", "env", "message", "phase"]);
  assert.deepEqual(Object.keys(withExtra!.env).sort(), Object.keys(ENV).sort());
  // 운영 알림 줄: 단계 · 코드 · 환경 사실뿐
  const lines = widgetIssueLines(ok!).join("\n");
  assert.match(lines, /단계 render · 코드 REQUEST_TIMEOUT · 60\.1초 · 1번째 시도/);
  assert.match(lines, /브라우저 standard · 저장소 ok/);
  assert.doesNotMatch(lines, /test_gck|secret|paymentKey/);
});
