// 반응형 모의 검사 — 접이식(폴더블) · 분할 창 · 가로/세로 · 키보드 · 글자 확대를 "창 크기를 바꿔서" 본다.
// ⚠ 실제 폰이 아니다. 실제 iPhone · Galaxy 기기의 힌지 · 화면 전환 · 키보드 · 홈 화면 앱 동작은 보지 않는다 (lib/qa/viewport-matrix.ts 머리말).
//   결과는 "반응형 모의 검사(Chromium 크기 조정)"로만 기록하고 "실제 폰 통과"로 쓰지 않는다.
//
// 사용 (로컬 개발 서버 또는 로컬 스택 + 가짜 서버가 떠 있을 때):
//   node scripts/qa-responsive.ts --base http://127.0.0.1:4321 [--seed <seed.json>] [--tier quick|full] [--out <폴더>] [--no-shots]
// - seed.json은 로컬 시험 데이터(로그인 회원 A의 이메일 · 비밀번호 · 결과 번호 aid · 쌍 번호 pairId)이고 저장소에 없다. 없으면 로그인 없는 화면만 본다.
// - Playwright가 필요하다(저장소 의존성이 아니다). `PLAYWRIGHT_MODULE`에 설치 경로를 적거나 일반 설치를 쓴다. 크로미움 경로는 `CHROMIUM_PATH`.
// - 비용 없음 · 실제 외부 서비스에 연결하지 않는다 (--base는 로컬 주소여야 한다).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { quickMatrix, TEXT_ZOOMS, viewportMatrix, type ViewportCase } from "../lib/qa/viewport-matrix.ts";

const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = opt("base", "http://127.0.0.1:4321")!;
const SEED = opt("seed");
const TIER = opt("tier", "quick")!;
const OUT = opt("out", "responsive-out")!;
const SHOTS = !args.includes("--no-shots");

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error("--base는 로컬 주소(http://127.0.0.1:포트)만 쓸 수 있어요 — 이 검사는 외부 서비스에 연결하지 않아요.");
  process.exit(2);
}

type Seed = { A: { email: string; password: string; aid: string }; pairId?: string };
const seed: Seed | null = SEED ? JSON.parse(readFileSync(SEED, "utf8")) : null;

// Playwright는 저장소 의존성이 아니라서 타입을 가져오지 않는다 — 쓰는 부분만 느슨하게 둔다
/* eslint-disable @typescript-eslint/no-explicit-any */
type Browser = any;
type Pw = { chromium: { launch(options: Record<string, unknown>): Promise<Browser> } };

async function loadPlaywright(): Promise<Pw> {
  const candidates = [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node-tools/node_modules/playwright/index.mjs"].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      return (await import(c)) as Pw;
    } catch {
      // 다음 후보
    }
  }
  console.error("Playwright를 찾지 못했어요. PLAYWRIGHT_MODULE에 설치 경로를 적어 주세요.");
  process.exit(2);
}

type Row = { viewport: string; page: string; ok: boolean; problems: string[]; notes: string[] };
const rows: Row[] = [];
const stateRows: { name: string; ok: boolean; detail: string }[] = [];

/** 페이지 안에서 재는 값 */
function measurePage() {
  const vw = document.documentElement.clientWidth;
  const problems: string[] = [];
  const notes: string[] = [];
  if (document.documentElement.scrollWidth > vw + 1) problems.push(`가로 넘침 ${document.documentElement.scrollWidth}>${vw}`);
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[hidden],[inert],.sr-only,[aria-hidden=true]");
  };
  const beyond: string[] = [];
  const clipped: string[] = [];
  for (const el of Array.from(document.querySelectorAll("body *"))) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const scrollParent = el.closest("[class*=overflow-x-auto],[class*=overflow-x-scroll],[class*=overflow-auto]");
    if (!scrollParent && cs.position !== "fixed" && r.right > vw + 1 && beyond.length < 4) beyond.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`);
    // 글자가 잘리는 곳: 가로로 가리는 상자 안에서 내용이 더 넓은데 줄임표(…)로 일부러 줄인 것도 아닌 경우
    if ((cs.overflowX === "hidden" || cs.overflowX === "clip") && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== "ellipsis" && (el.textContent ?? "").trim().length > 0 && clipped.length < 4) {
      clipped.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${el.scrollWidth}>${el.clientWidth}`);
    }
  }
  if (beyond.length) problems.push(`폭 밖 요소: ${beyond.join(" | ")}`);
  if (clipped.length) problems.push(`글자 잘림 의심: ${clipped.join(" | ")}`);
  // 눌리는 요소가 너무 작은 곳(24px 미만은 문제, 44px 미만은 참고)
  let tiny = 0;
  let under44 = 0;
  for (const el of Array.from(document.querySelectorAll("button, input:not([type=hidden]), select, textarea, summary, [role=button], a"))) {
    if (!visible(el)) continue;
    if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.closest("p, li, span, small")) continue;
    const label = el.closest("label");
    const box = (label ?? el).getBoundingClientRect();
    if (box.width < 24 || box.height < 24) tiny += 1;
    if (box.width < 44 || box.height < 44) under44 += 1;
  }
  if (tiny) problems.push(`24px 미만 눌리는 요소 ${tiny}개`);
  notes.push(`44px 미만 ${under44}개(참고)`);
  return { problems, notes };
}

