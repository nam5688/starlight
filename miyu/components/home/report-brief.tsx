import Link from "next/link";
import { ArrowIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/source-badge";
import { buttonPrimary, buttonSecondary, pageWide } from "@/components/ui/styles";
import { formatKrw, PERSONAL_REPORT } from "@/lib/config/product";

/**
 * 홈의 리포트 안내 — 메인에서는 기본 가격과 무료 시작 범위만 이해되게 하고, 상세 항목 · 상담 이용 조건은 리포트 예시 페이지(/report/sample)에 모은다(운영자 방향 2026-10-16).
 * 가격을 별도 페이지로 숨기지 않는다 — 상세 항목만 옮겼다.
 */
export function ReportBrief() {
  return (
    <section aria-labelledby="home-report" className={`${pageWide} py-12 md:py-16`}>
      <h2 id="home-report" className="text-[22px] leading-snug font-bold tracking-tight md:text-[28px]">
        대화로 이해하고, 리포트로 다시 확인해요.
      </h2>
      <p className="mt-2 max-w-[40rem] text-[15px] leading-[1.7] text-ink-2">
        미유가 풀어준 내 분석을 한곳에 정리해 두었어요. 무료 리포트와 심층 리포트가 어떻게 다른지, 같은 가상 인물의 실제 예시로 먼저 확인해 보세요.
      </p>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px] leading-[1.65] text-ink-2">
        <span className="font-semibold text-ink">무료 리포트</span>
        <span aria-hidden="true">·</span>
        <span>
          {PERSONAL_REPORT.name} <span className="font-semibold tabular-nums text-ink">{formatKrw(PERSONAL_REPORT.priceKrw)}</span>
        </span>
        <span aria-hidden="true">·</span>
        <span>단건 구매 · 구독 아님 · 카드 결제</span>
        <StatusBadge>가격 {PERSONAL_REPORT.priceNote}</StatusBadge>
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link href="/report/sample" className={buttonPrimary}>
          무료 · 심층 리포트 비교하기
          <ArrowIcon />
        </Link>
        <Link href="/analyze" className={buttonSecondary}>
          내 사주 무료로 보기
        </Link>
      </div>
    </section>
  );
}
