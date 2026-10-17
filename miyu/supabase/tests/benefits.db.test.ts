// DB 검증(혜택 시스템, 마이그레이션 19~22번): 포인트 · 질문권 장부 · 쿠폰 · 0원 혜택 주문 · 추천 · 환불 회수 · 탈퇴 · 접근 정책을 실제 Postgres에서 확인한다.
// 실행 전 local-stack.sh start 필요(마이그레이션 1~22번이 모두 적용돼 있어야 한다). 실행: npm run test:db
// 이 시험은 개발용 임시 DB에서만 돈다. 실제 Supabase · 실제 결제에서는 아직 확인하지 않았다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ASSESSMENT_MODULES } from "../../lib/assessment/modules/index.ts";
import { BENEFIT_FEATURES } from "../../lib/commerce/benefits.ts";
import { createSupabaseBenefitRepository } from "../../lib/integrations/supabase/benefits.ts";
import { createSupabaseRepository } from "../../lib/integrations/supabase/repository.ts";
import { PERSONAL_REPORT } from "../../lib/config/product.ts";
import { EMPTY_BASIC_INFO } from "../../lib/profile/basic-info.ts";
import { manseryeokEngine as sajuEngine } from "../../lib/saju/manseryeok-engine.ts";
import { submitAssessment } from "../../lib/services/assessment-service.ts";
import { createCouponByAdmin, getBenefitOverview, planCheckout } from "../../lib/services/benefit-service.ts";
import { confirmPayment, startCheckout } from "../../lib/services/order-service.ts";
import type { PaymentGateway } from "../../lib/services/ports.ts";

const URL = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
const JWT_SECRET = process.env.JWT_SECRET ?? "local-test-jwt-secret-at-least-32-characters";

function sign(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...payload })}`;
  return `${body}.${createHmac("sha256", JWT_SECRET).update(body).digest("base64url")}`;
}
const ANON_KEY = sign({ role: "anon" });
const SERVICE_KEY = sign({ role: "service_role" });
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE_KEY, noSession);
const server = createSupabaseRepository(admin);
const benefits = createSupabaseBenefitRepository(admin);

const psql = (q: string) => execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-tA", "-c", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i, n) => [i.id, (n % 5) + 1])));
const info = { ...EMPTY_BASIC_INFO, nickname: "혜택시험", birthYear: "1990", birthMonth: "1", birthDay: "15", birthTime: "09:30", gender: "female" as const };

const gateway: PaymentGateway = {
  provider: "tosspayments",
  async confirm({ paymentKey, orderId, amount }) {
    return { ok: true, payment: { paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: new Date().toISOString(), mId: "test-mid" } };
  },
  async getPayment() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
  async getPaymentByOrderId() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
};

async function makeUser(): Promise<{ id: string; client: SupabaseClient }> {
  const email = `b-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, ANON_KEY, noSession);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, client };
}

async function person(analyses = 1) {
  const U = await makeUser();
  let aid = "";
  for (let i = 0; i < analyses; i++) {
    const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info, answers, today: new Date() });
    assert.ok(saved.ok);
    aid = saved.ok ? saved.assessment.id : "";
  }
  return { U, aid };
}

const ADMIN_ID = randomUUID();
const nowFn = () => new Date();
const deps = () => ({ repo: server, benefits, now: nowFn });

/** 정가로 결제 완료까지(결제 승인 트리거가 적립 · 쿠폰 · 추천 보상을 처리한다) */
async function buyAtList(p: { U: { id: string }; aid: string }, opts: { again?: boolean } = {}) {
  const started = await startCheckout({ repo: server, now: nowFn }, { userId: p.U.id, assessmentId: p.aid, again: opts.again });
  assert.equal(started.kind, "order");
  if (started.kind !== "order") throw new Error("order");
  const paid = await confirmPayment({ repo: server, gateway }, { userId: p.U.id, orderNumber: started.order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: started.order.amount });
  assert.equal(paid.kind, "paid");
  return started.order;
}

const setFlag = (name: string, on: boolean) => benefits.setSetting({ key: `feature.${name}`, value: on, reason: "DB 시험", by: null });

