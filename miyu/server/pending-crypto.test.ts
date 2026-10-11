// 실행: npm test — 로그인 전 결과 보관 쿠키의 암호화 확인
import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveKey, open, seal } from "./pending-crypto.ts";

const key = deriveKey("server-secret-for-test");

test("암호화한 값은 같은 키로만 열린다", () => {
  const token = seal({ answers: { m1: 3 }, nickname: "지민" }, key);
  assert.ok(!token.includes("지민"), "평문이 드러나지 않는다");
  assert.deepEqual(open(token, key), { answers: { m1: 3 }, nickname: "지민" });
  assert.equal(open(token, deriveKey("other-secret")), null);
});

test("한 글자라도 바뀌면 열리지 않는다 (위조 방지)", () => {
  const token = seal({ a: 1 }, key);
  const tampered = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
  assert.equal(open(tampered, key), null);
  assert.equal(open("not-a-token", key), null);
});

test("같은 내용도 매번 다른 값으로 암호화된다", () => {
  assert.notEqual(seal({ a: 1 }, key), seal({ a: 1 }, key));
});
