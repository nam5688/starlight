import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReviewsPreview } from "@/components/dev/reviews-preview";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageWide } from "@/components/ui/styles";

export const metadata: Metadata = { title: "후기 화면 미리보기 · ME:U 미유", robots: { index: false, follow: false } };

/**
 * 개발용 — 내 컴퓨터에서만 열린다(공개 배포에서는 열리지 않는다). 후기 화면(홈 영역 · 전체 후기 · MY · 관리자)의 모양을 가상 문구로 확인한다. 아무것도 저장하거나 기록하지 않는다.
 * 실제 홈 · /reviews에는 가짜 후기를 절대 넣지 않는다 — 이 화면의 글은 모두 "[가상 문구]"로 시작한다.
 */
export default function DevReviewsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="bg-page">
      <div className={`${pageWide} py-10 md:py-14`}>
        <StatusBadge>개발용 · 내 컴퓨터에서만 열림</StatusBadge>
        <h1 className="mt-3 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">후기 화면 미리보기</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          <b>화면 디자인용 가상 문구 · 실제 후기가 아닙니다.</b> 글 · 별점 · 숫자는 모양을 보기 위해 정한 값이고, 이 화면의 버튼은 아무것도 저장하거나 바꾸지 않습니다. 실제 화면은 홈(<code>/</code>) · <code>/reviews</code> · <code>/my/reviews</code> · <code>/admin/reviews</code>이며 공개에 동의한 실제 후기만 서버에서 읽어 보여 줍니다.
        </p>
        <ReviewsPreview />
      </div>
    </main>
  );
}
