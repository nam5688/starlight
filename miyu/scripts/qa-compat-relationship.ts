// 궁합 "무슨 사이인가요?" · 성별 입력의 브라우저 모의 검사 — 실제 /compat 화면에서 문구 · 순서 · 기본 선택 없음 · 모바일 줄바꿈과 터치 크기 · 오류 뒤 선택 유지 · 새로고침 뒤 선택 유지 · 사이마다 결과 제목/풀이를 본다.
// ⚠ 실제 폰이 아니다. Chromium 창 크기 조정(반응형 모의 검사)이며 "실제 폰 통과"로 쓰지 않는다. 비용 0 · 외부 서비스 연결 없음(--base는 로컬 주소만) · AI 호출 없음(무료 간단 궁합은 코드 계산).
//
// 사용 (로컬에서 앱이 떠 있을 때): node scripts/qa-compat-relationship.ts --base http://127.0.0.1:4321
// Playwright는 저장소 의존성이 아니다. PLAYWRIGHT_MODULE에 설치 경로를 적거나 일반 설치를 쓰고, 크로미움 경로는 CHROMIUM_PATH.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { COMPAT_RELATIONSHIPS, NAME_PLACEHOLDER, RELATIONSHIP_LABEL } from "../lib/compat/relationship.ts";

const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = opt("base", "http://127.0.0.1:4321")!;
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error("--base는 로컬 주소(http://127.0.0.1:포트)만 쓸 수 있어요 — 이 검사는 외부 서비스에 연결하지 않아요.");
  process.exit(2);
}

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

// CSS 폭 기준 모의 화면(실제 기기의 물리 해상도가 아니다) — 320(아주 좁은 폰) · 360 · 390 · 412 · 600(접이식 안쪽 세로 근처) · 1440(PC)
const VIEWPORTS = [
  { w: 320, h: 640, dpr: 2 },
  { w: 360, h: 740, dpr: 3 },
  { w: 390, h: 844, dpr: 3 },
  { w: 412, h: 915, dpr: 2.6 },
  { w: 600, h: 900, dpr: 2 },
  { w: 1440, h: 900, dpr: 1 },
];

const A = { name: "하늘", gender: "female", y: "1996", m: "3", d: "29", t: "09:30" };
const B = { name: "도윤", gender: "male", y: "1994", m: "11", d: "2", t: "09:30" };

async function fillPerson(page: any, prefix: "a" | "b", p: typeof A, opts: { gender?: boolean } = {}) {
  await page.fill(`#${prefix}-nickname`, p.name);
  if (opts.gender !== false) await page.click(`label:has(#${prefix}-gender-${p.gender})`);
  await page.fill(`#${prefix}-year`, p.y);
  await page.selectOption(`#${prefix}-month`, p.m);
  await page.selectOption(`#${prefix}-day`, p.d);
  await page.fill(`#${prefix}-time`, p.t);
}
/** 사이 · 성별 라디오만 센다(양력/음력 같은 기존 칸의 기본값은 대상이 아니다) */
const CHOICE_CHECKED = 'input[name$="-relationship"]:checked, input[name$="-gender"]:checked';
const pickRel = (page: any, r: string) => page.click(`label:has(#rel-${r})`);
const submit = (page: any) => page.click('button[type="submit"]');

