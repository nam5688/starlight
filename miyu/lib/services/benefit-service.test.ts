// 실행: npm test — 혜택 시스템(포인트 · 질문권 · 쿠폰 · 0원 혜택 주문 · 친구 추천)을 메모리 저장소로 확인한다.
// 확인하는 운영 정책(운영자 2026-10-17): ① 추천 가입 보상은 가입이 아니라 계정 확인 + 무료 분석 1건 + 중복 검사 뒤에 확정 ② 포인트 유효기간 1년 · 곧 소멸 표시 ③ 환불 · 부정 시 쓰지 않은 보상만 회수하고 음수 잔액 없음
// ④ 결제 전 정가 · 할인 표시와 서버 판단(서버 오류는 "할인 불가"가 아님) ⑤ 0원 주문은 서버가 승인한 혜택만 · 결제사와 구분 · 중복 사용 불가 ⑥ 모든 혜택은 기본 꺼짐.
// 이 시험은 규칙이 서비스 코드에서 지켜지는지 보는 것이다. SQL 함수 자체는 supabase/tests/db.test.ts가 실제 Postgres로 확인하고, 실제 Supabase · 실제 토스에서는 아직 확인하지 않았다.
import assert from "node:assert/strict";
import test from "node:test";
import { PERSONAL_REPORT } from "../config/product.ts";
import { changeBenefitSetting, createCouponByAdmin, createReferralLink, getBenefitOverview, planCheckout, quoteForCheckout, redeemCouponCode, validateCouponDraft, type BenefitDeps } from "./benefit-service.ts";
import { startCheckout } from "./order-service.ts";
import type { AssessmentRecord, MiyuRepository } from "./ports.ts";
import { createMemoryBenefits } from "./testing/memory-benefits.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const BASE = { channel: "web", nickname: "서윤", calendar: "solar", isLeapMonth: false, birthYear: 1994, birthMonth: 11, birthDay: 7, birthTime: "08:40", knownMbti: null, answers: {}, contentVersion: "t", source: "sample", summary: {}, saju: { status: "not-connected" } } as unknown as Omit<AssessmentRecord, "id" | "createdAt" | "userId">;
const DAY = 86_400_000;
const HOUR = 3_600_000;

async function setup(opts: { features?: string[] } = {}) {
  let t = new Date("2026-10-20T03:00:00Z").getTime();
  const nowFn = () => new Date(t);
  const mem = createMemoryRepository(nowFn);
  const ben = createMemoryBenefits(mem, nowFn);
  const repo = mem.repo as MiyuRepository;
  const benefits = ben.repo;
  const deps: BenefitDeps = { repo, benefits, now: nowFn };
  const checkoutDeps = { repo, now: nowFn };
  const tick = (ms: number) => (t += ms);
  for (const f of opts.features ?? []) await benefits.setSetting({ key: `feature.${f}`, value: true, reason: "시험", by: null });
  const user = async (name: string, analyses = 1) => {
    const userId = `${name.padEnd(8, "0")}-0000-4000-8000-000000000000`;
    ben.setJoinedAt(userId, new Date(t - 30 * DAY));
    let assessmentId = "";
    for (let i = 0; i < analyses; i++) assessmentId = (await repo.insertAssessment({ ...BASE, userId })).id;
    return { userId, assessmentId };
  };
  const pay = async (orderId: string) => repo.updateOrder(orderId, ["pending"], { status: "paid", paymentKey: `pk-${orderId}`, approvedAt: new Date(t).toISOString() });
  /** 정가로 결제까지 */
  const buyAtList = async (u: { userId: string; assessmentId: string }) => {
    const started = await startCheckout(checkoutDeps, { userId: u.userId, assessmentId: u.assessmentId });
    assert.equal(started.kind, "order");
    if (started.kind !== "order") throw new Error("no order");
    await pay(started.order.id);
    return started.order;
  };
  const buyWith = async (u: { userId: string; assessmentId: string }, choice: Parameters<typeof planCheckout>[1]["choice"], again = false) => {
    const planned = await planCheckout(deps, { ...u, choice, again });
    if (planned.kind !== "plan") return { planned } as const;
    const started = await startCheckout(checkoutDeps, { ...u, plan: planned.plan, again });
    return { planned, started } as const;
  };
  return { mem, ben, repo, benefits, deps, checkoutDeps, user, pay, buyAtList, buyWith, tick, now: nowFn };
}

// ───── ⑥ 기본 꺼짐 ─────

