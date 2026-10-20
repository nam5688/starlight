// 결제하기(requestPayment) 안전 장치 — 끝나지 않은 요청을 실패로 바꾸지 않고, 진행 중에는 다시 열지 않으며, 분명한 거절에서만 푼다. 가짜 시계 · 가짜 결제 요청(토스 서버 통신 없음, 비용 0).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createPayRequestGuard, PAY_SETTLED_NOTICE, PAY_SLOW_MS, PAY_SLOW_NOTICE, PAY_SLOW_RECHECK_MS, payNoticeText } from "./pay-request.ts";

/** 직접 흘려보내는 시계 */
function clock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    pending: () => timers.size,
    advance(ms: number) {
      const to = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= to).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
      }
      now = to;
    },
  };
}

/** 직접 끝내거나 거절시키는 결제 요청 */
function gate() {
  let calls = 0;
  let resolve!: (v?: unknown) => void;
  let reject!: (e: unknown) => void;
  const request = () => {
    calls += 1;
    return new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  };
  return { request, calls: () => calls, resolve: (v?: unknown) => resolve(v), reject: (e: unknown) => reject(e) };
}

const tick = () => new Promise<void>((r) => setImmediate(r));

test("같은 틱에 두 번 눌러도 결제 요청은 한 번만 나간다(동기 잠금 — React state가 다음 렌더에 바뀌어도 막힌다)", async () => {
  const c = clock();
  const g = gate();
  const guard = createPayRequestGuard({ setTimer: c.setTimer, clearTimer: c.clearTimer });
  const first = guard.run(g.request);
  assert.equal(guard.inFlight(), true, "run을 부르자마자(await 전에) 잠겨 있다");
  const second = guard.run(g.request);
  assert.deepEqual(await second, { started: false });
  assert.equal(g.calls(), 1);
  g.resolve();
  assert.deepEqual(await first, { started: true, outcome: "settled" });
});

test("요청이 끝나지 않은 채 20초가 지나도 실패로 바꾸지 않는다: 잠금은 그대로, 안내만 한 번, 다시 눌러도 새 요청이 나가지 않는다", async () => {
  const c = clock();
  const g = gate();
  let slow = 0;
  const infos: boolean[] = [];
  const guard = createPayRequestGuard({ setTimer: c.setTimer, clearTimer: c.clearTimer });
  let settled: unknown = "pending";
  void guard.run(g.request, { onSlow: (info) => (slow += 1, infos.push(info.settled)) }).then((r) => (settled = r));
  c.advance(PAY_SLOW_MS - 1);
  assert.equal(slow, 0, "20초 전에는 안내하지 않는다");
  c.advance(1);
  assert.equal(slow, 1, "20초가 지나면 안내를 한 번");
  assert.deepEqual(infos, [false], "그 시점에 요청은 아직 끝나지 않았다");
  await tick();
  assert.equal(settled, "pending", "요청은 끝나지 않았고 거절로 바뀌지도 않았다");
  assert.equal(guard.inFlight(), true, "끝나지 않은 요청이 있으면 잠금은 풀리지 않는다");
  c.advance(PAY_SLOW_MS * 5);
  assert.equal(slow, 1, "안내는 한 번뿐이다");
  assert.deepEqual(await guard.run(g.request), { started: false }, "안내가 뜬 뒤에 다시 눌러도 새 요청이 나가지 않는다");
  assert.equal(g.calls(), 1);
  // 늦게라도 끝나면 그대로 이어진다(결제 결과 화면으로 이동하는 중)
  g.resolve();
  await tick();
  assert.deepEqual(settled, { started: true, outcome: "settled" });
  assert.equal(guard.inFlight(), true, "성공 응답 뒤에도 승인 여부를 모르므로 잠금은 그대로다");
});

