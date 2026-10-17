// 결제 전 가격 선택지 — 서버가 만든 견적(CheckoutQuote)을 그대로 그린다. 화면에서 금액 · 자격을 계산하지 않는다.
//
// 지키는 것(운영자 결정 2026-10-17):
// - 정가는 항상 보이고, 정가 병기("정가 9,900원 → …")는 서버가 적격이라고 확인한 할인 선택지에만 쓴다. 마감 타이머 · "오늘만" 문구는 쓰지 않는다.
// - 할인은 자동으로 겹치지 않는다 — 적격 할인이 둘 이상이면 고객이 하나를 고른다.
// - 요청한 할인이 맞지 않으면 사유와 정가를 보이고, 고객이 정가 확인 버튼을 눌러야 정가 결제로 간다(confirmListPrice).
// - 포인트 교환은 현금 가격과 따로 보인다(포인트를 원으로 쓰지 않는다). 0원 선택지는 결제창 없이 받는다.
// - 서버 오류는 "할인을 쓸 수 없다"가 아니다(오류 안내 + 다시 시도). 이 파일은 props만 받는 화면 조각이고 서버 동작은 action으로 받는다.

import { inputClass } from "@/components/ui/form-controls";
import { InfoIcon } from "@/components/ui/icons";
import type { PriceOption, PriceOptionKind } from "@/lib/commerce/benefits";
import { type BenefitNotice, hasDiscountOptions, isPlainQuote, reasonText, type PriceQuoteView } from "@/lib/commerce/benefit-query";
import { formatKrw, PERSONAL_REPORT } from "@/lib/config/product";

// 주소 읽기 · 평범한 견적 판단 · 사유 문구는 시험할 수 있게 lib/commerce/benefit-query.ts에 두고, 화면 쪽에서 같은 이름으로 다시 내보낸다.
export { hasDiscountOptions, isPlainQuote, reasonText };
export type { BenefitNotice, PriceQuoteView };

export type PriceAction = (formData: FormData) => void | Promise<void>;

const isDiscount = (o: PriceOption) => o.kind !== "list" && o.kind !== "points";

const fmtP = (n: number) => `${n.toLocaleString("ko-KR")}P`;

const BTN = "inline-flex min-h-12 items-center justify-center rounded-lg px-6 py-2.5 text-center text-[16px] leading-snug font-semibold transition-colors";
const BTN_PRIMARY = `${BTN} bg-accent text-white hover:bg-accent-strong w-full sm:w-auto`;
const BTN_SECONDARY = `${BTN} border border-line-strong bg-canvas text-ink hover:bg-mist w-full sm:w-auto`;
const BTN_SMALL = "inline-flex min-h-11 items-center justify-center rounded-lg border border-line-strong bg-canvas px-4 py-2 text-center text-[14px] leading-snug font-semibold text-ink hover:bg-mist";
const BTN_DISABLED = `${BTN} cursor-not-allowed border border-line bg-mist text-ink-3 w-full sm:w-auto`;
const BTN_SMALL_DISABLED = "inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-lg border border-line bg-mist px-4 py-2 text-center text-[14px] leading-snug font-semibold text-ink-3";

/** 결제 시작 뒤 되돌아왔을 때의 짧은 안내 — 오류는 role="alert", 나머지는 role="status". 색만으로 구분하지 않도록 아이콘 · 글을 함께 둔다 */
export function BenefitNoticeBox({ notice }: { notice: BenefitNotice }) {
  const calm = notice.kind === "confirm" || notice.kind === "choose";
  return (
    <div role={notice.kind === "error" ? "alert" : "status"} className={`flex gap-2.5 rounded-xl px-4 py-3 text-[14px] leading-[1.7] ${calm ? "bg-mist text-ink-2" : "bg-caution-soft text-caution"}`}>
      <InfoIcon className="mt-1 size-4 shrink-0" />
      <div>
        {notice.kind === "denied" && (
          <>
            <p className="font-semibold">{reasonText(notice.reason)}</p>
            <p>결제는 시작하지 않았어요. 정가로 받거나 다시 시도할 수 있어요.</p>
          </>
        )}
        {notice.kind === "error" && <p className="font-semibold">혜택을 확인하는 중 오류가 났어요. 정가 주문은 만들지 않았어요 — 잠시 뒤 다시 시도해 주세요.</p>}
        {notice.kind === "confirm" && <p>결제는 시작하지 않았어요. 아래 내용을 확인한 뒤 이어 주세요.</p>}
        {notice.kind === "choose" && <p>결제는 시작하지 않았어요. 아래에서 혜택을 하나 골라 주세요.</p>}
        {notice.kind === "invalid" && <p className="font-semibold">고른 선택지를 확인하지 못해 결제를 시작하지 않았어요. 아래 선택지를 다시 확인해 주세요.</p>}
      </div>
    </div>
  );
}

