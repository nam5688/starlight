// 홈 화면에 추가(웹 앱) 설정 점검 — 매니페스트 · 아이콘 · 메타데이터 연결 · 서비스 워커 없음 · 개인 화면 저장 금지 유지
// 정적 점검이다: 실제 iPhone Safari · Android Chrome에서 홈 화면에 추가되는지, 설치된 앱으로 여는 모습은 이 시험이 보증하지 않는다(실기기 미실행).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { readSource } from "../lib/report/test-source.ts";
import manifest from "../app/manifest.ts";
import nextConfig from "../next.config.ts";

const ROOT = new URL("../", import.meta.url);
const file = (p: string) => new URL(p, ROOT);

/** 주석을 뺀 코드 — 설명 주석에 적어 둔 낱말(예: 쓰지 않는다는 설명)이 점검에 걸리지 않게 한다 */
function code(path: string): string {
  return readSource(file(path)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function pngSize(path: URL): { width: number; height: number } {
  const b = readFileSync(path);
  assert.equal(b.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${path.pathname}: PNG 서명`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

test("매니페스트: 같은 사이트 전체를 앱처럼(standalone) 열고, 방향을 고정하지 않으며, 같은 출처의 시작 주소 · 범위를 쓴다", () => {
  const m = manifest();
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/");
  assert.equal(m.scope, "/");
  assert.equal(m.id, "/");
  assert.ok(m.start_url!.startsWith("/") && !m.start_url!.startsWith("//"), "start_url은 같은 출처의 경로");
  assert.equal((m as { orientation?: string }).orientation, undefined, "접이식 · 분할 화면 · 가로 사용을 위해 방향을 고정하지 않는다");
  assert.ok(m.name && m.short_name && m.short_name.length <= 12, "홈 화면 이름은 잘리지 않는 길이");
  assert.match(String(m.background_color), /^#[0-9a-f]{6}$/i);
  assert.match(String(m.theme_color), /^#[0-9a-f]{6}$/i);
  // 개인 정보 · 로그인 주소를 시작 주소로 쓰지 않는다
  assert.doesNotMatch(String(m.start_url), /results|my|checkout|auth|pair/);
});

test("매니페스트 아이콘: 192 · 512 일반(any) + 512 마스크용(maskable)이 실제 PNG이고 선언한 크기와 같다 — 마스크용은 일반과 따로", () => {
  const m = manifest();
  const icons = m.icons ?? [];
  const find = (size: string, purpose: string) => icons.find((i) => i.sizes === size && (i.purpose ?? "any") === purpose);
  for (const [size, purpose] of [["192x192", "any"], ["512x512", "any"], ["512x512", "maskable"]] as const) {
    const icon = find(size, purpose);
    assert.ok(icon, `${size} ${purpose}`);
    assert.equal(icon!.type, "image/png");
    assert.ok(icon!.src.startsWith("/miyu/icons/"), "public 아래 기존 위치");
    const real = pngSize(file(`public${icon!.src}`));
    assert.deepEqual([real.width, real.height], size.split("x").map(Number), `${icon!.src} 실제 크기`);
  }
  assert.ok(icons.every((i) => i.purpose !== ("any maskable" as never)), "any maskable 한 장 겸용은 쓰지 않는다 — 잘림을 피하려고 따로 둔다");
});

test("iOS 홈 화면 아이콘(apple-icon) 180×180 PNG가 있고, 브라우저 탭 아이콘(favicon.ico)은 Next.js 기본 로고가 아니라 16 · 32 · 48 크기의 미유 아이콘이다", () => {
  const apple = pngSize(file("app/apple-icon.png"));
  assert.deepEqual([apple.width, apple.height], [180, 180]);
  const ico = readFileSync(file("app/favicon.ico"));
  assert.equal(ico.readUInt16LE(0), 0, "ICO 예약 영역");
  assert.equal(ico.readUInt16LE(2), 1, "ICO 형식");
  const count = ico.readUInt16LE(4);
  const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256).sort((a, b) => a - b);
  assert.deepEqual(sizes, [16, 32, 48]);
  // 처음 저장소에 들어 있던 favicon.ico는 Next.js 템플릿의 기본 로고(검은 원 안의 N)였다 — 그 파일(sha256)이 아니어야 한다
  const NEXT_DEFAULT_FAVICON_SHA256 = "c28fdd2a4f31e2dc64f653962286da5c82a4cdfc518b242d32812c624e9a19a4";
  assert.notEqual(createHash("sha256").update(ico).digest("hex"), NEXT_DEFAULT_FAVICON_SHA256);
});

test("루트 레이아웃: 앱처럼 열기 메타데이터가 있고, 확대 · 글자 크기를 막지 않으며, viewportFit(cover)은 켜지 않았다는 결정이 코드에 남아 있다", () => {
  const layout = code("app/layout.tsx");
  assert.match(layout, /appleWebApp:\s*\{[^}]*capable:\s*true/);
  assert.doesNotMatch(layout, /maximumScale|userScalable|user-scalable/, "확대를 막지 않는다");
  assert.doesNotMatch(layout, /viewportFit\s*:/, "viewportFit은 켜지 않았다(켜면 모든 화면에 안전 영역 여백이 따로 필요)");
  assert.match(layout, /width:\s*"device-width"/);
});

test("서비스 워커 · 오프라인 저장을 만들지 않았다 — 개인 결과 · 결제 · 권한 응답이 기기에 저장되는 길이 없다", () => {
  assert.equal(existsSync(file("public/sw.js")), false);
  assert.equal(existsSync(file("public/service-worker.js")), false);
  assert.equal(existsSync(file("app/sw.ts")), false);
  const walk = (dir: URL): URL[] =>
    readdirSync(dir).flatMap((name) => {
      if (["node_modules", ".next", ".git", "pilot-data", "docs"].includes(name)) return [];
      const child = new URL(`${name}${statSync(new URL(name, dir)).isDirectory() ? "/" : ""}`, dir);
      return statSync(child).isDirectory() ? walk(child) : /\.(ts|tsx|js|mjs)$/.test(name) ? [child] : [];
    });
  const offenders = ["app/", "components/", "lib/", "server/"]
    .flatMap((d) => walk(file(d)))
    .filter((f) => !f.pathname.endsWith(".test.ts") && /serviceWorker\s*\.\s*register|navigator\.serviceWorker|workbox|new\s+Cache\(|caches\.open/.test(readSource(f)));
  assert.deepEqual(offenders.map((f) => f.pathname.split("/miyu/")[1]), []);
});

test("개인 화면의 저장 금지(no-store) 규칙은 홈 화면 설정 때문에 달라지지 않았고, 매니페스트 · 아이콘 주소는 저장 금지 목록에 없다(공개 자산)", async () => {
  type Rule = { source: string; headers: { key: string; value: string }[] };
  const rules = (await nextConfig.headers!()) as Rule[];
  const noStoreSources = rules.filter((r) => r.headers.some((h) => h.key === "Cache-Control" && /no-store/.test(h.value))).map((r) => r.source);
  for (const base of ["/results", "/my", "/checkout", "/payments", "/pair", "/compat/report", "/auth"]) assert.ok(noStoreSources.includes(base), `${base} 저장 금지 유지`);
  const covered = (path: string) => noStoreSources.some((s) => path === s || (s.endsWith("/:path*") && path.startsWith(`${s.slice(0, -7)}/`)));
  for (const publicPath of ["/manifest.webmanifest", "/apple-icon.png", "/miyu/icons/icon-192.png", "/favicon.ico"]) assert.equal(covered(publicPath), false, `${publicPath}는 공개 자산`);
});

test("푸터에 홈 화면 안내가 한 곳 연결돼 있고 강제 설치 코드(beforeinstallprompt 가로채기)는 없다", () => {
  const footer = code("components/site/site-footer.tsx");
  assert.match(footer, /<HomeScreenTip \/>/);
  const tip = code("components/site/home-screen-tip.tsx");
  assert.doesNotMatch(tip, /beforeinstallprompt|prompt\(\)/, "설치 팝업을 가로채거나 자동으로 띄우지 않는다");
  assert.match(tip, /display-mode/, "홈 화면에서 연 화면(standalone)이면 그리지 않는다");
  assert.match(tip, /navigator\)?\.?standalone|\.standalone === true/, "iOS 홈 화면 앱 표시도 본다");
});
