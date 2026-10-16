// DB 검증: 접근 정책(RLS), 쓰기 차단, 상태 규칙 트리거, 실제 DB 위에서의 서비스 흐름.
// 실행 전 local-stack.sh start 필요. 실행: npm run test:db
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ASSESSMENT_MODULES } from "../../lib/assessment/modules/index.ts";
import { createSupabaseRepository } from "../../lib/integrations/supabase/repository.ts";
import { EMPTY_BASIC_INFO } from "../../lib/profile/basic-info.ts";
import { cashProductId, concernProductId, MIYU_CASH, QUESTION_PACK_UNITS } from "../../lib/config/product.ts";
import { createQuestionNonce, questionProductId, questionQuote, questionRoomOf, refundSchedule, refundTotalFor } from "../../lib/commerce/cash.ts";
import { createOrderNumber } from "../../lib/commerce/order.ts";
import { createInviteToken } from "../../lib/commerce/invite.ts";
import { INVITE_DISCOUNT } from "../../lib/config/product.ts";
import { createInviteLink, getInviteView, quoteInviteDiscount } from "../../lib/services/invite-service.ts";
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
  // 맛보기 리포트(17번) — 주문이 있는 검사는 지워지지 않고 비워지기만 하므로 탈퇴 함수가 직접 지워야 한다
  assert.deepEqual(await repo.reserveTasteReport({ userId: W.id, assessmentId: paid.id }), { state: "reserved" });
  await repo.saveTasteReport({ userId: W.id, assessmentId: paid.id, content: { version: "taste-v1", headline: "탈퇴시험", sections: [] }, generator: "test:m", generatorVersion: "p" });

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
  assert.ok(done.ok && done.counts.taste_reports === 1, "맛보기 리포트 삭제");
  assert.equal(await repo.getTasteReport(W.id), null, "맛보기 리포트 삭제 확인");
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
  // state · reserved_until은 16번의 무료 질문 자리 예약용이다 — 질문 · 답 내용을 담는 열은 여전히 없다
  assert.equal(cols, "id,user_id,assessment_id,room_key,created_at,state,reserved_until", "질문 내용을 담는 열이 없다");

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
  assert.equal(first.amount, 2500, "질문 3개 묶음 하나의 값");
  assert.equal(await server.getCashBalance(U.id), 0, "주문만 만들면 질문이 생기지 않는다");
  const key = `pk-${randomUUID()}`;
  const paid = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: first.orderNumber, paymentKey: key, amount: first.amount });
  assert.equal(paid.kind, "paid");
  assert.equal(await server.getCashBalance(U.id), QUESTION_PACK_UNITS, "질문 3개(9단위)");
  const again = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: first.orderNumber, paymentKey: key, amount: first.amount });
  assert.equal(again.kind, "paid");
  assert.equal(await server.getCashBalance(U.id), QUESTION_PACK_UNITS, "같은 승인을 다시 반영해도 한 번만");
  assert.deepEqual((await server.listCashLedger(U.id, 10)).map((l) => [l.kind, l.amount]), [["charge", 9]]);
  assert.equal(await server.getReportByOrder(first.id), null, "리포트는 만들어지지 않는다");

  // 묶음의 질문을 하나씩 쓴다: 6 → 3 → 0, 다 쓰면 더 쓸 수 없고, 답을 받지 못해 되돌리면 다시 남으며(같은 결제로 다시 물을 수 있다), 한 번 더 쓰면 0
  assert.equal(await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-pay-1-${tag}` }), 6);
  assert.equal(await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-pay-2-${tag}` }), 3);
  assert.equal(await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-pay-3-${tag}` }), 0);
  assert.equal(await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-pay-x-${tag}` }), null, "결제한 질문이 없으면 쓸 수 없다");
  assert.equal(await server.restoreCashSpend({ userId: U.id, ref: `q-pay-1-${tag}` }), MIYU_CASH.perQuestion);
  assert.equal(await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-pay-y-${tag}` }), 0);

  // 쓰고 난 뒤 환불 — 이미 쓴 질문은 회수하지 못한 몫으로 남는다
  const refund = await admin.from("orders").update({ status: "refunded" }).eq("id", first.id);
  assert.equal(refund.error, null);
  // 묶음 장부가 있는 주문(16번 이후)의 전액 취소는 묶음별 환불 회수(refund_claw)로 남는다
  const claw = (await server.listCashLedger(U.id, 10)).find((l) => l.kind === "refund_claw");
  assert.equal(Math.abs(claw?.amount ?? 1), 0);
  assert.equal(claw?.shortfall, QUESTION_PACK_UNITS, "묶음의 질문 3개를 모두 쓴 뒤 환불하면 회수할 것이 없고 9단위가 모자란 몫으로 남는다");

  // 남아 있는 질문이 있으면 탈퇴를 막는다
  const second = await order();
  const paid2 = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: second.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: second.amount });
  assert.equal(paid2.kind, "paid");
  assert.equal(await server.getCashBalance(U.id), QUESTION_PACK_UNITS);
  assert.deepEqual(await server.withdrawMemberData(U.id), { ok: false, reason: "cash-balance" });
  for (let i = 0; i < 3; i++) await server.spendCash({ userId: U.id, amount: MIYU_CASH.perQuestion, ref: `q-pay-4-${i}-${tag}` });
  assert.equal(await server.getCashBalance(U.id), 0);
});

test("실제 DB 동시성(질문 3개 묶음): 같은 승인이 6번 동시에 와도 질문 3개는 한 번만 들어가고, 질문 6개를 동시에 써도 정확히 3개만 쓰이며, 같은 질문을 두 번 보내도 한 번만 차감되고, 같은 되돌림을 여러 번 해도 한 번만 돌아오고, 일부 쓴 뒤 환불하면 남은 질문만 회수한다", async () => {
  const U = await makeUser();
  const server = createSupabaseRepository(admin);
  const tag = randomUUID().slice(0, 8);
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "질문동시" }, answers, today: new Date() });
  assert.ok(saved.ok);
  const aid = saved.ok ? saved.assessment.id : "";
  const quote = questionQuote();
  const inserted = await server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: U.id, assessmentId: aid, productId: questionProductId(createQuestionNonce("love")), amount: quote.priceKrw, paymentEnv: "test" });
  assert.ok(inserted.ok);
  const order = inserted.ok ? inserted.value : null!;
  const key = `pk-race-${randomUUID()}`;
  const per = MIYU_CASH.perQuestion;

  // 1) 같은 승인 요청이 6번 동시에 — 질문 3개(9단위)가 한 번만
  const confirms = await Promise.all(Array.from({ length: 6 }, () => confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: order.orderNumber, paymentKey: key, amount: order.amount })));
  assert.ok(confirms.every((r) => r.kind === "paid"), JSON.stringify(confirms.map((r) => r.kind)));
  assert.equal(await server.getCashBalance(U.id), QUESTION_PACK_UNITS, "동시에 승인돼도 묶음 하나만 들어간다");
  assert.equal((await server.listCashLedger(U.id, 50)).filter((l) => l.kind === "charge").length, 1);

  // 2) 질문 6개를 동시에 — 정확히 3개만 쓰이고 나머지는 결제해 둔 질문이 없다(null)
  const spends = await Promise.all(Array.from({ length: 6 }, (_, i) => server.spendCash({ userId: U.id, amount: per, ref: `q-race-${i}-${tag}` })));
  assert.equal(spends.filter((b) => b !== null).length, 3, `동시에 6번 써도 3번만 성공: ${JSON.stringify(spends)}`);
  assert.equal(spends.filter((b) => b === null).length, 3);
  assert.deepEqual(spends.filter((b): b is number => b !== null).sort((a, b) => a - b), [0, 3, 6], "남은 단위가 겹치지 않고 6 → 3 → 0으로 줄어든다");
  assert.equal(await server.getCashBalance(U.id), 0, "잔액이 음수가 되지 않는다");
  const spentRefs = (await server.listCashLedger(U.id, 50)).filter((l) => l.kind === "spend");
  assert.equal(spentRefs.length, 3, "쓴 기록도 정확히 3건");

  // 3) 같은 질문(같은 참조번호)이 두 번 동시에 — 한 번만 차감된다 (질문 하나를 되돌려 1개를 남긴 뒤 시험)
  const okRefs = spends.map((b, i) => (b !== null ? `q-race-${i}-${tag}` : null)).filter((r): r is string => r !== null);
  assert.equal(okRefs.length, 3);
  assert.equal(await server.restoreCashSpend({ userId: U.id, ref: okRefs[0]! }), per);
  const twice = await Promise.allSettled([server.spendCash({ userId: U.id, amount: per, ref: `q-same-${tag}` }), server.spendCash({ userId: U.id, amount: per, ref: `q-same-${tag}` })]);
  assert.equal(twice.filter((r) => r.status === "fulfilled" && r.value !== null).length, 1, `같은 참조번호는 한 번만 차감: ${JSON.stringify(twice.map((r) => (r.status === "fulfilled" ? r.value : "거절")))}`);
  assert.equal(await server.getCashBalance(U.id), 0, "두 번 차감되지 않았다");

  // 4) 같은 되돌림을 4번 동시에 — 질문 하나(3단위)만 돌아온다
  const restores = await Promise.all(Array.from({ length: 4 }, () => server.restoreCashSpend({ userId: U.id, ref: `q-same-${tag}` })));
  assert.equal(restores.filter((b) => b !== null).length, 1, "되돌림은 한 번만");
  assert.equal(await server.getCashBalance(U.id), per, "질문 1개가 돌아와 남았다");

  // 5) 질문 1개를 쓰고 2개가 남은 상태에서 환불 — 남은 질문(6단위)만 회수하고, 쓴 질문 몫(3단위)은 모자란 몫으로 남는다
  await server.restoreCashSpend({ userId: U.id, ref: okRefs[1]! });
  assert.equal(await server.getCashBalance(U.id), per * 2, "질문 2개 남음");
  const refund = await admin.from("orders").update({ status: "refunded" }).eq("id", order.id);
  assert.equal(refund.error, null);
  const claw = (await server.listCashLedger(U.id, 50)).find((l) => l.kind === "refund_claw");
  assert.equal(claw?.amount, -per * 2, "남은 질문 2개(6단위)를 회수");
  assert.equal(claw?.shortfall, per, "이미 쓴 질문 1개(3단위)는 회수하지 못한 몫");
  assert.equal(await server.getCashBalance(U.id), 0);
  // 같은 환불 상태를 다시 써도(결제사 대조 · 웹훅이 겹쳐도) 한 번만 회수한다
  await admin.from("orders").update({ status: "refunded" }).eq("id", order.id);
  assert.equal((await server.listCashLedger(U.id, 50)).filter((l) => l.kind === "refund_claw").length, 1);
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
  assert.equal(await server.getCashBalance(U.id), QUESTION_PACK_UNITS);
  assert.equal(await server.adminCreditQuestion(missed.id), "already");
  assert.equal(await server.getCashBalance(U.id), QUESTION_PACK_UNITS, "다시 눌러도 더 들어가지 않는다");
  assert.deepEqual((await server.listCashLedger(U.id, 10)).map((l) => [l.kind, l.amount, l.orderId === missed.id]), [["charge", QUESTION_PACK_UNITS, true]]);
  assert.equal((await server.getOrderById(missed.id))?.status, "paid");

  // 같은 주문에 동시에 여러 번 눌러도 한 번만
  const racing = await makeOrder();
  await paidWithoutTrigger(racing.id);
  const results = await Promise.all(Array.from({ length: 6 }, () => server.adminCreditQuestion(racing.id)));
  assert.equal(results.filter((r) => r === "credited").length, 1, JSON.stringify(results));
  assert.equal(results.filter((r) => r === "already").length, 5);
  assert.equal(await server.getCashBalance(U.id), QUESTION_PACK_UNITS * 2);

  // 이 함수로 넣은 질문도 결제가 취소되면 회수된다
  const refund = await admin.from("orders").update({ status: "refunded" }).eq("id", racing.id);
  assert.equal(refund.error, null);
  assert.equal(await server.getCashBalance(U.id), QUESTION_PACK_UNITS);
  assert.equal(await server.adminCreditQuestion(racing.id), "not-paid", "환불된 주문에는 넣지 않는다");

  // 브라우저(로그인 회원 · 비로그인)는 이 함수를 부를 수 없다
  const own = await makeOrder();
  await paidWithoutTrigger(own.id);
  const byUser = await U.client.rpc("admin_credit_question", { p_order_id: own.id });
  assert.ok(byUser.error, "로그인 회원은 부를 수 없다");
  const byAnon = await anon.rpc("admin_credit_question", { p_order_id: own.id });
  assert.ok(byAnon.error, "비로그인은 부를 수 없다");
  assert.equal(await server.getCashBalance(U.id), QUESTION_PACK_UNITS, "브라우저 호출로는 아무것도 들어가지 않는다");

  // 15번 변경 전(함수 없음) — 이유를 알려 주는 오류(코드 42P01)
  psql("alter function public.admin_credit_question(uuid) rename to admin_credit_question_hidden; notify pgrst, 'reload schema'");
  await sleep(800);
  try {
    await assert.rejects(server.adminCreditQuestion(own.id), (e: unknown) => (e as { code?: string }).code === "42P01");
    assert.equal(await server.getCashBalance(U.id), QUESTION_PACK_UNITS, "함수가 없어도 장부 조회는 그대로다");
  } finally {
    psql("alter function public.admin_credit_question_hidden(uuid) rename to admin_credit_question; notify pgrst, 'reload schema'");
    await sleep(800);
  }
  assert.equal(await server.adminCreditQuestion(own.id), "credited", "함수를 되돌린 뒤에는 다시 동작한다");

  // 정리: 남은 질문을 써서 탈퇴를 막지 않게 한다
  await server.spendCash({ userId: U.id, amount: QUESTION_PACK_UNITS * 2, ref: `q-manual-${randomUUID().slice(0, 8)}` });
});

// ───────────── 16번 마이그레이션: 묶음 장부 · 부분 환불 · 환불 중 동시 사용 · 무료 질문 예약 ─────────────

const psqlRun = (q: string) => execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-tA", "-c", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** 질문 묶음 시험용 세계 — 회원 한 명 · 검사 결과 하나 · 묶음(질문 3개 · 2,500원)을 결제해 장부에 넣는 도우미 */
async function packWorld(nickname: string) {
  const U = await makeUser();
  const server = createSupabaseRepository(admin);
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname }, answers, today: new Date() });
  assert.ok(saved.ok);
  const aid = saved.ok ? saved.assessment.id : "";
  const per = MIYU_CASH.perQuestion;
  const buy = async () => {
    const inserted = await server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: U.id, assessmentId: aid, productId: questionProductId(createQuestionNonce("love")), amount: questionQuote().priceKrw, paymentEnv: "test" });
    assert.ok(inserted.ok);
    const order = inserted.ok ? inserted.value : null!;
    const paid = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: order.amount });
    assert.equal(paid.kind, "paid");
    return order;
  };
  const balance = () => server.getCashBalance(U.id);
  const ledger = () => server.listCashLedger(U.id, 500);
  /** 장부의 모든 줄을 더한 값은 언제나 지갑 잔액과 같아야 한다 (어느 순서로 동시에 와도) */
  const consistent = async (why: string) => {
    const sum = (await ledger()).reduce((s, l) => s + l.amount, 0);
    assert.equal(sum, await balance(), `${why}: 내역 합계와 지갑 잔액이 다르다`);
    assert.ok((await balance()) >= 0 && (await balance()) % per === 0, `${why}: 잔액이 음수이거나 질문 단위가 아니다`);
  };
  return { U, server, aid, per, buy, balance, ledger, consistent };
}

test("묶음 장부(16번): 누적 환불표가 TS · DB 두 곳에서 같고, 승인되면 묶음 한 줄이 만들어지며, 누적 환불액이 결제액을 넘는 값은 DB가 거부한다", async () => {
  // 장부 단위와 환불 계산식이 TS와 DB에서 같다
  const units = await admin.rpc("question_units");
  assert.equal(units.data, MIYU_CASH.perQuestion, "DB의 질문 단위(question_units)와 MIYU_CASH.perQuestion이 같다 — 하나를 바꾸면 새 마이그레이션이 필요하다");
  for (const [price, q] of [[2500, 3], [2499, 3], [2501, 3], [9900, 5], [1000, 7], [12345, 4]] as const) {
    for (let k = 1; k <= q; k++) {
      const db = await admin.rpc("question_refund_total", { p_price: price, p_questions: q, p_k: k });
      assert.equal(db.data, refundTotalFor(price, q, k), `${price}원 · ${q}개 · k=${k}`);
    }
  }
  assert.deepEqual(refundSchedule(2500, 3), [834, 1667, 2500]);

  const w = await packWorld("묶음장부");
  const order = await w.buy();
  const pack = await w.server.getQuestionPack(order.id);
  assert.deepEqual(pack && { questions: pack.questions, priceKrw: pack.priceKrw, used: pack.used, refundedQuestions: pack.refundedQuestions, refundedKrw: pack.refundedKrw }, { questions: 3, priceKrw: 2500, used: 0, refundedQuestions: 0, refundedKrw: 0 });
  assert.equal(await w.balance(), 9);
  // 결제액을 넘는 누적 환불액 · 쓴 수가 산 수를 넘는 값은 표 자체가 거부한다
  assert.throws(() => psqlRun(`update public.question_packs set refunded_krw = 2501 where order_id = '${order.id}'`), /check/i);
  assert.throws(() => psqlRun(`update public.question_packs set used = 4 where order_id = '${order.id}'`), /check/i);
  // 본인만 보고, 브라우저로는 쓸 수 없다
  const mine = await w.U.client.from("question_packs").select("order_id, questions").eq("order_id", order.id);
  assert.equal(mine.data?.length, 1);
  const others = await B.client.from("question_packs").select("order_id").eq("order_id", order.id);
  assert.equal(others.data?.length ?? 0, 0, "다른 회원은 볼 수 없다");
  const write = await w.U.client.from("question_packs").update({ refunded_krw: 0, used: 0 }).eq("order_id", order.id).select();
  assert.ok(write.error || (write.data ?? []).length === 0, "브라우저는 묶음 장부를 고칠 수 없다");
  const call = await w.U.client.rpc("apply_cash_refund", { p_order_id: order.id, p_canceled_total: 834 });
  assert.ok(call.error, "브라우저는 환불 반영 함수를 부를 수 없다");
  const anonCall = await anon.rpc("reserve_chat_question", { p_user_id: w.U.id, p_assessment_id: w.aid, p_room_key: "love", p_max: 3 });
  assert.ok(anonCall.error, "비로그인도 예약 함수를 부를 수 없다");
  assert.equal(await w.balance(), 9, "거부된 호출은 아무것도 바꾸지 않았다");
});

test("부분 환불(16번): 1개씩 세 번 나눠 환불해도 총 환불액은 정확히 2,500원이고(834 → 1,667 → 2,500), 같은 금액을 다시 반영해도 한 번만 회수하며, 질문 수에 맞지 않는 금액은 아무것도 바꾸지 않는다", async () => {
  const w = await packWorld("부분환불");
  const order = await w.buy();

  // 질문 수에 맞지 않거나 범위를 벗어난 금액 — 장부를 바꾸지 않고 맞는 금액을 알려 준다
  assert.deepEqual(await w.server.applyCashRefund({ orderId: order.id, canceledTotal: 1000 }), { status: "amount-mismatch", allowed: [834, 1667, 2500], refundedKrw: 0 });
  assert.deepEqual(await w.server.applyCashRefund({ orderId: order.id, canceledTotal: 3000 }), { status: "invalid-amount", allowed: [834, 1667, 2500] });
  assert.deepEqual(await w.server.applyCashRefund({ orderId: order.id, canceledTotal: 0 }), { status: "invalid-amount", allowed: [834, 1667, 2500] });
  assert.deepEqual(await w.server.applyCashRefund({ orderId: order.id, canceledTotal: -834 }), { status: "invalid-amount", allowed: [834, 1667, 2500] });
  assert.equal(await w.balance(), 9);
  assert.equal((await w.server.getQuestionPack(order.id))?.refundedKrw, 0);

  // 1개 환불
  assert.deepEqual(await w.server.applyCashRefund({ orderId: order.id, canceledTotal: 834 }), { status: "applied", questions: 1, refundedKrw: 834, clawed: 1, shortfall: 0 });
  assert.equal(await w.balance(), 6);
  // 같은 누적액을 다시 반영 — 웹훅 중복 · 결제 대조가 겹쳐도 한 번만
  assert.deepEqual(await w.server.applyCashRefund({ orderId: order.id, canceledTotal: 834 }), { status: "already", questions: 1, refundedKrw: 834 });
  assert.equal(await w.balance(), 6);
  // 2번째 · 3번째 (이번에 취소한 금액은 833 · 833이고 토스의 누적 취소액은 1,667 · 2,500)
  assert.deepEqual(await w.server.applyCashRefund({ orderId: order.id, canceledTotal: 1667 }), { status: "applied", questions: 2, refundedKrw: 1667, clawed: 1, shortfall: 0 });
  assert.equal(await w.balance(), 3);
  // 알림이 늦게 와서 이전 누적액이 다시 도착해도 이미 반영된 것으로 본다 (되돌리지 않는다)
  assert.deepEqual(await w.server.applyCashRefund({ orderId: order.id, canceledTotal: 834 }), { status: "already", questions: 2, refundedKrw: 1667 });
  assert.deepEqual(await w.server.applyCashRefund({ orderId: order.id, canceledTotal: 2500 }), { status: "applied", questions: 3, refundedKrw: 2500, clawed: 1, shortfall: 0 });
  assert.equal(await w.balance(), 0);

  const pack = await w.server.getQuestionPack(order.id);
  assert.deepEqual(pack && { used: pack.used, rq: pack.refundedQuestions, krw: pack.refundedKrw }, { used: 0, rq: 3, krw: 2500 }, "총 환불액이 결제액과 정확히 같다 (834 × 3 = 2,502가 아니다)");
  const claws = (await w.ledger()).filter((l) => l.kind === "refund_claw");
  assert.equal(claws.length, 3);
  assert.equal(claws.reduce((s, l) => s + l.amount, 0), -9, "질문 3개(9단위)를 회수");
  assert.ok(claws.every((l) => l.shortfall === 0));
  await w.consistent("세 번 나눠 환불");
  assert.equal((await w.server.getOrderById(order.id))?.status, "paid", "부분 환불은 주문 상태를 바꾸지 않는다");
  assert.equal(await w.server.spendCash({ userId: w.U.id, amount: w.per, ref: `q-after-refund-${randomUUID().slice(0, 8)}` }), null, "환불한 질문은 쓸 수 없다");
});

test("부분 환불 뒤 전액 취소(주문이 환불됨으로 바뀜): 아직 회수하지 않은 질문만 회수하고, 환불 내역이 두 번 쌓이지 않는다 — 한 번에 환불해도 나눠 환불해도 결과가 같다", async () => {
  const a = await packWorld("나눠환불");
  const first = await a.buy();
  await a.server.applyCashRefund({ orderId: first.id, canceledTotal: 834 });
  assert.equal(await a.balance(), 6);
  assert.equal((await admin.from("orders").update({ status: "refunded" }).eq("id", first.id)).error, null);
  assert.equal(await a.balance(), 0, "남은 2개를 회수");
  const pa = await a.server.getQuestionPack(first.id);
  assert.deepEqual(pa && { rq: pa.refundedQuestions, krw: pa.refundedKrw }, { rq: 3, krw: 2500 });
  assert.equal((await a.ledger()).filter((l) => l.kind === "refund_claw").reduce((s, l) => s + l.amount, 0), -9);
  await admin.from("orders").update({ status: "refunded" }).eq("id", first.id); // 같은 상태를 다시 써도
  assert.equal((await a.ledger()).filter((l) => l.kind === "refund_claw").length, 2, "환불 반영이 한 번 더 쌓이지 않는다");

  const b = await packWorld("한번에환불");
  const second = await b.buy();
  assert.equal((await admin.from("orders").update({ status: "refunded" }).eq("id", second.id)).error, null);
  assert.equal(await b.balance(), 0);
  const pb = await b.server.getQuestionPack(second.id);
  assert.deepEqual(pb && { rq: pb.refundedQuestions, krw: pb.refundedKrw }, { rq: 3, krw: 2500 }, "나눠 환불한 것과 같은 최종 상태");
  await a.consistent("나눠 환불");
  await b.consistent("한 번에 환불");
});

test("환불과 사용이 겹칠 때(16번): 이미 쓴 질문까지 환불하면 회수하지 못한 몫으로 남고, 답을 받지 못해 되돌린 질문은 환불에 포함됐는지에 따라 돌아오거나 돌아오지 않는다", async () => {
  const w = await packWorld("환불사용");
  const order = await w.buy();
  const tag = randomUUID().slice(0, 8);
  assert.equal(await w.server.spendCash({ userId: w.U.id, amount: w.per, ref: `q-a-${tag}` }), 6);
  assert.equal(await w.server.spendCash({ userId: w.U.id, amount: w.per, ref: `q-b-${tag}` }), 3); // 2개 사용, 남은 질문 1개
  const r = await w.server.applyCashRefund({ orderId: order.id, canceledTotal: 1667 }); // 2개 환불
  assert.deepEqual(r, { status: "applied", questions: 2, refundedKrw: 1667, clawed: 1, shortfall: 1 }, "남은 1개만 회수하고 이미 쓴 1개는 회수하지 못한 몫");
  assert.equal(await w.balance(), 0);
  assert.equal((await w.ledger()).find((l) => l.kind === "refund_claw")?.shortfall, w.per);
  await w.consistent("쓴 질문까지 환불");

  // 답을 받지 못해 질문 하나를 되돌린다 → 이 묶음은 이미 (쓴 2 + 환불 2)로 산 질문 3개를 넘겨 정산돼 있어(모자란 몫 1) 되돌린 질문이 지갑에 다시 들어오지 않는다
  assert.equal(await w.server.restoreCashSpend({ userId: w.U.id, ref: `q-a-${tag}` }), 0, "환불이 이미 질문 2개를 정산했으므로 돌아오지 않는다");
  const pack = (await w.server.getQuestionPack(order.id))!;
  assert.deepEqual({ used: pack.used, rq: pack.refundedQuestions }, { used: 1, rq: 2 });
  assert.equal(await w.balance(), 0);
  await w.consistent("되돌림");

  // 같은 묶음을 전부 환불한다 — 남은 질문이 없으니 회수할 것은 없고, 쓴 질문(1개)이 환불에 포함돼 모자란 몫 1이 남는다. 이후 되돌려도 돌아오지 않는다
  assert.deepEqual(await w.server.applyCashRefund({ orderId: order.id, canceledTotal: 2500 }), { status: "applied", questions: 3, refundedKrw: 2500, clawed: 0, shortfall: 1 });
  assert.equal(await w.balance(), 0);
  assert.equal(await w.server.restoreCashSpend({ userId: w.U.id, ref: `q-b-${tag}` }), 0, "이미 환불받은 질문은 지갑에 다시 넣지 않는다");
  assert.equal(await w.balance(), 0);
  await w.consistent("전부 환불 뒤 되돌림");
  // 같은 되돌림을 다시 해도 아무 일도 없다
  assert.equal(await w.server.restoreCashSpend({ userId: w.U.id, ref: `q-b-${tag}` }), null);

  // 답을 기다리는 질문 1개가 있을 때 2개를 환불하면(남은 질문 2개 회수) 그 질문이 답을 받지 못해 되돌려지는 경우에는 1개가 돌아온다 — 환불 2 + 남은 1 = 3
  const x = await packWorld("환불중실패");
  const o2 = await x.buy();
  const tag2 = randomUUID().slice(0, 8);
  assert.equal(await x.server.spendCash({ userId: x.U.id, amount: x.per, ref: `q-w-${tag2}` }), 6); // 답을 기다리는 중
  assert.deepEqual(await x.server.applyCashRefund({ orderId: o2.id, canceledTotal: 1667 }), { status: "applied", questions: 2, refundedKrw: 1667, clawed: 2, shortfall: 0 });
  assert.equal(await x.balance(), 0);
  assert.equal(await x.server.restoreCashSpend({ userId: x.U.id, ref: `q-w-${tag2}` }), x.per, "답을 받지 못한 질문 1개는 돌아온다");
  const p2 = (await x.server.getQuestionPack(o2.id))!;
  assert.equal(p2.used + p2.refundedQuestions + (await x.balance()) / x.per, 3);
  await x.consistent("환불 중 실패");
});

test("묶음이 둘일 때(16번): 한 묶음을 환불해도 다른 묶음의 질문은 회수되지 않고, 질문은 먼저 산 묶음부터 쓰인다", async () => {
  const w = await packWorld("묶음둘");
  const tag = randomUUID().slice(0, 8);
  const a = await w.buy();
  for (let i = 0; i < 3; i++) assert.notEqual(await w.server.spendCash({ userId: w.U.id, amount: w.per, ref: `q-a${i}-${tag}` }), null);
  const b = await w.buy();
  assert.equal(await w.balance(), 9);
  // 묶음 A의 질문은 모두 썼고 묶음 B는 새 묶음이다 — A를 전액 환불해도 B의 질문은 그대로여야 한다 (예전 지갑 합계 방식이면 9단위가 회수됐다)
  assert.equal((await admin.from("orders").update({ status: "refunded" }).eq("id", a.id)).error, null);
  assert.equal(await w.balance(), 9, "묶음 B의 질문 3개는 그대로");
  const packA = (await w.server.getQuestionPack(a.id))!;
  const packB = (await w.server.getQuestionPack(b.id))!;
  assert.deepEqual({ used: packA.used, rq: packA.refundedQuestions }, { used: 3, rq: 3 });
  assert.deepEqual({ used: packB.used, rq: packB.refundedQuestions }, { used: 0, rq: 0 });
  assert.equal((await w.ledger()).find((l) => l.kind === "refund_claw")?.shortfall, 9, "묶음 A는 이미 다 써서 회수할 질문이 없고 환불받은 3개는 모자란 몫으로 남는다");
  assert.notEqual(await w.server.spendCash({ userId: w.U.id, amount: w.per, ref: `q-b0-${tag}` }), null);
  assert.equal((await w.server.getQuestionPack(b.id))?.used, 1, "새 질문은 남은 질문이 있는 묶음 B에서 쓰인다");
  await w.consistent("묶음 둘");
});

test("묶음 장부가 없는 예전 주문(16번 전에 결제): 전액 취소는 예전 방식(지갑 잔액 한도 안에서 회수)으로 동작하고, 부분 환불 함수는 no_pack으로 거절한다", async () => {
  const w = await packWorld("예전주문");
  const order = await w.buy();
  psqlRun(`delete from public.question_packs where order_id = '${order.id}'`); // 16번 전에 결제돼 묶음 장부가 없는 주문을 흉내 낸다
  assert.deepEqual(await w.server.applyCashRefund({ orderId: order.id, canceledTotal: 834 }), { status: "no-pack" });
  assert.equal(await w.balance(), 9, "묶음 장부가 없으면 부분 환불은 아무것도 바꾸지 않는다(운영자 확인)");
  assert.equal((await admin.from("orders").update({ status: "refunded" }).eq("id", order.id)).error, null);
  const claw = (await w.ledger()).find((l) => l.kind === "clawback");
  assert.equal(claw?.amount, -9, "예전 방식으로 지갑에서 회수");
  assert.equal(await w.balance(), 0);
});

test("실제 DB 동시성(16번): 같은 환불을 6번 동시에 반영해도 한 번만 회수하고, 환불과 질문 사용이 동시에 와도 어느 순서든 장부가 맞아떨어지며(음수 없음 · 내역 합계 = 잔액 · 쓴 + 환불 + 남은 − 모자란 몫 = 3)", async () => {
  // 같은 누적 환불액 6번 동시
  const w = await packWorld("환불동시");
  const order = await w.buy();
  const same = await Promise.all(Array.from({ length: 6 }, () => w.server.applyCashRefund({ orderId: order.id, canceledTotal: 834 })));
  assert.equal(same.filter((r) => r.status === "applied").length, 1, JSON.stringify(same));
  assert.equal(same.filter((r) => r.status === "already").length, 5);
  assert.equal(await w.balance(), 6);
  // 서로 다른 누적액(834 · 1,667 · 2,500)이 순서가 뒤바뀌어 동시에 와도 마지막 상태는 같다
  const mixed = await Promise.all([2500, 834, 1667, 2500, 1667].map((canceledTotal) => w.server.applyCashRefund({ orderId: order.id, canceledTotal })));
  assert.ok(mixed.every((r) => r.status === "applied" || r.status === "already"), JSON.stringify(mixed));
  const pack = (await w.server.getQuestionPack(order.id))!;
  assert.deepEqual({ rq: pack.refundedQuestions, krw: pack.refundedKrw }, { rq: 3, krw: 2500 });
  assert.equal(await w.balance(), 0);
  await w.consistent("같은 환불 동시");

  // 환불과 질문 사용이 동시에 — 서로 다른 시작 순서로 여러 번 시험한다
  for (let round = 0; round < 8; round++) {
    const x = await packWorld(`환불사용동시${round}`);
    const o = await x.buy();
    const tag = randomUUID().slice(0, 8);
    assert.notEqual(await x.server.spendCash({ userId: x.U.id, amount: x.per, ref: `q-0-${tag}` }), null); // 1개는 이미 사용
    const jobs: (() => Promise<unknown>)[] = [
      () => x.server.applyCashRefund({ orderId: o.id, canceledTotal: round % 2 === 0 ? 1667 : 2500 }), // 2개 또는 3개 환불
      () => x.server.spendCash({ userId: x.U.id, amount: x.per, ref: `q-1-${tag}` }),
      () => x.server.spendCash({ userId: x.U.id, amount: x.per, ref: `q-2-${tag}` }),
    ];
    const order = round % 3 === 0 ? [0, 1, 2] : round % 3 === 1 ? [1, 2, 0] : [2, 0, 1];
    await Promise.all(order.map((i) => jobs[i]()));
    const bal = await x.balance();
    const pk = (await x.server.getQuestionPack(o.id))!;
    const shortfallQ = (await x.ledger()).filter((l) => l.kind === "refund_claw").reduce((s, l) => s + l.shortfall, 0) / x.per;
    assert.ok(bal >= 0, `라운드 ${round}: 잔액이 음수가 되지 않는다`);
    assert.equal(pk.used + pk.refundedQuestions + bal / x.per - shortfallQ, 3, `라운드 ${round}: 쓴 ${pk.used} + 환불 ${pk.refundedQuestions} + 남은 ${bal / x.per} − 모자란 몫 ${shortfallQ} = 3`);
    await x.consistent(`라운드 ${round}`);
    // 환불 뒤 남은 질문은 환불받지 않은 질문뿐이다
    assert.ok(bal / x.per <= 3 - pk.refundedQuestions, `라운드 ${round}: 환불받은 질문이 남아 있다`);
  }
});

test("운영자 수동 반영(15번 함수)도 묶음 장부를 함께 만든다 — 트리거가 일을 못 한 주문에 한 번만, 묶음 한 줄", async () => {
  const w = await packWorld("수동묶음");
  const inserted = await w.server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: w.U.id, assessmentId: w.aid, productId: questionProductId(createQuestionNonce("love")), amount: questionQuote().priceKrw, paymentEnv: "test" });
  assert.ok(inserted.ok);
  const order = inserted.ok ? inserted.value : null!;
  psqlRun("alter table public.orders disable trigger orders_cash_change");
  try {
    assert.equal((await admin.from("orders").update({ status: "paid", approved_at: new Date().toISOString() }).eq("id", order.id)).error, null);
  } finally {
    psqlRun("alter table public.orders enable trigger orders_cash_change");
  }
  assert.equal(await w.server.getQuestionPack(order.id), null, "트리거가 일을 못 해 묶음 장부가 없다");
  assert.equal(await w.server.adminCreditQuestion(order.id), "credited");
  const pack = await w.server.getQuestionPack(order.id);
  assert.deepEqual(pack && { q: pack.questions, price: pack.priceKrw }, { q: 3, price: 2500 });
  assert.equal(await w.server.adminCreditQuestion(order.id), "already");
  assert.equal(psqlRun(`select count(*) from public.question_packs where order_id = '${order.id}'`), "1");
  // 반영한 묶음도 부분 환불을 받는다
  assert.equal((await w.server.applyCashRefund({ orderId: order.id, canceledTotal: 834 })).status, "applied");
  assert.equal(await w.balance(), 6);
});

test("무료 질문 예약(16번): 같은 회원 · 같은 방에 동시에 8개가 와도 정확히 한도만큼만 예약되고(여러 서버 흉내), 풀면 다시 열리며, 오래된 예약은 세지 않고, 확정하면 센다", async () => {
  const U = await makeUser();
  const V = await makeUser();
  const server = createSupabaseRepository(admin);
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "예약시험" }, answers, today: new Date() });
  assert.ok(saved.ok);
  const aid = saved.ok ? saved.assessment.id : "";
  const savedV = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: V.id, channel: "web", info: { ...info, nickname: "예약시험2" }, answers, today: new Date() });
  assert.ok(savedV.ok);
  const vid = savedV.ok ? savedV.assessment.id : "";
  const room = "love";

  // 동시에 8개 — 한도 3개만 예약된다
  const raced = await Promise.all(Array.from({ length: 8 }, () => server.reserveChatQuestion({ userId: U.id, assessmentId: aid, roomKey: room, max: 3 })));
  const got = raced.filter((r) => r !== null);
  assert.equal(got.length, 3, `동시에 8번 요청해도 3개만: ${JSON.stringify(raced)}`);
  assert.ok(got.every((r) => typeof r!.id === "number"));
  assert.equal(await server.countChatQuestionsInRoom(U.id, room), 3, "예약도 자리를 차지한 것으로 센다");
  assert.equal(await server.reserveChatQuestion({ userId: U.id, assessmentId: aid, roomKey: room, max: 3 }), null);

  // 다른 방 · 다른 회원은 따로다
  assert.ok(await server.reserveChatQuestion({ userId: U.id, assessmentId: aid, roomKey: "worry", max: 1 }));
  assert.ok(await server.reserveChatQuestion({ userId: V.id, assessmentId: vid, roomKey: room, max: 1 }));

  // 풀면 다시 열린다 — 남의 예약은 풀 수 없다
  await server.releaseChatQuestion(got[0]!, { userId: V.id });
  assert.equal(await server.countChatQuestionsInRoom(U.id, room), 3, "다른 회원이 풀려고 해도 풀리지 않는다");
  await server.releaseChatQuestion(got[0]!, { userId: U.id });
  assert.equal(await server.countChatQuestionsInRoom(U.id, room), 2);
  const again = await server.reserveChatQuestion({ userId: U.id, assessmentId: aid, roomKey: room, max: 3 });
  assert.ok(again);

  // 확정하면 계속 센다(같은 확정을 두 번 해도 한 번)
  await server.confirmChatQuestion(got[1]!, { userId: U.id, assessmentId: aid, roomKey: room });
  await server.confirmChatQuestion(got[1]!, { userId: U.id, assessmentId: aid, roomKey: room });
  assert.equal(psqlRun(`select count(*) from public.chat_questions where user_id = '${U.id}' and room_key = '${room}' and state = 'done'`), "1");
  assert.equal(await server.countChatQuestionsInRoom(U.id, room), 3);

  // 오래된 예약(서버가 죽어 남은 것)은 세지 않고 다음 예약 때 정리된다 — 영원히 잠기지 않는다
  psqlRun(`update public.chat_questions set reserved_until = now() - interval '1 minute' where user_id = '${U.id}' and room_key = '${room}' and state = 'reserved'`);
  assert.equal(await server.countChatQuestionsInRoom(U.id, room), 1, "확정된 1개만 센다");
  assert.ok(await server.reserveChatQuestion({ userId: U.id, assessmentId: aid, roomKey: room, max: 3 }));
  assert.equal(psqlRun(`select count(*) from public.chat_questions where user_id = '${U.id}' and room_key = '${room}' and state = 'reserved' and reserved_until <= now()`), "0", "만료된 예약은 지워졌다");

  // 만료돼 지워진 예약이라도 답을 받은 질문은 센다
  const ghost = { id: 999999999 };
  await server.confirmChatQuestion(ghost, { userId: U.id, assessmentId: aid, roomKey: room });
  assert.equal(psqlRun(`select count(*) from public.chat_questions where user_id = '${U.id}' and room_key = '${room}' and state = 'done'`), "2");

  // 질문 내용을 담는 열이 없고, 브라우저는 읽지도 풀지도 못한다
  const seen = await U.client.from("chat_questions").select();
  assert.ok(seen.error || (seen.data ?? []).length === 0);
  const call = await U.client.rpc("release_chat_question", { p_id: got[2]!.id, p_user_id: U.id });
  assert.ok(call.error, "브라우저는 예약 함수를 부를 수 없다");
});

test("16번을 적용하기 전 환경(함수 · 열 없음)에서도 앱이 멈추지 않는다 — 예약은 예전 방식({ id: null })으로, 부분 환불은 unavailable로 알려 준다", async () => {
  const w = await packWorld("예전환경");
  const order = await w.buy();
  // 저장소가 보는 DB를 흉내 낸다: 함수가 없다는 응답(PGRST202)을 돌려주는 클라이언트
  const missing = { code: "PGRST202", message: "Could not find the function public.reserve_chat_question in the schema cache" };
  const fakeAdmin = new Proxy(admin, {
    get(target, prop, receiver) {
      if (prop === "rpc") return async (name: string) => (["reserve_chat_question", "apply_cash_refund", "count_chat_questions_in_room"].includes(name) ? { data: null, error: missing } : { data: null, error: { code: "x", message: "unexpected" } });
      return Reflect.get(target, prop, receiver);
    },
  }) as SupabaseClient;
  const old = createSupabaseRepository(fakeAdmin);
  assert.deepEqual(await old.reserveChatQuestion({ userId: w.U.id, assessmentId: w.aid, roomKey: "love", max: 2 }), { id: null });
  assert.deepEqual(await old.applyCashRefund({ orderId: order.id, canceledTotal: 834 }), { status: "unavailable" });
  assert.equal(await old.countChatQuestionsInRoom(w.U.id, "love"), 0, "함수가 없으면 예전 방식으로 센다");
});

test("남은 질문이 있는 묶음 목록(정기 점검 · 질문 사용 전 확인): 회원별로 나뉘고, 다 쓴 묶음 · 환불로 정산된 묶음 · 환불된 주문은 빠지며, 오래된 순으로 나온다", async () => {
  const a = await packWorld("열린묶음A");
  const b = await packWorld("열린묶음B");
  const first = await a.buy();
  const second = await a.buy();
  const other = await b.buy();
  // (시험 DB에는 다른 시험에서 남은 묶음이 많을 수 있어 전체 목록은 한도를 크게 잡는다)
  const ids = async (userId?: string) => (await a.server.listOrdersWithOpenPacks({ ...(userId ? { userId } : {}), limit: 1000 })).map((o) => o.id);

  assert.deepEqual(await ids(a.U.id), [first.id, second.id], "내 묶음 둘 — 오래된 순");
  assert.deepEqual(await ids(b.U.id), [other.id], "다른 회원의 묶음은 섞이지 않는다");
  const all = await ids();
  for (const id of [first.id, second.id, other.id]) assert.ok(all.includes(id), "전체 목록(정기 점검)에는 모두 있다");

  // 가장 먼저 산 묶음을 모두 쓰면 목록에서 빠진다 (질문은 먼저 산 묶음부터 쓰인다)
  for (let i = 0; i < 3; i++) assert.notEqual(await a.server.spendCash({ userId: a.U.id, amount: a.per, ref: `list-use-${randomUUID().slice(0, 8)}` }), null);
  assert.deepEqual(await ids(a.U.id), [second.id]);

  // 전액 환불로 정산된 묶음(주문이 환불됨)은 빠진다
  assert.ok(await a.server.updateOrder(second.id, ["paid"], { status: "refunded" }));
  assert.deepEqual(await ids(a.U.id), []);
  // limit 안에서 자른다
  assert.deepEqual((await b.server.listOrdersWithOpenPacks({ userId: b.U.id, limit: 0 })).length, 0);

  // 정리: 남은 질문을 써서 다른 시험(탈퇴 등)에 영향을 주지 않게 한다
  await b.server.spendCash({ userId: b.U.id, amount: b.per * 3, ref: `list-clean-${randomUUID().slice(0, 8)}` });
});

// ───────────── 계좌 송금 환불 절차(운영자가 SQL Editor에서 실행하는 두 파일) ─────────────

// (이 파일의 URL 변수가 전역 URL을 가리므로 경로는 import.meta.dirname으로 만든다)
const SQL_DIR = join(import.meta.dirname, "..");
const psqlFile = (sql: string): string => {
  const file = join(mkdtempSync(join(tmpdir(), "miyu-sql-")), "run.sql");
  writeFileSync(file, sql, "utf8");
  return execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-tA", "-F", "|", "-f", file], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
};
const checkSql = (orderNumber: string) => readFileSync(join(SQL_DIR, "manual-refund-check.sql"), "utf8").replaceAll("'여기에_주문번호'", `'${orderNumber}'`);
const applySql = (orderNumber: string, questions: number, memo: string) =>
  readFileSync(join(SQL_DIR, "manual-refund-apply.sql"), "utf8")
    .replaceAll("'여기에_주문번호'", `'${orderNumber}'`)
    .replace(/p_questions\s+int\s+:=\s+\d+;/, `p_questions int := ${questions};`)
    .replace(/p_memo\s+text\s+:=\s+'[^']*';/, `p_memo text := '${memo}';`);
const failure = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return String((e as { stderr?: string }).stderr ?? e);
  }
  return "";
};

test("계좌 송금 환불(결제사 취소가 안 될 때): 확인 파일이 보낼 금액을 보여 주고, 반영 파일이 묶음 장부 · 지갑 · 운영 기록을 한 번에 맞추며, 누적 송금액이 정확히 결제액(2,500원)이 된다", async () => {
  const w = await packWorld("송금환불");
  const order = await w.buy();
  const user = w.U.id;

  // ① 확인: 보낼 금액표 (질문 1개 834 · 2개 1667 · 3개 2500)
  const before = psqlFile(checkSql(order.orderNumber));
  assert.match(before, new RegExp(`${order.orderNumber} · paid · 2500원`));
  assert.match(before, /3 · 0 · 0 · 3/, "질문 수 · 쓴 질문 · 환불한 질문 · 남은 질문");
  assert.match(before, /질문 1개를 환불하려면 보낼 금액.*\|834원/);
  assert.match(before, /질문 2개를 환불하려면 보낼 금액.*\|1667원/);
  assert.match(before, /질문 3개를 환불하려면 보낼 금액.*\|2500원/);
  assert.ok(!before.includes("지난 송금 환불 기록") || !/\|지난 송금 환불 기록\|/.test(before), "아직 송금 환불 기록이 없다");

  // ③ 반영: 1개 (834원) — 날짜가 들어간 메모는 통과한다
  psqlFile(applySql(order.orderNumber, 1, "송금 2026-10-17 · 접수 3번"));
  let pack = await w.server.getQuestionPack(order.id);
  assert.deepEqual(pack && { rq: pack.refundedQuestions, krw: pack.refundedKrw, used: pack.used }, { rq: 1, krw: 834, used: 0 });
  assert.equal(await w.balance(), 6, "지갑에서 질문 1개(3단위)를 회수했다");
  assert.equal((await w.server.getOrderByNumber(order.orderNumber))?.status, "paid", "주문 상태는 바꾸지 않는다");
  const events = await w.server.listOpsEvents({ orderNumber: order.orderNumber, kinds: ["admin.manual_refund"], limit: 5 });
  assert.equal(events.length, 1);
  assert.match(events[0].message, /접수 3번/);
  assert.deepEqual({ q: events[0].detail.questions, sent: events[0].detail.sentKrw, cum: events[0].detail.cumulativeKrw, clawed: events[0].detail.clawed }, { q: 1, sent: 834, cum: 834, clawed: 1 });
  await w.consistent("송금 환불 1개");

  // ④ 다시 확인: 남은 질문 2개 · 다음 송금액 833 · 1666 · 지난 기록이 보인다
  const mid = psqlFile(checkSql(order.orderNumber));
  assert.match(mid, /3 · 0 · 1 · 2/);
  assert.match(mid, /질문 1개를 환불하려면 보낼 금액.*\|833원/);
  assert.match(mid, /질문 2개를 환불하려면 보낼 금액.*\|1666원/);
  assert.match(mid, /지난 송금 환불 기록\|.*질문 1개 · 834원/);

  // 남은 2개를 마저 환불 — 누적 송금액이 정확히 결제액
  psqlFile(applySql(order.orderNumber, 2, "나머지 환불 접수 4번"));
  pack = await w.server.getQuestionPack(order.id);
  assert.deepEqual(pack && { rq: pack.refundedQuestions, krw: pack.refundedKrw }, { rq: 3, krw: 2500 });
  assert.equal(await w.balance(), 0);
  const all = await w.server.listOpsEvents({ orderNumber: order.orderNumber, kinds: ["admin.manual_refund"], limit: 5 });
  assert.equal(all.reduce((sum, e) => sum + Number(e.detail.sentKrw), 0), 2500, "송금 기록의 합 = 결제액 (834 + 1666)");
  await w.consistent("송금 환불 전부");

  // 더 환불할 질문이 없으면 거부하고 아무것도 바꾸지 않는다
  assert.match(failure(() => psqlFile(applySql(order.orderNumber, 1, "한 번 더"))), /환불할 수 있는 질문은 0 개까지/);
  assert.equal((await w.server.getQuestionPack(order.id))?.refundedKrw, 2500);
  assert.equal((await w.server.listOpsEvents({ orderNumber: order.orderNumber, kinds: ["admin.manual_refund"], limit: 5 })).length, 2);
  assert.equal(user.length > 0, true);
});

test("계좌 송금 환불은 잘못된 입력을 거부하고 아무것도 바꾸지 않는다: 계좌번호 · 전화번호가 든 메모 · 없는 주문 · 질문 묶음이 아닌 주문 · 환불된 주문 · 0개", async () => {
  const w = await packWorld("송금환불거부");
  const order = await w.buy();
  const snapshot = async () => ({ pack: await w.server.getQuestionPack(order.id), balance: await w.balance(), events: (await w.server.listOpsEvents({ orderNumber: order.orderNumber, kinds: ["admin.manual_refund"], limit: 5 })).length });
  const start = await snapshot();

  assert.match(failure(() => psqlFile(applySql(order.orderNumber, 1, "국민 110-123-456789 로 송금"))), /계좌번호 · 전화번호는 적지 마세요/);
  assert.match(failure(() => psqlFile(applySql(order.orderNumber, 1, "연락처 01012345678"))), /계좌번호 · 전화번호는 적지 마세요/);
  assert.match(failure(() => psqlFile(applySql(order.orderNumber, 0, "개수 0"))), /1 이상/);
  assert.match(failure(() => psqlFile(applySql(order.orderNumber, 4, "너무 많이"))), /3 개까지 남았는데 4 개/);
  assert.match(failure(() => psqlFile(applySql("MEU-NOPE-000000", 1, "없는 주문"))), /찾지 못했습니다/);
  assert.deepEqual(await snapshot(), start, "거부된 요청은 아무것도 바꾸지 않았다");

  // 질문 묶음이 아닌 주문(개인 통합 리포트) · 환불된 주문
  const personal = await w.server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: w.U.id, assessmentId: w.aid, productId: "personal-integrated-report", amount: 9900, paymentEnv: "test" });
  assert.ok(personal.ok);
  if (personal.ok) {
    await w.server.updateOrder(personal.value.id, ["pending"], { status: "paid", paymentKey: `pk-${randomUUID()}`, approvedAt: new Date().toISOString() });
    assert.match(failure(() => psqlFile(applySql(personal.value.orderNumber, 1, "리포트 주문"))), /질문 묶음 주문이 아닙니다/);
  }
  const second = await w.buy();
  await w.server.updateOrder(second.id, ["paid"], { status: "refunded" });
  assert.match(failure(() => psqlFile(applySql(second.orderNumber, 1, "이미 환불됨"))), /결제 완료 주문이 아닙니다/);

  // 확인 파일은 없는 주문번호에서 "찾지 못했습니다"를 보여 준다
  assert.match(psqlFile(checkSql("MEU-NOPE-000000")), /이 주문번호를 찾지 못했습니다/);
  // 정리: 남은 질문을 써서 다른 시험에 영향을 주지 않게 한다
  await w.server.spendCash({ userId: w.U.id, amount: w.per * 3, ref: `mr-clean-${randomUUID().slice(0, 8)}` });
});

test("계좌 송금 환불 뒤에도 결제 재확인(대조)이 이상으로 보지 않는다: 토스 기록은 결제 완료(DONE) 그대로라 ok이고, 장부의 환불 반영은 되돌려지지 않는다", async () => {
  const w = await packWorld("송금환불대조");
  const order = await w.buy();
  psqlFile(applySql(order.orderNumber, 1, "송금 완료"));
  const toss = createFakeToss(() => new Date());
  // 토스에는 같은 주문의 결제가 승인(DONE) 상태로 남아 있다
  toss.approveBehindOurBack(`pk-manual-${randomUUID().slice(0, 6)}`, order.orderNumber, order.amount);
  const fresh = (await w.server.getOrderById(order.id))!;
  const out = await reconcileOrder({ repo: w.server, gateway: toss.gateway, now: () => new Date() }, { ...fresh, paymentKey: null });
  assert.equal(out.kind, "ok");
  assert.equal((await w.server.getQuestionPack(order.id))?.refundedQuestions, 1);
  assert.equal(await w.balance(), 6);
  await w.server.spendCash({ userId: w.U.id, amount: w.per * 2, ref: `mr-clean-${randomUUID().slice(0, 8)}` });
});

test("맛보기 리포트(17번): 한 계정당 한 줄 — 동시에 8번 눌러도 한 번만 예약되고, 저장하면 다시 받을 수 없으며, 풀면 다시 열리고, 본인만 읽고 쓰기는 서버만 한다", async () => {
  const U = await makeUser();
  const V = await makeUser();
  const server = createSupabaseRepository(admin);
  const savedU = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "맛보기" }, answers, today: new Date() });
  const savedU2 = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "맛보기2" }, answers, today: new Date() });
  const savedV = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: V.id, channel: "web", info: { ...info, nickname: "맛보기3" }, answers, today: new Date() });
  assert.ok(savedU.ok && savedU2.ok && savedV.ok);
  const a1 = savedU.ok ? savedU.assessment.id : "";
  const a2 = savedU2.ok ? savedU2.assessment.id : "";
  const av = savedV.ok ? savedV.assessment.id : "";

  assert.equal(await server.getTasteReport(U.id), null);
  // 동시에 8번 — 정확히 한 번만 예약되고 나머지는 "쓰는 중"
  const raced = await Promise.all(Array.from({ length: 8 }, () => server.reserveTasteReport({ userId: U.id, assessmentId: a1 })));
  assert.equal(raced.filter((r) => r.state === "reserved").length, 1, JSON.stringify(raced));
  assert.equal(raced.filter((r) => r.state === "busy").length, 7);
  assert.equal(psqlRun(`select count(*) from public.taste_reports where user_id = '${U.id}'`), "1");

  // 풀면 다시 열린다 — 남의 검사에는 붙지 않는다(소유자 확인)
  await server.releaseTasteReport({ userId: U.id, assessmentId: a1 });
  assert.equal(await server.getTasteReport(U.id), null);
  await assert.rejects(server.reserveTasteReport({ userId: U.id, assessmentId: av }), /./);
  assert.deepEqual(await server.reserveTasteReport({ userId: U.id, assessmentId: a1 }), { state: "reserved" });

  // 저장하면 끝 — 다시 받을 수 없고, 다른 검사에서도 받을 수 없다(예약 시 ready로 돌아온다)
  const content = { version: "taste-v1", headline: "시험 제목", sections: [{ id: "self", title: "t", body: "b" }] };
  await server.saveTasteReport({ userId: U.id, assessmentId: a1, content, generator: "test:m", generatorVersion: "taste-v1-prompt-0.1" });
  const ready = await server.reserveTasteReport({ userId: U.id, assessmentId: a2 });
  assert.ok(ready.state === "ready" && ready.record.assessmentId === a1 && (ready.record.content as { headline: string }).headline === "시험 제목");
  await server.releaseTasteReport({ userId: U.id, assessmentId: a1 });
  assert.equal((await server.getTasteReport(U.id))?.status, "ready", "완성된 줄은 풀어도 지워지지 않는다");
  await assert.rejects(server.saveTasteReport({ userId: V.id, assessmentId: av, content, generator: "x", generatorVersion: "y" }), /./);

  // 서버가 죽어 남은 예약은 5분 뒤 이어받는다
  assert.deepEqual(await server.reserveTasteReport({ userId: V.id, assessmentId: av }), { state: "reserved" });
  assert.deepEqual(await server.reserveTasteReport({ userId: V.id, assessmentId: av }), { state: "busy" });
  psqlRun(`update public.taste_reports set reserved_until = now() - interval '1 minute' where user_id = '${V.id}'`);
  assert.deepEqual(await server.reserveTasteReport({ userId: V.id, assessmentId: av }), { state: "reserved" });

  // 접근 정책: 본인 줄만 읽고, 브라우저는 쓰기 · 함수 호출을 할 수 없다
  const mine = await U.client.from("taste_reports").select("user_id, status").eq("user_id", U.id);
  assert.equal(mine.data?.length, 1);
  const others = await V.client.from("taste_reports").select("user_id").eq("user_id", U.id);
  assert.equal(others.data?.length ?? 0, 0, "다른 회원의 맛보기 리포트는 보이지 않는다");
  const write = await U.client.from("taste_reports").update({ status: "pending" }).eq("user_id", U.id).select();
  assert.ok(write.error || (write.data ?? []).length === 0, "브라우저는 고칠 수 없다");
  const forged = await U.client.from("taste_reports").insert({ user_id: U.id, assessment_id: a1, status: "pending" });
  assert.ok(forged.error, "브라우저는 새 줄을 만들 수 없다");
  const call = await U.client.rpc("reserve_taste_report", { p_user_id: U.id, p_assessment_id: a1 });
  assert.ok(call.error, "브라우저는 예약 함수를 부를 수 없다");
  const anonRead = await anon.from("taste_reports").select("user_id");
  assert.ok(anonRead.error || (anonRead.data ?? []).length === 0, "비로그인은 읽을 수 없다");
  // 용량 제한(32KB)
  assert.throws(() => psqlRun(`update public.taste_reports set content = jsonb_build_object('x', repeat('가', 40000)) where user_id = '${U.id}'`), /check|violat/i);
});

test("17번을 적용하기 전 환경(표 · 함수 없음)에서도 앱이 멈추지 않는다 — 저장소가 42P01로 통일해 알리고, 서비스는 '준비 중'으로 닫고 결과 화면은 그대로다", async () => {
  const U = await makeUser();
  const server = createSupabaseRepository(admin);
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname: "예전환경2" }, answers, today: new Date() });
  assert.ok(saved.ok);
  const aid = saved.ok ? saved.assessment.id : "";
  // 표 · 함수가 없다는 응답(PostgREST: 표 PGRST205 · 함수 PGRST202)을 돌려주는 클라이언트
  const noTable = { code: "PGRST205", message: "Could not find the table 'public.taste_reports' in the schema cache" };
  const noFn = { code: "PGRST202", message: "Could not find the function public.reserve_taste_report in the schema cache" };
  const fakeBuilder = { select: () => fakeBuilder, eq: () => fakeBuilder, maybeSingle: async () => ({ data: null, error: noTable, status: 404 }) };
  const fakeAdmin = new Proxy(admin, {
    get(target, prop, receiver) {
      if (prop === "from") return (table: string) => (table === "taste_reports" ? fakeBuilder : target.from(table));
      if (prop === "rpc") return async (name: string) => (name.endsWith("_taste_report") ? { data: null, error: noFn } : { data: null, error: { code: "x", message: "unexpected" } });
      return Reflect.get(target, prop, receiver);
    },
  }) as SupabaseClient;
  const old = createSupabaseRepository(fakeAdmin);
  await assert.rejects(old.getTasteReport(U.id), (e: unknown) => (e as { code?: string }).code === "42P01");
  await assert.rejects(old.reserveTasteReport({ userId: U.id, assessmentId: aid }), (e: unknown) => (e as { code?: string }).code === "42P01");
  // 서비스는 닫고(not-ready), 결과 화면용 상태는 unavailable이다
  const { requestTasteReport, tasteStateFor } = await import("../../lib/services/taste-service.ts");
  const { createTasteWriter } = await import("../../lib/report/taste/writer.ts");
  const { createMockTasteModel } = await import("../../lib/report/taste/mock-model.ts");
  const writer = createTasteWriter({ model: createMockTasteModel(), maxRetries: 0, sleep: async () => {} });
  const input = { profile: { saju: ["큰 강처럼 넓게 흐르는 사람이에요"], response: [] }, answers: [] };
  const result = await requestTasteReport({ repo: old, writer, now: () => new Date(), loadInput: async () => ({ ok: true, input }) }, { userId: U.id, assessmentId: aid });
  assert.ok(!result.ok && result.reason === "not-ready");
  assert.deepEqual(await tasteStateFor(old, U.id, aid), { kind: "unavailable" });
});

// ─── 초대 링크 · 초대 할인(18번) ───
async function inviteWorld() {
  const server = createSupabaseRepository(admin);
  const person = async (nickname: string) => {
    const U = await makeUser();
    const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info: { ...info, nickname }, answers, today: new Date() });
    assert.ok(saved.ok);
    return { U, aid: saved.ok ? saved.assessment.id : "" };
  };
  /** 심층 리포트를 결제까지 마친 사람 */
  const payer = async (nickname: string, inviteToken?: string) => {
    const p = await person(nickname);
    const started = await startCheckout({ repo: server, now: () => new Date() }, { userId: p.U.id, assessmentId: p.aid, inviteToken });
    assert.equal(started.kind, "order");
    if (started.kind !== "order") throw new Error("order");
    const paid = await confirmPayment({ repo: server, gateway }, { userId: p.U.id, orderNumber: started.order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: started.order.amount });
    assert.equal(paid.kind, "paid");
    return { ...p, order: started.order, discounted: started.discounted === true };
  };
  const link = async (p: { U: { id: string }; aid: string }) => {
    const r = await createInviteLink(server, { userId: p.U.id, assessmentId: p.aid });
    assert.ok(r.ok && r.view.token);
    return r.ok ? r.view.token! : "";
  };
  return { server, person, payer, link };
}

test("초대 할인(18번): 링크는 구매한 사람만 · 결과마다 하나, 첫 구매만 5,900원(결제까지 승인), 정가는 그대로이며, 브라우저는 읽기만(본인 링크) 하고 함수는 부를 수 없다", async () => {
  const w = await inviteWorld();
  const free = await w.person("무료만");
  assert.deepEqual(await createInviteLink(w.server, { userId: free.U.id, assessmentId: free.aid }), { ok: false, reason: "not-paid" });
  const inviter = await w.payer("초대자");
  assert.equal(inviter.order.amount, 9900, "초대 링크 없이는 정가");
  const token = await w.link(inviter);
  assert.equal(await w.link(inviter), token, "두 번 눌러도 같은 링크");
  assert.equal(psqlRun(`select count(*) from public.invites where inviter_user_id = '${inviter.U.id}'`), "1");

  const friend = await w.payer("초대받은친구", token);
  assert.equal(friend.discounted, true);
  assert.equal(friend.order.amount, INVITE_DISCOUNT.priceKrw);
  assert.equal(psqlRun(`select amount from public.orders where id = '${friend.order.id}'`), "5900");
  assert.equal(psqlRun(`select status from public.orders where id = '${friend.order.id}'`), "paid");
  assert.equal(await w.server.countInviteDiscountsUsed(inviter.U.id), 1);
  const view = await getInviteView(w.server, { userId: inviter.U.id, assessmentId: inviter.aid });
  assert.ok(view.kind === "available" && view.used === 1 && view.cap === 3);

  // 같은 친구가 다른 결과로 다시 와도 정가(첫 구매 1회)
  const second = await w.server.insertAssessment({ userId: friend.U.id, channel: "web", nickname: "친구2", calendar: "solar", isLeapMonth: false, birthYear: 1990, birthMonth: 1, birthDay: 15, birthTime: null, knownMbti: null, answers, contentVersion: "t", source: "dev-scoring", summary: {}, saju: { status: "not-connected" } } as never);
  assert.deepEqual(await quoteInviteDiscount(w.server, { token, userId: friend.U.id }), { kind: "none", reason: "already-used" });
  const again = await startCheckout({ repo: w.server, now: () => new Date() }, { userId: friend.U.id, assessmentId: second.id, inviteToken: token });
  assert.ok(again.kind === "order" && !again.discounted && again.order.amount === 9900);

  // 접근 정책: 초대한 사람만 자기 링크를 읽고, 다른 회원 · 비로그인은 읽지 못하며, 쓰기 · 함수 호출은 서버만
  const mine = await inviter.U.client.from("invites").select("token").eq("assessment_id", inviter.aid);
  assert.equal(mine.data?.length, 1);
  const others = await friend.U.client.from("invites").select("token");
  assert.equal(others.data?.length ?? 0, 0, "다른 회원은 남의 링크를 읽지 못한다");
  assert.ok((await anon.from("invites").select("token")).error || ((await anon.from("invites").select("token")).data ?? []).length === 0);
  const write = await inviter.U.client.from("invites").insert({ token: createInviteToken(), inviter_user_id: inviter.U.id, assessment_id: free.aid, inviter_tier: "deep" });
  assert.ok(write.error, "브라우저는 링크를 직접 만들 수 없다");
  const seen = await friend.U.client.from("invite_discounts").select();
  assert.ok(seen.error || (seen.data ?? []).length === 0, "할인 기록은 브라우저가 읽지 못한다");
  for (const [fn, args] of [
    ["invite_discount_status", { p_token: token, p_invitee: friend.U.id, p_cap: 3 }],
    ["claim_invite_discount", { p_token: token, p_invitee: friend.U.id, p_order: friend.order.id, p_cap: 3 }],
  ] as const) {
    assert.ok((await friend.U.client.rpc(fn, args)).error, `${fn}: 로그인 회원도 부를 수 없다`);
    assert.ok((await anon.rpc(fn, args)).error, `${fn}: 비로그인도 부를 수 없다`);
  }
  // 다른 사람의 결과에는 링크를 붙일 수 없다(DB 트리거)
  assert.throws(() => psqlRun(`insert into public.invites (token, inviter_user_id, assessment_id, inviter_tier) values ('${createInviteToken()}', '${friend.U.id}', '${inviter.aid}', 'deep')`), /owner mismatch/);
  // 토큰 모양 검사
  assert.throws(() => psqlRun(`insert into public.invites (token, inviter_user_id, assessment_id, inviter_tier) values ('short', '${free.U.id}', '${free.aid}', 'deep')`), /check/i);
});

test("초대 할인 한도(18번): 같은 링크로 동시에 8명이 시작해도 정확히 3명만 5,900원이고 나머지는 정가 주문이 남는다 (여러 서버 흉내)", async () => {
  const w = await inviteWorld();
  const inviter = await w.payer("초대자2");
  const token = await w.link(inviter);
  const people = await Promise.all(Array.from({ length: 8 }, (_, i) => w.person(`동시${i}`)));
  const results = await Promise.all(people.map((p) => startCheckout({ repo: w.server, now: () => new Date() }, { userId: p.U.id, assessmentId: p.aid, inviteToken: token })));
  const orders = results.map((r) => (r.kind === "order" ? r : null));
  assert.ok(orders.every(Boolean));
  const discounted = orders.filter((r) => r!.discounted);
  assert.equal(discounted.length, 3, `할인 ${discounted.length}명: ${JSON.stringify(orders.map((r) => r!.order.amount))}`);
  assert.ok(discounted.every((r) => r!.order.amount === 5900));
  assert.ok(orders.filter((r) => !r!.discounted).every((r) => r!.order.amount === 9900));
  assert.equal(psqlRun(`select count(*) from public.invite_discounts where inviter_user_id = '${inviter.U.id}'`), "3");
  // 취소된 할인 주문(확정하지 못한 쪽)이 5,900원 그대로 결제되지 못한다: 5,900원 대기 주문은 확정된 3개뿐
  assert.equal(psqlRun(`select count(*) from public.orders o join public.assessments a on a.id = o.assessment_id where o.user_id = a.user_id and o.amount = 5900 and o.status = 'pending' and o.user_id in (${people.map((p) => `'${p.U.id}'`).join(",")})`), "3");
  assert.equal(await w.server.countInviteDiscountsUsed(inviter.U.id), 3);
});

test("초대 할인(18번): 본인 링크 · 이미 정가로 산 사람 · 초대한 사람의 환불 · 오래된 대기 주문 정리 · 환불로 돌아온 자리", async () => {
  const w = await inviteWorld();
  const inviter = await w.payer("초대자3");
  const token = await w.link(inviter);
  // 본인 링크
  assert.deepEqual(await quoteInviteDiscount(w.server, { token, userId: inviter.U.id }), { kind: "none", reason: "self" });
  // 이미 정가로 산 사람
  const old = await w.payer("정가구매");
  assert.deepEqual(await quoteInviteDiscount(w.server, { token, userId: old.U.id }), { kind: "none", reason: "not-first" });
  // 한도 3명(대기)
  const three = await Promise.all([w.person("a"), w.person("b"), w.person("c")]);
  const started = [] as { orderId: string; userId: string }[];
  for (const p of three) {
    const r = await startCheckout({ repo: w.server, now: () => new Date() }, { userId: p.U.id, assessmentId: p.aid, inviteToken: token });
    assert.ok(r.kind === "order" && r.discounted);
    if (r.kind === "order") started.push({ orderId: r.order.id, userId: p.U.id });
  }
  const fourth = await w.person("d");
  assert.deepEqual(await quoteInviteDiscount(w.server, { token, userId: fourth.U.id }), { kind: "none", reason: "cap" });
  // 첫 번째 대기 주문이 1시간을 넘기면 자리를 세지 않고, 네 번째 사람이 시작할 때 그 주문은 취소된다
  psqlRun(`update public.orders set created_at = now() - interval '2 hours' where id = '${started[0].orderId}'`);
  assert.equal(await w.server.countInviteDiscountsUsed(inviter.U.id), 2);
  const late = await startCheckout({ repo: w.server, now: () => new Date() }, { userId: fourth.U.id, assessmentId: fourth.aid, inviteToken: token });
  assert.ok(late.kind === "order" && late.discounted);
  const stale = psqlRun(`select status || ':' || coalesce(failure_code, '') from public.orders where id = '${started[0].orderId}'`);
  assert.equal(stale, "canceled:DISCOUNT_STALE");
  // 같은 사람이 다시 시작하면 이전 대기 주문은 취소되고 자리는 하나
  const again = await startCheckout({ repo: w.server, now: () => new Date() }, { userId: three[1].U.id, assessmentId: three[1].aid, inviteToken: token });
  assert.ok(again.kind === "order" && again.discounted);
  assert.equal(psqlRun(`select count(*) from public.invite_discounts where invitee_user_id = '${three[1].U.id}'`), "1");
  assert.equal(psqlRun(`select count(*) from public.orders where id = '${started[1].orderId}' and status = 'canceled'`), "1");
  // 초대한 사람이 환불되면 링크의 할인이 멈춘다
  const fifth = await w.person("e");
  psqlRun(`update public.orders set status = 'refunded' where id = '${inviter.order.id}'`);
  assert.deepEqual(await quoteInviteDiscount(w.server, { token, userId: fifth.U.id }), { kind: "none", reason: "inviter-not-paid" });
});

test("초대 할인(18번): 탈퇴하면 초대 링크가 지워지고 할인 기록은 주문처럼 남으며, 18번을 적용하기 전(표 · 함수 없음)에는 정가로 이어진다", async () => {
  const w = await inviteWorld();
  const inviter = await w.payer("탈퇴초대자");
  await w.server.ensureProfile(inviter.U.id);
  const token = await w.link(inviter);
  const friend = await w.payer("탈퇴친구", token);
  assert.equal(friend.discounted, true);
  const done = await w.server.withdrawMemberData(inviter.U.id);
  assert.ok(done.ok && done.counts.invites === 1);
  assert.equal(await w.server.getInviteByToken(token), null);
  assert.equal(psqlRun(`select count(*) from public.invite_discounts where invitee_user_id = '${friend.U.id}'`), "1", "할인 기록은 남는다");
  assert.equal(psqlRun(`select count(*) from public.invite_discounts where invitee_user_id = '${friend.U.id}' and invite_id is null`), "1");

  // 18번 전
  const noFn = { code: "PGRST202", message: "Could not find the function public.invite_discount_status in the schema cache" };
  const noTable = { code: "PGRST205", message: "Could not find the table 'public.invites' in the schema cache" };
  const fakeBuilder = { select: () => fakeBuilder, eq: () => fakeBuilder, maybeSingle: async () => ({ data: null, error: noTable, status: 404 }) };
  const fakeAdmin = new Proxy(admin, {
    get(target, prop, receiver) {
      if (prop === "from") return (table: string) => (table === "invites" ? fakeBuilder : target.from(table));
      if (prop === "rpc") return async (name: string) => (name.includes("invite_discount") ? { data: null, error: noFn } : { data: null, error: { code: "x", message: "unexpected" } });
      return Reflect.get(target, prop, receiver);
    },
  }) as SupabaseClient;
  const old = createSupabaseRepository(fakeAdmin);
  const p = await w.person("예전환경3");
  await assert.rejects(old.getInviteByToken(token), (e: unknown) => (e as { code?: string }).code === "42P01");
  await assert.rejects(old.inviteDiscountStatus({ token, inviteeUserId: p.U.id, cap: 3 }), (e: unknown) => (e as { code?: string }).code === "42P01");
  assert.deepEqual(await quoteInviteDiscount(old, { token, userId: p.U.id }), { kind: "none", reason: null });
  const r = await startCheckout({ repo: old, now: () => new Date() }, { userId: p.U.id, assessmentId: p.aid, inviteToken: token });
  assert.ok(r.kind === "order" && r.order.amount === 9900 && !r.discounted);
});
