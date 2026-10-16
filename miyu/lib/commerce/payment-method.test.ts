import assert from "node:assert/strict";
import test from "node:test";
import { isCardMethod, nonCardNotice } from "./payment-method.ts";

test("카드만 운영: 결제수단이 카드면 알릴 것이 없고, 카드가 아닌 결제수단(계좌이체 · 가상계좌 · 간편결제 · 휴대폰 · 상품권) · 알 수 없는 결제수단이면 운영자 확인 안내를 돌려준다", () => {
  assert.equal(isCardMethod("카드"), true);
  assert.equal(nonCardNotice("카드"), null);
  for (const m of ["계좌이체", "가상계좌", "간편결제", "휴대폰", "문화상품권", "", null, undefined]) {
    const lines = nonCardNotice(m);
    assert.ok(lines && lines.length === 3, String(m));
    assert.match(lines![0], /지금은 카드만 운영합니다/);
    assert.match(lines![2], /계좌이체 180일/);
  }
  // 카드만 운영하지 않는 설정이면 어느 결제수단도 알리지 않는다
  assert.equal(nonCardNotice("계좌이체", false), null);
  // 안내에는 고객 정보가 없다 — 결제수단 이름만
  assert.ok(!nonCardNotice("계좌이체")!.join(" ").includes("@"));
});
