import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { BenefitNotice, PriceQuoteView } from "@/components/results/price-options";
import { PurchasePanel } from "@/components/results/purchase-panel";
import { StatusBadge } from "@/components/ui/source-badge";
import { pageNarrow } from "@/components/ui/styles";
import { buildQuote, type CouponCheck, type ReferralCheck } from "@/lib/commerce/benefits";
import type { InviteQuote } from "@/lib/services/invite-service";
import type { ResultView } from "@/lib/services/report-service";

export const metadata: Metadata = { title: "결제 전 가격 선택지 확인 · ME:U 미유", robots: { index: false } };

const LIST = 9900;
const ASSESSMENT_ID = "00000000-0000-4000-8000-000000000000";

/** 구매 영역이 읽는 것만 채운 가상 결과(구매 전) — 개발용 미리보기에서만 쓴다 */
const FAKE_VIEW = { assessment: { id: ASSESSMENT_ID }, paidOrder: null, refunded: false, report: null } as unknown as ResultView;

const REFERRAL: ReferralCheck = { ok: true, price: 6900, inviterUserId: "dev-inviter" };
const couponOk = (type: string, value: number, name: string, stackableWithReferral = false): CouponCheck => ({
  ok: true,
  couponId: "dev-coupon",
  type,
  value,
  purpose: "promo",
  stackableWithReferral,
  creditExpireDays: null,
  name,
});

type Case = {
  id: string;
  title: string;
  note: string;
  quote: PriceQuoteView | null;
  notice?: BenefitNotice | null;
  paymentsReady?: boolean;
  invite?: InviteQuote | null;
};

const view = (input: Parameters<typeof buildQuote>[0], extra: Partial<Omit<PriceQuoteView, "quote">> = {}): PriceQuoteView => ({
  quote: buildQuote(input),
  couponCode: input.coupon?.code ?? null,
  pointBalance: input.points ? input.points.balance : null,
  couponsEnabled: false,
  ...extra,
});

const CASES: Case[] = [
  {
    id: "p1",
    title: "1. 정가만 · 혜택이 모두 꺼짐(지금과 같은 화면)",
    note: "혜택 설정이 모두 꺼져 있고 쿠폰 입력도 없으면 선택지 조각을 쓰지 않고 예전 구매 영역 그대로 보여요.",
    quote: view({ listKrw: LIST, referral: null, coupon: null, points: null }),
  },
  {
    id: "p2",
    title: "2. 정가만 · 쿠폰 입력만 켜짐",
    note: "쿠폰 기능이 켜져 있으면 정가 버튼 아래에 쿠폰 입력이 생겨요.",
    quote: view({ listKrw: LIST, referral: null, coupon: null, points: null }, { couponsEnabled: true }),
  },
  {
    id: "p3",
    title: "3. 친구 추천 가격(적격)",
    note: "정가와 추천 가격을 함께 보여요. 정가 결제는 아래에 작게 따로 있어요.",
    quote: view({ listKrw: LIST, referral: REFERRAL, coupon: null, points: null }),
  },
  {
    id: "p4",
    title: "4. 쿠폰이 맞음(정액 쿠폰)",
    note: "코드를 적용하면 쿠폰 가격 선택지가 생겨요.",
    quote: view({ listKrw: LIST, referral: null, coupon: { code: "WELCOME2000", check: couponOk("amount", 2000, "신규 환영 쿠폰") }, points: null }, { couponsEnabled: true }),
  },
  {
    id: "p5",
    title: "5. 쿠폰이 맞지 않음(사유 + 정가 확인)",
    note: "사유는 입력칸 아래에, 정가 결제는 고객이 확인하고 누르는 별도 버튼이에요.",
    quote: view({ listKrw: LIST, referral: null, coupon: { code: "SOLDOUT01", check: { ok: false, reason: "sold-out" } }, points: null }, { couponsEnabled: true }),
  },
  {
    id: "p6",
    title: "6. 쓸 수 있는 혜택이 둘 이상(고르기)",
    note: "추천 가격과 쿠폰이 함께 적격이지만 겹쳐 쓸 수 없는 쿠폰이라 고객이 하나를 골라요.",
    quote: view({ listKrw: LIST, referral: REFERRAL, coupon: { code: "SPRING10", check: couponOk("percent", 10, "봄맞이 10%") }, points: null }, { couponsEnabled: true }),
  },
  {
    id: "p7",
    title: "7. 추천 가격과 쿠폰을 함께 쓸 수 있는 경우(선택지 셋)",
    note: "겹쳐 쓸 수 있는 쿠폰이면 '추천 가격 + 쿠폰' 선택지가 따로 생기고, 자동으로 합쳐지지는 않아요.",
    quote: view({ listKrw: LIST, referral: REFERRAL, coupon: { code: "STACK1000", check: couponOk("amount", 1000, "함께 쓰는 쿠폰", true) }, points: null }, { couponsEnabled: true }),
  },
  {
    id: "p8",
    title: "8. 0원 쿠폰(무료 이용권)",
    note: "결제창 없이 바로 받는 선택지예요.",
    quote: view({ listKrw: LIST, referral: null, coupon: { code: "FREEPASS", check: couponOk("free-product", 0, "무료 이용권") }, points: null }, { couponsEnabled: true }),
  },
  {
    id: "p9",
    title: "9. 포인트 교환 가능",
    note: "현금 가격과 따로 보여요. 포인트는 원으로 쓰지 않아요.",
    quote: view({ listKrw: LIST, referral: null, coupon: null, points: { price: 11900, balance: 13200 } }),
  },
  {
    id: "p10",
    title: "10. 포인트가 모자람",
    note: "교환 버튼 없이 모자라는 양만 한 줄로 알려요.",
    quote: view({ listKrw: LIST, referral: null, coupon: null, points: { price: 11900, balance: 3400 } }),
  },
  {
    id: "p11",
    title: "11. 서버 오류(견적을 만들지 못함)",
    note: "'할인을 쓸 수 없다'가 아니라 오류로 알리고, 정가 구매 버튼은 계속 쓸 수 있어요. 정가 주문은 만들지 않았다고 밝혀요.",
    quote: null,
    notice: { kind: "error" },
  },
  {
    id: "p12",
    title: "12. 결제 연결 전 + 추천 가격 + 포인트 교환 가능",
    note: "현금 결제 선택지는 비활성(이유 한 줄), 결제창을 거치지 않는 포인트 교환은 그대로 쓸 수 있어요.",
    quote: view({ listKrw: LIST, referral: REFERRAL, coupon: null, points: { price: 11900, balance: 13200 } }),
    paymentsReady: false,
  },
  {
    id: "p13",
    title: "13. 추천 가격은 거절 + 쿠폰은 맞음",
    note: "할인 선택지가 먼저, 사유와 정가 확인 버튼은 아래에 작게 따로 있어요.",
    quote: view({ listKrw: LIST, referral: { ok: false, reason: "used" }, coupon: { code: "WELCOME2000", check: couponOk("amount", 2000, "신규 환영 쿠폰") }, points: null }, { couponsEnabled: true }),
  },
  {
    id: "p14",
    title: "14. 결제를 시작하려다 되돌아온 알림(적용 실패)",
    note: "주소의 ?benefit=denied&reason=sold-out 로 되돌아온 경우예요. 결제는 시작하지 않았다고 알려요.",
    quote: view({ listKrw: LIST, referral: null, coupon: { code: "SOLDOUT01", check: { ok: false, reason: "sold-out" } }, points: null }, { couponsEnabled: true }),
    notice: { kind: "denied", reason: "sold-out" },
  },
  {
    id: "p15",
    title: "15. 고를 선택지가 둘 이상이라 되돌아온 알림",
    note: "?benefit=choose 로 되돌아온 경우예요.",
    quote: view({ listKrw: LIST, referral: REFERRAL, coupon: { code: "SPRING10", check: couponOk("percent", 10, "봄맞이 10%") }, points: null }, { couponsEnabled: true }),
    notice: { kind: "choose" },
  },
  {
    id: "p16",
    title: "16. 예전 초대 링크 할인(혜택 꺼짐 · 지금과 같은 화면)",
    note: "예전 초대 링크 할인은 혜택이 꺼져 있을 때 지금과 똑같이 보여요(가상 값, 옛 정책 가격).",
    quote: view({ listKrw: LIST, referral: null, coupon: null, points: null }),
    invite: { kind: "eligible", priceKrw: 5900, listKrw: LIST },
  },
];