function OptionForm({
  action,
  assessmentId,
  kind,
  couponCode,
  again,
  confirmList = false,
  children,
}: {
  action: PriceAction;
  assessmentId: string;
  kind: PriceOptionKind;
  couponCode: string | null;
  again: boolean;
  /** 고객이 정가를 눈으로 확인하고 누르는 정가 결제 */
  confirmList?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <input type="hidden" name="kind" value={kind} />
      {couponCode ? <input type="hidden" name="couponCode" value={couponCode} /> : null}
      {again ? <input type="hidden" name="again" value="1" /> : null}
      {confirmList ? <input type="hidden" name="confirmListPrice" value="1" /> : null}
      {children}
    </form>
  );
}

/** 현금 결제가 필요한 선택지는 결제 연결 전에는 비활성(이유는 아래 한 줄), 결제창을 거치지 않는 선택지는 그대로 쓴다 */
function BuyButton({ free, paymentsReady, tone, children }: { free: boolean; paymentsReady: boolean; tone: "primary" | "secondary" | "small"; children: React.ReactNode }) {
  if (!free && !paymentsReady) {
    return (
      <button type="button" disabled className={tone === "small" ? BTN_SMALL_DISABLED : BTN_DISABLED}>
        결제 연결 전
      </button>
    );
  }
  return (
    <button type="submit" className={tone === "primary" ? BTN_PRIMARY : tone === "secondary" ? BTN_SECONDARY : BTN_SMALL}>
      {children}
    </button>
  );
}

/** 선택지마다 덧붙이는 짧은 설명 — 서버가 확인한 종류에서만 정해지는 고정 문구 */
function optionNotes(o: PriceOption): string[] {
  const notes: string[] = [];
  if (o.kind === "referral" || o.kind === "referral+coupon") notes.push("친구 추천으로 들어오셔서 적용돼요 · 첫 구매 1회만");
  if ((o.kind === "coupon" || o.kind === "referral+coupon") && o.couponCode) notes.push(`쿠폰 코드 ${o.couponCode}`);
  if (o.free) notes.push("결제창 없이 바로 리포트를 만들어요.");
  return notes;
}

