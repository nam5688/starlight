import { ReviewAllLink, ReviewViewTracker } from "@/components/home/review-section-tracker";
import { ReviewCard } from "@/components/reviews/review-card";
import { ArrowIcon } from "@/components/ui/icons";
import { buttonSecondary, pageWide } from "@/components/ui/styles";
import { REVIEW_PUBLIC_NOTES, type PublicReview } from "@/lib/commerce/reviews";

/**
 * 홈 후기 구역의 그리는 부분 — 서버 연결(review-section.tsx)과 분리해 개발용 미리보기가 같은 화면을 가상 문구로 확인한다. 공개 후기가 없으면 아무것도 그리지 않는다(null).
 * track이 false이면 방문 단계(영역 조회 · 전체 후기 클릭)를 기록하지 않는다(미리보기용).
 */
export function ReviewSectionView({ reviews, total, idPrefix = "home-", track = true }: { reviews: PublicReview[]; total: number; idPrefix?: string; track?: boolean }) {
  if (reviews.length === 0) return null;
  const titleId = `${idPrefix}reviews-title`;
  return (
    <section id={`${idPrefix}reviews`} aria-labelledby={titleId} className="border-t border-line">
      <div className={`${pageWide} py-12 md:py-16`}>
        <h2 id={titleId} className="text-[22px] leading-snug font-bold tracking-tight md:text-[28px]">
          실제 이용 후기
        </h2>
        <p className="mt-2 max-w-[40rem] text-[15px] leading-[1.7] text-ink-2">{REVIEW_PUBLIC_NOTES.source} 질문권 보상을 받고 쓴 후기에는 그 사실이 함께 표시돼요.</p>
        <ReviewViewTracker enabled={track}>
          <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r) => (
              <li key={r.id}>
                <ReviewCard review={r} />
              </li>
            ))}
          </ul>
        </ReviewViewTracker>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <ReviewAllLink href="/reviews" className={buttonSecondary} enabled={track}>
            전체 후기 보기{total > reviews.length ? ` (${total}개)` : ""}
            <ArrowIcon />
          </ReviewAllLink>
        </div>
        <p className="mt-4 max-w-[40rem] text-[13px] leading-[1.7] text-ink-3">
          {REVIEW_PUBLIC_NOTES.selection} {REVIEW_PUBLIC_NOTES.noAi}
        </p>
      </div>
    </section>
  );
}
