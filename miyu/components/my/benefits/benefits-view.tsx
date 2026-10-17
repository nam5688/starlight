import type { BenefitFormState } from "@/app/my/benefits/actions";
import { CouponForm } from "@/components/my/benefits/coupon-form";
import type { BenefitAction } from "@/components/my/benefits/form-message";
import { InviteLinkBox } from "@/components/my/benefits/invite-link";
import { couponsVisible, pointsVisible, readyOverview, referralVisible } from "@/components/my/benefits/visibility";
import { formatDate, formatDateTime } from "@/components/ui/format";
import { InfoIcon } from "@/components/ui/icons";
import { CREDIT_KIND_LABEL, CREDIT_LEDGER_LABEL, POINT_LEDGER_LABEL, POINT_SOURCE_LABEL, REFERRAL_STATUS_LABEL } from "@/lib/commerce/benefits";
import { formatKrw, PERSONAL_REPORT } from "@/lib/config/product";
import type { BenefitOverview } from "@/lib/services/benefit-service";

// /my/benefits의 화면 조각 — props만 받는 순수 화면이다(데이터는 app/my/benefits/page.tsx가 서버에서 읽는다).
// 구역 4개: 포인트 · 질문권 · 친구 초대 · 쿠폰. 기능이 꺼져 있으면 그 구역은 보이지 않는다. 값(적립률 · 소멸 기간 · 보상 수 · 가격)은 모두 overview.settings에서 읽는다.
// 쓰지 않는 말: 포인트는 현금이 아니므로 원화로 환산하지 않고, 환불 여부는 정책이 정해지지 않아 쓰지 않는다. 초대받은 사람의 이름 · 정보는 어디에도 없다.

export type BenefitsViewProps = {
  overview: BenefitOverview;
  /** 결제해 둔 질문 수(질문 3개 묶음 결제) — 남은 질문권에 합쳐 보여 준다 */
  paidQuestions: number;
  /** 추천 링크 주소의 앞부분(서버가 읽은 사이트 주소) */
  siteUrl: string;
  createLinkAction: BenefitAction;
  redeemCouponAction: BenefitAction;
  /** 같은 화면에 이 조각이 여러 번 보일 때(개발용 미리보기)만 구역 · 입력칸 id가 겹치지 않게 붙인다. 실제 화면은 빈 값이라 앵커가 #points · #credits · #invite · #coupons다 */
  idPrefix?: string;
  /** 개발용 미리보기 전용: 쿠폰 입력 칸에 처음부터 보일 결과 */
  couponInitialState?: BenefitFormState;
};

const fmt = (n: number) => n.toLocaleString("ko-KR");
const signedP = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))} P`;
const signedCount = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}개`;

/** 유효 일수 → "1년" · "180일" (0 이하면 기한 없음 = null) */
function durationLabel(days: number): string | null {
  if (days <= 0) return null;
  return days % 365 === 0 ? `${days / 365}년` : `${days}일`;
}
function hoursLabel(hours: number): string | null {
  if (hours <= 0) return null;
  return hours % 24 === 0 ? `${hours / 24}일` : `${hours}시간`;
}

const h2Class = "border-t-2 border-accent pt-3 text-[18px] leading-snug font-bold tracking-tight";
const h3Class = "text-[15px] leading-snug font-semibold";
const panel = "mt-3 rounded-2xl bg-canvas px-4 py-4 shadow-soft";
const noteClass = "text-[13px] leading-[1.6] text-ink-3";

function ShortfallNote() {
  return <span className="mt-0.5 block text-[13px] leading-[1.55] text-caution">일부는 이미 써서 회수하지 못했어요</span>;
}

function DayLeft({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft === null) return null;
  return <span className={`block text-[13px] tabular-nums ${daysLeft <= 30 ? "font-semibold text-caution" : "text-ink-3"}`}>D-{daysLeft}</span>;
}

