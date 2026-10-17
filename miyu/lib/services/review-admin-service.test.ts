// 실행: npm test — 후기 관리자 서비스(조회 · 숨김 · 삭제 · 선정 · 신고 · 개인정보 점검 · 전환 분석)를 메모리 저장소로 확인한다.
// 확인하는 운영 요구(운영자 2026-10-17): ① 사유 분류 없이는 숨김 · 삭제 불가, 부정적인 내용은 사유가 될 수 없음 ② 모든 조치가 이력에 남고 글은 복사하지 않음 ③ 운영자가 지운 후기는 다시 쓸 수 없고 숨긴 후기는 회원이 고쳐도 다시 공개되지 않음
// ④ 선정 · 해제 이력 ⑤ 공개 후기의 개인정보 의심 점검 ⑥ 전환 숫자는 직접 센 값만, 유료 결제율은 계산하지 않음 ⑦ 보상 질문권 AI 원가는 측정 · 가정을 구분.
import assert from "node:assert/strict";
import test from "node:test";
import { PAID_AFTER_VIEW_REASON, applyReviewAction, getReviewAdminList, getReviewStats, listReviewActionLog, scanPublicReviews } from "./review-admin-service.ts";
import { createReview, deleteReview, editReview, homeReviews, publicReviewsPage, setReviewVisibility, retryReviewRewards, type ReviewDeps } from "./review-service.ts";
import { startCheckout } from "./order-service.ts";
import type { AssessmentRecord, MiyuRepository } from "./ports.ts";
import { createMemoryBenefits } from "./testing/memory-benefits.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";
import { createMemoryReviews } from "./testing/memory-reviews.ts";

const BASE = { channel: "web", nickname: "서윤", calendar: "solar", isLeapMonth: false, birthYear: 1994, birthMonth: 11, birthDay: 7, birthTime: "08:40", knownMbti: null, answers: {}, contentVersion: "t", source: "sample", summary: {}, saju: { status: "not-connected" } } as unknown as Omit<AssessmentRecord, "id" | "createdAt" | "userId">;
const GOOD = "풀이가 평소 내 모습과 이어져서 한참 생각해 볼 수 있었어요.";
const BAD = "기대와 달라서 아쉬웠어요. 내용이 조금 막연하게 느껴졌어요.";
const ADMIN = "adminadm-0000-4000-8000-000000000000";

async function setup() {
  let t = new Date("2026-10-20T03:00:00Z").getTime();
  const nowFn = () => new Date(t);
  const mem = createMemoryRepository(nowFn);
  const ben = createMemoryBenefits(mem, nowFn);
  const rev = createMemoryReviews(mem, nowFn);
  const repo = mem.repo as MiyuRepository;
  await ben.repo.setSetting({ key: "feature.review_reward", value: true, reason: "시험", by: null });
  const deps: ReviewDeps = { repo, reviews: rev.repo, benefits: ben.repo, now: nowFn };
  const user = async (name: string) => {
    const userId = `${name.padEnd(8, "0")}-0000-4000-8000-000000000000`;
    return { userId, assessmentId: (await repo.insertAssessment({ ...BASE, userId })).id };
  };
  /** 구매 + 후기 작성까지 */
  const write = async (name: string, o: { body?: string; rating?: number; publicConsent?: boolean } = {}) => {
    const u = await user(name);
    const started = await startCheckout({ repo, now: nowFn }, { userId: u.userId, assessmentId: u.assessmentId });
    assert.equal(started.kind, "order");
    if (started.kind !== "order") throw new Error("order");
    const order = (await repo.updateOrder(started.order.id, ["pending"], { status: "paid", paymentKey: `pk-${name}`, approvedAt: new Date(t).toISOString() }))!;
    await repo.insertReport({ userId: u.userId, orderId: order.id, assessmentId: u.assessmentId, status: "ready", attempts: 1 });
    const r = await createReview(deps, { userId: u.userId, kind: "personal", ref: order.id, rating: o.rating ?? 5, body: o.body ?? GOOD, publicConsent: o.publicConsent ?? true });
    assert.equal(r.kind, "created", name);
    if (r.kind !== "created") throw new Error("review");
    t += 1000;
    return { u, order, review: r.review };
  };
  return { mem, ben, rev, repo, deps, user, write, tick: (ms: number) => (t += ms), now: nowFn };
}

