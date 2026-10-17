"use client";

import { ReviewsAdminView } from "@/components/admin/reviews/reviews-admin-view";
import { ReviewSectionView } from "@/components/home/review-section-view";
import { MyReviewsBody } from "@/components/reviews/my-reviews-view";
import { ReviewsList } from "@/components/reviews/reviews-list";
import { StatusBadge } from "@/components/ui/source-badge";
import type { PublicReview } from "@/lib/commerce/reviews";
import type { ReviewAdminList, ReviewStats } from "@/lib/services/review-admin-service";
import type { MyReviewsView, PublicReviewsPage } from "@/lib/services/review-service";
import type { ReviewAdminLogRecord, ReviewRecord } from "@/lib/services/review-ports";

// 개발용 미리보기 — 후기 화면(홈 영역 · 전체 후기 · MY · 관리자)을 **화면 디자인용 가상 문구**로 한 화면에 보여 준다. 실제 후기가 아니고, 실제 홈 · /reviews에는 이런 글을 넣지 않는다.
// 실제 화면과 같은 조각(ReviewSectionView · ReviewsList · MyReviewsBody · ReviewsAdminView)을 쓰며, 서버 동작 대신 아무것도 바꾸지 않는 동작을 넘긴다. 값은 모두 고정 문자열이다(렌더마다 달라지지 않는다).

const noop = async () => {};
const noopSave = async () => ({ ok: false, message: "개발용 미리보기에서는 동작하지 않아요." });
const noopReport = async () => ({ ok: false, message: "개발용 미리보기에서는 동작하지 않아요." });

const R = (id: string, kind: PublicReview["kind"], rating: number, body: string, createdAt: string, o: Partial<PublicReview> = {}): PublicReview => ({ id, kind, rating, body, disclosure: "none", freeTrial: false, createdAt, updatedAt: createdAt, featured: false, featuredAt: null, ...o });

const FAKE: PublicReview[] = [
  R("00000000-0000-4000-8000-0000000000a1", "personal", 5, "[가상 문구] 평소에 왜 그런 선택을 하는지 장면으로 풀어 줘서 한참 읽었어요. 내 이야기를 읽는 기분이었어요.", "2026-10-16T05:00:00Z", { disclosure: "reward", featured: true, featuredAt: "2026-10-17T00:00:00Z" }),
  R("00000000-0000-4000-8000-0000000000a2", "saju_compat", 3, "[가상 문구] 두 사람이 부딪히는 지점은 공감됐는데, 어떻게 맞춰 가면 좋을지는 조금 더 구체적이면 좋겠어요.", "2026-10-15T05:00:00Z", { disclosure: "reward" }),
  R("00000000-0000-4000-8000-0000000000a3", "chat", 4, "[가상 문구] 궁금한 걸 바로 물어볼 수 있어서 좋았어요. 다만 답이 길어질 때는 핵심만 먼저 알려 주면 좋겠어요.", "2026-10-14T05:00:00Z", { disclosure: "free_trial", freeTrial: true }),
  R("00000000-0000-4000-8000-0000000000a4", "personal", 2, "[가상 문구] 기대한 만큼 새로운 내용은 아니었어요. 그래도 정리된 형태로 다시 보니 생각을 정리하는 데는 도움이 됐어요.", "2026-10-13T05:00:00Z"),
  R("00000000-0000-4000-8000-0000000000a5", "chat", 5, "[가상 문구] 연애 고민을 말했더니 단정하지 않고 조건을 나눠서 이야기해 줘서 편했어요.", "2026-10-12T05:00:00Z", { disclosure: "reward", freeTrial: true }),
  R("00000000-0000-4000-8000-0000000000a6", "personal", 4, "[가상 문구] 무료 리포트와 비교해 어디가 더 깊어졌는지 바로 느껴졌어요.", "2026-10-11T05:00:00Z", { disclosure: "reward" }),
];

const PUBLIC_PAGE: PublicReviewsPage = { reviews: FAKE, total: 14, page: 1, pages: 2, group: null };
const EMPTY_PAGE: PublicReviewsPage = { reviews: [], total: 0, page: 1, pages: 1, group: "chat" };

const REC = (o: Partial<ReviewRecord> & Pick<ReviewRecord, "id" | "kind" | "subjectRef">): ReviewRecord => ({
  userId: "5a1b2c3d-0000-4000-8000-000000000000",
  rating: 4,
  body: "",
  publicConsent: true,
  status: "published",
  disclosure: "reward",
  freeTrial: false,
  rewardState: "granted",
  rewardCredits: 1,
  rewardOpKey: `review:${o.id.slice(0, 8)}`,
  rewardedAt: "2026-10-16T05:00:01Z",
  consentedAt: "2026-10-16T05:00:00Z",
  consentNoticeVersion: "2026-10-17",
  featured: false,
  featuredAt: null,
  hiddenReason: null,
  hiddenAt: null,
  deletedBy: null,
  deletedAt: null,
  createdAt: "2026-10-16T05:00:00Z",
  updatedAt: "2026-10-16T05:00:00Z",
  ...o,
});

