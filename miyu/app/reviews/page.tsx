import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { reportReviewAction } from "@/app/reviews/actions";
import { ReviewsList } from "@/components/reviews/reviews-list";
import { PageFallback } from "@/components/ui/page-fallback";
import { pageWide, textLink } from "@/components/ui/styles";
import { parseGroup, REVIEW_PUBLIC_NOTES } from "@/lib/commerce/reviews";
import { publicReviewsPage, type PublicReviewsPage } from "@/lib/services/review-service";
import { isAuthConfigured } from "@/server/env";
import { logError } from "@/server/ops";
import { reviewRepository } from "@/server/services";

// 후기는 이용자가 공개에 동의한 글이다. 후기가 하나도 없는 동안에는 검색에 나오지 않게 둔다(내용이 없는 화면을 검색에 올리지 않는다).
export const metadata: Metadata = { title: "이용 후기 · ME:U 미유", robots: { index: false, follow: true } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * 전체 후기 — 공개에 동의한 후기만(공개 중 + 동의), 최신순. 종류별(개인 리포트 · 궁합 · 미유 채팅)로 나눠 볼 수 있다.
 * 운영자가 고른 후기도 여기서는 순서를 바꾸지 않는다(모든 공개 후기를 같은 기준으로 보여 준다). 가짜 후기로 채우지 않는다.
 */
export default function ReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="bg-page">
      <div className={`${pageWide} py-10 md:py-14`}>
        <Link href="/" className={`${textLink} text-[15px]`}>
          ← 홈
        </Link>
        <h1 className="mt-3 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">이용 후기</h1>
        <p className="mt-2 max-w-[42rem] text-[15px] leading-[1.7] text-ink-2">
          {REVIEW_PUBLIC_NOTES.source} 질문권 보상을 받고 쓴 후기와 무료로 체험하고 쓴 후기에는 그 사실이 후기마다 표시돼요. 별점보다 어떤 점이 어땠는지 쓴 글을 읽어 보세요.
        </p>
        <Suspense fallback={<PageFallback className="mt-8" />}>
          <ReviewsContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function ReviewsContent({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // 후기는 요청 때마다 읽는다
  const params = await searchParams;
  const group = parseGroup(first(params.kind));
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  let data: PublicReviewsPage = { reviews: [], total: 0, page: 1, pages: 1, group };
  try {
    if (isAuthConfigured()) data = await publicReviewsPage(reviewRepository(), { group, page: Number.isFinite(page) ? page : 1 });
  } catch (e) {
    logError("reviews.public", e);
  }
  return <ReviewsList data={data} reportAction={reportReviewAction} />;
}
