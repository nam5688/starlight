// 실행: npm test — 초대 링크 · 초대 할인(심층 리포트 9,900원 → 5,900원, 초대한 사람 한 명당 3명, 초대받은 사람은 첫 구매 1회)을 메모리 저장소로 확인한다.
import assert from "node:assert/strict";
import test from "node:test";
import { createInviteToken, isInviteToken } from "../commerce/invite.ts";
import { INVITE_DISCOUNT, PERSONAL_REPORT } from "../config/product.ts";
import { createInviteLink, getInviteView, inviteLanding, quoteInviteDiscount } from "./invite-service.ts";
import { startCheckout } from "./order-service.ts";
import type { AssessmentRecord, MiyuRepository } from "./ports.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const BASE = { channel: "web", nickname: "서윤", calendar: "solar", isLeapMonth: false, birthYear: 1994, birthMonth: 11, birthDay: 7, birthTime: "08:40", knownMbti: null, answers: {}, contentVersion: "t", source: "sample", summary: {}, saju: { status: "not-connected" } } as unknown as Omit<AssessmentRecord, "id" | "createdAt" | "userId">;

async function setup() {
  let t = new Date("2026-10-16T03:00:00Z").getTime();
  const mem = createMemoryRepository(() => new Date(t));
  const repo = mem.repo as MiyuRepository;
  const deps = { repo, now: () => new Date(t) };
  const tick = (ms: number) => (t += ms);
  const user = async (name: string) => {
    const userId = `${name}-0000-4000-8000-000000000000`;
    const a = await repo.insertAssessment({ ...BASE, userId });
    return { userId, assessmentId: a.id };
  };
  /** 결제까지 끝낸 심층 리포트 구매자 */
  const payer = async (name: string) => {
    const u = await user(name);
    const started = await startCheckout(deps, { userId: u.userId, assessmentId: u.assessmentId });
    assert.equal(started.kind, "order");
    if (started.kind === "order") await repo.updateOrder(started.order.id, ["pending"], { status: "paid", paymentKey: `pk-${name}`, approvedAt: new Date(t).toISOString() });
    return u;
  };
  const pay = async (orderId: string) => repo.updateOrder(orderId, ["pending"], { status: "paid", paymentKey: `pk-${orderId}`, approvedAt: new Date(t).toISOString() });
  return { mem, repo, deps, user, payer, pay, tick };
}

test("토큰: 무작위 24자이고 이름 · 회원번호가 없으며 모양을 검사한다", () => {
  const a = createInviteToken();
  const b = createInviteToken();
  assert.ok(isInviteToken(a) && isInviteToken(b) && a !== b);
  assert.equal(a.length, 24);
  for (const bad of ["", "짧음", "a".repeat(23), "a".repeat(25), "a".repeat(23) + "!", null, undefined, 123]) assert.equal(isInviteToken(bad), false, String(bad));
});

test("링크 만들기: 심층 리포트를 받기 전에는 만들 수 없고, 받은 뒤에는 결과마다 하나를 만들며, 두 번 눌러도 같은 링크다. 남의 결과에는 만들 수 없다", async () => {
  const { repo, user, payer } = await setup();
  const free = await user("free");
  assert.deepEqual(await createInviteLink(repo, free), { ok: false, reason: "not-paid" });
  assert.deepEqual(await getInviteView(repo, free), { kind: "locked" });

  const a = await payer("inviter");
  assert.deepEqual(await getInviteView(repo, a), { kind: "available", token: null, used: 0, cap: 3, priceKrw: 5900, listKrw: 9900 });
  const first = await createInviteLink(repo, a);
  const second = await createInviteLink(repo, a);
  assert.ok(first.ok && second.ok && first.view.token && first.view.token === second.view.token);
  assert.equal((await repo.getInviteByToken(first.ok ? first.view.token! : ""))?.inviterTier, "deep");
  // 남의 결과
  assert.deepEqual(await createInviteLink(repo, { userId: free.userId, assessmentId: a.assessmentId }), { ok: false, reason: "not-found" });
  assert.deepEqual(await getInviteView(repo, { userId: free.userId, assessmentId: a.assessmentId }), { kind: "locked" });
});