test("사유 분류 없이는 숨김 · 삭제할 수 없고, 부정적인 내용이라는 분류는 없다 — 후기와 이력은 그대로다", async () => {
  const s = await setup();
  const w = await s.write("alpha", { rating: 1, body: BAD });
  for (const reasonCode of [undefined, "", "negative", "bad_review", "other"]) {
    const r = await applyReviewAction(s.deps, { reviewId: w.review.id, action: "hide", reasonCode, memo: "", adminId: ADMIN });
    assert.equal(r.ok, false, String(reasonCode));
  }
  const del = await applyReviewAction(s.deps, { reviewId: w.review.id, action: "delete", reasonCode: "unhide", memo: "", adminId: ADMIN });
  assert.equal(del.ok, false, "다른 조치의 분류는 안 된다");
  assert.equal((await s.rev.repo.getReview(w.review.id))?.status, "published");
  assert.deepEqual(await listReviewActionLog(s.rev.repo), []);
  // 같은 규칙이 저장소에서도 지켜진다(서비스를 거치지 않아도 이력 검사가 막는다)
  const direct = await s.rev.repo.adminApply({ reviewId: w.review.id, action: "hide", reasonCode: "negative", memo: null, adminId: ADMIN });
  assert.deepEqual(direct, { ok: false, reason: "invalid-reason" });
  assert.equal((await s.rev.repo.getReview(w.review.id))?.status, "published");
});

test("숨김 → 숨김 해제: 공개 후기에서 빠졌다 돌아오고, 이력에 누가 · 무엇을 · 사유 분류만 남는다(글 복사 없음)", async () => {
  const s = await setup();
  const w = await s.write("beta", { body: `${GOOD} 연락은 1996년 3월 29일생 제 번호로.` });
  const hid = await applyReviewAction(s.deps, { reviewId: w.review.id, action: "hide", reasonCode: "privacy", memo: "", adminId: ADMIN });
  assert.ok(hid.ok);
  assert.equal((await publicReviewsPage(s.rev.repo, { group: null, page: 1 })).total, 0);
  assert.equal((await s.rev.repo.getReview(w.review.id))?.hiddenReason, "privacy");
  // 숨긴 것을 또 숨길 수 없다
  const again = await applyReviewAction(s.deps, { reviewId: w.review.id, action: "hide", reasonCode: "privacy", memo: "", adminId: ADMIN });
  assert.ok(!again.ok);
  const back = await applyReviewAction(s.deps, { reviewId: w.review.id, action: "unhide", reasonCode: "wrongly_hidden", memo: "", adminId: ADMIN });
  assert.ok(back.ok);
  assert.equal((await publicReviewsPage(s.rev.repo, { group: null, page: 1 })).total, 1);
  const log = await listReviewActionLog(s.rev.repo);
  assert.deepEqual(log.map((l) => [l.action, l.reasonCode]).reverse(), [["hide", "privacy"], ["unhide", "wrongly_hidden"]]);
  assert.ok(log.every((l) => l.adminId === ADMIN && l.reviewId === w.review.id));
  assert.ok(!JSON.stringify(log).includes("1996"), "이력에는 후기 글이 없다");
  // 기타는 메모가 있어야 하고, 메모는 이력에 남는다
  assert.ok(!(await applyReviewAction(s.deps, { reviewId: w.review.id, action: "hide", reasonCode: "other", memo: "", adminId: ADMIN })).ok);
  assert.ok((await applyReviewAction(s.deps, { reviewId: w.review.id, action: "hide", reasonCode: "other", memo: "광고 링크 의심", adminId: ADMIN })).ok);
  assert.equal((await listReviewActionLog(s.rev.repo))[0].memo, "광고 링크 의심");
});

