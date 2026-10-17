// 리포트 궁합 후기의 이용 건 확인 — 후기 서비스(review-service.ts)의 PairReviewEligibility를 리포트 궁합 쪽 규칙으로 채운다.
// 규칙: 후기는 **결제한 사람의 이용 건 하나**에만 쓸 수 있다(결제 완료 + 리포트 완성 + 환불 아님 + 그 사람이 지금도 글을 읽을 수 있음). 이용 건 번호는 쌍의 결제 주문 번호다.
//   · 상대(결제하지 않은 사람)는 같은 글을 읽어도 후기 · 보상 대상이 아니다 — 구매 한 건에 보상은 한 번이다.
//   · 동의를 철회해 글을 더 읽을 수 없는 결제자도 쓸 수 없다. 환불되면 쓸 수 없다.
//   · 혜택으로 받은 0원 주문(체험단 · 쿠폰)은 개인 리포트 · 사주 궁합과 같이 "무료 체험"이고 보상은 쿠폰의 후기 보상 허용이 있을 때만이다.
import { isPairProduct, parsePairProductId, productNameOf } from "../config/product.ts";
import { isPairReport } from "../report/compat/types.ts";
import type { BenefitRepository } from "./benefit-ports.ts";
import { canReadPairReport, pairOrders } from "./pair-service.ts";
import type { PairRecord, PairRepository } from "./pair-ports.ts";
import type { MiyuRepository, OrderRecord } from "./ports.ts";
import type { PairReviewEligibility, ReviewSubject } from "./review-service.ts";

const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";

export function createPairReviewEligibility(deps: { repo: MiyuRepository; pairs: PairRepository; benefits: BenefitRepository }): PairReviewEligibility {
  async function subjectOf(pair: PairRecord, order: OrderRecord, userId: string): Promise<ReviewSubject | null> {
    if (order.userId !== userId || order.status !== "paid") return null;
    if (canReadPairReport(pair, userId, order) !== "ok") return null;
    const report = await deps.repo.getReportByOrder(order.id);
    if (report?.status !== "ready" || !isPairReport(report.content)) return null;
    let freeTrial = false;
    let rewardEligible = true;
    if (order.provider === "benefit") {
      freeTrial = true;
      const grant = await deps.benefits.getBenefitGrant(order.id).catch(() => null);
      rewardEligible = Boolean(grant?.reviewRewardEligible);
    }
    return { kind: "pair_compat", subjectRef: order.id, title: productNameOf(order.productId), at: order.approvedAt ?? order.createdAt, freeTrial, rewardEligible };
  }
  return {
    async list(userId) {
      try {
        const out: ReviewSubject[] = [];
        for (const pair of await deps.pairs.listPairsForUser(userId)) {
          const paid = (await pairOrders(deps.repo, pair)).find((o) => o.status === "paid" && o.userId === userId);
          const s = paid ? await subjectOf(pair, paid, userId) : null;
          if (s) out.push(s);
        }
        return out;
      } catch (e) {
        if (isMissingTable(e)) return [];
        throw e;
      }
    },
    async find(userId, subjectRef) {
      try {
        const order = await deps.repo.getOrderById(subjectRef);
        if (!order || !isPairProduct(order.productId) || order.userId !== userId) return null;
        const pairId = parsePairProductId(order.productId);
        const pair = pairId ? await deps.pairs.getPair(pairId) : null;
        if (!pair || (pair.aUserId !== userId && pair.bUserId !== userId)) return null;
        return await subjectOf(pair, order, userId);
      } catch (e) {
        if (isMissingTable(e)) return null;
        throw e;
      }
    },
  };
}
