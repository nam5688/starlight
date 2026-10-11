import { retryReportAction, startCheckoutAction } from "@/app/results/[id]/actions";
import { LockIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonDisabled, buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { formatKrw, PERSONAL_REPORT } from "@/lib/config/product";
import type { ResultView } from "@/lib/services/report-service";

const INCLUDED = [
  "네 가지 상세 분석 — MBTI · 기질 · 애착 · 사주를 근거와 한계와 함께",
  "통합 해석 — 공통점과 서로 다른 관점",
  "실천 제안",
  "MY에서 같은 버전으로 다시보기",
];

/** 결과 화면의 구매 영역. 결제 상태와 리포트 생성 상태를 나눠 보여준다. */
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

  if (paidOrder) {
    const failed = report?.status === "failed" || !report;
    return (
      <section aria-labelledby="r-purchase" className="rounded-xl border border-line-strong px-5 py-6 md:px-7">
        <h2 id="r-purchase" className="text-[20px] font-bold tracking-tight">
          결제가 완료되었습니다
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          {failed
            ? "리포트를 만들지 못했습니다. 결제는 정상 처리되었으니 다시 만들기를 눌러 주세요. 계속 실패하면 재처리 또는 환불해 드립니다."
            : "리포트를 만들고 있습니다. 잠시 후 새로고침해 주세요."}
        </p>
        <form action={retryReportAction.bind(null, assessment.id)} className="mt-5">
          <button type="submit" className={failed ? buttonPrimary : buttonSecondary}>
            {failed ? "리포트 다시 만들기" : "새로고침"}
          </button>
        </form>
        <p className="mt-4 text-[13px] text-ink-3">주문번호 {paidOrder.orderNumber}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="r-purchase" className="overflow-hidden rounded-xl border border-line-strong">
      <div className="px-5 py-5 md:px-7">
        <h2 id="r-purchase" className="text-[20px] font-bold tracking-tight">
          {PERSONAL_REPORT.name}
        </h2>
        {refunded && <p className="mt-2 text-[15px] text-ink-2">이전 주문은 환불 처리되었습니다.</p>}
        <ul className="mt-4 space-y-2.5">
          {INCLUDED.map((item) => (
            <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed">
              <LockIcon className="mt-1 size-4 shrink-0 text-ink-3" />
              {item}
            </li>
          ))}
        </ul>
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
              {formatKrw(PERSONAL_REPORT.priceKrw)} 결제하기
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
