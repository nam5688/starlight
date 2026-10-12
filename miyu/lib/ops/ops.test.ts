// 실행: npm test — 가림 처리 · 오류 식별번호 · 알림 중복 방지 · 텔레그램 형식
import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryRepository } from "../services/testing/memory-repository.ts";
import { ALERT_DEDUPE_MS, ALERT_ONCE_MS, alertText, raiseAlert, type Alert, type Notifier } from "./alerts.ts";
import { ERROR_ID_PATTERN, newErrorId, redactSecrets, safeErrorMessage, safePath } from "./redact.ts";

test("가림 처리: 비밀키 · 결제 키 · JWT · Bearer · 쿠키 · 봇 토큰 · 주소의 토큰", () => {
  const cases: [string, RegExp][] = [
    ["failed with sb_secret_AbC123xyz_-9 here", /sb_secret/],
    ["key test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6 used", /test_gsk_/],
    ["live_gck_abcdefghij1234567890", /live_gck_/],
    ["jwt eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.abcdefghijklmnop12345", /eyJhbGci/],
    ["Authorization: Bearer abcdef1234567890xyz", /abcdef1234567890xyz/],
    ["Basic dGVzdF9nc2tfZXhhbXBsZTo=", /dGVzdF9nc2s/],
    ["cookie: sb-access-token=zzzz1111", /zzzz1111/],
    ["bot 123456789:AAEhBOweik6ad9r_QXiKRYLksaWbDO9eXyz", /AAEhBOweik6ad9r/],
    ["https://x.test/cb?code=SECRETCODE&state=1", /SECRETCODE/],
  ];
  for (const [input, leaked] of cases) assert.doesNotMatch(redactSecrets(input), leaked, input);
  assert.match(redactSecrets("https://x.test/cb?code=SECRETCODE&state=1"), /state=1/, "관계없는 값은 남긴다");
});

test("가림 처리: 연락처 · 이메일, DB 오류에 딸려 오는 행 내용(입력한 글)", () => {
  const dbError = 'new row for relation "personal_contexts" violates check constraint "x". DETAIL: Failing row contains (abc, work, 지금 회사를 옮겨도 될까요 010-1234-5678)';
  const msg = safeErrorMessage(new Error(dbError));
  assert.doesNotMatch(msg, /회사를 옮겨도|010-1234|Failing row/);
  assert.match(msg, /violates check constraint/);
  assert.doesNotMatch(safeErrorMessage(new Error("메일 me@example.com 으로 보냄")), /me@example/);
  assert.equal(safeErrorMessage(undefined), "알 수 없는 오류");
  assert.ok(safeErrorMessage(new Error("가".repeat(1000))).length <= 301);
});

test("경로: 쿼리 · 조각은 떼고 주문번호 같은 경로 값은 추적을 위해 남긴다", () => {
  assert.equal(safePath("/payments/success?paymentKey=tgen_x&orderId=MEU-1&amount=9900#a"), "/payments/success");
  assert.equal(safePath("/my/orders/MEU-20261012-ABCDEFGHJK?x=1"), "/my/orders/MEU-20261012-ABCDEFGHJK");
});