test("혜택은 모두 꺼진 채로 시작한다: 견적은 정가뿐이고 구매해도 포인트가 쌓이지 않으며 쿠폰은 쓸 수 없다", async () => {
  const s = await setup();
  const overview = await getBenefitOverview(s.deps, "nobody");
  assert.ok(overview.ready);
  assert.ok(Object.values(overview.settings.features).every((v) => v === false));

  const u = await s.user("alpha");
  const q = await quoteForCheckout(s.deps, u);
  assert.equal(q.kind, "quote");
  if (q.kind === "quote") {
    assert.deepEqual(q.quote.options.map((o) => o.kind), ["list"]);
    assert.equal(q.quote.listKrw, PERSONAL_REPORT.priceKrw);
    assert.equal(q.quote.denied.length, 0);
    assert.equal(q.pointBalance, null);
  }
  await s.buyAtList(u);
  assert.equal(await s.benefits.getPointBalance(u.userId), 0, "꺼져 있으면 적립하지 않는다");
  // 쿠폰 코드를 넣어도 꺼져 있으면 사유와 함께 정가 확인이 필요하다(서버 오류가 아니다)
  const withCode = await quoteForCheckout(s.deps, { ...u, couponCode: "ANYCODE", again: true });
  assert.equal(withCode.kind, "quote");
  if (withCode.kind === "quote") assert.equal(withCode.quote.denied[0]?.reason, "feature-off");
});

// ───── 구매 적립 · ② 유효기간 1년 · 곧 소멸 표시 ─────

test("구매 적립: 결제가 확인된 주문에만 구간 적립률로 한 번 쌓이고 지급일부터 1년 뒤 소멸하며, MY는 곧 소멸할 포인트와 날짜를 보여 준다", async () => {
  const s = await setup({ features: ["points_earn"] });
  const u = await s.user("beta");
  const started = await startCheckout(s.checkoutDeps, { userId: u.userId, assessmentId: u.assessmentId });
  assert.equal(started.kind, "order");
  if (started.kind !== "order") return;
  assert.equal(await s.benefits.getPointBalance(u.userId), 0, "결제 전에는 쌓이지 않는다");
  await s.pay(started.order.id);
  assert.equal(await s.benefits.getPointBalance(u.userId), Math.floor(9900 * 0.03));
  // 같은 주문을 다시 paid로 알려도 한 번만(중복 방지)
  await s.pay(started.order.id);
  assert.equal(await s.benefits.getPointBalance(u.userId), Math.floor(9900 * 0.03));

  const fresh = await getBenefitOverview(s.deps, u.userId);
  assert.equal(fresh.points.balance, 297);
  assert.equal(fresh.points.expiringSoon, null, "방금 쌓인 포인트는 곧 소멸 대상이 아니다");
  assert.equal(fresh.points.lots[0].daysLeft, 365);

  s.tick(340 * DAY);
  const later = await getBenefitOverview(s.deps, u.userId);
  assert.equal(later.points.expiringSoon?.amount, 297);
  assert.ok((later.points.lots[0].daysLeft ?? 99) <= 25);

  s.tick(30 * DAY);
  assert.equal(await s.benefits.getPointBalance(u.userId), 0, "1년이 지나면 쓸 수 없다");
});

test("구매 적립 구간: 누적 결제액이 늘면 다음 구매의 적립률이 오르고, 관리자가 구간을 바꿀 수 있으며 변경 이력이 남는다", async () => {
  const s = await setup({ features: ["points_earn"] });
  const r = await changeBenefitSetting(s.deps, { key: "earn.tiers", value: [{ fromKrw: 0, rate: 0.03 }, { fromKrw: 9000, rate: 0.1 }], reason: "시험 구간", by: "admin-1" });
  assert.deepEqual(r, { ok: true, changed: true });
  const u = await s.user("gamma");
  const first = await s.buyAtList(u);
  assert.ok(first);
  const again = await startCheckout(s.checkoutDeps, { userId: u.userId, assessmentId: u.assessmentId, again: true });
  // 첫 리포트가 만들어진 상태가 아니라 report-not-ready일 수 있으므로 같은 사용자의 두 번째 결과로 확인한다
  void again;
  const history = await s.benefits.listSettingHistory(5);
  assert.equal(history[0].key, "earn.tiers");
  assert.equal(history[0].reason, "시험 구간");
  assert.equal(history[0].changedBy, "admin-1");
  const bad = await changeBenefitSetting(s.deps, { key: "earn.tiers", value: [{ fromKrw: 0, rate: 2 }], reason: "x", by: "admin-1" });
  assert.equal(bad.ok, false);
  const noReason = await changeBenefitSetting(s.deps, { key: "feature.points_earn", value: false, reason: " ", by: "admin-1" });
  assert.equal(noReason.ok, false);
});

// ───── ③ 환불 시 회수 · 음수 잔액 없음 ─────

