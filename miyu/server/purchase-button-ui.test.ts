// 실행: npm test — 심층 리포트 "받기 · 9,900원" 버튼들이 모바일에서 무반응이던 원인(같은 화면 #주소 링크 + 조용한 되돌림)이 다시 생기지 않았는지 소스에서 확인한다.
// 실제 화면 확인(모바일 크기 브라우저, 로컬 가짜 환경)은 docs/purchase-button-fix-v1.md에 기록했다. 결제 가드(판매 중지 · 용량 · 예산)는 서버 동작이 그대로 쓴다 — 이 시험은 그 가드를 약화시키지 않았는지도 본다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readSource } from "../lib/report/test-source.ts";

const read = (p: string) => readSource(new URL(`../${p}`, import.meta.url));
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const BUYERS = ["components/results/talk-entry.tsx", "components/talk/locked-room.tsx", "components/results/purchase-panel.tsx", "components/results/received-reports.tsx", "components/my/report-rows.tsx", "components/talk/recharge-dialog.tsx"];

test("상담방 · 구매 안내 · 구매 영역의 받기 버튼은 모두 구매를 시작하는 폼 버튼이고 #주소 링크가 아니다", () => {
  for (const path of BUYERS) {
    const src = code(read(path));
    assert.match(src, /PurchaseStartButton/, `${path}는 PurchaseStartButton을 쓴다`);
    // 심층 리포트를 사는 링크(`<Link href={buyHref}`)로 되돌아가면 다른 화면에서 온 #r-purchase 이동이 구매 영역까지 내려가지 않는 문제가 다시 생긴다
    assert.doesNotMatch(src, /<Link[^>]*href=\{buyHref\}[^>]*>[^<]*(받기|전체 보기)/);
  }
  assert.doesNotMatch(code(read("components/talk/locked-room.tsx")), /href=\{buyHref\}[\s\S]{0,80}심층 리포트 받기/);
});

