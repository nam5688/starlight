// DB 검증(이용 후기, 마이그레이션 25번): 후기 표의 접근 정책 · 한 이용 건에 후기 하나 · 보상(질문권) 한 번(동시 제출 포함) · 묘비 · 표의 검사 · 운영자 조치 함수와 이력 · 신고 · 공개 조회 · 탈퇴하면 지우기 · 방문 단계 이름을 실제 Postgres에서 확인한다.
// 실행 전 local-stack.sh start 필요(마이그레이션 1~25번이 모두 적용돼 있어야 한다). 실행: npm run test:db
// 이 시험은 개발용 임시 DB에서만 돈다. 실제 Supabase · 실제 결제에서는 아직 확인하지 않았다.
// 혜택 설정(feature.review_reward)은 모든 파일이 함께 쓰는 한 줄이라 이 시험은 켜고 끝에 반드시 끈다 — 파일끼리 동시에 돌면 서로의 설정을 바꿀 수 있어 npm run test:db는 한 번에 한 파일씩 돈다(--test-concurrency=1).
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ASSESSMENT_MODULES } from "../../lib/assessment/modules/index.ts";
import { createSupabaseBenefitRepository } from "../../lib/integrations/supabase/benefits.ts";
import { createSupabaseRepository } from "../../lib/integrations/supabase/repository.ts";
import { createSupabaseReviewRepository } from "../../lib/integrations/supabase/reviews.ts";
import { EMPTY_BASIC_INFO } from "../../lib/profile/basic-info.ts";
import { devReportGenerator } from "../../lib/report/generate-dev-report.ts";
import { manseryeokEngine as sajuEngine } from "../../lib/saju/manseryeok-engine.ts";
import { submitAssessment } from "../../lib/services/assessment-service.ts";
import { withdrawMember } from "../../lib/services/member-service.ts";
import { confirmPayment, startCheckout } from "../../lib/services/order-service.ts";
import type { PaymentGateway } from "../../lib/services/ports.ts";
import { ensureReport } from "../../lib/services/report-service.ts";
import { applyReviewAction, getReviewStats, scanPublicReviews } from "../../lib/services/review-admin-service.ts";
import { createReview, deleteReview, editReview, getMyReviewsView, homeReviews, publicReviewsPage, reportReview, retryReviewRewards, setReviewVisibility, type ReviewDeps } from "../../lib/services/review-service.ts";

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
const reviews = createSupabaseReviewRepository(admin);