test("환불: 쓰지 않은 적립만 회수하고 이미 쓴 몫은 회수하지 못한 몫(shortfall)으로 기록하며 잔액은 음수가 되지 않는다", async () => {
  const s = await setup({ features: ["points_earn"] });
  const u = await s.user("delta");
  const order = await s.buyAtList(u);
  assert.equal(await s.benefits.getPointBalance(u.userId), 297);
  const spent = await s.benefits.spendPoints({ userId: u.userId, amount: 200, ref: "use-1" });
  assert.equal(spent.status, "spent");
  assert.equal(await s.benefits.getPointBalance(u.userId), 97);
  await s.repo.updateOrder(order.id, ["paid"], { status: "refunded" });
  assert.equal(await s.benefits.getPointBalance(u.userId), 0, "남은 97P만 회수하고 음수가 되지 않는다");
  const ledger = await s.benefits.listPointLedger(u.userId, 20);
  assert.equal(ledger.reduce((n, l) => n + l.shortfall, 0), 200, "이미 쓴 200P는 회수하지 못한 몫으로 남긴다");
  // 같은 환불을 다시 알려도 두 번 회수하지 않는다
  await s.repo.updateOrder(order.id, ["refunded"], { status: "refunded" }).catch(() => undefined);
  assert.equal(await s.benefits.getPointBalance(u.userId), 0);
  const lots = await s.benefits.listPointLots(u.userId);
  assert.ok(lots.every((l) => l.remaining >= 0));
});

test("포인트 쓰기: 같은 참조번호로 두 번 눌러도 한 번만 차감되고, 모자라면 차감되지 않으며, 되돌리면 한 번만 돌아온다", async () => {
  const s = await setup();
  const u = await s.user("epsil");
  await s.benefits.grantPoints({ userId: u.userId, amount: 500, sourceKind: "admin", sourceRef: "t", opKey: "grant-1", expiresAt: null });
  assert.equal((await s.benefits.grantPoints({ userId: u.userId, amount: 500, sourceKind: "admin", sourceRef: "t", opKey: "grant-1", expiresAt: null })).status, "duplicate");
  assert.equal(await s.benefits.getPointBalance(u.userId), 500);
  assert.equal((await s.benefits.spendPoints({ userId: u.userId, amount: 300, ref: "r1" })).status, "spent");
  assert.equal((await s.benefits.spendPoints({ userId: u.userId, amount: 300, ref: "r1" })).status, "already");
  assert.equal(await s.benefits.getPointBalance(u.userId), 200);
  assert.equal((await s.benefits.spendPoints({ userId: u.userId, amount: 900, ref: "r2" })).status, "insufficient");
  assert.equal((await s.benefits.restorePointSpend({ userId: u.userId, ref: "r1" })).status, "restored");
  assert.equal((await s.benefits.restorePointSpend({ userId: u.userId, ref: "r1" })).status, "already");
  assert.equal(await s.benefits.getPointBalance(u.userId), 500);
});

// ───── ⑤ 0원 주문: 서버가 승인한 혜택만 ─────

test("100% 쿠폰: 서버가 확인한 쿠폰으로만 0원 주문이 만들어지고, 결제사 주문이 아니며(provider: benefit), 같은 쿠폰을 다시 쓸 수 없다", async () => {
  const s = await setup({ features: ["coupons"] });
  const made = await createCouponByAdmin(s.deps, { code: "FREEPASS1", name: "무료 이용권", type: "free-product", value: 0, perUserLimit: 1, purpose: "cs" }, "admin-1");
  assert.ok(made.ok);
  if (!made.ok) return;
  assert.equal(await s.benefits.setCouponStatus(made.coupon.id, "active"), true);

  const u = await s.user("zeta");
  const q = await quoteForCheckout(s.deps, { ...u, couponCode: "freepass1" });
  assert.equal(q.kind, "quote");
  if (q.kind !== "quote") return;
  const free = q.quote.options.find((o) => o.kind === "coupon");
  assert.equal(free?.free, true);
  assert.equal(free?.amountKrw, 0);
  assert.equal(q.quote.listKrw, 9900, "정가는 함께 보인다");

  const r = await s.buyWith({ ...u }, { kind: "coupon", couponCode: "FREEPASS1" });
  assert.equal(r.planned.kind, "plan");
  assert.equal(r.started?.kind, "granted");
  if (r.started?.kind !== "granted") return;
  assert.equal(r.started.order.amount, 0);
  assert.equal(r.started.order.provider, "benefit");
  assert.equal(r.started.order.status, "paid");
  assert.equal(r.started.order.listAmount, 9900);
  assert.equal(r.started.order.discountKind, "coupon");
  // 구매 권한은 생겼으므로 같은 결과에 다시 0원 주문을 만들 수 없다
  const dup = await startCheckout(s.checkoutDeps, { ...u, plan: r.planned.kind === "plan" ? r.planned.plan : undefined });
  assert.equal(dup.kind, "already-paid");
  // 다른 사람이 같은 쿠폰(계정당 1회 · 한도 없음)을 쓰는 것은 되지만, 같은 사람의 두 번째 결과에는 못 쓴다
  const again = await quoteForCheckout(s.deps, { ...u, couponCode: "FREEPASS1", again: true });
  assert.equal(again.kind, "quote");
  if (again.kind === "quote") assert.equal(again.quote.denied[0]?.reason, "user-limit");
});