before(async () => {
  // 기본값은 모두 꺼짐이어야 한다(마이그레이션을 적용해도 아무것도 지급되지 않는다)
  const raw = await benefits.getSettings();
  for (const f of BENEFIT_FEATURES) assert.equal(raw[`feature.${f}`], false, `feature.${f}은 기본 꺼짐`);
});
after(async () => {
  for (const f of BENEFIT_FEATURES) await setFlag(f, false);
});

test("포인트: 선입선출로 쓰고, 같은 참조번호는 한 번만 차감하며, 되돌리면 한 번만 돌아오고, 장부 합계와 묶음 잔여가 항상 맞는다", async () => {
  const u = await makeUser();
  const near = new Date(Date.now() + 10 * 86_400_000).toISOString();
  const far = new Date(Date.now() + 300 * 86_400_000).toISOString();
  assert.equal((await benefits.grantPoints({ userId: u.id, amount: 300, sourceKind: "admin", sourceRef: "far", opKey: `p-far-${u.id}`, expiresAt: far })).status, "granted");
  assert.equal((await benefits.grantPoints({ userId: u.id, amount: 200, sourceKind: "admin", sourceRef: "near", opKey: `p-near-${u.id}`, expiresAt: near })).status, "granted");
  assert.equal((await benefits.grantPoints({ userId: u.id, amount: 200, sourceKind: "admin", sourceRef: "near", opKey: `p-near-${u.id}`, expiresAt: near })).status, "duplicate");
  assert.equal(await benefits.getPointBalance(u.id), 500);
  const spent = await benefits.spendPoints({ userId: u.id, amount: 250, ref: `spend-${u.id}` });
  assert.deepEqual(spent, { status: "spent", balance: 250 });
  assert.equal((await benefits.spendPoints({ userId: u.id, amount: 250, ref: `spend-${u.id}` })).status, "already");
  const lots = await benefits.listPointLots(u.id);
  assert.equal(lots.find((l) => l.sourceRef === "near")?.remaining, 0, "소멸이 빠른 묶음부터 쓴다");
  assert.equal(lots.find((l) => l.sourceRef === "far")?.remaining, 250);
  assert.equal((await benefits.spendPoints({ userId: u.id, amount: 9999, ref: `big-${u.id}` })).status, "insufficient");
  assert.equal((await benefits.restorePointSpend({ userId: u.id, ref: `spend-${u.id}` })).status, "restored");
  assert.equal((await benefits.restorePointSpend({ userId: u.id, ref: `spend-${u.id}` })).status, "already");
  assert.equal(await benefits.getPointBalance(u.id), 500);
  const totals = await benefits.ledgerTotals(new Date(Date.now() - 86_400_000).toISOString());
  assert.equal(totals.lotMismatches, 0, "내역 합계와 묶음 잔여가 어긋나지 않는다");
});

test("장부는 기록만 쌓인다: 내역을 고치거나 지우려 하면 DB가 막고, 브라우저는 자기 것만 읽고 쓰기는 못 한다", async () => {
  const a = await makeUser();
  const b = await makeUser();
  await benefits.grantPoints({ userId: a.id, amount: 100, sourceKind: "admin", sourceRef: "x", opKey: `rls-${a.id}`, expiresAt: null });
  await benefits.grantCredit({ userId: a.id, kind: "admin", qty: 1, sourceRef: "x", opKey: `rls-c-${a.id}`, expiresAt: null });
  assert.throws(() => psql(`update public.point_ledger set amount = 999 where user_id = '${a.id}'`), /append|허용|not allowed|raise/i);
  assert.throws(() => psql(`delete from public.point_ledger where user_id = '${a.id}'`), /append|허용|not allowed|raise/i);
  assert.throws(() => psql(`update public.credit_ledger set qty = 9 where user_id = '${a.id}'`), /append|허용|not allowed|raise/i);
  // 본인만 읽는다
  assert.equal(((await a.client.from("point_lots").select("id")).data ?? []).length, 1);
  assert.equal(((await b.client.from("point_lots").select("id")).data ?? []).length, 0);
  assert.equal(((await b.client.from("point_ledger").select("id")).data ?? []).length, 0);
  assert.equal(((await a.client.from("credit_lots").select("id")).data ?? []).length, 1);
  // 브라우저의 쓰기 · 함수 호출은 거절
  const w = await a.client.from("point_lots").insert({ user_id: a.id, amount: 1, remaining: 1, source_kind: "admin" });
  assert.ok(w.error, "삽입이 막혀야 한다");
  const f = await a.client.rpc("grant_points", { p_user: a.id, p_amount: 1000, p_source_kind: "admin", p_source_ref: "x", p_op_key: `hack-${a.id}`, p_expires_at: null });
  assert.ok(f.error, "브라우저는 지급 함수를 부를 수 없다");
  assert.equal(await benefits.getPointBalance(a.id), 100);
  const g = await anon().rpc("point_balance", { p_user: a.id });
  assert.ok(g.error);
});
const anon = () => createClient(URL, ANON_KEY, noSession);

