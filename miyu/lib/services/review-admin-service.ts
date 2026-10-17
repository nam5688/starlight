// 후기 관리자 서비스 — 후기 조회 · 숨김 · 삭제 · 선정 · 신고 · 공개 후기의 개인정보 점검 · 전환 분석 숫자.
// 이름 · 생년월일 · 닉네임은 다루지 않는다(회원은 번호 앞 8자뿐). 운영자 조치는 모두 사유 분류가 필요하고 이력에 남으며, 이력에는 후기 글을 복사하지 않는다.
//
// 지키는 것(운영자 요청 2026-10-17)
// - 부정적인 내용이라는 이유만으로 숨기거나 지우지 않는다 — 사유 분류에 "부정적인 내용"이 없고, 분류가 맞지 않으면 조치가 취소된다.
// - 숫자는 직접 센 값과 가정을 구분한다. "후기 열람 후 유료 결제율"은 주문과 익명 방문 기록이 이어져 있지 않아 **계산하지 않는다**(지어낸 수치를 만들지 않는다).
//   열람자와 비열람자의 차이를 후기의 효과라고 말하지 않는다 — 보여 주는 쪽과 숨기는 쪽을 나눠 비교하는 A/B 테스트가 필요하다.

import { checkAdminReason, isPublicReview, pickHomeReviews, ratingSpread, reviewFunnel, reviewKey, reviewWriteRate, scanPublicBody, REVIEW_KINDS, type PrivacyFlag, type PublicReview, type ReviewAdminAction, type ReviewFunnel, type ReviewKind, type ReviewStatus } from "../commerce/reviews.ts";
import { isCompatProduct, isPersonalProduct, REVIEWS } from "../config/product.ts";
import { assumptionsFromSettings, summarizeAiQuestionCosts } from "./benefit-admin-service.ts";
import type { BenefitRepository } from "./benefit-ports.ts";
import { loadBenefitSettings } from "./benefit-service.ts";
import type { MiyuRepository } from "./ports.ts";
import type { ReviewAdminLogRecord, ReviewRecord, ReviewRepository } from "./review-ports.ts";

const missing = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";
const short = (id: string) => id.slice(0, 8);

export type AdminReviewView = { review: ReviewRecord; userShort: string; openReports: number; /** 공개 중인 후기만: 개인정보로 의심되는 표현 */ flags: PrivacyFlag[] };

export type ReviewAdminList = { ready: boolean; rows: AdminReviewView[]; total: number; page: number; pages: number };

/** 후기 목록(최근 것이 먼저) — 공개 중인 후기는 개인정보 의심 표시를 함께 붙인다. 표가 없으면(DB 25번 전) ready: false */
export async function getReviewAdminList(deps: { reviews: ReviewRepository }, input: { status?: ReviewStatus; kind?: ReviewKind; reportedOnly?: boolean; page: number; pageSize?: number }): Promise<ReviewAdminList> {
  const pageSize = input.pageSize ?? 30;
  const page = Number.isInteger(input.page) && input.page >= 1 ? input.page : 1;
  try {
    const r = await deps.reviews.adminListReviews({ status: input.status, kind: input.kind, reportedOnly: input.reportedOnly, limit: pageSize, offset: (page - 1) * pageSize });
    return {
      ready: true,
      rows: r.rows.map((x) => ({ review: x.review, userShort: short(x.review.userId), openReports: x.openReports, flags: isPublicReview(x.review) ? scanPublicBody(x.review.body) : [] })),
      total: r.total,
      page,
      pages: Math.max(1, Math.ceil(r.total / pageSize)),
    };
  } catch (e) {
    if (missing(e)) return { ready: false, rows: [], total: 0, page: 1, pages: 1 };
    throw e;
  }
}

export type ApplyReviewActionResult = { ok: true; review: ReviewRecord } | { ok: false; message: string };

/** 운영자 조치 — 사유 분류가 조치에 맞아야 하고(기타는 메모 필수) 상태 변경과 이력이 한 번에 남는다. 이력에는 후기 글이 없다 */
export async function applyReviewAction(deps: { reviews: ReviewRepository }, input: { reviewId: string; action: ReviewAdminAction; reasonCode: unknown; memo: unknown; adminId: string }): Promise<ApplyReviewActionResult> {
  const reason = checkAdminReason(input.action, input.reasonCode, input.memo);
  if (!reason.ok) return { ok: false, message: reason.message };
  try {
    const r = await deps.reviews.adminApply({ reviewId: input.reviewId, action: input.action, reasonCode: reason.code, memo: reason.memo, adminId: input.adminId });
    if (r.ok) return { ok: true, review: r.review };
    if (r.reason === "not-found") return { ok: false, message: "후기를 찾을 수 없어요." };
    if (r.reason === "invalid-reason") return { ok: false, message: "사유 분류가 이 조치에 맞지 않아요." };
    return { ok: false, message: "지금 상태에서는 할 수 없는 조치예요(이미 처리됐을 수 있어요). 목록을 새로 열어 확인해 주세요." };
  } catch (e) {
    if (missing(e)) return { ok: false, message: "DB 변경 25번이 필요해요." };
    throw e;
  }
}