test("운영자가 숨긴 후기는 회원이 고치거나 공개를 바꿔도 다시 공개되지 않는다(숨김 해제는 운영자만)", async () => {
  const s = await setup();
  const w = await s.write("gamma");
  await applyReviewAction(s.deps, { reviewId: w.review.id, action: "hide", reasonCode: "abuse", memo: "", adminId: ADMIN });
  assert.equal((await editReview(s.deps, { userId: w.u.userId, id: w.review.id, rating: 5, body: `${GOOD} 고쳤어요.`, publicConsent: true })).kind, "updated");
  assert.equal((await s.rev.repo.getReview(w.review.id))?.status, "hidden");
  assert.equal((await setReviewVisibility(s.deps, { userId: w.u.userId, id: w.review.id, publicConsent: true })).kind, "updated");
  assert.equal((await s.rev.repo.getReview(w.review.id))?.status, "hidden");
  assert.equal((await publicReviewsPage(s.rev.repo, { group: null, page: 1 })).total, 0);
  // 회원이 동의를 거두고 운영자가 해제하면 나만 보기로 돌아간다(동의 없이 공개되지 않는다)
  await setReviewVisibility(s.deps, { userId: w.u.userId, id: w.review.id, publicConsent: false });
  await applyReviewAction(s.deps, { reviewId: w.review.id, action: "unhide", reasonCode: "resolved", memo: "", adminId: ADMIN });
  assert.equal((await s.rev.repo.getReview(w.review.id))?.status, "private");
});

test("운영자 삭제: 글이 지워진 묘비로 남고, 회원이 다시 쓸 수 없으며, 이미 준 보상은 그대로다", async () => {
  const s = await setup();
  const w = await s.write("delta");
  assert.equal(await s.ben.repo.getCreditBalance(w.u.userId), 1);
  const gone = await applyReviewAction(s.deps, { reviewId: w.review.id, action: "delete", reasonCode: "fake_or_ad", memo: "", adminId: ADMIN });
  assert.ok(gone.ok);
  const tomb = (await s.rev.repo.getReview(w.review.id))!;
  assert.deepEqual([tomb.status, tomb.body, tomb.deletedBy, tomb.publicConsent, tomb.featured], ["deleted", "", "admin", false, false]);
  const retry = await createReview(s.deps, { userId: w.u.userId, kind: "personal", ref: w.order.id, rating: 5, body: GOOD, publicConsent: true });
  assert.equal(retry.kind, "blocked");
  assert.equal(await s.ben.repo.getCreditBalance(w.u.userId), 1, "질문권을 되찾지도 다시 주지도 않는다");
  assert.ok(!(await applyReviewAction(s.deps, { reviewId: w.review.id, action: "delete", reasonCode: "privacy", memo: "", adminId: ADMIN })).ok, "이미 삭제된 후기");
  // 회원이 직접 지운 묘비와 달리 목록에는 "운영자 삭제"로 남는다
  const list = await getReviewAdminList(s.deps, { status: "deleted", page: 1 });
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0].userShort, w.u.userId.slice(0, 8));
  assert.ok(!JSON.stringify(list).includes("서윤"), "이름 · 닉네임은 없다");
});

test("선정(메인 우선 노출): 공개 중인 후기만 지정할 수 있고, 지정 · 해제가 이력에 남으며 메인에서 먼저 보인다 — 별점으로 고르지 않는다", async () => {
  const s = await setup();
  const a = await s.write("echo1", { rating: 5 });
  await s.write("echo2", { rating: 4 });
  const c = await s.write("echo3", { rating: 1, body: BAD });
  const priv = await s.write("echo4", { publicConsent: false });
  // 공개하지 않은 후기는 지정할 수 없다
  assert.ok(!(await applyReviewAction(s.deps, { reviewId: priv.review.id, action: "feature", reasonCode: "specific", memo: "", adminId: ADMIN })).ok);
  // 낮은 별점 후기도 같은 기준으로 선정할 수 있다
  assert.ok((await applyReviewAction(s.deps, { reviewId: c.review.id, action: "feature", reasonCode: "balance", memo: "", adminId: ADMIN })).ok);
  assert.ok(!(await applyReviewAction(s.deps, { reviewId: c.review.id, action: "feature", reasonCode: "balance", memo: "", adminId: ADMIN })).ok, "이미 선정된 후기");
  assert.ok((await applyReviewAction(s.deps, { reviewId: a.review.id, action: "feature", reasonCode: "helpful", memo: "", adminId: ADMIN })).ok);
  const home = await homeReviews(s.rev.repo);
  assert.deepEqual(home.reviews.slice(0, 2).map((r) => r.id), [a.review.id, c.review.id], "나중에 선정한 것이 앞");
  assert.ok((await applyReviewAction(s.deps, { reviewId: a.review.id, action: "unfeature", reasonCode: "replaced", memo: "", adminId: ADMIN })).ok);
  assert.ok(!(await applyReviewAction(s.deps, { reviewId: a.review.id, action: "unfeature", reasonCode: "replaced", memo: "", adminId: ADMIN })).ok, "선정되지 않은 후기");
  assert.deepEqual((await homeReviews(s.rev.repo)).reviews[0].id, c.review.id);
  const log = await listReviewActionLog(s.rev.repo);
  assert.deepEqual(log.map((l) => `${l.action}:${l.reasonCode}`).reverse(), ["feature:balance", "feature:helpful", "unfeature:replaced"]);
  // 선정된 후기를 회원이 지우면 선정도 사라진다
  await deleteReview(s.deps, { userId: c.u.userId, id: c.review.id });
  assert.equal((await s.rev.repo.getReview(c.review.id))?.featured, false);
});

