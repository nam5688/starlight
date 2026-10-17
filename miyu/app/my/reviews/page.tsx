import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { deleteReviewAction, saveReviewAction, setReviewVisibilityAction } from "@/app/my/reviews/actions";
import { LoginOptions } from "@/components/auth/login-options";
import { MyReviewsBody } from "@/components/reviews/my-reviews-view";
import { PageFallback } from "@/components/ui/page-fallback";
import { textLink } from "@/components/ui/styles";
import { isReviewDoneCode, isReviewKind, REVIEW_DONE_TEXT } from "@/lib/commerce/reviews";
import { getMyReviewsView } from "@/lib/services/review-service";
import { isAuthConfigured } from "@/server/env";
import { consentPath, getMember } from "@/server/member";
import { logError } from "@/server/ops";
import { reviewDeps } from "@/server/reviews";

export const metadata: Metadata = { title: "내가 작성한 리뷰 · ME:U 미유", robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function MyReviewsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="bg-page">
      <div className="mx-auto w-full max-w-[720px] px-5 py-8 md:py-12">
        <Link href="/my" className={`${textLink} text-[15px]`}>
          ← MY
        </Link>
        <h1 className="mt-3 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">내가 작성한 리뷰</h1>
        <Suspense fallback={<PageFallback className="mt-8" />}>
          <MyReviewsContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function MyReviewsContent({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // 환경변수 · 로그인 상태를 요청 때마다 확인한다
  const params = await searchParams;
  if (!isAuthConfigured()) {
    return <p className="mt-8 text-[16px] leading-[1.7] text-ink-2">로그인이 아직 설정되지 않아 후기를 볼 수 없어요.</p>;
  }
  const kind = first(params.kind);
  const ref = first(params.ref);
  const here = kind && ref && /^[0-9a-f-]{36}$/i.test(ref) && isReviewKind(kind) ? `/my/reviews?kind=${kind}&ref=${ref}` : "/my/reviews";
  const member = await getMember();
  if (!member) {
    return (
      <div className="mt-8">
        <p className="text-[17px] font-semibold">로그인하고 내 후기를 확인하세요</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">후기는 로그인한 계정의 이용 건에만 쓸 수 있어요.</p>
        <div className="mt-6">
          <LoginOptions next={here} />
        </div>
      </div>
    );
  }
  if (member.needsConsent) redirect(consentPath(here));

  // 후기는 서버가 본인 회원번호로만 읽는다. 읽지 못하면(오류) 다시 시도하라고 알린다
  let view;
  try {
    view = await getMyReviewsView(reviewDeps(), member.userId);
  } catch (e) {
    logError("my.reviews", e);
    return <p className="mt-8 text-[16px] leading-[1.7] text-ink-2">후기 정보를 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.</p>;
  }
  const doneParam = first(params.done);
  const done = isReviewDoneCode(doneParam) ? doneParam : null;
  return (
    <>
      {done && (
        <p role="status" className={`mt-5 rounded-xl px-4 py-3 text-[15px] leading-[1.6] font-medium ${done === "error" ? "bg-caution-soft text-caution" : "bg-positive-soft text-positive"}`}>
          {REVIEW_DONE_TEXT[done]}
        </p>
      )}
      <MyReviewsBody view={view} actions={{ save: saveReviewAction, visibility: setReviewVisibilityAction, remove: deleteReviewAction }} open={kind && ref ? { kind, ref: ref.toLowerCase() } : null} />
    </>
  );
}