/** 개발용 — 내 컴퓨터에서만 열린다(공개 배포에서는 열리지 않는다). 결제 전 가격 선택지의 모양을 가상 견적으로 나열한다. 아무것도 저장하지 않는다 */
export default function DevCheckoutPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="bg-page pb-16">
      <div className={`${pageNarrow} py-12 md:py-16`}>
        <StatusBadge>개발용 · 내 컴퓨터에서만 열림</StatusBadge>
        <h1 className="mt-3 text-[26px] font-bold tracking-tight md:text-[30px]">결제 전 가격 선택지 확인</h1>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-2">
          결과 화면 아래 구매 영역에 들어가는 가격 선택지의 모양입니다. <b>가상 값이며 실제 값이 아닙니다.</b> 실제 화면의 금액 · 자격은 서버가 매번 다시 만든 견적으로만 정하고, 여기서는 그 견적을 직접 적어 모양만 보여 줘요. 버튼은 이 화면에서 동작하지 않아도 됩니다(눌러도 아무것도 결제되지 않아요).
        </p>
      </div>
      <div className="space-y-14">
        {CASES.map((c) => (
          <section key={c.id} aria-labelledby={`${c.id}-title`}>
            <div className={`${pageNarrow} pb-3`}>
              <h2 id={`${c.id}-title`} className="text-[15px] font-semibold text-ink-2">
                {c.title}
              </h2>
              <p className="mt-0.5 text-[13px] leading-[1.7] text-ink-3">{c.note}</p>
            </div>
            <div className="mx-auto w-full max-w-[720px] px-5">
              <PurchasePanel
                idPrefix={`${c.id}-`}
                view={FAKE_VIEW}
                included={["상세 풀이(가상)"]}
                paymentsReady={c.paymentsReady ?? true}
                paymentsNote={c.paymentsReady === false ? "결제 연결 전이에요(가상 값)." : null}
                invite={c.invite ?? null}
                quote={c.quote}
                benefitNotice={c.notice ?? null}
              />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
