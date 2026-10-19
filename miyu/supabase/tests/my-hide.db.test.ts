// DB 검증: MY 목록에서 리포트 숨기기 / 다시 보이게 하기 (마이그레이션 27번).
// 실행 전 local-stack.sh start 필요. 실행: npm run test:db
// 확인하는 것: 본인 것만 바뀜 · 같은 요청을 여러 번(동시에도) 보내도 결과가 같음 · 숨기고 되돌려도 결과 · 리포트 · 주문 · 결제 기록 · 질문권 · 채팅 · 맛보기 · 동의 · 프로필이 한 글자도 바뀌지 않음 ·
// 브라우저(로그인 회원 · 비로그인)는 함수도 열도 직접 바꿀 수 없음 · 27번 전 DB에서는 숨기기 기능만 꺼지고 MY는 예전처럼 열림.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ASSESSMENT_MODULES } from "../../lib/assessment/modules/index.ts";
import { createOrderNumber } from "../../lib/commerce/order.ts";
import { createQuestionNonce, questionProductId, questionQuote } from "../../lib/commerce/cash.ts";
import { createSupabaseRepository } from "../../lib/integrations/supabase/repository.ts";
import { EMPTY_BASIC_INFO } from "../../lib/profile/basic-info.ts";
import { devReportGenerator } from "../../lib/report/generate-dev-report.ts";
import { manseryeokEngine as sajuEngine } from "../../lib/saju/manseryeok-engine.ts";
import { submitAssessment } from "../../lib/services/assessment-service.ts";
import { getMyPage, setReportHidden } from "../../lib/services/my-service.ts";
import { confirmPayment, startCheckout } from "../../lib/services/order-service.ts";
import { ensureReport, getResultView } from "../../lib/services/report-service.ts";
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
const anon = createClient(URL, ANON_KEY, noSession);
const server = createSupabaseRepository(admin);