/** 끝까지 내렸을 때 마지막 눌리는 요소가 고정된 아래 막대에 가려지지 않는가 */
function bottomCoverage() {
  window.scrollTo(0, document.documentElement.scrollHeight);
  const candidates = Array.from(document.querySelectorAll("#main a, #main button, #main input, #main summary, main a, main button")).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[inert],[hidden]");
  });
  const last = candidates[candidates.length - 1];
  if (!last) return { covered: false, detail: "눌리는 요소 없음" };
  last.scrollIntoView({ block: "end" });
  const r = last.getBoundingClientRect();
  const x = Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2));
  const y = Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2));
  const top = document.elementFromPoint(x, y);
  const covered = !!top && !(last === top || last.contains(top) || top.contains(last));
  return { covered, detail: covered ? `${(top as Element).tagName.toLowerCase()}.${String((top as Element).className).slice(0, 40)}가 가림` : "가려지지 않음" };
}

/** 인생 흐름(6장 시간축) · 카드 점검 */
function timelineAudit() {
  const vw = document.documentElement.clientWidth;
  const problems: string[] = [];
  const group = document.querySelector('[role=group][aria-label^="시기 타임라인"]');
  if (!group) return { present: false, problems };
  const g = group.getBoundingClientRect();
  if (g.right > vw + 1 || g.left < -1) problems.push(`시간축 상자가 화면 밖 ${Math.round(g.left)}~${Math.round(g.right)} / ${vw}`);
  const bars = Array.from(group.querySelectorAll("button[aria-label], a[aria-label]")).filter((b) => b.getBoundingClientRect().width > 0);
  const rects = bars.map((b) => b.getBoundingClientRect());
  rects.forEach((r, i) => {
    if (r.width < 44 || r.height < 44) problems.push(`시간축 막대 ${i + 1} 눌리는 크기 ${Math.round(r.width)}×${Math.round(r.height)}`);
    if (r.right > g.right + 1 || r.left < g.left - 1) problems.push(`시간축 막대 ${i + 1}이 상자 밖`);
  });
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlapW = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapH = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapW > 1 && overlapH > 1) problems.push(`시간축 막대 ${i + 1}과 ${j + 1}이 겹침 ${Math.round(overlapW)}×${Math.round(overlapH)}`);
    }
  for (const d of Array.from(document.querySelectorAll("details[data-flow-key]"))) {
    const r = d.getBoundingClientRect();
    if (r.right > vw + 1) problems.push(`시기 카드가 화면 밖 right=${Math.round(r.right)}`);
  }
  const closing = Array.from(document.querySelectorAll("section")).find((s) => (s.textContent ?? "").includes("앞으로 만들어 갈 변화"));
  if (closing && closing.getBoundingClientRect().right > vw + 1) problems.push("마무리 칸이 화면 밖");
  return { present: true, bars: bars.length, problems };
}

