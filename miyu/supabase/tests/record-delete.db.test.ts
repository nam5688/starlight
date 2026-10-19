// DB 검증: MY에서 회원이 직접 누르는 "기록 삭제" (마이그레이션 28번).
// 실행 전 local-stack.sh start 필요. 실행: npm run test:db
// 확인하는 것: 리포트 본문 · 맛보기 글 · 고민 입력이 실제로 지워짐 / 계정 · 주문 · 결제 · 환불 증빙 · 질문권 · 채팅 질문 횟수 · 동의 · 분석 원자료 · 궁합 리포트는 그대로 /
// 채팅방 대화는 읽기용 기록으로 옮겨져 본인만 읽음(저장된 요약 0개인 실제 조건 포함) / 같은 요청을 여러 번(동시에도) 보내도 한 번만 /
// 동시 대화(stale) · 진행 중 생성 · 결제 · 질문(busy)은 지우지 않음 / 삭제 뒤 새 리포트 · 새 주문 · 맛보기 글이 생기거나 되살아나지 않음(DB 장치 + 저장소 경로) /
// 브라우저(로그인 회원 · 비로그인)는 함수 · 열 · 트리거 함수를 직접 못 씀 / 탈퇴하면 읽기용 대화 기록도 삭제 / 28번 전 DB에서는 삭제 기능만 꺼짐.
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
import { requestTasteReport } from "../../lib/services/taste-service.ts";
import { loadTranscripts } from "../../lib/services/talk-service.ts";
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
  const email = `del-${randomUUID()}@example.test`;
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

type Fixture = { id: string; userId: string; reportId: string; compatOrderId: string; compatReportId: string; personalOrderNumber: string };

/** 삭제할 만한 모든 것이 붙은 결과 — 구매한 리포트(만족도 의견) · 고민 입력 · 고민 기록 · 질문 묶음 · 대화방 2개 · 채팅 질문 횟수 · 맛보기 · 별개 상품인 사주 궁합 */
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

  // 질문 묶음(결제 완료) · 대화방 2개 · 질문 횟수(1분 전으로 옮겨 "방금 오간 질문"이 아니게) · 맛보기(완성)
  if (withPack) await payOrder(userId, questionProductId(createQuestionNonce("love")), id, questionQuote().priceKrw);
  await server.upsertTalkRoom({ assessmentId: id, userId, roomKey: "love", actions: [{ t: "topic", id: "love" }] });
  await server.upsertTalkRoom({ assessmentId: id, userId, roomKey: "main", actions: [{ t: "topic", id: "tendency" }] });
  await server.addChatQuestion({ userId, assessmentId: id, roomKey: "love" });
  sqlRaw(`update public.chat_questions set created_at = now() - interval '5 minutes' where assessment_id = '${id}'`);
  if (withTaste) {
    // 맛보기는 한 계정에 한 번이라 계정마다 한 결과에만 붙는다
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
  return { id, userId, reportId: report!.id, compatOrderId: compatOrder.id, compatReportId: compatReport.value.id, personalOrderNumber: started.order.orderNumber };
}

/** 삭제 전에 대화방마다 읽은 그대로의 읽기용 줄 — 앱(deleteReportRecord)이 하는 일을 흉내 낸다 */
async function transcriptsOf(assessmentId: string, linesOf: (roomKey: string) => TranscriptInput["lines"] = (k) => [{ from: "miyu", text: `${k} 방의 미유 말` }, { from: "me", text: `${k} 방의 내 말` }]): Promise<TranscriptInput[]> {
  const out: TranscriptInput[] = [];
  for (const roomKey of await server.listTalkRoomKeys(assessmentId)) {
    const row = await server.getTalkRoom(assessmentId, roomKey);
    if (row) out.push({ roomKey, updatedAt: row.updatedAt, lines: linesOf(roomKey) });
  }
  return out;
}

const renderer: RenderRoom = async ({ roomKey }) => [
  { from: "miyu", text: `${roomKey} 방의 미유 말`, label: "제목" },
  { from: "me", text: `${roomKey} 방의 내 말` },
];