test("분명한 거절(약관 미동의 · 창 닫기 · 오류)에서만 잠금을 풀고, 안내 타이머를 치우며, 다시 눌러 새 요청을 보낼 수 있다", async () => {
  const c = clock();
  const g = gate();
  let slow = 0;
  const guard = createPayRequestGuard({ setTimer: c.setTimer, clearTimer: c.clearTimer });
  const run = guard.run(g.request, { onSlow: () => (slow += 1) });
  const err = Object.assign(new Error("창 닫음"), { code: "USER_CANCEL" });
  g.reject(err);
  const out = await run;
  assert.equal(out.started, true);
  assert.ok(out.started && out.outcome === "rejected" && out.error === err);
  assert.equal(guard.inFlight(), false);
  assert.equal(c.pending(), 0, "거절되면 안내 타이머가 남지 않는다");
  c.advance(PAY_SLOW_MS * 2);
  assert.equal(slow, 0, "거절된 뒤에는 오래 걸린다는 안내가 뜨지 않는다");
  const again = guard.run(g.request);
  assert.equal(g.calls(), 2, "다시 누르면 새 요청이 나간다");
  g.resolve();
  await again;
});

test("안내가 뜬 뒤에 요청이 거절돼도 잠금이 풀리고 다시 시도할 수 있다", async () => {
  const c = clock();
  const g = gate();
  const guard = createPayRequestGuard({ setTimer: c.setTimer, clearTimer: c.clearTimer });
  const run = guard.run(g.request, { onSlow: () => undefined });
  c.advance(PAY_SLOW_MS);
  assert.equal(guard.inFlight(), true);
  g.reject(new Error("뒤늦은 실패"));
  assert.ok((await run).started);
  assert.equal(guard.inFlight(), false);
});

test("보이지 않는 화면(카드 앱 · 다른 앱으로 이동 중)에서는 안내를 미루고, 그동안에도 잠금은 풀리지 않으며 보이게 되면 안내한다", async () => {
  const c = clock();
  const g = gate();
  let visible = false;
  let slow = 0;
  const guard = createPayRequestGuard({ setTimer: c.setTimer, clearTimer: c.clearTimer, isVisible: () => visible });
  void guard.run(g.request, { onSlow: () => (slow += 1) });
  c.advance(PAY_SLOW_MS + PAY_SLOW_RECHECK_MS * 5);
  assert.equal(slow, 0, "숨겨진 동안에는 안내하지 않는다");
  assert.equal(guard.inFlight(), true, "숨겨진 동안에도 잠겨 있다");
  visible = true;
  c.advance(PAY_SLOW_RECHECK_MS);
  assert.equal(slow, 1);
  assert.equal(guard.inFlight(), true);
});

test("결제 요청 함수가 동기로 던져도 거절로 처리하고 잠금을 푼다", async () => {
  const guard = createPayRequestGuard();
  const out = await guard.run(() => {
    throw new Error("SDK 준비 안 됨");
  });
  assert.ok(out.started && out.outcome === "rejected");
  assert.equal(guard.inFlight(), false);
});

test("화면이 사라질 때(dispose)는 타이머만 치우고 진행 중인 요청의 잠금은 건드리지 않는다", () => {
  const c = clock();
  const g = gate();
  let slow = 0;
  const guard = createPayRequestGuard({ setTimer: c.setTimer, clearTimer: c.clearTimer });
  void guard.run(g.request, { onSlow: () => (slow += 1) });
  guard.dispose();
  assert.equal(c.pending(), 0);
  c.advance(PAY_SLOW_MS * 2);
  assert.equal(slow, 0);
  assert.equal(guard.inFlight(), true);
});

test("느린 응답 안내는 결제가 되었다고도 되지 않았다고도 단정하지 않고, 새로고침 · 문의 길을 알린다", () => {
  assert.doesNotMatch(PAY_SLOW_NOTICE, /결제는 되지 않았|금액이 빠져나가지 않|결제되지 않았|결제가 완료되었|결제되었어요/);
  assert.match(PAY_SLOW_NOTICE, /확인하지 못했어요/);
  assert.match(PAY_SLOW_NOTICE, /새로고침/);
  assert.match(PAY_SLOW_NOTICE, /주문번호/);
});

