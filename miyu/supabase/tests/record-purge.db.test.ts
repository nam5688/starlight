// DB 검증: "기록 삭제" 범위 확대 (마이그레이션 29번 — delete_assessment_record_v2 · record_purged_at · 대화 쓰기 차단 트리거).
// 실행 전 local-stack.sh start 필요. 실행: npm run test:db
// 확인하는 것: 연결된 채팅방 · 나눈 대화 · 저장한 요약 · 읽기용 기록 · 리포트 · 맛보기 글 · 고민이 실제로 지워짐 / 질문권 · 주문 · 결제 · 환불 증빙 · 질문 횟수 · 동의 · 궁합 리포트 · 다른 분석 · 다른 회원은 그대로 /
// 분석 원자료는 리포트 궁합 쌍이 쓰지 않을 때만 비움 / 같은 요청 여러 번(동시에도) 한 번만 / 남의 번호 · 없는 번호 · 형식이 틀린 번호 구분 없음 / 진행 중이면 지우지 않음(busy) /
// 삭제 뒤 대화 · 요약 · 질문 횟수가 되살아나지 않음(DB 트리거 + 행 잠금) / 예전 범위(28번)로 삭제한 기록은 소급하지 않음 / 브라우저는 새 함수 · 열 · 트리거 함수를 못 씀 /
// 29번 전 DB에서는 앱이 예전 범위로 이어 감 / 실제 Supabase와 같은 기본 권한에서 29번이 기존 표 · 함수의 권한을 바꾸지 않음.
// 가상 계정 · 가상 데이터만 쓴다(실제 사용자 정보 없음).
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
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
import { deleteReportRecord, getMyPage, type RenderRoom } from "../../lib/services/my-service.ts";
import { confirmPayment, startCheckout } from "../../lib/services/order-service.ts";
import { ensureReport, getResultView } from "../../lib/services/report-service.ts";
import { loadTalkRoom, loadTranscripts, saveTalkRoom } from "../../lib/services/talk-service.ts";
import type { PaymentGateway, TranscriptInput } from "../../lib/services/ports.ts";

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

const PG = ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres", "-d", "postgres"];
/** 시험용 SQL 한 줄 실행 — 결과를 글로 돌려준다 */
const sql = (q: string) => execFileSync("psql", [...PG, "-At", "-q", "-c", q]).toString().trim();
/** 시간을 거슬러 기록을 옮기는 시험용 SQL — 갱신 시각 · 장부 보호 트리거를 이 문장 안에서만 끈다(시험 DB 전용) */
const sqlRaw = (q: string) => sql(`set session_replication_role = replica; ${q}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = () => new Date().toISOString();

async function makeUser(): Promise<{ id: string; client: SupabaseClient }> {
  const email = `purge-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, ANON_KEY, noSession);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, client };
}

const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i, n) => [i.id, (n % 5) + 1])));
const infoOf = (nickname: string) => ({ ...EMPTY_BASIC_INFO, nickname, birthYear: "1990", birthMonth: "1", birthDay: "15", birthTime: "09:30", gender: "female" as const });

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

async function newAssessment(userId: string, nickname: string): Promise<string> {
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId, channel: "web", info: infoOf(nickname), answers, today: new Date() });
  assert.ok(saved.ok, saved.ok ? "" : saved.message);
  return saved.ok ? saved.assessment.id : "";
}

async function payOrder(userId: string, productId: string, assessmentId: string, amount: number) {
  const o = await server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId, assessmentId, productId, amount, paymentEnv: "test" });
  assert.ok(o.ok, `주문 생성: ${JSON.stringify(o)}`);
  if (!o.ok) throw new Error("order");
  const paid = await confirmPayment({ repo: server, gateway }, { userId, orderNumber: o.value.orderNumber, paymentKey: `pk-${randomUUID()}`, amount });
  assert.equal(paid.kind, "paid");
  return o.value;
}

type Fixture = { id: string; userId: string; reportId: string; compatReportId: string; personalOrderNumber: string };

/**
 * 지울 만한 모든 것이 붙은 결과 — 구매한 리포트(만족도 의견) · 고민 입력 · 고민 기록 · 질문 묶음 · 대화방 2개 · 저장한 요약 · 읽기용 기록 · 채팅 질문 횟수 · 맛보기 · 별개 상품인 사주 궁합.
 * 요약 · 읽기용 기록은 지워지는지 보려고 일부러 넣는다(실제 조건에서는 요약 0개일 수 있다).
 */
