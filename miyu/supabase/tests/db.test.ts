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
import { cashProductId, concernProductId, MIYU_CASH } from "../../lib/config/product.ts";
import { createQuestionNonce, questionProductId, questionQuote, questionRoomOf } from "../../lib/commerce/cash.ts";
import { createOrderNumber } from "../../lib/commerce/order.ts";
import { concernInputOf } from "../../lib/personalization/concern.ts";
import { createAiReportGenerator } from "../../lib/report/ai/generator.ts";
import { createMockModel } from "../../lib/report/ai/mock-model.ts";
import { isConcernReport } from "../../lib/report/concern/types.ts";
import { devReportGenerator } from "../../lib/report/generate-dev-report.ts";
import { manseryeokEngine as sajuEngine } from "../../lib/saju/manseryeok-engine.ts";
import { submitAssessment } from "../../lib/services/assessment-service.ts";
import { agreeToTerms, getMemberStatus, setMarketingConsent } from "../../lib/services/member-service.ts";
import { confirmPayment, startCheckout } from "../../lib/services/order-service.ts";
import { reconcileOrder } from "../../lib/services/reconcile-service.ts";
import { createFakeToss } from "../../lib/services/testing/fake-toss.ts";
import { queueReport, runReport } from "../../lib/services/report-service.ts";
import type { PaymentGateway } from "../../lib/services/ports.ts";
import { ensureReport, getResultView } from "../../lib/services/report-service.ts";
import { kakaoOAuthOptions } from "../../server/kakao-options.ts";
import { getConcernWorkspace, startConcernCheckout } from "../../lib/services/concern-service.ts";
import { deleteContext, getContextView, saveContext } from "../../lib/services/context-service.ts";
import { buildTalkModel } from "../../lib/report/reading/talk.ts";
import { sampleReadingReport } from "../../lib/samples/sample-reading-report.ts";
import { SAMPLE_CHART } from "../../lib/samples/sample-report.ts";
import { closeRoom, deleteAllSummaries, listSavedSummaries, memoryFor, saveRoomSummary } from "../../lib/services/summary-service.ts";

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
const info = { ...EMPTY_BASIC_INFO, nickname: "테스트", birthYear: "1990", birthMonth: "1", birthDay: "15", birthTime: "09:30", gender: "female" as const };

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

test("고유 조건: 같은 결과로 다시 받는 주문(…:r2)은 따로 결제 완료될 수 있고, 같은 번째 안에서만 하나로 막힌다 (한 사람이 리포트를 여러 번 받는다)", async () => {
  const stamp = Date.now();
  const insert = (n: string, productId: string) =>
    admin.from("orders").insert({ order_number: `MEU-REPEAT-${n}-${stamp}`, user_id: A.id, assessment_id: assessmentId, product_id: productId, amount: 9900 }).select().single();
  const r2 = await insert("a", "personal-integrated-report:r2");
  assert.ok(r2.data, "두 번째 받기 주문을 만들 수 있다");
  const paid2 = await admin.from("orders").update({ status: "paid" }).eq("id", r2.data.id);
  assert.equal(paid2.error, null, "첫 구매가 결제 완료여도 두 번째 번째는 결제 완료될 수 있다");
  const r2b = await insert("b", "personal-integrated-report:r2");
  assert.ok(r2b.data);
  const dup = await admin.from("orders").update({ status: "paid" }).eq("id", r2b.data.id);
  assert.equal(dup.error?.code, "23505", "같은 번째에 결제 완료는 하나만");
  // 본인 주문만 보인다
  const mine = await A.client.from("orders").select("product_id").eq("assessment_id", assessmentId);
  assert.ok((mine.data ?? []).some((o) => o.product_id === "personal-integrated-report:r2"));
  const others = await B.client.from("orders").select("id").eq("assessment_id", assessmentId);
  assert.equal(others.data?.length ?? 0, 0, "다른 회원은 볼 수 없다");
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

test("내 고민 자세히 알려주기: 서버가 소유자를 확인해 저장 · 삭제하고, 본인만 보며, 다른 회원 결과에는 붙지 않는다", async () => {
  const server = createSupabaseRepository(admin);
  const saved = await saveContext(server, { userId: A.id, assessmentId, raw: { topic: "work", question: "이직해도 될까요", excerpt: "연락처 010-1111-2222" }, agreed: true, now: () => new Date() });
  assert.equal(saved.kind, "saved");
  if (saved.kind !== "saved") return;
  assert.equal(saved.context.excerpt, "연락처 [연락처 가림]");

  const mine = await getContextView(createSupabaseRepository(A.client), { userId: A.id, assessmentId });
  assert.equal(mine?.context?.question, "이직해도 될까요");
  assert.equal(mine?.reportStatus, "ready");
  const others = await B.client.from("personal_contexts").select().eq("assessment_id", assessmentId);
  assert.deepEqual(others.data, [], "다른 회원에게는 보이지 않는다");
  const anonymous = await anon.from("personal_contexts").select();
  assert.ok(anonymous.error || anonymous.data?.length === 0);

  const direct = await A.client.from("personal_contexts").update({ question: "x" }).eq("assessment_id", assessmentId).select();
  assert.ok(direct.error || direct.data?.length === 0, "브라우저에서 직접 고칠 수 없다");
  const forged = await admin.from("personal_contexts").upsert({ assessment_id: assessmentId, user_id: B.id, topic: "love", agreed_at: new Date().toISOString() });
  assert.match(forged.error?.message ?? "", /owner mismatch/, "서버 코드 실수로도 다른 회원의 결과에 붙지 않는다");
  const tooLong = await admin.from("personal_contexts").update({ excerpt: "가".repeat(1501) }).eq("assessment_id", assessmentId);
  assert.ok(tooLong.error, "글자 수 제한은 DB에서도 지킨다");

  const edited = await saveContext(server, { userId: A.id, assessmentId, raw: { topic: "marriage" }, agreed: true, now: () => new Date() });
  assert.ok(edited.kind === "saved" && edited.context.question === "" && edited.context.topic === "marriage");
  assert.equal(await deleteContext(server, { userId: B.id, assessmentId }), false);
  assert.equal(await deleteContext(server, { userId: A.id, assessmentId }), true);
  assert.equal(await server.getContext(assessmentId), null);
});

test("고민 기록(11번 마이그레이션): 서버가 저장하고 본인만 보며, 고치지 못하고 내용 지우기만 되며, 같은 저장본은 하나뿐이고 발급 주문은 기록마다 하나다", async () => {
  const U = await makeUser(); // 이 시험 전용 회원 · 검사 · 주문 (다른 시험의 집계에 섞이지 않게)
  const V = await makeUser();
  const server = createSupabaseRepository(admin);
  const now = () => new Date();
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "고민기록" }, answers, today: new Date() });
  assert.ok(saved.ok);
  const aid = saved.ok ? saved.assessment.id : "";

  // 개인 통합 리포트를 먼저 산다 (기존 구매자 전용)
  const buy = await startCheckout({ repo: server, now }, { userId: U.id, assessmentId: aid });
  if (buy.kind !== "order") throw new Error();
  const buyPaid = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: buy.order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: buy.order.amount });
  if (buyPaid.kind !== "paid") throw new Error();
  const baseReport = await ensureReport({ repo: server, generator: devReportGenerator, now }, buyPaid.order);
  assert.equal(baseReport?.status, "ready");
  const baseJson = JSON.stringify(baseReport?.content);

  const work = { topic: "work", question: "지금 다니는 회사를 계속 다닐지 이직을 준비할지 결정을 못 하고 있어요.", situation: "새로운 제안이 오면 처음엔 끌리다가 연봉 협상 이야기가 나오면 계속 미루게 돼요. 팀장님 앞에서는 말이 잘 안 나와요." };
  const first = await saveContext(server, { userId: U.id, assessmentId: aid, raw: work, agreed: true, now });
  assert.equal(first.kind, "saved");
  const gen = createAiReportGenerator({ model: createMockModel(), now: () => new Date(), sleep: async () => {} });

  // 1) 저장은 기록 · 주문을 만들지 않는다. 발급을 시작하면 그 순간의 고민이 기록으로 남고 4,900원 별도 주문이 생긴다 (더블 클릭은 한 건)
  assert.deepEqual(await server.listConcernRecords(aid), []);
  const issuing = { enabled: true } as const;
  const [s1, s2] = await Promise.all([startConcernCheckout({ repo: server, now, issuing }, { userId: U.id, assessmentId: aid }), startConcernCheckout({ repo: server, now, issuing }, { userId: U.id, assessmentId: aid })]);
  if (s1.kind !== "order" || s2.kind !== "order") throw new Error(`${s1.kind}/${s2.kind}`);
  assert.equal(s1.record.id, s2.record.id, "같은 저장본에는 기록이 하나");
  assert.equal(s1.order.orderNumber, s2.order.orderNumber, "동시에 눌러도 대기 주문은 하나");
  assert.equal(s1.order.amount, 4900);
  assert.equal(s1.order.productId, concernProductId(s1.record.id));
  assert.equal((await server.listConcernRecords(aid)).length, 1);
  const record = s1.record;

  // 2) 접근 정책: 본인만 조회, 브라우저 직접 쓰기 거부, 다른 회원 결과에는 붙지 않는다
  assert.equal((await createSupabaseRepository(U.client).listConcernRecords(aid)).length, 1);
  assert.deepEqual(await createSupabaseRepository(V.client).listConcernRecords(aid), []);
  assert.equal(await createSupabaseRepository(V.client).getConcernRecord(record.id), null);
  const anonymous = await anon.from("concern_records").select();
  assert.ok(anonymous.error || anonymous.data?.length === 0);
  const direct = await U.client.from("concern_records").update({ scrubbed_at: new Date().toISOString() }).eq("id", record.id).select();
  assert.ok(direct.error || direct.data?.length === 0, "브라우저에서 직접 고칠 수 없다");
  const directInsert = await U.client.from("concern_records").insert({ assessment_id: aid, user_id: U.id, topic: "love", written_at: new Date().toISOString(), agreed_at: new Date().toISOString() });
  assert.ok(directInsert.error, "브라우저에서 직접 만들 수 없다");
  const directDelete = await U.client.from("concern_records").delete().eq("id", record.id).select();
  assert.ok(directDelete.error || directDelete.data?.length === 0, "브라우저에서 직접 지울 수 없다");
  const forged = await admin.from("concern_records").insert({ assessment_id: aid, user_id: V.id, topic: "love", written_at: new Date().toISOString(), agreed_at: new Date().toISOString() });
  assert.match(forged.error?.message ?? "", /owner mismatch/, "서버 코드 실수로도 다른 회원의 결과에 붙지 않는다");
  const tooLong = await admin.from("concern_records").insert({ assessment_id: aid, user_id: U.id, topic: "love", question: "가".repeat(301), written_at: new Date().toISOString(), agreed_at: new Date().toISOString() });
  assert.ok(tooLong.error, "글자 수 제한은 DB에서도 지킨다");

  // 3) 기록은 고치지 않는다 — 허용되는 것은 내용 지우기뿐
  for (const patch of [{ topic: "love" }, { question: "바꾼 내용" }, { written_at: new Date().toISOString() }, { agreed_at: new Date().toISOString() }, { user_id: V.id }]) {
    const r = await admin.from("concern_records").update(patch).eq("id", record.id).select();
    assert.match(r.error?.message ?? "", /immutable|owner mismatch|violates/, `고칠 수 없다: ${JSON.stringify(patch)}`);
  }
  const halfScrub = await admin.from("concern_records").update({ scrubbed_at: new Date().toISOString() }).eq("id", record.id);
  assert.ok(halfScrub.error, "글을 비우지 않고 지운 것으로 표시할 수 없다");
  const stillThere = await server.getConcernRecord(record.id);
  assert.equal(stillThere?.question, work.question);
  assert.equal(stillThere?.scrubbedAt, null);

  // 4) 결제 → 리포트: 기존 개인 통합 리포트는 그대로, 고민 리포트는 별도 건
  const paid = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: s1.order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: s1.order.amount });
  if (paid.kind !== "paid") throw new Error();
  const made = await ensureReport({ repo: server, generator: gen, now }, paid.order);
  assert.equal(made?.status, "ready");
  assert.ok(made?.content && isConcernReport(made.content));
  assert.equal(made.content.basis.concern.recordId, record.id);
  assert.equal(made.content.basis.concern.writtenAt, record.writtenAt);
  assert.notEqual(made.id, baseReport?.id);
  assert.equal(JSON.stringify((await server.getReportByOrder(buyPaid.order.id))?.content), baseJson, "기존 리포트는 덮어쓰지 않는다");
  assert.deepEqual((await getConcernWorkspace(createSupabaseRepository(U.client), { userId: U.id, assessmentId: aid, issuing }))?.issue, { kind: "issued", recordId: record.id, generation: "ready" });

  // 5) 고민을 고치면 새 저장본 → 별도 기록 · 별도 주문 (과거 기록은 그대로)
  await saveContext(server, { userId: U.id, assessmentId: aid, raw: { ...work, situation: `${work.situation} 퇴근 후에도 생각이 나요.` }, agreed: true, now });
  const next = await startConcernCheckout({ repo: server, now, issuing }, { userId: U.id, assessmentId: aid });
  if (next.kind !== "order") throw new Error(next.kind);
  assert.notEqual(next.record.id, record.id);
  assert.notEqual(next.order.productId, s1.order.productId);
  assert.equal((await server.getConcernRecord(record.id))?.situation, work.situation, "과거 기록은 그대로");
  // 같은 기록에 대기 주문을 하나 더 직접 넣으면 DB 고유 조건이 막는다
  const dup = await admin.from("orders").insert({ order_number: `ORD-DUP-${randomUUID().slice(0, 8)}`, user_id: U.id, assessment_id: aid, product_id: next.order.productId, amount: 4900, payment_env: "test" });
  assert.equal(dup.error?.code, "23505");

  // 6) 내용 지우기: 글만 비우고 기록 자리 · 주제 · 작성 시점 · 리포트는 남는다. 이미 지웠으면 그대로
  await server.scrubConcernRecord(record.id, new Date().toISOString());
  const scrubbed = await server.getConcernRecord(record.id);
  assert.ok(scrubbed?.scrubbedAt);
  assert.equal(scrubbed?.question, "");
  assert.equal(scrubbed?.situation, "");
  assert.equal(scrubbed?.topic, "work");
  assert.equal(scrubbed?.writtenAt, record.writtenAt);
  await server.scrubConcernRecord(record.id, new Date().toISOString()); // 두 번째는 아무 일도 없다
  const reScrub = await admin.from("concern_records").update({ question: "다시 쓰기" }).eq("id", record.id);
  assert.ok(reScrub.error, "지운 기록에는 다시 쓸 수 없다");
  assert.ok((await server.getReportByOrder(paid.order.id))?.content, "리포트는 남는다");
  // 지운 기록은 같은 작성 시점의 새 기록을 막지 않는다 (부분 고유 조건)
  const reinsert = await server.insertConcernRecord({ ...concernInputOf({ topic: "work", question: "다시", situation: "", matched: "", differed: "", excerpt: "" }), userId: U.id, assessmentId: aid, writtenAt: record.writtenAt, agreedAt: record.agreedAt });
  assert.equal(reinsert.ok, true);
  const dupVersion = await server.insertConcernRecord({ ...concernInputOf({ topic: "work", question: "또", situation: "", matched: "", differed: "", excerpt: "" }), userId: U.id, assessmentId: aid, writtenAt: record.writtenAt, agreedAt: record.agreedAt });
  assert.deepEqual(dupVersion, { ok: false, reason: "conflict" });

  // 7) 요약 목록에는 적은 내용이 없다
  const summaries = await server.listConcernRecordSummaries(U.id);
  assert.ok(summaries.length >= 3);
  assert.ok(summaries.every((x) => !("question" in x)));
  await U.client.auth.signOut();
  await V.client.auth.signOut();
});

