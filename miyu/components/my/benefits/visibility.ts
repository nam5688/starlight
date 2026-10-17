import type { BenefitOverview } from "@/lib/services/benefit-service";

// 허브(/my)의 카드 · 줄과 /my/benefits의 구역이 같은 기준으로 보이고 숨겨지게 한 곳에 둔다.
// 혜택 표가 아직 없는 DB(ready: false)에서는 아무 혜택도 보이지 않고, 기능이 꺼져 있으면 그 구역은 보이지 않는다.

type Ready = BenefitOverview & { ready: true };

/** 혜택을 읽을 수 있는 상태일 때만 overview를 돌려준다(읽지 못했거나 DB 변경 전이면 null) */
export function readyOverview(overview: BenefitOverview | null): Ready | null {
  return overview && overview.ready ? (overview as Ready) : null;
}

/** 포인트: 적립 · 교환 중 하나가 켜져 있거나, 이미 받은 포인트가 남아 있을 때 (0 P 카드로 헷갈리게 하지 않는다) */
export function pointsVisible(overview: BenefitOverview | null): boolean {
  const o = readyOverview(overview);
  if (!o) return false;
  const f = o.settings.features;
  return f.points_earn || f.points_spend || o.points.balance > 0;
}

export function referralVisible(overview: BenefitOverview | null): boolean {
  return Boolean(readyOverview(overview)?.settings.features.referral);
}

export function couponsVisible(overview: BenefitOverview | null): boolean {
  return Boolean(readyOverview(overview)?.settings.features.coupons);
}
