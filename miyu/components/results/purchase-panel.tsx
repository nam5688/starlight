import Link from "next/link";
import { retryReportAction, startCheckoutAction } from "@/app/results/[id]/actions";
import { ReportStatusPoller } from "@/components/results/report-status-poller";
import { CheckIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonDisabled, buttonPrimary } from "@/components/ui/styles";
import { formatKrw, PERSONAL_REPORT } from "@/lib/config/product";
import { nextActionForResult } from "@/lib/growth/next-action";
import { canRetryReport, type ResultView } from "@/lib/services/report-service";

/** 개인 리포트는 한 번 구매로 완결된다 — 일부를 따로 떼어 추가 결제로 팔지 않는다 */
const INCLUDED = [
  "네 가지 상세 분석 — MBTI · 기질 · 애착 · 사주를 근거와 한계와 함께",
  "통합 해석 — 공통점과 서로 다른 관점",
  "실천 제안",
  "MY에서 같은 버전으로 다시보기",
];

/** 결과 화면의 구매 영역. 다음에 보여줄 행동은 nextActionForResult 규칙으로 고른다. */
export function PurchasePanel({
  view,
  paymentsReady,
  paymentsNote,
}: {
  view: ResultView;
  paymentsReady: boolean;
  paymentsNote: string | null;
}) {
  const { paidOrder, report, refunded, assessment } = view;
  const action = nextActionForResult({
    purchase: paidOrder ? "paid" : refunded ? "refunded" : "none",
    reportStatus: report?.status ?? null,
  });

  if (action.kind === "recover-report" || action.kind === "wait-report") {
    const failed = action.kind === "recover-report";
    const canRetry = canRetryReport(report);
    return (
      <section aria-labelledby="r-purchase" className="rounded-xl border border-line-strong px-5 py-6 md:px-7">
        <h2 id="r-purchase" className="text-[20px] font-bold tracking-tight">
          결제가 완료되었습니다
        </h2>
        <div className="mt-2">
          {!failed ? (
            <ReportStatusPoller assessmentId={assessment.id} />
          ) : canRetry ? (
            <p className="text-[15px] leading-relaxed text-ink-2">
              리포트를 만들지 못했습니다. 결제는 정상 처리되었으니 다시 결제하지 말고 아래 버튼을 눌러 주세요. 계속 실패하면 재처리 또는
              환불해 드립니다.
            </p>
          ) : (
            <p className="text-[15px] leading-relaxed text-ink-2">
              여러 번 다시 만들어 보았지만 리포트를 만들지 못했습니다. 결제는 정상 처리되어 있으며, 운영자가 확인한 뒤 재처리 또는 환불해
              드립니다. 문의하실 때 아래 주문번호를 알려 주세요.
            </p>
          )}
        </div>
        {failed && canRetry && (
          <form action={retryReportAction.bind(null, assessment.id)} className="mt-5">
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
    <section aria-labelledby="r-purchase" className="overflow-hidden rounded-xl border border-line-strong">
      <div className="px-5 py-5 md:px-7">
        <h2 id="r-purchase" className="text-[20px] font-bold tracking-tight">
          {PERSONAL_REPORT.name}
        </h2>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-2">
          이 특징이 어떤 상황에서 반복되는지, 네 가지 분석의 근거와 함께 확인하세요.
        </p>
        {action.kind === "refund-info" && (
          <p className="mt-2 text-[15px] text-ink-2">이전 주문은 환불 처리되었습니다.</p>
        )}
        <ul className="mt-4 space-y-2.5">
          {INCLUDED.map((item) => (
            <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed">
              <CheckIcon className="mt-0.5 size-5 shrink-0 text-accent" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[14px] text-ink-3">한 번 구매로 위 내용을 모두 볼 수 있습니다. 일부를 따로 추가 결제하지 않습니다.</p>
        <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[24px] font-bold tabular-nums">{formatKrw(PERSONAL_REPORT.priceKrw)}</span>
          <StatusBadge>가격 {PERSONAL_REPORT.priceNote}</StatusBadge>
          <span className="text-[14px] text-ink-3">단건 구매 · 카드 결제</span>
        </p>
      </div>
      <div className="border-t border-line px-5 py-5 md:px-7">
        {paymentsReady ? (
          <form action={startCheckoutAction.bind(null, assessment.id)}>
            <button type="submit" className={`${buttonPrimary} w-full sm:w-auto`}>
              {PERSONAL_REPORT.name} 전체 보기 · {formatKrw(PERSONAL_REPORT.priceKrw)}
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