test("오류 식별번호: 형식이 정해져 있고 매번 다르다", () => {
  const ids = new Set(Array.from({ length: 200 }, () => newErrorId()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, ERROR_ID_PATTERN);
});

test("알림 문구: 주문번호 · 오류번호 · 종류만 담고, 키가 섞여 들어가도 가린다", () => {
  const text = alertText({ kind: "confirm.save_failed", severity: "error", title: "결제 승인 후 저장 실패 test_gsk_abc_DEF123456", orderNumber: "MEU-20261012-ABCDEFGHJK", errorId: "ERR-AAAAAAAA", dedupeKey: "k", lines: ["Authorization: Bearer abcdefgh12345678"] });
  assert.match(text, /^\[미유 오류\] 결제 승인 후 저장 실패/);
  assert.match(text, /주문번호 MEU-20261012-ABCDEFGHJK · 오류번호 ERR-AAAAAAAA/);
  assert.doesNotMatch(text, /test_gsk_|abcdefgh12345678/);
  assert.match(text, /관리자 화면 \/admin/);
});

test("알림 중복 방지: 같은 문제는 6시간 안에 한 번만 보내고, 기록은 매번 남긴다. 알림 실패는 던지지 않는다", async () => {
  let t = new Date("2026-10-12T00:00:00Z").getTime();
  const now = () => new Date(t);
  const mem = createMemoryRepository(now);
  const sent: string[] = [];
  const notifier: Notifier = { send: async (text) => (sent.push(text), true) };
  const alert = { kind: "reconcile.anomaly", severity: "warn" as const, title: "중복 결제 의심", orderNumber: "MEU-20261012-AAAAAAAAAA", dedupeKey: "anomaly:MEU-20261012-AAAAAAAAAA:DUPLICATE_PAYMENT" };

  assert.equal(await raiseAlert({ repo: mem.repo, notifier, now }, alert), "sent");
  assert.equal(await raiseAlert({ repo: mem.repo, notifier, now }, alert), "deduped");
  t += ALERT_DEDUPE_MS + 1000;
  assert.equal(await raiseAlert({ repo: mem.repo, notifier, now }, alert), "sent");
  assert.equal(sent.length, 2);
  assert.equal(mem.opsEvents.length, 3, "알림은 줄여도 기록은 모두 남긴다");

  const failing: Notifier = { send: async () => { throw new Error("network"); } };
  assert.equal(await raiseAlert({ repo: mem.repo, notifier: failing, now }, { ...alert, dedupeKey: "other" }), "failed");
  // 기록 저장이 실패해도 알림은 보낸다
  mem.repo.addOpsEvent = async () => { throw new Error("db"); };
  mem.repo.hasOpsEventSince = async () => { throw new Error("db"); };
  assert.equal(await raiseAlert({ repo: mem.repo, notifier, now }, { ...alert, dedupeKey: "third" }), "sent");
});

test("오류 식별번호: 같은 digest는 항상 같은 번호이고 조회 형식(ERR-8자)을 따른다", async () => {
  const { errorIdFromDigest, ERROR_ID_PATTERN } = await import("./redact.ts");
  const a = errorIdFromDigest("1234567890");
  assert.equal(a, errorIdFromDigest("1234567890"));
  assert.match(a, ERROR_ID_PATTERN);
  assert.notEqual(a, errorIdFromDigest("1234567891"));
});

test("알림 표시: 실결제가 아닌 환경은 [미유·테스트]로 시작해 실제 운영 알림과 섞이지 않고, 정보 알림은 오류 · 주의 표시가 없다", () => {
  const paid: Alert = { kind: "payment.approved", severity: "info", title: "결제 승인 완료 · 개인 통합 리포트 9,900원", orderNumber: "MEU-20261012-ABCDEFGHJK", dedupeKey: "k", lines: ["결제 환경 테스트"] };
  assert.match(alertText(paid, { test: true }), /^\[미유·테스트\] 결제 승인 완료/);
  assert.match(alertText(paid), /^\[미유\] 결제 승인 완료/);
  const err: Alert = { kind: "reconcile.anomaly", severity: "error", title: "결제 기록 불일치 — 확인 필요 (DUPLICATE_PAYMENT)", dedupeKey: "k" };
  assert.match(alertText(err, { test: true }), /^\[미유·테스트\] 오류 · 결제 기록 불일치/);
  assert.match(alertText(err), /^\[미유 오류\]/);
  // 알림에는 고객 정보 자리가 없다: 주문번호 · 금액 · 상품 이름뿐
  assert.doesNotMatch(alertText(paid, { test: true }), /이름|생년월일|답변|고민/);
});

test("주문당 한 번만 보내는 알림(승인 완료 · 환불 완료): 같은 주문으로 다시 불러도 보내지 않는다", async () => {
  const t = new Date("2026-10-12T00:00:00Z").getTime();
  let now = () => new Date(t);
  const mem = createMemoryRepository(now);
  const sent: string[] = [];
  const notifier: Notifier = { send: async (text) => (sent.push(text), true) };
  const paid: Alert = { kind: "payment.approved", severity: "info", title: "결제 승인 완료", orderNumber: "MEU-20261012-AAAAAAAAAA", dedupeKey: "payment.approved:MEU-20261012-AAAAAAAAAA", dedupeMs: ALERT_ONCE_MS };
  assert.equal(await raiseAlert({ repo: mem.repo, notifier, now, test: true }, paid), "sent");
  // 몇 달 뒤에 같은 주문으로 다시 불러도 보내지 않는다
  now = () => new Date(t + 200 * 24 * 3600_000);
  assert.equal(await raiseAlert({ repo: mem.repo, notifier, now, test: true }, paid), "deduped");
  // 다른 주문 · 환불은 따로 보낸다
  assert.equal(await raiseAlert({ repo: mem.repo, notifier, now }, { ...paid, kind: "payment.refunded", title: "환불 완료", dedupeKey: "payment.refunded:MEU-20261012-AAAAAAAAAA" }), "sent");
  assert.equal(await raiseAlert({ repo: mem.repo, notifier, now }, { ...paid, orderNumber: "MEU-20261012-BBBBBBBBBB", dedupeKey: "payment.approved:MEU-20261012-BBBBBBBBBB" }), "sent");
  assert.equal(sent.length, 3);
});