/** 삭제와 무관해야 하는 모든 기록의 모습 — 삭제 전후가 한 글자도 다르면 안 된다 */
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
  const assessment = (await rows("assessments", "id", f.id)) as Record<string, unknown>[];
  return {
    // 분석 원자료(채팅이 이어지도록 남는 것) — 삭제 표시 열만 빼고 같아야 한다
    assessment: sort(assessment.map(({ record_deleted_at: _d, ...rest }) => rest)), // eslint-disable-line @typescript-eslint/no-unused-vars
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

test("삭제: 리포트 본문 · 만족도 · 고민 · 맛보기 글은 실제로 지워지고, 증빙 · 질문권 · 채팅 질문 횟수 · 동의 · 분석 원자료 · 궁합 리포트는 그대로이며, 저장된 요약이 0개여도 대화를 읽을 수 있다", async () => {
  const f = await fixture(A.id, "삭제대상");
  // 실제 조건 그대로: 저장된 채팅 요약은 없고(0개) 대화방만 있다
  assert.equal((await admin.from("chat_summaries").select("id", { count: "exact", head: true }).eq("user_id", A.id)).count, 0);
  assert.equal((await server.listTalkRoomKeys(f.id)).length, 2);
  const kept0 = await keptSnapshot(f);
  const balance0 = await server.getCashBalance(A.id);
  assert.ok(balance0 > 0, "시작 상태: 결제해 둔 질문이 있다");

  const mine = createSupabaseRepository(A.client);
  const result = await deleteReportRecord(server, { userId: A.id, assessmentId: f.id }, { renderRoom: renderer });
  assert.deepEqual(result, { kind: "deleted" });

  // 실제로 지워졌다 — 본문은 어디에도 없다
  assert.deepEqual((await admin.from("reports").select("id").eq("assessment_id", f.id).neq("id", f.compatReportId)).data, [], "개인 통합 리포트 줄이 없다");
  assert.deepEqual((await admin.from("report_feedback").select("report_id").eq("report_id", f.reportId)).data, [], "만족도 의견도 함께");
  assert.deepEqual((await admin.from("personal_contexts").select("assessment_id").eq("assessment_id", f.id)).data, []);
  assert.deepEqual((await admin.from("concern_records").select("id").eq("assessment_id", f.id)).data, []);
  assert.deepEqual((await admin.from("talk_rooms").select("room_key").eq("assessment_id", f.id)).data, [], "행동 목록 줄은 읽기용 기록으로 옮겨진 뒤 정리");
  const taste = await admin.from("taste_reports").select().eq("user_id", A.id).single();
  assert.equal(taste.data?.status, "ready", "맛보기 줄은 남긴다 — 한 계정 한 번이 다시 생기지 않는다");
  assert.deepEqual(taste.data?.content, { deleted: true });
  assert.equal(taste.data?.generator, null);
  assert.equal(JSON.stringify(taste.data).includes("삭제시험 맛보기 글"), false, "맛보기 글이 어디에도 남지 않는다");
  assert.ok((await admin.from("assessments").select("record_deleted_at").eq("id", f.id).single()).data?.record_deleted_at);

  // 남는 것은 한 글자도 바뀌지 않았다
  assert.deepEqual(await keptSnapshot(f), kept0);
  assert.equal(await server.getCashBalance(A.id), balance0, "남은 질문권은 그대로");
  const compat = await admin.from("reports").select("status, content").eq("id", f.compatReportId).single();
  assert.equal(compat.data?.status, "ready");
  assert.deepEqual(compat.data?.content, { marker: "궁합 리포트" });

  // 대화는 읽기용 기록으로 읽힌다(저장된 요약 0개) — 본인 화면 읽기(RLS)로
  const transcripts = await loadTranscripts(mine, { userId: A.id, assessmentId: f.id });
  assert.deepEqual(transcripts.map((t) => t.roomKey).sort(), ["love", "main"]);
  assert.deepEqual(transcripts.find((t) => t.roomKey === "love")?.lines, [{ from: "miyu", text: "love 방의 미유 말", label: "제목" }, { from: "me", text: "love 방의 내 말" }]);
  assert.equal((await admin.from("chat_summaries").select("id", { count: "exact", head: true }).eq("user_id", A.id)).count, 0, "요약을 만들어 대신하지 않는다");

  // 화면 자료: 목록에서 빠지고 삭제한 기록으로 나온다(채팅방 2개), 결과 화면은 리포트 없이 삭제 표시, 결제내역은 그대로
  const page = await getMyPage(mine, A.id);
  assert.ok(!page.cards.some((c) => c.assessmentId === f.id));
  assert.deepEqual(page.deletedRecords.filter((d) => d.assessmentId === f.id).map((d) => d.chatRooms), [2]);
  assert.ok(page.orders.some((o) => o.orderNumber === f.personalOrderNumber), "주문 · 결제 기록은 그대로");
  const view = await getResultView(mine, { userId: A.id, assessmentId: f.id });
  assert.equal(view?.deleted, true);
  assert.equal(view?.report, null);
  assert.equal(view?.paidOrder, null);
  assert.deepEqual(view?.taste, { kind: "unavailable" });

  // 다른 회원은 읽기용 대화 기록도 삭제한 기록도 볼 수 없다
  assert.deepEqual((await B.client.from("talk_transcripts").select("room_key").eq("assessment_id", f.id)).data, []);
  assert.deepEqual(await loadTranscripts(createSupabaseRepository(B.client), { userId: B.id, assessmentId: f.id }), []);
  assert.equal(await getResultView(createSupabaseRepository(B.client), { userId: B.id, assessmentId: f.id }), null);
});

test("멱등 · 동시성: 같은 요청을 여러 번(동시에도) 보내도 한 번만 지워지고 나머지는 '이미 삭제'다", async () => {
  const U = await makeUser();
  const f = await fixture(U.id, "여러번삭제");
  const payload = await transcriptsOf(f.id);
  const burst = await Promise.all(Array.from({ length: 8 }, () => server.deleteAssessmentRecord(U.id, f.id, payload)));
  assert.equal(burst.filter((r) => r === "deleted").length, 1, JSON.stringify(burst));
  assert.equal(burst.filter((r) => r === "unchanged").length, 7);
  const stamp = (await admin.from("assessments").select("record_deleted_at").eq("id", f.id).single()).data?.record_deleted_at;
  assert.equal(await server.deleteAssessmentRecord(U.id, f.id, payload), "unchanged");
  assert.equal((await admin.from("assessments").select("record_deleted_at").eq("id", f.id).single()).data?.record_deleted_at, stamp, "다시 눌러도 처음 삭제한 시각 그대로");
  assert.equal((await server.listTalkTranscripts(f.id)).length, 2, "읽기용 기록이 겹쳐 쌓이지 않는다");
  // 서비스 흐름도 마찬가지
  assert.deepEqual(await deleteReportRecord(server, { userId: U.id, assessmentId: f.id }, { renderRoom: renderer }), { kind: "unchanged" });
});

test("소유자 확인: 남의 번호 · 없는 번호 · 형식이 틀린 번호는 아무것도 지우지 않고 서로 구분되지 않는다", async () => {
  const U = await makeUser();
  const f = await fixture(U.id, "남의기록");
  const kept0 = await keptSnapshot(f);
  const payload = await transcriptsOf(f.id);
  assert.equal(await server.deleteAssessmentRecord(B.id, f.id, payload), "not-found");
  assert.deepEqual(await deleteReportRecord(server, { userId: B.id, assessmentId: f.id }, { renderRoom: renderer }), { kind: "not-found" });
  assert.deepEqual(await deleteReportRecord(server, { userId: U.id, assessmentId: randomUUID() }, { renderRoom: renderer }), { kind: "not-found" });
  assert.deepEqual(await deleteReportRecord(server, { userId: U.id, assessmentId: "not-a-uuid" }, { renderRoom: renderer }), { kind: "not-found" });
  assert.equal(await server.deleteAssessmentRecord(U.id, "not-a-uuid", payload), "not-found");
  assert.equal(await server.deleteAssessmentRecord(U.id, f.id, "이상한값" as unknown as TranscriptInput[]), "not-found");
  assert.equal((await admin.from("assessments").select("record_deleted_at").eq("id", f.id).single()).data?.record_deleted_at, null);
  assert.equal((await server.listTalkRoomKeys(f.id)).length, 2);
  assert.deepEqual(await keptSnapshot(f), kept0);
});

test("읽은 뒤 대화방이 바뀌면(동시 대화) 지우지 않고 다시 읽어 옮긴 뒤에야 지운다 — 오간 말이 읽기용 기록에서 빠지지 않는다", async () => {
  const U = await makeUser();
  const f = await fixture(U.id, "동시대화");
  const stale = await transcriptsOf(f.id);
  // 앱이 읽은 뒤 다른 탭에서 대화가 이어졌다
  await sleep(30);
  await server.upsertTalkRoom({ assessmentId: f.id, userId: U.id, roomKey: "love", actions: [{ t: "topic", id: "love" }, { t: "free", q: "새 질문", a: ["새 답"] }] });
  assert.equal(await server.deleteAssessmentRecord(U.id, f.id, stale), "stale");
  assert.equal((await admin.from("assessments").select("record_deleted_at").eq("id", f.id).single()).data?.record_deleted_at, null, "삭제하지 않았다");
  assert.equal((await server.listTalkRoomKeys(f.id)).length, 2, "대화방도 그대로");
  assert.deepEqual(await server.listTalkTranscripts(f.id), [], "읽기용 기록도 만들지 않았다(전부 아니면 전혀 아니다)");

  // 대화방 하나가 아예 빠진 목록 · 새로 생긴 방도 stale
  const fresh = await transcriptsOf(f.id);
  assert.equal(await server.deleteAssessmentRecord(U.id, f.id, fresh.filter((t) => t.roomKey !== "main")), "stale");
  await server.upsertTalkRoom({ assessmentId: f.id, userId: U.id, roomKey: "career", actions: [{ t: "topic", id: "work-money" }] });
  assert.equal(await server.deleteAssessmentRecord(U.id, f.id, fresh), "stale", "새로 생긴 방이 목록에 없다");

  // 서비스는 다시 읽어 시도한다 — 마지막 읽기에서 모두 옮겨진다
  const seen: string[] = [];
  const result = await deleteReportRecord(server, { userId: U.id, assessmentId: f.id }, { renderRoom: async ({ roomKey }) => (seen.push(roomKey), renderer({ roomKey, actions: [] })) });
  assert.deepEqual(result, { kind: "deleted" });
  assert.deepEqual((await server.listTalkTranscripts(f.id)).map((t) => t.roomKey).sort(), ["career", "love", "main"]);

  // 옮기지 못하면(렌더 실패) 아무것도 지우지 않는다
  const g = await fixture(U.id, "옮기기실패", { taste: false, pack: false });
  const failed = await deleteReportRecord(server, { userId: U.id, assessmentId: g.id }, { renderRoom: async () => { throw new Error("렌더 실패"); } });
  assert.deepEqual(failed, { kind: "transcript-failed" });
  assert.equal((await admin.from("assessments").select("record_deleted_at").eq("id", g.id).single()).data?.record_deleted_at, null);
  assert.equal((await server.listTalkRoomKeys(g.id)).length, 2);
  assert.equal((await admin.from("reports").select("id").eq("assessment_id", g.id)).data?.length, 2, "리포트도 그대로(개인 + 궁합)");
});

test("진행 중인 생성 · 결제 · 질문이 있으면 지우지 않는다(busy) — 정리되면 지워진다", async () => {
  const noRooms: TranscriptInput[] = [];
  // 하루에 저장할 수 있는 검사 수 제한 때문에 경우마다 새 계정을 쓴다
  const case_ = async (label: string, setup: (id: string, userId: string) => Promise<void> | void, clear: (id: string) => Promise<void> | void) => {
    const U = await makeUser();
    const id = await newAssessment(U.id, label.slice(0, 8));
    await setup(id, U.id);
    assert.equal(await server.deleteAssessmentRecord(U.id, id, noRooms), "busy", `${label}: 진행 중이면 지우지 않는다`);
    assert.equal((await admin.from("assessments").select("record_deleted_at").eq("id", id).single()).data?.record_deleted_at, null, `${label}: 그대로`);
    await clear(id);
    assert.equal(await server.deleteAssessmentRecord(U.id, id, noRooms), "deleted", `${label}: 정리된 뒤에는 지워진다`);
    await U.client.auth.signOut();
  };

  // 1) 생성 중인 리포트(15분 안) — 개인이든 궁합이든
  await case_(
    "생성 중",
    async (id, userId) => {
      const o = await payOrder(userId, `saju-compat:${randomUUID()}`, id, 4900);
      const r = await server.insertReport({ userId, orderId: o.id, assessmentId: id, status: "generating", attempts: 1 });
      assert.ok(r.ok);
    },
    (id) => void sqlRaw(`update public.reports set updated_at = now() - interval '20 minutes' where assessment_id = '${id}'`),
  );
  // 2) 결제 대기 주문(1시간 안) — 질문 결제 주문은 막지 않는다
  await case_(
    "결제 대기",
    async (id, userId) => {
      const cash = await server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId, assessmentId: id, productId: questionProductId(createQuestionNonce("love")), amount: questionQuote().priceKrw, paymentEnv: "test" });
      assert.ok(cash.ok, "질문 결제 대기 주문은 삭제를 막지 않는다");
      const o = await server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId, assessmentId: id, productId: "personal-integrated-report", amount: 9900, paymentEnv: "test" });
      assert.ok(o.ok);
    },
    (id) => void sql(`update public.orders set created_at = now() - interval '2 hours' where assessment_id = '${id}' and status = 'pending'`),
  );
  // 3) 결제는 끝났는데 아직 리포트 줄이 없는 궁합 주문 — 삭제 뒤에는 줄을 넣을 수 없으므로 줄이 생긴 뒤에
  await case_(
    "궁합 결제 완료 · 리포트 줄 없음",
    async (id, userId) => void (await payOrder(userId, `report-compat:${randomUUID()}`, id, 9900)),
    (id) => void sql(`insert into public.reports (user_id, order_id, assessment_id, status, attempts) select user_id, id, assessment_id, 'failed', 1 from public.orders where assessment_id = '${id}' and product_id like 'report-compat:%'`),
  );
});

