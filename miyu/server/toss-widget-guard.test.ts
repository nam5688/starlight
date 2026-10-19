// 결제수단 · 약관 화면(토스 결제위젯)의 준비 과정과 막힘 보고의 안전선을 소스에서 확인한다 (비용 0 · 토스 서버 통신 없음).
// 브라우저 동작은 scripts/qa-toss-widget.ts(가짜 SDK)가 확인한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("결제 화면: 칸 id는 화면마다 다르고(고정 id 금지), 준비는 시간 제한이 있는 공용 과정으로 하며, 실패하면 오류 코드를 잃지 않고 다시 불러올 수 있다", () => {
  const src = code(read("components/checkout/toss-checkout.tsx"));
  assert.doesNotMatch(src, /["'`]#?toss-payment-methods["'`]|id="toss-agreement"/, "고정 id가 남아 있지 않다");
  assert.match(src, /useId\(\)/);
  assert.match(src, /id=\{methodsId\}/);
  assert.match(src, /id=\{agreementId\}/);
  assert.match(src, /startWidgetSession\(/);
  assert.match(src, /timeoutMs: WIDGET_READY_TIMEOUT_MS/);
  assert.match(src, /data-testid="widget-retry"/);
  // 취소 · 화면 이동 때 그린 위젯을 치운다
  assert.match(src, /signal\.aborted = true;[\s\S]*void s\?\.destroy\(\)/);
  // 구매자가 직접 한 행동은 막힘으로 보내지 않는다
  assert.match(src, /USER_ACTION_CODES\.has\(code\)/);
  // 보고는 상한이 있고, 시험 · 미리보기에서는 서버 대신 받는 쪽이 있다
  assert.match(src, /reports\.current >= WIDGET_REPORT_LIMIT/);
  assert.match(src, /if \(onIssue\) onIssue\(issue\);\s*else void reportWidgetIssueAction\(orderId, issue\)/);
  // 사용자 에이전트 원문 · 키는 보고에 담지 않는다 (분류한 종류만)
  assert.doesNotMatch(src, /userAgent[^)]*\)[^;]*issue|clientKey[^;]*issue/);
  assert.match(src, /classifyBrowser\(navigator\.userAgent\)/);
  // 결제 금액 · 승인은 이 화면이 정하지 않는다: 주문번호 · 금액은 서버가 만든 props 그대로
  assert.match(src, /requestPayment\(\{\s*orderId,\s*orderName,/);
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon/, "브라우저가 직접 외부로 보내는 요청이 없다(서버 동작만 쓴다)");
});

test("막힘 보고 서버 동작: 로그인한 본인의 주문에만 받고, 값을 다시 확인하며, 주문번호 외 개인정보 없이 중복 방지 규칙대로 알리고, 실패해도 결제 화면을 깨지 않는다", () => {
  const src = code(read("app/checkout/[orderNumber]/widget-actions.ts"));
  assert.match(src, /^"use server";/m);
  assert.match(src, /const member = await getMember\(\);\s*if \(!member \|\| member\.needsConsent\) return;/);
  assert.match(src, /normalizeWidgetIssue\(raw\)/);
  assert.match(src, /getOrderByNumber\(orderNumber\)/);
  assert.match(src, /order\.userId !== member\.userId\) return/, "남의 주문이면 기록하지 않는다");
  assert.match(src, /readRepository\(\)/, "주문 확인은 로그인 사용자 권한(RLS)으로");
  assert.match(src, /dedupeKey: `checkout\.widget:\$\{order\.orderNumber\}:\$\{issue\.phase\}:\$\{issue\.code\}`/);
  assert.match(src, /severity: "warn"/);
  assert.match(read("app/checkout/[orderNumber]/widget-actions.ts"), /catch \{\s*\/\/ 진단용 보고가 결제 화면을 깨뜨리지 않는다/);
  // 결제 상태를 바꾸지 않는다
  assert.doesNotMatch(src, /confirmPayment|updateOrder|markPaid|startCheckout|writeRepository/, "주문 · 결제 상태를 건드리지 않는다");
});

test("공용 과정(widget-session)은 채널 독립 코드로 React · 토스 SDK · 서버 코드를 불러오지 않고 키 · 사용자 에이전트 원문을 보고에 싣지 않는다", () => {
  const src = code(read("lib/commerce/widget-session.ts"));
  assert.doesNotMatch(src, /^import /m, "아무것도 불러오지 않는다");
  assert.doesNotMatch(src, /navigator\.|window\.|document\./, "브라우저 값은 호출하는 쪽이 모은다");
  // 보고 모양에는 정해진 필드만 있다: phase code message elapsedMs attempt env
  const type = src.slice(src.indexOf("export type WidgetIssue"), src.indexOf("export class WidgetSessionError"));
  assert.deepEqual([...type.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]), ["phase", "code", "message", "elapsedMs", "attempt", "env"]);
});

test("개발용 확인 화면은 공개 배포에서 열리지 않고 서버로 아무것도 보내지 않는다", () => {
  const page = read("app/dev/toss-widget/page.tsx");
  assert.match(page, /process\.env\.NODE_ENV === "production"\) notFound\(\)/);
  const preview = code(read("components/dev/toss-widget-preview.tsx"));
  assert.match(preview, /onIssue=\{/);
  assert.doesNotMatch(preview, /reportWidgetIssueAction|fetch\(/);
});

test("브라우저 모의 검사 스크립트는 로컬 주소만 받고 토스 서버로 나가지 않는다", () => {
  const src = read("scripts/qa-toss-widget.ts");
  assert.match(src, /--base는 로컬 주소만 쓸 수 있어요/);
  assert.match(src, /page\.route\("https:\/\/js\.tosspayments\.com\/\*\*"/, "호스팅 SDK 주소를 가짜 스크립트로 바꾼다");
  assert.doesNotMatch(src, /route\.continue\(\)/, "토스 쪽으로 요청을 통과시키지 않는다");
});
