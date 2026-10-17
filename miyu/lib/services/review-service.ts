// 이용 후기(리뷰) 서비스 — 이용 자격 확인 · 작성 · 수정 · 비공개 · 삭제 · 질문권 보상 · 공개 조회 · 신고.
// 판단의 진짜 기준은 서버다: 후기는 **본인의 실제 이용 건**(결제 완료 + 리포트 완성 · 답을 받은 AI 질문)에만 달 수 있고, 화면이 보낸 종류 · 이용 건 번호를 그대로 믿지 않는다.
//
// 지키는 것(운영자 요청 2026-10-17)
// - 한 이용 건에 후기 하나(DB 고유 조건), 보상은 한 건에 한 번 — 질문권 장부의 멱등 키 `review:<후기 번호>`로 지급하므로 수정 · 삭제 · 비공개 전환 · 다시 쓰기 · 동시에 여러 번 제출해도 한 번뿐이다. 회수도 하지 않는다.
// - 긍정 · 부정 · 공개 여부와 무관하게 보상은 같다(최소 글자 수만 본다). 글이 최소 글자 수에 못 미치면 저장하지 않는다(별점만으로 보상을 받을 수 없다).
// - 보상 스위치(feature.review_reward)가 꺼져 있으면 후기만 저장하고 지급하지 않는다. 지급이 실패해도 후기 저장은 막지 않고 "다시 시도 가능"으로 남긴다(곧 맞춘다).
// - 대가(질문권 보상 · 무료 체험)는 쓸 때 정해 후기에 남기고 공개될 때 숨기지 않고 보인다. ※ 표시 문구는 가안 — 법정 문구는 법률 검토 대상이다.
// - AI는 후기를 만들거나 고치거나 요약하지 않는다(이 파일에 AI 호출이 없다). 서버는 개인정보로 보이는 부분만 가린다.
// - DB 25번 전에는 조회는 빈 값 · 쓰기는 "준비 중"이다(기존 화면은 그대로 동작한다).

import { disclosureFor, normalizeReviewInput, pickHomeReviews, REVIEW_KIND_LABEL, REVIEW_KINDS, kindsOfGroup, type PublicReview, type ReviewFieldErrors, type ReviewGroup, type ReviewKind, type RewardState } from "../commerce/reviews.ts";
import { isCompatProduct, isPersonalProduct, productNameOf, REVIEWS } from "../config/product.ts";
import type { BenefitRepository } from "./benefit-ports.ts";
import { loadBenefitSettings } from "./benefit-service.ts";
import type { MiyuRepository, OrderRecord } from "./ports.ts";
import type { ReviewRecord, ReviewRepository } from "./review-ports.ts";

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";

// ── 이용 건(후기를 쓸 수 있는 것) ─────────────────

/** 후기를 쓸 수 있는 이용 건 하나 — 구매 주문 · 답을 받은 AI 질문이 있는 검사 결과 · 리포트 궁합 */
export type ReviewSubject = {
  kind: ReviewKind;
  /** 구매 건이면 주문 번호(uuid), 채팅이면 검사 결과 번호(uuid) */
  subjectRef: string;
  /** 화면에 보이는 이름(예: 심층 리포트 · 사주 궁합 · 미유 채팅) — 이름 · 생년월일은 담지 않는다 */
  title: string;
  /** 이용한 시점(결제 승인 · 처음 답을 받은 시각) */
  at: string;
  /** 무료로 제공받은 이용인가(체험 · 쿠폰 · 포인트 교환 · 무료 질문) — 공개 후기에 "무료 체험 제공"으로 표시된다 */
  freeTrial: boolean;
  /** 질문권 보상 대상인가 — 무료 체험은 쿠폰의 후기 보상 허용(reviewRewardEligible)이 있을 때만 대상이다 */
  rewardEligible: boolean;
};

/**
 * 리포트 궁합 후기의 자격 확인 — 리포트 궁합은 다른 곳에서 만들고 있어 이 서비스는 모양만 정해 둔다. 기본 구현(NO_PAIR_REVIEW_ELIGIBILITY)은 항상 "자격 없음"이고,
 * 리포트 궁합이 구현되면 그쪽이 같은 모양의 구현을 서버 연결(server/reviews.ts)에 넣는다. 구현은 **본인의 이용 건만** 돌려줘야 한다(결제 완료 · 리포트 완성 · 환불 아님).
 */