test("진행 중인 맛보기 작성 · 답을 기다리는 질문 · 방금 오간 질문 · 방금 쓴 질문권도 지우지 않는다(busy)", async () => {
  const U = await makeUser();
  const noRooms: TranscriptInput[] = [];
  // 맛보기 작성 중
  const t = await newAssessment(U.id, "맛보기작성중");
  assert.deepEqual(await server.reserveTasteReport({ userId: U.id, assessmentId: t }), { state: "reserved" });
  assert.equal(await server.deleteAssessmentRecord(U.id, t, noRooms), "busy");
  await server.releaseTasteReport({ userId: U.id, assessmentId: t });
  assert.equal(await server.deleteAssessmentRecord(U.id, t, noRooms), "deleted");
  assert.deepEqual((await admin.from("taste_reports").select("assessment_id").eq("user_id", U.id)).data, [], "받은 적 없는 예약 줄은 지워진다(무료 한 번은 그대로 남아 있다)");

  // 답을 기다리는 질문 · 방금 확정된 질문
  const c = await newAssessment(U.id, "질문진행중");
  const reservation = await server.reserveChatQuestion({ userId: U.id, assessmentId: c, roomKey: "love", max: 3 });
  assert.ok(reservation && reservation.id !== null);
  assert.equal(await server.deleteAssessmentRecord(U.id, c, noRooms), "busy", "답을 기다리는 질문");
  await server.confirmChatQuestion(reservation!, { userId: U.id, assessmentId: c, roomKey: "love" });
  assert.equal(await server.deleteAssessmentRecord(U.id, c, noRooms), "busy", "방금(30초) 오간 질문");
  sqlRaw(`update public.chat_questions set created_at = now() - interval '2 minutes' where assessment_id = '${c}'`);
  assert.equal(await server.deleteAssessmentRecord(U.id, c, noRooms), "deleted");
  assert.equal(sql(`select count(*) from public.chat_questions where assessment_id = '${c}'`), "1", "질문 횟수 기록은 그대로");

  // 방금 쓴 질문권
  const q = await newAssessment(U.id, "질문권사용");
  await payOrder(U.id, questionProductId(createQuestionNonce("love")), q, questionQuote().priceKrw);
  const spent = await server.spendCash({ userId: U.id, amount: 1, ref: `spend-${randomUUID()}` });
  assert.ok(spent);
  assert.equal(await server.deleteAssessmentRecord(U.id, q, noRooms), "busy", "방금(30초) 쓴 질문권");
  sqlRaw(`update public.cash_ledger set created_at = now() - interval '2 minutes' where user_id = '${U.id}' and kind = 'spend'`);
  assert.equal(await server.deleteAssessmentRecord(U.id, q, noRooms), "deleted");
  await U.client.auth.signOut();
});