test("버튼은 서버 동작 하나(startPurchaseAction)를 부르고 진행 중 · 막힘 · 오류를 화면에 보인다", () => {
  const btn = read("components/results/purchase-start-button.tsx");
  assert.match(btn, /"use client"/);
  assert.match(btn, /useActionState\(startPurchaseAction/);
  assert.match(btn, /disabled=\{pending\}/);
  assert.match(btn, /결제 화면을 준비하고 있어요/);
  assert.match(btn, /role="status"/);
  assert.match(btn, /data-testid="purchase-start-blocked"/);
  assert.match(btn, /blocked\.message/);
});

test("서버 동작은 막힌 모든 경우에 이유를 돌려주고 결제 가드를 그대로 쓴다 — 조용한 redirect(결과 화면으로 되돌림)가 없다", () => {
  const actions = read("app/results/[id]/actions.ts");
  const start = actions.slice(actions.indexOf("export async function startPurchaseAction"));
  const body = start.slice(0, start.indexOf("\nexport ", 10) === -1 ? undefined : start.indexOf("\nexport ", 10));
  assert.match(body, /gate:\s*saleGateCheck/);
  assert.match(body, /paymentConfig\(\)/);
  assert.match(body, /blockedState\("payments-not-ready"/);
  assert.match(body, /purchaseDecisionOf\(/);
  assert.match(body, /redirect\(path\)/);
  // 이 동작에서 redirect는 결제 화면 · 리포트 화면으로 가는 한 곳뿐이다
  assert.equal((body.match(/redirect\(/g) ?? []).length, 1);
  // 판매 가드 · AI 설정을 이 동작이 바꾸지 않는다
  assert.doesNotMatch(body, /AI_APPROVED|ANTHROPIC_API_KEY|process\.env\./);
});

test("결과 화면은 #구매영역 주소로 들어와도 구매 영역으로 내려가는 보조 스크롤을 단다", () => {
  assert.match(read("app/results/[id]/page.tsx"), /<HashScroll \/>/);
  const hs = read("components/results/hash-scroll.tsx");
  assert.match(hs, /"use client"/);
  assert.match(hs, /hashchange/);
  assert.match(hs, /touchstart|wheel/);
});

test("결제하기: 결제 요청이 끝나지 않았다고 실패로 보지 않는다 — 동기 ref 잠금, 진행 중에는 버튼을 다시 열지 않고, 20초 뒤에는 결제 여부를 단정하지 않는 안내만 보인다(운영자 코드 점검 2026-10-20)", () => {
  const c = read("components/checkout/toss-checkout.tsx");
  const src = code(c);
  const g = read("lib/commerce/pay-request.ts");
  // 안전 장치는 공용 모듈이고 20초 상수도 거기에 있다
  assert.match(g, /PAY_SLOW_MS = 20_000/);
  assert.match(src, /createPayRequestGuard\(/);
  assert.match(src, /payGuardRef = useRef<PayRequestGuard \| null>\(null\)/, "잠금은 렌더를 기다리지 않는 ref다");
  // 눌린 순간 동기 확인이 상태 바꾸기보다 앞선다
  const pay = src.slice(src.indexOf("async function pay()"), src.indexOf("  return (\n    <div>"));
  assert.ok(pay.indexOf("guard.inFlight()") > 0 && pay.indexOf("guard.inFlight()") < pay.indexOf('setStatus("requesting")'), "ref 잠금 확인이 setStatus보다 먼저다");
  // 느린 안내 콜백은 버튼을 다시 열지 않는다(setStatus("ready") 금지) — 안내 표시와 관찰 보고만 한다
  const onSlow = pay.slice(pay.indexOf("onSlow:"), pay.indexOf("},\n      },\n    );"));
  assert.match(onSlow, /setSlow\(true\)/);
  assert.doesNotMatch(onSlow, /setStatus\(/, "끝나지 않은 요청이 있는 동안 버튼을 다시 열지 않는다");
  // 버튼을 다시 여는 것은 분명한 거절 경로뿐이고, 성공 응답(settled) · 이미 진행 중이면 상태를 되돌리지 않는다
  assert.match(pay, /if \(!result\.started \|\| result\.outcome === "settled"\) return;[\s\S]*setStatus\("ready"\)/);
  assert.equal((src.match(/setStatus\("ready"\)/g) ?? []).length, 2, "ready로 되돌리는 곳은 위젯 준비 완료 한 곳과 거절 한 곳뿐이다");
  // 예전 타이머(stall) · 잘못된 확정 문구가 없다
  assert.doesNotMatch(src, /stallRef|PAY_STALL|PAY_NO_REDIRECT/);
  for (const text of [c, g, read("lib/commerce/widget-session.ts")]) {
    assert.doesNotMatch(code(text), /금액이 빠져나가지 않았|결제는 되지 않았고/, "끝나지 않은 요청을 결제되지 않았다고 말하지 않는다(화면에 보이는 문구 · 코드)");
    assert.doesNotMatch(text, /넘어가지 않았다면 결제는 시작되지 않았/, "화면이 안 바뀌면 결제가 시작되지 않은 것이라는 가정을 쓰지 않는다");
  }
  // 느린 안내 영역(결제 진행 중에만 · 새로고침 길 · 알림 역할)과 버튼 잠금
  assert.match(c, /data-testid="pay-slow-notice"/);
  assert.match(c, /data-testid="pay-reload"/);
  assert.match(c, /disabled=\{status !== "ready"\}/);
  assert.match(c, /data-testid="pay-hint"/);
});

test("가격이 적힌 시작 버튼 아래에는 \"결제 화면으로 이동해요 · 이 버튼만으로는 결제되지 않아요\"가 기본으로 보이고, 같은 결과로 새로 받는 경우도 같은 버튼(again)을 쓴다", () => {
  const btn = read("components/results/purchase-start-button.tsx");
  assert.match(btn, /data-testid="purchase-start-hint"/);
  assert.match(btn, /이 버튼만으로는 결제되지 않아요/);
  assert.match(btn, /name="again"/);
  const received = code(read("components/results/received-reports.tsx"));
  assert.match(received, /<PurchaseStartButton[^>]*\bagain\b/);
  assert.doesNotMatch(received, /startRepurchaseAction/, "새 리포트 받기가 조용히 되돌아가는 예전 폼으로 돌아가면 안 된다");
  const action = read("app/results/[id]/actions.ts");
  const start = action.slice(action.indexOf("export async function startPurchaseAction"));
  assert.match(start, /formData\.get\("again"\) === "1"/);
});

test("이미 있는 같은 화면 안내(#compat-paid)는 결제 버튼처럼 읽히지 않는 이동 문구다", () => {
  const next = code(read("components/compat/compat-next-steps.tsx"));
  assert.match(next, /href="#compat-paid"[\s\S]{0,160}신청 칸으로 이동/);
  assert.doesNotMatch(next, /href="#compat-paid"[\s\S]{0,120}사주 궁합 받기/);
});

test("저장된 결과의 무료 풀이는 저장 당시의 옛 문장이 아니라 저장된 응답에서 다시 만든 지금의 문장을 쓴다(결과 화면 · 상담방 모델 두 곳)", () => {
  assert.match(read("app/results/[id]/page.tsx"), /summary: withCurrentInsight\(assessment\.summary, assessment\.answers\)/);
  assert.match(read("server/talk-model.ts"), /summary: withCurrentInsight\(assessment\.summary, assessment\.answers\)/);
});
