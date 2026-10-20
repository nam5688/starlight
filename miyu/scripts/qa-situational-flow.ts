// 상황형 28문항 /analyze 흐름의 브라우저 모의 검사 — 기본 정보 → 질문 4단계(장면 28개) → 무료 미리보기. 문구 · 선택지 수 · 누락 안내 · 새로고침 뒤 복원 · 모바일 가로 넘침 · 터치 크기 · 결과 화면의 유형 카드와 생활 말 문장을 본다.
// ⚠ 실제 폰이 아니다. Chromium 창 크기 조정(반응형 모의 검사)이며 "실제 폰 통과"로 쓰지 않는다. 비용 0 · 외부 서비스 연결 없음(--base는 로컬 주소만) · AI 호출 없음 · 저장하지 않는다(로그인 전 미리보기까지만).
//
// 사용 (로컬에서 앱이 떠 있을 때): node scripts/qa-situational-flow.ts --base http://127.0.0.1:4321 [--shots 저장할 폴더]
// Playwright는 저장소 의존성이 아니다. PLAYWRIGHT_MODULE에 설치 경로를 적거나 일반 설치를 쓰고, 크로미움 경로는 CHROMIUM_PATH.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { consistentSheet } from "../lib/assessment/situational/measure.ts";

const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = opt("base", "http://127.0.0.1:4321")!;
const SHOTS = opt("shots");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error("--base는 로컬 주소(http://127.0.0.1:포트)만 쓸 수 있어요 — 이 검사는 외부 서비스에 연결하지 않아요.");
  process.exit(2);
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

