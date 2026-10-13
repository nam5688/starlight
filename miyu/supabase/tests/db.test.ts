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
import { concernProductId } from "../../lib/config/product.ts";
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