test("삭제 뒤: 새 리포트 · 새 주문 · 맛보기 글이 생기거나 되살아나지 않는다 (DB 장치 + 저장소 경로 + 서비스), 질문 결제는 계속된다", async () => {
  const U = await makeUser();
  const f = await fixture(U.id, "삭제뒤");
  assert.equal(await server.deleteAssessmentRecord(U.id, f.id, await transcriptsOf(f.id)), "deleted");

  // 리포트: 저장소 경로는 '만들 수 없음', 직접 넣으면 DB가 거절
  const orderForReport = await server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: U.id, assessmentId: await newAssessment(U.id, "다른결과"), productId: "personal-integrated-report", amount: 9900, paymentEnv: "test" });
  assert.ok(orderForReport.ok);
  if (!orderForReport.ok) return;
  assert.deepEqual(await server.insertReport({ userId: U.id, orderId: orderForReport.value.id, assessmentId: f.id, status: "queued", attempts: 0 }), { ok: false, reason: "conflict" });
  const rawReport = await admin.from("reports").insert({ user_id: U.id, order_id: orderForReport.value.id, assessment_id: f.id, status: "queued", attempts: 0 });
  assert.match(rawReport.error?.message ?? "", /record_deleted/);
  assert.equal((await admin.from("reports").select("id").eq("assessment_id", f.id).neq("id", f.compatReportId)).data?.length, 0);

  // 주문: 개인 · 궁합 · 고민 주문은 막고, 질문 결제 주문은 채팅이 계속되므로 허용
  for (const productId of ["personal-integrated-report", "personal-integrated-report:r2:x", `saju-compat:${randomUUID()}`, `concern-report:${randomUUID()}`]) {
    await assert.rejects(
      server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: U.id, assessmentId: f.id, productId, amount: 9900, paymentEnv: "test" }),
      /record_deleted/,
      productId,
    );
  }
  const cash = await server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: U.id, assessmentId: f.id, productId: questionProductId(createQuestionNonce("love")), amount: questionQuote().priceKrw, paymentEnv: "test" });
  assert.ok(cash.ok, "질문 결제 주문은 삭제한 기록에서도 만들어진다");

  // 맛보기: 직접 고치기(글 · 상태) · 새로 예약 · 늦게 도착한 저장이 모두 글을 되살리지 못한다
  const tombstone = (await admin.from("taste_reports").select().eq("user_id", U.id).single()).data;
  const direct = await admin.from("taste_reports").update({ content: { version: "taste-v2", marker: "되살린 글" } }).eq("user_id", U.id);
  assert.match(direct.error?.message ?? "", /record_deleted/, "직접 갱신은 DB가 거절한다");
  const reopen = await admin.from("taste_reports").update({ status: "pending", content: null, reserved_until: new Date(Date.now() + 60_000).toISOString() }).eq("user_id", U.id);
  assert.match(reopen.error?.message ?? "", /record_deleted/, "pending으로 되돌려 다시 쓰게 하는 길도 막힌다");
  await assert.rejects(server.saveTasteReport({ userId: U.id, assessmentId: f.id, content: { version: "taste-v2", marker: "늦게 온 응답" }, generator: "late", generatorVersion: "0" }), /taste_not_reserved|record_deleted|reserved/i, "늦게 도착한 생성 응답은 저장되지 않는다");
  assert.deepEqual((await admin.from("taste_reports").select().eq("user_id", U.id).single()).data, tombstone, "맛보기 줄은 삭제 직후 그대로(글 없음)");
  const reserved = await server.reserveTasteReport({ userId: U.id, assessmentId: f.id });
  assert.equal(reserved.state, "ready", "이미 받은 줄이라 새로 예약되지 않는다");
  assert.deepEqual(reserved.state === "ready" ? reserved.record.content : null, { deleted: true });
  assert.deepEqual((await admin.from("taste_reports").select().eq("user_id", U.id).single()).data, tombstone);

  // 서비스 경로: 삭제한 기록에서는 맛보기를 요청할 수 없고, 새 분석에서도 무료 한 번이 다시 생기지 않는다
  const writer = { provider: "test", model: "m", promptVersion: "p", totalTimeoutMs: 1000, write: async () => { throw new Error("호출되면 안 된다"); } };
  const asked = await requestTasteReport({ repo: server, writer, loadInput: async () => ({ ok: false, reason: "not-found" }) } as never, { userId: U.id, assessmentId: f.id });
  assert.equal(asked.ok, false);
  assert.equal(asked.ok ? "" : asked.reason, "deleted");
  const fresh = await newAssessment(U.id, "새분석");
  const again = await requestTasteReport({ repo: server, writer, loadInput: async () => ({ ok: false, reason: "not-found" }) } as never, { userId: U.id, assessmentId: fresh });
  assert.equal(again.ok, false, "무료 한 번은 되돌아오지 않는다");
  assert.equal(again.ok ? "" : again.reason, "used-elsewhere");
  assert.deepEqual((await admin.from("taste_reports").select().eq("user_id", U.id).single()).data, tombstone);

  // 새 분석은 그대로 가능하고 구매도 새 결과에서는 된다
  const started = await startCheckout({ repo: server, now: () => new Date() }, { userId: U.id, assessmentId: fresh });
  assert.equal(started.kind, "order");
  assert.deepEqual(await startCheckout({ repo: server, now: () => new Date() }, { userId: U.id, assessmentId: f.id }), { kind: "record-deleted" });
});