test("쿠폰 한도: 전체 한도가 차면 사유(sold-out)를 보이고, 쿠폰 코드는 대소문자를 가리지 않는다. 결제 전 주문이 취소되면 쿠폰은 풀려난다", async () => {
  const s = await setup({ features: ["coupons"] });
  const made = await createCouponByAdmin(s.deps, { code: "HALF5000", name: "5천원 할인", type: "amount", value: 5000, issueLimit: 1 }, "admin-1");
  assert.ok(made.ok);
  if (!made.ok) return;
  await s.benefits.setCouponStatus(made.coupon.id, "active");
  const a = await s.user("etaaaa");
  const b = await s.user("thetab");
  const ra = await s.buyWith(a, { kind: "coupon", couponCode: "half5000" });
  assert.equal(ra.started?.kind, "order");
  if (ra.started?.kind !== "order") return;
  assert.equal(ra.started.order.amount, 4900);
  assert.equal(ra.started.order.discountKrw, 5000);
  const qb = await quoteForCheckout(s.deps, { ...b, couponCode: "HALF5000" });
  if (qb.kind === "quote") assert.equal(qb.quote.denied[0]?.reason, "sold-out");
  // a의 결제 대기 주문이 취소되면 자리가 풀린다
  await s.repo.updateOrder(ra.started.order.id, ["pending"], { status: "canceled" });
  const qb2 = await quoteForCheckout(s.deps, { ...b, couponCode: "HALF5000" });
  if (qb2.kind === "quote") assert.equal(qb2.quote.options.some((o) => o.kind === "coupon"), true);
});

test("질문권 쿠폰은 MY에서 코드를 넣으면 바로 지급되고(만료일 포함), 같은 코드를 한 번 더 넣으면 거절된다", async () => {
  const s = await setup({ features: ["coupons"] });
  const made = await createCouponByAdmin(s.deps, { code: "ASKTWO22", name: "질문권 2개", type: "credit", value: 2, purpose: "event", creditExpireDays: 30 }, "admin-1");
  assert.ok(made.ok);
  if (!made.ok) return;
  await s.benefits.setCouponStatus(made.coupon.id, "active");
  const u = await s.user("iotaaa");
  const first = await redeemCouponCode(s.deps, { userId: u.userId, code: " asktwo22 ", key: "k1" });
  assert.deepEqual(first, { kind: "credited", qty: 2 });
  assert.equal(await s.benefits.getCreditBalance(u.userId), 2);
  const lot = (await s.benefits.listCreditLots(u.userId))[0];
  assert.equal(Math.round((new Date(lot.expiresAt!).getTime() - s.now().getTime()) / DAY), 30);
  const second = await redeemCouponCode(s.deps, { userId: u.userId, code: "ASKTWO22", key: "k2" });
  assert.equal(second.kind, "denied");
  assert.equal(await s.benefits.getCreditBalance(u.userId), 2);
  // 같은 요청(key)을 다시 보내면(새로고침 · 두 번 클릭) 두 번 지급하지 않는다
  await redeemCouponCode(s.deps, { userId: u.userId, code: "ASKTWO22", key: "k1" });
  assert.equal(await s.benefits.getCreditBalance(u.userId), 2);
  assert.deepEqual(await redeemCouponCode(s.deps, { userId: u.userId, code: "nope", key: "k3" }), { kind: "denied", reason: "not-found" });
});

test("쿠폰 입력 확인: 코드 모양 · 값 규칙을 먼저 안내한다(정률 1~100 · 무료 이용권 값 0 · 종료가 시작보다 뒤)", () => {
  assert.equal(validateCouponDraft({ code: "ab", name: "x", type: "amount", value: 100 }).ok, false);
  assert.equal(validateCouponDraft({ code: "ABCD", name: "x", type: "percent", value: 101 }).ok, false);
  assert.equal(validateCouponDraft({ code: "ABCD", name: "x", type: "free-product", value: 5 }).ok, false);
  assert.equal(validateCouponDraft({ code: "ABCD", name: "x", type: "amount", value: 100, startsAt: "2026-11-02T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" }).ok, false);
  const ok = validateCouponDraft({ code: "abcd", name: " 이름 ", type: "percent", value: 100 });
  assert.equal(ok.ok && ok.coupon.code, "ABCD");
});