export interface PairReviewEligibility {
  list(userId: string): Promise<ReviewSubject[]>;
  find(userId: string, subjectRef: string): Promise<ReviewSubject | null>;
}
export const NO_PAIR_REVIEW_ELIGIBILITY: PairReviewEligibility = {
  async list() {
    return [];
  },
  async find() {
    return null;
  },
};

export type ReviewDeps = { repo: MiyuRepository; reviews: ReviewRepository; benefits: BenefitRepository; pair?: PairReviewEligibility; now: () => Date };

/** 후기에 쓰는 설정 — 혜택 설정(관리자가 바꾼다). 혜택 표가 없으면(DB 19번 전) 보상은 꺼진 것으로 본다 */
export type ReviewSettings = { rewardOn: boolean; rewardCredits: number; minBodyChars: number; creditExpireDays: number };

export async function loadReviewSettings(benefits: BenefitRepository): Promise<ReviewSettings> {
  const { ready, settings } = await loadBenefitSettings(benefits);
  return { rewardOn: ready && settings.features.review_reward && settings.review.rewardCredits > 0, rewardCredits: settings.review.rewardCredits, minBodyChars: settings.review.minBodyChars, creditExpireDays: settings.creditExpireDays };
}

/** 주문 하나가 후기 이용 건인가 — 결제 완료 + 리포트 완성인 개인 심층 리포트 · 사주 궁합만(환불 · 만드는 중 · 실패는 아니다). 고민 리포트 · 질문 묶음 · 리포트 궁합 주문은 여기서 다루지 않는다 */
async function subjectOfOrder(deps: ReviewDeps, order: OrderRecord, reportStatus: string | undefined): Promise<ReviewSubject | null> {
  if (order.status !== "paid" || reportStatus !== "ready") return null;
  const kind: ReviewKind | null = isPersonalProduct(order.productId) ? "personal" : isCompatProduct(order.productId) ? "saju_compat" : null;
  if (!kind) return null;
  let freeTrial = false;
  let rewardEligible = true;
  if (order.provider === "benefit") {
    // 혜택으로 받은 0원 주문(체험단 · 쿠폰 · 포인트 교환) — 후기는 쓸 수 있지만 질문권 보상은 쿠폰의 후기 보상 허용이 있을 때만이다
    freeTrial = true;
    const grant = await deps.benefits.getBenefitGrant(order.id).catch(() => null);
    rewardEligible = Boolean(grant?.reviewRewardEligible);
  }
  return { kind, subjectRef: order.id, title: productNameOf(order.productId), at: order.approvedAt ?? order.createdAt, freeTrial, rewardEligible };
}