async function fixture(userId: string, nickname: string, opts: { taste?: boolean; pack?: boolean } = {}): Promise<Fixture> {
  const { taste: withTaste = true, pack: withPack = true } = opts;
  const id = await newAssessment(userId, nickname);
  const started = await startCheckout({ repo: server, now: () => new Date() }, { userId, assessmentId: id });
  if (started.kind !== "order") throw new Error(started.kind);
  const paid = await confirmPayment({ repo: server, gateway }, { userId, orderNumber: started.order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: started.order.amount });
  if (paid.kind !== "paid") throw new Error(paid.kind);
  const report = await ensureReport({ repo: server, generator: devReportGenerator, now: () => new Date() }, paid.order);
  assert.equal(report?.status, "ready");
  await server.upsertFeedback({ reportId: report!.id, userId, rating: 5 });
  await server.upsertContext({ assessmentId: id, userId, topic: "work", question: "삭제시험 고민", situation: "", matched: "", differed: "", excerpt: "", agreedAt: iso() });
  const concern = await server.insertConcernRecord({ assessmentId: id, userId, topic: "work", question: "삭제시험 고민 기록", situation: "", matched: "", differed: "", excerpt: "", writtenAt: iso(), agreedAt: iso() });
  assert.ok(concern.ok);

  if (withPack) await payOrder(userId, questionProductId(createQuestionNonce("love")), id, questionQuote().priceKrw);
  await server.upsertTalkRoom({ assessmentId: id, userId, roomKey: "love", actions: [{ t: "topic", id: "love" }, { t: "free", q: "삭제될 질문", a: ["삭제될 답"] }] });
  await server.upsertTalkRoom({ assessmentId: id, userId, roomKey: "main", actions: [{ t: "topic", id: "tendency" }] });
  await server.insertChatSummary({ userId, assessmentId: id, room: "love", visible: true, items: { read: ["삭제될 요약"], qa: [{ q: "삭제될 요약 질문", a: "삭제될 요약 답" }] } });
  await server.insertChatSummary({ userId, assessmentId: id, room: "main", visible: false, items: { read: [], qa: [{ q: "참고 기록 질문", a: "참고 기록 답" }] } });
  sql(`insert into public.talk_transcripts (assessment_id, room_key, user_id, lines) values ('${id}', 'work', '${userId}', '[{"from":"miyu","text":"삭제될 읽기용 말"}]'::jsonb)`);
  await server.addChatQuestion({ userId, assessmentId: id, roomKey: "love" });
  sqlRaw(`update public.chat_questions set created_at = now() - interval '5 minutes' where assessment_id = '${id}'`);
  if (withTaste) {
    assert.equal((await server.reserveTasteReport({ userId, assessmentId: id })).state, "reserved");
    await server.saveTasteReport({ userId, assessmentId: id, content: { version: "taste-v2", marker: "삭제시험 맛보기 글" }, generator: "test:m", generatorVersion: "p" });
  }
  await server.addConsents(userId, [{ type: "terms", version: "삭제시험", agreed: true }]);

  // 별개 상품: 사주 궁합 주문(결제 완료) + 완성된 궁합 리포트 줄 — 삭제가 건드리면 안 된다
  const compatOrder = await payOrder(userId, `saju-compat:${randomUUID()}`, id, 4900);
  const compatReport = await server.insertReport({ userId, orderId: compatOrder.id, assessmentId: id, status: "queued", attempts: 0 });
  assert.ok(compatReport.ok);
  if (!compatReport.ok) throw new Error("compat report");
  sql(`update public.reports set status = 'ready', content = '{"marker": "궁합 리포트"}'::jsonb, generator = 'test', generator_version = '0', ready_at = now() where id = '${compatReport.value.id}'`);
  return { id, userId, reportId: report!.id, compatReportId: compatReport.value.id, personalOrderNumber: started.order.orderNumber };
}

const renderer: RenderRoom = async () => {
  throw new Error("삭제 범위 확대에서는 읽기용 기록으로 옮기지 않는다 — 호출되면 안 된다");
};

/** 삭제와 무관해야 하는 모든 기록의 모습 — 삭제 전후가 한 글자도 다르면 안 된다(분석 원자료 행은 삭제 범위 확대가 비우므로 따로 본다) */
async function keptSnapshot(f: Fixture) {
  const rows = async (table: string, column: string, value: string | string[]) => {
    const q = admin.from(table).select();
    const { data, error } = Array.isArray(value) ? await q.in(column, value) : await q.eq(column, value);
    if (error) throw new Error(`${table}: ${error.message}`);
    return data ?? [];
  };
  const sort = (list: unknown[]) => list.map((r) => JSON.stringify(r)).sort();
  const orders = (await rows("orders", "user_id", f.userId)) as { id: string }[];
  const orderIds = orders.map((o) => o.id);
  return {
    orders: sort(orders),
    payment_events: sort(await rows("payment_events", "order_id", orderIds)),
    chat_questions: sort(await rows("chat_questions", "user_id", f.userId)),
    cash_wallets: sort(await rows("cash_wallets", "user_id", f.userId)),
    cash_ledger: sort(await rows("cash_ledger", "user_id", f.userId)),
    question_packs: sort(await rows("question_packs", "user_id", f.userId)),
    user_consents: sort(await rows("user_consents", "user_id", f.userId)),
    profiles: sort(await rows("profiles", "id", f.userId)),
    compat_report: sort(await rows("reports", "id", f.compatReportId)),
  };
}

const count = (table: string, where: string) => Number(sql(`select count(*) from public.${table} where ${where}`));
const conversationRows = (id: string) => ({ rooms: count("talk_rooms", `assessment_id = '${id}'`), summaries: count("chat_summaries", `assessment_id = '${id}'`), transcripts: count("talk_transcripts", `assessment_id = '${id}'`) });
const assessmentRow = async (id: string) => (await admin.from("assessments").select().eq("id", id).single()).data as Record<string, unknown>;

let A: { id: string; client: SupabaseClient };
let B: { id: string; client: SupabaseClient };

before(async () => {
  A = await makeUser();
  B = await makeUser();
});

after(async () => {
  await A?.client.auth.signOut();
  await B?.client.auth.signOut();
});