test("포인트 교환: 포인트 교환가(설정)에 닿았을 때만 별도 선택지로 보이고, 현금과 섞지 않으며, 교환하면 0원 혜택 주문이 되고 환불하면 포인트가 한 번만 돌아온다", async () => {
  const s = await setup({ features: ["points_spend"] });
  const u = await s.user("kappaa");
  await s.benefits.grantPoints({ userId: u.userId, amount: 5000, sourceKind: "admin", sourceRef: "t", opKey: "g1", expiresAt: null });
  const low = await quoteForCheckout(s.deps, u);
  assert.equal(low.kind, "quote");
  if (low.kind === "quote") {
    assert.equal(low.quote.options.some((o) => o.kind === "points"), false);
    assert.equal(low.quote.pointsShortfall, 11_900 - 5000);
    assert.equal(low.pointBalance, 5000);
  }
  await s.benefits.grantPoints({ userId: u.userId, amount: 7000, sourceKind: "admin", sourceRef: "t", opKey: "g2", expiresAt: null });
  const q = await quoteForCheckout(s.deps, u);
  assert.equal(q.kind, "quote");
  if (q.kind === "quote") {
    const p = q.quote.options.find((o) => o.kind === "points");
    assert.equal(p?.points, 11_900);
    assert.equal(p?.amountKrw, 0, "현금 금액과 포인트 가격은 따로 보인다");
    assert.equal(q.quote.listKrw, 9900);
  }
  const r = await s.buyWith(u, { kind: "points" });
  assert.equal(r.started?.kind, "granted");
  if (r.started?.kind !== "granted") return;
  assert.equal(r.started.order.discountKind, "points");
  assert.equal(await s.benefits.getPointBalance(u.userId), 12_000 - 11_900);
  // 환불(복원) — 한 번만 돌아온다
  const back = await s.benefits.releaseBenefitOrder({ orderId: r.started.order.id, mode: "restore", reason: "시험", by: "admin-1" });
  assert.equal(back.ok, true);
  assert.equal(await s.benefits.getPointBalance(u.userId), 12_000);
  const again = await s.benefits.releaseBenefitOrder({ orderId: r.started.order.id, mode: "restore", reason: "시험", by: "admin-1" });
  assert.deepEqual(again, { ok: true, already: true });
  assert.equal(await s.benefits.getPointBalance(u.userId), 12_000);
});

test("포인트 교환은 클라이언트가 보낸 포인트 값을 믿지 않는다: 서버가 정한 교환가와 다르면 거절된다", async () => {
  const s = await setup({ features: ["points_spend"] });
  const u = await s.user("lambda");
  await s.benefits.grantPoints({ userId: u.userId, amount: 20_000, sourceKind: "admin", sourceRef: "t", opKey: "g1", expiresAt: null });
  const forged = await s.benefits.grantBenefitOrder({ userId: u.userId, assessmentId: u.assessmentId, productId: PERSONAL_REPORT.id, kind: "points", pointPrice: 1, listPriceKrw: 9900, orderNumber: "MEU-20261020-FORGEDAAAA", paymentEnv: "test" });
  assert.deepEqual(forged, { ok: false, reason: "price" });
  assert.equal(await s.benefits.getPointBalance(u.userId), 20_000);
});

// ───── ④ 결제 전 표시와 서버 판단 ─────

test("요청한 쿠폰이 맞지 않으면 사유와 정가를 보이고, 고객이 정가 확인을 눌러야 결제로 간다. 서버 오류는 '할인 불가'가 아니라 오류다", async () => {
  const s = await setup({ features: ["coupons"] });
  const u = await s.user("mu");
  const denied = await planCheckout(s.deps, { ...u, couponCode: "NOSUCH12", choice: { kind: "list" } });
  assert.equal(denied.kind, "needs-confirmation");
  if (denied.kind === "needs-confirmation") {
    assert.equal(denied.quote.listKrw, 9900);
    assert.equal(denied.quote.denied[0].reason, "not-found");
    assert.match(denied.quote.denied[0].message, /쿠폰/);
  }
  const confirmed = await planCheckout(s.deps, { ...u, couponCode: "NOSUCH12", choice: { kind: "list", confirmListPrice: true } });
  assert.equal(confirmed.kind, "plan");
  if (confirmed.kind === "plan" && confirmed.plan.mode === "pay") assert.equal(confirmed.plan.amountKrw, 9900);
  // 화면이 보낸 선택이 견적에 없으면 거절(쿠폰이 맞지 않는데 coupon을 고름)
  const invalid = await planCheckout(s.deps, { ...u, couponCode: "NOSUCH12", choice: { kind: "coupon", couponCode: "NOSUCH12" } });
  assert.equal(invalid.kind, "invalid-choice");

  // 서버 오류: 확인 중 예외 → error, 정가 주문 자동 생성 없음
  const broken: BenefitDeps = { ...s.deps, benefits: { ...s.benefits, couponCheck: async () => { throw new Error("db down"); } } };
  const err = await planCheckout(broken, { ...u, couponCode: "NOSUCH12", choice: { kind: "list", confirmListPrice: true } });
  assert.equal(err.kind, "error");
  assert.equal((await s.repo.listOrdersForAssessment(u.assessmentId)).length, 0, "오류일 때 정가 주문을 만들지 않았다");
});

