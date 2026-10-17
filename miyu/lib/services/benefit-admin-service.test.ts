// 실행: npm test — 혜택 관리자 서비스: 질문 한 번의 AI 원가 집계(평균 · p95 · 재시도) · 추천 손익분기 경고 · 정가 vs 추천 비교 · 가정값 맞추기 · 추천 대기열 처리.
// 손익은 관리회계 추정이다 — 이 시험은 계산 구조와 "자료가 모자라면 단정하지 않는다"는 규칙이 지켜지는지 보는 것이며 가정값이 실제와 맞다는 보증이 아니다.
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BENEFIT_SETTINGS } from "../commerce/benefits.ts";
import { DEFAULT_ASSUMPTIONS } from "../commerce/profit.ts";
import { assumptionsFromSettings, decideReferral, getBenefitAdminOverview, getFinanceMonthView, PAUSABLE_FEATURES, referralHealth, revokeReferral, summarizeAiQuestionCosts } from "./benefit-admin-service.ts";
import { changeBenefitSetting, type BenefitDeps } from "./benefit-service.ts";
import type { AiQuestionCostRow } from "./benefit-ports.ts";
import type { AssessmentRecord, MiyuRepository } from "./ports.ts";
import { createMemoryBenefits } from "./testing/memory-benefits.ts";
import { createMemoryRepository } from "./testing/memory-repository.ts";

const row = (requestKey: string | null, cost: number | null, at: number, creditSource: string | null = "paid"): AiQuestionCostRow => ({ requestKey, creditSource, roomKey: "love", estCostKrw: cost, outcome: "ok", createdAt: new Date(Date.UTC(2026, 9, 20, 0, 0, at)).toISOString() });

test("질문 원가: 같은 request_key의 호출(재시도 · 고쳐 쓰기)은 한 질문으로 합치고, 첫 호출을 뺀 비용을 재시도 비용으로 센다", () => {
  const s = summarizeAiQuestionCosts([row("q1", 10, 1), row("q2", 20, 2), row("q2", 15, 3), row("q3", 30, 4, "free"), row(null, 5, 5, "reward")]);
  assert.equal(s.questions, 4);
  assert.equal(s.retried, 1);
  assert.equal(s.retryCostKrw, 15);
  assert.equal(s.overall.count, 4);
  assert.equal(s.overall.avgKrw, (10 + 35 + 30 + 5) / 4);
  assert.equal(s.overall.maxKrw, 35);
  assert.equal(s.retryShare, Math.round((15 / 80) * 100) / 100);
  assert.deepEqual(Object.keys(s.byCreditSource).sort(), ["free", "paid", "reward"]);
  assert.equal(s.byCreditSource.paid.count, 2);
});

test("질문 원가 p95: 값이 20개이면 상위 5%에 해당하는 19번째 값을 돌려주고, 비어 있으면 0이다", () => {
  const rows = Array.from({ length: 20 }, (_, i) => row(`q${i}`, i + 1, i));
  const s = summarizeAiQuestionCosts(rows);
  assert.equal(s.overall.p95Krw, 19);
  assert.equal(s.overall.p50Krw, 10);
  const empty = summarizeAiQuestionCosts([]);
  assert.equal(empty.questions, 0);
  assert.equal(empty.overall.avgKrw, 0);
  assert.equal(empty.overall.p95Krw, 0);
});

test("질문 원가: 가격표에 없는 호출(원가 추정 없음)은 0원으로 센 뒤 그 수를 따로 알려 평균이 낮게 나올 수 있음을 밝힌다", () => {
  const s = summarizeAiQuestionCosts([row("a", null, 1), row("b", 10, 2)]);
  assert.equal(s.unpricedCalls, 1);
  assert.equal(s.overall.avgKrw, 5);
});

test("추천 손익분기: 추천 가입이 없으면 자료 없음, 확정 가입이 적으면 판단하지 않고, 충분하면 전환율을 손익분기와 비교한다", () => {
  const f = (o: Partial<Parameters<typeof referralHealth>[1]>) => ({ links: 5, visits: 100, signups: 0, confirmed: 0, review: 0, firstPurchasesConfirmed: 0, firstPurchasesRevoked: 0, ...o });
  assert.equal(referralHealth(DEFAULT_ASSUMPTIONS, f({})).status, "no-data");
  const few = referralHealth(DEFAULT_ASSUMPTIONS, f({ signups: 10, confirmed: 8, firstPurchasesConfirmed: 0 }));
  assert.equal(few.status, "insufficient");
  assert.equal(few.conversion, null);
  assert.match(few.message, /적어요/);
  const be = few.breakEvenConversion!;
  assert.ok(be > 0 && be < 1);
  const low = referralHealth(DEFAULT_ASSUMPTIONS, f({ signups: 100, confirmed: 100, firstPurchasesConfirmed: Math.floor(be * 100) - 1 }));
  assert.equal(low.status, "below-breakeven");
  assert.match(low.message, /낮아요/);
  const high = referralHealth(DEFAULT_ASSUMPTIONS, f({ signups: 100, confirmed: 100, firstPurchasesConfirmed: Math.ceil(be * 100) + 5 }));
  assert.equal(high.status, "ok");
  // 비용은 가입 포인트와 무료 AI 원가로 나눠 보인다
  assert.ok(low.cost.signupPointKrw > 0 && low.cost.freeAiKrw > 0);
  assert.ok(Math.abs(low.cost.perConfirmedSignupKrw - (low.cost.signupPointKrw + low.cost.freeAiKrw) / 100) < 0.05);
});

