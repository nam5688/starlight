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
        requestPayment: async function () {
          log.push("pay");
          if (cfg.payError) { const e = new Error("pay"); e.code = cfg.payError; throw e; }
          // 끝나지 않는 결제 요청(결제 창 · 카드 앱이 진행 중이거나 이동 중인 상태) — 시험이 window.__payGate로 끝내거나 거절한다
          if (cfg.payPending) await new Promise(function (res, rej) { window.__payGate = { res: res, rej: rej }; });
        },
      };
    },
  };
};
`;
// 시간 제한을 줄여 시험한다: 위젯 준비 30초 → 0.4초(lib/commerce/widget-session.ts의 WIDGET_READY_TIMEOUT_MS = 30000), 결제 요청이 끝나지 않을 때의 안내 20초 → 0.6초(lib/commerce/pay-request.ts의 PAY_SLOW_MS = 20000)
const FAST_TIMEOUT = `const __st = window.setTimeout; window.setTimeout = (fn, ms, ...a) => __st(fn, ms === 30000 ? 400 : ms === 20000 ? 600 : ms, ...a);`;

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

  console.log("8) 결제 요청이 끝나지 않는 동안(결제 창 · 카드 앱 진행 중): 20초(여기선 0.6초) 뒤에도 실패로 바꾸지 않고 버튼을 다시 열지 않으며, 결제 여부를 단정하지 않는 안내만 보인다");
  {
    const t = await open({ payPending: true });
    await t.page.waitForFunction(() => !document.querySelector("button[aria-busy]")?.hasAttribute("disabled"), null, { timeout: 8000 });
    const payCount = () => t.page.evaluate(() => (window as any).__events.filter((e: string) => e === "pay").length);
    // 같은 틱에 두 번 눌러도(프로그램으로 연속 클릭) 요청은 한 번만 나간다
    await t.page.evaluate(() => {
      const b = document.querySelector("button[aria-busy]") as HTMLButtonElement;
      b.click();
      b.click();
    });
    await t.page.waitForFunction(() => (window as any).__events.includes("pay"), null, { timeout: 4000 });
    check((await payCount()) === 1, "연속으로 눌러도 결제 요청은 한 번만 나간다", await payCount());
    check((await payEnabled(t.page)) === false, "요청이 진행 중이면 결제 버튼이 잠겨 있다");
    check((await t.page.$('[data-testid="pay-slow-notice"]')) === null, "바로 직후에는 느린 응답 안내가 없다");
    // 안내가 뜰 때까지(0.6초 + 여유) 기다린다 — 그때까지 요청은 끝나지 않았다
    await t.page.waitForSelector('[data-testid="pay-slow-notice"]', { timeout: 4000 });
    const notice = await t.page.textContent('[data-testid="pay-slow-notice"]');
    check(/확인하지 못했어요/.test(notice) && /새로고침/.test(notice), "결제 여부를 확인하지 못했다고 알리고 새로고침 길을 준다", notice);
    check(!/결제는 되지 않았|금액이 빠져나가지 않|결제되지 않았/.test(notice), "결제되지 않았다고 단정하지 않는다", notice);
    check((await payEnabled(t.page)) === false, "안내가 뜬 뒤에도 결제 버튼은 다시 열리지 않는다(요청이 끝나지 않았기 때문)");
    await t.page.waitForTimeout(1500);
    check((await payEnabled(t.page)) === false, "더 기다려도 스스로 열리지 않는다");
    await t.page.click("button[aria-busy]", { force: true, timeout: 1000 }).catch(() => undefined);
    check((await payCount()) === 1, "잠긴 버튼을 억지로 눌러도 새 결제 요청이 나가지 않는다", await payCount());
    check((await t.page.$('[data-testid="pay-reload"]')) !== null, "[화면 새로고침] 버튼이 있다");
    check((await t.page.$('[data-testid="widget-message"]')) === null, "실패 문구(오류 알림)는 나오지 않는다");
    const list = await issues(t.page);
    check(list.length === 1 && list[0].phase === "pay" && list[0].code === "PAY_REQUEST_PENDING", "운영 기록에는 관찰 한 건(PAY_REQUEST_PENDING)만 남는다", list);
    const over = await t.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(over <= 0, "안내가 떠도 가로 넘침이 없다(390px)", over);
    // 뒤늦게 분명히 거절되면(창 닫기) 잠금이 풀리고 안내가 사라지며 다시 누를 수 있다
    await t.page.evaluate(() => {
      const e: any = new Error("closed");
      e.code = "USER_CANCEL";
      (window as any).__payGate.rej(e);
    });
    await t.page.waitForFunction(() => !document.querySelector("button[aria-busy]")?.hasAttribute("disabled"), null, { timeout: 4000 });
    check((await t.page.$('[data-testid="pay-slow-notice"]')) === null, "거절되면 느린 응답 안내가 사라진다");
    await t.page.click("button[aria-busy]");
    await t.page.waitForFunction(() => (window as any).__events.filter((e: string) => e === "pay").length === 2, null, { timeout: 4000 });
    check((await payCount()) === 2, "분명한 거절 뒤에는 다시 눌러 새 요청을 보낼 수 있다");
    check(t.external.length === 0 && t.errors.length === 0, "외부 요청 · 페이지 오류 없음", { external: t.external, errors: t.errors });
    await t.ctx.close();
  }

  console.log("9) 카드사 인증 대기(결제 요청 지연) 뒤 끝나는 방식별: 지연된 성공 · 지연된 오류 · 앱 전환(화면 숨김 → 복귀) — 끝나기 전에는 실패로 보지 않고, 끝나는 순간에만 상태가 정해진다");
  {
    const readyAndClick = async (t: any) => {
      await t.page.waitForFunction(() => !document.querySelector("button[aria-busy]")?.hasAttribute("disabled"), null, { timeout: 8000 });
      await t.page.click("button[aria-busy]");
      await t.page.waitForFunction(() => (window as any).__events.includes("pay"), null, { timeout: 4000 });
    };
    const payCount = (t: any) => t.page.evaluate(() => (window as any).__events.filter((e: string) => e === "pay").length);

    // (가) 지연된 성공: 안내가 뜨기 전에 요청이 성공 응답으로 끝났지만 화면이 바뀌지 않음(개발 확인 화면에는 이동이 없다) → "결과를 확인하는 중" 안내, 버튼 잠금 유지, 오류 문구 없음
    const ok = await open({ payPending: true });
    await readyAndClick(ok);
    await ok.page.evaluate(() => (window as any).__payGate.res({ paymentKey: "pk_fake" }));
    await ok.page.waitForSelector('[data-testid="pay-slow-notice"][data-settled="1"]', { timeout: 4000 });
    const settledText = await ok.page.textContent('[data-testid="pay-slow-notice"]');
    check(/확인하는 중/.test(settledText) && !/결제는 되지 않았|금액이 빠져나가지 않|결제되지 않았|결제가 완료되었/.test(settledText), "성공 응답 뒤에는 \"결과를 확인하는 중\" 안내만 보이고 결제 여부는 단정하지 않는다", settledText);
    check((await payEnabled(ok.page)) === false && (await payCount(ok)) === 1, "성공 응답 뒤에도 버튼은 잠긴 채 요청은 한 번뿐이다");
    check((await ok.page.$('[data-testid="widget-message"]')) === null, "성공 응답 뒤에 실패 문구가 나오지 않는다");
    await ok.ctx.close();

    // (나) 지연된 오류: 안내가 뜬 뒤(요청이 끝나지 않은 상태) 카드사 오류로 거절 → 그때 오류 문구 + 버튼 재개 + 관찰/오류 보고
    const err = await open({ payPending: true });
    await readyAndClick(err);
    await err.page.waitForSelector('[data-testid="pay-slow-notice"][data-settled="0"]', { timeout: 4000 });
    await err.page.evaluate(() => {
      const e: any = new Error("카드사 인증 실패");
      e.code = "INVALID_CARD_COMPANY";
      (window as any).__payGate.rej(e);
    });
    await err.page.waitForFunction(() => !document.querySelector("button[aria-busy]")?.hasAttribute("disabled"), null, { timeout: 4000 });
    check(/카드사 인증 실패/.test((await err.page.textContent('[data-testid="widget-message"]')) ?? ""), "거절이 확정된 그 순간에 SDK가 돌려준 오류 문구를 보인다");
    check((await err.page.$('[data-testid="pay-slow-notice"]')) === null, "거절되면 지연 안내가 사라진다");
    const errIssues = await issues(err.page);
    check(errIssues.length === 2 && errIssues[0].code === "PAY_REQUEST_PENDING" && errIssues[1].code === "INVALID_CARD_COMPANY", "운영 기록: 관찰(PAY_REQUEST_PENDING) 한 건 + 확정 오류 한 건", errIssues);
    await err.ctx.close();

    // (다) 앱 전환: 카드사 인증 앱으로 이동해 화면이 숨겨진 동안은 안내하지 않고, 돌아오면 안내한다. 그동안 버튼은 계속 잠겨 있다
    const away = await open({ payPending: true });
    await away.page.addInitScript(`(() => { let hidden = false; Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") }); window.__setHidden = (v) => { hidden = v; document.dispatchEvent(new Event("visibilitychange")); }; })();`);
    await away.page.reload({ waitUntil: "load" });
    await readyAndClick(away);
    await away.page.evaluate(() => (window as any).__setHidden(true));
    await away.page.waitForTimeout(1600);
    check((await away.page.$('[data-testid="pay-slow-notice"]')) === null, "화면이 숨겨진 동안(인증 앱 사용 중)에는 지연 안내를 띄우지 않는다");
    check((await payEnabled(away.page)) === false, "숨겨진 동안에도 버튼은 잠겨 있다");
    await away.page.evaluate(() => (window as any).__setHidden(false));
    await away.page.waitForSelector('[data-testid="pay-slow-notice"]', { timeout: 4500 });
    check((await payEnabled(away.page)) === false && (await payCount(away)) === 1, "돌아온 뒤에도 안내만 보이고 버튼은 잠겨 있으며 요청은 한 번뿐이다");
    await away.ctx.close();
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