test("고민 기록 테이블이 없어도(11번 적용 전) 기존 화면 · 결제는 그대로 동작하고, 발급만 '준비 중'으로 막힌다", async () => {
  const U = await makeUser();
  const server = createSupabaseRepository(admin);
  const now = () => new Date();
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "표없음" }, answers, today: new Date() });
  assert.ok(saved.ok);
  const aid = saved.ok ? saved.assessment.id : "";
  const buy = await startCheckout({ repo: server, now }, { userId: U.id, assessmentId: aid });
  if (buy.kind !== "order") throw new Error();
  const paid = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: buy.order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: buy.order.amount });
  if (paid.kind !== "paid") throw new Error();
  assert.equal((await ensureReport({ repo: server, generator: devReportGenerator, now }, paid.order))?.status, "ready");
  await saveContext(server, { userId: U.id, assessmentId: aid, raw: { topic: "work", question: "이직할까요", situation: "연봉 이야기를 미뤄요" }, agreed: true, now });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const psql = (q: string) => execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres", "-q", "-c", q]);
  psql("alter table public.concern_records rename to concern_records_hidden; notify pgrst, 'reload schema'");
  await sleep(800);
  try {
    assert.deepEqual(await server.listConcernRecords(aid), []);
    assert.equal(await server.getConcernRecord(randomUUID()), null);
    assert.deepEqual(await server.listConcernRecordSummaries(U.id), []);
    await server.scrubConcernRecord(randomUUID(), new Date().toISOString()); // 오류 없이 지나간다
    // 고민 저장 · 지우기도 그대로 된다 (임시 저장본 정리가 표가 없어도 막지 않는다)
    const edited = await saveContext(server, { userId: U.id, assessmentId: aid, raw: { topic: "work", question: "이직할까요", situation: "연봉 이야기를 계속 미뤄요" }, agreed: true, now });
    assert.equal(edited.kind, "saved");
    const issuing = { enabled: true } as const;
    const ws = await getConcernWorkspace(createSupabaseRepository(U.client), { userId: U.id, assessmentId: aid, issuing });
    assert.deepEqual(ws?.issue, { kind: "can-issue", priceKrw: 4900 });
    assert.deepEqual(ws?.entries, []);
    const started = await startConcernCheckout({ repo: server, now, issuing }, { userId: U.id, assessmentId: aid });
    assert.deepEqual(started, { kind: "unavailable", reason: "not-ready" }, "표가 없으면 주문도 만들지 않는다");
    const orders = await server.listOrdersForAssessment(aid);
    assert.equal(orders.length, 1, "개인 통합 주문만 있다");
    assert.equal((await getResultView(createSupabaseRepository(U.client), { userId: U.id, assessmentId: aid }))?.report?.status, "ready");
    assert.equal(await deleteContext(server, { userId: U.id, assessmentId: aid }), true);
  } finally {
    psql("alter table public.concern_records_hidden rename to concern_records; notify pgrst, 'reload schema'");
    await sleep(800);
  }
  assert.deepEqual(await server.listConcernRecords(aid), []);
  await U.client.auth.signOut();
});

test("카카오 로그인: 실제 Supabase Auth를 거쳐 카카오로 가는 요청에 이메일 동의가 없다 (KOE205 회귀 방지)", async () => {
  const kakaoScope = async (options: Record<string, unknown>) => {
    const c = createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, flowType: "pkce" } });
    const { data, error } = await c.auth.signInWithOAuth({ provider: "kakao", options: { skipBrowserRedirect: true, redirectTo: "http://127.0.0.1:4321/auth/callback", ...options } });
    if (error) throw error;
    const res = await fetch(data.url!, { redirect: "manual" });
    return new globalThis.URL(res.headers.get("location")!).searchParams.get("scope") ?? "";
  };
  // 미유가 쓰는 방식: 닉네임 · 프로필 사진만
  assert.equal(await kakaoScope(kakaoOAuthOptions("http://127.0.0.1:4321", "/my")), "profile_nickname profile_image");
  // 기본값과 scopes 방식은 account_email이 남는다 (그래서 쓰지 않는다)
  assert.match(await kakaoScope({}), /account_email/);
  assert.match(await kakaoScope({ scopes: "profile_nickname profile_image" }), /account_email/);
});


test("운영 기록(ops_events): 서버만 쓰고 읽으며, 로그인 사용자 · 비로그인은 접근할 수 없고, 고치거나 지울 수 없다", async () => {
  const repo = createSupabaseRepository(admin);
  const key = `t-${randomUUID()}`;
  const errorId = "ERR-TESTAB23";
  await repo.addOpsEvent({ kind: "test.event", severity: "warn", orderNumber: "MEU-TEST-OPS", errorId, dedupeKey: key, message: "테스트 기록", detail: { a: 1 } });
  assert.equal(await repo.hasOpsEventSince(key, new Date(Date.now() - 60_000).toISOString()), true);
  assert.equal(await repo.hasOpsEventSince(key, new Date(Date.now() + 60_000).toISOString()), false);
  const byError = await repo.listOpsEvents({ errorId, limit: 5 });
  assert.equal(byError[0]?.message, "테스트 기록");
  assert.equal(byError[0]?.severity, "warn");
  assert.equal((await repo.listOpsEvents({ orderNumber: "MEU-TEST-OPS", limit: 5 })).length >= 1, true);

  for (const client of [A.client, anon]) {
    const read = await client.from("ops_events").select();
    assert.ok(read.error || read.data?.length === 0, "읽기 거부");
    const write = await client.from("ops_events").insert({ kind: "x", message: "x" });
    assert.ok(write.error, "쓰기 거부");
  }
  const update = await admin.from("ops_events").update({ message: "바꿈" }).eq("dedupe_key", key);
  assert.ok(update.error, "고치기 거부");
  const del = await admin.from("ops_events").delete().eq("dedupe_key", key);
  assert.ok(del.error, "지우기 거부");
  assert.equal((await repo.listOpsEvents({ errorId, limit: 5 }))[0]?.message, "테스트 기록");
});