test("신고: 열린 신고가 있는 후기를 모아 보고, 숨김 · 삭제 · 신고 기각이 열린 신고를 처리됨으로 닫는다", async () => {
  const s = await setup();
  const a = await s.write("fox1");
  const b = await s.write("fox2");
  const c = await s.write("fox3");
  await s.rev.repo.submitReport({ reviewId: a.review.id, reporterKey: "visitor-0001", reason: "privacy" });
  await s.rev.repo.submitReport({ reviewId: a.review.id, reporterKey: "visitor-0002", reason: "abuse" });
  await s.rev.repo.submitReport({ reviewId: b.review.id, reporterKey: "visitor-0001", reason: "other" });
  const reported = await getReviewAdminList(s.deps, { reportedOnly: true, page: 1 });
  assert.deepEqual(reported.rows.map((r) => [r.review.id, r.openReports]).sort(), [[a.review.id, 2], [b.review.id, 1]].sort());
  assert.equal(reported.total, 2);
  // 신고가 없는 후기는 기각할 수 없다
  assert.ok(!(await applyReviewAction(s.deps, { reviewId: c.review.id, action: "dismiss_reports", reasonCode: "no_violation", memo: "", adminId: ADMIN })).ok);
  assert.ok((await applyReviewAction(s.deps, { reviewId: a.review.id, action: "hide", reasonCode: "report", memo: "", adminId: ADMIN })).ok);
  assert.ok((await applyReviewAction(s.deps, { reviewId: b.review.id, action: "dismiss_reports", reasonCode: "no_violation", memo: "", adminId: ADMIN })).ok);
  assert.equal((await getReviewAdminList(s.deps, { reportedOnly: true, page: 1 })).total, 0, "처리한 신고는 닫힌다");
  assert.equal((await s.rev.repo.getReview(b.review.id))?.status, "published", "기각해도 후기는 그대로");
  assert.deepEqual(s.rev.reports.map((r) => r.handledAction).sort(), ["dismiss_reports", "hide", "hide"]);
});

test("공개 후기 개인정보 점검: 가려지지 않고 남은 의심 표현을 모으고, 점검한 수를 함께 보여 준다(의심 없음 ≠ 점검 안 함)", async () => {
  const s = await setup();
  await s.write("golf1", { body: GOOD });
  const bad = await s.write("golf2", { body: `${GOOD} 저는 1996년 3월 29일에 태어났어요.` });
  await s.write("golf3", { body: `${GOOD} 인스타 아이디 miyu_fan 로 보세요.`, publicConsent: false });
  const scan = await scanPublicReviews(s.rev.repo);
  assert.equal(scan.ready, true);
  assert.equal(scan.scanned, 2, "공개 중인 후기만 점검한다");
  assert.equal(scan.suspects.length, 1);
  assert.equal(scan.suspects[0].review.id, bad.review.id);
  assert.ok(scan.suspects[0].flags.includes("dated_year"));
  // 관리자 목록에서도 공개 중인 후기에만 의심 표시가 붙는다
  const list = await getReviewAdminList(s.deps, { page: 1 });
  const flagged = list.rows.filter((r) => r.flags.length > 0).map((r) => r.review.id);
  assert.deepEqual(flagged, [bad.review.id]);
  // 숨기면 공개 점검에서 빠진다
  await applyReviewAction(s.deps, { reviewId: bad.review.id, action: "hide", reasonCode: "privacy", memo: "", adminId: ADMIN });
  assert.equal((await scanPublicReviews(s.rev.repo)).suspects.length, 0);
});

