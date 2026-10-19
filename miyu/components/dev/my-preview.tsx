"use client";

import type { ReactNode } from "react";
import type { BenefitFormState } from "@/app/my/benefits/actions";
import { BenefitsView } from "@/components/my/benefits/benefits-view";
import type { BenefitAction } from "@/components/my/benefits/form-message";
import { MyHeader, MyHubList, MyStatCards } from "@/components/my/my-hub";
import { OrdersFold } from "@/components/my/orders-fold";
import { hubCards, hubItems } from "@/components/my/my-hub-data";
import { BENEFIT_FEATURES, COUPON_REASON_TEXT, DEFAULT_BENEFIT_SETTINGS, type BenefitFeature, type BenefitSettings } from "@/lib/commerce/benefits";
import type { BenefitOverview } from "@/lib/services/benefit-service";
import type { MyOrderRow } from "@/lib/services/my-service";

// 개발용 미리보기 — MY 허브 첫 부분과 /my/benefits의 모든 상태를 가상 값으로 한 화면에 보여 준다.
// 실제 화면과 같은 조각 · 같은 규칙(hubCards · hubItems · BenefitsView)을 쓰며, 서버 동작 대신 아무것도 바꾸지 않는 동작을 넘긴다. 값은 모두 고정 문자열이다(렌더마다 달라지지 않는다).

const noopAction: BenefitAction = async () => ({ ok: false, message: "개발용 미리보기에서는 동작하지 않아요." });

const features = (on: BenefitFeature[]): BenefitSettings["features"] => Object.fromEntries(BENEFIT_FEATURES.map((f) => [f, on.includes(f)])) as BenefitSettings["features"];
const withFeatures = (on: BenefitFeature[]): BenefitSettings => ({ ...DEFAULT_BENEFIT_SETTINGS, features: features(on) });

const EMPTY: Omit<BenefitOverview, "ready" | "settings"> = {
  points: { balance: 0, lots: [], expiringSoon: null, recent: [] },
  credits: { balance: 0, lots: [], recent: [] },
  coupons: { history: [] },
  referral: { link: null, overview: null },
  tier: { cumulativeKrw: 0, rate: 0.03, next: { fromKrw: 300_000, rate: 0.05, remainingKrw: 300_000 } },
};

const SOON = "2026-11-03T05:12:00.000Z";

/** 결제내역 접힘 미리보기용 가상 주문 — 실제 주문이 아니다 */
const FAKE_ORDERS: MyOrderRow[] = [
  { orderNumber: "MEU-00000000-PREVIEW01", productName: "심층 리포트", amount: 9900, status: "paid", statusLabel: "결제 완료", paymentEnv: "live", approvedAt: "2026-10-19T03:00:00.000Z", createdAt: "2026-10-19T02:58:00.000Z", assessmentId: "preview" },
  { orderNumber: "MEU-00000000-PREVIEW02", productName: "유료 질문 3개", amount: 2500, status: "pending", statusLabel: "결제 대기", paymentEnv: "test", approvedAt: null, createdAt: "2026-10-18T02:58:00.000Z", assessmentId: "preview" },
];

/** A. 모두 켜짐 · 소멸 임박 · 회수 못한 몫 · 초대 링크 있음 */
const FULL: BenefitOverview = {
  ready: true,
  settings: withFeatures([...BENEFIT_FEATURES]),
  points: {
    balance: 1250,
    lots: [
      { remaining: 500, expiresAt: SOON, daysLeft: 17, sourceLabel: "referral_signup" },
      { remaining: 450, expiresAt: "2027-02-20T03:00:00.000Z", daysLeft: 126, sourceLabel: "purchase" },
      { remaining: 300, expiresAt: "2027-09-01T00:00:00.000Z", daysLeft: 319, sourceLabel: "event" },
    ],
    expiringSoon: { amount: 500, expiresAt: SOON },
    recent: [
      { id: 6, kind: "earn", amount: 297, shortfall: 0, createdAt: "2026-10-12T02:00:00.000Z" },
      { id: 5, kind: "clawback", amount: -200, shortfall: 100, createdAt: "2026-10-10T02:00:00.000Z" },
      { id: 4, kind: "spend", amount: -11900, shortfall: 0, createdAt: "2026-09-21T02:00:00.000Z" },
      { id: 3, kind: "spend_restore", amount: 11900, shortfall: 0, createdAt: "2026-09-21T03:00:00.000Z" },
      { id: 2, kind: "expire", amount: -120, shortfall: 0, createdAt: "2026-08-01T00:00:00.000Z" },
      { id: 1, kind: "earn", amount: 500, shortfall: 0, createdAt: "2026-08-01T00:00:00.000Z" },
    ],
  },
  credits: {
    balance: 3,
    lots: [
      { kind: "referral_invitee", remaining: 1, expiresAt: "2026-12-01T00:00:00.000Z", daysLeft: 45 },
      { kind: "review", remaining: 2, expiresAt: "2027-10-01T00:00:00.000Z", daysLeft: 349 },
    ],
    recent: [
      { id: 4, kind: "revoke", qty: -1, shortfall: 1, createdAt: "2026-10-11T00:00:00.000Z" },
      { id: 3, kind: "spend", qty: -1, shortfall: 0, createdAt: "2026-10-09T00:00:00.000Z" },
      { id: 2, kind: "grant", qty: 2, shortfall: 0, createdAt: "2026-10-01T00:00:00.000Z" },
      { id: 1, kind: "grant", qty: 1, shortfall: 0, createdAt: "2026-09-21T00:00:00.000Z" },
    ],
  },
  coupons: {
    history: [
      { id: "c3", code: "WELCOME-TEST", name: "가입 환영 질문권", status: "used", createdAt: "2026-10-09T00:00:00.000Z" },
      { id: "c2", code: "REPORT-1000", name: "심층 리포트 1,000원 할인", status: "reserved", createdAt: "2026-10-05T00:00:00.000Z" },
      { id: "c1", code: "SPRING-TEST", name: "봄맞이 할인", status: "released", createdAt: "2026-09-01T00:00:00.000Z" },
    ],
  },
  referral: { link: { token: "AbCdEfGhIjKlMnOpQrStUvWx" }, overview: { signups: 5, byStatus: { confirmed: 2, pending: 2, review: 1 }, firstPurchases: 1, visits: 18 } },
  tier: { cumulativeKrw: 99_000, rate: 0.03, next: { fromKrw: 300_000, rate: 0.05, remainingKrw: 201_000 } },
};