test("결제 기록의 출처: 재확인(reconcile) · 관리자(admin)는 허용되고 알 수 없는 출처는 거부된다", async () => {
  const repo = createSupabaseRepository(admin);
  await repo.addPaymentEvent({ orderId, source: "reconcile", status: "DONE", detail: {} });
  await repo.addPaymentEvent({ orderId, source: "admin", status: "DONE", detail: {} });
  const bad = await admin.from("payment_events").insert({ order_id: orderId, source: "bogus", status: "DONE", detail: {} });
  assert.ok(bad.error, "알 수 없는 출처 거부");
});

async function newPendingOrder(userId: string) {
  const repo = createSupabaseRepository(admin);
  const saved = await submitAssessment({ repo, saju: sajuEngine }, { userId, channel: "web", info, answers, today: new Date() });
  if (!saved.ok) throw new Error("save");
  const started = await startCheckout({ repo, now: () => new Date() }, { userId, assessmentId: saved.assessment.id });
  if (started.kind !== "order") throw new Error("order");
  return { repo, order: started.order, assessmentId: saved.assessment.id };
}

test("실제 DB 동시성: 같은 승인 요청이 6번 동시에 와도 결제 완료 1건 · 결제사 기록 1건 · 리포트 1건, 생성기는 한 번만 실행", async () => {
  const toss = createFakeToss();
  const { repo, order } = await newPendingOrder(B.id);
  const input = { userId: B.id, orderNumber: order.orderNumber, paymentKey: `pk-race-${randomUUID()}`, amount: order.amount };
  const results = await Promise.all(Array.from({ length: 6 }, () => confirmPayment({ repo, gateway: toss.gateway }, input)));
  assert.ok(results.every((r) => r.kind === "paid"), JSON.stringify(results.map((r) => (r.kind === "rejected" ? `${r.code}:${r.message}` : r.kind))));
  assert.equal(toss.byKey.size, 1);
  const rows = await admin.from("orders").select("id, status").eq("order_number", order.orderNumber);
  assert.equal(rows.data?.length, 1);
  assert.equal(rows.data?.[0]?.status, "paid");

  const paid = (await repo.getOrderByNumber(order.orderNumber))!;
  let generated = 0;
  const generator = { ...devReportGenerator, async generate(i: Parameters<typeof devReportGenerator.generate>[0]) { generated++; return devReportGenerator.generate(i); } };
  await Promise.all(Array.from({ length: 6 }, () => queueReport({ repo }, paid)));
  await Promise.all(Array.from({ length: 6 }, () => runReport({ repo, generator, now: () => new Date() }, paid)));
  assert.equal(generated, 1, "같은 리포트를 여러 번 생성하지 않는다");
  const reports = await admin.from("reports").select("id, status").eq("order_id", paid.id);
  assert.equal(reports.data?.length, 1);
  assert.equal(reports.data?.[0]?.status, "ready");
});

test("실제 DB: 승인은 됐는데 응답이 끊긴 주문을 재확인이 주문번호로 찾아 결제 완료로 맞추고, 반복해도 변하지 않는다", async () => {
  const toss = createFakeToss();
  const { repo, order } = await newPendingOrder(B.id);
  toss.state.confirmMode = "approve-then-lost";
  const lostKey = `pk-lost-${randomUUID()}`;
  const first = await confirmPayment({ repo, gateway: toss.gateway }, { userId: B.id, orderNumber: order.orderNumber, paymentKey: lostKey, amount: order.amount });
  assert.equal(first.kind, "checking");
  assert.equal((await repo.getOrderByNumber(order.orderNumber))?.status, "pending", "응답을 못 받았다고 실패로 바꾸지 않는다");

  // 결제 요청 시각을 5분 전으로 (결제 진행 중일 수 있는 시간이 지난 뒤의 재확인)
  await admin.from("orders").update({ created_at: new Date(Date.now() - 5 * 60_000).toISOString() }).eq("order_number", order.orderNumber);
  const queued: string[] = [];
  const deps = { repo, gateway: toss.gateway, now: () => new Date(), onPaid: async (o: { orderNumber: string }) => void queued.push(o.orderNumber) };
  const r = await reconcileOrder(deps, (await repo.getOrderByNumber(order.orderNumber))!);
  assert.equal(r.kind, "paid");
  assert.equal((await repo.getOrderByNumber(order.orderNumber))?.paymentKey, lostKey);
  for (let i = 0; i < 3; i++) assert.equal((await reconcileOrder(deps, (await repo.getOrderByNumber(order.orderNumber))!)).kind, "ok");
  assert.deepEqual(queued, [order.orderNumber], "리포트 준비는 한 번만");
  const events = await repo.listPaymentEvents((await repo.getOrderByNumber(order.orderNumber))!.id);
  assert.ok(events.some((e) => e.source === "reconcile" && e.status === "DONE"));
});

test("실제 DB: 결제사에서 취소된 결제를 재확인이 환불됨으로 맞추고, 같은 검사에 결제 완료 주문이 둘이 되지 않는다", async () => {
  const toss = createFakeToss();
  const { repo, order } = await newPendingOrder(B.id);
  const cancelKey = `pk-cancel-${randomUUID()}`;
  const input = { userId: B.id, orderNumber: order.orderNumber, paymentKey: cancelKey, amount: order.amount };
  assert.equal((await confirmPayment({ repo, gateway: toss.gateway }, input)).kind, "paid");
  toss.cancel(cancelKey);
  const deps = { repo, gateway: toss.gateway, now: () => new Date() };
  assert.equal((await reconcileOrder(deps, (await repo.getOrderByNumber(order.orderNumber))!)).kind, "refunded");
  assert.equal((await repo.getOrderByNumber(order.orderNumber))?.status, "refunded");
  const view = await getResultView(repo, { userId: B.id, assessmentId: order.assessmentId });
  assert.equal(view?.paidOrder, null, "환불된 주문은 열람 권한이 없다");
  assert.equal(view?.refunded, true);
});


test("AI 사용 기록(ai_usage): 서버만 쓰고 읽으며, 접근 정책 · 쌓기만 가능 · 비용 합계와 생성 수 집계가 실제 DB에서 동작한다", async () => {
  const repo = createSupabaseRepository(admin);
  const reportId = randomUUID();
  const t0 = new Date(Date.now() - 1000).toISOString();
  await repo.addAiUsage({ reportId, provider: "fake", model: "m", promptVersion: "p", inputTokens: 100, outputTokens: 200, estCostKrw: 12.3456, latencyMs: 800, outcome: "ok", errorCode: null });
  await repo.addAiUsage({ reportId, provider: "fake", model: "m", promptVersion: "p", inputTokens: null, outputTokens: null, estCostKrw: null, latencyMs: 30, outcome: "timeout", errorCode: "TIMEOUT" });
  const rows = (await repo.listAiUsageSince(t0, 50)).filter((r) => r.reportId === reportId);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.outcome === "ok")?.estCostKrw, 12.3456);
  assert.equal(rows.find((r) => r.outcome === "timeout")?.inputTokens, null);

  for (const client of [A.client, anon]) {
    const read = await client.from("ai_usage").select();
    assert.ok(read.error || read.data?.length === 0, "읽기 거부");
    const write = await client.from("ai_usage").insert({ provider: "x", model: "x", prompt_version: "x", latency_ms: 1, outcome: "ok" });
    assert.ok(write.error, "쓰기 거부");
  }
  assert.ok((await admin.from("ai_usage").update({ outcome: "error" }).eq("report_id", reportId)).error, "고치기 거부");
  assert.ok((await admin.from("ai_usage").delete().eq("report_id", reportId)).error, "지우기 거부");
  const bad = await admin.from("ai_usage").insert({ provider: "x", model: "x", prompt_version: "x", latency_ms: 1, outcome: "weird" });
  assert.ok(bad.error, "알 수 없는 결과 값 거부");
});

test("실제 DB: 생성 중 · 대기 중 리포트 수 집계와 하루 검사 수 집계 (멈춘 생성은 제외)", async () => {
  const repo = createSupabaseRepository(admin);
  const { order } = await newPendingOrder(B.id);
  const input = { userId: B.id, orderNumber: order.orderNumber, paymentKey: `pk-cap-${randomUUID()}`, amount: order.amount };
  const paidResult = await confirmPayment({ repo, gateway: createFakeToss().gateway }, input);
  if (paidResult.kind !== "paid") throw new Error(paidResult.kind);
  const staleBefore = () => new Date(Date.now() - 5 * 60_000).toISOString();

  const q0 = await repo.countQueuedReports();
  const g0 = await repo.countActiveGenerations(staleBefore());
  const report = await queueReport({ repo }, paidResult.order);
  assert.ok(report);
  assert.equal(await repo.countQueuedReports(), q0 + 1);
  const claimed = await repo.updateReport(report.id, ["queued"], { status: "generating", attempts: 1 }, 0);
  assert.ok(claimed);
  assert.equal(await repo.countQueuedReports(), q0);
  assert.equal(await repo.countActiveGenerations(staleBefore()), g0 + 1);
  // 기준 시각보다 오래 멈춘 생성은 세지 않는다 (기준을 미래로 두면 지금 생성 중인 것도 "멈춘 것")
  assert.equal(await repo.countActiveGenerations(new Date(Date.now() + 60_000).toISOString()), 0);
  await repo.updateReport(report.id, ["generating"], { status: "failed", lastError: "테스트 정리" }); // 생성 중으로 남겨 두지 않는다
  assert.ok((await repo.countAssessmentsSince(B.id, new Date(Date.now() - 24 * 3600_000).toISOString())) >= 1);
  assert.equal(await repo.countAssessmentsSince(B.id, new Date(Date.now() + 60_000).toISOString()), 0);
});

