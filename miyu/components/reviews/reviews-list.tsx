import Link from "next/link";
import { ReviewCard } from "@/components/reviews/review-card";
import { ReviewReport, type ReportAction } from "@/components/reviews/review-report";
import { buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { REVIEW_GROUP_LABEL, REVIEW_GROUPS, REVIEW_PUBLIC_NOTES, type ReviewGroup } from "@/lib/commerce/reviews";
import type { PublicReviewsPage } from "@/lib/services/review-service";

/** 전체 후기 화면의 기본 링크 — 종류(kind)와 쪽(page)만 주소에 싣는다 */
export const reviewsHref = (group: ReviewGroup | null, page: number) => {
  const q = new URLSearchParams();
  if (group) q.set("kind", group);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/reviews?${s}` : "/reviews";
};

/** 전체 후기 목록 화면 — 서버 연결(app/reviews/page.tsx)과 분리해 개발용 미리보기가 같은 화면을 가상 문구로 확인한다. 신고 동작은 prop으로 받는다 */
export function ReviewsList({ data, reportAction, hrefFor = reviewsHref, idPrefix = "" }: { data: PublicReviewsPage; reportAction: ReportAction; hrefFor?: (group: ReviewGroup | null, page: number) => string; idPrefix?: string }) {
  const { group } = data;
  return (
    <>
      <nav aria-label="후기 종류" className="mt-6 flex flex-wrap gap-2 text-[14px]">
        {[null, ...REVIEW_GROUPS].map((g) => (
          <Link key={g ?? "all"} href={hrefFor(g, 1)} aria-current={g === group ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-4 font-semibold ${g === group ? "border-accent bg-accent text-white" : "border-line-strong bg-canvas hover:bg-mist"}`}>
            {g ? REVIEW_GROUP_LABEL[g] : "전체"}
          </Link>
        ))}
      </nav>

      {data.reviews.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-canvas px-5 py-10 shadow-soft">
          <p className="text-[17px] font-semibold">{group ? `공개된 ${REVIEW_GROUP_LABEL[group]} 후기가 아직 없어요.` : "아직 공개된 후기가 없어요."}</p>
          <p className="mt-2 text-[15px] leading-[1.7] text-ink-2">이용하신 분이 공개에 동의한 후기만 이곳에 보여요. 미유는 후기를 대신 쓰거나 채우지 않아요.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href="/analyze" className={buttonPrimary}>
              내 사주 무료로 보기
            </Link>
            <Link href="/report/sample" className={buttonSecondary}>
              리포트 예시 보기
            </Link>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-6 text-[14px] text-ink-3" aria-live="polite">
            {group ? `${REVIEW_GROUP_LABEL[group]} 후기 ` : "공개 후기 "}
            <span className="font-semibold tabular-nums text-ink-2">{data.total}</span>개 · 최신순
          </p>
          <ul className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.reviews.map((r) => (
              <li key={r.id}>
                <ReviewCard review={r} footer={<ReviewReport reviewId={r.id} action={reportAction} idPrefix={idPrefix} />} />
              </li>
            ))}
          </ul>
          {data.pages > 1 && (
            <nav aria-label="후기 쪽 이동" className="mt-8 flex items-center justify-between gap-3 text-[14px]">
              {data.page > 1 ? (
                <Link href={hrefFor(group, data.page - 1)} className={buttonSecondary}>
                  이전
                </Link>
              ) : (
                <span aria-hidden="true" className="w-20" />
              )}
              <span className="tabular-nums text-ink-3">
                {data.page} / {data.pages}
              </span>
              {data.page < data.pages ? (
                <Link href={hrefFor(group, data.page + 1)} className={buttonSecondary}>
                  다음
                </Link>
              ) : (
                <span aria-hidden="true" className="w-20" />
              )}
            </nav>
          )}
        </>
      )}
      <p className="mt-8 max-w-[42rem] text-[13px] leading-[1.7] text-ink-3">
        {REVIEW_PUBLIC_NOTES.noAi} 개인정보가 보이거나 문제가 있는 후기는 후기 아래의 &lsquo;신고&rsquo;로 알려 주세요. 내용이 마음에 들지 않는다는 이유만으로 후기를 내리지는 않아요.
      </p>
    </>
  );
}