test("관리자 목록은 필터(상태 · 종류)와 쪽 나누기를 지원하고, 후기 표가 없으면 준비 중으로 돌려준다", async () => {
  const s = await setup();
  for (let i = 0; i < 4; i++) await s.write(`page${i}`);
  const first = await getReviewAdminList(s.deps, { page: 1, pageSize: 3 });
  assert.deepEqual([first.rows.length, first.total, first.pages], [3, 4, 2]);
  assert.equal((await getReviewAdminList(s.deps, { page: 2, pageSize: 3 })).rows.length, 1);
  assert.equal((await getReviewAdminList(s.deps, { page: 1, status: "private" })).total, 0);
  assert.equal((await getReviewAdminList(s.deps, { page: 1, kind: "chat" })).total, 0);
  const notReady = Object.assign(new Error("없음"), { code: "42P01" });
  const broken = new Proxy({} as never, { get: () => () => Promise.reject(notReady) });
  assert.deepEqual(await getReviewAdminList({ reviews: broken }, { page: 1 }), { ready: false, rows: [], total: 0, page: 1, pages: 1 });
  assert.equal((await scanPublicReviews(broken)).ready, false);
  assert.deepEqual(await listReviewActionLog(broken), []);
});

test("보상 미확정 후기 다시 맞추기(관리자): 지급 스위치가 켜져 있을 때만, 질문권은 한 번만", async () => {
  const s = await setup();
  const u = await s.user("henry");
  const started = await startCheckout({ repo: s.repo, now: s.now }, { userId: u.userId, assessmentId: u.assessmentId });
  assert.equal(started.kind, "order");
  if (started.kind !== "order") return;
  const order = (await s.repo.updateOrder(started.order.id, ["pending"], { status: "paid", paymentKey: "pk-h", approvedAt: s.now().toISOString() }))!;
  await s.repo.insertReport({ userId: u.userId, orderId: order.id, assessmentId: u.assessmentId, status: "ready", attempts: 1 });
  const failing = { ...s.deps, benefits: { ...s.ben.repo, grantCredit: async () => Promise.reject(new Error("down")) } };
  const r = await createReview(failing, { userId: u.userId, kind: "personal", ref: order.id, rating: 5, body: GOOD, publicConsent: true });
  assert.ok(r.kind === "created" && r.reward === "failed");
  assert.deepEqual(await retryReviewRewards(s.deps, { limit: 10 }), { tried: 1, granted: 1 });
  assert.deepEqual(await retryReviewRewards(s.deps, { limit: 10 }), { tried: 0, granted: 0 });
  assert.equal(await s.ben.repo.getCreditBalance(u.userId), 1);
});

// ───── 전환 분석 ─────

test("전환 분석: 방문 단계 기록에서 영역 조회 · 클릭률 · 분석 시작률을 직접 세고, 유료 결제율은 계산하지 않으며 이유를 적는다", async () => {
  const s = await setup();
  const ev = (anonId: string, name: "visit" | "analyze_start" | "review_section_view" | "review_all_click") => s.repo.addFunnelEvent({ anonId, name, path: "/", src: null, medium: null, campaign: null, referrerHost: null });
  await ev("anon-aaaa-0001", "review_section_view");
  s.tick(1000);
  await ev("anon-aaaa-0001", "review_all_click");
  s.tick(1000);
  await ev("anon-aaaa-0001", "analyze_start");
  await ev("anon-bbbb-0002", "review_section_view");
  s.tick(1000);
  await ev("anon-bbbb-0002", "analyze_start");
  await ev("anon-cccc-0003", "review_section_view");
  await ev("anon-dddd-0004", "analyze_start"); // 영역을 보지 않은 방문자 — 열람 후 시작률에 들어가지 않는다
  const stats = await getReviewStats(s.deps, { sinceDays: 30 });
  assert.equal(stats.ready, true);
  assert.deepEqual([stats.funnel.viewers, stats.funnel.clickers, stats.funnel.clickRate, stats.funnel.starters, stats.funnel.startRate], [3, 1, 33.3, 2, 66.7]);
  assert.equal(stats.paidAfterView.measurable, false);
  assert.equal(stats.paidAfterView.reason, PAID_AFTER_VIEW_REASON);
  assert.match(stats.paidAfterView.reason, /A\/B 테스트/);
  assert.ok(!("rate" in stats.paidAfterView), "유료 결제율 수치는 만들지 않는다");
  assert.match(PAID_AFTER_VIEW_REASON, /후기 때문이라고 말할 수 없어요/);
});

