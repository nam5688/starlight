// DB 검증: 접근 정책(RLS), 쓰기 차단, 상태 규칙 트리거, 실제 DB 위에서의 서비스 흐름.
// 실행 전 local-stack.sh start 필요. 실행: npm run test:db
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ASSESSMENT_MODULES } from "../../lib/assessment/modules/index.ts";
import { createSupabaseRepository } from "../../lib/integrations/supabase/repository.ts";
import { EMPTY_BASIC_INFO } from "../../lib/profile/basic-info.ts";
import { devReportGenerator } from "../../lib/report/generate-dev-report.ts";
import { manseryeokEngine as sajuEngine } from "../../lib/saju/manseryeok-engine.ts";
import { submitAssessment } from "../../lib/services/assessment-service.ts";
import { agreeToTerms, getMemberStatus, setMarketingConsent } from "../../lib/services/member-service.ts";
import { confirmPayment, startCheckout } from "../../lib/services/order-service.ts";
import type { PaymentGateway } from "../../lib/services/ports.ts";
import { ensureReport, getResultView } from "../../lib/services/report-service.ts";

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

async function makeUser(): Promise<{ id: string; client: SupabaseClient }> {
  const email = `u-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, ANON_KEY, noSession);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, client };
}

const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i, n) => [i.id, (n % 5) + 1])));
const info = { ...EMPTY_BASIC_INFO, nickname: "테스트", birthYear: "1990", birthMonth: "1", birthDay: "15", birthTime: "09:30" };

const gateway: PaymentGateway = {
  provider: "tosspayments",
  async confirm({ paymentKey, orderId, amount }) {
    return { ok: true, payment: { paymentKey, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: new Date().toISOString() } };
  },
  async getPayment() {
    return { ok: false, code: "NOT_FOUND_PAYMENT", message: "", retryable: false };
  },
};

let A: { id: string; client: SupabaseClient };
let B: { id: string; client: SupabaseClient };
let assessmentId: string;
let orderId: string;

before(async () => {
  A = await makeUser();
  B = await makeUser();
});
after(async () => {
  await A?.client.auth.signOut();
  await B?.client.auth.signOut();
});

test("가입하면 프로필과 결제용 구매자 키가 자동으로 생긴다", async () => {
  const { data } = await A.client.from("profiles").select("id, payment_customer_key").single();
  assert.equal(data?.id, A.id);
  assert.match(data?.payment_customer_key, /^[0-9a-f-]{36}$/);
});

test("서비스 흐름이 실제 DB에서 동작한다: 저장 → 주문 → 승인 → 리포트", async () => {
  const repo = createSupabaseRepository(admin);
  const saved = await submitAssessment({ repo, saju: sajuEngine }, { userId: A.id, channel: "web", info, answers, today: new Date() });
  assert.ok(saved.ok);
  if (!saved.ok) return;
  assessmentId = saved.assessment.id;
  assert.equal(saved.assessment.birthTime, "09:30");

  const started = await startCheckout({ repo, now: () => new Date() }, { userId: A.id, assessmentId });
  assert.equal(started.kind, "order");
  if (started.kind !== "order") return;
  orderId = started.order.id;

  // 다시 누르면 이전 대기 주문은 취소되고 새 주문이 생긴다 (대기 주문은 하나만)
  const again = await startCheckout({ repo, now: () => new Date() }, { userId: A.id, assessmentId });
  if (again.kind !== "order") throw new Error();
  orderId = again.order.id;

  const paid = await confirmPayment({ repo, gateway }, { userId: A.id, orderNumber: again.order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: again.order.amount });
  assert.equal(paid.kind, "paid");
  if (paid.kind !== "paid") return;

  const report = await ensureReport({ repo, generator: devReportGenerator, now: () => new Date() }, paid.order);
  assert.equal(report?.status, "ready");
  const again2 = await ensureReport({ repo, generator: devReportGenerator, now: () => new Date() }, paid.order);
  assert.equal(again2?.readyAt, report?.readyAt, "다시 생성하지 않는다");
});

test("접근 정책: 본인 결과만 조회된다", async () => {
  const mine = await getResultView(createSupabaseRepository(A.client), { userId: A.id, assessmentId });
  assert.equal(mine?.report?.status, "ready");

  // B는 A의 결과 주소를 알아도 조회되지 않는다
  assert.equal(await getResultView(createSupabaseRepository(B.client), { userId: B.id, assessmentId }), null);
  const direct = await B.client.from("assessments").select().eq("id", assessmentId);
  assert.deepEqual(direct.data, []);
  const reports = await B.client.from("reports").select().eq("assessment_id", assessmentId);
  assert.deepEqual(reports.data, []);

  const anonymous = await anon.from("assessments").select();
  assert.ok(anonymous.error || anonymous.data?.length === 0);
});

test("접근 정책: 로그인한 사용자도 직접 쓰기는 거부된다", async () => {
  const insert = await A.client.from("assessments").insert({ user_id: A.id, nickname: "x" });
  assert.ok(insert.error, "검사 결과 직접 저장 거부");
  const update = await A.client.from("orders").update({ status: "refunded" }).eq("id", orderId).select();
  assert.ok(update.error || update.data?.length === 0, "주문 상태 직접 변경 거부");
  const events = await A.client.from("payment_events").select();
  assert.ok(events.error || events.data?.length === 0, "결제 기록 조회 거부");
  const { data: order } = await admin.from("orders").select("status").eq("id", orderId).single();
  assert.equal(order?.status, "paid");
});

test("트리거: 허용되지 않는 주문 상태 변경과 금액 변경을 막는다", async () => {
  const back = await admin.from("orders").update({ status: "pending" }).eq("id", orderId);
  assert.match(back.error?.message ?? "", /invalid order status change/);
  const amount = await admin.from("orders").update({ amount: 1 }).eq("id", orderId);
  assert.match(amount.error?.message ?? "", /immutable/);
});

test("고유 조건: 같은 검사에 결제 완료 주문은 하나만", async () => {
  const { data: other } = await admin
    .from("orders")
    .insert({ order_number: `MEU-TEST-${Date.now()}`, user_id: A.id, assessment_id: assessmentId, product_id: "personal-integrated-report", amount: 9900 })
    .select()
    .single();
  const dup = await admin.from("orders").update({ status: "paid" }).eq("id", other.id);
  assert.equal(dup.error?.code, "23505");
});

test("트리거: 완성된 리포트는 바꿀 수 없다", async () => {
  const change = await admin.from("reports").update({ content: { tampered: true } }).eq("order_id", orderId);
  assert.match(change.error?.message ?? "", /immutable/);
});

test("가입 동의: 서버가 기록하고, 본인 기록만 보이며, 고치거나 직접 쓸 수 없다", async () => {
  const repo = createSupabaseRepository(admin);
  assert.deepEqual(await getMemberStatus(repo, A.id), { needsConsent: true, isNew: true, marketing: false });

  const refused = await agreeToTerms(repo, A.id, { age_14: true, terms: true });
  assert.equal(refused.ok, false, "필수 항목이 빠지면 기록하지 않는다");
  assert.ok((await getMemberStatus(repo, A.id)).isNew);

  assert.deepEqual(await agreeToTerms(repo, A.id, { age_14: true, terms: true, privacy: true }), { ok: true });
  await setMarketingConsent(repo, A.id, true);
  assert.deepEqual(await getMemberStatus(createSupabaseRepository(A.client), A.id), { needsConsent: false, isNew: false, marketing: true });

  const others = await B.client.from("user_consents").select().eq("user_id", A.id);
  assert.deepEqual(others.data, [], "다른 회원의 동의 기록은 보이지 않는다");
  assert.equal((await getMemberStatus(createSupabaseRepository(B.client), B.id)).needsConsent, true);

  const forged = await B.client.from("user_consents").insert({ user_id: B.id, consent_type: "terms", version: "x", agreed: true });
  assert.ok(forged.error, "브라우저에서 직접 동의 기록을 만들 수 없다");

  const edit = await admin.from("user_consents").update({ agreed: false }).eq("user_id", A.id);
  assert.match(edit.error?.message ?? "", /append-only|permission denied/, "서버도 동의 기록을 고칠 수 없다");
});

test("프로필 누락 보완: 테이블보다 먼저 가입한 회원도 로그인 · 결제 때 프로필이 채워지고, 다른 데이터는 그대로다", async () => {
  const C = await makeUser();
  // 가입 트리거가 없던 시절을 흉내 낸다: 프로필만 지운다 (서버 비밀키에는 삭제 권한이 없으므로 DB 관리자로)
  execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres", "-qc", `delete from public.profiles where id = '${C.id}'`]);
  const repo = createSupabaseRepository(admin);
  assert.equal(await repo.getProfile(C.id), null);
  const restored = await repo.ensureProfile(C.id);
  assert.equal(restored.userId, C.id);
  assert.match(restored.paymentCustomerKey, /^[0-9a-f-]{36}$/);
  // 다시 불러도 같은 프로필 (구매자 키가 바뀌지 않는다)
  assert.equal((await repo.ensureProfile(C.id)).paymentCustomerKey, restored.paymentCustomerKey);
  // 다른 회원(A)의 프로필 · 주문은 바뀌지 않는다
  const { data: aOrder } = await admin.from("orders").select("status").eq("id", orderId).single();
  assert.equal(aOrder?.status, "paid");
  await C.client.auth.signOut();
});