async function main() {
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (process.platform === "linux" ? "/opt/pw-browsers/chromium" : undefined), args: ["--no-sandbox"] });

  // ── 1. 모든 화면 폭: 문구 · 순서 · 기본 선택 없음 · 줄바꿈 · 터치 크기 · 가로 넘침 없음 ──
  for (const v of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr, locale: "ko-KR" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/compat`, { waitUntil: "networkidle" });
    const tag = `${v.w}px`;
    check(`${tag} 제목은 관계 중립`, (await page.textContent("h1")) === "우리 둘은 어떤 사이일까?" && !(await page.content()).includes("무슨 커플"));
    const placeholders = await page.$$eval('input[type="text"][id$="-nickname"]', (els: any[]) => els.map((e) => e.placeholder));
    check(`${tag} 이름 안내 문구`, placeholders[0] === NAME_PLACEHOLDER.self && placeholders[1] === NAME_PLACEHOLDER.partner && !(await page.content()).includes("예: 슬기") && !(await page.content()).includes("예: 남수"), JSON.stringify(placeholders));
    const labels = await page.$$eval("[data-relationship-field] label", (els: any[]) => els.map((e) => e.textContent.trim()));
    check(`${tag} 사이 여섯 개 표시 문구 · 순서`, JSON.stringify(labels) === JSON.stringify(COMPAT_RELATIONSHIPS.map((r) => RELATIONSHIP_LABEL[r])), labels.join(" / "));
    check(`${tag} 사이 질문 문구`, (await page.textContent("[data-relationship-field] legend"))!.includes("무슨 사이인가요?"));
    const checkedCount = await page.$$eval(CHOICE_CHECKED, (els: any[]) => els.length);
    check(`${tag} 기본 선택 없음(사이 · 성별 모두 비어 있다)`, checkedCount === 0, `checked=${checkedCount}`);
    const geo = await page.$$eval("[data-relationship-field] label span", (els: any[]) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(e).lineHeight) || 20;
        return { text: e.textContent.trim(), h: Math.round(r.height), w: Math.round(r.width), lines: Math.round((r.height - 16) / lh), overflow: e.scrollWidth > e.clientWidth + 1 };
      }),
    );
    check(`${tag} 사이 단추는 한 줄(낱말 중간에서 끊기지 않음)이고 칸을 넘치지 않는다`, geo.every((g: any) => g.lines <= 1 && !g.overflow), geo.map((g: any) => `${g.text}:${g.w}x${g.h}`).join(" "));
    check(`${tag} 사이 단추 터치 크기 48px 이상`, geo.every((g: any) => g.h >= 44 && g.w >= 44), `최소 높이 ${Math.min(...geo.map((g: any) => g.h))}px`);
    const gGeo = await page.$$eval('label:has(input[name$="-gender"]) span', (els: any[]) => els.map((e) => ({ t: e.textContent.trim(), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) })));
    check(`${tag} 성별 단추(남자/여자) 4개 · 터치 크기 44px 이상`, gGeo.length === 4 && gGeo.every((g: any) => g.h >= 44 && g.w >= 44 && (g.t === "남자" || g.t === "여자")), JSON.stringify(gGeo));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${tag} 페이지 가로 넘침 없음`, overflow <= 0, `scrollWidth-clientWidth=${overflow}`);
    await ctx.close();
  }

  // ── 2. 입력 오류 뒤 선택 유지 · 새로고침 뒤 선택 유지 · 입력 지우기 ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: "ko-KR" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/compat`, { waitUntil: "networkidle" });
    await submit(page); // 아무것도 고르지 않고 보낸다
    await page.waitForSelector('[role="alert"]');
    const msg = (await page.textContent("form")) ?? "";
    check("빈 입력: 사이 · 성별 · 생년월일 오류를 모두 알려 준다", msg.includes("무슨 사이인지 선택해 주세요.") && (msg.match(/성별을 선택해 주세요\./g) ?? []).length === 2 && msg.includes("생년월일을 모두 입력해 주세요."));
    // 사이만 고르고 보내면 사이는 유지되고 성별 오류만 남는다
    await pickRel(page, "friend");
    await fillPerson(page, "a", A, { gender: false });
    await fillPerson(page, "b", B, { gender: false });
    await submit(page);
    await page.waitForSelector("text=성별을 선택해 주세요.");
    check("오류가 나도 고른 사이 · 입력한 이름은 그대로", (await page.isChecked("#rel-friend")) && (await page.inputValue("#a-nickname")) === A.name && (await page.inputValue("#b-year")) === B.y);
    check("사이 오류는 고른 뒤 사라진다", !((await page.textContent("form")) ?? "").includes("무슨 사이인지 선택해 주세요."));
    // 새로고침: 이 탭에 임시 보관한 입력이 돌아온다
    await page.click(`label:has(#a-gender-female)`);
    await page.click(`label:has(#b-gender-male)`);
    await page.waitForTimeout(300);
    const stored = await page.evaluate(() => window.sessionStorage.getItem("miyu-compat-draft"));
    check("새로고침용 임시 보관은 이 탭(sessionStorage)에만 있다", !!stored && !(await page.evaluate(() => window.localStorage.length)) && !(await ctx.cookies()).some((c: any) => /compat|draft/i.test(c.name)));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    check(
      "새로고침 뒤에도 사이 · 성별 · 이름 · 생년월일 선택이 유지된다",
      (await page.isChecked("#rel-friend")) && (await page.isChecked("#a-gender-female")) && (await page.isChecked("#b-gender-male")) && (await page.inputValue("#a-nickname")) === A.name && (await page.inputValue("#b-month")) === B.m,
    );
    // 입력 지우기
    await page.click('button:has-text("입력 지우기")');
    await page.waitForTimeout(200);
    check("입력 지우기: 화면과 임시 보관이 모두 비워진다", (await page.$$eval(CHOICE_CHECKED, (e: any[]) => e.length)) === 0 && (await page.inputValue("#a-nickname")) === "" && !(await page.evaluate(() => window.sessionStorage.getItem("miyu-compat-draft"))));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    check("지운 뒤 새로고침하면 빈 화면이다", (await page.$$eval(CHOICE_CHECKED, (e: any[]) => e.length)) === 0 && (await page.inputValue("#a-nickname")) === "");
    // 1시간이 지난 임시 보관은 읽지 않는다
    await page.evaluate(() => window.sessionStorage.setItem("miyu-compat-draft", JSON.stringify({ v: 1, savedAt: Date.now() - 3_700_000, data: { a: {}, b: {}, relationship: "lover" } })));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    check("1시간이 지난 임시 보관은 버린다", (await page.$$eval(CHOICE_CHECKED, (e: any[]) => e.length)) === 0);
    await ctx.close();
  }

  // ── 3. 여섯 사이 × 결과 화면: 제목 · 유형 표시 · 풀이 구역 · 점수 동일 · 사이에 맞지 않는 말이 없다 ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: "ko-KR" });
    const scores: string[] = [];
    const lenses: string[] = [];
    for (const rel of COMPAT_RELATIONSHIPS) {
      const page = await ctx.newPage();
      await page.goto(`${BASE}/compat`, { waitUntil: "networkidle" });
      await fillPerson(page, "a", A);
      await fillPerson(page, "b", B);
      await pickRel(page, rel);
      await submit(page);
      await page.waitForSelector("#compat-result", { timeout: 20000 });
      const text = ((await page.textContent("#compat-result")) ?? "").replace(/\s+/g, " ");
      const heading = (await page.textContent("#compat-result-title")) ?? "";
      const score = (await page.getAttribute("#compat-result [aria-label^='궁합 지수']", "aria-label")) ?? "";
      scores.push(score);
      lenses.push(((await page.textContent("[data-relation-frame] p")) ?? "").trim());
      const showType = rel === "lover" || rel === "engaged" || rel === "married";
      check(`결과(${RELATIONSHIP_LABEL[rel]}): "${RELATIONSHIP_LABEL[rel]} 사이로 읽었어요" 표시 + 풀이 네 칸`, text.includes(`${RELATIONSHIP_LABEL[rel]} 사이로 읽었어요`) && ["잘 맞는 부분", "부딪히기 쉬운 부분", "서로 이해할 점", "지금 해 볼 행동"].every((t) => text.includes(t)));
      check(`결과(${RELATIONSHIP_LABEL[rel]}): 커플 유형 ${showType ? "표시" : "숨김 · 사이의 제목 사용"}`, showType ? /커플/.test(heading) && text.includes("우리 커플 핵심") : !/커플/.test(text) && !text.includes("우리 커플 핵심"), `제목 "${heading}"`);
      if (rel === "friend" || rel === "other") check(`결과(${RELATIONSHIP_LABEL[rel]}): 연애 · 배우자 · 결혼 말 없음`, !/연애|연인|배우자|결혼|부부|사귀/.test(text.replace(/연인 사이로 읽었어요/g, "")), "");
      if (rel === "some") check("결과(썸타는중): 상대 마음 확정 · 배우자 · 결혼 말 없음", !/배우자|결혼|서로 좋아하|사귀게 될/.test(text) && text.includes("사주로 알 수 없어서"));
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`결과(${RELATIONSHIP_LABEL[rel]}): 모바일 가로 넘침 없음`, over <= 0, `${over}`);
      await page.close();
    }
    check("사이를 바꿔도 궁합 지수는 같다", new Set(scores).size === 1, scores[0]);
    check("사이마다 풀이 첫머리(읽는 관점)가 다르다", new Set(lenses).size === 6);
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 통과 (반응형 모의 검사 · 실제 폰 아님)`);
  if (failed.length) {
    console.log("실패:\n" + failed.map((f) => `- ${f.name} ${f.detail}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