test("진행 중인 삭제와 같은 순간 들어온 주문 · 리포트 저장은 삭제가 끝난 뒤 DB 장치에 걸린다 (행 잠금)", async () => {
  const U = await makeUser();
  const f = await fixture(U.id, "잠금시험");
  const payload = await transcriptsOf(f.id);
  const other = await newAssessment(U.id, "잠금상대");
  const orderForReport = await server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: U.id, assessmentId: other, productId: "personal-integrated-report", amount: 9900, paymentEnv: "test" });
  assert.ok(orderForReport.ok);
  if (!orderForReport.ok) return;

  // 삭제 함수를 트랜잭션 안에서 실행한 채 2초 붙잡는다
  const script = `begin; select public.delete_assessment_record('${U.id}', '${f.id}', $j$${JSON.stringify(payload)}$j$::jsonb); select pg_sleep(2); commit;`;
  const child = spawn("psql", [...PG, "-At", "-q", "-c", script], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  const closed = new Promise<void>((resolve) => child.on("close", () => resolve()));
  // 삭제 함수는 실행을 마쳤고(행을 잠근 채) 트랜잭션이 아직 열려 있어 잠자는 동안에 맞부딪힌다
  let holding = false;
  for (let waited = 0; !holding && waited < 8000; waited += 50) {
    holding = sql("select count(*) from pg_stat_activity where wait_event = 'PgSleep'") !== "0";
    if (!holding) await sleep(50);
  }
  assert.ok(holding, "삭제 함수가 행을 잠근 채 열려 있다");
  const t0 = Date.now();
  const racing = await Promise.allSettled([
    server.insertOrder({ orderNumber: createOrderNumber(new Date()), userId: U.id, assessmentId: f.id, productId: "personal-integrated-report", amount: 9900, paymentEnv: "test" }),
    admin.from("reports").insert({ user_id: U.id, order_id: orderForReport.value.id, assessment_id: f.id, status: "queued", attempts: 0 }),
  ]);
  await closed;
  assert.match(out, /deleted/, "삭제 함수가 처리했다");
  assert.ok(Date.now() - t0 >= 300, "삭제가 끝날 때까지 기다렸다");
  assert.equal(racing[0].status, "rejected", "주문은 삭제가 끝난 뒤 거절된다");
  assert.match(String((racing[0] as PromiseRejectedResult).reason), /record_deleted/);
  assert.equal(racing[1].status, "fulfilled");
  assert.match(((racing[1] as PromiseFulfilledResult<{ error: { message: string } | null }>).value.error?.message) ?? "", /record_deleted/, "리포트 저장도 거절된다");
  assert.equal((await admin.from("orders").select("id").eq("assessment_id", f.id).eq("product_id", "personal-integrated-report").neq("order_number", f.personalOrderNumber)).data?.length, 0);
});

