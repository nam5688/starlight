import { couponsVisible, pointsVisible, readyOverview, referralVisible } from "@/components/my/benefits/visibility";
import type { HubItem, StatCardData } from "@/components/my/my-hub";
import { ChatBubbleIcon, DocumentIcon, GiftIcon, PairIcon, PencilIcon, TicketIcon } from "@/components/ui/icons";
import type { BenefitOverview } from "@/lib/services/benefit-service";

// MY 첫 부분에 무엇이 보이는지 정하는 규칙 — 실제 /my 화면과 개발용 미리보기(/dev/my-preview)가 같은 함수를 쓴다.

/** 숫자 카드: 포인트(조건이 맞을 때만) + 남은 질문권(보상 질문권 + 결제해 둔 질문, 합이 0이면 0개) */
export function hubCards(overview: BenefitOverview | null, paidQuestions: number): StatCardData[] {
  const o = readyOverview(overview);
  const cards: StatCardData[] = [];
  if (o && pointsVisible(o)) {
    cards.push({ label: "미유 포인트", value: o.points.balance, unit: "P", linkLabel: "포인트 내역", href: "/my/benefits#points" });
  }
  cards.push({
    label: "남은 질문권",
    value: (o ? o.credits.balance : 0) + paidQuestions,
    unit: "개",
    linkLabel: "질문권 내역",
    // 혜택 기능을 아직 쓸 수 없으면 보여 줄 내역이 없으므로 눌리지 않는 카드로 둔다(결제해 둔 질문 수는 그대로 보인다)
    href: o ? "/my/benefits#credits" : null,
  });
  return cards;
}

/** 바로가기 목록 — "내가 작성한 리뷰"는 이용 건마다 후기를 쓰고 고치는 화면(/my/reviews)이다. 후기 표(DB 25번)가 없으면 그 화면이 "준비 중"으로 안내한다 */
export function hubItems(overview: BenefitOverview | null, reportCount: number): HubItem[] {
  const o = readyOverview(overview);
  const items: HubItem[] = [
    { id: "reports", title: "내 리포트", description: reportCount > 0 ? `보관 중 ${reportCount}개 · 이어 읽기` : "저장한 결과가 아직 없어요", href: "#my-list", icon: <DocumentIcon /> },
    {
      id: "compat",
      title: "우리의 궁합",
      description: "간단 궁합은 무료로 해볼 수 있어요",
      href: "/compat",
      note: "사주 궁합 · 리포트 궁합은 준비 중이에요",
      icon: <PairIcon />,
    },
    { id: "chats", title: "미유와 대화하기", description: "지난 상담 이어보기", href: "/my/chats", icon: <ChatBubbleIcon /> },
    { id: "reviews", title: "내가 작성한 리뷰", description: "이용한 리포트 · 궁합 · 상담에 후기 남기기", href: "/my/reviews", icon: <PencilIcon /> },
  ];
  if (o && referralVisible(o)) {
    const f = o.settings.features;
    items.push({
      id: "invite",
      title: "친구 초대",
      description: f.referral_signup_points ? "추천 링크 · 포인트 보상" : f.referral_purchase_credits ? "추천 링크 · 질문권 보상" : "추천 링크 · 친구 혜택",
      href: "/my/benefits#invite",
      icon: <GiftIcon />,
    });
  }
  if (o && couponsVisible(o)) {
    items.push({ id: "coupons", title: "쿠폰 · 혜택", description: "쿠폰 코드 입력 · 사용 내역", href: "/my/benefits#coupons", icon: <TicketIcon /> });
  }
  return items;
}