test("초대받은 사람의 첫 구매는 5,900원(정가 9,900원 병기), 링크가 없거나 틀리면 정가다", async () => {
  const { repo, deps, user, payer } = await setup();
  const a = await payer("inviter");
  const link = await createInviteLink(repo, a);
  assert.ok(link.ok);
  const token = link.ok ? link.view.token! : "";

  const b = await user("invitee");
  assert.deepEqual(await quoteInviteDiscount(repo, { token, userId: b.userId }), { kind: "eligible", priceKrw: 5900, listKrw: 9900 });
  const plain = await startCheckout(deps, { userId: b.userId, assessmentId: b.assessmentId });
  assert.ok(plain.kind === "order" && plain.order.amount === PERSONAL_REPORT.priceKrw && !plain.discounted, "링크 없이는 정가");

  const wrong = await startCheckout(deps, { userId: b.userId, assessmentId: b.assessmentId, inviteToken: "x".repeat(24) });
  assert.ok(wrong.kind === "order" && wrong.order.amount === 9900 && !wrong.discounted, "없는 링크는 정가");
  const bad = await startCheckout(deps, { userId: b.userId, assessmentId: b.assessmentId, inviteToken: "../../etc" });
  assert.ok(bad.kind === "order" && bad.order.amount === 9900, "모양이 틀린 토큰은 정가");

  const ok = await startCheckout(deps, { userId: b.userId, assessmentId: b.assessmentId, inviteToken: token });
  assert.ok(ok.kind === "order" && ok.discounted === true && ok.order.amount === INVITE_DISCOUNT.priceKrw);
  assert.equal(ok.kind === "order" && ok.order.productId, PERSONAL_REPORT.id, "상품은 같은 심층 리포트다");
  assert.equal(await repo.countInviteDiscountsUsed(a.userId), 1);
});

test("한도: 초대한 사람 한 명당 3명까지 5,900원이고 네 번째 사람은 정가다 (환불 · 취소된 주문은 자리를 돌려준다)", async () => {
  const { repo, deps, user, payer, pay } = await setup();
  const a = await payer("inviter");
  const link = await createInviteLink(repo, a);
  const token = link.ok ? link.view.token! : "";

  const buyers = [] as { userId: string; assessmentId: string }[];
  const orders = [] as string[];
  for (const n of ["b1", "b2", "b3"]) {
    const u = await user(n);
    buyers.push(u);
    const r = await startCheckout(deps, { userId: u.userId, assessmentId: u.assessmentId, inviteToken: token });
    assert.ok(r.kind === "order" && r.discounted && r.order.amount === 5900, n);
    if (r.kind === "order") orders.push(r.order.id);
  }
  assert.equal(await repo.countInviteDiscountsUsed(a.userId), 3);

  const fourth = await user("b4");
  assert.deepEqual(await quoteInviteDiscount(repo, { token, userId: fourth.userId }), { kind: "none", reason: "cap" });
  const r4 = await startCheckout(deps, { userId: fourth.userId, assessmentId: fourth.assessmentId, inviteToken: token });
  assert.ok(r4.kind === "order" && !r4.discounted && r4.order.amount === 9900, "네 번째는 정가");
  assert.deepEqual(await inviteLanding(repo, token), { kind: "closed", reason: "cap" });

  // 한 명이 결제를 마친 뒤 환불되면 자리는 돌아오지만, 그 사람은 다시 할인받지 못한다
  await pay(orders[0]);
  await repo.updateOrder(orders[0], ["paid"], { status: "refunded" });
  assert.equal(await repo.countInviteDiscountsUsed(a.userId), 2);
  assert.deepEqual(await quoteInviteDiscount(repo, { token, userId: buyers[0].userId }), { kind: "none", reason: "already-used" });
  const again = await startCheckout(deps, { userId: fourth.userId, assessmentId: fourth.assessmentId, inviteToken: token });
  assert.ok(again.kind === "order" && again.discounted && again.order.amount === 5900, "돌아온 자리는 다음 사람이 쓴다");
});