test("가정값 맞추기: 설정의 초대 가격 · 가입 포인트 · 포인트 교환가를 반영하고, 측정한 질문 원가는 표본이 충분할 때만 쓴다", () => {
  const settings = { ...DEFAULT_BENEFIT_SETTINGS, referral: { ...DEFAULT_BENEFIT_SETTINGS.referral, inviteePrice: 5900, signupPoints: 300 }, pointPrices: { "personal-integrated-report": 12_345 } };
  const few = assumptionsFromSettings(settings, { aiQuestionAvgKrw: 99, samples: 5 });
  assert.equal(few.usedMeasuredQuestionCost, false);
  assert.equal(few.assumptions.aiQuestionCostKrw, DEFAULT_ASSUMPTIONS.aiQuestionCostKrw);
  assert.equal(few.assumptions.invitePriceKrw, 5900);
  assert.equal(few.assumptions.signupRewardPoints, 300);
  assert.equal(few.assumptions.reportPointPrice, 12_345);
  const many = assumptionsFromSettings(settings, { aiQuestionAvgKrw: 99, samples: 30 });
  assert.equal(many.usedMeasuredQuestionCost, true);
  assert.equal(many.assumptions.aiQuestionCostKrw, 99);
});

const BASE = { channel: "web", nickname: "서윤", calendar: "solar", isLeapMonth: false, birthYear: 1994, birthMonth: 11, birthDay: 7, birthTime: "08:40", knownMbti: null, answers: {}, contentVersion: "t", source: "sample", summary: {}, saju: { status: "not-connected" } } as unknown as Omit<AssessmentRecord, "id" | "createdAt" | "userId">;

async function setup() {
  const t = new Date("2026-10-20T03:00:00Z").getTime();
  const nowFn = () => new Date(t);
  const mem = createMemoryRepository(nowFn);
  const ben = createMemoryBenefits(mem, nowFn);
  const deps: BenefitDeps = { repo: mem.repo as MiyuRepository, benefits: ben.repo, now: nowFn };
  return { mem, ben, deps };
}

test("관리자 개요: 질문 원가가 없으면 가정값을 쓰고 그렇다고 밝히며, 정가 vs 추천 비교는 같은 가입자 · 같은 무료 원가 기준이다", async () => {
  const { deps } = await setup();
  const o = await getBenefitAdminOverview(deps, { sinceDays: 30 });
  assert.equal(o.ready, true);
  assert.equal(o.assumptions.usedMeasuredQuestionCost, false);
  assert.equal(o.aiQuestion?.questions, 0);
  assert.equal(o.referral?.status, "no-data");
  const eq = o.comparison.equalConversion;
  assert.equal(eq.list.signups, eq.referral.signups);
  assert.equal(eq.list.convRate, eq.referral.convRate);
  assert.equal(eq.list.freeCostKrw, eq.referral.freeCostKrw);
  assert.equal(eq.referral.adKrw, 0);
  assert.match(o.comparison.basisNote, /가정/);
  assert.equal(o.sinceDays, 30);
  assert.equal((await getBenefitAdminOverview(deps, { sinceDays: 9999 })).sinceDays, 365);
});

test("관리자 개요: 혜택 표가 없는 DB(19번 전)에서는 ready: false로 숫자를 비워 준다", async () => {
  const { deps } = await setup();
  const missing = Object.assign(new Error("relation does not exist"), { code: "42P01" });
  const broken: BenefitDeps = { ...deps, benefits: { ...deps.benefits, getSettings: async () => { throw missing; } } };
  const o = await getBenefitAdminOverview(broken, { sinceDays: 30 });
  assert.equal(o.ready, false);
  assert.equal(o.totals, null);
  assert.equal(o.referral, null);
  assert.deepEqual(o.referralQueue, []);
});