test("전환 분석: 작성률은 적격 건 대비 후기를 쓴 건, 보상 질문권과 AI 원가 어림은 측정 · 가정을 구분해 보인다", async () => {
  const s = await setup();
  // 적격 건 3개(구매 3) 중 2개에 후기, 1개는 쓰지 않음
  await s.write("india1");
  await s.write("india2", { publicConsent: false });
  const u = await s.user("india3");
  const started = await startCheckout({ repo: s.repo, now: s.now }, { userId: u.userId, assessmentId: u.assessmentId });
  assert.equal(started.kind, "order");
  if (started.kind === "order") {
    const o = (await s.repo.updateOrder(started.order.id, ["pending"], { status: "paid", paymentKey: "pk-i3", approvedAt: s.now().toISOString() }))!;
    await s.repo.insertReport({ userId: u.userId, orderId: o.id, assessmentId: u.assessmentId, status: "ready", attempts: 1 });
  }
  const stats = await getReviewStats(s.deps, { sinceDays: 30 });
  assert.deepEqual(stats.writeRate.overall, { eligible: 3, written: 2, rate: 66.7 });
  assert.deepEqual(stats.writeRate.byKind.personal, { eligible: 3, written: 2, rate: 66.7 });
  assert.equal(stats.writeRate.byKind.chat.rate, null);
  assert.equal(stats.writeRate.byKind.pair_compat.eligible, 0);
  assert.deepEqual([stats.reward.reviewsRewarded, stats.reward.creditsGranted], [2, 2]);
  // 측정한 질문 원가가 모자라면(30건 미만) 가정값을 쓰고 "가정"으로 밝힌다
  assert.equal(stats.reward.unitCostSource, "assumed");
  assert.ok(stats.reward.unitCostKrw > 0);
  assert.equal(stats.reward.aiCostKrw, Math.round(2 * stats.reward.unitCostKrw * 100) / 100);
  // 채팅 질문 원가가 30건 이상 쌓이면 측정값으로 바뀐다
  for (let i = 0; i < 30; i++) s.mem.aiUsage.push({ id: i + 1, reportId: null, provider: "x", model: "m", promptVersion: "p", inputTokens: 1, outputTokens: 1, estCostKrw: 40, latencyMs: 1, outcome: "ok", errorCode: null, purpose: "chat", creditSource: "free", roomKey: "love", requestKey: `rk-${i}`, createdAt: s.now().toISOString() });
  const measured = await getReviewStats(s.deps, { sinceDays: 30 });
  assert.equal(measured.reward.unitCostSource, "measured");
  assert.equal(measured.reward.unitCostKrw, 40);
  assert.equal(measured.reward.aiCostKrw, 80);
  // 별점 분포: 전체 · 공개 중 · 메인 노출 대상
  assert.equal(measured.spread.written.total, 2);
  assert.equal(measured.spread.published.total, 1);
  assert.equal(measured.spread.home.total, 1);
  assert.deepEqual([measured.counts.written, measured.counts.published, measured.counts.private], [2, 1, 1]);
});

test("전환 분석: 후기 표가 없으면(25번 전) 준비 중으로 돌려준다 — 숫자를 만들지 않는다", async () => {
  const s = await setup();
  const notReady = Object.assign(new Error("없음"), { code: "42P01" });
  const broken = new Proxy({} as never, { get: () => () => Promise.reject(notReady) });
  const stats = await getReviewStats({ ...s.deps, reviews: broken }, { sinceDays: 30 });
  assert.equal(stats.ready, false);
  assert.equal(stats.funnel.viewers, 0);
  assert.equal(stats.writeRate.overall.rate, null);
});
