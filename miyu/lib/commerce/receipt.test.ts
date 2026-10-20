// 실행: npm test — 결제 영수증 주소 검사: 토스페이먼츠 공식 도메인의 https 주소만 통과하고, 외부 · 비슷한 이름 · 우회 모양은 모두 거절한다(가짜 영수증을 만들지 않는다).
import assert from "node:assert/strict";
import { test } from "node:test";
import { officialReceiptUrl, receiptEligible, receiptNoticeOf, RECEIPT_NOTICES, RECEIPT_URL_MAX_LENGTH } from "./receipt.ts";

test("공식 도메인(tosspayments.com과 그 하위 도메인)의 https 주소만 통과하고 주소는 그대로(해석한 형태로) 돌려준다", () => {
  const ok = [
    "https://dashboard.tosspayments.com/receipt/redirection?transactionId=ABC&ref=PX",
    "https://tosspayments.com/receipt?x=1",
    "https://receipt.tosspayments.com/a/b#frag",
    "https://DASHBOARD.TossPayments.COM/receipt",
  ];
  for (const u of ok) {
    const r = officialReceiptUrl(u);
    assert.ok(r && /^https:\/\/([a-z0-9-]+\.)*tosspayments\.com\//.test(r), u);
  }
  assert.equal(officialReceiptUrl("https://dashboard.tosspayments.com/receipt/redirection?transactionId=ABC&ref=PX"), "https://dashboard.tosspayments.com/receipt/redirection?transactionId=ABC&ref=PX");
});

test("외부 도메인 · 비슷한 이름 · 우회 모양 · 다른 스킴은 모두 거절한다", () => {
  const bad: unknown[] = [
    "http://dashboard.tosspayments.com/receipt", // https 아님
    "https://evil.com/receipt",
    "https://tosspayments.com.evil.com/receipt", // 앞부분만 비슷
    "https://evil-tosspayments.com/receipt", // 점 경계 없음
    "https://eviltosspayments.com/",
    "https://tosspayments.co/receipt",
    "https://tosspayments.com@evil.com/receipt", // 아이디 자리에 도메인
    "https://user:pw@dashboard.tosspayments.com/receipt", // 아이디 · 비밀번호
    "https://evil.com\\@dashboard.tosspayments.com/receipt", // 역슬래시 우회(해석하면 호스트는 evil.com)
    "https://evil.com#@dashboard.tosspayments.com/",
    "https://dashboard.tosspayments.com:8443/receipt", // 특별한 포트
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//dashboard.tosspayments.com/receipt", // 스킴 없음
    "dashboard.tosspayments.com/receipt",
    "/receipt/redirection",
    "https://dashboard.tosspayments.com/receipt\nSet-Cookie: x=1", // 제어문자(헤더 끼워 넣기)
    "https://dashboard.tosspayments.com/re ceipt", // 공백
    " https://dashboard.tosspayments.com/receipt",
    "https://dashboard.tosspayments.com/" + "a".repeat(RECEIPT_URL_MAX_LENGTH), // 너무 길다
    "",
    null,
    undefined,
    42,
    { url: "https://dashboard.tosspayments.com/receipt" },
    ["https://dashboard.tosspayments.com/receipt"],
  ];
  for (const u of bad) assert.equal(officialReceiptUrl(u), null, JSON.stringify(u)?.slice(0, 80));
});

test("영수증을 보일 수 있는 주문은 결제가 승인된 적 있는 주문(결제 완료 · 환불됨)뿐이다", () => {
  assert.deepEqual(["paid", "refunded", "pending", "failed", "canceled", "expired", "", "PAID"].map(receiptEligible), [true, true, false, false, false, false, false, false]);
});

test("안내 문구는 정해진 이유만 읽는다 — 알 수 없는 값 · 객체 속성 이름(프로토타입)은 무시한다", () => {
  for (const key of Object.keys(RECEIPT_NOTICES)) assert.equal(receiptNoticeOf(key), key);
  for (const v of ["", "other", "__proto__", "constructor", "toString", undefined, null, 1, ["no-receipt"]]) assert.equal(receiptNoticeOf(v), null, String(v));
});
