import type { ReactNode } from "react";
import { formatDate } from "@/components/ui/format";
import { StarIcon } from "@/components/ui/icons";
import { disclosureLabels, REVIEW_KIND_LABEL, type PublicReview } from "@/lib/commerce/reviews";

/** 별점 — 별 그림과 "5점 만점에 N점" 글자를 함께 둔다(그림 · 색만으로 뜻을 구분하지 않는다). 별점보다 글이 중심이라 작게 둔다 */
export function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span role="img" aria-label={`5점 만점에 ${rating}점`} className="inline-flex gap-0.5 text-accent">
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon key={n} filled={n <= rating} className="size-3.5" />
        ))}
      </span>
      <span aria-hidden="true" className="text-[13px] font-semibold text-ink-2 tabular-nums">
        {rating}점
      </span>
    </span>
  );
}

/** 대가 표시 — 질문권 보상 · 무료 체험을 숨기지 않고 후기마다 글로 보인다(가안 문구: 법정 표시 문구는 법률 검토 대상) */
export function DisclosureTags({ review }: { review: Pick<PublicReview, "disclosure" | "freeTrial"> }) {
  const labels = disclosureLabels(review);
  if (labels.length === 0) return null;
  return (
    <ul aria-label="후기 작성 대가 표시" className="flex flex-wrap gap-1.5">
      {labels.map((l) => (
        <li key={l} className="inline-flex items-center rounded-md bg-mist px-2 py-0.5 text-[12.5px] leading-snug font-medium text-ink-2">
          {l}
        </li>
      ))}
    </ul>
  );
}

/**
 * 공개 후기 한 장 — 종류 이름표 · 별점 · 글 · 날짜 · 대가 표시. 작성자를 알 수 있는 값(이름 · 닉네임 · 회원번호)은 없다.
 * 글은 작성한 그대로 보인다(고치거나 줄이지 않는다). footer는 신고 같은 작은 동작 자리다.
 */
export function ReviewCard({ review, footer }: { review: PublicReview; footer?: ReactNode }) {
  return (
    <article className="flex h-full flex-col rounded-2xl bg-canvas p-5 shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center rounded-md bg-accent-soft px-2 py-0.5 text-[13px] font-semibold text-accent-strong">{REVIEW_KIND_LABEL[review.kind]}</span>
        <Stars rating={review.rating} />
      </header>
      <p className="mt-3 flex-1 text-[15px] leading-[1.75] break-words whitespace-pre-line text-ink">{review.body}</p>
      <footer className="mt-4 space-y-2.5">
        <DisclosureTags review={review} />
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13px] text-ink-3">
          <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
          {footer}
        </div>
      </footer>
    </article>
  );
}