export function PriceOptions({
  assessmentId,
  view,
  action,
  again = false,
  paymentsReady,
  paymentsNote,
  invitePriceKrw = null,
  notice = null,
  idPrefix = "po-",
  sectionId = "r-purchase",
}: {
  assessmentId: string;
  view: PriceQuoteView;
  /** 서버 동작 startBenefitCheckoutAction — 고객이 보낸 금액은 쓰지 않고 서버가 견적을 다시 만든다 */
  action: PriceAction;
  /** 같은 결과로 다시 받기 */
  again?: boolean;
  paymentsReady: boolean;
  paymentsNote: string | null;
  /** 예전 초대 링크 할인 가격 — 정가 버튼 하나뿐일 때만 그 버튼 문구에 쓴다(예전 화면과 같다) */
  invitePriceKrw?: number | null;
  notice?: BenefitNotice | null;
  /** 같은 화면에 이 조각이 여러 번 나올 때 HTML id가 겹치지 않게 */
  idPrefix?: string;
  /** 쿠폰 입력 뒤 되돌아올 구매 영역의 id */
  sectionId?: string;
}) {
  const { quote, couponCode, pointBalance, couponsEnabled } = view;
  const discounts = quote.options.filter(isDiscount);
  const points = quote.options.find((o) => o.kind === "points") ?? null;
  const multi = discounts.length > 0;
  // 서버와 같은 기준: 요청한 할인이 거절됐거나 고를 할인이 둘 이상이면 정가는 고객이 확인해야 결제된다
  const listNeedsConfirm = quote.denied.length > 0 || quote.needsChoice;
  const couponDenied = quote.denied.find((d) => d.kind === "coupon") ?? null;
  // 쿠폰 입력 아래에 이미 보이는 쿠폰 사유는 정가 확인 칸에서 되풀이하지 않는다
  const confirmReasons = quote.denied.filter((d) => !(d.kind === "coupon" && couponsEnabled));
  const couponAccepted = discounts.some((o) => o.couponCode);
  const listPrice = formatKrw(quote.listKrw);

  const chooseId = `${idPrefix}choose`;
  const couponId = `${idPrefix}coupon`;
  const couponHintId = `${idPrefix}coupon-hint`;
  const couponErrorId = `${idPrefix}coupon-error`;
  const pointsId = `${idPrefix}points`;
  const common = { action, assessmentId, couponCode, again } as const;

  return (
    <div className="space-y-6">
      {notice && <BenefitNoticeBox notice={notice} />}

      {multi && (
        <div role={quote.needsChoice ? "group" : undefined} aria-labelledby={quote.needsChoice ? chooseId : undefined}>
          {quote.needsChoice && (
            <div className="mb-1">
              <h3 id={chooseId} className="text-[16px] leading-snug font-semibold">
                쓸 수 있는 혜택이 둘 이상이에요. 하나를 골라 주세요
              </h3>
              <p className="mt-1 text-[14px] leading-[1.7] text-ink-3">혜택은 자동으로 합치지 않아요. 아래에서 하나만 골라 주세요.</p>
            </div>
          )}
          <ul className="divide-y divide-line">
            {discounts.map((o) => (
              <li key={o.kind} className="py-4 first:pt-2 last:pb-0">
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[15px] text-ink-3">
                    정가 <s className="tabular-nums line-through">{listPrice}</s>
                  </span>
                  <span className="text-[15px] font-semibold text-ink-2">→ {o.label}</span>
                  <span className="text-[24px] font-bold tabular-nums">{formatKrw(o.amountKrw)}</span>
                </p>
                {optionNotes(o).map((n) => (
                  <p key={n} className="mt-1 text-[14px] leading-[1.7] text-ink-3">
                    {n}
                  </p>
                ))}
                <div className="mt-3">
                  <OptionForm {...common} kind={o.kind} couponCode={o.couponCode ?? couponCode}>
                    <BuyButton free={o.free} paymentsReady={paymentsReady} tone="primary">
                      {o.free ? "0원으로 받기" : `${PERSONAL_REPORT.name} 전체 보기 · ${formatKrw(o.amountKrw)}`}
                    </BuyButton>
                  </OptionForm>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[14px] text-ink-3">단건 구매 · 카드 결제 · 가격은 {PERSONAL_REPORT.priceNote}이에요</p>
        </div>
      )}

      {/* 정가만 받을 수 있는 평범한 경우의 구매 버튼 — 예전 화면과 같은 문구 */}
      {!multi && !listNeedsConfirm && (
        <OptionForm {...common} kind="list">
          <BuyButton free={false} paymentsReady={paymentsReady} tone="primary">
            {PERSONAL_REPORT.name} 전체 보기 · {formatKrw(invitePriceKrw ?? quote.listKrw)}
            {invitePriceKrw !== null ? " (초대 가격)" : ""}
          </BuyButton>
        </OptionForm>
      )}

      {couponsEnabled && (
        <form method="get" action={`/results/${assessmentId}#${sectionId}`}>
          {again ? <input type="hidden" name="again" value="1" /> : null}
          <label htmlFor={couponId} className="text-[14px] font-semibold text-ink-2">
            쿠폰 코드
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id={couponId}
              name="coupon"
              type="text"
              defaultValue={couponCode ?? ""}
              maxLength={32}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={couponDenied ? true : undefined}
              aria-describedby={couponDenied ? couponErrorId : couponHintId}
              className={`${inputClass(false)} min-w-0 flex-1 uppercase aria-invalid:border-caution`}
            />
            <button type="submit" className={`${BTN} shrink-0 border border-line-strong bg-canvas px-5 text-ink hover:bg-mist`}>
              적용
            </button>
          </div>
          {couponDenied ? (
            <p id={couponErrorId} className="mt-2 flex gap-1.5 text-[14px] leading-[1.7] font-medium text-caution">
              <InfoIcon className="mt-1 size-4 shrink-0" />
              <span>{couponDenied.message} 정가는 그대로예요.</span>
            </p>
          ) : (
            <p id={couponHintId} className="mt-2 text-[13px] leading-[1.7] text-ink-3">
              {couponAccepted ? "쿠폰을 확인했어요. 위에서 받는 방법을 골라 주세요." : "쿠폰이 있다면 코드를 적고 [적용]을 눌러 주세요."}
            </p>
          )}
        </form>
      )}

      {/* 정가 확인 — 사유(있을 때)와 정가를 보고 고객이 한 번 더 누르는 별도 버튼. 할인 선택지가 있으면 그 아래에 작게 둔다 */}
      {listNeedsConfirm && (
        <div className="space-y-3">
          {confirmReasons.length > 0 && (
            <div className="rounded-xl bg-caution-soft px-4 py-3 text-caution">
              <p className="flex items-center gap-1.5 text-[14px] font-semibold">
                <InfoIcon className="size-4 shrink-0" />
                할인을 적용하지 못했어요
              </p>
              <ul className="mt-1.5 space-y-1 text-[14px] leading-[1.7]">
                {confirmReasons.map((d) => (
                  <li key={`${d.kind}-${d.reason}`}>{d.message}</li>
                ))}
              </ul>
            </div>
          )}
          {/* 결제 연결 전에는 현금으로 결제할 수 없으므로 할인 선택지가 따로 있을 때는 정가 확인 버튼을 두지 않는다(정가만 있으면 예전처럼 비활성 버튼 + 이유) */}
          {(paymentsReady || !multi) && (
            <>
              <p className="text-[16px] leading-relaxed">정가 {listPrice}으로 결제할까요?</p>
              <OptionForm {...common} kind="list" confirmList>
                <BuyButton free={false} paymentsReady={paymentsReady} tone={multi ? "small" : "primary"}>
                  정가로 결제하기 · {listPrice}
                </BuyButton>
              </OptionForm>
            </>
          )}
        </div>
      )}

      {/* 할인 선택지가 있고 정가 확인이 필요 없는 경우의 정가 결제 — 선택지보다 작게 */}
      {multi && !listNeedsConfirm && paymentsReady && (
        <OptionForm {...common} kind="list">
          <BuyButton free={false} paymentsReady={paymentsReady} tone="small">
            정가로 결제하기 · {listPrice}
          </BuyButton>
        </OptionForm>
      )}

      {/* 미유 포인트 교환 — 현금 가격과 따로, 포인트는 원으로 쓰지 않는다 */}
      {points && points.points !== undefined ? (
        <section aria-labelledby={pointsId}>
          <h3 id={pointsId} className="text-[16px] leading-snug font-semibold">
            미유 포인트 {fmtP(points.points)}로 교환
          </h3>
          <p className="mt-1 text-[14px] leading-[1.7] text-ink-3">
            내 포인트 {fmtP(pointBalance ?? 0)} · {points.note ?? "포인트 전액으로 교환해요."} 결제창 없이 바로 리포트를 만들어요.
          </p>
          <div className="mt-3">
            <OptionForm {...common} kind="points">
              <BuyButton free paymentsReady={paymentsReady} tone="secondary">
                포인트로 교환하기
              </BuyButton>
            </OptionForm>
          </div>
        </section>
      ) : quote.pointsShortfall !== null ? (
        <section aria-labelledby={pointsId}>
          <h3 id={pointsId} className="text-[16px] leading-snug font-semibold">
            미유 포인트로 교환
          </h3>
          <p className="mt-1 text-[14px] leading-[1.7] text-ink-3">
            {fmtP(quote.pointsShortfall)}가 더 필요해요 · 내 포인트 {fmtP(pointBalance ?? 0)}
          </p>
        </section>
      ) : null}

      {!paymentsReady && paymentsNote && <p className="text-[14px] text-ink-3">{paymentsNote}</p>}
    </div>
  );
}