const MY: MyReviewsView = {
  ready: true,
  reward: { on: true, credits: 1 },
  minBodyChars: 20,
  written: [
    { title: "심층 리포트", review: REC({ id: "00000000-0000-4000-8000-0000000000b1", kind: "personal", subjectRef: "00000000-0000-4000-8000-0000000000c1", body: "[가상 문구] 평소에 왜 그런 선택을 하는지 장면으로 풀어 줘서 한참 읽었어요.", rating: 5 }) },
    { title: "사주 궁합", review: REC({ id: "00000000-0000-4000-8000-0000000000b2", kind: "saju_compat", subjectRef: "00000000-0000-4000-8000-0000000000c2", body: "[가상 문구] 두 사람의 부딪히는 지점은 공감됐어요.", rating: 3, publicConsent: false, status: "private", disclosure: "reward", rewardState: "pending", rewardCredits: 0, rewardedAt: null }) },
    { title: "미유 채팅", review: REC({ id: "00000000-0000-4000-8000-0000000000b3", kind: "chat", subjectRef: "00000000-0000-4000-8000-0000000000c3", body: "[가상 문구] 답이 빨라서 좋았어요. 다만 조금 길었어요.", rating: 2, status: "hidden", hiddenReason: "privacy", disclosure: "free_trial", freeTrial: true, rewardState: "ineligible", rewardCredits: 0, rewardedAt: null }) },
  ],
  unwritten: [
    { subject: { kind: "personal", subjectRef: "00000000-0000-4000-8000-0000000000c4", title: "심층 리포트 (2번째 받기)", at: "2026-10-17T01:00:00Z", freeTrial: false, rewardEligible: true }, rewrite: false, rewardOffered: true },
    { subject: { kind: "chat", subjectRef: "00000000-0000-4000-8000-0000000000c5", title: "미유 채팅", at: "2026-10-12T01:00:00Z", freeTrial: true, rewardEligible: true }, rewrite: true, rewardOffered: false },
  ],
};

const ADMIN_LIST: ReviewAdminList = {
  ready: true,
  total: 3,
  page: 1,
  pages: 1,
  rows: [
    { userShort: "5a1b2c3d", openReports: 2, flags: ["dated_year"], review: REC({ id: "00000000-0000-4000-8000-0000000000d1", kind: "personal", subjectRef: "00000000-0000-4000-8000-0000000000e1", body: "[가상 문구] 저는 1996년 3월 29일생인데 풀이가 비슷했어요.", rating: 5 }) },
    { userShort: "7c2d3e4f", openReports: 0, flags: [], review: REC({ id: "00000000-0000-4000-8000-0000000000d2", kind: "chat", subjectRef: "00000000-0000-4000-8000-0000000000e2", body: "[가상 문구] 답이 아쉬웠어요. 근거가 더 있으면 좋겠어요.", rating: 1, featured: true, featuredAt: "2026-10-17T00:00:00Z", disclosure: "free_trial", freeTrial: true, rewardState: "off", rewardCredits: 0, rewardedAt: null, rewardOpKey: null }) },
    { userShort: "9e0f1a2b", openReports: 0, flags: [], review: REC({ id: "00000000-0000-4000-8000-0000000000d3", kind: "saju_compat", subjectRef: "00000000-0000-4000-8000-0000000000e3", rating: 4, status: "deleted", publicConsent: false, consentedAt: null, deletedBy: "admin", deletedAt: "2026-10-17T02:00:00Z", hiddenReason: "fake_or_ad" }) },
  ],
};

const SPREAD = (counts: [number, number, number, number, number]) => ({ counts, total: counts.reduce((a, b) => a + b, 0), average: counts.reduce((a, b) => a + b, 0) ? Math.round((counts.reduce((s, c, i) => s + c * (i + 1), 0) / counts.reduce((a, b) => a + b, 0)) * 100) / 100 : null });
const RATE = (eligible: number, written: number) => ({ eligible, written, rate: eligible ? Math.round((written / eligible) * 1000) / 10 : null });

