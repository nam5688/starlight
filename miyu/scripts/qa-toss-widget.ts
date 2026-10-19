// 결제수단 · 약관 화면 준비 과정의 브라우저 모의 검사 — 토스 호스팅 SDK 주소(js.tosspayments.com/v2/standard)를 가짜 스크립트로 바꿔 놓고 /dev/toss-widget을 연다.
// ⚠ 실제 토스 서버 · 키 · 결제와 통신하지 않는다. 가짜 SDK로 "우리 화면이 막혔을 때 어떻게 행동하는가"만 본다 — 실제 토스 위젯이 왜 60초 뒤 오류를 냈는지(원인)는 이 검사로 알 수 없다.
//
// 사용(miyu 폴더, 개발 서버가 떠 있어야 한다: npm run dev -- -p 4321): node scripts/qa-toss-widget.ts --base http://127.0.0.1:4321
/* eslint-disable @typescript-eslint/no-explicit-any */
const args = process.argv.slice(2);
const BASE = args[args.indexOf("--base") + 1] ?? "http://127.0.0.1:4321";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error("--base는 로컬 주소만 쓸 수 있어요.");
  process.exit(2);
}
type Pw = { chromium: { launch(o: Record<string, unknown>): Promise<any> } };
async function loadPlaywright(): Promise<Pw> {
  for (const c of [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node-tools/node_modules/playwright/index.mjs"].filter(Boolean) as string[]) {
    try {
      return (await import(c)) as Pw;
    } catch {
      // 다음 후보
    }
  }
  console.error("Playwright를 찾지 못했어요. PLAYWRIGHT_MODULE에 설치 경로를 적어 주세요.");
  process.exit(2);
}

/** 가짜 호스팅 SDK — window.TossPayments(clientKey).widgets({customerKey}) 모양만 같다. 동작은 window.__stub으로 정한다 */
const STUB_SCRIPT = `
window.TossPayments = function (clientKey) {
  const cfg = window.__stub || {};
  const log = (window.__events = window.__events || []);
  window.__calls = window.__calls || { widgets: 0, methods: 0 };
  return {
    widgets: function (o) {
      window.__calls.widgets++;
      log.push("widgets:" + o.customerKey);
      if (cfg.initError) { const e = new Error("init"); e.code = cfg.initError; throw e; }
      const mount = async function (kind, o) {
        log.push(kind + ":" + o.selector + "|" + o.variantKey);
        const el = document.querySelector(o.selector);
        if (!el) { const e = new Error("selector"); e.code = "INVALID_SELECTOR"; throw e; }
        if (kind === "methods") {
          window.__calls.methods++;
          if (cfg.hangMethodsFirst && window.__calls.methods <= cfg.hangMethodsFirst) await new Promise(function (r) { (window.__release = window.__release || []).push(r); });
          if (cfg.methodsError) { const e = new Error("variant"); e.code = cfg.methodsError; throw e; }
        }
        const f = document.createElement("iframe");
        f.dataset.stub = kind; f.title = kind; f.srcdoc = "<p>" + kind + " 가짜 화면</p>"; f.style.cssText = "width:100%;height:80px;border:0";
        el.appendChild(f);
        return { destroy: async function () { f.remove(); } };
      };
      return {
        setAmount: async function (a) { log.push("amount:" + a.value); },
        renderPaymentMethods: function (o) { return mount("methods", o); },
        renderAgreement: function (o) { return mount("agreement", o); },
        requestPayment: async function () { log.push("pay"); if (cfg.payError) { const e = new Error("pay"); e.code = cfg.payError; throw e; } },
      };
    },
  };
};
`;
// 30초 제한을 0.4초로 줄여 시험한다(실제 상수는 lib/commerce/widget-session.ts의 WIDGET_READY_TIMEOUT_MS = 30000)
const FAST_TIMEOUT = `const __st = window.setTimeout; window.setTimeout = (fn, ms, ...a) => __st(fn, ms === 30000 ? 400 : ms, ...a);`;

let failures = 0;
const check = (cond: boolean, label: string, detail?: unknown) => {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
};

async function main() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const open = async (stub: Record<string, unknown>, opts: { sdk?: "stub" | "abort-then-stub"; width?: number } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: opts.width ?? 390, height: 800 } });
    const page = await ctx.newPage();
    const external: string[] = [];
    let sdkRequests = 0;
    await page.route("https://js.tosspayments.com/**", async (route: any) => {
      sdkRequests++;
      if (opts.sdk === "abort-then-stub" && sdkRequests === 1) return route.abort("failed");
      await route.fulfill({ status: 200, contentType: "text/javascript", body: STUB_SCRIPT });
    });
    // 그 밖의 외부 요청이 나가는지 기록(로컬 서버 외에는 나가면 안 된다)
    page.on("request", (r: any) => {
      const u = r.url();
      if (!/^(https?:\/\/(127\.0\.0\.1|localhost)|data:|blob:|about:)/.test(u) && !u.startsWith("https://js.tosspayments.com/")) external.push(u);
    });
    await page.addInitScript(`window.__stub = ${JSON.stringify(stub)}; ${FAST_TIMEOUT}`);
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.goto(`${BASE}/dev/toss-widget`, { waitUntil: "load" });
    return { page, ctx, external, errors, sdkRequests: () => sdkRequests };
  };
  const issues = (page: any) => page.$$eval('[data-testid="issue"]', (els: HTMLElement[]) => els.map((e) => ({ phase: e.dataset.phase, code: e.dataset.code, attempt: e.dataset.attempt, text: e.textContent })));
  const payEnabled = (page: any) => page.$eval("button[aria-busy]", (b: HTMLButtonElement) => !b.disabled);

  console.log("1) 정상: 결제수단 · 약관 칸이 이 화면 고유 id로 그려지고 보고가 없다");
  {
    const t = await open({});
    await t.page.waitForFunction(() => document.querySelectorAll("iframe[data-stub]").length === 2, null, { timeout: 8000 });
    await t.page.waitForFunction(() => !document.querySelector("button[aria-busy]")?.hasAttribute("disabled"), null, { timeout: 5000 });
    const events: string[] = await t.page.evaluate(() => (window as any).__events);
    const ids = await t.page.$$eval("[id^='toss-']", (els: HTMLElement[]) => els.map((e) => e.id));
    check(events.some((e) => /^methods:#toss-methods-[A-Za-z0-9_-]+\|DEFAULT$/.test(e)), "결제수단은 고유 id 칸에 DEFAULT로", events);
    check(events.some((e) => /^agreement:#toss-agreement-[A-Za-z0-9_-]+\|AGREEMENT$/.test(e)), "약관은 고유 id 칸에 AGREEMENT로", events);
    check(!ids.includes("toss-payment-methods") && !ids.includes("toss-agreement"), "예전의 고정 id(toss-payment-methods · toss-agreement)가 없다", ids);
    check((await payEnabled(t.page)) === true, "준비가 끝나면 결제 버튼이 켜진다");
    check((await issues(t.page)).length === 0, "정상이면 막힘 보고가 없다");
    check(t.external.length === 0, "로컬 서버와 가짜 SDK 밖으로 나간 요청이 없다", t.external);
    check(t.errors.length === 0, "페이지 오류 없음", t.errors);
    await t.ctx.close();
  }

  console.log("2) 결제수단 화면이 끝내 열리지 않음: 제한 시간 뒤 멈추고 보고하며, 늦게 도착한 화면은 치우고, 다시 불러오면 한 쌍만 그려진다");
  {
    const t = await open({ hangMethodsFirst: 1 });
    await t.page.waitForSelector('[data-testid="widget-retry"]', { timeout: 8000 });
    const msg = await t.page.textContent('[data-testid="widget-message"]');
    check(/제때 열리지 않았어요/.test(msg) && /아직 결제되지 않았어요/.test(msg), "원인을 단정하지 않고 아직 결제되지 않았음을 알린다", msg);
    check((await payEnabled(t.page)) === false, "막히면 결제 버튼이 꺼져 있다");
    const first = await issues(t.page);
    check(first.length === 1 && first[0].phase === "render" && first[0].code === "CLIENT_TIMEOUT" && first[0].attempt === "1", "단계 render · 코드 CLIENT_TIMEOUT · 1번째 시도로 보고", first);
    check(/브라우저 standard/.test(first[0]?.text ?? "") && /저장소 ok/.test(first[0]?.text ?? ""), "환경 사실(브라우저 종류 · 저장소)이 함께 남는다", first[0]?.text);
    check(!/Mozilla|HeadlessChrome/.test(first[0]?.text ?? ""), "사용자 에이전트 원문은 보고에 없다");
    // 늦게 도착한 첫 시도의 화면은 치워진다
    await t.page.evaluate(() => ((window as any).__release ?? []).forEach((r: () => void) => r()));
    await t.page.waitForTimeout(300);
    const leftover = await t.page.$$eval("iframe[data-stub]", (els: HTMLElement[]) => els.length);
    check(leftover === 0, "시간 초과 뒤 늦게 도착한 화면이 남아 있지 않다(약관 화면 포함)", leftover);
    await t.page.click('[data-testid="widget-retry"]');
    await t.page.waitForFunction(() => document.querySelectorAll("iframe[data-stub]").length === 2, null, { timeout: 8000 });
    await t.page.waitForFunction(() => !document.querySelector("button[aria-busy]")?.hasAttribute("disabled"), null, { timeout: 5000 });
    check((await t.page.$$eval("iframe[data-stub='methods']", (e: any[]) => e.length)) === 1 && (await t.page.$$eval("iframe[data-stub='agreement']", (e: any[]) => e.length)) === 1, "다시 불러오면 결제수단 · 약관이 한 쌍만 그려진다");
    check((await issues(t.page)).length === 1, "성공한 다시 시도는 보고를 더하지 않는다");
    check(await t.page.$eval('[data-testid="widget-message"]', () => false).catch(() => true), "성공하면 오류 문구가 사라진다");
    await t.ctx.close();
  }

  console.log("3) 토스가 돌려준 오류 코드를 잃지 않는다 (INVALID_VARIANT_KEY)");
  {
    const t = await open({ methodsError: "INVALID_VARIANT_KEY" });
    await t.page.waitForSelector('[data-testid="widget-retry"]', { timeout: 8000 });
    const list = await issues(t.page);
    check(list.length === 1 && list[0].phase === "render" && list[0].code === "INVALID_VARIANT_KEY", "코드 INVALID_VARIANT_KEY · 단계 render", list);
    const msg = await t.page.textContent('[data-testid="widget-message"]');
    check(/불러오지 못했어요/.test(msg) && !/INVALID|variant/i.test(msg), "고객 문구에는 내부 코드가 나오지 않는다", msg);
    const leftover = await t.page.$$eval("iframe[data-stub]", (els: HTMLElement[]) => els.length);
    check(leftover === 0, "실패하면 한쪽만 그려진 화면을 치운다(약관 화면이 혼자 남지 않는다)", leftover);
    // 다시 시도를 계속 눌러도 보고는 3건까지
    for (let i = 0; i < 4; i++) {
      await t.page.click('[data-testid="widget-retry"]');
      await t.page.waitForFunction((n: number) => document.querySelectorAll('[data-testid="widget-message"]').length === 1 && (window as any).__calls.methods >= n, i + 2, { timeout: 8000 });
      await t.page.waitForTimeout(150);
    }
    const all = await issues(t.page);
    check(all.length === 3, "보고는 한 번 열 때 3건까지만", all.length);
    check(all.map((a: any) => a.attempt).join(",") === "1,2,3", "시도 번호가 1,2,3으로 남는다", all.map((a: any) => a.attempt));
    await t.ctx.close();
  }

  console.log("4) 결제 모듈(SDK)을 불러오지 못함: 단계 sdk로 보고하고 안내하며, 다시 불러오면 이어진다");
  {
    const t = await open({}, { sdk: "abort-then-stub" });
    await t.page.waitForSelector('[data-testid="widget-retry"]', { timeout: 8000 });
    const list = await issues(t.page);
    check(list.length === 1 && list[0].phase === "sdk" && list[0].code === "SDK_LOAD_FAILED", "단계 sdk · 코드 SDK_LOAD_FAILED", list);
    const msg = await t.page.textContent('[data-testid="widget-message"]');
    check(/결제 모듈을 불러오지 못했어요/.test(msg) && /광고 차단/.test(msg), "연결 · 광고 차단을 확인하라고 안내한다", msg);
    await t.page.click('[data-testid="widget-retry"]');
    await t.page.waitForFunction(() => document.querySelectorAll("iframe[data-stub]").length === 2, null, { timeout: 8000 });
    check(t.sdkRequests() === 2, "다시 불러오면 SDK를 다시 받는다", t.sdkRequests());
    await t.ctx.close();
  }

  console.log("5) 같은 화면이 문서에 두 개 있어도(남아 있는 이전 화면) 칸이 겹치지 않고 각자 한 쌍만 그려진다");
  {
    const t = await open({});
    await t.page.waitForFunction(() => document.querySelectorAll("iframe[data-stub]").length === 2, null, { timeout: 8000 });
    await t.page.click('[data-testid="open-second"]');
    await t.page.waitForFunction(() => document.querySelectorAll("iframe[data-stub]").length === 4, null, { timeout: 8000 });
    const per = await t.page.$$eval("[data-toss-methods]", (els: HTMLElement[]) => els.map((e) => ({ id: e.id, iframes: e.querySelectorAll("iframe").length })));
    check(per.length === 2 && new Set(per.map((p: any) => p.id)).size === 2, "결제수단 칸 id가 서로 다르다", per);
    check(per.every((p: any) => p.iframes === 1), "각 칸에 자기 화면 하나씩만 그려진다(숨겨진 옛 칸으로 가지 않는다)", per);
    check((await issues(t.page)).length === 0, "보고 없음");
    await t.ctx.close();
  }

  console.log("6) 결제창에서 구매자가 닫은 것은 막힘 보고로 남기지 않고, 그 밖의 결제 시작 오류는 단계 pay로 남긴다");
  for (const [code, expected] of [["USER_CANCEL", 0], ["PAY_PROCESS_CANCELED", 0], ["INVALID_PARAMETERS", 1]] as const) {
    const t = await open({ payError: code });
    await t.page.waitForFunction(() => !document.querySelector("button[aria-busy]")?.hasAttribute("disabled"), null, { timeout: 8000 });
    await t.page.click("button[aria-busy]");
    await t.page.waitForFunction(() => (window as any).__events.includes("pay"), null, { timeout: 4000 });
    await t.page.waitForTimeout(200);
    const list = await issues(t.page);
    check(list.length === expected && (expected === 0 || (list[0].phase === "pay" && list[0].code === code)), `${code}: 보고 ${expected}건`, list);
    check(await payEnabled(t.page), `${code}: 다시 눌러 볼 수 있게 결제 버튼이 켜진다`);
    await t.ctx.close();
  }

  console.log("7) 좁은 화면(390px)에서 오류 상태가 가로로 넘치지 않는다");
  {
    const t = await open({ methodsError: "UNKNOWN_ERROR" });
    await t.page.waitForSelector('[data-testid="widget-retry"]', { timeout: 8000 });
    const over = await t.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(over <= 0, "가로 넘침 없음", over);
    const box = await t.page.$eval('[data-testid="widget-retry"]', (b: HTMLElement) => {
      const r = b.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    check(box.h >= 44 && box.w >= 300, "다시 불러오기 버튼이 누르기 쉬운 크기", box);
    await t.ctx.close();
  }

  await browser.close();
  console.log(failures === 0 ? "\n모두 통과(가짜 SDK 모의 검사 — 실제 토스 위젯 동작은 확인하지 못했다)" : `\n실패 ${failures}건`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