export type PrivacySuspect = { review: PublicReview; flags: PrivacyFlag[] };

/**
 * 공개 후기에서 개인정보가 보이는지 점검 — 공개 중인 후기 글을 다시 훑어(저장할 때 가린 것 말고 남은 표현) 의심되는 후기를 모은다.
 * **의심 후보일 뿐 판정이 아니다** — 운영자가 글을 읽고 숨김 · 삭제를 정한다. 점검한 후기 수를 함께 돌려줘 "의심 없음"이 "점검하지 않음"과 구분되게 한다.
 */
export async function scanPublicReviews(reviews: ReviewRepository, opts: { max?: number } = {}): Promise<{ ready: boolean; scanned: number; total: number; suspects: PrivacySuspect[] }> {
  const max = opts.max ?? 500;
  const pageSize = 100;
  const suspects: PrivacySuspect[] = [];
  let scanned = 0;
  let total = 0;
  try {
    for (let offset = 0; offset < max; offset += pageSize) {
      const r = await reviews.listPublicReviews({ limit: Math.min(pageSize, max - offset), offset });
      total = r.total;
      for (const row of r.rows) {
        scanned += 1;
        const flags = scanPublicBody(row.body);
        if (flags.length > 0) suspects.push({ review: row, flags });
      }
      if (r.rows.length < pageSize) break;
    }
  } catch (e) {
    if (missing(e)) return { ready: false, scanned: 0, total: 0, suspects: [] };
    throw e;
  }
  return { ready: true, scanned, total, suspects };
}

export async function listReviewActionLog(reviews: ReviewRepository, limit = 50): Promise<ReviewAdminLogRecord[]> {
  try {
    return await reviews.listAdminLog({ limit });
  } catch (e) {
    if (missing(e)) return [];
    throw e;
  }
}

// ── 전환 분석 ────────────────────────────────

export type ReviewStats = {
  ready: boolean;
  sinceDays: number;
  /** 메인 후기 영역을 본 익명 방문자 기준(직접 센 값, 추적 거부 · 쿠키 차단은 빠져 실제보다 적다) */
  funnel: ReviewFunnel;
  /** 후기 열람 후 유료 결제율 — 측정할 수 없다(이유를 화면에 적는다) */
  paidAfterView: { measurable: false; reason: string };
  /** 작성률 — 이 기간에 생긴 적격 이용 건 가운데 후기를 한 번이라도 쓴 비율(삭제한 후기도 센다) */
  writeRate: { overall: { eligible: number; written: number; rate: number | null }; byKind: Record<ReviewKind, { eligible: number; written: number; rate: number | null }> };
  /** 이 기간에 쓴 후기에 지급한 보상 질문권과 AI 원가 어림(지급한 질문권이 모두 쓰였다고 가정한 상한 — 측정한 질문 원가가 있으면 그 값, 없으면 가정값) */
  reward: { reviewsRewarded: number; creditsGranted: number; unitCostKrw: number; unitCostSource: "measured" | "assumed"; aiCostKrw: number; pending: number; failed: number };
  /** 별점 분포 — 전체 작성 · 공개 중 · 메인 노출 대상. 메인에 보이는 후기가 전체와 한쪽으로 치우쳤는지 본다 */
  spread: { written: ReturnType<typeof ratingSpread>; published: ReturnType<typeof ratingSpread>; home: ReturnType<typeof ratingSpread> };
  counts: { written: number; published: number; private: number; hidden: number; deleted: number; featured: number; reportedReviews: number };
};

export const PAID_AFTER_VIEW_REASON = "지금은 측정할 수 없어요(주문이 익명 방문 기록과 이어져 있지 않아요). 후기 영역을 보여 주는 쪽과 숨기는 쪽을 나눠 비교하는 A/B 테스트가 필요해요. 후기를 본 사람과 보지 않은 사람의 결제율 차이를 후기 때문이라고 말할 수 없어요.";

const emptyRate = () => ({ eligible: 0, written: 0, rate: null as number | null });

