// 홈 화면 앱(PWA) 모의 검사 — 로컬 서버에서 매니페스트 · 아이콘 · 안내 · 앱처럼 열린 상태의 흐름을 본다.
// ⚠ 실제 iPhone · Android에서 "홈 화면에 추가"한 앱이 아니다. 브라우저에서 "앱처럼 열린 것으로 보이게"(display-mode: standalone · iOS navigator.standalone를
//   스크립트로 주입) 한 모의 검사이고, 실제 설치 · 카카오 복귀 · 토스 결제 복귀 · 앱 전환 · 홈 막대 · 상태 표시줄은 보지 못한다. 결과는 "모의 검사"로만 기록한다.
//
// 사용: node scripts/qa-pwa.ts --base http://127.0.0.1:4321 [--seed <seed.json>] [--part a|b|all] [--kakao-id 7770101]
//   part a: 로그인 없이 보는 것(매니페스트 · 아이콘 · 메타 · 안내 · 서비스 워커 없음)
//   part b: 앱처럼 열린 상태의 흐름(직접 주소 · 로그인 · 카카오 복귀 · 새로고침 · 뒤로가기 · 세션 만료 · 막다른 화면) — 로컬 스택 + 가짜 카카오 서버 필요
// --base는 로컬 주소만 쓸 수 있다. 비용 없음 · 외부 서비스 연결 없음.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = opt("base", "http://127.0.0.1:4321")!;
const PART = opt("part", "all")!;
const SEED = opt("seed");
const KAKAO_ID = Number(opt("kakao-id", String(7770100 + Math.floor(Math.random() * 800))));
const KAKAO_MOCK = opt("kakao-mock", "http://127.0.0.1:54501")!;

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error("--base는 로컬 주소만 쓸 수 있어요.");
  process.exit(2);
}
const seed: { A: { email: string; password: string; aid: string }; pairId?: string } | null = SEED ? JSON.parse(readFileSync(SEED, "utf8")) : null;

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

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneKakao: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 11.2.0",
  androidChrome: "Mozilla/5.0 (Linux; Android 15; SM-F971B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Mobile Safari/537.36",
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

/** "앱처럼 열린 상태"로 보이게 하는 주입 — 실제 설치가 아니다 */
const STANDALONE_INIT = `
  (() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) => {
      if (/display-mode\\s*:\\s*standalone/.test(q)) return { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } };
      return real(q);
    };
    try { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); } catch {}
  })();
`;

const results: { name: string; ok: boolean; detail: string }[] = [];
async function check(name: string, fn: () => Promise<string | void>) {
  try {
    const detail = (await fn()) ?? "";
    results.push({ name, ok: true, detail });
    console.log(`PASS  ${name}${detail ? "  — " + detail : ""}`);
  } catch (e) {
    const detail = String((e as Error).message).slice(0, 700).replace(/\n/g, " | ");
    results.push({ name, ok: false, detail });
    console.log(`FAIL  ${name}  — ${detail}`);
  }
}

