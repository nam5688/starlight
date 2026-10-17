import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { reviewAdminAction, reviewRetryRewardsAction } from "@/app/admin/reviews/actions";
import { first, type SearchParamsLike } from "@/components/admin/benefits/href";
import { ReviewsAdminView } from "@/components/admin/reviews/reviews-admin-view";
import { PageFallback } from "@/components/ui/page-fallback";
import { pageWide, textLink } from "@/components/ui/styles";
import { isReviewKind, REVIEW_KINDS, type ReviewKind, type ReviewStatus } from "@/lib/commerce/reviews";
import { getReviewAdminList, getReviewStats, listReviewActionLog, scanPublicReviews } from "@/lib/services/review-admin-service";
import { getAdminMember } from "@/server/member";
import { logError } from "@/server/ops";
import { reviewDeps } from "@/server/reviews";

export const metadata: Metadata = { title: "후기 관리 · 관리자 · ME:U 미유", robots: { index: false, follow: false } };

const STATUSES: readonly ReviewStatus[] = ["published", "private", "hidden", "deleted"];

export default function ReviewsAdminPage({ searchParams }: { searchParams: Promise<SearchParamsLike> }) {
  return (
    <main className={`${pageWide} py-10 md:py-14`}>
      <p className="text-[14px]">
        <Link href="/admin" className={textLink}>
          관리자
        </Link>
      </p>
      <h1 className="mt-2 text-[26px] font-bold tracking-tight">후기 관리</h1>
      <Suspense fallback={<PageFallback className="mt-6" />}>
        <ReviewsAdminContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** 한 부분을 읽다 실패하면(표가 일부만 있는 DB 등) 오류는 서버 기록에만 남기고 null을 돌려준다 */
async function load<T>(where: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    logError(`admin.reviews.${where}`, e);
    return null;
  }
}

async function ReviewsAdminContent({ searchParams }: { searchParams: Promise<SearchParamsLike> }) {
  await connection();
  // 관리자가 아니면 화면이 있다는 사실도 알리지 않는다(/admin과 같다)
  if (!(await getAdminMember())) notFound();
  const params = await searchParams;
  const rawStatus = first(params.status);
  const status = STATUSES.find((s) => s === rawStatus);
  const rawKind = first(params.kind);
  const kind: ReviewKind | undefined = rawKind && isReviewKind(rawKind) && REVIEW_KINDS.includes(rawKind) ? rawKind : undefined;
  const reported = first(params.reported) === "1";
  const daysRaw = Number.parseInt(first(params.days) ?? "30", 10);
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const pageNo = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);
  const note = (first(params.note) ?? "").slice(0, 200);

  const query: Record<string, string> = {};
  if (status) query.status = status;
  if (kind) query.kind = kind;
  if (reported) query.reported = "1";
  if (first(params.days)) query.days = String(days);
  if (pageNo > 1) query.page = String(pageNo);
  const hrefFor = (patch: Record<string, string | number | null>) => {
    const merged: Record<string, string> = { ...query };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete merged[k];
      else merged[k] = String(v);
    }
    const qs = new URLSearchParams(merged).toString();
    return qs ? `/admin/reviews?${qs}` : "/admin/reviews";
  };

  const deps = reviewDeps();
  const [list, stats, scan, log] = await Promise.all([
    load("list", () => getReviewAdminList(deps, { status, kind, reportedOnly: reported, page: pageNo })),
    load("stats", () => getReviewStats(deps, { sinceDays: days })),
    load("scan", () => scanPublicReviews(deps.reviews)),
    load("log", () => listReviewActionLog(deps.reviews, 50)),
  ]);
  return <ReviewsAdminView note={note} stats={stats} list={list} scan={scan} log={log} filters={{ status, kind, reported, days, page: pageNo }} hrefFor={hrefFor} actions={{ apply: reviewAdminAction, retryRewards: reviewRetryRewardsAction }} />;
}
