// 개인 결과 · 결제 · 관리자 · 궁합 결과 화면은 저장(캐시)되지 않고 검색에 노출되지 않는 헤더를 명시한다 (QA 2026-10-19: /pair · /compat/report가 빠져 있었다)
import assert from "node:assert/strict";
import { test } from "node:test";
import nextConfig from "../next.config.ts";

type Rule = { source: string; headers: { key: string; value: string }[] };

// 로그인한 회원의 개인 내용이 보이는 화면의 주소 접두 — app/ 에 새 개인 화면을 만들면 여기와 next.config.ts 둘 다에 더한다
const PERSONAL = ["/results", "/my", "/checkout", "/payments", "/admin", "/auth", "/setup", "/dev", "/api", "/invite", "/pair", "/compat/report"];
// 로그인 없이 보는 공개 화면 — 이 규칙에 걸리면 안 된다
const PUBLIC = ["/", "/analyze", "/compat", "/report/sample", "/terms", "/privacy", "/assessment-basis", "/reviews"];

function matches(source: string, path: string): boolean {
  // Next의 source 문법 중 이 설정이 쓰는 두 꼴만 다룬다: "/x" 그대로 · "/x/:path*"
  if (source === path) return true;
  if (source.endsWith("/:path*")) {
    const base = source.slice(0, -"/:path*".length);
    return path === base || path.startsWith(`${base}/`);
  }
  return false;
}

test("개인 화면은 저장 금지(private, no-store) + 검색 제외 헤더를 명시한다 — 접두 주소 자체와 그 아래 모든 주소", async () => {
  const rules = (await nextConfig.headers!()) as Rule[];
  const valueOf = (path: string, key: string) => rules.filter((r) => matches(r.source, path)).flatMap((r) => r.headers).filter((h) => h.key === key).map((h) => h.value);
  for (const base of PERSONAL) {
    for (const path of [base, `${base}/abc`, `${base}/abc/def`]) {
      const cache = valueOf(path, "Cache-Control").join(" ");
      assert.match(cache, /private/, `${path}: Cache-Control private`);
      assert.match(cache, /no-store/, `${path}: Cache-Control no-store`);
      assert.match(valueOf(path, "X-Robots-Tag").join(" "), /noindex/, `${path}: 검색 제외`);
    }
  }
});

test("공개 화면은 저장 금지 · 검색 제외 규칙에 걸리지 않는다 (특히 /compat 입력 화면은 /compat/report와 다르다)", async () => {
  const rules = (await nextConfig.headers!()) as Rule[];
  for (const path of PUBLIC) {
    const hit = rules.filter((r) => matches(r.source, path) && r.headers.some((h) => h.key === "X-Robots-Tag" || h.key === "Cache-Control"));
    assert.deepEqual(hit.map((r) => r.source), [], `${path}는 공개 화면이다`);
  }
});

test("모든 화면에 보안 기본 헤더가 붙는다 (iframe 금지 · 형식 추측 금지)", async () => {
  const rules = (await nextConfig.headers!()) as Rule[];
  const all = rules.find((r) => r.source === "/:path*");
  assert.ok(all);
  const keys = Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
  assert.equal(keys["X-Frame-Options"], "DENY");
  assert.equal(keys["X-Content-Type-Options"], "nosniff");
});