test("추천 대기열: 검토 중인 가입만 보이고 회원번호는 앞 8자만이며, 이유 없이 처리할 수 없고 처리하면 한 번만 반영된다", async () => {
  const { mem, ben, deps } = await setup();
  const benefits = ben.repo;
  for (const f of ["referral", "referral_signup_points"]) await benefits.setSetting({ key: `feature.${f}`, value: true, reason: "시험", by: null });
  const inviter = "11111111-0000-4000-8000-000000000000";
  ben.setJoinedAt(inviter, new Date("2026-09-01T00:00:00Z"));
  await benefits.ensureReferralLink({ userId: inviter, token: "Q".repeat(24) });
  const mk = async (id: string, anon: string) => {
    const userId = `${id}-0000-4000-8000-000000000000`;
    ben.setJoinedAt(userId, new Date("2026-10-20T02:30:00Z"));
    await (mem.repo as MiyuRepository).insertAssessment({ ...BASE, userId });
    await benefits.registerReferralSignup({ token: "Q".repeat(24), inviteeUserId: userId, anonId: anon });
    return userId;
  };
  await mk("22222222", "anon-same-device");
  const flagged = await mk("33333333", "anon-same-device");
  const o = await getBenefitAdminOverview(deps, { sinceDays: 30 });
  assert.equal(o.referralQueue.length, 1);
  assert.equal(o.referralQueue[0].inviteeShort, "33333333");
  assert.equal(o.referralQueue[0].inviterShort, "11111111");
  assert.ok(!JSON.stringify(o.referralQueue).includes("nickname"));
  assert.deepEqual(await decideReferral(deps, { inviteeUserId: flagged, decision: "confirm", reason: "  ", by: "a" }), { ok: false, message: "처리 이유를 3자 이상 적어 주세요." });
  const ok = await decideReferral(deps, { inviteeUserId: flagged, decision: "confirm", reason: "본인 확인됨", by: "admin-1" });
  assert.equal(ok.ok, true);
  assert.equal(await benefits.getPointBalance(inviter), 500);
  const again = await decideReferral(deps, { inviteeUserId: flagged, decision: "confirm", reason: "다시", by: "admin-1" });
  assert.equal(again.ok, false);
  assert.equal(await benefits.getPointBalance(inviter), 500);
  assert.deepEqual(await revokeReferral(deps, { inviteeUserId: flagged, reason: "", by: "a" }), { ok: false, message: "회수 이유를 3자 이상 적어 주세요." });
  assert.equal((await revokeReferral(deps, { inviteeUserId: flagged, reason: "부정 확인", by: "admin-1" })).ok, true);
  assert.equal(await benefits.getPointBalance(inviter), 0);
});

test("보상 일시 중지: 적립률 · 가입 보상 · 구매 보상 · 후기 보상 · 추천 전체를 설정 하나로 끄고 켤 수 있으며 이력이 남는다", async () => {
  const { deps } = await setup();
  assert.deepEqual(PAUSABLE_FEATURES.map((f) => f.key), ["feature.points_earn", "feature.referral_signup_points", "feature.referral_purchase_credits", "feature.review_reward", "feature.referral"]);
  for (const f of PAUSABLE_FEATURES) {
    const on = await changeBenefitSetting(deps, { key: f.key, value: true, reason: "시작", by: "admin-1" });
    assert.deepEqual(on, { ok: true, changed: true });
    const off = await changeBenefitSetting(deps, { key: f.key, value: false, reason: "일시 중지", by: "admin-1" });
    assert.deepEqual(off, { ok: true, changed: true });
  }
  const history = await deps.benefits.listSettingHistory(20);
  assert.ok(history.length >= PAUSABLE_FEATURES.length * 2);
  assert.ok(history.every((h) => h.reason.length > 0 && h.changedBy === "admin-1"));
});

test("월 손익: 보상 비용 추정은 그 달에 지급한 포인트 · 질문권만 센다(지난 달을 봐도 이후 지급분이 섞이지 않는다)", async () => {
  const { deps, ben } = await setup();
  const far = new Date(Date.UTC(2027, 9, 1)).toISOString();
  assert.equal((await ben.repo.grantPoints({ userId: "11111111-1111-4111-8111-111111111111", amount: 100000, sourceKind: "admin", sourceRef: "t", opKey: "month-view-1", expiresAt: far })).status, "granted");
  const thisMonth = await getFinanceMonthView(deps, { month: "2026-10" });
  const lastMonth = await getFinanceMonthView(deps, { month: "2026-09" });
  assert.ok(thisMonth.rewardCostEstimateKrw > 0, "이번 달에 지급했으니 보상 비용이 잡힌다");
  assert.equal(lastMonth.rewardCostEstimateKrw, 0, "지난 달에는 지급이 없었으니 0이다");
});
