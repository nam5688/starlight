import "server-only";
import type { PairReviewEligibility, ReviewDeps } from "@/lib/services/review-service";
import { createPairReviewEligibility } from "@/lib/services/pair-review";
import { benefitRepository, now, pairRepository, reviewRepository, writeRepository } from "./services";

/**
 * 이용 후기 서비스가 쓰는 구현체 묶음. 리포트 궁합 후기의 자격(pair)은 결제한 사람의 이용 건 하나(결제 완료 · 리포트 완성 · 환불 아님 · 철회하지 않음)만 돌려준다 —
 * 규칙은 lib/services/pair-review.ts. 쌍 표(DB 24번)가 없으면 리포트 궁합 후기만 없는 것으로 본다.
 */
export function reviewDeps(): ReviewDeps {
  const repo = writeRepository();
  const benefits = benefitRepository();
  const pair: PairReviewEligibility = createPairReviewEligibility({ repo, pairs: pairRepository(), benefits });
  return { repo, reviews: reviewRepository(), benefits, pair, now };
}