test("삭제 범위 확대: 채팅방 · 저장한 요약 · 읽기용 기록 · 리포트 · 맛보기 글 · 고민이 실제로 지워지고, 증빙 · 질문권 · 질문 횟수 · 동의 · 궁합 리포트 · 다른 분석은 그대로다", async () => {
  const f = await fixture(A.id, "삭제대상");
  const sibling = await newAssessment(A.id, "다른분석");
  await server.upsertTalkRoom({ assessmentId: sibling, userId: A.id, roomKey: "love", actions: [{ t: "topic", id: "love" }] });
  await server.insertChatSummary({ userId: A.id, assessmentId: sibling, room: "love", visible: true, items: { read: [], qa: [{ q: "남는 질문", a: "남는 답" }] } });
  sql(`insert into public.talk_transcripts (assessment_id, room_key, user_id, lines) values ('${sibling}', 'work', '${A.id}', '[{"from":"miyu","text":"남는 읽기용 말"}]'::jsonb)`);
  const other = await fixture(B.id, "남의기록", { taste: true });

  assert.deepEqual(conversationRows(f.id), { rooms: 2, summaries: 2, transcripts: 1 }, "시작 상태: 지울 대화가 있다");
  assert.equal(await server.purgeAvailable(), true);
  const kept0 = await keptSnapshot(f);
  const otherKept0 = await keptSnapshot(other);
  const otherConv0 = conversationRows(other.id);
  const balance0 = await server.getCashBalance(A.id);
  assert.ok(balance0 > 0, "시작 상태: 결제해 둔 질문이 있다");

  const mine = createSupabaseRepository(A.client);
  assert.deepEqual(await deleteReportRecord(server, { userId: A.id, assessmentId: f.id }, { renderRoom: renderer }), { kind: "deleted-all" });

  // 지워졌다 — 대화 내용 셋과 리포트 · 만족도 · 고민 · 맛보기 글
  assert.deepEqual(conversationRows(f.id), { rooms: 0, summaries: 0, transcripts: 0 }, "채팅방 · 요약 · 읽기용 기록");
  assert.deepEqual((await admin.from("reports").select("id").eq("assessment_id", f.id).neq("id", f.compatReportId)).data, [], "개인 통합 리포트 줄이 없다");
  assert.deepEqual((await admin.from("report_feedback").select("report_id").eq("report_id", f.reportId)).data, []);
  assert.deepEqual((await admin.from("personal_contexts").select("assessment_id").eq("assessment_id", f.id)).data, []);
  assert.deepEqual((await admin.from("concern_records").select("id").eq("assessment_id", f.id)).data, []);
  const taste = await admin.from("taste_reports").select().eq("user_id", A.id).single();
  assert.equal(taste.data?.status, "ready", "맛보기 줄은 남는다 — 한 계정 한 번이 다시 생기지 않는다");
  assert.deepEqual(taste.data?.content, { deleted: true });
  for (const marker of ["삭제될", "삭제시험 맛보기 글", "삭제시험 고민"]) {
    const dump = JSON.stringify([
      (await admin.from("talk_rooms").select().eq("assessment_id", f.id)).data,
      (await admin.from("chat_summaries").select().eq("assessment_id", f.id)).data,
      (await admin.from("talk_transcripts").select().eq("assessment_id", f.id)).data,
      taste.data,
      (await admin.from("reports").select().eq("assessment_id", f.id).neq("id", f.compatReportId)).data,
      (await admin.from("personal_contexts").select().eq("assessment_id", f.id)).data,
    ]);
    assert.equal(dump.includes(marker), false, `"${marker}"가 어느 곳에도 남지 않았다`);
  }

  // 분석 원자료는 쌍이 쓰지 않으므로 비워졌고, 삭제 표시 둘이 같은 순간으로 찍혔다
  const row = await assessmentRow(f.id);
  assert.equal(row.nickname, "삭제");
  assert.deepEqual([row.birth_year, row.birth_month, row.birth_day, row.birth_time, row.known_mbti, row.content_version], [1900, 1, 1, null, null, "record-deleted"]);
  assert.deepEqual([row.answers, row.summary, row.saju], [{}, {}, {}]);
  assert.ok(row.record_deleted_at && row.record_purged_at && row.record_deleted_at === row.record_purged_at);

  // 남는 것은 한 글자도 바뀌지 않았다
  assert.deepEqual(await keptSnapshot(f), kept0);
  assert.equal(await server.getCashBalance(A.id), balance0, "남은 질문권은 그대로");
  assert.equal(count("chat_questions", `assessment_id = '${f.id}'`), 1, "질문 횟수 줄은 남는다");
  const cq = (await admin.from("chat_questions").select().eq("assessment_id", f.id)).data?.[0] ?? {};
  assert.equal(Object.keys(cq).some((k) => /question|answer|text|content|body/i.test(k) && !["state"].includes(k)), false, `질문 횟수 줄에는 대화 내용 열이 없다 (${Object.keys(cq).join(",")})`);
  const compat = await admin.from("reports").select("status, content").eq("id", f.compatReportId).single();
  assert.deepEqual([compat.data?.status, compat.data?.content], ["ready", { marker: "궁합 리포트" }]);
  // 같은 회원의 다른 분석과 다른 회원은 그대로
  assert.deepEqual(conversationRows(sibling), { rooms: 1, summaries: 1, transcripts: 1 });
  assert.equal((await assessmentRow(sibling)).nickname, "다른분석");
  assert.deepEqual(await keptSnapshot(other), otherKept0);
  assert.deepEqual(conversationRows(other.id), otherConv0, "다른 회원의 대화는 그대로");
  assert.equal((await assessmentRow(other.id)).nickname, "남의기록");

  // 화면 자료: 삭제한 기록 목록에는 열 것이 없어 나오지 않고, 결과 · 채팅 읽기는 삭제를 마친 기록으로 보인다, 결제내역은 그대로
  const page = await getMyPage(mine, A.id);
  assert.ok(!page.cards.some((c) => c.assessmentId === f.id));
  assert.deepEqual(page.deletedRecords.filter((d) => d.assessmentId === f.id), []);
  assert.ok(page.cards.some((c) => c.assessmentId === sibling), "다른 분석은 목록에 그대로");
  assert.ok(page.orders.some((o) => o.orderNumber === f.personalOrderNumber), "주문 · 결제 기록은 그대로");
  const view = await getResultView(mine, { userId: A.id, assessmentId: f.id });
  assert.deepEqual([view?.deleted, view?.purged, view?.report], [true, true, null]);
  assert.deepEqual(await loadTranscripts(mine, { userId: A.id, assessmentId: f.id }), []);
  assert.deepEqual(await loadTalkRoom(mine, { userId: A.id, assessmentId: f.id, roomKey: "love" }), []);
  // 다른 회원은 삭제를 마친 기록을 볼 수 없다
  assert.equal(await getResultView(createSupabaseRepository(B.client), { userId: B.id, assessmentId: f.id }), null);
});