/** 이 회원이 후기를 쓸 수 있는 이용 건 전부(최근 것이 먼저). 이미 후기를 쓴 건도 들어 있다 — 화면이 후기와 맞춰 나눈다 */
export async function listReviewSubjects(deps: ReviewDeps, userId: string): Promise<ReviewSubject[]> {
  const [orders, statuses, chat, pair] = await Promise.all([
    deps.repo.listOrdersForUser(userId),
    deps.repo.listReportStatuses(userId),
    deps.reviews.listAnsweredChatSubjects({ userId, limit: 500 }),
    (deps.pair ?? NO_PAIR_REVIEW_ELIGIBILITY).list(userId).catch(() => [] as ReviewSubject[]),
  ]);
  const statusOf = new Map(statuses.map((s) => [s.orderId, s.status]));
  const out: ReviewSubject[] = [];
  for (const o of orders) {
    const s = await subjectOfOrder(deps, o, statusOf.get(o.id));
    if (s) out.push(s);
  }
  const bought = new Set(orders.filter((o) => o.status === "paid" && isPersonalProduct(o.productId) && o.provider !== "benefit").map((o) => o.assessmentId));
  for (const c of chat) {
    // 채팅 후기는 "답을 받은 AI 질문이 있는 검사 결과" 하나가 한 건이다. 그 결과로 심층 리포트를 산 적이 없으면 무료 체험이다
    out.push({ kind: "chat", subjectRef: c.assessmentId, title: REVIEW_KIND_LABEL.chat, at: c.firstAnswerAt, freeTrial: !bought.has(c.assessmentId), rewardEligible: true });
  }
  out.push(...pair.filter((p) => p.kind === "pair_compat"));
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** 이 회원의 이용 건 하나 — 본인 것이 아니거나 이용이 끝난 것이 아니면 null. 화면이 보낸 번호는 여기서 다시 확인한다 */
export async function findReviewSubject(deps: ReviewDeps, userId: string, kind: ReviewKind, subjectRef: string): Promise<ReviewSubject | null> {
  if (!UUID.test(subjectRef)) return null;
  const ref = subjectRef.toLowerCase();
  if (kind === "personal" || kind === "saju_compat") {
    const order = await deps.repo.getOrderById(ref);
    if (!order || order.userId !== userId) return null;
    const report = await deps.repo.getReportByOrder(order.id);
    const s = await subjectOfOrder(deps, order, report?.status);
    return s && s.kind === kind ? s : null;
  }
  if (kind === "chat") {
    const subjects = await deps.reviews.listAnsweredChatSubjects({ userId, limit: 500 });
    const c = subjects.find((x) => x.assessmentId === ref);
    if (!c) return null;
    const orders = await deps.repo.listOrdersForAssessment(ref);
    const bought = orders.some((o) => o.userId === userId && o.status === "paid" && isPersonalProduct(o.productId) && o.provider !== "benefit");
    return { kind: "chat", subjectRef: ref, title: REVIEW_KIND_LABEL.chat, at: c.firstAnswerAt, freeTrial: !bought, rewardEligible: true };
  }
  const found = await (deps.pair ?? NO_PAIR_REVIEW_ELIGIBILITY).find(userId, ref).catch(() => null);
  return found && found.kind === "pair_compat" ? found : null;
}

// ── 보상 ─────────────────────────────────────

/** 쓸 때 정하는 보상 — 꺼져 있거나 0개면 off, 켜져 있어도 보상 대상이 아닌 무료 체험이면 ineligible, 아니면 pending(곧 지급) */
export function rewardPlanFor(settings: ReviewSettings, subject: Pick<ReviewSubject, "rewardEligible">): "pending" | "off" | "ineligible" {
  if (!settings.rewardOn) return "off";
  return subject.rewardEligible ? "pending" : "ineligible";
}

/**
 * 지급을 시작했지만 확정하지 못한 후기(pending · failed)의 보상을 맞춘다 — 질문권 장부 함수는 같은 멱등 키(`review:<후기 번호>`)로 한 번만 지급하므로
 * 몇 번 불러도 질문권은 한 번만 들어간다. 지급 스위치가 꺼져 있으면 건드리지 않는다. 지급하지 못해도 오류를 던지지 않고 failed로 남긴다.
 */
export async function settleReviewReward(deps: Pick<ReviewDeps, "reviews" | "benefits" | "now">, review: ReviewRecord, settings?: ReviewSettings): Promise<RewardState> {
  if (review.rewardState !== "pending" && review.rewardState !== "failed") return review.rewardState;
  const cfg = settings ?? (await loadReviewSettings(deps.benefits));
  if (!cfg.rewardOn) return review.rewardState;
  const opKey = `review:${review.id}`;
  const expiresAt = cfg.creditExpireDays > 0 ? new Date(deps.now().getTime() + cfg.creditExpireDays * DAY_MS).toISOString() : null;
  let state: "granted" | "failed" = "failed";
  try {
    const g = await deps.benefits.grantCredit({ userId: review.userId, kind: "review", qty: cfg.rewardCredits, sourceRef: opKey, opKey, expiresAt });
    // duplicate: 앞선 시도가 이미 지급했지만 확정 기록을 남기지 못한 경우 — 같은 보상으로 확정한다
    if (g.status === "granted" || g.status === "duplicate") state = "granted";
  } catch {
    state = "failed";
  }
  try {
    await deps.reviews.settleReward({ id: review.id, state, credits: cfg.rewardCredits, opKey });
  } catch {
    // 확정 기록을 남기지 못하면 pending으로 남아 다음에 같은 키로 다시 맞춘다(지급은 한 번)
    return review.rewardState;
  }
  return state;
}

/** 이 회원(또는 전체)의 보상 미확정 후기를 맞춘다 — 맞춘 건수 */
export async function retryReviewRewards(deps: ReviewDeps, opts: { userId?: string; limit?: number } = {}): Promise<{ tried: number; granted: number }> {
  const settings = await loadReviewSettings(deps.benefits);
  if (!settings.rewardOn) return { tried: 0, granted: 0 };
  const list = await deps.reviews.listRewardRetry({ userId: opts.userId, limit: opts.limit ?? 50 });
  let granted = 0;
  for (const r of list) if ((await settleReviewReward(deps, r, settings)) === "granted") granted += 1;
  return { tried: list.length, granted };
}

// ── 작성 · 수정 · 비공개 · 삭제 ───────────────────

export type CreateReviewInput = { userId: string; kind: unknown; ref: unknown; rating: unknown; body: unknown; publicConsent: unknown };
export type CreateReviewResult =
  | { kind: "created"; review: ReviewRecord; reward: RewardState; redactions: number }
  /** 이전에 직접 지운 후기를 다시 썼다 — 보상은 다시 주지 않는다(지급이 끝나지 않았던 경우에만 마저 맞춘다) */
  | { kind: "revived"; review: ReviewRecord; reward: RewardState; redactions: number }
  | { kind: "exists"; review: ReviewRecord }
  | { kind: "invalid"; errors: ReviewFieldErrors }
  | { kind: "not-eligible" }
  /** 운영자가 지운 후기는 다시 쓸 수 없다 */
  | { kind: "blocked" }
  /** DB 변경 25번 전 */
  | { kind: "not-ready" };

/** 후기 쓰기 — 이용 자격 · 입력 · 중복을 확인하고 저장한 뒤 보상을 한 번 지급한다 */
export async function createReview(deps: ReviewDeps, input: CreateReviewInput): Promise<CreateReviewResult> {
  if (typeof input.kind !== "string" || !(REVIEW_KINDS as readonly string[]).includes(input.kind) || typeof input.ref !== "string") return { kind: "not-eligible" };
  const kind = input.kind as ReviewKind;
  try {
    const settings = await loadReviewSettings(deps.benefits);
    const norm = normalizeReviewInput({ rating: input.rating, body: input.body, publicConsent: input.publicConsent }, { minBodyChars: settings.minBodyChars });
    if (!norm.ok) return { kind: "invalid", errors: norm.errors };
    const subject = await findReviewSubject(deps, input.userId, kind, input.ref);
    if (!subject) return { kind: "not-eligible" };
    const v = norm.value;
    const edit = { rating: v.rating, body: v.body, publicConsent: v.publicConsent, consentNoticeVersion: REVIEWS.noticeVersion };

    const existing = await deps.reviews.getReviewByKey(input.userId, kind, subject.subjectRef);
    if (existing) {
      if (existing.status !== "deleted") return { kind: "exists", review: existing };
      if (existing.deletedBy !== "user") return { kind: "blocked" };
      // 직접 지운 후기를 다시 쓴다 — 같은 고유 키라 보상이 다시 생기지 않는다. 조건부 갱신이라 동시에 두 번 눌러도 한 번만 살아난다
      const revived = await deps.reviews.reviveReview({ id: existing.id, userId: input.userId, ...edit });
      if (!revived) {
        const now = await deps.reviews.getReview(existing.id);
        return now && now.status !== "deleted" ? { kind: "exists", review: now } : { kind: "blocked" };
      }
      const reward = await settleReviewReward(deps, revived, settings);
      return { kind: "revived", review: (await deps.reviews.getReview(revived.id)) ?? { ...revived, rewardState: reward }, reward, redactions: v.redactions };
    }

    const rewardPlan = rewardPlanFor(settings, subject);
    const inserted = await deps.reviews.insertReview({
      userId: input.userId,
      kind,
      subjectRef: subject.subjectRef,
      ...edit,
      disclosure: disclosureFor({ rewardOffered: rewardPlan === "pending", freeTrial: subject.freeTrial }),
      freeTrial: subject.freeTrial,
      rewardState: rewardPlan,
    });
    if (!inserted.ok) {
      // 동시에 다른 요청이 먼저 저장했다 — 두 번째 요청은 새로 쓴 것으로 치지 않고 보상도 만들지 않는다
      const now = await deps.reviews.getReviewByKey(input.userId, kind, subject.subjectRef);
      return now ? { kind: "exists", review: now } : { kind: "not-eligible" };
    }
    const reward = await settleReviewReward(deps, inserted.review, settings);
    // 지급 결과(확정한 질문권 수)가 반영된 최신 기록으로 돌려준다
    return { kind: "created", review: (await deps.reviews.getReview(inserted.review.id)) ?? { ...inserted.review, rewardState: reward }, reward, redactions: v.redactions };
  } catch (e) {
    if (missing(e)) return { kind: "not-ready" };
    throw e;
  }
}

export type EditReviewResult = { kind: "updated"; review: ReviewRecord; redactions: number } | { kind: "invalid"; errors: ReviewFieldErrors } | { kind: "not-found" } | { kind: "not-ready" };

/** 후기 고치기(글 · 별점 · 공개 동의) — 내 후기만. 보상은 다시 주지 않는다. 운영자가 숨긴 후기는 고쳐도 숨김이 유지된다 */
export async function editReview(deps: ReviewDeps, input: { userId: string; id: unknown; rating: unknown; body: unknown; publicConsent: unknown }): Promise<EditReviewResult> {
  if (typeof input.id !== "string" || !UUID.test(input.id)) return { kind: "not-found" };
  try {
    const settings = await loadReviewSettings(deps.benefits);
    const review = await deps.reviews.getReview(input.id);
    if (!review || review.userId !== input.userId || review.status === "deleted") return { kind: "not-found" };
    const norm = normalizeReviewInput({ rating: input.rating, body: input.body, publicConsent: input.publicConsent }, { minBodyChars: settings.minBodyChars });
    if (!norm.ok) return { kind: "invalid", errors: norm.errors };
    const updated = await deps.reviews.updateReview({ id: review.id, userId: input.userId, rating: norm.value.rating, body: norm.value.body, publicConsent: norm.value.publicConsent, consentNoticeVersion: REVIEWS.noticeVersion });
    if (!updated) return { kind: "not-found" };
    await settleReviewReward(deps, updated, settings).catch(() => updated.rewardState);
    return { kind: "updated", review: updated, redactions: norm.value.redactions };
  } catch (e) {
    if (missing(e)) return { kind: "not-ready" };
    throw e;
  }
}

/** 공개 · 나만 보기 전환(글은 그대로) — 보상 · 대가 표시는 바뀌지 않는다 */
export async function setReviewVisibility(deps: Pick<ReviewDeps, "reviews">, input: { userId: string; id: unknown; publicConsent: boolean }): Promise<{ kind: "updated"; review: ReviewRecord } | { kind: "not-found" } | { kind: "not-ready" }> {
  if (typeof input.id !== "string" || !UUID.test(input.id)) return { kind: "not-found" };
  try {
    const review = await deps.reviews.getReview(input.id);
    if (!review || review.userId !== input.userId || review.status === "deleted") return { kind: "not-found" };
    const updated = await deps.reviews.setPublicConsent({ id: review.id, userId: input.userId, publicConsent: input.publicConsent, consentNoticeVersion: REVIEWS.noticeVersion });
    return updated ? { kind: "updated", review: updated } : { kind: "not-found" };
  } catch (e) {
    if (missing(e)) return { kind: "not-ready" };
    throw e;
  }
}

/** 후기 지우기 — 글만 지우고 묘비를 남긴다(같은 이용 건에 보상이 또 생기지 않는다). 이미 받은 질문권은 되찾지 않는다 */
export async function deleteReview(deps: Pick<ReviewDeps, "reviews">, input: { userId: string; id: unknown }): Promise<{ kind: "deleted" } | { kind: "not-found" } | { kind: "not-ready" }> {
  if (typeof input.id !== "string" || !UUID.test(input.id)) return { kind: "not-found" };
  try {
    const gone = await deps.reviews.deleteReview({ id: input.id, userId: input.userId });
    return gone ? { kind: "deleted" } : { kind: "not-found" };
  } catch (e) {
    if (missing(e)) return { kind: "not-ready" };
    throw e;
  }
}

// ── 내 후기 화면 ─────────────────────────────

export type MyReviewRow = { review: ReviewRecord; title: string };
export type UnwrittenRow = { subject: ReviewSubject; /** 이전에 직접 지운 후기가 있어 "다시 쓰기"다 — 보상은 다시 생기지 않는다 */ rewrite: boolean; /** 지금 쓰면 질문권을 받는가 */ rewardOffered: boolean };
export type MyReviewsView = {
  ready: boolean;
  reward: { on: boolean; credits: number };
  minBodyChars: number;
  written: MyReviewRow[];
  unwritten: UnwrittenRow[];
};

/** MY — 내가 쓴 후기와 아직 쓰지 않은 적격 건. 열 때 보상이 확정되지 않은 내 후기를 한 번 더 맞춘다 */
export async function getMyReviewsView(deps: ReviewDeps, userId: string): Promise<MyReviewsView> {
  const settings = await loadReviewSettings(deps.benefits);
  const empty: MyReviewsView = { ready: false, reward: { on: settings.rewardOn, credits: settings.rewardCredits }, minBodyChars: settings.minBodyChars, written: [], unwritten: [] };
  let mine: ReviewRecord[];
  try {
    mine = await deps.reviews.listUserReviews(userId);
  } catch (e) {
    if (missing(e)) return empty;
    throw e;
  }
  if (mine.some((r) => r.rewardState === "pending" || r.rewardState === "failed")) {
    await retryReviewRewards(deps, { userId, limit: 20 }).catch(() => ({ tried: 0, granted: 0 }));
    mine = await deps.reviews.listUserReviews(userId);
  }
  const subjects = await listReviewSubjects(deps, userId);
  const byKey = new Map(mine.map((r) => [`${r.kind}|${r.subjectRef}`, r]));
  const titleOf = (r: ReviewRecord) => subjects.find((s) => s.kind === r.kind && s.subjectRef === r.subjectRef)?.title ?? REVIEW_KIND_LABEL[r.kind];
  const written = mine.filter((r) => r.status !== "deleted" || r.deletedBy === "admin").map((review) => ({ review, title: titleOf(review) }));
  const unwritten: UnwrittenRow[] = [];
  for (const s of subjects) {
    const r = byKey.get(`${s.kind}|${s.subjectRef}`);
    if (r && !(r.status === "deleted" && r.deletedBy === "user")) continue;
    // 다시 쓰기에는 보상이 없다 — 이미 받은 보상이 있거나 처음부터 대상이 아니었던 건에는 다시 주지 않는다
    unwritten.push({ subject: s, rewrite: Boolean(r), rewardOffered: !r && rewardPlanFor(settings, s) === "pending" });
  }
  return { ready: true, reward: { on: settings.rewardOn, credits: settings.rewardCredits }, minBodyChars: settings.minBodyChars, written, unwritten };
}

// ── 공개 조회 · 신고 ─────────────────────────

export type PublicReviewsPage = { reviews: PublicReview[]; total: number; page: number; pages: number; group: ReviewGroup | null };

/** 전체 후기 한 쪽 — 공개 중이고 공개에 동의한 후기만, 최신순(운영자 선정으로 순서를 바꾸지 않는다). 표가 없거나 읽지 못하면 빈 쪽 */
export async function publicReviewsPage(reviews: ReviewRepository, input: { group: ReviewGroup | null; page: number }): Promise<PublicReviewsPage> {
  const page = Number.isInteger(input.page) && input.page >= 1 ? input.page : 1;
  try {
    const kinds = input.group ? kindsOfGroup(input.group) : undefined;
    const r = await reviews.listPublicReviews({ kinds, limit: REVIEWS.pageSize, offset: (page - 1) * REVIEWS.pageSize });
    return { reviews: r.rows, total: r.total, page, pages: Math.max(1, Math.ceil(r.total / REVIEWS.pageSize)), group: input.group };
  } catch (e) {
    if (missing(e)) return { reviews: [], total: 0, page: 1, pages: 1, group: input.group };
    throw e;
  }
}

export type HomeReviews = { reviews: PublicReview[]; total: number };

/**
 * 메인에 보일 후기 — 공개 후기가 `REVIEWS.minToShowOnHome`개 미만이면 빈 목록(부른 쪽이 영역 전체를 그리지 않는다). 가짜 후기로 채우지 않는다.
 * 읽다가 오류가 나도 홈은 깨지지 않게 빈 목록을 돌려준다.
 */
export async function homeReviews(reviews: ReviewRepository): Promise<HomeReviews> {
  try {
    const candidates = await reviews.listHomeCandidates({ recent: 60 });
    if (candidates.length < Math.max(1, REVIEWS.minToShowOnHome)) return { reviews: [], total: 0 };
    return { reviews: pickHomeReviews(candidates, REVIEWS.homeMax), total: await reviews.countPublicReviews() };
  } catch {
    return { reviews: [], total: 0 };
  }
}

/** 공개 후기 신고 — 공개 중인 후기에만 받는다. 같은 방문자의 두 번째 신고는 한 번으로 센다 */
export async function reportReview(reviews: ReviewRepository, input: { reviewId: unknown; reporterKey: string; reason: unknown }): Promise<"reported" | "duplicate" | "not-public" | "invalid" | "not-ready"> {
  const reason = input.reason;
  if (typeof input.reviewId !== "string" || !UUID.test(input.reviewId) || (reason !== "privacy" && reason !== "abuse" && reason !== "fake_or_ad" && reason !== "other")) return "invalid";
  try {
    return await reviews.submitReport({ reviewId: input.reviewId, reporterKey: input.reporterKey, reason });
  } catch (e) {
    if (missing(e)) return "not-ready";
    throw e;
  }
}
