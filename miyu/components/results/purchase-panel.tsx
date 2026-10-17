import Link from "next/link";
import { retryReceivedReportAction, retryReportAction, startBenefitCheckoutAction, startCheckoutAction } from "@/app/results/[id]/actions";
import { BenefitNoticeBox, hasDiscountOptions, isPlainQuote, PriceOptions, type BenefitNotice, type PriceQuoteView } from "@/components/results/price-options";
import { ReportStatusPoller } from "@/components/results/report-status-poller";
import { CheckIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonDisabled, buttonPrimary } from "@/components/ui/styles";
import { formatKrw, PERSONAL_REPORT } from "@/lib/config/product";
import type { InviteQuote } from "@/lib/services/invite-service";
import { nextActionForResult } from "@/lib/growth/next-action";
import { salesClosedMessage, type GateReason } from "@/lib/services/capacity-service";
import { canRetryReport, type ResultView } from "@/lib/services/report-service";

/** 구매 시 받는 내용은 무료 미리보기의 잠금 목록(lib/report/preview.ts)과 같은 목록을 쓴다 — 한 곳에서만 관리 */
const ALWAYS_INCLUDED = "MY에서 같은 버전으로 다시보기";

/** 결과 화면의 구매 영역. 다음에 보여줄 행동은 nextActionForResult 규칙으로 고른다. */
export function PurchasePanel({
  view,
  included,
  paymentsReady,
  paymentsNote,
  salesClosedReason = null,
  invite = null,
  quote = null,
  benefitNotice = null,
  again = false,
  idPrefix = "r-",
}: {
  view: ResultView;
  /** 구매하면 더 받는 내용 (미리보기의 잠금 목록 제목) */
  included: string[];
  paymentsReady: boolean;
  paymentsNote: string | null;
  /** 지금 새 구매를 받지 않는 경우(리포트 준비 용량 · 하루 예산) — 결제를 시작하지 않고 이유를 알린다 */
  salesClosedReason?: { reason: GateReason | null } | null;
  /** 초대 링크로 들어온 사람의 가격 확인 결과(서버가 만든 값) — eligible일 때만 정가와 초대 가격을 함께 보인다(운영자 예외 2026-10-16) */
  invite?: InviteQuote | null;
  /** 서버가 만든 결제 전 견적(정가 · 적격 할인 선택지 · 거절 사유 · 포인트 교환). 없거나 혜택이 모두 꺼진 평범한 견적이면 예전 구매 영역 그대로 보인다 */
  quote?: PriceQuoteView | null;
  /** 결제 시작 뒤 되돌아왔을 때의 알림(혜택 오류 · 적용 실패 · 확인 필요) */
  benefitNotice?: BenefitNotice | null;
  /** 같은 결과로 다시 받기 */
  again?: boolean;
  /** 같은 화면에 구매 영역이 여러 번 나올 때(개발용 미리보기) HTML id가 겹치지 않게 — 결과 화면은 기본값(r-purchase) */
  idPrefix?: string;
}) {
  const discount = invite?.kind === "eligible" ? invite : null;
  const { paidOrder, report, refunded, assessment } = view;
  const purchaseId = `${idPrefix}purchase`;
  // 혜택 선택지를 그리는 경우(평범한 견적이 아니고 새 구매를 받는 중). 할인 선택지가 있으면 가격은 선택지마다 보이고, 아니면 예전처럼 위쪽에 한 번 보인다
  const priceView = quote && !isPlainQuote(quote) && !salesClosedReason ? quote : null;
  const optionsCarryPrice = priceView ? hasDiscountOptions(priceView) : false;
  const action = nextActionForResult({
    purchase: paidOrder ? "paid" : refunded ? "refunded" : "none",
    reportStatus: report?.status ?? null,
  });

  if (action.kind === "recover-report" || action.kind === "wait-report") {
    const failed = action.kind === "recover-report";
    const canRetry = canRetryReport(report);
    return (
      <section aria-labelledby={purchaseId} className="rounded-xl border border-line-strong px-5 py-6 md:px-7">
        <h2 id={purchaseId} className="text-[20px] font-bold tracking-tight">
          결제가 완료되었습니다
        </h2>
        <div className="mt-2">
          {!failed ? (
            <ReportStatusPoller assessmentId={assessment.id} orderNumber={paidOrder?.orderNumber} />
          ) : canRetry ? (
            <p className="text-[15px] leading-relaxed text-ink-2">
              리포트를 만들지 못했습니다. 결제는 정상 처리되었으니 다시 결제하지 말고 아래 버튼을 눌러 주세요. 계속 실패하면 재처리 또는
              환불해 드립니다. 다시 만들기는 1분에 한 번만 누를 수 있습니다.
            </p>
          ) : (
            <p className="text-[15px] leading-relaxed text-ink-2">
              여러 번 다시 만들어 보았지만 리포트를 만들지 못했습니다. 결제는 정상 처리되어 있으며, 운영자가 확인한 뒤 재처리 또는 환불해
              드립니다. 문의하실 때 아래 주문번호를 알려 주세요.
            </p>
          )}
        </div>
        {failed && canRetry && (
          <form action={paidOrder ? retryReceivedReportAction.bind(null, assessment.id, paidOrder.orderNumber) : retryReportAction.bind(null, assessment.id)} className="mt-5">
            <button type="submit" className={buttonPrimary}>
              {action.label}
            </button>
          </form>
        )}
        {paidOrder && (
          <p className="mt-4 text-[13px] text-ink-3">
            주문번호{" "}
            <Link href={`/my/orders/${paidOrder.orderNumber}`} className="underline underline-offset-2">
              {paidOrder.orderNumber}
            </Link>
          </p>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby={purchaseId} className="overflow-hidden rounded-xl border border-line-strong">
      <div className="px-5 py-5 md:px-7">
        <h2 id={purchaseId} className="text-[20px] font-bold tracking-tight">
          {PERSONAL_REPORT.name}
        </h2>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-2">
          내 결과의 나머지와, 왜 그렇게 읽히는지의 근거를 한 번에 확인하세요.
        </p>
        {action.kind === "refund-info" && (
          <p className="mt-2 text-[15px] text-ink-2">이전 주문은 환불 처리되었습니다.</p>
        )}
        <ul className="mt-4 space-y-2.5">
          {[...included, ALWAYS_INCLUDED].map((item) => (
            <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed">
              <CheckIcon className="mt-0.5 size-5 shrink-0 text-accent" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[14px] text-ink-3">한 번 구매로 위 내용을 모두 볼 수 있습니다. 일부를 따로 추가 결제하지 않습니다.</p>
        {optionsCarryPrice ? null : discount ? (
          <div className="mt-4">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[15px] text-ink-3">
                정가 <span className="tabular-nums line-through">{formatKrw(discount.listKrw)}</span>
              </span>
              <span className="text-[15px] font-semibold text-ink-2">→ 초대 가격</span>
              <span className="text-[24px] font-bold tabular-nums">{formatKrw(discount.priceKrw)}</span>
            </p>
            <p className="mt-1 text-[14px] text-ink-3">친구 초대 링크로 들어오셔서 적용돼요 · 처음 받을 때 한 번 · 단건 구매 · 카드 결제</p>
          </div>
        ) : (
          <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[24px] font-bold tabular-nums">{formatKrw(PERSONAL_REPORT.priceKrw)}</span>
            <StatusBadge>가격 {PERSONAL_REPORT.priceNote}</StatusBadge>
            <span className="text-[14px] text-ink-3">단건 구매 · 카드 결제</span>
          </p>
        )}
      </div>
      <div className="border-t border-line px-5 py-5 md:px-7">
        {/* 평범한 견적(혜택 선택지 없음)에서 되돌아온 알림 — 오류여도 아래 정가 구매 버튼은 계속 쓸 수 있다 */}
        {!salesClosedReason && !priceView && benefitNotice && (
          <div className="mb-4">
            <BenefitNoticeBox notice={benefitNotice} />
          </div>
        )}
        {salesClosedReason ? (
          <div>
            <button type="button" disabled className={buttonDisabled}>
              지금은 새 구매를 받지 않습니다
            </button>
            <p role="status" className="mt-3 text-[14px] leading-relaxed text-ink-2">
              {salesClosedMessage(salesClosedReason.reason)}
            </p>
          </div>
        ) : priceView ? (
          <PriceOptions
            assessmentId={assessment.id}
            view={priceView}
            action={startBenefitCheckoutAction}
            again={again}
            paymentsReady={paymentsReady}
            paymentsNote={paymentsNote}
            invitePriceKrw={discount ? discount.priceKrw : null}
            notice={benefitNotice}
            idPrefix={`${idPrefix}po-`}
            sectionId={purchaseId}
          />
        ) : paymentsReady ? (
          <form action={startCheckoutAction.bind(null, assessment.id)}>
            <button type="submit" className={`${buttonPrimary} w-full sm:w-auto`}>
              {PERSONAL_REPORT.name} 전체 보기 · {formatKrw(discount ? discount.priceKrw : PERSONAL_REPORT.priceKrw)}{discount ? " (초대 가격)" : ""}
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled className={buttonDisabled}>
              결제 연결 전
            </button>
            {paymentsNote && <span className="text-[14px] text-ink-3">{paymentsNote}</span>}
          </div>
        )}
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
          결제는 토스페이먼츠로 진행되며, 토스 가입이나 앱 설치 없이 일반 카드로 결제할 수 있습니다.
        </p>
      </div>
    </section>
  );
}
