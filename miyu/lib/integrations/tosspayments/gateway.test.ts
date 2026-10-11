// 실행: npm test — 실제 결제사에 접속하지 않고, 요청 형식과 응답 해석만 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createTossPaymentGateway } from "./gateway.ts";

type Captured = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown, captured: Captured[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

const PAYMENT = {
  paymentKey: "tgen_123",
  orderId: "MEU-20261011-ABCDEFGHJK",
  status: "DONE",
  totalAmount: 9900,
  balanceAmount: 9900,
  method: "카드",
  approvedAt: "2026-10-11T10:00:00+09:00",
  card: { number: "1234****" },
};

test("승인 요청: Basic 인증(시크릿 키 + ':')과 멱등키, 본문을 보낸다", async () => {
  const captured: Captured[] = [];
  const gw = createTossPaymentGateway({ secretKey: "test_gsk_example", fetch: fakeFetch(200, PAYMENT, captured) });
  const r = await gw.confirm({ paymentKey: "tgen_123", orderId: PAYMENT.orderId, amount: 9900 });

  assert.equal(captured[0].url, "https://api.tosspayments.com/v1/payments/confirm");
  const headers = captured[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Basic ${Buffer.from("test_gsk_example:").toString("base64")}`);
  assert.equal(headers["Idempotency-Key"], "meu-confirm-tgen_123");
  assert.deepEqual(JSON.parse(String(captured[0].init.body)), { paymentKey: "tgen_123", orderId: PAYMENT.orderId, amount: 9900 });

  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.payment.status, "DONE");
    assert.equal("card" in r.payment, false, "카드 정보는 담지 않는다");
  }
});

test("오류 응답: 4xx는 재시도 불가, 5xx·네트워크 오류는 재시도 가능", async () => {
  const rejected = await createTossPaymentGateway({
    secretKey: "k",
    fetch: fakeFetch(400, { code: "REJECT_CARD_PAYMENT", message: "한도초과" }, []),
  }).confirm({ paymentKey: "p", orderId: "MEU-1-ABCDEF", amount: 1 });
  assert.deepEqual(rejected, { ok: false, code: "REJECT_CARD_PAYMENT", message: "한도초과", retryable: false });

  const down = await createTossPaymentGateway({ secretKey: "k", fetch: fakeFetch(503, {}, []) }).getPayment("p");
  assert.equal(down.ok, false);
  if (!down.ok) assert.equal(down.retryable, true);

  const offline = await createTossPaymentGateway({
    secretKey: "k",
    fetch: (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch,
  }).getPayment("p");
  assert.deepEqual(offline.ok ? null : offline.code, "NETWORK_ERROR");
});

test("결제 조회: paymentKey를 주소에 안전하게 넣는다", async () => {
  const captured: Captured[] = [];
  await createTossPaymentGateway({ secretKey: "k", baseUrl: "http://127.0.0.1:9", fetch: fakeFetch(200, PAYMENT, captured) }).getPayment("a/b?c");
  assert.equal(captured[0].url, "http://127.0.0.1:9/v1/payments/a%2Fb%3Fc");
  assert.equal(captured[0].init.method, "GET");
});