test("초대받은 사람은 첫 구매 1회: 할인으로 결제한 뒤 · 이미 정가로 산 사람 · 본인 링크는 정가다", async () => {
  const { repo, deps, user, payer, pay } = await setup();
  const a = await payer("inviter");
  const link = await createInviteLink(repo, a);
  const token = link.ok ? link.view.token! : "";

  // 본인 링크
  assert.deepEqual(await quoteInviteDiscount(repo, { token, userId: a.userId }), { kind: "none", reason: "self" });

  // 이미 정가로 산 사람
  const old = await payer("old");
  assert.deepEqual(await quoteInviteDiscount(repo, { token, userId: old.userId }), { kind: "none", reason: "not-first" });
  const second = await user("old"); // 같은 회원의 다른 결과
  assert.equal(second.userId, old.userId);

  // 할인으로 결제한 뒤 같은 회원이 다른 결과로 다시 오면 정가
  const b = await user("invitee");
  const first = await startCheckout(deps, { userId: b.userId, assessmentId: b.assessmentId, inviteToken: token });
  assert.ok(first.kind === "order" && first.discounted);
  if (first.kind === "order") await pay(first.order.id);
  const other = await repo.insertAssessment({ ...BASE, userId: b.userId });
  assert.deepEqual(await quoteInviteDiscount(repo, { token, userId: b.userId }), { kind: "none", reason: "already-used" });
  const again = await startCheckout(deps, { userId: b.userId, assessmentId: other.id, inviteToken: token });
  assert.ok(again.kind === "order" && !again.discounted && again.order.amount === 9900);
});

test("같은 결과로 다시 받기(재구매)에는 할인이 없다 — 첫 구매만 할인이다", async () => {
  const { repo, deps, payer } = await setup();
  const a = await payer("inviter");
  const b = await payer("buyer"); // 정가로 한 번 산 사람
  const link = await createInviteLink(repo, a);
  const token = link.ok ? link.view.token! : "";
  // 가장 최근에 받은 리포트가 완성돼 있어야 다시 받기가 열린다
  const first = (await repo.listOrdersForAssessment(b.assessmentId))[0];
  const report = await repo.insertReport({ userId: b.userId, orderId: first.id, assessmentId: b.assessmentId, status: "queued", attempts: 0 });
  assert.ok(report.ok);
  if (report.ok) await repo.updateReport(report.value.id, ["queued"], { status: "ready", readyAt: new Date().toISOString() });
  const again = await startCheckout(deps, { userId: b.userId, assessmentId: b.assessmentId, again: true, inviteToken: token });
  assert.ok(again.kind === "order" && !again.discounted && again.order.amount === 9900 && again.order.productId.endsWith(":r2"));
  assert.equal(await repo.countInviteDiscountsUsed(a.userId), 0);
});

test("초대한 사람의 구매가 확인되지 않으면(환불) 링크의 할인은 멈춘다", async () => {
  const { repo, user, payer } = await setup();
  const a = await payer("inviter");
  const link = await createInviteLink(repo, a);
  const token = link.ok ? link.view.token! : "";
  const b = await user("invitee");
  assert.equal((await quoteInviteDiscount(repo, { token, userId: b.userId })).kind, "eligible");
  const order = (await repo.listOrdersForAssessment(a.assessmentId))[0];
  await repo.updateOrder(order.id, ["paid"], { status: "refunded" });
  assert.deepEqual(await quoteInviteDiscount(repo, { token, userId: b.userId }), { kind: "none", reason: "inviter-not-paid" });
  assert.deepEqual(await inviteLanding(repo, token), { kind: "closed", reason: "inviter-not-paid" });
});

test("결제 대기: 같은 사람이 다시 눌러도 자리는 하나만 쓰고, 1시간 넘게 결제하지 않은 할인 주문은 다른 사람이 자리를 쓸 때 취소된다", async () => {
  const { repo, deps, user, payer, tick } = await setup();
  const a = await payer("inviter");
  const link = await createInviteLink(repo, a);
  const token = link.ok ? link.view.token! : "";

  const b = await user("b1");
  const first = await startCheckout(deps, { userId: b.userId, assessmentId: b.assessmentId, inviteToken: token });
  const second = await startCheckout(deps, { userId: b.userId, assessmentId: b.assessmentId, inviteToken: token });
  assert.ok(first.kind === "order" && second.kind === "order" && first.order.id !== second.order.id && second.discounted && second.order.amount === 5900);
  assert.equal(await repo.countInviteDiscountsUsed(a.userId), 1, "같은 사람은 자리 하나");
  assert.equal((await repo.listOrdersForAssessment(b.assessmentId)).find((o) => o.id === first.order.id)?.status, "canceled", "이전 대기 주문은 취소");

  // 1시간 넘게 지난 뒤: 대기 주문은 자리를 세지 않고, 다른 사람이 자리를 쓰려 할 때 취소된다
  const c = await user("b2");
  const d = await user("b3");
  const e = await user("b4");
  await startCheckout(deps, { userId: c.userId, assessmentId: c.assessmentId, inviteToken: token });
  await startCheckout(deps, { userId: d.userId, assessmentId: d.assessmentId, inviteToken: token });
  assert.equal(await repo.countInviteDiscountsUsed(a.userId), 3);
  tick(61 * 60_000);
  assert.equal(await repo.countInviteDiscountsUsed(a.userId), 0, "오래된 대기 주문은 세지 않는다");
  const late = await startCheckout(deps, { userId: e.userId, assessmentId: e.assessmentId, inviteToken: token });
  assert.ok(late.kind === "order" && late.discounted);
  const stale = (await repo.listOrdersForAssessment(c.assessmentId))[0];
  assert.equal(stale.status, "canceled", "오래 대기한 할인 주문은 취소돼 나중에 결제돼도 한도를 넘지 않는다");
  assert.equal(stale.failureCode, "DISCOUNT_STALE");
});