test("브라우저 권한: 로그인 회원도 비로그인도 삭제 함수 · 열 · 트리거 함수 · 읽기용 대화 기록을 직접 쓸 수 없다 (기존 권한은 그대로)", async () => {
  const U = await makeUser();
  const f = await fixture(U.id, "권한시험");
  const payload = await transcriptsOf(f.id);
  for (const [label, client] of [["비로그인", anon], ["본인", U.client], ["다른 회원", B.client]] as const) {
    const viaRpc = await client.rpc("delete_assessment_record", { p_user_id: U.id, p_assessment_id: f.id, p_transcripts: payload });
    assert.ok(viaRpc.error, `${label}: 함수를 직접 부를 수 없다`);
    for (const fn of ["block_write_on_deleted_record", "orders_block_deleted_record", "talk_transcripts_owner_check", "talk_transcripts_on_withdraw"]) {
      assert.ok((await client.rpc(fn)).error, `${label}: 트리거 함수 ${fn}를 직접 부를 수 없다`);
    }
  }
  assert.equal((await admin.from("assessments").select("record_deleted_at").eq("id", f.id).single()).data?.record_deleted_at, null, "아무것도 지워지지 않았다");

  // 삭제 표시 열을 직접 바꾸거나 읽기용 기록을 직접 쓰지 못한다
  const upd = await U.client.from("assessments").update({ record_deleted_at: iso() }).eq("id", f.id).select();
  assert.ok(upd.error || (upd.data ?? []).length === 0);
  const unset = await U.client.from("assessments").update({ record_deleted_at: null }).eq("id", f.id).select();
  assert.ok(unset.error || (unset.data ?? []).length === 0);
  assert.equal((await admin.from("assessments").select("record_deleted_at").eq("id", f.id).single()).data?.record_deleted_at, null);
  const ins = await U.client.from("talk_transcripts").insert({ assessment_id: f.id, room_key: "love", user_id: U.id, lines: [] });
  assert.ok(ins.error, "회원이 읽기용 기록을 직접 만들 수 없다");
  const anonRead = await anon.from("talk_transcripts").select();
  assert.ok(anonRead.error || (anonRead.data ?? []).length === 0, "비로그인은 읽을 수 없다");

  // 권한 표: 삭제 함수는 서버(service_role)만, 트리거 함수는 아무도 직접 실행하지 못한다
  const priv = (role: string, fn: string) => sql(`select has_function_privilege('${role}', '${fn}', 'execute')`);
  for (const role of ["anon", "authenticated"]) {
    assert.equal(priv(role, "public.delete_assessment_record(uuid, uuid, jsonb)"), "f", `${role}: 삭제 함수 실행 권한 없음`);
    for (const fn of ["block_write_on_deleted_record()", "orders_block_deleted_record()", "talk_transcripts_owner_check()", "talk_transcripts_on_withdraw()"]) {
      assert.equal(priv(role, `public.${fn}`), "f", `${role}: ${fn} 실행 권한 없음`);
    }
  }
  assert.equal(sql("select has_function_privilege('service_role', 'public.delete_assessment_record(uuid, uuid, jsonb)', 'execute')"), "t");
  // PUBLIC 몫도 없다 — 새 함수의 acl에 PUBLIC(빈 grantee)이 없어야 한다
  for (const fn of ["delete_assessment_record", "block_write_on_deleted_record", "orders_block_deleted_record", "talk_transcripts_owner_check", "talk_transcripts_on_withdraw"]) {
    const acl = sql(`select coalesce(proacl::text, '') from pg_proc where proname = '${fn}' and pronamespace = 'public'::regnamespace`);
    assert.ok(!/(^\{|,)=/.test(acl), `${fn}: PUBLIC 실행 권한이 남아 있다 (${acl})`);
  }
  // 표 권한: 읽기용 기록은 회원은 읽기만, 서버는 읽기 · 쓰기 · 지우기
  assert.equal(sql("select has_table_privilege('authenticated', 'public.talk_transcripts', 'insert')"), "f");
  assert.equal(sql("select has_table_privilege('authenticated', 'public.talk_transcripts', 'select')"), "t");
  assert.equal(sql("select has_table_privilege('anon', 'public.talk_transcripts', 'select')"), "f");
  assert.equal(sql("select has_table_privilege('service_role', 'public.talk_transcripts', 'insert')"), "t");
  assert.equal(sql("select has_table_privilege('service_role', 'public.talk_transcripts', 'delete')"), "f", "서버도 읽기용 기록을 지울 수는 없다(탈퇴 · 연쇄 삭제만)");
  assert.equal(sql("select has_table_privilege('service_role', 'public.talk_transcripts', 'update')"), "f", "만든 뒤 고치지 않는다");
});

test("탈퇴하면 읽기용 대화 기록도 함께 지워진다 (탈퇴 함수는 바꾸지 않았다)", async () => {
  const W = await makeUser();
  const f = await fixture(W.id, "탈퇴시험", { pack: false });
  assert.equal(await server.deleteAssessmentRecord(W.id, f.id, await transcriptsOf(f.id)), "deleted");
  assert.equal((await server.listTalkTranscripts(f.id)).length, 2);
  const out = await server.withdrawMemberData(W.id);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(await server.listTalkTranscripts(f.id), [], "읽기용 대화 기록이 지워졌다");
  assert.equal(sql(`select count(*) from public.talk_transcripts where user_id = '${W.id}'`), "0");
  await W.client.auth.signOut();
});

test("28번 전 DB(삭제 열 · 함수 없음): 삭제 기능만 꺼지고 MY는 모든 리포트를 예전처럼 보인다", async () => {
  const U = await makeUser();
  const f = await fixture(U.id, "이전DB");
  // 28번 전 상태를 흉내: 28번이 더한 장치(트리거)를 잠시 끄고 열 이름을 바꾼다
  sql("alter table public.reports disable trigger reports_block_deleted_record; alter table public.orders disable trigger orders_block_deleted_record; alter table public.taste_reports disable trigger taste_reports_block_deleted_record; alter table public.assessments rename column record_deleted_at to record_deleted_at_off; notify pgrst, 'reload schema'");
  await sleep(800);
  try {
    const page = await getMyPage(createSupabaseRepository(U.client), U.id);
    assert.equal(page.deleteAvailable, false);
    assert.ok(page.cards.some((c) => c.assessmentId === f.id));
    assert.deepEqual(page.deletedRecords, []);
    const view = await getResultView(createSupabaseRepository(U.client), { userId: U.id, assessmentId: f.id });
    assert.equal(view?.deleted, false);
    assert.equal(view?.report?.status, "ready", "리포트는 예전처럼 열린다");
    // 삭제를 시도하면 '준비 중'으로 멈추고 아무것도 바뀌지 않는다
    assert.deepEqual(await deleteReportRecord(server, { userId: U.id, assessmentId: f.id }, { renderRoom: renderer }), { kind: "db-not-ready" });
    assert.equal((await server.listTalkRoomKeys(f.id)).length, 2);
    assert.equal((await admin.from("reports").select("id").eq("assessment_id", f.id)).data?.length, 2);
  } finally {
    sql("alter table public.assessments rename column record_deleted_at_off to record_deleted_at; alter table public.reports enable trigger reports_block_deleted_record; alter table public.orders enable trigger orders_block_deleted_record; alter table public.taste_reports enable trigger taste_reports_block_deleted_record; notify pgrst, 'reload schema'");
    await sleep(800);
  }
  assert.equal(sql("select count(*) from pg_trigger where tgname in ('reports_block_deleted_record','orders_block_deleted_record','taste_reports_block_deleted_record') and tgenabled = 'O'"), "3", "장치가 모두 다시 켜졌다");
  await U.client.auth.signOut();
});

test("실제 Supabase와 같은 기본 권한(새 표에 서버 역할 모든 권한이 자동으로 붙는 조건)에서도 새 표의 권한은 정확하고, 28번은 기존 표 · 함수의 권한을 바꾸지 않는다", () => {
  const dir = join(import.meta.dirname, "..", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  assert.equal(files.at(-1), "20261107000000_record_delete.sql");
  const base = ["-h", "127.0.0.1", "-p", process.env.PG_PORT ?? "54329", "-U", "postgres"];
  const db = `acl28_${process.pid}`;
  const inDb = (q: string) => execFileSync("psql", [...base, "-d", db, "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", q]).toString().trim();
  const fileIn = (f: string) => execFileSync("psql", [...base, "-d", db, "-q", "-v", "ON_ERROR_STOP=1", "-f", join(dir, f)], { stdio: ["ignore", "ignore", "pipe"] });
  execFileSync("dropdb", [...base, "--if-exists", db]);
  execFileSync("createdb", [...base, db]);
  try {
    // Auth 스키마를 가져온다(회원 표 · auth.uid) — 일부 트리거가 가리키는 앱 함수가 아직 없어 나는 오류는 무시한다
    execFileSync("bash", ["-c", `pg_dump -h 127.0.0.1 -p ${process.env.PG_PORT ?? "54329"} -U postgres -s -n auth postgres | psql -h 127.0.0.1 -p ${process.env.PG_PORT ?? "54329"} -U postgres -d ${db} -q >/dev/null 2>&1 || true`]);
    assert.equal(inDb("select to_regclass('auth.users') is not null"), "t");
    // 실제 Supabase의 기본 권한: postgres가 public에 만드는 새 표 · 함수 · 순서에 anon · authenticated · service_role의 모든 권한이 자동으로 붙는다
    inDb(
      "alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;" +
        "alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;" +
        "alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role",
    );
    for (const f of files.slice(0, -1)) fileIn(f);
    // 조건이 정말 걸려 있는지: 28번 전에 만든 표(orders)에는 서버 역할의 모든 권한이 기본으로 붙어 있다
    assert.equal(inDb("select has_table_privilege('service_role', 'public.orders', 'delete')"), "t", "기본 권한 조건이 적용됐다");
    const snapshot = () =>
      inDb(
        "select 'rel ' || c.relname || ' ' || coalesce(c.relacl::text, '-') from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','S','v') " +
          "union all select 'fn ' || p.oid::regprocedure::text || ' ' || coalesce(p.proacl::text, '-') from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1",
      )
        .split("\n")
        .sort();
    const before = snapshot();
    fileIn("20261107000000_record_delete.sql");
    const after = snapshot();
    // 기존 표 · 함수의 권한은 28번 전후가 똑같다 — 달라진 줄은 모두 새로 생긴 것(새 표 · 새 함수)뿐이다
    const beforeSet = new Set(before);
    const changedOrNew = after.filter((line) => !beforeSet.has(line));
    const NEW = /^(rel talk_transcripts |fn (public\.)?(talk_transcripts_owner_check|talk_transcripts_on_withdraw|block_write_on_deleted_record|orders_block_deleted_record|delete_assessment_record)\()/;
    assert.deepEqual(changedOrNew.filter((l) => !NEW.test(l)), [], "새 표 · 새 함수 말고는 권한이 달라진 것이 없다");
    assert.deepEqual(before.filter((l) => !new Set(after).has(l)), [], "기존 줄이 사라지거나 바뀌지 않았다");

    // 새 표: 회원은 읽기만, 서버는 읽기 · 넣기만, 비로그인 · PUBLIC은 아무것도 없다
    const privs = ["select", "insert", "update", "delete", "truncate", "references", "trigger"];
    const matrix = (role: string) => privs.filter((p) => inDb(`select has_table_privilege('${role}', 'public.talk_transcripts', '${p}')`) === "t");
    assert.deepEqual(matrix("anon"), []);
    assert.deepEqual(matrix("authenticated"), ["select"]);
    assert.deepEqual(matrix("service_role"), ["select", "insert"], "서버 역할의 기본 모든 권한(고치기 · 지우기 · 비우기 포함)이 남아 있지 않다");
    const acl = inDb("select relacl::text from pg_class where oid = 'public.talk_transcripts'::regclass");
    assert.ok(!/(^\{|,)=/.test(acl), `PUBLIC 몫이 없다 (${acl})`);
    assert.equal(inDb("select count(*) from information_schema.column_privileges where table_name = 'talk_transcripts' and grantee in ('anon') "), "0");

    // 새 함수: PUBLIC · anon · authenticated는 직접 실행 못 하고, 삭제 함수만 서버가 실행한다
    for (const fn of ["delete_assessment_record(uuid, uuid, jsonb)", "block_write_on_deleted_record()", "orders_block_deleted_record()", "talk_transcripts_owner_check()", "talk_transcripts_on_withdraw()"]) {
      for (const role of ["anon", "authenticated"]) assert.equal(inDb(`select has_function_privilege('${role}', 'public.${fn}', 'execute')`), "f", `${role}: ${fn}`);
      const facl = inDb(`select coalesce(proacl::text, '') from pg_proc where oid = 'public.${fn}'::regprocedure`);
      assert.ok(!/(^\{|,)=/.test(facl), `${fn}: PUBLIC 실행 권한이 없다 (${facl})`);
    }
    assert.equal(inDb("select has_function_privilege('service_role', 'public.delete_assessment_record(uuid, uuid, jsonb)', 'execute')"), "t");
  } finally {
    execFileSync("dropdb", [...base, "--if-exists", db]);
  }
});