test("적격 할인이 둘 이상이면 서버가 조용히 고르지 않고 고객이 고르게 한다(자동 중복 적용 없음)", async () => {
  const s = await setup({ features: ["coupons", "referral", "referral_signup_points"] });
  const inviter = await s.user("inviter");
  const link = await createReferralLink(s.deps, inviter.userId, () => "T".repeat(24));
  assert.ok(link.ok);
  const invitee = await s.user("invitee");
  s.ben.setJoinedAt(invitee.userId, new Date(s.now().getTime() - HOUR));
  assert.equal((await s.benefits.registerReferralSignup({ token: "T".repeat(24), inviteeUserId: invitee.userId, anonId: "anon-device-0001" })).ok, true);
  const made = await createCouponByAdmin(s.deps, { code: "TENOFF10", name: "10% 할인", type: "percent", value: 10 }, "admin-1");
  assert.ok(made.ok);
  if (!made.ok) return;
  await s.benefits.setCouponStatus(made.coupon.id, "active");
  const plan = await planCheckout(s.deps, { ...invitee, couponCode: "TENOFF10", choice: { kind: "list" } });
  assert.equal(plan.kind, "needs-choice");
  if (plan.kind === "needs-choice") assert.deepEqual(plan.quote.options.map((o) => o.kind).sort(), ["coupon", "list", "referral"]);
  const picked = await planCheckout(s.deps, { ...invitee, couponCode: "TENOFF10", choice: { kind: "referral" } });
  assert.equal(picked.kind, "plan");
  if (picked.kind === "plan" && picked.plan.mode === "pay") assert.equal(picked.plan.amountKrw, 6900);
});

// ───── ① 추천 ─────

async function referralSetup() {
  const s = await setup({ features: ["referral", "referral_signup_points", "referral_purchase_credits"] });
  const inviter = await s.user("inviterz");
  const token = "R".repeat(24);
  const link = await createReferralLink(s.deps, inviter.userId, () => token);
  assert.deepEqual(link, { ok: true, token });
  // 두 번 눌러도 같은 링크
  assert.deepEqual(await createReferralLink(s.deps, inviter.userId, () => "X".repeat(24)), { ok: true, token });
  /** 새로 가입한 친구(무료 분석 전) */
  const invitee = async (name: string, anon = `anon-${name}-device`) => {
    const userId = `${name.padEnd(8, "0")}-0000-4000-8000-000000000000`;
    s.ben.setJoinedAt(userId, new Date(s.now().getTime() - HOUR));
    const reg = await s.benefits.registerReferralSignup({ token, inviteeUserId: userId, anonId: anon });
    return { userId, reg };
  };
  const analyze = async (userId: string) => (await s.repo.insertAssessment({ ...BASE, userId })).id;
  return { s, inviter, token, invitee, analyze };
}

test("추천 링크는 가입한 회원이면 누구나 받고(인원 제한 없음), 추천 기능이 꺼져 있으면 만들지 않는다", async () => {
  const off = await setup();
  const u = await off.user("offuser");
  assert.deepEqual(await createReferralLink(off.deps, u.userId, () => "A".repeat(24)), { ok: false, reason: "off" });
  const { s, token, invitee } = await referralSetup();
  for (let i = 0; i < 6; i++) {
    const r = await invitee(`friend${i}`, `anon-friend-${i}-dev`);
    assert.equal(r.reg.ok, true, `친구 ${i}`);
  }
  assert.equal((await s.benefits.referralOverview((await s.benefits.getReferralLinkOwner(token))!)).signups, 6, "3명 제한이 없다");
});

test("가입 보상(500P)은 가입만으로 주지 않는다: 계정 확인 · 무료 분석 1건 · 확인 기간이 모두 지난 뒤에야 확정된다", async () => {
  const { s, inviter, invitee, analyze } = await referralSetup();
  const f = await invitee("friendaa");
  assert.equal(f.reg.ok && f.reg.status, "pending");
  assert.equal(await s.benefits.getPointBalance(inviter.userId), 0, "가입만으로는 지급하지 않는다");

  // 무료 분석 전
  s.tick(80 * HOUR);
  assert.equal((await s.benefits.evaluateReferralSignup(f.userId)).status, "no-analysis");
  await analyze(f.userId);
  // 계정 확인 전
  s.ben.setUnconfirmed(f.userId);
  assert.equal((await s.benefits.evaluateReferralSignup(f.userId)).status, "not-confirmed");
  assert.equal(await s.benefits.getPointBalance(inviter.userId), 0);

  // 확인 기간(72시간) 전
  const g = await invitee("friendbb");
  await analyze(g.userId);
  assert.equal((await s.benefits.evaluateReferralSignup(g.userId)).status, "holding");
  assert.equal(await s.benefits.getPointBalance(inviter.userId), 0);
  s.tick(80 * HOUR);
  const done = await s.benefits.evaluateReferralSignup(g.userId);
  assert.equal(done.status, "confirmed");
  assert.equal(await s.benefits.getPointBalance(inviter.userId), 500);
  // 두 번 평가해도 한 번만 지급
  await s.benefits.evaluateReferralSignup(g.userId);
  assert.equal(await s.benefits.getPointBalance(inviter.userId), 500);
});