test("할인 확정에 실패하면 5,900원 주문은 취소하고 정가 주문으로 이어 간다 · 확인이 오류여도(DB 18번 전) 구매는 막지 않는다", async () => {
  const { repo, deps, user, payer } = await setup();
  const a = await payer("inviter");
  const link = await createInviteLink(repo, a);
  const token = link.ok ? link.view.token! : "";
  const b = await user("invitee");

  // 확인은 통과했지만 확정에서 한도가 찬 경우(그 사이에 다른 사람이 자리를 썼다)
  const racy = new Proxy(repo, {
    get(target, prop, receiver) {
      if (prop === "claimInviteDiscount") return async () => ({ ok: false, reason: "cap" });
      return Reflect.get(target, prop, receiver);
    },
  }) as MiyuRepository;
  const r = await startCheckout({ ...deps, repo: racy }, { userId: b.userId, assessmentId: b.assessmentId, inviteToken: token });
  assert.ok(r.kind === "order" && !r.discounted && r.order.amount === 9900);
  const all = await repo.listOrdersForAssessment(b.assessmentId);
  const canceled = all.find((o) => o.amount === 5900);
  assert.ok(canceled && canceled.status === "canceled" && canceled.failureCode === "DISCOUNT_DENIED");
  assert.equal(await repo.countInviteDiscountsUsed(a.userId), 0);

  // 표 · 함수가 없는 환경(DB 18번 전)
  const missing = Object.assign(new Error("없음 (DB 변경 18번 필요)"), { code: "42P01" });
  const c = await user("late");
  const noDb = new Proxy(repo, {
    get(target, prop, receiver) {
      if (prop === "inviteDiscountStatus" || prop === "claimInviteDiscount") return async () => Promise.reject(missing);
      return Reflect.get(target, prop, receiver);
    },
  }) as MiyuRepository;
  const plain = await startCheckout({ ...deps, repo: noDb }, { userId: c.userId, assessmentId: c.assessmentId, inviteToken: token });
  assert.ok(plain.kind === "order" && plain.order.amount === 9900 && !plain.discounted);
  assert.deepEqual(await quoteInviteDiscount(noDb, { token, userId: c.userId }), { kind: "none", reason: null });
  assert.deepEqual(await inviteLanding(noDb, token), { kind: "closed", reason: null });
});

test("초대 링크 화면: 열려 있으면 open, 없는 링크 · 모양이 틀린 링크는 closed이고, 초대한 사람이 탈퇴하면 링크가 닫히지만 이미 쓴 초대 가격 기록은 남는다", async () => {
  const { repo, deps, user, payer } = await setup();
  const a = await payer("inviter");
  await repo.ensureProfile(a.userId);
  const link = await createInviteLink(repo, a);
  const token = link.ok ? link.view.token! : "";
  assert.deepEqual(await inviteLanding(repo, token), { kind: "open" });
  assert.deepEqual(await inviteLanding(repo, "x".repeat(24)), { kind: "closed", reason: "invalid" });
  assert.deepEqual(await inviteLanding(repo, "짧은 값"), { kind: "closed", reason: "invalid" });

  const b = await user("invitee");
  const started = await startCheckout(deps, { userId: b.userId, assessmentId: b.assessmentId, inviteToken: token });
  assert.ok(started.kind === "order" && started.discounted);

  // 탈퇴: 초대 링크가 지워져 더는 열리지 않는다(주문 · 초대 가격 기록은 남는다)
  const done = await repo.withdrawMemberData(a.userId);
  assert.ok(done.ok && done.counts.invites === 1);
  assert.equal(await repo.getInviteByToken(token), null);
  assert.deepEqual(await inviteLanding(repo, token), { kind: "closed", reason: "invalid" });
});