test("방문 단계 기록(funnel_events): 서버만 쓰고 읽으며, 허용된 단계만, 쌓기만 가능하고, 개인정보 열이 없다", async () => {
  const repo = createSupabaseRepository(admin);
  const anonId = randomUUID();
  const t0 = new Date(Date.now() - 1000).toISOString();
  await repo.addFunnelEvent({ anonId, name: "visit", path: "/", src: "naver", medium: "cpc", campaign: "fall", referrerHost: null });
  await repo.addFunnelEvent({ anonId, name: "preview_view", path: "/results/x", src: "naver", medium: "cpc", campaign: "fall", referrerHost: null });
  const rows = (await repo.listFunnelEventsSince(t0, 100)).filter((r) => r.anonId === anonId);
  assert.deepEqual(rows.map((r) => r.name).sort(), ["preview_view", "visit"]);
  assert.equal(rows[0].src, "naver");

  for (const client of [A.client, anon]) {
    assert.ok((await client.from("funnel_events").select()).error || true);
    const read = await client.from("funnel_events").select();
    assert.ok(read.error || read.data?.length === 0, "읽기 거부");
    assert.ok((await client.from("funnel_events").insert({ anon_id: randomUUID(), name: "visit" })).error, "쓰기 거부");
  }
  assert.ok((await admin.from("funnel_events").insert({ anon_id: randomUUID(), name: "payment_confirmed" })).error, "허용되지 않은 단계(결제 이벤트는 화면에서 받지 않는다)");
  assert.ok((await admin.from("funnel_events").update({ path: "/x" }).eq("anon_id", anonId)).error, "고치기 거부");
  assert.ok((await admin.from("funnel_events").delete().eq("anon_id", anonId)).error, "지우기 거부");
  const columns = await admin.from("funnel_events").select("*").limit(1);
  const keys = Object.keys(columns.data?.[0] ?? {});
  for (const forbidden of ["user_id", "nickname", "birth_year", "answers", "content", "email"]) assert.ok(!keys.includes(forbidden), `개인정보 열 없음: ${forbidden}`);
});

test("만족도(report_feedback): 완성된 내 리포트에만, 다시 누르면 고쳐지고, 다른 사람 · 미완성 리포트는 거부, 직접 쓰기는 거부, 내 것만 보인다", async () => {
  const repo = createSupabaseRepository(admin);
  const { order } = await newPendingOrder(B.id);
  const paidResult = await confirmPayment({ repo, gateway: createFakeToss().gateway }, { userId: B.id, orderNumber: order.orderNumber, paymentKey: `pk-fb-${randomUUID()}`, amount: order.amount });
  if (paidResult.kind !== "paid") throw new Error(paidResult.kind);
  const queued = await queueReport({ repo }, paidResult.order);
  if (!queued) throw new Error();

  await assert.rejects(repo.upsertFeedback({ reportId: queued.id, userId: B.id, rating: 5 }), /owner|ready/i, "완성 전에는 남길 수 없다");
  const ready = await runReport({ repo, generator: devReportGenerator, now: () => new Date() }, paidResult.order);
  assert.equal(ready?.status, "ready");

  await repo.upsertFeedback({ reportId: queued.id, userId: B.id, rating: 4 });
  await repo.upsertFeedback({ reportId: queued.id, userId: B.id, rating: 2 });
  assert.equal((await repo.getFeedback(queued.id))?.rating, 2, "다시 누르면 고쳐진다");
  const count = await admin.from("report_feedback").select("id").eq("report_id", queued.id);
  assert.equal(count.data?.length, 1, "리포트 하나에 하나");

  await assert.rejects(repo.upsertFeedback({ reportId: queued.id, userId: A.id, rating: 5 }), /owner|ready/i, "다른 회원의 리포트에는 남길 수 없다");
  assert.ok((await B.client.from("report_feedback").insert({ report_id: queued.id, user_id: B.id, rating: 5 })).error, "브라우저에서 직접 쓰기 거부");
  assert.ok((await B.client.from("report_feedback").update({ rating: 5 }).eq("report_id", queued.id).select()).data?.length !== 1, "브라우저에서 직접 고치기 거부");
  assert.equal((await B.client.from("report_feedback").select().eq("report_id", queued.id)).data?.length, 1, "내 것은 보인다");
  assert.deepEqual((await A.client.from("report_feedback").select().eq("report_id", queued.id)).data, [], "다른 회원 것은 안 보인다");
  assert.ok((await admin.from("report_feedback").update({ rating: 9 }).eq("report_id", queued.id)).error, "범위 밖 점수 거부");
  assert.ok((await admin.from("report_feedback").update({ user_id: A.id }).eq("report_id", queued.id)).error, "주인 바꾸기 거부");
});

test("유입 출처: 주문에 기록되고 지표용 조회에 나온다. 8번 마이그레이션 전(출처 열 없음)의 DB에서도 결제 시작은 막히지 않는다", async () => {
  const repo = createSupabaseRepository(admin);
  const saved = await submitAssessment({ repo, saju: sajuEngine }, { userId: B.id, channel: "web", info, answers, today: new Date() });
  if (!saved.ok) throw new Error();
  const started = await startCheckout({ repo, now: () => new Date() }, { userId: B.id, assessmentId: saved.assessment.id, acquisition: { source: "naver", medium: "cpc", campaign: "fall" } });
  if (started.kind !== "order") throw new Error();
  assert.deepEqual(started.order.acquisition, { source: "naver", medium: "cpc", campaign: "fall" });
  const listed = (await repo.listOrdersForMetrics(new Date(Date.now() - 60_000).toISOString(), 100)).find((o) => o.id === started.order.id);
  assert.equal(listed?.acquisition?.source, "naver");

  // 열이 없는 DB를 흉내 낸다 (코드가 먼저 배포되고 DB 변경이 늦은 경우)
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const psql = (q: string) => execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres", "-q", "-c", q]);
  try {
    psql("alter table public.orders drop column acq_source, drop column acq_medium, drop column acq_campaign; notify pgrst, 'reload schema'");
    await sleep(800);
    const saved2 = await submitAssessment({ repo, saju: sajuEngine }, { userId: B.id, channel: "web", info, answers, today: new Date() });
    if (!saved2.ok) throw new Error();
    const started2 = await startCheckout({ repo, now: () => new Date() }, { userId: B.id, assessmentId: saved2.assessment.id, acquisition: { source: "naver", medium: "cpc", campaign: null } });
    assert.equal(started2.kind, "order", "출처 열이 없어도 결제를 시작할 수 있다");
    assert.equal(started2.kind === "order" && started2.order.acquisition, null);
  } finally {
    psql(
      "alter table public.orders add column if not exists acq_source text check (acq_source is null or char_length(acq_source) <= 60), add column if not exists acq_medium text check (acq_medium is null or char_length(acq_medium) <= 60), add column if not exists acq_campaign text check (acq_campaign is null or char_length(acq_campaign) <= 80); notify pgrst, 'reload schema'",
    );
    await sleep(800);
  }
});

test("Supabase 1,000행 제한: 집계용 목록은 나눠서 모두 가져오고, 하루 AI 비용 합계는 DB에서 계산한다 (기록이 많아져도 조용히 모자라지 않는다)", async () => {
  const repo = createSupabaseRepository(admin);
  const t0 = new Date(Date.now() - 1000).toISOString();
  const rows = Array.from({ length: 1250 }, () => ({ provider: "bulk", model: "m", prompt_version: "p", input_tokens: 1, output_tokens: 1, est_cost_krw: 0.01, latency_ms: 1, outcome: "ok" }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("ai_usage").insert(rows.slice(i, i + 500));
    assert.equal(error, null);
  }
  const listed = (await repo.listAiUsageSince(t0, 5000)).filter((r) => r.provider === "bulk");
  assert.equal(listed.length, 1250, "1,000행을 넘어도 모두 가져온다");
  const limited = await repo.listAiUsageSince(t0, 1100);
  assert.equal(limited.length, 1100, "상한(limit)을 지킨다");

  const before = await repo.sumAiCostSince(new Date(Date.now() + 3600_000).toISOString());
  assert.equal(before, 0, "기준 이후 기록이 없으면 0");
  const sum = await repo.sumAiCostSince(t0);
  assert.ok(Math.abs(sum - 12.5) < 0.001, `합계 ${sum}`);
  // RPC 함수가 없는 경우(9번 마이그레이션 전)에도 같은 합계가 나온다
  const psql = (q: string) => execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres", "-q", "-c", q]);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    psql("alter function public.ai_cost_since(timestamptz) rename to ai_cost_since_hidden; notify pgrst, 'reload schema'");
    await sleep(800);
    const fallback = await repo.sumAiCostSince(t0);
    assert.ok(Math.abs(fallback - 12.5) < 0.001, `함수가 없을 때의 합계 ${fallback}`);
  } finally {
    psql("alter function public.ai_cost_since_hidden(timestamptz) rename to ai_cost_since; notify pgrst, 'reload schema'");
    await sleep(800);
  }
  assert.ok(Math.abs((await repo.sumAiCostSince(t0)) - 12.5) < 0.001);
});