/** B. 초대 링크 아직 없음 · 포인트 내역 없음(적립은 켜짐) · 쿠폰 오류 */
const NO_LINK: BenefitOverview = { ...EMPTY, ready: true, settings: withFeatures(["points_earn", "referral", "referral_signup_points", "referral_purchase_credits", "coupons"]) };

/** C. 혜택이 모두 꺼져 있고 받은 것도 없음 → 포인트 · 초대 · 쿠폰이 보이지 않는다 */
const OFF: BenefitOverview = { ...EMPTY, ready: true, settings: withFeatures([]) };

/** D. DB 변경 전 — 준비 중 */
const NOT_READY: BenefitOverview = { ...EMPTY, ready: false, settings: DEFAULT_BENEFIT_SETTINGS };

const SITE = "https://miyu.example";

function Label({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="mt-14 border-b border-line pb-2">
      <p className="text-[14px] font-semibold text-ink-2">{children}</p>
      {note && <p className="mt-0.5 text-[13px] text-ink-3">{note}</p>}
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[720px]">{children}</div>;
}

function Hub({ overview, paid, reports, header = false }: { overview: BenefitOverview; paid: number; reports: number; header?: boolean }) {
  return (
    <Frame>
      {header && (
        <div className="mt-6">
          <MyHeader />
        </div>
      )}
      <MyStatCards cards={hubCards(overview, paid)} />
      <MyHubList items={hubItems(overview, reports)} />
    </Frame>
  );
}

function Benefits({ overview, paid, id, initial = null }: { overview: BenefitOverview; paid: number; id: string; initial?: BenefitFormState }) {
  return (
    <Frame>
      <p className="mt-6 text-[15px] font-medium text-accent-strong">← MY</p>
      <p className="mt-3 text-[24px] leading-snug font-bold tracking-tight md:text-[28px]">쿠폰 · 혜택</p>
      <BenefitsView overview={overview} paidQuestions={paid} siteUrl={SITE} createLinkAction={noopAction} redeemCouponAction={noopAction} idPrefix={`${id}-`} couponInitialState={initial} />
    </Frame>
  );
}

export function MyPreview() {
  return (
    <>
      <Label note="포인트 카드 + 질문권 카드(보상 3 + 결제해 둔 2 = 5개), 친구 초대 · 쿠폰 줄이 모두 보인다. 후기 줄은 없다.">허브 A · 모두 켜짐</Label>
      <Hub overview={FULL} paid={2} reports={3} header />
      <Label note="포인트는 0 P라 카드를 숨기고 질문권 카드만 한 칸 전체로 보인다. 초대 · 쿠폰 줄은 기능이 꺼져 있어 없다.">허브 C · 혜택 꺼짐 · 받은 것 없음</Label>
      <Hub overview={OFF} paid={0} reports={0} />
      <Label note="혜택 표가 없으면 포인트 카드 · 초대 · 쿠폰 줄이 없고 질문권 카드는 눌리지 않는 카드로 결제해 둔 질문 수만 보인다.">허브 D · 혜택 준비 중(DB 변경 전)</Label>
      <Hub overview={NOT_READY} paid={2} reports={1} />

      <Label note="기본은 접혀 있고 건수만 보인다. 누르거나 Enter · Space로 펼치면 주문 목록과 안내가 나온다. 가상 주문이다.">결제내역 · 기본 접힘</Label>
      <Frame>
        <h2 className="mt-6 border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight">결제내역</h2>
        <OrdersFold orders={FAKE_ORDERS} />
      </Frame>

      <Label note="앵커 #points · #credits · #invite · #coupons. 소멸 임박 안내 · 묶음별 소멸일/D-day · 회수하지 못한 몫 · 초대 링크와 복사 · 쿠폰 성공 메시지.">혜택 A · 모두 켜짐 · 소멸 임박 · 링크 있음</Label>
      <Benefits overview={FULL} paid={2} id="a" initial={{ ok: true, message: "질문권 1개가 들어왔어요." }} />
      <Label note="[내 초대 링크 만들기]만 보이고 현황은 없다. 포인트는 내역이 없는 상태. 쿠폰 입력 칸에 실패 메시지(role=alert). 이 미리보기의 버튼은 아무것도 바꾸지 않는다.">혜택 B · 초대 링크 없음 · 쿠폰 오류</Label>
      <Benefits overview={NO_LINK} paid={0} id="b" initial={{ ok: false, message: COUPON_REASON_TEXT["not-found"] }} />
      <Label note="포인트 · 초대 · 쿠폰 구역이 없고 질문권 구역만 있다.">혜택 C · 모든 기능 꺼짐</Label>
      <Benefits overview={OFF} paid={0} id="c" />
      <Label note="한 줄 안내만 보인다.">혜택 D · 준비 중(DB 변경 전)</Label>
      <Benefits overview={NOT_READY} paid={0} id="d" />
    </>
  );
}