test("지연된 성공: 요청이 20초 전에 성공 응답으로 끝났는데 화면이 바뀌지 않으면 잠금은 그대로이고 \"요청은 마쳤고 결과를 확인하는 중\" 안내가 뜬다(결제 여부는 단정하지 않는다)", async () => {
  const c = clock();
  const g = gate();
  const seen: boolean[] = [];
  const guard = createPayRequestGuard({ setTimer: c.setTimer, clearTimer: c.clearTimer });
  const run = guard.run(g.request, { onSlow: (info) => seen.push(info.settled) });
  c.advance(PAY_SLOW_MS / 2);
  g.resolve({ paymentKey: "pk_fake" });
  assert.deepEqual(await run, { started: true, outcome: "settled" });
  assert.equal(guard.inFlight(), true);
  assert.deepEqual(await guard.run(g.request), { started: false }, "성공 응답 뒤에도 다시 누르면 새 요청이 나가지 않는다");
  assert.equal(g.calls(), 1);
  c.advance(PAY_SLOW_MS);
  assert.deepEqual(seen, [true]);
  assert.equal(payNoticeText({ settled: true }), PAY_SETTLED_NOTICE);
  assert.equal(payNoticeText({ settled: false }), PAY_SLOW_NOTICE);
  assert.doesNotMatch(PAY_SETTLED_NOTICE, /결제는 되지 않았|금액이 빠져나가지 않|결제되지 않았|결제가 완료되었|결제되었어요/);
  assert.match(PAY_SETTLED_NOTICE, /확인하는 중/);
  assert.match(PAY_SETTLED_NOTICE, /새로고침/);
});

test("인증 대기 시나리오(카드사 인증 창이 열려 있는 정상 상태): 20초가 지나도 · 화면이 숨겨졌다 돌아와도 실패로 바뀌지 않고, 인증을 마치면(성공) 또는 닫으면(취소) 또는 오류가 나면 각각 그때만 상태가 정해진다", async () => {
  for (const ending of ["success", "cancel", "error"] as const) {
    const c = clock();
    const g = gate();
    let visible = true;
    const events: string[] = [];
    const guard = createPayRequestGuard({ setTimer: c.setTimer, clearTimer: c.clearTimer, isVisible: () => visible });
    let outcome: unknown = "pending";
    void guard.run(g.request, { onSlow: (info) => events.push(info.settled ? "slow-settled" : "slow") }).then((r) => (outcome = r));
    // 본인 인증 앱으로 이동해 화면이 숨겨짐 → 한참 뒤 돌아옴
    c.advance(3_000);
    visible = false;
    c.advance(PAY_SLOW_MS);
    assert.deepEqual(events, [], `${ending}: 숨겨진 동안은 안내하지 않는다`);
    assert.equal(guard.inFlight(), true);
    visible = true;
    c.advance(PAY_SLOW_RECHECK_MS);
    assert.deepEqual(events, ["slow"], `${ending}: 돌아오면 안내만 하고`);
    await tick();
    assert.equal(outcome, "pending", `${ending}: 요청이 끝나지 않았다면 성공도 실패도 아니다`);
    assert.equal(guard.inFlight(), true, `${ending}: 버튼은 열리지 않는다`);
    // 끝
    if (ending === "success") g.resolve();
    else if (ending === "cancel") g.reject(Object.assign(new Error("사용자가 결제를 취소"), { code: "USER_CANCEL" }));
    else g.reject(Object.assign(new Error("카드 오류"), { code: "INVALID_CARD_COMPANY" }));
    await tick();
    if (ending === "success") {
      assert.deepEqual(outcome, { started: true, outcome: "settled" });
      assert.equal(guard.inFlight(), true, "성공 응답이면 결과 화면으로 이동하는 중이라 잠금을 풀지 않는다");
    } else {
      assert.ok((outcome as { outcome?: string }).outcome === "rejected", `${ending}: 거절`);
      assert.equal(guard.inFlight(), false, `${ending}: 분명한 거절이면 다시 누를 수 있다`);
    }
  }
});