const answers = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((i, n) => [i.id, (n % 5) + 1])));
const info = { ...EMPTY_BASIC_INFO, nickname: "후기시험", birthYear: "1996", birthMonth: "3", birthDay: "29", birthTime: "09:30", gender: "female" as const };
const nowFn = () => new Date();
const deps: ReviewDeps = { repo: server, reviews, benefits, now: nowFn };
const GOOD = "풀이가 평소 내 모습과 이어져서 한참 생각해 볼 수 있었어요.";
const ADMIN_ID = randomUUID();

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
  const email = `r-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL, ANON_KEY, noSession);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, client };
}

/** 회원 + 검사 결과 + 결제 완료한 심층 리포트 + 완성된 리포트(개발용 생성기) */
async function buyer() {
  const U = await makeUser();
  const saved = await submitAssessment({ repo: server, saju: sajuEngine }, { userId: U.id, channel: "web", info, answers, today: new Date() });
  assert.ok(saved.ok);
  const aid = saved.ok ? saved.assessment.id : "";
  const started = await startCheckout({ repo: server, now: nowFn }, { userId: U.id, assessmentId: aid });
  assert.equal(started.kind, "order");
  if (started.kind !== "order") throw new Error("order");
  const paid = await confirmPayment({ repo: server, gateway }, { userId: U.id, orderNumber: started.order.orderNumber, paymentKey: `pk-${randomUUID()}`, amount: started.order.amount });
  assert.equal(paid.kind, "paid");
  if (paid.kind !== "paid") throw new Error("paid");
  assert.equal((await ensureReport({ repo: server, generator: devReportGenerator, now: nowFn }, paid.order))?.status, "ready");
  return { U, aid, order: paid.order };
}

const write = (b: { U: { id: string }; order: { id: string } }, o: { body?: string; publicConsent?: boolean; rating?: number } = {}) =>
  createReview(deps, { userId: b.U.id, kind: "personal", ref: b.order.id, rating: o.rating ?? 5, body: o.body ?? GOOD, publicConsent: o.publicConsent ?? true });

const setReward = (on: boolean) => benefits.setSetting({ key: "feature.review_reward", value: on, reason: "DB 시험", by: null });

before(async () => {
  // 기본값은 꺼짐이어야 한다(마이그레이션을 적용해도 아무것도 지급되지 않는다)
  assert.equal((await benefits.getSettings())["feature.review_reward"], false);
});
after(async () => {
  await setReward(false);
});

test("표의 접근 정책: 본인만 조회하고, 다른 회원 · 익명은 읽지 못하며, 본인 로그인으로도 쓰거나 고치거나 지울 수 없다(서버만 쓴다)", async () => {
  const a = await buyer();
  const b = await buyer();
  const ra = await write(a);
  const rb = await write(b);
  assert.ok(ra.kind === "created" && rb.kind === "created");
  if (ra.kind !== "created" || rb.kind !== "created") return;
  // 본인은 자기 후기만 읽는다
  const mine = await a.U.client.from("reviews").select("id, body");
  assert.equal(mine.error, null);
  assert.deepEqual((mine.data ?? []).map((r) => r.id), [ra.review.id]);
  // 남의 후기를 번호로 찔러도 보이지 않는다
  const peek = await a.U.client.from("reviews").select("id").eq("id", rb.review.id);
  assert.deepEqual(peek.data ?? [], []);
  // 익명은 아무것도 읽지 못한다
  const anon = await createClient(URL, ANON_KEY, noSession).from("reviews").select("id");
  assert.ok(anon.error !== null || (anon.data ?? []).length === 0);
  // 본인 로그인으로 쓰기 · 고치기 · 지우기는 권한이 없다
  const ins = await a.U.client.from("reviews").insert({ user_id: a.U.id, kind: "chat", subject_ref: randomUUID(), rating: 5, body: GOOD });
  assert.ok(ins.error, "본인 로그인으로 후기를 직접 만들 수 없다");
  const upd = await a.U.client.from("reviews").update({ body: "고침" }).eq("id", ra.review.id).select();
  assert.ok(upd.error !== null || (upd.data ?? []).length === 0);
  const del = await a.U.client.from("reviews").delete().eq("id", ra.review.id).select();
  assert.ok(del.error !== null || (del.data ?? []).length === 0);
  assert.equal((await reviews.getReview(ra.review.id))?.body, GOOD);
  // 운영자 이력 · 신고 표는 본인도 읽지 못한다
  for (const t of ["review_admin_log", "review_reports"]) {
    const r = await a.U.client.from(t).select("*");
    assert.ok(r.error !== null || (r.data ?? []).length === 0, t);
  }
  // 서버는 읽는다
  assert.equal((await reviews.getReviewByKey(a.U.id, "personal", a.order.id))?.id, ra.review.id);
});

test("동시에 8번 제출해도 후기는 하나, 보상 질문권은 한 번만 들어온다(실제 Postgres) — 수정 · 비공개 · 삭제 · 다시 쓰기에서도 다시 주지 않는다", async () => {
  await setReward(true);
  try {
    const b = await buyer();
    const results = await Promise.all(Array.from({ length: 8 }, () => write(b)));
    assert.equal(results.filter((r) => r.kind === "created").length, 1);
    assert.equal(results.filter((r) => r.kind === "exists").length, 7);
    const lots = (await benefits.listCreditLots(b.U.id)).filter((l) => l.kind === "review");
    assert.equal(lots.length, 1, "후기 보상 질문권 묶음은 하나");
    assert.equal(lots[0].quantity, 1);
    assert.ok(lots[0].expiresAt, "지급일부터 1년 안에 만료");
    const created = results.find((r) => r.kind === "created");
    assert.ok(created && created.kind === "created");
    if (!created || created.kind !== "created") return;
    assert.equal(lots[0].sourceRef, `review:${created.review.id}`);
    const row = await reviews.getReview(created.review.id);
    assert.deepEqual([row?.rewardState, row?.rewardCredits, row?.disclosure], ["granted", 1, "reward"]);
    assert.ok(row?.rewardedAt && row.rewardOpKey === `review:${created.review.id}`);
    assert.equal(await benefits.getCreditBalance(b.U.id), 1);
    // 같은 키로 직접 한 번 더 지급을 시도해도 중복이다(질문권 장부의 멱등 키)
    assert.equal((await benefits.grantCredit({ userId: b.U.id, kind: "review", qty: 1, sourceRef: `review:${created.review.id}`, opKey: `review:${created.review.id}`, expiresAt: null })).status, "duplicate");
    // 수정 · 비공개 · 삭제 · 다시 쓰기
    assert.equal((await editReview(deps, { userId: b.U.id, id: created.review.id, rating: 2, body: `${GOOD} 고쳤어요.`, publicConsent: true })).kind, "updated");
    assert.equal((await setReviewVisibility(deps, { userId: b.U.id, id: created.review.id, publicConsent: false })).kind, "updated");
    assert.equal((await deleteReview(deps, { userId: b.U.id, id: created.review.id })).kind, "deleted");
    const again = await write(b, { body: `${GOOD} 다시 썼어요.` });
    assert.equal(again.kind, "revived");
    if (again.kind === "revived") assert.equal(again.review.id, created.review.id, "같은 후기 자리를 다시 쓴다");
    assert.equal(await benefits.getCreditBalance(b.U.id), 1);
    assert.equal((await benefits.listCreditLots(b.U.id)).filter((l) => l.kind === "review").length, 1);
    const totals = await benefits.ledgerTotals(new Date(Date.now() - 86_400_000).toISOString());
    assert.equal(totals.lotMismatches, 0, "질문권 장부와 묶음 잔여가 맞는다");
    // 보상 질문권은 질문에 쓰이고, 쓴 뒤에 후기를 지워도 되찾지 않는다
    assert.equal((await benefits.spendCredit({ userId: b.U.id, ref: `ask-${randomUUID()}` })).status, "spent");
    await deleteReview(deps, { userId: b.U.id, id: created.review.id });
    assert.equal(await benefits.getCreditBalance(b.U.id), 0);
  } finally {
    await setReward(false);
  }
});

test("보상 스위치가 꺼져 있으면(기본) 후기만 저장되고 질문권은 없다 — 지급을 시작했지만 확정하지 못한 후기는 켜진 뒤 같은 키로 한 번만 맞춘다", async () => {
  const b = await buyer();
  const r = await write(b);
  assert.ok(r.kind === "created");
  if (r.kind !== "created") return;
  assert.deepEqual([r.review.rewardState, r.review.disclosure], ["off", "none"]);
  assert.equal(await benefits.getCreditBalance(b.U.id), 0);

  // pending 후기(지급은 됐지만 확정 기록이 남지 않은 상태)를 만들어 같은 키로 다시 맞춘다
  await setReward(true);
  try {
    const c = await buyer();
    const flaky = { ...deps, reviews: { ...reviews, settleReward: async () => Promise.reject(new Error("settle failed")) } };
    const made = await createReview(flaky, { userId: c.U.id, kind: "personal", ref: c.order.id, rating: 5, body: GOOD, publicConsent: true });
    assert.ok(made.kind === "created");
    assert.equal(await benefits.getCreditBalance(c.U.id), 1);
    assert.equal((await reviews.listUserReviews(c.U.id))[0].rewardState, "pending");
    assert.deepEqual(await retryReviewRewards(deps, { userId: c.U.id }), { tried: 1, granted: 1 });
    assert.equal(await benefits.getCreditBalance(c.U.id), 1, "같은 키라 한 번 더 들어가지 않는다");
    assert.equal((await reviews.listUserReviews(c.U.id))[0].rewardState, "granted");
  } finally {
    await setReward(false);
  }
});

test("표의 검사: 같은 이용 건에는 후기가 하나, 공개 중이면 공개 동의가 있어야 하고, 삭제된 후기는 글이 비어 있어야 하며, 보상 기록의 앞뒤가 맞아야 한다", async () => {
  const b = await buyer();
  const r = await write(b);
  assert.ok(r.kind === "created");
  if (r.kind !== "created") return;
  const id = r.review.id;
  // 같은 (회원, 종류, 이용 건)을 직접 또 넣으면 고유 조건에 걸린다
  const dup = await admin.from("reviews").insert({ user_id: b.U.id, kind: "personal", subject_ref: b.order.id, rating: 3, body: "다시" });
  assert.equal(dup.error?.code, "23505");
  const both = await reviews.insertReview({ userId: b.U.id, kind: "personal", subjectRef: b.order.id, rating: 3, body: "다시", publicConsent: true, disclosure: "none", freeTrial: false, rewardState: "off", consentNoticeVersion: "x" });
  assert.deepEqual(both, { ok: false, reason: "exists" });
  // 종류 · 별점 · 글 길이
  assert.ok((await admin.from("reviews").insert({ user_id: b.U.id, kind: "unknown", subject_ref: randomUUID(), rating: 3 })).error);
  assert.ok((await admin.from("reviews").insert({ user_id: b.U.id, kind: "chat", subject_ref: randomUUID(), rating: 6 })).error);
  assert.ok((await admin.from("reviews").insert({ user_id: b.U.id, kind: "chat", subject_ref: randomUUID(), rating: 5, body: "가".repeat(601) })).error);
  // 공개 중인데 동의가 없다 / 동의했는데 동의 시각이 없다
  assert.ok((await admin.from("reviews").update({ public_consent: false }).eq("id", id)).error, "published이면 동의가 있어야 한다");
  assert.ok((await admin.from("reviews").update({ consented_at: null }).eq("id", id)).error, "동의했으면 동의 시각이 있어야 한다");
  // 삭제 상태인데 글이 남아 있다
  assert.ok((await admin.from("reviews").update({ status: "deleted", deleted_by: "user", public_consent: false, consented_at: null }).eq("id", id)).error, "삭제된 후기는 글이 비어 있어야 한다");
  // 보상: granted가 아닌데 질문권 수가 있다 / granted인데 지급 시각이 없다 / 지급 중인데 키가 없다
  assert.ok((await admin.from("reviews").update({ reward_credits: 1 }).eq("id", id)).error);
  assert.ok((await admin.from("reviews").update({ reward_state: "granted", reward_credits: 1, reward_op_key: "k" }).eq("id", id)).error);
  assert.ok((await admin.from("reviews").update({ reward_state: "pending" }).eq("id", id)).error);
  assert.equal((await reviews.getReview(id))?.rewardState, "off");
});

test("묘비: 삭제해도 행이 남고(글만 지워짐) 다시 써도 같은 후기 자리이며, 운영자가 지운 후기는 회원이 다시 쓸 수 없다", async () => {
  const b = await buyer();
  const r = await write(b);
  assert.ok(r.kind === "created");
  if (r.kind !== "created") return;
  assert.equal((await deleteReview(deps, { userId: b.U.id, id: r.review.id })).kind, "deleted");
  const tomb = await reviews.getReview(r.review.id);
  assert.deepEqual([tomb?.status, tomb?.body, tomb?.publicConsent, tomb?.deletedBy], ["deleted", "", false, "user"]);
  assert.ok(tomb?.deletedAt);
  assert.equal((await deleteReview(deps, { userId: b.U.id, id: r.review.id })).kind, "not-found");
  assert.equal((await publicReviewsPage(reviews, { group: null, page: 1 })).reviews.some((x) => x.id === r.review.id), false);
  const back = await write(b, { body: `${GOOD} 다시` });
  assert.equal(back.kind, "revived");
  assert.deepEqual([(await reviews.getReview(r.review.id))?.status, (await reviews.getReview(r.review.id))?.deletedBy], ["published", null]);
  // 운영자가 지우면 다시 쓸 수 없다
  const gone = await applyReviewAction(deps, { reviewId: r.review.id, action: "delete", reasonCode: "fake_or_ad", memo: "", adminId: ADMIN_ID });
  assert.ok(gone.ok);
  assert.equal((await write(b)).kind, "blocked");
  assert.equal((await reviews.getReview(r.review.id))?.deletedBy, "admin");
});

test("운영자 조치 함수: 사유 분류가 조치에 맞아야 하고(맞지 않으면 아무것도 바뀌지 않음), 상태 변경과 이력이 한 번에 남으며 이력에는 글이 없다", async () => {
  const b = await buyer();
  const r = await write(b, { body: `${GOOD} 문의 비밀번호는 hunter2 입니다.` });
  assert.ok(r.kind === "created");
  if (r.kind !== "created") return;
  const id = r.review.id;
  // 이력 검사 — "부정적인 내용" 같은 분류 · 조치에 맞지 않는 분류 · 메모 없는 기타 모두 거절되고 후기는 그대로
  for (const [action, reason, memo] of [["hide", "negative", null], ["hide", "no_violation", null], ["hide", "other", null], ["feature", "privacy", null]] as const) {
    const res = await reviews.adminApply({ reviewId: id, action, reasonCode: reason, memo, adminId: ADMIN_ID });
    assert.deepEqual(res, { ok: false, reason: "invalid-reason" }, `${action}/${reason}`);
  }
  assert.equal((await reviews.getReview(id))?.status, "published");
  assert.deepEqual(await reviews.listAdminLog({ reviewId: id, limit: 10 }), []);
  // 선정 → 숨김 → 숨김 중 회원 수정 → 해제
  assert.ok((await applyReviewAction(deps, { reviewId: id, action: "feature", reasonCode: "specific", memo: "", adminId: ADMIN_ID })).ok);
  assert.equal((await reviews.getReview(id))?.featured, true);
  assert.equal((await applyReviewAction(deps, { reviewId: id, action: "feature", reasonCode: "specific", memo: "", adminId: ADMIN_ID })).ok, false, "이미 선정됨");
  assert.ok((await applyReviewAction(deps, { reviewId: id, action: "hide", reasonCode: "privacy", memo: "", adminId: ADMIN_ID })).ok);
  assert.equal((await reviews.getReview(id))?.status, "hidden");
  assert.equal((await publicReviewsPage(reviews, { group: null, page: 1 })).reviews.some((x) => x.id === id), false);
  assert.equal((await editReview(deps, { userId: b.U.id, id, rating: 5, body: `${GOOD} 고쳤어요.`, publicConsent: true })).kind, "updated");
  assert.equal((await reviews.getReview(id))?.status, "hidden", "숨김 중에는 회원이 고쳐도 다시 공개되지 않는다");
  assert.equal((await applyReviewAction(deps, { reviewId: id, action: "hide", reasonCode: "privacy", memo: "", adminId: ADMIN_ID })).ok, false, "이미 숨김");
  assert.ok((await applyReviewAction(deps, { reviewId: id, action: "unhide", reasonCode: "resolved", memo: "", adminId: ADMIN_ID })).ok);
  assert.equal((await reviews.getReview(id))?.status, "published");
  assert.equal((await applyReviewAction(deps, { reviewId: id, action: "unfeature", reasonCode: "replaced", memo: "", adminId: ADMIN_ID })).ok, true);
  assert.equal((await applyReviewAction(deps, { reviewId: "00000000-0000-4000-8000-00000000dead", action: "hide", reasonCode: "privacy", memo: "", adminId: ADMIN_ID })).ok, false);
  const log = await reviews.listAdminLog({ reviewId: id, limit: 10 });
  assert.deepEqual(log.map((l) => `${l.action}:${l.reasonCode}`).reverse(), ["feature:specific", "hide:privacy", "unhide:resolved", "unfeature:replaced"]);
  assert.ok(log.every((l) => l.adminId === ADMIN_ID));
  assert.ok(!JSON.stringify(log).includes("hunter2"), "이력에는 글이 없다");
  // 직접 쓴 이력 한 줄도 같은 검사를 받는다(이력은 쌓기만 하고 서버만 쓴다)
  assert.ok((await admin.from("review_admin_log").insert({ review_id: id, admin_id: ADMIN_ID, action: "hide", reason_code: "negative" })).error);
  const anon = await createClient(URL, ANON_KEY, noSession).from("review_admin_log").select("id");
  assert.ok(anon.error !== null || (anon.data ?? []).length === 0);
});

test("신고: 공개 중인 후기에만 받고 같은 방문자는 한 번뿐이며, 숨김 · 신고 기각이 열린 신고를 닫는다", async () => {
  const b = await buyer();
  const r = await write(b);
  assert.ok(r.kind === "created");
  if (r.kind !== "created") return;
  const id = r.review.id;
  assert.equal(await reportReview(reviews, { reviewId: id, reporterKey: "visitor-aaaa-0001", reason: "privacy" }), "reported");
  assert.equal(await reportReview(reviews, { reviewId: id, reporterKey: "visitor-aaaa-0001", reason: "abuse" }), "duplicate");
  assert.equal(await reportReview(reviews, { reviewId: id, reporterKey: "visitor-bbbb-0002", reason: "fake_or_ad" }), "reported");
  const listed = await reviews.adminListReviews({ reportedOnly: true, limit: 50, offset: 0 });
  assert.equal(listed.rows.find((x) => x.review.id === id)?.openReports, 2);
  assert.ok((await applyReviewAction(deps, { reviewId: id, action: "dismiss_reports", reasonCode: "no_violation", memo: "", adminId: ADMIN_ID })).ok);
  assert.equal((await reviews.adminListReviews({ reportedOnly: true, limit: 50, offset: 0 })).rows.some((x) => x.review.id === id), false);
  assert.equal((await reviews.getReview(id))?.status, "published", "기각해도 후기는 그대로");
  assert.equal((await applyReviewAction(deps, { reviewId: id, action: "dismiss_reports", reasonCode: "no_violation", memo: "", adminId: ADMIN_ID })).ok, false, "열린 신고가 없다");
  // 비공개로 바꾸면 더 받지 않는다
  await setReviewVisibility(deps, { userId: b.U.id, id, publicConsent: false });
  assert.equal(await reportReview(reviews, { reviewId: id, reporterKey: "visitor-cccc-0003", reason: "privacy" }), "not-public");
  // 모양이 틀린 입력은 DB에 닿지 않는다
  assert.equal(await reportReview(reviews, { reviewId: id, reporterKey: "visitor-cccc-0003", reason: "negative" }), "invalid");
  // 신고 표는 서버만 읽는다
  const anon = await createClient(URL, ANON_KEY, noSession).from("review_reports").select("id");
  assert.ok(anon.error !== null || (anon.data ?? []).length === 0);
});

test("공개 조회: 공개 중이고 동의한 후기만(비공개 · 숨김 · 삭제 제외), 작성자를 알 수 있는 값이 없고, 종류 필터 · 쪽 나누기가 맞다", async () => {
  const pub = await buyer();
  const priv = await buyer();
  const hid = await buyer();
  const del = await buyer();
  const rp = await write(pub, { rating: 2 });
  const rv = await write(priv, { publicConsent: false });
  const rh = await write(hid);
  const rd = await write(del);
  assert.ok(rp.kind === "created" && rv.kind === "created" && rh.kind === "created" && rd.kind === "created");
  if (rp.kind !== "created" || rv.kind !== "created" || rh.kind !== "created" || rd.kind !== "created") return;
  await applyReviewAction(deps, { reviewId: rh.review.id, action: "hide", reasonCode: "abuse", memo: "", adminId: ADMIN_ID });
  await deleteReview(deps, { userId: del.U.id, id: rd.review.id });
  const all = await reviews.listPublicReviews({ limit: 500, offset: 0 });
  const ids = new Set(all.rows.map((x) => x.id));
  assert.ok(ids.has(rp.review.id));
  for (const gone of [rv.review.id, rh.review.id, rd.review.id]) assert.ok(!ids.has(gone), "공개 목록에 나오면 안 된다");
  const keys = new Set(all.rows.flatMap((x) => Object.keys(x)));
  assert.ok(![...keys].some((k) => /user|nick|name|assessment|order|subject|reward/i.test(k)), [...keys].join(","));
  // 종류 필터 — 같은 DB에 다른 시험(채팅 후기 등)이 남긴 후기가 있어도 종류가 맞는 것만 나온다
  const chatOnly = (await reviews.listPublicReviews({ kinds: ["chat"], limit: 500, offset: 0 })).rows;
  assert.ok(chatOnly.every((x) => x.kind === "chat") && !chatOnly.some((x) => x.id === rp.review.id));
  const personalOnly = (await reviews.listPublicReviews({ kinds: ["personal"], limit: 500, offset: 0 })).rows;
  assert.ok(personalOnly.every((x) => x.kind === "personal") && personalOnly.some((x) => x.id === rp.review.id));
  const p1 = await reviews.listPublicReviews({ limit: 1, offset: 0 });
  const p2 = await reviews.listPublicReviews({ limit: 1, offset: 1 });
  assert.equal(p1.total, all.total);
  assert.notEqual(p1.rows[0]?.id, p2.rows[0]?.id);
  assert.ok((await reviews.countPublicReviews()) >= 1);
  assert.ok((await homeReviews(reviews)).reviews.length >= 1);
  // 개인정보 점검 목록은 공개 중인 후기 글만 다시 훑는다(비공개 · 숨김은 점검 대상이 아니다)
  const scan = await scanPublicReviews(reviews);
  assert.equal(scan.ready, true);
  assert.ok(scan.scanned >= 1);
});

test("탈퇴하면 그 회원의 후기 · 이력 · 신고가 지워지고 다른 회원의 후기는 그대로다(프로필 탈퇴 표시 트리거)", async () => {
  const leaver = await buyer();
  const stayer = await buyer();
  const rl = await write(leaver);
  const rs = await write(stayer);
  assert.ok(rl.kind === "created" && rs.kind === "created");
  if (rl.kind !== "created" || rs.kind !== "created") return;
  await reportReview(reviews, { reviewId: rl.review.id, reporterKey: "visitor-dddd-0004", reason: "other" });
  await applyReviewAction(deps, { reviewId: rl.review.id, action: "feature", reasonCode: "helpful", memo: "", adminId: ADMIN_ID });
  const res = await withdrawMember(server, leaver.U.id);
  assert.equal(res.kind, "done");
  assert.equal(await reviews.getReview(rl.review.id), null);
  assert.deepEqual(await reviews.listUserReviews(leaver.U.id), []);
  assert.deepEqual(await reviews.listAdminLog({ reviewId: rl.review.id, limit: 10 }), [], "이력도 함께 지워진다");
  const reports = await admin.from("review_reports").select("id").eq("review_id", rl.review.id);
  assert.deepEqual(reports.data ?? [], []);
  assert.equal((await reviews.getReview(rs.review.id))?.id, rs.review.id);
  assert.equal((await publicReviewsPage(reviews, { group: null, page: 1 })).reviews.some((x) => x.id === rl.review.id), false);
});

test("MY 목록 · 이용 건: 쓴 후기와 아직 쓰지 않은 적격 건이 나뉘고, 환불된 주문은 적격 건에서 빠진다", async () => {
  const b = await buyer();
  let view = await getMyReviewsView(deps, b.U.id);
  assert.equal(view.ready, true);
  assert.deepEqual([view.written.length, view.unwritten.length], [0, 1]);
  assert.equal(view.unwritten[0].subject.subjectRef, b.order.id);
  await write(b);
  view = await getMyReviewsView(deps, b.U.id);
  assert.deepEqual([view.written.length, view.unwritten.length], [1, 0]);
  const refunder = await buyer();
  await server.updateOrder(refunder.order.id, ["paid"], { status: "refunded" });
  assert.equal((await getMyReviewsView(deps, refunder.U.id)).unwritten.length, 0);
  assert.equal((await write(refunder)).kind, "not-eligible");
});

test("채팅 이용 건: 답을 받은 질문이 있는 검사 결과만 센다(질문 자리 예약 중인 것은 세지 않는다)", async () => {
  const b = await buyer();
  assert.deepEqual(await reviews.listAnsweredChatSubjects({ userId: b.U.id, limit: 100 }), []);
  const reservation = await server.reserveChatQuestion({ userId: b.U.id, assessmentId: b.aid, roomKey: "love", max: 5 });
  assert.ok(reservation);
  assert.deepEqual(await reviews.listAnsweredChatSubjects({ userId: b.U.id, limit: 100 }), [], "예약 중(답을 받기 전)은 이용 건이 아니다");
  assert.equal((await createReview(deps, { userId: b.U.id, kind: "chat", ref: b.aid, rating: 5, body: GOOD, publicConsent: true })).kind, "not-eligible");
  await server.confirmChatQuestion(reservation!, { userId: b.U.id, assessmentId: b.aid, roomKey: "love" });
  const subjects = await reviews.listAnsweredChatSubjects({ userId: b.U.id, limit: 100 });
  assert.deepEqual(subjects.map((s) => [s.assessmentId, s.answers]), [[b.aid, 1]]);
  const made = await createReview(deps, { userId: b.U.id, kind: "chat", ref: b.aid, rating: 4, body: GOOD, publicConsent: true });
  assert.ok(made.kind === "created");
  if (made.kind === "created") assert.equal(made.review.freeTrial, false, "심층 리포트를 산 결과의 채팅은 무료 체험이 아니다");
  assert.equal((await createReview(deps, { userId: b.U.id, kind: "chat", ref: b.aid, rating: 4, body: GOOD, publicConsent: true })).kind, "exists");
});

test("방문 단계: 후기 영역 조회 · 전체 후기 클릭 이름이 저장 · 조회되고, 모양이 틀린 이름은 DB가 거절한다 — 전환 숫자는 직접 센 값만이다", async () => {
  const anonA = `anon-${randomUUID()}`;
  const anonB = `anon-${randomUUID()}`;
  const ev = (anonId: string, name: string) => server.addFunnelEvent({ anonId, name: name as "visit", path: "/", src: null, medium: null, campaign: null, referrerHost: null });
  await ev(anonA, "review_section_view");
  await new Promise((r) => setTimeout(r, 20));
  await ev(anonA, "review_all_click");
  await ev(anonB, "review_section_view");
  await new Promise((r) => setTimeout(r, 20));
  await ev(anonB, "analyze_start");
  await assert.rejects(() => ev(anonA, "Bad Name!"), /방문 단계 기록/);
  await assert.rejects(() => ev(anonA, "x"), /방문 단계 기록/);
  await assert.rejects(() => ev(anonA, "payment_confirmed"), /방문 단계 기록/, "결제 이벤트 같은 이름은 나열된 목록에 없어 계속 거절된다");
  const since = new Date(Date.now() - 3600_000).toISOString();
  const names = new Set((await server.listFunnelEventsSince(since, 5000)).filter((e) => e.anonId === anonA || e.anonId === anonB).map((e) => e.name));
  assert.deepEqual([...names].sort(), ["analyze_start", "review_all_click", "review_section_view"]);
  // 같은 DB에 다른 시험의 기록이 섞여 있어도 이 두 방문자의 흐름은 그대로 읽힌다
  const stats = await getReviewStats(deps, { sinceDays: 1 });
  assert.equal(stats.ready, true);
  assert.ok(stats.funnel.viewers >= 2 && stats.funnel.clickers >= 1 && stats.funnel.starters >= 1);
  assert.equal(stats.paidAfterView.measurable, false);
});