test("구매 적립(주문 트리거): 꺼져 있으면 쌓이지 않고, 켜면 결제가 확인된 주문에 한 번만 쌓이며, 환불되면 남은 몫만 회수하고 이미 쓴 몫은 shortfall로 남긴다", async () => {
  const off = await person();
  await buyAtList(off);
  assert.equal(await benefits.getPointBalance(off.U.id), 0, "꺼져 있으면 적립 없음");

  await setFlag("points_earn", true);
  const p = await person();
  const order = await buyAtList(p);
  assert.equal(await benefits.getPointBalance(p.U.id), Math.floor(order.amount * 0.03));
  const lot = (await benefits.listPointLots(p.U.id))[0];
  assert.ok(lot.expiresAt, "유효기간이 박힌다");
  const days = Math.round((new Date(lot.expiresAt!).getTime() - Date.now()) / 86_400_000);
  assert.ok(days >= 364 && days <= 366, `1년 유효: ${days}일`);
  assert.equal((await benefits.spendPoints({ userId: p.U.id, amount: 200, ref: `u-${p.U.id}` })).status, "spent");
  await server.updateOrder(order.id, ["paid"], { status: "refunded" });
  assert.equal(await benefits.getPointBalance(p.U.id), 0, "음수가 되지 않는다");
  const ledger = await benefits.listPointLedger(p.U.id, 20);
  assert.equal(ledger.reduce((n, l) => n + l.shortfall, 0), 200, "이미 쓴 몫은 회수하지 못한 몫으로 남는다");
  // 환불을 한 번 더 알려도 다시 회수하지 않는다(음수 · 중복 없음)
  assert.equal(await benefits.getPointBalance(p.U.id), 0);
  await setFlag("points_earn", false);
});

test("쿠폰(0원 혜택 주문): 직접 삽입은 거절되고, 서버가 확인한 100% 쿠폰만 결제사 주문이 아닌 0원 주문을 만들며(provider: benefit), 같은 쿠폰의 두 번째 사용은 거절되고, 취소하면 쿠폰이 풀린다", async () => {
  await setFlag("coupons", true);
  const made = await createCouponByAdmin(deps(), { code: `FREE${Date.now() % 100000}`, name: "무료 이용권", type: "free-product", value: 0, perUserLimit: 1 }, ADMIN_ID);
  assert.ok(made.ok);
  if (!made.ok) return;
  await benefits.setCouponStatus(made.coupon.id, "active");
  const p = await person();
  // 0원 주문을 아무 경로로나 만들 수 없다
  assert.throws(() => psql(`insert into public.orders (order_number, user_id, assessment_id, product_id, amount, status, payment_env) values ('MEU-20261020-ZEROZEROZE', '${p.U.id}', '${p.aid}', '${PERSONAL_REPORT.id}', 0, 'paid', 'test')`), /check|constraint|violat|0|benefit/i);
  assert.throws(() => psql(`insert into public.orders (order_number, user_id, assessment_id, product_id, amount, status, payment_env, provider) values ('MEU-20261020-ZEROZEROY', '${p.U.id}', '${p.aid}', '${PERSONAL_REPORT.id}', 0, 'paid', 'test', 'benefit')`), /benefit|grant|허용|raise/i);

  const planned = await planCheckout(deps(), { userId: p.U.id, assessmentId: p.aid, couponCode: made.coupon.code, choice: { kind: "coupon", couponCode: made.coupon.code } });
  assert.equal(planned.kind, "plan");
  if (planned.kind !== "plan") return;
  const started = await startCheckout({ repo: server, now: nowFn }, { userId: p.U.id, assessmentId: p.aid, plan: planned.plan });
  assert.equal(started.kind, "granted");
  if (started.kind !== "granted") return;
  assert.equal(psql(`select provider || ':' || amount::text || ':' || status from public.orders where id = '${started.order.id}'`), "benefit:0:paid");
  assert.throws(() => psql(`update public.orders set provider = 'tosspayments' where id = '${started.order.id}'`), /provider|immutable|허용|raise/i);
  // 같은 결과에 다시는 못 받는다
  const dup = await startCheckout({ repo: server, now: nowFn }, { userId: p.U.id, assessmentId: p.aid, plan: planned.plan });
  assert.equal(dup.kind, "already-paid");
  // 같은 사람이 두 번째 결과에 같은 쿠폰을 쓰려 하면 계정당 횟수 초과
  const second = await benefits.couponCheck({ code: made.coupon.code, userId: p.U.id, productId: `${PERSONAL_REPORT.id}:r2` });
  assert.deepEqual(second, { ok: false, reason: "user-limit" });
  // 취소(복원)하면 쿠폰이 풀린다
  const released = await benefits.releaseBenefitOrder({ orderId: started.order.id, mode: "restore", reason: "시험", by: null });
  assert.equal(released.ok, true);
  assert.equal((await benefits.couponCheck({ code: made.coupon.code, userId: p.U.id, productId: `${PERSONAL_REPORT.id}:r2` })).ok, true);
  assert.deepEqual(await benefits.releaseBenefitOrder({ orderId: started.order.id, mode: "restore", reason: "시험", by: null }), { ok: true, already: true });
  await setFlag("coupons", false);
});