export async function getReviewStats(deps: { repo: MiyuRepository; reviews: ReviewRepository; benefits: BenefitRepository; now: () => Date }, input: { sinceDays: number }): Promise<ReviewStats> {
  const sinceDays = Math.min(365, Math.max(1, Math.floor(input.sinceDays)));
  const since = new Date(deps.now().getTime() - sinceDays * 86_400_000).toISOString();
  const sinceMs = Date.parse(since);
  const emptyByKind = Object.fromEntries(REVIEW_KINDS.map((k) => [k, emptyRate()])) as ReviewStats["writeRate"]["byKind"];
  const base: ReviewStats = {
    ready: false,
    sinceDays,
    funnel: reviewFunnel([]),
    paidAfterView: { measurable: false, reason: PAID_AFTER_VIEW_REASON },
    writeRate: { overall: emptyRate(), byKind: emptyByKind },
    reward: { reviewsRewarded: 0, creditsGranted: 0, unitCostKrw: 0, unitCostSource: "assumed", aiCostKrw: 0, pending: 0, failed: 0 },
    spread: { written: ratingSpread([]), published: ratingSpread([]), home: ratingSpread([]) },
    counts: { written: 0, published: 0, private: 0, hidden: 0, deleted: 0, featured: 0, reportedReviews: 0 },
  };

  let stats;
  try {
    stats = await deps.reviews.listReviewStats({ limit: 20_000 });
  } catch (e) {
    if (missing(e)) return base;
    throw e;
  }

  const [events, orders, reports, chatSubjects, costRows, benefitSettings, candidates, openReports] = await Promise.all([
    deps.repo.listFunnelEventsSince(since, 50_000),
    deps.repo.listOrdersForMetrics(since, 20_000),
    deps.repo.listReportsForMetrics(since, 20_000),
    deps.reviews.listAnsweredChatSubjects({ since, limit: 20_000 }),
    deps.benefits.listAiQuestionCosts(since, 5_000).catch(() => []),
    loadBenefitSettings(deps.benefits),
    deps.reviews.listHomeCandidates({ recent: 60 }).catch(() => [] as PublicReview[]),
    deps.reviews.adminListReviews({ reportedOnly: true, limit: 1, offset: 0 }).catch(() => ({ rows: [], total: 0 })),
  ]);

  // 작성률 — 이 기간에 생긴 적격 이용 건(결제 완료 + 리포트 완성인 구매 · 답을 받은 채팅)이 분모, 그중 후기가 있는 건이 분자
  const readyOrders = new Set(reports.filter((r) => r.status === "ready").map((r) => r.orderId));
  const keys: { key: string; kind: ReviewKind }[] = [];
  for (const o of orders) {
    if (o.status !== "paid" || !readyOrders.has(o.id)) continue;
    const kind: ReviewKind | null = isPersonalProduct(o.productId) ? "personal" : isCompatProduct(o.productId) ? "saju_compat" : null;
    if (kind) keys.push({ key: reviewKey(o.userId, kind, o.id), kind });
  }
  for (const c of chatSubjects) keys.push({ key: reviewKey(c.userId, "chat", c.assessmentId), kind: "chat" });
  const written = new Set(stats.map((s) => reviewKey(s.userId, s.kind, s.subjectRef)));
  const byKind = { ...emptyByKind };
  for (const k of REVIEW_KINDS) byKind[k] = reviewWriteRate(keys.filter((x) => x.kind === k).map((x) => x.key), written);
  const overall = reviewWriteRate(keys.map((x) => x.key), written);

  // 보상 — 이 기간에 쓴 후기 중 지급 확정 건
  const inPeriod = stats.filter((s) => Date.parse(s.createdAt) >= sinceMs);
  const rewarded = inPeriod.filter((s) => s.rewardState === "granted");
  const creditsGranted = rewarded.reduce((n, s) => n + s.rewardCredits, 0);
  const cost = summarizeAiQuestionCosts(costRows);
  const { assumptions, usedMeasuredQuestionCost } = assumptionsFromSettings(benefitSettings.settings, { aiQuestionAvgKrw: cost.overall.avgKrw, samples: cost.questions });

  const live = stats.filter((s) => s.status !== "deleted");
  const publicRows = stats.filter((s) => isPublicReview(s));
  return {
    ready: true,
    sinceDays,
    funnel: reviewFunnel(events),
    paidAfterView: { measurable: false, reason: PAID_AFTER_VIEW_REASON },
    writeRate: { overall, byKind },
    reward: {
      reviewsRewarded: rewarded.length,
      creditsGranted,
      unitCostKrw: assumptions.aiQuestionCostKrw,
      unitCostSource: usedMeasuredQuestionCost ? "measured" : "assumed",
      aiCostKrw: Math.round(creditsGranted * assumptions.aiQuestionCostKrw * 100) / 100,
      pending: stats.filter((s) => s.rewardState === "pending").length,
      failed: stats.filter((s) => s.rewardState === "failed").length,
    },
    spread: { written: ratingSpread(live), published: ratingSpread(publicRows), home: ratingSpread(pickHomeReviews(candidates, REVIEWS.homeMax)) },
    counts: {
      written: live.length,
      published: stats.filter((s) => s.status === "published").length,
      private: stats.filter((s) => s.status === "private").length,
      hidden: stats.filter((s) => s.status === "hidden").length,
      deleted: stats.filter((s) => s.status === "deleted").length,
      featured: publicRows.filter((s) => s.featured).length,
      reportedReviews: openReports.total,
    },
  };
}