test("멱등 · 동시성 · 소유자: 같은 요청을 여러 번(동시에도) 보내도 한 번만 지워지고, 남의 번호 · 없는 번호 · 형식이 틀린 번호 · 빈 번호는 구분 없이 아무것도 바꾸지 않는다", async () => {
  const U = await makeUser();
  const f = await fixture(U.id, "여러번삭제");
  const kept0 = await keptSnapshot(f);

  // 남의 번호 · 없는 번호 · 형식이 틀린 번호 · 빈 인자(함수가 있는지 확인하는 데 쓰인다)는 모두 not-found이고 아무것도 지우지 않는다
  assert.equal(await server.purgeAssessmentRecord(B.id, f.id), "not-found");
  assert.equal(await server.purgeAssessmentRecord(U.id, randomUUID()), "not-found");
  assert.equal(await server.purgeAssessmentRecord(U.id, "not-a-uuid"), "not-found");
  assert.equal((await admin.rpc("delete_assessment_record_v2", { p_user_id: null, p_assessment_id: null })).data, "not_found");
  assert.deepEqual(await deleteReportRecord(server, { userId: B.id, assessmentId: f.id }, { renderRoom: renderer }), { kind: "not-found" });
  assert.deepEqual(conversationRows(f.id), { rooms: 2, summaries: 2, transcripts: 1 }, "아무것도 지워지지 않았다");
  assert.equal((await assessmentRow(f.id)).record_purged_at, null);

  const burst = await Promise.all(Array.from({ length: 8 }, () => server.purgeAssessmentRecord(U.id, f.id)));
  assert.equal(burst.filter((r) => r === "deleted").length, 1, JSON.stringify(burst));
  assert.equal(burst.filter((r) => r === "unchanged").length, 7);
  const stamp = (await assessmentRow(f.id)).record_purged_at;
  assert.equal(await server.purgeAssessmentRecord(U.id, f.id), "unchanged");
  assert.equal((await assessmentRow(f.id)).record_purged_at, stamp, "다시 눌러도 처음 삭제한 시각 그대로");
  assert.deepEqual(await deleteReportRecord(server, { userId: U.id, assessmentId: f.id }, { renderRoom: renderer }), { kind: "unchanged" });
  assert.deepEqual(await keptSnapshot(f), kept0);
  await U.client.auth.signOut();
});

test("진행 중인 생성 · 결제 · 질문 · 질문권 사용이 있으면 지우지 않는다(busy) — 정리되면 지워진다", async () => {
  const case_ = async (label: string, setup: (id: string, userId: string) => Promise<void> | void, clear: (id: string, userId: string) => Promise<void> | void) => {
    const U = await makeUser();
    const id = await newAssessment(U.id, label.slice(0, 8));
    await server.upsertTalkRoom({ assessmentId: id, userId: U.id, roomKey: "love", actions: [{ t: "topic", id: "love" }] });
    await setup(id, U.id);
    assert.equal(await server.purgeAssessmentRecord(U.id, id), "busy", `${label}: 진행 중이면 지우지 않는다`);
    assert.equal((await assessmentRow(id)).record_purged_at, null, `${label}: 삭제 표시 없음`);
    assert.equal(count("talk_rooms", `assessment_id = '${id}'`), 1, `${label}: 대화도 그대로`);
    await clear(id, U.id);
    assert.equal(await server.purgeAssessmentRecord(U.id, id), "deleted", `${label}: 정리된 뒤에는 지워진다`);
    assert.equal(count("talk_rooms", `assessment_id = '${id}'`), 0);
    await U.client.auth.signOut();
  };

  await case_(
    "생성 중",
    async (id, userId) => {
      const o = await payOrder(userId, `saju-compat:${randomUUID()}`, id, 4900);
      assert.ok((await server.insertReport({ userId, orderId: o.id, assessmentId: id, status: "generating", attempts: 1 })).ok);
    },
    (id) => void sqlRaw(`update public.reports set updated_at = now() - interval '20 minutes' where assessment_id = '${id}'`),
  );
  await case_(
    "결제 대기",
    async (id, userId) => {
      assert.ok((await server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId, assessmentId: id, productId: "personal-integrated-report", amount: 9900, paymentEnv: "test" })).ok);
    },
    (id) => void sql(`update public.orders set created_at = now() - interval '2 hours' where assessment_id = '${id}' and status = 'pending'`),
  );
  await case_(
    "궁합 결제 완료 · 리포트 줄 없음",
    async (id, userId) => void (await payOrder(userId, `report-compat:${randomUUID()}`, id, 9900)),
    (id) => void sql(`insert into public.reports (user_id, order_id, assessment_id, status, attempts) select user_id, id, assessment_id, 'failed', 1 from public.orders where assessment_id = '${id}' and product_id like 'report-compat:%'`),
  );
  await case_(
    "맛보기 작성 중",
    async (id, userId) => void (await server.reserveTasteReport({ userId, assessmentId: id })),
    async (id, userId) => void (await server.releaseTasteReport({ userId, assessmentId: id })),
  );
  let reservation: { id: number | null } | null = null;
  await case_(
    "답을 기다리는 질문",
    async (id, userId) => {
      reservation = await server.reserveChatQuestion({ userId, assessmentId: id, roomKey: "love", max: 3 });
      assert.ok(reservation && reservation.id !== null);
    },
    async (id, userId) => {
      await server.confirmChatQuestion(reservation!, { userId, assessmentId: id, roomKey: "love" });
      sqlRaw(`update public.chat_questions set created_at = now() - interval '2 minutes' where assessment_id = '${id}'`);
    },
  );
  await case_(
    "방금 쓴 질문권",
    async (id, userId) => {
      await payOrder(userId, questionProductId(createQuestionNonce("love")), id, questionQuote().priceKrw);
      assert.ok(await server.spendCash({ userId, amount: 1, ref: `spend-${randomUUID()}` }));
    },
    (_id, userId) => void sqlRaw(`update public.cash_ledger set created_at = now() - interval '2 minutes' where user_id = '${userId}' and kind = 'spend'`),
  );
});