test("쿠폰 동시성: 전체 한도 1개인 쿠폰을 8명이 동시에 쓰면 정확히 1명만 예약되고 나머지는 sold-out이다", async () => {
  await setFlag("coupons", true);
  const made = await createCouponByAdmin(deps(), { code: `ONE${Date.now() % 100000}`, name: "한 명만", type: "amount", value: 3000, issueLimit: 1 }, ADMIN_ID);
  assert.ok(made.ok);
  if (!made.ok) return;
  await benefits.setCouponStatus(made.coupon.id, "active");
  const people = await Promise.all(Array.from({ length: 8 }, () => person()));
  const orders = await Promise.all(
    people.map(async (p) => {
      const s = await startCheckout({ repo: server, now: nowFn }, { userId: p.U.id, assessmentId: p.aid });
      assert.equal(s.kind, "order");
      return s.kind === "order" ? s.order : null;
    }),
  );
  const results = await Promise.all(people.map((p, i) => benefits.reserveCoupon({ code: made.coupon.code, userId: p.U.id, orderId: orders[i]!.id, key: `k-${p.U.id}` })));
  const ok = results.filter((r) => r.ok);
  assert.equal(ok.length, 1, JSON.stringify(results));
  assert.ok(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === "sold-out"));
  // 같은 키로 다시 예약하면 중복 없이 같은 예약
  const idx = results.findIndex((r) => r.ok);
  const again = await benefits.reserveCoupon({ code: made.coupon.code, userId: people[idx].U.id, orderId: orders[idx]!.id, key: `k-${people[idx].U.id}` });
  assert.ok(again.ok && again.duplicate);
  await setFlag("coupons", false);
});