const STATS: ReviewStats = {
  ready: true,
  sinceDays: 30,
  funnel: { viewers: 120, clickers: 18, clickRate: 15, starters: 31, startRate: 25.8 },
  paidAfterView: { measurable: false, reason: "지금은 측정할 수 없어요(주문이 익명 방문 기록과 이어져 있지 않아요). 후기 영역을 보여 주는 쪽과 숨기는 쪽을 나눠 비교하는 A/B 테스트가 필요해요. 후기를 본 사람과 보지 않은 사람의 결제율 차이를 후기 때문이라고 말할 수 없어요." },
  writeRate: { overall: RATE(40, 14), byKind: { personal: RATE(22, 9), saju_compat: RATE(8, 2), pair_compat: RATE(0, 0), chat: RATE(10, 3) } },
  reward: { reviewsRewarded: 12, creditsGranted: 12, unitCostKrw: 17, unitCostSource: "assumed", aiCostKrw: 204, pending: 1, failed: 1 },
  spread: { written: SPREAD([1, 2, 2, 4, 5]), published: SPREAD([1, 1, 1, 3, 4]), home: SPREAD([0, 1, 1, 2, 2]) },
  counts: { written: 14, published: 10, private: 3, hidden: 1, deleted: 2, featured: 2, reportedReviews: 1 },
};

const LOG: ReviewAdminLogRecord[] = [
  { id: 3, reviewId: "00000000-0000-4000-8000-0000000000d2", adminId: "11111111-0000-4000-8000-000000000000", action: "feature", reasonCode: "balance", memo: null, createdAt: "2026-10-17T00:00:00Z" },
  { id: 2, reviewId: "00000000-0000-4000-8000-0000000000d3", adminId: "11111111-0000-4000-8000-000000000000", action: "delete", reasonCode: "fake_or_ad", memo: null, createdAt: "2026-10-17T02:00:00Z" },
  { id: 1, reviewId: "00000000-0000-4000-8000-0000000000b3", adminId: "11111111-0000-4000-8000-000000000000", action: "hide", reasonCode: "other", memo: "전화번호를 돌려 적음", createdAt: "2026-10-16T09:00:00Z" },
];

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 first:mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[18px] font-bold">{title}</h2>
        <StatusBadge>화면 디자인용 가상 문구</StatusBadge>
      </div>
      {note && <p className="mt-1 text-[14px] leading-relaxed text-ink-3">{note}</p>}
      <div className="mt-4 overflow-hidden rounded-2xl border border-dashed border-line-strong">{children}</div>
    </section>
  );
}

export function ReviewsPreview() {
  const hrefFor = () => "#";
  return (
    <div>
      <Block title="A. 홈 · 실제 이용 후기 영역" note="공개 후기가 1개 이상일 때만 이 영역이 생깁니다. 이 미리보기는 열람 · 클릭 기록을 남기지 않아요.">
        <ReviewSectionView reviews={FAKE} total={14} idPrefix="pv-home-" track={false} />
      </Block>
      <Block title="B. 홈 · 후기가 없을 때" note="아래가 비어 있는 것이 정상입니다 — 제목도 빈 상태 문구도 그리지 않고, 가짜 후기로 채우지 않아요.">
        <div data-testid="home-empty">
          <ReviewSectionView reviews={[]} total={0} idPrefix="pv-empty-" track={false} />
        </div>
      </Block>
      <Block title="C. 전체 후기 (/reviews)">
        <div className="bg-page px-5 pb-8">
          <ReviewsList data={PUBLIC_PAGE} reportAction={noopReport} hrefFor={hrefFor} idPrefix="pv-all-" />
        </div>
      </Block>
      <Block title="D. 전체 후기 · 아직 공개된 후기가 없을 때(실제 화면의 빈 상태)">
        <div className="bg-page px-5 pb-8">
          <ReviewsList data={EMPTY_PAGE} reportAction={noopReport} hrefFor={hrefFor} idPrefix="pv-none-" />
        </div>
      </Block>
      <Block title="E. MY · 내가 작성한 리뷰" note="보상 켜짐 · 쓴 후기 세 건(공개 · 나만 보기 + 지급 확인 중 · 운영자가 숨김)과 아직 쓰지 않은 두 건(새로 쓰기 · 지운 후기 다시 쓰기)">
        <div className="mx-auto max-w-[720px] bg-page px-5 pb-8">
          <MyReviewsBody view={MY} actions={{ save: noopSave, visibility: noop, remove: noop }} open={{ kind: "personal", ref: "00000000-0000-4000-8000-0000000000c4" }} idPrefix="pv-my-" />
        </div>
      </Block>
      <Block title="F. 관리자 · 후기 관리">
        <div className="bg-page px-5 pb-8">
          <ReviewsAdminView note="" stats={STATS} list={ADMIN_LIST} scan={{ ready: true, scanned: 10, total: 10, suspects: [{ review: FAKE[0], flags: ["dated_year"] }] }} log={LOG} filters={{ reported: false, days: 30, page: 1 }} hrefFor={hrefFor} actions={{ apply: noop, retryRewards: noop }} idPrefix="pv-adm-" />
        </div>
      </Block>
    </div>
  );
}