test("회원 탈퇴(10번 마이그레이션): 서버만 부를 수 있고, 그 회원의 개인정보만 지우며 주문 · 결제 기록은 남기고, 진행 중이면 막고, 여러 번 해도 같다", async () => {
  const W = await makeUser();
  const O = await makeUser(); // 다른 회원 — 영향받지 않아야 한다
  const repo = createSupabaseRepository(admin);
  const deps = () => ({ repo, saju: sajuEngine });
  const save = async (userId: string, nickname: string) => {
    const r = await submitAssessment(deps(), { userId, channel: "web", info: { ...info, nickname }, answers, today: new Date() });
    assert.ok(r.ok);
    return r.ok ? r.assessment : (null as never);
  };
  await repo.ensureProfile(W.id);
  await repo.ensureProfile(O.id);
  const paid = await save(W.id, "탈퇴검사");
  const free = await save(W.id, "무료검사");
  const others = await save(O.id, "남의검사");

  // 결제 → 리포트 완성 → 고민 입력 → 만족도
  const started = await startCheckout({ repo, now: () => new Date() }, { userId: W.id, assessmentId: paid.id });
  assert.equal(started.kind, "order");
  const order = started.kind === "order" ? started.order : (null as never);
  const confirmed = await confirmPayment({ repo, gateway }, { userId: W.id, orderNumber: order.orderNumber, paymentKey: `pk-wd-${randomUUID()}`, amount: order.amount });
  assert.equal(confirmed.kind, "paid");
  const paidOrder = confirmed.kind === "paid" ? confirmed.order : (null as never);
  await queueReport({ repo }, paidOrder);
  await runReport({ repo, generator: devReportGenerator, now: () => new Date() }, paidOrder);
  await repo.upsertContext({ assessmentId: paid.id, userId: W.id, topic: "work", question: "이직할까", situation: "", matched: "", differed: "", excerpt: "", agreedAt: new Date().toISOString() });
  const concern = await repo.insertConcernRecord({ assessmentId: paid.id, userId: W.id, topic: "work", question: "이직할까", situation: "", matched: "", differed: "", excerpt: "", writtenAt: new Date().toISOString(), agreedAt: new Date().toISOString() });
  assert.ok(concern.ok);
  await admin.from("user_regions").upsert({ user_id: W.id, province: "서울", district: "마포구" });
  const report = await repo.getReportByOrder(order.id);
  assert.equal(report?.status, "ready");
  await admin.from("report_feedback").insert({ report_id: report!.id, user_id: W.id, rating: 5 });

  // 권한: 브라우저(로그인 회원 · 비로그인)는 이 함수를 부를 수 없다
  const asUser = await W.client.rpc("withdraw_member_data", { p_user_id: W.id });
  assert.ok(asUser.error, "로그인 회원이 직접 부를 수 없다");
  const asAnon = await anon.rpc("withdraw_member_data", { p_user_id: W.id });
  assert.ok(asAnon.error, "비로그인이 부를 수 없다");
  assert.equal((await repo.getReportByOrder(order.id))?.status, "ready", "거부된 호출은 아무것도 바꾸지 않았다");

  // 진행 중인 결제가 있으면 막는다 (방금 시작한 대기 주문)
  const second = await save(W.id, "새검사");
  const pending = await startCheckout({ repo, now: () => new Date() }, { userId: W.id, assessmentId: second.id });
  assert.equal(pending.kind, "order");
  const blocked = await repo.withdrawMemberData(W.id);
  assert.deepEqual(blocked, { ok: false, reason: "pending-order" });
  assert.ok((await repo.getAssessment(paid.id))?.nickname === "탈퇴검사", "막히면 아무것도 지우지 않는다");
  // 대기 주문을 정리(취소)한 뒤 탈퇴
  await repo.updateOrder(pending.kind === "order" ? pending.order.id : "", ["pending"], { status: "canceled", failureCode: "TEST" });

  const done = await repo.withdrawMemberData(W.id);
  assert.equal(done.ok, true);
  assert.ok(done.ok && done.counts.reports === 1 && done.counts.personal_contexts === 1 && done.counts.concern_records === 1 && done.counts.feedback === 1 && done.counts.regions === 1);
  assert.deepEqual(await repo.listConcernRecords(paid.id), [], "고민 기록 삭제");

  // 지워진 것
  assert.equal(await repo.getAssessment(free.id), null, "주문 없는 검사는 삭제");
  assert.equal((await repo.listReportStatuses(W.id)).length, 0, "리포트 삭제");
  assert.equal(await repo.getContext(paid.id), null, "고민 입력 삭제");
  const feedbackLeft = await admin.from("report_feedback").select("id").eq("user_id", W.id);
  assert.equal(feedbackLeft.data?.length, 0);
  const regionLeft = await admin.from("user_regions").select("user_id").eq("user_id", W.id);
  assert.equal(regionLeft.data?.length, 0);
  // 비워진 것: 주문이 가리키는 검사는 내용이 없다
  const shell = await admin.from("assessments").select("*").eq("id", paid.id).single();
  assert.equal(shell.data?.nickname, "탈퇴");
  assert.equal(shell.data?.known_mbti, null);
  assert.deepEqual(shell.data?.answers, {});
  assert.deepEqual(shell.data?.saju, {});
  assert.ok(shell.data?.withdrawn_at);
  assert.doesNotMatch(JSON.stringify(shell.data), /탈퇴검사|1990/);
  const profile = await admin.from("profiles").select("nickname, withdrawn_at").eq("id", W.id).single();
  assert.equal(profile.data?.nickname, null);
  assert.ok(profile.data?.withdrawn_at);

  // 남은 것: 주문 · 결제 처리 기록 · 가입 동의 기록
  const keptOrder = await repo.getOrderByNumber(order.orderNumber);
  assert.equal(keptOrder?.status, "paid");
  assert.equal(keptOrder?.amount, 9900);
  assert.ok((await repo.listPaymentEvents(order.id)).length >= 1, "결제 처리 기록 보관");

  // 다른 회원은 그대로
  assert.equal((await repo.getAssessment(others.id))?.nickname, "남의검사");

  // 여러 번 해도 같은 결과
  const again = await repo.withdrawMemberData(W.id);
  assert.ok(again.ok && again.counts.reports === 0 && again.counts.assessments_emptied === 0);
  // 존재하지 않는 회원
  assert.deepEqual(await repo.withdrawMemberData(randomUUID()), { ok: false, reason: "not-found" });

  // 로그인 연결 삭제(탈퇴 처리): 주문이 가리키는 회원 행은 남고 카카오 식별 정보는 지워진다
  const del = await admin.auth.admin.deleteUser(W.id, true);
  assert.equal(del.error, null);
  const authRow = execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres", "-tAc", `select deleted_at is not null, raw_user_meta_data::text from auth.users where id='${W.id}'`], { encoding: "utf8" }).trim();
  assert.match(authRow, /^t\|\{\}$/);
  assert.equal((await repo.getOrderByNumber(order.orderNumber))?.status, "paid", "회원 계정 행이 남아 주문 기록은 그대로");
});

test("대화 저장(12번 마이그레이션): 서버가 저장하고 본인만 보며, 브라우저 직접 쓰기 · 남의 결과 · 잘못된 방 이름 · 너무 큰 목록은 막히고, 질문 횟수 표는 브라우저가 읽지 못하며, 탈퇴하면 함께 지워진다", async () => {
  const U = await makeUser();
  const V = await makeUser();
  const server = createSupabaseRepository(admin);
  const mine = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "대화저장" }, answers, today: new Date() });
  const theirs = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: V.id, channel: "web", info: { ...info, nickname: "남의검사2" }, answers, today: new Date() });
  assert.ok(mine.ok && theirs.ok);
  const aid = mine.ok ? mine.assessment.id : "";
  const vid = theirs.ok ? theirs.assessment.id : "";
  const actions = [{ t: "intake", option: "some" }, { t: "free", q: "연락이 뜸한 사람이 있어요", a: ["정해서 말할 수는 없어요."] }];

  // 1) 서버(비밀키)가 저장 · 덮어쓰기, 같은 방은 한 줄
  await server.upsertTalkRoom({ assessmentId: aid, userId: U.id, roomKey: "love", actions });
  await server.upsertTalkRoom({ assessmentId: aid, userId: U.id, roomKey: "love", actions: actions.slice(0, 1) });
  await server.upsertTalkRoom({ assessmentId: aid, userId: U.id, roomKey: "daily:2026-10-15", actions: actions.slice(0, 1) });
  assert.deepEqual((await server.getTalkRoom(aid, "love"))?.actions, actions.slice(0, 1));
  assert.deepEqual((await server.listTalkRoomKeys(aid)).sort(), ["daily:2026-10-15", "love"]);
  await server.deleteTalkRoomsBefore(aid, "daily:", "daily:2026-10-16");
  assert.deepEqual(await server.listTalkRoomKeys(aid), ["love"], "지난 날짜의 오늘의 한 장 방은 정리된다");

  // 2) 접근 정책: 본인만 조회, 다른 회원 · 비로그인은 못 본다
  assert.equal((await createSupabaseRepository(U.client).getTalkRoom(aid, "love"))?.userId, U.id);
  assert.equal(await createSupabaseRepository(V.client).getTalkRoom(aid, "love"), null);
  assert.deepEqual(await createSupabaseRepository(V.client).listTalkRoomKeys(aid), []);
  const anonRead = await anon.from("talk_rooms").select();
  assert.ok(anonRead.error || (anonRead.data ?? []).length === 0, "비로그인은 조회할 수 없다");

  // 3) 브라우저(로그인 회원)의 직접 쓰기는 모두 거부
  const ins = await U.client.from("talk_rooms").insert({ assessment_id: aid, user_id: U.id, room_key: "money", actions: [] });
  assert.ok(ins.error, "직접 저장");
  const upd = await U.client.from("talk_rooms").update({ actions: [] }).eq("assessment_id", aid).eq("room_key", "love").select();
  assert.ok(upd.error || (upd.data ?? []).length === 0, "직접 수정");
  const del = await U.client.from("talk_rooms").delete().eq("assessment_id", aid).eq("room_key", "love").select();
  assert.ok(del.error || (del.data ?? []).length === 0, "직접 삭제");
  assert.equal((await server.getTalkRoom(aid, "love"))?.actions.length, 1, "직접 쓰기를 시도해도 그대로");

  // 4) 서버가 실수로 남의 결과에 붙이려 해도 DB가 막는다 · 방 이름 형식 · 크기 한도
  await assert.rejects(server.upsertTalkRoom({ assessmentId: vid, userId: U.id, roomKey: "love", actions }), /owner mismatch/);
  for (const bad of ["Love", "../x", "a", "daily:2026-1-5", "love;drop"]) {
    const r = await admin.from("talk_rooms").insert({ assessment_id: aid, user_id: U.id, room_key: bad, actions: [] });
    assert.ok(r.error, `잘못된 방 이름 ${bad}`);
  }
  const tooMany = await admin.from("talk_rooms").insert({ assessment_id: aid, user_id: U.id, room_key: "career", actions: Array.from({ length: 201 }, () => ({ t: "topic", id: "love" })) });
  assert.ok(tooMany.error, "행동 201개");
  const notArray = await admin.from("talk_rooms").insert({ assessment_id: aid, user_id: U.id, room_key: "career", actions: { t: "x" } });
  assert.ok(notArray.error, "목록이 아닌 값");

  // 5) 자유 질문 횟수 표: 내용 없이 한 줄씩, 브라우저는 읽지도 쓰지도 못한다
  await server.addChatQuestion({ userId: U.id, assessmentId: aid, roomKey: "love" });
  await server.addChatQuestion({ userId: U.id, assessmentId: aid, roomKey: "concern" });
  assert.equal(await server.countChatQuestionsSince(U.id, new Date(Date.now() - 3600_000).toISOString()), 2);
  assert.equal(await server.countChatQuestionsSince(U.id, new Date(Date.now() + 3600_000).toISOString()), 0);
  assert.equal(await server.countChatQuestionsSince(V.id, new Date(Date.now() - 3600_000).toISOString()), 0);
  const seen = await U.client.from("chat_questions").select();
  assert.ok(seen.error || (seen.data ?? []).length === 0, "브라우저는 질문 횟수 표를 읽지 못한다");
  const cheat = await U.client.from("chat_questions").delete().eq("user_id", U.id).select();
  assert.ok(cheat.error || (cheat.data ?? []).length === 0, "횟수를 지워 한도를 피할 수 없다");
  const cols = execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres", "-tAc", "select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_name='chat_questions'"], { encoding: "utf8" }).trim();
  assert.equal(cols, "id,user_id,assessment_id,room_key,created_at", "질문 내용을 담는 열이 없다");

  // 6) 탈퇴: 대화와 질문 횟수가 함께 지워진다
  const gone = await server.withdrawMemberData(U.id);
  assert.ok(gone.ok && gone.counts.talk_rooms === 1 && gone.counts.chat_questions === 2, JSON.stringify(gone));
  assert.deepEqual(await server.listTalkRoomKeys(aid), []);
  assert.equal(await server.countChatQuestionsSince(U.id, new Date(0).toISOString()), 0);
  // 다른 회원의 대화는 그대로
  await server.upsertTalkRoom({ assessmentId: vid, userId: V.id, roomKey: "love", actions });
  assert.deepEqual(await server.listTalkRoomKeys(vid), ["love"]);
});