test("질문권: 만료가 빠른 것부터 쓰고, 같은 참조번호는 한 번만 차감하며, 되돌리면 한 번만 돌아오고, 회수된(환불 · 부정) 질문권은 되돌려도 살아나지 않는다", async () => {
  const u = await makeUser();
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const late = new Date(Date.now() + 200 * 86_400_000).toISOString();
  await benefits.grantCredit({ userId: u.id, kind: "promo", qty: 1, sourceRef: "late", opKey: `c1-${u.id}`, expiresAt: late });
  await benefits.grantCredit({ userId: u.id, kind: "event", qty: 1, sourceRef: "soon", opKey: `c2-${u.id}`, expiresAt: soon });
  const first = await benefits.spendCredit({ userId: u.id, ref: `q1-${u.id}` });
  assert.equal(first.status === "spent" && first.kind, "event");
  assert.equal((await benefits.spendCredit({ userId: u.id, ref: `q1-${u.id}` })).status, "already");
  assert.equal(await benefits.getCreditBalance(u.id), 1);
  assert.equal((await benefits.restoreCreditSpend({ userId: u.id, ref: `q1-${u.id}` })).status, "restored");
  assert.equal((await benefits.restoreCreditSpend({ userId: u.id, ref: `q1-${u.id}` })).status, "already");
  assert.equal(await benefits.getCreditBalance(u.id), 2);
  assert.equal((await benefits.spendCredit({ userId: u.id, ref: `q2-${u.id}` })).status, "spent");
  assert.equal((await benefits.spendCredit({ userId: u.id, ref: `q3-${u.id}` })).status, "spent");
  assert.equal((await benefits.spendCredit({ userId: u.id, ref: `q4-${u.id}` })).status, "none");
  // 질문권을 같은 참조번호로 동시에 8번 써도 한 번만 차감
  const v = await makeUser();
  await benefits.grantCredit({ userId: v.id, kind: "promo", qty: 3, sourceRef: "p", opKey: `c3-${v.id}`, expiresAt: late });
  const burst = await Promise.all(Array.from({ length: 8 }, () => benefits.spendCredit({ userId: v.id, ref: `same-${v.id}` })));
  assert.equal(burst.filter((r) => r.status === "spent").length, 1);
  assert.equal(await benefits.getCreditBalance(v.id), 2);
});

async function referralWorld() {
  await setFlag("referral", true);
  await setFlag("referral_signup_points", true);
  await setFlag("referral_purchase_credits", true);
  await benefits.setSetting({ key: "referral.hold_hours", value: 0, reason: "DB 시험", by: null });
  await benefits.setSetting({ key: "referral.risk.young_inviter_minutes", value: 0, reason: "DB 시험", by: null });
  await benefits.setSetting({ key: "referral.risk.min_visit_seconds", value: 0, reason: "DB 시험", by: null });
  const inviter = await person();
  const token = randomUUID().replace(/-/g, "").slice(0, 24);
  assert.equal(await benefits.ensureReferralLink({ userId: inviter.U.id, token }), token);
  assert.equal(await benefits.ensureReferralLink({ userId: inviter.U.id, token: "Z".repeat(24) }), token, "두 번 눌러도 같은 링크");
  return { inviter, token };
}
async function resetReferral() {
  await benefits.setSetting({ key: "referral.hold_hours", value: 72, reason: "DB 시험 복원", by: null });
  await benefits.setSetting({ key: "referral.risk.young_inviter_minutes", value: 60, reason: "DB 시험 복원", by: null });
  await benefits.setSetting({ key: "referral.risk.min_visit_seconds", value: 10, reason: "DB 시험 복원", by: null });
  for (const f of ["referral", "referral_signup_points", "referral_purchase_credits"]) await setFlag(f, false);
}

test("추천 가입 보상: 가입만으로는 주지 않고(무료 분석 전 · 계정 확인 전), 조건을 모두 채운 뒤에만 한 번 지급하며, 자기 초대 · 이미 구매한 회원은 거절한다", async () => {
  const { inviter, token } = await referralWorld();
  assert.deepEqual(await benefits.registerReferralSignup({ token, inviteeUserId: inviter.U.id, anonId: "anon-self-device" }), { ok: false, reason: "self" });
  // 분석 전 가입
  const invitee = await makeUser();
  const reg = await benefits.registerReferralSignup({ token, inviteeUserId: invitee.id, anonId: `anon-${invitee.id}` });
  assert.ok(reg.ok && !reg.already);
  assert.equal(await benefits.getPointBalance(inviter.U.id), 0, "가입만으로는 지급하지 않는다");
  assert.equal((await benefits.evaluateReferralSignup(invitee.id)).status, "no-analysis");
  await submitAssessment({ repo: server, saju: sajuEngine }, { userId: invitee.id, channel: "web", info, answers, today: new Date() });
  const done = await benefits.evaluateReferralSignup(invitee.id);
  assert.equal(done.status, "confirmed");
  assert.equal(await benefits.getPointBalance(inviter.U.id), 500);
  assert.equal((await benefits.evaluateReferralSignup(invitee.id)).status, "decided", "두 번 평가해도 한 번만");
  assert.equal(await benefits.getPointBalance(inviter.U.id), 500);
  // 이미 구매한 회원은 추천 가입으로 세지 않는다
  const buyer = await person();
  await buyAtList(buyer);
  const late = await benefits.registerReferralSignup({ token, inviteeUserId: buyer.U.id, anonId: "anon-buyer-device" });
  assert.deepEqual(late, { ok: false, reason: "not-new" });
  // 부정으로 회수하면 쓰지 않은 보상만 회수
  const rev = await benefits.revokeReferralSignup({ inviteeUserId: invitee.id, reason: "부정 가입", by: null });
  assert.equal(rev.ok, true);
  assert.equal(await benefits.getPointBalance(inviter.U.id), 0);
  await resetReferral();
});