test("삭제 뒤: 대화방 · 요약 · 읽기용 기록 · 질문 횟수를 DB가 거절하고(트리거), 앱의 저장 · 질문 경로도 없는 기록으로 다룬다 — 지운 대화가 되살아나지 않는다", async () => {
  const U = await makeUser();
  const f = await fixture(U.id, "삭제뒤");
  assert.equal(await server.purgeAssessmentRecord(U.id, f.id), "deleted");
  const snapshot = () => JSON.stringify([conversationRows(f.id), count("chat_questions", `assessment_id = '${f.id}'`)]);
  const after0 = snapshot();

  // DB 장치: 서비스를 우회한 직접 쓰기도 거절된다
  const roomIns = await admin.from("talk_rooms").insert({ assessment_id: f.id, room_key: "career", user_id: U.id, actions: [] });
  assert.match(roomIns.error?.message ?? "", /record_purged/, "방 새로 만들기");
  const sumIns = await admin.from("chat_summaries").insert({ user_id: U.id, assessment_id: f.id, room: "love", visible: true, items: { read: [], qa: [] } });
  assert.match(sumIns.error?.message ?? "", /record_purged/, "요약 새로 만들기");
  const trIns = await admin.from("talk_transcripts").insert({ assessment_id: f.id, room_key: "love", user_id: U.id, lines: [] });
  assert.match(trIns.error?.message ?? "", /record_purged/, "읽기용 기록 새로 만들기");
  const cqIns = await admin.from("chat_questions").insert({ user_id: U.id, assessment_id: f.id, room_key: "love" });
  assert.match(cqIns.error?.message ?? "", /record_purged/, "질문 횟수 새로 쌓기");
  const reserve = await admin.rpc("reserve_chat_question", { p_user_id: U.id, p_assessment_id: f.id, p_room_key: "love", p_max: 3 });
  assert.match(reserve.error?.message ?? "", /record_purged/, "질문 예약");
  assert.equal(snapshot(), after0, "아무것도 늘지 않았다");
  // 방 줄을 고치는 것도 거절(삭제한 뒤 만들어졌다면)
  sqlRaw(`insert into public.talk_rooms (assessment_id, room_key, user_id, actions) values ('${f.id}', 'ghost', '${U.id}', '[]'::jsonb)`);
  assert.match(String((await admin.from("talk_rooms").update({ actions: [{ t: "topic", id: "love" }] }).eq("assessment_id", f.id).eq("room_key", "ghost")).error?.message), /record_purged/, "있는 방 고치기");
  sqlRaw(`delete from public.talk_rooms where assessment_id = '${f.id}'`);

  // 앱: 옛 화면의 늦은 저장 · 초기 읽기는 없는 기록으로 취급
  for (const epoch of [undefined, null, "none"]) {
    assert.deepEqual(await saveTalkRoom(server, { userId: U.id, assessmentId: f.id, roomKey: "love", actions: [{ t: "topic", id: "love" }], epoch }), { ok: false, reason: "not-found" });
  }
  assert.deepEqual(await loadTalkRoom(server, { userId: U.id, assessmentId: f.id, roomKey: "love" }), []);
  assert.deepEqual(await loadTranscripts(server, { userId: U.id, assessmentId: f.id }), []);
  assert.equal(snapshot(), after0);

  // 리포트 · 주문 경로는 28번과 같이 막혀 있다
  assert.deepEqual(await startCheckout({ repo: server, now: () => new Date() }, { userId: U.id, assessmentId: f.id }), { kind: "record-deleted" });
  await assert.rejects(server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: U.id, assessmentId: f.id, productId: "personal-integrated-report", amount: 9900, paymentEnv: "test" }), /record_deleted/);

  // 남은 질문권은 다른 분석 결과에서 쓴다 — 새 분석의 방은 저장되고 질문 횟수도 쌓인다
  const fresh = await newAssessment(U.id, "새분석");
  assert.deepEqual(await saveTalkRoom(server, { userId: U.id, assessmentId: fresh, roomKey: "love", actions: [{ t: "topic", id: "love" }] }), { ok: true });
  await server.addChatQuestion({ userId: U.id, assessmentId: fresh, roomKey: "love" });
  assert.ok((await server.getCashBalance(U.id)) > 0, "잔액은 그대로이고");
  assert.ok(await server.spendCash({ userId: U.id, amount: 1, ref: `spend-${randomUUID()}` }), "다른 분석에서 쓸 수 있다");
  await U.client.auth.signOut();
});