/** 채팅 입력줄이 보이는 높이 안에 있고 머리글에 가리지 않는가 */
function chatInputAudit() {
  const input = document.querySelector("form input[type=text]") as HTMLInputElement | null;
  if (!input) return { present: false, problems: [] as string[] };
  const r = input.getBoundingClientRect();
  const problems: string[] = [];
  if (r.bottom > window.innerHeight + 1) problems.push(`입력창이 보이는 높이 밖 bottom=${Math.round(r.bottom)} / ${window.innerHeight}`);
  if (r.top < 0) problems.push("입력창이 화면 위로 밀려남");
  const header = document.querySelector("header");
  if (header && header.getBoundingClientRect().bottom > r.top + 1 && getComputedStyle(header).position === "fixed") problems.push("머리글이 입력창을 가림");
  const form = input.closest("form");
  if (form) {
    const fr = form.getBoundingClientRect();
    if (fr.bottom > window.innerHeight + 1) problems.push(`입력 줄이 보이는 높이 밖 bottom=${Math.round(fr.bottom)}`);
  }
  return { present: true, problems };
}

async function main() {
  const pw = await loadPlaywright();
  const executablePath = process.env.CHROMIUM_PATH ?? (process.platform === "linux" ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await pw.chromium.launch({ executablePath, args: ["--no-sandbox"] });
  mkdirSync(OUT, { recursive: true });

  // 로그인은 한 번만 하고 저장된 쿠키를 크기마다 쓴다
  let storageState: unknown;
  if (seed) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/auth/email?next=/my`, { waitUntil: "networkidle" });
    await page.fill("#email", seed.A.email);
    await page.fill("#password", seed.A.password);
    await page.click("button[type=submit]");
    await page.waitForURL((u: URL) => !u.pathname.startsWith("/auth/email"), { timeout: 30000 });
    storageState = await ctx.storageState();
    await ctx.close();
  }

  const pages: { path: string; auth: boolean; kind?: "report" | "chat" }[] = [
    { path: "/", auth: false },
    { path: "/analyze", auth: false },
    { path: "/compat", auth: false },
    { path: "/report/sample", auth: false },
    { path: "/report/sample/talk", auth: false, kind: "chat" },
    ...(seed
      ? [
          { path: `/results/${seed.A.aid}`, auth: true, kind: "report" as const },
          { path: `/results/${seed.A.aid}/talk`, auth: true, kind: "chat" as const },
          { path: "/my", auth: true },
          ...(seed.pairId ? [{ path: `/pair/${seed.pairId}`, auth: true }] : []),
        ]
      : []),
  ];

  const cases: ViewportCase[] = TIER === "full" ? viewportMatrix() : quickMatrix();
  console.log(`반응형 모의 검사 — 크기 ${cases.length}개 × 화면 ${pages.length}개 (${TIER}) · 실제 폰이 아니다`);

  for (const vp of cases) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dpr,
      isMobile: true,
      hasTouch: true,
      locale: "ko-KR",
      storageState: storageState,
    });
    const page = await context.newPage();
    for (const p of pages) {
      const problems: string[] = [];
      const notes: string[] = [];
      try {
        const response = await page.goto(BASE + p.path, { waitUntil: "networkidle", timeout: 30000 });
        if (!response || response.status() >= 400) problems.push(`HTTP ${response?.status() ?? "응답 없음"}`);
        await page.waitForTimeout(250);
        const m = await page.evaluate(measurePage);
        problems.push(...m.problems);
        notes.push(...m.notes);
        if (p.kind === "report") {
          // 접힌 시기 카드를 하나 열어 둔 채로도 본다
          await page.locator("details[data-flow-key] > summary").first().click({ timeout: 3000 }).catch(() => undefined);
          const t = await page.evaluate(timelineAudit);
          if (!t.present) notes.push("시간축 없음(이 리포트에는 6장 시간축이 없다)");
          else notes.push(`시간축 막대 ${t.bars}개`);
          problems.push(...t.problems);
        }
        if (p.kind === "chat" && (vp.group === "keyboard" || vp.group === "stress")) {
          const c = await page.evaluate(chatInputAudit);
          if (!c.present) notes.push("입력창 없음(준비 중 · 잠금 상태)");
          problems.push(...c.problems);
        }
        const b = await page.evaluate(bottomCoverage);
        if (b.covered) problems.push(`아래쪽: ${b.detail}`);
        if (SHOTS && ["/", `/results/${seed?.A.aid}`].includes(p.path)) await page.screenshot({ path: `${OUT}/${vp.id}${p.path === "/" ? "-home" : "-report"}.png`, fullPage: false });
      } catch (e) {
        problems.push(`오류: ${String((e as Error).message).slice(0, 200)}`);
      }
      rows.push({ viewport: `${vp.id} ${vp.width}×${vp.height}`, page: p.path.replace(seed?.A.aid ?? "∅", "<결과>").replace(seed?.pairId ?? "∅", "<쌍>"), ok: problems.length === 0, problems, notes });
    }
    await context.close();
  }

  // ── 글자 확대 (루트 글자 크기 배율) — 대표 크기 3개 × 화면 전부 ──
  for (const vpId of ["base-320", "base-390", "fold8-main-dpr3"]) {
    const vp = viewportMatrix().find((v) => v.id === vpId)!;
    for (const zoom of TEXT_ZOOMS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true, locale: "ko-KR", storageState });
      const page = await context.newPage();
      for (const p of pages) {
        const problems: string[] = [];
        try {
          await page.goto(BASE + p.path, { waitUntil: "networkidle", timeout: 30000 });
          await page.addStyleTag({ content: `html{font-size:${Math.round(zoom * 100)}% !important}` });
          await page.waitForTimeout(200);
          problems.push(...(await page.evaluate(measurePage)).problems.filter((x: string) => !/^24px 미만/.test(x)));
          if (p.kind === "report") problems.push(...(await page.evaluate(timelineAudit)).problems);
          const b = await page.evaluate(bottomCoverage);
          if (b.covered) problems.push(`아래쪽: ${b.detail}`);
        } catch (e) {
          problems.push(`오류: ${String((e as Error).message).slice(0, 200)}`);
        }
        rows.push({ viewport: `${vp.id} ${vp.width}×${vp.height} 글자 ${Math.round(zoom * 100)}%`, page: p.path.replace(seed?.A.aid ?? "∅", "<결과>").replace(seed?.pairId ?? "∅", "<쌍>"), ok: problems.length === 0, problems, notes: [] });
      }
      await context.close();
    }
  }

  // ── 상태 유지: 접고 펼치는(창 크기가 바뀌는) 동안 입력 · 스크롤 · 접힘 상태가 남는가 ──
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "ko-KR", storageState });
    const page = await context.newPage();
    const sizes = [
      { width: 390, height: 844 }, // 접힌(바깥) 화면
      { width: 626, height: 890 }, // 펼친(안쪽) 화면
      { width: 890, height: 626 }, // 가로로 돌림
      { width: 313, height: 890 }, // 분할 창
      { width: 390, height: 844 }, // 다시 접음
    ];
    // (1) 분석 입력: 별명 · 출생연도를 적고 크기를 바꿔도 남는다
    await page.goto(`${BASE}/analyze`, { waitUntil: "networkidle" });
    await page.fill("#nickname", "접힘시험");
    await page.fill("#birthYear", "1995");
    const analyzeOk: string[] = [];
    for (const s of sizes) {
      await page.setViewportSize(s);
      await page.waitForTimeout(250);
      const nick = await page.inputValue("#nickname");
      const year = await page.inputValue("#birthYear");
      if (nick !== "접힘시험" || year !== "1995") analyzeOk.push(`${s.width}×${s.height}에서 입력이 사라짐 (${nick}/${year})`);
    }
    stateRows.push({ name: "분석 입력(별명 · 출생연도)이 접기 · 펼치기 · 가로 · 분할 창 크기 변경 뒤에도 남는다", ok: analyzeOk.length === 0, detail: analyzeOk.join("; ") || `${sizes.length}번 크기 변경 뒤 그대로` });
    // 새로고침해도 이어서 불러온다(브라우저 임시 보관)
    await page.reload({ waitUntil: "networkidle" });
    const afterReload = await page.inputValue("#nickname").catch(() => "");
    stateRows.push({ name: "분석 입력은 새로고침 뒤에도 이어서 불러온다(같은 탭, 서버에 보내지 않음)", ok: afterReload === "접힘시험", detail: `별명 칸: "${afterReload}"` });
    // (2) 채팅 입력줄에 적은 글
    const chatPath = seed ? `/results/${seed.A.aid}/talk` : "/report/sample/talk";
    await page.goto(BASE + chatPath, { waitUntil: "networkidle" });
    const input = page.locator("form input[type=text]").first();
    if ((await input.count()) && (await input.isEnabled())) {
      await input.fill("접었다 펴도 남아야 하는 글");
      const chatOk: string[] = [];
      for (const s of sizes) {
        await page.setViewportSize(s);
        await page.waitForTimeout(250);
        const v = await input.inputValue();
        if (v !== "접었다 펴도 남아야 하는 글") chatOk.push(`${s.width}×${s.height}에서 글이 사라짐`);
        const bottomOk = await page.evaluate(() => (document.querySelector("form input[type=text]")?.getBoundingClientRect().bottom ?? 0) <= window.innerHeight + 1);
        if (!bottomOk) chatOk.push(`${s.width}×${s.height}에서 입력창이 보이는 높이 밖`);
      }
      stateRows.push({ name: "채팅 입력줄에 적은 글이 크기 변경 뒤에도 남고 입력창이 보이는 높이 안에 있다", ok: chatOk.length === 0, detail: chatOk.join("; ") || "그대로" });
    } else {
      stateRows.push({ name: "채팅 입력줄 상태 유지", ok: true, detail: "미실행: 입력창이 닫혀 있다(AI 연결 전 · 준비 중) — 이 환경에서는 확인하지 못했다" });
    }
    // (3) 리포트: 펼친 카드 · 스크롤 위치
    if (seed) {
      await page.setViewportSize(sizes[0]);
      await page.goto(`${BASE}/results/${seed.A.aid}`, { waitUntil: "networkidle" });
      const firstFold = page.locator("details[data-fold] > summary").first();
      if (await firstFold.count()) {
        await firstFold.click();
        await page.evaluate(() => window.scrollTo(0, Math.round(document.documentElement.scrollHeight / 3)));
        const before = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight, open: document.querySelectorAll("details[open]").length }));
        const issues: string[] = [];
        for (const s of sizes.slice(1)) {
          await page.setViewportSize(s);
          await page.waitForTimeout(300);
          const now = await page.evaluate(() => ({ y: window.scrollY, h: document.documentElement.scrollHeight, open: document.querySelectorAll("details[open]").length }));
          if (now.open < before.open) issues.push(`${s.width}×${s.height}에서 펼친 칸이 닫힘 (${before.open}→${now.open})`);
          // 화면 폭이 바뀌면 글이 다시 줄바꿈되어 높이가 달라지므로 위치는 "처음으로 튀지 않았는가"만 본다
          if (before.y > 200 && now.y < 20) issues.push(`${s.width}×${s.height}에서 맨 위로 튐`);
        }
        stateRows.push({ name: "리포트에서 펼친 칸 · 스크롤 위치가 크기 변경 뒤에도 유지된다(맨 위로 튀지 않음)", ok: issues.length === 0, detail: issues.join("; ") || "펼친 칸 유지 · 스크롤 유지" });
      }
    }
    await context.close();
  }

  await browser.close();

  // ── 결과 ──
  const failed = rows.filter((r) => !r.ok);
  const lines: string[] = [];
  lines.push(`# 반응형 모의 검사 결과 — ${new Date().toISOString().slice(0, 10)} (실제 폰 아님 · Chromium 창 크기 조정)`);
  lines.push(`크기 ${cases.length}개 × 화면 ${pages.length}개 + 글자 확대 · 상태 유지. 점검 ${rows.length}건 중 문제 ${failed.length}건.`);
  lines.push("");
  lines.push("## 문제가 있는 곳");
  if (!failed.length) lines.push("없음");
  for (const r of failed) lines.push(`- ${r.viewport} · ${r.page}: ${r.problems.join(" / ")}`);
  lines.push("");
  lines.push("## 상태 유지(접기 · 펼치기 · 가로 · 분할 창)");
  for (const s of stateRows) lines.push(`- ${s.ok ? "통과" : "문제"} · ${s.name} — ${s.detail}`);
  lines.push("");
  lines.push("## 전체 표");
  for (const r of rows) lines.push(`${r.ok ? "OK  " : "FAIL"} ${r.viewport} · ${r.page}${r.notes.length ? ` (${r.notes.join(", ")})` : ""}`);
  writeFileSync(`${OUT}/report.md`, lines.join("\n"));
  console.log(lines.slice(0, 6 + Math.min(failed.length, 40)).join("\n"));
  console.log(`\n상태 유지:`);
  for (const s of stateRows) console.log(`  ${s.ok ? "통과" : "문제"} · ${s.name} — ${s.detail}`);
  console.log(`\n전체 표: ${OUT}/report.md`);
  process.exit(failed.length || stateRows.some((s) => !s.ok) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
