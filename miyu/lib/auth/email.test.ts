// 실행: npm test — 이메일 로그인 입력 규칙
import assert from "node:assert/strict";
import test from "node:test";
import { emailError, newPasswordError, normalizeEmail, PASSWORD_MAX } from "./email.ts";

test("이메일: 공백 · 대소문자를 맞추고, 모양이 틀리면 알려 준다", () => {
  assert.equal(normalizeEmail("  Miyu@Example.COM "), "miyu@example.com");
  assert.equal(normalizeEmail(undefined), "");
  assert.equal(emailError("miyu@example.com"), null);
  assert.equal(emailError("a.b+tag@mail.co.kr"), null);
  for (const bad of ["", "miyu", "miyu@", "@example.com", "miyu@example", "mi yu@example.com", "miyu@@example.com", `${"a".repeat(250)}@example.com`]) assert.notEqual(emailError(bad), null, bad);
});

test("새 비밀번호: 8자 이상, 영문과 숫자를 함께, 이메일 주소가 들어가면 안 되고, 너무 길어도 안 된다", () => {
  assert.equal(newPasswordError("miyu1234", "someone@example.com"), null);
  assert.equal(newPasswordError("Sunny-Day-2026!"), null);
  for (const bad of [undefined, "", "abc12", "abcdefgh", "12345678", "한글비밀번호12"]) assert.notEqual(newPasswordError(bad), null, String(bad));
  assert.match(newPasswordError("myname1234abc", "myname@example.com") ?? "", /이메일 주소/);
  assert.notEqual(newPasswordError("a1" + "x".repeat(PASSWORD_MAX)), null);
  // 짧은 앞부분(3자 이하)은 이메일 주소가 들어갔다고 보지 않는다
  assert.equal(newPasswordError("abc12345", "abc@example.com"), null);
});