test("채팅 요약(14번 마이그레이션): 본인이 저장한 것만 보이고(참고 기록은 브라우저가 못 읽음), 쓰기는 서버로만, 같은 대화는 한 번만 요약되고, 만든 뒤 고치지 않고, 탈퇴하면 함께 지워진다", async () => {
  const U = await makeUser();
  const V = await makeUser();
  const server = createSupabaseRepository(admin);
  const mine = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "요약" }, answers, today: new Date() });
  const theirs = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: V.id, channel: "web", info: { ...info, nickname: "남" }, answers, today: new Date() });
  assert.ok(mine.ok && theirs.ok);
  const aid = mine.ok ? mine.assessment.id : "";
  const vid = theirs.ok ? theirs.assessment.id : "";
  const model = buildTalkModel(sampleReadingReport, { tendencyName: "확인추구형", saju: SAMPLE_CHART, today: { year: 2026, month: 10, day: 15 }, chat: { state: "ready" } });
  const free = (n: number) => ({ t: "free", q: `질문${n}`, a: [`답${n}이에요.`], topic: "love" });
  const input = (actions: unknown[], over: Record<string, unknown> = {}) => ({ userId: U.id, assessmentId: aid, roomKey: "love", room: "love", actions, model, ...over });

  // 1) 저장: 서비스가 요약을 만들고 방 줄의 요약 위치(saved_upto)를 옮긴다 — 같은 대화를 동시에 두 번 저장해도 한 번만
  const both = await Promise.all([saveRoomSummary(server, input([free(1), free(2)])), saveRoomSummary(server, input([free(1), free(2)]))]);
  assert.equal(both.filter((r) => r.ok).length, 1, `동시에 두 번 눌러도 한 번만: ${JSON.stringify(both)}`);
  assert.equal((await server.getTalkRoom(aid, "love"))?.savedUpto, 2);
  assert.equal((await saveRoomSummary(server, input([free(1), free(2), free(3)]))).ok, true);
  assert.equal((await server.getTalkRoom(aid, "love"))?.savedUpto, 3);
  // 대화를 올릴 때(upsert) 요약 위치가 지워지지 않는다
  await server.upsertTalkRoom({ assessmentId: aid, userId: U.id, roomKey: "love", actions: [free(1), free(2), free(3), free(4)] });
  assert.equal((await server.getTalkRoom(aid, "love"))?.savedUpto, 3, "대화 저장이 요약 위치를 되돌리지 않는다");
  const saved = (await listSavedSummaries(server, U.id))[0];
  assert.deepEqual(saved.entries.map((e) => e.items.qa.map((p) => p.q)), [["질문3"], ["질문1", "질문2"]], "저장마다 이전 저장 이후의 대화만, 최근 저장이 먼저");

  // 2) 대화 종료 · 저장하지 않음 → 보이지 않는 참고 기록 (같은 방, 다음 질문의 참고로만)
  assert.deepEqual(await closeRoom(server, { ...input([free(1), free(2), free(3), free(4), free(5)]), keep: false }), { ok: true, saved: false });
  assert.equal(await server.getTalkRoom(aid, "love"), null, "대화 종료로 방 줄이 지워진다");
  assert.deepEqual((await memoryFor(server, { userId: U.id, assessmentId: aid, room: "love" })).map((p) => p.q), ["질문2", "질문3", "질문4", "질문5"], "다음 질문의 참고: 저장한 것과 저장하지 않은 것 모두, 오래된 순서로 최근 4쌍");
  assert.equal(await server.countVisibleChatSummaries(U.id), 2, "저장한 요약은 2개 그대로");

  // 3) 접근 정책: 본인이 직접 저장한 것만 브라우저로 읽힌다(참고 기록은 못 읽는다), 남 · 비로그인은 못 본다
  const mineRows = await createSupabaseRepository(U.client).listChatSummaries(U.id, { visibleOnly: false });
  assert.equal(mineRows.length, 2);
  assert.ok(mineRows.every((r) => r.visible), "브라우저는 저장하지 않고 끝낸 대화의 참고 기록을 읽지 못한다");
  assert.equal((await server.listChatSummaries(U.id, { visibleOnly: false })).length, 3, "서버는 참고 기록까지 읽는다");
  assert.deepEqual(await createSupabaseRepository(V.client).listChatSummaries(U.id, { visibleOnly: false }), []);
  const anonRead = await anon.from("chat_summaries").select();
  assert.ok(anonRead.error || (anonRead.data ?? []).length === 0, "비로그인은 조회할 수 없다");

  // 4) 브라우저의 직접 쓰기는 모두 거부 · 서버도 만든 뒤 고치지 못한다(수정 권한 없음)
  const ins = await U.client.from("chat_summaries").insert({ user_id: U.id, assessment_id: aid, room: "love", visible: true, items: { read: [], qa: [] } });
  assert.ok(ins.error, "직접 저장");
  const upd = await U.client.from("chat_summaries").update({ items: { read: [], qa: [] } }).eq("user_id", U.id).select();
  assert.ok(upd.error || (upd.data ?? []).length === 0, "직접 수정");
  const del = await U.client.from("chat_summaries").delete().eq("user_id", U.id).select();
  assert.ok(del.error || (del.data ?? []).length === 0, "직접 삭제");
  const adminUpd = await admin.from("chat_summaries").update({ visible: true }).eq("user_id", U.id).select();
  assert.ok(adminUpd.error, "서버도 만든 요약을 고치지 못한다");
  assert.equal((await server.listChatSummaries(U.id, { visibleOnly: false })).length, 3, "직접 쓰기를 시도해도 그대로");

  // 5) DB 규칙: 남의 결과에 붙이기 · 방 이름 형식 · 요약 모양과 크기
  await assert.rejects(server.insertChatSummary({ userId: U.id, assessmentId: vid, room: "love", visible: true, items: { read: [], qa: [] } }), /owner mismatch/);
  for (const bad of ["Love", "daily:2026-10-15", "a", "love;drop"]) {
    const r = await admin.from("chat_summaries").insert({ user_id: U.id, assessment_id: aid, room: bad, visible: true, items: { read: [], qa: [] } });
    assert.ok(r.error, `잘못된 방 이름 ${bad}`);
  }
  const notObject = await admin.from("chat_summaries").insert({ user_id: U.id, assessment_id: aid, room: "love", visible: true, items: [1] });
  assert.ok(notObject.error, "요약이 아닌 모양");
  const huge = await admin.from("chat_summaries").insert({ user_id: U.id, assessment_id: aid, room: "love", visible: true, items: { read: [], qa: [{ q: "가".repeat(20000), a: "나".repeat(20000) }] } });
  assert.ok(huge.error, "크기 한도");

  // 6) 지우기: 내 요약만, 모두 지우기는 참고 기록까지
  const [first] = await server.listChatSummaries(U.id, { visibleOnly: true });
  assert.equal(await server.deleteChatSummary(V.id, first.id), false, "남의 요약은 지울 수 없다");
  assert.equal(await server.deleteChatSummary(U.id, first.id), true);
  assert.equal(await deleteAllSummaries(server, U.id), 2, "남은 저장 요약 1개와 참고 기록 1개");
  assert.deepEqual(await server.listChatSummaries(U.id, { visibleOnly: false }), []);

  // 6-2) 보관 기간(90일): 기간이 지난 참고 기록만 지우고, 직접 저장한 요약은 오래돼도 남는다 · 기간 안의 참고 기록도 남는다
  const longAgo = new Date(Date.now() - 100 * 86_400_000).toISOString();
  const oldHidden = await admin.from("chat_summaries").insert({ user_id: U.id, assessment_id: aid, room: "love", visible: false, items: { read: [], qa: [{ q: "오래된 질문", a: "오래된 답" }] }, created_at: longAgo }).select("id");
  const oldSaved = await admin.from("chat_summaries").insert({ user_id: U.id, assessment_id: aid, room: "love", visible: true, items: { read: [], qa: [{ q: "오래 저장한 질문", a: "오래 저장한 답" }] }, created_at: longAgo }).select("id");
  assert.ok(!oldHidden.error && !oldSaved.error, JSON.stringify([oldHidden.error, oldSaved.error]));
  await server.insertChatSummary({ userId: U.id, assessmentId: aid, room: "love", visible: false, items: { read: [], qa: [{ q: "최근 질문", a: "최근 답" }] } });
  assert.equal(await server.deleteExpiredHiddenChatSummaries(new Date(Date.now() - 90 * 86_400_000).toISOString()), 1, "기간이 지난 참고 기록 하나만");
  const left = (await server.listChatSummaries(U.id, { visibleOnly: false })).map((r) => `${r.visible ? "저장" : "참고"}:${(r.items as { qa: { q: string }[] }).qa[0].q}`).sort();
  assert.deepEqual(left, ["저장:오래 저장한 질문", "참고:최근 질문"]);
  assert.equal(await server.deleteExpiredHiddenChatSummaries(new Date(Date.now() - 90 * 86_400_000).toISOString()), 0, "다시 해도 같다");
  assert.equal(await deleteAllSummaries(server, U.id), 2, "정리를 위한 지우기");

  // 7) 탈퇴: 저장한 요약 · 참고 기록이 함께 지워진다
  await server.insertChatSummary({ userId: U.id, assessmentId: aid, room: "love", visible: true, items: { read: ["연애"], qa: [] } });
  await server.insertChatSummary({ userId: U.id, assessmentId: aid, room: "love", visible: false, items: { read: [], qa: [{ q: "q", a: "a" }] } });
  await server.insertChatSummary({ userId: V.id, assessmentId: vid, room: "love", visible: true, items: { read: ["남의"], qa: [] } });
  const gone = await server.withdrawMemberData(U.id);
  assert.ok(gone.ok && gone.counts.chat_summaries === 2, JSON.stringify(gone));
  assert.deepEqual(await server.listChatSummaries(U.id, { visibleOnly: false }), []);
  assert.equal((await server.listChatSummaries(V.id, { visibleOnly: false })).length, 1, "다른 회원의 요약은 그대로");
});