test("추천 첫 구매: 6,900원은 첫 구매 한 번만 · 같은 링크로 동시에 시작해도 한 주문만 할인 · 결제가 확인되면 양쪽 질문권 1개씩 · 환불하면 쓰지 않은 질문권만 회수한다", async () => {
  const { inviter, token } = await referralWorld();
  const invitee = await person();
  const reg = await benefits.registerReferralSignup({ token, inviteeUserId: invitee.U.id, anonId: `anon-${invitee.U.id}` });
  assert.ok(reg.ok);
  await benefits.evaluateReferralSignup(invitee.U.id);
  const status = await benefits.referralDiscountStatus(invitee.U.id);
  assert.ok(status.ok && status.price === 6900);

  // 같은 사람이 결제 시작을 동시에 6번 눌러도 추천 가격 주문은 하나
  const plans = await Promise.all(Array.from({ length: 6 }, () => planCheckout(deps(), { userId: invitee.U.id, assessmentId: invitee.aid, choice: { kind: "referral" } })));
  assert.ok(plans.every((p) => p.kind === "plan"));
  const starts = await Promise.all(plans.map((p) => (p.kind === "plan" ? startCheckout({ repo: server, now: nowFn }, { userId: invitee.U.id, assessmentId: invitee.aid, plan: p.plan }) : null)));
  const referralOrders = starts.filter((s) => s?.kind === "order" && s.order.amount === 6900);
  assert.ok(referralOrders.length >= 1);
  assert.equal(psql(`select count(*) from public.orders where user_id = '${invitee.U.id}' and amount = 6900 and status = 'pending'`), "1", "결제 대기 추천 가격 주문은 하나만 남는다");
  const live = (await server.listOrdersForAssessment(invitee.aid)).find((o) => o.status === "pending" && o.amount === 6900)!;
  assert.equal(await benefits.getCreditBalance(inviter.U.id), 0, "결제 전에는 지급하지 않는다");
  const paid = await confirmPayment({ repo: server, gateway }, { userId: invitee.U.id, orderNumber: live.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: live.amount });
  assert.equal(paid.kind, "paid");
  assert.equal(await benefits.getCreditBalance(inviter.U.id), 1);
  assert.equal(await benefits.getCreditBalance(invitee.U.id), 1);
  assert.equal(psql(`select list_amount || ':' || discount_krw || ':' || discount_kind from public.orders where id = '${live.id}'`), "9900:3000:referral");
  // 이미 첫 구매를 했으니 다시는 추천 가격이 아니다
  const again = await benefits.referralDiscountStatus(invitee.U.id);
  assert.deepEqual(again, { ok: false, reason: "used" });

  // 추천인이 질문권을 이미 썼을 때 환불: 회수하지 못한 몫이 남고 음수 없음
  assert.equal((await benefits.spendCredit({ userId: inviter.U.id, ref: `chat-${inviter.U.id}` })).status, "spent");
  await server.updateOrder(live.id, ["paid"], { status: "refunded" });
  assert.equal(await benefits.getCreditBalance(inviter.U.id), 0);
  assert.equal(await benefits.getCreditBalance(invitee.U.id), 0, "쓰지 않은 친구의 질문권은 회수");
  const ledger = await benefits.listCreditLedger(inviter.U.id, 20);
  assert.ok(ledger.some((l) => l.shortfall > 0));
  const totals = await benefits.ledgerTotals(new Date(Date.now() - 86_400_000).toISOString());
  assert.equal(totals.lotMismatches, 0);
  await resetReferral();
});

