// 실행: npm test — 카카오 로그인 요청에 이메일 동의(account_email)가 들어가지 않는지
// 실제 Supabase Auth로 카카오에 넘어가는 scope는 supabase/tests/db.test.ts에서 확인한다
import assert from "node:assert/strict";
import { test } from "node:test";
import { KAKAO_SCOPE, kakaoOAuthOptions } from "./kakao-options.ts";

test("카카오 scope는 기본값에 추가(scopes)가 아니라 대체(queryParams.scope)로 넘긴다", () => {
  const o = kakaoOAuthOptions("http://localhost:3000", "/my");
  assert.equal(o.queryParams.scope, "profile_nickname profile_image");
  assert.equal(KAKAO_SCOPE.includes("account_email"), false);
  assert.equal("scopes" in o, false, "scopes를 쓰면 account_email이 남는다");
  assert.equal(o.skipBrowserRedirect, true);
  assert.equal(o.redirectTo, "http://localhost:3000/auth/callback?next=%2Fmy");
});