test("채팅 요약 표 · 열이 없어도(14번 적용 전) 대화 · 질문은 그대로 되고, 저장만 '준비 중'으로 막히며 저장하지 않고 끝내기는 된다", async () => {
  const U = await makeUser();
  const server = createSupabaseRepository(admin);
  const mine = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "표없음요약" }, answers, today: new Date() });
  assert.ok(mine.ok);
  const aid = mine.ok ? mine.assessment.id : "";
  const model = buildTalkModel(sampleReadingReport, { tendencyName: "확인추구형", saju: SAMPLE_CHART, today: { year: 2026, month: 10, day: 15 }, chat: { state: "ready" } });
  const free = (n: number) => ({ t: "free", q: `질문${n}`, a: [`답${n}이에요.`], topic: "love" });
  const input = (actions: unknown[]) => ({ userId: U.id, assessmentId: aid, roomKey: "love", room: "love", actions, model });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const psql = (q: string) => execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres", "-q", "-c", q]);
  psql("alter table public.chat_summaries rename to chat_summaries_hidden; alter table public.talk_rooms rename column saved_upto to saved_upto_hidden; notify pgrst, 'reload schema'");
  await sleep(800);
  try {
    // 읽기는 빈 값 · 대화 저장은 그대로
    assert.deepEqual(await server.listChatSummaries(U.id, { visibleOnly: true }), []);
    assert.equal(await server.countVisibleChatSummaries(U.id), 0);
    assert.deepEqual(await memoryFor(server, { userId: U.id, assessmentId: aid, room: "love" }), []);
    await server.upsertTalkRoom({ assessmentId: aid, userId: U.id, roomKey: "love", actions: [free(1)] });
    assert.equal((await server.getTalkRoom(aid, "love"))?.actions.length, 1);
    // 저장은 준비 중, 대화는 지워지지 않는다
    assert.deepEqual(await saveRoomSummary(server, input([free(1)])), { ok: false, reason: "not-ready" });
    assert.deepEqual(await closeRoom(server, { ...input([free(1)]), keep: true }), { ok: false, reason: "not-ready" });
    assert.equal((await server.getTalkRoom(aid, "love"))?.actions.length, 1);
    // 저장하지 않고 끝내기는 기록 없이 끝난다
    assert.deepEqual(await closeRoom(server, { ...input([free(1)]), keep: false }), { ok: true, saved: false });
    assert.equal(await server.getTalkRoom(aid, "love"), null);
    assert.equal(await deleteAllSummaries(server, U.id), 0);
  } finally {
    psql("alter table public.chat_summaries_hidden rename to chat_summaries; alter table public.talk_rooms rename column saved_upto_hidden to saved_upto; notify pgrst, 'reload schema'");
    await sleep(800);
  }
  assert.deepEqual(await server.listChatSummaries(U.id, { visibleOnly: false }), []);
});

test("결제한 질문 장부(13번 마이그레이션) — 예전 선불 충전 주문 형식: 결제 승인과 같은 처리에서 한 번만 들어가고, 본인만 보며, 쓰기는 함수로만, 환불하면 남은 만큼 회수하고, 잔액이 있으면 탈퇴를 막는다", async () => {
  const U = await makeUser();
  const V = await makeUser();
  const server = createSupabaseRepository(admin);
  const tag = randomUUID().slice(0, 8); // 참조번호는 DB 전체에서 한 번만 쓸 수 있어 시험마다 새로 만든다
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "캐시" }, answers, today: new Date() });
  assert.ok(saved.ok);
  const aid = saved.ok ? saved.assessment.id : "";
  // 예전에 만든 선불 충전 주문(이미 운영 데이터에 있을 수 있다) — 지금 화면에서는 만들 수 없지만 DB는 같은 형식을 계속 처리한다
  const charge = async (cash: number) => {
    const bonus = cash >= 100 ? 15 : 0;
    const inserted = await server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: U.id, assessmentId: aid, productId: cashProductId({ cash, bonus, nonce: `LEG${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}` }), amount: cash * 100, paymentEnv: "test" });
    if (!inserted.ok) throw new Error("주문을 만들지 못했습니다");
    return { order: inserted.value };
  };
  const ledgerOf = async () => (await server.listCashLedger(U.id, 50)).map((l) => [l.kind, l.amount]).sort();

  // 1) 주문만 만들면 지갑은 비어 있다. 승인되면 충전 + 보너스가 들어가고, 같은 승인을 다시 반영해도 한 번만
  const first = await charge(100);
  assert.equal(await server.getCashBalance(U.id), 0);
  const key = `pk-${randomUUID()}`;
  const paid = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: first.order.orderNumber, paymentKey: key, amount: first.order.amount });
  assert.equal(paid.kind, "paid");
  assert.equal(await server.getCashBalance(U.id), 115, "100 + 보너스 15");
  const again = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: first.order.orderNumber, paymentKey: key, amount: first.order.amount });
  assert.equal(again.kind, "paid");
  assert.equal(await server.getCashBalance(U.id), 115, "같은 승인을 다시 반영해도 한 번만");
  assert.deepEqual(await ledgerOf(), [["bonus", 15], ["charge", 100]]);
  // 리포트는 만들어지지 않는다
  assert.equal(await server.getReportByOrder(first.order.id), null);

  // 2) 접근 정책: 본인만 조회, 다른 회원 · 비로그인은 못 본다 · 직접 쓰기는 서버 비밀키도 거부
  assert.equal(await createSupabaseRepository(U.client).getCashBalance(U.id), 115);
  assert.equal((await createSupabaseRepository(U.client).listCashLedger(U.id, 10)).length, 2);
  assert.equal(await createSupabaseRepository(V.client).getCashBalance(U.id), 0, "남의 지갑은 0으로 보인다");
  assert.deepEqual(await createSupabaseRepository(V.client).listCashLedger(U.id, 10), []);
  const anonWallet = await anon.from("cash_wallets").select();
  assert.ok(anonWallet.error || (anonWallet.data ?? []).length === 0, "비로그인은 조회할 수 없다");
  for (const client of [U.client, admin]) {
    const w = await client.from("cash_wallets").update({ balance: 9999 }).eq("user_id", U.id).select();
    assert.ok(w.error || (w.data ?? []).length === 0, "지갑을 직접 고칠 수 없다");
    const i = await client.from("cash_ledger").insert({ user_id: U.id, kind: "charge", amount: 500, order_id: first.order.id }).select();
    assert.ok(i.error || (i.data ?? []).length === 0, "내역을 직접 쌓을 수 없다");
  }
  assert.equal(await server.getCashBalance(U.id), 115);
  const noRpc = await U.client.rpc("spend_cash", { p_user_id: U.id, p_amount: 3, p_ref: `q-browser-try-${tag}` });
  assert.ok(noRpc.error, "브라우저 권한으로는 차감 함수를 부를 수 없다");
  const noRestore = await anon.rpc("restore_cash_spend", { p_user_id: U.id, p_ref: `q-browser-try-${tag}` });
  assert.ok(noRestore.error);

  // 3) 내역은 쌓기만 한다 (서버도 고치거나 지울 수 없다)
  const editLedger = await admin.from("cash_ledger").update({ amount: 1 }).eq("user_id", U.id).select();
  assert.ok(editLedger.error || (editLedger.data ?? []).length === 0, "내역 수정 거부");
  const delLedger = await admin.from("cash_ledger").delete().eq("user_id", U.id).select();
  assert.ok(delLedger.error || (delLedger.data ?? []).length === 0, "내역 삭제 거부");
  assert.equal((await server.listCashLedger(U.id, 10)).length, 2);

  // 4) 질문 차감: 잔액이 모자라면 아무것도 바꾸지 않고 null, 같은 참조번호로 두 번 차감할 수 없고, 되돌림은 한 번만
  assert.equal(await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-0001-${tag}` }), 112);
  await assert.rejects(server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-0001-${tag}` }), (e: { code?: string }) => e.code === "23505");
  assert.equal(await server.getCashBalance(U.id), 112, "중복 차감 시도는 잔액을 바꾸지 않는다");
  assert.equal(await server.spendCash({ userId: U.id, amount: 1000, ref: `q-too-much-${tag}` }), null);
  assert.equal(await server.spendCash({ userId: V.id, amount: MIYU_CASH.perQuestion, ref: `q-no-wallet-${tag}` }), null, "지갑이 없는 회원");
  await assert.rejects(server.spendCash({ userId: U.id, amount: 0, ref: `q-zero-${tag}` }), /cash_invalid_amount/);
  assert.equal(await server.restoreCashSpend({ userId: U.id, ref: `q-0001-${tag}` }), 115);
  assert.equal(await server.restoreCashSpend({ userId: U.id, ref: `q-0001-${tag}` }), null, "되돌림은 한 번만");
  assert.equal(await server.restoreCashSpend({ userId: U.id, ref: `q-unknown-${tag}` }), null);
  assert.equal(await server.getCashBalance(U.id), 115);
  await assert.rejects(server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-0001-${tag}` }), (e: { code?: string }) => e.code === "23505", "되돌린 참조번호도 다시 쓸 수 없다 — 새 질문은 새 참조번호");
  assert.equal(await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-0002-${tag}` }), 112, "새 질문은 새 참조번호로");
  for (let i = 0; i < 9; i++) await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-batch-${i}-${tag}` });
  const left = await server.getCashBalance(U.id);
  assert.equal(left, 112 - 9 * MIYU_CASH.perQuestion, "85");

  // 5) 결제 취소(환불): 남은 만큼만 회수하고 부족분을 기록, 음수가 되지 않으며 여러 번 해도 같다
  const refund = await admin.from("orders").update({ status: "refunded" }).eq("id", first.order.id);
  assert.equal(refund.error, null);
  assert.equal(await server.getCashBalance(U.id), 0);
  const claw = (await server.listCashLedger(U.id, 50)).find((l) => l.kind === "clawback");
  assert.equal(claw?.amount, -left);
  assert.equal(claw?.shortfall, 115 - left, "이미 쓴 몫은 회수하지 못한 몫으로 남는다");
  const noop = await admin.from("orders").update({ status: "refunded" }).eq("id", first.order.id);
  assert.equal(noop.error, null);
  assert.equal((await server.listCashLedger(U.id, 50)).filter((l) => l.kind === "clawback").length, 1);

  // 6) 잔액이 남아 있으면 탈퇴를 막는다. 다 쓰면 탈퇴되고 지갑 · 내역은 거래 기록으로 남는다
  const second = await charge(10);
  const paid2 = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: second.order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: second.order.amount });
  assert.equal(paid2.kind, "paid");
  assert.equal(await server.getCashBalance(U.id), 10);
  assert.deepEqual(await server.withdrawMemberData(U.id), { ok: false, reason: "cash-balance" });
  for (let i = 0; i < 3; i++) await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-last-${i}-${tag}` });
  assert.equal(await server.getCashBalance(U.id), 1, "10 − 9");
  await admin.from("cash_wallets").select(); // 읽기만 가능
  // 1캐시가 남아 있으면 여전히 막힌다
  assert.deepEqual(await server.withdrawMemberData(U.id), { ok: false, reason: "cash-balance" });
});

