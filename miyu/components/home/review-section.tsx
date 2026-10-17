import { connection } from "next/server";
import { ReviewSectionView } from "@/components/home/review-section-view";
import { homeReviews, type HomeReviews } from "@/lib/services/review-service";
import { isAuthConfigured } from "@/server/env";
import { reviewRepository } from "@/server/services";

/**
 * 홈의 "실제 이용 후기" 구역(운영자 요청 2026-10-17) — 첫 소개 · 궁합 · 상담 주제 아래, 리포트 예시 · 가격 위.
 * **공개 후기가 없으면 아무것도 그리지 않는다**(제목도 · 빈 상태도 없다) — 가짜 후기로 채우지 않는다. 화면 디자인 확인용 가상 문구는 `/dev/reviews-preview`에만 있다.
 * 공개에 동의한 후기만 최대 6개(운영자가 고른 후기가 먼저, 아니면 최신순 — 별점 · 긍정 · 부정으로 고르지 않는다)와 [전체 후기 보기]. 대가(질문권 보상 · 무료 체험) 표시는 후기마다 보인다.
 * DB가 연결되지 않았거나 후기 표가 없거나(DB 25번 전) 읽다가 오류가 나도 이 구역만 사라지고 홈은 그대로다.
 */
export async function ReviewSection() {
  await connection(); // 후기는 요청 때마다 읽는다 — 홈 전체를 요청마다 새로 그리지 않고 이 구역만
  let data: HomeReviews = { reviews: [], total: 0 };
  try {
    if (isAuthConfigured()) data = await homeReviews(reviewRepository());
  } catch {
    // 저장소를 만들지 못해도(환경 설정 전) 홈은 그대로 — 후기 영역만 보이지 않는다
  }
  return <ReviewSectionView reviews={data.reviews} total={data.total} />;
}