test("진행 중인 삭제와 같은 순간 들어온 대화 저장은 삭제가 끝난 뒤 DB 장치에 걸린다 (행 잠금)", async () => {
  const U = await makeUser();
  const f = await fixture(U.id, "잠금시험");
  // 삭제 함수를 트랜잭션 안에서 실행한 채 2초 붙잡는다
  const script = `begin; select public.delete_assessment_record_v2('${U.id}', '${f.id}'); select pg_sleep(2); commit;`;
  const child = spawn("psql", [...PG, "-At", "-q", "-c", script], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  const closed = new Promise<void>((resolve) => child.on("close", () => resolve()));
  let holding = false;
  for (let waited = 0; !holding && waited < 8000; waited += 50) {
    holding = sql("select count(*) from pg_stat_activity where wait_event = 'PgSleep'") !== "0";
    if (!holding) await sleep(50);
  }
  assert.ok(holding, "삭제 함수가 행을 잠근 채 열려 있다");
  const t0 = Date.now();
  // 삭제 직전에 열려 있던 대화 화면이 같은 순간 저장하려는 경우: 새 방 · 새 요약 · 새 질문 횟수
  const racing = await Promise.allSettled([
    admin.from("talk_rooms").insert({ assessment_id: f.id, room_key: "career", user_id: U.id, actions: [{ t: "topic", id: "work-money" }] }),
    admin.from("chat_summaries").insert({ user_id: U.id, assessment_id: f.id, room: "love", visible: true, items: { read: [], qa: [{ q: "늦은 요약 질문", a: "늦은 요약 답" }] } }),
    admin.from("chat_questions").insert({ user_id: U.id, assessment_id: f.id, room_key: "love" }),
  ]);
  await closed;
  assert.match(out, /deleted/, "삭제 함수가 처리했다");
  assert.ok(Date.now() - t0 >= 300, "삭제가 끝날 때까지 기다렸다");
  for (const [i, r] of racing.entries()) {
    assert.equal(r.status, "fulfilled");
    assert.match(((r as PromiseFulfilledResult<{ error: { message: string } | null }>).value.error?.message) ?? "", /record_purged/, `경합 ${i}: 삭제가 끝난 뒤 거절된다`);
  }
  assert.deepEqual(conversationRows(f.id), { rooms: 0, summaries: 0, transcripts: 0 });
  assert.equal(count("chat_questions", `assessment_id = '${f.id}'`), 1, "질문 횟수가 늘지 않았다");
  await U.client.auth.signOut();
});

test("리포트 궁합 쌍(pairs)이 이 결과를 쓰는 동안은 분석 원자료를 남기고, 대화 · 리포트는 지운다 — 쌍이 어느 쪽(a · b)이든 같다", async () => {
  const nowIso = iso();
  const pairRow = (over: Record<string, unknown>) => ({ id: randomUUID(), token: `t${randomUUID().replace(/-/g, "")}`, a_consent_at: nowIso, a_consent_version: "v1", expires_at: new Date(Date.now() + 86_400_000).toISOString(), ...over });

  // a 쪽 결과
  const U1 = await makeUser();
  const f1 = await fixture(U1.id, "쌍a쪽", { taste: false, pack: false });
  assert.equal((await admin.from("pairs").insert(pairRow({ a_user_id: U1.id, a_assessment_id: f1.id }))).error, null);
  assert.equal(await server.purgeAssessmentRecord(U1.id, f1.id), "deleted");
  const r1 = await assessmentRow(f1.id);
  assert.equal(r1.nickname, "쌍a쪽", "쌍이 쓰는 분석 원자료는 그대로");
  assert.deepEqual(r1.birth_year, 1990);
  assert.ok(r1.record_purged_at, "삭제 표시는 찍힌다");
  assert.deepEqual(conversationRows(f1.id), { rooms: 0, summaries: 0, transcripts: 0 });
  assert.deepEqual((await admin.from("reports").select("id").eq("assessment_id", f1.id).neq("id", f1.compatReportId)).data, []);
  await U1.client.auth.signOut();

  // b 쪽 결과 (상대가 참여한 쌍)
  const U2 = await makeUser();
  const U3 = await makeUser();
  const f2 = await fixture(U2.id, "쌍b쪽", { taste: false, pack: false });
  const other = await newAssessment(U3.id, "쌍상대");
  assert.equal((await admin.from("pairs").insert(pairRow({ a_user_id: U3.id, a_assessment_id: other, b_user_id: U2.id, b_assessment_id: f2.id, b_consent_at: nowIso, b_consent_version: "v1", status: "linked" }))).error, null);
  assert.equal(await server.purgeAssessmentRecord(U2.id, f2.id), "deleted");
  assert.equal((await assessmentRow(f2.id)).nickname, "쌍b쪽");
  assert.equal((await assessmentRow(other)).nickname, "쌍상대");
  await U2.client.auth.signOut();
  await U3.client.auth.signOut();
});

test("예전 범위(28번)로 삭제한 기록은 29번 함수로 소급해서 정리하지 않고, 그 기록의 채팅은 예전처럼 이어진다", async () => {
  const U = await makeUser();
  const f = await fixture(U.id, "예전삭제", { pack: false });
  const payload: TranscriptInput[] = [];
  for (const roomKey of await server.listTalkRoomKeys(f.id)) {
    const row = await server.getTalkRoom(f.id, roomKey);
    if (row) payload.push({ roomKey, updatedAt: row.updatedAt, lines: [{ from: "miyu", text: `${roomKey} 예전 말` }] });
  }
  assert.equal(await server.deleteAssessmentRecord(U.id, f.id, payload), "deleted", "28번 함수로 삭제");
  const before = JSON.stringify([conversationRows(f.id), (await assessmentRow(f.id)).nickname]);
  assert.equal(await server.purgeAssessmentRecord(U.id, f.id), "unchanged", "소급하지 않는다");
  assert.equal(JSON.stringify([conversationRows(f.id), (await assessmentRow(f.id)).nickname]), before, "읽기용 기록 · 분석 원자료 그대로");
  assert.equal((await assessmentRow(f.id)).record_purged_at, null);
  // 예전 범위로 삭제한 기록의 채팅은 이어진다(트리거가 막지 않는다)
  // 28번의 표지 규칙(저장된 읽기용 기록이 있는 방은 그 시각을 표지로 돌려보내야 저장된다)도 그대로이고, 트리거는 예전 범위로 삭제한 기록의 대화를 막지 않는다
  const epoch = (await server.listTalkTranscripts(f.id)).find((t) => t.roomKey === "love")?.createdAt ?? "none";
  assert.notEqual(epoch, "none");
  assert.deepEqual(await saveTalkRoom(server, { userId: U.id, assessmentId: f.id, roomKey: "love", actions: [{ t: "topic", id: "love" }], epoch: "none" }), { ok: false, reason: "stale" }, "옛 화면의 표지로는 저장되지 않는다(28번 규칙 그대로)");
  assert.deepEqual(await saveTalkRoom(server, { userId: U.id, assessmentId: f.id, roomKey: "love", actions: [{ t: "topic", id: "love" }], epoch }), { ok: true });
  assert.equal(count("talk_rooms", `assessment_id = '${f.id}' and room_key = 'love'`), 1, "예전 범위로 삭제한 기록에서는 새 대화가 저장된다");
  const page = await getMyPage(createSupabaseRepository(U.client), U.id);
  assert.ok(page.deletedRecords.some((d) => d.assessmentId === f.id), "삭제한 기록 목록에 계속 나온다");
  await U.client.auth.signOut();
});

test("브라우저 권한: 로그인 회원도 비로그인도 새 삭제 함수 · 삭제 완료 열 · 트리거 함수를 직접 쓸 수 없다 (기존 권한은 그대로)", async () => {
  const U = await makeUser();
  const f = await fixture(U.id, "권한시험", { taste: false });
  for (const [label, client] of [["비로그인", anon], ["본인", U.client], ["다른 회원", B.client]] as const) {
    const viaRpc = await client.rpc("delete_assessment_record_v2", { p_user_id: U.id, p_assessment_id: f.id });
    assert.ok(viaRpc.error, `${label}: 함수를 직접 부를 수 없다`);
    assert.ok((await client.rpc("block_write_on_purged_record")).error, `${label}: 트리거 함수를 직접 부를 수 없다`);
  }
  assert.equal((await assessmentRow(f.id)).record_purged_at, null, "아무것도 지워지지 않았다");
  assert.deepEqual(conversationRows(f.id), { rooms: 2, summaries: 2, transcripts: 1 });

  // 삭제 완료 표시 열을 직접 바꾸지 못한다
  for (const value of [iso(), null]) {
    const upd = await U.client.from("assessments").update({ record_purged_at: value }).eq("id", f.id).select();
    assert.ok(upd.error || (upd.data ?? []).length === 0, `record_purged_at=${String(value)}`);
  }
  assert.equal((await assessmentRow(f.id)).record_purged_at, null);

  const priv = (role: string, fn: string) => sql(`select has_function_privilege('${role}', '${fn}', 'execute')`);
  for (const role of ["anon", "authenticated"]) {
    assert.equal(priv(role, "public.delete_assessment_record_v2(uuid, uuid)"), "f", `${role}: 새 삭제 함수 실행 권한 없음`);
    assert.equal(priv(role, "public.block_write_on_purged_record()"), "f", `${role}: 트리거 함수 실행 권한 없음`);
    assert.equal(priv(role, "public.delete_assessment_record(uuid, uuid, jsonb)"), "f", `${role}: 28번 함수 권한도 그대로 없음`);
  }
  assert.equal(priv("service_role", "public.delete_assessment_record_v2(uuid, uuid)"), "t");
  for (const fn of ["delete_assessment_record_v2", "block_write_on_purged_record"]) {
    const acl = sql(`select coalesce(proacl::text, '') from pg_proc where proname = '${fn}' and pronamespace = 'public'::regnamespace`);
    assert.ok(!/(^\{|,)=/.test(acl), `${fn}: PUBLIC 실행 권한이 남아 있다 (${acl})`);
  }
  assert.equal(sql("select count(*) from pg_trigger where tgname in ('talk_rooms_block_purged','chat_summaries_block_purged','talk_transcripts_block_purged','chat_questions_block_purged') and tgenabled = 'O'"), "4", "대화 쓰기 차단 트리거 4개가 켜져 있다");
  await U.client.auth.signOut();
});

test("삭제를 마친 회원도 탈퇴할 수 있고, 지운 대화 표 · 요약 표에 남는 것이 없다", async () => {
  const W = await makeUser();
  const f = await fixture(W.id, "탈퇴시험", { pack: false });
  assert.equal(await server.purgeAssessmentRecord(W.id, f.id), "deleted");
  const out = await server.withdrawMemberData(W.id);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(count("talk_rooms", `user_id = '${W.id}'`) + count("chat_summaries", `user_id = '${W.id}'`) + count("talk_transcripts", `user_id = '${W.id}'`), 0);
  await W.client.auth.signOut();
});

test("29번 전 DB(함수 · 열 없음)에서는 앱이 예전 범위(28번) 삭제로 이어 가고, 29번을 다시 적용하면 같은 앱이 새 범위로 동작한다", async () => {
  const U = await makeUser();
  const f = await fixture(U.id, "이전DB29", { pack: false });
  const U2 = await makeUser();
  const g = await fixture(U2.id, "이전DB29b", { pack: false });
  // 29번 전 상태를 흉내: 새 함수 · 삭제 완료 열 이름을 바꾼다
  const TRIGGERS = [["talk_rooms", "talk_rooms_block_purged"], ["chat_summaries", "chat_summaries_block_purged"], ["talk_transcripts", "talk_transcripts_block_purged"], ["chat_questions", "chat_questions_block_purged"]] as const;
  sql(`${TRIGGERS.map(([t, g]) => `alter table public.${t} disable trigger ${g};`).join(" ")} alter function public.delete_assessment_record_v2(uuid, uuid) rename to delete_assessment_record_v2_off; alter table public.assessments rename column record_purged_at to record_purged_at_off; notify pgrst, 'reload schema'`);
  await sleep(800);
  try {
    // 확인(캐시)이 남아 있어도 호출 때 함수가 없다고 나오면 예전 범위로 이어 간다 — 모든 대화를 읽기용 기록으로 옮기고 분석 원자료는 남는다
    const legacyRender: RenderRoom = async ({ roomKey }) => [{ from: "miyu", text: `${roomKey} 방의 미유 말` }];
    assert.deepEqual(await deleteReportRecord(server, { userId: U.id, assessmentId: f.id }, { renderRoom: legacyRender }), { kind: "deleted" });
    assert.equal(count("talk_rooms", `assessment_id = '${f.id}'`), 0, "행동 목록은 읽기용 기록으로 옮긴 뒤 정리");
    assert.deepEqual((await server.listTalkTranscripts(f.id)).map((t) => t.roomKey).sort(), ["love", "main", "work"], "예전 범위: 읽기용 기록이 남는다(함께 있던 work는 그대로)");
    assert.equal((await assessmentRow(f.id)).nickname, "이전DB29", "분석 원자료도 그대로");
    // 열이 없는 DB의 화면 읽기: recordPurgedAt이 undefined이고 삭제 완료로 보이지 않는다
    const view = await getResultView(createSupabaseRepository(U.client), { userId: U.id, assessmentId: f.id });
    assert.deepEqual([view?.deleted, view?.purged], [true, false]);
    assert.equal((await admin.rpc("delete_assessment_record_v2", { p_user_id: U2.id, p_assessment_id: g.id })).error?.code === undefined, false, "새 함수가 없다");
  } finally {
    sql(`alter function public.delete_assessment_record_v2_off(uuid, uuid) rename to delete_assessment_record_v2; alter table public.assessments rename column record_purged_at_off to record_purged_at; ${TRIGGERS.map(([t, g]) => `alter table public.${t} enable trigger ${g};`).join(" ")} notify pgrst, 'reload schema'`);
    await sleep(800);
  }
  assert.equal(sql("select count(*) from pg_proc where proname = 'delete_assessment_record_v2' and pronamespace = 'public'::regnamespace"), "1");
  assert.equal(sql("select count(*) from pg_trigger where tgname like '%_block_purged' and tgenabled = 'O'"), "4", "장치가 모두 다시 켜졌다");
  // 다시 29번이 있는 상태 — 아직 삭제하지 않은 기록은 새 범위로 지워진다
  assert.deepEqual(await deleteReportRecord(server, { userId: U2.id, assessmentId: g.id }, { renderRoom: renderer }), { kind: "deleted-all" });
  assert.deepEqual(conversationRows(g.id), { rooms: 0, summaries: 0, transcripts: 0 });
  await U.client.auth.signOut();
  await U2.client.auth.signOut();
});

test("실제 Supabase와 같은 기본 권한(새 함수에 서버 역할 모든 권한이 자동으로 붙는 조건)에서도 29번은 기존 표 · 함수의 권한을 바꾸지 않고 새 함수의 권한은 정확하다", () => {
  const dir = join(import.meta.dirname, "..", "migrations");
  const all = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const last = "20261108000000_record_delete_scope.sql";
  assert.equal(all.at(-1), last, "29번이 마지막 마이그레이션이다");
  const files = all.slice(0, -1);
  const base = ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres"];
  const db = `acl29_${process.pid}`;
  const inDb = (q: string) => execFileSync("psql", [...base, "-d", db, "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", q]).toString().trim();
  const fileIn = (f: string) => execFileSync("psql", [...base, "-d", db, "-q", "-v", "ON_ERROR_STOP=1", "-f", join(dir, f)], { stdio: ["ignore", "ignore", "pipe"] });
  execFileSync("dropdb", [...base, "--if-exists", db]);
  execFileSync("createdb", [...base, db]);
  try {
    execFileSync("bash", ["-c", `pg_dump -h 127.0.0.1 -p ${process.env.PG_PORT ?? "54329"} -U postgres -s -n auth postgres | psql -h 127.0.0.1 -p ${process.env.PG_PORT ?? "54329"} -U postgres -d ${db} -q >/dev/null 2>&1 || true`]);
    assert.equal(inDb("select to_regclass('auth.users') is not null"), "t");
    inDb(
      "alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;" +
        "alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;" +
        "alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role",
    );
    for (const f of files) fileIn(f);
    assert.equal(inDb("select has_table_privilege('service_role', 'public.orders', 'delete')"), "t", "기본 권한 조건이 적용됐다");
    const snapshot = () =>
      inDb(
        "select 'rel ' || c.relname || ' ' || coalesce(c.relacl::text, '-') from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','S','v') " +
          "union all select 'fn ' || p.oid::regprocedure::text || ' ' || coalesce(p.proacl::text, '-') from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1",
      )
        .split("\n")
        .sort();
    // 적용 전 확인(읽기 전용)이 28번까지 적용된 DB에서 OK이고, 적용 뒤에는 "이미 적용됨"으로 멈추라고 알린다
    const sqlDir = join(import.meta.dirname, "..");
    const verdict = (file: string) => {
      const out = execFileSync("psql", [...base, "-d", db, "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-f", join(sqlDir, file)]).toString();
      return { all: out, total: out.split("\n").find((l) => l.startsWith("99|")) ?? "" };
    };
    const countsBefore = (verdict("delete-scope-29-precheck.sql").all.split("\n").filter((l) => /^(9|10|11|12)\|/.test(l)).map((l) => l.split("|").slice(-1)[0]));
    assert.match(verdict("delete-scope-29-precheck.sql").total, /^99\|종합\|OK — 29번을 적용해도 된다\|이상 0개$/);
    const before = snapshot();
    fileIn(last);
    const after = snapshot();
    assert.match(verdict("delete-scope-29-precheck.sql").total, /^99\|종합\|이상 — 29번을 실행하지 말고/, "이미 적용된 DB에서는 다시 실행하지 말라고 알린다");
    const post = verdict("delete-scope-29-postcheck.sql");
    assert.match(post.total, /^99\|종합\|OK — 29번이 적용됐다\|이상 0개$/);
    assert.deepEqual(post.all.split("\n").filter((l) => /^(9|10|11|12)\|/.test(l)).map((l) => l.split("|").slice(-1)[0]), countsBefore, "적용 전후 행 수가 같다 — 29번은 데이터를 바꾸지 않는다");
    const beforeSet = new Set(before);
    const changedOrNew = after.filter((line) => !beforeSet.has(line));
    const NEW = /^fn (public\.)?(delete_assessment_record_v2|block_write_on_purged_record)\(/;
    assert.deepEqual(changedOrNew.filter((l) => !NEW.test(l)), [], "새 함수 둘 말고는 권한이 달라진 것이 없다(새 표도 없다)");
    assert.deepEqual(before.filter((l) => !new Set(after).has(l)), [], "기존 줄이 사라지거나 바뀌지 않았다");
    for (const fn of ["delete_assessment_record_v2(uuid, uuid)", "block_write_on_purged_record()"]) {
      for (const role of ["anon", "authenticated"]) assert.equal(inDb(`select has_function_privilege('${role}', 'public.${fn}', 'execute')`), "f", `${role}: ${fn}`);
      const facl = inDb(`select coalesce(proacl::text, '') from pg_proc where oid = 'public.${fn}'::regprocedure`);
      assert.ok(!/(^\{|,)=/.test(facl), `${fn}: PUBLIC 실행 권한이 없다 (${facl})`);
    }
    assert.equal(inDb("select has_function_privilege('service_role', 'public.delete_assessment_record_v2(uuid, uuid)', 'execute')"), "t");
    // 이 파일을 실행하는 것만으로는 어떤 데이터도 바뀌지 않는다 — 열은 비어 있다
    assert.equal(inDb("select count(*) from public.assessments where record_purged_at is not null"), "0");
    // 29번 파일을 한 번 더 실행하면 이미 있다는 오류로 멈춘다(두 번 적용되지 않는다)
    assert.throws(() => fileIn(last));
  } finally {
    execFileSync("dropdb", [...base, "--if-exists", db]);
  }
});