test("유료 질문 결제(질문 한 개당): 승인되면 3단위가 한 번만 들어가고, 질문에 쓰면 0이 되며 되돌리면 다시 남고, 환불하면 회수하며, 남아 있으면 탈퇴를 막는다 — 방 이름은 상품 번호에서 되읽힌다", async () => {
  const U = await makeUser();
  const server = createSupabaseRepository(admin);
  const tag = randomUUID().slice(0, 8);
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "질문결제" }, answers, today: new Date() });
  assert.ok(saved.ok);
  const aid = saved.ok ? saved.assessment.id : "";
  const quote = questionQuote();
  const order = async () => {
    const inserted = await server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: U.id, assessmentId: aid, productId: questionProductId(createQuestionNonce("love")), amount: quote.priceKrw, paymentEnv: "test" });
    if (!inserted.ok) throw new Error("주문을 만들지 못했습니다");
    return inserted.value;
  };
  const first = await order();
  assert.equal(questionRoomOf(first.productId), "love");
  assert.equal(first.amount, 300);
  assert.equal(await server.getCashBalance(U.id), 0, "주문만 만들면 질문이 생기지 않는다");
  const key = `pk-${randomUUID()}`;
  const paid = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: first.orderNumber, paymentKey: key, amount: first.amount });
  assert.equal(paid.kind, "paid");
  assert.equal(await server.getCashBalance(U.id), MIYU_CASH.perQuestion, "질문 한 개(3단위)");
  const again = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: first.orderNumber, paymentKey: key, amount: first.amount });
  assert.equal(again.kind, "paid");
  assert.equal(await server.getCashBalance(U.id), MIYU_CASH.perQuestion, "같은 승인을 다시 반영해도 한 번만");
  assert.deepEqual((await server.listCashLedger(U.id, 10)).map((l) => [l.kind, l.amount]), [["charge", 3]]);
  assert.equal(await server.getReportByOrder(first.id), null, "리포트는 만들어지지 않는다");

  // 질문에 쓰면 0, 답을 받지 못해 되돌리면 다시 남고(같은 결제로 다시 물을 수 있다), 한 번 더 쓰면 0
  assert.equal(await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-pay-1-${tag}` }), 0);
  assert.equal(await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-pay-2-${tag}` }), null, "결제한 질문이 없으면 쓸 수 없다");
  assert.equal(await server.restoreCashSpend({ userId: U.id, ref: `q-pay-1-${tag}` }), MIYU_CASH.perQuestion);
  assert.equal(await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-pay-3-${tag}` }), 0);

  // 쓰고 난 뒤 환불 — 이미 쓴 질문은 회수하지 못한 몫으로 남는다
  const refund = await admin.from("orders").update({ status: "refunded" }).eq("id", first.id);
  assert.equal(refund.error, null);
  const claw = (await server.listCashLedger(U.id, 10)).find((l) => l.kind === "clawback");
  assert.equal(Math.abs(claw?.amount ?? 1), 0);
  assert.equal(claw?.shortfall, 3);

  // 남아 있는 질문이 있으면 탈퇴를 막는다
  const second = await order();
  const paid2 = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: second.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: second.amount });
  assert.equal(paid2.kind, "paid");
  assert.equal(await server.getCashBalance(U.id), MIYU_CASH.perQuestion);
  assert.deepEqual(await server.withdrawMemberData(U.id), { ok: false, reason: "cash-balance" });
  await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-pay-4-${tag}` });
  assert.equal(await server.getCashBalance(U.id), 0);
});

test("미유캐시: 상품 번호 형식이 맞지 않는 주문은 결제 완료 처리를 막지 않고 지갑에도 넣지 않는다 (check-cash.sql이 찾는다)", async () => {
  const U = await makeUser();
  const server = createSupabaseRepository(admin);
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "캐시형식" }, answers, today: new Date() });
  assert.ok(saved.ok);
  const aid = saved.ok ? saved.assessment.id : "";
  const bad = await admin.from("orders").insert({ order_number: `MEU-BAD-${Date.now()}`, user_id: U.id, assessment_id: aid, product_id: "cash-charge:xx:yy:zz", amount: 1000, payment_env: "test" }).select().single();
  assert.ok(bad.data);
  const paid = await admin.from("orders").update({ status: "paid" }).eq("id", bad.data.id);
  assert.equal(paid.error, null, "결제 완료 처리는 막히지 않는다");
  assert.equal(await server.getCashBalance(U.id), 0);
  assert.deepEqual(await server.listCashLedger(U.id, 10), []);
});

test("운영자 수동 질문 반영(15번 마이그레이션): 결제 완료인 질문 결제 주문에 빠진 충전만 한 번 넣고, 주문 상태는 바꾸지 않으며, 브라우저는 부를 수 없고, 환불하면 회수하고, 함수가 없으면 이유를 알려 준다", async () => {
  const U = await makeUser();
  const server = createSupabaseRepository(admin);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const psql = (q: string) => execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres", "-q", "-c", q]);
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "수동반영" }, answers, today: new Date() });
  assert.ok(saved.ok);
  const aid = saved.ok ? saved.assessment.id : "";
  const quote = questionQuote();
  const makeOrder = async (productId = questionProductId(createQuestionNonce("love"))) => {
    const inserted = await server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: U.id, assessmentId: aid, productId, amount: quote.priceKrw, paymentEnv: "test" });
    if (!inserted.ok) throw new Error("주문을 만들지 못했습니다");
    return inserted.value;
  };
  /** 결제 완료로 바꾸되 충전 트리거는 건너뛴다 — 트리거가 일을 못 한 경우를 흉내 낸다 */
  const paidWithoutTrigger = async (orderId: string) => {
    psql("alter table public.orders disable trigger orders_cash_change");
    try {
      const r = await admin.from("orders").update({ status: "paid", approved_at: new Date().toISOString() }).eq("id", orderId);
      assert.equal(r.error, null);
    } finally {
      psql("alter table public.orders enable trigger orders_cash_change");
    }
  };

  // 없는 주문 · 결제 전 주문 · 질문 결제가 아닌 주문에는 아무것도 넣지 않는다
  assert.equal(await server.adminCreditQuestion(randomUUID()), "not-found");
  const pending = await makeOrder();
  assert.equal(await server.adminCreditQuestion(pending.id), "not-paid");
  const report = await makeOrder("personal-integrated-report");
  await paidWithoutTrigger(report.id);
  assert.equal(await server.adminCreditQuestion(report.id), "not-cash");
  assert.equal(await server.getCashBalance(U.id), 0);
  assert.equal((await server.getOrderById(pending.id))?.status, "pending", "함수는 주문 상태를 바꾸지 않는다");

  // 결제 완료인데 장부가 비어 있는 주문 — 한 번만 들어간다
  const missed = await makeOrder();
  await paidWithoutTrigger(missed.id);
  assert.equal(await server.getCashBalance(U.id), 0, "시작 상태: 결제 완료인데 질문이 없다");
  assert.equal(await server.adminCreditQuestion(missed.id), "credited");
  assert.equal(await server.getCashBalance(U.id), MIYU_CASH.perQuestion);
  assert.equal(await server.adminCreditQuestion(missed.id), "already");
  assert.equal(await server.getCashBalance(U.id), MIYU_CASH.perQuestion, "다시 눌러도 더 들어가지 않는다");
  assert.deepEqual((await server.listCashLedger(U.id, 10)).map((l) => [l.kind, l.amount, l.orderId === missed.id]), [["charge", 3, true]]);
  assert.equal((await server.getOrderById(missed.id))?.status, "paid");

  // 같은 주문에 동시에 여러 번 눌러도 한 번만
  const racing = await makeOrder();
  await paidWithoutTrigger(racing.id);
  const results = await Promise.all(Array.from({ length: 6 }, () => server.adminCreditQuestion(racing.id)));
  assert.equal(results.filter((r) => r === "credited").length, 1, JSON.stringify(results));
  assert.equal(results.filter((r) => r === "already").length, 5);
  assert.equal(await server.getCashBalance(U.id), MIYU_CASH.perQuestion * 2);

  // 이 함수로 넣은 질문도 결제가 취소되면 회수된다
  const refund = await admin.from("orders").update({ status: "refunded" }).eq("id", racing.id);
  assert.equal(refund.error, null);
  assert.equal(await server.getCashBalance(U.id), MIYU_CASH.perQuestion);
  assert.equal(await server.adminCreditQuestion(racing.id), "not-paid", "환불된 주문에는 넣지 않는다");

  // 브라우저(로그인 회원 · 비로그인)는 이 함수를 부를 수 없다
  const own = await makeOrder();
  await paidWithoutTrigger(own.id);
  const byUser = await U.client.rpc("admin_credit_question", { p_order_id: own.id });
  assert.ok(byUser.error, "로그인 회원은 부를 수 없다");
  const byAnon = await anon.rpc("admin_credit_question", { p_order_id: own.id });
  assert.ok(byAnon.error, "비로그인은 부를 수 없다");
  assert.equal(await server.getCashBalance(U.id), MIYU_CASH.perQuestion, "브라우저 호출로는 아무것도 들어가지 않는다");

  // 15번 변경 전(함수 없음) — 이유를 알려 주는 오류(코드 42P01)
  psql("alter function public.admin_credit_question(uuid) rename to admin_credit_question_hidden; notify pgrst, 'reload schema'");
  await sleep(800);
  try {
    await assert.rejects(server.adminCreditQuestion(own.id), (e: unknown) => (e as { code?: string }).code === "42P01");
    assert.equal(await server.getCashBalance(U.id), MIYU_CASH.perQuestion, "함수가 없어도 장부 조회는 그대로다");
  } finally {
    psql("alter function public.admin_credit_question_hidden(uuid) rename to admin_credit_question; notify pgrst, 'reload schema'");
    await sleep(800);
  }
  assert.equal(await server.adminCreditQuestion(own.id), "credited", "함수를 되돌린 뒤에는 다시 동작한다");

  // 정리: 남은 질문을 써서 탈퇴를 막지 않게 한다
  await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion * 2, ref: `q-manual-${randomUUID().slice(0, 8)}` });
});