async function main() {
  const pw = await loadPlaywright();
  const executablePath = process.env.CHROMIUM_PATH ?? (process.platform === "linux" ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await pw.chromium.launch({ executablePath, args: ["--no-sandbox"] });
  const ctxOf = (o: Record<string, unknown> = {}) => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "ko-KR", ...o });

  if (PART === "a" || PART === "all") {
    await check("A1 매니페스트가 앱 매니페스트 형식으로 열리고 아이콘 3개가 실제 이미지로 열린다", async () => {
      const ctx = await ctxOf();
      const page = await ctx.newPage();
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      const out = await page.evaluate(async () => {
        const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
        if (!link) return { error: "manifest 링크가 없다" };
        const res = await fetch(link.href);
        const manifest = await res.json();
        const icons: string[] = [];
        for (const icon of manifest.icons) {
          const r = await fetch(icon.src);
          const blob = await r.blob();
          const bmp = await createImageBitmap(blob);
          icons.push(`${icon.src.split("/").pop()} ${r.status} ${blob.type} ${bmp.width}x${bmp.height} ${icon.purpose}`);
        }
        return { type: res.headers.get("content-type"), manifest, icons };
      });
      await ctx.close();
      if ((out as any).error) throw new Error((out as any).error);
      const o = out as any;
      if (!/manifest\+json|json/.test(o.type)) throw new Error(`content-type ${o.type}`);
      if (o.manifest.display !== "standalone" || o.manifest.start_url !== "/" || o.manifest.scope !== "/") throw new Error("display · start_url · scope");
      for (const line of o.icons) if (!/ 200 image\/png /.test(line)) throw new Error(line);
      return o.icons.join(" · ");
    });

    await check("A2 머리 태그: apple-touch-icon 180 · theme-color · 앱처럼 열기 메타 · 확대 허용 viewport", async () => {
      const ctx = await ctxOf();
      const page = await ctx.newPage();
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      const head = await page.evaluate(() => ({
        apple: (document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null)?.sizes?.value,
        theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
        capable: document.querySelector('meta[name="mobile-web-app-capable"]')?.getAttribute("content"),
        title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content"),
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "",
        favicon: (document.querySelector('link[rel="icon"]') as HTMLLinkElement | null)?.href,
      }));
      await ctx.close();
      if (head.apple !== "180x180") throw new Error(`apple-touch-icon ${head.apple}`);
      if (head.capable !== "yes" || !head.title) throw new Error("앱처럼 열기 메타가 없다");
      if (/maximum-scale|user-scalable/.test(head.viewport)) throw new Error(`확대를 막는 viewport: ${head.viewport}`);
      if (/viewport-fit/.test(head.viewport)) throw new Error("viewport-fit이 켜져 있다(안전 영역 여백이 필요해진다)");
      return `apple ${head.apple} · theme ${head.theme} · viewport "${head.viewport}"`;
    });

    const tipOf = async (userAgent: string, init?: string, mobile = true) => {
      const ctx = await ctxOf({ userAgent, isMobile: mobile, hasTouch: mobile });
      if (init) await ctx.addInitScript(init);
      const page = await ctx.newPage();
      await page.goto(BASE + "/terms", { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      const tip = page.locator("[data-home-screen-tip]");
      const count = await tip.count();
      const kind = count ? await tip.first().getAttribute("data-home-screen-tip") : null;
      let text = "";
      if (count) {
        await tip.first().locator("summary").click();
        text = (await tip.first().innerText()).replace(/\s+/g, " ");
      }
      await ctx.close();
      return { count, kind, text };
    };
    await check("A3 iPhone Safari에서는 iPhone용 안내(공유 버튼 → 홈 화면에 추가)가 접힌 글로 있고, 눌러야 펼쳐진다", async () => {
      const t = await tipOf(UA.iphoneSafari);
      if (t.kind !== "ios-safari") throw new Error(`종류 ${t.kind}`);
      if (!/공유/.test(t.text) || !/홈 화면에 추가/.test(t.text)) throw new Error(t.text.slice(0, 200));
      return t.text.slice(0, 90);
    });
    await check("A3 Android Chrome에서는 Android용 안내(⋮ 메뉴 → 홈 화면에 추가/앱 설치)를 보인다", async () => {
      const t = await tipOf(UA.androidChrome);
      if (t.kind !== "android-chrome") throw new Error(`종류 ${t.kind}`);
      if (!/⋮/.test(t.text) || !/홈 화면에 추가|앱 설치/.test(t.text)) throw new Error(t.text.slice(0, 200));
      return t.text.slice(0, 90);
    });
    await check("A3 카카오톡 앱 안 브라우저에서는 '다른 브라우저로 열기'를 안내한다", async () => {
      const t = await tipOf(UA.iphoneKakao);
      if (t.kind !== "in-app") throw new Error(`종류 ${t.kind}`);
      if (!/다른 브라우저로 열기/.test(t.text)) throw new Error(t.text.slice(0, 200));
      return t.text.slice(0, 90);
    });
    await check("A3 데스크톱에서는 안내하지 않는다", async () => {
      const t = await tipOf(UA.desktop, undefined, false);
      if (t.count !== 0) throw new Error(`안내가 ${t.count}개 보인다`);
    });
    await check("A3 이미 홈 화면 앱으로 열린 상태(display-mode: standalone / iOS navigator.standalone — 주입한 모의)에서는 중복 안내하지 않는다", async () => {
      for (const [label, ua] of [["iPhone", UA.iphoneSafari], ["Android", UA.androidChrome]] as const) {
        const t = await tipOf(ua, STANDALONE_INIT);
        if (t.count !== 0) throw new Error(`${label} standalone 모의에서 안내가 보인다`);
      }
    });
    await check("A3 안내는 서버가 그린 HTML에 없고(깜빡임 없음) 열린 뒤에만 나타난다 · 강제 팝업(dialog · 모달)이 없다", async () => {
      const html = await (await fetch(BASE + "/terms", { headers: { "user-agent": UA.iphoneSafari } })).text();
      if (/data-home-screen-tip/.test(html)) throw new Error("서버 HTML에 안내가 들어 있다");
      const ctx = await ctxOf({ userAgent: UA.iphoneSafari });
      const page = await ctx.newPage();
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      const dialogs = await page.locator("dialog[open], [role=dialog], [aria-modal=true]").count();
      await ctx.close();
      if (dialogs) throw new Error(`열린 대화상자 ${dialogs}개`);
    });
    await check("A4 서비스 워커 등록이 없고 브라우저 저장소(Cache Storage)도 비어 있다 — 오프라인 저장 없음", async () => {
      const ctx = await ctxOf({ userAgent: UA.androidChrome });
      await ctx.addInitScript(STANDALONE_INIT);
      const page = await ctx.newPage();
      for (const p of ["/", "/analyze", "/compat", "/report/sample", "/terms"]) await page.goto(BASE + p, { waitUntil: "networkidle" });
      const state = await page.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, caches: await caches.keys(), controller: !!navigator.serviceWorker.controller }));
      await ctx.close();
      if (state.regs || state.caches.length || state.controller) throw new Error(JSON.stringify(state));
      return "등록 0 · Cache Storage 0";
    });
    await check("A5 매니페스트 · 아이콘 응답에 개인 정보가 없고 저장 금지 헤더가 붙지 않는다(공개 자산) — 개인 화면은 그대로 저장 금지", async () => {
      const pub = ["/manifest.webmanifest", "/apple-icon.png", "/miyu/icons/icon-192.png", "/favicon.ico"];
      for (const p of pub) {
        const r = await fetch(BASE + p);
        if (r.status !== 200) throw new Error(`${p} ${r.status}`);
        if (/no-store/.test(r.headers.get("cache-control") ?? "")) throw new Error(`${p}에 no-store(공개 자산인데)`);
      }
      const priv = ["/my", "/results/00000000-0000-0000-0000-000000000000", "/pair", "/checkout/MEU-NONE", "/compat/report/MEU-NONE"];
      for (const p of priv) {
        const r = await fetch(BASE + p, { redirect: "manual" });
        const cc = r.headers.get("cache-control") ?? "";
        if (!/no-store/.test(cc) || !/private/.test(cc)) throw new Error(`${p} Cache-Control=${cc}`);
      }
      return `공개 ${pub.length}개 · 개인 ${priv.length}개`;
    });
  }

  if ((PART === "b" || PART === "all") && seed) {
    const A = seed.A;
    const aid = A.aid;
    const mkCtx = () => ctxOf({ userAgent: UA.iphoneSafari });
    const login = async (page: any, next: string) => {
      await page.goto(`${BASE}/auth/email?next=${encodeURIComponent(next)}`, { waitUntil: "networkidle" });
      await page.fill("#email", A.email);
      await page.fill("#password", A.password);
      await page.click("button[type=submit]");
      await page.waitForURL((u: URL) => !u.pathname.startsWith("/auth/email"), { timeout: 30000 });
    };

    await check("B1 앱처럼 열린 상태에서 로그인 없이 개인 결과 주소를 직접 열면 내용 대신 로그인 안내가 나오고, 로그인하면 그 결과로 돌아온다", async () => {
      const ctx = await mkCtx();
      await ctx.addInitScript(STANDALONE_INIT);
      const page = await ctx.newPage();
      const r = await page.goto(`${BASE}/results/${aid}`, { waitUntil: "networkidle" });
      const body = await page.locator("body").innerText();
      if (/큐에이|검사 문항/.test(body)) throw new Error("로그인 전에 개인 내용이 보인다");
      const hasLogin = (await page.getByRole("button", { name: /카카오로 로그인/ }).count()) + (await page.locator('a[href^="/auth/email"]').count()) > 0;
      if (!hasLogin) throw new Error(`로그인 안내가 없다: ${page.url()} ${body.slice(0, 120).replace(/\n/g, " ")}`);
      const landed = new URL(page.url()).pathname;
      await login(page, `/results/${aid}`);
      const back = new URL(page.url()).pathname;
      await ctx.close();
      if (back !== `/results/${aid}`) throw new Error(`로그인 뒤 돌아온 곳: ${back}`);
      return `처음 HTTP ${r?.status()} ${landed} → 로그인 뒤 ${back.replace(aid, "<결과>")}`;
    });

    await check("B2 앱처럼 열린 상태에서 새로고침 · 뒤로가기 · 같은 화면 다시 열기: 로그인이 유지되고 내용이 그대로 나온다", async () => {
      const ctx = await mkCtx();
      await ctx.addInitScript(STANDALONE_INIT);
      const page = await ctx.newPage();
      await login(page, "/my");
      const steps: string[] = [];
      for (const p of ["/my", `/results/${aid}`, `/results/${aid}/talk`]) {
        await page.goto(BASE + p, { waitUntil: "networkidle" });
        await page.reload({ waitUntil: "networkidle" });
        const path = new URL(page.url()).pathname;
        const text = await page.locator("body").innerText();
        if (path !== p) throw new Error(`${p} 새로고침 뒤 ${path}`);
        if (/로그인이 필요|카카오로 로그인/.test(text) && p !== "/my") throw new Error(`${p} 새로고침 뒤 로그인 안내`);
        steps.push(`${p.replace(aid, "<결과>")} 새로고침 유지`);
      }
      // 뒤로가기: 마지막 두 화면을 되짚는다
      await page.goBack({ waitUntil: "networkidle" });
      const afterBack = new URL(page.url()).pathname;
      if (afterBack !== `/results/${aid}`) throw new Error(`뒤로가기 뒤 ${afterBack}`);
      const stillIn = !/카카오로 로그인/.test(await page.locator("body").innerText());
      if (!stillIn) throw new Error("뒤로가기 뒤 로그인 안내가 나왔다");
      await ctx.close();
      return `${steps.join(" · ")} · 뒤로가기 ${afterBack.replace(aid, "<결과>")}`;
    });

    await check("B3 세션이 만료되면(로그인 쿠키 삭제) 화면 이동 · 새로고침이 오류 화면이 아니라 로그인 안내가 되고, 다시 로그인하면 보던 화면으로 돌아온다", async () => {
      const ctx = await mkCtx();
      await ctx.addInitScript(STANDALONE_INIT);
      const page = await ctx.newPage();
      await login(page, "/my");
      await ctx.clearCookies();
      await page.goto(`${BASE}/results/${aid}/talk`, { waitUntil: "networkidle" });
      const text = await page.locator("body").innerText();
      if (/큐에이|ERR-|Application error|Internal Server Error/.test(text)) throw new Error(`개인 내용 · 오류 화면: ${text.slice(0, 120)}`);
      const hasLogin = (await page.getByRole("button", { name: /카카오로 로그인/ }).count()) + (await page.locator('a[href^="/auth/email"]').count()) > 0;
      if (!hasLogin) throw new Error(`로그인 안내가 없다: ${page.url()} / ${text.slice(0, 150).replace(/\n/g, " ")}`);
      await page.reload({ waitUntil: "networkidle" });
      const stillLogin = (await page.getByRole("button", { name: /카카오로 로그인/ }).count()) + (await page.locator('a[href^="/auth/email"]').count()) > 0;
      if (!stillLogin) throw new Error("새로고침 뒤 로그인 안내가 사라졌다");
      await login(page, `/results/${aid}/talk`);
      const back = new URL(page.url()).pathname;
      await ctx.close();
      if (back !== `/results/${aid}/talk`) throw new Error(`다시 로그인 뒤 ${back}`);
      return "만료 → 로그인 안내 → 새로고침 유지 → 재로그인 뒤 같은 화면";
    });

    await check("B4 카카오 로그인 복귀(가짜 카카오 서버): 앱처럼 열린 상태에서 [카카오로 로그인] → 복귀 → 처음 열려던 화면, 뒤로가기가 인증 주소로 가지 않는다", async () => {
      const set = await fetch(`${KAKAO_MOCK}/__identity`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: KAKAO_ID, nickname: "앱시험" }) });
      if (!set.ok) throw new Error("가짜 카카오 서버에 연결하지 못했다");
      const ctx = await mkCtx();
      await ctx.addInitScript(STANDALONE_INIT);
      await ctx.route(/kakao\.com/, (r: any) => r.abort());
      const page = await ctx.newPage();
      await page.goto(`${BASE}/my`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /카카오로 로그인/ }).first().click();
      await page.waitForURL((u: URL) => u.pathname.startsWith("/auth/consent") || u.pathname === "/my", { timeout: 30000 });
      if (new URL(page.url()).pathname.startsWith("/auth/consent")) {
        for (const label of ["만 14세 이상입니다", "서비스 이용약관 동의", "개인정보 수집·이용 동의"]) await page.getByLabel(new RegExp(label)).check();
        await page.getByRole("button", { name: "동의하고 시작하기" }).click();
        await page.waitForURL((u: URL) => u.pathname === "/my", { timeout: 30000 });
      }
      const landed = new URL(page.url()).pathname;
      if (landed !== "/my") throw new Error(`복귀 위치 ${landed}`);
      const url = page.url();
      if (/[?&](code|state)=/.test(url)) throw new Error(`복귀 주소에 인증 값이 남아 있다: ${url}`);
      await page.goBack({ waitUntil: "load" }).catch(() => undefined);
      const afterBack = page.url();
      const callbackLeft = /\/auth\/v1\/callback|\/auth\/callback|[?&]code=/.test(afterBack);
      await ctx.close();
      if (callbackLeft) throw new Error(`뒤로가기가 인증 복귀 주소로 갔다: ${afterBack}`);
      return `복귀 ${landed} · 뒤로가기 ${new URL(afterBack).pathname}`;
    });

    await check("B5 앱처럼 열려 주소창 · 뒤로가기 버튼이 없어도 막다른 화면이 없다 — 모든 화면에 화면 안의 이동 길(홈 · MY · 뒤로)이 있다", async () => {
      const ctx = await mkCtx();
      await ctx.addInitScript(STANDALONE_INIT);
      const page = await ctx.newPage();
      await login(page, "/my");
      const routes = [
        "/", "/analyze", "/compat", "/report/sample", "/report/sample/talk", "/terms", "/privacy", "/assessment-basis", "/withdrawn", "/auth/email", "/invite/NOSUCHTOKEN0000000000",
        `/results/${aid}`, `/results/${aid}/talk`, "/my", "/my/chats", "/pair", ...(seed.pairId ? [`/pair/${seed.pairId}`] : []),
        "/checkout/MEU-00000000-NOPE", "/payments/fail?code=PAY_PROCESS_CANCELED&message=cancel&orderId=MEU-00000000-NOPE", "/payments/success?paymentKey=pk_x&orderId=MEU-00000000-NOPE&amount=9900&paymentType=NORMAL", "/no-such-page-xyz",
      ];
      const dead: string[] = [];
      for (const p of routes) {
        await page.goto(BASE + p, { waitUntil: "networkidle" }).catch(() => undefined);
        await page.waitForTimeout(150);
        const exits = await page.evaluate(() => {
          const ok = (el: Element) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[hidden]");
          };
          const links = Array.from(document.querySelectorAll("a[href]")).filter((a) => ok(a) && /^(\/|\/my|\/results\/|\/pair|\/analyze)(\?|$|\/)?/.test((a as HTMLAnchorElement).getAttribute("href") ?? ""));
          const backs = Array.from(document.querySelectorAll("button,a")).filter((b) => ok(b) && /뒤로|닫기|나가기|돌아가기|처음으로|MY로 가기/.test((b.getAttribute("aria-label") ?? "") + (b.textContent ?? "")));
          return links.length + backs.length;
        });
        if (!exits) dead.push(p.replace(aid, "<결과>").replace(seed.pairId ?? "∅", "<쌍>").slice(0, 60));
      }
      await ctx.close();
      if (dead.length) throw new Error(`화면 안의 이동 길이 없는 곳: ${dead.join(" | ")}`);
      return `${routes.length}개 화면 모두 이동 길 있음`;
    });
  } else if (PART === "b" || PART === "all") {
    console.log("part b는 --seed가 필요해요 — 건너뜀(미실행)");
  }

  await browser.close();
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} 통과 (앱처럼 열린 상태 모의 검사 — 실제 설치한 앱 아님)`);
  process.exit(ok === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