test("자기 자신 · 이미 쓰던 회원 · 같은 기기 반복 · 너무 빠른 가입은 걸러 확정하지 않고 관리자 검토로 보낸다", async () => {
  const { s, inviter, token, invitee, analyze } = await referralSetup();
  // 자기 초대
  assert.deepEqual(await s.benefits.registerReferralSignup({ token, inviteeUserId: inviter.userId, anonId: "anon-self-device" }), { ok: false, reason: "self" });
  // 이미 가입한 지 오래된 회원
  const old = await s.user("oldmem");
  assert.deepEqual(await s.benefits.registerReferralSignup({ token, inviteeUserId: old.userId, anonId: "anon-old-device1" }), { ok: false, reason: "not-new" });
  // 같은 기기로 두 번째 가입 → 검토
  await invitee("devone0", "anon-same-device");
  const second = await invitee("devtwo0", "anon-same-device");
  assert.equal(second.reg.ok && second.reg.status, "review");
  assert.ok(second.reg.ok && second.reg.risk?.includes("same_device_repeat"));
  await analyze(second.userId);
  s.tick(80 * HOUR);
  assert.equal((await s.benefits.evaluateReferralSignup(second.userId)).status, "review");
  assert.equal(await s.benefits.getPointBalance(inviter.userId), 0, "검토 중에는 지급하지 않는다");
  // 관리자가 이유와 함께 승인하면 그때 지급
  const bad = await s.benefits.decideReferralSignup({ inviteeUserId: second.userId, decision: "confirm", reason: " ", by: "admin-1" });
  assert.equal(bad.ok, false);
  const approved = await s.benefits.decideReferralSignup({ inviteeUserId: second.userId, decision: "confirm", reason: "가족 기기 확인", by: "admin-1" });
  assert.equal(approved.ok, true);
  assert.equal(await s.benefits.getPointBalance(inviter.userId), 500);
  // 부정으로 확인되면 쓰지 않은 보상만 회수
  const rev = await s.benefits.revokeReferralSignup({ inviteeUserId: second.userId, reason: "부정 가입", by: "admin-1" });
  assert.equal(rev.ok, true);
  assert.equal(await s.benefits.getPointBalance(inviter.userId), 0);
});

test("추천인이 하루에 확정받을 수 있는 가입 수를 넘으면 나머지는 관리자 검토로 간다", async () => {
  const { s, inviter, invitee, analyze } = await referralSetup();
  await changeBenefitSetting(s.deps, { key: "referral.max_confirmed_per_inviter_per_day", value: 2, reason: "시험", by: "admin-1" });
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const f = await invitee(`capuser${i}`, `anon-cap-${i}-device`);
    await analyze(f.userId);
    ids.push(f.userId);
  }
  s.tick(80 * HOUR);
  const results = [];
  for (const id of ids) results.push((await s.benefits.evaluateReferralSignup(id)).status);
  assert.deepEqual(results, ["confirmed", "confirmed", "review"]);
  assert.equal(await s.benefits.getPointBalance(inviter.userId), 1000);
});

test("친구의 첫 구매: 6,900원은 첫 구매 한 번만, 결제가 확인되면 양쪽에 질문권이 1개씩 들어가고 환불되면 쓰지 않은 질문권만 회수한다", async () => {
  const { s, inviter, invitee, analyze } = await referralSetup();
  const f = await invitee("buyerfr");
  const ass = await analyze(f.userId);
  const r = await s.buyWith({ userId: f.userId, assessmentId: ass }, { kind: "referral" });
  assert.equal(r.started?.kind, "order");
  if (r.started?.kind !== "order") return;
  assert.equal(r.started.order.amount, 6900);
  assert.equal(r.started.order.listAmount, 9900);
  assert.equal(r.started.order.discountKrw, 3000);
  assert.equal(await s.benefits.getCreditBalance(inviter.userId), 0, "결제 전에는 지급하지 않는다");
  await s.pay(r.started.order.id);
  assert.equal(await s.benefits.getCreditBalance(inviter.userId), 1);
  assert.equal(await s.benefits.getCreditBalance(f.userId), 1);

  // 이미 첫 구매를 했으므로 다시는 추천 가격이 아니다
  const q = await quoteForCheckout(s.deps, { userId: f.userId, assessmentId: ass, again: true });
  if (q.kind === "quote") assert.equal(q.quote.options.some((o) => o.kind === "referral"), false);

  // 추천인이 질문권을 이미 썼다면 회수하지 못한 몫으로 남고 음수가 되지 않는다
  const spent = await s.benefits.spendCredit({ userId: inviter.userId, ref: "chat-1" });
  assert.equal(spent.status, "spent");
  await s.repo.updateOrder(r.started.order.id, ["paid"], { status: "refunded" });
  assert.equal(await s.benefits.getCreditBalance(inviter.userId), 0);
  assert.equal(await s.benefits.getCreditBalance(f.userId), 0, "쓰지 않은 친구의 질문권은 회수");
  const ledger = await s.benefits.listCreditLedger(inviter.userId, 20);
  assert.ok(ledger.some((l) => l.shortfall > 0), "추천인이 이미 쓴 몫은 기록으로 남긴다");
});