function PointsSection({ o, p }: { o: BenefitOverview; p: string }) {
  const { points, settings, tier } = o;
  const f = settings.features;
  const expireLabel = durationLabel(settings.pointExpireDays);
  const price = settings.pointPrices[PERSONAL_REPORT.id];
  const soonDays = points.expiringSoon ? (points.lots.find((l) => l.expiresAt === points.expiringSoon?.expiresAt)?.daysLeft ?? null) : null;
  return (
    <section id={`${p}points`} aria-labelledby={`${p}benefits-points-h`} className="mt-10 scroll-mt-20">
      <h2 id={`${p}benefits-points-h`} className={h2Class}>
        미유 포인트
      </h2>
      <div className={panel}>
        <p className="text-[13px] leading-snug text-ink-3">지금 쓸 수 있는 포인트</p>
        <p className="mt-1 flex items-baseline">
          <span className="text-[32px] leading-tight font-bold tabular-nums">{fmt(points.balance)}</span>
          <span className="ml-1 text-[16px] font-semibold text-ink-2">P</span>
        </p>
        <div className="mt-3 space-y-1">
          {f.points_earn && tier.rate > 0 && (
            <p className={noteClass}>
              구매하면 결제액의 {+(tier.rate * 100).toFixed(1)}%가 포인트로 쌓여요.
              {tier.next ? ` 누적 결제액이 ${formatKrw(tier.next.remainingKrw)} 더 쌓이면, 그다음 구매부터 ${+(tier.next.rate * 100).toFixed(1)}%가 쌓여요.` : ""}
            </p>
          )}
          <p className={noteClass}>{expireLabel ? `포인트는 지급일부터 ${expireLabel} 동안 쓸 수 있어요.` : "지금 쌓이는 포인트에는 소멸 기한이 없어요."}</p>
          {f.points_spend && (
            <p className={noteClass}>
              포인트는 심층 리포트 교환에만 쓸 수 있어요{price ? ` (${fmt(price)} P · 현금과 섞지 않고 포인트로만 교환해요)` : ""}.
            </p>
          )}
        </div>
      </div>

      {points.expiringSoon && (
        <div role="note" className="mt-3 flex items-start gap-2.5 rounded-xl bg-caution-soft px-4 py-3.5 text-caution">
          <InfoIcon className="mt-1 size-4 shrink-0" />
          <p className="text-[14px] leading-[1.65]">
            <span className="font-semibold">곧 소멸하는 포인트가 있어요.</span> 30일 안에 소멸하는 포인트가 {fmt(points.expiringSoon.amount)} P예요. 가장 빠른 소멸일은 {formatDateTime(points.expiringSoon.expiresAt)}
            {soonDays !== null ? ` (D-${soonDays})` : ""}이에요.
          </p>
        </div>
      )}

      <div className={panel}>
        <h3 className={h3Class}>포인트 묶음별 소멸일</h3>
        {points.lots.length === 0 ? (
          <p className={`mt-2 ${noteClass}`}>지금 남아 있는 포인트가 없어요.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {points.lots.map((l, i) => (
              <li key={`${l.sourceLabel}-${l.expiresAt ?? "none"}-${i}`} className="flex items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block text-[15px] leading-snug font-semibold">{POINT_SOURCE_LABEL[l.sourceLabel] ?? "미유 포인트"}</span>
                  <span className="mt-0.5 block text-[13px] leading-[1.55] text-ink-3">{l.expiresAt ? `소멸 ${formatDate(l.expiresAt)}` : "소멸 기한 없음"}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] leading-snug font-semibold tabular-nums">{fmt(l.remaining)} P</span>
                  <DayLeft daysLeft={l.daysLeft} />
                </span>
              </li>
            ))}
          </ul>
        )}

        <h3 className={`${h3Class} mt-5`}>최근 내역</h3>
        {points.recent.length === 0 ? (
          <p className={`mt-2 ${noteClass}`}>아직 포인트 내역이 없어요.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {points.recent.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block text-[15px] leading-snug font-semibold">{POINT_LEDGER_LABEL[r.kind] ?? "포인트 변동"}</span>
                  <span className="mt-0.5 block text-[13px] leading-[1.55] text-ink-3">{formatDate(r.createdAt)}</span>
                  {r.shortfall > 0 && <ShortfallNote />}
                </span>
                <span className={`shrink-0 text-[15px] leading-snug font-semibold tabular-nums ${r.amount > 0 ? "text-positive" : "text-ink"}`}>{signedP(r.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CreditsSection({ o, paidQuestions, p }: { o: BenefitOverview; paidQuestions: number; p: string }) {
  const { credits } = o;
  const total = credits.balance + paidQuestions;
  return (
    <section id={`${p}credits`} aria-labelledby={`${p}benefits-credits-h`} className="mt-10 scroll-mt-20">
      <h2 id={`${p}benefits-credits-h`} className={h2Class}>
        남은 질문권
      </h2>
      <div className={panel}>
        <p className="text-[13px] leading-snug text-ink-3">채팅방에서 쓸 수 있는 질문권</p>
        <p className="mt-1 flex items-baseline">
          <span className="text-[32px] leading-tight font-bold tabular-nums">{fmt(total)}</span>
          <span className="ml-1 text-[16px] font-semibold text-ink-2">개</span>
        </p>
        <p className="mt-2 text-[14px] leading-[1.6] text-ink-2">
          보상 질문권 {fmt(credits.balance)}개
          {paidQuestions > 0 ? ` · 결제해 둔 질문 ${fmt(paidQuestions)}개` : ""}
        </p>
        <p className={`mt-3 ${noteClass}`}>질문은 방마다 정해진 무료 질문 → 보상 질문권(만료가 빠른 것부터) → 결제한 질문 순서로 쓰여요.</p>
      </div>

      <div className={panel}>
        <h3 className={h3Class}>보상 질문권 묶음별 만료일</h3>
        {credits.lots.length === 0 ? (
          <p className={`mt-2 ${noteClass}`}>지금 남아 있는 보상 질문권이 없어요.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {credits.lots.map((l, i) => (
              <li key={`${l.kind}-${l.expiresAt ?? "none"}-${i}`} className="flex items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block text-[15px] leading-snug font-semibold">{CREDIT_KIND_LABEL[l.kind] ?? "보상 질문권"}</span>
                  <span className="mt-0.5 block text-[13px] leading-[1.55] text-ink-3">{l.expiresAt ? `만료 ${formatDate(l.expiresAt)}` : "만료 기한 없음"}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] leading-snug font-semibold tabular-nums">{fmt(l.remaining)}개</span>
                  <DayLeft daysLeft={l.daysLeft} />
                </span>
              </li>
            ))}
          </ul>
        )}

        <h3 className={`${h3Class} mt-5`}>최근 내역</h3>
        {credits.recent.length === 0 ? (
          <p className={`mt-2 ${noteClass}`}>아직 질문권 내역이 없어요.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {credits.recent.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block text-[15px] leading-snug font-semibold">{CREDIT_LEDGER_LABEL[r.kind] ?? "질문권 변동"}</span>
                  <span className="mt-0.5 block text-[13px] leading-[1.55] text-ink-3">{formatDate(r.createdAt)}</span>
                  {r.shortfall > 0 && <ShortfallNote />}
                </span>
                <span className={`shrink-0 text-[15px] leading-snug font-semibold tabular-nums ${r.qty > 0 ? "text-positive" : "text-ink"}`}>{signedCount(r.qty)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const STATUS_ORDER = ["pending", "review", "confirmed", "rejected", "revoked"] as const;

function InviteSection({ o, siteUrl, createLinkAction, p }: { o: BenefitOverview; siteUrl: string; createLinkAction: BenefitAction; p: string }) {
  const { settings, referral } = o;
  const f = settings.features;
  const s = settings.referral;
  const url = referral.link ? `${siteUrl}/invite/${referral.link.token}` : null;
  const hold = hoursLabel(s.holdHours);
  const stats = referral.overview;
  const statuses = stats ? STATUS_ORDER.filter((k) => (stats.byStatus[k] ?? 0) > 0) : [];

  const rules: string[] = [];
  if (f.referral_signup_points && s.signupPoints > 0) {
    rules.push(`친구가 가입하고 무료 분석까지 마친 뒤 확인이 끝나면, 나에게 ${fmt(s.signupPoints)} P가 쌓여요. 가입만으로는 보상이 없고, 확인에 시간이 걸려서 ${hold ? `가입 뒤 ${hold} 정도 지나야` : "확인이 끝나는 대로"} 확정돼요.`);
  }
  if (f.referral_purchase_credits && (s.inviterCredits > 0 || s.inviteeCredits > 0)) {
    rules.push(
      s.inviterCredits === s.inviteeCredits
        ? `친구가 첫 심층 리포트를 결제하면 나와 친구에게 질문권을 ${s.inviterCredits}개씩 드려요.`
        : `친구가 첫 심층 리포트를 결제하면 나에게 질문권 ${s.inviterCredits}개, 친구에게 질문권 ${s.inviteeCredits}개를 드려요.`,
    );
  }
  rules.push(`친구는 첫 심층 리포트를 정가 ${formatKrw(PERSONAL_REPORT.priceKrw)} 대신 ${formatKrw(s.inviteePrice)}에 받을 수 있어요.`);

  return (
    <section id={`${p}invite`} aria-labelledby={`${p}benefits-invite-h`} className="mt-10 scroll-mt-20">
      <h2 id={`${p}benefits-invite-h`} className={h2Class}>
        친구 초대
      </h2>
      <div className={panel}>
        <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-[1.65] text-ink-2">
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>

      <div className={panel}>
        <InviteLinkBox url={url} action={createLinkAction} idPrefix={p} />
        {stats && (
          <div className="mt-5">
            <h3 className={h3Class}>초대 현황</h3>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
              {[
                ["링크 방문", stats.visits],
                ["가입", stats.signups],
                ["첫 구매", stats.firstPurchases],
              ].map(([label, n]) => (
                <div key={label} className="flex flex-col-reverse">
                  <dt className="mt-0.5 text-[13px] text-ink-3">{label}</dt>
                  <dd className="text-[22px] leading-tight font-bold tabular-nums">{fmt(Number(n))}</dd>
                </div>
              ))}
            </dl>
            {statuses.length > 0 && (
              <p className="mt-3 text-[14px] leading-[1.6] text-ink-2">
                가입한 친구의 확인 상태: {statuses.map((k) => `${REFERRAL_STATUS_LABEL[k]} ${fmt(stats.byStatus[k] ?? 0)}명`).join(" · ")}
              </p>
            )}
            <p className={`mt-2 ${noteClass}`}>초대받은 친구의 이름 · 정보는 보이지 않고, 숫자로만 알려 드려요.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/** 쿠폰 사용 상태 이름 — 결제에 담아 둔 쿠폰(reserved) · 사용(used) · 결제가 취소돼 돌려받음(released) · 회수(revoked) */
const COUPON_USE_LABEL: Record<string, string> = { used: "사용했어요", reserved: "결제에 담아 둠", released: "사용 취소", revoked: "회수됨" };

function CouponsSection({ o, redeemCouponAction, couponInitialState, p }: { o: BenefitOverview; redeemCouponAction: BenefitAction; couponInitialState: BenefitFormState; p: string }) {
  const history = o.coupons.history;
  return (
    <section id={`${p}coupons`} aria-labelledby={`${p}benefits-coupons-h`} className="mt-10 scroll-mt-20">
      <h2 id={`${p}benefits-coupons-h`} className={h2Class}>
        쿠폰
      </h2>
      <div className={panel}>
        <p className="mb-4 text-[14px] leading-[1.65] text-ink-2">질문권 쿠폰은 코드를 입력하면 바로 들어와요. 할인 · 무료 이용권 쿠폰은 심층 리포트를 결제할 때 결제 화면에서 코드를 넣어 써요.</p>
        <CouponForm action={redeemCouponAction} idPrefix={p} initialState={couponInitialState} />
      </div>

      <div className={panel}>
        <h3 className={h3Class}>최근 사용 내역</h3>
        {history.length === 0 ? (
          <p className={`mt-2 ${noteClass}`}>아직 사용한 쿠폰이 없어요.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block text-[15px] leading-snug font-semibold">{h.name}</span>
                  <span className="mt-0.5 block text-[13px] leading-[1.55] break-all text-ink-3">
                    {h.code} · {formatDate(h.createdAt)}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] leading-snug font-semibold text-ink-2">{COUPON_USE_LABEL[h.status] ?? "확인 중"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** 혜택 화면 본문 — 혜택 기능을 아직 쓸 수 없으면(DB 변경 전) 한 줄 안내만 보인다 */
export function BenefitsView({ overview, paidQuestions, siteUrl, createLinkAction, redeemCouponAction, idPrefix = "", couponInitialState = null }: BenefitsViewProps) {
  const o = readyOverview(overview);
  if (!o) {
    return <p className="mt-8 text-[16px] leading-[1.7] text-ink-2">혜택 기능을 준비하고 있어요.</p>;
  }
  return (
    <>
      {pointsVisible(o) && <PointsSection o={o} p={idPrefix} />}
      <CreditsSection o={o} paidQuestions={paidQuestions} p={idPrefix} />
      {referralVisible(o) && <InviteSection o={o} siteUrl={siteUrl} createLinkAction={createLinkAction} p={idPrefix} />}
      {couponsVisible(o) && <CouponsSection o={o} redeemCouponAction={redeemCouponAction} couponInitialState={couponInitialState} p={idPrefix} />}
    </>
  );
}