test("혜택 지급이 실패해도 결제는 막히지 않는다: 주문 트리거 안의 오류는 benefit_failures에 남고 결제 확인은 그대로 끝난다", async () => {
  await setFlag("points_earn", true);
  const p = await person();
  const before = Number(psql("select count(*) from public.benefit_failures"));
  // 적립 경로를 일부러 깨뜨린다: 포인트 묶음 표 이름을 잠시 바꾼다(시험 DB 전용)
  psql("alter table public.point_lots rename to point_lots_tmp");
  try {
    const order = await buyAtList(p);
    assert.equal(psql(`select status from public.orders where id = '${order.id}'`), "paid", "결제는 그대로 완료");
  } finally {
    psql("alter table public.point_lots_tmp rename to point_lots");
  }
  assert.ok(Number(psql("select count(*) from public.benefit_failures")) > before, "실패는 기록으로 남는다");
  // 정기 점검이 누락된 적립을 메운다
  const m = await benefits.runMaintenance();
  assert.ok(m.earnedBackfill >= 1);
  assert.ok((await benefits.getPointBalance(p.U.id)) > 0);
  await setFlag("points_earn", false);
});

test("탈퇴: 남은 무상 혜택(포인트 · 질문권 · 추천 링크)은 끝나고, 결제 질문이 없으면 막지 않으며, 주문 · 혜택 주문 기록은 남는다", async () => {
  const p = await person();
  await benefits.grantPoints({ userId: p.U.id, amount: 400, sourceKind: "admin", sourceRef: "t", opKey: `w-${p.U.id}`, expiresAt: null });
  await benefits.grantCredit({ userId: p.U.id, kind: "promo", qty: 2, sourceRef: "t", opKey: `wc-${p.U.id}`, expiresAt: null });
  await benefits.ensureReferralLink({ userId: p.U.id, token: randomUUID().replace(/-/g, "").slice(0, 24) });
  const order = await buyAtList(p);
  const res = await admin.rpc("withdraw_member_data", { p_user_id: p.U.id });
  assert.ok(!res.error, JSON.stringify(res.error));
  assert.equal(psql(`select count(*) from public.point_lots where user_id = '${p.U.id}' and remaining > 0`), "0", "남은 포인트는 정리");
  assert.equal(psql(`select count(*) from public.credit_lots where user_id = '${p.U.id}' and remaining > 0`), "0", "남은 질문권은 정리");
  assert.equal(psql(`select count(*) from public.referral_links where user_id = '${p.U.id}'`), "0");
  assert.equal(psql(`select count(*) from public.orders where id = '${order.id}'`), "1", "주문 기록은 남는다");
  assert.equal(psql(`select count(*) from public.assessments where user_id = '${p.U.id}' and content_version <> 'withdrawn'`), "0", "주문이 있는 검사 결과는 내용을 비우고 껍데기만 남긴다");
});

test("설정은 함수로만 바뀌고 모든 변경이 이력으로 남으며, 브라우저는 설정을 바꿀 수 없다", async () => {
  const u = await makeUser();
  const before = (await benefits.listSettingHistory(5)).length;
  assert.equal(await benefits.setSetting({ key: "point.expire_days", value: 365, reason: "같은 값", by: null }), "unchanged");
  assert.equal(await benefits.setSetting({ key: "point.expire_days", value: 400, reason: "시험 변경", by: null }), "changed");
  const history = await benefits.listSettingHistory(5);
  assert.ok(history.length >= before);
  assert.equal(history[0].key, "point.expire_days");
  assert.equal(history[0].newValue, 400);
  await benefits.setSetting({ key: "point.expire_days", value: 365, reason: "시험 복원", by: null });
  const hack = await u.client.rpc("set_benefit_setting", { p_key: "feature.points_earn", p_value: true, p_reason: "x", p_by: null });
  assert.ok(hack.error);
  const direct = await u.client.from("benefit_settings").update({ value: true }).eq("key", "feature.points_earn");
  assert.ok(direct.error || (direct.data ?? []).length === 0);
  assert.equal((await benefits.getSettings())["feature.points_earn"], false);
  const overview = await getBenefitOverview(deps(), u.id);
  assert.equal(overview.ready, true);
});
