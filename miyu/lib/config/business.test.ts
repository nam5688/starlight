// 실행: npm test — 하단에 보이는 사업자 정보가 비어 있지 않고, 운영자가 알려 준 표기 그대로인지
import assert from "node:assert/strict";
import test from "node:test";
import { BUSINESS_FIELDS, BUSINESS_INFO } from "./business.ts";

test("사업자 정보: 운영자가 알려 준 항목이 모두 있고 비어 있지 않다", () => {
  assert.deepEqual(BUSINESS_FIELDS.map((f) => f.label), ["상호", "대표자", "소재지", "사업자등록번호", "통신판매신고번호", "개인정보관리책임자"]);
  for (const f of BUSINESS_FIELDS) assert.ok(f.value.trim().length > 0, f.label);
  assert.equal(BUSINESS_INFO.copyright, "© PEEKY｜ MI:U");
  assert.match(BUSINESS_INFO.businessNumber, /^\d{3}-\d{2}-\d{5}$/);
});