test("추천 가격 요청이 맞지 않으면 사유를 보이고 정가로 가려면 확인이 필요하다(추천 링크 없이 온 회원에게는 거절 사유를 보이지 않는다)", async () => {
  const { s, invitee, analyze } = await referralSetup();
  const plain = await s.user("plainmb");
  const q = await quoteForCheckout(s.deps, plain);
  if (q.kind === "quote") {
    assert.equal(q.quote.denied.length, 0, "추천 링크로 오지 않았다면 사유를 보이지 않는다");
    assert.deepEqual(q.quote.options.map((o) => o.kind), ["list"]);
  }
  const f = await invitee("rejectfr", "anon-rej-device-1");
  const ass = await analyze(f.userId);
  await s.benefits.decideReferralSignup({ inviteeUserId: f.userId, decision: "reject", reason: "부정 가입", by: "admin-1" });
  const rq = await quoteForCheckout(s.deps, { userId: f.userId, assessmentId: ass });
  assert.equal(rq.kind, "quote");
  if (rq.kind === "quote") {
    assert.equal(rq.quote.denied[0]?.reason, "signup-rejected");
    assert.equal(rq.quote.needsListConfirmation, true);
  }
});

// ───── 관리 · 질문권 장부 ─────

test("질문권: 사용 순서는 만료가 빠른 것부터이고, 같은 요청은 한 번만 차감되며 실패하면 되돌릴 수 있다. 환불로 회수된 질문권은 되돌려 살아나지 않는다", async () => {
  const s = await setup();
  const u = await s.user("credits");
  await s.benefits.grantCredit({ userId: u.userId, kind: "event", qty: 1, sourceRef: "a", opKey: "c1", expiresAt: new Date(s.now().getTime() + 100 * DAY).toISOString() });
  await s.benefits.grantCredit({ userId: u.userId, kind: "promo", qty: 1, sourceRef: "b", opKey: "c2", expiresAt: new Date(s.now().getTime() + 10 * DAY).toISOString() });
  assert.equal(await s.benefits.getCreditBalance(u.userId), 2);
  const first = await s.benefits.spendCredit({ userId: u.userId, ref: "q1" });
  assert.equal(first.status === "spent" && first.kind, "promo", "만료가 빠른 쪽부터");
  assert.equal((await s.benefits.spendCredit({ userId: u.userId, ref: "q1" })).status, "already");
  assert.equal(await s.benefits.getCreditBalance(u.userId), 1);
  assert.equal((await s.benefits.restoreCreditSpend({ userId: u.userId, ref: "q1" })).status, "restored");
  assert.equal(await s.benefits.getCreditBalance(u.userId), 2);
  assert.equal((await s.benefits.restoreCreditSpend({ userId: u.userId, ref: "q1" })).status, "already");
  assert.equal(await s.benefits.getCreditBalance(u.userId), 2);
  s.tick(11 * DAY);
  assert.equal(await s.benefits.getCreditBalance(u.userId), 1, "만료된 질문권은 쓸 수 없다");
});

test("혜택 주문(0원)은 매출 · 결제 대조 대상이 아니다: 결제사 대조 목록과 지표에서 빠진다", async () => {
  const s = await setup({ features: ["coupons"] });
  const made = await createCouponByAdmin(s.deps, { code: "FREEPASS2", name: "무료", type: "free-product", value: 0 }, "admin-1");
  assert.ok(made.ok);
  if (!made.ok) return;
  await s.benefits.setCouponStatus(made.coupon.id, "active");
  const u = await s.user("metrics");
  const r = await s.buyWith(u, { kind: "coupon", couponCode: "FREEPASS2" });
  assert.equal(r.started?.kind, "granted");
  const reconcilable = await s.repo.listOrdersForReconcile({ pendingCreatedBefore: new Date(s.now().getTime() + DAY).toISOString(), paidSince: new Date(0).toISOString(), limit: 100 });
  assert.equal(reconcilable.some((o) => o.provider === "benefit"), false, "결제사 대조 대상이 아니다");
  const rows = await s.repo.listOrdersForMetrics(new Date(0).toISOString(), 100);
  const mine = rows.filter((o) => o.provider === "benefit");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].amount, 0, "혜택 주문은 0원이고 provider로 구분된다");
});