const psql = (q: string) => execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres", "-q", "-c", q]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeUser(): Promise<{ id: string; client: SupabaseClient }> {
  const email = `hide-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, ANON_KEY, noSession);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, client };
}

const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i, n) => [i.id, (n % 5) + 1])));
const info = { ...EMPTY_BASIC_INFO, nickname: "숨김시험", birthYear: "1990", birthMonth: "1", birthDay: "15", birthTime: "09:30", gender: "female" as const };

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

/** 숨김과 무관한 모든 기록의 모습 — 숨기기 · 되돌리기 전후가 한 글자도 다르면 안 된다(숨김 열 자체는 뺀다) */
async function snapshot(userId: string) {
  const rows = async (table: string, column: string, value: string | string[]) => {
    const q = admin.from(table).select();
    const { data, error } = Array.isArray(value) ? await q.in(column, value) : await q.eq(column, value);
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? []).map((r: Record<string, unknown>) => {
      const { my_hidden_at: _hidden, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest;
    });
  };
  const orders = await rows("orders", "user_id", userId);
  const orderIds = orders.map((o) => o.id as string);
  const sort = (list: Record<string, unknown>[]) => list.map((r) => JSON.stringify(r)).sort();
  return {
    assessments: sort(await rows("assessments", "user_id", userId)),
    orders: sort(orders),
    reports: sort(await rows("reports", "user_id", userId)),
    payment_events: sort(orderIds.length ? await rows("payment_events", "order_id", orderIds) : []),
    talk_rooms: sort(await rows("talk_rooms", "user_id", userId)),
    chat_questions: sort(await rows("chat_questions", "user_id", userId)),
    taste_reports: sort(await rows("taste_reports", "user_id", userId)),
    cash_wallets: sort(await rows("cash_wallets", "user_id", userId)),
    cash_ledger: sort(await rows("cash_ledger", "user_id", userId)),
    question_packs: sort(await rows("question_packs", "user_id", userId)),
    user_consents: sort(await rows("user_consents", "user_id", userId)),
    profiles: sort(await rows("profiles", "id", userId)),
  };
}

let A: { id: string; client: SupabaseClient };
let B: { id: string; client: SupabaseClient };
let free: string; // A의 무료 결과 — 질문 묶음 · 대화 · 맛보기가 붙어 있다
let bought: string; // A의 구매한 결과 — 리포트가 있다
let boughtOrderNumber: string;

before(async () => {
  A = await makeUser();
  B = await makeUser();

  const savedFree = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: A.id, channel: "web", info, answers, today: new Date() });
  const savedBought = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: A.id, channel: "web", info: { ...info, nickname: "구매한결과" }, answers, today: new Date() });
  assert.ok(savedFree.ok && savedBought.ok);
  if (!savedFree.ok || !savedBought.ok) return;
  free = savedFree.assessment.id;
  bought = savedBought.assessment.id;

  // 구매한 결과: 결제 완료 + 리포트 완성
  const started = await startCheckout({ repo: server, now: () => new Date() }, { userId: A.id, assessmentId: bought });
  if (started.kind !== "order") throw new Error(started.kind);
  const paid = await confirmPayment({ repo: server, gateway }, { userId: A.id, orderNumber: started.order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error(paid.kind);
  boughtOrderNumber = started.order.orderNumber;
  const report = await ensureReport({ repo: server, generator: devReportGenerator, now: () => new Date() }, paid.order);
  assert.equal(report?.status, "ready");

  // 무료 결과에 붙은 것: 질문 묶음(결제 완료) · 채팅 대화 · 채팅 질문 횟수 · 맛보기 리포트(완성)
  const pack = await server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: A.id, assessmentId: free, productId: questionProductId(createQuestionNonce("love")), amount: questionQuote().priceKrw, paymentEnv: "test" });
  assert.ok(pack.ok);
  if (!pack.ok) return;
  const packPaid = await confirmPayment({ repo: server, gateway }, { userId: A.id, orderNumber: pack.value.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: pack.value.amount });
  assert.equal(packPaid.kind, "paid");
  await server.upsertTalkRoom({ assessmentId: free, userId: A.id, roomKey: "love", actions: [{ t: "topic", id: "love" }] });
  await server.addChatQuestion({ userId: A.id, assessmentId: free, roomKey: "love" });
  assert.deepEqual(await server.reserveTasteReport({ userId: A.id, assessmentId: free }), { state: "reserved" });
  await server.saveTasteReport({ userId: A.id, assessmentId: free, content: { marker: "숨김시험" }, generator: "test", generatorVersion: "0" });
});

after(async () => {
  await A?.client.auth.signOut();
  await B?.client.auth.signOut();
});

test("숨기기: 처음엔 아무것도 숨겨져 있지 않고, 열이 있으면 숨김 기능이 켜진다", async () => {
  assert.deepEqual(await server.listHiddenAssessmentIds(A.id), []);
  const page = await getMyPage(createSupabaseRepository(A.client), A.id);
  assert.equal(page.hideAvailable, true);
  assert.deepEqual(page.cards.map((c) => c.assessmentId).sort(), [free, bought].sort());
  assert.deepEqual(page.hiddenCards, []);
});

test("숨기기 · 되돌리기: 본인 것만, 같은 요청을 여러 번 보내도 같은 결과, 다른 모든 기록은 한 글자도 바뀌지 않는다", async () => {
  const before0 = await snapshot(A.id);
  const balance0 = await server.getCashBalance(A.id);
  assert.ok(balance0 > 0, "시작 상태: 결제해 둔 질문이 있다");

  // 두 번 눌러도 한 번만 바뀐다
  assert.equal(await server.setAssessmentMyHidden(A.id, free, true), "changed");
  assert.equal(await server.setAssessmentMyHidden(A.id, free, true), "unchanged");
  const stamp = (await admin.from("assessments").select("my_hidden_at").eq("id", free).single()).data?.my_hidden_at;
  assert.ok(stamp, "숨긴 시각이 남는다");
  assert.equal(await server.setAssessmentMyHidden(A.id, free, true), "unchanged");
  assert.equal((await admin.from("assessments").select("my_hidden_at").eq("id", free).single()).data?.my_hidden_at, stamp, "다시 눌러도 처음 숨긴 시각은 그대로");

  // 동시에 여러 번 보내도 한 번만 바뀐다
  const burst = await Promise.all(Array.from({ length: 8 }, () => server.setAssessmentMyHidden(A.id, bought, true)));
  assert.equal(burst.filter((r) => r === "changed").length, 1, JSON.stringify(burst));
  assert.equal(burst.filter((r) => r === "unchanged").length, 7);

  // 로그인 회원 본인의 화면 읽기(RLS)로 본다: 두 건 모두 숨김 목록에 있고, MY 목록에서는 빠진다
  const mine = createSupabaseRepository(A.client);
  assert.deepEqual((await mine.listHiddenAssessmentIds(A.id))?.sort(), [free, bought].sort());
  const hiddenPage = await getMyPage(mine, A.id);
  assert.deepEqual(hiddenPage.cards, []);
  assert.deepEqual(hiddenPage.hiddenCards.map((c) => c.assessmentId).sort(), [free, bought].sort());
  assert.equal(hiddenPage.hiddenCards.find((c) => c.assessmentId === free)?.entitlement, "free");
  assert.equal(hiddenPage.hiddenCards.find((c) => c.assessmentId === bought)?.entitlement, "purchased", "구매 여부는 그대로");
  assert.equal(hiddenPage.hiddenCards.find((c) => c.assessmentId === bought)?.generation, "ready");
  assert.equal(hiddenPage.hiddenCards.find((c) => c.assessmentId === bought)?.paidOrderNumber, boughtOrderNumber);
  assert.equal(hiddenPage.orders.length, before0.orders.length, "결제내역은 그대로");

  // 숨겨도 그대로인 것: 결과·리포트 열람 · 채팅방 · 맛보기 · 질문권
  const view = await getResultView(mine, { userId: A.id, assessmentId: bought });
  assert.equal(view?.report?.status, "ready", "구매한 리포트는 숨겨도 그대로 열린다");
  assert.ok(await getResultView(mine, { userId: A.id, assessmentId: free }), "무료 결과도 숨겨도 그대로 열린다");
  assert.equal((await server.getTalkRoom(free, "love"))?.actions.length, 1);
  assert.equal(await server.getCashBalance(A.id), balance0, "질문권은 그대로");
  const taste = await server.reserveTasteReport({ userId: A.id, assessmentId: free });
  assert.equal(taste.state, "ready", "맛보기는 다시 발급되지 않는다(이미 받은 글이 그대로)");
  assert.deepEqual(taste.state === "ready" ? taste.record.content : null, { marker: "숨김시험" });

  // 숨겨도 다른 모든 기록은 한 글자도 다르지 않다
  assert.deepEqual(await snapshot(A.id), before0);

  // 복원: 두 번 눌러도 한 번만 바뀐다
  assert.equal(await server.setAssessmentMyHidden(A.id, free, false), "changed");
  assert.equal(await server.setAssessmentMyHidden(A.id, free, false), "unchanged");
  const restoredBurst = await Promise.all(Array.from({ length: 8 }, () => server.setAssessmentMyHidden(A.id, bought, false)));
  assert.equal(restoredBurst.filter((r) => r === "changed").length, 1, JSON.stringify(restoredBurst));
  assert.deepEqual(await server.listHiddenAssessmentIds(A.id), []);
  const back = await getMyPage(mine, A.id);
  assert.deepEqual(back.cards.map((c) => c.assessmentId).sort(), [free, bought].sort());
  assert.deepEqual(back.hiddenCards, []);
  assert.deepEqual(await snapshot(A.id), before0, "되돌린 뒤에도 다른 기록은 그대로");
  assert.equal((await admin.from("assessments").select("my_hidden_at").eq("id", free).single()).data?.my_hidden_at, null);
});

test("소유자 확인: 남의 번호 · 없는 번호 · 형식이 틀린 번호는 아무것도 바꾸지 않고 서로 구분되지 않는다", async () => {
  const before0 = await snapshot(A.id);
  // B가 A의 결과 번호로 시도 — 서비스도, 저장 함수도 막는다
  assert.deepEqual(await setReportHidden(server, { userId: B.id, assessmentId: free, hidden: true }), { kind: "not-found" });
  assert.equal(await server.setAssessmentMyHidden(B.id, free, true), "not-found");
  assert.equal(await server.setAssessmentMyHidden(B.id, bought, false), "not-found");
  // 없는 번호 · uuid가 아닌 번호
  assert.deepEqual(await setReportHidden(server, { userId: A.id, assessmentId: randomUUID(), hidden: true }), { kind: "not-found" });
  assert.deepEqual(await setReportHidden(server, { userId: A.id, assessmentId: "not-a-uuid", hidden: true }), { kind: "not-found" });
  assert.equal(await server.setAssessmentMyHidden(A.id, "not-a-uuid", true), "not-found");
  // A의 번호가 B의 화면 읽기에 나타나지도 않는다
  assert.deepEqual(await createSupabaseRepository(B.client).listHiddenAssessmentIds(B.id), []);
  assert.deepEqual(await server.listHiddenAssessmentIds(A.id), []);
  assert.deepEqual(await snapshot(A.id), before0);

  // 서비스 흐름: 본인은 숨기고 되돌릴 수 있고 결과 종류가 구분된다
  assert.deepEqual(await setReportHidden(server, { userId: A.id, assessmentId: free, hidden: true }), { kind: "hidden" });
  assert.deepEqual(await setReportHidden(server, { userId: A.id, assessmentId: free, hidden: true }), { kind: "unchanged" });
  assert.deepEqual(await setReportHidden(server, { userId: A.id, assessmentId: free, hidden: false }), { kind: "restored" });
  assert.deepEqual(await snapshot(A.id), before0);
});

test("브라우저 권한: 로그인 회원도 비로그인도 숨김 함수를 부르거나 열을 직접 바꿀 수 없다 (새 쓰기 권한 없음)", async () => {
  const viaAnon = await anon.rpc("set_assessment_my_hidden", { p_user_id: A.id, p_assessment_id: free, p_hidden: true });
  assert.ok(viaAnon.error, "비로그인은 함수를 부를 수 없다");
  const viaMember = await A.client.rpc("set_assessment_my_hidden", { p_user_id: A.id, p_assessment_id: free, p_hidden: true });
  assert.ok(viaMember.error, "로그인 회원도 함수를 직접 부를 수 없다");
  const viaOther = await B.client.rpc("set_assessment_my_hidden", { p_user_id: A.id, p_assessment_id: free, p_hidden: true });
  assert.ok(viaOther.error, "다른 회원도 마찬가지");

  const update = await A.client.from("assessments").update({ my_hidden_at: new Date().toISOString() }).eq("id", free).select();
  assert.ok(update.error || (update.data ?? []).length === 0, "열을 직접 바꿀 수 없다");
  const anonUpdate = await anon.from("assessments").update({ my_hidden_at: new Date().toISOString() }).eq("id", free).select();
  assert.ok(anonUpdate.error || (anonUpdate.data ?? []).length === 0);
  assert.equal((await admin.from("assessments").select("my_hidden_at").eq("id", free).single()).data?.my_hidden_at, null, "아무것도 숨겨지지 않았다");

  // 읽기는 기존 규칙 그대로 — 본인 행의 열만 보이고 남의 행은 보이지 않는다
  assert.equal((await A.client.from("assessments").select("id, my_hidden_at").eq("id", free)).data?.length, 1);
  assert.deepEqual((await B.client.from("assessments").select("id, my_hidden_at").eq("id", free)).data, []);
});

test("탈퇴한 회원의 비워진 검사 결과는 숨김 대상이 아니다 (숨김은 탈퇴 표시와 별개)", async () => {
  const U = await makeUser();
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info, answers, today: new Date() });
  assert.ok(saved.ok);
  const id = saved.ok ? saved.assessment.id : "";
  assert.equal(await server.setAssessmentMyHidden(U.id, id, true), "changed");
  // 숨김은 탈퇴 표시(withdrawn_at)를 만들지 않는다
  assert.equal((await admin.from("assessments").select("withdrawn_at").eq("id", id).single()).data?.withdrawn_at, null);
  assert.equal((await admin.from("profiles").select("withdrawn_at").eq("id", U.id).single()).data?.withdrawn_at, null);
  // 탈퇴 처리된 검사 결과는 더 이상 바꾸지 않는다
  psql(`update public.assessments set withdrawn_at = now() where id = '${id}'`);
  assert.equal(await server.setAssessmentMyHidden(U.id, id, false), "not-found");
  await U.client.auth.signOut();
});

test("27번 전 DB(숨김 열 · 함수 없음): 숨기기만 꺼지고 MY는 모든 리포트를 예전처럼 보인다", async () => {
  psql("alter table public.assessments rename column my_hidden_at to my_hidden_at_off; notify pgrst, 'reload schema'");
  await sleep(800);
  try {
    assert.equal(await server.listHiddenAssessmentIds(A.id), null);
    const page = await getMyPage(createSupabaseRepository(A.client), A.id);
    assert.equal(page.hideAvailable, false);
    assert.deepEqual(page.cards.map((c) => c.assessmentId).sort(), [free, bought].sort());
    assert.deepEqual(page.hiddenCards, []);
    // 바꾸기는 "준비 중"으로 멈추고 아무 기록도 바뀌지 않는다
    await assert.rejects(server.setAssessmentMyHidden(A.id, free, true), (e: Error & { code?: string }) => e.code === "42P01");
    assert.deepEqual(await setReportHidden(server, { userId: A.id, assessmentId: free, hidden: true }), { kind: "db-not-ready" });
  } finally {
    psql("alter table public.assessments rename column my_hidden_at_off to my_hidden_at; notify pgrst, 'reload schema'");
    await sleep(800);
  }
  assert.deepEqual(await server.listHiddenAssessmentIds(A.id), []);
});