async function loadPlaywright(): Promise<any> {
  for (const c of [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node-tools/node_modules/playwright/index.mjs"].filter(Boolean) as string[]) {
    try {
      return await import(c);
    } catch {
      // 다음 후보
    }
  }
  console.error("Playwright를 찾지 못했어요. PLAYWRIGHT_MODULE에 설치 경로를 적어 주세요.");
  process.exit(2);
}

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const VIEWPORTS = [
  { w: 320, h: 640, dpr: 2 },
  { w: 390, h: 844, dpr: 3 },
  { w: 1440, h: 900, dpr: 1 },
];
// 일관된 가상 응답(빠른 실행형 쪽) — 실제 사람의 응답이 아니다
const SHEET = consistentSheet("fast-doer");
// 장면 문장에도 "다음"이 들어 있어 글자 검색으로 누르면 선택지를 누르게 된다 — 아래쪽 이동 버튼만 정확히 고른다
const NEXT = "button:text-is(\"다음\")";

async function fillBasic(page: any) {
  await page.fill("#nickname", "하늘");
  await page.fill("#birthYear", "1996");
  await page.selectOption("#birthMonth", "3");
  await page.selectOption("#birthDay", "29");
  await page.check("#birthTimeUnknown");
  await page.click("label:has(#gender-female)");
}

async function run() {
  const pw = await loadPlaywright();
  const browser = await (pw.chromium ?? pw.default.chromium).launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  for (const vp of VIEWPORTS) {
    const tag = `${vp.w}px`;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, hasTouch: vp.w < 600 });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.goto(`${BASE}/analyze`, { waitUntil: "networkidle" });
    check(`${tag} 시작 안내 시간이 약 7분`, (await page.textContent("main")).includes("약 7분"));
    await fillBasic(page);
    await page.click(NEXT);
    await page.waitForSelector("fieldset");

    // 질문 4단계 — 각 단계의 장면 수 · 선택지 수 · 중립 이름
    const perStep: number[] = [];
    for (let step = 1; step <= 4; step++) {
      const heading = (await page.textContent("#step-heading")).trim();
      check(`${tag} 단계 ${step} 이름은 중립("질문 ${step}")`, heading === `질문 ${step}`, heading);
      const fieldsets = await page.$$("fieldset");
      perStep.push(fieldsets.length);
      for (const fs of fieldsets) {
        const radios = await fs.$$('input[type="radio"]');
        if (radios.length !== 4) check(`${tag} 선택지는 장면마다 4개`, false, `${radios.length}개`);
      }
      // 일부러 비워 두고 다음 → 누락 안내
      if (step === 1) {
        await page.click(NEXT);
        check(`${tag} 답하지 않은 장면이 있으면 안내`, (await page.textContent("main")).includes("아직 답하지 않았어요"));
      }
      // 이 단계의 장면에 답한다
      const ids: string[] = await page.$$eval("fieldset input[type=radio]", (els: any[]) => [...new Set(els.map((e) => e.name))] as string[]);
      for (const id of ids) {
        const pick = SHEET[id] as number;
        await page.click(`label:has(input[name="${id}"][value="${pick}"])`);
      }
      if (step === 2 && vp.w === 390) {
        // 새로고침 뒤 복원
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(300);
        const restored = await page.$$eval("input[type=radio]:checked", (els: any[]) => els.length);
        check(`${tag} 새로고침 뒤 답이 복원`, restored >= 7, `${restored}개 선택됨`);
      }
      // 가로 넘침 · 터치 크기
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${tag} 단계 ${step} 가로 넘침 없음`, overflow <= 1, `${overflow}px`);
      if (vp.w < 600) {
        const small = await page.$$eval("fieldset label", (els: any[]) => els.filter((e) => e.getBoundingClientRect().height < 44).length);
        check(`${tag} 단계 ${step} 선택지 터치 높이 44px 이상`, small === 0, `${small}개 미달`);
      }
      if (SHOTS && vp.w === 390 && (step === 1 || step === 4)) await page.screenshot({ path: join(SHOTS, `situational-step${step}-${tag}.png`), fullPage: false });
      await page.click(step === 4 ? "button:text-is(\"내 결과 미리보기\")" : NEXT);
      if (step < 4) {
        // 다음 단계의 제목이 바뀔 때까지(못 넘어가면 안내 문구를 남기고 멈춘다)
        const moved = await page.waitForFunction((prev: string) => document.querySelector("#step-heading")?.textContent?.trim() !== prev, heading, { timeout: 8000 }).then(() => true, () => false);
        if (!moved) {
          check(`${tag} 단계 ${step}에서 다음 단계로 넘어감`, false, ((await page.textContent("main")) as string).replace(/\s+/g, " ").slice(0, 160));
          break;
        }
      } else {
        await page.waitForSelector("text=사주에서 읽으면", { timeout: 15000 }).catch(() => undefined);
      }
    }
    check(`${tag} 장면 수는 7 · 7 · 7 · 7`, perStep.join(",") === "7,7,7,7", perStep.join(","));
    const body: string = await page.textContent("main");
    check(`${tag} 결과 미리보기가 열린다`, /나의 유형|사주에서 읽으면|내 성향/.test(body));
    check(`${tag} 점수 · 확률 표현 없음`, !/\d+\s*점|확률|정확도/.test(body.replace(/9,900원|정확도를 검증하지 않았|정확도는 검증하지 않았/g, "")));
    check(`${tag} 옛 후보 이름(4개) 없음`, !/안정지향형|확인추구형|거리유지형|탐색지향형/.test(body));
    check(`${tag} 사주 용어는 접힌 보조 영역에만(펼치기 전에는 보이지 않음)`, (await page.$$eval("details[data-fold]:not([open]) summary", (els: any[]) => els.filter((e) => /사주 용어/.test(e.textContent)).length)) >= 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${tag} 결과 화면 가로 넘침 없음`, overflow <= 1, `${overflow}px`);
    if (SHOTS && vp.w !== 320) await page.screenshot({ path: join(SHOTS, `situational-result-${tag}.png`), fullPage: true });
    check(`${tag} 화면 오류 없음`, errors.length === 0, errors.slice(0, 2).join(" | "));
    await ctx.close();
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 통과`);
  if (failed.length) process.exit(1);
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
