// 결제 영수증 길의 안전선을 소스에서 확인한다 (비용 0): 길은 로그인한 본인만 · 결제사가 준 주소로만 · 저장하지 않고 · 캐시하지 않으며,
// 화면 링크는 새 창 · noopener로 열리고 외부 주소를 직접 적지 않는다. (실제 토스 응답에서 받은 주소를 열어 본 것은 아니다 — docs/payment-launch-gaps-v1.md G8)
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { readSource } from "../lib/report/test-source.ts";

const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readSource(join(ROOT, path));

test("영수증 길(route): 로그인 · 가입 동의 확인 → 본인 주문 확인 서비스 → 결제사가 준 주소로만 이동, 응답은 캐시하지 않고 결제키를 싣지 않는다", () => {
  const route = read("app/my/orders/[orderNumber]/receipt/route.ts");
  assert.match(route, /getMember\(\)/);
  assert.match(route, /member\.needsConsent/);
  assert.match(route, /receiptFor\(\{ repo: await readRepository\(\), gateway: paymentGateway\(\) \}, \{ userId, orderNumber \}\)/);
  // 이동 주소는 서비스가 검사해 준 result.url 하나뿐이고, 그 밖의 이동은 우리 사이트 안의 길(to(...))이다
  // (정규식은 첫 닫는 괄호에서 멈추므로 "new URL(path, site" 모양으로 읽힌다)
  assert.deepEqual([...route.matchAll(/NextResponse\.redirect\(([^)]*)\)/g)].map((m) => m[1]).sort(), ["new URL(path, site", "result.url, 302"].sort());
  assert.match(route, /"Cache-Control", "private, no-store"/);
  assert.match(route, /"Referrer-Policy", "no-referrer"/);
  // 소유자가 아닌 주문은 구분 없이 404, 결제키 · 결제 기록 쓰기 · 주문 변경이 없다
  assert.match(route, /case "not-found":[\s\S]*status: 404/);
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /paymentKey|writeRepository|addPaymentEvent|updateOrder|NextResponse\.json|console\./);
});

test("영수증 서비스는 읽기만 한다 — 저장소 쓰기 · 결제 승인 호출 · 결제키 노출이 없다", () => {
  const svc = read("lib/services/receipt-service.ts").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(svc, /updateOrder|insert|upsert|add[A-Z]\w+\(|confirm\(|\.getPayment\(|paymentKey/);
  assert.match(svc, /getPaymentByOrderId\(order\.orderNumber\)/);
  assert.match(svc, /officialReceiptUrl\(payment\.receiptUrl\)/);
  assert.match(svc, /order\.userId !== input\.userId/);
});

test("결제사 응답을 읽는 곳은 receipt.url 하나만 공식 도메인 검사를 거쳐 꺼낸다", () => {
  const gw = read("lib/integrations/tosspayments/gateway.ts");
  assert.match(gw, /officialReceiptUrl\(receiptRaw\)/);
  assert.match(gw, /\(json\.receipt as Record<string, unknown>\)\.url/);
  // 결제 처리 기록(payment_events)에는 영수증 주소를 넣지 않는다 — 기록하는 필드는 지정된 값뿐이다
  const orderService = read("lib/services/order-service.ts");
  assert.doesNotMatch(orderService, /receipt/i);
});

test("화면 링크: MY 결제내역과 주문 상세의 영수증 링크는 우리 길로만 가고 새 창 · noopener noreferrer이며 외부 주소를 직접 적지 않는다", () => {
  for (const file of ["components/my/orders-fold.tsx", "app/my/orders/[orderNumber]/page.tsx"]) {
    const src = read(file);
    const anchors = [...src.matchAll(/<a\b[\s\S]*?>/g)].map((m) => m[0]).filter((a) => /receipt/.test(a));
    assert.ok(anchors.length >= 1, `${file}: 영수증 링크가 있다`);
    for (const a of anchors) {
      assert.match(a, /href=\{`\/my\/orders\/\$\{(o|order)\.orderNumber\}\/receipt`\}/, file);
      assert.match(a, /target="_blank"/, file);
      assert.match(a, /rel="noopener noreferrer"/, file);
    }
    assert.doesNotMatch(src, /https?:\/\/[a-z0-9.-]*tosspayments/i, `${file}: 외부 영수증 주소를 직접 적지 않는다`);
  }
  // 영수증 링크는 결제가 승인된 적 있는 주문에만 보인다
  assert.match(read("components/my/orders-fold.tsx"), /receiptEligible\(o\.status\) &&/);
  assert.match(read("app/my/orders/[orderNumber]/page.tsx"), /receiptEligible\(order\.status\) &&/);
});
